import React from 'react';
import { Vault, Gamepad2, ListChecks, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'vault', label: 'Vault', icon: Vault },
    { id: 'games', label: 'Games', icon: Gamepad2 },
    { id: 'tasks', label: 'Tasks', icon: ListChecks },
    { id: 'friends', label: 'Friends', icon: Users },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-black/60 backdrop-blur-md border-t border-white/5 pb-safe z-50">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-col items-center justify-center w-full h-full space-y-1 relative"
            >
              <Icon 
                className={cn(
                  "w-6 h-6 transition-all duration-300", 
                  isActive ? "text-primary scale-110 drop-shadow-[0_0_8px_rgba(245,197,24,0.5)]" : "text-muted-foreground"
                )} 
              />
              <span className={cn(
                "text-[10px] font-medium transition-colors duration-300",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                {tab.label}
              </span>
              {isActive && (
                <div className="absolute top-0 w-8 h-[2px] bg-primary rounded-b-full shadow-[0_2px_8px_rgba(245,197,24,0.8)]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
