/**
 * Stack — world-standard Ketchapp-style block-stacking game.
 *
 * Mechanic:
 *  • A moving block slides in from ONE SIDE at a time (alternates L/R per floor).
 *  • It moves in a single direction — no bouncing.
 *  • Tap to freeze it. The overhang is sliced off.
 *  • If the block exits the far edge without being tapped → miss.
 *  • Width < MIN_W → miss.  Complete miss (no overlap) → miss.
 *  • First miss: Continue? (Watch Ad free | Pay ★10 Stars).
 *  • Reward: score × REWARD_PER SKP, credited on game over.
 *
 * Canvas correctness notes:
 *  • rrect() replaces ctx.roundRect() — works on ALL WebView versions.
 *  • Tap handler reads gsRef.current.phase, NEVER React state (zero stale-closure risk).
 *  • Header is fixed 64 px — no layout shift, ResizeObserver never fires during play.
 *  • BOTTOM_PAD = 80 px — tower is clearly visible above the safe-area edge.
 *  • tapLockUntil timestamp prevents start-tap == place-tap.
 *  • Moving block enters from outside the canvas and exits if not tapped.
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
const BLOCK_H    = 30;
const DEPTH      = 7;
const FACE_H     = BLOCK_H - DEPTH;
const INIT_W     = 200;
const MIN_W      = 24;
const PERF_TOL   = 9;
const INIT_SPEED = 260;   // px / s
const SPEED_STEP = 12;    // px / s per floor
const BOTTOM_PAD = 90;    // px — lifts tower above bottom edge / safe-area
const REWARD_PER = 18;    // SKP per floor
const CONT_SECS  = 10;

const PAL = ['#34d399','#22d3ee','#818cf8','#c084fc','#f472b6','#fb923c','#facc15','#4ade80'];
const bCol = (i: number) => PAL[i % PAL.length]!;

// ─── Canvas helpers ───────────────────────────────────────────────────────────
/** Rounded rect path — works on every WebView (no ctx.roundRect). */
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hex2rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  col: string, moving = false,
) {
  if (w < 1) return;
  const r  = Math.min(6, w / 2);
  const [R, G, B] = hex2rgb(col);

  // Main face
  const grd = ctx.createLinearGradient(x, y, x, y + FACE_H);
  grd.addColorStop(0,   `rgb(${Math.min(255,R+40)},${Math.min(255,G+40)},${Math.min(255,B+40)})`);
  grd.addColorStop(1,   col);
  ctx.fillStyle = moving ? `rgba(${R},${G},${B},0.82)` : col;
  ctx.fillStyle = grd;
  rrect(ctx, x, y, w, FACE_H, r);
  ctx.fill();

  // Specular
  if (w > 12) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    rrect(ctx, x + 4, y + 4, Math.max(0, w - 8), 4, 2);
    ctx.fill();
  }

  // Depth / shadow face
  ctx.fillStyle = `rgba(${Math.max(0,R-60)},${Math.max(0,G-60)},${Math.max(0,B-60)},1)`;
  rrect(ctx, x, y + FACE_H, w, DEPTH, r);
  ctx.fill();

  // Moving block outline
  if (moving) {
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2;
    rrect(ctx, x + 1, y + 1, w - 2, BLOCK_H - 2, r);
    ctx.stroke();
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'playing' | 'continue' | 'dead';
interface Block { x: number; w: number; idx: number }
interface GS {
  phase: Phase;
  blocks: Block[];
  curX: number; curW: number; dir: 1 | -1; speed: number;
  camOff: number; camTarget: number;
  score: number; hasContinued: boolean;
}

function fresh(): GS {
  return { phase: 'idle', blocks: [], curX: 0, curW: INIT_W, dir: 1,
           speed: INIT_SPEED, camOff: 0, camTarget: 0, score: 0, hasContinued: false };
}

/** Y-coordinate of the TOP EDGE of block[idx] on the canvas. */
function blockTop(gs: GS, idx: number, H: number): number {
  return H - BOTTOM_PAD - (idx + 1) * BLOCK_H + gs.camOff;
}

/** Position moving block to enter from the correct off-screen edge. */
function positionMoving(gs: GS, W: number) {
  const floor = gs.blocks.length; // 0-based floor index of moving block
  if (floor % 2 === 0) {
    gs.curX = -(gs.curW + 20);
    gs.dir  = 1;
  } else {
    gs.curX = W + 20;
    gs.dir  = -1;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export function StackGame({ onBack }: { onBack: () => void }) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const gsRef        = useRef<GS>(fresh());
  const rafRef       = useRef(0);
  const prevTRef     = useRef(0);
  const cdRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const tapLockUntil = useRef(0); // ms timestamp — placements ignored until then

  const [phase,       setPhase]       = useState<Phase>('idle');
  const [score,       setScore]       = useState(0);
  const [reward,      setReward]      = useState(0);
  const [countdown,   setCountdown]   = useState(CONT_SECS);
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
    setCountdown(CONT_SECS);
    cdRef.current = setInterval(() => {
      setCountdown(p => {
        if (p <= 1) {
          clearCd();
          const gs = gsRef.current;
          if (gs.phase === 'continue') {
            gs.phase = 'dead';
            if (gs.score > 0) creditStackTower(gs.score).catch(() => {});
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
    if (gs.score > 0) creditStackTower(gs.score).catch(() => {});
    setPhase('dead'); setScore(gs.score); setReward(gs.score * REWARD_PER);
  }, []);

  const triggerContinue = useCallback((gs: GS) => {
    gs.phase = 'continue'; haptic('error');
    setPhase('continue'); setScore(gs.score); setReward(gs.score * REWARD_PER);
  }, []);

  // ── Start ─────────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    clearCd();
    const W  = canvasRef.current?.width ?? 390;
    const gs = fresh();
    gs.phase  = 'playing';
    gs.blocks = [{ x: W / 2 - INIT_W / 2, w: INIT_W, idx: 0 }];
    gs.score  = 0;
    positionMoving(gs, W);
    gsRef.current = gs;
    tapLockUntil.current = Date.now() + 350;
    setPhase('playing'); setScore(0); setReward(0);
  }, []);

  // ── Place ─────────────────────────────────────────────────────────────────
  const placeBlock = useCallback(() => {
    if (Date.now() < tapLockUntil.current) return;
    const gs = gsRef.current;
    if (gs.phase !== 'playing') return;

    const W    = canvasRef.current?.width ?? 390;
    const last = gs.blocks[gs.blocks.length - 1]!;
    const oL   = Math.max(gs.curX, last.x);
    const oR   = Math.min(gs.curX + gs.curW, last.x + last.w);
    const ow   = oR - oL;

    const miss = () => {
      if (!gs.hasContinued) triggerContinue(gs);
      else                   triggerDead(gs);
    };

    if (ow <= 0 || ow < MIN_W) { miss(); return; }

    const perfect = Math.abs(gs.curX - last.x) <= PERF_TOL;
    const newW = perfect ? last.w : ow;
    const newX = perfect ? last.x : oL;

    const idx = gs.blocks.length;
    gs.blocks.push({ x: newX, w: newW, idx });
    gs.score++;
    gs.speed = INIT_SPEED + gs.score * SPEED_STEP;

    // Camera: keep moving block visible near top 40%
    const H = canvasRef.current?.height ?? 700;
    gs.camTarget = Math.max(0, BOTTOM_PAD + (idx + 2) * BLOCK_H - H * 0.60);

    // Next moving block from opposite edge
    gs.curW = newW;
    positionMoving(gs, W);

    perfect ? haptic('success') : haptic('light');
    setScore(gs.score);
  }, [triggerContinue, triggerDead]);

  // ── Continue (after ad/stars) ─────────────────────────────────────────────
  const continueGame = useCallback(() => {
    clearCd();
    const gs = gsRef.current;
    const W  = canvasRef.current?.width ?? 390;
    gs.hasContinued = true;
    gs.phase = 'playing';
    gs.curW  = gs.blocks[gs.blocks.length - 1]!.w;
    positionMoving(gs, W);
    haptic('success');
    setPhase('playing');
    tapLockUntil.current = Date.now() + 200;
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
      const { invoiceUrl } = await createStackContinueInvoice();
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
        gs.curX += gs.speed * gs.dir * dt;
        // Auto-miss if block exits canvas completely
        if (gs.dir === 1  && gs.curX > W + 30) {
          if (!gs.hasContinued) triggerContinue(gs);
          else                   triggerDead(gs);
        }
        if (gs.dir === -1 && gs.curX + gs.curW < -30) {
          if (!gs.hasContinued) triggerContinue(gs);
          else                   triggerDead(gs);
        }
      }

      // Camera lerp
      if (gs.phase === 'playing' || gs.phase === 'continue') {
        gs.camOff += (gs.camTarget - gs.camOff) * Math.min(1, dt * 7);
      }

      // ── Draw ──────────────────────────────────────────────────────────────
      // Background
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#07101f');
      bg.addColorStop(1, '#020508');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.025)';
      ctx.lineWidth   = 1;
      const lineOff = ((gs.camOff % BLOCK_H) + BLOCK_H) % BLOCK_H;
      for (let y = H - BOTTOM_PAD - lineOff; y > 0; y -= BLOCK_H) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Placed blocks
      for (const b of gs.blocks) {
        const by = blockTop(gs, b.idx, H);
        if (by > H + 4 || by + BLOCK_H < -4) continue;
        drawBlock(ctx, b.x, by, b.w, bCol(b.idx), false);
      }

      // Moving block (only while playing)
      if (gs.phase === 'playing') {
        const movIdx = gs.blocks.length;
        const my     = blockTop(gs, movIdx, H);
        if (gs.curX + gs.curW > -4 && gs.curX < W + 4) {
          drawBlock(ctx, gs.curX, my, gs.curW, bCol(movIdx), true);
        }

        // Overlap highlight guide
        const last = gs.blocks[gs.blocks.length - 1];
        if (last) {
          const oL = Math.max(gs.curX, last.x);
          const oR = Math.min(gs.curX + gs.curW, last.x + last.w);
          if (oR > oL) {
            ctx.fillStyle = 'rgba(255,255,255,0.07)';
            ctx.fillRect(oL, my, oR - oL, FACE_H);
          }
        }
      }

      // Score watermark
      if (gs.score > 0 && gs.phase === 'playing') {
        ctx.save();
        ctx.font         = `bold ${Math.min(110, 54 + gs.score)}px system-ui`;
        ctx.fillStyle    = 'rgba(255,255,255,0.03)';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(gs.score), W / 2, H * 0.42);
        ctx.restore();
      }

      // Idle: demo animation
      if (gs.phase === 'idle') {
        const t2    = t / 1000;
        const baseY = H - BOTTOM_PAD - BLOCK_H;
        const amp   = (W / 2 - 20 - INIT_W / 2) * 0.75;
        const mx    = W / 2 - INIT_W / 2 + Math.sin(t2 * 1.3) * amp;
        drawBlock(ctx, W / 2 - INIT_W / 2, baseY,           INIT_W, bCol(0), false);
        drawBlock(ctx, W / 2 - INIT_W / 2, baseY - BLOCK_H, INIT_W, bCol(1), false);
        drawBlock(ctx, mx,                  baseY - 2 * BLOCK_H, INIT_W, bCol(2), true);
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

  // ── Tap handler — reads gsRef.current.phase, never stale React state ──────
  const onTap = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const p = gsRef.current.phase;
    if (p === 'idle')    { startGame();  return; }
    if (p === 'playing') { placeBlock(); return; }
  }, [startGame, placeBlock]);

  const adReady = !!(
    (adConfig?.adsgram.enabled  && adConfig.adsgram.blockId)  ||
    (adConfig?.monetag.enabled  && adConfig.monetag.zoneId)   ||
    (adConfig?.onclicka.enabled && adConfig.onclicka.spotId)
  );

  return (
    <div className="flex flex-col bg-[#07101f]" style={{ height: '100dvh', overflow: 'hidden' }}>

      {/* Fixed 64px header — no layout shift */}
      <div className="shrink-0 h-16 flex items-center justify-between px-4">
        <button onClick={onBack} className="p-2.5 rounded-full bg-white/5 border border-white/8 active:scale-90 transition-all">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Stack</p>
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
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-24 pointer-events-none">
            <p className="text-4xl font-black text-white tracking-tight drop-shadow-2xl">Stack</p>
            <p className="text-sm text-white/40 mt-2 mb-10">Tap to place each block</p>
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
          gameName="Stack" onReplay={startGame} onBack={onBack}
        />
      </div>
    </div>
  );
}

// ─── Shared overlay components (used by both games) ───────────────────────────

export function ContinueOverlay({
  show, score, countdown, adReady, adLoading, starLoading, onAd, onStars, onGiveUp,
}: {
  show: boolean; score: number; countdown: number;
  adReady: boolean; adLoading: boolean; starLoading: boolean;
  onAd: () => void; onStars: () => void; onGiveUp: () => void;
}) {
  if (!show) return null;
  const urgent = countdown <= 3;
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-[8px]"
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="px-8 w-full max-w-[320px] mx-auto text-center">
        {/* Ring */}
        <div className="relative w-20 h-20 mx-auto mb-5">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6"/>
            <circle cx="40" cy="40" r="34" fill="none" strokeWidth="6"
              stroke={urgent ? '#f87171' : '#34d399'}
              strokeDasharray={`${2*Math.PI*34}`}
              strokeDashoffset={`${2*Math.PI*34*(1 - countdown/10)}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-2xl font-black"
            style={{ color: urgent ? '#f87171' : '#34d399' }}>{countdown}</span>
        </div>

        <p className="text-2xl font-black text-white mb-1">Continue?</p>
        <p className="text-sm text-white/40 mb-7">
          {score === 0 ? 'No blocks placed' : `Floor ${score}`}
        </p>

        {adReady && (
          <button onClick={onAd} disabled={adLoading || starLoading}
            className="w-full py-4 rounded-2xl text-sm font-black text-black mb-3 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#34d399,#10b981)' }}>
            {adLoading ? <><Spin dark/>Loading ad…</> : <><PlayCircle className="w-4 h-4"/>Watch Ad — Free</>}
          </button>
        )}

        <button onClick={onStars} disabled={adLoading || starLoading}
          className="w-full py-4 rounded-2xl text-sm font-black mb-3 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
          style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}>
          {starLoading ? <><Spin/>Opening…</> : <><Star className="w-4 h-4 fill-current"/>Pay ★10 — Continue</>}
        </button>

        <button onClick={onGiveUp} disabled={adLoading || starLoading}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-white/35 bg-white/5 active:scale-95 transition-all">
          Give up
        </button>
      </div>
    </div>
  );
}

export function DeadOverlay({
  show, score, reward, gameName, onReplay, onBack,
}: {
  show: boolean; score: number; reward: number; gameName: string;
  onReplay: () => void; onBack: () => void;
}) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/82 backdrop-blur-[8px]"
      onPointerDown={e => e.stopPropagation()}>
      <div className="text-center px-8 w-full max-w-[300px] mx-auto">
        <p className="text-6xl mb-3">💥</p>
        <p className="text-2xl font-black text-white mb-1">Game Over</p>
        <p className="text-sm text-white/40 mb-6">
          {score === 0 ? 'No score' : `${gameName === 'Stack' ? `Floor ${score}` : `${score} tiles`}`}
        </p>
        {reward > 0 && (
          <div className="mb-6 px-5 py-4 rounded-2xl"
            style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.18)' }}>
            <p className="text-[10px] text-white/35 mb-1 uppercase tracking-wider">Reward</p>
            <p className="text-2xl font-black text-[#34d399]">
              +{reward.toLocaleString()} <span className="text-sm opacity-60">SKP</span>
            </p>
          </div>
        )}
        <button onClick={onReplay}
          className="w-full py-4 rounded-2xl text-sm font-black text-black active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(135deg,#34d399,#10b981)' }}>
          🔄 Play Again
        </button>
        <button onClick={onBack}
          className="w-full mt-3 py-3 rounded-2xl text-sm font-semibold text-white/40 bg-white/5 border border-white/8 active:scale-95 transition-transform">
          Exit
        </button>
      </div>
    </div>
  );
}

export function Spin({ dark = false }: { dark?: boolean }) {
  return (
    <span className="w-4 h-4 rounded-full border-2 animate-spin" style={{
      borderColor:    dark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)',
      borderTopColor: dark ? '#000' : '#fff',
    }}/>
  );
}
