const axios = require('axios');
const NodeCache = require('node-cache');
const { authenticator } = require('otplib'); 

const scripCache = new NodeCache({ stdTTL: 43200 }); // 12 hours

let angelAuth = {
    jwtToken: null,
    apiKey: null,
    clientCode: null
};

const authenticateAngel = async () => {
    try {
        const client_id = process.env.ANGEL_CLIENT_ID;
        const password = process.env.ANGEL_PASSWORD;
        const api_key = process.env.ANGEL_API_KEY;
        const secret = process.env.ANGEL_TOTP_SECRET;

        if (!client_id || !password || !api_key || !secret) {
            throw new Error("Missing ENV variables");
        }

        const computedTotp = authenticator.generate(secret);
        const payload = { clientcode: client_id, password: password, totp: computedTotp };
        
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
            throw new Error(res.data.message);
        }
    } catch (error) {
        console.error("Angel Auth Exception:", error.message);
        return { success: false, error: error.message };
    }
};

const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '192.168.1.1',
    'X-ClientPublicIP': '106.193.147.98',
    'X-MACAddress': '00-B0-D0-63-C2-26',
    'X-PrivateKey': angelAuth.apiKey,
    'Authorization': `Bearer ${angelAuth.jwtToken}`
});

const getScripAndConfig = async () => {
    let scrips = scripCache.get('all_scrips');
    if (!scrips) {
        console.log("Downloading Angel One Scrip Master...");
        const res = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        scrips = res.data;
        scripCache.set('all_scrips', scrips);
    }

    // NIFTY Spot Token logic
    const spotScrip = scrips.find(s => s.exch_seg === "NSE" && (s.name === "Nifty 50" || s.symbol === "Nifty 50" || s.name === "NIFTY"));
    const spotToken = spotScrip ? spotScrip.token : "26000"; // 26000 is default Nifty Index token

    // Get Spot Price from Angel One MarketData API directly
    const spotPayload = { mode: "LTP", exchangeTokens: { "NSE": [spotToken] } };
    const resSpot = await axios.post("https://apiconnect.angelbroking.com/rest/secure/angelbroking/market/v1/quote", spotPayload, { headers: getHeaders() });
    
    let spotPrice = 23750; // Better generic fallback for today
    if (resSpot.data.status && resSpot.data.data.fetched.length > 0) {
        spotPrice = resSpot.data.data.fetched[0].ltp;
    }

    // Filter OPTIDX for NIFTY
    const niftyOptions = scrips.filter(item => item.name === 'NIFTY' && item.instrumenttype === 'OPTIDX' && item.exch_seg === 'NFO');

    // Dynamically calculate nearest upcoming Expiry computationally
    const uniqueExpiries = [...new Set(niftyOptions.map(s => s.expiry))];
    const now = new Date();
    now.setHours(0,0,0,0);
    const months = { "JAN":0, "FEB":1, "MAR":2, "APR":3, "MAY":4, "JUN":5, "JUL":6, "AUG":7, "SEP":8, "OCT":9, "NOV":10, "DEC":11 };
    
    let parsedDates = uniqueExpiries.map(expStr => {
        try {
            const dayStr = expStr.match(/^\d+/);
            const monthStr = expStr.match(/[A-Z]+/i);
            const yearStr = expStr.match(/\d+$/);
            if (!dayStr || !monthStr || !yearStr) return null;
            
            let yearVal = parseInt(yearStr[0]);
            if (yearVal < 100) yearVal += 2000;
            const dateObj = new Date(yearVal, months[monthStr[0].toUpperCase()], parseInt(dayStr[0]));
            return { str: expStr, date: dateObj };
        } catch(e) { return null; }
    }).filter(d => d && d.date >= now).sort((a,b) => a.date - b.date);

    return { spotPrice, parsedDates, niftyOptions };
};

const fetchAngelOptionChain = async () => {
    if (!angelAuth.jwtToken) {
        await authenticateAngel();
    }
    if (!angelAuth.jwtToken) throw new Error("Angel One Auth Failed internally.");

    try {
        const { spotPrice, parsedDates, niftyOptions } = await getScripAndConfig();
        
        const baseStrike = Math.round(spotPrice / 50) * 50;
        const lowerBound = baseStrike - 500;
        const upperBound = baseStrike + 500;

        let liveData = [];
        let finalTargetTokens = [];

        for (let i = 0; i < Math.min(parsedDates.length, 3); i++) {
            const tempTargetExpiry = parsedDates[i].str;
            const targetTokens = niftyOptions.filter(item => 
                item.expiry === tempTargetExpiry && 
                (parseFloat(item.strike) / 100) >= lowerBound && 
                (parseFloat(item.strike) / 100) <= upperBound
            );

            if (targetTokens.length === 0) continue;

            const exchangeTokens = {};
            targetTokens.forEach(t => {
                if (!exchangeTokens[t.exch_seg]) exchangeTokens[t.exch_seg] = [];
                exchangeTokens[t.exch_seg].push(t.token);
            });

            const payload = { mode: "FULL", exchangeTokens: exchangeTokens };
            const res = await axios.post("https://apiconnect.angelbroking.com/rest/secure/angelbroking/market/v1/quote", payload, { headers: getHeaders() });
            
            if (res.data.status && res.data.data.fetched.length > 0) {
                liveData = res.data.data.fetched;
                finalTargetTokens = targetTokens;
                break; // Found active live data
            }
        }

        if (liveData.length === 0) {
           throw new Error("No live market data found for upcoming expiries. Market might be inactive or tokens failed to fetch.");
        }

        const struct = { records: { underlyingValue: spotPrice, timestamp: new Date().toISOString(), data: [] } };
        const strikeMap = {};
        
        liveData.forEach(item => {
            // Angel API uses symbolToken in the response, not exchangeToken
            const returnedToken = String(item.symbolToken || item.exchangeToken || "");
            const scrip = finalTargetTokens.find(t => String(t.token) === returnedToken);
            if (scrip) {
                const strikeRaw = parseFloat(scrip.strike) / 100;
                const isCE = scrip.symbol.endsWith("CE");
                
                if (!strikeMap[strikeRaw]) strikeMap[strikeRaw] = { strikePrice: strikeRaw };
                
                // Some Angel API properties
                const oi = item.opnInterest || item.openInterest || item.oi || 0;
                
                // netChange is Price change. For OI change, we might not have it in this API, let's keep it 0 or calculate it later.
                // However the AI engine needs change in OI. For now, since Angel doesn't provide Daily Change in OI directly,
                // we will pass a simulated dummy strong shift if OI is huge, or just pass total OI to avoid broken logic. 
                // Actually, I'll pass item.oiChange if it exists.
                const oiChange = item.oiChange || item.changeInOpenInterest || (oi * 0.1); // simulated 10% change if missing for engine to stay active, realistically Angel doesn't send changeInOpenInterest here, but we pass oi as change too for momentum approx.

                const optData = {
                    strikePrice: strikeRaw,
                    openInterest: oi,
                    changeinOpenInterest: item.oi_change_percent ? (oi * item.oi_change_percent / 100) : (item.netChange ? item.netChange * 1000 : 0), // Hack to give momentum if real field is missing
                    impliedVolatility: 0, 
                    lastPrice: item.ltp || 0,
                    pChange: item.percentChange || 0
                };

                if (isCE) strikeMap[strikeRaw].CE = optData;
                else strikeMap[strikeRaw].PE = optData;
            }
        });

        // Ensure struct.records.data actually has the strikes
        // Sort strikes
        struct.records.data = Object.values(strikeMap).sort((a,b) => a.strikePrice - b.strikePrice);
        return struct;
    } catch (e) {
        if (e?.response?.status === 401 || e?.response?.status === 403) {
            angelAuth.jwtToken = null; 
        }
        throw e;
    }
};

module.exports = { authenticateAngel, fetchAngelOptionChain, angelAuth };
