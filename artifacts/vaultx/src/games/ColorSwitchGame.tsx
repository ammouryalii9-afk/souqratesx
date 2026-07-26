/**
 * Color Switch — classic bounce-through-ring mechanic.
 *
 * Mechanic:
 *  • A 4-coloured ring rotates in the upper area.
 *  • A coloured ball sits BELOW the ring (gravity holds it down).
 *  • Tap → ball launches upward.
 *  • Ball rises and passes through the ring from the BOTTOM (6 o'clock).
 *  • Colour at the bottom of the ring must match the ball's colour → pass!
 *      score++, ball gets a new colour, ring speed ↑.
 *  • Wrong colour at bottom on entry → die (continue or game over).
 *  • After passing, ball rises above the ring, then falls back below safely.
 *  • Reward: credited × 1 SKP per ring (server caps at 300 SKP).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { haptic, getTelegramWebApp } from '../lib/telegram';
import { ArrowLeft } from 'lucide-react';
import {
  creditColorSwitch,
  createColorSwitchContinueInvoice,
  getPublicConfig,
  type PublicConfig,
} from '../lib/gameApi';
import { watchRewardedAdWithFallback } from '../lib/adFallback';
import { ContinueOverlay, DeadOverlay, Spin } from './StackGame';

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS     = ['#34d399', '#818cf8', '#f472b6', '#facc15'] as const;
const GRAVITY    = 1400;   // px/s²
const TAP_VY     = -840;   // px/s upward impulse
const RING_STROKE= 15;     // px ring arc width
const BALL_R     = 13;     // px ball radius
const GAP_ANGLE  = 0.10;   // radians gap between sectors (cosmetic only)
const SEC_ANGLE  = Math.PI / 2; // 90° per sector
const ARC_SPAN   = SEC_ANGLE - GAP_ANGLE;
const BASE_SPEED = 1.1;    // rad/s
const SPEED_INC  = 0.09;   // rad/s per score
const MAX_SPEED  = 4.5;    // rad/s
const CONT_SECS  = 10;     // seconds to decide Continue
const REWARD_PER = 12;     // SKP per ring (must match server)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mod(x: number, m: number) { return ((x % m) + m) % m; }

/** Index of the colour sector currently at the BOTTOM (6 o'clock = +π/2) */
function sectorAtAngle(rot: number, angle: number): number {
  const rel = mod(angle - rot, 2 * Math.PI);
  return Math.floor(rel / SEC_ANGLE) % 4;
}

/** True if `angle` falls inside a visual gap between sectors */
function isGap(rot: number, angle: number): boolean {
  const rel        = mod(angle - rot, 2 * Math.PI);
  const posInSec   = rel % SEC_ANGLE;
  return posInSec > ARC_SPAN;
}

// ─── Game state (mutable, lives in ref) ──────────────────────────────────────
type Phase = 'idle' | 'playing' | 'dying' | 'continue' | 'dead';
type BallSide = 'below' | 'inside' | 'above';

interface GS {
  phase:      Phase;
  score:      number;
  hasContinued: boolean;
  // ball
  ballY:      number;
  ballVY:     number;
  colorIdx:   number;      // ball's current colour index (target)
  // ring geometry (computed from canvas size)
  ringCX:     number;
  ringCY:     number;
  ringR:      number;
  // ring animation
  rot:        number;      // current rotation (radians)
  rotSpeed:   number;      // rad/s
  rotDir:     number;      // +1 clockwise / -1 counter-clockwise
  // crossing state
  ballSide:   BallSide;
  checked:    boolean;     // already checked colour this crossing?
}

function makeGS(W: number, H: number, keepScore = 0): GS {
  const ringCY = H * 0.36;
  const ringR  = Math.min(W, H) * 0.26;
  return {
    phase:        keepScore > 0 ? 'playing' : 'idle',
    score:        keepScore,
    hasContinued: false,
    ballY:        ringCY + ringR + BALL_R + 36,
    ballVY:       0,
    colorIdx:     Math.floor(Math.random() * 4),
    ringCX:       W / 2,
    ringCY,
    ringR,
    rot:          0,
    rotSpeed:     Math.min(BASE_SPEED + SPEED_INC * keepScore, MAX_SPEED),
    rotDir:       1,
    ballSide:     'below',
    checked:      false,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ColorSwitchGame({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef     = useRef<GS | null>(null);
  const rafRef    = useRef(0);
  const prevTRef  = useRef(0);
  const cdRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phase,       setPhase]       = useState<Phase>('idle');
  const [score,       setScore]       = useState(0);
  const [reward,      setReward]      = useState(0);
  const [countdown,   setCountdown]   = useState(CONT_SECS);
  const [adLoading,   setAdLoading]   = useState(false);
  const [starLoading, setStarLoading] = useState(false);
  const [adConfig,    setAdConfig]    = useState<PublicConfig | null>(null);

  useEffect(() => { getPublicConfig().then(setAdConfig).catch(() => {}); }, []);

  // ── countdown for Continue overlay ─────────────────────────────────────────
  const clearCd = () => { if (cdRef.current) { clearInterval(cdRef.current); cdRef.current = null; } };

  useEffect(() => {
    if (phase !== 'continue') return;
    setCountdown(CONT_SECS);
    cdRef.current = setInterval(() => {
      setCountdown(p => {
        if (p <= 1) {
          clearCd();
          const gs = gsRef.current;
          if (gs && gs.phase === 'continue') {
            gs.phase = 'dead';
            creditColorSwitch(gs.score).catch(() => {});
            setPhase('dead');
            setReward(gs.score * REWARD_PER);
          }
          return 0;
        }
        return p - 1;
      });
    }, 1000);
    return clearCd;
  }, [phase]);

  // ── Die / Continue ──────────────────────────────────────────────────────────
  const triggerDead = useCallback((gs: GS) => {
    clearCd(); gs.phase = 'dead'; haptic('error');
    creditColorSwitch(gs.score).catch(() => {});
    setPhase('dead'); setScore(gs.score); setReward(gs.score * REWARD_PER);
  }, []);

  const triggerContinue = useCallback((gs: GS) => {
    gs.phase = 'continue'; haptic('error');
    setPhase('continue'); setScore(gs.score); setReward(gs.score * REWARD_PER);
  }, []);

  // ── Continue game (after ad/stars) ─────────────────────────────────────────
  const continueGame = useCallback(() => {
    clearCd();
    const canvas = canvasRef.current;
    if (!canvas || !gsRef.current) return;
    const gs = gsRef.current;
    gs.hasContinued = true;
    gs.phase   = 'playing';
    // reset ball below ring, keep score & speed
    gs.ballY  = gs.ringCY + gs.ringR + BALL_R + 36;
    gs.ballVY = 0;
    gs.ballSide = 'below';
    gs.checked  = false;
    haptic('success');
    setPhase('playing');
  }, []);

  // ── Restart ─────────────────────────────────────────────────────────────────
  const restartGame = useCallback(() => {
    clearCd();
    const canvas = canvasRef.current;
    if (!canvas) return;
    gsRef.current = makeGS(canvas.width, canvas.height);
    gsRef.current.phase = 'idle';
    prevTRef.current = 0;
    setPhase('idle'); setScore(0); setReward(0);
  }, []);

  // ── Ad / Stars ───────────────────────────────────────────────────────────────
  const adReady = !!(
    (adConfig?.adsgram?.enabled  && adConfig.adsgram.blockId)  ||
    (adConfig?.monetag?.enabled  && adConfig.monetag.zoneId)   ||
    (adConfig?.onclicka?.enabled && adConfig.onclicka.spotId)
  );

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
      const { invoiceUrl } = await createColorSwitchContinueInvoice();
      getTelegramWebApp()?.openInvoice?.(invoiceUrl, s => {
        setStarLoading(false);
        if (s === 'paid') continueGame();
      });
    } catch { setStarLoading(false); }
  }, [adLoading, starLoading, continueGame]);

  // ── Draw ────────────────────────────────────────────────────────────────────
  const draw = useCallback((canvas: HTMLCanvasElement, gs: GS) => {
    const ctx = canvas.getContext('2d')!;
    const W   = canvas.width;
    const H   = canvas.height;
    const { ringCX, ringCY, ringR, rot, ballY, colorIdx } = gs;

    // background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    // ── Ring ──
    ctx.lineWidth = RING_STROKE;
    ctx.lineCap   = 'butt';
    for (let i = 0; i < 4; i++) {
      const startA = rot + i * SEC_ANGLE + GAP_ANGLE / 2;
      const endA   = startA + ARC_SPAN;
      ctx.strokeStyle = COLORS[i];
      ctx.beginPath();
      ctx.arc(ringCX, ringCY, ringR, startA, endA);
      ctx.stroke();
    }

    // small triangle arrow at bottom of ring (entry guide)
    const arrowTipY  = ringCY + ringR + RING_STROKE / 2 + 10;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(ringCX,     arrowTipY + 9);
    ctx.lineTo(ringCX - 6, arrowTipY);
    ctx.lineTo(ringCX + 6, arrowTipY);
    ctx.closePath();
    ctx.fill();

    // ── Ball ──
    const ballColor = COLORS[colorIdx];
    ctx.shadowColor = ballColor;
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = ballColor;
    ctx.beginPath();
    ctx.arc(ringCX, ballY, BALL_R, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 0;

    // ── Idle hint ──
    if (gs.phase === 'idle') {
      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      ctx.font      = '16px system-ui, sans-serif';
      ctx.fillText('Tap to start', W / 2, H * 0.80);
    }
  }, []);

  // ── Game loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;

    const loop = (t: number) => {
      const dt = prevTRef.current ? Math.min((t - prevTRef.current) / 1000, 0.05) : 0;
      prevTRef.current = t;
      const gs = gsRef.current!;

      if (gs.phase === 'playing' || gs.phase === 'dying') {
        // ── Physics ──
        gs.ballVY += GRAVITY * dt;
        gs.ballY  += gs.ballVY * dt;

        // Floor: ball rests below ring (can't fall off screen)
        const floorY = canvas.height - BALL_R - 16;
        if (gs.ballY > floorY) { gs.ballY = floorY; gs.ballVY = 0; }

        // ── Ring rotation ──
        gs.rot += gs.rotDir * gs.rotSpeed * dt;

        if (gs.phase === 'playing') {
          // ── Crossing detection ──
          const outerEdge = gs.ringCY + gs.ringR;
          const innerEdge = gs.ringCY - gs.ringR;

          // Determine ball side relative to ring
          if (gs.ballY >= outerEdge + BALL_R * 0.6) {
            // fully below
            if (gs.ballSide !== 'below') {
              gs.ballSide = 'below';
              gs.checked  = false;
            }
          } else if (gs.ballY <= innerEdge - BALL_R * 0.6) {
            // fully above
            if (gs.ballSide !== 'above') {
              gs.ballSide = 'above';
              gs.checked  = false;
            }
          } else {
            // overlapping ring — only check colour when entering from below (moving upward)
            if (gs.ballSide === 'below' && !gs.checked && gs.ballVY < 0) {
              gs.checked  = true;
              gs.ballSide = 'inside';

              const BOTTOM = Math.PI / 2; // 6 o'clock
              if (!isGap(gs.rot, BOTTOM)) {
                const sec = sectorAtAngle(gs.rot, BOTTOM);
                if (sec === gs.colorIdx) {
                  // ✅ Correct colour!
                  gs.score++;
                  // pick a different colour for next round
                  gs.colorIdx  = (gs.colorIdx + 1 + Math.floor(Math.random() * 3)) % 4;
                  gs.rotDir   *= -1;
                  gs.rotSpeed  = Math.min(gs.rotSpeed + SPEED_INC, MAX_SPEED);
                  haptic('light');
                  setScore(gs.score);
                } else {
                  // ❌ Wrong colour
                  gs.phase = 'dying';
                  haptic('error');
                  setTimeout(() => {
                    const g = gsRef.current;
                    if (!g || g.phase !== 'dying') return;
                    if (!g.hasContinued) triggerContinue(g);
                    else                  triggerDead(g);
                  }, 350);
                }
              }
              // gap → safe, no action
            } else if (gs.ballSide === 'above') {
              gs.ballSide = 'inside'; // passing back down through ring safely
            }
          }
        }
      }

      draw(canvas, gs);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, triggerContinue, triggerDead]);

  // ── Canvas resize ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    const sync = () => {
      canvas.width  = canvas.offsetWidth  || 390;
      canvas.height = canvas.offsetHeight || 700;
      // recompute ring geometry on resize
      if (gsRef.current) {
        gsRef.current.ringCX = canvas.width  / 2;
        gsRef.current.ringCY = canvas.height * 0.36;
        gsRef.current.ringR  = Math.min(canvas.width, canvas.height) * 0.26;
      }
    };
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);
    sync();
    gsRef.current = makeGS(canvas.width, canvas.height);
    return () => ro.disconnect();
  }, []);

  // ── Tap ─────────────────────────────────────────────────────────────────────
  const onTap = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const gs = gsRef.current;
    if (!gs) return;
    if (gs.phase === 'idle') {
      gs.phase  = 'playing';
      gs.ballVY = TAP_VY;
      setPhase('playing');
      return;
    }
    if (gs.phase !== 'playing') return;
    // only let ball jump again when it's resting below the ring
    if (gs.ballSide !== 'below') return;
    gs.ballVY = TAP_VY;
    haptic('light');
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col bg-[#0f172a]" style={{ zIndex: 100 }}>
      {/* Header */}
      <div className="shrink-0 h-16 flex items-center justify-between px-4">
        <button
          onClick={onBack}
          className="p-2.5 rounded-full bg-white/5 border border-white/8 active:scale-90 transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Color Switch</p>
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

        <ContinueOverlay
          show={phase === 'continue'}
          score={score}
          countdown={countdown}
          adReady={adReady}
          adLoading={adLoading}
          starLoading={starLoading}
          onAd={handleAd}
          onStars={handleStars}
          onGiveUp={() => triggerDead(gsRef.current!)}
        />
        <DeadOverlay
          show={phase === 'dead'}
          score={score}
          reward={reward}
          gameName="ColorSwitch"
          onReplay={restartGame}
          onBack={onBack}
        />
      </div>
    </div>
  );
}
