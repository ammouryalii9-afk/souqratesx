import { useEffect, useState } from "react";

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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#13081e]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-50" />
      <div className="flex flex-col items-center gap-12 w-full max-w-[280px] px-6 relative z-10">
        <div className="relative flex flex-col items-center justify-center">
          <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full animate-pulse" />
          <div className="flex items-center gap-1 text-[120px] tracking-tighter leading-none italic drop-shadow-[0_0_30px_rgba(245,197,24,0.4)] relative z-10">
            <span className="font-black" style={{ color: "var(--glow-green)", textShadow: "0 0 20px var(--glow-green)" }}>S</span>
            <span className="font-black text-primary" style={{ textShadow: "0 0 20px var(--primary)" }}>X</span>
          </div>
          <span className="font-black tracking-[0.2em] text-sm mt-4 text-white/80 uppercase">SouqrateX</span>
        </div>
        
        <div className="w-full flex flex-col gap-3">
          <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden shadow-inner border border-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--glow-green)] to-primary transition-[width] duration-75 ease-linear shadow-[0_0_15px_rgba(245,197,24,0.6)]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-primary/80 font-bold tracking-widest uppercase text-center">{progress}%</span>
        </div>
      </div>
    </div>
  );
}
