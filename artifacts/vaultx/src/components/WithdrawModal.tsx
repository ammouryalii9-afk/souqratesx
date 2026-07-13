import { useState, useEffect, useCallback } from 'react';
import { X, Grid3x3, Clock, CheckCircle2, Loader2, TrendingUp, Coins } from 'lucide-react';
import { useVault } from '../context/VaultContext';
import { getMyPixels, type PixelDividend } from '../lib/gameApi';
import { useLanguage } from '../lib/i18n';

type Props = { onClose: () => void };

export function WithdrawModal({ onClose }: Props) {
  const { skxBalance, isTelegramUser } = useVault();
  const { tr } = useLanguage();

  const [dividends, setDividends] = useState<PixelDividend[]>([]);
  const [myPixels, setMyPixels] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isTelegramUser) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await getMyPixels();
      setDividends(data.dividends);
      setMyPixels(data.myPixels);
    } catch {
      // ignore — non-authed or no data
    } finally {
      setLoading(false);
    }
  }, [isTelegramUser]);

  useEffect(() => { load(); }, [load]);

  const totalEarned = dividends.reduce((s, d) => s + d.dividendSkx, 0);

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden max-h-[92dvh] flex flex-col"
        style={{ background: 'hsl(224,71%,5%)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-shrink-0 border-b border-white/5">
          <div>
            <h2 className="font-bold text-white text-lg flex items-center gap-2">
              <Grid3x3 className="w-5 h-5 text-primary" />
              {tr.withdraw.title}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{tr.withdraw.subtitle}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">

          {/* SKX Balance Card */}
          <div className="rounded-2xl p-5 flex flex-col gap-3"
            style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(251,191,36,0.03))', border: '1px solid rgba(251,191,36,0.2)' }}>
            <span className="text-xs text-amber-400/70 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5" /> {tr.withdraw.skxBalance}
            </span>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-black text-amber-300 tabular-nums leading-none">{skxBalance.toLocaleString()}</span>
              <span className="text-lg font-bold text-amber-400/70 mb-0.5">SKX</span>
            </div>
            {totalEarned > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400/60">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{tr.withdraw.totalEarned}: {totalEarned.toLocaleString()} SKX</span>
              </div>
            )}
          </div>

          {/* Current pixels */}
          {myPixels > 0 && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.12)' }}>
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Grid3x3 className="w-3.5 h-3.5 text-primary" /> {tr.withdraw.currentPixels}
              </span>
              <span className="text-sm font-bold text-primary">{myPixels.toLocaleString()} {tr.pixels.pixelUnit}</span>
            </div>
          )}

          {/* Coming soon banner */}
          <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <Clock className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-indigo-300">{tr.withdraw.comingSoon}</p>
              <p className="text-xs text-indigo-300/60 mt-0.5 leading-relaxed">{tr.withdraw.comingSoonDesc}</p>
            </div>
          </div>

          {/* Dividend history */}
          <div>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
              {tr.withdraw.dividendHistory}
            </h3>

            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : dividends.length === 0 ? (
              <div className="text-center py-8 rounded-2xl border border-white/5 bg-white/2">
                <Grid3x3 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{tr.withdraw.noDividends}</p>
                <p className="text-xs text-muted-foreground/50 mt-1">{tr.withdraw.noDividendsHint}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {dividends.map((d, i) => (
                  <div key={i}
                    className="px-4 py-3.5 rounded-xl flex items-center gap-3"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
                      <CheckCircle2 className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white">+{d.dividendSkx.toLocaleString()} SKX</span>
                        <span className="text-[10px] text-muted-foreground/50">
                          {new Date(d.paidAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {tr.withdraw.cycleLabel(d.cycleId)} · {d.pixelsHeld.toLocaleString()} {tr.pixels.pixelUnit}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
