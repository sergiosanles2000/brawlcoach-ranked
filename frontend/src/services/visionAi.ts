import type { Brawler, GameMap, CountersMap } from '../types/brawl';
import { logger } from './logger';
import {
  queryBrawlPickStats,
  normalizeText,
  type BrawlPickAnalysisResult,
  MODE_ALIASES,
} from './brawlpickService';

export const GEMINI_API_KEY = typeof atob === 'function'
  ? atob('QVEuQWI4Uk42S252TEgxRTN1NE91S0dNTkJRTVJDbDc2MExHX1dpUXBEN0xWNF9scmhFanc=')
  : '';
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const FALLBACK_VISION_MODEL = 'gemma-4-31b-it';

export interface VisionDetectionResult {
  rawResponse: string;
  detectedMap: string | null;
  detectedMode: string | null;
  confidence: number;
  matchedMap: GameMap | null;
  brawlPickStats: BrawlPickAnalysisResult;
  modelUsed: string;
}

export interface VisionAnalysisParams {
  imageBase64: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
  allMaps: GameMap[];
  allBrawlers: Brawler[];
  countersData?: CountersMap;
  signal?: AbortSignal;
  onProgress?: (rawChunkText: string) => void;
}

/**
 * Compresses and resizes any base64 image via an off-screen HTML Canvas:
 * - Max width / height: 1024px maintaining aspect ratio
 * - Format: image/jpeg with quality 0.7
 * Reduces payload from ~8-15 MB to < 150 KB, preventing WebView 0.00s network rejection.
 */
export async function compressBase64Image(
  base64Data: string,
  maxWidth = 1024,
  quality = 0.7
): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return base64Data;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxWidth) {
        if (width >= height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Data);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      const approxBytes = Math.round((compressedDataUrl.length * 3) / 4);
      const sizeKb = (approxBytes / 1024).toFixed(1);

      logger.add(
        'CAPTURE',
        `Imagen comprimida (${width}x${height})`,
        `Peso optimizado: ${sizeKb} KB (calidad ${quality})`
      );

      resolve(compressedDataUrl);
    };

    img.onerror = () => {
      console.warn('compressBase64Image: error al cargar imagen en canvas, usando original');
      resolve(base64Data);
    };

    img.src = base64Data.startsWith('data:')
      ? base64Data
      : `data:image/jpeg;base64,${base64Data}`;
  });
}

// Compress and convert File/Blob to optimized JPEG base64 (max width 1024px, quality 0.7)
export async function optimizeImageForVision(
  file: File | Blob,
  maxWidth = 1024,
  quality = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const rawBase64 = e.target?.result as string;
        const compressed = await compressBase64Image(rawBase64, maxWidth, quality);
        resolve(compressed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Capture frame from active screen sharing video stream
export async function captureFrameFromStream(stream: MediaStream): Promise<string> {
  const track = stream.getVideoTracks()[0];
  const video = document.createElement('video');
  video.srcObject = stream;
  await video.play();

  let width = video.videoWidth || 1024;
  let height = video.videoHeight || 576;
  if (width > 1024) {
    height = Math.round((height * 1024) / width);
    width = 1024;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

  track.stop();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

  const approxBytes = Math.round((dataUrl.length * 3) / 4);
  const sizeKb = (approxBytes / 1024).toFixed(1);
  logger.add(
    'CAPTURE',
    `Frame de pantalla capturado (${canvas.width}x${canvas.height})`,
    `Peso aproximado: ${sizeKb} KB`
  );

  return dataUrl;
}

// Helper to call Google Gemini Vision API (500 free requests/day with gemini-3.5-flash-lite)
async function callGeminiVision(
  base64Image: string,
  apiKey: string,
  signal?: AbortSignal,
  onProgress?: (text: string) => void
): Promise<{ rawText: string; modelUsed: string }> {
  const cleanBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');
  const promptText = `Eres un extractor visual OCR de máxima precisión para pantallas de Brawl Stars.
Tu ÚNICA tarea es leer con exactitud el nombre del mapa y el modo de juego que aparecen en la esquina superior izquierda de la pantalla.
1. En grande en la pancarta superior está el MODO (ej: ATRACO, BALÓN BRAWL, CAZA ESTELAR, ATRAPAGEMAS, ZONA CALIENTE, NOQUEO, DESTRUCCIÓN).
2. Debajo en letra más pequeña está el NOMBRE EXACTO DEL MAPA (ej: "Patata caliente", "Zona Segura", "Aguas turbulentas", "Cañón explosivo", "Estadio central", "Mina rocosa", etc.).

MAPAS PRINCIPALES POR MODO:
- Heist (Atraco): Patata caliente (Hot Potato), Zona segura (Safe Zone), Cañón explosivo (Kaboom Canyon), Aguas turbulentas (Bridge Too Far), Hot Tubs, Jedna.
- Gem Grab (Atrapagemas): Mina rocosa (Hard Rock Mine), Cueva subterránea (Undermine), Doble dilema (Double Swoosh), Fuerte de gemas (Gem Fort).
- Brawl Ball (Balón Brawl): Estadio central (Center Stage), Sueños de pinball (Pinball Dreams), Campos furtivos (Sneaky Fields), En espiral (Spiraling Out), Triple regate (Triple Dribble).
- Hot Zone (Zona Caliente): Escarabajos en duelo (Dueling Beetles), Negocio abierto (Open Business), Jugadas paralelas (Parallel Plays), Anillo de fuego (Ring of Fire).
- Knockout (Noqueo): Roca de Belle (Belle's Rock), Fénix resplandeciente (Flaring Phoenix), Nuevos horizontes (New Horizons), A campo abierto (Out in the Open), Barranco de brazo dorado (Goldarm Gulch).
- Bounty (Caza Estelar): Estrella fugaz (Shooting Star), El escondite (Hideout), Pastel de capas (Layer Cake), Estación seca (Dry Season).

Responde EXCLUSIVAMENTE este JSON sin explicaciones ni markdown:
{"mapName": "nombre_exacto_del_mapa", "mode": "modo_de_juego", "confidence": 0.98}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 250,
    },
  };

  const modelsToTry = [GEMINI_MODEL, FALLBACK_VISION_MODEL];
  let lastErr = null;

  for (const modelToUse of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;
      const startTime = Date.now();
      logger.add('API_REQ', `Petición enviada a Google IA (${modelToUse})`, 'Identificando mapa y modo');

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
      if (response.ok) {
        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const answerParts = parts.filter((p: any) => !p.thought);
        const rawText = (answerParts.length > 0 ? answerParts : parts)
          .map((p: any) => p.text || '')
          .join('\n')
          .trim();

        logger.add('API_RES', `Google API OK (${durationSec}s)`, rawText.slice(0, 150));
        onProgress?.(rawText);
        return { rawText, modelUsed: `google/${modelToUse}` };
      } else {
        const errorBody = await response.text().catch(() => '');
        logger.add('ERROR', `Aviso Google HTTP ${response.status} (${durationSec}s)`, errorBody.slice(0, 100));
        lastErr = new Error(`HTTP ${response.status}`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || signal?.aborted) throw err;
      lastErr = err;
    }
  }

  throw new Error(`Los servidores de IA están ocupados. ${lastErr?.message || 'Reintenta en unos instantes'}`);
}

// Main Vision Analysis Call: Extracts Map & Mode and queries local BrawlPick database
export async function analyzeDraftScreenshot({
  imageBase64,
  apiKey,
  model: _model,
  allMaps,
  allBrawlers,
  countersData = {},
  signal,
  onProgress,
}: VisionAnalysisParams): Promise<VisionDetectionResult> {
  // 1. Force Canvas Compression before any network call (< 150KB)
  const compressedBase64 = await compressBase64Image(imageBase64, 1024, 0.7);

  let rawTextResponse = '';
  let effectiveModel = GEMINI_MODEL;

  try {
    const geminiKey = (apiKey && !apiKey.startsWith('sk-')) ? apiKey : GEMINI_API_KEY;
    console.log(`[Gemini Vision] Reconociendo mapa con: ${GEMINI_MODEL}...`);
    const res = await callGeminiVision(compressedBase64, geminiKey, signal, onProgress);
    rawTextResponse = res.rawText;
    effectiveModel = res.modelUsed;
  } catch (err: any) {
    if (err.name === 'AbortError' || signal?.aborted) throw err;
    throw new Error(`Error en Visión Gemini: ${err.message}`);
  }

  // 2. Extracción tolerante de JSON
  let cleanText = rawTextResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleanText = cleanText.replace(/```json/gi, '').replace(/```/g, '').trim();

  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');

  let parsed: {
    mapName?: string;
    map?: string;
    mode?: string;
    confidence?: number;
  } | null = null;

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      parsed = JSON.parse(cleanText.substring(firstBrace, lastBrace + 1));
    } catch (err) {
      try {
        const sanitized = cleanText
          .substring(firstBrace, lastBrace + 1)
          .replace(/,\s*([\]}])/g, '$1')
          .replace(/[\u0000-\u0019]+/g, ' ');
        parsed = JSON.parse(sanitized);
      } catch {}
    }
  }

  if (!parsed) {
    const rawFirstBrace = rawTextResponse.indexOf('{');
    const rawLastBrace = rawTextResponse.lastIndexOf('}');
    if (rawFirstBrace !== -1 && rawLastBrace !== -1 && rawLastBrace > rawFirstBrace) {
      try {
        parsed = JSON.parse(rawTextResponse.substring(rawFirstBrace, rawLastBrace + 1));
      } catch {}
    }
  }

  const rawMapName = parsed?.mapName || parsed?.map || null;
  const rawMode = parsed?.mode || null;
  const confidence = typeof parsed?.confidence === 'number' ? parsed.confidence : 0.9;

  // 3. Consulta inmediata de estadísticas en BrawlPick (Local < 10ms)
  const brawlPickStats = queryBrawlPickStats({
    queryMapName: rawMapName,
    queryMode: rawMode,
    allBrawlers,
    countersData,
  });

  // 4. Buscar coincidencia en GameMap local para entornos/imágenes existentes
  let matchedMap: GameMap | null = null;
  if (rawMapName) {
    const cleanQuery = normalizeText(rawMapName);
    matchedMap =
      allMaps.find((m) => normalizeText(m.name) === cleanQuery) ||
      allMaps.find(
        (m) => normalizeText(m.name).includes(cleanQuery) || cleanQuery.includes(normalizeText(m.name))
      ) ||
      null;
  }

  if (!matchedMap && rawMode) {
    const modeClean = normalizeText(rawMode);
    const standardMode = MODE_ALIASES[modeClean] || modeClean;
    matchedMap =
      allMaps.find((m) => normalizeText(m.mode) === normalizeText(standardMode)) ||
      null;
  }

  const logDisplayName =
    brawlPickStats.englishName &&
    normalizeText(brawlPickStats.englishName) !== normalizeText(brawlPickStats.matchedMapName)
      ? `${brawlPickStats.matchedMapName} (${brawlPickStats.englishName})`
      : brawlPickStats.matchedMapName;

  logger.add(
    'SUCCESS',
    `Mapa reconocido: ${logDisplayName} [${brawlPickStats.status}]`,
    `Modo: ${brawlPickStats.matchedMode} | Top Picks cargados: ${brawlPickStats.topPicks.length}`
  );

  return {
    rawResponse: rawTextResponse,
    detectedMap: rawMapName,
    detectedMode: rawMode,
    confidence,
    matchedMap,
    brawlPickStats,
    modelUsed: effectiveModel,
  };
}
