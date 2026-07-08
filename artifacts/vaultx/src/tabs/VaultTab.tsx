// === EXTERNAL INTEGRATIONS (Future) ===
// [Cloudflare Secure Webhook Gateway] — handles high-traffic mining sync requests
// [Supabase Real-time DB] — sync tempMiningPoints, energy, miningLevel in real-time
// [AdsGram SDK] — AdController.show() triggers reward video before claim
// [Binance Pay API] — processes USD withdrawal requests
// [Telegram Stars & Fragment API] — in-app purchases for premium upgrades
// [Sentry.io SDK] — error tracking and performance monitoring

import React, { useState, useEffect } from 'react';
import { useVault } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { Download, Zap, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

export const VaultTab = () => {
  const { totalBalanceUSD, tempMiningPoints, miningLevel, energy, maxEnergy, claimEarnings } = useVault();
  const { toast } = useToast();
  
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimProgress, setClaimProgress] = useState(0);

  const miningCap = miningLevel === 1 ? 360 : miningLevel === 2 ? 1800 : miningLevel === 3 ? 7200 : 36000;
  const isCapped = tempMiningPoints >= miningCap;

  const handleWithdraw = () => {
    toast({
      title: "Coming Soon",
      description: "Withdrawal integration coming soon - Binance Pay gateway",
    });
  };

  const handleClaim = () => {
    if (tempMiningPoints === 0) return;
    setIsClaiming(true);
    setClaimProgress(0);
    
    // AdsGram SDK Hook — Future: AdController.show() integration
    const duration = 15000; // 15 seconds
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
          toast({
            title: "Success!",
            description: "Earnings transferred to your Vault",
          });
        }, 500);
      }
    }, interval);
  };

  return (
    <div className="flex flex-col space-y-6 pb-24 px-4 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Balance Card */}
      <div className="rounded-xl bg-gradient-to-br from-[#2D2405] to-[#120F03] border border-primary/20 p-6 flex flex-col items-center relative overflow-hidden shadow-[0_8px_32px_rgba(245,197,24,0.1)]">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10" />
        <h2 className="text-muted-foreground text-sm font-medium mb-1">Total Vault Balance</h2>
        <div className="text-4xl font-bold text-white mb-6 tracking-tight">
          ${totalBalanceUSD.toFixed(2)}
        </div>
        <button 
          data-testid="button-withdraw"
          onClick={handleWithdraw}
          className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 px-8 py-2.5 rounded-full font-semibold transition-all active:scale-95"
        >
          Withdraw
        </button>
        <div className="mt-4 px-3 py-1 bg-white/5 rounded-full text-xs text-primary font-medium border border-white/5">
          Level {miningLevel} Miner
        </div>
      </div>

      {/* Mining Core */}
      <div className="flex flex-col items-center justify-center py-8 relative">
        <div className={`w-52 h-52 rounded-full flex items-center justify-center relative ${energy > 0 && !isCapped ? 'animate-pulse shadow-[0_0_60px_rgba(245,197,24,0.15)]' : ''}`}>
          <div className="absolute inset-0 rounded-full border-2 border-primary/30" />
          <div className={`absolute inset-2 rounded-full border border-primary/20 ${energy > 0 && !isCapped ? 'animate-[spin_10s_linear_infinite]' : ''}`} />
          <div className={`absolute inset-4 rounded-full bg-gradient-to-b from-[#2A2205] to-black flex flex-col items-center justify-center border border-primary/40 shadow-inner`}>
            <span className="text-xs text-primary/70 font-medium mb-1 uppercase tracking-wider">Mined</span>
            <span className="text-3xl font-bold text-white">
              {Math.floor(tempMiningPoints).toLocaleString()}
            </span>
            <span className="text-xs text-primary/50 mt-1">pts</span>
          </div>
        </div>

        {/* Energy Status */}
        <div className="mt-8 w-full max-w-xs">
          <div className="flex justify-between text-xs font-medium mb-2">
            <span className="text-muted-foreground flex items-center gap-1">
              <Zap className="w-3 h-3 text-primary" /> Energy
            </span>
            <span className={energy === 0 ? "text-destructive" : "text-white"}>
              {energy} / {maxEnergy}
            </span>
          </div>
          <Progress value={(energy / maxEnergy) * 100} className="h-2 bg-white/5" />
          
          {energy === 0 && (
            <div className="mt-3 flex items-center justify-center gap-2 text-destructive text-sm font-medium bg-destructive/10 py-2 rounded-lg">
              <ShieldAlert className="w-4 h-4" />
              Vault Depleted — Recharge needed
            </div>
          )}
          
          {isCapped && (
            <div className="mt-3 flex items-center justify-center gap-2 text-primary text-sm font-medium bg-primary/10 py-2 rounded-lg border border-primary/20">
              <CheckCircle2 className="w-4 h-4" />
              Vault Full — Claim your earnings!
            </div>
          )}
        </div>
      </div>

      {/* Claim Button */}
      <button
        data-testid="button-claim"
        onClick={handleClaim}
        disabled={tempMiningPoints === 0 || isClaiming}
        className="mt-auto w-full bg-primary text-primary-foreground font-bold py-4 rounded-xl shadow-[0_4px_20px_rgba(245,197,24,0.3)] disabled:opacity-50 disabled:shadow-none transition-all active:scale-95 flex items-center justify-center gap-2 text-lg"
      >
        <Download className="w-5 h-5" />
        Transfer Earnings to Vault
      </button>

      {/* Ad Modal */}
      <Dialog open={isClaiming} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md border-white/10 bg-[#0D0D0F]">
          <DialogTitle className="text-center text-xl">Watching Reward Video</DialogTitle>
          <DialogDescription className="text-center">
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
    </div>
  );
};
