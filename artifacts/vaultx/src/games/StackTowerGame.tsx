import { useEffect, useRef, useState, useCallback } from 'react';
import { useVault } from '../context/VaultContext';
import { haptic } from '../lib/telegram';
import { ArrowLeft, TrendingUp } from 'lucide-react';

const CW = 320;
const CH = 460;
const BLOCK_H = 22;
const BASE_X = 40;
const BASE_W = CW - 80;
const BASE_Y = CH - 40;
const INITIAL_SPEED = 2.8;
const PTS_PER_BLOCK = 40;
const PERFECT_BONUS = 60;
const PERFECT_THRESHOLD = 6;

const COLORS = ['#34D399','#60A5FA','#F472B6','#FBBF24','#A78BFA','#FB923C','#4ADE80','#38BDF8'];

interface Block { x: number; w: number; y: number; color: string; }

type Phase = 'idle' | 'playing' | 'gameover';

export const StackTowerGame = ({ onBack }: { onBack: () => void }) => {
  const { setTempMiningPoints, addLifetimePoints } = useVault();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  const stack = useRef<Block[]>([]);
  const mover = useRef<Block>({ x: BASE_X, w: BASE_W, y: BASE_Y - BLOCK_H, color: COLORS[0]! });
  const dir = useRef(1);
  const speed = useRef(INITIAL_SPEED);
  const totalBlocks = useRef(0);
  const camOffsetY = useRef(0);
  const phaseRef = useRef<Phase>('idle');
  const colorIdx = useRef(1);

  const [phase, setPhase] = useState<Phase>('idle');
  const [score, setScore] = useState(0);
  const [lastPerfect, setLastPerfect] = useState(false);

  const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
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

  const drawBlock = (ctx: CanvasRenderingContext2D, b: Block, offsetY: number) => {
    const screenY = b.y + offsetY;
    if (screenY > CH + BLOCK_H || screenY + BLOCK_H < 0) return;
    ctx.fillStyle = b.color;
    roundRect(ctx, b.x, screenY, b.w, BLOCK_H, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, b.x + 4, screenY + 3, Math.max(b.w - 8, 1), 5, 3);
    ctx.fill();
  };

  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || phaseRef.current !== 'playing') return;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, CW, CH);

    const off = camOffsetY.current;

    ctx.fillStyle = '#1a2a1a';
    const groundY = BASE_Y + off;
    ctx.fillRect(BASE_X - 10, groundY, BASE_W + 20, CH);

    for (const b of stack.current) drawBlock(ctx, b, off);

    const m = mover.current;
    m.x += dir.current * speed.current;
    if (m.x + m.w >= CW - 20) { m.x = CW - 20 - m.w; dir.current = -1; }
    if (m.x <= 20) { m.x = 20; dir.current = 1; }
    drawBlock(ctx, m, off);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(totalBlocks.current), CW / 2, 44);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('blocks', CW / 2, 60);

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const startGame = useCallback(() => {
    stack.current = [{ x: BASE_X, w: BASE_W, y: BASE_Y, color: '#2d2d3a' }];
    colorIdx.current = 0;
    mover.current = {
      x: -BASE_W,
      w: BASE_W,
      y: BASE_Y - BLOCK_H,
      color: COLORS[colorIdx.current % COLORS.length]!,
    };
    dir.current = 1;
    speed.current = INITIAL_SPEED;
    totalBlocks.current = 0;
    camOffsetY.current = 0;
    phaseRef.current = 'playing';
    setPhase('playing');
    setScore(0);
    setLastPerfect(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const handleTap = useCallback(() => {
    if (phaseRef.current !== 'playing') return;

    const top = stack.current[stack.current.length - 1]!;
    const m = mover.current;

    const leftEdge = Math.max(m.x, top.x);
    const rightEdge = Math.min(m.x + m.w, top.x + top.w);
    const overlap = rightEdge - leftEdge;

    if (overlap <= 2) {
      phaseRef.current = 'gameover';
      setPhase('gameover');
      haptic('error');
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const isPerfect = Math.abs(m.x - top.x) <= PERFECT_THRESHOLD && Math.abs((m.x + m.w) - (top.x + top.w)) <= PERFECT_THRESHOLD;
    const newX = isPerfect ? top.x : leftEdge;
    const newW = isPerfect ? top.w : overlap;
    const newY = top.y - BLOCK_H;

    colorIdx.current += 1;
    const newBlock: Block = {
      x: newX,
      w: newW,
      y: newY,
      color: COLORS[colorIdx.current % COLORS.length]!,
    };
    stack.current.push(newBlock);
    totalBlocks.current += 1;

    const earned = isPerfect ? PERFECT_BONUS : PTS_PER_BLOCK;
    setTempMiningPoints(p => p + earned);
    addLifetimePoints(earned);
    setScore(totalBlocks.current);
    setLastPerfect(isPerfect);
    haptic(isPerfect ? 'success' : 'light');

    if (totalBlocks.current > 5) {
      camOffsetY.current += BLOCK_H;
    }
    speed.current = Math.min(INITIAL_SPEED + totalBlocks.current * 0.22, 9);

    mover.current = {
      x: dir.current > 0 ? -newW : CW + 20,
      w: newW,
      y: newY - BLOCK_H,
      color: COLORS[(colorIdx.current + 1) % COLORS.length]!,
    };
  }, [setTempMiningPoints, addLifetimePoints]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-300">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button onClick={onBack} className="p-2.5 rounded-full bg-white/5 border border-white/5 active:scale-90 transition-transform">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <h2 className="text-xl font-bold text-white">Stack Tower</h2>
      </div>

      <div className="mx-4 relative rounded-[20px] overflow-hidden border border-white/10">
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          onClick={handleTap}
          onTouchStart={(e) => { e.preventDefault(); handleTap(); }}
          className="w-full block"
          style={{ touchAction: 'none' }}
        />

        {phase === 'playing' && lastPerfect && (
          <div className="absolute top-16 left-0 right-0 flex justify-center pointer-events-none">
            <span className="text-yellow-300 font-black text-lg px-4 py-1 rounded-full bg-yellow-400/20 border border-yellow-400/30 animate-bounce">
              ✨ PERFECT!
            </span>
          </div>
        )}

        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <div className="text-5xl mb-3">🏗️</div>
            <h3 className="text-2xl font-black text-white mb-1">Stack Tower</h3>
            <p className="text-sm text-white/60 text-center px-10 mb-2 leading-relaxed">
              Tap to drop each block on top.<br />Stack as high as you can!
            </p>
            <p className="text-primary font-bold text-sm mb-1">+{PTS_PER_BLOCK} pts per block</p>
            <p className="text-yellow-300 text-xs mb-5">+{PERFECT_BONUS} pts for perfect alignment!</p>
            <button onClick={startGame} className="bg-primary text-black font-bold px-10 py-3.5 rounded-xl shadow-[0_0_20px_rgba(52,211,153,0.4)] active:scale-95 transition-transform">
              Start
            </button>
          </div>
        )}

        {phase === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85">
            <div className="text-5xl mb-3">🏚️</div>
            <h3 className="text-2xl font-black text-white mb-1">Tower Fell!</h3>
            <p className="text-white/60 text-sm mb-4">Blocks stacked: <span className="text-white font-bold">{score}</span></p>
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-5 py-3 mb-5">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-primary">+{(score * PTS_PER_BLOCK).toLocaleString()} pts earned!</span>
            </div>
            <button onClick={startGame} className="bg-primary text-black font-bold px-10 py-3.5 rounded-xl active:scale-95 transition-transform">
              Play Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
