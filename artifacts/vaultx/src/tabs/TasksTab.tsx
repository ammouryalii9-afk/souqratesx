import React, { useState, useEffect } from 'react';
import { useVault } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { Check, Lock, Loader2, PlayCircle, ExternalLink, Cpu, Flame, Globe, Leaf, Star, Gem, Gift, Radio, Disc3, Zap, Crown, Sparkles, Award, Palette } from 'lucide-react';
import { getPublicConfig, claimAdsgramReward, createStarsInvoice, getStarProducts, getAds, startAd, claimAd, type PublicConfig, type SponsoredAdTask, type StarProduct } from '../lib/gameApi';
import { showAdsgramRewardedAd } from '../lib/adsgram';
import { getTelegramWebApp } from '../lib/telegram';

const DAILY_REWARDS = [1000, 2500, 5000, 10000, 20000, 35000, 50000];

const SPONSORED_TASKS = [
  { id: 't1', title: 'Join SouqrateX Official Channel', reward: 5000, link: 'https://t.me/SouqrateXOfficial' },
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

const MORSE_CODE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..',
  J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
  S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..'
};
const DAILY_WORDS = ['GOLD', 'MINE', 'RICH', 'KING', 'LUCK', 'BOSS', 'CASH', 'SAFE', 'COIN', 'MOON'];

const SPIN_SEGMENTS = [500, 1000, 2000, 5000, 500, 10000, 1500, 3000];

export const TasksTab = () => {
  const { userId, setTempMiningPoints, addLifetimePoints, refreshFromServer } = useVault();
  const { toast } = useToast();

  const [currentStreak, setCurrentStreak] = useState(() => Number(localStorage.getItem('currentStreak')) || 0);
  const [lastLoginDate, setLastLoginDate] = useState(() => localStorage.getItem('lastLoginDate') || '');
  const [claimedTasks, setClaimedTasks] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('claimedTasks') || '[]'); } catch { return []; }
  });

  const [taskStates, setTaskStates] = useState<Record<string, 'idle' | 'loading' | 'verify'>>({});
  const [showSurveyModal, setShowSurveyModal] = useState(false);

  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [adLoading, setAdLoading] = useState(false);
  const [purchasingProduct, setPurchasingProduct] = useState<number | null>(null);
  const [starProducts, setStarProducts] = useState<StarProduct[]>([]);

  const [sponsoredAds, setSponsoredAds] = useState<SponsoredAdTask[]>([]);
  const [claimingAdId, setClaimingAdId] = useState<number | null>(null);
  const [adRemainingSeconds, setAdRemainingSeconds] = useState<Record<number, number>>({});

  const loadAds = () => {
    getAds().then(setSponsoredAds).catch(() => setSponsoredAds([]));
  };

  useEffect(() => {
    getPublicConfig().then(setConfig).catch(() => setConfig(null));
    getStarProducts().then(setStarProducts).catch(() => setStarProducts([]));
    loadAds();
  }, []);

  // Server is the source of truth for whether the watch condition is satisfied;
  // this local countdown (seeded from the server's startedAt/minWatchSeconds)
  // only drives the button's disabled state so the user sees progress.
  useEffect(() => {
    const inProgress = sponsoredAds.filter(a => a.startedAt && !a.claimed);
    if (inProgress.length === 0) return;

    const tick = () => {
      setAdRemainingSeconds(() => {
        const next: Record<number, number> = {};
        for (const ad of inProgress) {
          const elapsed = (Date.now() - new Date(ad.startedAt as string).getTime()) / 1000;
          next[ad.id] = Math.max(0, Math.ceil(ad.minWatchSeconds - elapsed));
        }
        return next;
      });
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [sponsoredAds]);

  const handleAdAction = async (ad: SponsoredAdTask) => {
    if (ad.claimed || claimingAdId) return;

    const remaining = adRemainingSeconds[ad.id];
    const canClaim = ad.startedAt && (remaining === undefined ? false : remaining <= 0);

    if (!ad.startedAt) {
      try {
        const { startedAt, minWatchSeconds } = await startAd(ad.id);
        window.open(ad.linkUrl, '_blank');
        setSponsoredAds(prev => prev.map(a => a.id === ad.id ? { ...a, startedAt, minWatchSeconds } : a));
      } catch (err) {
        toast({ title: 'Could not open ad', description: err instanceof Error ? err.message : 'Try again later', variant: 'destructive' });
      }
      return;
    }

    if (!canClaim) return;

    setClaimingAdId(ad.id);
    try {
      const result = await claimAd(ad.id);
      setTempMiningPoints(prev => prev + result.creditedPoints);
      addLifetimePoints(result.creditedPoints);
      setSponsoredAds(prev => prev.map(a => a.id === ad.id ? { ...a, claimed: true } : a));
      toast({ title: 'Reward Claimed!', description: `+${result.creditedPoints.toLocaleString()} points` });
    } catch (err) {
      toast({ title: 'Could not claim reward', description: err instanceof Error ? err.message : 'Try again later', variant: 'destructive' });
    } finally {
      setClaimingAdId(null);
    }
  };

  const handleWatchAd = async () => {
    if (!config?.adsgram.enabled || !config.adsgram.blockId || adLoading) return;
    setAdLoading(true);
    try {
      await showAdsgramRewardedAd(config.adsgram.blockId);
      const result = await claimAdsgramReward();
      setTempMiningPoints(prev => prev + result.creditedPoints);
      addLifetimePoints(result.creditedPoints);
      toast({ title: 'Ad Watched!', description: `+${result.creditedPoints.toLocaleString()} points` });
    } catch (err) {
      toast({ title: 'Ad not completed', description: err instanceof Error ? err.message : 'Try again later', variant: 'destructive' });
    } finally {
      setAdLoading(false);
    }
  };

  const openOfferwall = (offer: PublicConfig['offerwalls'][number]) => {
    if (!offer.enabled || !offer.url) return;
    const url = offer.url.includes('?') ? `${offer.url}&sub1=${userId}` : `${offer.url}?sub1=${userId}`;
    window.open(url, '_blank');
  };

  const handleBuyWithStars = async (productId: number) => {
    if (purchasingProduct) return;
    setPurchasingProduct(productId);
    try {
      const { invoiceUrl } = await createStarsInvoice(productId);
      const webApp = getTelegramWebApp();
      if (webApp?.openInvoice) {
        webApp.openInvoice(invoiceUrl, (status) => {
          if (status === 'paid') {
            toast({ title: 'Purchase complete!', description: 'Thank you — your purchase was applied.' });
            // The webhook applies the purchase server-side; give it a moment to
            // land, then pull fresh state so the effect (energy/boost) shows up
            // immediately instead of waiting for the next autosync.
            setTimeout(() => {
              refreshFromServer();
            }, 1500);
          } else if (status === 'failed') {
            toast({ title: 'Payment failed', variant: 'destructive' });
          }
        });
      } else {
        window.open(invoiceUrl, '_blank');
      }
    } catch (err) {
      toast({ title: 'Could not start purchase', description: err instanceof Error ? err.message : 'Try again later', variant: 'destructive' });
    } finally {
      setPurchasingProduct(null);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  
  // Daily Cipher State
  const dayOfYear = (() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  })();
  const dailyWord = DAILY_WORDS[dayOfYear % DAILY_WORDS.length];
  const morseCode = dailyWord.split('').map(char => MORSE_CODE[char]).join(' ');

  const [cipherGuess, setCipherGuess] = useState('');
  const [cipherSolved, setCipherSolved] = useState(() => {
    return localStorage.getItem('dailyCipherDate') === todayStr 
      ? localStorage.getItem('dailyCipherSolved') === 'true'
      : false;
  });
  const [cipherError, setCipherError] = useState(false);
  const [showCipherHint, setShowCipherHint] = useState(false);

  useEffect(() => {
    if (cipherSolved) return;
    const timer = setTimeout(() => {
      setShowCipherHint(true);
    }, 10000);
    return () => clearTimeout(timer);
  }, [cipherSolved]);

  const handleCipherSubmit = () => {
    if (cipherGuess.toUpperCase() === dailyWord) {
      setTempMiningPoints(prev => prev + 30000);
      addLifetimePoints(30000);
      setCipherSolved(true);
      localStorage.setItem('dailyCipherDate', todayStr);
      localStorage.setItem('dailyCipherSolved', 'true');
      toast({ title: "Cipher Solved!", description: "+30,000 pts" });
      setCipherError(false);
    } else {
      setCipherError(true);
      setTimeout(() => setCipherError(false), 500);
      toast({ title: "Wrong Guess", description: "Try again!", variant: "destructive" });
    }
  };

  // Daily Combo State
  const [comboResult, setComboResult] = useState<'none' | 'success' | 'failed'>(() => {
    const savedDate = localStorage.getItem('dailyComboDate');
    return savedDate === todayStr ? (localStorage.getItem('dailyComboResult') as any) || 'none' : 'none';
  });
  const [selectedCombo, setSelectedCombo] = useState<string[]>([]);
  const targetCombo = ['star', 'globe', 'gem'];
  
  // Spin Wheel State
  const [spinHasSpun, setSpinHasSpun] = useState(() => localStorage.getItem('lastSpinDate') === todayStr);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinRotation, setSpinRotation] = useState(0);

  const handleSpin = () => {
    if (spinHasSpun || isSpinning) return;
    setIsSpinning(true);
    
    const segmentIndex = Math.floor(Math.random() * SPIN_SEGMENTS.length);
    const reward = SPIN_SEGMENTS[segmentIndex];
    
    const segmentAngle = 360 / SPIN_SEGMENTS.length;
    const centerAngle = (segmentIndex + 0.5) * segmentAngle;
    const targetRotation = spinRotation + (360 * 5) + (360 - centerAngle); 

    setSpinRotation(targetRotation);

    setTimeout(() => {
      setTempMiningPoints(prev => prev + reward);
      addLifetimePoints(reward);
      setSpinHasSpun(true);
      localStorage.setItem('lastSpinDate', todayStr);
      setIsSpinning(false);
      toast({ title: "Spin Complete!", description: `You won ${reward} points!` });
    }, 3000);
  };

  const spinWheelGradient = SPIN_SEGMENTS.map((s, i) => {
    const start = (i * 360) / SPIN_SEGMENTS.length;
    const end = ((i + 1) * 360) / SPIN_SEGMENTS.length;
    const color = s === 10000 ? '#f5c518' : i % 2 === 0 ? '#1f1f1f' : '#2a2a2a';
    return `${color} ${start}deg ${end}deg`;
  }).join(', ');
  
  // Airdrop State
  const [airdropTime, setAirdropTime] = useState({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    localStorage.setItem('currentStreak', currentStreak.toString());
    localStorage.setItem('lastLoginDate', lastLoginDate);
    localStorage.setItem('claimedTasks', JSON.stringify(claimedTasks));
  }, [currentStreak, lastLoginDate, claimedTasks]);

  useEffect(() => {
    const target = new Date('2026-10-01T00:00:00Z').getTime();
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
      
      {/* Daily Cipher */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-white">Daily Cipher</h2>
          </div>
          <span className="text-xs text-primary font-bold bg-primary/10 px-2 py-1 rounded-full border border-primary/20">+30,000 pts</span>
        </div>
        <div className={`bg-card border ${cipherError ? 'border-red-500/50 translate-x-1' : 'border-white/5'} rounded-xl p-4 transition-all duration-100`}>
          {cipherSolved ? (
            <div className="text-center py-4 text-emerald-400 font-bold flex flex-col items-center gap-2">
              <Check className="w-8 h-8" />
              Cipher Solved! +30,000 pts
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <div className="text-2xl tracking-widest font-mono text-primary font-bold">{morseCode}</div>
                <div className="text-xs text-muted-foreground mt-2">Decode the morse code!</div>
              </div>
              <input
                type="text"
                data-testid="input-cipher-guess"
                value={cipherGuess}
                onChange={(e) => setCipherGuess(e.target.value.toUpperCase())}
                maxLength={dailyWord.length}
                placeholder={`${dailyWord.length}-letter word`}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-center text-xl font-bold text-white tracking-widest focus:outline-none focus:border-primary uppercase"
              />
              <div className="flex gap-2">
                {showCipherHint && (
                  <button 
                    onClick={() => setCipherGuess(dailyWord[0])}
                    className="flex-1 bg-white/10 text-white font-bold py-3 rounded-lg"
                  >
                    Reveal Hint
                  </button>
                )}
                <button 
                  data-testid="button-cipher-submit"
                  onClick={handleCipherSubmit} 
                  disabled={cipherGuess.length !== dailyWord.length}
                  className="flex-[2] bg-primary text-black font-bold py-3 rounded-lg disabled:opacity-50"
                >
                  Submit
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

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

      {/* Daily Spin Wheel */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Disc3 className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-white">Daily Spin</h2>
        </div>
        <div className="bg-card border border-white/5 rounded-xl p-6 flex flex-col items-center overflow-hidden">
          <div className="relative w-48 h-48 mb-6">
            {/* Wheel */}
            <div 
              className="w-full h-full rounded-full border-4 border-white/10 shadow-2xl transition-transform ease-[cubic-bezier(0.1,0.7,0.1,1)]"
              style={{
                background: `conic-gradient(${spinWheelGradient})`,
                transform: `rotate(${spinRotation}deg)`,
                transitionDuration: isSpinning ? '3s' : '0s'
              }}
            >
              {SPIN_SEGMENTS.map((reward, i) => {
                const rotation = (i * 360) / SPIN_SEGMENTS.length + (180 / SPIN_SEGMENTS.length);
                return (
                  <div 
                    key={i}
                    className="absolute w-full h-full flex justify-center items-start pt-2 font-bold text-xs"
                    style={{ transform: `rotate(${rotation}deg)` }}
                  >
                    <span className={`origin-bottom ${reward === 10000 ? 'text-black' : 'text-white/80'}`}>
                      {reward >= 1000 ? `${reward/1000}k` : reward}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Center Pin / Pointer */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 w-4 h-6 bg-primary" style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }}></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-black rounded-full border-2 border-white/20"></div>
          </div>
          
          <button 
            data-testid="button-spin-wheel"
            onClick={handleSpin}
            disabled={spinHasSpun || isSpinning}
            className="w-full bg-primary text-black font-bold py-3 rounded-lg disabled:opacity-50 disabled:bg-white/10 disabled:text-white/50 transition-colors"
          >
            {isSpinning ? 'Spinning...' : spinHasSpun ? 'Come back tomorrow' : 'Spin Wheel'}
          </button>
        </div>
      </section>

      {/* Airdrop Banner */}
      <section>
        <div className="bg-gradient-to-r from-primary/20 to-transparent border border-primary/40 rounded-xl p-4 relative overflow-hidden shadow-[0_0_20px_rgba(245,197,24,0.1)]">
          <div className="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-primary/10 to-transparent pointer-events-none" />
          <div className="flex items-center gap-3 mb-2">
            <Gift className="w-6 h-6 text-primary animate-bounce" />
            <h2 className="text-lg font-bold text-white">SouqrateX Airdrop</h2>
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

      {/* Watch Ads */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <PlayCircle className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-white">Watch & Earn</h2>
        </div>
        <div className="bg-card border border-white/5 rounded-xl p-4 flex items-center justify-between">
          <div className="flex-1 pr-4">
            <h3 className="font-semibold text-white text-sm mb-1">Watch a rewarded ad</h3>
            <p className="text-xs font-medium text-primary">
              {config?.adsgram.enabled ? `+${config.adsgram.rewardPoints.toLocaleString()} pts per ad` : 'Not activated yet'}
            </p>
          </div>
          <button
            data-testid="button-watch-ad"
            onClick={handleWatchAd}
            disabled={!config?.adsgram.enabled || adLoading}
            className="min-w-[100px] h-9 bg-primary text-black text-xs font-bold rounded-lg flex items-center justify-center disabled:opacity-40 disabled:bg-white/10 disabled:text-white/50 transition-colors"
          >
            {adLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Watch Ad'}
          </button>
        </div>
      </section>

      {/* Sponsored Ads (Admin-managed) */}
      {sponsoredAds.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-white">Sponsored Offers</h2>
          </div>
          <div className="space-y-3">
            {sponsoredAds.map((ad) => {
              const isClaiming = claimingAdId === ad.id;
              const remaining = adRemainingSeconds[ad.id];
              const isWaiting = Boolean(ad.startedAt) && !ad.claimed && (remaining === undefined || remaining > 0);
              const canClaim = Boolean(ad.startedAt) && !ad.claimed && remaining !== undefined && remaining <= 0;
              return (
                <div key={ad.id} data-testid={`row-sponsored-ad-${ad.id}`} className="bg-card border border-white/5 rounded-xl p-4 flex items-center gap-3">
                  {ad.imageUrl && (
                    <img src={ad.imageUrl} alt={ad.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-sm mb-1 truncate">{ad.title}</h3>
                    {ad.description && <p className="text-xs text-muted-foreground truncate">{ad.description}</p>}
                    <p className="text-xs font-medium text-primary mt-1">+{ad.rewardPoints.toLocaleString()} pts</p>
                  </div>
                  <button
                    data-testid={`button-sponsored-ad-${ad.id}`}
                    onClick={() => handleAdAction(ad)}
                    disabled={ad.claimed || isClaiming || isWaiting}
                    className="min-w-[90px] h-9 bg-primary text-black text-xs font-bold rounded-lg flex items-center justify-center gap-1 disabled:opacity-40 disabled:bg-white/10 disabled:text-white/50 transition-colors"
                  >
                    {ad.claimed ? (
                      <><Check className="w-3.5 h-3.5" /> Done</>
                    ) : isClaiming ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : canClaim ? (
                      'Claim'
                    ) : isWaiting ? (
                      `${remaining ?? ad.minWatchSeconds}s`
                    ) : (
                      <>Open <ExternalLink className="w-3 h-3" /></>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Offerwalls / Surveys */}
      {(() => {
        const activeOffers = (config?.offerwalls ?? []).filter((offer) => offer.enabled);
        if (activeOffers.length === 0) return null;
        return (
          <section>
            <h2 className="text-xl font-bold text-white mb-4">Offers & Surveys</h2>
            <div className="space-y-3">
              {activeOffers.map((offer) => (
                <div key={offer.id} className="bg-card border border-white/5 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex-1 pr-4">
                    <h3 className="font-semibold text-white text-sm mb-1">{offer.name}</h3>
                    <p className="text-xs font-medium text-muted-foreground">Complete offers for points</p>
                  </div>
                  <button
                    data-testid={`button-offerwall-${offer.id}`}
                    onClick={() => openOfferwall(offer)}
                    className="min-w-[80px] h-9 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-colors"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {/* Telegram Stars Store */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Star className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-white">Store (Telegram Stars)</h2>
        </div>
        <div className="space-y-3">
          {!config?.stars.enabled ? (
            <div className="bg-card border border-white/5 rounded-xl p-4 text-center text-xs text-muted-foreground">Not activated yet</div>
          ) : starProducts.length === 0 ? (
            <div className="bg-card border border-white/5 rounded-xl p-4 text-center text-xs text-muted-foreground">No items available right now</div>
          ) : (
            starProducts.map((product) => {
              const Icon = product.effectType === 'premium_days' ? Crown : product.effectType === 'turbo_boost' ? Flame : product.effectType === 'energy_refill' ? Zap : product.effectType === 'permanent_multiplier' ? Sparkles : product.effectType === 'badge' ? Award : product.effectType === 'skin' ? Palette : Gem;
              const isPremium = product.effectType === 'premium_days';
              return (
                <div
                  key={product.id}
                  className={
                    isPremium
                      ? 'bg-card border border-primary/30 rounded-xl p-4 flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent'
                      : 'bg-card border border-white/5 rounded-xl p-4 flex items-center justify-between'
                  }
                >
                  <div className="flex items-center gap-3 flex-1 pr-4">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.title} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <Icon className="w-5 h-5 text-primary flex-shrink-0" />
                    )}
                    <div>
                      <h3 className="font-semibold text-white text-sm">{product.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {product.priceStars.toLocaleString()} ⭐{product.description ? ` · ${product.description}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleBuyWithStars(product.id)}
                    disabled={purchasingProduct === product.id}
                    className={
                      isPremium
                        ? 'min-w-[80px] h-9 bg-primary text-black text-xs font-bold rounded-lg flex items-center justify-center disabled:opacity-40 disabled:bg-white/10 disabled:text-white/50 transition-colors'
                        : 'min-w-[80px] h-9 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg flex items-center justify-center disabled:opacity-40 transition-colors'
                    }
                  >
                    {purchasingProduct === product.id ? <Loader2 className="w-4 h-4 animate-spin" /> : isPremium ? 'Subscribe' : 'Buy'}
                  </button>
                </div>
              );
            })
          )}
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
