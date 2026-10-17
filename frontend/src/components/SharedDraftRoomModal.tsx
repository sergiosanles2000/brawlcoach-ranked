import React, { useState, useEffect } from 'react';
import { Share2, Copy, Check, Radio, X } from 'lucide-react';
import type { GameMap } from '../types/brawl';

interface SharedDraftRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  myTag: string;
  selectedMap: GameMap;
  allyPicks: (string | null)[];
  enemyPicks: (string | null)[];
  allyBans: (string | null)[];
  enemyBans: (string | null)[];
  onApplySyncedDraft: (mapId: string, allies: (string | null)[], enemies: (string | null)[], allyB: (string | null)[], enemyB: (string | null)[]) => void;
}

export const SharedDraftRoomModal: React.FC<SharedDraftRoomModalProps> = ({
  isOpen,
  onClose,
  myTag,
  selectedMap,
  allyPicks,
  enemyPicks,
  allyBans,
  enemyBans,
  onApplySyncedDraft,
}) => {
  const [roomCode, setRoomCode] = useState(() => {
    return localStorage.getItem('brawldraft_active_room') || '';
  });
  const [inputCode, setInputCode] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Auto-sync out if we are in a room
  useEffect(() => {
    if (!isOpen || !roomCode) return;

    const syncDraftOut = async () => {
      try {
        await fetch('/api/draft/room/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomCode,
            hostTag: myTag,
            mapId: selectedMap.id,
            allyPicks,
            enemyPicks,
            allyBans,
            enemyBans,
          }),
        });
      } catch (e) {}
    };

    syncDraftOut();
    const interval = setInterval(syncDraftOut, 3000);
    return () => clearInterval(interval);
  }, [isOpen, roomCode, selectedMap, allyPicks, enemyPicks, allyBans, enemyBans, myTag]);

  // Auto-poll in if we are listening to a room
  const handleJoinRoom = async (codeToJoin?: string) => {
    const code = (codeToJoin || inputCode).trim().toUpperCase();
    if (!code) return;

    setIsSyncing(true);
    setStatusMsg(null);

    try {
      const res = await fetch(`/api/draft/room/${code}`);
      if (res.ok) {
        const data = await res.json();
        const r = data.room;
        setRoomCode(code);
        localStorage.setItem('brawldraft_active_room', code);
        onApplySyncedDraft(r.mapId, r.allyPicks, r.enemyPicks, r.allyBans, r.enemyBans);
        setStatusMsg(`✅ Conectado a la sala ${code}`);
      } else {
        setStatusMsg('❌ Sala no encontrada en el servidor.');
      }
    } catch (e: any) {
      setStatusMsg('❌ Error conectando: ' + (e.message || String(e)));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateNewRoom = () => {
    const newCode = 'BD-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    setRoomCode(newCode);
    localStorage.setItem('brawldraft_active_room', newCode);
    setStatusMsg(`🎉 Sala ${newCode} creada. Pásale el código a tus compañeros.`);
  };

  const handleCopyCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeaveRoom = () => {
    setRoomCode('');
    localStorage.removeItem('brawldraft_active_room');
    setStatusMsg('Has salido de la sala.');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl p-4 shadow-2xl flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                Compartir Draft en Tiempo Real
              </h3>
              <p className="text-[10px] text-slate-400">Sincroniza tus picks con tus compañeros</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Active Room Status */}
        {roomCode ? (
          <div className="p-3 bg-slate-950 border border-cyan-500/40 rounded-2xl flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold text-slate-300 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Sala Activa:</span>
              </span>
              <span className="text-sm font-black font-mono text-cyan-300 tracking-wider">
                {roomCode}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCopyCode}
                className="flex-1 py-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '¡Copiado!' : 'Copiar Código'}</span>
              </button>
              <button
                onClick={handleLeaveRoom}
                className="py-1.5 px-3 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-300 text-xs font-bold transition-all cursor-pointer"
              >
                Salir
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              onClick={handleCreateNewRoom}
              className="w-full py-2.5 px-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:opacity-90 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Crear Nueva Sala de Draft</span>
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-2 text-[10px] text-slate-500 font-mono">O UNIRTE</span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="EJ: BD-9X2L"
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder:text-slate-600 uppercase tracking-wider focus:outline-none focus:border-cyan-400"
              />
              <button
                onClick={() => handleJoinRoom()}
                disabled={isSyncing || !inputCode.trim()}
                className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                {isSyncing ? 'Conectando...' : 'Unirse'}
              </button>
            </div>
          </div>
        )}

        {statusMsg && (
          <div className="text-[11px] text-slate-300 bg-slate-950/70 p-2 rounded-xl border border-slate-800 text-center">
            {statusMsg}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};
