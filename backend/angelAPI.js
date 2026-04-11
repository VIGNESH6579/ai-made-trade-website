const axios = require('axios');
const NodeCache = require('node-cache');

// Generous cache for ScripMaster to prevent downloading 40MB heavily
const scripCache = new NodeCache({ stdTTL: 43200 }); // 12 hours

// In-Memory store for user auth
let angelAuth = {
    jwtToken: null,
    apiKey: null,
    clientCode: null
};

// 1. Authenticate with Angel One
const authenticateAngel = async (clientId, password, totp, apiKey) => {
    try {
        const payload = {
            clientcode: clientId,
            password: password,
            totp: totp
        };
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserType': 'USER',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '192.168.1.1',
            'X-ClientPublicIP': '106.193.147.98',
            'X-MACAddress': '00-B0-D0-63-C2-26',
            'X-PrivateKey': apiKey
        };

        const res = await axios.post('https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/v1/loginByPassword', payload, { headers });
        
        if (res.data.status) {
            angelAuth.jwtToken = res.data.data.jwtToken;
            angelAuth.apiKey = apiKey;
            angelAuth.clientCode = clientId;
            return { success: true };
        } else {
            return { success: false, error: res.data.message };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// 2. Fetch Expiry from Groww
const getTargetExpiry = async () => {
    const res = await axios.get("https://groww.in/v1/api/option_chain_service/v1/option_chain/nifty");
    const expiryStr = res.data.expiryDetailsDto.currentExpiry; // e.g. "2026-04-13"
    
    // Map to Angel format: 13APR2026
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const [year, month, day] = expiryStr.split("-");
    const dt = new Date(year, parseInt(month) - 1, day);
    
    return {
        growwFormat: expiryStr,
        angelFormat: `${day}${months[dt.getMonth()]}${year}`, // "13APR2026"
        spotPrice: res.data.optionChains[0].callOption.underlyingValue || (res.data.optionChains[0].strikePrice / 100) // Fallback estimation
    };
};

// 3. Download and Parse Scrip Master
const getScripTokens = async (expiryString, spotPrice) => {
    let scrips = scripCache.get('nifty_scrips');
    
    if (!scrips) {
        console.log("Downloading Angel One Scrip Master...");
        const res = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const allData = res.data;
        // Filter strictly to avoid memory bloat
        scrips = allData.filter(item => 
            item.name === 'NIFTY' && 
            item.instrumenttype === 'OPTIDX' && 
            item.exch_seg === 'NFO'
        );
        scripCache.set('nifty_scrips', scrips);
    }

    // Filter to finding nearest 20 strikes based on Spot Price
    const baseStrike = Math.round(spotPrice / 50) * 50;
    const lowerBound = baseStrike - 500;
    const upperBound = baseStrike + 500;

    const targetScrips = scrips.filter(item => 
        item.expiry === expiryString && 
        (parseFloat(item.strike) / 100) >= lowerBound && 
        (parseFloat(item.strike) / 100) <= upperBound
    );

    return targetScrips;
};

// 4. Fetch Market Data and Restructure for our Engine
const fetchAngelOptionChain = async () => {
    if (!angelAuth.jwtToken) throw new Error("Angel One not connected. Please login.");

    const expiryInfo = await getTargetExpiry();
    const tokenList = await getScripTokens(expiryInfo.angelFormat, expiryInfo.spotPrice);
    
    // We must ping Angel MarketData API for these tokens
    const exchangeTokens = {};
    tokenList.forEach(t => {
        if (!exchangeTokens[t.exch_seg]) exchangeTokens[t.exch_seg] = [];
        exchangeTokens[t.exch_seg].push(t.token);
    });

    const payload = {
        mode: "FULL",
        exchangeTokens: exchangeTokens
    };

    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-ClientLocalIP': '192.168.1.1',
        'X-ClientPublicIP': '106.193.147.98',
        'X-MACAddress': '00-B0-D0-63-C2-26',
        'X-PrivateKey': angelAuth.apiKey,
        'Authorization': `Bearer ${angelAuth.jwtToken}`
    };

    const res = await axios.post("https://apiconnect.angelbroking.com/rest/secure/angelbroking/market/v1/quote", payload, { headers });
    
    if (!res.data.status) throw new Error("Market Data fetching failed: " + res.data.message);

    const liveData = res.data.data.fetched;
    
    // 5. Restructure back into the NSE mock object to feed seamlessly into engine.js
    const struct = {
        records: {
            underlyingValue: expiryInfo.spotPrice,
            timestamp: new Date().toISOString(),
            data: []
        }
    };

    // Group by strike price
    const strikeMap = {};
    
    liveData.forEach(item => {
        // Find matching scrip for this token to know if it's CE or PE and what the strike is
        const scrip = tokenList.find(t => t.token === item.exchangeToken);
        if (scrip) {
            const strikeRaw = parseFloat(scrip.strike) / 100;
            const isCE = scrip.symbol.endsWith("CE");
            
            if (!strikeMap[strikeRaw]) strikeMap[strikeRaw] = { strikePrice: strikeRaw };
            
            const optData = {
                strikePrice: strikeRaw,
                openInterest: item.opnInterest || 0,
                changeinOpenInterest: item.netChange || 0,
                impliedVolatility: 0, // Not provided directly, engine has fallbacks
                lastPrice: item.ltp || 0,
                pChange: item.percentChange || 0
            };

            if (isCE) {
                strikeMap[strikeRaw].CE = optData;
            } else {
                strikeMap[strikeRaw].PE = optData;
            }
        }
    });

    struct.records.data = Object.values(strikeMap);
    return struct;
};

module.exports = { authenticateAngel, fetchAngelOptionChain, angelAuth };
