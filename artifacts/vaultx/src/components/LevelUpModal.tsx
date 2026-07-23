import { useEffect, useRef, useState } from 'react';
import { useLevel } from '../context/LevelContext';
import { getLevelDef } from '../lib/levels';
import { haptic } from '../lib/telegram';
import { useLanguage } from '../lib/i18n';

// ── Floating particles ───────────────────────────────────────────────────────

const PARTICLE_SEED = [
  { x: 12, delay: 0,    dur: 2.1, size: 5, drift: 30 },
  { x: 28, delay: 0.15, dur: 1.8, size: 4, drift: -20 },
  { x: 44, delay: 0.05, dur: 2.4, size: 6, drift: 15 },
  { x: 58, delay: 0.3,  dur: 1.9, size: 3, drift: -35 },
  { x: 72, delay: 0.1,  dur: 2.2, size: 5, drift: 25 },
  { x: 85, delay: 0.25, dur: 2.0, size: 4, drift: -18 },
  { x: 20, delay: 0.4,  dur: 1.7, size: 3, drift: 40 },
  { x: 65, delay: 0.35, dur: 2.3, size: 6, drift: -28 },
  { x: 38, delay: 0.2,  dur: 1.6, size: 4, drift: 22 },
  { x: 52, delay: 0.45, dur: 2.5, size: 3, drift: -12 },
  { x: 78, delay: 0.08, dur: 1.9, size: 5, drift: 18 },
  { x: 8,  delay: 0.55, dur: 2.1, size: 4, drift: -30 },
];

function Particles({ color }: { color: string }) {
  return (
    <>
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
          10%  { opacity: 1; }
          80%  { opacity: 0.6; }
          100% { transform: translateY(-160px) translateX(var(--drift)) scale(0); opacity: 0; }
        }
      `}</style>
      {PARTICLE_SEED.map((p, i) => (
        <div
          key={i}
          className="absolute bottom-0 rounded-full pointer-events-none"
          style={{
            left: `${p.x}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: color,
            boxShadow: `0 0 ${p.size * 2}px ${color}`,
            '--drift': `${p.drift}px`,
            animation: `floatUp ${p.dur}s ease-out ${p.delay}s infinite`,
          } as React.CSSProperties}
        />
      ))}
    </>
  );
}

// ── Level number count-up ────────────────────────────────────────────────────

function LevelCount({ from, to, color }: { from: number; to: number; color: string }) {
  const [displayed, setDisplayed] = useState(from);

  useEffect(() => {
    setDisplayed(from);
    const start = performance.now();
    const duration = 700;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to]);

  return (
    <span
      className="text-[64px] font-black leading-none tabular-nums"
      style={{ color, textShadow: `0 0 40px ${color}88` }}
    >
      {displayed}
    </span>
  );
}

// ── Pulsing glow rings ───────────────────────────────────────────────────────

function GlowRings({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="absolute rounded-full animate-ping"
          style={{
            width:  `${80 + i * 70}px`,
            height: `${80 + i * 70}px`,
            border: `1.5px solid ${color}`,
            opacity: 0.18 / i,
            animationDuration: `${0.7 + i * 0.35}s`,
            animationDelay:    `${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export function LevelUpModal() {
  const { pendingLevelUp, dismissLevelUp } = useLevel();
  const { lang } = useLanguage();
  const hasHaptic = useRef(false);
  const [phase, setPhase] = useState<'reveal' | 'details'>('reveal');

  const ar = lang === 'ar';

  useEffect(() => {
    if (!pendingLevelUp) {
      hasHaptic.current = false;
      setPhase('reveal');
      return;
    }
    if (!hasHaptic.current) {
      hasHaptic.current = true;
      haptic('heavy');
      setTimeout(() => haptic('medium'), 250);
      setTimeout(() => haptic('light'),  500);
      setTimeout(() => haptic('medium'), 750);
    }
    const t = setTimeout(() => setPhase('details'), 1100);
    return () => clearTimeout(t);
  }, [pendingLevelUp]);

  if (!pendingLevelUp) return null;

  const { level, name, nameAr, tier, unlocks, miningBonus } = pendingLevelUp;
  const prevLevel = level - 1;
  const prevDef   = prevLevel >= 1 ? getLevelDef(prevLevel) : null;
  const isTierUp  = !!prevDef && prevDef.tier.name !== tier.name;

  const displayName = ar ? nameAr : name;
  const tierLabel   = ar ? tier.nameAr : tier.name;

  const handleDismiss = () => {
    haptic('medium');
    dismissLevelUp();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-5"
      dir={ar ? 'rtl' : 'ltr'}
    >
      {/* Backdrop — tap to dismiss */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(18px)' }}
        onClick={handleDismiss}
      />

      {/* Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Particles color={tier.color} />
      </div>

      {/* Glow rings (centered on screen) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <GlowRings color={tier.color} />
      </div>

      {/* Card */}
      <div
        className="relative w-full max-w-[360px] rounded-[32px] overflow-hidden flex flex-col items-center animate-in zoom-in-90 fade-in duration-400"
        style={{
          background: 'linear-gradient(170deg, #0d1420 0%, #080c14 60%, #05080f 100%)',
          border: `1.5px solid ${tier.color}50`,
          boxShadow: `0 0 80px ${tier.glow}, 0 24px 80px rgba(0,0,0,0.7)`,
        }}
      >
        {/* Top shimmer line */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${tier.color}, transparent)` }}
        />

        {/* ── Reveal phase header ── */}
        <div className="w-full flex flex-col items-center pt-8 px-6 pb-6">

          {/* Stage complete label */}
          <div
            className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 animate-in fade-in slide-in-from-top-2 duration-300"
            style={{ color: tier.color }}
          >
            {ar ? '🎉 اكتملت المرحلة' : '🎉 Stage Complete'}
          </div>

          {/* Big tier icon + level number */}
          <div className="flex flex-col items-center mb-3">
            <div
              className="w-20 h-20 rounded-[24px] flex items-center justify-center mb-3 relative animate-in zoom-in-50 duration-500"
              style={{
                background: `radial-gradient(circle at 40% 35%, ${tier.color}28, ${tier.color}0a)`,
                border: `2px solid ${tier.color}70`,
                boxShadow: `0 0 30px ${tier.glow}, inset 0 1px 0 ${tier.color}30`,
              }}
            >
              <span className="text-[40px] leading-none">{tier.icon}</span>
            </div>

            {/* Level count-up */}
            <div className="flex items-end gap-2">
              {prevLevel >= 1 && (
                <>
                  <span className="text-[28px] font-black text-white/20 leading-none tabular-nums mb-1">
                    {prevLevel}
                  </span>
                  <span className="text-white/30 mb-2 text-lg">→</span>
                </>
              )}
              <LevelCount from={prevLevel >= 1 ? prevLevel : level} to={level} color={tier.color} />
            </div>

            <div
              className="text-[18px] font-black text-white mt-1 animate-in fade-in duration-500 delay-200 text-center"
            >
              {displayName}
            </div>
          </div>

          {/* Tier badge */}
          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold mb-1"
            style={{
              background: `${tier.color}18`,
              border: `1px solid ${tier.color}40`,
              color: tier.color,
            }}
          >
            {isTierUp ? (ar ? '✨ Tier جديد: ' : '✨ New Tier: ') : ''}
            {tierLabel}
          </div>

          {isTierUp && (
            <div
              className="text-[11px] text-white/40 text-center mt-1 animate-in fade-in duration-300"
            >
              {ar
                ? `ترقيت من ${prevDef?.tier.nameAr ?? ''} إلى ${tier.nameAr}!`
                : `Promoted from ${prevDef?.tier.name ?? ''} to ${tier.name}!`}
            </div>
          )}
        </div>

        {/* ── Details phase (slides in) ── */}
        <div
          className="w-full px-6 pb-6 flex flex-col gap-2.5 transition-all duration-500"
          style={{
            opacity: phase === 'details' ? 1 : 0,
            transform: phase === 'details' ? 'translateY(0)' : 'translateY(10px)',
          }}
        >
          {/* Divider */}
          <div className="h-px w-full" style={{ background: `${tier.color}20` }} />

          {/* Unlock row */}
          {unlocks && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{ background: `${tier.color}10`, border: `1px solid ${tier.color}25` }}
            >
              <span className="text-2xl flex-shrink-0">{unlocks.icon}</span>
              <div className="flex flex-col">
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-wide">
                  {ar ? 'تم فتحه' : 'Unlocked'}
                </div>
                <div className="text-sm font-black text-white">
                  {ar ? unlocks.featureAr : unlocks.feature}
                </div>
              </div>
            </div>
          )}

          {/* Mining bonus row */}
          {miningBonus && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.18)' }}
            >
              <span className="text-2xl flex-shrink-0">⚡</span>
              <div className="flex flex-col">
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-wide">
                  {ar ? 'مكافأة التعدين' : 'Mining Bonus'}
                </div>
                <div className="text-sm font-black" style={{ color: '#34d399' }}>
                  +{miningBonus}% {ar ? 'إضافية' : 'extra'}
                </div>
              </div>
            </div>
          )}

          {/* No special unlock */}
          {!unlocks && !miningBonus && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <span className="text-2xl flex-shrink-0">🎯</span>
              <div className="flex flex-col">
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-wide">
                  {ar ? 'استمر في التقدم' : 'Keep going'}
                </div>
                <div className="text-sm font-black text-white">
                  {ar
                    ? `المستوى ${level} مكتمل — واصل!`
                    : `Level ${level} complete — push further!`}
                </div>
              </div>
            </div>
          )}

          {/* Continue button */}
          <button
            onClick={handleDismiss}
            className="w-full mt-1 py-4 rounded-2xl font-black text-[16px] transition-all active:scale-[0.96] hover:opacity-90"
            style={{
              background: `linear-gradient(135deg, ${tier.color}, ${tier.color}cc)`,
              color: '#08111f',
              boxShadow: `0 4px 24px ${tier.glow}`,
            }}
          >
            {ar ? 'رائع! 🚀' : 'Awesome! 🚀'}
          </button>
        </div>
      </div>
    </div>
  );
}
