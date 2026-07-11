import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { claimAchievement } from '../lib/achievementsApi';
import { Lock } from 'lucide-react';

export type AchievementDef = {
  id: string;
  title: string;
  desc: string;
  reward: number;
  icon: string;
  check: (s: AchievState) => boolean;
};

export type AchievState = {
  lifetimePoints: number;
  miningLevel: number;
  profitPerHour: number;
  referralCount: number;
  isPremium: boolean;
  selectedExchange: string | null;
  farmStartTime: number;
  farmState: string;
  claimedAchievements: string[];
};

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_tap',
    title: 'First Tap',
    desc: 'Start your mining journey',
    reward: 500,
    icon: '👆',
    check: (s) => s.lifetimePoints > 0,
  },
  {
    id: 'rookie',
    title: 'Rookie Miner',
    desc: 'Earn 5,000 lifetime points',
    reward: 2000,
    icon: '⛏️',
    check: (s) => s.lifetimePoints >= 5000,
  },
  {
    id: 'silver',
    title: 'Silver League',
    desc: 'Reach 25,000 points (Silver)',
    reward: 5000,
    icon: '🥈',
    check: (s) => s.lifetimePoints >= 25000,
  },
  {
    id: 'gold',
    title: 'Gold League',
    desc: 'Reach 100,000 points (Gold)',
    reward: 15000,
    icon: '🥇',
    check: (s) => s.lifetimePoints >= 100000,
  },
  {
    id: 'millionaire',
    title: 'Millionaire',
    desc: 'Earn 1,000,000 lifetime points',
    reward: 50000,
    icon: '💰',
    check: (s) => s.lifetimePoints >= 1000000,
  },
  {
    id: 'billionaire',
    title: 'Billionaire',
    desc: 'Earn 1 Billion points',
    reward: 500000,
    icon: '💎',
    check: (s) => s.lifetimePoints >= 1000000000,
  },
  {
    id: 'level5',
    title: 'Pro Miner',
    desc: 'Reach Mining Level 5',
    reward: 10000,
    icon: '⚡',
    check: (s) => s.miningLevel >= 5,
  },
  {
    id: 'passive10k',
    title: 'Passive Lord',
    desc: 'Earn 10,000 points/hour passively',
    reward: 20000,
    icon: '📈',
    check: (s) => s.profitPerHour >= 10000,
  },
  {
    id: 'first_referral',
    title: 'Recruiter',
    desc: 'Invite your first friend',
    reward: 5000,
    icon: '👥',
    check: (s) => s.referralCount >= 1,
  },
  {
    id: 'five_referrals',
    title: 'Social Star',
    desc: 'Invite 5 friends',
    reward: 25000,
    icon: '⭐',
    check: (s) => s.referralCount >= 5,
  },
  {
    id: 'ten_referrals',
    title: 'Ambassador',
    desc: 'Invite 10 friends',
    reward: 75000,
    icon: '🏆',
    check: (s) => s.referralCount >= 10,
  },
  {
    id: 'premium',
    title: 'Premium Member',
    desc: 'Subscribe to Premium',
    reward: 10000,
    icon: '👑',
    check: (s) => s.isPremium,
  },
  {
    id: 'trader',
    title: 'Trader',
    desc: 'Choose your crypto exchange',
    reward: 1000,
    icon: '📊',
    check: (s) => !!s.selectedExchange,
  },
  {
    id: 'farmer',
    title: 'First Harvest',
    desc: 'Start your first farming cycle',
    reward: 3000,
    icon: '🌾',
    check: (s) => s.farmState === 'ready' || s.farmStartTime > 0,
  },
];

type Props = {
  state: AchievState;
  addLifetimePoints: (n: number) => void;
  onClaimed: (id: string) => void;
};

export function AchievementsSection({ state, addLifetimePoints, onClaimed }: Props) {
  const { toast } = useToast();
  const [claiming, setClaiming] = useState<string | null>(null);

  const claimed = new Set(state.claimedAchievements);
  const claimedCount = ACHIEVEMENTS.filter((a) => claimed.has(a.id)).length;

  async function handleClaim(achievement: AchievementDef) {
    if (claiming || claimed.has(achievement.id)) return;
    setClaiming(achievement.id);
    try {
      const result = await claimAchievement(achievement.id);
      addLifetimePoints(result.reward);
      onClaimed(achievement.id);
      toast({
        title: `🎉 ${achievement.title} Unlocked!`,
        description: `+${result.reward.toLocaleString()} points added`,
      });
    } catch (err) {
      toast({
        title: 'Could not claim',
        description: err instanceof Error ? err.message : 'Try again later',
        variant: 'destructive',
      });
    } finally {
      setClaiming(null);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Achievements</h2>
        <span className="text-xs font-semibold text-muted-foreground px-2.5 py-1 rounded-full bg-white/5 border border-white/8">
          {claimedCount}/{ACHIEVEMENTS.length}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {ACHIEVEMENTS.map((achievement) => {
          const isUnlocked = achievement.check(state);
          const isClaimed = claimed.has(achievement.id);
          const isClaiming = claiming === achievement.id;

          return (
            <div
              key={achievement.id}
              className="rounded-2xl p-3.5 flex flex-col gap-2 relative overflow-hidden transition-all"
              style={{
                background: isClaimed
                  ? 'linear-gradient(135deg, rgba(52,211,153,0.12) 0%, rgba(52,211,153,0.04) 100%)'
                  : isUnlocked
                  ? 'rgba(255,255,255,0.05)'
                  : 'rgba(255,255,255,0.02)',
                border: isClaimed
                  ? '1px solid rgba(52,211,153,0.25)'
                  : isUnlocked
                  ? '1px solid rgba(255,255,255,0.1)'
                  : '1px solid rgba(255,255,255,0.04)',
              }}
            >
              {isClaimed && (
                <div
                  className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black"
                  style={{ background: 'hsl(152,76%,50%)', color: '#000' }}
                >
                  ✓
                </div>
              )}

              <div className="flex items-start gap-2">
                <span
                  className="text-2xl leading-none flex-shrink-0"
                  style={{ filter: isClaimed || isUnlocked ? 'none' : 'grayscale(1) opacity(0.3)' }}
                >
                  {achievement.icon}
                </span>
                {!isUnlocked && !isClaimed && (
                  <Lock className="w-3 h-3 text-muted-foreground/40 mt-1 flex-shrink-0" />
                )}
              </div>

              <div>
                <p
                  className="text-xs font-bold leading-tight"
                  style={{ color: isClaimed ? 'hsl(152,76%,55%)' : isUnlocked ? 'white' : 'rgba(255,255,255,0.3)' }}
                >
                  {achievement.title}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-tight">{achievement.desc}</p>
              </div>

              <div className="mt-auto">
                {isClaimed ? (
                  <div className="text-[10px] font-bold text-primary/70">+{achievement.reward.toLocaleString()} pts ✓</div>
                ) : isUnlocked ? (
                  <button
                    onClick={() => handleClaim(achievement)}
                    disabled={!!claiming}
                    className="w-full h-7 rounded-lg text-[11px] font-bold transition-all active:scale-[0.97] disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, hsl(152,76%,50%) 0%, hsl(152,76%,42%) 100%)',
                      color: 'hsl(224,71%,4%)',
                      boxShadow: '0 0 12px rgba(52,211,153,0.2)',
                    }}
                  >
                    {isClaiming ? '...' : `Claim +${achievement.reward.toLocaleString()}`}
                  </button>
                ) : (
                  <div className="text-[10px] text-muted-foreground/40">+{achievement.reward.toLocaleString()} pts</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
