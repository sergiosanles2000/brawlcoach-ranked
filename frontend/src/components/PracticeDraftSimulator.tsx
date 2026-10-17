import React, { useState } from 'react';
import {
  Gamepad2,
  RotateCcw,
  Shield,
  Sword,
} from 'lucide-react';
import type { GameMap, Brawler, CountersMap } from '../types/brawl';
import { calculateDraftRecommendations } from '../services/draftEngine';

interface PracticeDraftSimulatorProps {
  allMaps: GameMap[];
  allBrawlers: Brawler[];
  countersData: CountersMap;
  onApplyToMainDraft: (map: GameMap, allies: string[], enemies: string[]) => void;
}

export const PracticeDraftSimulator: React.FC<PracticeDraftSimulatorProps> = ({
  allMaps,
  allBrawlers,
  countersData,
  onApplyToMainDraft,
}) => {
  // Practice Map
  const [map, setMap] = useState<GameMap>(() => allMaps[Math.floor(Math.random() * allMaps.length)]);

  // 3 Ally Picks vs 3 AI Enemy Picks
  const [userPicks, setUserPicks] = useState<(string | null)[]>([null, null, null]);
  const [aiPicks, setAiPicks] = useState<(string | null)[]>([null, null, null]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [grade, setGrade] = useState<{ score: string; text: string; color: string } | null>(null);

  const unavailable = new Set<string>([
    ...userPicks.filter(Boolean) as string[],
    ...aiPicks.filter(Boolean) as string[],
  ]);

  // Reset / New Random Practice Match
  const handleReset = () => {
    const randomMap = allMaps[Math.floor(Math.random() * allMaps.length)];
    setMap(randomMap);
    setUserPicks([null, null, null]);
    setAiPicks([null, null, null]);
    setIsCompleted(false);
    setGrade(null);
  };

  // User chooses a brawler for their turn
  const handleUserPick = (brawlerName: string) => {
    if (isCompleted) return;

    // First find next empty ally slot
    const emptyAllyIdx = userPicks.findIndex((p) => p === null);
    if (emptyAllyIdx === -1) return;

    const nextUser = [...userPicks];
    nextUser[emptyAllyIdx] = brawlerName;
    setUserPicks(nextUser);

    // AI counter-picks immediately if any empty slot remains
    const nextAi = [...aiPicks];
    const emptyAiIdx = nextAi.findIndex((p) => p === null);

    if (emptyAiIdx !== -1) {
      // Calculate best counter pick for AI
      const aiRecs = calculateDraftRecommendations({
        allBrawlers,
        map,
        allyPicks: nextUser.filter(Boolean) as string[],
        enemyPicks: nextAi.filter(Boolean) as string[],
        bannedBrawlers: [],
        countersData,
        playerProfile: null,
        onlyRankedReady: false,
      });

      const bestAiPick = aiRecs.find((r) => !unavailable.has(r.brawler.displayName) && r.brawler.displayName !== brawlerName);
      if (bestAiPick) {
        nextAi[emptyAiIdx] = bestAiPick.brawler.displayName;
        setAiPicks(nextAi);
      }
    }

    const currentCount = nextUser.filter(Boolean).length;
    if (currentCount >= 3) {
      // Finish draft and grade
      setIsCompleted(true);
      evaluateDraft(nextUser as string[], nextAi as string[]);
    }
  };

  // Grade the user draft
  const evaluateDraft = (allies: string[], enemies: string[]) => {
    let score = 0;
    // Map tier points
    for (const ally of allies) {
      if (map.tiers.S.some((s) => s.toLowerCase() === ally.toLowerCase())) score += 30;
      else if (map.tiers.A.some((a) => a.toLowerCase() === ally.toLowerCase())) score += 20;
      else score += 10;
    }

    // Counters evaluation
    let countersCount = 0;
    for (const ally of allies) {
      const match = countersData[ally];
      if (match?.counters) {
        for (const enemy of enemies) {
          if (match.counters.some((c) => c.toLowerCase() === enemy?.toLowerCase())) {
            countersCount++;
            score += 15;
          }
        }
      }
    }

    if (score >= 95) {
      setGrade({
        score: 'S+',
        text: '¡Draft Maestro Perfecto! Has elegido brawlers S-Tier con counters directos al rival.',
        color: 'from-amber-400 to-yellow-500 text-slate-950',
      });
    } else if (score >= 75) {
      setGrade({
        score: 'A',
        text: '¡Buen Draft Competitivo! Composición equilibrada y sólida para el mapa.',
        color: 'from-blue-500 to-cyan-500 text-white',
      });
    } else {
      setGrade({
        score: 'B',
        text: 'Draft Mejorable: Faltaron counters o picks de mayor rango en la tier list del mapa.',
        color: 'from-rose-500 to-amber-500 text-white',
      });
    }
  };

  // Top candidates for user to pick
  const recommendations = calculateDraftRecommendations({
    allBrawlers,
    map,
    allyPicks: userPicks.filter(Boolean) as string[],
    enemyPicks: aiPicks.filter(Boolean) as string[],
    bannedBrawlers: [],
    countersData,
    playerProfile: null,
    onlyRankedReady: false,
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-md space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-purple-400" />
          <h3 className="text-xs font-black uppercase tracking-wider text-white">
            Simulador de Práctica Ranked
          </h3>
        </div>
        <button
          onClick={handleReset}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
          title="Nuevo mapa aleatorio"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Cambiar Mapa</span>
        </button>
      </div>

      {/* Map Card */}
      <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-white">{map.name}</div>
          <div className="text-[10px] text-slate-400">{map.mode} • Rotación Ranked</div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-purple-950/60 text-purple-300 border border-purple-800/40 font-bold">
          Modo IA
        </span>
      </div>

      {/* Draft Board: User vs AI */}
      <div className="grid grid-cols-2 gap-2">
        {/* User Team */}
        <div className="p-2 rounded-xl bg-slate-950/60 border border-blue-500/30 space-y-1.5">
          <div className="text-[10px] font-bold text-blue-400 uppercase flex items-center gap-1">
            <Shield className="w-3 h-3" /> Tus Picks
          </div>
          <div className="space-y-1">
            {userPicks.map((p, i) => (
              <div key={i} className="h-7 px-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center text-xs font-bold text-slate-200">
                {p || <span className="text-slate-500 font-normal italic">Turno {i + 1}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* AI Team */}
        <div className="p-2 rounded-xl bg-slate-950/60 border border-red-500/30 space-y-1.5">
          <div className="text-[10px] font-bold text-red-400 uppercase flex items-center gap-1">
            <Sword className="w-3 h-3" /> IA Rival
          </div>
          <div className="space-y-1">
            {aiPicks.map((p, i) => (
              <div key={i} className="h-7 px-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center text-xs font-bold text-slate-200">
                {p || <span className="text-slate-500 font-normal italic">Esperando...</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grade Result Card if Finished */}
      {grade && (
        <div className="p-3 bg-slate-950 border border-slate-700 rounded-xl space-y-2 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${grade.color} flex items-center justify-center font-black text-sm`}>
                {grade.score}
              </span>
              <div>
                <div className="text-xs font-bold text-white">Resultado del Entrenamiento</div>
                <div className="text-[10px] text-slate-400">Calificación del Algoritmo</div>
              </div>
            </div>
            <button
              onClick={() => onApplyToMainDraft(map, userPicks.filter(Boolean) as string[], aiPicks.filter(Boolean) as string[])}
              className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-all"
            >
              Llevar al Draft Real ➔
            </button>
          </div>
          <p className="text-xs text-slate-300 leading-snug">{grade.text}</p>
        </div>
      )}

      {/* User Pick Options (Top recommendations to choose from) */}
      {!isCompleted && (
        <div className="space-y-1.5 pt-1 border-t border-slate-800">
          <div className="text-[10.5px] font-bold text-slate-300 flex items-center justify-between">
            <span>Elige tu siguiente Pick:</span>
            <span className="text-slate-500 text-[10px] font-normal">Toca para fijar</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {recommendations.slice(0, 6).map((rec) => (
              <button
                key={rec.brawler.displayName}
                onClick={() => handleUserPick(rec.brawler.displayName)}
                className="p-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 hover:border-cyan-400 flex flex-col items-center gap-1 transition-all cursor-pointer group active:scale-95"
              >
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-800 border border-slate-700">
                  <img src={rec.brawler.iconUrl} alt={rec.brawler.displayName} className="w-full h-full object-cover" />
                </div>
                <span className="text-[10px] font-bold text-slate-200 truncate w-full text-center group-hover:text-cyan-300">
                  {rec.brawler.displayName}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
