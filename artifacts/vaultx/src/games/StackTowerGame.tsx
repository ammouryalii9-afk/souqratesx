import { useEffect, useRef, useState, useCallback } from 'react';
import { haptic } from '../lib/telegram';
import { ArrowLeft } from 'lucide-react';
import { creditStackTower } from '../lib/gameApi';

// ─── Constants ────────────────────────────────────────────────────────────────
const BLOCK_H    = 34;   // total block height (incl. depth face)
const DEPTH      = 8;    // 3-D bottom face height
const INIT_W     = 210;  // starting block width
const MIN_W      = 22;   // game over if block gets thinner than this
const PERF_TOL   = 6;    // px window for "perfect" placement
const INIT_SPEED = 130;  // px / s at floor 1
const SPEED_STEP = 11;   // px / s added each floor
const SIDE_PAD   = 16;   // min distance from canvas edge
const REWARD_PER = 18;   // SKP per floor

// ─── Block colour palette ─────────────────────────────────────────────────────
const HUES = [168, 195, 220, 258, 292, 328, 0, 28, 52, 84, 130];
function blockHue(idx: number) { return HUES[idx % HUES.length]; }

// ─── Types ────────────────────────────────────────────────────────────────────
interface Block { x: number; w: number; idx: number; perfect: boolean }
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; hue: number;
}
interface GS {
  phase: 'idle' | 'playing' | 'dead';
  blocks: Block[];
  curX: number; curW: number; dir: 1 | -1; speed: number;
  camOff: number; camTarget: number;
  particles: Particle[];
  combo: number; score: number;
  flash: number;    // 0‥1 white overlay alpha
  shake: number;    // screen shake magnitude
}

function freshGS(): GS {
  return {
    phase: 'idle', blocks: [],
    curX: 0, curW: INIT_W, dir: 1, speed: INIT_SPEED,
    camOff: 0, camTarget: 0,
    particles: [], combo: 0, score: 0, flash: 0, shake: 0,
  };
}

// ─── Pure drawing helpers ────────────────────────────────────────────────────
function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  hue: number, perfect: boolean,
) {
  if (w <= 0) return;
  const r = Math.min(8, w / 2);

  ctx.shadowColor = `hsla(${hue},75%,55%,${perfect ? 0.6 : 0.3})`;
  ctx.shadowBlur  = perfect ? 22 : 10;

  // Main face
  const g = ctx.createLinearGradient(x, y, x, y + BLOCK_H - DEPTH);
  g.addColorStop(0,   `hsl(${hue},75%,67%)`);
  g.addColorStop(0.5, `hsl(${hue},70%,56%)`);
  g.addColorStop(1,   `hsl(${hue},65%,48%)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, BLOCK_H - DEPTH, [r, r, 0, 0]);
  ctx.fill();

  // 3-D bottom depth
  ctx.shadowBlur  = 0;
  ctx.fillStyle   = `hsl(${hue},58%,28%)`;
  ctx.beginPath();
  ctx.roundRect(x, y + BLOCK_H - DEPTH, w, DEPTH, [0, 0, r, r]);
  ctx.fill();

  // Top specular highlight
  const hw = Math.max(0, w - 8);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 4, hw, 5, 2);
  ctx.fill();

  // Perfect glow ring
  if (perfect) {
    ctx.shadowColor = `hsl(${hue},100%,78%)`;
    ctx.shadowBlur  = 14;
    ctx.strokeStyle = `hsl(${hue},100%,82%)`;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, w - 2, BLOCK_H - DEPTH - 2, r);
    ctx.stroke();
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur  = 0;
}

function spawnBurst(gs: GS, cx: number, cy: number, hue: number) {
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
    const s = 55 + Math.random() * 110;
    gs.particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 35,
      life: 0.65 + Math.random() * 0.45,
      maxLife: 1.1,
      size: 3 + Math.random() * 5,
      hue: hue + (Math.random() - 0.5) * 35,
    });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export function StackTowerGame({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef     = useRef<GS>(freshGS());
  const rafRef    = useRef<number>(0);
  const prevTRef  = useRef<number>(0);

  const [ui, setUi] = useState<{ phase: GS['phase']; score: number; reward: number }>({
    phase: 'idle', score: 0, reward: 0,
  });

  // canvas-Y for block at world index `idx`
  const blockY = (gs: GS, idx: number, H: number) =>
    H - (idx + 1) * BLOCK_H + gs.camOff;

  // ── Start ────────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const gs = freshGS();
    gs.phase  = 'playing';
    gs.blocks = [{ x: W / 2 - INIT_W / 2, w: INIT_W, idx: 0, perfect: false }];
    gs.curX   = W / 2 - INIT_W / 2 + 70;
    gs.curW   = INIT_W;
    gs.dir    = 1;
    gsRef.current = gs;
    setUi({ phase: 'playing', score: 0, reward: 0 });
  }, []);

  // ── Place ────────────────────────────────────────────────────────────────
  const placeBlock = useCallback(() => {
    const gs     = gsRef.current;
    const canvas = canvasRef.current;
    if (gs.phase !== 'playing' || !canvas) return;

    const last     = gs.blocks[gs.blocks.length - 1];
    const oL       = Math.max(gs.curX, last.x);
    const oR       = Math.min(gs.curX + gs.curW, last.x + last.w);
    const overlapW = oR - oL;

    const kill = (doShake = true) => {
      gs.phase = 'dead';
      if (doShake) gs.shake = 14;
      haptic('error');
      const reward = gs.score * REWARD_PER;
      if (gs.score > 0) creditStackTower(gs.score).catch(() => {});
      setUi({ phase: 'dead', score: gs.score, reward });
    };

    if (overlapW <= 0) { kill(); return; }

    const isPerfect = Math.abs(gs.curX - last.x) <= PERF_TOL;
    const newW = isPerfect ? last.w : overlapW;
    const newX = isPerfect ? last.x : oL;

    if (!isPerfect && newW < MIN_W) { kill(false); return; }

    const idx = gs.blocks.length;
    gs.blocks.push({ x: newX, w: newW, idx, perfect: isPerfect });
    gs.score++;

    if (isPerfect) {
      gs.combo++;
      gs.flash = 0.55;
      haptic('success');
      const cy = blockY(gs, idx, canvas.height) + BLOCK_H / 2;
      spawnBurst(gs, newX + newW / 2, cy, blockHue(idx));
    } else {
      gs.combo = 0;
      gs.flash = 0.07;
      haptic('light');
    }

    // Prep next mover
    gs.curX  = newX;
    gs.curW  = newW;
    gs.dir   = (Math.random() < 0.5 ? 1 : -1) as 1 | -1;
    gs.speed = INIT_SPEED + gs.score * SPEED_STEP;

    // Camera target: keep moving block at ~38 % from top
    const H = canvas.height;
    gs.camTarget = Math.max(0, (idx + 2) * BLOCK_H - H * 0.62);

    setUi(u => ({ ...u, score: gs.score }));
  }, []);

  // ── Draw loop ────────────────────────────────────────────────────────────
  const draw = useCallback((dt: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const gs = gsRef.current;

    // Physics
    if (gs.phase === 'playing') {
      gs.curX += gs.speed * gs.dir * dt;
      const maxX = W - SIDE_PAD - gs.curW;
      if (gs.curX <= SIDE_PAD) { gs.curX = SIDE_PAD; gs.dir =  1; }
      if (gs.curX >= maxX)      { gs.curX = maxX;      gs.dir = -1; }
    }

    // Camera lerp
    gs.camOff += (gs.camTarget - gs.camOff) * Math.min(1, dt * 7);

    // Decay
    gs.flash = Math.max(0, gs.flash - dt * 3.2);
    gs.shake = Math.max(0, gs.shake - dt * 45);

    // Particles
    for (const p of gs.particles) {
      p.x    += p.vx * dt;
      p.y    += p.vy * dt;
      p.vy   += 340 * dt;
      p.life -= dt;
    }
    gs.particles = gs.particles.filter(p => p.life > 0);

    // ── Canvas transform (shake) ─────────────────────────────────────
    ctx.save();
    if (gs.shake > 0.5) {
      ctx.translate(
        (Math.random() - 0.5) * gs.shake,
        (Math.random() - 0.5) * gs.shake,
      );
    }

    // ── Background ───────────────────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#080d1a');
    bgGrad.addColorStop(1, '#030608');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Floor lines (scrolling depth grid)
    ctx.strokeStyle = 'rgba(255,255,255,0.022)';
    ctx.lineWidth   = 1;
    const step   = BLOCK_H;
    const offset = gs.camOff % step;
    for (let y = offset; y < H; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // ── Placed blocks ────────────────────────────────────────────────
    for (const b of gs.blocks) {
      const by = blockY(gs, b.idx, H);
      if (by > H + 10 || by + BLOCK_H < -10) continue;
      drawBlock(ctx, b.x, by, b.w, blockHue(b.idx), b.perfect);
    }

    // ── Moving block ─────────────────────────────────────────────────
    if (gs.phase === 'playing') {
      const movIdx = gs.blocks.length;
      const movY   = blockY(gs, movIdx, H);
      const hue    = blockHue(movIdx);

      // Dotted guide line
      ctx.save();
      ctx.setLineDash([4, 7]);
      ctx.strokeStyle = `hsla(${hue},60%,60%,0.12)`;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(gs.curX + gs.curW / 2, movY + BLOCK_H);
      ctx.lineTo(gs.curX + gs.curW / 2, H);
      ctx.stroke();
      ctx.restore();

      // Glow halo below block
      const glow = ctx.createLinearGradient(0, movY + BLOCK_H, 0, movY + BLOCK_H + 32);
      glow.addColorStop(0, `hsla(${hue},80%,60%,0.2)`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(gs.curX - 8, movY + BLOCK_H, gs.curW + 16, 32);

      drawBlock(ctx, gs.curX, movY, gs.curW, hue, false);
    }

    // ── Particles ────────────────────────────────────────────────────
    for (const p of gs.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle   = `hsl(${p.hue},85%,65%)`;
      const s = p.size * (0.4 + 0.6 * a);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    // ── White flash ──────────────────────────────────────────────────
    if (gs.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${gs.flash * 0.38})`;
      ctx.fillRect(0, 0, W, H);
    }

    // ── Score watermark ──────────────────────────────────────────────
    if (gs.phase === 'playing' && gs.score > 0) {
      ctx.textAlign = 'center';
      ctx.font      = `bold ${Math.min(96, 44 + gs.score * 2)}px system-ui`;
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillText(String(gs.score), W / 2, H * 0.5 + 32);
    }

    // ── Idle demo animation ──────────────────────────────────────────
    if (gs.phase === 'idle') {
      const t    = Date.now() / 1000;
      const amp  = (W / 2 - SIDE_PAD - INIT_W / 2) * 0.88;
      const px   = W / 2 - INIT_W / 2 + Math.sin(t * 1.35) * amp;
      const base = H * 0.58;
      drawBlock(ctx, W / 2 - INIT_W / 2, base,          INIT_W, blockHue(0), false);
      drawBlock(ctx, px,                  base - BLOCK_H, INIT_W, blockHue(1), false);
    }

    ctx.restore();
  }, []);

  // ── RAF ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = (t: number) => {
      const dt = Math.min((t - (prevTRef.current || t)) / 1000, 0.05);
      prevTRef.current = t;
      draw(dt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // ── Canvas resize ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => ro.disconnect();
  }, []);

  // ── Tap ──────────────────────────────────────────────────────────────────
  const onTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const { phase } = gsRef.current;
    if (phase === 'idle')    { startGame();   return; }
    if (phase === 'playing') { placeBlock();  return; }
  }, [startGame, placeBlock]);

  const isIdle  = ui.phase === 'idle';
  const isDead  = ui.phase === 'dead';
  const isPlay  = ui.phase === 'playing';
  const speedBars = Math.min(5, Math.ceil(ui.score / 4));

  return (
    <div
      className="flex flex-col bg-[#080d1a]"
      style={{ height: '100dvh', overflow: 'hidden' }}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <button
          onClick={onBack}
          className="p-2.5 rounded-full bg-white/5 border border-white/8 active:scale-90 transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>

        <div className="text-center">
          <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.2em]">Stack Tower</p>
          {isPlay && (
            <p className="text-3xl font-black text-white leading-none tabular-nums mt-0.5">
              {ui.score}
            </p>
          )}
        </div>

        {/* Speed bars */}
        <div className="flex flex-col items-end gap-1 w-12">
          {isPlay && speedBars > 0 && (
            <>
              <span className="text-[8px] text-white/25 font-bold uppercase tracking-wider">Speed</span>
              <div className="flex gap-0.5 items-end">
                {Array.from({ length: speedBars }, (_, i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-sm"
                    style={{
                      height: `${6 + i * 2}px`,
                      background: `hsl(${168 + i * 16},80%,55%)`,
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Canvas area ─────────────────────────────────────────────── */}
      <div
        className="flex-1 relative select-none"
        onClick={onTap}
        onTouchStart={onTap}
        style={{ cursor: isPlay ? 'pointer' : 'default' }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ touchAction: 'none' }}
        />

        {/* Idle overlay */}
        {isIdle && (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-20 pointer-events-none">
            <p className="text-4xl font-black text-white tracking-tight drop-shadow-xl">Stack Tower</p>
            <p className="text-sm text-white/40 mt-2 mb-10">اضغط في أي مكان للبدء</p>
            <div className="text-3xl animate-bounce">👆</div>
          </div>
        )}

        {/* Game Over overlay */}
        {isDead && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/78 backdrop-blur-[8px]">
            <div className="text-center px-8 w-full max-w-[300px] mx-auto">
              <p className="text-6xl mb-3">💥</p>
              <p className="text-2xl font-black text-white mb-1">انتهت اللعبة</p>
              <p className="text-sm text-white/40 mb-7">
                {ui.score === 0
                  ? 'لم تضع أي طبقة!'
                  : `وصلت إلى ${ui.score} طبقة`}
              </p>

              {ui.reward > 0 && (
                <div
                  className="mb-6 px-5 py-4 rounded-2xl"
                  style={{
                    background: 'rgba(52,211,153,0.07)',
                    border:     '1px solid rgba(52,211,153,0.18)',
                  }}
                >
                  <p className="text-[10px] text-white/35 mb-1">مكافأتك</p>
                  <p className="text-2xl font-black text-primary">
                    +{ui.reward.toLocaleString()}{' '}
                    <span className="text-sm font-semibold opacity-70">SKP</span>
                  </p>
                </div>
              )}

              <button
                onClick={e => { e.stopPropagation(); startGame(); }}
                className="w-full py-4 rounded-2xl text-sm font-black text-black active:scale-95 transition-transform"
                style={{ background: 'linear-gradient(135deg,#34d399,#10b981)' }}
              >
                🔄 العب مجدداً
              </button>
              <button
                onClick={e => { e.stopPropagation(); onBack(); }}
                className="w-full mt-3 py-3 rounded-2xl text-sm font-bold text-white/45 bg-white/5 border border-white/8 active:scale-95 transition-transform"
              >
                الخروج
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
