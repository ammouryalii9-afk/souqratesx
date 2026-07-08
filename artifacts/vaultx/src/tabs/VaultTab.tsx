// === EXTERNAL INTEGRATIONS (Future) ===
// [Cloudflare Secure Webhook Gateway] — handles high-traffic mining sync requests
// [Supabase Real-time DB] — sync tempMiningPoints, energy, miningLevel in real-time
// [AdsGram SDK] — AdController.show() triggers reward video before claim
// [Binance Pay API] — processes USD withdrawal requests
// [Telegram Stars & Fragment API] — in-app purchases for premium upgrades
// [Sentry.io SDK] — error tracking and performance monitoring

import { useState, useCallback } from 'react';
import { useVault } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { Download, Zap, ShieldAlert, CheckCircle2 } from 'lucide-react';
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
  const { totalBalanceUSD, tempMiningPoints, miningLevel, energy, maxEnergy, claimEarnings, tapMine } = useVault();
  const { toast } = useToast();

  const [isClaiming, setIsClaiming] = useState(false);
  const [claimProgress, setClaimProgress] = useState(0);
  const [floatingPoints, setFloatingPoints] = useState<FloatingPoint[]>([]);
  const [isTapping, setIsTapping] = useState(false);

  // Idle-mining cap (3h × rate) — tapping is NOT limited by this, only auto-mining is
  const idleCap = miningLevel === 1 ? 10800 : miningLevel === 2 ? 54000 : miningLevel === 3 ? 216000 : 1080000;
  const isCapped = tempMiningPoints >= idleCap;
  const pointsPerTap = miningLevel === 1 ? 1 : miningLevel === 2 ? 5 : miningLevel === 3 ? 20 : 100;

  const handleWithdraw = () => {
    toast({
      title: "Coming Soon",
      description: "Withdrawal integration coming soon - Binance Pay gateway",
    });
  };

  // Tapping is only blocked by energy, never by the idle cap
  const handleTap = useCallback((e: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    if (energy <= 0) return;

    // Get tap position relative to the button
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

    tapMine();

    // Pulse animation
    setIsTapping(true);
    setTimeout(() => setIsTapping(false), 120);

    // Spawn floating number
    const id = floatId++;
    setFloatingPoints(prev => [...prev, { id, x, y, value: pointsPerTap }]);
    setTimeout(() => {
      setFloatingPoints(prev => prev.filter(p => p.id !== id));
    }, 900);
  }, [energy, isCapped, tapMine, pointsPerTap]);

  const handleClaim = () => {
    if (tempMiningPoints === 0) return;
    setIsClaiming(true);
    setClaimProgress(0);

    // AdsGram SDK Hook — Future: AdController.show() integration
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

      {/* ── TAP TO MINE CORE ── */}
      <div className="flex flex-col items-center justify-center py-4 relative select-none">

        {/* Hint text */}
        <p className="text-xs text-primary/50 uppercase tracking-widest mb-4 font-medium">
          {energy > 0 ? 'Tap the Vault to Mine' : 'No Energy — Recharging...'}
        </p>

        {/* Tappable mining core — only blocked by energy */}
        <button
          data-testid="button-tap-mine"
          onClick={handleTap}
          onTouchStart={handleTap}
          disabled={energy <= 0}
          className="relative w-52 h-52 rounded-full focus:outline-none disabled:cursor-not-allowed"
          style={{ transform: isTapping ? 'scale(0.94)' : 'scale(1)', transition: 'transform 0.1s ease' }}
        >
          {/* Outer glow ring */}
          <div className={`absolute inset-0 rounded-full border-2 transition-colors duration-300 ${energy > 0 ? 'border-primary/40' : 'border-white/10'}`} />

          {/* Spinning orbit ring */}
          <div className={`absolute inset-2 rounded-full border border-primary/20 ${energy > 0 ? 'animate-[spin_8s_linear_infinite]' : ''}`} />

          {/* Glow shadow when active */}
          {energy > 0 && !isCapped && (
            <div className="absolute inset-0 rounded-full shadow-[0_0_60px_rgba(245,197,24,0.18)] animate-pulse" />
          )}

          {/* Core face */}
          <div className="absolute inset-4 rounded-full bg-gradient-to-b from-[#2A2205] to-[#0A0900] flex flex-col items-center justify-center border border-primary/40 shadow-inner overflow-hidden">
            {/* Inner shimmer */}
            <div className={`absolute inset-0 bg-gradient-to-tr from-transparent via-primary/5 to-transparent ${isTapping ? 'opacity-100' : 'opacity-0'} transition-opacity duration-100`} />
            <span className="text-[10px] text-primary/60 font-medium uppercase tracking-widest mb-1">Mined</span>
            <span className="text-3xl font-bold text-white tabular-nums leading-none">
              {Math.floor(tempMiningPoints).toLocaleString()}
            </span>
            <span className="text-[10px] text-primary/40 mt-1">pts</span>
            <span className="text-[10px] text-primary/50 mt-2 font-semibold">
              +{pointsPerTap} / tap
            </span>
          </div>

          {/* Floating +N animations */}
          {floatingPoints.map(fp => (
            <span
              key={fp.id}
              className="absolute pointer-events-none font-bold text-primary text-lg leading-none"
              style={{
                left: `${fp.x}%`,
                top: `${fp.y}%`,
                transform: 'translate(-50%, -50%)',
                animation: 'floatUp 0.9s ease-out forwards',
              }}
            >
              +{fp.value}
            </span>
          ))}
        </button>

        {/* Energy bar */}
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

          {energy === 0 && (
            <div className="mt-3 flex items-center justify-center gap-2 text-destructive text-xs font-medium bg-destructive/10 py-2 rounded-lg">
              <ShieldAlert className="w-3.5 h-3.5" />
              Vault Depleted — Recharge needed (+5 energy / 15 min)
            </div>
          )}

          {isCapped && energy > 0 && (
            <div className="mt-3 flex items-center justify-center gap-2 text-primary text-xs font-medium bg-primary/10 py-2 rounded-lg border border-primary/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Vault Full — Claim your earnings below!
            </div>
          )}
        </div>
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

      {/* Ad Modal */}
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

      {/* Float-up keyframe */}
      <style>{`
        @keyframes floatUp {
          0%   { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
          60%  { opacity: 1; transform: translate(-50%, calc(-50% - 40px)) scale(1); }
          100% { opacity: 0; transform: translate(-50%, calc(-50% - 70px)) scale(0.8); }
        }
      `}</style>
    </div>
  );
};
