import { useEffect, useRef } from 'react';
import { useLevel } from '../context/LevelContext';
import { haptic } from '../lib/telegram';

export function LevelUpModal() {
  const { pendingLevelUp, dismissLevelUp } = useLevel();
  const hasHaptic = useRef(false);

  useEffect(() => {
    if (pendingLevelUp && !hasHaptic.current) {
      hasHaptic.current = true;
      haptic('heavy');
      setTimeout(() => haptic('medium'), 200);
      setTimeout(() => haptic('light'), 400);
    }
    if (!pendingLevelUp) hasHaptic.current = false;
  }, [pendingLevelUp]);

  if (!pendingLevelUp) return null;

  const { level, name, tier, unlocks, miningBonus } = pendingLevelUp;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
    >
      {/* Glow rings */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden
      >
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="absolute rounded-full animate-ping"
            style={{
              width: `${120 + i * 80}px`,
              height: `${120 + i * 80}px`,
              border: `2px solid ${tier.color}`,
              opacity: 0.15 / i,
              animationDuration: `${0.8 + i * 0.4}s`,
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div
        className="relative w-full max-w-[340px] rounded-[28px] overflow-hidden flex flex-col items-center p-7 animate-in zoom-in-95 duration-300"
        style={{
          background: 'linear-gradient(160deg, #0d1525 0%, #0a0f1a 100%)',
          border: `2px solid ${tier.color}44`,
          boxShadow: `0 0 60px ${tier.glow}, 0 20px 60px rgba(0,0,0,0.6)`,
        }}
      >
        {/* Top glow line */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${tier.color}, transparent)` }}
        />

        {/* Level badge */}
        <div
          className="w-24 h-24 rounded-[28px] flex flex-col items-center justify-center mb-5 relative"
          style={{
            background: `radial-gradient(circle at 40% 35%, ${tier.color}30, ${tier.color}10)`,
            border: `2px solid ${tier.color}60`,
            boxShadow: `0 0 30px ${tier.glow}`,
          }}
        >
          <span className="text-4xl leading-none">{tier.icon}</span>
          <span className="text-[11px] font-black mt-1" style={{ color: tier.color }}>
            LVL {level}
          </span>
        </div>

        {/* Title */}
        <div
          className="text-[11px] font-black uppercase tracking-[0.2em] mb-1"
          style={{ color: tier.color }}
        >
          Level Up!
        </div>
        <h2 className="text-2xl font-black text-white mb-0.5 text-center">{name}</h2>
        <p className="text-[13px] text-white/40 mb-6 text-center">{tier.name} Tier</p>

        {/* Rewards */}
        <div className="w-full flex flex-col gap-2 mb-6">
          {unlocks && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: `${tier.color}12`, border: `1px solid ${tier.color}28` }}
            >
              <span className="text-xl">{unlocks.icon}</span>
              <div>
                <div className="text-[10px] text-white/40">Unlocked</div>
                <div className="text-sm font-bold text-white">{unlocks.feature}</div>
              </div>
            </div>
          )}
          {miningBonus && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}
            >
              <span className="text-xl">⚡</span>
              <div>
                <div className="text-[10px] text-white/40">Mining Bonus</div>
                <div className="text-sm font-bold text-primary">+{miningBonus}% extra</div>
              </div>
            </div>
          )}
          {!unlocks && !miningBonus && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <span className="text-xl">🎯</span>
              <div>
                <div className="text-[10px] text-white/40">Keep going!</div>
                <div className="text-sm font-bold text-white">Level {level} Complete</div>
              </div>
            </div>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={() => { haptic('medium'); dismissLevelUp(); }}
          className="w-full py-3.5 rounded-2xl font-black text-[15px] transition-all active:scale-[0.97]"
          style={{
            background: `linear-gradient(135deg, ${tier.color}, ${tier.color}cc)`,
            color: '#0a0f1a',
            boxShadow: `0 4px 20px ${tier.glow}`,
          }}
        >
          Awesome! 🚀
        </button>
      </div>
    </div>
  );
}
