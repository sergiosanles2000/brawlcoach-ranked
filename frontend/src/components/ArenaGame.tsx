import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, RotateCcw, Trophy, Skull, Swords, Loader2 } from 'lucide-react';
import type { Brawler } from '../types/brawl';

interface ArenaGameProps {
  allBrawlers: Brawler[];
  onExit: () => void;
}

type Phase = 'menu' | 'playing' | 'over';

/* ============================== Configuración ============================== */
// Mapa real de Brawl Stars (ya incluido en la app): Atrapagemas - Hard Rock Mine
const MAP_URL = '/maps/gg-hard-rock-mine.png';
const MAP_COLS = 21; // Todos los mapas de Brawl Stars tienen 21 columnas

const PLAYER_SPEED = 198;
const ENEMY_SPEED = 116;
const PLAYER_RADIUS = 20;
const ENEMY_RADIUS = 19;

const PLAYER_MAX_HP = 140;
const ENEMY_MAX_HP = 88;
const PLAYER_DMG = 24;
const ENEMY_DMG = 9;

const BULLET_SPEED = 560;
const BULLET_RADIUS = 5;

const AMMO_MAX = 3;
const RELOAD_TIME = 1.35; // por bala
const SHOOT_COOLDOWN = 0.3;
const ENEMY_FIRE_CD = 1.25;
const ENEMY_RANGE = 330;

const REGEN_DELAY = 3.4;
const REGEN_RATE = 30;

const STICK_R = 46;
const WAVE_PAUSE = 3.2;
const BEST_KEY = 'arena_survival_best';

/* ================================= Tipos ================================== */
interface Vec { x: number; y: number; }

interface Arena {
  img: HTMLImageElement;
  cols: number;
  rows: number;
  tile: number;
  worldW: number;
  worldH: number;
  grid: Uint8Array; // 0 = suelo, 1 = muro, 2 = arbusto
}

interface Fighter {
  id: number;
  isPlayer: boolean;
  pos: Vec;
  vel: Vec;
  radius: number;
  hp: number;
  maxHp: number;
  aim: number;
  fireCd: number;
  ammo: number;
  reload: number;
  alive: boolean;
  hurtT: number;
  bob: number;
  dmg: number;
  model: HTMLImageElement | null; // render 3D de cuerpo completo
  icon: HTMLImageElement | null;  // respaldo (carita)
  name: string;
}

interface Bullet { pos: Vec; vel: Vec; fromPlayer: boolean; life: number; }
interface Particle { pos: Vec; vel: Vec; life: number; max: number; color: string; size: number; }
interface Stick { active: boolean; pointerId: number; base: Vec; knob: Vec; }

interface Game {
  arena: Arena;
  W: number;
  H: number;
  dpr: number;
  player: Fighter;
  enemies: Fighter[];
  bullets: Bullet[];
  particles: Particle[];
  wave: number;
  kills: number;
  time: number;
  waveTimer: number;
  spawnQueue: number;
  spawnTimer: number;
  score: number;
  over: boolean;
  cam: Vec;
  zoom: number;
  left: Stick;
  right: Stick;
  keys: Set<string>;
  raf: number;
  onFinish: (score: number, kills: number, wave: number, time: number) => void;
}

/* ================================ Helpers ================================= */
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

// Render 3D real del brawler (CDN público con CORS habilitado)
const MODEL_URL = (id: number) => `https://cdn.brawlify.com/brawlers/model/${id}.png`;
const SPRITE_H = (radius: number) => radius * 3.3;

// Tinte rojo para los enemigos (cacheado por imagen)
const tintCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
function getTintedModel(img: HTMLImageElement): HTMLCanvasElement {
  const cached = tintCache.get(img);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cx = c.getContext('2d');
  if (cx) {
    cx.drawImage(img, 0, 0);
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = 'rgba(220,38,38,0.5)';
    cx.fillRect(0, 0, c.width, c.height);
    cx.globalCompositeOperation = 'source-over';
  }
  tintCache.set(img, c);
  return c;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* Lectura de la rejilla real del mapa desde su imagen */
function loadArena(url: string): Promise<Arena> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const tile = img.naturalWidth / MAP_COLS;
        const cols = MAP_COLS;
        const rows = Math.round(img.naturalHeight / tile);

        // Reducimos la imagen a 1 píxel por casilla => el color medio de cada casilla
        const c = document.createElement('canvas');
        c.width = cols;
        c.height = rows;
        const cx = c.getContext('2d');
        if (!cx) return reject(new Error('Canvas no disponible'));
        cx.drawImage(img, 0, 0, cols, rows);
        const data = cx.getImageData(0, 0, cols, rows).data;

        const grid = new Uint8Array(cols * rows);
        for (let i = 0; i < cols * rows; i++) {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const avg = (r + g + b) / 3;

          let type = 0; // suelo
          const isGreen = g > r + 8 && g > b + 20 && g > 100;
          if (isGreen) {
            type = 2; // arbusto
          } else if (avg < 168) {
            type = 1; // muro (bloques oscuros/saturados)
          }
          grid[i] = type;
        }

        // Los bordes siempre son muro (para no salirse del mapa)
        for (let cc = 0; cc < cols; cc++) {
          grid[cc] = 1;
          grid[(rows - 1) * cols + cc] = 1;
        }
        for (let rr = 0; rr < rows; rr++) {
          grid[rr * cols] = 1;
          grid[rr * cols + cols - 1] = 1;
        }

        resolve({
          img, cols, rows, tile,
          worldW: cols * tile,
          worldH: rows * tile,
          grid,
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('No se pudo cargar el mapa'));
    img.src = url;
  });
}

function tileTypeAt(a: Arena, x: number, y: number): number {
  const cc = Math.floor(x / a.tile);
  const rr = Math.floor(y / a.tile);
  if (cc < 0 || rr < 0 || cc >= a.cols || rr >= a.rows) return 1;
  return a.grid[rr * a.cols + cc];
}

function collideWalls(a: Arena, pos: Vec, r: number) {
  const minC = Math.floor((pos.x - r) / a.tile);
  const maxC = Math.floor((pos.x + r) / a.tile);
  const minR = Math.floor((pos.y - r) / a.tile);
  const maxR = Math.floor((pos.y + r) / a.tile);
  for (let rr = minR; rr <= maxR; rr++) {
    for (let cc = minC; cc <= maxC; cc++) {
      if (cc < 0 || rr < 0 || cc >= a.cols || rr >= a.rows) continue;
      if (a.grid[rr * a.cols + cc] !== 1) continue;
      const rx = cc * a.tile;
      const ry = rr * a.tile;
      const px = clamp(pos.x, rx, rx + a.tile);
      const py = clamp(pos.y, ry, ry + a.tile);
      const dx = pos.x - px;
      const dy = pos.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.0001;
        const push = (r - d) / d;
        pos.x += dx * push;
        pos.y += dy * push;
      }
    }
  }
}

function findWalkable(a: Arena, prefC: number, prefR: number): Vec {
  for (let radius = 0; radius < Math.max(a.cols, a.rows); radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
        const cc = prefC + dc;
        const rr = prefR + dr;
        if (cc < 1 || rr < 1 || cc >= a.cols - 1 || rr >= a.rows - 1) continue;
        if (a.grid[rr * a.cols + cc] === 0) {
          return { x: (cc + 0.5) * a.tile, y: (rr + 0.5) * a.tile };
        }
      }
    }
  }
  return { x: a.worldW / 2, y: a.worldH / 2 };
}

function randomSpawnFar(a: Arena, from: Vec, minTiles: number): Vec {
  for (let i = 0; i < 300; i++) {
    const cc = 1 + Math.floor(Math.random() * (a.cols - 2));
    const rr = 1 + Math.floor(Math.random() * (a.rows - 2));
    if (a.grid[rr * a.cols + cc] !== 0) continue;
    const p = { x: (cc + 0.5) * a.tile, y: (rr + 0.5) * a.tile };
    if (dist(p, from) > minTiles * a.tile) return p;
  }
  return findWalkable(a, Math.floor(a.cols / 2), Math.floor(a.rows / 2));
}

function hasLOS(a: Arena, from: Vec, to: Vec): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.ceil(Math.hypot(dx, dy) / (a.tile * 0.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (tileTypeAt(a, from.x + dx * t, from.y + dy * t) === 1) return false;
  }
  return true;
}

/* ================================ Componente =============================== */
export const ArenaGame: React.FC<ArenaGameProps> = ({ allBrawlers, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const arenaRef = useRef<Arena | null>(null);
  const modelRef = useRef<HTMLImageElement | null>(null);
  const iconRef = useRef<HTMLImageElement | null>(null);

  const [phase, setPhase] = useState<Phase>('menu');
  const [playerIdx, setPlayerIdx] = useState(() => {
    // Por defecto, un brawler clásico (los muy nuevos aún no tienen render en el CDN)
    const preferred = ['Shelly', 'Colt', 'El Primo', 'Nita', 'Bull', 'Jessie', 'Poco'];
    const i = allBrawlers.findIndex((b) => preferred.includes(b.displayName));
    return i >= 0 ? i : 0;
  });
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [best, setBest] = useState(0);
  const [result, setResult] = useState<{ score: number; kills: number; wave: number; time: number } | null>(null);

  const roster = allBrawlers;
  const brawler: Brawler | undefined = roster[playerIdx];

  /* ------------------------------ Cargar mapa ----------------------------- */
  useEffect(() => {
    let cancelled = false;
    loadArena(MAP_URL)
      .then((a) => {
        if (cancelled) return;
        arenaRef.current = a;
        setMapReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setMapError(e?.message || 'Error al cargar el mapa');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const stored = Number(localStorage.getItem(BEST_KEY) || '0');
    if (stored > 0) setBest(stored);
  }, []);

  /* ------------------- Precargar modelo 3D + carita ----------------------- */
  useEffect(() => {
    if (!brawler) return;
    const m = new Image();
    m.crossOrigin = 'anonymous';
    m.src = MODEL_URL(brawler.id);
    modelRef.current = m;

    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.src = brawler.iconUrl;
    iconRef.current = i;
  }, [brawler]);

  /* --------------------------- Crear luchadores --------------------------- */
  const makePlayer = useCallback((arena: Arena): Fighter => {
    const start = findWalkable(arena, Math.floor(arena.cols / 2), Math.floor(arena.rows * 0.62));
    return {
      id: 0, isPlayer: true, pos: { ...start }, vel: { x: 0, y: 0 },
      radius: PLAYER_RADIUS, hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
      aim: -Math.PI / 2, fireCd: 0, ammo: AMMO_MAX, reload: 0,
      alive: true, hurtT: 99, bob: 0, dmg: PLAYER_DMG,
      model: modelRef.current, icon: iconRef.current,
      name: brawler?.displayName || 'Tú',
    };
  }, [brawler]);

  const makeEnemy = useCallback((arena: Arena, g: Game, id: number): Fighter => {
    const spawn = randomSpawnFar(arena, g.player.pos, 7);
    const mult = 1 + (g.wave - 1) * 0.13;
    return {
      id, isPlayer: false, pos: { ...spawn }, vel: { x: 0, y: 0 },
      radius: ENEMY_RADIUS, hp: ENEMY_MAX_HP * mult, maxHp: ENEMY_MAX_HP * mult,
      aim: 0, fireCd: rand(0.5, 1.2), ammo: AMMO_MAX, reload: 0,
      alive: true, hurtT: 99, bob: rand(0, Math.PI * 2), dmg: ENEMY_DMG,
      model: modelRef.current, icon: iconRef.current,
      name: brawler?.displayName || 'Bot',
    };
  }, [brawler]);

  /* -------------------------------- Update -------------------------------- */
  const update = useCallback((g: Game, dt: number) => {
    const a = g.arena;
    const p = g.player;

    if (!g.over) g.time += dt;

    /* --- Jugador: movimiento --- */
    let mx = 0, my = 0;
    if (g.left.active) {
      const dx = g.left.knob.x - g.left.base.x;
      const dy = g.left.knob.y - g.left.base.y;
      const mag = Math.hypot(dx, dy);
      if (mag > 5) { mx = dx / Math.max(mag, STICK_R); my = dy / Math.max(mag, STICK_R); }
    }
    if (g.keys.has('w') || g.keys.has('arrowup')) my -= 1;
    if (g.keys.has('s') || g.keys.has('arrowdown')) my += 1;
    if (g.keys.has('a') || g.keys.has('arrowleft')) mx -= 1;
    if (g.keys.has('d') || g.keys.has('arrowright')) mx += 1;
    const mm = Math.hypot(mx, my);
    if (mm > 1) { mx /= mm; my /= mm; }

    if (p.alive) {
      p.pos.x = clamp(p.pos.x + mx * PLAYER_SPEED * dt, p.radius, a.worldW - p.radius);
      p.pos.y = clamp(p.pos.y + my * PLAYER_SPEED * dt, p.radius, a.worldH - p.radius);
      collideWalls(a, p.pos, p.radius);
      p.bob += dt * 9;

      // Apuntado / disparo
      let firing = false;
      let ax = Math.cos(p.aim), ay = Math.sin(p.aim);
      if (g.right.active) {
        const dx = g.right.knob.x - g.right.base.x;
        const dy = g.right.knob.y - g.right.base.y;
        if (Math.hypot(dx, dy) > 10) {
          p.aim = Math.atan2(dy, dx);
          ax = Math.cos(p.aim); ay = Math.sin(p.aim);
          firing = true;
        }
      } else if (g.keys.has(' ')) {
        const e = nearestEnemy(g, p);
        if (e) { p.aim = Math.atan2(e.pos.y - p.pos.y, e.pos.x - p.pos.x); ax = Math.cos(p.aim); ay = Math.sin(p.aim); }
        firing = true;
      }

      p.fireCd -= dt;
      if (firing && p.fireCd <= 0 && p.ammo >= 1) {
        p.fireCd = SHOOT_COOLDOWN;
        p.ammo -= 1;
        spawnBullet(g, p, ax, ay, BULLET_SPEED);
      }
      if (p.ammo < AMMO_MAX) {
        p.reload += dt;
        if (p.reload >= RELOAD_TIME) { p.reload = 0; p.ammo += 1; }
      } else {
        p.reload = 0;
      }

      // Regeneración
      p.hurtT += dt;
      if (p.hurtT > REGEN_DELAY && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + REGEN_RATE * dt);
      }
    }

    /* --- Enemigos --- */
    const pInBush = tileTypeAt(a, p.pos.x, p.pos.y) === 2;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      e.bob += dt * 8;
      const d = dist(e.pos, p.pos);

      let tx = 0, ty = 0;
      if (d > 170) { tx = (p.pos.x - e.pos.x) / d; ty = (p.pos.y - e.pos.y) / d; }
      else if (d < 110) { tx = -(p.pos.x - e.pos.x) / d; ty = -(p.pos.y - e.pos.y) / d; }
      else { tx = -(p.pos.y - e.pos.y) / d; ty = (p.pos.x - e.pos.x) / d; } // orbitar

      e.pos.x = clamp(e.pos.x + tx * ENEMY_SPEED * dt, e.radius, a.worldW - e.radius);
      e.pos.y = clamp(e.pos.y + ty * ENEMY_SPEED * dt, e.radius, a.worldH - e.radius);
      collideWalls(a, e.pos, e.radius);

      e.aim = Math.atan2(p.pos.y - e.pos.y, p.pos.x - e.pos.x);
      e.fireCd -= dt;

      const visible = !pInBush || d < 150;
      if (visible && d < ENEMY_RANGE && e.fireCd <= 0 && hasLOS(a, e.pos, p.pos)) {
        e.fireCd = ENEMY_FIRE_CD * rand(0.85, 1.25);
        spawnBullet(g, e, Math.cos(e.aim), Math.sin(e.aim), BULLET_SPEED * 0.82);
      }
      e.hurtT += dt;
    }

    /* --- Balas --- */
    for (let i = g.bullets.length - 1; i >= 0; i--) {
      const b = g.bullets[i];
      const nx = b.pos.x + b.vel.x * dt;
      const ny = b.pos.y + b.vel.y * dt;
      b.life -= dt;
      let dead = b.life <= 0;

      if (!dead && tileTypeAt(a, nx, ny) === 1) { dead = true; spawnParticles(g, nx, ny, '#cbd5e1', 4); }
      b.pos.x = nx; b.pos.y = ny;

      if (!dead) {
        if (b.fromPlayer) {
          for (const e of g.enemies) {
            if (!e.alive) continue;
            if (dist(b.pos, e.pos) < e.radius + BULLET_RADIUS) {
              e.hp -= PLAYER_DMG; e.hurtT = 0; dead = true;
              spawnParticles(g, b.pos.x, b.pos.y, '#fbbf24', 5);
              if (e.hp <= 0) killEnemy(g, e);
              break;
            }
          }
        } else if (p.alive && dist(b.pos, p.pos) < p.radius + BULLET_RADIUS) {
          p.hp -= ENEMY_DMG; p.hurtT = 0; dead = true;
          spawnParticles(g, b.pos.x, b.pos.y, '#f87171', 5);
          if (p.hp <= 0) endGame(g);
        }
      }
      if (dead) g.bullets.splice(i, 1);
    }

    /* --- Partículas --- */
    for (let i = g.particles.length - 1; i >= 0; i--) {
      const pt = g.particles[i];
      pt.life -= dt;
      pt.pos.x += pt.vel.x * dt;
      pt.pos.y += pt.vel.y * dt;
      pt.vel.x *= 0.92; pt.vel.y *= 0.92;
      if (pt.life <= 0) g.particles.splice(i, 1);
    }

    /* --- Oleadas --- */
    if (!g.over) {
      const aliveEnemies = g.enemies.filter((e) => e.alive).length;
      g.spawnTimer -= dt;
      if (g.spawnQueue > 0 && g.spawnTimer <= 0 && aliveEnemies < 6) {
        g.spawnTimer = 0.7;
        g.spawnQueue -= 1;
        g.enemies.push(makeEnemy(a, g, nextEnemyId(g)));
      }
      if (g.spawnQueue === 0 && aliveEnemies === 0) {
        g.waveTimer -= dt;
        if (g.waveTimer <= 0) startWave(g);
      }
      g.score = g.kills * 10 + (g.wave - 1) * 100 + Math.floor(g.time);
    }

    /* --- Cámara --- */
    const zoom = camZoom(g);
    g.zoom = zoom;
    const viewW = g.W / zoom;
    const viewH = g.H / zoom;
    const tx = viewW >= a.worldW ? a.worldW / 2 : clamp(p.pos.x, viewW / 2, a.worldW - viewW / 2);
    const ty = viewH >= a.worldH ? a.worldH / 2 : clamp(p.pos.y, viewH / 2, a.worldH - viewH / 2);
    g.cam.x += (tx - g.cam.x) * Math.min(1, dt * 10);
    g.cam.y += (ty - g.cam.y) * Math.min(1, dt * 10);
  }, [makeEnemy]);

  /* --------------------------------- Draw --------------------------------- */
  const draw = useCallback((g: Game, ctx: CanvasRenderingContext2D) => {
    const { arena, W, H } = g;
    ctx.clearRect(0, 0, W, H);

    // Fondo
    ctx.fillStyle = '#080b12';
    ctx.fillRect(0, 0, W, H);

    // Mundo (cámara)
    ctx.save();
    ctx.translate(W / 2 - g.cam.x * g.zoom, H / 2 - g.cam.y * g.zoom);
    ctx.scale(g.zoom, g.zoom);

    // Suelo real del mapa
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(arena.img, 0, 0, arena.worldW, arena.worldH);

    // Viñeta de mapa (leve oscurecido fuera)
    // Partículas (bajo los personajes)
    for (const pt of g.particles) {
      const alpha = clamp(pt.life / pt.max, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.pos.x, pt.pos.y, pt.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Personajes ordenados por Y (profundidad 2.5D)
    const actors = [g.player, ...g.enemies].filter((f) => f.alive);
    actors.sort((a, b) => a.pos.y - b.pos.y);
    for (const f of actors) drawFighter(ctx, f, g);

    // Balas
    for (const b of g.bullets) {
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, BULLET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = b.fromPlayer ? '#fde047' : '#fb7185';
      ctx.shadowColor = ctx.fillStyle as string;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    // HUD
    drawHud(g, ctx);
    drawSticks(g, ctx);
  }, []);

  /* -------------------------------- Bucle --------------------------------- */
  useEffect(() => {
    if (phase !== 'playing') return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const arena = arenaRef.current;
    if (!canvas || !wrap || !arena) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const g: Game = {
      arena, W, H, dpr,
      player: makePlayer(arena),
      enemies: [],
      bullets: [],
      particles: [],
      wave: 0, kills: 0, time: 0,
      waveTimer: 1.5, spawnQueue: 0, spawnTimer: 0,
      score: 0, over: false,
      cam: { x: arena.worldW / 2, y: arena.worldH / 2 },
      zoom: camZoom({ W, H, arena }),
      left: { active: false, pointerId: -1, base: { x: 0, y: 0 }, knob: { x: 0, y: 0 } },
      right: { active: false, pointerId: -1, base: { x: 0, y: 0 }, knob: { x: 0, y: 0 } },
      keys: new Set<string>(),
      raf: 0,
      onFinish: (score, kills, wave, time) => {
        setResult({ score, kills, wave, time });
        setBest((b) => {
          const nb = Math.max(b, score);
          localStorage.setItem(BEST_KEY, String(nb));
          return nb;
        });
        setTimeout(() => setPhase('over'), 900);
      },
    };
    gameRef.current = g;

    // Teclado (escritorio)
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      g.keys.add(k);
    };
    const onKeyUp = (e: KeyboardEvent) => g.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Joysticks táctiles
    const toLocal = (e: PointerEvent): Vec => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      const pt = toLocal(e);
      canvas.setPointerCapture(e.pointerId);
      const stick = pt.x < W / 2 ? g.left : g.right;
      stick.active = true;
      stick.pointerId = e.pointerId;
      stick.base = { ...pt };
      stick.knob = { ...pt };
    };
    const onMove = (e: PointerEvent) => {
      const pt = toLocal(e);
      for (const s of [g.left, g.right]) {
        if (s.active && s.pointerId === e.pointerId) {
          const dx = pt.x - s.base.x;
          const dy = pt.y - s.base.y;
          const mag = Math.hypot(dx, dy);
          const k = mag > STICK_R ? STICK_R / mag : 1;
          s.knob = { x: s.base.x + dx * k, y: s.base.y + dy * k };
        }
      }
    };
    const onUp = (e: PointerEvent) => {
      for (const s of [g.left, g.right]) {
        if (s.active && s.pointerId === e.pointerId) { s.active = false; s.pointerId = -1; }
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!g.over) update(g, dt);
      draw(g, ctx);
      g.raf = requestAnimationFrame(frame);
    };
    g.raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(g.raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [phase, makePlayer, update, draw]);

  const startGame = () => {
    if (!mapReady) return;
    gameRef.current = null;
    setResult(null);
    setPhase('playing');
  };

  /* --------------------------------- UI ----------------------------------- */
  return (
    <div ref={wrapRef} className="relative w-full flex-1 min-h-0 overflow-hidden bg-[#080b12] touch-none select-none">
      {phase === 'playing' && (
        <>
          <canvas ref={canvasRef} className="block w-full h-full touch-none" />
          <button
            onClick={() => { gameRef.current = null; setPhase('menu'); }}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 text-[11px] font-bold backdrop-blur flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Salir
          </button>
        </>
      )}

      {phase === 'menu' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center overflow-y-auto">
          <div className="flex items-center gap-3">
            {brawler && (
              <img
                src={MODEL_URL(brawler.id)}
                alt={brawler.displayName}
                className="h-32 object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.7)]"
              />
            )}
            <div className="text-left">
              <div className="flex items-center gap-2">
                <Swords className="w-6 h-6 text-amber-400" />
                <h2 className="text-2xl font-black text-white tracking-wide">ARENA</h2>
              </div>
              <p className="text-[11px] text-slate-400 max-w-[220px] mt-1">
                Supervivencia en <span className="text-amber-400 font-bold">Hard Rock Mine</span> (mapa real).
                Aguanta las oleadas.
              </p>
              {best > 0 && (
                <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1 mt-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" /> Récord: {best}
                </div>
              )}
            </div>
          </div>

          {roster.length > 0 && (
            <div className="w-full max-w-sm">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 font-bold">Elige tu brawler</div>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar justify-center">
                {roster.slice(0, 40).map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => setPlayerIdx(i)}
                    className={`shrink-0 w-12 h-12 rounded-xl border-2 overflow-hidden bg-slate-800 transition-all ${
                      i === playerIdx ? 'border-amber-400 scale-105' : 'border-slate-700 opacity-70'
                    }`}
                    title={b.displayName}
                  >
                    <img src={b.iconUrl} alt={b.displayName} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              <div className="mt-1 text-xs font-bold text-amber-300">{brawler?.displayName}</div>
            </div>
          )}

          {mapError && <div className="text-[11px] text-rose-400">{mapError}</div>}

          <div className="flex gap-2">
            <button
              onClick={startGame}
              disabled={!mapReady}
              className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-black uppercase tracking-wide flex items-center gap-2"
            >
              {mapReady ? <Play className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
              {mapReady ? 'Jugar' : 'Cargando...'}
            </button>
            <button onClick={onExit} className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold">
              Volver a la app
            </button>
          </div>

          <div className="text-[10px] text-slate-500 max-w-xs leading-relaxed">
            Joystick izquierdo: mover · derecho: apuntar y disparar · 3 balas y recarga ·
            los arbustos te esconden
          </div>
        </div>
      )}

      {phase === 'over' && result && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-5 text-center bg-black/75 backdrop-blur-sm">
          <Skull className="w-11 h-11 text-slate-300" />
          <h2 className="text-2xl font-black text-rose-400">HAS CAÍDO</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Puntos" value={result.score} highlight />
            <Stat label="Bajas" value={result.kills} />
            <Stat label="Oleada" value={result.wave} />
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5 text-amber-400" /> Récord: {best}
          </div>
          <div className="flex gap-2">
            <button onClick={startGame} className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-black uppercase tracking-wide flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> Otra vez
            </button>
            <button onClick={() => setPhase('menu')} className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold">
              Menú
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================ Lógica del juego ============================= */
function camZoom(g: Pick<Game, 'W' | 'H' | 'arena'>): number {
  const tilesAcross = 12.5;
  const z = g.W / (tilesAcross * g.arena.tile);
  return clamp(z, 0.45, 2.2);
}

function nextEnemyId(g: Game): number {
  let max = 0;
  for (const e of g.enemies) if (e.id > max) max = e.id;
  return max + 1;
}

function startWave(g: Game) {
  g.wave += 1;
  g.spawnQueue = Math.min(2 + g.wave, 9);
  g.spawnTimer = 0;
  g.waveTimer = WAVE_PAUSE;
}

function nearestEnemy(g: Game, from: Fighter): Fighter | null {
  let best: Fighter | null = null;
  let bd = Infinity;
  for (const e of g.enemies) {
    if (!e.alive) continue;
    const d = dist(e.pos, from.pos);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function spawnBullet(g: Game, owner: Fighter, ax: number, ay: number, speed: number) {
  const off = owner.radius + BULLET_RADIUS + 2;
  // Los disparos salen del pecho (no de los pies)
  const originY = owner.pos.y - SPRITE_H(owner.radius) * 0.45;
  const ox = owner.pos.x + ax * off;
  const oy = originY + ay * off;
  g.bullets.push({
    pos: { x: ox, y: oy },
    vel: { x: ax * speed, y: ay * speed },
    fromPlayer: owner.isPlayer,
    life: 1.6,
  });
  for (let i = 0; i < 4; i++) {
    g.particles.push({
      pos: { x: ox, y: oy },
      vel: { x: ax * rand(40, 120) + rand(-40, 40), y: ay * rand(40, 120) + rand(-40, 40) },
      life: 0.25, max: 0.25,
      color: owner.isPlayer ? '#fde047' : '#fb7185',
      size: 3,
    });
  }
}

function spawnParticles(g: Game, x: number, y: number, color: string, n: number) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(60, 200);
    g.particles.push({
      pos: { x, y },
      vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
      life: 0.35, max: 0.35, color, size: rand(2, 4),
    });
  }
}

function killEnemy(g: Game, e: Fighter) {
  e.alive = false;
  e.hp = 0;
  g.kills += 1;
  spawnParticles(g, e.pos.x, e.pos.y, '#fb7185', 14);
}

function endGame(g: Game) {
  if (g.over) return;
  g.over = true;
  g.player.alive = false;
  spawnParticles(g, g.player.pos.x, g.player.pos.y, '#fde047', 20);
  g.onFinish(g.score, g.kills, g.wave, g.time);
}

/* ============================== Renderizado =============================== */
function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, g: Game) {
  const a = g.arena;
  const inBush = tileTypeAt(a, f.pos.x, f.pos.y) === 2;
  const bobY = Math.sin(f.bob) * (f.isPlayer ? 1.8 : 1.2);
  const x = f.pos.x;
  const groundY = f.pos.y;

  const model = f.model && f.model.complete && f.model.naturalWidth > 0 ? f.model : null;
  const icon = f.icon && f.icon.complete && f.icon.naturalWidth > 0 ? f.icon : null;

  // Alto visual del modelo (los pies quedan en groundY)
  const h = SPRITE_H(f.radius);
  const w = model ? h * (model.naturalWidth / model.naturalHeight) : h * 0.55;
  const chestY = groundY - h * 0.45;

  ctx.globalAlpha = inBush ? 0.6 : 1;

  // Sombra en los pies
  ctx.beginPath();
  ctx.ellipse(x, groundY + 2, f.radius * 0.95, f.radius * 0.34, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();

  // Aro de equipo en el piso
  ctx.beginPath();
  ctx.ellipse(x, groundY + 2, f.radius * 0.82, f.radius * 0.3, 0, 0, Math.PI * 2);
  ctx.strokeStyle = f.isPlayer ? 'rgba(253,224,71,0.85)' : 'rgba(248,113,113,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Indicador de apuntado (jugador)
  if (f.isPlayer) {
    ctx.beginPath();
    ctx.moveTo(x, chestY);
    ctx.lineTo(x + Math.cos(f.aim) * (f.radius + 22), chestY + Math.sin(f.aim) * (f.radius + 22));
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const drawY = groundY - h + bobY;

  if (model) {
    // Modelo 3D real del brawler. Se voltea según hacia dónde apunta.
    const flip = Math.cos(f.aim) < -0.15;
    ctx.save();
    if (flip) {
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.translate(-x, 0);
    }
    const src = f.isPlayer ? model : getTintedModel(model);
    ctx.drawImage(src, x - w / 2, drawY, w, h);
    ctx.restore();
  } else if (icon) {
    // Respaldo 1: carita circular
    const cy = groundY - f.radius;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, cy, f.radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = f.isPlayer ? '#f59e0b' : '#7f1d1d';
    ctx.fill();
    ctx.clip();
    ctx.drawImage(icon, x - f.radius, cy - f.radius, f.radius * 2, f.radius * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, cy, f.radius, 0, Math.PI * 2);
    ctx.strokeStyle = f.isPlayer ? '#fde047' : '#f87171';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  } else {
    // Respaldo 2: inicial del brawler
    const cy = groundY - f.radius;
    ctx.beginPath();
    ctx.arc(x, cy, f.radius, 0, Math.PI * 2);
    ctx.fillStyle = f.isPlayer ? '#f59e0b' : '#7f1d1d';
    ctx.fill();
    ctx.fillStyle = '#0b0f19';
    ctx.font = `bold ${f.radius}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.name.charAt(0).toUpperCase(), x, cy + 1);
  }

  // Barra de vida (sobre la cabeza)
  const topY = model ? drawY : groundY - f.radius * 2;
  const bw = Math.max(f.radius * 2.4, 34);
  const bx = x - bw / 2;
  const by = topY - 10;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  roundRect(ctx, bx, by, bw, 6, 3);
  ctx.fill();
  const ratio = clamp(f.hp / f.maxHp, 0, 1);
  ctx.fillStyle = f.isPlayer ? '#34d399' : '#f87171';
  roundRect(ctx, bx, by, bw * ratio, 6, 3);
  ctx.fill();

  // Munición (solo jugador), debajo de los pies
  if (f.isPlayer) {
    const seg = 7, gap = 3, total = AMMO_MAX * seg + (AMMO_MAX - 1) * gap;
    let ax2 = x - total / 2;
    for (let i = 0; i < AMMO_MAX; i++) {
      ctx.fillStyle = i < f.ammo ? '#38bdf8' : 'rgba(148,163,184,0.35)';
      roundRect(ctx, ax2, groundY + 10, seg, 4, 2);
      ctx.fill();
      ax2 += seg + gap;
    }
  }

  ctx.globalAlpha = 1;
}

function drawHud(g: Game, ctx: CanvasRenderingContext2D) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Oleada + bajas
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, 12, 12, 150, 34, 10);
  ctx.fill();
  ctx.fillStyle = '#fde047';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`Oleada ${Math.max(1, g.wave)}`, 24, 34);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px sans-serif';
  ctx.fillText(`☠ ${g.kills}`, 112, 34);

  // Tiempo + puntos
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, g.W - 118, 12, 106, 34, 10);
  ctx.fill();
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'right';
  const t = Math.floor(g.time);
  ctx.fillText(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, g.W - 24, 28);
  ctx.fillStyle = '#fbbf24';
  ctx.font = '11px sans-serif';
  ctx.fillText(`${g.score} pts`, g.W - 24, 42);
  ctx.textAlign = 'left';

  // Barra de vida grande del jugador (abajo)
  const p = g.player;
  const bw = 150, bh = 9;
  const bx = 14, by = g.H - 22;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, bx, by, bw, bh, 4);
  ctx.fill();
  ctx.fillStyle = '#34d399';
  roundRect(ctx, bx, by, bw * clamp(p.hp / p.maxHp, 0, 1), bh, 4);
  ctx.fill();
}

function drawSticks(g: Game, ctx: CanvasRenderingContext2D) {
  const hintY = g.H - 78;
  for (const [s, color, hx] of [
    [g.left, '#38bdf8', 72],
    [g.right, '#f59e0b', g.W - 72],
  ] as [Stick, string, number][]) {
    if (s.active) {
      ctx.beginPath();
      ctx.arc(s.base.x, s.base.y, STICK_R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15,23,42,0.45)';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(s.knob.x, s.knob.y, STICK_R * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(hx, hintY, STICK_R * 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

interface StatProps { label: string; value: number; highlight?: boolean; }
const Stat: React.FC<StatProps> = ({ label, value, highlight }) => (
  <div className={`px-3 py-2 rounded-xl bg-slate-900/70 border ${highlight ? 'border-amber-500/50' : 'border-slate-700'}`}>
    <div className={`text-xl font-black ${highlight ? 'text-amber-400' : 'text-white'}`}>{value}</div>
    <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">{label}</div>
  </div>
);
