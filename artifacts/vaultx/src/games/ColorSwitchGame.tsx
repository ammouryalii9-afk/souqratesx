/**
 * Color Switch — tap when the rotating ring shows your ball's color at the pointer.
 *
 * Mechanic:
 *  • A 4-colored ring rotates around a central colored ball.
 *  • A fixed pointer sits at the top (12 o'clock).
 *  • Tap when the COLOR under the pointer matches the ball's color → score++.
 *  • After each correct tap: ball gets a new color, ring REVERSES direction, speed ↑.
 *  • Wrong color under pointer on tap → Continue? or Game Over.
 *  • Tapping when a gap is under the pointer → safe, nothing happens.
 *  • Reward: score × 12 SKP.
 *
 * Canvas conventions:
 *  • Pointer fixed at canvas angle −π/2 (12 o'clock / top).
 *  • ring.rotation accumulates; color at pointer =
 *      COLORS[⌊((−π/2 − rotation + 100π) / (π/2))⌋ % 4]
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

const POINTER_ANGLE = -Math.PI / 2;   // 12 o'clock in canvas coords
const SEC_PER_COLOR = Math.PI / 2;    // 90° per sector
const GAP_ANGLE     = 0.09;           // radians gap between sectors (cosmetic)
const ARC_SPAN      = SEC_PER_COLOR - GAP_ANGLE;

const BASE_SPEED    = 1.0;            // rad / s
const SPEED_INC     = 0.09;           // added per correct tap
const MAX_SPEED     = 5.0;            // rad / s cap
const REWARD_PER    = 12;             // SKP per ring

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'playing' | 'continue' | 'dead';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  color: string; life: number;
}

interface GS {
  phase:        Phase;
  rotation:     number;       // ring rotation in radians
  rotSpeed:     number;       // rad / s (always positive; direction from rotDir)
  rotDir:       1 | -1;       // +1 = clockwise, −1 = counter-clockwise
  ballColor:    Color;
  score:        number;
  hasContinued: boolean;
  particles:    Particle[];
  flash:        number;       // 0..1 — brief white flash on correct tap
  flashColor:   string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fresh(): GS {
  return {
    phase: 'idle',
    rotation: 0, rotSpeed: BASE_SPEED, rotDir: 1,
    ballColor: COLORS[Math.floor(Math.random() * 4)]!,
    score: 0, hasContinued: false,
    particles: [], flash: 0, flashColor: '#fff',
  };
}

/** Returns the Color at the pointer, or null if a gap is there. */
function colorAtPointer(rotation: number): Color | null {
  const rel = ((POINTER_ANGLE - rotation) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const posInSector = rel % SEC_PER_COLOR;
  if (posInSector > ARC_SPAN) return null;                 // in a gap
  return COLORS[Math.floor(rel / SEC_PER_COLOR) % 4]!;
}

function spawnParticles(gs: GS, cx: number, cy: number, R: number, color: string) {
  // Burst from the pointer position (top of ring)
  const px = cx + Math.cos(POINTER_ANGLE) * R;
  const py = cy + Math.sin(POINTER_ANGLE) * R;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
    const s = 60 + Math.random() * 140;
    gs.particles.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, life: 1 });
  }
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
    tapLockUntil.current = Date.now() + 320;
    setPhase('playing'); setScore(0); setReward(0);
  }, []);

  // ── Tap: the core judgment ────────────────────────────────────────────────
  const doTap = useCallback(() => {
    if (Date.now() < tapLockUntil.current) return;
    const gs = gsRef.current;
    if (gs.phase !== 'playing') return;

    const hit = colorAtPointer(gs.rotation);
    if (hit === null) return;          // tapped on a gap → safe, ignore

    if (hit === gs.ballColor) {
      // ✓ Correct
      gs.score++;
      const others = COLORS.filter(c => c !== gs.ballColor);
      const newColor = others[Math.floor(Math.random() * others.length)]!;
      gs.ballColor  = newColor;
      gs.rotDir     = gs.rotDir === 1 ? -1 : 1;   // reverse!
      gs.rotSpeed   = Math.min(MAX_SPEED, gs.rotSpeed + SPEED_INC);
      gs.flash      = 1;
      gs.flashColor = hit;

      const W   = canvasRef.current?.width  ?? 390;
      const H   = canvasRef.current?.height ?? 700;
      const R   = Math.min(W, H) * 0.30;
      spawnParticles(gs, W / 2, H * 0.48, R, hit);

      haptic('medium');
      setScore(gs.score);
    } else {
      // ✗ Wrong
      if (!gs.hasContinued) triggerContinue(gs);
      else                   triggerDead(gs);
    }
  }, [triggerContinue, triggerDead]);

  const continueGame = useCallback(() => {
    clearCd();
    const gs = gsRef.current;
    gs.hasContinued = true;
    gs.phase        = 'playing';
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
      const cy  = H * 0.48;
      const R   = Math.min(W, H) * 0.30;   // ring outer radius
      const RW  = 26;                        // ring arc width
      const RI  = R - RW;                    // ring inner radius
      const BR  = 30;                        // ball radius

      // ── Physics ───────────────────────────────────────────────────────────
      if (gs.phase === 'playing') {
        gs.rotation += gs.rotSpeed * gs.rotDir * dt;
        gs.flash     = Math.max(0, gs.flash - dt * 4);

        // Particles
        for (const p of gs.particles) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vy += 180 * dt;
          p.life -= dt * 1.8;
        }
        gs.particles = gs.particles.filter(p => p.life > 0);
      }

      // ── Background ────────────────────────────────────────────────────────
      ctx.fillStyle = '#040b17';
      ctx.fillRect(0, 0, W, H);

      // Ambient glow from ball color
      const grd = ctx.createRadialGradient(cx, cy, 10, cx, cy, R * 1.6);
      grd.addColorStop(0, `${gs.ballColor}1a`);
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      // Flash overlay on correct tap
      if (gs.flash > 0) {
        ctx.globalAlpha = gs.flash * 0.12;
        ctx.fillStyle   = gs.flashColor;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }

      // ── Draw ring (idle or playing) ────────────────────────────────────────
      const ringRotation = gs.phase === 'idle'
        ? (t / 1000) * 0.7     // slow idle spin
        : gs.rotation;

      for (let i = 0; i < 4; i++) {
        const start = ringRotation + i * SEC_PER_COLOR + GAP_ANGLE / 2;
        const end   = start + ARC_SPAN;
        const color = COLORS[i]!;

        ctx.shadowColor = color;
        ctx.shadowBlur  = 14;
        ctx.beginPath();
        ctx.arc(cx, cy, R,  start, end);
        ctx.arc(cx, cy, RI, end, start, true);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // ── Pointer at 12 o'clock ─────────────────────────────────────────────
      const px = cx + Math.cos(POINTER_ANGLE) * R;
      const py = cy + Math.sin(POINTER_ANGLE) * R;
      // Outer triangle pointing inward
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(POINTER_ANGLE + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -(RW * 0.5 + 10));
      ctx.lineTo(-7, -(RW * 0.5 + 22));
      ctx.lineTo( 7, -(RW * 0.5 + 22));
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur  = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();

      // ── Central ball ─────────────────────────────────────────────────────
      // Pulsing ring around ball to indicate "this is your color"
      if (gs.phase === 'playing' || gs.phase === 'continue') {
        const pulse = 0.6 + 0.4 * Math.sin(t / 300);
        ctx.globalAlpha = pulse * 0.4;
        ctx.strokeStyle = gs.ballColor;
        ctx.lineWidth   = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, BR + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.shadowColor = gs.ballColor;
      ctx.shadowBlur  = gs.phase === 'idle' ? 10 : 20;
      const ballGrd = ctx.createRadialGradient(cx - 6, cy - 6, 4, cx, cy, BR);
      ballGrd.addColorStop(0, '#ffffff');
      ballGrd.addColorStop(0.4, gs.ballColor);
      ballGrd.addColorStop(1,   gs.ballColor + 'aa');
      ctx.beginPath();
      ctx.arc(cx, cy, BR, 0, Math.PI * 2);
      ctx.fillStyle = ballGrd;
      ctx.fill();
      ctx.shadowBlur = 0;

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

      // ── Score in ring center ──────────────────────────────────────────────
      if (gs.score > 0 && (gs.phase === 'playing' || gs.phase === 'continue')) {
        ctx.save();
        ctx.font         = `bold ${Math.min(52, 28 + gs.score)}px system-ui`;
        ctx.fillStyle    = 'rgba(255,255,255,0.08)';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(gs.score), cx, cy + BR + 22);
        ctx.restore();
      }

      // ── Speed indicator dots ──────────────────────────────────────────────
      if (gs.phase === 'playing') {
        const dotsTotal = 10;
        const dotsFill  = Math.round((gs.rotSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED) * dotsTotal);
        for (let i = 0; i < dotsTotal; i++) {
          ctx.beginPath();
          ctx.arc(cx - (dotsTotal / 2 - 0.5) * 14 + i * 14, cy + BR + 54, 4, 0, Math.PI * 2);
          ctx.fillStyle = i < dotsFill ? gs.ballColor : 'rgba(255,255,255,0.12)';
          ctx.fill();
        }
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
    if (p === 'playing') { doTap();    return; }
  }, [startGame, doTap]);

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

        {/* Idle hint */}
        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-20 pointer-events-none">
            <p className="text-4xl font-black text-white tracking-tight drop-shadow-2xl">Color Switch</p>
            <p className="text-sm text-white/40 mt-2 mb-10">Tap when the pointer matches the ball color</p>
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
