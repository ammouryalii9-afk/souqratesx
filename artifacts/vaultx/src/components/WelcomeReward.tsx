import { useState } from "react";
import { Gift, Zap, Coins, Trophy, X } from "lucide-react";
import { useVault } from "../context/VaultContext";

const STEPS = [
  {
    icon: <Coins className="w-8 h-8" />,
    title: "Tap to Mine",
    body: "Tap the coin to mine points. Each tap uses energy that recharges over time.",
  },
  {
    icon: <Zap className="w-8 h-8" />,
    title: "Upgrade & Earn Passively",
    body: "Upgrade your miner and buy passive cards to keep earning even while you're away.",
  },
  {
    icon: <Trophy className="w-8 h-8" />,
    title: "Compete & Complete Tasks",
    body: "Climb the leaderboard, invite friends, and finish daily tasks for bonus rewards.",
  },
];

export function WelcomeReward() {
  const { hasClaimedWelcome, claimWelcomeReward, isTelegramUser } = useVault();
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (!isTelegramUser || hasClaimedWelcome || dismissed) return null;

  const isLast = step === STEPS.length;

  const handleClaim = () => {
    claimWelcomeReward();
    setDismissed(true);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-5" data-testid="modal-welcome-reward">
      <div className="w-full max-w-[360px] rounded-3xl border border-white/10 bg-gradient-to-b from-[#1a1a24] to-[#0e0e14] p-6 shadow-2xl relative">
        {!isLast && (
          <button
            onClick={() => setStep(STEPS.length)}
            className="absolute top-4 right-4 text-muted-foreground hover:text-white transition-colors"
            data-testid="button-welcome-skip"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {!isLast ? (
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center text-primary mb-4">
              {STEPS[step].icon}
            </div>
            <h2 className="text-xl font-black text-white mb-2">{STEPS[step].title}</h2>
            <p className="text-sm text-muted-foreground mb-6">{STEPS[step].body}</p>

            <div className="flex gap-1.5 mb-5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-white/20"}`}
                />
              ))}
            </div>

            <button
              onClick={() => setStep(step + 1)}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl transition-all"
              data-testid="button-welcome-next"
            >
              {step === STEPS.length - 1 ? "Claim Your Gift" : "Next"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400/30 to-primary/20 flex items-center justify-center text-amber-300 mb-4 animate-pulse">
              <Gift className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-white mb-1">Welcome Gift!</h2>
            <p className="text-sm text-muted-foreground mb-4">Here's a starter bonus to kick off your mining journey.</p>
            <div className="flex items-center gap-2 text-3xl font-black text-amber-300 mb-6">
              <Coins className="w-7 h-7" />
              +5,000
            </div>
            <button
              onClick={handleClaim}
              className="w-full bg-gradient-to-r from-amber-400 to-primary text-black font-black py-3 rounded-xl transition-all hover:opacity-90"
              data-testid="button-welcome-claim"
            >
              Claim 5,000 Points
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
