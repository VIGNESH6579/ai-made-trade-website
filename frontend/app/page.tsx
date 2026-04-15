"use client";
import { useEffect, useState, useRef } from 'react';
import SignalCard from '../components/SignalCard';
import OptionChain from '../components/OptionChain';
import { RefreshCw } from 'lucide-react';

export default function Home() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [wsStatus, setWsStatus] = useState<string>('Connecting...');

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connectWs = () => {
      // Direct WebSocket stream
      const wsUrl = 'wss://ai-made-trade-website.onrender.com/ws/market-data';
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setWsStatus('Live Server Connected');
        setLoading(false);
        setError(null);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.error) {
             setError(payload.error);
             return;
          }
          if (payload.data) {
             setData(payload.data);
             setLastUpdated(new Date().toLocaleTimeString());
             if (payload.source === 'cache_stale') {
                 setWsStatus('Retrying API...');
             } else {
                 setWsStatus('Live Server Connected');
             }
          }
        } catch (e) {
          console.error("Failed to parse websocket message", e);
        }
      };

      wsRef.current.onerror = () => {
        setWsStatus('Connection Error');
        setError("WebSocket Connection Error.");
      };

      wsRef.current.onclose = () => {
        setWsStatus('Disconnected - Retrying...');
        setTimeout(connectWs, 3000);
      };
    };

    connectWs();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-customPanel p-4 rounded-xl border border-gray-800">
        <div>
          <h2 className="text-xl font-semibold text-white">NIFTY 50</h2>
          {data && <p className="text-2xl font-bold text-gray-200">{data.underlyingValue}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 mb-1">Status: {wsStatus}</p>
          <div className="flex items-center justify-end gap-2 text-sm text-gray-300 px-4 py-2 opacity-80">
            <RefreshCw size={16} className={wsStatus !== 'Live Server Connected' ? 'animate-spin' : ''} />
            {lastUpdated ? `Updated ${lastUpdated}` : 'Syncing Data...'}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 p-4 rounded-lg">
          {error}. Is the backend running?
        </div>
      )}

      {!error && data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <SignalCard signalData={data} />
          </div>
          <div className="lg:col-span-2">
            <OptionChain strikes={data.strikes} underlying={data.underlyingValue} />
          </div>
        </div>
      )}
      
      {loading && !data && (
        <div className="h-64 flex items-center justify-center border border-gray-800 rounded-xl bg-customPanel/50">
          <p className="text-gray-500 animate-pulse">Initializing Option Chain WS Engine...</p>
        </div>
      )}
    </div>
  );
}
