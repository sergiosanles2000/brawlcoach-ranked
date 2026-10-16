import React, { useState, useEffect } from 'react';
import { Clock, RotateCcw, Play, Pause } from 'lucide-react';

interface TurnTimerProps {
  initialSeconds?: number;
  activeTurnDescription?: string;
  isAllyTurn?: boolean;
}

export const TurnTimer: React.FC<TurnTimerProps> = ({
  initialSeconds = 20,
  activeTurnDescription = 'Tu turno de Pick',
  isAllyTurn = true,
}) => {
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isRunning && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRunning, timeLeft]);

  const handleReset = () => {
    setTimeLeft(initialSeconds);
    setIsRunning(true);
  };

  const isLowTime = timeLeft <= 5;
  const isMidTime = timeLeft <= 10 && !isLowTime;

  return (
    <div
      className={`flex items-center justify-between px-3 py-1.5 rounded-xl border transition-all ${
        isLowTime
          ? 'bg-red-950/60 border-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse'
          : isMidTime
          ? 'bg-amber-950/40 border-amber-500/60'
          : 'bg-slate-900/80 border-slate-800'
      }`}
    >
      <div className="flex items-center gap-2">
        <Clock
          className={`w-4 h-4 ${
            isLowTime ? 'text-red-400' : isMidTime ? 'text-amber-400' : 'text-blue-400'
          }`}
        />
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isAllyTurn ? 'bg-blue-400 shadow-[0_0_8px_#38bdf8]' : 'bg-red-400 shadow-[0_0_8px_#f87171]'
              }`}
            />
            {activeTurnDescription}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`text-lg font-black font-mono tracking-wider tabular-nums ${
            isLowTime ? 'text-red-400 font-extrabold' : isMidTime ? 'text-amber-300' : 'text-slate-100'
          }`}
        >
          {timeLeft}s
        </span>

        <button
          onClick={() => setIsRunning(!isRunning)}
          className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
          title={isRunning ? 'Pausar' : 'Reanudar'}
        >
          {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={handleReset}
          className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
          title="Reiniciar 20s"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
