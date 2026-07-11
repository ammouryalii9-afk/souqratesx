import { useEffect, useRef, useState } from 'react';
import { useVault } from '../context/VaultContext';
import { haptic } from '../lib/telegram';
import { ACHIEVEMENTS, type AchievState } from './AchievementsSection';

type Celebration =
  | { kind: 'level'; level: number }
  | { kind: 'achievement'; title: string; icon: string; reward: number };

export function CelebrationOverlay() {
  const {
    isTelegramUser,
    lifetimePoints,
    miningLevel,
    profitPerHour,
    totalReferrals,
    isPremium,
    selectedExchange,
    farmStartTime,
    farmState,
    claimedAchievements,
  } = useVault();

  const [queue, setQueue] = useState<Celebration[]>([]);
  const [current, setCurrent] = useState<Celebration | null>(null);

  const prevLevel = useRef<number | null>(null);
  const seenUnlocked = useRef<Set<string> | null>(null);

  const state: AchievState = {
    lifetimePoints,
    miningLevel,
    profitPerHour,
    referralCount: totalReferrals,
    isPremium,
    selectedExchange,
    farmStartTime,
    farmState,
    claimedAchievements,
  };

  // Level-up detection
  useEffect(() => {
    if (prevLevel.current === null) {
      prevLevel.current = miningLevel;
      return;
    }
    if (miningLevel > prevLevel.current) {
      setQueue((q) => [...q, { kind: 'level', level: miningLevel }]);
    }
    prevLevel.current = miningLevel;
  }, [miningLevel]);

  // Newly-unlocked achievement detection (unlocked but not yet claimed)
  useEffect(() => {
    const unlockedNow = new Set(
      ACHIEVEMENTS.filter((a) => a.check(state) && !claimedAchievements.includes(a.id)).map((a) => a.id),
    );
    if (seenUnlocked.current === null) {
      seenUnlocked.current = unlockedNow;
      return;
    }
    const fresh: Celebration[] = [];
    for (const a of ACHIEVEMENTS) {
      if (unlockedNow.has(a.id) && !seenUnlocked.current.has(a.id)) {
        fresh.push({ kind: 'achievement', title: a.title, icon: a.icon, reward: a.reward });
      }
    }
    seenUnlocked.current = unlockedNow;
    if (fresh.length > 0) setQueue((q) => [...q, ...fresh]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifetimePoints, miningLevel, profitPerHour, totalReferrals, isPremium, selectedExchange, farmState, farmStartTime, claimedAchievements]);

  // Drain the queue one at a time
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
    haptic('success');
    const t = setTimeout(() => setCurrent(null), 3200);
    return () => clearTimeout(t);
  }, [queue, current]);

  if (!isTelegramUser || !current) return null;

  const isLevel = current.kind === 'level';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 px-6"
      onClick={() => setCurrent(null)}
    >
      <div
        className="rounded-[28px] px-8 py-10 flex flex-col items-center gap-3 text-center animate-in zoom-in-95 duration-300 max-w-[320px]"
        style={{
          background: 'linear-gradient(160deg, rgba(20,24,40,0.98), rgba(10,12,22,0.98))',
          border: isLevel ? '1px solid rgba(52,211,153,0.4)' : '1px solid rgba(251,191,36,0.4)',
          boxShadow: isLevel ? '0 0 60px rgba(52,211,153,0.35)' : '0 0 60px rgba(251,191,36,0.3)',
        }}
      >
        {isLevel ? (
          <>
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-400">Level Up</span>
            <div className="text-6xl">⚡</div>
            <span className="text-4xl font-black text-white">Level {current.level}</span>
            <span className="text-sm text-muted-foreground font-semibold">
              Your mining power just increased!
            </span>
          </>
        ) : (
          <>
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-amber-400">Achievement Unlocked</span>
            <div className="text-6xl">{current.icon}</div>
            <span className="text-2xl font-black text-white">{current.title}</span>
            <span className="text-sm font-bold text-amber-300">
              Claim +{current.reward.toLocaleString()} pts in Tasks
            </span>
          </>
        )}
        <span className="text-[11px] text-muted-foreground/60 mt-1">Tap to dismiss</span>
      </div>
    </div>
  );
}
