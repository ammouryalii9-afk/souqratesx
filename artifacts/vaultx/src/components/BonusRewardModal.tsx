import { useEffect, useState } from "react";
import { Gift, Coins, Sparkles } from "lucide-react";
import { useVault } from "../context/VaultContext";
import { useLanguage } from "../lib/i18n";

/**
 * Animated popup shown when a server-side SKP bonus (squad milestone, weekly
 * prize, referral milestone, ad/offerwall reward…) was folded into the balance
 * during hydration. Counts the number up for a satisfying reveal.
 */
export function BonusRewardModal() {
  const { bonusReward, dismissBonusReward } = useVault();
  const { tr } = useLanguage();
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (!bonusReward) return;
    setDisplayed(0);
    const duration = 900;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(bonusReward * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bonusReward]);

  if (!bonusReward) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-5" data-testid="modal-bonus-reward">
      <div className="w-full max-w-[360px] rounded-3xl border border-amber-400/30 bg-gradient-to-b from-[#1a1a24] to-[#0e0e14] p-6 shadow-2xl animate-in zoom-in-95 fade-in duration-300">
        <div className="flex flex-col items-center text-center">
          <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400/30 to-primary/20 flex items-center justify-center text-amber-300 mb-4 animate-bounce">
            <Gift className="w-10 h-10" />
            <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-yellow-300 animate-pulse" />
          </div>
          <h2 className="text-2xl font-black text-white mb-1">{tr.bonusReward.title}</h2>
          <p className="text-sm text-muted-foreground mb-4">{tr.bonusReward.desc}</p>
          <div className="flex items-center gap-2 text-3xl font-black text-amber-300 mb-6 tabular-nums">
            <Coins className="w-7 h-7" />
            +{displayed.toLocaleString("en-US")} SKP
          </div>
          <button
            onClick={dismissBonusReward}
            className="w-full bg-gradient-to-r from-amber-400 to-primary text-black font-black py-3 rounded-xl transition-all hover:opacity-90"
            data-testid="button-bonus-dismiss"
          >
            {tr.bonusReward.button}
          </button>
        </div>
      </div>
    </div>
  );
}
