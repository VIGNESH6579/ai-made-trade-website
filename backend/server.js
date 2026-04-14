const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const axios = require('axios');
const { calculateSignal } = require('./engine');
const { authenticateAngel, fetchAngelOptionChain, angelAuth } = require('./angelAPI');

const app = express();
app.use(cors());
app.use(express.json()); // For parsing application/json POST requests

const port = process.env.PORT || 5000;
const cache = new NodeCache({ stdTTL: 0 }); // Fallback cache
const NTFY_TOPIC = "aimade_trade_nifty50_alerts";
let lastSignalAction = "HOLD / NEUTRAL";

// Health check endpoint to keep Render awake
app.get('/health', (req, res) => res.status(200).send('OK'));

// Total Automation: Authentication is now handled 100% internally by the Engine using Node Environment Variables.

// Auto-Polling Logic
const autoPollMarket = async () => {
    // Engine is now fully autonomous. It will force its own auth if missing.

    try {
        const rawData = await fetchAngelOptionChain(); // Hits Angel One API
        const processedSignal = calculateSignal(rawData); // Our Quant Engine
        
        if (!processedSignal.error) {
            const currentAction = processedSignal.signal.action;
            if (currentAction !== lastSignalAction && currentAction !== "HOLD / NEUTRAL") {
                const message = `🚨 AI SIGNAL ALERT: ${currentAction}\nStrategy: ${processedSignal.signal.strategy}\nTarget: ${processedSignal.signal.target} | SL: ${processedSignal.signal.stopLoss}`;
                await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, message, { headers: { 'Title': `NIFTY Alert - ${currentAction}`, 'Priority': 'urgent' }});
            }
            lastSignalAction = currentAction;
            cache.set('signal_NIFTY', { ...processedSignal, isStale: false });
        }
    } catch (error) {
        console.error("Auto-poll failed:", error.message);
        const existingData = cache.get('signal_NIFTY');
        if (existingData) {
            existingData.isStale = true;
            cache.set('signal_NIFTY', existingData);
        }
    }
};

app.get('/api/signals', async (req, res) => {
    const cacheKey = `signal_NIFTY`;
    // Autonomy unlocked

    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        return res.json({ source: cachedData.isStale ? 'cache_stale' : 'cache_live', data: cachedData });
    }

    try {
        const rawData = await fetchAngelOptionChain();
        const processedSignal = calculateSignal(rawData);
        
        if (processedSignal.error) {
            throw new Error("Invalid format returned from Angel mapping");
        }
        
        const responseData = { ...processedSignal, isStale: false };
        cache.set(cacheKey, responseData);
        return res.json({ source: 'live', data: responseData });

    } catch (error) {
        const fallback = cache.get(cacheKey);
        if (fallback) {
            return res.json({ source: 'cache_stale', data: { ...fallback, isStale: true } });
        }
        return res.status(500).json({ error: error.message || "Failed to establish real-time connection with Angel One." });
    }
});

app.listen(port, () => {
    console.log(`Angel One Connected Backend running on port ${port}`);
    // Start background auto-polling every 3 minutes
    setInterval(autoPollMarket, 180000); 
});
