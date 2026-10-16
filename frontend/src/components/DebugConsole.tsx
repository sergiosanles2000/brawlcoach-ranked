import React, { useState, useEffect } from 'react';
import {
  Terminal,
  X,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Camera,
  ArrowUpRight,
  ArrowDownLeft,
  Info,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { logger, type LogEntry } from '../services/logger';

interface DebugConsoleProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DebugConsole: React.FC<DebugConsoleProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'API' | 'CAPTURE' | 'ERROR'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsubscribe = logger.subscribe((newLogs) => {
      setLogs(newLogs);
    });
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (filter === 'API') return log.type === 'API_REQ' || log.type === 'API_RES' || log.type === 'SUCCESS';
    if (filter === 'CAPTURE') return log.type === 'CAPTURE';
    if (filter === 'ERROR') return log.type === 'ERROR';
    return true;
  });

  const handleCopyLogs = () => {
    const text = logs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.type}] ${l.title}${l.details ? `\n  Detalles: ${l.details}` : ''}${
            l.rawPayload ? `\n  Payload: ${JSON.stringify(l.rawPayload)}` : ''
          }`
      )
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getTypeBadge = (type: LogEntry['type']) => {
    switch (type) {
      case 'CAPTURE':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-300 border border-purple-700/50">
            <Camera className="w-3 h-3" /> CAPTURA
          </span>
        );
      case 'API_REQ':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-700/50">
            <ArrowUpRight className="w-3 h-3" /> ENVIADO
          </span>
        );
      case 'API_RES':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
            <ArrowDownLeft className="w-3 h-3" /> RESPUESTA
          </span>
        );
      case 'SUCCESS':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
            <Check className="w-3 h-3" /> ÉXITO
          </span>
        );
      case 'ERROR':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-700/50">
            <AlertCircle className="w-3 h-3" /> ERROR
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            <Info className="w-3 h-3" /> INFO
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 animate-in fade-in">
      <div className="w-full max-w-2xl bg-slate-950 border border-slate-700 rounded-3xl shadow-2xl flex flex-col h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-3.5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800/50">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black uppercase text-slate-100">
                  Consola de Logs en Vivo
                </span>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded font-mono font-bold">
                  {logs.length} eventos
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400">
                Monitoreo en tiempo real de capturas, red y respuestas de Google Gemini
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyLogs}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Copiar historial completo"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={() => logger.clear()}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 text-slate-300 hover:text-red-400 transition-colors cursor-pointer"
              title="Limpiar logs"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-3 py-2 border-b border-slate-800/80 bg-slate-900/40 flex items-center gap-1.5 text-xs">
          <span className="text-[11px] text-slate-500 font-semibold mr-1">Filtrar:</span>
          {(['ALL', 'API', 'CAPTURE', 'ERROR'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-lg font-bold text-[10.5px] transition-all cursor-pointer ${
                filter === f
                  ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-900/50'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {f === 'ALL' ? 'Todos' : f === 'API' ? 'Red / API' : f === 'CAPTURE' ? 'Capturas' : 'Errores'}
            </button>
          ))}
        </div>

        {/* Log Stream Body */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 font-mono text-[11px]">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 py-12">
              <Terminal className="w-8 h-8 mb-2 opacity-30" />
              <p>No hay eventos registrados en esta categoría.</p>
              <p className="text-[10px] mt-1 text-slate-600">
                Los eventos de captura y llamadas de visión aparecerán aquí en vivo.
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = expandedId === log.id;
              return (
                <div
                  key={log.id}
                  className={`p-2.5 rounded-xl border transition-all ${
                    log.type === 'ERROR'
                      ? 'bg-red-950/20 border-red-800/40 text-red-200'
                      : log.type === 'API_RES'
                      ? 'bg-emerald-950/20 border-emerald-800/30 text-emerald-200'
                      : log.type === 'API_REQ'
                      ? 'bg-blue-950/20 border-blue-800/30 text-blue-200'
                      : log.type === 'CAPTURE'
                      ? 'bg-purple-950/20 border-purple-800/30 text-purple-200'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300'
                  }`}
                >
                  <div
                    className="flex items-start justify-between gap-2 cursor-pointer select-none"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-slate-500 font-mono">{log.timestamp}</span>
                      {getTypeBadge(log.type)}
                      <span className="font-bold text-slate-200">{log.title}</span>
                    </div>

                    {(log.details || log.rawPayload) && (
                      <span className="text-slate-500 hover:text-slate-300 shrink-0">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </span>
                    )}
                  </div>

                  {log.details && (
                    <div className="mt-1.5 text-[10.5px] opacity-90 break-words whitespace-pre-wrap font-sans">
                      {log.details}
                    </div>
                  )}

                  {isExpanded && log.rawPayload && (
                    <div className="mt-2 pt-2 border-t border-slate-800/80">
                      <span className="text-[9.5px] font-bold text-slate-400 block mb-1">
                        Respuesta Bruta Completa:
                      </span>
                      <pre className="p-2 bg-black/60 rounded-lg text-[10px] text-amber-200/90 overflow-x-auto whitespace-pre-wrap font-mono max-h-48">
                        {typeof log.rawPayload === 'string'
                          ? log.rawPayload
                          : JSON.stringify(log.rawPayload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
