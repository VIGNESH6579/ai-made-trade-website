const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
const { calculateSignal } = require('./engine');

const app = express();
app.use(cors());

const port = process.env.PORT || 5000;
const cache = new NodeCache({ stdTTL: 120 }); // Cache for 2 minutes to prevent rate limiting

let cookies = "";
let lastSignalAction = "HOLD / NEUTRAL"; // Track state to avoid duplicate notifications

// Your free notification channel via ntfy.sh
// The user can download the 'ntfy' app on mobile and subscribe to this exact topic string.
const NTFY_TOPIC = "aimade_trade_nifty50_alerts";

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
};

// Function to fetch cookies from the main homepage
const fetchCookies = async () => {
    try {
        const response = await axios.get("https://www.nseindia.com", { headers });
        const setCookieHeaders = response.headers['set-cookie'];
        if (setCookieHeaders) {
            cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
            console.log("Cookies fetched successfully");
        }
    } catch (error) {
        console.error("Error fetching cookies");
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
        if (error.response && error.response.status === 401) {
            await fetchCookies();
            const retryResponse = await axios.get(`https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`, {
                headers: { ...headers, 'Cookie': cookies }
            });
            return retryResponse.data;
        }
        throw error;
    }
};

// Auto-Polling Logic to trigger push notifications even if the frontend website is closed
const autoPollMarket = async () => {
    try {
        const rawData = await getOptionChain('NIFTY');
        const processedSignal = calculateSignal(rawData);
        
        const currentAction = processedSignal.signal.action;
        
        // Push notification logic: Only send if signal changed to a BUY action.
        if (currentAction !== lastSignalAction && currentAction !== "HOLD / NEUTRAL") {
            const message = `🚨 AI SIGNAL ALERT: ${currentAction}\nStrategy: ${processedSignal.signal.strategy}\nTarget: ${processedSignal.signal.target} | SL: ${processedSignal.signal.stopLoss}\nReason: ${processedSignal.signal.reason}`;
            
            // Post to ntfy.sh for instant free push notifications to mobile
            await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, message, {
                headers: {
                    'Title': `NIFTY AI Alert - ${currentAction}`,
                    'Priority': 'urgent',
                    'Tags': currentAction.includes('CALL') ? 'chart_with_upwards_trend' : 'chart_with_downwards_trend'
                }
            });
            console.log("Push notification sent: ", currentAction);
        }
        
        // Update state
        lastSignalAction = currentAction;
        
        // Cache the latest data for API fast response if frontend hits it
        cache.set('signal_NIFTY', processedSignal);

    } catch (error) {
        console.error("Auto-poll encountered an error:", error.message);
    }
};

app.get('/api/signals', async (req, res) => {
    const symbol = req.query.symbol || 'NIFTY';
    const cacheKey = `signal_${symbol}`;
    
    // Serve from cache since our background polling populates it regularly
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        return res.json({ source: 'cache', data: cachedData });
    }

    try {
        const rawData = await getOptionChain(symbol);
        const processedSignal = calculateSignal(rawData);
        if (processedSignal.error) {
            return res.status(500).json({ error: "Failed to map NSE Data. They might be blocking the IP." });
        }
        cache.set(cacheKey, processedSignal);
        return res.json({ source: 'live', data: processedSignal });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch data from NSE." });
    }
});

app.listen(port, () => {
    console.log(`Signal Engine Backend running on port ${port}`);
    fetchCookies();
    
    // Start background auto-polling every 3 minutes (180000 ms)
    setInterval(autoPollMarket, 180000); 
});
