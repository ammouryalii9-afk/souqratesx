import { useState, useEffect } from "react";
import { getPublicConfig } from "../lib/gameApi";
import { useLanguage } from "../lib/i18n";
import logo from "@assets/logo_pro_1_transparent_1783761968725.png";

const TERMS_ACCEPTED_KEY = "souqratesx_terms_accepted_v1";

interface OnboardingCardProps {
  onAccept: () => void;
}

export function OnboardingCard({ onAccept }: OnboardingCardProps) {
  const { tr } = useLanguage();
  const [termsText, setTermsText] = useState<string>("");
  const [welcomeText, setWelcomeText] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getPublicConfig()
      .then((config) => {
        setTermsText(config.botMessages.termsText);
        setWelcomeText(config.botMessages.welcomeText);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const displayWelcome = welcomeText || tr.onboarding.defaultWelcome;
  const displayTerms = termsText || tr.onboarding.defaultTerms;

  function handleAccept() {
    localStorage.setItem(TERMS_ACCEPTED_KEY, "1");
    onAccept();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-5 overflow-hidden">
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 30%, rgba(52,211,153,0.07) 0%, transparent 70%)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 50% at 50% 85%, rgba(212,175,55,0.05) 0%, transparent 60%)" }} />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-5">
        <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
          <div className="absolute inset-0 rounded-full" style={{
            background: "radial-gradient(circle, rgba(212,175,55,0.25) 0%, transparent 70%)",
            filter: "blur(12px)",
          }} />
          <img src={logo} alt="SouqrateX" style={{ width: 80, height: 80, objectFit: "contain", position: "relative", zIndex: 10, filter: "drop-shadow(0 0 16px rgba(212,175,55,0.4))" }} />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-black text-white tracking-tight mb-1">SouqrateX</h1>
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{displayWelcome}</p>
        </div>

        <div className="w-full rounded-xl border border-white/10 bg-white/5 p-4 max-h-52 overflow-y-auto">
          <p className="text-xs font-bold text-primary mb-2 uppercase tracking-wider">{tr.onboarding.terms}</p>
          <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">{loaded ? displayTerms : tr.onboarding.loading}</p>
        </div>

        <button
          onClick={handleAccept}
          className="w-full py-4 rounded-xl font-black text-base tracking-wide text-black transition-all active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #d4af37 0%, #34d399 100%)",
            boxShadow: "0 0 24px rgba(52,211,153,0.35), 0 0 48px rgba(212,175,55,0.15)",
          }}
        >
          {tr.onboarding.accept}
        </button>

        <p className="text-[10px] text-muted-foreground/50 text-center">
          {tr.onboarding.note}
        </p>
      </div>
    </div>
  );
}

export function checkTermsAccepted(): boolean {
  return localStorage.getItem(TERMS_ACCEPTED_KEY) === "1";
}
