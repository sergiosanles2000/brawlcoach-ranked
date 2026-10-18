import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Gamepad2,
  RotateCcw,
  Shield,
  Sword,
  Search,
  X,
  Sparkles,
  Send,
  Loader2,
  Dice5,
} from 'lucide-react';
import type { GameMap, Brawler, CountersMap, BrawlerClass } from '../types/brawl';
import { calculateDraftRecommendations } from '../services/draftEngine';
import { findBrawlPickMap } from '../services/brawlpickService';
import { logger } from '../services/logger';

interface PracticeDraftSimulatorProps {
  allMaps: GameMap[];
  allBrawlers: Brawler[];
  countersData: CountersMap;
  onApplyToMainDraft: (map: GameMap, allies: string[], enemies: string[]) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const CLASS_TABS: { label: string; value: BrawlerClass | 'All' }[] = [
  { label: 'Todos', value: 'All' },
  { label: 'Tanques', value: 'Tank' },
  { label: 'Snipers', value: 'Marksman' },
  { label: 'Asesinos', value: 'Assassin' },
  { label: 'Control', value: 'Controller' },
  { label: 'Lanzadores', value: 'Artillery' },
  { label: 'Soporte', value: 'Support' },
];

const GEMINI_API_KEY = typeof atob === 'function'
  ? atob('QVEuQWI4Uk42S252TEgxRTN1NE91S0dNTkJRTVJDbDc2MExHX1dpUXBEN0xWNF9scmhFanc=')
  : '';
const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODEL = 'gemma-4-31b-it';

export const PracticeDraftSimulator: React.FC<PracticeDraftSimulatorProps> = ({
  allMaps,
  allBrawlers,
  countersData,
  onApplyToMainDraft,
}) => {
  // Practice Map
  const [map, setMap] = useState<GameMap>(() => allMaps[Math.floor(Math.random() * allMaps.length)]);

  // Who starts: 'user' or 'enemy' (Randomized)
  const [firstPick, setFirstPick] = useState<'user' | 'enemy'>(() => (Math.random() > 0.5 ? 'user' : 'enemy'));

  // 6 Turns:
  // If firstPick === 'user'  => [user, enemy, enemy, user, user, enemy]
  // If firstPick === 'enemy' => [enemy, user, user, enemy, enemy, user]
  const [turnIndex, setTurnIndex] = useState<number>(0);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);

  // Draft slot arrays: exactly 3 allies and 3 enemies
  const [userPicks, setUserPicks] = useState<(string | null)[]>([null, null, null]);
  const [aiPicks, setAiPicks] = useState<(string | null)[]>([null, null, null]);

  // Status & Grade
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [grade, setGrade] = useState<{ score: string; text: string; color: string; points: number } | null>(null);

  // Roster Filter & Search
  const [search, setSearch] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<BrawlerClass | 'All'>('All');

  // AI Chat & Detailed Analysis
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Unavailable brawlers (already picked by either side)
  const unavailable = useMemo(() => {
    return new Set<string>([
      ...(userPicks.filter(Boolean) as string[]),
      ...(aiPicks.filter(Boolean) as string[]),
    ]);
  }, [userPicks, aiPicks]);

  // Draft Order Sequence
  const draftSequence: ('user' | 'enemy')[] = useMemo(() => {
    return firstPick === 'user'
      ? ['user', 'enemy', 'enemy', 'user', 'user', 'enemy']
      : ['enemy', 'user', 'user', 'enemy', 'enemy', 'user'];
  }, [firstPick]);

  const currentTurn = turnIndex < 6 ? draftSequence[turnIndex] : null;

  // Real BrawlPick stats for the current map
  const mapStats = useMemo(() => {
    return findBrawlPickMap(map.name, map.mode);
  }, [map]);

  // Filtered Roster for full selection
  const filteredRoster = useMemo(() => {
    return allBrawlers.filter((b) => {
      if (selectedClass !== 'All' && b.class !== selectedClass) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return b.displayName.toLowerCase().includes(q) || b.class.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allBrawlers, selectedClass, search]);

  // Reset / New Practice Match
  const handleReset = (forcedFirstPick?: 'user' | 'enemy') => {
    const randomMap = allMaps[Math.floor(Math.random() * allMaps.length)];
    const chosenFirstPick = forcedFirstPick || (Math.random() > 0.5 ? 'user' : 'enemy');
    setMap(randomMap);
    setFirstPick(chosenFirstPick);
    setTurnIndex(0);
    setUserPicks([null, null, null]);
    setAiPicks([null, null, null]);
    setIsCompleted(false);
    setGrade(null);
    setSearch('');
    setSelectedClass('All');
    setChatMessages([]);
    setChatInput('');
    setIsAiThinking(false);
    setIsAiGenerating(false);
  };

  // Trigger AI turn if current turn is 'enemy' and draft isn't completed
  useEffect(() => {
    if (isCompleted || turnIndex >= 6) return;

    if (draftSequence[turnIndex] === 'enemy' && !isAiThinking) {
      setIsAiThinking(true);
      const timer = setTimeout(() => {
        executeAiPick();
        setIsAiThinking(false);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [turnIndex, isCompleted, firstPick]);

  // AI makes its pick based on current draft state
  const executeAiPick = () => {
    const currentAllies = userPicks.filter(Boolean) as string[];
    const currentAi = aiPicks.filter(Boolean) as string[];

    // Calculate recommendations for AI to counter the user
    const aiRecs = calculateDraftRecommendations({
      allBrawlers,
      map,
      allyPicks: currentAi,
      enemyPicks: currentAllies,
      bannedBrawlers: [],
      countersData,
      playerProfile: null,
      onlyRankedReady: false,
    });

    const bestPick = aiRecs.find((r) => !unavailable.has(r.brawler.displayName));
    const chosenName = bestPick
      ? bestPick.brawler.displayName
      : allBrawlers.find((b) => !unavailable.has(b.displayName))?.displayName || 'Shelly';

    // Assign to next empty AI slot
    const emptyAiIdx = aiPicks.findIndex((p) => p === null);
    if (emptyAiIdx !== -1) {
      const nextAi = [...aiPicks];
      nextAi[emptyAiIdx] = chosenName;
      setAiPicks(nextAi);

      const nextTurn = turnIndex + 1;
      setTurnIndex(nextTurn);

      if (nextTurn >= 6) {
        finishDraft(userPicks as string[], nextAi as string[]);
      }
    }
  };

  // User chooses a brawler from the full roster
  const handleUserPick = (brawlerName: string) => {
    if (isCompleted || isAiThinking || currentTurn !== 'user') return;
    if (unavailable.has(brawlerName)) return;

    const emptyUserIdx = userPicks.findIndex((p) => p === null);
    if (emptyUserIdx === -1) return;

    const nextUser = [...userPicks];
    nextUser[emptyUserIdx] = brawlerName;
    setUserPicks(nextUser);

    const nextTurn = turnIndex + 1;
    setTurnIndex(nextTurn);

    if (nextTurn >= 6) {
      finishDraft(nextUser as string[], aiPicks as string[]);
    }
  };

  // Evaluate and calculate grade when all 6 picks are placed
  const finishDraft = (finalAllies: string[], finalEnemies: string[]) => {
    setIsCompleted(true);
    let score = 0;

    // 1. Map tier points
    for (const ally of finalAllies.filter(Boolean)) {
      if (map.tiers.S.some((s) => s.toLowerCase() === ally.toLowerCase())) score += 32;
      else if (map.tiers.A.some((a) => a.toLowerCase() === ally.toLowerCase())) score += 22;
      else if (map.tiers.B?.some((b) => b.toLowerCase() === ally.toLowerCase())) score += 14;
      else score += 8;
    }

    // 2. Real BrawlPick winrate bonus
    if (mapStats?.picks) {
      for (const ally of finalAllies.filter(Boolean)) {
        const stat = mapStats.picks.find((p) => p.brawlerName.toLowerCase() === ally.toLowerCase());
        if (stat) {
          if (stat.winRate >= 58) score += 10;
          else if (stat.winRate >= 52) score += 5;
          else if (stat.winRate < 46) score -= 8;
        }
      }
    }

    // 3. Counter matchups vs enemy picks
    let counterBonus = 0;
    for (const ally of finalAllies.filter(Boolean)) {
      const info = countersData[ally];
      if (info) {
        for (const enemy of finalEnemies.filter(Boolean)) {
          if (info.counters?.some((c) => c.toLowerCase() === enemy.toLowerCase())) {
            counterBonus += 12;
          }
          if (info.counteredBy?.some((cb) => cb.toLowerCase() === enemy.toLowerCase())) {
            counterBonus -= 10;
          }
        }
      }
    }
    score += counterBonus;

    let computedGrade: { score: string; text: string; color: string; points: number };
    if (score >= 90) {
      computedGrade = {
        score: 'S+',
        text: '¡Draft Maestro Impecable! Picks de máximo meta con sinergia sólida y counters contundentes.',
        color: 'from-amber-400 to-yellow-500 text-slate-950',
        points: score,
      };
    } else if (score >= 70) {
      computedGrade = {
        score: 'A',
        text: '¡Buen Draft Competitivo! Composición equilibrada y viable para el mapa actual.',
        color: 'from-blue-500 to-cyan-500 text-white',
        points: score,
      };
    } else if (score >= 50) {
      computedGrade = {
        score: 'B',
        text: 'Draft Regular / Mejorable: Falta presencia en el meta o el rival obtuvo mejores emparejamientos de línea.',
        color: 'from-emerald-500 to-teal-500 text-white',
        points: score,
      };
    } else {
      computedGrade = {
        score: 'C',
        text: 'Draft Desfavorable: Brawlers con bajo winrate en el mapa o castigados fuertemente por counters rivales.',
        color: 'from-rose-500 to-red-600 text-white',
        points: score,
      };
    }

    setGrade(computedGrade);
    requestGeminiInitialAnalysis(finalAllies, finalEnemies, computedGrade);
  };

  // Helper to construct in-depth match context for Gemini
  const buildAnalysisContext = (allies: string[], enemies: string[], userGrade: { score: string; points: number }) => {
    // Winrates from BrawlPick
    const allyStatsStr = allies
      .filter(Boolean)
      .map((a) => {
        const st = mapStats?.picks?.find((p) => p.brawlerName.toLowerCase() === a.toLowerCase());
        const bObj = allBrawlers.find((b) => b.displayName.toLowerCase() === a.toLowerCase());
        const wr = st ? `${st.winRate}% (Rank #${st.rank})` : 'Sin datos específicos';
        const role = bObj ? `${bObj.class} (Alcance: ${bObj.attackRange})` : 'Clase estándar';
        return `• ${a} [${role}] -> WR en mapa: ${wr}`;
      })
      .join('\n');

    const enemyStatsStr = enemies
      .filter(Boolean)
      .map((e) => {
        const st = mapStats?.picks?.find((p) => p.brawlerName.toLowerCase() === e.toLowerCase());
        const bObj = allBrawlers.find((b) => b.displayName.toLowerCase() === e.toLowerCase());
        const wr = st ? `${st.winRate}% (Rank #${st.rank})` : 'Sin datos específicos';
        const role = bObj ? `${bObj.class} (Alcance: ${bObj.attackRange})` : 'Clase estándar';
        return `• ${e} [${role}] -> WR en mapa: ${wr}`;
      })
      .join('\n');

    // Counters breakdown
    const matchupsList: string[] = [];
    for (const a of allies.filter(Boolean)) {
      const aInfo = countersData[a];
      const aObj = allBrawlers.find((b) => b.displayName.toLowerCase() === a.toLowerCase());
      for (const e of enemies.filter(Boolean)) {
        const eObj = allBrawlers.find((b) => b.displayName.toLowerCase() === e.toLowerCase());
        if (aInfo?.counters?.some((c) => c.toLowerCase() === e.toLowerCase())) {
          matchupsList.push(
            `+ VENTAJOSA: ${a} (${aObj?.class || 'Brawler'}) tiene ventaja counter sobre ${e} (${eObj?.class || 'Rival'}).`
          );
        }
        if (aInfo?.counteredBy?.some((cb) => cb.toLowerCase() === e.toLowerCase())) {
          matchupsList.push(
            `- DESVENTAJOSA: ${a} (${aObj?.class || 'Brawler'}) sufre frente a ${e} (${eObj?.class || 'Rival'}), sufre contra su kit o velocidad.`
          );
        }
      }
    }

    const matchupsStr = matchupsList.length > 0 ? matchupsList.join('\n') : '• Enfrentamientos neutros de línea sin counters extremos.';

    return `ENTRENAMIENTO PRACTICA RANKED - BRAWL STARS
Mapa: "${map.name}" | Modo: "${map.mode}"
Primer Pick inicial: ${firstPick === 'user' ? 'Jugador' : 'IA Rival'}
Puntaje de Algoritmo: ${userGrade.score} (${userGrade.points} pts)

PICKS DEL JUGADOR (ALIADOS):
${allyStatsStr}

PICKS DEL RIVAL (IA):
${enemyStatsStr}

ENFRENTAMIENTOS Y COUNTERS DETECTADOS EN BASE DE DATOS:
${matchupsStr}`;
  };

  // Call Gemini to generate initial analysis
  const requestGeminiInitialAnalysis = async (
    allies: string[],
    enemies: string[],
    userGrade: { score: string; points: number }
  ) => {
    setIsAiGenerating(true);
    const contextPrompt = buildAnalysisContext(allies, enemies, userGrade);

    const systemPrompt = `Eres el Director Estratégico Pro de Brawl Stars (Rango Maestros).
Analiza el draft de práctica recién terminado por el usuario.
Explica detalladamente por qué la composición del usuario fue buena, regular o mala según:
1. El mapa y modo actual (${map.name} - ${map.mode}).
2. El porcentaje de victorias (% Winrate) de los brawlers en este mapa.
3. Los emparejamientos y counters directos (ejemplo: si un asesino/tanque rápido castiga a un lanzador/thrower, o si un sniper domina en mapa abierto).
4. El motivo de la nota (${userGrade.score}).

FORMATO ESTRICTO:
- En español directo, táctico y competitivo.
- Máximo 3 a 5 párrafos concisos con viñetas destacadas.
- Concluye con 1 consejo clave para ganar o mejorar el draft en este mapa.`;

    const userQuery = `Aquí tienes el resultado del draft:\n\n${contextPrompt}\n\nDame el análisis táctico detallado de mis elecciones vs las del rival.`;

    const reply = await queryGeminiApi(systemPrompt, userQuery, []);
    setChatMessages([
      {
        id: 'analysis-init',
        role: 'assistant',
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setIsAiGenerating(false);
  };

  // Call Gemini API (shared logic with custom key cascade)
  const queryGeminiApi = async (
    systemInstruction: string,
    prompt: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> => {
    const customUserKey = typeof localStorage !== 'undefined'
      ? (localStorage.getItem('brawl_user_custom_gemini_key') || '').trim()
      : '';

    const keysToTry: { key: string; isCustom: boolean }[] = [];
    if (customUserKey) keysToTry.push({ key: customUserKey, isCustom: true });
    keysToTry.push({ key: GEMINI_API_KEY, isCustom: false });

    for (const { key: activeKey } of keysToTry) {
      const modelsToTry = [PRIMARY_MODEL, FALLBACK_MODEL];
      for (const currentModel of modelsToTry) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${activeKey}`;
        try {
          const contents = [
            ...history.map((h) => ({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: h.content }],
            })),
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ];

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              systemInstruction: {
                parts: [{ text: systemInstruction }],
              },
              generationConfig: {
                temperature: 0.6,
                maxOutputTokens: 900,
              },
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text.trim();
          }
        } catch (e) {
          logger.add('ERROR', 'Error en consulta Gemini Práctica', String(e));
        }
      }
    }

    return 'No se pudo conectar con el servicio de IA de Gemini en este momento. Revisa tu conexión a internet o tu clave API en Ajustes.';
  };

  // Follow-up question submission in practice post-match chat
  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || isAiGenerating || !grade) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsAiGenerating(true);

    const contextPrompt = buildAnalysisContext(
      userPicks.filter(Boolean) as string[],
      aiPicks.filter(Boolean) as string[],
      grade
    );

    const systemPrompt = `Eres el Entrenador de Brawl Stars de rango competitivo.
Estás debatiendo con el usuario sobre su partida de práctica en "${map.name}" (${map.mode}).
Contexto del draft:
${contextPrompt}

Responde a la pregunta del usuario con consejos tácticos, análisis de counters y winrates. Sé conciso y fundamentado.`;

    const historyTurns = chatMessages.map((m) => ({ role: m.role, content: m.content }));
    const reply = await queryGeminiApi(systemPrompt, text, historyTurns);

    const botMsg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      role: 'assistant',
      content: reply,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, botMsg]);
    setIsAiGenerating(false);

    setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Turn status badge description
  const getTurnStatusMessage = () => {
    if (isCompleted) return '¡Draft completado! Revisa el análisis.';
    if (isAiThinking) return 'IA Rival analizando el mejor counter...';
    if (currentTurn === 'user') {
      const userPickCount = userPicks.filter(Boolean).length + 1;
      return `Tu Turno (${userPickCount}º Pick Aliado) - Elige tu brawler`;
    }
    return 'Turno del Rival...';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-md space-y-3">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-purple-400" />
          <h3 className="text-xs font-black uppercase tracking-wider text-white">
            Simulador de Práctica Ranked (Snake Draft)
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleReset(firstPick === 'user' ? 'enemy' : 'user')}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
            title="Cambiar quién empieza"
          >
            <Dice5 className="w-3.5 h-3.5 text-amber-400" />
            <span>1st Pick: {firstPick === 'user' ? 'Tú' : 'Rival'}</span>
          </button>
          <button
            onClick={() => handleReset()}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
            title="Nuevo mapa y reset"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reiniciar</span>
          </button>
        </div>
      </div>

      {/* Map & Turn Banner */}
      <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {map.imageUrl && (
            <img src={map.imageUrl} alt={map.name} className="w-9 h-9 rounded-lg object-cover border border-slate-800" />
          )}
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>{map.name}</span>
              <span className="text-[10px] font-normal text-slate-400">({map.mode})</span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <span>Orden:</span>
              <span className="font-mono text-cyan-300">
                {firstPick === 'user' ? '1-2-2-1 (Empiezas Tú)' : '2-1-1-2 (Empieza Rival)'}
              </span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
              isCompleted
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/50'
                : currentTurn === 'user'
                ? 'bg-blue-950/70 text-blue-300 border-blue-800/50 animate-pulse'
                : 'bg-rose-950/70 text-rose-300 border-rose-800/50'
            }`}
          >
            {getTurnStatusMessage()}
          </span>
        </div>
      </div>

      {/* Draft Board: User vs AI (Sequential Slots) */}
      <div className="grid grid-cols-2 gap-2">
        {/* User Team */}
        <div className="p-2 rounded-xl bg-slate-950/60 border border-blue-500/30 space-y-1.5">
          <div className="text-[10px] font-bold text-blue-400 uppercase flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Shield className="w-3 h-3" /> Tus Picks (Aliados)
            </span>
            <span className="text-[9px] text-slate-500 font-mono">
              {userPicks.filter(Boolean).length}/3
            </span>
          </div>
          <div className="space-y-1">
            {userPicks.map((p, i) => {
              const brawlerObj = p ? allBrawlers.find((b) => b.displayName.toLowerCase() === p.toLowerCase()) : null;
              const bStats = p && mapStats?.picks ? mapStats.picks.find((s) => s.brawlerName.toLowerCase() === p.toLowerCase()) : null;

              return (
                <div
                  key={i}
                  className={`h-8 px-2 rounded-lg border flex items-center justify-between text-xs font-bold transition-all ${
                    p
                      ? 'bg-blue-950/40 border-blue-500/40 text-blue-100'
                      : !isCompleted && currentTurn === 'user' && userPicks.findIndex((x) => x === null) === i
                      ? 'bg-slate-900 border-cyan-400/80 text-cyan-200 animate-pulse'
                      : 'bg-slate-900/60 border-slate-800 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {brawlerObj && (
                      <img src={brawlerObj.iconUrl} alt={p!} className="w-5 h-5 rounded object-cover" />
                    )}
                    <span className="truncate">{p || `Slot Aliado ${i + 1}`}</span>
                  </div>
                  {bStats && (
                    <span className="text-[9px] font-mono text-blue-300 bg-blue-900/50 px-1.5 py-0.2 rounded shrink-0">
                      {bStats.winRate}% WR
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Rival Team */}
        <div className="p-2 rounded-xl bg-slate-950/60 border border-red-500/30 space-y-1.5">
          <div className="text-[10px] font-bold text-red-400 uppercase flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Sword className="w-3 h-3" /> IA Rival
            </span>
            <span className="text-[9px] text-slate-500 font-mono">
              {aiPicks.filter(Boolean).length}/3
            </span>
          </div>
          <div className="space-y-1">
            {aiPicks.map((p, i) => {
              const brawlerObj = p ? allBrawlers.find((b) => b.displayName.toLowerCase() === p.toLowerCase()) : null;
              const bStats = p && mapStats?.picks ? mapStats.picks.find((s) => s.brawlerName.toLowerCase() === p.toLowerCase()) : null;

              return (
                <div
                  key={i}
                  className={`h-8 px-2 rounded-lg border flex items-center justify-between text-xs font-bold transition-all ${
                    p
                      ? 'bg-red-950/40 border-red-500/40 text-red-100'
                      : !isCompleted && currentTurn === 'enemy' && aiPicks.findIndex((x) => x === null) === i
                      ? 'bg-slate-900 border-rose-500/80 text-rose-300 animate-pulse'
                      : 'bg-slate-900/60 border-slate-800 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {brawlerObj && (
                      <img src={brawlerObj.iconUrl} alt={p!} className="w-5 h-5 rounded object-cover" />
                    )}
                    <span className="truncate">{p || (isAiThinking ? 'Eligiendo...' : `Slot Rival ${i + 1}`)}</span>
                  </div>
                  {bStats && (
                    <span className="text-[9px] font-mono text-red-300 bg-red-900/50 px-1.5 py-0.2 rounded shrink-0">
                      {bStats.winRate}% WR
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grade Result Card if Finished */}
      {grade && (
        <div className="p-3 bg-slate-950 border border-slate-700 rounded-xl space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${grade.color} flex items-center justify-center font-black text-base shadow-sm`}>
                {grade.score}
              </span>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1">
                  <span>Nota del Algoritmo</span>
                  <span className="text-[10px] text-slate-400 font-mono">({grade.points} pts)</span>
                </div>
                <div className="text-[10px] text-slate-400">Evaluación de composición y counters</div>
              </div>
            </div>
            <button
              onClick={() => onApplyToMainDraft(map, userPicks.filter(Boolean) as string[], aiPicks.filter(Boolean) as string[])}
              className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[10.5px] font-bold cursor-pointer transition-all shadow-sm active:scale-95"
            >
              Llevar al Draft ➔
            </button>
          </div>
          <p className="text-xs text-slate-200 leading-snug">{grade.text}</p>
        </div>
      )}

      {/* Full Roster Selection (Available while draft is in progress) */}
      {!isCompleted && (
        <div className="space-y-2 pt-1 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
              <span>Elige tu Brawler ({allBrawlers.length} Disponibles):</span>
              {currentTurn !== 'user' && (
                <span className="text-[10px] text-amber-400 font-normal italic">
                  (Espera al turno del rival)
                </span>
              )}
            </div>
            <span className="text-[9.5px] text-slate-500">
              {filteredRoster.length} mostrados
            </span>
          </div>

          {/* Search Bar & Class Filter */}
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar brawler por nombre o rol..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={currentTurn !== 'user' || isAiThinking}
                className="w-full pl-8 pr-7 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 disabled:opacity-50"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar text-xs">
              {CLASS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setSelectedClass(tab.value)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 transition-colors ${
                    selectedClass === tab.value
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Full Brawlers Grid */}
          <div className="max-h-56 overflow-y-auto pr-1 grid grid-cols-4 sm:grid-cols-6 gap-1.5 custom-scrollbar">
            {filteredRoster.map((brawler) => {
              const isTaken = unavailable.has(brawler.displayName);
              const disabled = isTaken || currentTurn !== 'user' || isAiThinking;

              return (
                <button
                  key={brawler.displayName}
                  disabled={disabled}
                  onClick={() => handleUserPick(brawler.displayName)}
                  className={`relative flex flex-col items-center p-1 rounded-xl border transition-all text-center select-none ${
                    isTaken
                      ? 'opacity-25 grayscale cursor-not-allowed border-slate-800 bg-slate-950'
                      : disabled
                      ? 'opacity-60 cursor-not-allowed border-slate-800 bg-slate-950/50'
                      : 'cursor-pointer hover:border-cyan-400 hover:bg-slate-800 active:scale-95 border-slate-800 bg-slate-950/80 shadow-sm'
                  }`}
                >
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-slate-800 mb-0.5">
                    <img
                      src={brawler.iconUrl}
                      alt={brawler.displayName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {isTaken && (
                      <div className="absolute inset-0 bg-red-950/70 flex items-center justify-center text-[8px] font-bold text-red-300">
                        COGIDO
                      </div>
                    )}
                  </div>
                  <span className="text-[9.5px] font-bold text-slate-200 truncate w-full">
                    {brawler.displayName}
                  </span>
                  <span className="text-[7.5px] text-slate-500 truncate w-full">
                    {brawler.class}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Post-Match Analysis & Interactive Chat Section */}
      {isCompleted && (
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-black text-cyan-300 uppercase tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Análisis de IA & Asesor Táctico Gemini</span>
            </div>
            {isAiGenerating && (
              <span className="flex items-center gap-1 text-[10px] text-cyan-400 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Analizando partida...</span>
              </span>
            )}
          </div>

          {/* Chat Messages Log */}
          <div className="max-h-64 overflow-y-auto space-y-2 p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs custom-scrollbar">
            {chatMessages.length === 0 && isAiGenerating && (
              <div className="p-3 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                <span>Generando desglose de counters, winrates y rendimiento en {map.name}...</span>
              </div>
            )}

            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`p-2.5 rounded-xl leading-relaxed ${
                  msg.role === 'assistant'
                    ? 'bg-slate-900 border border-slate-800 text-slate-200'
                    : 'bg-cyan-950/40 border border-cyan-800/40 text-cyan-100 ml-4'
                }`}
              >
                <div className="flex items-center justify-between mb-1 text-[9.5px] text-slate-400 font-bold">
                  <span>{msg.role === 'assistant' ? '🤖 BrawlCoach AI (Gemini)' : '👤 Tú'}</span>
                  <span className="font-mono">{msg.timestamp}</span>
                </div>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Interactive Chat Input (Locked when generating) */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder={isAiGenerating ? 'Esperando respuesta de Gemini...' : 'Pregunta por qué falló un pick, counters o builds...'}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isAiGenerating && handleSendChat()}
              disabled={isAiGenerating}
              className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 disabled:opacity-50"
            />
            <button
              onClick={handleSendChat}
              disabled={isAiGenerating || !chatInput.trim()}
              className="p-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white disabled:text-slate-500 rounded-xl cursor-pointer disabled:cursor-not-allowed transition-all"
              title="Enviar pregunta a Gemini"
            >
              {isAiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
