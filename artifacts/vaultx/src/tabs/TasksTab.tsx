import React, { useState, useEffect } from 'react';
import { useVault } from '../context/VaultContext';
import { AchievementsSection } from '../components/AchievementsSection';
import { EngagementHub } from '../components/EngagementHub';
import { useToast } from '@/hooks/use-toast';
import { Check, Lock, Loader2, PlayCircle, ExternalLink, Cpu, Flame, Globe, Leaf, Star, Gem, Gift, Radio, Disc3, Zap, Crown, Sparkles, Award, Palette } from 'lucide-react';
import { getPublicConfig, claimAdsgramReward, claimMonetagReward, createStarsInvoice, getStarProducts, getAds, startAd, claimAd, getPartnerTasks, verifyPartnerTask, type PublicConfig, type SponsoredAdTask, type StarProduct, type PartnerTask } from '../lib/gameApi';
import { watchRewardedAdWithFallback } from '../lib/adFallback';
import { getTelegramWebApp } from '../lib/telegram';

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

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3">
    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/70">{children}</span>
    <div className="flex-1 h-px bg-gradient-to-r from-primary/20 to-transparent" />
  </div>
);

export const TasksTab = () => {
  const { userId, setTempMiningPoints, addLifetimePoints, refreshFromServer, lifetimePoints, miningLevel, profitPerHour, totalReferrals, isPremium, selectedExchange, farmStartTime, farmState, claimedAchievements, addClaimedAchievement } = useVault();
  const { toast } = useToast();

  const [claimedTasks, setClaimedTasks] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('claimedTasks') || '[]'); } catch { return []; }
  });

  const [taskStates, setTaskStates] = useState<Record<string, 'idle' | 'loading' | 'verify'>>({});
  const [showSurveyModal, setShowSurveyModal] = useState(false);

  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [adLoading, setAdLoading] = useState(false);
  const [bannerAdLoading, setBannerAdLoading] = useState(false);
  const [monetagLoading, setMonetagLoading] = useState(false);
  const [purchasingProduct, setPurchasingProduct] = useState<number | null>(null);
  const [starProducts, setStarProducts] = useState<StarProduct[]>([]);
  const [confirmProduct, setConfirmProduct] = useState<StarProduct | null>(null);

  const [sponsoredAds, setSponsoredAds] = useState<SponsoredAdTask[]>([]);
  const [claimingAdId, setClaimingAdId] = useState<number | null>(null);
  const [adRemainingSeconds, setAdRemainingSeconds] = useState<Record<number, number>>({});

  const loadAds = () => {
    getAds().then(setSponsoredAds).catch(() => setSponsoredAds([]));
  };

  const [partnerTasks, setPartnerTasks] = useState<PartnerTask[]>([]);
  const [partnerTaskStates, setPartnerTaskStates] = useState<Record<number, 'idle' | 'loading' | 'verify' | 'verifying' | 'done'>>({});

  const loadPartnerTasks = () => {
    getPartnerTasks().then(r => setPartnerTasks(r.tasks)).catch(() => setPartnerTasks([]));
  };

  useEffect(() => {
    getPublicConfig().then(setConfig).catch(() => setConfig(null));
    getStarProducts().then(setStarProducts).catch(() => setStarProducts([]));
    loadAds();
    loadPartnerTasks();
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
    const hasAny = (config?.adsgram.enabled && config.adsgram.blockId) ||
                   (config?.monetag.enabled && config.monetag.zoneId);
    if (!hasAny || adLoading) return;
    setAdLoading(true);
    try {
      const provider = await watchRewardedAdWithFallback(config);
      const result = provider === 'adsgram' ? await claimAdsgramReward() : await claimMonetagReward();
      addLifetimePoints(result.creditedPoints);
      toast({ title: 'Ad Watched!', description: `+${result.creditedPoints.toLocaleString()} points` });
    } catch (err) {
      toast({ title: 'Ad not completed', description: err instanceof Error ? err.message : 'Try again later', variant: 'destructive' });
    } finally {
      setAdLoading(false);
    }
  };

  const handleWatchBannerAd = async () => {
    if (!config?.adsgram.enabled || !config.adsgram.bannerBlockId || bannerAdLoading) return;
    setBannerAdLoading(true);
    try {
      const { showAdsgramRewardedAd } = await import('../lib/adsgram');
      await showAdsgramRewardedAd(config.adsgram.bannerBlockId);
      const result = await claimAdsgramReward();
      addLifetimePoints(result.creditedPoints);
      toast({ title: 'Ad Watched!', description: `+${result.creditedPoints.toLocaleString()} points` });
    } catch (err) {
      toast({ title: 'Ad not completed', description: err instanceof Error ? err.message : 'Try again later', variant: 'destructive' });
    } finally {
      setBannerAdLoading(false);
    }
  };

  const handleWatchMonetagAd = async () => {
    if (!config?.monetag.enabled || !config.monetag.zoneId || monetagLoading) return;
    setMonetagLoading(true);
    try {
      const { showMonetagRewardedAd } = await import('../lib/monetag');
      await showMonetagRewardedAd(config.monetag.zoneId);
      const result = await claimMonetagReward();
      addLifetimePoints(result.creditedPoints);
      toast({ title: 'Ad Watched!', description: `+${result.creditedPoints.toLocaleString()} points` });
    } catch (err) {
      toast({ title: 'Ad not completed', description: err instanceof Error ? err.message : 'Try again later', variant: 'destructive' });
    } finally {
      setMonetagLoading(false);
    }
  };

  const openOfferwall = (offer: PublicConfig['offerwalls'][number]) => {
    if (!offer.enabled || !offer.url) return;
    const idParam = offer.id === 'cpxresearch' ? 'ext_user_id' : 'sub1';
    const url = offer.url.includes('?') ? `${offer.url}&${idParam}=${userId}` : `${offer.url}?${idParam}=${userId}`;
    window.open(url, '_blank');
  };

  const handleBuyWithStars = (productId: number) => {
    if (purchasingProduct) return;
    const product = starProducts.find(p => p.id === productId);
    if (!product) return;
    setConfirmProduct(product);
  };

  const handleConfirmPurchase = async () => {
    if (!confirmProduct || purchasingProduct) return;
    const product = confirmProduct;
    setConfirmProduct(null);
    setPurchasingProduct(product.id);
    try {
      const { invoiceUrl } = await createStarsInvoice(product.id);
      const webApp = getTelegramWebApp();
      if (webApp?.openInvoice) {
        webApp.openInvoice(invoiceUrl, (status) => {
          if (status === 'paid') {
            toast({ title: 'Purchase complete!', description: 'Thank you — your purchase was applied.' });
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
    const color = s === 10000
      ? 'hsl(152, 76%, 45%)'
      : i % 2 === 0
        ? 'hsl(224, 45%, 11%)'
        : 'hsl(224, 40%, 8%)';
    return `${color} ${start}deg ${end}deg`;
  }).join(', ');
  
  // Airdrop State
  const [airdropTime, setAirdropTime] = useState({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    localStorage.setItem('claimedTasks', JSON.stringify(claimedTasks));
  }, [claimedTasks]);

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

  const handlePartnerTaskAction = async (task: PartnerTask) => {
    const state = partnerTaskStates[task.id] || (task.completed ? 'done' : 'idle');
    if (state === 'done') return;

    if (state === 'idle') {
      window.open(task.channelUrl, '_blank');
      setPartnerTaskStates(prev => ({ ...prev, [task.id]: 'loading' }));
      setTimeout(() => {
        setPartnerTaskStates(prev => ({ ...prev, [task.id]: 'verify' }));
      }, 2000);
      return;
    }

    if (state === 'verify') {
      setPartnerTaskStates(prev => ({ ...prev, [task.id]: 'verifying' }));
      try {
        const result = await verifyPartnerTask(task.id);
        if (result.ok) {
          setPartnerTaskStates(prev => ({ ...prev, [task.id]: 'done' }));
          setPartnerTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: true } : t));
          if (!result.alreadyClaimed && result.creditedPoints > 0) {
            setTempMiningPoints(prev => prev + result.creditedPoints);
            addLifetimePoints(result.creditedPoints);
            toast({ title: "Task Complete! ✅", description: `+${result.creditedPoints.toLocaleString()} points added.` });
          } else {
            toast({ title: "Already Claimed", description: "You already completed this task." });
          }
          refreshFromServer();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Verification failed";
        if (msg.includes("not_joined")) {
          toast({ title: "Not Joined Yet", description: "Please join the channel first, then tap Verify.", variant: "destructive" });
          setPartnerTaskStates(prev => ({ ...prev, [task.id]: 'verify' }));
        } else {
          toast({ title: "Error", description: msg, variant: "destructive" });
          setPartnerTaskStates(prev => ({ ...prev, [task.id]: 'verify' }));
        }
      }
    }
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

  const dailyGames = [
    { label: 'Daily Cipher', done: cipherSolved, reward: 30000 },
    { label: 'Daily Combo', done: comboResult !== 'none', reward: 50000 },
    { label: 'Daily Spin', done: spinHasSpun, reward: 10000 },
  ];
  const dailyDone = dailyGames.filter(g => g.done).length;
  const dailyRemaining = dailyGames.reduce((sum, g) => sum + (g.done ? 0 : g.reward), 0);
  const dailyPct = Math.round((dailyDone / dailyGames.length) * 100);

  return (
    <div className="flex flex-col space-y-8 px-4 pt-6 pb-24 animate-in fade-in duration-500">

      {/* Daily Rewards progress summary — at-a-glance clarity for today's challenges */}
      <section>
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, rgba(52,211,153,0.08), rgba(52,211,153,0.02))', border: '1px solid rgba(52,211,153,0.15)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-white">Daily Rewards</h2>
            </div>
            <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20 tabular-nums">{dailyDone}/{dailyGames.length}</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden mb-3">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${dailyPct}%`, background: 'linear-gradient(90deg, hsl(152,76%,42%), hsl(152,76%,55%))' }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {dailyDone === dailyGames.length
              ? '🎉 All daily rewards claimed — come back tomorrow!'
              : `${dailyGames.length - dailyDone} left today · earn up to ${dailyRemaining.toLocaleString()} pts below`}
          </p>
        </div>
      </section>

      <EngagementHub />

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
        <div className="rounded-[28px] p-6 flex flex-col items-center overflow-hidden relative" style={{
          background: 'linear-gradient(135deg, rgba(52,211,153,0.06) 0%, rgba(52,211,153,0.02) 60%, transparent 100%)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          border: '1px solid rgba(52,211,153,0.1)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 32px 64px rgba(0,0,0,0.4)',
        }}>
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-[60px] -mr-10 -mt-10 pointer-events-none" />

          <div className="relative w-52 h-52 mb-7">
            {/* Ambient glow behind wheel */}
            <div className="absolute inset-0 rounded-full" style={{
              background: 'radial-gradient(circle, rgba(52,211,153,0.18) 0%, transparent 70%)',
              filter: 'blur(14px)',
              animation: isSpinning ? 'vaultPulse 1.5s ease-in-out infinite' : 'none',
            }} />

            {/* Outer bezel ring */}
            <div className="absolute inset-0 rounded-full" style={{
              background: 'conic-gradient(from 0deg, rgba(52,211,153,0.4), rgba(52,211,153,0.05), rgba(52,211,153,0.4), rgba(52,211,153,0.05), rgba(52,211,153,0.4))',
              padding: '3px',
              boxShadow: '0 0 30px rgba(52,211,153,0.15), inset 0 0 20px rgba(0,0,0,0.5)',
            }}>
              {/* Wheel */}
              <div
                className="w-full h-full rounded-full transition-transform ease-[cubic-bezier(0.1,0.7,0.1,1)] relative"
                style={{
                  background: `conic-gradient(${spinWheelGradient})`,
                  transform: `rotate(${spinRotation}deg)`,
                  transitionDuration: isSpinning ? '3s' : '0s',
                  boxShadow: 'inset 0 0 24px rgba(0,0,0,0.6)',
                }}
              >
                {/* Segment divider lines */}
                {SPIN_SEGMENTS.map((_, i) => {
                  const angle = (i * 360) / SPIN_SEGMENTS.length;
                  return (
                    <div
                      key={`line-${i}`}
                      className="absolute top-1/2 left-1/2 origin-left"
                      style={{
                        width: '50%',
                        height: '1px',
                        background: 'rgba(52,211,153,0.12)',
                        transform: `rotate(${angle}deg)`,
                      }}
                    />
                  );
                })}
                {SPIN_SEGMENTS.map((reward, i) => {
                  const rotation = (i * 360) / SPIN_SEGMENTS.length + (180 / SPIN_SEGMENTS.length);
                  const isJackpot = reward === 10000;
                  return (
                    <div
                      key={i}
                      className="absolute w-full h-full flex justify-center items-start pt-3 font-black text-xs"
                      style={{ transform: `rotate(${rotation}deg)` }}
                    >
                      <span
                        className={`origin-bottom tabular-nums ${isJackpot ? 'text-white' : 'text-primary/80'}`}
                        style={isJackpot ? { textShadow: '0 0 8px rgba(255,255,255,0.6)' } : undefined}
                      >
                        {reward >= 1000 ? `${reward / 1000}k` : reward}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pointer (top) */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-5 h-7 z-20" style={{
              background: 'linear-gradient(180deg, hsl(152,76%,60%) 0%, hsl(152,76%,40%) 100%)',
              clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
              filter: 'drop-shadow(0 2px 6px rgba(52,211,153,0.6))',
            }} />

            {/* Center hub */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full flex items-center justify-center z-10" style={{
              background: 'radial-gradient(circle at 35% 25%, rgba(52,211,153,0.25) 0%, hsl(224,50%,8%) 70%)',
              border: '1px solid rgba(52,211,153,0.25)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 0 20px rgba(52,211,153,0.25), 0 4px 12px rgba(0,0,0,0.5)',
            }}>
              <Disc3 className={`w-6 h-6 text-primary ${isSpinning ? 'animate-spin' : ''}`} style={{ filter: 'drop-shadow(0 0 6px rgba(52,211,153,0.6))' }} />
            </div>
          </div>

          <button
            data-testid="button-spin-wheel"
            onClick={handleSpin}
            disabled={spinHasSpun || isSpinning}
            className="w-full font-bold py-3.5 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed relative overflow-hidden"
            style={spinHasSpun || isSpinning ? {
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.08)',
            } : {
              background: 'linear-gradient(135deg, hsl(152,76%,50%) 0%, hsl(152,76%,42%) 100%)',
              color: 'hsl(224,71%,4%)',
              boxShadow: '0 0 24px rgba(52,211,153,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
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

      <SectionLabel>Earn Points</SectionLabel>

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
        {config?.monetag.enabled && (
          <div className="bg-card border border-white/5 rounded-xl p-4 flex items-center justify-between mt-3">
            <div className="flex-1 pr-4">
              <h3 className="font-semibold text-white text-sm mb-1">Watch another rewarded ad</h3>
              <p className="text-xs font-medium text-primary">
                +{config.monetag.rewardPoints.toLocaleString()} pts per ad
              </p>
            </div>
            <button
              data-testid="button-watch-monetag-ad"
              onClick={handleWatchMonetagAd}
              disabled={!config?.monetag.enabled || monetagLoading}
              className="min-w-[100px] h-9 bg-primary text-black text-xs font-bold rounded-lg flex items-center justify-center disabled:opacity-40 disabled:bg-white/10 disabled:text-white/50 transition-colors"
            >
              {monetagLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Watch Ad'}
            </button>
          </div>
        )}
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
        const activeOffers = (config?.offerwalls ?? []).filter((offer) => offer.enabled && offer.id !== 'adgem');
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

      <SectionLabel>Store &amp; Partners</SectionLabel>

      {/* Telegram Stars Store */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
            background: 'linear-gradient(145deg, rgba(52,211,153,0.2) 0%, rgba(52,211,153,0.06) 100%)',
            border: '1px solid rgba(52,211,153,0.2)',
            boxShadow: '0 0 16px rgba(52,211,153,0.15)',
          }}>
            <Star className="w-4 h-4 text-primary" style={{ filter: 'drop-shadow(0 0 4px rgba(52,211,153,0.6))' }} />
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-white leading-none">Store</h2>
            <span className="text-[10px] text-primary/60 font-semibold uppercase tracking-wider mt-0.5">Telegram Stars</span>
          </div>
        </div>
        {!config?.stars.enabled ? (
          <div className="rounded-2xl p-5 text-center text-xs text-muted-foreground" style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>Not activated yet</div>
        ) : starProducts.length === 0 ? (
          <div className="rounded-2xl p-5 text-center text-xs text-muted-foreground" style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>No items available right now</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {starProducts.map((product) => {
              const Icon = product.effectType === 'premium_days' ? Crown : product.effectType === 'turbo_boost' ? Flame : product.effectType === 'energy_refill' ? Zap : product.effectType === 'permanent_multiplier' ? Sparkles : product.effectType === 'badge' ? Award : product.effectType === 'skin' ? Palette : Gem;
              const isPremium = product.effectType === 'premium_days';
              return (
                <div
                  key={product.id}
                  className="rounded-2xl p-4 flex flex-col items-center text-center relative overflow-hidden"
                  style={isPremium ? {
                    background: 'linear-gradient(160deg, rgba(52,211,153,0.12) 0%, rgba(52,211,153,0.03) 100%)',
                    border: '1px solid rgba(52,211,153,0.25)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.25)',
                  } : {
                    background: 'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.2)',
                  }}
                >
                  {isPremium && (
                    <span className="absolute top-2 right-2 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md" style={{
                      background: 'rgba(52,211,153,0.15)', color: 'hsl(152,76%,55%)', border: '1px solid rgba(52,211,153,0.25)',
                    }}>VIP</span>
                  )}
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 relative" style={{
                    background: 'radial-gradient(circle at 35% 25%, rgba(52,211,153,0.2) 0%, rgba(52,211,153,0.04) 100%)',
                    border: '1px solid rgba(52,211,153,0.15)',
                    boxShadow: '0 0 16px rgba(52,211,153,0.1)',
                  }}>
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.title} className="w-9 h-9 rounded-xl object-cover" />
                    ) : (
                      <Icon className="w-6 h-6 text-primary" style={{ filter: 'drop-shadow(0 0 6px rgba(52,211,153,0.5))' }} />
                    )}
                  </div>
                  <h3 className="font-bold text-white text-sm leading-tight mb-1 line-clamp-1">{product.title}</h3>
                  {product.description && (
                    <p className="text-[10px] text-muted-foreground leading-tight mb-2 line-clamp-2 min-h-[24px]">{product.description}</p>
                  )}
                  <div className="flex items-center gap-1 mb-3 mt-auto">
                    <span className="text-sm font-black text-white tabular-nums">{product.priceStars.toLocaleString()}</span>
                    <span className="text-sm">⭐</span>
                  </div>
                  <button
                    onClick={() => handleBuyWithStars(product.id)}
                    disabled={purchasingProduct === product.id}
                    className="w-full h-9 text-xs font-bold rounded-xl flex items-center justify-center transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={isPremium ? {
                      background: 'linear-gradient(135deg, hsl(152,76%,50%) 0%, hsl(152,76%,42%) 100%)',
                      color: 'hsl(224,71%,4%)',
                      boxShadow: '0 0 16px rgba(52,211,153,0.3), inset 0 1px 0 rgba(255,255,255,0.25)',
                    } : {
                      background: 'rgba(52,211,153,0.1)',
                      color: 'hsl(152,76%,55%)',
                      border: '1px solid rgba(52,211,153,0.2)',
                    }}
                  >
                    {purchasingProduct === product.id ? <Loader2 className="w-4 h-4 animate-spin" /> : isPremium ? 'Subscribe' : 'Buy'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Partner Tasks */}
      {partnerTasks.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-white mb-4">Partner Tasks</h2>
          <div className="space-y-3">
            {partnerTasks.map(task => {
              const localState = partnerTaskStates[task.id];
              const isDone = localState === 'done' || (localState === undefined && task.completed);
              const isLoading = localState === 'loading';
              const isVerify = localState === 'verify';
              const isVerifying = localState === 'verifying';

              return (
                <div key={task.id} className="bg-card border border-white/5 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)' }}>
                    {task.iconEmoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-sm leading-snug">{task.title}</h3>
                    {task.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>}
                    <p className="text-xs font-bold text-primary mt-0.5">+{task.rewardPoints.toLocaleString()} pts</p>
                  </div>

                  {isDone ? (
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <Check className="w-5 h-5 text-emerald-500" />
                    </div>
                  ) : (
                    <button
                      data-testid={`button-partner-task-${task.id}`}
                      onClick={() => handlePartnerTaskAction(task)}
                      disabled={isLoading || isVerifying}
                      className="min-w-[80px] h-9 text-xs font-bold rounded-lg flex items-center justify-center transition-all shrink-0"
                      style={isVerify ? {
                        background: 'hsl(152,76%,55%)',
                        color: 'hsl(224,71%,4%)',
                        boxShadow: '0 0 12px rgba(52,211,153,0.3)',
                      } : {
                        background: 'rgba(255,255,255,0.1)',
                        color: 'white',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isVerifying && <Loader2 className="w-4 h-4 animate-spin" />}
                      {!isLoading && !isVerifying && (isVerify ? 'Verify ✓' : 'Join')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Stars Purchase Confirmation Modal */}
      {confirmProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, hsl(224,71%,8%) 0%, hsl(224,71%,4%) 100%)',
              border: '1px solid rgba(52,211,153,0.2)',
              boxShadow: '0 -8px 40px rgba(52,211,153,0.08)',
            }}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-white/5">
              <div className="flex items-center gap-3 mb-1">
                {confirmProduct.imageUrl ? (
                  <img src={confirmProduct.imageUrl} alt={confirmProduct.title} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
                    <Star className="w-6 h-6 text-primary" />
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-white text-base leading-tight">{confirmProduct.title}</h3>
                  {confirmProduct.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{confirmProduct.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-3">
                <span className="text-2xl font-black text-white tabular-nums">{confirmProduct.priceStars.toLocaleString()}</span>
                <span className="text-xl">⭐</span>
                <span className="text-sm text-muted-foreground ml-1">Telegram Stars</span>
              </div>
            </div>

            {/* Benefits */}
            {confirmProduct.benefitsBullets && (
              <div className="px-6 py-4 border-b border-white/5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">What you get</p>
                <ul className="flex flex-col gap-2">
                  {confirmProduct.benefitsBullets.split('\n').filter(Boolean).map((bullet, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-white/90 leading-snug">
                      <span className="text-primary flex-shrink-0 mt-px">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="px-6 py-4 flex flex-col gap-2">
              <button
                onClick={handleConfirmPurchase}
                disabled={!!purchasingProduct}
                className="w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, hsl(152,76%,50%) 0%, hsl(152,76%,42%) 100%)',
                  color: 'hsl(224,71%,4%)',
                  boxShadow: '0 0 20px rgba(52,211,153,0.3)',
                }}
              >
                {purchasingProduct ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Confirm &amp; Pay ⭐ {confirmProduct.priceStars.toLocaleString()}</>}
              </button>
              <button
                onClick={() => setConfirmProduct(null)}
                className="w-full h-10 rounded-xl text-sm font-medium text-muted-foreground hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── Achievements ── */}
      <div className="px-4 pb-32">
        <AchievementsSection
          state={{
            lifetimePoints,
            miningLevel,
            profitPerHour,
            referralCount: totalReferrals,
            isPremium,
            selectedExchange,
            farmStartTime,
            farmState,
            claimedAchievements,
          }}
          addLifetimePoints={addLifetimePoints}
          onClaimed={addClaimedAchievement}
        />
      </div>

    </div>
  );
};
