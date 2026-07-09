import { useEffect, useState } from "react";
import logo from "@assets/WhatsApp_Image_2026-07-09_at_4.17.52_PM_1783603161513.jpeg";

interface SplashScreenProps {
  onDone: () => void;
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const durationMs = 1800;
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-8 w-full max-w-[280px] px-6">
        <img
          src={logo}
          alt="SouqrateX"
          className="w-40 h-40 object-contain drop-shadow-[0_0_25px_rgba(245,197,24,0.35)]"
        />
        <span className="font-bold tracking-tight text-2xl text-white">SouqrateX</span>
        <div className="w-full flex flex-col gap-2">
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8A6F00] via-primary to-primary transition-[width] duration-75 ease-linear shadow-[0_0_10px_rgba(245,197,24,0.5)]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground font-medium text-center">{progress}%</span>
        </div>
      </div>
    </div>
  );
}
