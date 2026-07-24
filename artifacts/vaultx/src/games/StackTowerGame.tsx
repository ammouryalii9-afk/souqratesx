/**
 * Stack Tower — rebuilt from scratch.
 *
 * Mechanics:
 *  • Moving block bounces wall-to-wall at increasing speed.
 *  • Tap → slice: only the overlap with the block below is kept.
 *  • Perfect (±PERF_TOL px): no shrink, flash + particles.
 *  • Block width < MIN_W or complete miss → game over.
 *  • First miss: "Continue?" screen — Watch Ad (free) or Pay ★10 Stars.
 *  • Second miss: direct Game Over.
 *  • Reward: score × REWARD_PER SKP, credited on game over.
 *
 * Architecture notes:
 *  • All mutable game state lives in gsRef (never in React state) so the RAF
 *    draw loop always sees the latest values without re-renders.
 *  • The canvas tap handler reads gsRef.current.phase — NOT the React `phase`
 *    state — so there are zero stale-closure bugs.
 *  • tapLockRef blocks placements for 400 ms after startGame() so the
 *    start-tap cannot simultaneously place the first block.
 *  • After each placement the new moving block launches from the OPPOSITE
 *    wall so it always sweeps visibly across the placed block.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { haptic, getTelegramWebApp } from '../lib/telegram';
import { ArrowLeft, PlayCircle, Star } from 'lucide-react';
import {
  creditStackTower,
  createStackContinueInvoice,
  getPublicConfig,
  type PublicConfig,
} from '../lib/gameApi';
import { watchRewardedAdWithFallback } from '../lib/adFallback';

// ─── Constants ────────────────────────────────────────────────────────────────
const BLOCK_H    = 32;   // total block height (includes depth face)
const DEPTH      = 7;    // px — 3-D bottom face
const INIT_W     = 180;  // starting block width
const MIN_W      = 20;   // thinner than this → game over
const PERF_TOL   = 7;    // px — "perfect" placement tolerance
const INIT_SPEED = 110;  // px/s at floor 1
const SPEED_STEP = 8;    // px/s added per floor
const SIDE_PAD   = 14;   // minimum gap from canvas edge
const REWARD_PER = 18;   // SKP per floor
const CONTINUE_SECS = 10;

// ─── Colour palette (cycled by block index) ───────────────────────────────────
const HUES = [168, 198, 222, 258, 290, 326, 4, 30, 54, 84, 132];
const bHue = (idx: number) => HUES[idx % HUES.length]!;

// ─── Types ────────────────────────────────────────────────────────────────────
interface Block { x: number; w: number; idx: number; perfect: boolean }
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; hue: number;
}
interface GS {
  phase: 'idle' | 'playing' | 'continue' | 'dead';
  blocks: Block[];
  curX: number; curW: number; dir: 1 | -1; speed: number;
  camOff: number; camTarget: number;
  particles: Particle[];
  score: number; combo: number;
  flash: number; shake: number;
  hasContinued: boolean;
}

function freshGS(): GS {
  return {
    phase: 'idle', blocks: [],
    curX: 0, curW: INIT_W, dir: 1, speed: INIT_SPEED,
    camOff: 0, camTarget: 0,
    particles: [], score: 0, combo: 0,
    flash: 0, shake: 0, hasContinued: false,
  };
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────
/** Y coordinate of a block's top edge on the canvas. */
function blockTop(gs: GS, idx: number, H: number): number {
  return H - (idx + 1) * BLOCK_H + gs.camOff;
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  hue: number, perfect: boolean,
) {
  if (w <= 0) return;
  const r = Math.min(7, w / 2);
  const faceH = BLOCK_H - DEPTH;

  ctx.shadowColor = `hsla(${hue},78%,55%,${perfect ? 0.7 : 0.3})`;
  ctx.shadowBlur  = perfect ? 22 : 9;

  // Main face
  const g = ctx.createLinearGradient(x, y, x, y + faceH);
  g.addColorStop(0,   `hsl(${hue},78%,70%)`);
  g.addColorStop(0.5, `hsl(${hue},72%,56%)`);
  g.addColorStop(1,   `hsl(${hue},66%,46%)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, faceH, [r, r, 0, 0]);
  ctx.fill();

  // Depth face
  ctx.shadowBlur = 0;
  ctx.fillStyle  = `hsl(${hue},58%,25%)`;
  ctx.beginPath();
  ctx.roundRect(x, y + faceH, w, DEPTH, [0, 0, r, r]);
  ctx.fill();

  // Top specular stripe
  const sw = Math.max(0, w - 10);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.roundRect(x + 5, y + 4, sw, 4, 2);
  ctx.fill();

  // Perfect glow ring
  if (perfect) {
    ctx.shadowColor = `hsl(${hue},100%,80%)`;
    ctx.shadowBlur  = 14;
    ctx.strokeStyle = `hsl(${hue},100%,85%)`;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, w - 2, faceH - 2, r);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

function spawnBurst(gs: GS, cx: number, cy: number, hue: number) {
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + Math.random() * 0.3;
    const s = 55 + Math.random() * 110;
    gs.particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 30,
      life: 0.55 + Math.random() * 0.45,
      maxLife: 1.0,
      size: 3 + Math.random() * 4,
      hue: hue + (Math.random() - 0.5) * 35,
    });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export function StackTowerGame({ onBack }: { onBack: () => void }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const gsRef      = useRef<GS>(freshGS());
  const rafRef     = useRef<number>(0);
  const prevTRef   = useRef<number>(0);
  const cntdwnRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  /** True for 400 ms after startGame() — blocks accidental placement. */
  const tapLockRef = useRef(false);

  // React state — only for overlay rendering
  const [phase,      setPhase]      = useState<GS['phase']>('idle');
  const [score,      setScore]      = useState(0);
  const [reward,     setReward]     = useState(0);
  const [countdown,  setCountdown]  = useState(CONTINUE_SECS);
  const [adLoading,  setAdLoading]  = useState(false);
  const [starLoading,setStarLoading]= useState(false);
  const [adConfig,   setAdConfig]   = useState<PublicConfig | null>(null);

  useEffect(() => { getPublicConfig().then(setAdConfig).catch(() => {}); }, []);

  // ── Countdown while in 'continue' phase ───────────────────────────────────
  useEffect(() => {
    if (phase !== 'continue') return;
    setCountdown(CONTINUE_SECS);
    cntdwnRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(cntdwnRef.current!);
          const gs = gsRef.current;
          if (gs.phase === 'continue') {
            gs.phase = 'dead';
            const s = gs.score;
            if (s > 0) creditStackTower(s).catch(() => {});
            setPhase('dead');
            setReward(s * REWARD_PER);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (cntdwnRef.current) clearInterval(cntdwnRef.current!); };
  }, [phase]);

  const clearCd = () => { if (cntdwnRef.current) { clearInterval(cntdwnRef.current!); cntdwnRef.current = null; } };

  // ── Game over ─────────────────────────────────────────────────────────────
  const triggerDead = useCallback((gs: GS) => {
    clearCd();
    gs.phase = 'dead'; gs.shake = 12;
    haptic('error');
    const s = gs.score;
    if (s > 0) creditStackTower(s).catch(() => {});
    setPhase('dead'); setScore(s); setReward(s * REWARD_PER);
  }, []);

  // ── Continue screen ───────────────────────────────────────────────────────
  const triggerContinue = useCallback((gs: GS) => {
    gs.phase = 'continue'; gs.shake = 8;
    haptic('error');
    setPhase('continue'); setScore(gs.score); setReward(gs.score * REWARD_PER);
  }, []);

  // ── Resume after ad/stars ─────────────────────────────────────────────────
  const continueGame = useCallback(() => {
    clearCd();
    const gs = gsRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const last = gs.blocks[gs.blocks.length - 1]!;
    gs.hasContinued = true;
    gs.phase = 'playing';
    gs.shake = 0; gs.flash = 0.4;
    gs.curW = last.w;
    // Restart from opposite wall
    const placedCenter = last.x + last.w / 2;
    if (placedCenter <= W / 2) {
      gs.curX = W - SIDE_PAD - last.w; gs.dir = -1;
    } else {
      gs.curX = SIDE_PAD; gs.dir = 1;
    }
    haptic('success');
    setPhase('playing');
  }, []);

  // ── Start game ────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    clearCd();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const gs = freshGS();
    gs.phase  = 'playing';
    gs.blocks = [{ x: W / 2 - INIT_W / 2, w: INIT_W, idx: 0, perfect: false }];
    // Moving block starts from left wall, sweeps right
    gs.curX = SIDE_PAD;
    gs.curW = INIT_W;
    gs.dir  = 1;
    gsRef.current = gs;
    // Block tap for 400 ms so start-tap ≠ place-tap
    tapLockRef.current = true;
    setTimeout(() => { tapLockRef.current = false; }, 400);
    setPhase('playing'); setScore(0); setReward(0);
  }, []);

  // ── Place block ───────────────────────────────────────────────────────────
  const placeBlock = useCallback(() => {
    const gs     = gsRef.current;
    const canvas = canvasRef.current;
    // Guard: must be playing and tap not locked
    if (gs.phase !== 'playing' || !canvas || tapLockRef.current) return;

    const W    = canvas.width;
    const last = gs.blocks[gs.blocks.length - 1]!;

    // Compute overlap
    const oL = Math.max(gs.curX, last.x);
    const oR = Math.min(gs.curX + gs.curW, last.x + last.w);
    const overlapW = oR - oL;

    const miss = () => {
      if (!gs.hasContinued) triggerContinue(gs);
      else                   triggerDead(gs);
    };

    if (overlapW <= 0) { miss(); return; }
    if (overlapW < MIN_W) { miss(); return; }

    const isPerfect = Math.abs(gs.curX - last.x) <= PERF_TOL;
    const newW = isPerfect ? last.w : overlapW;
    const newX = isPerfect ? last.x : oL;

    const idx = gs.blocks.length;
    gs.blocks.push({ x: newX, w: newW, idx, perfect: isPerfect });
    gs.score++;

    if (isPerfect) {
      gs.combo = (gs.combo ?? 0) + 1;
      gs.flash = 0.6;
      haptic('success');
      spawnBurst(gs, newX + newW / 2, blockTop(gs, idx, canvas.height) + BLOCK_H / 2, bHue(idx));
    } else {
      gs.combo = 0;
      gs.flash = 0.08;
      haptic('light');
    }

    // Speed up
    gs.speed = INIT_SPEED + gs.score * SPEED_STEP;

    // New moving block: always launches from the OPPOSITE wall
    gs.curW = newW;
    const placedCenter = newX + newW / 2;
    if (placedCenter <= W / 2) {
      // placed block is left of center → new block enters from right wall
      gs.curX = W - SIDE_PAD - newW;
      gs.dir  = -1;
    } else {
      // placed block is right of center → new block enters from left wall
      gs.curX = SIDE_PAD;
      gs.dir  = 1;
    }

    // Scroll camera so moving block stays ~40% from top
    gs.camTarget = Math.max(0, (idx + 2) * BLOCK_H - canvas.height * 0.60);

    setScore(gs.score);
  }, [triggerContinue, triggerDead]);

  // ── Watch Ad ──────────────────────────────────────────────────────────────
  const handleWatchAd = useCallback(async () => {
    if (adLoading || starLoading) return;
    setAdLoading(true);
    try {
      await watchRewardedAdWithFallback(adConfig);
      continueGame();
    } catch {
      // dismissed or no fill — stay on continue screen
    } finally {
      setAdLoading(false);
    }
  }, [adConfig, adLoading, starLoading, continueGame]);

  // ── Pay Stars ─────────────────────────────────────────────────────────────
  const handlePayStars = useCallback(async () => {
    if (adLoading || starLoading) return;
    setStarLoading(true);
    try {
      const { invoiceUrl } = await createStackContinueInvoice();
      const twa = getTelegramWebApp();
      if (twa?.openInvoice) {
        twa.openInvoice(invoiceUrl, (status) => {
          setStarLoading(false);
          if (status === 'paid') continueGame();
        });
      } else {
        setStarLoading(false);
      }
    } catch {
      setStarLoading(false);
    }
  }, [adLoading, starLoading, continueGame]);

  // ── Draw loop ─────────────────────────────────────────────────────────────
  const draw = useCallback((dt: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const gs = gsRef.current;

    // ── Physics ──────────────────────────────────────────────────────────────
    if (gs.phase === 'playing') {
      gs.curX += gs.speed * gs.dir * dt;
      const maxX = W - SIDE_PAD - gs.curW;
      if (gs.curX <= SIDE_PAD) { gs.curX = SIDE_PAD; gs.dir = 1; }
      if (gs.curX >= maxX)     { gs.curX = maxX;     gs.dir = -1; }
    }

    // Camera lerp
    gs.camOff += (gs.camTarget - gs.camOff) * Math.min(1, dt * 8);

    // Decay
    gs.flash = Math.max(0, gs.flash - dt * 2.5);
    gs.shake = Math.max(0, gs.shake - dt * 40);

    // Particles
    for (const p of gs.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 320 * dt;
      p.life -= dt;
    }
    gs.particles = gs.particles.filter(p => p.life > 0);

    // ── Render ───────────────────────────────────────────────────────────────
    ctx.save();
    if (gs.shake > 0.5) {
      ctx.translate((Math.random() - 0.5) * gs.shake, (Math.random() - 0.5) * gs.shake);
    }

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#07101f');
    bg.addColorStop(1, '#020507');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle horizontal grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth   = 1;
    const lineOff = gs.camOff % BLOCK_H;
    for (let y = lineOff; y < H; y += BLOCK_H) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Placed blocks
    for (const b of gs.blocks) {
      const by = blockTop(gs, b.idx, H);
      if (by > H + 4 || by + BLOCK_H < -4) continue;
      drawBlock(ctx, b.x, by, b.w, bHue(b.idx), b.perfect);
    }

    // Moving block (playing only)
    if (gs.phase === 'playing') {
      const movIdx = gs.blocks.length;
      const movY   = blockTop(gs, movIdx, H);
      const hue    = bHue(movIdx);
      // Glow halo beneath block
      const glow = ctx.createLinearGradient(0, movY + BLOCK_H, 0, movY + BLOCK_H + 28);
      glow.addColorStop(0, `hsla(${hue},80%,60%,0.15)`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(gs.curX - 6, movY + BLOCK_H, gs.curW + 12, 28);
      // Dashed guide line
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = `hsla(${hue},55%,55%,0.09)`;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(gs.curX + gs.curW / 2, movY + BLOCK_H);
      ctx.lineTo(gs.curX + gs.curW / 2, H);
      ctx.stroke();
      ctx.restore();
      drawBlock(ctx, gs.curX, movY, gs.curW, hue, false);
    }

    // Particles
    for (const p of gs.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle   = `hsl(${p.hue},85%,65%)`;
      const s = p.size * (0.4 + 0.6 * a);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    // White flash
    if (gs.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${gs.flash * 0.32})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Score watermark
    if (gs.score > 0 && (gs.phase === 'playing' || gs.phase === 'continue')) {
      ctx.textAlign = 'center';
      ctx.font      = `bold ${Math.min(100, 42 + gs.score * 2)}px system-ui`;
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      ctx.fillText(String(gs.score), W / 2, H * 0.5 + 30);
    }

    // Idle preview
    if (gs.phase === 'idle') {
      const t   = Date.now() / 1000;
      const amp = (W / 2 - SIDE_PAD - INIT_W / 2) * 0.8;
      const px  = W / 2 - INIT_W / 2 + Math.sin(t * 1.3) * amp;
      drawBlock(ctx, W / 2 - INIT_W / 2, H * 0.58,          INIT_W, bHue(0), false);
      drawBlock(ctx, px,                  H * 0.58 - BLOCK_H, INIT_W, bHue(1), false);
    }

    ctx.restore();
  }, []);

  // ── RAF loop ──────────────────────────────────────────────────────────────
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

  // ── Canvas resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);
    sync();
    return () => ro.disconnect();
  }, []);

  // ── Canvas tap — reads gsRef.current.phase to avoid stale closures ────────
  const onCanvasTap = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const p = gsRef.current.phase;
    if (p === 'idle')                                  { startGame();  return; }
    if (p === 'playing' && !tapLockRef.current)        { placeBlock(); return; }
  }, [startGame, placeBlock]); // NO `phase` dep — reads gsRef directly

  // ── Derived ───────────────────────────────────────────────────────────────
  const adReady = !!(
    (adConfig?.adsgram.enabled && adConfig.adsgram.blockId)  ||
    (adConfig?.monetag.enabled && adConfig.monetag.zoneId)   ||
    (adConfig?.onclicka.enabled && adConfig.onclicka.spotId)
  );
  const speedBars = Math.min(5, Math.ceil(score / 5));

  return (
    <div className="flex flex-col bg-[#07101f]" style={{ height: '100dvh', overflow: 'hidden' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <button
          onClick={onBack}
          className="p-2.5 rounded-full bg-white/5 border border-white/8 active:scale-90 transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>

        <div className="text-center">
          <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.2em]">Stack Tower</p>
          {(phase === 'playing' || phase === 'continue') && (
            <p className="text-3xl font-black text-white leading-none tabular-nums mt-0.5">{score}</p>
          )}
        </div>

        {/* Speed indicator */}
        <div className="flex flex-col items-end gap-0.5 w-12">
          {phase === 'playing' && speedBars > 0 && (
            <>
              <span className="text-[8px] text-white/25 font-bold uppercase tracking-wider">Speed</span>
              <div className="flex gap-0.5 items-end">
                {Array.from({ length: speedBars }, (_, i) => (
                  <div key={i} className="w-1.5 rounded-sm"
                    style={{ height: `${6 + i * 2}px`, background: `hsl(${168 + i * 18},80%,56%)` }} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative select-none" style={{ touchAction: 'none' }}>

        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ touchAction: 'none' }}
          onPointerDown={
            phase === 'idle' || phase === 'playing' ? onCanvasTap : undefined
          }
        />

        {/* Idle overlay */}
        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-20 pointer-events-none">
            <p className="text-4xl font-black text-white tracking-tight drop-shadow-xl">Stack Tower</p>
            <p className="text-sm text-white/40 mt-2 mb-8">Tap anywhere to start</p>
            <div className="text-3xl animate-bounce">👆</div>
          </div>
        )}

        {/* Continue overlay */}
        {phase === 'continue' && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-[10px]"
            onPointerDown={e => e.stopPropagation()}
          >
            <div className="px-8 w-full max-w-[320px] mx-auto text-center">

              {/* Countdown ring */}
              <div className="relative w-20 h-20 mx-auto mb-5">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
                  <circle
                    cx="40" cy="40" r="34" fill="none"
                    stroke={countdown <= 3 ? '#f87171' : '#34d399'}
                    strokeWidth="6"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - countdown / CONTINUE_SECS)}`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
                  />
                </svg>
                <span
                  className="absolute inset-0 flex items-center justify-center text-2xl font-black"
                  style={{ color: countdown <= 3 ? '#f87171' : '#34d399' }}
                >
                  {countdown}
                </span>
              </div>

              <p className="text-2xl font-black text-white mb-1">Continue?</p>
              <p className="text-sm text-white/40 mb-7">
                {score === 0 ? 'No blocks placed' : `You reached floor ${score}`}
              </p>

              {/* Watch Ad */}
              {adReady && (
                <button
                  onClick={handleWatchAd}
                  disabled={adLoading || starLoading}
                  className="w-full py-4 rounded-2xl text-sm font-black text-black mb-3 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#34d399,#10b981)' }}
                >
                  {adLoading
                    ? <><span className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" /> Loading ad…</>
                    : <><PlayCircle className="w-4 h-4" /> Watch Ad — Free</>}
                </button>
              )}

              {/* Pay Stars */}
              <button
                onClick={handlePayStars}
                disabled={adLoading || starLoading}
                className="w-full py-4 rounded-2xl text-sm font-black mb-3 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg,rgba(251,191,36,0.15),rgba(251,191,36,0.08))',
                  border: '1px solid rgba(251,191,36,0.35)',
                  color: '#fbbf24',
                }}
              >
                {starLoading
                  ? <><span className="w-4 h-4 border-2 border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" /> Opening…</>
                  : <><Star className="w-4 h-4 fill-current" /> Pay ★10 — Continue</>}
              </button>

              {/* Give up */}
              <button
                onClick={() => triggerDead(gsRef.current)}
                disabled={adLoading || starLoading}
                className="w-full py-3 rounded-2xl text-sm font-semibold text-white/35 bg-white/4 active:scale-95 transition-all"
              >
                Give up
              </button>
            </div>
          </div>
        )}

        {/* Game Over overlay */}
        {phase === 'dead' && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/82 backdrop-blur-[8px]"
            onPointerDown={e => e.stopPropagation()}
          >
            <div className="text-center px-8 w-full max-w-[300px] mx-auto">
              <p className="text-6xl mb-3">💥</p>
              <p className="text-2xl font-black text-white mb-1">Game Over</p>
              <p className="text-sm text-white/40 mb-6">
                {score === 0
                  ? 'No blocks placed'
                  : `You stacked ${score} floor${score !== 1 ? 's' : ''}`}
              </p>

              {reward > 0 && (
                <div
                  className="mb-6 px-5 py-4 rounded-2xl"
                  style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.18)' }}
                >
                  <p className="text-[10px] text-white/35 mb-1 uppercase tracking-wider">Reward</p>
                  <p className="text-2xl font-black text-primary">
                    +{reward.toLocaleString()} <span className="text-sm font-semibold opacity-60">SKP</span>
                  </p>
                </div>
              )}

              <button
                onClick={startGame}
                className="w-full py-4 rounded-2xl text-sm font-black text-black active:scale-95 transition-transform"
                style={{ background: 'linear-gradient(135deg,#34d399,#10b981)' }}
              >
                🔄 Play Again
              </button>
              <button
                onClick={onBack}
                className="w-full mt-3 py-3 rounded-2xl text-sm font-semibold text-white/40 bg-white/5 border border-white/8 active:scale-95 transition-transform"
              >
                Exit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
