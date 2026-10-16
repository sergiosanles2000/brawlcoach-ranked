import React, { useState } from 'react';
import {
  Trophy,
  RotateCcw,
  Sparkles,
  Search,
  CheckCircle2,
  AlertTriangle,
  SlidersHorizontal,
  MapPin,
  Camera,
  Server,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import type { GameMap, PlayerProfile, Brawler, CountersMap } from '../types/brawl';
import { syncMetaFromApi, getLastUpdatedMeta } from '../services/metaSync';

interface HeaderProps {
  maps: GameMap[];
  selectedMap: GameMap;
  onSelectMap: (map: GameMap) => void;
  playerProfile: PlayerProfile | null;
  isLoadingPlayer: boolean;
  playerError: string | null;
  onSyncPlayer: (tag: string) => void;
  onlyRankedReady: boolean;
  onToggleOnlyRankedReady: () => void;
  onResetDraft: () => void;
  onOpenCapture: () => void;
  lmEndpoint?: string;
  onChangeLmEndpoint?: (endpoint: string) => void;
  lmModel?: string;
  onChangeLmModel?: (model: string) => void;
  isConfigOpen: boolean;
  onToggleConfig: () => void;
  onMetaUpdated?: (brawlers: Brawler[], counters: CountersMap) => void;
  onOpenLogs?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  maps,
  selectedMap,
  onSelectMap,
  playerProfile,
  isLoadingPlayer,
  playerError,
  onSyncPlayer,
  onlyRankedReady,
  onToggleOnlyRankedReady,
  onResetDraft,
  onOpenCapture,
  isConfigOpen,
  onToggleConfig,
  onMetaUpdated,
  onOpenLogs,
}) => {
  const [tagInput, setTagInput] = useState('');
  const [isUpdatingMeta, setIsUpdatingMeta] = useState(false);
  const [metaMessage, setMetaMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(() => getLastUpdatedMeta());

  const handleUpdateMeta = async () => {
    setIsUpdatingMeta(true);
    setMetaMessage(null);
    try {
      const result = await syncMetaFromApi();
      setLastUpdated(result.lastUpdated);
      setMetaMessage(`✅ ¡Meta actualizado con éxito! (${result.brawlers.length} brawlers)`);
      if (onMetaUpdated) {
        onMetaUpdated(result.brawlers, result.counters);
      }
    } catch (err: any) {
      setMetaMessage(`❌ ${err.message || String(err)}`);
    } finally {
      setIsUpdatingMeta(false);
    }
  };

  const handleSyncSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tagInput.trim()) {
      onSyncPlayer(tagInput);
    }
  };

  return (
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-30 px-3 py-2">
      <div className="max-w-4xl mx-auto flex flex-col gap-2">
        {/* Top bar with Branding, Reset, Capture button and Quick Settings */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-amber-400 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-white">
                  BrawlCoach
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold border border-slate-700">
                  Ranked
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400">
                85 mapas competitivos • Base BrawlPick
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick Screen Capture Overlay Button */}
            <button
              onClick={onOpenCapture}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-100 transition-colors border border-slate-700 cursor-pointer"
              title="Escanear pantalla de draft"
            >
              <Camera className="w-3.5 h-3.5 text-slate-300" />
              <span>Escanear</span>
            </button>

            {/* Filter Toggle */}
            <button
              onClick={onToggleOnlyRankedReady}
              className={`text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors border ${
                onlyRankedReady
                  ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="Filtrar por brawlers propios a nivel 9 o superior"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Solo Viables</span>
              <span className="text-[10px] font-bold">P9+</span>
            </button>

            {/* Live Logs Console Button */}
            {onOpenLogs && (
              <button
                onClick={onOpenLogs}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-cyan-400 transition-colors"
                title="Consola de Logs en Vivo"
              >
                <Terminal className="w-4 h-4" />
              </button>
            )}

            {/* Settings Toggle */}
            <button
              onClick={onToggleConfig}
              className={`p-1.5 rounded-lg border transition-colors ${
                isConfigOpen
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
              title="Configurar Perfil y Modelo de IA"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            {/* Reset Draft */}
            <button
              onClick={onResetDraft}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-red-950/40 hover:border-red-500/40 border border-slate-700 text-slate-300 hover:text-red-400 transition-colors"
              title="Reiniciar Draft"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mode and Map Selector */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-amber-400">
              <MapPin className="w-4 h-4" />
            </div>
            <select
              value={selectedMap.id}
              onChange={(e) => {
                const found = maps.find((m) => m.id === e.target.value);
                if (found) onSelectMap(found);
              }}
              className="w-full pl-8 pr-8 py-1.5 bg-slate-800/90 border border-slate-700 rounded-xl text-xs font-semibold text-slate-100 focus:outline-none focus:border-amber-400 transition-colors appearance-none cursor-pointer"
            >
              {maps.map((map) => (
                <option key={map.id} value={map.id} className="bg-slate-900 text-slate-200">
                  [{map.mode.toUpperCase()}] {map.name} ({map.environment})
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none text-slate-400 text-xs">
              ▼
            </div>
          </div>
        </div>

        {/* Collapsible Settings Drawer */}
        {isConfigOpen && (
          <div className="p-3 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col gap-3 animate-in fade-in slide-in-from-top-1">
            {/* Google Gemma 4 31B IT Settings Section */}
            <div className="flex flex-col gap-2 pb-2.5 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-emerald-400" />
                  IA Activa: 🟢 Google Gemma 4 31B IT
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold border border-emerald-500/30">
                  14.400 / día
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Modelo Activo:</span>
                  <span className="font-mono font-bold text-amber-300">gemma-4-31b-it</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Límite Diario:</span>
                  <span className="font-mono text-emerald-400 font-bold text-[10px]">14.400 peticiones / día (30 RPM)</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px] text-slate-400">
                  <span>Proveedor:</span>
                  <span className="font-mono text-slate-500">Google AI Studio API</span>
                </div>
              </div>
            </div>

            {/* Brawl Stars Player Tag Section */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-blue-400" />
                Sincronización de Cuenta (#TAG)
              </span>

              <form onSubmit={handleSyncSubmit} className="flex gap-1.5">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-2.5 flex items-center text-slate-500 text-xs font-mono font-bold">
                    #
                  </span>
                  <input
                    type="text"
                    placeholder="Tu Player Tag (ej: 2Y9UQL)"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value.toUpperCase())}
                    className="w-full pl-6 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-400 uppercase"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoadingPlayer}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                >
                  {isLoadingPlayer ? (
                    <span className="animate-spin text-xs">⏳</span>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      <span>Sincronizar</span>
                    </>
                  )}
                </button>
              </form>

              {/* Player Info Summary Chip */}
              {playerProfile && (
                <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 bg-slate-900/90 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-bold text-slate-200">{playerProfile.name}</span>
                    <span className="text-slate-400 font-mono">({playerProfile.tag})</span>
                  </div>
                  <div className="text-slate-400">
                    <span className="text-amber-400 font-bold">🏆 {playerProfile.trophies?.toLocaleString()}</span>
                    <span className="ml-2 font-semibold">
                      {playerProfile.brawlers?.filter((b) => b.power >= 9).length || 0} P9+
                    </span>
                  </div>
                </div>
              )}

              {playerProfile?.warning && (
                <div className="flex items-start gap-1.5 text-[10px] text-amber-400 bg-amber-950/30 p-2 rounded-lg border border-amber-800/40">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{playerProfile.warning}</span>
                </div>
              )}

              {playerError && (
                <div className="text-[11px] text-red-400 bg-red-950/30 p-2 rounded-lg border border-red-800/40">
                  {playerError}
                </div>
              )}
            </div>

            {/* Meta Database Sync Section */}
            <div className="flex flex-col gap-2 pt-2.5 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                  Base de Datos del Meta (BrawlAPI)
                </span>
                {lastUpdated && (
                  <span className="text-[10px] text-slate-400">
                    {new Date(lastUpdated).toLocaleDateString()}
                  </span>
                )}
              </div>

              <p className="text-[10px] text-slate-400 leading-relaxed">
                Descarga los brawlers oficiales y recalcula la matriz completa de counters y sinergias tácticas.
              </p>

              <button
                type="button"
                onClick={handleUpdateMeta}
                disabled={isUpdatingMeta}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 transition-all cursor-pointer shadow-md shadow-cyan-950/40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isUpdatingMeta ? 'animate-spin' : ''}`} />
                <span>{isUpdatingMeta ? 'Descargando Brawlers y Counters...' : 'Actualizar Datos del Meta'}</span>
              </button>

              {metaMessage && (
                <div className="text-[10.5px] text-slate-200 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  {metaMessage}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
