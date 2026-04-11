"use client";
import { TrendingUp, TrendingDown, Minus, Target as TargetIcon, ShieldAlert, Zap } from 'lucide-react';

export default function SignalCard({ signalData }: { signalData: any }) {
  const { action, confidence, reason, strategy, target, stopLoss, netOiShift } = signalData.signal;

  let isBullish = action.includes("CALL") || action === "BUY CALL";
  let isBearish = action.includes("PUT") || action === "BUY PUT";
  
  let bgClass = "bg-customPanel border-gray-700";
  let icon = <Minus className="text-gray-400 w-12 h-12" />;
  let textGrad = "text-gray-300";

  if (isBullish) {
    bgClass = "bg-green-900/10 border-green-800/50 glow-bull";
    icon = <TrendingUp className="text-brandBull w-12 h-12" />;
    textGrad = "text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-300";
  } else if (isBearish) {
    bgClass = "bg-red-900/10 border-red-800/50 glow-bear";
    icon = <TrendingDown className="text-brandBear w-12 h-12" />;
    textGrad = "text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500";
  }

  return (
    <div className={`p-6 rounded-2xl border transition-all duration-500 ${bgClass} h-full flex flex-col`}>
      <h3 className="text-gray-400 text-sm font-semibold tracking-widest uppercase mb-6 flex items-center gap-2">
        <Zap size={16} className={isBullish ? "text-brandBull" : isBearish ? "text-brandBear" : "text-gray-400"} />
        AI Engine Signal
      </h3>
      
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-black/40 rounded-xl border border-white/5 shadow-inner">
          {icon}
        </div>
        <div>
          <h2 className={`text-4xl font-extrabold ${textGrad}`}>
            {action}
          </h2>
          <span className="text-xs font-medium px-2 py-1 bg-black/30 rounded-md mt-2 inline-block border border-white/10 text-gray-300">
            CONFIDENCE: {confidence}
          </span>
        </div>
      </div>

      <div className="space-y-4 flex-grow">
        <div className="bg-black/20 p-4 rounded-xl border border-white/5">
          <p className="text-sm text-gray-300 leading-relaxed italic border-l-2 pl-3 border-blue-500/50">
            {reason}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6">
           <div className="bg-black/30 p-4 rounded-xl border border-green-900/30 flex flex-col justify-center">
             <span className="text-gray-500 text-xs flex items-center gap-1 mb-1"><TargetIcon size={14}/> TARGET</span>
             <span className="text-2xl font-bold text-white">{target}</span>
           </div>
           <div className="bg-black/30 p-4 rounded-xl border border-red-900/30 flex flex-col justify-center">
             <span className="text-gray-500 text-xs flex items-center gap-1 mb-1"><ShieldAlert size={14}/> STOP LOSS</span>
             <span className="text-2xl font-bold text-gray-300">{stopLoss}</span>
           </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-white/5">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Recommended Strategy:</span>
          <span className="font-semibold text-blue-400">{strategy}</span>
        </div>
        <div className="flex justify-between items-center text-sm mt-3">
          <span className="text-gray-500">Net OI Momentum Shift:</span>
          <span className={`font-mono ${netOiShift > 0 ? "text-green-400" : netOiShift < 0 ? "text-red-400" : "text-gray-400"}`}>
            {netOiShift > 0 ? "+" : ""}{netOiShift.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
