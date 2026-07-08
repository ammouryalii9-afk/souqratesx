import React, { useState, useEffect } from 'react';
import { useVault } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { Check, Lock, Loader2, PlayCircle, ExternalLink } from 'lucide-react';

const DAILY_REWARDS = [1000, 2500, 5000, 10000, 20000, 35000, 50000];

const SPONSORED_TASKS = [
  { id: 't1', title: 'Join VaultX Official Channel', reward: 5000, link: 'https://t.me/VaultXOfficial' },
  { id: 't2', title: 'Launch Partner Currency Bot', reward: 15000, link: 'https://t.me/PartnerBot' },
  { id: 't3', title: 'Complete Survey via Monlix', reward: 2000, isSurvey: true },
];

export const TasksTab = () => {
  const { setTempMiningPoints } = useVault();
  const { toast } = useToast();

  const [currentStreak, setCurrentStreak] = useState(() => Number(localStorage.getItem('currentStreak')) || 0);
  const [lastLoginDate, setLastLoginDate] = useState(() => localStorage.getItem('lastLoginDate') || '');
  const [claimedTasks, setClaimedTasks] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('claimedTasks') || '[]'); } catch { return []; }
  });

  const [taskStates, setTaskStates] = useState<Record<string, 'idle' | 'loading' | 'verify'>>({});
  const [showSurveyModal, setShowSurveyModal] = useState(false);

  useEffect(() => {
    localStorage.setItem('currentStreak', currentStreak.toString());
    localStorage.setItem('lastLoginDate', lastLoginDate);
    localStorage.setItem('claimedTasks', JSON.stringify(claimedTasks));
  }, [currentStreak, lastLoginDate, claimedTasks]);

  const todayStr = new Date().toISOString().split('T')[0];
  const canClaimDaily = lastLoginDate !== todayStr;

  const handleClaimDaily = () => {
    if (!canClaimDaily) return;
    
    let newStreak = currentStreak;
    // Check if missed a day
    if (lastLoginDate) {
      const lastDate = new Date(lastLoginDate);
      const today = new Date(todayStr);
      const diffTime = Math.abs(today.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 1) newStreak = 0; // reset
    }

    const reward = DAILY_REWARDS[Math.min(newStreak, 6)];
    setTempMiningPoints(prev => prev + reward);
    setCurrentStreak(Math.min(newStreak + 1, 7));
    setLastLoginDate(todayStr);
    
    toast({ title: "Daily Claimed!", description: `+${reward.toLocaleString()} points added.` });
  };

  const handleTaskAction = (taskId: string, link?: string, reward?: number, isSurvey?: boolean) => {
    if (isSurvey) {
      setShowSurveyModal(true);
      return;
    }

    const currentState = taskStates[taskId] || 'idle';

    if (currentState === 'idle') {
      if (link) window.open(link, '_blank');
      setTaskStates(prev => ({ ...prev, [taskId]: 'loading' }));
      setTimeout(() => {
        setTaskStates(prev => ({ ...prev, [taskId]: 'verify' }));
      }, 2000);
    } else if (currentState === 'verify') {
      setTaskStates(prev => ({ ...prev, [taskId]: 'loading' }));
      setTimeout(() => {
        setClaimedTasks(prev => [...prev, taskId]);
        if (reward) setTempMiningPoints(prev => prev + reward);
        toast({ title: "Task Complete", description: `+${reward?.toLocaleString()} points` });
      }, 3000); // Fake verification
    }
  };

  const completeFakeSurvey = () => {
    const pts = Math.floor(Math.random() * 1500) + 500;
    setTempMiningPoints(prev => prev + pts);
    setClaimedTasks(prev => [...prev, 't3']);
    setShowSurveyModal(false);
    toast({ title: "Survey Complete", description: `+${pts.toLocaleString()} points earned from Monlix.` });
  };

  return (
    <div className="flex flex-col space-y-8 px-4 pt-6 pb-24 animate-in fade-in duration-500">
      
      {/* Daily Streak */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">Daily Check-in</h2>
        <div className="bg-card border border-white/5 rounded-xl p-4">
          <div className="grid grid-cols-4 gap-2 mb-4">
            {DAILY_REWARDS.slice(0, 4).map((reward, i) => {
              const dayNum = i + 1;
              const isPast = dayNum <= currentStreak;
              const isToday = dayNum === currentStreak + 1 && canClaimDaily;
              
              return (
                <div key={dayNum} className={`flex flex-col items-center p-2 rounded-lg border ${isToday ? 'border-primary bg-primary/10' : isPast ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5 bg-white/5'} transition-colors`}>
                  <span className="text-[10px] text-muted-foreground mb-1">Day {dayNum}</span>
                  {isPast && !isToday ? (
                    <Check className="w-5 h-5 text-emerald-500 my-1" />
                  ) : (
                    <span className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-white'}`}>{reward > 1000 ? `${reward/1000}k` : reward}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {DAILY_REWARDS.slice(4, 7).map((reward, i) => {
              const dayNum = i + 5;
              const isPast = dayNum <= currentStreak;
              const isToday = dayNum === currentStreak + 1 && canClaimDaily;
              
              return (
                <div key={dayNum} className={`flex flex-col items-center p-2 rounded-lg border ${isToday ? 'border-primary bg-primary/10' : isPast ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5 bg-white/5'}`}>
                  <span className="text-[10px] text-muted-foreground mb-1">Day {dayNum}</span>
                  {isPast && !isToday ? (
                    <Check className="w-5 h-5 text-emerald-500 my-1" />
                  ) : (
                    <span className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-white'}`}>{reward/1000}k</span>
                  )}
                </div>
              );
            })}
          </div>
          
          <button
            data-testid="button-claim-daily"
            onClick={handleClaimDaily}
            disabled={!canClaimDaily}
            className="w-full mt-4 bg-primary text-black font-bold py-3 rounded-lg disabled:opacity-50 disabled:bg-white/10 disabled:text-white/50"
          >
            {canClaimDaily ? 'Claim Today\'s Reward' : 'Come back tomorrow'}
          </button>
        </div>
      </section>

      {/* Sponsored Tasks */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">Partner Tasks</h2>
        <div className="space-y-3">
          {SPONSORED_TASKS.map(task => {
            const isClaimed = claimedTasks.includes(task.id);
            const state = taskStates[task.id] || 'idle';

            return (
              <div key={task.id} className="bg-card border border-white/5 rounded-xl p-4 flex items-center justify-between">
                <div className="flex-1 pr-4">
                  <h3 className="font-semibold text-white text-sm mb-1">{task.title}</h3>
                  <p className="text-xs font-medium text-primary">+{task.reward.toLocaleString()} pts</p>
                </div>
                
                {isClaimed ? (
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Check className="w-5 h-5 text-emerald-500" />
                  </div>
                ) : (
                  <button
                    data-testid={`button-task-${task.id}`}
                    onClick={() => handleTaskAction(task.id, task.link, task.reward, task.isSurvey)}
                    disabled={state === 'loading'}
                    className="min-w-[80px] h-9 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg flex items-center justify-center transition-colors"
                  >
                    {state === 'idle' && (task.isSurvey ? 'Start' : 'Start')}
                    {state === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
                    {state === 'verify' && 'Verify'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Survey Modal */}
      {showSurveyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-white mb-2">Monlix Offer Wall</h3>
            <p className="text-sm text-muted-foreground mb-6">Select a survey to complete. Rewards vary.</p>
            
            <div className="space-y-3">
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  onClick={completeFakeSurvey}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors text-left"
                >
                  <span className="text-sm font-medium text-white">Survey Partner {n}</span>
                  <span className="text-xs text-primary font-bold">500-2k pts</span>
                </button>
              ))}
            </div>
            
            <button 
              onClick={() => setShowSurveyModal(false)}
              className="mt-6 w-full py-3 text-sm text-muted-foreground font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
