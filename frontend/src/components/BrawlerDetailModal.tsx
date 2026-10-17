import React from 'react';
import { X, Zap, Sparkles } from 'lucide-react';
import type { Brawler } from '../types/brawl';

interface BrawlerDetailModalProps {
  brawler: Brawler | null;
  onClose: () => void;
}

export const BrawlerDetailModal: React.FC<BrawlerDetailModalProps> = ({ brawler, onClose }) => {
  if (!brawler) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl p-4 shadow-2xl flex flex-col gap-3 max-h-[90vh] overflow-y-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Avatar, Name, Class & Close */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="relative w-14 h-14 rounded-2xl overflow-hidden bg-slate-800 border-2 border-slate-700 shadow-md shrink-0">
              <img src={brawler.iconUrl} alt={brawler.displayName} className="w-full h-full object-cover" />
              {brawler.hasHypercharge && (
                <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-fuchsia-500 rounded-bl-md shadow-[0_0_8px_#d946ef]" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-base font-black text-white">{brawler.displayName}</h2>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  {brawler.class}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                <span>Rango: {brawler.attackRange}</span>
                <span>•</span>
                <span className="text-amber-400 font-semibold">{brawler.rarity}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Brawler Description */}
        {brawler.description && (
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 leading-relaxed">
            {brawler.description}
          </div>
        )}

        {/* Star Powers Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Habilidades Estelares (Star Powers)</span>
          </div>

          {brawler.starPowers && brawler.starPowers.length > 0 ? (
            <div className="space-y-1.5">
              {brawler.starPowers.map((sp) => (
                <div key={sp.id} className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-600/30 flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 bg-slate-800 border border-amber-500/40 p-0.5 flex items-center justify-center">
                    {sp.imageUrl ? (
                      <img src={sp.imageUrl} alt={sp.name} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-xs">⭐</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-amber-300 leading-tight">{sp.name}</div>
                    <div className="text-[10.5px] text-slate-300 leading-snug mt-0.5">
                      {sp.description || 'Mejora pasiva permanente para este brawler.'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 italic p-2 bg-slate-950/40 rounded-xl">
              Sin Star Powers registradas
            </div>
          )}
        </div>

        {/* Gadgets Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Gadgets (Accesorios)</span>
          </div>

          {brawler.gadgets && brawler.gadgets.length > 0 ? (
            <div className="space-y-1.5">
              {brawler.gadgets.map((gadget) => (
                <div key={gadget.id} className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-600/30 flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 bg-slate-800 border border-emerald-500/40 p-0.5 flex items-center justify-center">
                    {gadget.imageUrl ? (
                      <img src={gadget.imageUrl} alt={gadget.name} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-xs">🟢</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-emerald-300 leading-tight">{gadget.name}</div>
                    <div className="text-[10.5px] text-slate-300 leading-snug mt-0.5">
                      {gadget.description || 'Habilidad activa recargable durante la partida.'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 italic p-2 bg-slate-950/40 rounded-xl">
              Sin Gadgets registrados
            </div>
          )}
        </div>

        {/* Close Button at Bottom */}
        <button
          onClick={onClose}
          className="mt-1 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors cursor-pointer"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};
