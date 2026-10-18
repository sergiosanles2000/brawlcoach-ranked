import React from 'react';
import {
  Trophy,
  Flame,
  ShieldAlert,
  Camera,
  AlertTriangle,
  Info,
} from 'lucide-react';
import type { BrawlPickAnalysisResult } from '../services/brawlpickService';

interface RecommendationsProps {
  brawlPickStats: BrawlPickAnalysisResult;
  onRescan: () => void;
  onQuickPick?: (brawlerName: string) => void;
  onQuickBan?: (brawlerName: string) => void;
  onApplyOptimalTeam?: (teamBrawlers: string[]) => void;
  onInspectBrawler?: (brawler: import('../types/brawl').Brawler) => void;
  isAnalyzing?: boolean;
}

export const Recommendations: React.FC<RecommendationsProps> = ({
  brawlPickStats,
  onRescan,
  onQuickPick,
  onQuickBan,
  onApplyOptimalTeam,
  onInspectBrawler,
  isAnalyzing = false,
}) => {
  const longPressTimerRef = React.useRef<any>(null);
  const isLongPressTriggeredRef = React.useRef(false);

  const handlePointerDown = (brawler?: import('../types/brawl').Brawler) => {
    if (!brawler || !onInspectBrawler) return;
    isLongPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      onInspectBrawler(brawler);
    }, 450);
  };

  const handlePointerUpOrLeave = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const {
    status,
    matchedMapName,
    matchedMode,
    topPicks,
    suggestedBans,
    isRanked,
    totalBattles,
    updatedAt,
    optimalTeam,
  } = brawlPickStats;

  // Mode badge styling
  const getModeColor = (mode: string) => {
    const m = mode.toLowerCase();
    if (m.includes('gem')) return 'from-purple-600 to-indigo-600 text-purple-200 border-purple-500/30';
    if (m.includes('ball') || m.includes('balón')) return 'from-blue-600 to-cyan-600 text-blue-200 border-blue-500/30';
    if (m.includes('heist') || m.includes('atraco')) return 'from-amber-600 to-red-600 text-amber-200 border-amber-500/30';
    if (m.includes('hot') || m.includes('zona')) return 'from-red-600 to-rose-600 text-red-200 border-rose-500/30';
    if (m.includes('knock') || m.includes('noqueo')) return 'from-orange-600 to-amber-600 text-orange-200 border-orange-500/30';
    if (m.includes('bounty') || m.includes('caza')) return 'from-cyan-600 to-teal-600 text-cyan-200 border-cyan-500/30';
    return 'from-slate-700 to-slate-800 text-slate-300 border-slate-600/30';
  };

  return (
    <div className="flex flex-col gap-3">
      {/* ========================================================= */}
      {/* A. TARJETA PRINCIPAL DEL MAPA (DASHBOARD RANKED)          */}
      {/* ========================================================= */}
      <div className="relative rounded-2xl bg-slate-900 border border-slate-800 p-4 shadow-sm flex flex-col gap-3">

        {/* Top bar: Mode Badge, Ranked Pill & Rescan Button */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-gradient-to-r border shadow-sm ${getModeColor(
                matchedMode
              )}`}
            >
              {matchedMode}
            </span>
            {isRanked ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 shadow-sm">
                <Trophy className="w-3 h-3 text-amber-400" />
                Rotación Ranked
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                Trofeos / Casual
              </span>
            )}
          </div>

          <button
            onClick={onRescan}
            disabled={isAnalyzing}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Tomar nueva captura y analizar"
          >
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>{isAnalyzing ? 'Escaneando...' : 'Escanear'}</span>
          </button>
        </div>

        {/* Map Name & Sample Size */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black text-slate-100 tracking-tight leading-tight">
              {matchedMapName}
            </h1>
            {brawlPickStats.englishName &&
              brawlPickStats.englishName.toLowerCase().trim() !== matchedMapName.toLowerCase().trim() && (
                <span className="text-xs text-slate-400 font-medium">
                  ({brawlPickStats.englishName})
                </span>
              )}
            <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
              BrawlPick
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
            {totalBattles > 0 ? (
              <span className="font-medium flex items-center gap-1">
                <span className="text-slate-200 font-bold font-mono">
                  {totalBattles.toLocaleString()}
                </span>{' '}
                partidas competitivas analizadas
              </span>
            ) : (
              <span className="text-slate-500 italic">Sin partidas suficientes</span>
            )}
            <span>•</span>
            <span className="text-[11px] text-slate-500">Actualizado: {updatedAt}</span>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* ESTADO: MAPA DESCONOCIDO O SIN DATOS                      */}
      {/* ========================================================= */}
      {status === 'UNKNOWN_MAP' && (
        <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-800/50 flex flex-col gap-1.5 text-xs text-amber-200">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Mapa no reconocido automáticamente</span>
          </div>
          <p className="text-[11px] text-amber-300/80 leading-relaxed">
            La captura no coincide con suficiente certeza en la rotación oficial de BrawlPick. Elige el mapa en el selector superior para consultar sus estadísticas reales de inmediato.
          </p>
        </div>
      )}

      {status === 'INSUFFICIENT_DATA' && (
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col gap-1.5 text-xs text-slate-300">
          <div className="flex items-center gap-1.5 font-bold text-slate-200">
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
            <span>Muestra insuficiente para {matchedMapName}</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            BrawlPick requiere al menos 150 partidas por brawler para publicar estadísticas fiables en este mapa.
          </p>
        </div>
      )}


      {/* ========================================================= */}
      {/* C. TRÍO IDEAL RECOMENDADO CONTRA COMPOSICIÓN ENEMIGA      */}
      {/* ========================================================= */}
      {optimalTeam && optimalTeam.picks.length === 3 && (
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-md flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🏆</span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                Trío Ideal Recomendado
              </h3>
            </div>
            {onApplyOptimalTeam && (
              <button
                onClick={() => onApplyOptimalTeam(optimalTeam.picks.map((p) => p.brawlerName))}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] active:scale-95 transition-all cursor-pointer"
                title="Rellenar los 3 slots de tu equipo con este trío"
              >
                <span>Aplicar al Equipo</span>
              </button>
            )}
          </div>

          <p className="text-[11px] text-indigo-200/90 leading-snug">
            {optimalTeam.tacticalSummary}
          </p>

          <div className="grid grid-cols-3 gap-2 mt-1">
            {optimalTeam.picks.map((p) => (
              <div
                key={p.brawlerName}
                onClick={() => onQuickPick?.(p.brawlerName)}
                className="p-2 rounded-2xl bg-slate-900/90 border border-indigo-500/30 hover:border-indigo-400 flex flex-col items-center text-center cursor-pointer active:scale-95 transition-all group"
              >
                <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 group-hover:border-indigo-400 transition-colors mb-1.5">
                  {p.brawlerObj?.iconUrl ? (
                    <img src={p.brawlerObj.iconUrl} alt={p.brawlerName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-xs text-slate-300">
                      {p.brawlerName.slice(0, 2)}
                    </div>
                  )}
                </div>
                <span className="font-extrabold text-xs text-slate-100 truncate w-full">
                  {p.brawlerName}
                </span>
                <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-tighter truncate w-full mt-0.5">
                  {p.roleTitle}
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-bold mt-0.5">
                  {p.winRate.toFixed(1)}% WR
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* D. SECCIÓN «MEJORES PICKS» (ESTADÍSTICAS REALES BRAWLPICK) */}
      {/* ========================================================= */}
      {topPicks.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-200">
                Mejores Picks Adaptativos
              </h2>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              BrawlPick + Counters
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {topPicks.map((pick) => {
              const {
                brawlerName,
                winRate,
                games,
                rank,
                reliability,
                brawlerObj,
                draftBadge,
                tacticalReason,
                countersAgainstEnemies,
                counteredByEnemies,
                synergiesWithAllies,
                riskLevel,
              } = pick;
              const isFirst = rank === 1;

              return (
                <div
                  key={brawlerName}
                  onPointerDown={() => handlePointerDown(brawlerObj)}
                  onPointerUp={handlePointerUpOrLeave}
                  onPointerLeave={handlePointerUpOrLeave}
                  onClick={() => {
                    if (isLongPressTriggeredRef.current) return;
                    onQuickPick?.(brawlerName);
                  }}
                  className={`relative flex flex-col p-2.5 rounded-xl border transition-all cursor-pointer active:scale-[0.99] gap-1.5 ${
                    isFirst
                      ? 'bg-slate-900 border-emerald-500/60'
                      : riskLevel === 'HIGH'
                      ? 'bg-slate-900/90 border-rose-900/50 hover:border-rose-700'
                      : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                  }`}
                  title="Toca para seleccionar este brawler en tu equipo"
                >
                  {/* Top row: Avatar, Info & WinRate */}
                  <div className="flex items-center justify-between gap-2">
                    {/* Left: Rank, Avatar & Details */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Rank Badge */}
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                          rank === 1
                            ? 'bg-gradient-to-tr from-amber-400 to-yellow-300 text-slate-950 shadow-sm'
                            : rank === 2
                            ? 'bg-slate-300 text-slate-950 font-bold'
                            : rank === 3
                            ? 'bg-amber-700 text-amber-100 font-bold'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        #{rank}
                      </div>

                      {/* Official Brawler Avatar */}
                      <div className="relative w-11 h-11 rounded-xl overflow-hidden shrink-0 bg-slate-800 border border-slate-700">
                        {brawlerObj?.iconUrl ? (
                          <img
                            src={brawlerObj.iconUrl}
                            alt={brawlerName}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-black text-xs text-slate-400">
                            {brawlerName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Brawler Name & Sample Size */}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-black text-slate-100 truncate">
                            {brawlerName}
                          </span>
                          {brawlerObj?.class && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-slate-800 text-slate-400">
                              {brawlerObj.class}
                            </span>
                          )}
                          {draftBadge && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded-full font-extrabold uppercase border ${
                                riskLevel === 'HIGH'
                                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                  : draftBadge.includes('Last Pick') || draftBadge.includes('Counter')
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              }`}
                            >
                              {draftBadge}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <span className="font-mono text-slate-300 font-bold">
                            {games.toLocaleString()}
                          </span>
                          <span>partidas registradas</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Win Rate & Reliability Indicator */}
                    <div className="flex flex-col items-end shrink-0 gap-0.5">
                      <div className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-1 font-mono font-black text-emerald-400">
                        <span className="text-sm">{winRate.toFixed(1)}%</span>
                        <span className="text-[9px] uppercase font-sans opacity-80">WR</span>
                      </div>

                      {reliability && (
                        <span className="text-[9px] text-slate-400 font-medium text-right">
                          {reliability}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tactical tags row: Counters, Synergies, Warnings */}
                  {(countersAgainstEnemies?.length > 0 ||
                    synergiesWithAllies?.length > 0 ||
                    counteredByEnemies?.length > 0) && (
                    <div className="pt-1.5 border-t border-slate-800/80 flex items-center gap-1.5 flex-wrap text-[10px]">
                      {countersAgainstEnemies?.map((enemy) => (
                        <span
                          key={enemy}
                          className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1"
                        >
                          <span>🎯</span> Counter de {enemy}
                        </span>
                      ))}
                      {counteredByEnemies?.map((enemy) => (
                        <span
                          key={enemy}
                          className="px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-300 font-bold border border-rose-500/30 flex items-center gap-1"
                        >
                          <span>⚠️</span> Débil ante {enemy}
                        </span>
                      ))}
                      {synergiesWithAllies?.map((ally) => (
                        <span
                          key={ally}
                          className="px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-300 font-bold border border-blue-500/30 flex items-center gap-1"
                        >
                          <span>🤝</span> Sinergia con {ally}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Always-visible Recommended Build Row (Gadget & StarPower) */}
                  {((brawlerObj?.gadgets && brawlerObj.gadgets.length > 0) ||
                    (brawlerObj?.starPowers && brawlerObj.starPowers.length > 0)) && (
                    <div className="pt-1.5 border-t border-slate-800/60 flex items-center gap-1.5 flex-wrap text-[9.5px]">
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <span>⚙️</span> Build:
                      </span>
                      {brawlerObj?.gadgets?.[0] && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-600/40 text-emerald-300 font-medium truncate max-w-[150px]" title={brawlerObj.gadgets[0].name}>
                          🟢 {brawlerObj.gadgets[0].name}
                        </span>
                      )}
                      {brawlerObj?.starPowers?.[0] && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-600/40 text-amber-300 font-medium truncate max-w-[150px]" title={brawlerObj.starPowers[0].name}>
                          ⭐ {brawlerObj.starPowers[0].name}
                        </span>
                      )}
                    </div>
                  )}

                  {tacticalReason && (
                    <p className="text-[10px] text-slate-400 italic leading-tight pt-0.5">
                      {tacticalReason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* C. SECCIÓN «BANEOS RECOMENDADOS» (SEPARADA Y CLARA)       */}
      {/* ========================================================= */}
      {suggestedBans.length > 0 && (
        <div className="flex flex-col gap-2 p-3.5 rounded-3xl bg-slate-900/90 border border-rose-900/50 shadow-[0_0_20px_rgba(244,63,94,0.1)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Baneos Recomendados
            </span>
            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Baneo sugerido (Heurístico)
            </span>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed">
            Sugerencias calculadas a partir de las tasas de victoria dominantes del mapa y amenazas de counter. No representan un porcentaje oficial de baneo.
          </p>

          <div className="flex flex-col gap-2 mt-1">
            {suggestedBans.map((ban) => (
              <div
                key={ban.brawlerName}
                onClick={() => onQuickBan?.(ban.brawlerName)}
                className="p-2.5 rounded-2xl bg-slate-950/70 border border-rose-900/40 flex items-start justify-between gap-2.5 text-xs cursor-pointer hover:border-rose-500/50 hover:scale-[1.01] active:scale-[0.99] transition-all"
                title="Toca para banear este brawler"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-rose-950/60 border border-rose-500/40 flex items-center justify-center font-bold text-rose-300 shrink-0 text-sm">
                    🚫
                  </div>

                  <div className="flex flex-col min-w-0">
                    <span className="font-extrabold text-slate-100 text-xs">
                      {ban.brawlerName}
                    </span>
                    <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                      {ban.reason}
                    </p>
                  </div>
                </div>

                {ban.winRate && (
                  <span className="font-mono text-[11px] font-bold text-rose-400 shrink-0">
                    {ban.winRate}% WR
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
