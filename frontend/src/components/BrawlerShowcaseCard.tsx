import React from 'react';
import type { Brawler } from '../types/brawl';

interface BrawlerShowcaseCardProps {
  /** Brawler to showcase (only the model + name) */
  brawler: Brawler;
  /** Callback when the user taps the card (opens full detail) */
  onSelect: (brawler: Brawler) => void;
  /** Optional: compact size (for dense grid) vs featured (large) */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Tarjeta con el modelo 2D "cuerpo completo" de un brawler
 * animado con el idle flotante del menú de Brawl Stars
 * (levitación + balanceo + glow dorado + sombra).
 */
export const BrawlerShowcaseCard: React.FC<BrawlerShowcaseCardProps> = ({
  brawler,
  onSelect,
  size = 'lg',
}) => {
  const modelUrl = brawler.modelUrl || '';
  const iconFallback = brawler.iconUrl;

  const sizeClasses =
    size === 'sm'
      ? 'w-72 min-h-28 p-2'
      : size === 'md'
      ? 'w-96 min-h-36 p-3'
      : 'w-full min-h-48 p-4';

  return (
    <button
      onClick={() => onSelect(brawler)}
      className={`relative block mx-auto rounded-3xl border border-amber-500/20 bg-gradient-to-b from-slate-900 to-slate-950/80 overflow-hidden cursor-pointer hover:border-amber-400/60 hover:shadow-[0_0_28px_rgba(255,176,32,0.18)] transition-all active:scale-[0.99] ${sizeClasses}`}
    >
      {/* Glow amarillo detrás del personaje */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 aspect-square rounded-full"
        style={{
          background: 'radial-gradient(circle at 50% 45%, rgba(255,200,80,0.35), rgba(255,176,32,0.10) 55%, transparent 70%)',
        }}
      />

      {/* Plataforma / suelo que respira */}
      <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none">
        <div className="w-2/3 h-5 rounded-full bg-cyan-400/15 blur-sm animate-pulse" />
      </div>

      {/* Modelo con idle flotante */}
      <div className="relative h-full flex items-center justify-center py-2">
        <div className="brawler-hover">
          {modelUrl ? (
            <img
              src={modelUrl}
              alt={brawler.displayName}
              className="w-auto h-full max-w-[70%] object-contain select-none pointer-events-none drop-shadow-[0_12px_12px_rgba(0,0,0,0.55)]"
              loading="lazy"
              crossOrigin="anonymous"
            />
          ) : (
            <img
              src={iconFallback}
              alt={brawler.displayName}
              className="w-24 h-24 object-contain select-none pointer-events-none drop-shadow-[0_12px_12px_rgba(0,0,0,0.55)]"
              loading="lazy"
            />
          )}
        </div>
      </div>

      {/* Nombre en la parte inferior */}
      <div className="absolute bottom-2 inset-x-0 text-center pointer-events-none">
        <span
          className="text-xs sm:text-sm font-black uppercase tracking-wider"
          style={{
            color: '#ffd75e',
            textShadow: '0 2px 0 #6b4a00, 0 0 14px rgba(255,200,80,0.45)',
          }}
        >
          {brawler.displayName}
        </span>
      </div>
    </button>
  );
};
