import React, { useState } from 'react';
import {
  TrendingUp,
  MapPin,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Shield,
  Sword,
} from 'lucide-react';
import type { GameMap, CountersMap } from '../types/brawl';
import { calculateDraftAnalysis, type LaneAssignment } from '../services/draftEngine';

interface LiveWinrateAndLanesProps {
  map: GameMap;
  allyPicks: (string | null)[];
  enemyPicks: (string | null)[];
  countersData: CountersMap;
}

export const LiveWinrateAndLanes: React.FC<LiveWinrateAndLanesProps> = ({
  map,
  allyPicks,
  enemyPicks,
  countersData,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const cleanAllies = allyPicks.filter(Boolean) as string[];
  const cleanEnemies = enemyPicks.filter(Boolean) as string[];
  const totalPicks = cleanAllies.length + cleanEnemies.length;

  if (totalPicks === 0) return null;

  const analysis = calculateDraftAnalysis({
    allBrawlers: [],
    map,
    allyPicks: cleanAllies,
    enemyPicks: cleanEnemies,
    bannedBrawlers: [],
    countersData,
  });

  const pred = analysis.matchPrediction;
  if (!pred) return null;

  const { allyWinRate, enemyWinRate, advantageTeam, verdict, laneAssignments, tacticalTips } = pred;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-md space-y-2.5">
      {/* 1. Header: Live Winrate Gauge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-100">
            Probabilidad de Victoria del Draft
          </h3>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            advantageTeam === 'ally'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : advantageTeam === 'enemy'
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}
        >
          {advantageTeam === 'ally' ? 'Ventaja Aliada' : advantageTeam === 'enemy' ? 'Ventaja Rival' : 'Matchup Parejo'}
        </span>
      </div>

      {/* Progress Bar (Blue Allies vs Red Rivals) */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs font-mono font-black">
          <span className="text-blue-400 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5" /> {allyWinRate}% Aliados
          </span>
          <span className="text-rose-400 flex items-center gap-1">
            {enemyWinRate}% Rivales <Sword className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="w-full h-2.5 bg-rose-950/70 rounded-full overflow-hidden flex border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-500 rounded-l-full"
            style={{ width: `${allyWinRate}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-rose-500 to-red-600 transition-all duration-500 rounded-r-full flex-1"
          />
        </div>
      </div>

      {/* Verdict Callout */}
      <p className="text-[11px] text-slate-300 leading-snug bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
        {verdict}
      </p>

      {/* 2. Lane Assignments & Tactical Positioning Toggle */}
      {laneAssignments && laneAssignments.length > 0 && (
        <div className="pt-1 border-t border-slate-800/60">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between py-1 text-xs font-bold text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span>Distribución de Líneas & Spawn ({map.name})</span>
            </div>
            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {isExpanded && (
            <div className="mt-2 space-y-1.5 animate-fade-in">
              {laneAssignments.map((lane: LaneAssignment, idx: number) => (
                <div
                  key={idx}
                  className={`p-2 rounded-xl border flex flex-col gap-1 text-[11px] ${
                    lane.advantage === 'ally'
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : lane.advantage === 'enemy'
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-amber-400 uppercase tracking-wider text-[10px] flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Carril {lane.lane}
                    </span>
                    <span className="font-mono text-[10px] font-bold text-slate-300">
                      {lane.ally} <span className="text-slate-500">vs</span> {lane.enemy}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-slate-300 leading-tight">
                    {lane.tip}
                  </p>
                </div>
              ))}

              {/* Mode Specific Tip */}
              {tacticalTips && tacticalTips.length > 0 && (
                <div className="p-2 bg-blue-950/20 border border-blue-500/20 rounded-xl text-[10px] text-blue-200 space-y-0.5">
                  <div className="font-bold flex items-center gap-1 text-blue-400">
                    <CheckCircle2 className="w-3 h-3" /> Regla Clave del Modo:
                  </div>
                  <div>{tacticalTips[0]}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
