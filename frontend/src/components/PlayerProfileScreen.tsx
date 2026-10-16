import { useState } from 'react';
import { User, Trophy, Zap, Search, CheckCircle2 } from 'lucide-react';
import type { PlayerProfile } from '../types/brawl';

interface PlayerProfileScreenProps {
  playerProfile: PlayerProfile | null;
  isLoadingPlayer: boolean;
  playerError: string | null;
  onSyncPlayer: (tag: string) => void;
  onlyRankedReady: boolean;
  onToggleOnlyRankedReady: () => void;
}

export function PlayerProfileScreen({
  playerProfile,
  isLoadingPlayer,
  playerError,
  onSyncPlayer,
  onlyRankedReady,
  onToggleOnlyRankedReady,
}: PlayerProfileScreenProps) {
  const [tagInput, setTagInput] = useState(() => {
    return localStorage.getItem('brawl_player_tag') || 'GGJ2QLJY';
  });
  const [filterQuery, setFilterQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (tagInput.trim()) {
      onSyncPlayer(tagInput.trim());
    }
  };

  const brawlers = playerProfile?.brawlers || [];
  const readyBrawlers = brawlers.filter((b) => b.power >= 9);
  const displayedBrawlers = brawlers
    .filter((b) => (onlyRankedReady ? b.power >= 9 : true))
    .filter((b) => b.name.toLowerCase().includes(filterQuery.toLowerCase()));

  return (
    <div className="w-full max-w-lg mx-auto px-3 py-3 space-y-4">
      {/* Gamertag Input Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <User className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Mi Gamertag & Perfil de Brawl Stars</h2>
            <p className="text-[11px] text-slate-400">Vincula tu cuenta para adaptar las recomendaciones del bot a tu inventario</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-2.5 text-xs font-mono font-bold text-slate-500">#</span>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value.toUpperCase())}
              placeholder="GGJ2QLJY"
              className="w-full pl-7 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-400 uppercase tracking-wider"
            />
          </div>
          <button
            type="submit"
            disabled={isLoadingPlayer}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            {isLoadingPlayer ? (
              <span className="animate-spin text-xs">⏳</span>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                <span>Vincular</span>
              </>
            )}
          </button>
        </form>

        {playerError && (
          <div className="mt-2.5 text-[11px] text-red-400 bg-red-950/40 p-2.5 rounded-xl border border-red-800/40">
            {playerError}
          </div>
        )}
      </div>

      {/* Player Stats Card */}
      {playerProfile && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          {/* Header Banner */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-sm">
                🏆
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-black text-white">{playerProfile.name}</h3>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  {playerProfile.tag} • Nivel {playerProfile.expLevel || 100}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm font-black text-amber-400 flex items-center justify-end gap-1">
                <Trophy className="w-3.5 h-3.5" />
                <span>{playerProfile.trophies?.toLocaleString()}</span>
              </div>
              <div className="text-[10px] text-slate-500">
                Máx: {playerProfile.highestTrophies?.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5">
              <div className="text-[10px] font-semibold text-slate-400">Brawlers Listos (P9+)</div>
              <div className="text-base font-black text-emerald-400 mt-0.5">
                {readyBrawlers.length} <span className="text-xs text-slate-500 font-normal">/ {brawlers.length}</span>
              </div>
            </div>
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5">
              <div className="text-[10px] font-semibold text-slate-400">Filtro en Recomendador</div>
              <button
                onClick={onToggleOnlyRankedReady}
                className={`mt-1 text-xs font-bold px-2 py-1 rounded-lg border flex items-center gap-1 cursor-pointer transition-all ${
                  onlyRankedReady
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>{onlyRankedReady ? 'Activo (Solo P9+)' : 'Inactivo (Todos)'}</span>
              </button>
            </div>
          </div>

          {/* Brawler Inventory List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-300">
                Inventario de Brawlers ({displayedBrawlers.length})
              </h4>
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Buscar brawler..."
                className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-200 focus:outline-none focus:border-blue-400 w-32"
              />
            </div>

            <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
              {displayedBrawlers.map((b) => (
                <div
                  key={b.id || b.name}
                  className="flex items-center justify-between px-3 py-2 bg-slate-950/60 border border-slate-800/60 rounded-xl hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center font-black text-[11px] text-slate-300">
                      {b.name.slice(0, 2)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white leading-none">{b.name}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        🏆 {b.trophies} • Rango {b.rank}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        b.power >= 11
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : b.power >= 9
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      Nv. {b.power}
                    </span>
                    {b.power >= 9 && <span className="text-[10px] text-emerald-400 font-bold">✓ P9+</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
