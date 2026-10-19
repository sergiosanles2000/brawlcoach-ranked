import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, RotateCcw, Trophy, Skull, Swords } from 'lucide-react';
import type { Brawler } from '../types/brawl';

interface ArenaGameProps {
  allBrawlers: Brawler[];
  onExit: () => void;
}

type Section = 'menu' | 'playing' | 'over';

/* ----------------------------- Configuración ----------------------------- */
const PALETTE = [
  '#f59e0b', '#22d3ee', '#a78bfa', '#f472b6',
  '#34d399', '#fb7185', '#60a5fa', '#facc15',
];

const PLAYER_SPEED = 205;
const BOT_SPEED = 148;
const BULLET_DAMAGE = 18;
const MAX_HP = 100;
const FIRE_COOLDOWN = 0.3;
const BOT_FIRE_COOLDOWN = 0.8;
const RESPAWN_TIME = 2.2;
const MATCH_TIME = 60;
const KILL_TARGET = 10;
const BULLET_RADIUS = 5;
const STICK_RADIUS = 44;
const BOT_COUNT = 3;

/* ------------------------------- Tipos ---------------------------------- */
interface Vec { x: number; y: number; }

interface Fighter {
  id: number;
  isPlayer: boolean;
  pos: Vec;
  vel: Vec;
  radius: number;
  hp: number;
  color: string;
  name: string;
  img: HTMLImageElement | null;
  aim: number;
  fireCd: number;
  alive: boolean;
  respawn: number;
  kills: number;
  deaths: number;
}

interface Bullet { pos: Vec; vel: Vec; owner: number; color: string; }

interface Obstacle { x: number; y: number; w: number; h: number; }

interface Stick { active: boolean; pointerId: number; base: Vec; knob: Vec; }

interface GameState {
  W: number;
  H: number;
  dpr: number;
  fighters: Fighter[];
  bullets: Bullet[];
  obstacles: Obstacle[];
  timeLeft: number;
  player: Fighter;
  left: Stick;
  right: Stick;
  keys: Set<string>;
  lastTime: number;
  raf: number;
  finished: boolean;
  onFinish: (win: boolean, kills: number, deaths: number) => void;
}

/* ------------------------------ Helpers ---------------------------------- */
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const dist2 = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function loadIcon(url?: string): HTMLImageElement | null {
  if (!url) return null;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  return img;
}

function resolveCircleRect(p: Vec, r: number, rect: Obstacle) {
  const cx = clamp(p.x, rect.x, rect.x + rect.w);
  const cy = clamp(p.y, rect.y, rect.y + rect.h);
  const dx = p.x - cx;
  const dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 < r * r) {
    const d = Math.sqrt(d2) || 0.0001;
    const push = (r - d) / d;
    p.x += dx * push;
    p.y += dy * push;
  }
}

function makeObstacles(W: number, H: number): Obstacle[] {
  const list: Obstacle[] = [];
  const count = 5;
  for (let i = 0; i < count; i++) {
    const w = rand(70, 150);
    const h = rand(60, 130);
    const x = rand(W * 0.15, W * 0.85 - w);
    const y = rand(H * 0.15, H * 0.8 - h);
    list.push({ x, y, w, h });
  }
  return list;
}

/* ------------------------------ Componente ------------------------------- */
export const ArenaGame: React.FC<ArenaGameProps> = ({ allBrawlers, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const [section, setSection] = useState<Section>('menu');
  const [playerIdx, setPlayerIdx] = useState(0);
  const [result, setResult] = useState<{ win: boolean; kills: number; deaths: number } | null>(null);

  const roster = allBrawlers.length > 0 ? allBrawlers : [];

  /* Crea el estado inicial del juego. */
  const buildGame = useCallback(
    (W: number, H: number, dpr: number, onFinish: GameState['onFinish']): GameState => {
      const pick = (offset: number): Brawler | undefined => roster[(playerIdx + offset) % Math.max(roster.length, 1)];

      const spawn = (i: number): Vec => {
        const positions: Vec[] = [
          { x: W * 0.5, y: H * 0.86 },
          { x: W * 0.15, y: H * 0.15 },
          { x: W * 0.85, y: H * 0.15 },
          { x: W * 0.5, y: H * 0.12 },
        ];
        return positions[i % positions.length];
      };

      const makeFighter = (id: number, isPlayer: boolean): Fighter => {
        const brawler = isPlayer ? pick(0) : pick(id);
        const color = PALETTE[(isPlayer ? 0 : id + 1) % PALETTE.length];
        return {
          id,
          isPlayer,
          pos: spawn(id),
          vel: { x: 0, y: 0 },
          radius: isPlayer ? 22 : 20,
          hp: MAX_HP,
          color,
          name: brawler?.displayName || (isPlayer ? 'Tú' : `Bot ${id}`),
          img: loadIcon(brawler?.iconUrl),
          aim: isPlayer ? -Math.PI / 2 : Math.PI / 2,
          fireCd: 0,
          alive: true,
          respawn: 0,
          kills: 0,
          deaths: 0,
        };
      };

      const player = makeFighter(0, true);
      const bots: Fighter[] = [];
      for (let i = 1; i <= BOT_COUNT; i++) bots.push(makeFighter(i, false));

      return {
        W,
        H,
        dpr,
        fighters: [player, ...bots],
        bullets: [],
        obstacles: makeObstacles(W, H),
        timeLeft: MATCH_TIME,
        player,
        left: { active: false, pointerId: -1, base: { x: 0, y: 0 }, knob: { x: 0, y: 0 } },
        right: { active: false, pointerId: -1, base: { x: 0, y: 0 }, knob: { x: 0, y: 0 } },
        keys: new Set<string>(),
        lastTime: 0,
        raf: 0,
        finished: false,
        onFinish,
      };
    },
    [roster, playerIdx]
  );

  /* ------------------------------ Update --------------------------------- */
  const update = useCallback((g: GameState, dt: number) => {
    const { W, H } = g;

    if (!g.finished) {
      g.timeLeft -= dt;
      if (g.timeLeft <= 0) {
        g.timeLeft = 0;
        g.finished = true;
        g.onFinish(g.player.kills > g.player.deaths, g.player.kills, g.player.deaths);
      }
    }

    // Movimiento del jugador
    const p = g.player;
    let mx = 0;
    let my = 0;
    if (g.left.active) {
      const dx = g.left.knob.x - g.left.base.x;
      const dy = g.left.knob.y - g.left.base.y;
      const mag = Math.hypot(dx, dy);
      if (mag > 4) {
        mx += dx / Math.max(mag, STICK_RADIUS);
        my += dy / Math.max(mag, STICK_RADIUS);
      }
    }
    // Teclado (útil en escritorio)
    if (g.keys.has('w') || g.keys.has('arrowup')) my -= 1;
    if (g.keys.has('s') || g.keys.has('arrowdown')) my += 1;
    if (g.keys.has('a') || g.keys.has('arrowleft')) mx -= 1;
    if (g.keys.has('d') || g.keys.has('arrowright')) mx += 1;

    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }

    if (p.alive) {
      p.vel.x = mx * PLAYER_SPEED;
      p.vel.y = my * PLAYER_SPEED;
      p.pos.x = clamp(p.pos.x + p.vel.x * dt, p.radius, W - p.radius);
      p.pos.y = clamp(p.pos.y + p.vel.y * dt, p.radius, H - p.radius);
      for (const o of g.obstacles) resolveCircleRect(p.pos, p.radius, o);

      // Apuntado / disparo
      let firing = false;
      let aimX = Math.cos(p.aim);
      let aimY = Math.sin(p.aim);
      if (g.right.active) {
        const dx = g.right.knob.x - g.right.base.x;
        const dy = g.right.knob.y - g.right.base.y;
        if (Math.hypot(dx, dy) > 8) {
          const a = Math.atan2(dy, dx);
          p.aim = a;
          aimX = Math.cos(a);
          aimY = Math.sin(a);
          firing = true;
        }
      } else if (g.keys.has(' ')) {
        // Auto-apuntado al enemigo más cercano con teclado
        const target = nearestEnemy(g, p);
        if (target) {
          const a = Math.atan2(target.pos.y - p.pos.y, target.pos.x - p.pos.x);
          p.aim = a;
          aimX = Math.cos(a);
          aimY = Math.sin(a);
        }
        firing = true;
      }

      p.fireCd -= dt;
      if (firing && p.fireCd <= 0) {
        p.fireCd = FIRE_COOLDOWN;
        spawnBullet(g, p, aimX, aimY, 260 + Math.random() * 20);
      }
    }

    // Bots
    for (const b of g.fighters) {
      if (b.isPlayer) continue;
      if (!b.alive) continue;

      const target = p.alive ? p : null;
      let tx = 0;
      let ty = 0;
      if (target) {
        const dx = target.pos.x - b.pos.x;
        const dy = target.pos.y - b.pos.y;
        const d = Math.hypot(dx, dy) || 1;
        const desired = 220; // distancia de combate
        if (d > desired) { tx = dx / d; ty = dy / d; }
        else if (d < desired - 60) { tx = -dx / d; ty = -dy / d; }
        else { tx = -dy / d; ty = dx / d; } // orbitar
        b.aim = Math.atan2(dy, dx);
      }

      b.vel.x = tx * BOT_SPEED;
      b.vel.y = ty * BOT_SPEED;
      b.pos.x = clamp(b.pos.x + b.vel.x * dt, b.radius, W - b.radius);
      b.pos.y = clamp(b.pos.y + b.vel.y * dt, b.radius, H - b.radius);
      for (const o of g.obstacles) resolveCircleRect(b.pos, b.radius, o);

      b.fireCd -= dt;
      if (target && b.fireCd <= 0 && dist2(b.pos, target.pos) < 460 * 460) {
        b.fireCd = BOT_FIRE_COOLDOWN + Math.random() * 0.4;
        spawnBullet(g, b, Math.cos(b.aim), Math.sin(b.aim), 250 + Math.random() * 40);
      }
    }

    // Balas
    for (let i = g.bullets.length - 1; i >= 0; i--) {
      const bullet = g.bullets[i];
      bullet.pos.x += bullet.vel.x * dt;
      bullet.pos.y += bullet.vel.y * dt;

      let dead =
        bullet.pos.x < 0 || bullet.pos.x > W || bullet.pos.y < 0 || bullet.pos.y > H;

      if (!dead) {
        for (const o of g.obstacles) {
          if (
            bullet.pos.x > o.x && bullet.pos.x < o.x + o.w &&
            bullet.pos.y > o.y && bullet.pos.y < o.y + o.h
          ) { dead = true; break; }
        }
      }

      if (!dead) {
        for (const f of g.fighters) {
          if (f.id === bullet.owner || !f.alive) continue;
          if (dist2(bullet.pos, f.pos) < (f.radius + BULLET_RADIUS) ** 2) {
            f.hp -= BULLET_DAMAGE;
            dead = true;
            if (f.hp <= 0) killFighter(g, f, bullet.owner);
            break;
          }
        }
      }

      if (dead) g.bullets.splice(i, 1);
    }

    // Respawns
    for (const f of g.fighters) {
      if (!f.alive) {
        f.respawn -= dt;
        if (f.respawn <= 0) respawnFighter(g, f);
      }
    }
  }, []);

  /* ------------------------------- Draw ---------------------------------- */
  const draw = useCallback((g: GameState, ctx: CanvasRenderingContext2D) => {
    const { W, H } = g;
    ctx.clearRect(0, 0, W, H);

    // Suelo
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#131a2a');
    grad.addColorStop(1, '#0b0f19');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Rejilla
    ctx.strokeStyle = 'rgba(148,163,184,0.07)';
    ctx.lineWidth = 1;
    const step = 44;
    for (let x = 0; x <= W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Obstáculos
    for (const o of g.obstacles) {
      ctx.fillStyle = 'rgba(51,65,85,0.85)';
      roundRect(ctx, o.x, o.y, o.w, o.h, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Balas
    for (const b of g.bullets) {
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, BULLET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Luchadores
    for (const f of g.fighters) {
      if (!f.alive) continue;
      // sombra
      ctx.beginPath();
      ctx.ellipse(f.pos.x, f.pos.y + f.radius * 0.9, f.radius * 0.9, f.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();

      // indicador de apuntado
      if (f.isPlayer) {
        ctx.beginPath();
        ctx.moveTo(f.pos.x, f.pos.y);
        ctx.lineTo(f.pos.x + Math.cos(f.aim) * (f.radius + 22), f.pos.y + Math.sin(f.aim) * (f.radius + 22));
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // cuerpo
      ctx.save();
      ctx.beginPath();
      ctx.arc(f.pos.x, f.pos.y, f.radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = f.isPlayer ? 16 : 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.clip();
      if (f.img && f.img.complete && f.img.naturalWidth > 0) {
        ctx.drawImage(f.img, f.pos.x - f.radius, f.pos.y - f.radius, f.radius * 2, f.radius * 2);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.font = `bold ${f.radius}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(f.name.charAt(0).toUpperCase(), f.pos.x, f.pos.y + 1);
      }
      ctx.restore();

      // borde
      ctx.beginPath();
      ctx.arc(f.pos.x, f.pos.y, f.radius, 0, Math.PI * 2);
      ctx.strokeStyle = f.isPlayer ? '#fde047' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = f.isPlayer ? 3 : 2;
      ctx.stroke();

      // barra de vida
      const bw = f.radius * 2.2;
      const bx = f.pos.x - bw / 2;
      const by = f.pos.y - f.radius - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(ctx, bx, by, bw, 6, 3);
      ctx.fill();
      const ratio = clamp(f.hp / MAX_HP, 0, 1);
      ctx.fillStyle = f.isPlayer ? '#34d399' : '#f87171';
      roundRect(ctx, bx, by, bw * ratio, 6, 3);
      ctx.fill();
    }

    // Joysticks
    drawStick(ctx, g.left, '#38bdf8');
    drawStick(ctx, g.right, '#f59e0b');

    // HUD
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, 12, 12, 168, 34, 10);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`☠ ${g.player.kills} / ${KILL_TARGET}`, 26, 35);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.fillText(`Muertes: ${g.player.deaths}`, 108, 35);

    // Tiempo
    const t = Math.max(0, Math.ceil(g.timeLeft));
    ctx.fillStyle = t <= 10 ? '#f87171' : 'rgba(0,0,0,0.45)';
    roundRect(ctx, W - 92, 12, 78, 34, 10);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`0:${String(t).padStart(2, '0')}`, W - 53, 35);
  }, []);

  /* ------------------------------- Loop ---------------------------------- */
  useEffect(() => {
    if (section !== 'playing') return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setup = () => {
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = gameRef.current;
      if (g) {
        const sx = W / g.W;
        const sy = H / g.H;
        for (const f of g.fighters) { f.pos.x *= sx; f.pos.y *= sy; }
        for (const b of g.bullets) { b.pos.x *= sx; b.pos.y *= sy; }
        g.obstacles = makeObstacles(W, H);
        g.W = W;
        g.H = H;
        g.dpr = dpr;
      }
    };

    const g = buildGame(wrap.clientWidth, wrap.clientHeight, Math.min(window.devicePixelRatio || 1, 2), (win, kills, deaths) => {
      setResult({ win, kills, deaths });
      setTimeout(() => setSection('over'), 700);
    });
    gameRef.current = g;
    setup();

    const resize = () => setup();
    window.addEventListener('resize', resize);

    // Teclado
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      g.keys.add(k);
    };
    const onKeyUp = (e: KeyboardEvent) => g.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Pointer (joysticks)
    const pos = (e: PointerEvent): Vec => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onDown = (e: PointerEvent) => {
      const p = pos(e);
      canvas.setPointerCapture(e.pointerId);
      const stick = p.x < g.W / 2 ? g.left : g.right;
      stick.active = true;
      stick.pointerId = e.pointerId;
      stick.base = { x: p.x, y: p.y };
      stick.knob = { x: p.x, y: p.y };
    };
    const onMove = (e: PointerEvent) => {
      const p = pos(e);
      for (const stick of [g.left, g.right]) {
        if (stick.active && stick.pointerId === e.pointerId) {
          const dx = p.x - stick.base.x;
          const dy = p.y - stick.base.y;
          const mag = Math.hypot(dx, dy);
          const k = mag > STICK_RADIUS ? STICK_RADIUS / mag : 1;
          stick.knob = { x: stick.base.x + dx * k, y: stick.base.y + dy * k };
        }
      }
    };
    const onUp = (e: PointerEvent) => {
      for (const stick of [g.left, g.right]) {
        if (stick.active && stick.pointerId === e.pointerId) {
          stick.active = false;
          stick.pointerId = -1;
        }
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
      if (!g.finished) update(g, dt);
      draw(g, ctx);
      g.raf = requestAnimationFrame(frame);
    };
    g.raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(g.raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [section, buildGame, update, draw]);

  const startGame = () => {
    gameRef.current = null;
    setResult(null);
    setSection('playing');
  };

  return (
    <div
      ref={wrapRef}
      className="relative w-full flex-1 min-h-0 overflow-hidden bg-[#0b0f19] touch-none select-none"
    >
      {section === 'playing' && (
        <>
          <canvas ref={canvasRef} className="block w-full h-full touch-none" />
          <button
            onClick={() => setSection('menu')}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 text-[11px] font-bold backdrop-blur flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Salir
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 text-[10px] text-slate-500 font-mono pointer-events-none">
            Izquierda: mover · Derecha: apuntar y disparar
          </div>
        </>
      )}

      {section === 'menu' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-5 text-center">
          <div className="flex items-center gap-2">
            <Swords className="w-7 h-7 text-amber-400" />
            <h2 className="text-2xl font-black text-white tracking-wide">ARENA</h2>
          </div>
          <p className="text-xs text-slate-400 max-w-xs">
            Minijuego de prueba: derrota a {BOT_COUNT} bots. Primero en conseguir{' '}
            <span className="text-amber-400 font-bold">{KILL_TARGET} bajas</span> en {MATCH_TIME}s gana.
          </p>

          {roster.length > 0 && (
            <div className="w-full max-w-sm">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 font-bold">
                Elige tu brawler
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
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
              <div className="mt-1 text-xs font-bold text-amber-300">
                {roster[playerIdx]?.displayName}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={startGame}
              className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-black uppercase tracking-wide flex items-center gap-2"
            >
              <Play className="w-4 h-4" /> Jugar
            </button>
            <button
              onClick={onExit}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold"
            >
              Volver a la app
            </button>
          </div>
        </div>
      )}

      {section === 'over' && result && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-5 text-center bg-black/70 backdrop-blur-sm">
          {result.win ? (
            <Trophy className="w-12 h-12 text-amber-400" />
          ) : (
            <Skull className="w-12 h-12 text-slate-400" />
          )}
          <h2 className={`text-2xl font-black ${result.win ? 'text-amber-400' : 'text-slate-300'}`}>
            {result.win ? '¡GANASTE!' : 'PERDISTE'}
          </h2>
          <div className="flex items-center gap-4 text-sm text-slate-300">
            <span>☠ {result.kills} bajas</span>
            <span>💀 {result.deaths} muertes</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={startGame}
              className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-black uppercase tracking-wide flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Otra vez
            </button>
            <button
              onClick={() => setSection('menu')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold"
            >
              Menú
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* --------------------------- Funciones del juego -------------------------- */
function nearestEnemy(g: GameState, from: Fighter): Fighter | null {
  let best: Fighter | null = null;
  let bestD = Infinity;
  for (const f of g.fighters) {
    if (f.isPlayer || !f.alive) continue;
    const d = dist2(f.pos, from.pos);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

function spawnBullet(g: GameState, owner: Fighter, ax: number, ay: number, speed: number) {
  const start = owner.radius + BULLET_RADIUS + 2;
  g.bullets.push({
    pos: { x: owner.pos.x + ax * start, y: owner.pos.y + ay * start },
    vel: { x: ax * speed, y: ay * speed },
    owner: owner.id,
    color: owner.isPlayer ? '#fde047' : '#fb7185',
  });
}

function killFighter(g: GameState, victim: Fighter, killerId: number) {
  victim.alive = false;
  victim.hp = 0;
  victim.deaths += 1;
  victim.respawn = RESPAWN_TIME;
  const killer = g.fighters.find((f) => f.id === killerId);
  if (killer) killer.kills += 1;

  if (killer && killer.isPlayer && killer.kills >= KILL_TARGET && !g.finished) {
    g.finished = true;
    g.onFinish(true, killer.kills, killer.deaths);
  }
}

function respawnFighter(g: GameState, f: Fighter) {
  const corners: Vec[] = [
    { x: g.W * 0.5, y: f.isPlayer ? g.H * 0.86 : g.H * 0.14 },
    { x: g.W * 0.15, y: g.H * 0.15 },
    { x: g.W * 0.85, y: g.H * 0.15 },
    { x: g.W * 0.5, y: g.H * 0.12 },
  ];
  const c = corners[f.id % corners.length];
  // Evita solapar con obstáculos
  f.pos = { x: c.x, y: c.y };
  for (const o of g.obstacles) resolveCircleRect(f.pos, f.radius, o);
  f.hp = MAX_HP;
  f.alive = true;
  f.vel = { x: 0, y: 0 };
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

function drawStick(ctx: CanvasRenderingContext2D, stick: Stick, color: string) {
  if (!stick.active) return;
  ctx.beginPath();
  ctx.arc(stick.base.x, stick.base.y, STICK_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15,23,42,0.5)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.arc(stick.knob.x, stick.knob.y, STICK_RADIUS * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
