"use client";
import { useEffect, useState } from 'react';
import SignalCard from '../components/SignalCard';
import OptionChain from '../components/OptionChain';
import { RefreshCw } from 'lucide-react';

export default function Home() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchLiveSignals = async () => {
    setLoading(true);
    setError(null);
    try {
      // Direct connection to the live Render backend
      const apiUrl = 'https://ai-made-trade-website.onrender.com';
      const res = await fetch(`${apiUrl}/api/signals?symbol=NIFTY`);
      
      if (!res.ok) throw new Error('Failed to fetch from backend');
      
      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);
      
      setData(payload.data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveSignals();
    const interval = setInterval(fetchLiveSignals, 60000); // Poll every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-customPanel p-4 rounded-xl border border-gray-800">
        <div>
          <h2 className="text-xl font-semibold text-white">NIFTY 50</h2>
          {data && <p className="text-2xl font-bold text-gray-200">{data.underlyingValue}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 mb-1">Status: {loading ? 'Fetching...' : 'Live'}</p>
          <button 
            onClick={fetchLiveSignals}
            className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {lastUpdated ? `Updated ${lastUpdated}` : 'Sync Data'}
          </button>
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
          <p className="text-gray-500 animate-pulse">Initializing Strategy Engine...</p>
        </div>
      )}
    </div>
  );
}
