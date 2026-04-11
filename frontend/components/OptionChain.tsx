"use client";

export default function OptionChain({ strikes, underlying }: { strikes: any[], underlying: number }) {
  // Simple utility to map max OI to an opacity for heatmap effect
  const maxCallOI = Math.max(...strikes.map(s => s.ceOI));
  const maxPutOI = Math.max(...strikes.map(s => s.peOI));

  return (
    <div className="bg-customPanel border border-gray-800 rounded-2xl overflow-hidden h-full flex flex-col">
       <div className="bg-black/40 p-4 border-b border-gray-800 flex justify-between items-center">
         <h3 className="text-gray-300 font-semibold tracking-wide">Live Option Chain Analysis</h3>
         <span className="text-xs text-blue-400 bg-blue-900/20 px-2 py-1 rounded border border-blue-800/50">Spot: {underlying}</span>
       </div>
       
       <div className="overflow-x-auto flex-grow p-4">
        <table className="w-full text-sm text-center">
            <thead>
            <tr className="text-gray-500 border-b border-gray-800">
                <th className="pb-3 px-2 font-medium">CALL OI</th>
                <th className="pb-3 px-2 font-medium">CALL CHG</th>
                <th className="pb-3 px-4 font-semibold text-white bg-black/20 rounded-t-lg">STRIKE</th>
                <th className="pb-3 px-2 font-medium">PUT CHG</th>
                <th className="pb-3 px-2 font-medium">PUT OI</th>
            </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
            {strikes.map((s, idx) => {
                const callOpacity = Math.max(0.1, s.ceOI / maxCallOI);
                const putOpacity = Math.max(0.1, s.peOI / maxPutOI);
                
                // Highlight At-The-Money roughly
                const isATM = Math.abs(s.strikePrice - underlying) < 50;

                return (
                <tr key={idx} className={`hover:bg-white/5 transition-colors ${isATM ? 'bg-blue-900/10' : ''}`}>
                    {/* Calls */}
                    <td className="py-3 px-2 relative">
                        <div className="absolute inset-y-1 right-0 rounded bg-red-500/20" style={{ width: `${callOpacity * 100}%` }}></div>
                        <span className="relative text-gray-300 font-mono">{s.ceOI.toLocaleString()}</span>
                    </td>
                    <td className={`py-3 px-2 font-mono ${s.ceChange > 0 ? "text-green-400" : "text-red-400"}`}>
                        {s.ceChange > 0 ? "+" : ""}{s.ceChange.toLocaleString()}
                    </td>
                    
                    {/* Strike */}
                    <td className={`py-3 px-4 font-bold bg-black/20 ${isATM ? "text-blue-400 border-l border-r border-blue-900/50" : "text-white"}`}>
                        {s.strikePrice}
                    </td>
                    
                    {/* Puts */}
                    <td className={`py-3 px-2 font-mono ${s.peChange > 0 ? "text-green-400" : "text-red-400"}`}>
                        {s.peChange > 0 ? "+" : ""}{s.peChange.toLocaleString()}
                    </td>
                    <td className="py-3 px-2 relative">
                        <div className="absolute inset-y-1 left-0 rounded bg-green-500/20" style={{ width: `${putOpacity * 100}%` }}></div>
                        <span className="relative text-gray-300 font-mono">{s.peOI.toLocaleString()}</span>
                    </td>
                </tr>
                );
            })}
            </tbody>
        </table>
       </div>
    </div>
  );
}
