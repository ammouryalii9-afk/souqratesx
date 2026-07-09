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
    activeTurbo, turboExpiresAt, turboUsesToday, activateTurbo,
    rechargeUsesToday, rechargeEnergy,
    farmState, farmStartTime, startFarming, claimFarming,
    lifetimePoints, profitPerHour, equippedSkinId
  } = useVault();
  const { toast } = useToast();
  const skin = equippedSkinId !== null ? SKINS[equippedSkinId] : undefined;

  const [isClaiming, setIsClaiming] = useState(false);
  const [claimProgress, setClaimProgress] = useState(0);
  const [floatingPoints, setFloatingPoints] = useState<FloatingPoint[]>([]);
  const [isTapping, setIsTapping] = useState(false);
  
  const [turboRemaining, setTurboRemaining] = useState(0);
  const [farmProgress, setFarmProgress] = useState(0);
  const [farmYield, setFarmYield] = useState(0);

  const league = getLeague(lifetimePoints);

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

  const handleClaim = () => {
    if (tempMiningPoints === 0) return;
    setIsClaiming(true);
    setClaimProgress(0);

    const duration = 15000;
    const interval = 100;
    const steps = duration / interval;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      setClaimProgress((currentStep / steps) * 100);
      if (currentStep >= steps) {
        clearInterval(timer);
        setTimeout(() => {
          setIsClaiming(false);
          claimEarnings();
          toast({ title: "Success!", description: "Earnings transferred to your Vault" });
        }, 500);
      }
    }, interval);
  };

  return (
    <div className="flex flex-col space-y-5 pb-24 px-4 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Balance Card */}
      <div className="rounded-xl bg-gradient-to-br from-[#2D2405] to-[#120F03] border border-primary/20 p-5 flex flex-col items-center relative overflow-hidden shadow-[0_8px_32px_rgba(245,197,24,0.1)]">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10" />
        <h2 className="text-muted-foreground text-xs font-medium mb-1 uppercase tracking-wider">Total Vault Balance</h2>
        <div className="text-4xl font-bold text-white mb-4 tracking-tight">
          ${totalBalanceUSD.toFixed(2)}
        </div>
        <div className="flex items-center gap-3">
          <button
            data-testid="button-withdraw"
            onClick={handleWithdraw}
            className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 px-7 py-2 rounded-full font-semibold text-sm transition-all active:scale-95"
          >
            Withdraw
          </button>
          <div className="px-3 py-1 bg-white/5 rounded-full text-xs text-primary font-medium border border-white/5">
            Level {miningLevel} Miner
          </div>
        </div>
      </div>

      {/* Info Row */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: league.color, color: '#000' }}>
            {league.icon} {league.name} Miner
          </span>
        </div>
        <div className="flex justify-between items-center text-xs font-medium bg-black/40 border border-white/5 rounded-lg px-4 py-2">
          <span className="text-emerald-400">Profit: +{profitPerHour.toLocaleString()} pts/hr</span>
          <span className="text-primary">Total: {lifetimePoints.toLocaleString()} pts</span>
        </div>
      </div>

      {/* ── TAP TO MINE CORE ── */}
      <div className="flex flex-col items-center justify-center py-4 relative select-none">
        <p className="text-xs text-primary/50 uppercase tracking-widest mb-4 font-medium">
          {energy > 0 ? 'Tap the Vault to Mine' : 'No Energy — Recharging...'}
        </p>

        <button
          data-testid="button-tap-mine"
          onClick={handleTap}
          onTouchStart={handleTap}
          disabled={energy <= 0}
          className="relative w-52 h-52 rounded-full focus:outline-none disabled:cursor-not-allowed"
          style={{ transform: isTapping ? 'scale(0.94)' : 'scale(1)', transition: 'transform 0.1s ease' }}
        >
          <div
            className={`absolute inset-0 rounded-full border-2 transition-colors duration-300 ${activeTurbo ? 'border-cyan-400/80 animate-pulse' : !skin && energy > 0 ? 'border-primary/40' : !skin ? 'border-white/10' : ''}`}
            style={!activeTurbo && skin && energy > 0 ? { borderColor: `${skin.accent}66` } : undefined}
          />
          <div
            className={`absolute inset-2 rounded-full border ${!skin ? 'border-primary/20' : ''} ${energy > 0 ? 'animate-[spin_8s_linear_infinite]' : ''} ${activeTurbo ? 'border-cyan-400/50' : ''}`}
            style={!activeTurbo && skin ? { borderColor: `${skin.accent}33` } : undefined}
          />

          {energy > 0 && !isCapped && !activeTurbo && (
            <div className="absolute inset-0 rounded-full shadow-[0_0_60px_rgba(245,197,24,0.18)] animate-pulse" style={skin ? { boxShadow: `0 0 60px ${skin.glow}` } : undefined} />
          )}
          {activeTurbo && (
            <div className="absolute inset-0 rounded-full shadow-[0_0_60px_rgba(34,211,238,0.4)] animate-pulse" />
          )}

          <div
            className={`absolute inset-4 rounded-full bg-gradient-to-b ${activeTurbo ? 'from-[#002b36] to-[#0A0900] border-cyan-400/60' : !skin ? 'from-[#2A2205] to-[#0A0900] border-primary/40' : 'from-[#1a1a1a] to-[#0A0900]'} flex flex-col items-center justify-center border shadow-inner overflow-hidden`}
            style={!activeTurbo && skin ? { borderColor: `${skin.accent}66` } : undefined}
          >
            <div className={`absolute inset-0 bg-gradient-to-tr from-transparent via-primary/5 to-transparent ${isTapping ? 'opacity-100' : 'opacity-0'} transition-opacity duration-100`} />
            <span className="text-[10px] text-primary/60 font-medium uppercase tracking-widest mb-1">Mined</span>
            <span className="text-3xl font-bold text-white tabular-nums leading-none">
              {Math.floor(tempMiningPoints).toLocaleString()}
            </span>
            <span className="text-[10px] text-primary/40 mt-1">pts</span>
            <span className={`text-[10px] mt-2 font-semibold ${activeTurbo ? 'text-cyan-400' : 'text-primary/50'}`}>
              +{activeTurbo ? pointsPerTap * 5 : pointsPerTap} / tap
            </span>
            {activeTurbo && (
              <span className="absolute bottom-4 text-xs font-bold text-red-500 animate-pulse">TURBO x5 ({turboRemaining}s)</span>
            )}
          </div>

          {floatingPoints.map(fp => (
            <div
              key={fp.id}
              className="absolute pointer-events-none"
              style={{ left: `${fp.x}%`, top: `${fp.y}%`, transform: 'translate(-50%, -50%)' }}
            >
              <span
                className="font-bold text-primary text-lg leading-none absolute"
                style={{ animation: 'floatUp 0.9s ease-out forwards' }}
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

        <div className="mt-6 w-full max-w-xs">
          <div className="flex justify-between text-xs font-medium mb-2">
            <span className="text-muted-foreground flex items-center gap-1">
              <Zap className="w-3 h-3 text-primary" /> Energy
            </span>
            <span className={energy === 0 ? 'text-destructive' : 'text-white'}>
              {energy} / {maxEnergy}
            </span>
          </div>
          <Progress value={(energy / maxEnergy) * 100} className="h-2 bg-white/5" />
        </div>
      </div>

      {/* Boosts Row */}
      <div className="grid grid-cols-2 gap-3">
        <button
          data-testid="button-turbo"
          onClick={activateTurbo}
          disabled={turboUsesToday >= 3 || activeTurbo}
          className="bg-card border border-white/5 p-3 rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          <FastForward className="w-5 h-5 text-cyan-400" />
          <span className="text-xs font-bold text-white">Turbo Tap</span>
          <span className="text-[10px] text-muted-foreground">{3 - turboUsesToday} left</span>
        </button>
        <button
          data-testid="button-recharge"
          onClick={rechargeEnergy}
          disabled={rechargeUsesToday >= 3}
          className="bg-card border border-white/5 p-3 rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          <Battery className="w-5 h-5 text-emerald-400" />
          <span className="text-xs font-bold text-white">Full Recharge</span>
          <span className="text-[10px] text-muted-foreground">{3 - rechargeUsesToday} left</span>
        </button>
      </div>

      {/* Farming Section */}
      <div className="bg-card border border-white/5 rounded-xl p-4 flex flex-col gap-3">
        {farmState === 'idle' && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500/10 p-2 rounded-lg"><Sprout className="w-5 h-5 text-emerald-500" /></div>
              <div>
                <h3 className="text-sm font-bold text-white">Start Farming</h3>
                <p className="text-xs text-muted-foreground">Farm 500 pts/hr for up to 8 hours</p>
              </div>
            </div>
            <button data-testid="button-farm-start" onClick={startFarming} className="bg-emerald-500 text-black px-4 py-2 rounded-lg text-xs font-bold active:scale-95">Start Farm</button>
          </div>
        )}
        {farmState === 'farming' && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-white font-bold flex items-center gap-1"><Sprout className="w-4 h-4 text-emerald-500"/> Harvesting...</span>
              <span className="text-primary font-bold">{farmYield.toLocaleString()} pts</span>
            </div>
            <Progress value={farmProgress} className="h-2 bg-white/5 [&>div]:bg-emerald-500" />
          </div>
        )}
        {farmState === 'ready' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Sprout className="w-5 h-5 text-emerald-500 animate-pulse" />
              <span className="text-emerald-500 font-bold">Farm Ready!</span>
            </div>
            <button data-testid="button-farm-claim" onClick={claimFarming} className="w-full bg-emerald-500 text-black font-bold py-3 rounded-lg animate-pulse active:scale-95 text-sm">
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
        className="w-full bg-primary text-black font-bold py-4 rounded-xl shadow-[0_4px_20px_rgba(245,197,24,0.3)] disabled:opacity-40 disabled:shadow-none transition-all active:scale-95 flex items-center justify-center gap-2 text-base"
      >
        <Download className="w-5 h-5" />
        Transfer Earnings to Vault
      </button>

      <Dialog open={isClaiming} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md border-white/10 bg-[#0D0D0F]">
          <DialogTitle className="text-center text-xl">Watching Reward Video</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground text-sm">
            Simulating AdsGram SDK integration...
          </DialogDescription>
          <div className="py-8">
            <Progress value={claimProgress} className="h-3" />
            <p className="text-center text-muted-foreground text-sm mt-4">
              Please wait... {Math.ceil(15 - (claimProgress / 100) * 15)}s
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes floatUp {
          0%   { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
          60%  { opacity: 1; transform: translate(-50%, calc(-50% - 40px)) scale(1); }
          100% { opacity: 0; transform: translate(-50%, calc(-50% - 70px)) scale(0.8); }
        }
        .dot {
          position: absolute;
          width: 4px;
          height: 4px;
          background: #F5C518;
          border-radius: 50%;
          opacity: 0;
        }
        .burst-1 { animation: burst1 0.6s ease-out forwards; }
        .burst-2 { animation: burst2 0.6s ease-out forwards; }
        .burst-3 { animation: burst3 0.6s ease-out forwards; }
        .burst-4 { animation: burst4 0.6s ease-out forwards; }
        @keyframes burst1 {
          0% { opacity: 1; transform: translate(0, 0); }
          100% { opacity: 0; transform: translate(-20px, -20px); }
        }
        @keyframes burst2 {
          0% { opacity: 1; transform: translate(0, 0); }
          100% { opacity: 0; transform: translate(20px, -15px); }
        }
        @keyframes burst3 {
          0% { opacity: 1; transform: translate(0, 0); }
          100% { opacity: 0; transform: translate(-15px, 20px); }
        }
        @keyframes burst4 {
          0% { opacity: 1; transform: translate(0, 0); }
          100% { opacity: 0; transform: translate(20px, 20px); }
        }
      `}</style>
    </div>
  );
};
