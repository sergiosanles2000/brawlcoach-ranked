import React, { useEffect, useState } from 'react';

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
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-between bg-[#0b0f19] p-6 select-none transition-opacity duration-400 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="w-full flex justify-end">
        <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-600">v1.0.7</span>
      </div>

      {/* Center Official Icon & Clean Branding */}
      <div className="flex flex-col items-center gap-4 my-auto relative z-10">
        <div className="relative">
          <div className="w-28 h-28 rounded-3xl overflow-hidden shadow-2xl border-2 border-slate-700/60 bg-slate-900">
            <img
              src="/app-icon.png"
              alt="Brawl Draft AI"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        <div className="text-center space-y-1">
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">
            BRAWLDRAFT
          </h1>
          <p className="text-xs text-slate-400 font-medium">
            Draft & Counter Pick Asistente
          </p>
        </div>

        {/* Minimalist Loading Bar */}
        <div className="w-32 h-1 bg-slate-800 rounded-full overflow-hidden mt-2">
          <div className="h-full bg-cyan-500 rounded-full animate-pulse" />
        </div>
      </div>

      {/* Footer Signature */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
        <span>Diseñado por</span>
        <span className="font-semibold text-slate-300">Sergio Sanlés</span>
      </div>
    </div>
  );
};
