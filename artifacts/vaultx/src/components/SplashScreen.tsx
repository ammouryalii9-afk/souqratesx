import { useEffect, useState } from "react";
import { Hexagon } from "lucide-react";

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
        <div className="relative w-36 h-36 flex items-center justify-center">
          <div className="absolute inset-0 rounded-[32px] animate-pulse" style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.35) 0%, transparent 70%)', filter: 'blur(16px)' }} />
          <div className="absolute inset-2 rounded-[28px]" style={{
            background: 'linear-gradient(145deg, rgba(52,211,153,0.18) 0%, rgba(52,211,153,0.05) 100%)',
            border: '1px solid rgba(52,211,153,0.25)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 0 40px rgba(52,211,153,0.2)',
          }} />
          <Hexagon className="absolute w-16 h-16 text-primary/15 fill-current" />
          <Hexagon className="w-14 h-14 text-primary relative z-10" style={{ filter: 'drop-shadow(0 0 12px rgba(52,211,153,0.5))' }} />
        </div>
        <span className="text-4xl font-black text-white tracking-tight mt-8" style={{ textShadow: '0 0 40px rgba(52,211,153,0.3), 0 2px 0 rgba(0,0,0,0.5)' }}>SouqrateX</span>
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
