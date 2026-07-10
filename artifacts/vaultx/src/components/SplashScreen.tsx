import { useEffect, useState } from "react";
import logo from "@assets/splash_logo_optimized.jpg";

interface SplashScreenProps {
  onDone: () => void;
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const durationMs = 700;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
        setTimeout(onDone, 250);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      <div className="flex flex-col items-center gap-8 w-full max-w-[280px] px-6 relative z-10">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-[40px] rounded-full animate-pulse" />
          <img
            src={logo}
            alt="SouqrateX"
            fetchPriority="high"
            decoding="sync"
            className="w-40 h-40 object-contain drop-shadow-[0_0_25px_rgba(52,211,153,0.35)] relative z-10 rounded-[32px]"
          />
        </div>
        <span className="font-black tracking-tight text-3xl text-white drop-shadow-md">SouqrateX</span>
        <div className="w-full flex flex-col gap-3">
          <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden shadow-inner border border-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-primary to-primary transition-[width] duration-75 ease-linear shadow-[0_0_10px_rgba(52,211,153,0.5)]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-primary/70 font-semibold tracking-widest uppercase text-center">{progress}%</span>
        </div>
      </div>
    </div>
  );
}
