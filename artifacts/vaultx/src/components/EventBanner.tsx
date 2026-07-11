import { useEffect, useState } from 'react';
import { useVault } from '../context/VaultContext';
import { getEngageStatus, type EngageStatus } from '../lib/engageApi';
import { Zap } from 'lucide-react';

function useCountdown(target: number | null): string {
  const [, force] = useState(0);
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!target) return '';
  const ms = Math.max(0, target - Date.now());
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

export function EventBanner() {
  const { isTelegramUser } = useVault();
  const [event, setEvent] = useState<EngageStatus['event'] | null>(null);

  useEffect(() => {
    if (!isTelegramUser) return;
    const load = () => getEngageStatus().then((s) => setEvent(s.event)).catch(() => setEvent(null));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [isTelegramUser]);

  const endsAt = event?.endsAt ? new Date(event.endsAt).getTime() : null;
  const countdown = useCountdown(endsAt);

  if (!isTelegramUser || !event?.active) return null;

  return (
    <div
      className="mx-4 mt-3 rounded-2xl px-4 py-2.5 flex items-center justify-between relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(236,72,153,0.15))',
        border: '1px solid rgba(168,85,247,0.4)',
        boxShadow: '0 0 24px rgba(168,85,247,0.2)',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse pointer-events-none" />
      <div className="flex items-center gap-2 relative z-10">
        <Zap className="w-4 h-4 text-fuchsia-300" />
        <div className="flex flex-col">
          <span className="text-sm font-black text-white leading-tight">{event.title}</span>
          <span className="text-[10px] font-bold text-fuchsia-200/80 uppercase tracking-wide">
            x{event.multiplier} points on every tap
          </span>
        </div>
      </div>
      {countdown && (
        <span className="text-[11px] font-bold text-white bg-black/30 px-2.5 py-1 rounded-full relative z-10">
          {countdown}
        </span>
      )}
    </div>
  );
}
