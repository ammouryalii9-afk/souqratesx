import React, { useState, useEffect } from 'react';
import { useLanguage } from '../lib/i18n';
import { useVault } from '../context/VaultContext';
import { AchievementsSection } from '../components/AchievementsSection';
import { EngagementHub } from '../components/EngagementHub';
import { useToast } from '@/hooks/use-toast';
import { Check, Lock, Loader2, PlayCircle, ExternalLink, Cpu, Flame, Globe, Leaf, Star, Gem, Gift, Radio, Disc3, Zap, Crown, Sparkles, Award, Palette, Rocket, Trophy, Target, ShoppingBag, CheckCircle2, ChevronRight, Users, Timer } from 'lucide-react';
import { getPublicConfig, claimAdsgramReward, claimMonetagReward, claimOnclickaReward, createStarsInvoice, getStarProducts, getAds, startAd, claimAd, getPartnerTasks, verifyPartnerTask, getGroupChallenges, claimGroupChallenge, getCompetitions, joinReferralRace, getRaceLeaderboard, type PublicConfig, type SponsoredAdTask, type StarProduct, type PartnerTask, type GroupChallenge, type RaceCompetition, type RaceLeaderboardEntry } from '../lib/gameApi';
import { watchRewardedAdWithFallback } from '../lib/adFallback';
import { getTelegramWebApp, haptic } from '../lib/telegram';
import { StarsPurchaseSuccess } from '../components/StarsPurchaseSuccess';

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

const SPIN_SEGMENTS = [250, 500, 1000, 2500, 250, 5000, 750, 1500];

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3">
    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/70">{children}</span>
    <div className="flex-1 h-px bg-gradient-to-r from-primary/20 to-transparent" />
  </div>
);

export const TasksTab = () => {
  const { userId, setTempMiningPoints, addLifetimePoints, refreshFromServer, lifetimePoints, miningLevel, profitPerHour, totalReferrals, isPremium, selectedExchange, farmStartTime, farmState, claimedAchievements, addClaimedAchievement } = useVault();
  const { toast } = useToast();
  const { tr, lang } = useLanguage();

  const [claimedTasks, setClaimedTasks] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('claimedTasks') || '[]'); } catch { return []; }
  });

  const [taskStates, setTaskStates] = useState<Record<string, 'idle' | 'loading' | 'verify'>>({});
  const [showSurveyModal, setShowSurveyModal] = useState(false);

  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [adLoading, setAdLoading] = useState(false);
  const [bannerAdLoading, setBannerAdLoading] = useState(false);
  const [monetagLoading, setMonetagLoading] = useState(false);
  const [onclickaLoading, setOnclickaLoading] = useState(false);
  const [purchasingProduct, setPurchasingProduct] = useState<number | null>(null);
  const [starProducts, setStarProducts] = useState<StarProduct[]>([]);
  const [confirmProduct, setConfirmProduct] = useState<StarProduct | null>(null);
  const [successProduct, setSuccessProduct] = useState<StarProduct | null>(null);
  const [storeCategory, setStoreCategory] = useState<string>('all');

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

  const [groupChallenges, setGroupChallenges] = useState<GroupChallenge[]>([]);
  const [claimingChallengeId, setClaimingChallengeId] = useState<number | null>(null);

  const loadGroupChallenges = () => {
    getGroupChallenges().then(r => setGroupChallenges(r.challenges)).catch(() => setGroupChallenges([]));
  };

  const [raceComps, setRaceComps] = useState<RaceCompetition[]>([]);
  const [raceLeaderboards, setRaceLeaderboards] = useState<Record<number, RaceLeaderboardEntry[]>>({});
  const [joiningRaceId, setJoiningRaceId] = useState<number | null>(null);
  const [raceCountdowns, setRaceCountdowns] = useState<Record<number, string>>({});

  const loadRaces = () => {
    getCompetitions().then(r => {
      const referralRaces = r.competitions.filter(c => c.type === 'referral');
      setRaceComps(referralRaces);
      referralRaces.forEach(c => {
        getRaceLeaderboard(c.id).then(lb => setRaceLeaderboards(prev => ({ ...prev, [c.id]: lb.leaderboard }))).catch(() => {});
      });
    }).catch(() => {});
  };

  useEffect(() => {
    const tick = () => {
      setRaceCountdowns(() => {
        const result: Record<number, string> = {};
        raceComps.forEach(c => {
          const ms = new Date(c.endAt).getTime() - Date.now();
          if (ms <= 0) { result[c.id] = tr.games.ended; return; }
          const d = Math.floor(ms / 86400000);
          const h = Math.floor((ms % 86400000) / 3600000);
          const m = Math.floor((ms % 3600000) / 60000);
          const s = Math.floor((ms % 60000) / 1000);
          if (d > 0) {
            result[c.id] = `${d}${tr.games.timeDay} ${h}${tr.games.timeHour} ${m}${tr.games.timeMin}`;
          } else {
            result[c.id] = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
          }
        });
        return result;
      });
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [raceComps, lang]);

  useEffect(() => {
    getPublicConfig().then(setConfig).catch(() => setConfig(null));
    getStarProducts().then(setStarProducts).catch(() => setStarProducts([]));
    loadAds();
    loadPartnerTasks();
    loadGroupChallenges();
    loadRaces();
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
        toast({ title: tr.tasks.couldNotOpenAd, description: err instanceof Error ? err.message : tr.tasks.tryAgainLater, variant: 'destructive' });
      }
      return;
    }

    if (!canClaim) return;

    setClaimingAdId(ad.id);
    try {
      const result = await claimAd(ad.id);
      // Reward is credited server-side into pending_bonus_points; the refresh
      // folds it into the balance (and triggers the reward popup). No local
      // optimistic credit — it would double-count via the debounced sync.
      await refreshFromServer();
      setSponsoredAds(prev => prev.map(a => a.id === ad.id ? { ...a, claimed: true } : a));
      toast({ title: tr.tasks.rewardClaimed, description: tr.tasks.adWatchedDesc(result.creditedPoints) });
    } catch (err) {
      toast({ title: tr.tasks.couldNotClaimReward, description: err instanceof Error ? err.message : tr.tasks.tryAgainLater, variant: 'destructive' });
    } finally {
      setClaimingAdId(null);
    }
  };

  const handleWatchAd = async () => {
    const hasAny = (config?.adsgram.enabled && config.adsgram.blockId) ||
                   (config?.monetag.enabled && config.monetag.zoneId) ||
                   (config?.onclicka.enabled && config.onclicka.spotId);
    if (!hasAny || adLoading) return;
    setAdLoading(true);
    try {
      const provider = await watchRewardedAdWithFallback(config);
      const result = provider === 'adsgram' ? await claimAdsgramReward()
        : provider === 'monetag' ? await claimMonetagReward()
        : await claimOnclickaReward();
      // Reward lands server-side in pending_bonus_points; the refresh folds it
      // into the balance and triggers the reward popup — no local credit needed.
      void refreshFromServer();
      toast({ title: tr.tasks.adWatched, description: tr.tasks.adWatchedDesc(result.creditedPoints) });
    } catch (err) {
      toast({ title: tr.tasks.couldNotOpenAd, description: err instanceof Error ? err.message : tr.tasks.tryAgainLater, variant: 'destructive' });
    } finally {
      setAdLoading(false);
    }
  };

  const handleWatchBannerAd = async () => {
    if (!config?.adsgram.enabled || !config.adsgram.bannerBlockId || bannerAdLoading) return;
    setBannerAdLoading(true);
    try {
      // Use bannerBlockId as the primary Adsgram block — same fallback chain as button 1
      const bannerConfig = { ...config, adsgram: { ...config.adsgram, blockId: config.adsgram.bannerBlockId } };
      const provider = await watchRewardedAdWithFallback(bannerConfig);
      const result = provider === 'adsgram' ? await claimAdsgramReward() : await claimOnclickaReward();
      // Reward lands server-side in pending_bonus_points; the refresh folds it
      // into the balance and triggers the reward popup — no local credit needed.
      void refreshFromServer();
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
      // Reward lands server-side in pending_bonus_points; the refresh folds it
      // into the balance and triggers the reward popup — no local credit needed.
      void refreshFromServer();
      toast({ title: 'Ad Watched!', description: `+${result.creditedPoints.toLocaleString()} points` });
    } catch (err) {
      toast({ title: 'Ad not completed', description: err instanceof Error ? err.message : 'Try again later', variant: 'destructive' });
    } finally {
      setMonetagLoading(false);
    }
  };

  const handleWatchOnclickaAd = async () => {
    if (!config?.onclicka.enabled || !config.onclicka.spotId || onclickaLoading) return;
    setOnclickaLoading(true);
    try {
      const { showOnclickaRewardedAd } = await import('../lib/onclicka');
      await showOnclickaRewardedAd(config.onclicka.spotId);
      const result = await claimOnclickaReward();
      // Reward lands server-side in pending_bonus_points; the refresh folds it
      // into the balance and triggers the reward popup — no local credit needed.
      void refreshFromServer();
      toast({ title: 'Ad Watched!', description: `+${result.creditedPoints.toLocaleString()} points` });
    } catch (err) {
      toast({ title: 'Ad not completed', description: err instanceof Error ? err.message : 'Try again later', variant: 'destructive' });
    } finally {
      setOnclickaLoading(false);
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
    haptic('medium');
    try {
      const { invoiceUrl } = await createStarsInvoice(product.id);
      const webApp = getTelegramWebApp();
      if (webApp?.openInvoice) {
        webApp.openInvoice(invoiceUrl, (status) => {
          if (status === 'paid') {
            setSuccessProduct(product);
            setTimeout(() => refreshFromServer(), 1500);
          } else if (status === 'failed') {
            toast({ title: tr.tasks.paymentFailed, variant: 'destructive' });
          }
        });
      } else {
        window.open(invoiceUrl, '_blank');
      }
    } catch (err) {
      toast({ title: tr.tasks.couldNotStartPurchase, description: err instanceof Error ? err.message : tr.tasks.tryAgainLater, variant: 'destructive' });
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
  const dailyWord = (config?.dailyCipher || DAILY_WORDS[dayOfYear % DAILY_WORDS.length]).toUpperCase();
  const morseCode = dailyWord.split('').map(char => MORSE_CODE[char] || '?').join(' ');

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
      setTempMiningPoints(prev => prev + 15000);
      addLifetimePoints(15000);
      setCipherSolved(true);
      localStorage.setItem('dailyCipherDate', todayStr);
      localStorage.setItem('dailyCipherSolved', 'true');
      toast({ title: tr.tasks.taskComplete, description: '+15,000 pts' });
      setCipherError(false);
    } else {
      setCipherError(true);
      setTimeout(() => setCipherError(false), 500);
      toast({ title: tr.tasks.wrongGuess, description: tr.tasks.wrongGuessDesc, variant: "destructive" });
    }
  };

  // Daily Combo State
  const [comboResult, setComboResult] = useState<'none' | 'success' | 'failed'>(() => {
    const savedDate = localStorage.getItem('dailyComboDate');
    return savedDate === todayStr ? (localStorage.getItem('dailyComboResult') as any) || 'none' : 'none';
  });
  const [selectedCombo, setSelectedCombo] = useState<string[]>([]);
  const targetCombo = (config?.dailyComboIds?.length === 3 ? config.dailyComboIds : ['star', 'globe', 'gem']);
  
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
            // Server-side pending credit — refresh folds it in and shows the popup.
            await refreshFromServer();
            toast({ title: tr.tasks.taskComplete, description: tr.tasks.taskCompleteDesc(result.creditedPoints) });
          } else {
            toast({ title: tr.tasks.alreadyClaimed, description: tr.tasks.alreadyClaimedDesc });
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : tr.tasks.tryAgainLater;
        if (msg.includes("not_joined")) {
          toast({ title: tr.tasks.notJoinedYet, description: tr.tasks.notJoinedYetDesc, variant: "destructive" });
          setPartnerTaskStates(prev => ({ ...prev, [task.id]: 'verify' }));
        } else {
          toast({ title: tr.tasks.wrongGuess, description: msg, variant: "destructive" });
          setPartnerTaskStates(prev => ({ ...prev, [task.id]: 'verify' }));
        }
      }
    }
  };

  const handleJoinRace = async (comp: RaceCompetition) => {
    if (joiningRaceId === comp.id) return;
    setJoiningRaceId(comp.id);
    try {
      const result = await joinReferralRace(comp.id);
      if (result.ok) {
        if (result.alreadyJoined) {
          toast({ title: tr.tasks.raceAlreadyJoined, description: tr.tasks.raceAlreadyJoinedDesc });
        } else {
          haptic('success');
          toast({ title: tr.tasks.raceJoined, description: tr.tasks.raceJoinedDesc });
          setRaceComps(prev => prev.map(c => c.id === comp.id ? { ...c, entered: true } : c));
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : tr.tasks.tryAgainLater;
      toast({ title: tr.tasks.wrongGuess, description: msg, variant: "destructive" });
    } finally {
      setJoiningRaceId(null);
    }
  };

  const handleClaimGroupChallenge = async (challenge: GroupChallenge) => {
    if (challenge.completed || claimingChallengeId === challenge.id) return;
    if ((challenge.currentInvites ?? 0) < challenge.requiredInvites) {
      if (challenge.channelUrl) window.open(challenge.channelUrl, '_blank');
      toast({ title: tr.tasks.inviteFriendsFirst, description: tr.tasks.inviteFriendsFirstDesc(challenge.requiredInvites, challenge.currentInvites ?? 0), variant: "destructive" });
      return;
    }
    setClaimingChallengeId(challenge.id);
    try {
      const result = await claimGroupChallenge(challenge.id);
      if (result.ok) {
        setGroupChallenges(prev => prev.map(c => c.id === challenge.id ? { ...c, completed: true } : c));
        if (!result.alreadyClaimed && result.creditedPoints > 0) {
          await refreshFromServer();
          toast({ title: tr.tasks.challengeCongrats, description: tr.tasks.challengeCongratsDesc(result.creditedPoints) });
        } else {
          toast({ title: tr.tasks.alreadyClaimed, description: tr.tasks.challengeAlreadyClaimedDesc });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : tr.tasks.tryAgainLater;
      toast({ title: tr.tasks.wrongGuess, description: msg, variant: "destructive" });
    } finally {
      setClaimingChallengeId(null);
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
        toast({ title: tr.tasks.taskCompleteSimple, description: `+${reward?.toLocaleString()} points` });
      }, 3000);
    }
  };

  const completeFakeSurvey = () => {
    const pts = Math.floor(Math.random() * 750) + 250;
    setTempMiningPoints(prev => prev + pts);
    addLifetimePoints(pts);
    setClaimedTasks(prev => [...prev, 't3']);
    setShowSurveyModal(false);
    toast({ title: tr.tasks.surveyComplete, description: tr.tasks.surveyCompleteDesc(pts) });
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
      setTempMiningPoints(p => p + 25000);
      addLifetimePoints(25000);
      toast({ title: "Combo Correct!", description: "+25,000 points added!" });
    } else {
      setComboResult('failed');
      toast({ title: "Wrong Combo", description: "Try again tomorrow.", variant: "destructive" });
    }
    localStorage.setItem('dailyComboDate', todayStr);
    localStorage.setItem('dailyComboResult', isCorrect ? 'success' : 'failed');
  };

  const dailyGames = [
    { label: tr.tasks.dailyCipher, done: cipherSolved, reward: 15000 },
    { label: tr.tasks.dailyCombo, done: comboResult !== 'none', reward: 25000 },
    { label: tr.tasks.dailySpin, done: spinHasSpun, reward: 5000 },
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
              <h2 className="text-lg font-bold text-white">{tr.tasks.dailyRewards}</h2>
            </div>
            <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20 tabular-nums">{dailyDone}/{dailyGames.length}</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden mb-3">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${dailyPct}%`, background: 'linear-gradient(90deg, hsl(152,76%,42%), hsl(152,76%,55%))' }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {dailyDone === dailyGames.length
              ? tr.tasks.allClaimed
              : tr.tasks.remaining(dailyGames.length - dailyDone, dailyRemaining)}
          </p>
        </div>
      </section>

      <EngagementHub />

      {/* Daily Cipher */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-white">{tr.tasks.dailyCipher}</h2>
          </div>
          <span className="text-xs text-primary font-bold bg-primary/10 px-2 py-1 rounded-full border border-primary/20">+15,000 pts</span>
        </div>
        <div className={`bg-card border ${cipherError ? 'border-red-500/50 translate-x-1' : 'border-white/5'} rounded-xl p-4 transition-all duration-100`}>
          {cipherSolved ? (
            <div className="text-center py-4 text-emerald-400 font-bold flex flex-col items-center gap-2">
              <Check className="w-8 h-8" />
              {tr.tasks.cipherSolved}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <div className="text-2xl tracking-widest font-mono text-primary font-bold">{morseCode}</div>
                <div className="text-xs text-muted-foreground mt-2">{tr.tasks.decodeMorse}</div>
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
                    {tr.tasks.revealHint}
                  </button>
                )}
                <button 
                  data-testid="button-cipher-submit"
                  onClick={handleCipherSubmit} 
                  disabled={cipherGuess.length !== dailyWord.length}
                  className="flex-[2] bg-primary text-black font-bold py-3 rounded-lg disabled:opacity-50"
                >
                  {tr.tasks.submit}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Daily Combo */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">{tr.tasks.dailyCombo}</h2>
          <span className="text-xs text-primary font-bold bg-primary/10 px-2 py-1 rounded-full border border-primary/20">+25,000 pts</span>
        </div>
        <div className="bg-card border border-white/5 rounded-xl p-4">
          {comboResult === 'success' ? (
            <div className="text-center py-4 text-emerald-400 font-bold flex flex-col items-center gap-2">
              <Check className="w-8 h-8" />
              {tr.tasks.comboSolved}
            </div>
          ) : comboResult === 'failed' ? (
            <div className="text-center py-4 text-red-400 font-bold flex flex-col items-center gap-2">
              <Lock className="w-8 h-8" />
              {tr.tasks.comboFailed}
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
          <h2 className="text-xl font-bold text-white">{tr.tasks.dailySpin}</h2>
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
                  const isJackpot = reward === 5000;
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

      <SectionLabel>{tr.tasks.earnPoints}</SectionLabel>

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
        {config?.adsgram.enabled && config.adsgram.bannerBlockId && (
          <div className="bg-card border border-white/5 rounded-xl p-4 flex items-center justify-between mt-3">
            <div className="flex-1 pr-4">
              <h3 className="font-semibold text-white text-sm mb-1">Watch another rewarded ad</h3>
              <p className="text-xs font-medium text-primary">
                +{config.adsgram.rewardPoints.toLocaleString()} pts per ad
              </p>
            </div>
            <button
              data-testid="button-watch-banner-ad"
              onClick={handleWatchAd}
              disabled={!config?.adsgram.enabled || adLoading}
              className="min-w-[100px] h-9 bg-primary text-black text-xs font-bold rounded-lg flex items-center justify-center disabled:opacity-40 disabled:bg-white/10 disabled:text-white/50 transition-colors"
            >
              {adLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Watch Ad'}
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

      <SectionLabel>{tr.tasks.storePartners}</SectionLabel>

      {/* Telegram Stars Store */}
      {(() => {
        type StarMeta = { Icon: React.ElementType; label: string; color: string; glow: string; gradient: string };
        const STAR_META: Record<string, StarMeta> = {
          premium_days:         { Icon: Crown,     label: 'PREMIUM', color: '#f59e0b', glow: 'rgba(245,158,11,0.30)',  gradient: 'linear-gradient(160deg, rgba(245,158,11,0.12) 0%, rgba(8,6,1,0.98) 100%)' },
          turbo_boost:          { Icon: Flame,     label: 'BOOST',   color: '#f97316', glow: 'rgba(249,115,22,0.30)',  gradient: 'linear-gradient(160deg, rgba(249,115,22,0.12) 0%, rgba(8,4,1,0.98) 100%)' },
          energy_refill:        { Icon: Zap,       label: 'ENERGY',  color: '#38bdf8', glow: 'rgba(56,189,248,0.30)',  gradient: 'linear-gradient(160deg, rgba(56,189,248,0.12) 0%, rgba(1,7,12,0.98) 100%)' },
          permanent_multiplier: { Icon: Sparkles,  label: 'POWER',   color: '#a78bfa', glow: 'rgba(167,139,250,0.30)', gradient: 'linear-gradient(160deg, rgba(167,139,250,0.12) 0%, rgba(5,4,12,0.98) 100%)' },
          badge:                { Icon: Award,     label: 'BADGE',   color: '#2dd4bf', glow: 'rgba(45,212,191,0.30)',  gradient: 'linear-gradient(160deg, rgba(45,212,191,0.12) 0%, rgba(1,8,8,0.98) 100%)' },
          skin:                 { Icon: Palette,   label: 'SKIN',    color: '#f472b6', glow: 'rgba(244,114,182,0.30)', gradient: 'linear-gradient(160deg, rgba(244,114,182,0.12) 0%, rgba(8,2,6,0.98) 100%)' },
          points:               { Icon: Gem,       label: 'POINTS',  color: '#34d399', glow: 'rgba(52,211,153,0.30)',  gradient: 'linear-gradient(160deg, rgba(52,211,153,0.12) 0%, rgba(2,8,5,0.98) 100%)' },
          mining_level_up:      { Icon: Rocket,    label: 'UPGRADE', color: '#818cf8', glow: 'rgba(129,140,248,0.30)', gradient: 'linear-gradient(160deg, rgba(129,140,248,0.12) 0%, rgba(4,4,12,0.98) 100%)' },
          squad_gold:           { Icon: Trophy,    label: 'SQUAD',   color: '#fbbf24', glow: 'rgba(251,191,36,0.30)',  gradient: 'linear-gradient(160deg, rgba(251,191,36,0.12) 0%, rgba(8,7,1,0.98) 100%)' },
          competition_entry:    { Icon: Target,    label: 'CONTEST', color: '#fb7185', glow: 'rgba(251,113,133,0.30)', gradient: 'linear-gradient(160deg, rgba(251,113,133,0.12) 0%, rgba(8,2,4,0.98) 100%)' },
        };
        const DEFAULT_META: StarMeta = { Icon: Gem, label: 'ITEM', color: '#34d399', glow: 'rgba(52,211,153,0.30)', gradient: 'linear-gradient(160deg, rgba(52,211,153,0.12) 0%, rgba(2,8,5,0.98) 100%)' };
        const getMeta = (type: string): StarMeta => STAR_META[type] ?? DEFAULT_META;

        const CATEGORY_MAP: Record<string, string[]> = {
          'all':       [],
          'premium':   ['premium_days', 'permanent_multiplier', 'mining_level_up'],
          'boosts':    ['turbo_boost', 'energy_refill', 'points'],
          'cosmetics': ['badge', 'skin', 'squad_gold', 'competition_entry'],
        };

        const CATEGORIES: { id: string; label: string; Icon: React.ElementType }[] = [
          { id: 'all',       label: tr.tasks.storeCatAll,       Icon: ShoppingBag },
          { id: 'premium',   label: tr.tasks.storeCatPremium,   Icon: Crown },
          { id: 'boosts',    label: tr.tasks.storeCatBoosts,    Icon: Zap },
          { id: 'cosmetics', label: tr.tasks.storeCatCosmetics, Icon: Palette },
        ];

        const filtered = storeCategory === 'all'
          ? starProducts
          : starProducts.filter(p => CATEGORY_MAP[storeCategory]?.includes(p.effectType));

        return (
          <section>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{
                  background: 'linear-gradient(145deg, rgba(245,158,11,0.18) 0%, rgba(245,158,11,0.04) 100%)',
                  border: '1px solid rgba(245,158,11,0.22)',
                  boxShadow: '0 0 18px rgba(245,158,11,0.12)',
                }}>
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" strokeWidth={0} />
                </div>
                <div className="flex flex-col">
                  <h2 className="text-base font-black text-white leading-none tracking-tight">Stars Store</h2>
                  <span className="text-[10px] text-amber-400/50 font-semibold uppercase tracking-widest mt-0.5">{tr.tasks.telegramStars}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)' }}>
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" strokeWidth={0} />
                <span className="text-[10px] font-bold text-amber-400">{tr.tasks.storeExclusive.replace('⭐ ', '')}</span>
              </div>
            </div>

            {!config?.stars.enabled ? (
              <div className="rounded-2xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Lock className="w-8 h-8 mx-auto mb-3 text-white/20" />
                <p className="text-xs text-white/30 font-medium">{tr.tasks.notActivated}</p>
              </div>
            ) : starProducts.length === 0 ? (
              <div className="rounded-2xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <ShoppingBag className="w-8 h-8 mx-auto mb-3 text-white/20" />
                <p className="text-xs text-white/30 font-medium">{tr.tasks.noItems}</p>
              </div>
            ) : (
              <>
                {/* Category tabs */}
                <div className="flex gap-1.5 mb-4 overflow-x-auto pb-0.5 scrollbar-none">
                  {CATEGORIES.filter(cat => cat.id === 'all' || starProducts.some(p => CATEGORY_MAP[cat.id]?.includes(p.effectType))).map(cat => {
                    const isActive = storeCategory === cat.id;
                    const CatIcon = cat.Icon;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setStoreCategory(cat.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all active:scale-95 shrink-0"
                        style={isActive ? {
                          background: 'rgba(245,158,11,0.14)',
                          color: '#f59e0b',
                          border: '1px solid rgba(245,158,11,0.35)',
                          boxShadow: '0 0 14px rgba(245,158,11,0.15)',
                        } : {
                          background: 'rgba(255,255,255,0.03)',
                          color: 'rgba(255,255,255,0.4)',
                          border: '1px solid rgba(255,255,255,0.07)',
                        }}
                      >
                        <CatIcon className="w-3 h-3 shrink-0" />
                        <span>{cat.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Products grid */}
                {filtered.length === 0 ? (
                  <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="text-xs text-white/30">{tr.tasks.storeCatEmpty}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {filtered.map((product, idx) => {
                      const meta = getMeta(product.effectType);
                      const isBuying = purchasingProduct === product.id;
                      const isFeatured = idx === 0 || product.sortOrder === 0;
                      const ProductIcon = meta.Icon;

                      return (
                        <button
                          key={product.id}
                          onClick={() => handleBuyWithStars(product.id)}
                          disabled={isBuying}
                          className="relative rounded-2xl overflow-hidden text-left flex flex-col transition-all duration-200 active:scale-[0.95] disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: meta.gradient,
                            border: `1px solid ${isFeatured ? meta.color + '55' : meta.color + '28'}`,
                            boxShadow: isFeatured ? `0 6px 28px ${meta.glow}70` : `0 3px 14px ${meta.glow}38`,
                          }}
                        >
                          {/* Top accent line */}
                          <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent 0%, ${meta.color}88 50%, transparent 100%)` }} />

                          {/* Type label */}
                          <div className="absolute top-2.5 right-2.5">
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md tracking-wider" style={{ color: meta.color, background: `${meta.color}14`, border: `1px solid ${meta.color}25` }}>
                              {meta.label}
                            </span>
                          </div>

                          {/* Featured badge */}
                          {isFeatured && (
                            <div className="absolute top-2.5 left-2.5">
                              <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md" style={{ background: meta.color, color: '#000' }}>
                                <Star className="w-2 h-2 fill-black" strokeWidth={0} />
                                <span className="text-[8px] font-black">TOP</span>
                              </div>
                            </div>
                          )}

                          {/* Icon orb */}
                          <div className="flex items-center justify-center pt-9 pb-3 px-4">
                            <div className="relative">
                              {/* Outer glow ring */}
                              <div className="absolute inset-0 rounded-full scale-150 opacity-20" style={{ background: `radial-gradient(circle, ${meta.color} 0%, transparent 70%)` }} />
                              {/* Orb */}
                              <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center" style={{
                                background: `linear-gradient(145deg, ${meta.color}30 0%, ${meta.color}10 100%)`,
                                border: `1px solid ${meta.color}40`,
                                boxShadow: `0 4px 20px ${meta.glow}80, inset 0 1px 0 rgba(255,255,255,0.1)`,
                              }}>
                                {product.imageUrl
                                  ? <img src={product.imageUrl} alt={product.title} className="w-8 h-8 rounded-xl object-cover" />
                                  : <ProductIcon className="w-6 h-6" style={{ color: meta.color }} strokeWidth={1.5} />
                                }
                              </div>
                            </div>
                          </div>

                          {/* Content */}
                          <div className="px-3 pb-3 flex flex-col gap-2 flex-1">
                            <div className="text-center">
                              <p className="text-[13px] font-black text-white leading-tight line-clamp-1 tracking-tight">{product.title}</p>
                              {product.description && (
                                <p className="text-[10px] text-white/40 mt-0.5 line-clamp-1">{product.description}</p>
                              )}
                            </div>

                            {/* Benefits preview */}
                            {product.benefitsBullets && (
                              <div className="flex flex-col gap-0.5 px-1">
                                {product.benefitsBullets.split('\n').filter(Boolean).slice(0, 2).map((b, i) => (
                                  <div key={i} className="flex items-start gap-1 text-[9px] text-white/50 leading-snug">
                                    <ChevronRight className="w-2.5 h-2.5 shrink-0 mt-px" style={{ color: meta.color }} />
                                    <span className="line-clamp-1">{b}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Price + Buy */}
                            <div className="mt-auto flex flex-col gap-1.5">
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-base font-black text-white tabular-nums">{product.priceStars.toLocaleString()}</span>
                                <Star className="w-4 h-4 fill-amber-400 text-amber-400" strokeWidth={0} />
                              </div>
                              <div
                                className="w-full h-7 rounded-xl flex items-center justify-center text-[11px] font-black gap-1 relative overflow-hidden"
                                style={{ background: `linear-gradient(135deg, ${meta.color} 0%, ${meta.color}cc 100%)`, color: '#000', boxShadow: `0 2px 12px ${meta.glow}` }}
                              >
                                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_ease-in-out_infinite] pointer-events-none"
                                  style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)' }} />
                                {isBuying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="relative z-10">{tr.tasks.storeBuyBtn}</span>}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        );
      })()}

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

      {/* Referral Race Competitions */}
      {raceComps.length > 0 && raceComps.map(comp => {
        const required = comp.requiredInvites ?? 100;
        const progress = comp.entered ? Math.min(1, comp.myProgress / required) : 0;
        const pct = Math.round(progress * 100);
        const leaderboard = raceLeaderboards[comp.id] ?? [];
        const top3 = leaderboard.slice(0, 3);
        const countdown = raceCountdowns[comp.id] ?? '...';
        const isJoining = joiningRaceId === comp.id;

        // Color based on progress
        const barColor = pct >= 100 ? '#22c55e'
          : pct >= 90 ? '#ef4444'
          : pct >= 66 ? '#f97316'
          : pct >= 33 ? '#f59e0b'
          : '#6366f1';
        const glowColor = pct >= 90 ? 'rgba(239,68,68,0.4)'
          : pct >= 66 ? 'rgba(249,115,22,0.3)'
          : pct >= 33 ? 'rgba(245,158,11,0.25)'
          : 'rgba(99,102,241,0.2)';

        const MEDALS = ['🥇','🥈','🥉'];
        const myRank = leaderboard.findIndex(e => e.gained === comp.myProgress) + 1;

        return (
          <section key={comp.id}>
            {/* Card */}
            <div className="relative overflow-hidden rounded-2xl border border-orange-500/25"
              style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.08) 0%, rgba(239,68,68,0.06) 50%, rgba(17,24,39,0.95) 100%)' }}>

              {/* Ambient glow */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at top right, ${glowColor}, transparent 70%)` }} />

              <div className="relative p-4 space-y-4">

                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)' }}>
                      🔥
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400">{tr.tasks.referralRace}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                      </div>
                      <h3 className="text-white font-bold text-sm leading-tight">{lang === 'en' && comp.titleEn ? comp.titleEn : comp.title ?? comp.titleEn}</h3>
                    </div>
                  </div>
                  {/* Countdown */}
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1 text-orange-300/70 text-[10px]">
                      <Timer className="w-3 h-3" /> {tr.tasks.endsIn}
                    </div>
                    <div className="font-mono text-sm font-bold text-orange-300">{countdown}</div>
                  </div>
                </div>

                {/* Prize banner */}
                <div className="flex items-center justify-between bg-white/4 rounded-xl px-3 py-2 border border-white/5">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs text-white/70">{tr.tasks.grandPrize}</span>
                  </div>
                  <span className="text-yellow-400 font-bold text-sm">{comp.prizePoints.toLocaleString()} SKP</span>
                </div>

                {/* Target */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50 flex items-center gap-1"><Users className="w-3 h-3" /> {tr.tasks.targetReferrals(required)}</span>
                  {comp.entered && (
                    <span className={`font-bold ${pct >= 100 ? 'text-green-400' : pct >= 66 ? 'text-orange-400' : 'text-white/70'}`}>
                      {tr.tasks.progressLabel} {comp.myProgress} / {required}
                      {myRank > 0 && myRank <= 20 && <span className="mr-1 text-primary"> #{myRank}</span>}
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                {comp.entered && (
                  <div className="space-y-1">
                    <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 relative overflow-hidden"
                        style={{ width: `${pct}%`, background: barColor, boxShadow: `0 0 8px ${barColor}` }}
                      >
                        {pct > 20 && (
                          <div className="absolute inset-0 opacity-40"
                            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', animation: 'shimmer 1.5s infinite' }} />
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] text-white/30">
                      <span>0</span>
                      <span className={pct >= 33 ? 'text-white/50' : ''}>{Math.round(required * 0.33)}</span>
                      <span className={pct >= 66 ? 'text-orange-400/70' : ''}>{Math.round(required * 0.66)}</span>
                      <span className={pct >= 100 ? 'text-green-400' : ''}>{required}</span>
                    </div>
                  </div>
                )}

                {/* Leaderboard top 3 */}
                {top3.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">{tr.tasks.leaderboardLabel}</p>
                    {top3.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 bg-white/3 rounded-lg px-3 py-1.5">
                        <span className="text-base w-6 text-center">{MEDALS[i]}</span>
                        <span className="flex-1 text-sm text-white truncate">{entry.name}</span>
                        <span className="text-xs font-bold" style={{ color: i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : '#b87333' }}>
                          {entry.gained} / {required}
                        </span>
                        <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full"
                            style={{ width: `${Math.min(100, (entry.gained / required) * 100)}%`, background: i === 0 ? '#fbbf24' : barColor }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* CTA */}
                {!comp.entered ? (
                  <button
                    onClick={() => handleJoinRace(comp)}
                    disabled={isJoining}
                    className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)', color: 'white', boxShadow: '0 4px 20px rgba(249,115,22,0.4)' }}
                  >
                    {isJoining ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Flame className="w-4 h-4" /> {tr.tasks.joinFree}</>}
                  </button>
                ) : pct < 100 ? (
                  <div className="text-center text-xs text-white/40 py-1">
                    {tr.tasks.shareToClimb}
                  </div>
                ) : (
                  <div className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                    style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
                    <Check className="w-4 h-4" /> {tr.tasks.goalReached}
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {/* Group Invite Challenges */}
      {groupChallenges.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/70">تحديات الدعوة</span>
            <div className="flex-1 h-px bg-gradient-to-r from-primary/20 to-transparent" />
          </div>
          <div className="space-y-3">
            {groupChallenges.map(challenge => {
              const current = challenge.currentInvites ?? 0;
              const required = challenge.requiredInvites;
              const progress = Math.min(1, current / required);
              const canClaim = current >= required;
              const isClaiming = claimingChallengeId === challenge.id;

              return (
                <div key={challenge.id} className="bg-card border border-white/5 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
                      {challenge.iconEmoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white text-sm leading-snug">{challenge.title}</h3>
                      {challenge.description && <p className="text-xs text-muted-foreground mt-0.5">{challenge.description}</p>}
                      <p className="text-xs font-bold text-purple-400 mt-0.5">+{challenge.rewardSkp.toLocaleString()} SKP</p>
                    </div>
                    {challenge.completed ? (
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <Check className="w-5 h-5 text-emerald-500" />
                      </div>
                    ) : (
                      <button
                        onClick={() => handleClaimGroupChallenge(challenge)}
                        disabled={isClaiming || (!canClaim && !challenge.channelUrl)}
                        className="min-w-[80px] h-9 text-xs font-bold rounded-lg flex items-center justify-center transition-all shrink-0"
                        style={canClaim ? {
                          background: 'hsl(270,76%,55%)',
                          color: 'white',
                          boxShadow: '0 0 12px rgba(168,85,247,0.35)',
                        } : {
                          background: 'rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.5)',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}
                      >
                        {isClaiming ? <Loader2 className="w-4 h-4 animate-spin" /> : canClaim ? 'استلام 🎁' : challenge.channelUrl ? 'انضم' : `${current}/${required}`}
                      </button>
                    )}
                  </div>

                  {/* Progress bar */}
                  {!challenge.completed && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">الدعوات</span>
                        <span className={canClaim ? 'text-purple-400 font-bold' : 'text-white/60'}>{current} / {required}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${progress * 100}%`,
                            background: canClaim
                              ? 'linear-gradient(90deg, hsl(270,76%,55%), hsl(290,76%,65%))'
                              : 'linear-gradient(90deg, rgba(168,85,247,0.5), rgba(168,85,247,0.3))',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Stars Purchase Success Screen */}
      {successProduct && (
        <StarsPurchaseSuccess
          product={successProduct}
          onClose={() => setSuccessProduct(null)}
        />
      )}

      {/* Stars Purchase Confirmation Modal */}
      {confirmProduct && (() => {
        type ConfirmMeta = { Icon: React.ElementType; color: string; glow: string };
        const CONFIRM_META: Record<string, ConfirmMeta> = {
          premium_days:         { Icon: Crown,    color: '#f59e0b', glow: 'rgba(245,158,11,0.35)' },
          turbo_boost:          { Icon: Flame,    color: '#f97316', glow: 'rgba(249,115,22,0.35)' },
          energy_refill:        { Icon: Zap,      color: '#38bdf8', glow: 'rgba(56,189,248,0.35)' },
          permanent_multiplier: { Icon: Sparkles, color: '#a78bfa', glow: 'rgba(167,139,250,0.35)' },
          badge:                { Icon: Award,    color: '#2dd4bf', glow: 'rgba(45,212,191,0.35)' },
          skin:                 { Icon: Palette,  color: '#f472b6', glow: 'rgba(244,114,182,0.35)' },
          points:               { Icon: Gem,      color: '#34d399', glow: 'rgba(52,211,153,0.35)' },
          mining_level_up:      { Icon: Rocket,   color: '#818cf8', glow: 'rgba(129,140,248,0.35)' },
          squad_gold:           { Icon: Trophy,   color: '#fbbf24', glow: 'rgba(251,191,36,0.35)'  },
          competition_entry:    { Icon: Target,   color: '#fb7185', glow: 'rgba(251,113,133,0.35)' },
        };
        const cm: ConfirmMeta = CONFIRM_META[confirmProduct.effectType] ?? { Icon: Gem, color: '#34d399', glow: 'rgba(52,211,153,0.35)' };
        const ConfirmIcon = cm.Icon;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}>
            <div
              className="w-full max-w-sm rounded-3xl overflow-hidden animate-in zoom-in-90 duration-300"
              style={{
                background: 'linear-gradient(180deg, hsl(224,71%,7%) 0%, hsl(224,71%,3%) 100%)',
                border: `1px solid ${cm.color}30`,
                boxShadow: `0 0 0 1px rgba(255,255,255,0.04) inset, 0 8px 60px ${cm.glow}60, 0 0 120px ${cm.glow}20`,
              }}
            >
              {/* Top accent */}
              <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent 5%, ${cm.color}cc 50%, transparent 95%)` }} />

              {/* Header */}
              <div className="px-6 pt-7 pb-4 flex flex-col items-center text-center gap-4">

                {/* Icon — premium orb */}
                <div className="relative">
                  {/* Outer pulse ring */}
                  <div className="absolute inset-0 rounded-3xl scale-[1.35] opacity-15 animate-pulse"
                    style={{ background: `radial-gradient(circle, ${cm.color} 0%, transparent 70%)` }} />
                  {/* Mid ring */}
                  <div className="absolute inset-0 rounded-3xl scale-[1.15] opacity-10"
                    style={{ border: `1px solid ${cm.color}`, borderRadius: '1.5rem' }} />
                  {/* Orb */}
                  <div
                    className="relative w-24 h-24 rounded-3xl flex items-center justify-center animate-in zoom-in-75 duration-500"
                    style={{
                      background: `linear-gradient(145deg, ${cm.color}28 0%, ${cm.color}0a 100%)`,
                      border: `1.5px solid ${cm.color}50`,
                      boxShadow: `0 0 40px ${cm.glow}70, 0 0 80px ${cm.glow}25, inset 0 1px 0 rgba(255,255,255,0.12)`,
                    }}
                  >
                    {/* Inner shimmer */}
                    <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_ease-in-out_infinite]"
                        style={{ background: `linear-gradient(90deg, transparent 0%, ${cm.color}20 50%, transparent 100%)` }} />
                    </div>
                    {confirmProduct.imageUrl
                      ? <img src={confirmProduct.imageUrl} alt={confirmProduct.title} className="w-14 h-14 rounded-2xl object-cover relative z-10" />
                      : <ConfirmIcon className="w-11 h-11 relative z-10" style={{ color: cm.color }} strokeWidth={1.25} />
                    }
                  </div>
                </div>

                {/* Title + description */}
                <div>
                  <h3 className="font-black text-white text-xl leading-tight tracking-tight">{confirmProduct.title}</h3>
                  {confirmProduct.description && (
                    <p className="text-xs text-white/40 leading-relaxed mt-1">{confirmProduct.description}</p>
                  )}
                </div>

                {/* Price pill */}
                <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-2xl" style={{ background: `${cm.color}10`, border: `1px solid ${cm.color}30` }}>
                  <span className="text-2xl font-black text-white tabular-nums tracking-tight">{confirmProduct.priceStars.toLocaleString()}</span>
                  <Star className="w-5 h-5 fill-amber-400 text-amber-400" strokeWidth={0} />
                  <span className="text-[11px] text-white/35 font-medium">{tr.tasks.telegramStars}</span>
                </div>
              </div>

              {/* Benefits */}
              {confirmProduct.benefitsBullets && (
                <div className="mx-5 mb-5 px-4 py-3 rounded-2xl" style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${cm.color}18` }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-3 rounded-full" style={{ background: cm.color }} />
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/60">{tr.tasks.confirmWhatYouGet}</p>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {confirmProduct.benefitsBullets.split('\n').filter(Boolean).map((bullet, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-xs text-white/75 leading-snug">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: cm.color }} strokeWidth={2} />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="px-5 pb-7 flex flex-col gap-2.5">
                <button
                  onClick={handleConfirmPurchase}
                  disabled={!!purchasingProduct}
                  className="relative w-full h-12 rounded-2xl font-black text-sm flex items-center justify-center transition-all active:scale-[0.97] disabled:opacity-50 overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${cm.color} 0%, ${cm.color}cc 100%)`,
                    color: '#000',
                    boxShadow: `0 4px 28px ${cm.glow}80, 0 0 56px ${cm.glow}30`,
                  }}
                >
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_ease-in-out_infinite] pointer-events-none"
                    style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)' }} />
                  {purchasingProduct
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <span className="relative z-10 flex items-center gap-2">
                        {tr.tasks.confirmPayBtn(confirmProduct.priceStars)}
                      </span>
                  }
                </button>
                <button
                  onClick={() => { haptic('light'); setConfirmProduct(null); }}
                  className="w-full h-10 rounded-xl text-xs font-semibold text-white/30 hover:text-white/60 active:text-white transition-colors tracking-wide uppercase"
                >
                  {tr.squad.cancel}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
