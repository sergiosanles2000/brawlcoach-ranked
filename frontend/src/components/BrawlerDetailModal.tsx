import React, { useState } from 'react';
import { X, Zap, Sparkles } from 'lucide-react';
import type { Brawler } from '../types/brawl';

interface BrawlerDetailModalProps {
  brawler: Brawler | null;
  onClose: () => void;
}

/**
 * Large animated model in the TOP-RIGHT corner of the popup.
 * Shows the full-body Fan Kit render with the idle floating animation.
 *
 * Fallback chain (so nothing ever looks blank):
 *   1. Full-body model (cdn.brawlify.com/brawlers/model/{id}.png) — animated
 *   2. Large icon (cdn.brawlify.com/brawlers/borderless/{id}.png) — also animated
 *   3. Placeholder box (initials + class) — always shown
 */
const AnimatedCornerModel: React.FC<{
  brawler: Brawler;
}> = ({ brawler }) => {
  // Start at the best available asset so the model renders immediately
  // (there is no separate "load success" event, so we must not wait for one).
  // 'model' → full body | 'icon' → model failed, icon showing | 'none' → both failed
  const [level, setLevel] = useState<'model' | 'icon' | 'none'>(() =>
    brawler.modelUrl ? 'model' : brawler.iconUrl ? 'icon' : 'none'
  );
  const modelUrl = brawler.modelUrl;
  const iconUrl = brawler.iconUrl;

  const handleModelError = () => {
    // Try the icon as fallback
    if (iconUrl) {
      setLevel('icon');
    } else {
      setLevel('none');
    }
  };

  const handleIconError = () => {
    setLevel('none');
  };

  return (
    <div
      className="pointer-events-auto absolute top-0 right-0 z-30 w-32 h-20 flex flex-col items-center justify-end pb-1"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Glow behind */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 aspect-square rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, rgba(255,200,80,0.4), rgba(255,176,32,0.12) 55%, transparent 72%)',
        }}
      />
      {/* Ground breath */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2/3 h-2.5 rounded-full bg-cyan-400/25 blur-sm pointer-events-none" />

      {/* The model area (one of: full-body / icon / placeholder) */}
      <div className="relative flex-1 min-h-0 w-full flex items-end justify-center">
        {level === 'model' && modelUrl && (
          <img
            src={modelUrl}
            alt={brawler.displayName}
            className="brawler-hover-sm w-auto h-16 max-w-[80%] object-contain select-none drop-shadow-[0_14px_14px_rgba(0,0,0,0.65)]"
            loading="eager"
            decoding="async"
            draggable={false}
            onError={handleModelError}
          />
        )}

        {/* Icon fallback (large, also animated) */}
        {level === 'icon' && iconUrl && (
          <img
            src={iconUrl}
            alt={brawler.displayName}
            className="brawler-hover-sm w-16 h-16 rounded-2xl object-contain select-none mb-1 drop-shadow-[0_12px_12px_rgba(0,0,0,0.65)]"
            draggable={false}
            onError={handleIconError}
          />
        )}

        {/* Placeholder: initials + class (always works) */}
        {level === 'none' && (
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 border-2 border-amber-500/40 flex flex-col items-center justify-center gap-0.5">
            <span
              className="text-3xl font-black"
              style={{
                color: '#ffd75e',
                textShadow: '0 2px 0 #6b4a00, 0 0 14px rgba(255,200,80,0.5)',
              }}
            >
              {brawler.displayName.charAt(0).toUpperCase()}
            </span>
            <span className="text-[9px] text-slate-300 font-bold uppercase tracking-wider">
              {brawler.class}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const BrawlerDetailModal: React.FC<BrawlerDetailModalProps> = ({ brawler, onClose }) => {
  if (!brawler) return null;

  const hasModel = Boolean(brawler.modelUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ═══════════════════════════════════════════════════════
            Big animated model in the TOP-RIGHT corner of the popup.
            It's a full-body render (Fan Kit) with the idle floating
            animation (levitation + rotation) of the Brawl Stars menu.
            ═══════════════════════════════════════════════════════ */}
        {(hasModel || brawler.iconUrl) && <AnimatedCornerModel brawler={brawler} />}

        {/* Scrollable content. The card itself clips with `overflow-hidden`
            (which respects the rounded corners), so the corner model above
            stays pinned and can never spill out of the popup. */}
        <div className="flex flex-col gap-3 p-4 overflow-y-auto scrollbar-thin min-h-0">

        {/* Header: icon (left), name, class, rarity, close (right).
            We add padding-right so the right-side animated model never
            overlaps the text. */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800 pr-40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border-2 border-slate-700 shadow-md shrink-0">
              <img src={brawler.iconUrl} alt={brawler.displayName} className="w-full h-full object-cover" />
              {brawler.hasHypercharge && (
                <div className="absolute top-0 right-0 w-3 h-3 bg-fuchsia-500 rounded-bl-md shadow-[0_0_8px_#d946ef]" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-base font-black text-white truncate">{brawler.displayName}</h2>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
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
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0 z-40"
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
            <span>Habilidades Estelares</span>
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
            <span>Gadgets</span>
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
    </div>
  );
};
