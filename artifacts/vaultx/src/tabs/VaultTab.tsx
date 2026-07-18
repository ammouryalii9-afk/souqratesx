// === EXTERNAL INTEGRATIONS (Future) ===
// [Cloudflare Secure Webhook Gateway] — handles high-traffic mining sync requests
// [Supabase Real-time DB] — sync tempMiningPoints, energy, miningLevel in real-time
// [AdsGram SDK] — AdController.show() triggers reward video before claim
// [Binance Pay API] — processes USD withdrawal requests
// [Telegram Stars & Fragment API] — in-app purchases for premium upgrades
// [Sentry.io SDK] — error tracking and performance monitoring

import { useState, useCallback, useEffect, useRef } from 'react';
import { useVault, getLeague } from '../context/VaultContext';
import { getEngageStatus, type EngageStatus } from '../lib/engageApi';
import { ExchangeSelector } from '../components/ExchangeSelector';
import { WithdrawModal } from '../components/WithdrawModal';
import { useToast } from '@/hooks/use-toast';
import { haptic } from '../lib/telegram';
import { Download, Zap, ShieldAlert, CheckCircle2, Battery, FastForward, Sprout, Vault, Copy, Check, ArrowLeftRight, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { getPublicConfig, claimAdsgramReward, claimMonetagReward, claimOnclickaReward, type PublicConfig } from '../lib/gameApi';
import { watchRewardedAdWithFallback } from '../lib/adFallback';
import { useLanguage } from '../lib/i18n';

interface FloatingPoint {
  id: number;
  x: number;
  y: number;
  value: number;
}

let floatId = 0;

const sg = (a: number) => `rgba(52,211,153,${a})`;
const ACCENT = '#34d399';

export const VaultTab = () => {
  const { 
    userId,
    totalBalanceUSD, tempMiningPoints, miningLevel, energy, maxEnergy, claimEarnings, tapMine,
    activeTurbo, turboExpiresAt, turboUsesToday, activateTurbo, grantAdTurbo,
    rechargeUsesToday, rechargeEnergy, setEnergy,
    farmState, farmStartTime, startFarming, claimFarming,
    lifetimePoints, availablePoints, profitPerHour, addBonusPoints,
    totalReferrals, referralUsdCents, transferReferralUsd,
    refreshFromServer,
  } = useVault();

  const { tr } = useLanguage();
  const [idCopied, setIdCopied] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const referralLink = userId ? `${window.location.origin}/ref/${userId}` : '';
  function copyReferralLink() {
    if (!referralLink) return;
    void navigator.clipboard.writeText(referralLink).then(() => {
      setReferralCopied(true);
      haptic('success');
      setTimeout(() => setReferralCopied(false), 2000);
    });
  }
  async function handleTransferReferralUsd() {
    if (transferring || referralUsdCents <= 0) return;
    setTransferring(true);
    haptic('medium');
    try {
      await transferReferralUsd();
      haptic('success');
      toast({ title: 'Transferred to Pixels balance!', description: `$${(referralUsdCents / 100).toFixed(2)} added to your Pixels wallet` });
    } catch {
      toast({ title: 'Transfer failed', description: 'Please try again', variant: 'destructive' });
    } finally {
      setTransferring(false);
    }
  }
  function copyUserId() {
    void navigator.clipboard.writeText(userId).then(() => {
      setIdCopied(true);
      haptic('light');
      setTimeout(() => setIdCopied(false), 1500);
    });
  }
  const { toast } = useToast();

  const [isClaiming, setIsClaiming] = useState(false);
  const [claimProgress, setClaimProgress] = useState(0);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [floatingPoints, setFloatingPoints] = useState<FloatingPoint[]>([]);
  const [isTapping, setIsTapping] = useState(false);

  const [event, setEvent] = useState<EngageStatus['event'] | null>(null);
  const comboRef = useRef({ count: 0, last: 0 });
  const comboResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [comboMult, setComboMult] = useState(1);
  const [comboCount, setComboCount] = useState(0);

  const [adEnergyProgress, setAdEnergyProgress] = useState(() => Number(localStorage.getItem('adEnergyProgress')) || 0);
  const [adTurboProgress, setAdTurboProgress] = useState(() => Number(localStorage.getItem('adTurboProgress')) || 0);
  const [energyAdLoading, setEnergyAdLoading] = useState(false);
  const [turboAdLoading, setTurboAdLoading] = useState(false);
  
  const [turboRemaining, setTurboRemaining] = useState(0);
  const [farmProgress, setFarmProgress] = useState(0);
  const [farmYield, setFarmYield] = useState(0);

  const league = getLeague(lifetimePoints);
  const { selectedExchange, setSelectedExchange } = useVault();

  useEffect(() => {
    getPublicConfig().then(setConfig).catch(() => setConfig(null));
    getEngageStatus().then(s => setEvent(s.event)).catch(() => setEvent(null));
  }, []);

  useEffect(() => {
    localStorage.setItem('adEnergyProgress', adEnergyProgress.toString());
  }, [adEnergyProgress]);

  useEffect(() => {
    localStorage.setItem('adTurboProgress', adTurboProgress.toString());
  }, [adTurboProgress]);

  // Watch an ad and credit SKX server-side. Returns the provider that served it.
  const watchAndClaimAd = async () => {
    const provider = await watchRewardedAdWithFallback(config);
    // Fire-and-forget server SKX credit — failure must never block the client reward
    try {
      if (provider === 'adsgram') await claimAdsgramReward();
      else if (provider === 'monetag') await claimMonetagReward();
      else if (provider === 'onclicka') await claimOnclickaReward();
      // Sync updated skxBalance from server
      await refreshFromServer();
    } catch {
      // Non-critical: postback may have already credited via server-to-server
    }
    return provider;
  };

  const handleWatchAdForEnergy = async () => {
    if (energyAdLoading || energy >= maxEnergy) return;
    setEnergyAdLoading(true);
    try {
      await watchAndClaimAd();
      setAdEnergyProgress(prev => {
        const next = prev + 1;
        if (next >= 3) {
          setEnergy(maxEnergy);
          toast({ title: tr.vault.energyRefilledTitle, description: tr.vault.energyRefilledDesc });
          return 0;
        }
        toast({ title: tr.vault.adWatchedTitle, description: `${next}/3 videos watched` });
        return next;
      });
    } catch (err) {
      toast({ title: 'Ad not completed', description: err instanceof Error ? err.message : 'Try again later', variant: 'destructive' });
    } finally {
      setEnergyAdLoading(false);
    }
  };

  const handleWatchAdForTurbo = async () => {
    if (turboAdLoading || activeTurbo) return;
    setTurboAdLoading(true);
    try {
      await watchAndClaimAd();
      setAdTurboProgress(prev => {
        const next = prev + 1;
        if (next >= 3) {
          grantAdTurbo();
          toast({ title: tr.vault.turboActivatedTitle, description: tr.vault.turboActivatedDesc });
          return 0;
        }
        toast({ title: tr.vault.adWatchedTitle, description: `${next}/3 videos watched` });
        return next;
      });
    } catch (err) {
      toast({ title: 'Ad not completed', description: err instanceof Error ? err.message : 'Try again later', variant: 'destructive' });
    } finally {
      setTurboAdLoading(false);
    }
  };

  useEffect(() => {
    let timer: any;
    if (activeTurbo) {
      timer = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((turboExpiresAt - Date.now()) / 1000));
        setTurboRemaining(remaining);
      }, 1000);
    } else {
      setTurboRemaining(0);
    }
    return () => clearInterval(timer);
  }, [activeTurbo, turboExpiresAt]);

  useEffect(() => {
    let timer: any;
    if (farmState === 'farming') {
      timer = setInterval(() => {
        const elapsed = Date.now() - farmStartTime;
        const total = 8 * 3600 * 1000;
        setFarmProgress(Math.min(100, (elapsed / total) * 100));
        setFarmYield(Math.min(4000, Math.floor((elapsed / total) * 4000)));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [farmState, farmStartTime]);

  const idleCap = miningLevel === 1 ? 10800 : miningLevel === 2 ? 54000 : miningLevel === 3 ? 216000 : 1080000;
  const isCapped = tempMiningPoints >= idleCap;
  const pointsPerTap = miningLevel === 1 ? 1 : miningLevel === 2 ? 3 : miningLevel === 3 ? 10 : 50;

  const [showWithdraw, setShowWithdraw] = useState(false);

  const handleTap = useCallback((e: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    if (energy <= 0) return;

    let x = 50, y = 50;
    if ('touches' in e && e.touches.length > 0) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      x = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
      y = ((e.touches[0].clientY - rect.top) / rect.height) * 100;
    } else if ('clientX' in e) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      x = ((e.clientX - rect.left) / rect.width) * 100;
      y = ((e.clientY - rect.top) / rect.height) * 100;
    }

    const earned = tapMine();
    if (earned > 0) haptic('light');

    const now = Date.now();
    const c = comboRef.current;
    if (now - c.last < 600) c.count += 1; else c.count = 1;
    c.last = now;

    let cm = 1;
    if (c.count >= 30) cm = 3;
    else if (c.count >= 15) cm = 2;
    else if (c.count >= 5) cm = 1.5;

    const evMult = event?.active ? event.multiplier : 1;
    const totalMult = cm * evMult;
    if (earned > 0 && totalMult > 1) {
      const bonus = Math.round(earned * (totalMult - 1));
      if (bonus > 0) addBonusPoints(bonus);
    }
    if (cm >= 1.5) haptic('medium');
    setComboMult(cm);
    setComboCount(c.count);
    if (comboResetRef.current) clearTimeout(comboResetRef.current);
    comboResetRef.current = setTimeout(() => {
      comboRef.current.count = 0;
      setComboMult(1);
      setComboCount(0);
    }, 700);

    setIsTapping(true);
    setTimeout(() => setIsTapping(false), 120);

    const displayValue = earned > 0 ? Math.round(earned * totalMult) : earned;
    const id = floatId++;
    setFloatingPoints(prev => [...prev, { id, x, y, value: displayValue }]);
    setTimeout(() => {
      setFloatingPoints(prev => prev.filter(p => p.id !== id));
    }, 900);
  }, [energy, tapMine, event, addBonusPoints]);

  const runFallbackProgress = () => {
    setClaimProgress(0);
    const duration = 3000;
    const interval = 100;
    const steps = duration / interval;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      setClaimProgress((currentStep / steps) * 100);
      if (currentStep >= steps) {
        clearInterval(timer);
        claimEarnings()
          .then((result) => toast({
            title: tr.vault.successTitle,
            description: result
              ? tr.vault.converted(result.convertedSkp.toLocaleString(), result.receivedSkx.toLocaleString())
              : tr.vault.earningsTransferred,
          }))
          .catch(() => toast({ title: tr.vault.adNotCompleted, description: tr.vault.tryAgain, variant: "destructive" }))
          .finally(() => setIsClaiming(false));
      }
    }, interval);
  };

  const handleClaim = async () => {
    if (tempMiningPoints === 0 || isClaiming) return;
    setIsClaiming(true);
    setClaimProgress(0);

    const hasAnyAd = (config?.adsgram.enabled && config.adsgram.blockId) ||
                     (config?.monetag.enabled && config.monetag.zoneId) ||
                     (config?.onclicka.enabled && config.onclicka.spotId);

    if (!hasAnyAd) {
      runFallbackProgress();
      return;
    }

    try {
      await watchRewardedAdWithFallback(config);
      const result = await claimEarnings();
      setIsClaiming(false);
      toast({
        title: tr.vault.successTitle,
        description: result
          ? tr.vault.converted(result.convertedSkp.toLocaleString(), result.receivedSkx.toLocaleString())
          : tr.vault.earningsTransferred,
      });
    } catch (err) {
      setIsClaiming(false);
      toast({ title: tr.vault.adNotCompleted, description: err instanceof Error ? err.message : tr.vault.tryAgain, variant: "destructive" });
    }
  };

  return (
    <div
      className="flex flex-col space-y-5 pb-24 px-4 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-500 relative"
      style={{ '--skin-accent': ACCENT } as React.CSSProperties}
    >

      {/* Balance Card */}
      <div className="rounded-[28px] p-6 flex flex-col items-center relative overflow-hidden" style={{
        background: `linear-gradient(135deg, ${sg(0.07)} 0%, ${sg(0.02)} 60%, transparent 100%)`,
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        border: `1px solid ${sg(0.12)}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 32px 64px rgba(0,0,0,0.4)',
      }}>
        <div className="absolute inset-0 opacity-50" style={{ background: `linear-gradient(135deg, ${sg(0.1)}, transparent)` }} />
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-[50px] -mr-10 -mt-10" style={{ background: sg(0.18) }} />
        <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full blur-[50px] -ml-10 -mb-10" style={{ background: sg(0.08) }} />
        <h2 className="text-muted-foreground text-xs font-semibold mb-1 uppercase tracking-widest relative z-10">{tr.vault.totalBalance}</h2>
        <div className="flex items-end gap-3 mb-1 relative z-10">
          <div className="text-[40px] font-black text-white tracking-tighter drop-shadow-sm" style={{ textShadow: '0 2px 20px rgba(255,255,255,0.1)' }}>
            {availablePoints.toLocaleString()} <span className="text-xl text-primary">{tr.vault.skx}</span>
          </div>
          {(config?.dollarBonus ?? 0) > 0 && (
            <div className="mb-2 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.15))', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24' }}>
              <span>+${(config?.dollarBonus ?? 0).toFixed(2)}</span>
              <span className="text-[10px] font-semibold opacity-80">bonus</span>
            </div>
          )}
        </div>
        <div className="mb-5" />
        <div className="flex items-center gap-3 relative z-10 w-full">
          <button
            data-testid="button-withdraw"
            onClick={() => setShowWithdraw(true)}
            className="flex-1 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/40 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] shadow-inner"
          >
            {tr.vault.withdraw}
          </button>
          <div className="flex-1 py-2.5 bg-white/5 rounded-xl text-sm text-center text-white font-semibold border border-white/5 shadow-inner">
            {tr.vault.level} <span className="text-primary">{miningLevel}</span>
          </div>
        </div>
      </div>

      {/* Referral Banner */}
      {referralLink && (
        <div
          className="rounded-[22px] p-4 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(245,158,11,0.06) 60%, rgba(0,0,0,0.1) 100%)',
            border: '1px solid rgba(251,191,36,0.25)',
            boxShadow: '0 8px 32px rgba(251,191,36,0.08)',
          }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[50px] pointer-events-none" style={{ background: 'rgba(251,191,36,0.12)' }} />

          {/* Header row */}
          <div className="flex items-center gap-3 mb-3 relative z-10">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(251,191,36,0.18)', border: '1px solid rgba(251,191,36,0.3)' }}>
              <Users className="w-4.5 h-4.5" style={{ color: '#fbbf24' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white leading-tight">Invite Friends — Earn Real Money 🚀</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(251,191,36,0.8)' }}>
                <span className="font-black text-yellow-400">$0.02</span> per invite &nbsp;·&nbsp; <span className="font-black text-yellow-400">10%</span> of their earnings — forever
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-2 mb-3 relative z-10">
            <div className="flex-1 rounded-xl px-3 py-2 text-center" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <p className="text-[10px] text-yellow-400/70 uppercase tracking-wider font-semibold">Referrals</p>
              <p className="text-base font-black text-white">{totalReferrals}</p>
            </div>
            <div className="flex-1 rounded-xl px-3 py-2 text-center" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <p className="text-[10px] text-yellow-400/70 uppercase tracking-wider font-semibold">USD Earned</p>
              <p className="text-base font-black text-white">${(referralUsdCents / 100).toFixed(2)}</p>
            </div>
          </div>

          {/* Referral link row */}
          <div className="flex gap-2 mb-2.5 relative z-10">
            <div
              className="flex-1 min-w-0 px-3 py-2 rounded-xl text-[11px] font-mono truncate"
              style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}
            >
              {referralLink}
            </div>
            <button
              onClick={copyReferralLink}
              className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-black text-xs transition-all active:scale-95"
              style={{
                background: referralCopied ? 'rgba(34,197,94,0.2)' : 'linear-gradient(135deg,rgba(251,191,36,0.9),rgba(245,158,11,0.9))',
                border: referralCopied ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(251,191,36,0.4)',
                color: referralCopied ? '#22c55e' : '#000',
              }}
            >
              {referralCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {referralCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Transfer to Pixels button — only shown when there's a balance */}
          {referralUsdCents > 0 && (
            <button
              onClick={handleTransferReferralUsd}
              disabled={transferring}
              className="relative z-10 w-full py-2.5 rounded-xl font-black text-sm transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.15))', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24' }}
            >
              {transferring ? 'Transferring…' : `Transfer $${(referralUsdCents / 100).toFixed(2)} → Pixels Balance`}
            </button>
          )}
        </div>
      )}

      {/* Info Row */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-3 py-1 rounded-full border border-white/10 shadow-sm" style={{ background: `linear-gradient(135deg, ${league.color}40, ${league.color}10)`, color: league.color }}>
              <span className="mr-1.5">{league.icon}</span> {league.name} Miner
            </span>
            <ExchangeSelector selected={selectedExchange} onSelect={setSelectedExchange} />
          </div>
          {/* Copyable User ID badge */}
          <button
            onClick={copyUserId}
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 rounded-full px-3 py-1 transition-all"
            title="Copy your User ID"
          >
            <span className="text-[10px] text-muted-foreground">ID</span>
            <span className="text-[11px] font-bold text-white font-mono">{userId}</span>
            {idCopied
              ? <Check className="w-3 h-3 text-primary shrink-0" />
              : <Copy className="w-3 h-3 text-muted-foreground shrink-0" />}
          </button>
        </div>
        <div className="flex justify-between items-center text-xs font-bold bg-card/50 backdrop-blur-xl border border-white/5 rounded-xl px-4 py-3 shadow-inner">
          <span className="text-primary flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> +{profitPerHour.toLocaleString()} /hr</span>
        </div>
        {/* League Progress Bar */}
        {(() => {
          const thresholds = [0, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000];
          const labels = [
            { icon: '🥉', name: 'Silver' }, { icon: '🥈', name: 'Gold' },
            { icon: '🏆', name: 'Platinum' }, { icon: '💠', name: 'Diamond' },
            { icon: '💎', name: 'Master' }, { icon: '👑', name: '' },
          ];
          let idx = thresholds.length - 1;
          for (let i = thresholds.length - 1; i >= 0; i--) { if (lifetimePoints >= thresholds[i]) { idx = i; break; } }
          const isMax = idx >= thresholds.length - 1;
          const from = thresholds[idx], to = thresholds[Math.min(idx + 1, thresholds.length - 1)];
          const pct = isMax ? 100 : Math.min(100, Math.round(((lifetimePoints - from) / (to - from)) * 100));
          const needed = isMax ? 0 : to - lifetimePoints;
          const next = labels[idx];
          return (
            <div className="bg-card/40 backdrop-blur-xl border border-white/5 rounded-xl px-4 py-2.5">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">League Progress</span>
                {!isMax && next && (
                  <span className="text-[10px] font-semibold text-white/40">
                    {needed.toLocaleString()} pts → {next.icon} {next.name}
                  </span>
                )}
                {isMax && <span className="text-[10px] font-bold" style={{ color: ACCENT }}>MAX LEAGUE 👑</span>}
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${sg(0.7)}, ${ACCENT})` }} />
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── TAP TO MINE CORE ── */}
      <div className="flex flex-col items-center justify-center py-6 relative select-none">
        {comboMult > 1 && (
          <div
            className="mb-2 px-4 py-1.5 rounded-full flex items-center gap-2 animate-in zoom-in-90 duration-150"
            style={{
              background: 'linear-gradient(135deg, rgba(251,146,60,0.25), rgba(249,115,22,0.1))',
              border: '1px solid rgba(251,146,60,0.4)',
              boxShadow: '0 0 20px rgba(251,146,60,0.25)',
            }}
          >
            <span className="text-sm font-black text-orange-300">🔥 x{comboMult}</span>
            <span className="text-[10px] font-bold text-orange-200/80 uppercase tracking-wider">Combo {comboCount}</span>
          </div>
        )}
        <p className="text-xs text-primary/70 uppercase tracking-widest mb-6 font-semibold animate-pulse">
          {energy > 0 ? tr.vault.tapToMine : tr.vault.noEnergy}
        </p>

        <button
          data-testid="button-tap-mine"
          onClick={handleTap}
          onTouchStart={handleTap}
          disabled={energy <= 0}
          className="relative w-64 h-64 rounded-full focus:outline-none disabled:cursor-not-allowed group"
          style={{ transform: isTapping ? 'scale(0.95)' : 'scale(1)', transition: 'transform 0.1s cubic-bezier(0.4, 0, 0.2, 1)' }}
        >
          {/* Layer 1: Outer glow */}
          <div className="absolute inset-0 rounded-full" style={{ 
            background: `radial-gradient(circle, ${sg(0.08)} 0%, transparent 65%)`,
            animation: energy > 0 ? 'vaultPulse 3s ease-in-out infinite' : 'none'
          }} />

          {/* Layer 2: Rotating ring */}
          <div className="absolute inset-0 rounded-full" style={{ border: `1px solid ${sg(0.2)}`, animation: energy > 0 ? 'spin 14s linear infinite' : 'none' }}>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1 h-1 rounded-full" style={{ background: sg(0.5) }} />
            <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full" style={{ background: sg(0.5) }} />
            <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full" style={{ background: sg(0.5) }} />
          </div>

          {/* Layer 3: Inner reverse ring */}
          <div className="absolute inset-4 rounded-full" style={{ border: `1px solid ${sg(0.12)}`, animation: energy > 0 ? 'spin 8s linear infinite reverse' : 'none' }} />

          {/* Layer 4: Main body */}
          <div className="absolute inset-7 rounded-full flex flex-col items-center justify-center overflow-hidden" style={{
            background: `radial-gradient(circle at 35% 25%, ${sg(0.18)} 0%, ${sg(0.06)} 40%, transparent 70%), linear-gradient(160deg, hsl(224,50%,9%) 0%, hsl(224,71%,4%) 100%)`,
            boxShadow: `inset 0 2px 0 rgba(255,255,255,0.07), inset 0 -3px 12px rgba(0,0,0,0.7), 0 0 0 1px ${sg(0.18)}, 0 0 40px ${sg(0.18)}`,
            border: `1px solid ${sg(0.14)}`,
          }}>
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-14 h-1.5 rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(255,255,255,0.09) 0%, transparent 70%)' }} />

            <div className={`absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent ${isTapping ? 'opacity-100' : 'opacity-0'} transition-opacity duration-150`} />

            <span className="text-[9px] font-bold uppercase tracking-[0.3em] mb-1 relative z-10" style={{ color: `${ACCENT}99` }}>{tr.vault.mined}</span>

            <span className="text-5xl font-black text-white tabular-nums leading-none tracking-tight relative z-10" style={{ textShadow: `0 0 30px ${sg(0.3)}` }}>
              {Math.floor(tempMiningPoints).toLocaleString()}
            </span>

            <span className="text-[11px] font-semibold mt-1 relative z-10" style={{ color: `${ACCENT}bb` }}>{tr.vault.skp}</span>

            <div className="mt-3 px-3 py-1 rounded-full flex items-center gap-1.5 relative z-10" style={{ background: sg(0.10), border: `1px solid ${sg(0.18)}` }}>
              <Zap className={`w-3 h-3 ${activeTurbo ? 'text-boost' : ''}`} style={activeTurbo ? undefined : { color: ACCENT }} />
              <span className={`text-[10px] font-bold ${activeTurbo ? 'text-boost' : ''}`} style={activeTurbo ? undefined : { color: ACCENT }}>
                +{activeTurbo ? pointsPerTap * 5 : pointsPerTap} {tr.vault.perTap}
              </span>
            </div>

            {activeTurbo && (
              <span className="absolute bottom-6 text-[10px] font-bold text-boost animate-pulse surface-boost px-2 py-0.5 rounded-full">TURBO ({turboRemaining}s)</span>
            )}
          </div>

          {floatingPoints.map(fp => (
            <div
              key={fp.id}
              className="absolute pointer-events-none"
              style={{ left: `${fp.x}%`, top: `${fp.y}%`, transform: 'translate(-50%, -50%)' }}
            >
              <span
                className="font-black text-xl tracking-tighter absolute drop-shadow-md"
                style={{ animation: 'floatUp 0.8s cubic-bezier(0.1, 0.8, 0.3, 1) forwards', color: ACCENT, textShadow: `0 0 12px ${ACCENT}88` }}
              >
                +{fp.value}
              </span>
              <div className="dot burst-1" />
              <div className="dot burst-2" />
              <div className="dot burst-3" />
              <div className="dot burst-4" />
            </div>
          ))}
        </button>

        <div className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full surface-primary">
          <ArrowLeftRight className="w-3 h-3 text-primary/60" />
          <span className="text-[10px] font-semibold text-primary/70 tracking-wide">{tr.vault.convertRateNote(config?.features?.skpToSkxConversionRate ?? 5)}</span>
        </div>

        <div className="mt-4 w-full max-w-[280px]">
          <div className="flex justify-between text-xs font-bold mb-2.5 px-1">
            <span className="text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5 text-primary" /> {tr.vault.energy}
            </span>
            <span className={energy === 0 ? 'text-destructive font-mono' : 'text-white font-mono'}>
              {energy} <span className="text-muted-foreground">/ {maxEnergy}</span>
            </span>
          </div>
          <Progress value={(energy / maxEnergy) * 100} className="h-2.5 bg-black/40" indicatorStyle={{ background: `linear-gradient(90deg, ${sg(0.6)}, ${ACCENT})`, boxShadow: `0 0 12px ${sg(0.5)}` }} />
        </div>
      </div>

      {/* Watch Ads Row */}
      <div className="grid grid-cols-2 gap-3">
        <button
          data-testid="button-ad-energy"
          onClick={handleWatchAdForEnergy}
          disabled={energyAdLoading || energy >= maxEnergy}
          className="bg-card/40 backdrop-blur-md border border-white/5 p-3.5 rounded-[16px] flex items-center gap-3 hover:bg-white/5 transition-all disabled:opacity-50 active:scale-[0.98]"
        >
          <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20">
            <Battery className="w-5 h-5 text-primary" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-bold text-white leading-tight">{energyAdLoading ? tr.vault.watching : tr.vault.watch3Ads}</span>
            <span className="text-[10px] font-medium text-muted-foreground mt-0.5">{tr.vault.fullEnergy} · {adEnergyProgress}/3</span>
          </div>
        </button>
        <button
          data-testid="button-ad-turbo"
          onClick={handleWatchAdForTurbo}
          disabled={turboAdLoading || activeTurbo}
          className="bg-card/40 backdrop-blur-md border border-white/5 p-3.5 rounded-[16px] flex items-center gap-3 hover:bg-white/5 transition-all disabled:opacity-50 active:scale-[0.98]"
        >
          <div className="surface-boost p-2.5 rounded-xl">
            <FastForward className="w-5 h-5 text-boost" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-bold text-white leading-tight">{turboAdLoading ? tr.vault.watching : tr.vault.watch3Ads}</span>
            <span className="text-[10px] font-medium text-muted-foreground mt-0.5">{tr.vault.getTurbo} · {adTurboProgress}/3</span>
          </div>
        </button>
      </div>

      {/* Boosts Row */}
      <div className="grid grid-cols-2 gap-3">
        <button
          data-testid="button-turbo"
          onClick={activateTurbo}
          disabled={turboUsesToday >= 3 || activeTurbo}
          className="bg-card/40 backdrop-blur-md border border-white/5 p-3.5 rounded-[16px] flex items-center gap-3 hover:bg-white/5 transition-all disabled:opacity-50 active:scale-[0.98]"
        >
          <div className="surface-boost p-2.5 rounded-xl">
            <FastForward className="w-5 h-5 text-boost" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-bold text-white leading-tight">{tr.vault.turbo}</span>
            <span className="text-[10px] font-medium text-muted-foreground mt-0.5">{3 - turboUsesToday} {tr.vault.left}</span>
          </div>
        </button>
        <button
          data-testid="button-recharge"
          onClick={rechargeEnergy}
          disabled={rechargeUsesToday >= 3}
          className="bg-card/40 backdrop-blur-md border border-white/5 p-3.5 rounded-[16px] flex items-center gap-3 hover:bg-white/5 transition-all disabled:opacity-50 active:scale-[0.98]"
        >
          <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20">
            <Battery className="w-5 h-5 text-primary" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-bold text-white leading-tight">{tr.vault.recharge}</span>
            <span className="text-[10px] font-medium text-muted-foreground mt-0.5">{3 - rechargeUsesToday} {tr.vault.left}</span>
          </div>
        </button>
      </div>

      {/* Farming Section */}
      <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[20px] p-5 flex flex-col gap-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[40px] pointer-events-none" />
        {farmState === 'idle' && (
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
                <Sprout className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">{tr.vault.startFarming}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">{tr.vault.farmDesc}</p>
              </div>
            </div>
            <button data-testid="button-farm-start" onClick={startFarming} className="bg-emerald-500 hover:bg-emerald-400 text-black px-5 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]">{tr.vault.start}</button>
          </div>
        )}
        {farmState === 'farming' && (
          <div className="flex flex-col gap-3 relative z-10">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white font-bold flex items-center gap-2">
                <Sprout className="w-4 h-4 text-emerald-400 animate-pulse"/> 
                {tr.vault.harvesting}
              </span>
              <span className="text-primary font-bold font-mono bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">{farmYield.toLocaleString()} pts</span>
            </div>
            <Progress value={farmProgress} className="h-2.5 bg-black/40 [&>div]:bg-emerald-400 [&>div]:shadow-[0_0_10px_rgba(52,211,153,0.6)]" />
          </div>
        )}
        {farmState === 'ready' && (
          <div className="flex flex-col gap-3 relative z-10">
            <div className="flex items-center justify-center gap-2 mb-1 bg-emerald-500/10 py-2 rounded-xl border border-emerald-500/20">
              <Sprout className="w-5 h-5 text-emerald-400 animate-bounce" />
              <span className="text-emerald-400 font-bold tracking-wide">{tr.vault.farmReady}</span>
            </div>
            <button data-testid="button-farm-claim" onClick={claimFarming} className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black tracking-wide py-3.5 rounded-xl active:scale-[0.98] text-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)]">
              {tr.vault.claimFarm}
            </button>
          </div>
        )}
      </div>

      {/* Claim Button */}
      <button
        data-testid="button-claim"
        onClick={handleClaim}
        disabled={tempMiningPoints === 0 || isClaiming}
        className="w-full bg-white text-black font-black tracking-wide py-4.5 rounded-[16px] shadow-[0_4px_20px_rgba(255,255,255,0.15)] disabled:opacity-40 disabled:shadow-none transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 text-base border border-white/20 mt-2"
      >
        <Download className="w-5 h-5" />
        {tr.vault.transferEarnings}
      </button>

      <Dialog open={isClaiming} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md border-white/10 bg-card/90 backdrop-blur-2xl p-8">
          <DialogTitle className="text-center text-xl font-bold text-white tracking-tight">{tr.vault.watchingAd}</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground text-sm mt-2">
            {(config?.adsgram.enabled && config.adsgram.blockId) || (config?.monetag.enabled && config.monetag.zoneId) || (config?.onclicka.enabled && config.onclicka.spotId)
              ? tr.vault.watchAdUnlock
              : tr.vault.preparingTransfer}
          </DialogDescription>
          <div className="py-6 flex flex-col gap-4">
            <Progress value={claimProgress} className="h-2.5 bg-black/40" />
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes floatUp {
          0%   { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
          50%  { opacity: 1; transform: translate(-50%, calc(-50% - 35px)) scale(1); }
          100% { opacity: 0; transform: translate(-50%, calc(-50% - 65px)) scale(0.8); }
        }
        .dot {
          position: absolute; width: 5px; height: 5px;
          background: var(--skin-accent, hsl(var(--primary)));
          border-radius: 50%; opacity: 0;
          box-shadow: 0 0 8px var(--skin-accent, hsl(var(--primary)));
        }
        .burst-1 { animation: burst1 0.65s cubic-bezier(0.2,0.8,0.2,1) forwards; }
        .burst-2 { animation: burst2 0.65s cubic-bezier(0.2,0.8,0.2,1) forwards; }
        .burst-3 { animation: burst3 0.65s cubic-bezier(0.2,0.8,0.2,1) forwards; }
        .burst-4 { animation: burst4 0.65s cubic-bezier(0.2,0.8,0.2,1) forwards; }
        @keyframes burst1 { 0%{opacity:1;transform:translate(0,0) scale(1)} 100%{opacity:0;transform:translate(-28px,-28px) scale(0)} }
        @keyframes burst2 { 0%{opacity:1;transform:translate(0,0) scale(1)} 100%{opacity:0;transform:translate(28px,-18px) scale(0)} }
        @keyframes burst3 { 0%{opacity:1;transform:translate(0,0) scale(1)} 100%{opacity:0;transform:translate(-18px,28px) scale(0)} }
        @keyframes burst4 { 0%{opacity:1;transform:translate(0,0) scale(1)} 100%{opacity:0;transform:translate(28px,28px) scale(0)} }

      `}</style>

      {showWithdraw && <WithdrawModal onClose={() => setShowWithdraw(false)} />}
    </div>
  );
};
