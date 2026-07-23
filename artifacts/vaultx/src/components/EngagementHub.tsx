import { useState, useEffect, useCallback } from 'react';
import { useVault } from '../context/VaultContext';
import { useLevel } from '../context/LevelContext';
import { useToast } from '@/hooks/use-toast';
import { haptic } from '../lib/telegram';
import { Flame, Gift, Target, Check, Lock, Clock, Sparkles } from 'lucide-react';
import {
  getEngageStatus,
  claimStreak,
  openMysteryBox,
  claimChallenge,
  type EngageStatus,
} from '../lib/engageApi';
import { getPublicConfig, type PublicConfig } from '../lib/gameApi';
import { showAdsgramRewardedAd } from '../lib/adsgram';
import { showMonetagRewardedAd } from '../lib/monetag';

const CHALLENGE_LABELS: Record<string, string> = {
  streak: 'Claim your daily streak',
  box: 'Open a mystery box',
  ad: 'Watch a rewarded ad',
};

const TIER_STYLE: Record<string, { label: string; color: string }> = {
  common: { label: 'Common', color: '#94a3b8' },
  uncommon: { label: 'Uncommon', color: '#34d399' },
  rare: { label: 'Rare', color: '#38bdf8' },
  epic: { label: 'Epic', color: '#a78bfa' },
  legendary: { label: 'Legendary', color: '#fbbf24' },
  mythic: { label: 'Mythic', color: '#f472b6' },
};

function useCountdown(target: number): string {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, target - Date.now());
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

export function EngagementHub() {
  const { isTelegramUser, refreshFromServer } = useVault();
  const { notifyAdWatched } = useLevel();
  const { toast } = useToast();
  const [status, setStatus] = useState<EngageStatus | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ tier: string; reward: number } | null>(null);

  const load = useCallback(() => {
    getEngageStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    if (!isTelegramUser) return;
    load();
    getPublicConfig().then(setConfig).catch(() => setConfig(null));
  }, [isTelegramUser, load]);

  const afterReward = async () => {
    await refreshFromServer();
    load();
  };

  const watchRewardedAd = async () => {
    if (config?.adsgram.enabled && config.adsgram.blockId) {
      await showAdsgramRewardedAd(config.adsgram.blockId);
    } else if (config?.monetag.enabled && config.monetag.zoneId) {
      await showMonetagRewardedAd(config.monetag.zoneId);
    } else {
      throw new Error('No ad provider is available right now');
    }
  };

  const handleStreak = async () => {
    if (busy) return;
    setBusy('streak');
    try {
      const r = await claimStreak();
      haptic('medium');
      toast({ title: 'Streak Claimed!', description: `+${r.reward.toLocaleString()} pts · Day ${r.streakCount}`, variant: 'success' });
      await afterReward();
    } catch (err) {
      toast({ title: 'Could not claim', description: err instanceof Error ? err.message : 'Try again later', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleBox = async (source: 'free' | 'ad') => {
    if (busy) return;
    setBusy(`box-${source}`);
    try {
      if (source === 'ad') {
        await watchRewardedAd();
        notifyAdWatched();
      }
      const r = await openMysteryBox(source);
      haptic('heavy');
      setReveal({ tier: r.tier, reward: r.reward });
      setTimeout(() => setReveal(null), 2600);
      await afterReward();
    } catch (err) {
      toast({ title: 'Could not open box', description: err instanceof Error ? err.message : 'Try again later', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleChallenge = async () => {
    if (busy) return;
    setBusy('challenge');
    try {
      const r = await claimChallenge();
      haptic('medium');
      toast({ title: 'Daily Bonus!', description: `+${r.reward.toLocaleString()} pts`, variant: 'success' });
      await afterReward();
    } catch (err) {
      toast({ title: 'Could not claim', description: err instanceof Error ? err.message : 'Try again later', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const freeCountdown = useCountdown(status?.mysteryBox.freeCooldownEndsAt ?? 0);

  if (!isTelegramUser) return null;
  if (!status) return null;

  const { streak, mysteryBox, challenges } = status;

  return (
    <div className="flex flex-col gap-6">
      {/* Daily Streak */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-400" />
            <h2 className="text-xl font-bold text-white">Daily Streak</h2>
          </div>
          <span className="text-xs text-orange-400 font-bold bg-orange-500/10 px-2.5 py-1 rounded-full border border-orange-500/20">
            {streak.count} day{streak.count === 1 ? '' : 's'}
          </span>
        </div>

        <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[20px] p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-[40px] pointer-events-none" />
          <div className="grid grid-cols-7 gap-1.5 mb-4 relative z-10">
            {streak.rewards.map((reward, i) => {
              const dayNum = i + 1;
              const isDone = streak.claimedToday ? dayNum <= streak.day : dayNum < streak.day;
              const isToday = !streak.claimedToday && dayNum === streak.day;
              return (
                <div
                  key={i}
                  className="rounded-xl py-2 flex flex-col items-center gap-1 border transition-all"
                  style={{
                    background: isToday ? 'linear-gradient(135deg, rgba(251,146,60,0.2), rgba(251,146,60,0.05))' : isDone ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.03)',
                    borderColor: isToday ? 'rgba(251,146,60,0.4)' : isDone ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  <span className="text-[9px] font-bold text-muted-foreground">D{dayNum}</span>
                  {isDone ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <span className={`text-[9px] font-bold ${isToday ? 'text-orange-300' : 'text-white/60'}`}>
                      {reward >= 1000 ? `${Math.round(reward / 1000)}k` : reward}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <button
            onClick={handleStreak}
            disabled={streak.claimedToday || busy === 'streak'}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed relative z-10"
            style={{
              background: streak.claimedToday ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)',
              color: streak.claimedToday ? 'rgba(255,255,255,0.5)' : '#1a1005',
            }}
          >
            {streak.claimedToday ? 'Come back tomorrow' : busy === 'streak' ? 'Claiming...' : `Claim +${streak.nextReward.toLocaleString()} pts`}
          </button>
        </div>
      </section>

      {/* Mystery Boxes */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white">Mystery Boxes</h2>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Free box */}
          <button
            onClick={() => handleBox('free')}
            disabled={!mysteryBox.freeAvailable || busy === 'box-free'}
            className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[20px] p-4 flex flex-col items-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent" />
            <div className="text-4xl relative z-10">🎁</div>
            <span className="text-sm font-bold text-white relative z-10">Free Box</span>
            {mysteryBox.freeAvailable ? (
              <span className="text-[11px] font-bold text-emerald-400 relative z-10">
                {busy === 'box-free' ? 'Opening...' : 'Open now!'}
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1 relative z-10">
                <Clock className="w-3 h-3" /> {freeCountdown}
              </span>
            )}
          </button>

          {/* Ad box */}
          <button
            onClick={() => handleBox('ad')}
            disabled={mysteryBox.adBoxesRemaining <= 0 || busy === 'box-ad'}
            className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[20px] p-4 flex flex-col items-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent" />
            <div className="text-4xl relative z-10">💎</div>
            <span className="text-sm font-bold text-white relative z-10">Premium Box</span>
            <span className="text-[10px] font-semibold text-amber-400 relative z-10">
              {busy === 'box-ad' ? 'Opening...' : `Watch ad · ${mysteryBox.adBoxesRemaining} left`}
            </span>
          </button>
        </div>
      </section>

      {/* Daily Challenges */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white">Daily Challenges</h2>
          </div>
          <span className="text-xs text-cyan-400 font-bold bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20">
            +{challenges.bonus.toLocaleString()} pts
          </span>
        </div>

        <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[20px] p-4 flex flex-col gap-2.5">
          {challenges.list.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border"
                style={{
                  background: c.done ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.03)',
                  borderColor: c.done ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.08)',
                }}
              >
                {c.done ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Lock className="w-3 h-3 text-muted-foreground/50" />}
              </div>
              <span className={`text-sm font-semibold ${c.done ? 'text-white' : 'text-muted-foreground'}`}>
                {CHALLENGE_LABELS[c.id] ?? c.id}
              </span>
            </div>
          ))}
          <button
            onClick={handleChallenge}
            disabled={!challenges.allDone || challenges.claimed || busy === 'challenge'}
            className="w-full py-3 mt-1 rounded-xl font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: challenges.claimed ? 'rgba(255,255,255,0.05)' : challenges.allDone ? 'linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)' : 'rgba(255,255,255,0.05)',
              color: challenges.allDone && !challenges.claimed ? '#062a30' : 'rgba(255,255,255,0.5)',
            }}
          >
            {challenges.claimed ? 'Claimed today ✓' : challenges.allDone ? (busy === 'challenge' ? 'Claiming...' : `Claim +${challenges.bonus.toLocaleString()} pts`) : 'Complete all missions'}
          </button>
        </div>
      </section>

      {/* Box reveal overlay */}
      {reveal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setReveal(null)}>
          <div
            className="rounded-[28px] px-8 py-10 flex flex-col items-center gap-3 animate-in zoom-in-95 duration-300"
            style={{
              background: 'linear-gradient(160deg, rgba(20,24,40,0.98), rgba(10,12,22,0.98))',
              border: `1px solid ${TIER_STYLE[reveal.tier]?.color ?? '#fff'}55`,
              boxShadow: `0 0 60px ${TIER_STYLE[reveal.tier]?.color ?? '#fff'}40`,
            }}
          >
            <Sparkles className="w-8 h-8" style={{ color: TIER_STYLE[reveal.tier]?.color ?? '#fff' }} />
            <div className="text-6xl">🎉</div>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: TIER_STYLE[reveal.tier]?.color ?? '#fff' }}>
              {TIER_STYLE[reveal.tier]?.label ?? reveal.tier}
            </span>
            <span className="text-3xl font-black text-white tabular-nums">+{reveal.reward.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground font-semibold">points</span>
          </div>
        </div>
      )}
    </div>
  );
}
