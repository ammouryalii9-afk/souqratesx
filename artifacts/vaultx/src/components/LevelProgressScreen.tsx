import { useRef, useEffect } from 'react';
import { CheckCircle2, Lock, ChevronRight, X } from 'lucide-react';
import { useLevel } from '../context/LevelContext';
import { LEVELS, formatSkpShort, type LevelDef } from '../lib/levels';
import { haptic } from '../lib/telegram';
import { useVault } from '../context/VaultContext';

interface Props { onClose: () => void }

export function LevelProgressScreen({ onClose }: Props) {
  const { level, progress, nextSkp, currentSkp, totalAdsWatched, totalTasksCompleted } = useLevel();
  const { totalReferrals, miningLevel, passiveCards } = useVault();
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }, []);

  const passiveOwned = passiveCards.length;

  function conditionMet(def: LevelDef, condIdx: number): boolean {
    const c = def.conditions[condIdx];
    switch (c.type) {
      case 'invites':       return totalReferrals >= c.value;
      case 'miningLevel':   return miningLevel >= c.value;
      case 'adsWatched':    return totalAdsWatched >= c.value;
      case 'tasksCompleted':return totalTasksCompleted >= c.value;
      case 'passiveCards':  return passiveOwned >= c.value;
      default: return true;
    }
  }

  function conditionProgress(def: LevelDef, condIdx: number): number {
    const c = def.conditions[condIdx];
    let cur = 0;
    switch (c.type) {
      case 'invites':       cur = totalReferrals; break;
      case 'miningLevel':   cur = miningLevel; break;
      case 'adsWatched':    cur = totalAdsWatched; break;
      case 'tasksCompleted':cur = totalTasksCompleted; break;
      case 'passiveCards':  cur = passiveOwned; break;
    }
    return Math.min(100, Math.floor((cur / c.value) * 100));
  }

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-[#060d1a] animate-in slide-in-from-bottom duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 border-b border-white/8">
        <button
          onClick={() => { haptic('light'); onClose(); }}
          className="p-2 rounded-xl bg-white/5 active:scale-90 transition-all"
        >
          <X className="w-5 h-5 text-white/70" />
        </button>
        <div className="flex-1">
          <h2 className="font-black text-white text-lg leading-none">Level Progress</h2>
          <p className="text-[11px] text-white/40 mt-0.5">100 Levels · Your Level {level}</p>
        </div>
        <div
          className="px-3 py-1.5 rounded-xl text-[12px] font-black"
          style={{
            background: `${LEVELS[level - 1].tier.color}18`,
            color: LEVELS[level - 1].tier.color,
            border: `1px solid ${LEVELS[level - 1].tier.color}30`,
          }}
        >
          {LEVELS[level - 1].tier.icon} {LEVELS[level - 1].tier.name}
        </div>
      </div>

      {/* Current level progress bar */}
      <div className="px-4 py-3 border-b border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-bold text-white/60">
            {formatSkpShort(currentSkp)} / {formatSkpShort(nextSkp)}
          </span>
          <span className="text-[12px] font-black text-primary">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/8 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${LEVELS[level - 1].tier.color}, ${LEVELS[level - 1].tier.color}aa)`,
              boxShadow: `0 0 8px ${LEVELS[level - 1].tier.glow}`,
            }}
          />
        </div>
      </div>

      {/* Levels list */}
      <div className="flex-1 overflow-y-auto pb-6">
        {LEVELS.map((def) => {
          const isCompleted = level > def.level;
          const isCurrent   = level === def.level;
          const isLocked    = level < def.level;
          const skpMet      = currentSkp >= def.skpRequired;

          return (
            <div
              key={def.level}
              ref={isCurrent ? activeRef : undefined}
              className="relative"
            >
              {/* Tier separator */}
              {def.level === def.tier.from && (
                <div
                  className="flex items-center gap-2 px-4 py-2 mt-2"
                  style={{ borderTop: def.level > 1 ? '1px solid rgba(255,255,255,0.05)' : undefined }}
                >
                  <span className="text-base">{def.tier.icon}</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: def.tier.color }}>
                    {def.tier.name} — Levels {def.tier.from}–{def.tier.to}
                  </span>
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${def.tier.color}30, transparent)` }} />
                </div>
              )}

              {/* Level row */}
              <div
                className="mx-3 mb-1 rounded-2xl overflow-hidden"
                style={{
                  background: isCurrent
                    ? `linear-gradient(135deg, ${def.tier.color}18, ${def.tier.color}08)`
                    : isCompleted ? 'rgba(52,211,153,0.05)' : 'rgba(255,255,255,0.02)',
                  border: isCurrent
                    ? `1.5px solid ${def.tier.color}50`
                    : isCompleted ? '1px solid rgba(52,211,153,0.15)' : '1px solid rgba(255,255,255,0.05)',
                  boxShadow: isCurrent ? `0 0 20px ${def.tier.glow}` : 'none',
                }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Level number */}
                  <div
                    className="w-10 h-10 rounded-[14px] flex flex-col items-center justify-center shrink-0"
                    style={{
                      background: isCompleted ? 'rgba(52,211,153,0.15)' :
                                  isCurrent   ? `${def.tier.color}20` : 'rgba(255,255,255,0.04)',
                      border: isCompleted ? '1px solid rgba(52,211,153,0.3)' :
                              isCurrent   ? `1px solid ${def.tier.color}40` : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    ) : isLocked ? (
                      <Lock className="w-4 h-4 text-white/20" />
                    ) : (
                      <>
                        <span className="text-[9px]" style={{ color: def.tier.color }}>{def.tier.icon}</span>
                        <span className="text-[11px] font-black" style={{ color: def.tier.color }}>{def.level}</span>
                      </>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[13px] font-black ${isLocked ? 'text-white/25' : 'text-white'}`}>
                        {def.name}
                      </span>
                      {isCurrent && (
                        <span
                          className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: `${def.tier.color}25`, color: def.tier.color }}
                        >
                          Current
                        </span>
                      )}
                      {isCompleted && (
                        <span className="text-[8px] font-bold text-primary/60">✓</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] ${isLocked ? 'text-white/20' : 'text-white/40'}`}>
                        {formatSkpShort(def.skpRequired)} SKP
                      </span>
                      {def.unlocks && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{
                            background: isCompleted ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)',
                            color: isCompleted ? '#34d399' : 'rgba(255,255,255,0.3)',
                          }}
                        >
                          {def.unlocks.icon} {def.unlocks.feature}
                        </span>
                      )}
                      {def.miningBonus && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{
                            background: isCompleted ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)',
                            color: isCompleted ? '#34d399' : 'rgba(255,255,255,0.3)',
                          }}
                        >
                          ⚡ +{def.miningBonus}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress arrow for current / next */}
                  {isCurrent && (
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: def.tier.color }} />
                  )}
                </div>

                {/* Conditions for current / next 3 levels */}
                {(isCurrent || (!isCompleted && def.level <= level + 3 && def.conditions.length > 0)) && (
                  <div className="px-4 pb-3 flex flex-col gap-1.5">
                    {def.conditions.map((c, ci) => {
                      const met = isCompleted || conditionMet(def, ci);
                      const pct = isCompleted ? 100 : conditionProgress(def, ci);
                      return (
                        <div key={ci}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px]">{c.icon}</span>
                              <span className={`text-[10px] font-semibold ${met ? 'text-primary' : 'text-white/40'}`}>
                                {c.label}
                              </span>
                            </div>
                            <span className={`text-[10px] font-bold ${met ? 'text-primary' : 'text-white/30'}`}>
                              {met ? '✓' : `${pct}%`}
                            </span>
                          </div>
                          {!met && (
                            <div className="h-1 rounded-full bg-white/8 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, background: def.tier.color }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* SKP progress bar for current */}
                    {isCurrent && (
                      <div className="mt-1">
                        <div className="flex justify-between mb-1">
                          <span className="text-[10px] text-white/30">Lifetime Points</span>
                          <span className="text-[10px] text-white/40">{formatSkpShort(currentSkp)} / {formatSkpShort(nextSkp)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${progress}%`, background: def.tier.color }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
