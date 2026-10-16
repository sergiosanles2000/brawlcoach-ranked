import React from 'react';
import { Shield, Sword, Ban, Plus, X } from 'lucide-react';
import type { Brawler } from '../types/brawl';

export type ActiveSlotType =
  | { team: 'ally'; type: 'pick'; index: number }
  | { team: 'enemy'; type: 'pick'; index: number }
  | { team: 'ally'; type: 'ban'; index: number }
  | { team: 'enemy'; type: 'ban'; index: number }
  | null;

interface DraftSlotsProps {
  allyPicks: (string | null)[];
  enemyPicks: (string | null)[];
  allyBans: (string | null)[];
  enemyBans: (string | null)[];
  allBrawlers: Brawler[];
  activeSlot: ActiveSlotType;
  onSelectSlot: (slot: ActiveSlotType) => void;
  onClearSlot: (team: 'ally' | 'enemy', type: 'pick' | 'ban', index: number) => void;
}

export const DraftSlots: React.FC<DraftSlotsProps> = ({
  allyPicks,
  enemyPicks,
  allyBans,
  enemyBans,
  allBrawlers,
  activeSlot,
  onSelectSlot,
  onClearSlot,
}) => {
  // Helper to find brawler details
  const getBrawler = (name: string | null) => {
    if (!name) return null;
    return allBrawlers.find((b) => b.displayName.toLowerCase() === name.toLowerCase()) || null;
  };

  const isSlotActive = (team: 'ally' | 'enemy', type: 'pick' | 'ban', index: number) => {
    return (
      activeSlot?.team === team &&
      activeSlot?.type === type &&
      activeSlot?.index === index
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* 2-Column Split: Allies (Left) vs Rivals (Right) */}
      <div className="grid grid-cols-2 gap-2">
        {/* ALLY TEAM (BLUE) */}
        <div className="flex flex-col gap-1.5 p-2 rounded-2xl bg-gradient-to-b from-blue-950/40 to-slate-900/60 border border-blue-900/50 shadow-[0_4px_20px_rgba(30,58,138,0.15)]">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-blue-400 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              Equipo Aliado
            </span>
            <span className="text-[10px] text-blue-300/70 font-semibold">Picks</span>
          </div>

          <div className="flex flex-col gap-1.5">
            {allyPicks.map((pickName, idx) => {
              const brawler = getBrawler(pickName);
              const active = isSlotActive('ally', 'pick', idx);

              return (
                <div
                  key={`ally-pick-${idx}`}
                  onClick={() => onSelectSlot({ team: 'ally', type: 'pick', index: idx })}
                  className={`relative flex items-center justify-between p-1.5 rounded-xl border transition-all cursor-pointer select-none ${
                    active
                      ? 'border-blue-400 bg-blue-900/40 shadow-[0_0_12px_rgba(59,130,246,0.5)] ring-1 ring-blue-400'
                      : brawler
                      ? 'border-blue-900/80 bg-slate-900/90 hover:border-blue-700'
                      : 'border-dashed border-slate-700/80 bg-slate-950/40 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    {brawler ? (
                      <div className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-slate-800 border border-blue-500/40">
                        <img
                          src={brawler.iconUrl}
                          alt={brawler.displayName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {brawler.hasHypercharge && (
                          <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-fuchsia-500 rounded-bl-sm shadow-[0_0_6px_#d946ef]" />
                        )}
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-lg border border-slate-700 bg-slate-900/60 flex items-center justify-center shrink-0 text-slate-500">
                        <Plus className="w-4 h-4" />
                      </div>
                    )}

                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold text-blue-300 uppercase">
                        Pick {idx + 1}
                      </span>
                      <span className="text-xs font-black truncate text-slate-100">
                        {brawler ? brawler.displayName : 'Toca para elegir'}
                      </span>
                    </div>
                  </div>

                  {brawler && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onClearSlot('ally', 'pick', idx);
                      }}
                      className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                      title="Quitar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ally Bans Row */}
          <div className="mt-1 pt-1.5 border-t border-slate-800/80">
            <span className="text-[9px] uppercase font-bold text-slate-400 px-1 mb-1 block">
              Baneos Aliados
            </span>
            <div className="grid grid-cols-3 gap-1">
              {allyBans.map((banName, idx) => {
                const brawler = getBrawler(banName);
                const active = isSlotActive('ally', 'ban', idx);

                return (
                  <div
                    key={`ally-ban-${idx}`}
                    onClick={() => onSelectSlot({ team: 'ally', type: 'ban', index: idx })}
                    className={`relative h-9 rounded-lg border flex items-center justify-center cursor-pointer transition-all ${
                      active
                        ? 'border-red-400 bg-red-950/50 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                        : brawler
                        ? 'border-slate-700 bg-slate-900'
                        : 'border-dashed border-slate-800 bg-slate-950/40 text-slate-600'
                    }`}
                  >
                    {brawler ? (
                      <div className="relative w-full h-full rounded-lg overflow-hidden">
                        <img
                          src={brawler.iconUrl}
                          alt={brawler.displayName}
                          className="w-full h-full object-cover opacity-60 grayscale"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <Ban className="w-4 h-4 text-red-500 font-bold" />
                        </div>
                      </div>
                    ) : (
                      <Ban className="w-3.5 h-3.5 text-slate-600" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ENEMY TEAM (RED) */}
        <div className="flex flex-col gap-1.5 p-2 rounded-2xl bg-gradient-to-b from-red-950/40 to-slate-900/60 border border-red-900/50 shadow-[0_4px_20px_rgba(153,27,27,0.15)]">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-red-400 flex items-center gap-1">
              <Sword className="w-3.5 h-3.5 text-red-400" />
              Equipo Rival
            </span>
            <span className="text-[10px] text-red-300/70 font-semibold">Picks</span>
          </div>

          <div className="flex flex-col gap-1.5">
            {enemyPicks.map((pickName, idx) => {
              const brawler = getBrawler(pickName);
              const active = isSlotActive('enemy', 'pick', idx);

              return (
                <div
                  key={`enemy-pick-${idx}`}
                  onClick={() => onSelectSlot({ team: 'enemy', type: 'pick', index: idx })}
                  className={`relative flex items-center justify-between p-1.5 rounded-xl border transition-all cursor-pointer select-none ${
                    active
                      ? 'border-red-400 bg-red-900/40 shadow-[0_0_12px_rgba(239,68,68,0.5)] ring-1 ring-red-400'
                      : brawler
                      ? 'border-red-900/80 bg-slate-900/90 hover:border-red-700'
                      : 'border-dashed border-slate-700/80 bg-slate-950/40 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    {brawler ? (
                      <div className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-slate-800 border border-red-500/40">
                        <img
                          src={brawler.iconUrl}
                          alt={brawler.displayName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {brawler.hasHypercharge && (
                          <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-fuchsia-500 rounded-bl-sm shadow-[0_0_6px_#d946ef]" />
                        )}
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-lg border border-slate-700 bg-slate-900/60 flex items-center justify-center shrink-0 text-slate-500">
                        <Plus className="w-4 h-4" />
                      </div>
                    )}

                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold text-red-300 uppercase">
                        Rival {idx + 1}
                      </span>
                      <span className="text-xs font-black truncate text-slate-100">
                        {brawler ? brawler.displayName : 'Toca para elegir'}
                      </span>
                    </div>
                  </div>

                  {brawler && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onClearSlot('enemy', 'pick', idx);
                      }}
                      className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                      title="Quitar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Enemy Bans Row */}
          <div className="mt-1 pt-1.5 border-t border-slate-800/80">
            <span className="text-[9px] uppercase font-bold text-slate-400 px-1 mb-1 block">
              Baneos Rivales
            </span>
            <div className="grid grid-cols-3 gap-1">
              {enemyBans.map((banName, idx) => {
                const brawler = getBrawler(banName);
                const active = isSlotActive('enemy', 'ban', idx);

                return (
                  <div
                    key={`enemy-ban-${idx}`}
                    onClick={() => onSelectSlot({ team: 'enemy', type: 'ban', index: idx })}
                    className={`relative h-9 rounded-lg border flex items-center justify-center cursor-pointer transition-all ${
                      active
                        ? 'border-red-400 bg-red-950/50 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                        : brawler
                        ? 'border-slate-700 bg-slate-900'
                        : 'border-dashed border-slate-800 bg-slate-950/40 text-slate-600'
                    }`}
                  >
                    {brawler ? (
                      <div className="relative w-full h-full rounded-lg overflow-hidden">
                        <img
                          src={brawler.iconUrl}
                          alt={brawler.displayName}
                          className="w-full h-full object-cover opacity-60 grayscale"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <Ban className="w-4 h-4 text-red-500 font-bold" />
                        </div>
                      </div>
                    ) : (
                      <Ban className="w-3.5 h-3.5 text-slate-600" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
