/**
 * Color Switch — tap to jump, pass through the ring sector matching your ball's color.
 *
 * Mechanic:
 *  • Ball has gravity — tap to impulse upward.
 *  • Rings have 4 colored arcs rotating continuously (speed increases with score).
 *  • Ball must pass through the arc whose color matches the ball.
 *  • Pass → ball changes color, score++, particles explode.
 *  • Wrong sector → Continue? (Watch Ad / Pay ★10) or Game Over.
 *  • Reward: score × 12 SKP.
 *
 * Physics (world Y increases upward):
 *   ballVY -= GRAVITY*dt  (gravity)      ballWorldY += ballVY*dt
 *   screenY(p) = H*BALL_SY − (p.worldY − ball.worldY)
 *
 * Collision:
 *   d = ring.worldY − ball.worldY  (positive = ring above ball)
 *   Enter zone: d ≤ RING_R + BALL_R → check color at angle π/2 (canvas bottom-of-ring)
 *   Pass center: d ≤ 0 → ring passed, new color, particles
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
import { ContinueOverlay, DeadOverlay } from './StackGame';

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = ['#34d399', '#818cf8', '#f472b6', '#facc15'] as const;
type Color = (typeof COLORS)[number];

const RING_R       = 76;
const RING_W       = 20;
const RING_INNER   = RING_R - RING_W;          // 56
const BALL_R       = 12;
const GRAVITY      = 860;                       // world units / s²
const JUMP_VY      = 430;                       // world units / s upward
const RING_SPACING = 240;                       // world units between rings
const LOOKAHEAD    = 7;                         // rings generated ahead
const BALL_SY      = 0.62;                      // ball fixed at this fraction from canvas top
const GAP_ANGLE    = 0.10;                      // radians gap between arcs (visual only)
const ARC_SPAN     = (2 * Math.PI - 4 * GAP_ANGLE) / 4; // ≈ 1.471 rad per arc
const REWARD_PER   = 12;                        // SKP per ring passed
const ROT_BASE     = 1.3;                       // rad / s at score 0
const ROT_STEP     = 0.05;                      // rad / s added per 5 rings

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'playing' | 'continue' | 'dead';

interface Ring {
  worldY:      number;
  rotation:    number;
  rotDir:      1 | -1;
  colorOffset: number;   // COLORS index at arc 0
  state:       'ahead' | 'crossing' | 'passed';
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  color: string;
  life: number;   // 1 → 0
}

interface GS {
  phase:        Phase;
  ballWorldY:   number;
  ballVY:       number;
  ballColor:    Color;
  rings:        Ring[];
  particles:    Particle[];
  score:        number;
  hasContinued: boolean;
  nextRingN:    number;  // next ring at worldY = nextRingN * RING_SPACING
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fresh(): GS {
  const rings: Ring[] = [];
  for (let i = 1; i <= LOOKAHEAD; i++) rings.push(makeRing(i * RING_SPACING, i));
  return {
    phase: 'idle', ballWorldY: 0, ballVY: 0,
    ballColor: COLORS[Math.floor(Math.random() * 4)]!,
    rings, particles: [], score: 0, hasContinued: false,
    nextRingN: LOOKAHEAD + 1,
  };
}

function makeRing(worldY: number, n: number): Ring {
  return {
    worldY,
    rotation:    Math.random() * Math.PI * 2,
    rotDir:      n % 2 === 0 ? 1 : -1,
    colorOffset: Math.floor(Math.random() * 4),
    state:       'ahead',
  };
}

function rotSpeed(score: number) {
  return ROT_BASE + Math.floor(score / 5) * ROT_STEP;
}

/** Returns the color of the arc at canvas angle `angle`, or null if in a gap. */
function colorAtAngle(ring: Ring, angle: number): Color | null {
  const period = ARC_SPAN + GAP_ANGLE;
  const rel = ((angle - ring.rotation) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const posInPeriod = rel % period;
  if (posInPeriod >= ARC_SPAN) return null;
  const sector = Math.floor(rel / period) % 4;
  return COLORS[(ring.colorOffset + sector) % 4]!;
}

function spawnParticles(gs: GS, cx: number, sy: number, color: string) {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
    const spd = 70 + Math.random() * 130;
    gs.particles.push({ x: cx, y: sy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, color, life: 1 });
  }
}

function drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, ring: Ring, alpha = 1) {
  const period = ARC_SPAN + GAP_ANGLE;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 4; i++) {
    const start = ring.rotation + i * period;
    const end   = start + ARC_SPAN;
    const color = COLORS[(ring.colorOffset + i) % 4]!;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, RING_R,     start, end);
    ctx.arc(cx, cy, RING_INNER, end, start, true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ColorSwitchGame({ onBack }: { onBack: () => void }) {
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

  const clearCd = () => { if (cdRef.current) { clearInterval(cdRef.current); cdRef.current = null; } };

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
            if (gs.score > 0) creditColorSwitch(gs.score).catch(() => {});
            setPhase('dead'); setReward(gs.score * REWARD_PER);
          }
          return 0;
        }
        return p - 1;
      });
    }, 1000);
    return clearCd;
  }, [phase]);

  const triggerDead = useCallback((gs: GS) => {
    clearCd(); gs.phase = 'dead'; haptic('error');
    if (gs.score > 0) creditColorSwitch(gs.score).catch(() => {});
    setPhase('dead'); setScore(gs.score); setReward(gs.score * REWARD_PER);
  }, []);

  const triggerContinue = useCallback((gs: GS) => {
    gs.phase = 'continue'; haptic('error');
    setPhase('continue'); setScore(gs.score); setReward(gs.score * REWARD_PER);
  }, []);

  const startGame = useCallback(() => {
    clearCd();
    const gs = fresh();
    gs.phase = 'playing';
    gsRef.current = gs;
    tapLockUntil.current = Date.now() + 280;
    setPhase('playing'); setScore(0); setReward(0);
  }, []);

  const doJump = useCallback(() => {
    if (Date.now() < tapLockUntil.current) return;
    const gs = gsRef.current;
    if (gs.phase !== 'playing') return;
    gs.ballVY = JUMP_VY;
    haptic('light');
  }, []);

  const continueGame = useCallback(() => {
    clearCd();
    const gs = gsRef.current;
    gs.hasContinued = true;
    gs.phase        = 'playing';
    gs.ballVY       = JUMP_VY * 0.5;
    haptic('success');
    setPhase('playing');
    tapLockUntil.current = Date.now() + 280;
  }, []);

  const handleAd = useCallback(async () => {
    if (adLoading || starLoading) return;
    setAdLoading(true);
    try { await watchRewardedAdWithFallback(adConfig); continueGame(); }
    catch { }
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
      const cx  = W / 2;
      const bsy = H * BALL_SY;

      // ── Physics ───────────────────────────────────────────────────────────
      if (gs.phase === 'playing') {
        gs.ballVY     -= GRAVITY * dt;
        gs.ballWorldY += gs.ballVY * dt;

        const spd = rotSpeed(gs.score);
        for (const r of gs.rings) r.rotation += spd * r.rotDir * dt;

        // Generate rings ahead
        const activeRings = gs.rings.filter(r => r.state !== 'passed');
        while (activeRings.length < LOOKAHEAD) {
          const nr = makeRing(gs.nextRingN * RING_SPACING, gs.nextRingN);
          gs.rings.push(nr); activeRings.push(nr);
          gs.nextRingN++;
        }

        // Collision
        let died = false;
        for (const ring of gs.rings) {
          if (ring.state === 'passed' || died) continue;
          const d = ring.worldY - gs.ballWorldY;

          // Ball enters the ring arc zone (from below)
          if (ring.state === 'ahead' && d <= RING_R + BALL_R && d > 0) {
            ring.state = 'crossing';
            const hitColor = colorAtAngle(ring, Math.PI / 2);
            if (hitColor !== null && hitColor !== gs.ballColor) {
              died = true;
              if (!gs.hasContinued) triggerContinue(gs);
              else                   triggerDead(gs);
            }
          }

          // Ball passed ring center
          if (!died && ring.state === 'crossing' && d <= 0) {
            ring.state = 'passed';
            gs.score++;

            const others = COLORS.filter(c => c !== gs.ballColor);
            gs.ballColor = others[Math.floor(Math.random() * others.length)]!;

            const ringScreenY = bsy - (ring.worldY - gs.ballWorldY);
            spawnParticles(gs, cx, ringScreenY, gs.ballColor);
            haptic('medium');
            setScore(gs.score);
          }
        }

        // Particles
        for (const p of gs.particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 220 * dt;
          p.life -= dt * 2;
        }
        gs.particles = gs.particles.filter(p => p.life > 0);

        // Prune old rings
        gs.rings = gs.rings.filter(r => r.worldY > gs.ballWorldY - RING_SPACING * 2);
      }

      // ── Draw background ───────────────────────────────────────────────────
      ctx.fillStyle = '#040b17';
      ctx.fillRect(0, 0, W, H);

      // Color-tinted ambient glow behind ball
      if (gs.phase !== 'idle') {
        const grd = ctx.createRadialGradient(cx, bsy, 5, cx, bsy, 200);
        grd.addColorStop(0, `${gs.ballColor}1a`);
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, H);
      }

      // ── Draw rings ────────────────────────────────────────────────────────
      if (gs.phase === 'playing' || gs.phase === 'continue') {
        for (const ring of gs.rings) {
          const rsy = bsy - (ring.worldY - gs.ballWorldY);
          if (rsy < -RING_R - 20 || rsy > H + RING_R + 20) continue;
          drawRing(ctx, cx, rsy, ring, ring.state === 'passed' ? 0.25 : 1);
        }
      }

      // ── Particles ─────────────────────────────────────────────────────────
      for (const p of gs.particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle   = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur  = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;

      // ── Ball ─────────────────────────────────────────────────────────────
      if (gs.phase !== 'idle') {
        ctx.shadowColor = gs.ballColor;
        ctx.shadowBlur  = 22;
        const bg = ctx.createRadialGradient(cx - 3, bsy - 4, 2, cx, bsy, BALL_R);
        bg.addColorStop(0, '#ffffff');
        bg.addColorStop(0.45, gs.ballColor);
        bg.addColorStop(1, gs.ballColor + 'aa');
        ctx.beginPath();
        ctx.arc(cx, bsy, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ── Score watermark ───────────────────────────────────────────────────
      if (gs.score > 0 && gs.phase === 'playing') {
        ctx.save();
        ctx.font         = `bold ${Math.min(150, 72 + gs.score * 2)}px system-ui`;
        ctx.fillStyle    = 'rgba(255,255,255,0.022)';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(gs.score), cx, H * 0.42);
        ctx.restore();
      }

      // ── Idle: animated demo ───────────────────────────────────────────────
      if (gs.phase === 'idle') {
        const sec = t / 1000;
        // 3 slowly rotating demo rings
        const demoYs = [H * 0.20, H * 0.42, H * 0.64];
        for (let i = 0; i < 3; i++) {
          const r: Ring = {
            worldY: 0, state: 'ahead',
            rotation:    sec * 0.8 * (i % 2 === 0 ? 1 : -1) + i * 1.1,
            rotDir:      1, colorOffset: i,
          };
          drawRing(ctx, cx, demoYs[i]!, r);
        }
        // Demo ball bouncing
        const bounce  = Math.abs(Math.sin(sec * 2.2)) * 30 - 15;
        const demoCol = COLORS[Math.floor(sec * 1.5) % 4]!;
        ctx.shadowColor = demoCol;
        ctx.shadowBlur  = 20;
        ctx.beginPath();
        ctx.arc(cx, H * 0.62 + bounce, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = demoCol;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [triggerContinue, triggerDead]);

  // ── Resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current!;
    const sync = () => { cv.width = cv.offsetWidth || 390; cv.height = cv.offsetHeight || 700; };
    const ro = new ResizeObserver(sync);
    ro.observe(cv); sync();
    return () => ro.disconnect();
  }, []);

  const onTap = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const p = gsRef.current.phase;
    if (p === 'idle')    { startGame(); return; }
    if (p === 'playing') { doJump();   return; }
  }, [startGame, doJump]);

  const adReady = !!(
    (adConfig?.adsgram.enabled  && adConfig.adsgram.blockId)  ||
    (adConfig?.monetag.enabled  && adConfig.monetag.zoneId)   ||
    (adConfig?.onclicka.enabled && adConfig.onclicka.spotId)
  );

  return (
    <div className="fixed inset-0 flex flex-col" style={{ zIndex: 100, background: '#040b17' }}>

      {/* Header */}
      <div className="shrink-0 h-16 flex items-center justify-between px-4">
        <button onClick={onBack}
          className="p-2.5 rounded-full bg-white/5 border border-white/8 active:scale-90 transition-all">
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

        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-20 pointer-events-none">
            <p className="text-4xl font-black text-white tracking-tight drop-shadow-2xl">Color Switch</p>
            <p className="text-sm text-white/40 mt-2 mb-10">Tap to jump — match the color</p>
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
          gameName="ColorSwitch" onReplay={startGame} onBack={onBack}
        />
      </div>
    </div>
  );
}
