import { useEffect, useRef, useState, useCallback } from 'react';
import { useVault } from '../context/VaultContext';
import { haptic } from '../lib/telegram';
import { ArrowLeft, TrendingUp, Tv, Star, Target, Trophy, Zap } from 'lucide-react';
import { watchRewardedAdWithFallback, isNoFillError } from '../lib/adFallback';
import { getPublicConfig, createStackContinueInvoice, type PublicConfig } from '../lib/gameApi';
import { useToast } from '@/hooks/use-toast';

// ── Constants ────────────────────────────────────────────────────────────────
const CW = 320;
const CH = 520;
const BLOCK_H = 24;
const BASE_X = 28;
const BASE_W = CW - 56;
const BASE_Y = CH - 52;
const INITIAL_SPEED = 2.6;
const PTS_PER_BLOCK = 50;
const PERFECT_BONUS = 150;
const PERFECT_THRESHOLD = 7;
const TARGET_BLOCKS = 15;
const CONTINUE_STARS = 3;

const BLOCK_COLORS = [
  '#6EE7B7', '#34D399', '#10B981',
  '#60A5FA', '#3B82F6', '#818CF8',
  '#F472B6', '#EC4899', '#DB2777',
  '#FBBF24', '#F59E0B', '#FCA5A5',
  '#A78BFA', '#8B5CF6', '#C084FC',
  '#FB923C', '#F97316', '#4ADE80',
];

interface Block { x: number; w: number; y: number; color: string; }
type Phase = 'idle' | 'playing' | 'revive' | 'gameover' | 'cleared';

export const StackTowerGame = ({ onBack }: { onBack: () => void }) => {
  const { setTempMiningPoints, addLifetimePoints } = useVault();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  // ── Game-state refs (no re-render on change) ─────────────────────────────
  const stack = useRef<Block[]>([]);
  const mover = useRef<Block>({ x: BASE_X, w: BASE_W, y: BASE_Y - BLOCK_H, color: BLOCK_COLORS[0]! });
  const dir = useRef(1);
  const speed = useRef(INITIAL_SPEED);
  const totalBlocks = useRef(0);
  const camOffsetY = useRef(0);
  const phaseRef = useRef<Phase>('idle');
  const colorIdx = useRef(0);
  const hasUsedContinue = useRef(false);
  const earnedRef = useRef(0);
  const configRef = useRef<PublicConfig | null>(null);
  const perfectStreak = useRef(0);
  const particles = useRef<{ x: number; y: number; vx: number; vy: number; life: number; color: string }[]>([]);

  // ── React state ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle');
  const [score, setScore] = useState(0);
  const [lastPerfect, setLastPerfect] = useState(false);
  const [streak, setStreak] = useState(0);
  const [reviveLoading, setReviveLoading] = useState<'ad' | 'stars' | null>(null);
  const [totalEarned, setTotalEarned] = useState(0);

  // ── Drawing helpers ──────────────────────────────────────────────────────
  const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    if (w < 2) return;
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const drawBlock = (ctx: CanvasRenderingContext2D, b: Block, offsetY: number, isTop = false) => {
    const sy = b.y + offsetY;
    if (sy > CH + BLOCK_H || sy + BLOCK_H < -10) return;

    if (isTop) {
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 14;
    }

    ctx.fillStyle = b.color;
    rr(ctx, b.x, sy, b.w, BLOCK_H, 7);
    ctx.fill();

    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.24)';
    rr(ctx, b.x + 4, sy + 3, Math.max(b.w - 8, 2), 7, 4);
    ctx.fill();

    // bottom shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    rr(ctx, b.x + 3, sy + BLOCK_H - 5, Math.max(b.w - 6, 2), 4, 3);
    ctx.fill();

    ctx.shadowBlur = 0;
  };

  // ── Main loop ────────────────────────────────────────────────────────────
  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || phaseRef.current !== 'playing') return;
    const ctx = canvas.getContext('2d')!;

    // Sky gradient (shifts as you build higher)
    const progress = Math.min(totalBlocks.current / TARGET_BLOCKS, 1);
    const grad = ctx.createLinearGradient(0, 0, 0, CH);
    if (progress < 0.4) {
      grad.addColorStop(0, '#0c0c1e');
      grad.addColorStop(1, '#0d1a2e');
    } else if (progress < 0.75) {
      grad.addColorStop(0, '#080d1a');
      grad.addColorStop(1, '#0d180d');
    } else {
      grad.addColorStop(0, '#0a0510');
      grad.addColorStop(1, '#130a1a');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, CH);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 1;
    for (let x = 0; x < CW; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke(); }
    for (let y = 0; y < CH; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke(); }

    const off = camOffsetY.current;

    // Ground
    const groundY = BASE_Y + off + BLOCK_H;
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, groundY + 60);
    groundGrad.addColorStop(0, '#1a1a2e');
    groundGrad.addColorStop(1, '#0d0d1a');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY, CW, CH);

    // Draw all stacked blocks
    for (let i = 0; i < stack.current.length; i++) {
      drawBlock(ctx, stack.current[i]!, off, i === stack.current.length - 1);
    }

    // Alignment glow on moving block
    const top = stack.current[stack.current.length - 1]!;
    const m = mover.current;
    m.x += dir.current * speed.current;
    if (m.x + m.w >= CW - 14) { m.x = CW - 14 - m.w; dir.current = -1; }
    if (m.x <= 14) { m.x = 14; dir.current = 1; }

    const leftEdge = Math.max(m.x, top.x);
    const rightEdge = Math.min(m.x + m.w, top.x + top.w);
    const ov = rightEdge - leftEdge;
    const alignRatio = Math.max(0, ov) / top.w;

    if (alignRatio > 0.88) {
      ctx.shadowColor = '#FBBF24';
      ctx.shadowBlur = 22;
    }
    drawBlock(ctx, m, off, true);
    ctx.shadowBlur = 0;

    // Progress bar (right side)
    const barH = CH - 100;
    const barY = 52;
    const barX = CW - 16;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    rr(ctx, barX, barY, 8, barH, 4);
    ctx.fill();

    const fillH = (Math.min(totalBlocks.current, TARGET_BLOCKS) / TARGET_BLOCKS) * barH;
    if (fillH > 0) {
      const barG = ctx.createLinearGradient(0, barY + barH, 0, barY);
      barG.addColorStop(0, '#34D399');
      barG.addColorStop(0.5, '#818CF8');
      barG.addColorStop(1, '#F472B6');
      ctx.fillStyle = barG;
      rr(ctx, barX, barY + barH - fillH, 8, fillH, 4);
      ctx.fill();
    }

    // Target line on bar
    ctx.fillStyle = '#FBBF24';
    ctx.fillRect(barX - 3, barY - 1, 14, 3);

    // ── Score display ────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(totalBlocks.current), CW / 2 - 12, 42);

    ctx.font = '9.5px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillText(`TARGET: ${TARGET_BLOCKS}`, CW / 2 - 12, 56);

    // Speed gauge (top-left)
    const speedRatio = Math.min((speed.current - INITIAL_SPEED) / (9.5 - INITIAL_SPEED), 1);
    const speedColor = speedRatio > 0.7 ? '#F87171' : speedRatio > 0.4 ? '#FBBF24' : '#34D399';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = speedColor;
    ctx.fillText(`⚡ ${Math.round(speedRatio * 100)}%`, 12, 20);

    // Streak indicator
    if (perfectStreak.current >= 2) {
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#FBBF24';
      ctx.fillText(`🔥 ×${perfectStreak.current}`, 12, 34);
    }

    // Particles
    particles.current = particles.current.filter(p => p.life > 0);
    for (const p of particles.current) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= 1;
      ctx.globalAlpha = p.life / 30;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // ── Spawn particles ──────────────────────────────────────────────────────
  const spawnParticles = (x: number, y: number, color: string, count = 8) => {
    for (let i = 0; i < count; i++) {
      particles.current.push({
        x: x + Math.random() * 40 - 20,
        y,
        vx: (Math.random() - 0.5) * 4,
        vy: -(Math.random() * 4 + 1),
        life: 30,
        color,
      });
    }
  };

  // ── Start game ───────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    stack.current = [{ x: BASE_X, w: BASE_W, y: BASE_Y, color: '#1e293b' }];
    colorIdx.current = 0;
    mover.current = { x: -BASE_W, w: BASE_W, y: BASE_Y - BLOCK_H, color: BLOCK_COLORS[0]! };
    dir.current = 1;
    speed.current = INITIAL_SPEED;
    totalBlocks.current = 0;
    camOffsetY.current = 0;
    perfectStreak.current = 0;
    hasUsedContinue.current = false;
    earnedRef.current = 0;
    particles.current = [];
    phaseRef.current = 'playing';
    setPhase('playing');
    setScore(0);
    setStreak(0);
    setTotalEarned(0);
    setLastPerfect(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
    getPublicConfig().then(c => { configRef.current = c; }).catch(() => {});
  }, [loop]);

  // ── Tap ──────────────────────────────────────────────────────────────────
  const handleTap = useCallback(() => {
    if (phaseRef.current !== 'playing') return;

    const top = stack.current[stack.current.length - 1]!;
    const m = mover.current;
    const leftEdge = Math.max(m.x, top.x);
    const rightEdge = Math.min(m.x + m.w, top.x + top.w);
    const overlap = rightEdge - leftEdge;

    if (overlap <= 2) {
      haptic('error');
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      if (!hasUsedContinue.current && totalBlocks.current < TARGET_BLOCKS) {
        phaseRef.current = 'revive';
        setPhase('revive');
      } else {
        phaseRef.current = 'gameover';
        setPhase('gameover');
      }
      return;
    }

    const isPerfect =
      Math.abs(m.x - top.x) <= PERFECT_THRESHOLD &&
      Math.abs(m.x + m.w - (top.x + top.w)) <= PERFECT_THRESHOLD;

    const newX = isPerfect ? top.x : leftEdge;
    const newW = isPerfect ? top.w : overlap;
    const newY = top.y - BLOCK_H;

    colorIdx.current += 1;
    const color = BLOCK_COLORS[colorIdx.current % BLOCK_COLORS.length]!;
    const newBlock: Block = { x: newX, w: newW, y: newY, color };
    stack.current.push(newBlock);
    totalBlocks.current += 1;

    perfectStreak.current = isPerfect ? perfectStreak.current + 1 : 0;

    const earned = isPerfect ? PERFECT_BONUS : PTS_PER_BLOCK;
    earnedRef.current += earned;
    setTempMiningPoints(p => p + earned);
    addLifetimePoints(earned);
    setScore(totalBlocks.current);
    setStreak(perfectStreak.current);
    setLastPerfect(isPerfect);
    haptic(isPerfect ? 'success' : 'light');

    if (isPerfect) {
      const screenY = newY + camOffsetY.current;
      spawnParticles(newX + newW / 2, screenY, '#FBBF24', 12);
    }

    if (totalBlocks.current > 5) camOffsetY.current += BLOCK_H;
    speed.current = Math.min(INITIAL_SPEED + totalBlocks.current * 0.21, 9.5);

    mover.current = {
      x: dir.current > 0 ? -newW : CW + 20,
      w: newW,
      y: newY - BLOCK_H,
      color: BLOCK_COLORS[(colorIdx.current + 1) % BLOCK_COLORS.length]!,
    };

    // Win condition
    if (totalBlocks.current >= TARGET_BLOCKS) {
      haptic('success');
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Stage-clear bonus
      const bonus = TARGET_BLOCKS * PTS_PER_BLOCK;
      earnedRef.current += bonus;
      setTempMiningPoints(p => p + bonus);
      addLifetimePoints(bonus);
      setTotalEarned(earnedRef.current);
      phaseRef.current = 'cleared';
      setPhase('cleared');
    }
  }, [setTempMiningPoints, addLifetimePoints]);

  // ── Revive: watch ad ─────────────────────────────────────────────────────
  const handleReviveAd = useCallback(async () => {
    if (reviveLoading) return;
    setReviveLoading('ad');
    try {
      await watchRewardedAdWithFallback(configRef.current);
      hasUsedContinue.current = true;
      const top = stack.current[stack.current.length - 1]!;
      mover.current = {
        x: -top.w,
        w: top.w,
        y: top.y - BLOCK_H,
        color: BLOCK_COLORS[(colorIdx.current + 1) % BLOCK_COLORS.length]!,
      };
      phaseRef.current = 'playing';
      setPhase('playing');
      setReviveLoading(null);
      rafRef.current = requestAnimationFrame(loop);
      haptic('success');
      toast({ title: '🎬 استمر!', description: `ابني حتى ${TARGET_BLOCKS} مكعباً — أنت تستطيع!` });
    } catch (err) {
      setReviveLoading(null);
      if (isNoFillError(err)) {
        toast({ title: 'لا يوجد إعلان الآن', description: 'جرّب الدفع بالنجوم بدلاً من ذلك', variant: 'destructive' });
      }
      // user dismissed → silent
    }
  }, [reviveLoading, loop, toast]);

  // ── Revive: Stars ────────────────────────────────────────────────────────
  const handleReviveStars = useCallback(async () => {
    if (reviveLoading) return;
    setReviveLoading('stars');
    try {
      const { invoiceUrl } = await createStackContinueInvoice();
      const webApp = (
        window as { Telegram?: { WebApp?: { openInvoice?: (url: string, cb: (s: string) => void) => void } } }
      ).Telegram?.WebApp;
      if (!webApp?.openInvoice) {
        toast({ title: 'النجوم غير متاحة', description: 'افتح التطبيق داخل Telegram لاستخدام النجوم', variant: 'destructive' });
        setReviveLoading(null);
        return;
      }
      webApp.openInvoice(invoiceUrl, (status) => {
        if (status === 'paid') {
          hasUsedContinue.current = true;
          const top = stack.current[stack.current.length - 1]!;
          mover.current = {
            x: -top.w,
            w: top.w,
            y: top.y - BLOCK_H,
            color: BLOCK_COLORS[(colorIdx.current + 1) % BLOCK_COLORS.length]!,
          };
          phaseRef.current = 'playing';
          setPhase('playing');
          rafRef.current = requestAnimationFrame(loop);
          haptic('success');
          toast({ title: '⭐ استمر!', description: 'النجوم استُخدمت — واصل البناء!' });
        }
        setReviveLoading(null);
      });
    } catch {
      setReviveLoading(null);
      toast({ title: 'خطأ في الدفع', description: 'لم يمكن فتح صفحة النجوم', variant: 'destructive' });
    }
  }, [reviveLoading, loop, toast]);

  // ── Give up ──────────────────────────────────────────────────────────────
  const handleGiveUp = useCallback(() => {
    phaseRef.current = 'gameover';
    setPhase('gameover');
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const displayEarned = earnedRef.current;

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button
          onClick={onBack}
          className="p-2.5 rounded-full bg-white/5 border border-white/5 active:scale-90 transition-transform"
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <h2 className="text-xl font-bold text-white">Stack Tower</h2>
        {phase === 'playing' && (
          <div className="ml-auto flex items-center gap-1.5 bg-amber-400/10 border border-amber-400/20 rounded-full px-3 py-1">
            <Target className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-amber-300">
              {score} / {TARGET_BLOCKS}
            </span>
          </div>
        )}
      </div>

      {/* Canvas + overlays */}
      <div className="mx-4 relative rounded-[22px] overflow-hidden border border-white/10 shadow-[0_0_40px_rgba(52,211,153,0.06)]">
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          onClick={handleTap}
          onTouchStart={(e) => { e.preventDefault(); handleTap(); }}
          className="w-full block"
          style={{ touchAction: 'none' }}
        />

        {/* Perfect label */}
        {phase === 'playing' && lastPerfect && (
          <div className="absolute top-16 left-0 right-0 flex justify-center pointer-events-none">
            <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-400/20 border border-amber-400/30 animate-bounce">
              <span className="text-amber-300 font-black text-sm">
                {streak >= 3 ? `🔥 ×${streak} PERFECT!` : '✨ PERFECT!'}
              </span>
            </div>
          </div>
        )}

        {/* ── IDLE overlay ── */}
        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm">
            <div className="text-6xl mb-4 animate-bounce">🏗️</div>
            <h3 className="text-2xl font-black text-white mb-1 tracking-tight">Stack Tower</h3>
            <p className="text-sm text-white/55 text-center px-10 mb-1 leading-relaxed">
              اضغط لإسقاط كل مكعب على القمة
            </p>
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-300 font-bold text-sm">
                اصل إلى {TARGET_BLOCKS} مكعباً لتربح النقاط!
              </span>
            </div>
            <div className="flex gap-3 mb-6 mt-2">
              <div className="text-center bg-white/5 rounded-xl px-3 py-2 border border-white/8">
                <p className="text-primary font-black text-base">+{PTS_PER_BLOCK}</p>
                <p className="text-white/40 text-[9px]">لكل مكعب</p>
              </div>
              <div className="text-center bg-amber-400/8 rounded-xl px-3 py-2 border border-amber-400/15">
                <p className="text-amber-300 font-black text-base">+{PERFECT_BONUS}</p>
                <p className="text-white/40 text-[9px]">توافق مثالي</p>
              </div>
              <div className="text-center bg-purple-400/8 rounded-xl px-3 py-2 border border-purple-400/15">
                <p className="text-purple-300 font-black text-base">+{TARGET_BLOCKS * PTS_PER_BLOCK}</p>
                <p className="text-white/40 text-[9px]">مكافأة إتمام</p>
              </div>
            </div>
            <button
              onClick={startGame}
              className="bg-primary text-black font-black px-12 py-4 rounded-2xl shadow-[0_0_30px_rgba(52,211,153,0.5)] active:scale-95 transition-transform text-base"
            >
              ابدأ اللعبة
            </button>
          </div>
        )}

        {/* ── REVIVE overlay ── */}
        {phase === 'revive' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md px-5">
            <div className="text-5xl mb-3">💥</div>
            <h3 className="text-2xl font-black text-white mb-1">سقط البرج!</h3>
            <p className="text-white/55 text-sm mb-1">
              وصلت إلى <span className="text-white font-bold">{score}</span> / {TARGET_BLOCKS} مكعباً
            </p>

            {/* Progress bar */}
            <div className="w-full mb-5 mt-1">
              <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(score / TARGET_BLOCKS) * 100}%`,
                    background: 'linear-gradient(90deg, #34D399, #818CF8, #F472B6)',
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] mt-1 text-white/30">
                <span>0</span>
                <span className="text-amber-400 font-bold">🎯 {TARGET_BLOCKS}</span>
              </div>
            </div>

            <p className="text-sm font-bold text-white mb-3">هل تريد الاستمرار؟</p>

            {/* Watch Ad */}
            <button
              onClick={() => void handleReviveAd()}
              disabled={!!reviveLoading}
              className="w-full flex items-center justify-center gap-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/25 text-primary py-3.5 rounded-2xl font-bold mb-2.5 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {reviveLoading === 'ad' ? (
                <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
              ) : (
                <Tv className="w-4 h-4" />
              )}
              <span>{reviveLoading === 'ad' ? 'جارٍ التحميل…' : '🎬 شاهد إعلاناً — مجاناً'}</span>
            </button>

            {/* Pay Stars */}
            <button
              onClick={() => void handleReviveStars()}
              disabled={!!reviveLoading}
              className="w-full flex items-center justify-center gap-2.5 bg-amber-400/10 hover:bg-amber-400/18 border border-amber-400/25 text-amber-300 py-3.5 rounded-2xl font-bold mb-3 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {reviveLoading === 'stars' ? (
                <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
              ) : (
                <Star className="w-4 h-4" />
              )}
              <span>{reviveLoading === 'stars' ? 'جارٍ الفتح…' : `⭐ ادفع ${CONTINUE_STARS} نجوم للاستمرار`}</span>
            </button>

            {/* Give up */}
            <button
              onClick={handleGiveUp}
              disabled={!!reviveLoading}
              className="text-white/30 text-xs py-1 active:text-white/60 transition-colors disabled:opacity-40"
            >
              استسلم وخذ ما كسبته
            </button>
          </div>
        )}

        {/* ── GAME OVER overlay ── */}
        {phase === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/88 backdrop-blur-sm">
            <div className="text-5xl mb-3">🏚️</div>
            <h3 className="text-2xl font-black text-white mb-1">انتهت اللعبة</h3>
            <p className="text-white/55 text-sm mb-3">
              مكعبات مكدسة: <span className="text-white font-bold">{score}</span> / {TARGET_BLOCKS}
            </p>

            {displayEarned > 0 && (
              <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-2xl px-5 py-3 mb-5 w-full mx-4">
                <TrendingUp className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-bold text-primary">+{displayEarned.toLocaleString()} نقطة مكتسبة!</span>
              </div>
            )}

            <button
              onClick={startGame}
              className="bg-primary text-black font-black px-10 py-3.5 rounded-2xl active:scale-95 transition-transform shadow-[0_0_20px_rgba(52,211,153,0.3)]"
            >
              العب مرة أخرى
            </button>
          </div>
        )}

        {/* ── CLEARED overlay ── */}
        {phase === 'cleared' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/88 backdrop-blur-sm">
            <div className="text-6xl mb-3 animate-bounce">🏆</div>
            <h3 className="text-2xl font-black text-white mb-1 tracking-tight">المرحلة مكتملة!</h3>
            <p className="text-white/60 text-sm mb-2">
              بنيت <span className="text-primary font-black">{score}</span> مكعباً
              {score > TARGET_BLOCKS && ` — تجاوزت الهدف!`}
            </p>

            <div className="w-full px-4 mb-4 space-y-2">
              <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <span className="text-xs text-white/60">نقاط الجلسة</span>
                </div>
                <span className="text-sm font-black text-primary">+{(score * PTS_PER_BLOCK).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-white/60">مكافأة الإتمام</span>
                </div>
                <span className="text-sm font-black text-amber-300">+{(TARGET_BLOCKS * PTS_PER_BLOCK).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
                <span className="text-xs text-white/50">المجموع</span>
                <span className="text-base font-black text-white">+{totalEarned.toLocaleString()} نقطة</span>
              </div>
            </div>

            <button
              onClick={startGame}
              className="bg-primary text-black font-black px-12 py-4 rounded-2xl active:scale-95 transition-transform shadow-[0_0_30px_rgba(52,211,153,0.4)] text-base"
            >
              🔄 العب مرة أخرى
            </button>
          </div>
        )}
      </div>

      {/* Tips */}
      {phase === 'idle' && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-white/3 border border-white/6">
          <p className="text-center text-[11px] text-white/35">
            💡 التوافق المثالي = مكعب بنفس العرض + مكافأة ×3
          </p>
        </div>
      )}
    </div>
  );
};
