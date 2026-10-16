import { useState, useMemo, useEffect } from 'react';
import { Camera, Zap, Shield, MessageSquare, User } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import brawlersData from './data/brawlers.json';
import countersData from './data/counters.json';
import mapsData from './data/maps.json';

import type {
  Brawler,
  GameMap,
  CountersMap,
  PlayerProfile,
} from './types/brawl';

import { Header } from './components/Header';
import { TurnTimer } from './components/TurnTimer';
import { DraftSlots, type ActiveSlotType } from './components/DraftSlots';
import { Recommendations } from './components/Recommendations';
import { BrawlerPickerModal } from './components/BrawlerPickerModal';
import { CaptureOverlay } from './components/CaptureOverlay';
import { DebugConsole } from './components/DebugConsole';
import { BrawlChat } from './components/BrawlChat';
import { SplashScreen } from './components/SplashScreen';
import { PlayerProfileScreen } from './components/PlayerProfileScreen';
import { UpdateModal } from './components/UpdateModal';
import { checkForAppUpdates, type UpdateInfo } from './services/updateService';
import { calculateDraftRecommendations } from './services/draftEngine';
import { queryBrawlPickStats, normalizeText } from './services/brawlpickService';
import type { VisionDetectionResult } from './services/visionAi';
import { fetchPlayerProfile } from './services/api';
import { launchFloatingModMenu } from './services/floatingOverlay';
import { getStoredBrawlers, getStoredCounters } from './services/metaSync';

const typedBrawlers = brawlersData as Brawler[];
const typedCounters = countersData as CountersMap;
const typedMaps = mapsData as GameMap[];

const STORAGE_ENDPOINT_KEY = 'brawl_lm_endpoint';
const STORAGE_MODEL_KEY = 'brawl_lm_model';

export function App() {
  // Dynamic Brawlers and Counters state (synced with LocalStorage / BrawlAPI)
  const [brawlers, setBrawlers] = useState<Brawler[]>(() => getStoredBrawlers(typedBrawlers));
  const [counters, setCounters] = useState<CountersMap>(() => getStoredCounters(typedCounters));

  const handleMetaUpdated = (newBrawlers: Brawler[], newCounters: CountersMap) => {
    setBrawlers(newBrawlers);
    setCounters(newCounters);
  };

  // Current game map
  const [selectedMap, setSelectedMap] = useState<GameMap>(typedMaps[0]);

  // Draft state (3 picks and 3 bans per team)
  const [allyPicks, setAllyPicks] = useState<(string | null)[]>([null, null, null]);
  const [enemyPicks, setEnemyPicks] = useState<(string | null)[]>([null, null, null]);
  const [allyBans, setAllyBans] = useState<(string | null)[]>([null, null, null]);
  const [enemyBans, setEnemyBans] = useState<(string | null)[]>([null, null, null]);

  // Active slot for manual picking
  const [activeSlot, setActiveSlot] = useState<ActiveSlotType>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // LM Studio Vision settings
  const [lmEndpoint, setLmEndpoint] = useState<string>(() => {
    return localStorage.getItem(STORAGE_ENDPOINT_KEY) || 'http://192.168.0.56:1234';
  });
  const [lmModel, setLmModel] = useState<string>(() => {
    return localStorage.getItem(STORAGE_MODEL_KEY) || 'loaded-model';
  });

  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'draft' | 'chat' | 'profile'>('draft');
  const [showSplash, setShowSplash] = useState(true);

  // User Player Profile state
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [isLoadingPlayer, setIsLoadingPlayer] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [onlyRankedReady, setOnlyRankedReady] = useState(true);

  // Auto-update state
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  // Auto-sync initial player tag and check for updates on startup
  useEffect(() => {
    const savedTag = localStorage.getItem('brawl_player_tag') || 'GGJ2QLJY';
    handleSyncPlayer(savedTag);

    // Check GitHub releases in background
    checkForAppUpdates().then((info) => {
      if (info?.hasUpdate) {
        setUpdateInfo(info);
      }
    });
  }, []);

  // Persist LM Studio settings
  useEffect(() => {
    localStorage.setItem(STORAGE_ENDPOINT_KEY, lmEndpoint);
  }, [lmEndpoint]);

  useEffect(() => {
    localStorage.setItem(STORAGE_MODEL_KEY, lmModel);
  }, [lmModel]);

  // Set of all chosen brawlers (for disabling in picker)
  const unavailableNames = useMemo(() => {
    return new Set<string>([
      ...allyPicks.filter((p): p is string => Boolean(p)),
      ...enemyPicks.filter((p): p is string => Boolean(p)),
      ...allyBans.filter((b): b is string => Boolean(b)),
      ...enemyBans.filter((b): b is string => Boolean(b)),
    ]);
  }, [allyPicks, enemyPicks, allyBans, enemyBans]);

  // Instant Recommendations Engine (<10ms)
  const recommendations = useMemo(() => {
    return calculateDraftRecommendations({
      allBrawlers: brawlers,
      map: selectedMap,
      allyPicks: allyPicks.filter((p): p is string => Boolean(p)),
      enemyPicks: enemyPicks.filter((p): p is string => Boolean(p)),
      bannedBrawlers: [
        ...allyBans.filter((b): b is string => Boolean(b)),
        ...enemyBans.filter((b): b is string => Boolean(b)),
      ],
      countersData: counters,
      playerProfile,
      onlyRankedReady,
    });
  }, [
    brawlers,
    counters,
    selectedMap,
    allyPicks,
    enemyPicks,
    allyBans,
    enemyBans,
    playerProfile,
    onlyRankedReady,
  ]);


  // Real-time BrawlPick Statistics & Adaptive Draft Engine (<10ms local query)
  const brawlPickStats = useMemo(() => {
    return queryBrawlPickStats({
      queryMapName: selectedMap.name,
      queryMode: selectedMap.mode,
      allBrawlers: brawlers,
      countersData: counters,
      allyPicks: allyPicks.filter((p): p is string => Boolean(p)),
      enemyPicks: enemyPicks.filter((p): p is string => Boolean(p)),
      bannedBrawlers: [
        ...allyBans.filter((b): b is string => Boolean(b)),
        ...enemyBans.filter((b): b is string => Boolean(b)),
      ],
    });
  }, [selectedMap, brawlers, counters, allyPicks, enemyPicks, allyBans, enemyBans]);

  // Apply recommended 3-brawler optimal team into ally slots
  const handleApplyOptimalTeam = (teamBrawlerNames: string[]) => {
    setAllyPicks([
      teamBrawlerNames[0] || null,
      teamBrawlerNames[1] || null,
      teamBrawlerNames[2] || null,
    ]);
  };

  // Quick Sync Player Tag Handler
  const handleSyncPlayer = async (tag: string) => {
    setIsLoadingPlayer(true);
    setPlayerError(null);
    try {
      const profile = await fetchPlayerProfile(tag);
      setPlayerProfile(profile);
    } catch (err: any) {
      setPlayerError(err.message || 'Error al conectar con la API');
    } finally {
      setIsLoadingPlayer(false);
    }
  };

  // Open picker modal on slot click
  const handleSelectSlot = (slot: ActiveSlotType) => {
    setActiveSlot(slot);
    setIsPickerOpen(true);
  };

  // Assign brawler to active slot
  const handleAssignBrawler = (brawlerName: string) => {
    if (!activeSlot) return;

    const { team, type, index } = activeSlot;

    if (type === 'pick') {
      if (team === 'ally') {
        const next = [...allyPicks];
        next[index] = brawlerName;
        setAllyPicks(next);
      } else {
        const next = [...enemyPicks];
        next[index] = brawlerName;
        setEnemyPicks(next);
      }
    } else {
      if (team === 'ally') {
        const next = [...allyBans];
        next[index] = brawlerName;
        setAllyBans(next);
      } else {
        const next = [...enemyBans];
        next[index] = brawlerName;
        setEnemyBans(next);
      }
    }

    setIsPickerOpen(false);
    setActiveSlot(null);
  };

  // Clear slot
  const handleClearSlot = (team: 'ally' | 'enemy', type: 'pick' | 'ban', index: number) => {
    if (type === 'pick') {
      if (team === 'ally') {
        const next = [...allyPicks];
        next[index] = null;
        setAllyPicks(next);
      } else {
        const next = [...enemyPicks];
        next[index] = null;
        setEnemyPicks(next);
      }
    } else {
      if (team === 'ally') {
        const next = [...allyBans];
        next[index] = null;
        setAllyBans(next);
      } else {
        const next = [...enemyBans];
        next[index] = null;
        setEnemyBans(next);
      }
    }
  };

  // Quick pick from recommendations into the first available ally slot
  const handleQuickPick = (brawlerName: string) => {
    const emptyIndex = allyPicks.findIndex((p) => p === null);
    if (emptyIndex !== -1) {
      const next = [...allyPicks];
      next[emptyIndex] = brawlerName;
      setAllyPicks(next);
    } else {
      // If full, replace first
      const next = [...allyPicks];
      next[0] = brawlerName;
      setAllyPicks(next);
    }
  };

  // Quick ban from recommendations into first empty ally ban slot
  const handleQuickBan = (brawlerName: string) => {
    const emptyIndex = allyBans.findIndex((b) => b === null);
    if (emptyIndex !== -1) {
      const next = [...allyBans];
      next[emptyIndex] = brawlerName;
      setAllyBans(next);
    } else {
      const next = [...allyBans];
      next[0] = brawlerName;
      setAllyBans(next);
    }
  };

  // Reset Draft
  const handleResetDraft = () => {
    setAllyPicks([null, null, null]);
    setEnemyPicks([null, null, null]);
    setAllyBans([null, null, null]);
    setEnemyBans([null, null, null]);
    setActiveSlot(null);
  };

  // Apply Vision Detection Results from Google Gemini & BrawlPick
  const handleApplyVisionResults = (result: VisionDetectionResult) => {
    // 1. Update Map immediately in header and state if recognized
    if (result.matchedMap) {
      setSelectedMap(result.matchedMap);
    } else if (result.brawlPickStats?.matchedMapName) {
      const query = normalizeText(result.brawlPickStats.matchedMapName);
      const found = typedMaps.find(
        (m) => normalizeText(m.name) === query || normalizeText(m.name).includes(query)
      );
      if (found) {
        setSelectedMap(found);
      }
    }
  };

  // Handler to activate native Floating Mod Menu Overlay over Brawl Stars
  const handleToggleFloatingOverlay = async () => {
    if (!Capacitor.isNativePlatform()) {
      alert('ℹ️ El Overlay Flotante ("Mod Menu") está diseñado para Android y requiere la app nativa instalada en tu teléfono para flotar sobre Brawl Stars.');
      return;
    }

    try {
      const res = await launchFloatingModMenu({
        brawlers,
        counters,
        maps: typedMaps,
        currentMapId: selectedMap.id,
        apiKey: typeof atob === 'function' ? atob('QVEuQWI4Uk42S252TEgxRTN1NE91S0dNTkJRTVJDbDc2MExHX1dpUXBEN0xWNF9scmhFanc=') : '',
        model: 'gemma-4-31b-it',
        playerProfile: playerProfile || undefined,
      });

      if (res?.needsPermission) {
        alert(
          'Para que la burbuja flote sobre Brawl Stars, concede el permiso de "Mostrar sobre otras aplicaciones" en los Ajustes que se abrirán a continuación.'
        );
      }
    } catch (err: any) {
      alert('Error al iniciar overlay: ' + (err.message || String(err)));
    }
  };

  // Auto-determine current turn description
  const totalPicks = allyPicks.filter(Boolean).length + enemyPicks.filter(Boolean).length;
  const isAllyTurn = totalPicks % 2 === 0;
  const turnDescription =
    totalPicks >= 6
      ? 'Draft Completo'
      : isAllyTurn
      ? `Turno Aliado (Pick ${allyPicks.filter(Boolean).length + 1})`
      : `Turno Rival (Pick ${enemyPicks.filter(Boolean).length + 1})`;

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans pb-16">
      {/* Animated App Splash Screen */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}

      {/* Sticky Top Header */}
      <Header
        maps={typedMaps}
        selectedMap={selectedMap}
        onSelectMap={setSelectedMap}
        playerProfile={playerProfile}
        isLoadingPlayer={isLoadingPlayer}
        playerError={playerError}
        onSyncPlayer={handleSyncPlayer}
        onlyRankedReady={onlyRankedReady}
        onToggleOnlyRankedReady={() => setOnlyRankedReady(!onlyRankedReady)}
        onResetDraft={handleResetDraft}
        onOpenCapture={() => setIsCaptureOpen(true)}
        lmEndpoint={lmEndpoint}
        onChangeLmEndpoint={setLmEndpoint}
        lmModel={lmModel}
        onChangeLmModel={setLmModel}
        isConfigOpen={isConfigOpen}
        onToggleConfig={() => setIsConfigOpen(!isConfigOpen)}
        onMetaUpdated={handleMetaUpdated}
        onOpenLogs={() => setIsLogsOpen(true)}
      />

      {/* Navigation Tabs (Draft Board vs Coach Chat vs Player Profile) */}
      <div className="w-full max-w-lg mx-auto px-3 pt-2.5">
        <div className="grid grid-cols-3 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs font-semibold gap-1">
          <button
            onClick={() => setActiveTab('draft')}
            className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'draft'
                ? 'bg-slate-800 text-white font-bold border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-slate-300" />
            <span className="truncate">Draft</span>
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer relative ${
              activeTab === 'chat'
                ? 'bg-slate-800 text-white font-bold border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-slate-300" />
            <span className="truncate">Estrategia</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-slate-800 text-white font-bold border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5 text-amber-400" />
            <span className="truncate">Mi Perfil</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Draft Board */}
      {activeTab === 'draft' ? (
        <>
          {/* Main Content Area */}
          <main className="w-full max-w-lg mx-auto px-3 py-2.5 flex flex-col gap-3">
            {/* Prominent Floating Mod Menu Overlay Button */}
            <button
              onClick={handleToggleFloatingOverlay}
              className="w-full py-2.5 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs border border-slate-800 flex items-center justify-between active:scale-[0.99] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <Zap className="w-3.5 h-3.5" />
                </span>
                <span>Superposición Flotante</span>
              </div>
              <span className="text-[10.5px] bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">
                Burbuja Activa
              </span>
            </button>

            {/* Turn Timer & Indicator */}
            <TurnTimer
              initialSeconds={20}
              activeTurnDescription={turnDescription}
              isAllyTurn={isAllyTurn}
            />

            {/* 6-Slot Draft Board (Picks and Bans) */}
            <DraftSlots
              allyPicks={allyPicks}
              enemyPicks={enemyPicks}
              allyBans={allyBans}
              enemyBans={enemyBans}
              allBrawlers={brawlers}
              activeSlot={activeSlot}
              onSelectSlot={handleSelectSlot}
              onClearSlot={handleClearSlot}
            />

            {/* Real-time Recommendation List with BrawlPick Statistics */}
            <Recommendations
              brawlPickStats={brawlPickStats}
              selectedMap={selectedMap}
              maps={typedMaps}
              onSelectMap={setSelectedMap}
              onRescan={() => setIsCaptureOpen(true)}
              onQuickPick={handleQuickPick}
              onQuickBan={handleQuickBan}
              onApplyOptimalTeam={handleApplyOptimalTeam}
            />
          </main>

          {/* Floating Action Buttons Container for 1-Thumb Screen Scan & Mod Menu */}
          <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2">
            <button
              onClick={handleToggleFloatingOverlay}
              className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white shadow-lg border border-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
              title="Superposición flotante"
            >
              <Zap className="w-5 h-5 text-amber-400" />
            </button>
            <button
              onClick={() => setIsCaptureOpen(true)}
              className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg border border-emerald-500 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
              title="Escanear Pantalla"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>
        </>
      ) : activeTab === 'chat' ? (
        /* Tab 2: Coach Chat */
        <main className="w-full max-w-lg mx-auto px-3 py-2.5">
          <BrawlChat
            currentMap={selectedMap}
            allyPicks={allyPicks}
            enemyPicks={enemyPicks}
            allyBans={allyBans}
            enemyBans={enemyBans}
            recommendations={recommendations}
            allBrawlers={brawlers}
          />
        </main>
      ) : (
        /* Tab 3: Player Profile & Inventory */
        <main className="w-full max-w-lg mx-auto px-1 py-1">
          <PlayerProfileScreen
            playerProfile={playerProfile}
            isLoadingPlayer={isLoadingPlayer}
            playerError={playerError}
            onSyncPlayer={handleSyncPlayer}
            onlyRankedReady={onlyRankedReady}
            onToggleOnlyRankedReady={() => setOnlyRankedReady(!onlyRankedReady)}
          />
        </main>
      )}

      {/* Modal for manual Picking/Banning */}
      <BrawlerPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        allBrawlers={brawlers}
        unavailableNames={unavailableNames}
        activeSlot={activeSlot}
        onSelectBrawler={handleAssignBrawler}
      />

      {/* Capture Overlay Modal */}
      <CaptureOverlay
        isOpen={isCaptureOpen}
        onClose={() => setIsCaptureOpen(false)}
        lmEndpoint={lmEndpoint}
        lmModel={lmModel}
        allMaps={typedMaps}
        allBrawlers={brawlers}
        countersData={counters}
        onApplyResults={handleApplyVisionResults}
        onOpenSettings={() => {
          setIsCaptureOpen(false);
          setIsConfigOpen(true);
        }}
      />

      {/* Live Debug Console Modal */}
      <DebugConsole
        isOpen={isLogsOpen}
        onClose={() => setIsLogsOpen(false)}
      />

      {/* Auto-Update Modal */}
      <UpdateModal
        updateInfo={updateInfo}
        onClose={() => setUpdateInfo(null)}
      />
    </div>
  );
}

export default App;
