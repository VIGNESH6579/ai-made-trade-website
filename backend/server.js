const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
const { calculateSignal } = require('./engine');

const app = express();
app.use(cors());

const port = process.env.PORT || 5000;
// We set stdTTL to 0 (never expires) so we always have a fallback when NSE blocks the IP
const cache = new NodeCache({ stdTTL: 0 }); 

let cookies = "";
let lastSignalAction = "HOLD / NEUTRAL"; 

const NTFY_TOPIC = "aimade_trade_nifty50_alerts";

const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
};

const fetchCookies = async () => {
    try {
        const response = await axios.get("https://www.nseindia.com", { headers });
        const setCookieHeaders = response.headers['set-cookie'];
        if (setCookieHeaders) {
            cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
            console.log("Cookies fetched successfully");
        }
    } catch (error) {
        console.error("Error fetching cookies, will retry later.");
    }
};

const getOptionChain = async (symbol = 'NIFTY') => {
    if (!cookies) await fetchCookies();
    
    try {
        const response = await axios.get(`https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`, {
            headers: { ...headers, 'Cookie': cookies }
        });
        return response.data;
    } catch (error) {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            await fetchCookies();
            const retryResponse = await axios.get(`https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`, {
                headers: { ...headers, 'Cookie': cookies }
            });
            return retryResponse.data;
        }
        throw error;
    }
};

const autoPollMarket = async () => {
    try {
        const rawData = await getOptionChain('NIFTY');
        const processedSignal = calculateSignal(rawData);
        
        if (!processedSignal.error) {
            const currentAction = processedSignal.signal.action;
            if (currentAction !== lastSignalAction && currentAction !== "HOLD / NEUTRAL") {
                const message = `🚨 AI SIGNAL ALERT: ${currentAction}\nStrategy: ${processedSignal.signal.strategy}\nTarget: ${processedSignal.signal.target} | SL: ${processedSignal.signal.stopLoss}`;
                await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, message, { headers: { 'Title': `NIFTY Alert - ${currentAction}`, 'Priority': 'urgent' }});
            }
            lastSignalAction = currentAction;
            // Update cache with fresh data & timestamp
            cache.set('signal_NIFTY', { ...processedSignal, isStale: false });
        }
    } catch (error) {
        console.error("Auto-poll blocked by NSE. Relying on cache.");
        // Mark existing cache as stale if it exists
        const existingData = cache.get('signal_NIFTY');
        if (existingData) {
            existingData.isStale = true;
            cache.set('signal_NIFTY', existingData);
        }
    }
};

app.get('/api/signals', async (req, res) => {
    const symbol = req.query.symbol || 'NIFTY';
    const cacheKey = `signal_${symbol}`;

    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        return res.json({ source: cachedData.isStale ? 'cache_stale' : 'cache_live', data: cachedData });
    }

    try {
        const rawData = await getOptionChain(symbol);
        const processedSignal = calculateSignal(rawData);
        
        if (processedSignal.error) {
            throw new Error("Invalid format");
        }
        
        const responseData = { ...processedSignal, isStale: false };
        cache.set(cacheKey, responseData);
        return res.json({ source: 'live', data: responseData });

    } catch (error) {
        return res.status(500).json({ error: "Waiting for NSE connection. The datacentre IP is temporarily rate-limited. Please wait 3 minutes." });
    }
});

app.listen(port, () => {
    console.log(`Backend running on port ${port}`);
    fetchCookies();
    setInterval(autoPollMarket, 180000); 
});
