import React from 'react';
import { Layers, Gamepad2, Target, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'vault', label: 'Vault', icon: Layers },
    { id: 'games', label: 'Games', icon: Gamepad2 },
    { id: 'tasks', label: 'Tasks', icon: Target },
    { id: 'friends', label: 'Friends', icon: Users },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-background/80 backdrop-blur-xl border-t border-white/5 pb-safe z-50">
      <div className="flex items-center justify-around h-[72px] px-4 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-col items-center justify-center w-full h-full space-y-1.5 relative group"
            >
              <div 
                className={cn(
                  "relative p-2 rounded-xl transition-all duration-300",
                  isActive ? "text-primary scale-110" : "text-muted-foreground group-hover:text-white group-hover:bg-white/5"
                )}
                style={isActive ? {
                  background: 'linear-gradient(135deg, rgba(52,211,153,0.15) 0%, rgba(52,211,153,0.05) 100%)',
                  boxShadow: '0 0 16px rgba(52,211,153,0.15)',
                } : undefined}
              >
                <Icon 
                  className={cn(
                    "w-5 h-5 transition-all duration-300", 
                    isActive && "drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                  )} 
                />
              </div>
              {isActive && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-primary"
                  style={{ boxShadow: '0 0 8px rgba(52,211,153,0.8), 0 0 16px rgba(52,211,153,0.4)' }} />
              )}
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-wider transition-colors duration-300",
                isActive ? "text-primary" : "text-muted-foreground group-hover:text-white"
              )}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
