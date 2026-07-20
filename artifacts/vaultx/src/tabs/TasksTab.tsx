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

type TaskTabId = 'daily' | 'earn' | 'challenges';

const TASK_TABS: {
  id: TaskTabId;
  en: string;
  ar: string;
  icon: React.ElementType;
  color: string;
}[] = [
  { id: 'daily',      en: 'Daily',  ar: 'يومي',  icon: Gift,   color: '#34d399' },
  { id: 'earn',       en: 'Earn',   ar: 'اكسب',  icon: Zap,    color: '#f5c518' },
  { id: 'challenges', en: 'Goals',  ar: 'أهداف', icon: Trophy, color: '#a78bfa' },
];

export const TasksTab = () => {
  const { userId, setTempMiningPoints, addLifetimePoints, refreshFromServer, lifetimePoints, miningLevel, profitPerHour, totalReferrals, isPremium, selectedExchange, farmStartTime, farmState, claimedAchievements, addClaimedAchievement } = useVault();
  const { toast } = useToast();
  const { tr, lang } = useLanguage();

  const [claimedTasks, setClaimedTasks] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('claimedTasks') || '[]'); } catch { return []; }
  });

  const [taskStates, setTaskStates] = useState<Record<string, 'idle' | 'loading' | 'verify'>>({});
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [taskTab, setTaskTab] = useState<TaskTabId>('daily');
  const isAr = lang === 'ar';

  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [gigapubLoading, setGigapubLoading] = useState(false);
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
      await refreshFromServer();
      setSponsoredAds(prev => prev.map(a => a.id === ad.id ? { ...a, claimed: true } : a));
      toast({ title: tr.tasks.rewardClaimed, description: tr.tasks.adWatchedDesc(result.creditedPoints), variant: 'success' });
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
      void refreshFromServer();
      toast({ title: tr.tasks.adWatched, description: tr.tasks.adWatchedDesc(result.creditedPoints), variant: 'success' });
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
      const bannerConfig = { ...config, adsgram: { ...config.adsgram, blockId: config.adsgram.bannerBlockId } };
      const provider = await watchRewardedAdWithFallback(bannerConfig);
      const result = provider === 'adsgram' ? await claimAdsgramReward() : await claimOnclickaReward();
      void refreshFromServer();
      toast({ title: 'Ad Watched!', description: `+${result.creditedPoints.toLocaleString()} points`, variant: 'success' });
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
      void refreshFromServer();
      toast({ title: 'Ad Watched!', description: `+${result.creditedPoints.toLocaleString()} points`, variant: 'success' });
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
      void refreshFromServer();
      toast({ title: 'Ad Watched!', description: `+${result.creditedPoints.toLocaleString()} points`, variant: 'success' });
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

  const openGigaPub = async (projectId: string) => {
    if (gigapubLoading) return;
    const win = window as unknown as Record<string, unknown>;

    const launchSdk = () => {
      const sdk = win['gigaOfferWallSDK'] as { open?: () => void; on?: (event: string, cb: (data: Record<string, unknown>) => Promise<void>) => void } | undefined;
      if (sdk?.open) {
        sdk.on?.('rewardClaim', async (data: Record<string, unknown>) => {
          try {
            await fetch('/api/earn/gigapub/reward', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rewardId: data['rewardId'], amount: data['amount'], hash: data['hash'] }),
            });
            await refreshFromServer();
            (sdk as unknown as { confirmReward?: (id: unknown, hash: unknown) => void }).confirmReward?.(data['rewardId'], data['hash']);
          } catch { /* non-fatal */ }
        });
        sdk.open();
        return true;
      }
      return false;
    };

    if (launchSdk()) return;

    // SDK not loaded yet — load it first
    setGigapubLoading(true);
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 8000);
        const callbacks: (() => void)[] = (win['loadGigaSDKCallbacks'] as (() => void)[] | undefined) ?? [];
        win['loadGigaSDKCallbacks'] = callbacks;
        callbacks.push(() => {
          clearTimeout(timeout);
          const loadFn = win['loadOfferWallSDK'] as ((opts: { projectId: string }) => Promise<unknown>) | undefined;
          if (!loadFn) { reject(new Error('loadOfferWallSDK missing')); return; }
          loadFn({ projectId })
            .then(sdk => { win['gigaOfferWallSDK'] = sdk; resolve(); })
            .catch(reject);
        });

        if (!document.querySelector(`script[src*="giga.pub"]`)) {
          const script = document.createElement('script');
          script.src = `https://wall.giga.pub/api/v1/loader.js?projectId=${projectId}`;
          script.async = true;
          script.onerror = () => { clearTimeout(timeout); reject(new Error('Script load failed')); };
          document.head.appendChild(script);
        }
      });
      launchSdk();
    } catch {
      toast({ title: isAr ? 'تعذّر تحميل GigaPub' : 'Could not load GigaPub', variant: 'destructive' });
    } finally {
      setGigapubLoading(false);
    }
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
    const timer = setTimeout(() => setShowCipherHint(true), 10000);
    return () => clearTimeout(timer);
  }, [cipherSolved]);

  const handleCipherSubmit = () => {
    if (cipherGuess.toUpperCase() === dailyWord) {
      setTempMiningPoints(prev => prev + 15000);
      addLifetimePoints(15000);
      setCipherSolved(true);
      localStorage.setItem('dailyCipherDate', todayStr);
      localStorage.setItem('dailyCipherSolved', 'true');
      toast({ title: tr.tasks.taskComplete, description: '+15,000 pts', variant: 'success' });
      setCipherError(false);
    } else {
      setCipherError(true);
      setTimeout(() => setCipherError(false), 500);
      toast({ title: tr.tasks.wrongGuess, description: tr.tasks.wrongGuessDesc, variant: 'destructive' });
    }
  };

  const [comboResult, setComboResult] = useState<'none' | 'success' | 'failed'>(() => {
    const savedDate = localStorage.getItem('dailyComboDate');
    return savedDate === todayStr ? (localStorage.getItem('dailyComboResult') as any) || 'none' : 'none';
  });
  const [selectedCombo, setSelectedCombo] = useState<string[]>([]);
  const targetCombo = (config?.dailyComboIds?.length === 3 ? config.dailyComboIds : ['star', 'globe', 'gem']);

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
      toast({ title: 'Spin Complete!', description: `You won ${reward} points!`, variant: 'success' });
    }, 3000);
  };

  const spinWheelGradient = SPIN_SEGMENTS.map((s, i) => {
    const start = (i * 360) / SPIN_SEGMENTS.length;
    const end = ((i + 1) * 360) / SPIN_SEGMENTS.length;
    const color = s === 10000 ? 'hsl(152, 76%, 45%)' : i % 2 === 0 ? 'hsl(224, 45%, 11%)' : 'hsl(224, 40%, 8%)';
    return `${color} ${start}deg ${end}deg`;
  }).join(', ');

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
        s: Math.floor((diff % (1000 * 60)) / 1000),
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
      setTimeout(() => setPartnerTaskStates(prev => ({ ...prev, [task.id]: 'verify' })), 2000);
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
            await refreshFromServer();
            toast({ title: tr.tasks.taskComplete, description: tr.tasks.taskCompleteDesc(result.creditedPoints), variant: 'success' });
          } else {
            toast({ title: tr.tasks.alreadyClaimed, description: tr.tasks.alreadyClaimedDesc });
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : tr.tasks.tryAgainLater;
        if (msg.includes('not_joined')) {
          toast({ title: tr.tasks.notJoinedYet, description: tr.tasks.notJoinedYetDesc, variant: 'destructive' });
          setPartnerTaskStates(prev => ({ ...prev, [task.id]: 'verify' }));
        } else {
          toast({ title: tr.tasks.wrongGuess, description: msg, variant: 'destructive' });
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
          toast({ title: tr.tasks.raceAlreadyJoined, description: tr.tasks.raceAlreadyJoinedDesc, variant: 'success' });
        } else {
          haptic('success');
          toast({ title: tr.tasks.raceJoined, description: tr.tasks.raceJoinedDesc, variant: 'success' });
          setRaceComps(prev => prev.map(c => c.id === comp.id ? { ...c, entered: true } : c));
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : tr.tasks.tryAgainLater;
      toast({ title: tr.tasks.wrongGuess, description: msg, variant: 'destructive' });
    } finally {
      setJoiningRaceId(null);
    }
  };

  const handleClaimGroupChallenge = async (challenge: GroupChallenge) => {
    if (challenge.completed || claimingChallengeId === challenge.id) return;
    if ((challenge.currentInvites ?? 0) < challenge.requiredInvites) {
      if (challenge.channelUrl) window.open(challenge.channelUrl, '_blank');
      toast({ title: tr.tasks.inviteFriendsFirst, description: tr.tasks.inviteFriendsFirstDesc(challenge.requiredInvites, challenge.currentInvites ?? 0), variant: 'destructive' });
      return;
    }
    setClaimingChallengeId(challenge.id);
    try {
      const result = await claimGroupChallenge(challenge.id);
      if (result.ok) {
        setGroupChallenges(prev => prev.map(c => c.id === challenge.id ? { ...c, completed: true } : c));
        if (!result.alreadyClaimed && result.creditedPoints > 0) {
          await refreshFromServer();
          toast({ title: tr.tasks.challengeCongrats, description: tr.tasks.challengeCongratsDesc(result.creditedPoints), variant: 'success' });
        } else {
          toast({ title: tr.tasks.alreadyClaimed, description: tr.tasks.challengeAlreadyClaimedDesc });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : tr.tasks.tryAgainLater;
      toast({ title: tr.tasks.wrongGuess, description: msg, variant: 'destructive' });
    } finally {
      setClaimingChallengeId(null);
    }
  };

  const handleTaskAction = (taskId: string, link?: string, reward?: number, isSurvey?: boolean) => {
    if (isSurvey) { setShowSurveyModal(true); return; }
    const currentState = taskStates[taskId] || 'idle';
    if (currentState === 'idle') {
      if (link) window.open(link, '_blank');
      setTaskStates(prev => ({ ...prev, [taskId]: 'loading' }));
      setTimeout(() => setTaskStates(prev => ({ ...prev, [taskId]: 'verify' })), 2000);
    } else if (currentState === 'verify') {
      setTaskStates(prev => ({ ...prev, [taskId]: 'loading' }));
      setTimeout(() => {
        setClaimedTasks(prev => [...prev, taskId]);
        if (reward) { setTempMiningPoints(prev => prev + reward); addLifetimePoints(reward); }
        toast({ title: tr.tasks.taskCompleteSimple, description: `+${reward?.toLocaleString()} points`, variant: 'success' });
      }, 3000);
    }
  };

  const completeFakeSurvey = () => {
    const pts = Math.floor(Math.random() * 750) + 250;
    setTempMiningPoints(prev => prev + pts);
    addLifetimePoints(pts);
    setClaimedTasks(prev => [...prev, 't3']);
    setShowSurveyModal(false);
    toast({ title: tr.tasks.surveyComplete, description: tr.tasks.surveyCompleteDesc(pts), variant: 'success' });
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
      toast({ title: 'Combo Correct!', description: '+25,000 points added!', variant: 'success' });
    } else {
      setComboResult('failed');
      toast({ title: 'Wrong Combo', description: 'Try again tomorrow.', variant: 'destructive' });
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

  // ── Tab render helpers ──
  void handleWatchBannerAd; void handleWatchMonetagAd; void handleWatchOnclickaAd;
  void handleTaskAction; void completeFakeSurvey;

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
    squad_gold:           { Icon: Trophy,   color: '#fbbf24', glow: 'rgba(251,191,36,0.35)' },
    competition_entry:    { Icon: Target,   color: '#fb7185', glow: 'rgba(251,113,133,0.35)' },
  };
  type StarMeta = { Icon: React.ElementType; label: string; color: string; glow: string; gradient: string };
  const STAR_META: Record<string, StarMeta> = {
    premium_days:         { Icon: Crown,    label: 'PREMIUM', color: '#f59e0b', glow: 'rgba(245,158,11,0.30)',  gradient: 'linear-gradient(160deg,rgba(245,158,11,0.12) 0%,rgba(8,6,1,0.98) 100%)' },
    turbo_boost:          { Icon: Flame,    label: 'BOOST',   color: '#f97316', glow: 'rgba(249,115,22,0.30)',  gradient: 'linear-gradient(160deg,rgba(249,115,22,0.12) 0%,rgba(8,4,1,0.98) 100%)' },
    energy_refill:        { Icon: Zap,      label: 'ENERGY',  color: '#38bdf8', glow: 'rgba(56,189,248,0.30)',  gradient: 'linear-gradient(160deg,rgba(56,189,248,0.12) 0%,rgba(1,7,12,0.98) 100%)' },
    permanent_multiplier: { Icon: Sparkles, label: 'POWER',   color: '#a78bfa', glow: 'rgba(167,139,250,0.30)', gradient: 'linear-gradient(160deg,rgba(167,139,250,0.12) 0%,rgba(5,4,12,0.98) 100%)' },
    badge:                { Icon: Award,    label: 'BADGE',   color: '#2dd4bf', glow: 'rgba(45,212,191,0.30)',  gradient: 'linear-gradient(160deg,rgba(45,212,191,0.12) 0%,rgba(1,8,8,0.98) 100%)' },
    skin:                 { Icon: Palette,  label: 'SKIN',    color: '#f472b6', glow: 'rgba(244,114,182,0.30)', gradient: 'linear-gradient(160deg,rgba(244,114,182,0.12) 0%,rgba(8,2,6,0.98) 100%)' },
    points:               { Icon: Gem,      label: 'POINTS',  color: '#34d399', glow: 'rgba(52,211,153,0.30)',  gradient: 'linear-gradient(160deg,rgba(52,211,153,0.12) 0%,rgba(2,8,5,0.98) 100%)' },
    mining_level_up:      { Icon: Rocket,   label: 'UPGRADE', color: '#818cf8', glow: 'rgba(129,140,248,0.30)', gradient: 'linear-gradient(160deg,rgba(129,140,248,0.12) 0%,rgba(4,4,12,0.98) 100%)' },
    squad_gold:           { Icon: Trophy,   label: 'SQUAD',   color: '#fbbf24', glow: 'rgba(251,191,36,0.30)',  gradient: 'linear-gradient(160deg,rgba(251,191,36,0.12) 0%,rgba(8,7,1,0.98) 100%)' },
    competition_entry:    { Icon: Target,   label: 'CONTEST', color: '#fb7185', glow: 'rgba(251,113,133,0.30)', gradient: 'linear-gradient(160deg,rgba(251,113,133,0.12) 0%,rgba(8,2,4,0.98) 100%)' },
  };
  const DEFAULT_META: StarMeta = { Icon: Gem, label: 'ITEM', color: '#34d399', glow: 'rgba(52,211,153,0.30)', gradient: 'linear-gradient(160deg,rgba(52,211,153,0.12) 0%,rgba(2,8,5,0.98) 100%)' };
  const getStarMeta = (type: string): StarMeta => STAR_META[type] ?? DEFAULT_META;
  const CATEGORY_MAP: Record<string, string[]> = {
    all: [],
    premium: ['premium_days', 'permanent_multiplier', 'mining_level_up'],
    boosts: ['turbo_boost', 'energy_refill', 'points'],
    cosmetics: ['badge', 'skin', 'squad_gold', 'competition_entry'],
  };
  const STORE_CATS = [
    { id: 'all',       label: tr.tasks.storeCatAll,       Icon: ShoppingBag },
    { id: 'premium',   label: tr.tasks.storeCatPremium,   Icon: Crown },
    { id: 'boosts',    label: tr.tasks.storeCatBoosts,    Icon: Zap },
    { id: 'cosmetics', label: tr.tasks.storeCatCosmetics, Icon: Palette },
  ];
  const filteredProducts = storeCategory === 'all'
    ? starProducts
    : starProducts.filter(p => CATEGORY_MAP[storeCategory]?.includes(p.effectType));

  return (
    <div className="flex flex-col pb-28 animate-in fade-in duration-500">

      {/* ══ MODALS ══ */}
      {successProduct && (
        <StarsPurchaseSuccess product={successProduct} onClose={() => setSuccessProduct(null)} />
      )}

      {confirmProduct && (() => {
        const cm: ConfirmMeta = CONFIRM_META[confirmProduct.effectType] ?? { Icon: Gem, color: '#34d399', glow: 'rgba(52,211,153,0.35)' };
        const ConfirmIcon = cm.Icon;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
            style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}>
            <div className="w-full max-w-sm rounded-3xl overflow-hidden animate-in zoom-in-90 duration-300"
              style={{ background: 'linear-gradient(180deg,hsl(224,71%,7%) 0%,hsl(224,71%,3%) 100%)', border: `1px solid ${cm.color}30`, boxShadow: `0 0 0 1px rgba(255,255,255,0.04) inset,0 8px 60px ${cm.glow}60` }}>
              <div className="h-px w-full" style={{ background: `linear-gradient(90deg,transparent 5%,${cm.color}cc 50%,transparent 95%)` }} />
              <div className="px-6 pt-7 pb-4 flex flex-col items-center text-center gap-4">
                <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
                  style={{ background: `linear-gradient(145deg,${cm.color}28 0%,${cm.color}0a 100%)`, border: `1.5px solid ${cm.color}50`, boxShadow: `0 0 40px ${cm.glow}70` }}>
                  {confirmProduct.imageUrl
                    ? <img src={confirmProduct.imageUrl} alt={confirmProduct.title} className="w-12 h-12 rounded-2xl object-cover" />
                    : <ConfirmIcon className="w-9 h-9" style={{ color: cm.color }} strokeWidth={1.25} />}
                </div>
                <div>
                  <h3 className="font-black text-white text-xl leading-tight">{confirmProduct.title}</h3>
                  {confirmProduct.description && <p className="text-xs text-white/40 mt-1">{confirmProduct.description}</p>}
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-2xl"
                  style={{ background: `${cm.color}10`, border: `1px solid ${cm.color}30` }}>
                  <span className="text-2xl font-black text-white">{confirmProduct.priceStars.toLocaleString()}</span>
                  <Star className="w-5 h-5 fill-amber-400 text-amber-400" strokeWidth={0} />
                  <span className="text-[11px] text-white/35">{tr.tasks.telegramStars}</span>
                </div>
              </div>
              {confirmProduct.benefitsBullets && (
                <div className="mx-5 mb-5 px-4 py-3 rounded-2xl"
                  style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${cm.color}18` }}>
                  <ul className="flex flex-col gap-2">
                    {confirmProduct.benefitsBullets.split('\n').filter(Boolean).map((bullet, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-white/75 leading-snug">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: cm.color }} strokeWidth={2} />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="px-5 pb-7 flex flex-col gap-2">
                <button onClick={handleConfirmPurchase} disabled={!!purchasingProduct}
                  className="w-full h-12 rounded-2xl font-black text-sm flex items-center justify-center transition-all active:scale-[0.97] disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg,${cm.color} 0%,${cm.color}cc 100%)`, color: '#000', boxShadow: `0 4px 28px ${cm.glow}80` }}>
                  {purchasingProduct ? <Loader2 className="w-4 h-4 animate-spin" /> : tr.tasks.confirmPayBtn(confirmProduct.priceStars)}
                </button>
                <button onClick={() => { haptic('light'); setConfirmProduct(null); }}
                  className="w-full h-10 rounded-xl text-xs font-semibold text-white/30 hover:text-white/60 transition-colors uppercase tracking-wide">
                  {tr.squad.cancel}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showSurveyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-white mb-2">Monlix Offer Wall</h3>
            <p className="text-sm text-muted-foreground mb-6">Select a survey to complete. Rewards vary.</p>
            <div className="space-y-3">
              {[1, 2, 3].map(n => (
                <button key={n} onClick={completeFakeSurvey}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors text-left">
                  <span className="text-sm font-medium text-white">Survey Partner {n}</span>
                  <span className="text-xs text-primary font-bold">500-2k pts</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowSurveyModal(false)} className="mt-6 w-full py-3 text-sm text-muted-foreground font-medium">Cancel</button>
          </div>
        </div>
      )}

      {/* ══ TAB BAR ══ */}
      <div className="px-4 pt-3 pb-2.5">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {TASK_TABS.map(tab => {
            const isActive = taskTab === tab.id;
            const TabIcon = tab.icon;
            return (
              <button key={tab.id} onClick={() => { haptic('light'); setTaskTab(tab.id); }}
                className="flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl transition-all duration-200 active:scale-95"
                style={isActive
                  ? { background: `${tab.color}1e`, border: `1px solid ${tab.color}35`, boxShadow: `0 0 10px ${tab.color}20` }
                  : { border: '1px solid transparent' }}>
                <TabIcon className="w-4 h-4" style={{ color: isActive ? tab.color : 'rgba(255,255,255,0.28)' }} />
                <span className="text-[9px] font-bold leading-none" style={{ color: isActive ? tab.color : 'rgba(255,255,255,0.28)' }}>
                  {isAr ? tab.ar : tab.en}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ══ CONTENT ══ */}
      <div className="px-4 flex flex-col gap-5 pt-1">

        {/* ────── DAILY TAB ────── */}
        {taskTab === 'daily' && <>

          {/* Daily progress card */}
          <section>
            <div className="rounded-2xl p-4"
              style={{ background: 'linear-gradient(135deg,rgba(52,211,153,0.08),rgba(52,211,153,0.02))', border: '1px solid rgba(52,211,153,0.15)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  <h2 className="text-base font-bold text-white">{tr.tasks.dailyRewards}</h2>
                </div>
                <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20 tabular-nums">
                  {dailyDone}/{dailyGames.length}
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden mb-3">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${dailyPct}%`, background: 'linear-gradient(90deg,hsl(152,76%,42%),hsl(152,76%,55%))' }} />
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
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)' }}>
                  <Radio className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-sm font-bold text-white">{tr.tasks.dailyCipher}</span>
              </div>
              <span className="text-[11px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">+15,000 pts</span>
            </div>
            <div className={`bg-card border ${cipherError ? 'border-red-500/50 translate-x-1' : 'border-white/5'} rounded-xl p-4 transition-all duration-100`}>
              {cipherSolved ? (
                <div className="text-center py-4 text-emerald-400 font-bold flex flex-col items-center gap-2">
                  <Check className="w-8 h-8" />{tr.tasks.cipherSolved}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="text-center">
                    <div className="text-2xl tracking-widest font-mono text-primary font-bold">{morseCode}</div>
                    <div className="text-xs text-muted-foreground mt-2">{tr.tasks.decodeMorse}</div>
                  </div>
                  <input type="text" data-testid="input-cipher-guess" value={cipherGuess}
                    onChange={e => setCipherGuess(e.target.value.toUpperCase())}
                    maxLength={dailyWord.length} placeholder={`${dailyWord.length}-letter word`}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-center text-xl font-bold text-white tracking-widest focus:outline-none focus:border-primary uppercase" />
                  <div className="flex gap-2">
                    {showCipherHint && (
                      <button onClick={() => setCipherGuess(dailyWord[0])} className="flex-1 bg-white/10 text-white font-bold py-3 rounded-lg">
                        {tr.tasks.revealHint}
                      </button>
                    )}
                    <button data-testid="button-cipher-submit" onClick={handleCipherSubmit}
                      disabled={cipherGuess.length !== dailyWord.length}
                      className="flex-[2] bg-primary text-black font-bold py-3 rounded-lg disabled:opacity-50">
                      {tr.tasks.submit}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Daily Combo */}
          <section>
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(245,197,24,0.12)', border: '1px solid rgba(245,197,24,0.2)' }}>
                  <Sparkles className="w-3.5 h-3.5" style={{ color: '#f5c518' }} />
                </div>
                <span className="text-sm font-bold text-white">{tr.tasks.dailyCombo}</span>
              </div>
              <span className="text-[11px] font-black px-2 py-0.5 rounded-full border"
                style={{ color: '#f5c518', background: 'rgba(245,197,24,0.08)', borderColor: 'rgba(245,197,24,0.2)' }}>+25,000 pts</span>
            </div>
            <div className="bg-card border border-white/5 rounded-xl p-4">
              {comboResult === 'success' ? (
                <div className="text-center py-4 text-emerald-400 font-bold flex flex-col items-center gap-2">
                  <Check className="w-8 h-8" />{tr.tasks.comboSolved}
                </div>
              ) : comboResult === 'failed' ? (
                <div className="text-center py-4 text-red-400 font-bold flex flex-col items-center gap-2">
                  <Lock className="w-8 h-8" />{tr.tasks.comboFailed}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-center gap-3">
                    {[0, 1, 2].map(i => {
                      const sel = selectedCombo[i];
                      const entry = sel ? COMBO_ICONS.find(c => c.id === sel) : null;
                      return (
                        <div key={i} className="w-14 h-14 rounded-xl border-2 border-white/10 bg-white/5 flex items-center justify-center">
                          {entry && <entry.icon className="w-6 h-6 text-primary" />}
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {COMBO_ICONS.map(({ id, icon: Icon }) => (
                      <button key={id} onClick={() => toggleCombo(id)}
                        className={`p-3 rounded-xl border flex items-center justify-center transition-colors ${selectedCombo.includes(id) ? 'bg-primary/20 border-primary' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                        <Icon className={`w-6 h-6 ${selectedCombo.includes(id) ? 'text-primary' : 'text-white'}`} />
                      </button>
                    ))}
                  </div>
                  <button onClick={checkCombo} disabled={selectedCombo.length !== 3}
                    className="w-full bg-primary text-black font-bold py-3 rounded-lg disabled:opacity-50">
                    {isAr ? 'تحقق' : 'Check Combo'}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Daily Spin Wheel */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(244,114,182,0.12)', border: '1px solid rgba(244,114,182,0.2)' }}>
                <Disc3 className="w-3.5 h-3.5" style={{ color: '#f472b6' }} />
              </div>
              <span className="text-sm font-bold text-white">{tr.tasks.dailySpin}</span>
              <span className="text-[11px] font-black px-2 py-0.5 rounded-full border ms-auto"
                style={{ color: '#f472b6', background: 'rgba(244,114,182,0.08)', borderColor: 'rgba(244,114,182,0.2)' }}>+5,000 pts</span>
            </div>
            <div className="rounded-[28px] p-6 flex flex-col items-center overflow-hidden relative"
              style={{ background: 'linear-gradient(135deg,rgba(52,211,153,0.06) 0%,rgba(52,211,153,0.02) 60%,transparent 100%)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', border: '1px solid rgba(52,211,153,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05),0 32px 64px rgba(0,0,0,0.4)' }}>
              <div className="relative w-52 h-52 mb-7">
                <div className="absolute inset-0 rounded-full"
                  style={{ background: 'radial-gradient(circle,rgba(52,211,153,0.18) 0%,transparent 70%)', filter: 'blur(14px)', animation: isSpinning ? 'vaultPulse 1.5s ease-in-out infinite' : 'none' }} />
                <div className="absolute inset-0 rounded-full"
                  style={{ background: 'conic-gradient(from 0deg,rgba(52,211,153,0.4),rgba(52,211,153,0.05),rgba(52,211,153,0.4),rgba(52,211,153,0.05),rgba(52,211,153,0.4))', padding: '3px', boxShadow: '0 0 30px rgba(52,211,153,0.15),inset 0 0 20px rgba(0,0,0,0.5)' }}>
                  <div className="w-full h-full rounded-full transition-transform ease-[cubic-bezier(0.1,0.7,0.1,1)] relative"
                    style={{ background: `conic-gradient(${spinWheelGradient})`, transform: `rotate(${spinRotation}deg)`, transitionDuration: isSpinning ? '3s' : '0s', boxShadow: 'inset 0 0 24px rgba(0,0,0,0.6)' }}>
                    {SPIN_SEGMENTS.map((_, i) => (
                      <div key={`l${i}`} className="absolute top-1/2 left-1/2 origin-left"
                        style={{ width: '50%', height: '1px', background: 'rgba(52,211,153,0.12)', transform: `rotate(${(i * 360) / SPIN_SEGMENTS.length}deg)` }} />
                    ))}
                    {SPIN_SEGMENTS.map((reward, i) => {
                      const rotation = (i * 360) / SPIN_SEGMENTS.length + (180 / SPIN_SEGMENTS.length);
                      return (
                        <div key={i} className="absolute w-full h-full flex justify-center items-start pt-3 font-black text-xs"
                          style={{ transform: `rotate(${rotation}deg)` }}>
                          <span className={`origin-bottom tabular-nums ${reward === 5000 ? 'text-white' : 'text-primary/80'}`}>
                            {reward >= 1000 ? `${reward / 1000}k` : reward}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-5 h-7 z-20"
                  style={{ background: 'linear-gradient(180deg,hsl(152,76%,60%) 0%,hsl(152,76%,40%) 100%)', clipPath: 'polygon(50% 100%,0 0,100% 0)', filter: 'drop-shadow(0 2px 6px rgba(52,211,153,0.6))' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full flex items-center justify-center z-10"
                  style={{ background: 'radial-gradient(circle at 35% 25%,rgba(52,211,153,0.25) 0%,hsl(224,50%,8%) 70%)', border: '1px solid rgba(52,211,153,0.25)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1),0 0 20px rgba(52,211,153,0.25)' }}>
                  <Disc3 className={`w-6 h-6 text-primary ${isSpinning ? 'animate-spin' : ''}`} />
                </div>
              </div>
              <button data-testid="button-spin-wheel" onClick={handleSpin} disabled={spinHasSpun || isSpinning}
                className="w-full font-bold py-3.5 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={spinHasSpun || isSpinning
                  ? { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }
                  : { background: 'linear-gradient(135deg,hsl(152,76%,50%) 0%,hsl(152,76%,42%) 100%)', color: 'hsl(224,71%,4%)', boxShadow: '0 0 24px rgba(52,211,153,0.35)' }}>
                {isSpinning
                  ? (isAr ? 'يدور...' : 'Spinning...')
                  : spinHasSpun
                    ? (isAr ? 'عُد غداً' : 'Come back tomorrow')
                    : (isAr ? 'أدر العجلة' : 'Spin Wheel')}
              </button>
            </div>
          </section>

          {/* Airdrop Banner */}
          <section>
            <div className="bg-gradient-to-r from-primary/20 to-transparent border border-primary/40 rounded-xl p-4 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-2">
                <Gift className="w-6 h-6 text-primary animate-bounce" />
                <h2 className="text-base font-bold text-white">{isAr ? 'إيردروب SouqrateX' : 'SouqrateX Airdrop'}</h2>
              </div>
              <p className="text-xs text-primary/80 mb-4">
                {isAr ? 'اجمع المزيد من النقاط قبل اللقطة!' : 'Accumulate more points before the snapshot!'}
              </p>
              <div className="flex gap-2">
                {[
                  { l: isAr ? 'يوم' : 'Days', v: airdropTime.d },
                  { l: isAr ? 'ساعة' : 'Hours', v: airdropTime.h },
                  { l: isAr ? 'دقيقة' : 'Mins', v: airdropTime.m },
                  { l: isAr ? 'ثانية' : 'Secs', v: airdropTime.s },
                ].map((t, i) => (
                  <div key={i} className="flex-1 bg-black/40 border border-primary/20 rounded-lg p-2 flex flex-col items-center">
                    <span className="text-xl font-bold text-white tabular-nums">{t.v.toString().padStart(2, '0')}</span>
                    <span className="text-[10px] text-primary uppercase">{t.l}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

        </>}

        {/* ────── EARN TAB ────── */}
        {taskTab === 'earn' && <>

          {/* Watch & Earn */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(245,197,24,0.12)', border: '1px solid rgba(245,197,24,0.2)' }}>
                <PlayCircle className="w-3.5 h-3.5" style={{ color: '#f5c518' }} />
              </div>
              <span className="text-sm font-bold text-white">{isAr ? 'شاهد واكسب' : 'Watch & Earn'}</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {/* Ad slot 1 */}
              <div className="rounded-xl p-4 flex items-center gap-3"
                style={{ background: 'linear-gradient(135deg,rgba(245,197,24,0.08) 0%,rgba(4,6,14,0.97) 100%)', border: '1px solid rgba(245,197,24,0.14)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(245,197,24,0.12)', border: '1px solid rgba(245,197,24,0.2)' }}>
                  <PlayCircle className="w-5 h-5" style={{ color: '#f5c518' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white">{isAr ? 'شاهد إعلاناً مكافئاً' : 'Watch a rewarded ad'}</h3>
                  <p className="text-xs font-bold mt-0.5" style={{ color: '#f5c518' }}>
                    {config?.adsgram.enabled ? `+${config.adsgram.rewardPoints.toLocaleString()} pts` : tr.tasks.notActivated}
                  </p>
                </div>
                <button data-testid="button-watch-ad" onClick={handleWatchAd}
                  disabled={!config?.adsgram.enabled || adLoading}
                  className="h-9 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-all"
                  style={{ background: 'linear-gradient(135deg,#f5c518,#f59e0b)', color: '#000', boxShadow: '0 2px 10px rgba(245,197,24,0.3)' }}>
                  {adLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isAr ? 'شاهد' : 'Watch')}
                </button>
              </div>
              {/* Ad slot 2 */}
              {config?.adsgram.enabled && config.adsgram.bannerBlockId && (
                <div className="rounded-xl p-4 flex items-center gap-3"
                  style={{ background: 'linear-gradient(135deg,rgba(56,189,248,0.08) 0%,rgba(4,6,14,0.97) 100%)', border: '1px solid rgba(56,189,248,0.14)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.2)' }}>
                    <PlayCircle className="w-5 h-5" style={{ color: '#38bdf8' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white">{isAr ? 'إعلان مكافأة آخر' : 'Watch another ad'}</h3>
                    <p className="text-xs font-bold mt-0.5" style={{ color: '#38bdf8' }}>+{config.adsgram.rewardPoints.toLocaleString()} pts</p>
                  </div>
                  <button data-testid="button-watch-banner-ad" onClick={handleWatchAd}
                    disabled={bannerAdLoading}
                    className="h-9 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-all"
                    style={{ background: 'linear-gradient(135deg,#38bdf8,#0284c7)', color: '#000', boxShadow: '0 2px 10px rgba(56,189,248,0.3)' }}>
                    {bannerAdLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isAr ? 'شاهد' : 'Watch')}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Sponsored Ads */}
          {sponsoredAds.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.2)' }}>
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" strokeWidth={0} />
                </div>
                <span className="text-sm font-bold text-white">{isAr ? 'عروض مدفوعة' : 'Sponsored Offers'}</span>
              </div>
              <div className="space-y-2.5">
                {sponsoredAds.map(ad => {
                  const isClaiming = claimingAdId === ad.id;
                  const remaining = adRemainingSeconds[ad.id];
                  const isWaiting = Boolean(ad.startedAt) && !ad.claimed && (remaining === undefined || remaining > 0);
                  const canClaim = Boolean(ad.startedAt) && !ad.claimed && remaining !== undefined && remaining <= 0;
                  return (
                    <div key={ad.id} data-testid={`row-sponsored-ad-${ad.id}`}
                      className="rounded-xl p-4 flex items-center gap-3"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      {ad.imageUrl && <img src={ad.imageUrl} alt={ad.title} className="w-11 h-11 rounded-xl object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white text-sm leading-tight truncate">{ad.title}</h3>
                        {ad.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{ad.description}</p>}
                        <p className="text-xs font-bold text-primary mt-0.5">+{ad.rewardPoints.toLocaleString()} pts</p>
                      </div>
                      <button data-testid={`button-sponsored-ad-${ad.id}`} onClick={() => handleAdAction(ad)}
                        disabled={ad.claimed || isClaiming || isWaiting}
                        className="min-w-[80px] h-9 text-xs font-bold rounded-lg flex items-center justify-center gap-1 disabled:opacity-40 transition-colors"
                        style={ad.claimed
                          ? { background: 'rgba(52,211,153,0.08)', color: '#34d399' }
                          : { background: 'linear-gradient(135deg,#f5c518,#f59e0b)', color: '#000' }}>
                        {ad.claimed
                          ? <><Check className="w-3.5 h-3.5" />{isAr ? 'تم' : 'Done'}</>
                          : isClaiming ? <Loader2 className="w-4 h-4 animate-spin" />
                          : canClaim ? (isAr ? 'استلام' : 'Claim')
                          : isWaiting ? `${remaining ?? ad.minWatchSeconds}s`
                          : <>{isAr ? 'افتح' : 'Open'}<ExternalLink className="w-3 h-3" /></>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Offerwalls */}
          {(() => {
            const activeOffers = (config?.offerwalls ?? []).filter(o => o.enabled && o.id !== 'adgem');
            if (activeOffers.length === 0) return null;
            return (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.2)' }}>
                    <Globe className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} />
                  </div>
                  <span className="text-sm font-bold text-white">{isAr ? 'عروض واستطلاعات' : 'Offers & Surveys'}</span>
                </div>
                <div className="space-y-2.5">
                  {activeOffers.map(offer => {
                    const isGigaPub = offer.id === 'gigapub';
                    const gigapubProjectId = isGigaPub
                      ? (offer as unknown as { meta?: { projectId?: string } }).meta?.projectId ?? '7352'
                      : '';
                    return (
                      <div key={offer.id} className="rounded-xl p-4 flex items-center justify-between"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div className="flex-1 pr-3">
                          <h3 className="font-semibold text-white text-sm">{offer.name}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">{isAr ? 'أكمل عروض واربح SKX' : 'Complete offers & earn SKX'}</p>
                        </div>
                        {isGigaPub ? (
                          <button
                            data-testid="button-offerwall-gigapub"
                            disabled={gigapubLoading}
                            onClick={() => openGigaPub(gigapubProjectId)}
                            className="h-9 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            style={{ background: 'rgba(168,85,247,0.15)', color: '#a78bfa', border: '1px solid rgba(168,85,247,0.25)' }}>
                            {gigapubLoading
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <>{isAr ? 'افتح' : 'Open'}<Zap className="w-3 h-3" /></>}
                          </button>
                        ) : (
                          <button data-testid={`button-offerwall-${offer.id}`} onClick={() => openOfferwall(offer)}
                            className="h-9 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                            style={{ background: 'rgba(168,85,247,0.15)', color: '#a78bfa', border: '1px solid rgba(168,85,247,0.25)' }}>
                            {isAr ? 'افتح' : 'Open'}<ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}

          {/* Partner Tasks */}
          {partnerTasks.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)' }}>
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-sm font-bold text-white">{isAr ? 'مهام الشركاء' : 'Partner Tasks'}</span>
              </div>
              <div className="space-y-2.5">
                {partnerTasks.map(task => {
                  const localState = partnerTaskStates[task.id];
                  const isDone = localState === 'done' || (localState === undefined && task.completed);
                  const isLoading = localState === 'loading';
                  const isVerify = localState === 'verify';
                  const isVerifying = localState === 'verifying';
                  return (
                    <div key={task.id} className="rounded-xl p-4 flex items-center gap-3"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)' }}>{task.iconEmoji}</div>
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
                        <button data-testid={`button-partner-task-${task.id}`}
                          onClick={() => handlePartnerTaskAction(task)}
                          disabled={isLoading || isVerifying}
                          className="min-w-[80px] h-9 text-xs font-bold rounded-lg flex items-center justify-center transition-all shrink-0"
                          style={isVerify
                            ? { background: 'hsl(152,76%,55%)', color: 'hsl(224,71%,4%)', boxShadow: '0 0 12px rgba(52,211,153,0.3)' }
                            : { background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}>
                          {(isLoading || isVerifying) ? <Loader2 className="w-4 h-4 animate-spin" />
                            : isVerify ? (isAr ? 'تحقق ✓' : 'Verify ✓')
                            : (isAr ? 'انضم' : 'Join')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Empty earn state */}
          {!config?.adsgram.enabled && sponsoredAds.length === 0 &&
            (config?.offerwalls ?? []).filter(o => o.enabled && o.id !== 'adgem').length === 0 &&
            partnerTasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.15)' }}>
                <Zap className="w-7 h-7" style={{ color: '#f5c518', opacity: 0.4 }} />
              </div>
              <p className="text-sm text-white/30 font-medium text-center">
                {isAr ? 'قريباً — شبكات الإعلانات قيد التفعيل' : 'Coming soon — ad networks pending activation'}
              </p>
            </div>
          )}

        </>}

        {/* ────── CHALLENGES TAB ────── */}
        {taskTab === 'challenges' && <>

          {/* Referral Races — hidden */}
          {false && raceComps.map(comp => {
            const required = comp.requiredInvites ?? 100;
            const progress = comp.entered ? Math.min(1, comp.myProgress / required) : 0;
            const pct = Math.round(progress * 100);
            const leaderboard = raceLeaderboards[comp.id] ?? [];
            const top3 = leaderboard.slice(0, 3);
            const countdown = raceCountdowns[comp.id] ?? '...';
            const isJoining = joiningRaceId === comp.id;
            const barColor = pct >= 100 ? '#22c55e' : pct >= 90 ? '#ef4444' : pct >= 66 ? '#f97316' : pct >= 33 ? '#f59e0b' : '#6366f1';
            const glowColor = pct >= 90 ? 'rgba(239,68,68,0.4)' : pct >= 66 ? 'rgba(249,115,22,0.3)' : pct >= 33 ? 'rgba(245,158,11,0.25)' : 'rgba(99,102,241,0.2)';
            const MEDALS = ['🥇', '🥈', '🥉'];
            const myRank = leaderboard.findIndex(e => e.gained === comp.myProgress) + 1;
            return (
              <section key={comp.id}>
                <div className="relative overflow-hidden rounded-2xl border border-orange-500/25"
                  style={{ background: 'linear-gradient(135deg,rgba(249,115,22,0.08) 0%,rgba(239,68,68,0.06) 50%,rgba(17,24,39,0.95) 100%)' }}>
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: `radial-gradient(ellipse at top right,${glowColor},transparent 70%)` }} />
                  <div className="relative p-4 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0"
                          style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)' }}>🔥</div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400">{tr.tasks.referralRace}</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                          </div>
                          <h3 className="text-white font-bold text-sm leading-tight">
                            {lang === 'en' && comp.titleEn ? comp.titleEn : comp.title ?? comp.titleEn}
                          </h3>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-orange-300/70 text-[10px]">
                          <Timer className="w-3 h-3" />{tr.tasks.endsIn}
                        </div>
                        <div className="font-mono text-sm font-bold text-orange-300">{countdown}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-white/[0.04] rounded-xl px-3 py-2 border border-white/5">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-yellow-400" />
                        <span className="text-xs text-white/70">{tr.tasks.grandPrize}</span>
                      </div>
                      <span className="text-yellow-400 font-bold text-sm">{comp.prizePoints.toLocaleString()} SKP</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/50 flex items-center gap-1">
                        <Users className="w-3 h-3" />{tr.tasks.targetReferrals(required)}
                      </span>
                      {comp.entered && (
                        <span className={`font-bold ${pct >= 100 ? 'text-green-400' : pct >= 66 ? 'text-orange-400' : 'text-white/70'}`}>
                          {tr.tasks.progressLabel} {comp.myProgress} / {required}
                          {myRank > 0 && myRank <= 20 && <span className="mr-1 text-primary"> #{myRank}</span>}
                        </span>
                      )}
                    </div>
                    {comp.entered && (
                      <div className="space-y-1">
                        <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: barColor, boxShadow: `0 0 8px ${barColor}` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-white/30">
                          <span>0</span>
                          <span className={pct >= 33 ? 'text-white/50' : ''}>{Math.round(required * 0.33)}</span>
                          <span className={pct >= 66 ? 'text-orange-400/70' : ''}>{Math.round(required * 0.66)}</span>
                          <span className={pct >= 100 ? 'text-green-400' : ''}>{required}</span>
                        </div>
                      </div>
                    )}
                    {top3.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">{tr.tasks.leaderboardLabel}</p>
                        {top3.map((entry, i) => (
                          <div key={i} className="flex items-center gap-2 bg-white/[0.03] rounded-lg px-3 py-1.5">
                            <span className="text-base w-6 text-center">{MEDALS[i]}</span>
                            <span className="flex-1 text-sm text-white truncate">{entry.name}</span>
                            <span className="text-xs font-bold"
                              style={{ color: i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : '#b87333' }}>
                              {entry.gained}/{required}
                            </span>
                            <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                              <div className="h-full rounded-full"
                                style={{ width: `${Math.min(100, (entry.gained / required) * 100)}%`, background: i === 0 ? '#fbbf24' : barColor }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {!comp.entered ? (
                      <button onClick={() => handleJoinRace(comp)} disabled={isJoining}
                        className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                        style={{ background: 'linear-gradient(135deg,#f97316,#ef4444)', color: 'white', boxShadow: '0 4px 20px rgba(249,115,22,0.4)' }}>
                        {isJoining ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Flame className="w-4 h-4" />{tr.tasks.joinFree}</>}
                      </button>
                    ) : pct < 100 ? (
                      <div className="text-center text-xs text-white/40 py-1">{tr.tasks.shareToClimb}</div>
                    ) : (
                      <div className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                        style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
                        <Check className="w-4 h-4" />{tr.tasks.goalReached}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}

          {/* Group Challenges */}
          {groupChallenges.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.2)' }}>
                  <Users className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} />
                </div>
                <span className="text-sm font-bold text-white">{isAr ? 'تحديات الدعوة' : 'Invite Challenges'}</span>
              </div>
              <div className="space-y-2.5">
                {groupChallenges.map(challenge => {
                  const current = challenge.currentInvites ?? 0;
                  const required = challenge.requiredInvites;
                  const canClaim = current >= required;
                  const isClaiming = claimingChallengeId === challenge.id;
                  return (
                    <div key={challenge.id} className="rounded-xl p-4"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                          style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>{challenge.iconEmoji}</div>
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
                          <button onClick={() => handleClaimGroupChallenge(challenge)}
                            disabled={isClaiming || (!canClaim && !challenge.channelUrl)}
                            className="min-w-[80px] h-9 text-xs font-bold rounded-lg flex items-center justify-center transition-all shrink-0"
                            style={canClaim
                              ? { background: 'hsl(270,76%,55%)', color: 'white', boxShadow: '0 0 12px rgba(168,85,247,0.35)' }
                              : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            {isClaiming ? <Loader2 className="w-4 h-4 animate-spin" />
                              : canClaim ? (isAr ? 'استلام 🎁' : 'Claim 🎁')
                              : challenge.channelUrl ? (isAr ? 'انضم' : 'Join')
                              : `${current}/${required}`}
                          </button>
                        )}
                      </div>
                      {!challenge.completed && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-muted-foreground">{isAr ? 'الدعوات' : 'Invites'}</span>
                            <span className={canClaim ? 'text-purple-400 font-bold' : 'text-white/60'}>{current}/{required}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, (current / required) * 100)}%`, background: canClaim ? 'linear-gradient(90deg,hsl(270,76%,55%),hsl(290,76%,65%))' : 'linear-gradient(90deg,rgba(168,85,247,0.5),rgba(168,85,247,0.3))' }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Empty challenges state */}
          {groupChallenges.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)' }}>
                <Trophy className="w-7 h-7" style={{ color: '#a78bfa', opacity: 0.4 }} />
              </div>
              <p className="text-sm text-white/30 font-medium text-center">
                {isAr ? 'لا توجد تحديات حالياً' : 'No active challenges'}
              </p>
            </div>
          )}

          {/* Achievements */}
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

        </>}

      </div>
    </div>
  );
};
