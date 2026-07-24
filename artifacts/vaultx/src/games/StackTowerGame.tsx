/**
 * Stack Tower — CSS/div-based rebuild.
 *
 * No canvas. Every block is an absolutely-positioned <div>. The moving block
 * is driven by requestAnimationFrame + a mutable ref, so there are zero
 * React-state-closure bugs. Pointer events read from the live ref, not from
 * stale React state.
 *
 * Mechanics:
 *  • Moving block bounces wall-to-wall at increasing speed.
 *  • Tap → overlap with block below is kept; overhang is discarded.
 *  • ±PERF_TOL px = perfect placement (no shrink, visual flash).
 *  • Width < MIN_W or complete miss → game over / continue screen.
 *  • First miss: Watch Ad (free) or Pay ★10 Stars → continue.
 *  • Reward: score × REWARD_PER SKP credited on game over.
 */

import {
  useEffect, useRef, useState, useCallback,
} from 'react';
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
const BLOCK_H    = 34;    // px — visual height of each block
const INIT_W     = 180;   // px — starting block width
const MIN_W      = 22;    // px — thinner than this = game over
const PERF_TOL   = 8;     // px — "perfect" tolerance
const INIT_SPEED = 200;   // px / s  (faster feels better on mobile)
const SPEED_STEP = 10;    // px / s added per floor
const SIDE_PAD   = 12;    // px — minimum gap from container edge
const REWARD_PER = 18;    // SKP per floor
const CONTINUE_SECS = 10;

// ─── Colour palette ───────────────────────────────────────────────────────────
const PALETTE = [
  '#34d399','#22d3ee','#818cf8','#c084fc',
  '#f472b6','#fb923c','#facc15','#4ade80',
];
const bColor = (idx: number) => PALETTE[idx % PALETTE.length]!;

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'playing' | 'continue' | 'dead';

interface Block { x: number; w: number; idx: number }

// All mutable game state — never in React state
interface GS {
  phase: Phase;
  blocks: Block[];       // placed blocks (idx 0 = base)
  curX:  number;         // moving block left edge
  curW:  number;         // moving block width
  dir:   1 | -1;
  speed: number;
  hasContinued: boolean;
  score: number;
}

function fresh(): GS {
  return {
    phase: 'idle', blocks: [], curX: SIDE_PAD, curW: INIT_W,
    dir: 1, speed: INIT_SPEED, hasContinued: false, score: 0,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export function StackTowerGame({ onBack }: { onBack: () => void }) {
  const areaRef  = useRef<HTMLDivElement>(null);   // game area (measures width)
  const movRef   = useRef<HTMLDivElement>(null);   // moving-block DOM element
  const gsRef    = useRef<GS>(fresh());
  const rafRef   = useRef(0);
  const prevTRef = useRef(0);
  const cdRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // React state — overlays only
  const [phase,       setPhase]       = useState<Phase>('idle');
  const [score,       setScore]       = useState(0);
  const [reward,      setReward]      = useState(0);
  const [countdown,   setCountdown]   = useState(CONTINUE_SECS);
  const [placed,      setPlaced]      = useState<Block[]>([]);
  const [flashIdx,    setFlashIdx]    = useState(-1);   // block idx to flash
  const [adLoading,   setAdLoading]   = useState(false);
  const [starLoading, setStarLoading] = useState(false);
  const [adConfig,    setAdConfig]    = useState<PublicConfig | null>(null);

  useEffect(() => { getPublicConfig().then(setAdConfig).catch(() => {}); }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const clearCd = () => {
    if (cdRef.current) { clearInterval(cdRef.current); cdRef.current = null; }
  };

  /** Width of the game area. Falls back to window.innerWidth. */
  const areaW = () => areaRef.current?.offsetWidth ?? window.innerWidth;

  /** Position the moving-block div without a React re-render. */
  const syncMov = (x: number, w: number) => {
    const el = movRef.current;
    if (!el) return;
    el.style.left  = `${x}px`;
    el.style.width = `${w}px`;
  };

  // ── Countdown (continue phase) ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'continue') return;
    setCountdown(CONTINUE_SECS);
    cdRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearCd();
          const gs = gsRef.current;
          if (gs.phase === 'continue') {
            gs.phase = 'dead';
            if (gs.score > 0) creditStackTower(gs.score).catch(() => {});
            setPhase('dead'); setReward(gs.score * REWARD_PER);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return clearCd;
  }, [phase]);

  // ── Trigger helpers ───────────────────────────────────────────────────────
  const triggerDead = useCallback((gs: GS) => {
    clearCd(); cancelAnimationFrame(rafRef.current);
    gs.phase = 'dead';
    haptic('error');
    if (gs.score > 0) creditStackTower(gs.score).catch(() => {});
    setPhase('dead'); setScore(gs.score); setReward(gs.score * REWARD_PER);
  }, []);

  const triggerContinue = useCallback((gs: GS) => {
    cancelAnimationFrame(rafRef.current);
    gs.phase = 'continue';
    haptic('error');
    setPhase('continue'); setScore(gs.score); setReward(gs.score * REWARD_PER);
  }, []);

  // ── RAF loop ──────────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    prevTRef.current = 0;

    const loop = (t: number) => {
      const dt = prevTRef.current ? Math.min((t - prevTRef.current) / 1000, 0.05) : 0;
      prevTRef.current = t;

      const gs = gsRef.current;
      if (gs.phase !== 'playing') return;

      const W    = areaW();
      const maxX = W - SIDE_PAD - gs.curW;

      gs.curX += gs.speed * gs.dir * dt;
      if (gs.curX <= SIDE_PAD) { gs.curX = SIDE_PAD; gs.dir =  1; }
      if (gs.curX >= maxX)     { gs.curX = maxX;     gs.dir = -1; }

      syncMov(gs.curX, gs.curW);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // ── Start ─────────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    clearCd();
    const gs = fresh();
    const W  = areaW();
    gs.phase   = 'playing';
    gs.blocks  = [{ x: W / 2 - INIT_W / 2, w: INIT_W, idx: 0 }];
    gs.curX    = SIDE_PAD;
    gs.curW    = INIT_W;
    gs.dir     = 1;
    gsRef.current = gs;
    setPhase('playing');
    setScore(0); setReward(0); setFlashIdx(-1);
    setPlaced([{ x: W / 2 - INIT_W / 2, w: INIT_W, idx: 0 }]);
    syncMov(gs.curX, gs.curW);
    startLoop();
  }, [startLoop]);

  // ── Place block ───────────────────────────────────────────────────────────
  const placeBlock = useCallback(() => {
    const gs = gsRef.current;
    if (gs.phase !== 'playing') return;

    const W    = areaW();
    const last = gs.blocks[gs.blocks.length - 1]!;
    const oL   = Math.max(gs.curX, last.x);
    const oR   = Math.min(gs.curX + gs.curW, last.x + last.w);
    const overlapW = oR - oL;

    const miss = () => {
      if (!gs.hasContinued) triggerContinue(gs);
      else                   triggerDead(gs);
    };

    if (overlapW <= 0 || overlapW < MIN_W) { miss(); return; }

    const isPerfect = Math.abs(gs.curX - last.x) <= PERF_TOL;
    const newW = isPerfect ? last.w : overlapW;
    const newX = isPerfect ? last.x : oL;

    const idx = gs.blocks.length;
    const newBlock: Block = { x: newX, w: newW, idx };
    gs.blocks.push(newBlock);
    gs.score++;
    gs.speed = INIT_SPEED + gs.score * SPEED_STEP;

    isPerfect ? haptic('success') : haptic('light');
    setFlashIdx(idx);
    setTimeout(() => setFlashIdx(-1), 350);

    // New moving block starts from OPPOSITE wall
    gs.curW = newW;
    const center = newX + newW / 2;
    if (center <= W / 2) {
      gs.curX = W - SIDE_PAD - newW; gs.dir = -1;   // placed left → enter from right
    } else {
      gs.curX = SIDE_PAD;             gs.dir =  1;   // placed right → enter from left
    }

    syncMov(gs.curX, gs.curW);
    setScore(gs.score);
    setPlaced(prev => [...prev, newBlock]);
  }, [triggerContinue, triggerDead]);

  // ── Continue after ad/stars ───────────────────────────────────────────────
  const continueGame = useCallback(() => {
    clearCd();
    const gs  = gsRef.current;
    const W   = areaW();
    const last = gs.blocks[gs.blocks.length - 1]!;
    gs.hasContinued = true;
    gs.phase = 'playing';
    gs.curW  = last.w;
    const center = last.x + last.w / 2;
    if (center <= W / 2) { gs.curX = W - SIDE_PAD - last.w; gs.dir = -1; }
    else                  { gs.curX = SIDE_PAD;               gs.dir =  1; }
    haptic('success');
    setPhase('playing');
    syncMov(gs.curX, gs.curW);
    startLoop();
  }, [startLoop]);

  // ── Watch Ad ──────────────────────────────────────────────────────────────
  const handleWatchAd = useCallback(async () => {
    if (adLoading || starLoading) return;
    setAdLoading(true);
    try {
      await watchRewardedAdWithFallback(adConfig);
      continueGame();
    } catch { /* dismissed */ }
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

  // ── Tap handler — reads gsRef directly, NEVER stale React state ───────────
  const onTap = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const p = gsRef.current.phase;
    if (p === 'idle')    { startGame();  return; }
    if (p === 'playing') { placeBlock(); return; }
  }, [startGame, placeBlock]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => () => {
    clearCd(); cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const adReady = !!(
    (adConfig?.adsgram.enabled  && adConfig.adsgram.blockId)  ||
    (adConfig?.monetag.enabled  && adConfig.monetag.zoneId)   ||
    (adConfig?.onclicka.enabled && adConfig.onclicka.spotId)
  );

  // How many blocks to show (scroll to top of tower)
  const visibleBlocks = placed;
  // Camera: how many px to scroll the tower upward
  const camPx = Math.max(0, placed.length * BLOCK_H - 320);

  return (
    <div
      className="flex flex-col bg-[#07101f]"
      style={{ height: '100dvh', overflow: 'hidden' }}
    >

      {/* ── Header (fixed height so layout never shifts) ── */}
      <div className="shrink-0 h-[72px] flex items-center justify-between px-4">
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
          <p className="text-3xl font-black text-white leading-none tabular-nums mt-0.5 min-h-[36px]">
            {phase === 'idle' ? '' : score}
          </p>
        </div>

        <div className="w-10" />
      </div>

      {/* ── Game area ── */}
      <div
        ref={areaRef}
        className="flex-1 relative overflow-hidden select-none bg-[#060d1a]"
        style={{ touchAction: 'none' }}
        onPointerDown={phase === 'idle' || phase === 'playing' ? onTap : undefined}
      >

        {/* Subtle grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px)',
            backgroundSize:  `100% ${BLOCK_H}px`,
          }}
        />

        {/* Tower (scrolls up as score grows) */}
        <div
          className="absolute left-0 right-0 transition-transform duration-300"
          style={{
            bottom:    0,
            transform: `translateY(${-camPx}px)`,
          }}
        >
          {visibleBlocks.map(b => (
            <Block3D
              key={b.idx}
              x={b.x} w={b.w}
              bottom={b.idx * BLOCK_H}
              color={bColor(b.idx)}
              flash={flashIdx === b.idx}
            />
          ))}
        </div>

        {/* Moving block */}
        {phase === 'playing' && (
          <div
            ref={movRef}
            className="absolute"
            style={{
              bottom:     `calc(${placed.length * BLOCK_H + camPx}px)`,
              height:     BLOCK_H,
              width:      INIT_W,
              left:       SIDE_PAD,
              willChange: 'left, width',
            }}
          >
            <BlockFace color={bColor(placed.length)} glow />
          </div>
        )}

        {/* Idle overlay */}
        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {/* Demo blocks */}
            <div className="relative w-[200px] h-[80px] mb-10">
              <div className="absolute bottom-0 left-0 right-0">
                <BlockFace color={bColor(0)} />
              </div>
              <div className="absolute bottom-[34px] left-4 right-0">
                <BlockFace color={bColor(1)} />
              </div>
            </div>
            <p className="text-3xl font-black text-white tracking-tight">Stack Tower</p>
            <p className="text-sm text-white/40 mt-3 mb-10">Tap anywhere to start</p>
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

              {/* Countdown ring */}
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
                  className="w-full py-4 rounded-2xl text-sm font-black text-black mb-3
                             active:scale-95 transition-all disabled:opacity-50
                             flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#34d399,#10b981)' }}
                >
                  {adLoading
                    ? <><Spinner dark /> Loading ad…</>
                    : <><PlayCircle className="w-4 h-4" /> Watch Ad — Free</>}
                </button>
              )}

              <button
                onClick={handlePayStars}
                disabled={adLoading || starLoading}
                className="w-full py-4 rounded-2xl text-sm font-black mb-3
                           active:scale-95 transition-all disabled:opacity-50
                           flex items-center justify-center gap-2"
                style={{
                  background: 'rgba(251,191,36,0.1)',
                  border:     '1px solid rgba(251,191,36,0.35)',
                  color:      '#fbbf24',
                }}
              >
                {starLoading
                  ? <><Spinner /> Opening…</>
                  : <><Star className="w-4 h-4 fill-current"/> Pay ★10 — Continue</>}
              </button>

              <button
                onClick={() => triggerDead(gsRef.current)}
                disabled={adLoading || starLoading}
                className="w-full py-3 rounded-2xl text-sm font-semibold text-white/35
                           bg-white/5 active:scale-95 transition-all"
              >
                Give up
              </button>
            </div>
          </div>
        )}

        {/* Game Over overlay */}
        {phase === 'dead' && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center
                       bg-black/82 backdrop-blur-[8px]"
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
                  style={{
                    background: 'rgba(52,211,153,0.07)',
                    border:     '1px solid rgba(52,211,153,0.18)',
                  }}
                >
                  <p className="text-[10px] text-white/35 mb-1 uppercase tracking-wider">Reward</p>
                  <p className="text-2xl font-black text-primary">
                    +{reward.toLocaleString()}{' '}
                    <span className="text-sm font-semibold opacity-60">SKP</span>
                  </p>
                </div>
              )}

              <button
                onClick={startGame}
                className="w-full py-4 rounded-2xl text-sm font-black text-black
                           active:scale-95 transition-transform"
                style={{ background: 'linear-gradient(135deg,#34d399,#10b981)' }}
              >
                🔄 Play Again
              </button>
              <button
                onClick={onBack}
                className="w-full mt-3 py-3 rounded-2xl text-sm font-semibold
                           text-white/40 bg-white/5 border border-white/8
                           active:scale-95 transition-transform"
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

// ─── Sub-components ────────────────────────────────────────────────────────────

/** A single static block in the tower. */
function Block3D({
  x, w, bottom, color, flash,
}: {
  x: number; w: number; bottom: number; color: string; flash: boolean;
}) {
  return (
    <div
      className="absolute transition-all duration-150"
      style={{
        left:   x,
        width:  w,
        bottom: bottom,
        height: BLOCK_H,
      }}
    >
      <BlockFace color={color} flash={flash} />
    </div>
  );
}

/** Visual of a block face (top surface + depth edge). */
function BlockFace({
  color, flash = false, glow = false,
}: {
  color: string; flash?: boolean; glow?: boolean;
}) {
  const faceH = BLOCK_H - 6;
  return (
    <div className="absolute inset-0" style={{ borderRadius: 6 }}>
      {/* Main face */}
      <div
        className="absolute left-0 right-0 top-0 transition-all duration-200"
        style={{
          height:       faceH,
          background:   `linear-gradient(160deg, ${lighten(color, 22)} 0%, ${color} 50%, ${darken(color, 15)} 100%)`,
          borderRadius: '6px 6px 0 0',
          boxShadow:    glow
            ? `0 0 18px ${color}88, inset 0 1px 0 rgba(255,255,255,0.35)`
            : `inset 0 1px 0 rgba(255,255,255,0.25)`,
          outline:      flash ? `2px solid #fff` : 'none',
          outlineOffset: '-2px',
        }}
      >
        {/* Specular stripe */}
        <div
          className="absolute top-1.5 mx-2 left-0 right-0"
          style={{ height: 4, background: 'rgba(255,255,255,0.22)', borderRadius: 2 }}
        />
      </div>
      {/* Depth edge */}
      <div
        className="absolute left-0 right-0 bottom-0"
        style={{
          height:       6,
          background:   darken(color, 30),
          borderRadius: '0 0 6px 6px',
        }}
      />
    </div>
  );
}

function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className="w-4 h-4 rounded-full border-2 animate-spin"
      style={{
        borderColor:      dark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)',
        borderTopColor:   dark ? '#000' : '#fff',
      }}
    />
  );
}

// ─── Colour helpers ────────────────────────────────────────────────────────────
function lighten(hex: string, pct: number): string {
  return adjustHex(hex, pct);
}
function darken(hex: string, pct: number): string {
  return adjustHex(hex, -pct);
}
function adjustHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + Math.round(255 * amount / 100)));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + Math.round(255 * amount / 100)));
  const b = Math.min(255, Math.max(0, (n & 0xff) + Math.round(255 * amount / 100)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
