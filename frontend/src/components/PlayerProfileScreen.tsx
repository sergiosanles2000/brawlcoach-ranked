import { useState } from 'react';
import { User, Trophy, Zap, Search, CheckCircle2, Heart, Play } from 'lucide-react';
import type { PlayerProfile } from '../types/brawl';
import { showRewardedAdSupport } from '../services/adService';

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
  const [isWatchingAd, setIsWatchingAd] = useState(false);

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

          {/* Battle Log & History Analysis */}
          {playerProfile.battles && playerProfile.battles.length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <span>⚔️</span>
                  <span>Últimas Partidas ({playerProfile.battles.length})</span>
                </h4>
                <span className="text-[10px] text-slate-400 font-mono">
                  Historial en vivo
                </span>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                {playerProfile.battles.slice(0, 10).map((bt, idx) => {
                  const isVictory = bt.victory || bt.result === 'Victory';
                  const mode = bt.event?.mode || 'Partida';
                  const mapName = bt.event?.map || 'Modo Competitivo';

                  // Find user brawler in battle
                  let myBrawler = 'Brawler';
                  if (bt.teams) {
                    for (const team of bt.teams) {
                      const me = team.find((p) => p.tag?.replace('#', '') === playerProfile.tag.replace('#', ''));
                      if (me) {
                        myBrawler = me.brawler;
                        break;
                      }
                    }
                  }

                  return (
                    <div
                      key={idx}
                      className={`p-2 rounded-xl border flex items-center justify-between text-xs ${
                        isVictory
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                          : 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9.5px] font-black px-1.5 py-0.5 rounded uppercase ${
                            isVictory ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {isVictory ? 'VICTORIA' : 'DERROTA'}
                        </span>
                        <div>
                          <div className="font-bold text-slate-200 text-[11px] capitalize">
                            {myBrawler} • <span className="text-slate-400">{mapName}</span>
                          </div>
                          <div className="text-[9.5px] text-slate-500 capitalize">{mode}</div>
                        </div>
                      </div>
                      <span className="text-[9px] font-mono text-slate-500">
                        {new Date(bt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Brawler Inventory List */}
          <div className="pt-2 border-t border-slate-800">
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

          {/* Support Creator Voluntary Rewarded Ad Section */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <div className="p-3 bg-gradient-to-r from-purple-950/40 to-indigo-950/40 rounded-xl border border-purple-500/30 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                  Apoyar al Creador de la App
                </span>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold">
                  100% Voluntario
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400 leading-tight">
                Esta app es gratuita y sin anuncios molestos. Si te resulta útil para tus partidas de Ranked, puedes apoyarme viendo un breve anuncio de 15 segundos.
              </p>
              <button
                type="button"
                onClick={async () => {
                  setIsWatchingAd(true);
                  const res = await showRewardedAdSupport();
                  alert(res.message);
                  setIsWatchingAd(false);
                }}
                disabled={isWatchingAd}
                className="w-full py-2 px-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-purple-950/50"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>{isWatchingAd ? 'Cargando video...' : 'Ver un anuncio de apoyo'}</span>
              </button>
            </div>

            {/* Official Supercell Fan Content Policy Notice (Required for Google Play Store) */}
            <p className="text-[9.5px] text-slate-500 text-center leading-relaxed px-1">
              Este contenido no está afiliado, respaldado, patrocinado ni aprobado específicamente por Supercell y Supercell no es responsable de ello. Para más información, consulta la <a href="https://supercell.com/en/fan-content-policy/es/" target="_blank" rel="noreferrer" className="text-slate-400 underline hover:text-slate-200">Política de contenido de fans de Supercell</a>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
