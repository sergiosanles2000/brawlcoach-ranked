import React, { useState } from 'react';
import { Download, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import type { UpdateInfo } from '../services/updateService';
import { downloadAndInstall } from '../services/updateService';

interface UpdateModalProps {
  updateInfo: UpdateInfo | null;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ updateInfo, onClose }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (!updateInfo || !updateInfo.hasUpdate) {
    return null;
  }

  const handleUpdate = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadAndInstall(updateInfo.apkDownloadUrl);
      onClose();
    } catch (err: any) {
      setDownloadError(err.message || 'Error al descargar o instalar la actualización.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#12161f] border border-slate-700/80 rounded-2xl p-5 max-w-sm w-full shadow-2xl relative overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
            <Download className="w-5 h-5 animate-bounce" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Nueva Versión Disponible</h3>
            <p className="text-[11px] text-slate-400">
              v{updateInfo.currentVersion} ➔ <span className="text-emerald-400 font-bold">v{updateInfo.latestVersion}</span>
            </p>
          </div>
        </div>

        {/* Release Notes */}
        <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 text-xs text-slate-300 max-h-40 overflow-y-auto mb-4 whitespace-pre-wrap leading-relaxed">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Novedades del parche</span>
          </div>
          {updateInfo.releaseNotes || 'Mejoras en el escaneo de mapa y rendimiento general.'}
        </div>

        {downloadError && (
          <div className="mb-3 p-2.5 rounded-xl bg-red-950/40 border border-red-800/40 text-[11px] text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{downloadError}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={isDownloading}
            className="flex-1 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Más tarde
          </button>
          <button
            onClick={handleUpdate}
            disabled={isDownloading}
            className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-xs font-bold text-white transition-all shadow-md shadow-emerald-950/50 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {isDownloading ? (
              <>
                <span className="animate-spin text-xs">⏳</span>
                <span>Descargando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Actualizar Ahora</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
