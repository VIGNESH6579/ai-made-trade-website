"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Zap, Lock } from 'lucide-react';

export default function AngelLogin() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    clientId: '',
    password: '',
    totp: '',
    apiKey: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      const res = await fetch(`${apiUrl}/api/angel/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const payload = await res.json();
      if (!res.ok || payload.error) throw new Error(payload.error || "Authentication Failed");
      
      // Navigate to dashboard automatically upon success
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="w-full max-w-md bg-customPanel p-8 rounded-2xl border border-gray-800 shadow-2xl relative overflow-hidden">
        
        {/* Glow Effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-blue-900/20 blur-3xl rounded-full"></div>
        
        <div className="relative z-10">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-blue-900/30 rounded-full border border-blue-800/50">
              <Lock className="text-blue-400 w-8 h-8" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-center text-white mb-2">Connect Broker</h2>
          <p className="text-gray-400 text-sm text-center mb-8">Authenticate with Angel One SmartAPI to pull 100% reliable Option Chain data.</p>
          
          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm p-3 rounded-lg mb-6 flex items-start gap-2">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">ANGEL CLIENT ID</label>
              <input 
                type="text" 
                required
                className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all uppercase"
                value={formData.clientId}
                onChange={e => setFormData({...formData, clientId: e.target.value.toUpperCase()})}
                placeholder="Ex: V12345"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">PASSWORD (MPIN)</label>
              <input 
                type="password" 
                required
                className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">AUTHENTICATOR TOTP (6-DIGIT)</label>
              <input 
                type="text" 
                required
                maxLength={6}
                pattern="\d{6}"
                className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-center tracking-[0.5em] font-mono text-lg focus:outline-none focus:border-blue-500 transition-all font-bold placeholder-gray-600"
                value={formData.totp}
                onChange={e => setFormData({...formData, totp: e.target.value.replace(/\D/g, '')})}
                placeholder="000000"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">SMART API KEY</label>
              <input 
                type="password" 
                required
                className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                value={formData.apiKey}
                onChange={e => setFormData({...formData, apiKey: e.target.value})}
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg mt-6 shadow-lg shadow-blue-900/20 transition-all flex justify-center items-center gap-2 group"
            >
              {loading ? (
                <div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
              ) : (
                <>
                  Connect Engine <Zap size={18} className="group-hover:scale-110 transition-transform" />
                </>
              )}
            </button>
          </form>
          
          <div className="mt-6 text-center">
             <p className="text-xs text-gray-500">Your credentials are temporarily stored in local memory and are never saved to a database.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
