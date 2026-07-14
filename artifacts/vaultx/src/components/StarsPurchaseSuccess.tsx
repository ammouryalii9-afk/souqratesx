import { useEffect, useRef } from 'react';
import { haptic } from '../lib/telegram';
import type { StarProduct } from '../lib/gameApi';

const EFFECT_MESSAGES: Record<string, string> = {
  premium_days:         'Premium status activated! 👑',
  turbo_boost:          'Turbo boost is now active! 🔥',
  energy_refill:        'Energy fully restored! ⚡',
  permanent_multiplier: 'Mining power permanently increased! ✨',
  badge:                'New badge unlocked & equipped! 🏅',
  skin:                 'New skin unlocked & applied! 🎨',
  points:               'Points added to your balance! 💎',
  mining_level_up:      'Mining level upgraded! 🚀',
  squad_gold:           'Squad Gold status activated! 🏆',
  competition_entry:    'Competition entry confirmed! 🎯',
};

const COLORS = [
  '#FFD700','#f59e0b','#34d399','#38bdf8','#a78bfa',
  '#f472b6','#fb923c','#fff','#fbbf24','#6ee7b7',
];

interface Particle {
  x: number; y: number; vx: number; vy: number;
  color: string; size: number; opacity: number;
  rotation: number; rotationSpeed: number; char: string;
}

function useConfetti(active: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const particles = useRef<Particle[]>([]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const chars = ['⭐', '✦', '★', '•', '◆', '▲'];
    particles.current = Array.from({ length: 70 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 120,
      y: canvas.height * 0.38,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 12 - 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      size: Math.random() * 14 + 8,
      opacity: 1,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
      char: chars[Math.floor(Math.random() * chars.length)]!,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles.current) {
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.35; p.vx *= 0.99;
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.012;
        if (p.opacity <= 0) continue;
        alive = true;
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.font = `${p.size}px serif`;
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillText(p.char, -p.size / 2, p.size / 2);
        ctx.restore();
      }
      if (alive) rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  return canvasRef;
}

interface Props {
  product: StarProduct;
  onClose: () => void;
}

const META: Record<string, { color: string; glow: string; emoji: string }> = {
  premium_days:         { color: '#f59e0b', glow: 'rgba(245,158,11,0.5)',  emoji: '👑' },
  turbo_boost:          { color: '#f97316', glow: 'rgba(249,115,22,0.5)',  emoji: '🔥' },
  energy_refill:        { color: '#38bdf8', glow: 'rgba(56,189,248,0.5)',  emoji: '⚡' },
  permanent_multiplier: { color: '#a78bfa', glow: 'rgba(167,139,250,0.5)', emoji: '✨' },
  badge:                { color: '#2dd4bf', glow: 'rgba(45,212,191,0.5)',  emoji: '🏅' },
  skin:                 { color: '#f472b6', glow: 'rgba(244,114,182,0.5)', emoji: '🎨' },
  points:               { color: '#34d399', glow: 'rgba(52,211,153,0.5)',  emoji: '💎' },
  mining_level_up:      { color: '#818cf8', glow: 'rgba(129,140,248,0.5)', emoji: '🚀' },
  squad_gold:           { color: '#fbbf24', glow: 'rgba(251,191,36,0.5)',  emoji: '🏆' },
  competition_entry:    { color: '#fb7185', glow: 'rgba(251,113,133,0.5)', emoji: '🎯' },
};
const getMeta = (t: string) => META[t] ?? { color: '#34d399', glow: 'rgba(52,211,153,0.5)', emoji: '💎' };

export function StarsPurchaseSuccess({ product, onClose }: Props) {
  const canvasRef = useConfetti(true);
  const m = getMeta(product.effectType);
  const msg = EFFECT_MESSAGES[product.effectType] ?? 'Purchase applied successfully! 🎉';

  useEffect(() => {
    haptic('heavy');
    const t = setTimeout(() => haptic('medium'), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5" style={{ background: 'rgba(0,0,0,0.92)' }}>
      {/* Confetti canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }} />

      {/* Card */}
      <div
        className="relative w-full max-w-xs rounded-3xl overflow-hidden flex flex-col items-center text-center animate-in zoom-in-95 duration-300"
        style={{
          background: 'linear-gradient(180deg, hsl(224,71%,8%) 0%, hsl(224,71%,4%) 100%)',
          border: `1.5px solid ${m.color}44`,
          boxShadow: `0 0 60px ${m.glow}, 0 0 0 1px rgba(255,255,255,0.04) inset`,
          zIndex: 2,
        }}
      >
        {/* Top strip */}
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, transparent, ${m.color}, transparent)` }} />

        <div className="px-6 pt-7 pb-6 flex flex-col items-center gap-4">
          {/* Animated icon */}
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center animate-in zoom-in-50 duration-500"
            style={{
              background: `radial-gradient(circle at 35% 35%, ${m.color}cc 0%, ${m.color}33 60%, transparent 100%)`,
              border: `2px solid ${m.color}66`,
              boxShadow: `0 0 40px ${m.glow}, inset 0 1px 1px rgba(255,255,255,0.2)`,
            }}
          >
            {product.imageUrl
              ? <img src={product.imageUrl} alt={product.title} className="w-14 h-14 rounded-2xl object-cover" />
              : <span className="text-5xl leading-none">{m.emoji}</span>
            }
          </div>

          {/* Success badge */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399' }}>
            ✓ Purchase Successful
          </div>

          {/* Title */}
          <div>
            <h2 className="text-xl font-black text-white leading-tight">{product.title}</h2>
            <p className="text-sm mt-1 font-semibold" style={{ color: m.color }}>{msg}</p>
          </div>

          {/* Benefits */}
          {product.benefitsBullets && (
            <div className="w-full px-4 py-3 rounded-2xl text-left" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: m.color }}>What was applied</p>
              <ul className="flex flex-col gap-1.5">
                {product.benefitsBullets.split('\n').filter(Boolean).map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-white/80">
                    <span style={{ color: m.color }} className="shrink-0 mt-px">✦</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Stars paid */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: `${m.color}12`, border: `1px solid ${m.color}25` }}>
            <span className="text-lg">⭐</span>
            <span className="text-base font-black text-white tabular-nums">{product.priceStars.toLocaleString()}</span>
            <span className="text-xs text-white/50">Stars spent</span>
          </div>

          {/* CTA */}
          <button
            onClick={() => { haptic('light'); onClose(); }}
            className="w-full h-12 rounded-2xl font-black text-sm transition-all active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${m.color} 0%, ${m.color}bb 100%)`,
              color: '#000',
              boxShadow: `0 4px 20px ${m.glow}`,
            }}
          >
            Play Now 🚀
          </button>
        </div>
      </div>
    </div>
  );
}
