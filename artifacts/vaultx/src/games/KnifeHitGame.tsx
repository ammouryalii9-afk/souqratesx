import { useEffect, useRef, useState, useCallback } from 'react';
import { useVault } from '../context/VaultContext';
import { haptic } from '../lib/telegram';
import { ArrowLeft, TrendingUp } from 'lucide-react';

const CW = 320;
const CH = 460;
const LOG_CX = CW / 2;
const LOG_CY = CH / 2 - 30;
const LOG_R = 68;
const KNIFE_LEN = 58;
const MIN_GAP = 0.20;
const PTS_PER_KNIFE = 60;
const KNIFE_SPEED = 11;
const KNIFE_START_Y = CH - 50;

interface StuckKnife { relAngle: number; }

type Phase = 'idle' | 'playing' | 'gameover';

export const KnifeHitGame = ({ onBack }: { onBack: () => void }) => {
  const { setTempMiningPoints, addLifetimePoints } = useVault();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  const rot = useRef(0);
  const rotSpeed = useRef(0.020);
  const knives = useRef<StuckKnife[]>([]);
  const flyY = useRef(KNIFE_START_Y);
  const flying = useRef(false);
  const landed = useRef(0);
  const phaseRef = useRef<Phase>('idle');

  const [phase, setPhase] = useState<Phase>('idle');
  const [score, setScore] = useState(0);

  const drawKnife = (ctx: CanvasRenderingContext2D, bx: number, by: number, angle: number) => {
    const tx = bx + Math.cos(angle) * KNIFE_LEN;
    const ty = by + Math.sin(angle) * KNIFE_LEN;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = '#7B3F00';
    ctx.lineWidth = 6;
    const hx = bx + Math.cos(angle) * 18;
    const hy = by + Math.sin(angle) * 18;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.restore();
  };

  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || phaseRef.current !== 'playing') return;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#111118';
    ctx.fillRect(0, 0, CW, CH);

    rot.current += rotSpeed.current;

    ctx.save();
    ctx.translate(LOG_CX, LOG_CY);
    const gradient = ctx.createRadialGradient(0, 0, 10, 0, 0, LOG_R);
    gradient.addColorStop(0, '#5c3a1e');
    gradient.addColorStop(1, '#3a2210');
    ctx.beginPath(); ctx.arc(0, 0, LOG_R, 0, Math.PI * 2);
    ctx.fillStyle = gradient; ctx.fill();
    ctx.strokeStyle = '#7a5030'; ctx.lineWidth = 3; ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.strokeStyle = 'rgba(100,60,20,0.4)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 15, Math.sin(a) * 15);
      ctx.lineTo(Math.cos(a) * (LOG_R - 8), Math.sin(a) * (LOG_R - 8));
      ctx.stroke();
    }
    ctx.restore();

    for (const k of knives.current) {
      const absA = k.relAngle + rot.current;
      const bx = LOG_CX + Math.cos(absA) * LOG_R;
      const by = LOG_CY + Math.sin(absA) * LOG_R;
      drawKnife(ctx, bx, by, absA);
    }

    if (flying.current) {
      flyY.current -= KNIFE_SPEED;
      drawKnife(ctx, LOG_CX, flyY.current, -Math.PI / 2);

      const dist = Math.abs(LOG_CY - flyY.current);
      if (dist <= LOG_R + 2) {
        const landAbsAngle = -Math.PI / 2;
        const landRelAngle = landAbsAngle - rot.current;
        const norm = (a: number) => { let r = a % (Math.PI * 2); if (r > Math.PI) r -= Math.PI * 2; if (r < -Math.PI) r += Math.PI * 2; return r; };
        const normLand = norm(landRelAngle);

        let hit = false;
        for (const k of knives.current) {
          let diff = Math.abs(norm(k.relAngle) - normLand);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (diff < MIN_GAP) { hit = true; break; }
        }

        flying.current = false;
        if (hit) {
          phaseRef.current = 'gameover';
          setPhase('gameover');
          haptic('error');
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        knives.current.push({ relAngle: normLand });
        landed.current += 1;
        setScore(landed.current);
        setTempMiningPoints(p => p + PTS_PER_KNIFE);
        addLifetimePoints(PTS_PER_KNIFE);
        haptic('light');
        if (landed.current % 6 === 0) rotSpeed.current = Math.min(rotSpeed.current * 1.25, 0.09);
      }
    } else {
      drawKnife(ctx, LOG_CX, KNIFE_START_Y, -Math.PI / 2);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(landed.current), CW / 2, 44);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('knives', CW / 2, 60);

    rafRef.current = requestAnimationFrame(loop);
  }, [setTempMiningPoints, addLifetimePoints]);

  const startGame = useCallback(() => {
    rot.current = 0;
    rotSpeed.current = 0.020;
    knives.current = [];
    flyY.current = KNIFE_START_Y;
    flying.current = false;
    landed.current = 0;
    phaseRef.current = 'playing';
    setPhase('playing');
    setScore(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const handleTap = useCallback(() => {
    if (phaseRef.current !== 'playing' || flying.current) return;
    flying.current = true;
    flyY.current = KNIFE_START_Y;
    haptic('medium');
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const earned = score * PTS_PER_KNIFE;

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-300">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button onClick={onBack} className="p-2.5 rounded-full bg-white/5 border border-white/5 active:scale-90 transition-transform">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <h2 className="text-xl font-bold text-white">Knife Hit</h2>
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

        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <div className="text-5xl mb-3">🔪</div>
            <h3 className="text-2xl font-black text-white mb-1">Knife Hit</h3>
            <p className="text-sm text-white/60 text-center px-10 mb-2 leading-relaxed">
              Tap to throw knives at the spinning log.<br />Don't hit other knives!
            </p>
            <p className="text-primary font-bold text-sm mb-5">+{PTS_PER_KNIFE} pts per knife</p>
            <button onClick={startGame} className="bg-primary text-black font-bold px-10 py-3.5 rounded-xl shadow-[0_0_20px_rgba(52,211,153,0.4)] active:scale-95 transition-transform">
              Start
            </button>
          </div>
        )}

        {phase === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85">
            <div className="text-5xl mb-3">💥</div>
            <h3 className="text-2xl font-black text-white mb-1">Game Over!</h3>
            <p className="text-white/60 text-sm mb-4">Knives landed: <span className="text-white font-bold">{score}</span></p>
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-5 py-3 mb-5">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-primary">+{earned.toLocaleString()} pts earned!</span>
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
