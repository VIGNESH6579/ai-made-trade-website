const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const axios = require('axios');
const { calculateSignal } = require('./engine');
const { fetchAngelOptionChain } = require('./angelAPI');
const WebSocket = require('ws');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws/market-data' });

const cache = new NodeCache({ stdTTL: 0 }); // Fallback cache
const NTFY_TOPIC = "aimade_trade_nifty50_alerts";
let lastSignalAction = "HOLD / NEUTRAL";

wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket feed');
    ws.isAlive = true;
    
    // Instantly push the cached version on first connection
    const cachedData = cache.get(`signal_NIFTY`);
    if (cachedData) {
        ws.send(JSON.stringify({ source: cachedData.isStale ? 'cache_stale' : 'cache_live', data: cachedData }));
    }

    ws.on('pong', () => { ws.isAlive = true; });
    
    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Ping interval to keep clients alive
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

const broadcastToClients = (payload) => {
    const message = JSON.stringify(payload);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
};

app.get('/health', (req, res) => res.status(200).send('OK'));

const autoPollMarket = async () => {
    try {
        const rawData = await fetchAngelOptionChain(); 
        const processedSignal = calculateSignal(rawData); 
        
        if (!processedSignal.error) {
            const currentAction = processedSignal.signal.action;
            if (currentAction !== lastSignalAction && currentAction !== "HOLD / NEUTRAL") {
                const message = `🚨 AI SIGNAL ALERT: ${currentAction}\nStrategy: ${processedSignal.signal.strategy}\nTarget: ${processedSignal.signal.target} | SL: ${processedSignal.signal.stopLoss}`;
                await axios.post(`https://ntfy.sh/${NTFY_TOPIC}`, message, { headers: { 'Title': `NIFTY Alert - ${currentAction}`, 'Priority': 'urgent' }});
            }
            lastSignalAction = currentAction;
            
            const responseData = { ...processedSignal, isStale: false };
            cache.set('signal_NIFTY', responseData);
            
            // Push via WebSockets!
            broadcastToClients({ source: 'live', data: responseData });
        }
    } catch (error) {
        console.error("Auto-poll failed:", error.message);
        const existingData = cache.get('signal_NIFTY');
        if (existingData) {
            existingData.isStale = true;
            cache.set('signal_NIFTY', existingData);
            broadcastToClients({ source: 'cache_stale', data: existingData });
        }
    }
};

app.get('/api/signals', async (req, res) => {
    const cachedData = cache.get(`signal_NIFTY`);
    if (cachedData) {
        return res.json({ source: cachedData.isStale ? 'cache_stale' : 'cache_live', data: cachedData });
    }
    return res.status(500).json({ error: "No data available yet. Please try again." });
});

const autoPollSequence = async () => {
    await autoPollMarket();
    setTimeout(autoPollSequence, 10000);
};

server.listen(port, () => {
    console.log(`Angel One Connected Backend running on port ${port}`);
    // Fast polling sequentially to guarantee rate limit adherence
    autoPollSequence(); 
});
