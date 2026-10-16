import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Bot,
  User,
  Trash2,
  AlertCircle,
  MapPin,
} from 'lucide-react';
import type { GameMap, Brawler, RecommendationScore } from '../types/brawl';
import { logger } from '../services/logger';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface BrawlChatProps {
  currentMap: GameMap;
  allyPicks: (string | null)[];
  enemyPicks: (string | null)[];
  allyBans: (string | null)[];
  enemyBans: (string | null)[];
  recommendations: RecommendationScore[];
  allBrawlers: Brawler[];
}

const GEMINI_API_KEY = typeof atob === 'function'
  ? atob('QVEuQWI4Uk42S252TEgxRTN1NE91S0dNTkJRTVJDbDc2MExHX1dpUXBEN0xWNF9scmhFanc=')
  : '';
const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODEL = 'gemma-4-31b-it';

const STORAGE_KEY_CHAT = 'brawlcoach_chat_history_v1';

export const BrawlChat: React.FC<BrawlChatProps> = ({
  currentMap,
  allyPicks,
  enemyPicks,
  allyBans,
  enemyBans,
  recommendations,
}) => {
  const getInitialMessages = (): ChatMessage[] => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CHAT);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      // Ignore parse error
    }
    return [
      {
        id: 'welcome',
        role: 'assistant',
        content: `¡Hola! Soy tu **Entrenador de Brawl Stars**. Estoy analizando en vivo tu partida en **[${currentMap.mode}] ${currentMap.name}**.\n\nPuedes preguntarme qué brawler pickear, la mejor build (Gadget, Star Power, Gears), cómo contrarrestar al equipo rival o estrategias de línea en este mapa.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  };

  const [messages, setMessages] = useState<ChatMessage[]>(getInitialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Persist messages across reloads / component unmounts
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CHAT, JSON.stringify(messages));
    } catch (e) {
      // Ignore storage quota
    }
  }, [messages]);

  const handleClearHistory = () => {
    const welcomeMsg: ChatMessage = {
      id: 'welcome-' + Date.now(),
      role: 'assistant',
      content: `¡Historial borrado! Empezamos desde cero. ¿Qué duda o táctica necesitas para **[${currentMap.mode}] ${currentMap.name}**?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages([welcomeMsg]);
    try {
      localStorage.setItem(STORAGE_KEY_CHAT, JSON.stringify([welcomeMsg]));
    } catch (e) {}
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Build the strict System Prompt with live draft context
  const buildSystemPrompt = () => {
    const allies = allyPicks.filter(Boolean).join(', ') || 'Ninguno aún';
    const enemies = enemyPicks.filter(Boolean).join(', ') || 'Ninguno aún';
    const bans = [...allyBans.filter(Boolean), ...enemyBans.filter(Boolean)].join(', ') || 'Ninguno';
    const topPicks = recommendations
      .slice(0, 3)
      .map((r, i) => `${i + 1}. ${r.brawler.displayName} (${r.tier}-Tier, ${r.totalScore} pts: ${r.reasons[0]?.text || ''})`)
      .join('\n');

    return `Eres BrawlCoach AI, el entrenador táctico pro de Brawl Stars de rango Maestros / Competitivo.

REGLA ESTRICTA DE ENFOQUE:
- Responde EXCLUSIVAMENTE sobre Brawl Stars (elección de brawlers en draft, counters, sinergias, gadgets, star powers, gears, hipercargas, modos de juego y tácticas de mapa).
- Si el usuario pregunta cualquier tema NO relacionado con Brawl Stars (política, cocina, programación, otros videojuegos, etc.), DEBES RECHAZARLO amablemente en 1 frase diciendo: "Soy tu entrenador exclusivo de Brawl Stars. Solo puedo ayudarte con tácticas, builds y partidas de Brawl Stars. ¿En qué estrategia de juego te ayudo?"

CONTEXTO EN VIVO DEL DRAFT ACTUAL:
- Mapa activo: "${currentMap.name}"
- Modo de juego: "${currentMap.mode}" (${currentMap.environment})
- Aliados seleccionados: [${allies}]
- Rivales seleccionados: [${enemies}]
- Baneos activos: [${bans}]
- Top recomendaciones calculadas por el motor de draft:
${topPicks}

INSTRUCCIONES DE RESPUESTA:
- PROHIBIDO mostrar análisis interno, cadenas de pensamiento, auto-correcciones o notas técnicas (ej: no escribas "Analyze the Request", "Thinking Process" ni etiquetas similares).
- Entrega DIRECTAMENTE el consejo táctico al usuario en español, con estilo de entrenador pro.
- Sé conciso, directo y táctico (máximo 4 a 6 líneas).
- Utiliza viñetas y negritas cuando expliques builds (Gadget, Star Power, Gears recomendados).
- Justifica tus recomendaciones explicando los counters directos a los rivales o la sinergia con los aliados.`;
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    let assistantReply = '';
    let success = false;

    // Retry pipeline: Primary (Gemini 3.5 Flash Lite) -> Auto-retry (Gemini) -> Fallback (Gemma 4 31B)
    const modelsToTry = [PRIMARY_MODEL, PRIMARY_MODEL, FALLBACK_MODEL];

    for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
      const currentModel = modelsToTry[attempt];
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${GEMINI_API_KEY}`;
      const attemptLabel = attempt > 0 ? ` (reintento ${attempt})` : '';

      try {
        logger.add('API_REQ', `Consultando a Google IA (${currentModel})${attemptLabel}`, `Pregunta: "${text.slice(0, 50)}..."`);
        const systemInstruction = buildSystemPrompt();

        const historyTurns = messages
          .filter((m) => m.id !== 'welcome' && !m.id.startsWith('welcome-'))
          .slice(-6)
          .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }));

        const sanitizedTurns: Array<{ role: string; parts: Array<{ text: string }> }> = [];
        for (const turn of historyTurns) {
          if (sanitizedTurns.length === 0 && turn.role !== 'user') continue;
          const last = sanitizedTurns[sanitizedTurns.length - 1];
          if (last && last.role === turn.role) {
            last.parts[0].text += `\n${turn.parts[0].text}`;
          } else {
            sanitizedTurns.push(turn);
          }
        }

        const lastTurn = sanitizedTurns[sanitizedTurns.length - 1];
        if (lastTurn && lastTurn.role === 'user') {
          lastTurn.parts[0].text += `\n${text}`;
        } else {
          sanitizedTurns.push({
            role: 'user',
            parts: [{ text }],
          });
        }

        const geminiPayload = {
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: sanitizedTurns,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 500,
          },
        };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiPayload),
        });

        if (res.ok) {
          const data = await res.json();
          const candidateParts = data?.candidates?.[0]?.content?.parts || [];
          const answerParts = candidateParts.filter((p: any) => !p.thought);
          const replyText = (answerParts.length > 0 ? answerParts : candidateParts)
            .map((p: any) => p.text || '')
            .join('\n')
            .trim();

          if (replyText) {
            assistantReply = replyText;
            success = true;
            logger.add('API_RES', `Respuesta recibida (${currentModel})`, replyText.slice(0, 100));
            break;
          }
        } else {
          const errTxt = await res.text().catch(() => '');
          logger.add('ERROR', `Aviso en llamada IA HTTP ${res.status} (${currentModel})`, errTxt.slice(0, 100));
        }
      } catch (err: any) {
        logger.add('ERROR', `Fallo de red al conectar con IA (${currentModel})`, err.message || 'Sin conexión');
      }

      // Small pause before next attempt
      await new Promise((r) => setTimeout(r, 600));
    }

    if (success && assistantReply) {
      const assistantMessage: ChatMessage = {
        id: Math.random().toString(36).substring(2, 9),
        role: 'assistant',
        content: assistantReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } else {
      setError('⚡ Los servidores de IA están ocupados temporalmente. Pulsa la pregunta rápida de nuevo para reintentar.');
    }

    setIsLoading(false);
  };

  const quickPrompts = [
    { label: '💡 ¿A quién elijo ahora?', prompt: '¿A qué brawler debería elegir en este momento y por qué?' },
    { label: '🛡️ ¿Cómo contrarresto a los rivales?', prompt: '¿Cuáles son las debilidades del equipo rival y cómo contrarrestarlas?' },
    { label: '⚡ ¿Qué build me recomiendas?', prompt: '¿Cuál es la mejor build (Gadget, Star Power y Gears) para el pick recomendado?' },
    { label: '📍 Estrategia en este mapa', prompt: `¿Cuál es la mejor táctica y posicionamiento de líneas en ${currentMap.name} (${currentMap.mode})?` },
  ];

  return (
    <div className="w-full flex flex-col h-[calc(100dvh-175px)] max-h-[560px] max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in">
      {/* Top Context Banner */}
      <div className="px-3 py-2 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-900/30 shrink-0">
            <Bot className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black uppercase text-slate-100">
                Coach Táctico IA
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-amber-300 font-semibold truncate max-w-[200px]">
              <MapPin className="w-2.5 h-2.5 shrink-0" />
              <span>[{currentMap.mode}] {currentMap.name}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleClearHistory}
          className="px-2.5 py-1 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 hover:border-red-400 text-red-300 hover:text-white transition-all text-xs font-bold flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm"
          title="Borrar historial y empezar chat limpio sin contexto previo"
        >
          <Trash2 className="w-3.5 h-3.5 text-red-400" />
          <span>Borrar Chat</span>
        </button>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 max-w-[92%] ${
              msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-white text-xs ${
                msg.role === 'user'
                  ? 'bg-gradient-to-tr from-indigo-600 to-blue-500 shadow-md shadow-indigo-900/40'
                  : 'bg-slate-800 border border-cyan-500/40 text-cyan-300'
              }`}
            >
              {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
            </div>

            <div
              className={`p-3 rounded-2xl text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-tr-sm shadow-md shadow-indigo-950/40'
                  : 'bg-slate-950/80 border border-slate-800 text-slate-200 rounded-tl-sm whitespace-pre-wrap'
              }`}
            >
              {msg.content}
              <div
                className={`text-[9px] mt-1 font-mono ${
                  msg.role === 'user' ? 'text-blue-200/70 text-right' : 'text-slate-500 text-left'
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2.5 self-start max-w-[90%] animate-pulse">
            <div className="w-7 h-7 rounded-xl bg-slate-800 border border-cyan-500/40 text-cyan-300 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
            </div>
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-cyan-300 text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>El entrenador está analizando el draft...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Carousel */}
      <div className="px-3 py-1.5 bg-slate-950/50 border-t border-slate-800/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {quickPrompts.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(q.prompt)}
            disabled={isLoading}
            className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white text-[10.5px] font-semibold border border-slate-700/60 whitespace-nowrap transition-all cursor-pointer disabled:opacity-50"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-2.5 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregúntale a tu entrenador de Brawl Stars..."
          disabled={isLoading}
          className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="p-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-95 disabled:opacity-40 text-white rounded-xl shadow-md shadow-cyan-950/50 transition-all cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
