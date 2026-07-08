import React, { useState, useEffect } from 'react';
import { useVault } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { Check, Lock, Loader2, PlayCircle, ExternalLink, Cpu, Flame, Globe, Leaf, Star, Gem, Gift } from 'lucide-react';

const DAILY_REWARDS = [1000, 2500, 5000, 10000, 20000, 35000, 50000];

const SPONSORED_TASKS = [
  { id: 't1', title: 'Join VaultX Official Channel', reward: 5000, link: 'https://t.me/VaultXOfficial' },
  { id: 't2', title: 'Launch Partner Currency Bot', reward: 15000, link: 'https://t.me/PartnerBot' },
  { id: 't3', title: 'Complete Survey via Monlix', reward: 2000, isSurvey: true },
];

const COMBO_ICONS = [
  { id: 'cpu', icon: Cpu },
  { id: 'flame', icon: Flame },
  { id: 'globe', icon: Globe },
  { id: 'leaf', icon: Leaf },
  { id: 'star', icon: Star },
  { id: 'gem', icon: Gem },
];

export const TasksTab = () => {
  const { setTempMiningPoints, addLifetimePoints } = useVault();
  const { toast } = useToast();

  const [currentStreak, setCurrentStreak] = useState(() => Number(localStorage.getItem('currentStreak')) || 0);
  const [lastLoginDate, setLastLoginDate] = useState(() => localStorage.getItem('lastLoginDate') || '');
  const [claimedTasks, setClaimedTasks] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('claimedTasks') || '[]'); } catch { return []; }
  });

  const [taskStates, setTaskStates] = useState<Record<string, 'idle' | 'loading' | 'verify'>>({});
  const [showSurveyModal, setShowSurveyModal] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  
  const [comboResult, setComboResult] = useState<'none' | 'success' | 'failed'>(() => {
    const savedDate = localStorage.getItem('dailyComboDate');
    return savedDate === todayStr ? (localStorage.getItem('dailyComboResult') as any) || 'none' : 'none';
  });
  const [selectedCombo, setSelectedCombo] = useState<string[]>([]);
  
  // Deterministic target combo based on date
  const targetCombo = ['star', 'globe', 'gem']; // Hardcoded for simplicity in demo
  
  const [airdropTime, setAirdropTime] = useState({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    localStorage.setItem('currentStreak', currentStreak.toString());
    localStorage.setItem('lastLoginDate', lastLoginDate);
    localStorage.setItem('claimedTasks', JSON.stringify(claimedTasks));
  }, [currentStreak, lastLoginDate, claimedTasks]);

  useEffect(() => {
    const target = new Date('2025-09-01T00:00:00Z').getTime();
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, target - now);
      setAirdropTime({
        d: Math.floor(diff / (1000 * 60 * 60 * 24)),
        h: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        m: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        s: Math.floor((diff % (1000 * 60)) / 1000)
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const canClaimDaily = lastLoginDate !== todayStr;

  const handleClaimDaily = () => {
    if (!canClaimDaily) return;
    
    let newStreak = currentStreak;
    if (lastLoginDate) {
      const lastDate = new Date(lastLoginDate);
      const today = new Date(todayStr);
      const diffTime = Math.abs(today.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 1) newStreak = 0;
    }

    const reward = DAILY_REWARDS[Math.min(newStreak, 6)];
    setTempMiningPoints(prev => prev + reward);
    addLifetimePoints(reward);
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
        if (reward) {
          setTempMiningPoints(prev => prev + reward);
          addLifetimePoints(reward);
        }
        toast({ title: "Task Complete", description: `+${reward?.toLocaleString()} points` });
      }, 3000);
    }
  };

  const completeFakeSurvey = () => {
    const pts = Math.floor(Math.random() * 1500) + 500;
    setTempMiningPoints(prev => prev + pts);
    addLifetimePoints(pts);
    setClaimedTasks(prev => [...prev, 't3']);
    setShowSurveyModal(false);
    toast({ title: "Survey Complete", description: `+${pts.toLocaleString()} points earned from Monlix.` });
  };

  const toggleCombo = (id: string) => {
    if (comboResult !== 'none') return;
    setSelectedCombo(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length < 3) return [...prev, id];
      return prev;
    });
  };

  const checkCombo = () => {
    if (selectedCombo.length !== 3) return;
    const isCorrect = selectedCombo.every(id => targetCombo.includes(id));
    if (isCorrect) {
      setComboResult('success');
      setTempMiningPoints(p => p + 50000);
      addLifetimePoints(50000);
      toast({ title: "Combo Correct!", description: "+50,000 points added!" });
    } else {
      setComboResult('failed');
      toast({ title: "Wrong Combo", description: "Try again tomorrow.", variant: "destructive" });
    }
    localStorage.setItem('dailyComboDate', todayStr);
    localStorage.setItem('dailyComboResult', isCorrect ? 'success' : 'failed');
  };

  return (
    <div className="flex flex-col space-y-8 px-4 pt-6 pb-24 animate-in fade-in duration-500">
      
      {/* Daily Combo */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Daily Combo</h2>
          <span className="text-xs text-primary font-bold bg-primary/10 px-2 py-1 rounded-full border border-primary/20">+50,000 pts</span>
        </div>
        <div className="bg-card border border-white/5 rounded-xl p-4">
          {comboResult === 'success' ? (
            <div className="text-center py-4 text-emerald-400 font-bold flex flex-col items-center gap-2">
              <Check className="w-8 h-8" />
              Combo Solved! Come back tomorrow.
            </div>
          ) : comboResult === 'failed' ? (
            <div className="text-center py-4 text-red-400 font-bold flex flex-col items-center gap-2">
              <Lock className="w-8 h-8" />
              Wrong combo. Try again tomorrow.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex justify-center gap-3">
                {[0,1,2].map(i => {
                  const sel = selectedCombo[i];
                  const Icon = sel ? COMBO_ICONS.find(c => c.id === sel)?.icon : null;
                  return (
                    <div key={i} className="w-14 h-14 rounded-xl border-2 border-white/10 bg-white/5 flex items-center justify-center">
                      {Icon && <Icon className="w-6 h-6 text-primary" />}
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {COMBO_ICONS.map(({id, icon: Icon}) => (
                  <button 
                    key={id} 
                    onClick={() => toggleCombo(id)}
                    className={`p-3 rounded-xl border flex items-center justify-center transition-colors ${selectedCombo.includes(id) ? 'bg-primary/20 border-primary' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                  >
                    <Icon className={`w-6 h-6 ${selectedCombo.includes(id) ? 'text-primary' : 'text-white'}`} />
                  </button>
                ))}
              </div>
              <button 
                onClick={checkCombo} 
                disabled={selectedCombo.length !== 3}
                className="w-full bg-primary text-black font-bold py-3 rounded-lg disabled:opacity-50"
              >
                Check Combo
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Airdrop Banner */}
      <section>
        <div className="bg-gradient-to-r from-primary/20 to-transparent border border-primary/40 rounded-xl p-4 relative overflow-hidden shadow-[0_0_20px_rgba(245,197,24,0.1)]">
          <div className="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-primary/10 to-transparent pointer-events-none" />
          <div className="flex items-center gap-3 mb-2">
            <Gift className="w-6 h-6 text-primary animate-bounce" />
            <h2 className="text-lg font-bold text-white">VaultX Airdrop</h2>
          </div>
          <p className="text-xs text-primary/80 mb-4">Accumulate more points before the snapshot!</p>
          <div className="flex gap-2">
            {[
              { l: 'Days', v: airdropTime.d },
              { l: 'Hours', v: airdropTime.h },
              { l: 'Mins', v: airdropTime.m },
              { l: 'Secs', v: airdropTime.s }
            ].map((t,i) => (
              <div key={i} className="flex-1 bg-black/40 border border-primary/20 rounded-lg p-2 flex flex-col items-center">
                <span className="text-xl font-bold text-white tabular-nums">{t.v.toString().padStart(2, '0')}</span>
                <span className="text-[10px] text-primary uppercase">{t.l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

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
