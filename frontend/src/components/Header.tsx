import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Trophy,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  SlidersHorizontal,
  MapPin,
  Server,
  RefreshCw,
  Terminal,
  Key,
  Maximize2,
  Eye,
  Layers,
  X,
} from 'lucide-react';
import type { GameMap, PlayerProfile, Brawler, CountersMap } from '../types/brawl';
import { syncMetaFromApi, getLastUpdatedMeta } from '../services/metaSync';

export const STORAGE_CUSTOM_API_KEY = 'brawl_user_custom_gemini_key';

export const getModeBadgeColor = (mode: string) => {
  switch (mode?.toLowerCase()) {
    case 'brawl ball':
      return 'bg-emerald-950/70 border border-emerald-500/50 text-emerald-300';
    case 'gem grab':
      return 'bg-purple-950/70 border border-purple-500/50 text-purple-300';
    case 'heist':
      return 'bg-rose-950/70 border border-rose-500/50 text-rose-300';
    case 'hot zone':
      return 'bg-amber-950/70 border border-amber-500/50 text-amber-300';
    case 'knockout':
      return 'bg-orange-950/70 border border-orange-500/50 text-orange-300';
    case 'bounty':
      return 'bg-cyan-950/70 border border-cyan-500/50 text-cyan-300';
    default:
      return 'bg-slate-800 border border-slate-700 text-slate-300';
  }
};

interface HeaderProps {
  maps: GameMap[];
  selectedMap: GameMap;
  onSelectMap: (map: GameMap) => void;
  playerProfile: PlayerProfile | null;
  onlyRankedReady: boolean;
  onToggleOnlyRankedReady: () => void;
  onResetDraft: () => void;
  onOpenCapture?: () => void;
  lmEndpoint?: string;
  onChangeLmEndpoint?: (endpoint: string) => void;
  lmModel?: string;
  onChangeLmModel?: (model: string) => void;
  isConfigOpen: boolean;
  onToggleConfig: () => void;
  onMetaUpdated?: (brawlers: Brawler[], counters: CountersMap) => void;
  onOpenLogs?: () => void;
  onNavigateProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  maps,
  selectedMap,
  onSelectMap,
  playerProfile,
  onlyRankedReady,
  onToggleOnlyRankedReady,
  onResetDraft,
  isConfigOpen,
  onToggleConfig,
  onMetaUpdated,
  onOpenLogs,
  onNavigateProfile,
}) => {
  const [isUpdatingMeta, setIsUpdatingMeta] = useState(false);
  const [metaMessage, setMetaMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(() => getLastUpdatedMeta());
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return localStorage.getItem(STORAGE_CUSTOM_API_KEY) || '';
  });

  const [isMapModalOpen, setIsMapModalOpen] = useState(false);

  const handleSaveCustomApiKey = (key: string) => {
    const trimmed = key.trim();
    setCustomApiKey(trimmed);
    if (trimmed) {
      localStorage.setItem(STORAGE_CUSTOM_API_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_CUSTOM_API_KEY);
    }
  };

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

  const mapImgSrc = selectedMap.imageUrl || selectedMap.cdnUrl || (selectedMap.mapId ? `https://cdn.brawlify.com/maps/regular/${selectedMap.mapId}.png` : undefined);

  return (
    <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800 sticky top-0 z-30 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top,0.75rem))]">
      <div className="max-w-4xl mx-auto flex flex-col gap-2">
        {/* Top bar with Branding and essential actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg overflow-hidden border border-slate-700/80 flex items-center justify-center shrink-0 bg-slate-900">
              <img src="/app-icon.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black tracking-tight text-white uppercase">
                  BrawlDraft
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Filter Toggle */}
            <button
              onClick={onToggleOnlyRankedReady}
              className={`text-[11px] px-2 py-1 rounded-lg font-medium flex items-center gap-1 transition-colors border cursor-pointer ${
                onlyRankedReady
                  ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="Filtrar por brawlers propios a nivel 9 o superior"
            >
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>P9+</span>
            </button>

            {/* Reset Draft */}
            <button
              onClick={onResetDraft}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-red-950/40 hover:border-red-500/40 border border-slate-700 text-slate-300 hover:text-red-400 transition-colors cursor-pointer"
              title="Reiniciar Draft"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Live Logs Console Button */}
            {onOpenLogs && (
              <button
                onClick={onOpenLogs}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer"
                title="Consola de Logs en Vivo"
              >
                <Terminal className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Settings Toggle */}
            <button
              onClick={onToggleConfig}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isConfigOpen
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
              title="Configuración y Meta"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
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

        {/* Selected Map Visual Card with Thumbnail & Tap-to-Enlarge */}
        {selectedMap && (
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-slate-950/70 border border-slate-800/90 rounded-xl">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Map Thumbnail */}
              {mapImgSrc ? (
                <div
                  onClick={() => setIsMapModalOpen(true)}
                  className="relative w-11 h-11 rounded-lg overflow-hidden border border-slate-700 bg-slate-900 shrink-0 cursor-pointer group shadow-sm hover:border-amber-400 transition-all"
                  title="Toca para ampliar el mapa"
                >
                  <img
                    src={mapImgSrc}
                    alt={selectedMap.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => {
                      if (selectedMap.cdnUrl && (e.target as HTMLImageElement).src !== selectedMap.cdnUrl) {
                        (e.target as HTMLImageElement).src = selectedMap.cdnUrl;
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-3 h-3 text-white drop-shadow" />
                  </div>
                </div>
              ) : null}

              {/* Map Info & Mode Badge */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-white truncate">
                    {selectedMap.name}
                  </span>
                  <span className={`text-[9.5px] px-1.5 py-0.2 rounded font-bold uppercase ${getModeBadgeColor(selectedMap.mode)}`}>
                    {selectedMap.mode}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3 text-slate-500" />
                    {selectedMap.environment}
                  </span>
                </div>
              </div>
            </div>

            {/* Tap to View Full Layout Button */}
            <button
              type="button"
              onClick={() => setIsMapModalOpen(true)}
              className="text-[11px] px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer shrink-0 transition-colors shadow-sm"
              title="Ver plano del mapa en grande"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Ver mapa</span>
            </button>
          </div>
        )}

        {/* Collapsible Settings Drawer */}
        {isConfigOpen && (
          <div className="p-3 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col gap-3 animate-in fade-in slide-in-from-top-1">
            {/* Engine Status */}
            <div className="flex flex-col gap-2 pb-2.5 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-cyan-400" />
                  Motor de Análisis
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono border border-slate-700">
                  Gemma 31B
                </span>
              </div>
            </div>

            {/* Custom Gemini API Key (User Own Key with Fallback) */}
            <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  Tu Clave Gemini API (Opcional)
                </span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-cyan-400 hover:underline font-mono"
                >
                  Obtener gratis ↗
                </a>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                Si pegas tu propia clave de Google AI Studio, la app la usará prioritariamente. Si falla o se agota, hará <span className="text-emerald-400 font-bold">callback automático</span> a la del sistema (Gemma 31B/Gemini).
              </p>
              <div className="flex gap-1.5 mt-1">
                <input
                  type="password"
                  placeholder="AIzaSy... (o déjalo vacío para usar la compartida)"
                  value={customApiKey}
                  onChange={(e) => handleSaveCustomApiKey(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 font-mono"
                />
                {customApiKey && (
                  <button
                    onClick={() => handleSaveCustomApiKey('')}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs"
                    title="Borrar clave"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between text-[9.5px] text-slate-500 pt-0.5">
                <span>Estado: {customApiKey ? '🟢 Clave personalizada activa' : '⚪ Usando clave compartida + fallback'}</span>
              </div>
            </div>

            {/* Brawl Stars Player Profile Status */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-blue-400" />
                  Perfil de Jugador
                </span>
                {onNavigateProfile && (
                  <button
                    onClick={() => {
                      onToggleConfig();
                      onNavigateProfile();
                    }}
                    className="text-[10.5px] text-blue-400 hover:text-blue-300 underline font-medium cursor-pointer"
                  >
                    Cambiar Tag ➔
                  </button>
                )}
              </div>

              {playerProfile ? (
                <div className="flex items-center justify-between text-[11px] px-2.5 py-2 bg-slate-900 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-bold text-slate-200">{playerProfile.name}</span>
                    <span className="text-slate-400 font-mono">({playerProfile.tag})</span>
                  </div>
                  <div className="text-slate-400">
                    <span className="text-amber-400 font-bold">🏆 {playerProfile.trophies?.toLocaleString()}</span>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 bg-slate-900 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                  <span>Sin vincular</span>
                  {onNavigateProfile && (
                    <button
                      onClick={() => {
                        onToggleConfig();
                        onNavigateProfile();
                      }}
                      className="px-2 py-1 bg-blue-600 text-white rounded text-[10px] font-bold"
                    >
                      Vincular ahora
                    </button>
                  )}
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

      {/* Full Map Inspection Modal (Mounted directly to document.body to escape header constraints) */}
      {isMapModalOpen && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 pt-[max(1rem,env(safe-area-inset-top,1rem))] pb-[max(1rem,env(safe-area-inset-bottom,1rem))] animate-in fade-in duration-150"
            onClick={() => setIsMapModalOpen(false)}
          >
            <div
              className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-sm w-full flex flex-col shadow-2xl overflow-hidden max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Fixed Header */}
              <div className="flex items-center justify-between border-b border-slate-800 p-3 bg-slate-900/95 shrink-0">
                <div className="min-w-0 pr-2">
                  <h3 className="text-sm font-black text-white flex items-center gap-1.5 truncate">
                    <span>🗺️ {selectedMap.name}</span>
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[9.5px] px-1.5 py-0.5 rounded font-bold uppercase ${getModeBadgeColor(selectedMap.mode)}`}>
                      {selectedMap.mode}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate">
                      {selectedMap.environment}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMapModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-rose-600 active:scale-95 text-slate-300 hover:text-white flex items-center justify-center border border-slate-700 transition-colors cursor-pointer shrink-0"
                  title="Cerrar plano"
                >
                  <X className="w-4 h-4 font-bold" />
                </button>
              </div>

              {/* Scrollable Map Body */}
              <div className="p-3 overflow-y-auto flex-1 flex flex-col gap-3">
                {/* Map Full Image Display */}
                {mapImgSrc ? (
                  <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center p-2 min-h-[160px]">
                    <img
                      src={mapImgSrc}
                      alt={selectedMap.name}
                      className="max-h-[38vh] w-auto object-contain rounded-lg shadow-inner"
                      onError={(e) => {
                        if (selectedMap.cdnUrl && (e.target as HTMLImageElement).src !== selectedMap.cdnUrl) {
                          (e.target as HTMLImageElement).src = selectedMap.cdnUrl;
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Imagen no disponible para este mapa
                  </div>
                )}

                {/* Strategic Advice */}
                <div className="bg-slate-950/70 rounded-xl p-2.5 border border-slate-800/80 text-[11px] text-slate-300 space-y-1">
                  <div className="font-semibold text-amber-400 flex items-center gap-1">
                    <span>💡 Análisis del Terreno:</span>
                  </div>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    {selectedMap.environment === 'Wall-Heavy'
                      ? 'Mapa con abundantes estructuras y muros. Lanzadores (Throwers), tanques para emboscadas y brawlers con rebote como Rico o Ruffs son prioritarios.'
                      : selectedMap.environment === 'Open'
                      ? 'Mapa abierto de largo alcance. Francotiradores (Snipers) como Piper, Angelo o Brock dominan los carriles.'
                      : 'Estructura mixta con calles despejadas y arbustos de cobertura. Controla el carril central y usa brawlers con buena movilidad o control de área.'}
                  </p>
                </div>
              </div>

              {/* Modal Fixed Footer with Clear Action */}
              <div className="p-2.5 border-t border-slate-800 bg-slate-900/95 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsMapModalOpen(false)}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-98 text-xs font-bold text-slate-200 border border-slate-700 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-rose-400" />
                  <span>Cerrar plano</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
};
