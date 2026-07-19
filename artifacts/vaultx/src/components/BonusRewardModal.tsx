import { useEffect, useState } from "react";
import { Gift, Coins, Sparkles, Zap } from "lucide-react";
import { useVault } from "../context/VaultContext";
import { useLanguage } from "../lib/i18n";

/**
 * Animated popup shown when a server-side SKP bonus (squad milestone, weekly
 * prize, referral milestone, ad/offerwall reward…) was folded into the balance
 * during hydration. Counts the number up for a satisfying reveal.
 *
 * A second variant shows incoming SKX referral commissions.
 */
function RewardModal({
  amount,
  currency,
  onDismiss,
}: {
  amount: number;
  currency: "SKP" | "SKX";
  onDismiss: () => void;
}) {
  const { tr } = useLanguage();
  const [displayed, setDisplayed] = useState(0);
  const isSkx = currency === "SKX";

  useEffect(() => {
    setDisplayed(0);
    const duration = 900;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(amount * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [amount]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-5"
      data-testid="modal-bonus-reward"
    >
      <div
        className={`w-full max-w-[360px] rounded-3xl border p-6 shadow-2xl animate-in zoom-in-95 fade-in duration-300 bg-gradient-to-b from-[#1a1a24] to-[#0e0e14] ${
          isSkx
            ? "border-cyan-400/30"
            : "border-amber-400/30"
        }`}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className={`relative w-20 h-20 rounded-3xl flex items-center justify-center mb-4 animate-bounce ${
              isSkx
                ? "bg-gradient-to-br from-cyan-400/30 to-blue-500/20 text-cyan-300"
                : "bg-gradient-to-br from-amber-400/30 to-primary/20 text-amber-300"
            }`}
          >
            {isSkx ? <Zap className="w-10 h-10" /> : <Gift className="w-10 h-10" />}
            <Sparkles
              className={`absolute -top-2 -right-2 w-6 h-6 animate-pulse ${
                isSkx ? "text-cyan-300" : "text-yellow-300"
              }`}
            />
          </div>
          <h2 className="text-2xl font-black text-white mb-1">
            {isSkx ? tr.bonusReward.skxTitle : tr.bonusReward.title}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {isSkx ? tr.bonusReward.skxDesc : tr.bonusReward.desc}
          </p>
          <div
            className={`flex items-center gap-2 text-3xl font-black mb-6 tabular-nums ${
              isSkx ? "text-cyan-300" : "text-amber-300"
            }`}
          >
            <Coins className="w-7 h-7" />
            +{displayed.toLocaleString("en-US")} {currency}
          </div>
          <button
            onClick={onDismiss}
            className={`w-full text-black font-black py-3 rounded-xl transition-all hover:opacity-90 bg-gradient-to-r ${
              isSkx
                ? "from-cyan-400 to-blue-500"
                : "from-amber-400 to-primary"
            }`}
            data-testid="button-bonus-dismiss"
          >
            {tr.bonusReward.button}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BonusRewardModal() {
  const { bonusReward, dismissBonusReward, skxBonusReward, dismissSkxBonusReward } = useVault();

  if (skxBonusReward) {
    return (
      <RewardModal
        amount={skxBonusReward}
        currency="SKX"
        onDismiss={dismissSkxBonusReward}
      />
    );
  }

  if (bonusReward) {
    return (
      <RewardModal
        amount={bonusReward}
        currency="SKP"
        onDismiss={dismissBonusReward}
      />
    );
  }

  return null;
}
