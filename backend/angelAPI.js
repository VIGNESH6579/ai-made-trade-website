const axios = require('axios');
const NodeCache = require('node-cache');
const { authenticator } = require('otplib'); // Stable TOTP generation

const scripCache = new NodeCache({ stdTTL: 43200 }); // 12 hours

let angelAuth = {
    jwtToken: null,
    apiKey: null,
    clientCode: null
};

// 1. Authenticate with Angel One using 100% Zero-Touch Automation from Hidden Environment Variables
const authenticateAngel = async () => {
    try {
        const client_id = process.env.ANGEL_CLIENT_ID;
        const password = process.env.ANGEL_PASSWORD;
        const api_key = process.env.ANGEL_API_KEY;
        const secret = process.env.ANGEL_TOTP_SECRET;

        if (!client_id || !password || !api_key || !secret) {
            console.error("Missing Angel One Environment Variables! Cannot boot autonomously.");
            return { success: false, error: "Missing ENV variables" };
        }

        // Programmatically generate the exact 6-digit TOTP synced with Google Authenticator
        const computedTotp = authenticator.generate(secret);
        console.log(`Computed Autonomous TOTP: ${computedTotp}`);

        const payload = {
            clientcode: client_id,
            password: password,
            totp: computedTotp
        };
        
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserType': 'USER',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '192.168.1.1',
            'X-ClientPublicIP': '106.193.147.98',
            'X-MACAddress': '00-B0-D0-63-C2-26',
            'X-PrivateKey': api_key
        };

        const res = await axios.post('https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/v1/loginByPassword', payload, { headers });
        
        if (res.data.status) {
            angelAuth.jwtToken = res.data.data.jwtToken;
            angelAuth.apiKey = api_key;
            angelAuth.clientCode = client_id;
            console.log("Zero-Touch Angel One Auth Session Established Successfully!");
            return { success: true };
        } else {
            console.error("Angel Auth Failed:", res.data.message);
            return { success: false, error: res.data.message };
        }
    } catch (error) {
        console.error("Angel Auth Exception:", error.message);
        return { success: false, error: error.message };
    }
};

const getTargetExpiry = async () => {
    const res = await axios.get("https://groww.in/v1/api/option_chain_service/v1/option_chain/nifty");
    const expiryStr = res.data.expiryDetailsDto.currentExpiry; 
    
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const [year, month, day] = expiryStr.split("-");
    const dt = new Date(year, parseInt(month) - 1, day);
    
    return {
        growwFormat: expiryStr,
        angelFormat: `${day}${months[dt.getMonth()]}${year}`,
        spotPrice: res.data.optionChains[0].callOption.underlyingValue || (res.data.optionChains[0].strikePrice / 100) 
    };
};

const getScripTokens = async (expiryString, spotPrice) => {
    let scrips = scripCache.get('nifty_scrips');
    
    if (!scrips) {
        console.log("Downloading Angel One Scrip Master...");
        const res = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const allData = res.data;
        scrips = allData.filter(item => 
            item.name === 'NIFTY' && 
            item.instrumenttype === 'OPTIDX' && 
            item.exch_seg === 'NFO'
        );
        scripCache.set('nifty_scrips', scrips);
    }

    const baseStrike = Math.round(spotPrice / 50) * 50;
    const lowerBound = baseStrike - 500;
    const upperBound = baseStrike + 500;

    return scrips.filter(item => 
        item.expiry === expiryString && 
        (parseFloat(item.strike) / 100) >= lowerBound && 
        (parseFloat(item.strike) / 100) <= upperBound
    );
};

const fetchAngelOptionChain = async () => {
    // If not authenticated (expired session or boot), forcefully authenticate via TOTP Engine!
    if (!angelAuth.jwtToken) {
        await authenticateAngel();
    }

    if (!angelAuth.jwtToken) throw new Error("Angel One Auth Failed internally.");

    const expiryInfo = await getTargetExpiry();
    const tokenList = await getScripTokens(expiryInfo.angelFormat, expiryInfo.spotPrice);
    
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

    try {
        const res = await axios.post("https://apiconnect.angelbroking.com/rest/secure/angelbroking/market/v1/quote", payload, { headers });
        if (!res.data.status) throw new Error(res.data.message);

        const liveData = res.data.data.fetched;
        const struct = { records: { underlyingValue: expiryInfo.spotPrice, timestamp: new Date().toISOString(), data: [] } };
        const strikeMap = {};
        
        liveData.forEach(item => {
            const scrip = tokenList.find(t => t.token === item.exchangeToken);
            if (scrip) {
                const strikeRaw = parseFloat(scrip.strike) / 100;
                const isCE = scrip.symbol.endsWith("CE");
                
                if (!strikeMap[strikeRaw]) strikeMap[strikeRaw] = { strikePrice: strikeRaw };
                
                const optData = {
                    strikePrice: strikeRaw,
                    openInterest: item.opnInterest || 0,
                    changeinOpenInterest: item.netChange || 0,
                    impliedVolatility: 0, 
                    lastPrice: item.ltp || 0,
                    pChange: item.percentChange || 0
                };

                if (isCE) strikeMap[strikeRaw].CE = optData;
                else strikeMap[strikeRaw].PE = optData;
            }
        });

        struct.records.data = Object.values(strikeMap);
        return struct;
    } catch (e) {
        // If JWT expired, drop the token so the next poll will trigger the internal TOTP generator again
        if (e?.response?.status === 401 || e?.response?.status === 403) {
            angelAuth.jwtToken = null; 
        }
        throw e;
    }
};

module.exports = { authenticateAngel, fetchAngelOptionChain, angelAuth };
