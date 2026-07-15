import { useEffect, useRef } from 'react';
import { Crown, Flame, Zap, Sparkles, Award, Palette, Gem, Rocket, Trophy, Target, CheckCircle2, Star } from 'lucide-react';
import { haptic } from '../lib/telegram';
import { useLanguage } from '../lib/i18n';
import type { StarProduct } from '../lib/gameApi';

const CONFETTI_COLORS = [
  '#f59e0b','#34d399','#38bdf8','#a78bfa','#f472b6','#fb923c','#fff','#fbbf24','#6ee7b7',
];
const CONFETTI_CHARS = ['◆', '▲', '■', '●', '▸', '◀', '★'];

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

    particles.current = Array.from({ length: 80 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 140,
      y: canvas.height * 0.4,
      vx: (Math.random() - 0.5) * 10,
      vy: -Math.random() * 13 - 3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!,
      size: Math.random() * 12 + 6,
      opacity: 1,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.18,
      char: CONFETTI_CHARS[Math.floor(Math.random() * CONFETTI_CHARS.length)]!,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles.current) {
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.32; p.vx *= 0.991;
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.011;
        if (p.opacity <= 0) continue;
        alive = true;
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.font = `bold ${p.size}px sans-serif`;
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

type SuccessMeta = { Icon: React.ElementType; color: string; glow: string };

const META: Record<string, SuccessMeta> = {
  premium_days:         { Icon: Crown,    color: '#f59e0b', glow: 'rgba(245,158,11,0.55)'  },
  turbo_boost:          { Icon: Flame,    color: '#f97316', glow: 'rgba(249,115,22,0.55)'  },
  energy_refill:        { Icon: Zap,      color: '#38bdf8', glow: 'rgba(56,189,248,0.55)'  },
  permanent_multiplier: { Icon: Sparkles, color: '#a78bfa', glow: 'rgba(167,139,250,0.55)' },
  badge:                { Icon: Award,    color: '#2dd4bf', glow: 'rgba(45,212,191,0.55)'  },
  skin:                 { Icon: Palette,  color: '#f472b6', glow: 'rgba(244,114,182,0.55)' },
  points:               { Icon: Gem,      color: '#34d399', glow: 'rgba(52,211,153,0.55)'  },
  mining_level_up:      { Icon: Rocket,   color: '#818cf8', glow: 'rgba(129,140,248,0.55)' },
  squad_gold:           { Icon: Trophy,   color: '#fbbf24', glow: 'rgba(251,191,36,0.55)'  },
  competition_entry:    { Icon: Target,   color: '#fb7185', glow: 'rgba(251,113,133,0.55)' },
};
const getMeta = (t: string): SuccessMeta => META[t] ?? { Icon: Gem, color: '#34d399', glow: 'rgba(52,211,153,0.55)' };

export function StarsPurchaseSuccess({ product, onClose }: Props) {
  const canvasRef = useConfetti(true);
  const { tr } = useLanguage();
  const m = getMeta(product.effectType);
  const ProductIcon = m.Icon;

  const EFFECT_MSG: Record<string, string> = {
    premium_days:         tr.tasks.effectPremium,
    turbo_boost:          tr.tasks.effectTurbo,
    energy_refill:        tr.tasks.effectEnergy,
    permanent_multiplier: tr.tasks.effectMultiplier,
    badge:                tr.tasks.effectBadge,
    skin:                 tr.tasks.effectSkin,
    points:               tr.tasks.effectPoints,
    mining_level_up:      tr.tasks.effectMiningLevel,
    squad_gold:           tr.tasks.effectSquadGold,
    competition_entry:    tr.tasks.effectCompetition,
  };
  const msg = EFFECT_MSG[product.effectType] ?? tr.tasks.effectDefault;

  useEffect(() => {
    haptic('heavy');
    const t = setTimeout(() => haptic('medium'), 280);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }} />

      <div
        className="relative w-full max-w-xs rounded-3xl overflow-hidden flex flex-col items-center text-center animate-in zoom-in-90 duration-300"
        style={{
          background: 'linear-gradient(180deg, hsl(224,71%,8%) 0%, hsl(224,71%,3%) 100%)',
          border: `1px solid ${m.color}38`,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 60px ${m.glow}50, 0 0 120px ${m.glow}18`,
          zIndex: 2,
        }}
      >
        {/* Top accent */}
        <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent 5%, ${m.color}cc 50%, transparent 95%)` }} />

        <div className="px-6 pt-7 pb-6 flex flex-col items-center gap-4">

          {/* Icon orb */}
          <div className="relative">
            {/* Outer glow */}
            <div className="absolute inset-0 rounded-3xl scale-[1.4] opacity-20 animate-pulse"
              style={{ background: `radial-gradient(circle, ${m.color} 0%, transparent 70%)` }} />
            {/* Orb */}
            <div
              className="relative w-24 h-24 rounded-3xl flex items-center justify-center animate-in zoom-in-50 duration-500"
              style={{
                background: `linear-gradient(145deg, ${m.color}28 0%, ${m.color}0a 100%)`,
                border: `1.5px solid ${m.color}50`,
                boxShadow: `0 0 40px ${m.glow}80, 0 0 80px ${m.glow}28, inset 0 1px 0 rgba(255,255,255,0.12)`,
              }}
            >
              {product.imageUrl
                ? <img src={product.imageUrl} alt={product.title} className="w-14 h-14 rounded-2xl object-cover" />
                : <ProductIcon className="w-11 h-11" style={{ color: m.color }} strokeWidth={1.25} />
              }
            </div>
          </div>

          {/* Success badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl"
            style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' }}>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />
            <span className="text-xs font-black text-emerald-400 tracking-wide">{tr.tasks.successTitle}</span>
          </div>

          {/* Product info */}
          <div>
            <h2 className="text-xl font-black text-white leading-tight tracking-tight">{product.title}</h2>
            <p className="text-sm mt-1.5 font-semibold" style={{ color: m.color }}>{msg}</p>
          </div>

          {/* Benefits */}
          {product.benefitsBullets && (
            <div className="w-full px-4 py-3 rounded-2xl text-left" style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${m.color}18` }}>
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-1 h-3 rounded-full" style={{ background: m.color }} />
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/50">{tr.tasks.successWhatApplied}</p>
              </div>
              <ul className="flex flex-col gap-2">
                {product.benefitsBullets.split('\n').filter(Boolean).map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-white/75">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: m.color }} strokeWidth={2} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Stars spent */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl" style={{ background: `${m.color}0e`, border: `1px solid ${m.color}22` }}>
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" strokeWidth={0} />
            <span className="text-base font-black text-white tabular-nums">{product.priceStars.toLocaleString()}</span>
            <span className="text-xs text-white/40 font-medium">{tr.tasks.successStarsSpent}</span>
          </div>

          {/* CTA */}
          <button
            onClick={() => { haptic('light'); onClose(); }}
            className="w-full h-12 rounded-2xl font-black text-sm transition-all active:scale-[0.97] relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${m.color} 0%, ${m.color}cc 100%)`,
              color: '#000',
              boxShadow: `0 4px 24px ${m.glow}80`,
            }}
          >
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_ease-in-out_infinite] pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)' }} />
            <span className="relative z-10">{tr.tasks.successPlayNow}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
