// === EXTERNAL INTEGRATIONS (Future) ===
// [Cloudflare Secure Webhook Gateway] — handles high-traffic mining sync requests
// [Supabase Real-time DB] — sync tempMiningPoints, energy, miningLevel in real-time
// [AdsGram SDK] — AdController.show() triggers reward video before claim
// [Binance Pay API] — processes USD withdrawal requests
// [Telegram Stars & Fragment API] — in-app purchases for premium upgrades
// [Sentry.io SDK] — error tracking and performance monitoring

import { useState, useCallback, useEffect } from 'react';
import { useVault, getLeague, SKINS } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { haptic } from '../lib/telegram';
import { Download, Zap, ShieldAlert, CheckCircle2, Battery, FastForward, Sprout, Vault } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { getPublicConfig, type PublicConfig } from '../lib/gameApi';
import { showAdsgramRewardedAd } from '../lib/adsgram';
import { showMonetagRewardedAd } from '../lib/monetag';
import vaultChest from '../assets/vault-chest.png';

interface FloatingPoint {
  id: number;
  x: number;
  y: number;
  value: number;
}

let floatId = 0;

export const VaultTab = () => {
  const { 
    totalBalanceUSD, tempMiningPoints, miningLevel, energy, maxEnergy, claimEarnings, tapMine,
    activeTurbo, turboExpiresAt, turboUsesToday, activateTurbo, grantAdTurbo,
    rechargeUsesToday, rechargeEnergy, setEnergy,
    farmState, farmStartTime, startFarming, claimFarming,
    lifetimePoints, profitPerHour, equippedSkinId
  } = useVault();
  const { toast } = useToast();
  const skin = equippedSkinId !== null ? SKINS[equippedSkinId] : undefined;

  const [isClaiming, setIsClaiming] = useState(false);
  const [claimProgress, setClaimProgress] = useState(0);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [floatingPoints, setFloatingPoints] = useState<FloatingPoint[]>([]);
  const [isTapping, setIsTapping] = useState(false);

  const [adEnergyProgress, setAdEnergyProgress] = useState(() => Number(localStorage.getItem('adEnergyProgress')) || 0);
  const [adTurboProgress, setAdTurboProgress] = useState(() => Number(localStorage.getItem('adTurboProgress')) || 0);
  const [energyAdLoading, setEnergyAdLoading] = useState(false);
  const [turboAdLoading, setTurboAdLoading] = useState(false);
  
  const [turboRemaining, setTurboRemaining] = useState(0);
  const [farmProgress, setFarmProgress] = useState(0);
  const [farmYield, setFarmYield] = useState(0);

  const league = getLeague(lifetimePoints);

  useEffect(() => {
    getPublicConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    localStorage.setItem('adEnergyProgress', adEnergyProgress.toString());
  }, [adEnergyProgress]);

  useEffect(() => {
    localStorage.setItem('adTurboProgress', adTurboProgress.toString());
  }, [adTurboProgress]);

  const watchRewardedAd = async () => {
    if (config?.adsgram.enabled && config.adsgram.blockId) {
      await showAdsgramRewardedAd(config.adsgram.blockId);
    } else if (config?.monetag.enabled && config.monetag.zoneId) {
      await showMonetagRewardedAd(config.monetag.zoneId);
    } else {
      throw new Error('No ad provider is available right now');
    }
  };

  const handleWatchAdForEnergy = async () => {
    if (energyAdLoading || energy >= maxEnergy) return;
    setEnergyAdLoading(true);
    try {
      await watchRewardedAd();
      setAdEnergyProgress(prev => {
        const next = prev + 1;
        if (next >= 3) {
          setEnergy(maxEnergy);
          toast({ title: 'Energy Refilled!', description: 'Your energy is now full' });
          return 0;
        }
        toast({ title: 'Ad Watched!', description: `${next}/3 videos watched` });
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
      await watchRewardedAd();
      setAdTurboProgress(prev => {
        const next = prev + 1;
        if (next >= 3) {
          grantAdTurbo();
          toast({ title: 'Turbo Activated!', description: '5x mining speed for 20s' });
          return 0;
        }
        toast({ title: 'Ad Watched!', description: `${next}/3 videos watched` });
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
  const pointsPerTap = miningLevel === 1 ? 1 : miningLevel === 2 ? 5 : miningLevel === 3 ? 20 : 100;

  const handleWithdraw = () => {
    toast({
      title: "Coming Soon",
      description: "Withdrawal integration coming soon - Binance Pay gateway",
    });
  };

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

    setIsTapping(true);
    setTimeout(() => setIsTapping(false), 120);

    const id = floatId++;
    setFloatingPoints(prev => [...prev, { id, x, y, value: earned }]);
    setTimeout(() => {
      setFloatingPoints(prev => prev.filter(p => p.id !== id));
    }, 900);
  }, [energy, tapMine]);

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
        setIsClaiming(false);
        claimEarnings();
        toast({ title: "Success!", description: "Earnings transferred to your Vault" });
      }
    }, interval);
  };

  const handleClaim = async () => {
    if (tempMiningPoints === 0 || isClaiming) return;
    setIsClaiming(true);
    setClaimProgress(0);

    const useAdsgram = config?.adsgram.enabled && config.adsgram.blockId;
    const useMonetag = !useAdsgram && config?.monetag.enabled && config.monetag.zoneId;

    if (!useAdsgram && !useMonetag) {
      runFallbackProgress();
      return;
    }

    try {
      if (useAdsgram) {
        await showAdsgramRewardedAd(config!.adsgram.blockId as string);
      } else if (useMonetag) {
        await showMonetagRewardedAd(config!.monetag.zoneId as string);
      }
      setIsClaiming(false);
      claimEarnings();
      toast({ title: "Success!", description: "Earnings transferred to your Vault" });
    } catch (err) {
      setIsClaiming(false);
      toast({ title: "Ad not completed", description: err instanceof Error ? err.message : "Try again to claim your earnings", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col space-y-5 pb-24 px-4 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Balance Card */}
      <div className="rounded-[24px] bg-card/60 backdrop-blur-2xl border border-white/10 p-6 flex flex-col items-center relative overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-50" />
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary/20 rounded-full blur-[50px] -mr-10 -mt-10" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-cyan-500/10 rounded-full blur-[50px] -ml-10 -mb-10" />
        <h2 className="text-muted-foreground text-xs font-semibold mb-1 uppercase tracking-widest relative z-10">Total Vault Balance</h2>
        <div className="text-[40px] font-black text-white mb-5 tracking-tighter relative z-10 drop-shadow-sm">
          ${totalBalanceUSD.toFixed(2)}
        </div>
        <div className="flex items-center gap-3 relative z-10 w-full">
          <button
            data-testid="button-withdraw"
            onClick={handleWithdraw}
            className="flex-1 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/40 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] shadow-inner"
          >
            Withdraw
          </button>
          <div className="flex-1 py-2.5 bg-white/5 rounded-xl text-sm text-center text-white font-semibold border border-white/5 shadow-inner">
            Level <span className="text-primary">{miningLevel}</span>
          </div>
        </div>
      </div>

      {/* Info Row */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-center">
          <span className="text-[11px] font-bold px-3 py-1 rounded-full border border-white/10 shadow-sm" style={{ background: `linear-gradient(135deg, ${league.color}40, ${league.color}10)`, color: league.color }}>
            <span className="mr-1.5">{league.icon}</span> {league.name} Miner
          </span>
        </div>
        <div className="flex justify-between items-center text-xs font-bold bg-card/50 backdrop-blur-xl border border-white/5 rounded-xl px-4 py-3 shadow-inner">
          <span className="text-primary flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> +{profitPerHour.toLocaleString()} /hr</span>
          <span className="text-white flex items-center gap-1.5"><Vault className="w-3.5 h-3.5 text-cyan-400" /> {lifetimePoints.toLocaleString()} pts</span>
        </div>
      </div>

      {/* ── TAP TO MINE CORE ── */}
      <div className="flex flex-col items-center justify-center py-6 relative select-none">
        <p className="text-xs text-primary/70 uppercase tracking-widest mb-6 font-semibold animate-pulse">
          {energy > 0 ? 'Tap the Vault to Mine' : 'No Energy — Recharging...'}
        </p>

        <button
          data-testid="button-tap-mine"
          onClick={handleTap}
          onTouchStart={handleTap}
          disabled={energy <= 0}
          className="relative w-64 h-64 focus:outline-none disabled:cursor-not-allowed group flex items-center justify-center"
          style={{ transform: isTapping ? 'scale(0.95)' : 'scale(1)', transition: 'transform 0.1s cubic-bezier(0.4, 0, 0.2, 1)' }}
        >
          <div className="absolute inset-0 bg-[var(--glow-green)] blur-[80px] opacity-20 rounded-full mix-blend-screen" />
          <div className="absolute inset-4 bg-primary blur-[60px] opacity-20 rounded-full mix-blend-screen" />
          
          <img 
            src={vaultChest} 
            alt="Vault Chest" 
            className={`w-full h-full object-contain relative z-10 transition-transform duration-300 drop-shadow-[0_0_25px_rgba(0,200,83,0.4)] ${isTapping ? 'scale-95' : 'scale-100'} ${activeTurbo ? 'drop-shadow-[0_0_40px_rgba(34,211,238,0.6)]' : ''}`}
            draggable="false"
          />

          <div className="absolute -bottom-6 flex flex-col items-center justify-center z-20 pointer-events-none">
            <span className="text-[10px] text-primary font-bold uppercase tracking-widest mb-1 drop-shadow-md">Mined</span>
            <span className="text-5xl font-black text-white tabular-nums leading-none tracking-tighter drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
              {Math.floor(tempMiningPoints).toLocaleString()}
            </span>
            <span className="text-[11px] text-primary mt-1 font-bold">pts</span>
          </div>

          <div className={`absolute -top-4 px-3 py-1 rounded-full bg-black/40 border border-white/5 backdrop-blur-md z-20 flex items-center gap-1`}>
            <Zap className={`w-3 h-3 ${activeTurbo ? 'text-cyan-400' : 'text-primary'}`} />
            <span className={`text-[10px] font-bold ${activeTurbo ? 'text-cyan-400' : 'text-primary'}`}>
              +{activeTurbo ? pointsPerTap * 5 : pointsPerTap} / tap
            </span>
          </div>
          
          {activeTurbo && (
            <span className="absolute -bottom-16 text-[10px] font-bold text-cyan-400 animate-pulse bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-400/30">TURBO ({turboRemaining}s)</span>
          )}

          {floatingPoints.map(fp => (
            <div
              key={fp.id}
              className="absolute pointer-events-none z-30"
              style={{ left: `${fp.x}%`, top: `${fp.y}%`, transform: 'translate(-50%, -50%)' }}
            >
              <span
                className="font-black text-primary text-2xl tracking-tighter absolute drop-shadow-[0_0_8px_rgba(245,197,24,0.8)]"
                style={{ animation: 'floatUp 0.8s cubic-bezier(0.1, 0.8, 0.3, 1) forwards' }}
              >
                +{fp.value}
              </span>
            </div>
          ))}
        </button>

        <div className="mt-16 w-full max-w-[280px]">
          <div className="flex justify-between text-xs font-bold mb-2.5 px-1">
            <span className="text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5 text-primary" /> Energy
            </span>
            <span className={energy === 0 ? 'text-destructive font-mono' : 'text-white font-mono'}>
              {energy} <span className="text-muted-foreground">/ {maxEnergy}</span>
            </span>
          </div>
          <Progress value={(energy / maxEnergy) * 100} className="h-2.5 bg-black/40" />
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
            <span className="text-sm font-bold text-white leading-tight">{energyAdLoading ? 'Watching...' : 'Watch 3 Ads'}</span>
            <span className="text-[10px] font-medium text-muted-foreground mt-0.5">Full Energy · {adEnergyProgress}/3</span>
          </div>
        </button>
        <button
          data-testid="button-ad-turbo"
          onClick={handleWatchAdForTurbo}
          disabled={turboAdLoading || activeTurbo}
          className="bg-card/40 backdrop-blur-md border border-white/5 p-3.5 rounded-[16px] flex items-center gap-3 hover:bg-white/5 transition-all disabled:opacity-50 active:scale-[0.98]"
        >
          <div className="bg-cyan-500/10 p-2.5 rounded-xl border border-cyan-500/20">
            <FastForward className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-bold text-white leading-tight">{turboAdLoading ? 'Watching...' : 'Watch 3 Ads'}</span>
            <span className="text-[10px] font-medium text-muted-foreground mt-0.5">Get Turbo · {adTurboProgress}/3</span>
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
          <div className="bg-cyan-500/10 p-2.5 rounded-xl border border-cyan-500/20">
            <FastForward className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-bold text-white leading-tight">Turbo</span>
            <span className="text-[10px] font-medium text-muted-foreground mt-0.5">{3 - turboUsesToday} left</span>
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
            <span className="text-sm font-bold text-white leading-tight">Recharge</span>
            <span className="text-[10px] font-medium text-muted-foreground mt-0.5">{3 - rechargeUsesToday} left</span>
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
                <h3 className="text-sm font-bold text-white tracking-tight">Start Farming</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Farm 500 pts/hr for 8h</p>
              </div>
            </div>
            <button data-testid="button-farm-start" onClick={startFarming} className="bg-emerald-500 hover:bg-emerald-400 text-black px-5 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]">Start</button>
          </div>
        )}
        {farmState === 'farming' && (
          <div className="flex flex-col gap-3 relative z-10">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white font-bold flex items-center gap-2">
                <Sprout className="w-4 h-4 text-emerald-400 animate-pulse"/> 
                Harvesting
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
              <span className="text-emerald-400 font-bold tracking-wide">Farm Ready!</span>
            </div>
            <button data-testid="button-farm-claim" onClick={claimFarming} className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black tracking-wide py-3.5 rounded-xl active:scale-[0.98] text-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)]">
              Claim 4,000 pts
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
        Transfer Earnings to Vault
      </button>

      <Dialog open={isClaiming} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md border-white/10 bg-card/90 backdrop-blur-2xl p-8">
          <DialogTitle className="text-center text-xl font-bold text-white tracking-tight">Watching Ad</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground text-sm mt-2">
            {(config?.adsgram.enabled && config.adsgram.blockId) || (config?.monetag.enabled && config.monetag.zoneId)
              ? 'Please watch the ad to unlock your earnings...'
              : 'Preparing your transfer...'}
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
          position: absolute;
          width: 4px;
          height: 4px;
          background: hsl(var(--primary));
          border-radius: 50%;
          opacity: 0;
          box-shadow: 0 0 8px hsl(var(--primary));
        }
        .burst-1 { animation: burst1 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        .burst-2 { animation: burst2 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        .burst-3 { animation: burst3 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        .burst-4 { animation: burst4 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        @keyframes burst1 {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(-25px, -25px) scale(0); }
        }
        @keyframes burst2 {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(25px, -15px) scale(0); }
        }
        @keyframes burst3 {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(-15px, 25px) scale(0); }
        }
        @keyframes burst4 {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(25px, 25px) scale(0); }
        }
      `}</style>
    </div>
  );
};
