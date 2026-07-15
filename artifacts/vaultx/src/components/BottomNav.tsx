import React from 'react';
import { Layers, Gamepad2, Target, Users, Shield, Grid3x3, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '../lib/i18n';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { tr } = useLanguage();

  const tabs = [
    { id: 'vault',   label: tr.nav.vault,   icon: Layers },
    { id: 'games',   label: tr.nav.games,   icon: Gamepad2 },
    { id: 'tasks',   label: tr.nav.tasks,   icon: Target },
    { id: 'stars',   label: tr.nav.stars,   icon: Star,   gold: true },
    { id: 'squad',   label: tr.nav.squad,   icon: Shield },
    { id: 'pixels',  label: tr.nav.pixels,  icon: Grid3x3 },
    { id: 'friends', label: tr.nav.friends, icon: Users },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-background/80 backdrop-blur-xl border-t border-white/5 pb-safe z-50">
      <div className="flex items-center justify-around h-[68px] px-1 pb-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isGold = tab.gold;

          const activeColor = isGold ? 'rgba(251,191,36,1)' : 'rgba(52,211,153,1)';
          const activeBg   = isGold
            ? 'linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0.06) 100%)'
            : 'linear-gradient(135deg, rgba(52,211,153,0.15) 0%, rgba(52,211,153,0.05) 100%)';
          const activeShadow = isGold
            ? '0 0 16px rgba(251,191,36,0.25)'
            : '0 0 16px rgba(52,211,153,0.15)';
          const activeGlow = isGold
            ? 'drop-shadow-[0_0_8px_rgba(251,191,36,0.7)]'
            : 'drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]';

          return (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-col items-center justify-center w-full h-full space-y-1 relative group"
            >
              <div
                className={cn(
                  "relative p-1.5 rounded-xl transition-all duration-300",
                  isActive ? "scale-110" : "text-muted-foreground group-hover:text-white group-hover:bg-white/5"
                )}
                style={isActive ? { background: activeBg, boxShadow: activeShadow, color: activeColor } : undefined}
              >
                <Icon
                  className={cn(
                    "w-[18px] h-[18px] transition-all duration-300",
                    isActive && activeGlow,
                    isGold && !isActive && 'text-yellow-400/60',
                    isGold && isActive && 'fill-yellow-300',
                  )}
                />
              </div>
              {isActive && (
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full"
                  style={{ background: activeColor, boxShadow: `0 0 8px ${activeColor}, 0 0 16px ${activeColor}` }}
                />
              )}
              <span
                className={cn(
                  "text-[9px] font-bold uppercase tracking-wider transition-colors duration-300",
                  isActive
                    ? isGold ? 'text-yellow-300' : 'text-primary'
                    : 'text-muted-foreground group-hover:text-white'
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
