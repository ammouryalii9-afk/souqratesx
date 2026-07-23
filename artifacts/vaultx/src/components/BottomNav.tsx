import React from 'react';
import { Layers, Pickaxe, Target, Users, Shield, Grid3x3, Star, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '../lib/i18n';
import { useLevel } from '../context/LevelContext';
import { FEATURE_LEVEL_REQUIRED } from '../lib/levels';
import { haptic } from '../lib/telegram';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { tr } = useLanguage();
  const { isFeatureUnlocked, requiredLevelFor } = useLevel();

  const tabs = [
    { id: 'vault',   label: tr.nav.vault,   icon: Layers },
    { id: 'games',   label: tr.nav.games,   icon: Pickaxe },
    { id: 'tasks',   label: tr.nav.tasks,   icon: Target },
    { id: 'stars',   label: tr.nav.stars,   icon: Star,   gold: true },
    { id: 'squad',   label: tr.nav.squad,   icon: Shield },
    { id: 'pixels',  label: tr.nav.pixels,  icon: Grid3x3 },
    { id: 'friends', label: tr.nav.friends, icon: Users },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto pb-safe z-50"
      style={{
        background: 'linear-gradient(to top, hsl(224 71% 3% / 0.98), hsl(224 71% 4% / 0.92))',
        borderTop: '1px solid hsl(216 30% 14% / 0.6)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
      }}
    >
      <div className="flex items-center justify-around h-[64px] px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isGold = tab.gold;
          const locked = tab.id !== 'vault' && !isFeatureUnlocked(tab.id);
          const reqLevel = locked ? requiredLevelFor(tab.id) : null;

          return (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => {
                haptic('select');
                setActiveTab(tab.id);
              }}
              className="flex flex-col items-center justify-center w-full h-full gap-1 relative group transition-all duration-200 active:scale-90"
            >
              {/* Active pill background */}
              {isActive && !locked && (
                <div
                  className="absolute inset-x-2 inset-y-1.5 rounded-xl"
                  style={isGold
                    ? { background: 'linear-gradient(135deg, hsl(43 96% 56% / 0.14), hsl(43 96% 56% / 0.06))' }
                    : { background: 'linear-gradient(135deg, hsl(152 72% 52% / 0.12), hsl(152 72% 52% / 0.05))' }
                  }
                />
              )}

              {/* Lock badge */}
              {locked && reqLevel && (
                <div
                  className="absolute top-0.5 right-[calc(50%-20px)] z-10 flex items-center gap-0.5 px-1 py-0.5 rounded-full"
                  style={{ background: 'rgba(10,15,26,0.95)', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  <Lock className="w-2 h-2 text-white/40" />
                  <span className="text-[7px] font-black text-white/40">{reqLevel}</span>
                </div>
              )}

              <Icon
                className={cn(
                  'w-[19px] h-[19px] relative z-10 transition-all duration-200',
                  locked
                    ? 'text-white/15'
                    : isActive
                      ? isGold
                        ? 'text-gold fill-gold drop-shadow-[0_0_8px_hsl(43_96%_56%/0.8)]'
                        : 'text-primary drop-shadow-[0_0_8px_hsl(152_72%_52%/0.7)]'
                      : isGold
                        ? 'text-gold/40 group-hover:text-gold/70'
                        : 'text-white/30 group-hover:text-white/60',
                )}
              />

              <span
                className={cn(
                  'text-[8.5px] font-bold uppercase tracking-wide relative z-10 transition-colors duration-200',
                  locked
                    ? 'text-white/15'
                    : isActive
                      ? isGold ? 'text-gold' : 'text-primary'
                      : 'text-white/25 group-hover:text-white/50',
                )}
              >
                {tab.label}
              </span>

              {/* Active dot indicator */}
              {isActive && !locked && (
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full"
                  style={isGold
                    ? { background: 'hsl(var(--gold))', boxShadow: '0 0 6px hsl(var(--gold))' }
                    : { background: 'hsl(var(--primary))', boxShadow: '0 0 6px hsl(var(--primary))' }
                  }
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
