import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  ScreenShare,
  X,
  Sparkles,
  Check,
  AlertTriangle,
  RotateCcw,
  Zap,
  StopCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { registerPlugin, Capacitor } from '@capacitor/core';
import type { Brawler, GameMap } from '../types/brawl';
import {
  compressBase64Image,
  optimizeImageForVision,
  captureFrameFromStream,
  analyzeDraftScreenshot,
  type VisionDetectionResult,
} from '../services/visionAi';

interface ScreenCapturePluginType {
  captureScreen(): Promise<{ base64: string }>;
}

const ScreenCapture = registerPlugin<ScreenCapturePluginType>('ScreenCapture');

interface CaptureOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  lmEndpoint: string;
  lmModel: string;
  allMaps: GameMap[];
  allBrawlers: Brawler[];
  countersData?: Record<string, any>;
  onApplyResults: (result: VisionDetectionResult) => void;
  onOpenSettings: () => void;
}

export const CaptureOverlay: React.FC<CaptureOverlayProps> = ({
  isOpen,
  onClose,
  lmEndpoint,
  lmModel,
  allMaps,
  allBrawlers,
  countersData = {},
  onApplyResults,
  onOpenSettings,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [rawStreamingText, setRawStreamingText] = useState('');
  const [showConsole, setShowConsole] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detectionResult, setDetectionResult] = useState<VisionDetectionResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Paste image listener
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            const base64 = await optimizeImageForVision(file, 1024, 0.7);
            setSelectedImage(base64);
            handleTriggerAnalysis(base64);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, lmEndpoint, lmModel]);

  // Cancel ongoing analysis immediately
  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsAnalyzing(false);
    setError('Análisis cancelado por el usuario.');
  };

  // Handle File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await optimizeImageForVision(file, 1024, 0.7);
      setSelectedImage(base64);
      handleTriggerAnalysis(base64);
    } catch (err: any) {
      setError('Error al procesar la imagen: ' + err.message);
      setIsAnalyzing(false);
    }
  };

  // Handle Live Screen Capture (Native MediaProjection on Android, web fallback on desktop)
  const handleScreenCapture = async () => {
    setError(null);
    try {
      let rawBase64 = '';
      if (Capacitor.isNativePlatform()) {
        const result = await ScreenCapture.captureScreen();
        rawBase64 = result.base64;
      } else {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'window' } as any,
        });
        rawBase64 = await captureFrameFromStream(stream);
      }

      if (rawBase64) {
        // Compress with Canvas before storing and analyzing
        const compressed = await compressBase64Image(rawBase64, 1024, 0.7);
        setSelectedImage(compressed);
        handleTriggerAnalysis(compressed);
      }
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        setError('Error al capturar pantalla: ' + (err.message || String(err)));
      }
      setIsAnalyzing(false);
    }
  };

  // Trigger Analysis with real-time streaming and abort control
  const handleTriggerAnalysis = async (base64Image: string) => {
    setIsAnalyzing(true);
    setError(null);
    setDetectionResult(null);
    setRawStreamingText('');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Force Canvas compression (< 150KB)
      const compressedImage = await compressBase64Image(base64Image, 1024, 0.7);
      setSelectedImage(compressedImage);

      const result = await analyzeDraftScreenshot({
        imageBase64: compressedImage,
        endpoint: lmEndpoint,
        model: lmModel,
        allMaps,
        allBrawlers,
        countersData,
        signal: controller.signal,
        onProgress: (chunkText) => {
          setRawStreamingText(chunkText);
        },
      });

      setDetectionResult(result);

      // Single-shot analysis: apply immediately and close
      onApplyResults(result);
      handleReset();
      onClose();
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        setError('Análisis cancelado por el usuario.');
      } else {
        setError(err.message || 'Error al analizar la pantalla con Google Gemini');
      }
    } finally {
      setIsAnalyzing(false);
      abortControllerRef.current = null;
    }
  };

  // Apply manually if user reviewed preview
  const handleConfirm = () => {
    if (!detectionResult) return;
    onApplyResults(detectionResult);
    handleReset();
    onClose();
  };

  const handleReset = () => {
    handleCancelAnalysis();
    setSelectedImage(null);
    setDetectionResult(null);
    setRawStreamingText('');
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-100">
                  Escaneo de Pantalla
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Detecta mapa, picks y bans automáticamente
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              handleCancelAnalysis();
              onClose();
            }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto flex flex-col gap-3">
          {/* Action triggers (when no image or analyzing) */}
          {!selectedImage && (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                {/* Live Screen Grab */}
                <button
                  onClick={handleScreenCapture}
                  disabled={isAnalyzing}
                  className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gradient-to-b from-blue-900/40 to-slate-800/80 border border-blue-600/50 hover:border-blue-400 active:scale-95 transition-all text-center gap-2 group cursor-pointer disabled:opacity-50"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                    <ScreenShare className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-200">
                    Capturar Pantalla en Vivo
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Un toque con MediaProjection
                  </span>
                </button>

                {/* Upload File */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnalyzing}
                  className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gradient-to-b from-purple-900/40 to-slate-800/80 border border-purple-600/50 hover:border-purple-400 active:scale-95 transition-all text-center gap-2 group cursor-pointer disabled:opacity-50"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                    <Upload className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-200">
                    Subir Captura
                  </span>
                  <span className="text-[10px] text-slate-400">
                    O pega con Ctrl + V
                  </span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                <span>¿Servidor en otra IP o puerto?</span>
                <button
                  onClick={onOpenSettings}
                  className="text-amber-400 font-bold hover:underline cursor-pointer"
                >
                  Cambiar en Ajustes
                </button>
              </div>
            </div>
          )}

          {/* Image Preview & Scanning Status */}
          {selectedImage && (
            <div className="relative rounded-2xl overflow-hidden border border-slate-700 bg-black aspect-video max-h-48 flex items-center justify-center">
              <img
                src={selectedImage}
                alt="Captura"
                className="w-full h-full object-contain"
              />

              {/* Scanning Laser Line when analyzing */}
              {isAnalyzing && (
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent animate-pulse flex flex-col items-center justify-center backdrop-blur-[1px]">
                  <div className="w-full h-0.5 bg-cyan-400 shadow-[0_0_15px_#22d3ee] animate-bounce" />
                  <div className="mt-2 px-3 py-1 rounded-full bg-slate-950/90 border border-cyan-500/60 text-cyan-300 text-xs font-bold flex items-center gap-1.5 shadow-lg">
                    <Sparkles className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    <span>Analizando con Google Gemini...</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cancel Button during active analysis */}
          {isAnalyzing && (
            <button
              onClick={handleCancelAnalysis}
              className="w-full py-2.5 bg-red-600/90 hover:bg-red-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-900/40 flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
            >
              <StopCircle className="w-4 h-4" />
              <span>🛑 Cancelar análisis</span>
            </button>
          )}

          {/* Streaming & Thinking Raw Output Console */}
          {(isAnalyzing || rawStreamingText) && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden text-xs">
              <div
                onClick={() => setShowConsole(!showConsole)}
                className="px-3 py-2 bg-slate-900/90 flex items-center justify-between cursor-pointer border-b border-slate-800/80"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-slate-300">
                    Progreso / Respuesta IA:
                  </span>
                  {isAnalyzing && (
                    <span className="flex items-center gap-1 text-cyan-400 text-[10px] font-mono animate-pulse font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> Transmitiendo
                    </span>
                  )}
                </div>
                <div className="text-slate-400 hover:text-white">
                  {showConsole ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </div>
              </div>

              {showConsole && (
                <div className="p-2.5 font-mono text-[11px] text-emerald-400 max-h-36 overflow-y-auto leading-relaxed">
                  <pre className="whitespace-pre-wrap font-mono">
                    {rawStreamingText || 'Esperando respuesta del modelo...'}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Results Summary */}
          {detectionResult && (
            <div className="flex flex-col gap-2.5 p-3 rounded-2xl bg-slate-950/80 border border-slate-800 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-emerald-400 flex items-center gap-1">
                  <Check className="w-4 h-4 text-emerald-400" />
                  Detección Completada
                </span>
                <button
                  onClick={handleReset}
                  className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Otra captura
                </button>
              </div>

              {/* Detected Map & Mode */}
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-900 rounded-xl text-xs">
                <span className="text-slate-400 font-medium">Mapa / Modo:</span>
                <span className="font-bold text-amber-300">
                  {detectionResult.matchedMap
                    ? `[${detectionResult.matchedMap.mode}] ${detectionResult.matchedMap.name}`
                    : detectionResult.detectedMap || detectionResult.detectedMode || 'No identificado'}
                </span>
              </div>

              {/* Confidence & BrawlPick Status */}
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-900/60 rounded-xl text-xs">
                <span className="text-slate-400 font-medium">Confianza IA:</span>
                <span className="font-bold text-cyan-300">
                  {Math.round((detectionResult.confidence || 0.95) * 100)}%
                </span>
              </div>

              {/* BrawlPick Database Match */}
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Fuente de datos:</span>
                  <span className="font-bold text-amber-300">BrawlPick ({detectionResult.brawlPickStats.updatedAt})</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Total batallas analizadas:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {detectionResult.brawlPickStats.totalBattles > 0
                      ? `${detectionResult.brawlPickStats.totalBattles.toLocaleString()} partidas`
                      : 'Muestra insuficiente'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Picks disponibles:</span>
                  <span className="text-slate-200 font-bold">
                    {detectionResult.brawlPickStats.topPicks.length} brawlers fiables
                  </span>
                </div>
              </div>

              {/* Confirm / Apply button */}
              <button
                onClick={handleConfirm}
                className="w-full mt-1 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-900/40 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-white" />
                <span>Ver Picks y Estadísticas de BrawlPick</span>
              </button>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>Error en el Escaneo de Pantalla</span>
              </div>
              <p className="text-[11px] text-red-200/80 leading-relaxed">{error}</p>
              <div className="mt-1 flex items-center justify-between">
                <button
                  onClick={onOpenSettings}
                  className="text-amber-400 font-bold hover:underline text-[10px] cursor-pointer"
                >
                  Ver Ajustes
                </button>
                {selectedImage && (
                  <button
                    onClick={() => handleTriggerAnalysis(selectedImage)}
                    className="text-xs font-bold text-white bg-red-800/60 px-2 py-1 rounded hover:bg-red-700 cursor-pointer"
                  >
                    Reintentar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
