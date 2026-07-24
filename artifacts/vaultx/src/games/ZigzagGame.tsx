/**
 * Zigzag Driver — classic isometric diamond-path game.
 *
 * Mechanic (world-standard Ketchapp Zigzag):
 *  • Path: a series of diamond-shaped tiles on an isometric grid.
 *  • Ball moves continuously in one of two diagonal directions:
 *      Dir A → gx increases (screen: right-down)
 *      Dir B → gy increases (screen: left-down)
 *  • Tap: switch direction and snap to nearest integer tile.
 *  • If the ball steps onto a tile NOT in the path → game over.
 *  • Speed increases over time.
 *  • Score = tiles passed.
 *  • First death: Continue? (Watch Ad / Pay ★10 Stars).
 *  • Reward: score × REWARD_PER SKP.
 *
 * Isometric coordinate system:
 *   Grid cell (gx, gy)  →  screen:
 *     sx = canvas_cx + (gx − gy) × HALF_W
 *     sy = (gx + gy) × HALF_H − camY
 *   Camera keeps ball at ~35% from top:
 *     camY = (ball.gx + ball.gy) × HALF_H − H × 0.20
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { haptic, getTelegramWebApp } from '../lib/telegram';
import { ArrowLeft } from 'lucide-react';
import {
  creditZigzag,
  createZigzagContinueInvoice,
  getPublicConfig,
  type PublicConfig,
} from '../lib/gameApi';
import { watchRewardedAdWithFallback } from '../lib/adFallback';
import { ContinueOverlay, DeadOverlay } from './StackGame';

// ─── Constants ────────────────────────────────────────────────────────────────
const HALF_W      = 46;    // screen half-width of a diamond tile
const HALF_H      = 26;    // screen half-height
const BALL_R      = 13;    // ball radius (px)
const INIT_SPEED  = 5.0;   // tiles / second
const MAX_SPEED   = 12.0;
const SPEED_INC   = 0.15;  // tiles/s added per second of play
const SEG_MIN     = 5;     // minimum tiles per path segment
const SEG_MAX     = 10;    // maximum tiles per path segment
const GEN_AHEAD   = 60;    // generate this many tiles ahead of ball
const REWARD_PER  = 4;     // SKP per tile

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase   = 'idle' | 'playing' | 'continue' | 'dead';
type Dir     = 'A' | 'B';  // A = gx++, B = gy++

interface GS {
  phase: Phase;
  bx: number; by: number;   // ball grid position (floats; one axis always integer)
  dir: Dir;
  speed: number;
  elapsed: number;
  score: number;
  hasContinued: boolean;
  tiles: Set<string>;        // "gx,gy"
  genEndGx: number;          // last generated tile's gx
  genEndGy: number;          // last generated tile's gy
  genDir: Dir;               // direction at end of generated path
}

function key(gx: number, gy: number) { return `${gx},${gy}`; }

function fresh(): GS {
  return {
    phase: 'idle', bx: 0, by: 0, dir: 'A', speed: INIT_SPEED,
    elapsed: 0, score: 0, hasContinued: false,
    tiles: new Set(), genEndGx: 0, genEndGy: 0, genDir: 'A',
  };
}

/** Generate more path tiles from the current end point. */
function extendPath(gs: GS, extraSegments = 8) {
  let { genEndGx: gx, genEndGy: gy, genDir: dir } = gs;
  for (let s = 0; s < extraSegments; s++) {
    const len = SEG_MIN + Math.floor(Math.random() * (SEG_MAX - SEG_MIN + 1));
    for (let i = 0; i < len; i++) {
      if (dir === 'A') gx++; else gy++;
      gs.tiles.add(key(gx, gy));
    }
    dir = dir === 'A' ? 'B' : 'A';
  }
  gs.genEndGx = gx;
  gs.genEndGy = gy;
  gs.genDir   = dir;
}

/** Isometric grid → canvas screen coords. */
function toScreen(gx: number, gy: number, cx: number, camY: number) {
  return {
    sx: cx + (gx - gy) * HALF_W,
    sy: (gx + gy) * HALF_H - camY,
  };
}

/** Draw a diamond tile. */
function drawTile(ctx: CanvasRenderingContext2D, sx: number, sy: number, fill: string, stroke: string) {
  ctx.beginPath();
  ctx.moveTo(sx,          sy - HALF_H);
  ctx.lineTo(sx + HALF_W, sy);
  ctx.lineTo(sx,          sy + HALF_H);
  ctx.lineTo(sx - HALF_W, sy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth   = 1.5;
  ctx.stroke();
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ZigzagGame({ onBack }: { onBack: () => void }) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const gsRef        = useRef<GS>(fresh());
  const rafRef       = useRef(0);
  const prevTRef     = useRef(0);
  const cdRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const tapLockUntil = useRef(0);

  const [phase,       setPhase]       = useState<Phase>('idle');
  const [score,       setScore]       = useState(0);
  const [reward,      setReward]      = useState(0);
  const [countdown,   setCountdown]   = useState(10);
  const [adLoading,   setAdLoading]   = useState(false);
  const [starLoading, setStarLoading] = useState(false);
  const [adConfig,    setAdConfig]    = useState<PublicConfig | null>(null);

  useEffect(() => { getPublicConfig().then(setAdConfig).catch(() => {}); }, []);

  const clearCd = () => {
    if (cdRef.current) { clearInterval(cdRef.current); cdRef.current = null; }
  };

  // ── Countdown ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'continue') return;
    setCountdown(10);
    cdRef.current = setInterval(() => {
      setCountdown(p => {
        if (p <= 1) {
          clearCd();
          const gs = gsRef.current;
          if (gs.phase === 'continue') {
            gs.phase = 'dead';
            if (gs.score > 0) creditZigzag(gs.score).catch(() => {});
            setPhase('dead'); setReward(gs.score * REWARD_PER);
          }
          return 0;
        }
        return p - 1;
      });
    }, 1000);
    return clearCd;
  }, [phase]);

  // ── Dead / Continue ───────────────────────────────────────────────────────
  const triggerDead = useCallback((gs: GS) => {
    clearCd(); gs.phase = 'dead'; haptic('error');
    if (gs.score > 0) creditZigzag(gs.score).catch(() => {});
    setPhase('dead'); setScore(gs.score); setReward(gs.score * REWARD_PER);
  }, []);

  const triggerContinue = useCallback((gs: GS) => {
    gs.phase = 'continue'; haptic('error');
    setPhase('continue'); setScore(gs.score); setReward(gs.score * REWARD_PER);
  }, []);

  // ── Start ─────────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    clearCd();
    const gs = fresh();
    gs.phase = 'playing';
    gs.tiles.add(key(0, 0));
    extendPath(gs, 10);
    gsRef.current = gs;
    tapLockUntil.current = Date.now() + 350;
    setPhase('playing'); setScore(0); setReward(0);
  }, []);

  // ── Tap: switch direction ─────────────────────────────────────────────────
  const switchDir = useCallback(() => {
    if (Date.now() < tapLockUntil.current) return;
    const gs = gsRef.current;
    if (gs.phase !== 'playing') return;

    // Snap the moving axis to nearest integer, keep fixed axis as-is
    if (gs.dir === 'A') {
      // Moving in gx — snap bx, fix by (already integer)
      const snappedGx = Math.round(gs.bx);
      const snappedGy = Math.round(gs.by); // should already be int
      if (!gs.tiles.has(key(snappedGx, snappedGy))) {
        // snapped tile doesn't exist → immediate miss
        if (!gs.hasContinued) triggerContinue(gs); else triggerDead(gs);
        return;
      }
      gs.bx  = snappedGx;
      gs.by  = snappedGy;
      gs.dir = 'B';
    } else {
      // Moving in gy — snap by, fix bx (already integer)
      const snappedGx = Math.round(gs.bx);
      const snappedGy = Math.round(gs.by);
      if (!gs.tiles.has(key(snappedGx, snappedGy))) {
        if (!gs.hasContinued) triggerContinue(gs); else triggerDead(gs);
        return;
      }
      gs.bx  = snappedGx;
      gs.by  = snappedGy;
      gs.dir = 'A';
    }
    haptic('light');
  }, [triggerContinue, triggerDead]);

  // ── Continue (after ad/stars) ─────────────────────────────────────────────
  const continueGame = useCallback(() => {
    clearCd();
    const gs = gsRef.current;
    gs.hasContinued = true;
    gs.phase = 'playing';
    // Snap ball to nearest valid tile
    const gx = Math.round(gs.bx);
    const gy = Math.round(gs.by);
    gs.bx = gx; gs.by = gy;
    // Extend path from here if needed
    if (!gs.tiles.has(key(gx, gy))) gs.tiles.add(key(gx, gy));
    haptic('success');
    setPhase('playing');
    tapLockUntil.current = Date.now() + 300;
  }, []);

  // ── Ad / Stars ────────────────────────────────────────────────────────────
  const handleAd = useCallback(async () => {
    if (adLoading || starLoading) return;
    setAdLoading(true);
    try   { await watchRewardedAdWithFallback(adConfig); continueGame(); }
    catch { /* dismissed */ }
    finally { setAdLoading(false); }
  }, [adConfig, adLoading, starLoading, continueGame]);

  const handleStars = useCallback(async () => {
    if (adLoading || starLoading) return;
    setStarLoading(true);
    try {
      const { invoiceUrl } = await createZigzagContinueInvoice();
      getTelegramWebApp()?.openInvoice?.(invoiceUrl, s => {
        setStarLoading(false);
        if (s === 'paid') continueGame();
      });
    } catch { setStarLoading(false); }
  }, [adLoading, starLoading, continueGame]);

  // ── Draw loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current!;

    const loop = (t: number) => {
      const dt = prevTRef.current ? Math.min((t - prevTRef.current) / 1000, 0.05) : 0;
      prevTRef.current = t;
      const gs  = gsRef.current;
      const W   = cv.width;
      const H   = cv.height;
      const ctx = cv.getContext('2d')!;

      // ── Physics ───────────────────────────────────────────────────────────
      if (gs.phase === 'playing') {
        gs.elapsed += dt;
        gs.speed = Math.min(MAX_SPEED, INIT_SPEED + gs.elapsed * SPEED_INC);

        const prev_sum = Math.floor(gs.bx + gs.by);

        if (gs.dir === 'A') gs.bx += gs.speed * dt;
        else                 gs.by += gs.speed * dt;

        const curr_sum = Math.floor(gs.bx + gs.by);
        if (curr_sum > prev_sum) {
          gs.score = curr_sum;
          setScore(curr_sum);
        }

        // Check if ball is on valid tile
        const cgx = Math.floor(gs.bx + 0.5);
        const cgy = Math.floor(gs.by + 0.5);
        if (!gs.tiles.has(key(cgx, cgy))) {
          if (!gs.hasContinued) triggerContinue(gs); else triggerDead(gs);
        }

        // Generate more path ahead
        const totalAhead = (gs.genEndGx + gs.genEndGy) - (gs.bx + gs.by);
        if (totalAhead < GEN_AHEAD) extendPath(gs, 6);
      }

      // ── Camera ────────────────────────────────────────────────────────────
      const camY   = (gs.bx + gs.by) * HALF_H - H * 0.20;
      const cx     = W / 2;

      // ── Draw background ───────────────────────────────────────────────────
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0a1628');
      bg.addColorStop(1, '#030810');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // ── Draw path tiles ───────────────────────────────────────────────────
      const ballDepth = gs.bx + gs.by;
      for (const k of gs.tiles) {
        const [gxs, gys] = k.split(',').map(Number) as [number, number];
        const depth = gxs + gys;
        // Cull tiles far from view
        const { sy } = toScreen(gxs, gys, cx, camY);
        if (sy < -HALF_H * 2 || sy > H + HALF_H * 2) continue;

        const passed = depth < ballDepth - 1;
        const fill   = passed
          ? 'rgba(34,100,80,0.45)'
          : 'rgba(52,211,153,0.18)';
        const stroke = passed
          ? 'rgba(34,100,80,0.5)'
          : 'rgba(52,211,153,0.55)';
        const { sx } = toScreen(gxs, gys, cx, camY);
        drawTile(ctx, sx, sy, fill, stroke);
      }

      // ── Ball shadow ───────────────────────────────────────────────────────
      const { sx: bsx, sy: bsy } = toScreen(gs.bx, gs.by, cx, camY);
      ctx.beginPath();
      ctx.ellipse(bsx, bsy + HALF_H * 0.6, BALL_R * 0.9, BALL_R * 0.35, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();

      // ── Ball ─────────────────────────────────────────────────────────────
      if (gs.phase !== 'idle') {
        const ballGrd = ctx.createRadialGradient(bsx - 3, bsy - 4, 2, bsx, bsy, BALL_R);
        ballGrd.addColorStop(0, '#ffffff');
        ballGrd.addColorStop(0.4, '#34d399');
        ballGrd.addColorStop(1, '#059669');
        ctx.beginPath();
        ctx.arc(bsx, bsy, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = ballGrd;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      }

      // ── Idle scene ────────────────────────────────────────────────────────
      if (gs.phase === 'idle') {
        // Draw a static sample path in the centre
        const sampleTiles = [
          [0,0],[1,0],[2,0],[3,0],[4,0],
          [4,1],[4,2],[4,3],
          [5,3],[6,3],[7,3],
        ];
        const idleCamY = 7 * HALF_H - H * 0.20;
        for (const [tgx, tgy] of sampleTiles) {
          const { sx, sy } = toScreen(tgx!, tgy!, cx, idleCamY);
          drawTile(ctx, sx, sy, 'rgba(52,211,153,0.18)', 'rgba(52,211,153,0.55)');
        }
        // Animate ball
        const bt = t / 1000;
        const bi = (Math.floor(bt * 4) % sampleTiles.length);
        const [tbgx, tbgy] = sampleTiles[bi]!;
        const { sx: ibsx, sy: ibsy } = toScreen(tbgx!, tbgy!, cx, idleCamY);
        ctx.beginPath();
        ctx.arc(ibsx, ibsy, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = '#34d399';
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [triggerContinue, triggerDead]);

  // ── Canvas resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current!;
    const sync = () => { cv.width = cv.offsetWidth || 390; cv.height = cv.offsetHeight || 650; };
    const ro = new ResizeObserver(sync);
    ro.observe(cv); sync();
    return () => ro.disconnect();
  }, []);

  // ── Tap handler ───────────────────────────────────────────────────────────
  const onTap = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const p = gsRef.current.phase;
    if (p === 'idle')    { startGame();  return; }
    if (p === 'playing') { switchDir();  return; }
  }, [startGame, switchDir]);

  const adReady = !!(
    (adConfig?.adsgram.enabled  && adConfig.adsgram.blockId)  ||
    (adConfig?.monetag.enabled  && adConfig.monetag.zoneId)   ||
    (adConfig?.onclicka.enabled && adConfig.onclicka.spotId)
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0a1628]" style={{ zIndex: 100 }}>

      {/* Fixed 64px header */}
      <div className="shrink-0 h-16 flex items-center justify-between px-4">
        <button onClick={onBack} className="p-2.5 rounded-full bg-white/5 border border-white/8 active:scale-90 transition-all">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Zigzag Driver</p>
          <p className="h-9 flex items-center justify-center text-3xl font-black text-white tabular-nums">
            {phase !== 'idle' ? score : ''}
          </p>
        </div>
        <div className="w-10" />
      </div>

      {/* Canvas */}
      <div className="flex-1 relative" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: 'block', touchAction: 'none' }}
          onPointerDown={phase === 'idle' || phase === 'playing' ? onTap : undefined}
        />

        {/* Idle text */}
        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-20 pointer-events-none">
            <p className="text-4xl font-black text-white tracking-tight drop-shadow-2xl">Zigzag Driver</p>
            <p className="text-sm text-white/40 mt-2 mb-10">Tap to change direction</p>
            <div className="text-3xl animate-bounce">👆</div>
          </div>
        )}

        <ContinueOverlay
          show={phase === 'continue'} score={score} countdown={countdown}
          adReady={adReady} adLoading={adLoading} starLoading={starLoading}
          onAd={handleAd} onStars={handleStars} onGiveUp={() => triggerDead(gsRef.current)}
        />
        <DeadOverlay
          show={phase === 'dead'} score={score} reward={reward}
          gameName="Zigzag" onReplay={startGame} onBack={onBack}
        />
      </div>
    </div>
  );
}
