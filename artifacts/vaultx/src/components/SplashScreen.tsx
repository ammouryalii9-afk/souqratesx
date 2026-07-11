import { useEffect, useState } from "react";
import logo from "@assets/logo_pro_1_transparent_1783761968725.png";

interface SplashScreenProps {
  onDone: () => void;
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const durationMs = 2200;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
      setCount(pct);
      if (pct >= 100) {
        clearInterval(interval);
        setTimeout(onDone, 300);
      }
    }, 20);
    return () => clearInterval(interval);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background overflow-hidden">
      {/* Background glow layers */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(52,211,153,0.08) 0%, transparent 70%)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 50% 50% at 50% 80%, rgba(212,175,55,0.06) 0%, transparent 60%)' }} />

      <div className="flex flex-col items-center gap-6 w-full px-10 relative z-10">

        {/* Logo — large, centered, with a golden glow */}
        <div className="relative flex items-center justify-center" style={{ width: 260, height: 260 }}>
          {/* Outer golden glow */}
          <div className="absolute inset-0 rounded-full" style={{
            background: 'radial-gradient(circle, rgba(212,175,55,0.22) 0%, transparent 70%)',
            filter: 'blur(24px)',
            animation: 'vaultPulse 3s ease-in-out infinite',
          }} />
          {/* Green inner glow */}
          <div className="absolute inset-8 rounded-full" style={{
            background: 'radial-gradient(circle, rgba(52,211,153,0.18) 0%, transparent 70%)',
            filter: 'blur(16px)',
          }} />
          <img
            src={logo}
            alt="SouqrateX"
            style={{
              width: 240,
              height: 240,
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 32px rgba(212,175,55,0.45)) drop-shadow(0 0 12px rgba(52,211,153,0.35))',
              position: 'relative',
              zIndex: 10,
            }}
          />
        </div>

        {/* App name */}
        <span
          className="text-4xl font-black text-white tracking-tight"
          style={{ textShadow: '0 0 40px rgba(52,211,153,0.4), 0 0 80px rgba(212,175,55,0.2), 0 2px 0 rgba(0,0,0,0.5)' }}
        >
          SouqrateX
        </span>

        {/* Counter + progress bar */}
        <div className="w-full flex flex-col items-center gap-3 mt-2">
          {/* Counter number */}
          <span
            className="text-5xl font-black tabular-nums"
            style={{
              background: 'linear-gradient(135deg, #d4af37, #34d399)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 8px rgba(52,211,153,0.4))',
            }}
          >
            {count}
          </span>

          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden border border-white/5">
            <div
              className="h-full rounded-full transition-[width] duration-75 ease-linear"
              style={{
                width: `${count}%`,
                background: 'linear-gradient(90deg, #d4af37, #34d399)',
                boxShadow: '0 0 12px rgba(52,211,153,0.5)',
              }}
            />
          </div>

          <span className="text-xs text-primary/60 font-semibold tracking-widest uppercase">
            Loading...
          </span>
        </div>
      </div>
    </div>
  );
}
