import React, { useEffect, useState } from 'react';
import { Sparkles, Trophy, Flame } from 'lucide-react';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Show splash for 2.2 seconds then fade out
    const timer = setTimeout(() => {
      setFading(true);
      setTimeout(() => {
        onFinish();
      }, 500);
    }, 2200);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-between bg-slate-950 p-6 select-none transition-opacity duration-500 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Top ambient lights */}
      <div className="absolute top-1/4 w-72 h-72 bg-gradient-to-tr from-amber-500/20 to-purple-600/20 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="w-full flex justify-end">
        <span className="text-[10px] font-mono font-bold tracking-widest text-slate-500">v2.4 MASTER</span>
      </div>

      {/* Center Hero Logo & Title */}
      <div className="flex flex-col items-center gap-4 my-auto relative z-10">
        {/* Animated Badge Icon */}
        <div className="relative group">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-amber-500 via-purple-600 to-indigo-600 p-0.5 shadow-2xl shadow-purple-950/80 animate-bounce">
            <div className="w-full h-full bg-slate-950 rounded-[22px] flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-purple-900/40 to-transparent" />
              <Trophy className="w-12 h-12 text-amber-400 drop-shadow-[0_0_15px_#f59e0b] animate-pulse" />
            </div>
          </div>
          <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-lg border-2 border-slate-950">
            <Sparkles className="w-4 h-4 animate-spin text-white" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-3xl font-black italic tracking-wider bg-gradient-to-r from-amber-300 via-purple-300 to-indigo-200 bg-clip-text text-transparent drop-shadow-sm">
            BRAWL COACH AI
          </h1>
          <div className="flex items-center justify-center gap-1.5 mt-1 text-xs font-semibold text-slate-400">
            <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span>Asistente Táctico & Draft Inteligente</span>
          </div>
        </div>

        {/* Loading Indicator */}
        <div className="w-40 h-1.5 bg-slate-900 rounded-full overflow-hidden mt-3 border border-slate-800">
          <div className="h-full bg-gradient-to-r from-amber-400 to-purple-500 rounded-full animate-[progress_1.8s_ease-in-out_infinite]" />
        </div>
      </div>

      {/* Footer Creator Badge */}
      <div className="flex flex-col items-center gap-1 relative z-10">
        <span className="text-[11px] text-slate-400 font-medium tracking-wide">
          Creado con pasión por
        </span>
        <div className="px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-bold text-amber-300 shadow-sm flex items-center gap-1.5">
          <span>👑</span>
          <span className="tracking-wider">Sergio Sanlés</span>
        </div>
      </div>
    </div>
  );
};
