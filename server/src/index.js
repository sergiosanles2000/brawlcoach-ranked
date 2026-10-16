import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { LRUCache } from 'lru-cache';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { generateMockPlayer } from './mockData.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const BRAWL_STARS_API_KEY = process.env.BRAWL_STARS_API_KEY;

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// LRU Cache for player profiles (10 minutes TTL, max 500 entries)
const playerCache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 10,
});

// Helper to load JSON data
async function loadJson(filename) {
  const filePath = path.join(__dirname, 'data', filename);
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasApiKey: Boolean(BRAWL_STARS_API_KEY),
  });
});

// Metadata endpoints
app.get('/api/meta/brawlers', async (req, res) => {
  try {
    const brawlers = await loadJson('brawlers.json');
    res.json(brawlers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load brawlers', details: err.message });
  }
});

app.get('/api/meta/counters', async (req, res) => {
  try {
    const counters = await loadJson('counters.json');
    res.json(counters);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load counters', details: err.message });
  }
});

app.get('/api/meta/maps', async (req, res) => {
  try {
    const maps = await loadJson('maps.json');
    res.json(maps);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load maps', details: err.message });
  }
});

// Player Tag Endpoint
app.get('/api/player/:tag', async (req, res) => {
  const rawTag = req.params.tag;
  const cleanTag = rawTag.trim().replace(/^#/, '').toUpperCase();

  if (!cleanTag) {
    return res.status(400).json({ error: 'Invalid player tag' });
  }

  // Check cache first
  const cached = playerCache.get(cleanTag);
  if (cached) {
    return res.json({ ...cached, fromCache: true });
  }

  // If no API key configured, use intelligent mock
  if (!BRAWL_STARS_API_KEY) {
    console.log(`[API Fallback] No BRAWL_STARS_API_KEY configured. Returning mock player for #${cleanTag}`);
    const mock = generateMockPlayer(cleanTag);
    playerCache.set(cleanTag, mock);
    return res.json({
      ...mock,
      warning: 'API Key no configurada en el servidor. Mostrando perfil simulado Ranked-Ready.',
    });
  }

  // Supercell requires tag URL-encoded with %23
  const encodedTag = `%23${cleanTag}`;
  const targetUrl = `https://api.brawlstars.com/v1/players/${encodedTag}`;

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        Authorization: `Bearer ${BRAWL_STARS_API_KEY}`,
        Accept: 'application/json',
      },
      timeout: 5000,
    });

    const playerData = response.data;
    playerCache.set(cleanTag, playerData);
    res.json(playerData);
  } catch (error) {
    const status = error.response?.status;
    const errorDetails = error.response?.data?.message || error.message;

    console.warn(`[Supercell API Error ${status}]:`, errorDetails);

    // If 403 (IP whitelist issue) or 404/500, fallback to mock so app keeps working
    if (status === 403 || status === 404 || error.code === 'ECONNABORTED' || !error.response) {
      console.log(`[API Fallback] Returning mock profile for #${cleanTag} due to Supercell error ${status || error.code}`);
      const mock = generateMockPlayer(cleanTag);
      playerCache.set(cleanTag, mock);
      return res.json({
        ...mock,
        warning: status === 403 
          ? 'Error 403: La IP del servidor no está en la lista blanca de Supercell. Usando perfil simulado.' 
          : `Error en la API de Brawl Stars (${status || error.code}). Usando perfil simulado.`,
      });
    }

    res.status(status || 500).json({
      error: 'Error al consultar el perfil de Supercell',
      details: errorDetails,
    });
  }
});

// OpenRouter Free Vision API Proxy
app.post('/api/vision/analyze', async (req, res) => {
  const { imageBase64, model = 'openrouter/free' } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: 'Falta la imagen en base64' });
  }

  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
  const targetUrl = 'https://openrouter.ai/api/v1/chat/completions';

  const formattedImage = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const buildPayload = (selectedModel) => ({
    model: selectedModel,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Detecta en esta pantalla de Brawl Stars Ranked los brawlers y el mapa. Responde ÚNICAMENTE en JSON: {"map": "nombre", "mode": "modo", "allies": ["brawlers aliados"], "enemies": ["brawlers rivales"]}',
          },
          {
            type: 'image_url',
            image_url: {
              url: formattedImage,
            },
          },
        ],
      },
    ],
    temperature: 0.1,
  });

  const headers = {
    'Authorization': `Bearer ${OPENROUTER_KEY}`,
    'HTTP-Referer': 'https://brawlcoach.app',
    'X-Title': 'BrawlCoach',
    'Content-Type': 'application/json',
  };

  try {
    console.log(`[OpenRouter] Sending vision payload using model: ${model}...`);
    const response = await axios.post(targetUrl, buildPayload(model), { headers, timeout: 45000 });
    return res.json(response.data);
  } catch (error) {
    console.warn(`[OpenRouter ${model} failed]:`, error.response?.data || error.message);
    const fallbackModel = 'meta-llama/llama-3.2-11b-vision-instruct:free';
    if (model !== fallbackModel) {
      try {
        console.log(`[OpenRouter] Trying fallback model: ${fallbackModel}...`);
        const fallbackRes = await axios.post(targetUrl, buildPayload(fallbackModel), { headers, timeout: 45000 });
        return res.json(fallbackRes.data);
      } catch (fbErr) {
        console.error('[OpenRouter Fallback Error]:', fbErr.message);
      }
    }

    const details =
      error.response?.data?.error?.message ||
      (typeof error.response?.data === 'string' ? error.response.data : JSON.stringify(error.response?.data)) ||
      error.message;
    res.status(error.response?.status || 500).json({
      error: 'Error en OpenRouter API',
      details,
    });
  }
});

// OpenRouter Health / Status
app.get('/api/vision/status', (req, res) => {
  res.json({
    status: 'ok',
    provider: 'OpenRouter Free',
    defaultModel: 'openrouter/free',
    backupModel: 'meta-llama/llama-3.2-11b-vision-instruct:free',
    cost: '$0.00',
  });
});

// Serve compiled APK without polluting frontend/public bundle
app.get('/download/apk', (req, res) => {
  const apkPath = path.resolve(__dirname, '../../frontend/dist/brawlcoach-modmenu.apk');
  res.download(apkPath, 'brawlcoach-modmenu.apk');
});

app.listen(PORT, () => {
  console.log(`🎮 Brawl Stars Draft Assistant Server running on http://localhost:${PORT}`);
});
