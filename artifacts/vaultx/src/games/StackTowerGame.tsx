/**
 * Stack Tower — definitive canvas rebuild.
 *
 * Root causes of all previous bugs — and how they're fixed here:
 *
 * 1. ctx.roundRect() crashes on old Telegram WebViews  →  replaced with
 *    a manual path helper (rrect) that works everywhere.
 *
 * 2. Stale React-state closure in tap handler            →  onCanvasTap reads
 *    gsRef.current.phase directly; no React state in dep array.
 *
 * 3. Start-tap simultaneously placing a block            →  tapLockUntil ref
 *    ignores placements for 350 ms after game starts.
 *
 * 4. Moving block starting on top of placed block        →  new block always
 *    launches from the OPPOSITE wall after each placement.
 *
 * 5. Canvas clearing on ResizeObserver during play       →  header is fixed
 *    height (no layout shift) + ResizeObserver only updates dimensions,
 *    RAF redraws correctly on next frame.
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
const BLOCK_H    = 34;
const DEPTH      = 8;
const INIT_W     = 180;
const MIN_W      = 22;
const PERF_TOL   = 8;
const INIT_SPEED = 160;
const SPEED_STEP = 8;
const SIDE_PAD   = 14;
const REWARD_PER = 18;
const CONTINUE_SECS = 10;
const PALETTE    = ['#34d399','#22d3ee','#818cf8','#c084fc','#f472b6','#fb923c','#facc15','#4ade80'];
const bCol       = (i: number) => PALETTE[i % PALETTE.length]!;

// ─── Canvas helper: rounded rect WITHOUT ctx.roundRect ────────────────────────
function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
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

// ─── Draw one block ────────────────────────────────────────────────────────────
function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  col: string, isMoving: boolean,
) {
  if (w < 1) return;
  const faceH = BLOCK_H - DEPTH;
  const r = Math.min(6, w / 2);

  // Top face
  ctx.fillStyle = isMoving
    ? col + 'cc'       // slightly transparent for moving block
    : col;
  rrect(ctx, x, y, w, faceH, r);
  ctx.fill();

  // Highlight stripe
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  rrect(ctx, x + 3, y + 3, Math.max(0, w - 6), 4, 2);
  ctx.fill();

  // Depth face
  ctx.fillStyle = shadeHex(col, -35);
  rrect(ctx, x, y + faceH, w, DEPTH, r);
  ctx.fill();

  // Moving block: pulsing outline
  if (isMoving) {
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2;
    rrect(ctx, x + 1, y + 1, w - 2, BLOCK_H - 2, r);
    ctx.stroke();
  }
}

// ─── Colour math ──────────────────────────────────────────────────────────────
function shadeHex(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v + Math.round(255 * pct / 100)));
  const r = clamp(n >> 16);
  const g = clamp((n >> 8) & 0xff);
  const b = clamp(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'playing' | 'continue' | 'dead';
interface Block { x: number; w: number; idx: number }
interface GS {
  phase: Phase;
  blocks: Block[];
  curX: number; curW: number; dir: 1 | -1; speed: number;
  camOff: number; camTarget: number;
  score: number;
  hasContinued: boolean;
  flashUntil: number;
}

function fresh(): GS {
  return {
    phase: 'idle', blocks: [],
    curX: SIDE_PAD, curW: INIT_W, dir: 1, speed: INIT_SPEED,
    camOff: 0, camTarget: 0, score: 0, hasContinued: false, flashUntil: 0,
  };
}

function blockY(gs: GS, idx: number, H: number): number {
  return H - (idx + 1) * BLOCK_H + gs.camOff;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function StackTowerGame({ onBack }: { onBack: () => void }) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const gsRef       = useRef<GS>(fresh());
  const rafRef      = useRef(0);
  const prevTRef    = useRef(0);
  const cdRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  // tapLockUntil: timestamp (ms) before which placements are ignored
  const tapLockRef  = useRef(0);

  const [phase,       setPhase]       = useState<Phase>('idle');
  const [score,       setScore]       = useState(0);
  const [reward,      setReward]      = useState(0);
  const [countdown,   setCountdown]   = useState(CONTINUE_SECS);
  const [adLoading,   setAdLoading]   = useState(false);
  const [starLoading, setStarLoading] = useState(false);
  const [adConfig,    setAdConfig]    = useState<PublicConfig | null>(null);

  useEffect(() => { getPublicConfig().then(setAdConfig).catch(() => {}); }, []);

  const clearCd = () => {
    if (cdRef.current) { clearInterval(cdRef.current); cdRef.current = null; }
  };

  // ── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'continue') return;
    setCountdown(CONTINUE_SECS);
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

  // ── Trigger helpers ───────────────────────────────────────────────────────
  const triggerDead = useCallback((gs: GS) => {
    clearCd(); gs.phase = 'dead'; haptic('error');
    if (gs.score > 0) creditStackTower(gs.score).catch(() => {});
    setPhase('dead'); setScore(gs.score); setReward(gs.score * REWARD_PER);
  }, []);

  const triggerContinue = useCallback((gs: GS) => {
    gs.phase = 'continue'; haptic('error');
    setPhase('continue'); setScore(gs.score); setReward(gs.score * REWARD_PER);
  }, []);

  // ── RAF draw loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;

    const loop = (t: number) => {
      const dt = prevTRef.current ? Math.min((t - prevTRef.current) / 1000, 0.05) : 0;
      prevTRef.current = t;
      const gs = gsRef.current;
      const W  = canvas.width;
      const H  = canvas.height;
      const ctx = canvas.getContext('2d')!;

      // ── Physics ───────────────────────────────────────────────────────────
      if (gs.phase === 'playing') {
        const maxX = W - SIDE_PAD - gs.curW;
        gs.curX += gs.speed * gs.dir * dt;
        if (gs.curX <= SIDE_PAD) { gs.curX = SIDE_PAD; gs.dir =  1; }
        if (gs.curX >= maxX)     { gs.curX = maxX;     gs.dir = -1; }
        gs.camOff += (gs.camTarget - gs.camOff) * Math.min(1, dt * 6);
      }

      // ── Clear ─────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H);

      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#060d1a');
      bg.addColorStop(1, '#020508');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.025)';
      ctx.lineWidth   = 1;
      const off = (gs.camOff % BLOCK_H + BLOCK_H) % BLOCK_H;
      for (let y = H - off; y > 0; y -= BLOCK_H) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // ── Placed blocks ─────────────────────────────────────────────────────
      for (const b of gs.blocks) {
        const by = blockY(gs, b.idx, H);
        if (by > H + 4 || by + BLOCK_H < -4) continue;
        drawBlock(ctx, b.x, by, b.w, bCol(b.idx), false);
      }

      // ── Moving block ──────────────────────────────────────────────────────
      if (gs.phase === 'playing') {
        const movIdx = gs.blocks.length;
        const my     = blockY(gs, movIdx, H);
        drawBlock(ctx, gs.curX, my, gs.curW, bCol(movIdx), true);

        // Overlap guide: dim stripe showing where it lines up
        const last = gs.blocks[gs.blocks.length - 1];
        if (last) {
          const oL = Math.max(gs.curX, last.x);
          const oR = Math.min(gs.curX + gs.curW, last.x + last.w);
          if (oR > oL) {
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(oL, my, oR - oL, BLOCK_H);
          }
        }
      }

      // Flash overlay (on block placement)
      if (gs.flashUntil > t) {
        ctx.fillStyle = `rgba(255,255,255,${0.18 * (gs.flashUntil - t) / 120})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Score watermark
      if (gs.score > 0 && (gs.phase === 'playing')) {
        ctx.save();
        ctx.font      = `bold ${Math.min(100, 60 + gs.score)}px system-ui`;
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(gs.score), W / 2, H * 0.45);
        ctx.restore();
      }

      // Idle demo animation
      if (gs.phase === 'idle') {
        const t2  = t / 1000;
        const amp = (W / 2 - SIDE_PAD - INIT_W / 2) * 0.7;
        const px  = W / 2 - INIT_W / 2 + Math.sin(t2 * 1.4) * amp;
        drawBlock(ctx, W / 2 - INIT_W / 2, H * 0.55,            INIT_W, bCol(0), false);
        drawBlock(ctx, px,                  H * 0.55 - BLOCK_H,  INIT_W, bCol(1), true);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Canvas resize (fixed-height header means width is stable) ─────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    const sync = () => {
      canvas.width  = canvas.offsetWidth  || 390;
      canvas.height = canvas.offsetHeight || 600;
    };
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);
    sync();
    return () => ro.disconnect();
  }, []);

  // ── Start game ────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    clearCd();
    const canvas = canvasRef.current!;
    const W = canvas.width || 390;
    const gs = fresh();
    gs.phase  = 'playing';
    gs.blocks = [{ x: W / 2 - INIT_W / 2, w: INIT_W, idx: 0 }];
    gs.curX   = SIDE_PAD;
    gs.curW   = INIT_W;
    gs.dir    = 1;
    gsRef.current = gs;
    tapLockRef.current = Date.now() + 350;
    setPhase('playing'); setScore(0); setReward(0);
  }, []);

  // ── Place block ───────────────────────────────────────────────────────────
  const placeBlock = useCallback(() => {
    if (Date.now() < tapLockRef.current) return;        // locked after start
    const gs = gsRef.current;
    if (gs.phase !== 'playing') return;

    const canvas = canvasRef.current!;
    const W    = canvas.width || 390;
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
    gs.flashUntil = Date.now() + 120;

    // Camera: keep tower top visible
    gs.camTarget = Math.max(0, (idx + 2) * BLOCK_H - canvas.height * 0.62);

    // Next moving block from OPPOSITE wall
    const center = newX + newW / 2;
    gs.curW = newW;
    if (center <= W / 2) {
      gs.curX = W - SIDE_PAD - newW;   gs.dir = -1;
    } else {
      gs.curX = SIDE_PAD;               gs.dir =  1;
    }

    perfect ? haptic('success') : haptic('light');
    setScore(gs.score);
  }, [triggerContinue, triggerDead]);

  // ── Continue game (after ad / stars) ─────────────────────────────────────
  const continueGame = useCallback(() => {
    clearCd();
    const gs  = gsRef.current;
    const W   = canvasRef.current?.width ?? 390;
    const last = gs.blocks[gs.blocks.length - 1]!;
    gs.hasContinued = true;
    gs.phase  = 'playing';
    gs.curW   = last.w;
    const center = last.x + last.w / 2;
    if (center <= W / 2) { gs.curX = W - SIDE_PAD - last.w; gs.dir = -1; }
    else                  { gs.curX = SIDE_PAD;               gs.dir =  1; }
    haptic('success');
    setPhase('playing');
    tapLockRef.current = Date.now() + 200;
  }, []);

  // ── Watch Ad ──────────────────────────────────────────────────────────────
  const handleWatchAd = useCallback(async () => {
    if (adLoading || starLoading) return;
    setAdLoading(true);
    try   { await watchRewardedAdWithFallback(adConfig); continueGame(); }
    catch { /* dismissed */ }
    finally { setAdLoading(false); }
  }, [adConfig, adLoading, starLoading, continueGame]);

  // ── Pay Stars ─────────────────────────────────────────────────────────────
  const handlePayStars = useCallback(async () => {
    if (adLoading || starLoading) return;
    setStarLoading(true);
    try {
      const { invoiceUrl } = await createStackContinueInvoice();
      const twa = getTelegramWebApp();
      if (twa?.openInvoice) {
        twa.openInvoice(invoiceUrl, status => {
          setStarLoading(false);
          if (status === 'paid') continueGame();
        });
      } else { setStarLoading(false); }
    } catch { setStarLoading(false); }
  }, [adLoading, starLoading, continueGame]);

  // ── Canvas tap — reads gsRef directly, ZERO stale-closure risk ────────────
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
    <div className="flex flex-col bg-[#060d1a]" style={{ height: '100dvh', overflow: 'hidden' }}>

      {/* Fixed-height header — prevents layout shifts that would resize canvas */}
      <div className="shrink-0 h-16 flex items-center justify-between px-4">
        <button
          onClick={onBack}
          className="p-2.5 rounded-full bg-white/5 border border-white/8 active:scale-90 transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>

        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
            Stack Tower
          </p>
          {/* always reserve space so header height never changes */}
          <p className="text-3xl font-black text-white leading-none tabular-nums mt-0.5 h-[36px] flex items-center justify-center">
            {phase !== 'idle' ? score : ''}
          </p>
        </div>

        <div className="w-10" />
      </div>

      {/* Game area */}
      <div className="flex-1 relative" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ touchAction: 'none', display: 'block' }}
          onPointerDown={phase === 'idle' || phase === 'playing' ? onTap : undefined}
        />

        {/* Idle overlay */}
        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-16 pointer-events-none">
            <p className="text-4xl font-black text-white tracking-tight drop-shadow-xl">Stack Tower</p>
            <p className="text-sm text-white/40 mt-2 mb-8">Tap anywhere to start</p>
            <div className="text-3xl animate-bounce">👆</div>
          </div>
        )}

        {/* Continue overlay */}
        {phase === 'continue' && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-[8px]"
            onPointerDown={e => e.stopPropagation()}
          >
            <div className="px-8 w-full max-w-[320px] mx-auto text-center">
              <div className="relative w-20 h-20 mx-auto mb-5">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6"/>
                  <circle
                    cx="40" cy="40" r="34" fill="none" strokeWidth="6"
                    stroke={countdown <= 3 ? '#f87171' : '#34d399'}
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - countdown / CONTINUE_SECS)}`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
                  />
                </svg>
                <span
                  className="absolute inset-0 flex items-center justify-center text-2xl font-black"
                  style={{ color: countdown <= 3 ? '#f87171' : '#34d399' }}
                >{countdown}</span>
              </div>

              <p className="text-2xl font-black text-white mb-1">Continue?</p>
              <p className="text-sm text-white/40 mb-7">
                {score === 0 ? 'No blocks placed' : `You reached floor ${score}`}
              </p>

              {adReady && (
                <button
                  onClick={handleWatchAd}
                  disabled={adLoading || starLoading}
                  className="w-full py-4 rounded-2xl text-sm font-black text-black mb-3 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#34d399,#10b981)' }}
                >
                  {adLoading
                    ? <><Spin dark /> Loading ad…</>
                    : <><PlayCircle className="w-4 h-4"/> Watch Ad — Free</>}
                </button>
              )}

              <button
                onClick={handlePayStars}
                disabled={adLoading || starLoading}
                className="w-full py-4 rounded-2xl text-sm font-black mb-3 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  background: 'rgba(251,191,36,0.1)',
                  border: '1px solid rgba(251,191,36,0.35)',
                  color: '#fbbf24',
                }}
              >
                {starLoading
                  ? <><Spin /> Opening…</>
                  : <><Star className="w-4 h-4 fill-current"/> Pay ★10 — Continue</>}
              </button>

              <button
                onClick={() => triggerDead(gsRef.current)}
                disabled={adLoading || starLoading}
                className="w-full py-3 rounded-2xl text-sm font-semibold text-white/35 bg-white/5 active:scale-95 transition-all"
              >Give up</button>
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
                {score === 0 ? 'No blocks placed' : `You stacked ${score} floor${score !== 1 ? 's' : ''}`}
              </p>
              {reward > 0 && (
                <div className="mb-6 px-5 py-4 rounded-2xl" style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.18)' }}>
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
              >🔄 Play Again</button>
              <button
                onClick={onBack}
                className="w-full mt-3 py-3 rounded-2xl text-sm font-semibold text-white/40 bg-white/5 border border-white/8 active:scale-95 transition-transform"
              >Exit</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Spin({ dark = false }: { dark?: boolean }) {
  return (
    <span className="w-4 h-4 rounded-full border-2 animate-spin" style={{
      borderColor:    dark ? 'rgba(0,0,0,0.2)'   : 'rgba(255,255,255,0.2)',
      borderTopColor: dark ? '#000' : '#fff',
    }}/>
  );
}
