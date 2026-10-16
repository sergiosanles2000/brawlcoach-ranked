import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  UserPlus,
  MessageCircle,
  Check,
  X,
  Send,
  ArrowLeft,
  Search,
  Clock,
} from 'lucide-react';
import type { PlayerProfile } from '../types/brawl';
import {
  fetchFriendsData,
  sendFriendRequest,
  respondFriendRequest,
  fetchFriendMessages,
  sendFriendMessage,
  type FriendItem,
  type FriendRequestItem,
  type FriendChatMessage,
} from '../services/friendsService';
import { fetchPlayerProfile } from '../services/api';

interface FriendsScreenProps {
  myProfile: PlayerProfile | null;
  onNavigateProfile?: () => void;
}

export const FriendsScreen: React.FC<FriendsScreenProps> = ({ myProfile }) => {
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestItem[]>([]);

  // Add friend form
  const [searchTag, setSearchTag] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<PlayerProfile | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Active Direct Chat with Friend
  const [activeFriend, setActiveFriend] = useState<FriendItem | null>(null);
  const [messages, setMessages] = useState<FriendChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const myTag = myProfile?.tag || '#GGJ2QLJY';
  const myName = myProfile?.name || 'SergioSR';

  const loadData = async () => {
    try {
      const data = await fetchFriendsData(myTag);
      setFriends(data.friends);
      setIncoming(data.pendingIncoming);
      setOutgoing(data.pendingOutgoing);
    } catch (e) {
      console.error('Error loading friends data:', e);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [myTag]);

  // Load chat messages when activeFriend changes
  useEffect(() => {
    if (!activeFriend) return;
    const loadMsgs = async () => {
      const msgs = await fetchFriendMessages(myTag, activeFriend.tag);
      setMessages(msgs);
    };
    loadMsgs();
    const interval = setInterval(loadMsgs, 2500);
    return () => clearInterval(interval);
  }, [activeFriend, myTag]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSearchPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = searchTag.trim().replace(/^#/, '');
    if (!clean) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);
    setActionSuccess(null);

    try {
      const profile = await fetchPlayerProfile(clean);
      setSearchResult(profile);
    } catch (err: any) {
      setSearchError(err.message || 'No se encontró ningún jugador con ese tag.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async () => {
    if (!searchResult) return;
    try {
      const res = await sendFriendRequest(myTag, searchResult.tag, myName, searchResult.name);
      if (res.success) {
        setActionSuccess(`¡Solicitud enviada a ${searchResult.name}!`);
        setSearchResult(null);
        setSearchTag('');
        loadData();
      } else {
        setSearchError(res.message || 'Error al enviar solicitud.');
      }
    } catch (err: any) {
      setSearchError(err.message || 'Error de conexión');
    }
  };

  const handleRespond = async (senderTag: string, accept: boolean, senderName?: string) => {
    try {
      await respondFriendRequest(myTag, senderTag, accept, myName, senderName);
      loadData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFriend || !chatInput.trim()) return;

    const text = chatInput.trim();
    setChatInput('');

    try {
      const msg = await sendFriendMessage(myTag, activeFriend.tag, text);
      setMessages((prev) => [...prev, msg]);
    } catch (err: any) {
      alert('Error enviando mensaje: ' + err.message);
    }
  };

  // IF CHATTING WITH A FRIEND
  if (activeFriend) {
    return (
      <div className="flex flex-col h-[calc(100vh-130px)] max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* Chat Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveFriend(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-black text-xs text-blue-400">
              {activeFriend.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-xs font-bold text-white">{activeFriend.name}</div>
              <div className="text-[10px] font-mono text-slate-400">{activeFriend.tag}</div>
            </div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Amigo Conectado
          </span>
        </div>

        {/* Message Area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
              <MessageCircle className="w-8 h-8 mb-2 opacity-40 text-blue-400" />
              <p className="text-xs font-medium text-slate-400">Aún no hay mensajes con {activeFriend.name}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">¡Escríbele para coordinar vuestro draft de Ranked!</p>
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.senderTag.replace(/^#/, '') === myTag.replace(/^#/, '');
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[78%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                      isMe
                        ? 'bg-blue-600 text-white rounded-br-none shadow-sm'
                        : 'bg-slate-800 text-slate-100 rounded-bl-none border border-slate-700/60'
                    }`}
                  >
                    <div>{m.text}</div>
                    <div
                      className={`text-[9px] mt-0.5 font-mono text-right ${
                        isMe ? 'text-blue-200' : 'text-slate-400'
                      }`}
                    >
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} className="p-2 bg-slate-950 border-t border-slate-800 flex gap-2 shrink-0">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={`Mensaje a ${activeFriend.name}...`}
            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={!chatInput.trim()}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto space-y-3.5 pb-4">
      {/* Search & Add Friend Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Añadir Amigo por #TAG</h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Brawl Stars Tag</span>
        </div>

        <form onSubmit={handleSearchPlayer} className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-2.5 text-xs font-mono font-bold text-slate-500">#</span>
            <input
              type="text"
              value={searchTag}
              onChange={(e) => setSearchTag(e.target.value.toUpperCase())}
              placeholder="EJ: 28CJRQJVJP"
              className="w-full pl-7 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 uppercase tracking-wider"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span>{isSearching ? 'Buscando...' : 'Buscar'}</span>
          </button>
        </form>

        {searchError && (
          <div className="mt-2 text-[11px] text-rose-400 bg-rose-950/40 p-2 rounded-xl border border-rose-800/40">
            {searchError}
          </div>
        )}

        {actionSuccess && (
          <div className="mt-2 text-[11px] text-emerald-400 bg-emerald-950/40 p-2 rounded-xl border border-emerald-800/40">
            {actionSuccess}
          </div>
        )}

        {/* Found Profile Card */}
        {searchResult && (
          <div className="mt-3 p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center font-black text-xs text-cyan-300">
                {searchResult.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-xs font-bold text-white">{searchResult.name}</div>
                <div className="text-[10px] text-slate-400">
                  {searchResult.tag} • 🏆 {searchResult.trophies?.toLocaleString()}
                </div>
              </div>
            </div>
            <button
              onClick={handleSendRequest}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold active:scale-95 transition-all cursor-pointer"
            >
              Enviar Solicitud
            </button>
          </div>
        )}
      </div>

      {/* Pending Incoming Requests */}
      {incoming.length > 0 && (
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-3.5 shadow-sm space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Solicitudes Recibidas ({incoming.length})</span>
          </div>

          <div className="space-y-1.5">
            {incoming.map((req) => (
              <div
                key={req.tag}
                className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-white">{req.name}</div>
                  <div className="text-[10px] font-mono text-slate-400">{req.tag}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleRespond(req.tag, true, req.name)}
                    className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer"
                    title="Aceptar"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRespond(req.tag, false)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 text-xs font-bold transition-all cursor-pointer"
                    title="Rechazar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing Pending Requests */}
      {outgoing.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Solicitudes Enviadas ({outgoing.length})</span>
          </div>
          <div className="space-y-1.5">
            {outgoing.map((req) => (
              <div
                key={req.tag}
                className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-white">{req.name}</div>
                  <div className="text-[10px] font-mono text-slate-400">{req.tag}</div>
                </div>
                <span className="text-[10px] text-amber-400 font-medium">Esperando respuesta...</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Mis Amigos ({friends.length})</h3>
          </div>
          <span className="text-[10px] text-slate-400">Toca para chatear</span>
        </div>

        {friends.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
            <p className="font-medium text-slate-400">Aún no tienes amigos agregados</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Introduce el #TAG de un amigo arriba para enviarle solicitud y hablar por chat.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {friends.map((f) => (
              <div
                key={f.tag}
                onClick={() => setActiveFriend(f)}
                className="p-2.5 bg-slate-950/70 hover:bg-slate-800/80 border border-slate-800/80 hover:border-blue-500/50 rounded-xl flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-black text-xs text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    {f.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{f.name}</div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {f.lastMessage ? (
                        <span className="text-slate-300 truncate max-w-[170px] inline-block align-bottom">
                          {f.lastMessage.text}
                        </span>
                      ) : (
                        f.tag
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-600/10 text-blue-400 border border-blue-500/20 group-hover:bg-blue-600 group-hover:text-white transition-all">
                    <MessageCircle className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
