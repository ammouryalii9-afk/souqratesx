import { useState, useEffect, useCallback } from 'react';
import { X, Wallet, Clock, CheckCircle2, XCircle, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useVault } from '../context/VaultContext';

// ── Types ──────────────────────────────────────────────────────────────────────

type WithdrawalRequest = {
  id: number;
  pointsAmount: number;
  usdAmount: number;
  tonAmount: number;
  tonPriceUsd: number;
  walletAddress: string;
  status: 'pending' | 'approved' | 'rejected';
  adminNote: string | null;
  createdAt: string;
  processedAt: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const POINTS_PER_USD = 1_000_000;
const MIN_POINTS = 500_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

function isValidTonWallet(addr: string): boolean {
  const t = addr.trim();
  if (/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(t)) return true;
  if (/^0:[0-9a-fA-F]{64}$/.test(t)) return true;
  return false;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WithdrawalRequest['status'] }) {
  if (status === 'pending') return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
      <Clock className="w-2.5 h-2.5" /> Pending
    </span>
  );
  if (status === 'approved') return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 className="w-2.5 h-2.5" /> Approved
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
      <XCircle className="w-2.5 h-2.5" /> Rejected
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type Props = { onClose: () => void };

export function WithdrawModal({ onClose }: Props) {
  const { tempMiningPoints, lifetimePoints, isTelegramUser, refreshFromServer } = useVault();

  const [tonPrice, setTonPrice] = useState<number | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(true);

  const [pointsInput, setPointsInput] = useState('');
  const [wallet, setWallet] = useState('');
  const [walletTouched, setWalletTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [history, setHistory] = useState<WithdrawalRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchTonPrice = useCallback(async () => {
    setLoadingPrice(true);
    try {
      const data = await apiFetch<{ usd: number }>('/ton-price');
      setTonPrice(data.usd);
    } catch {
      setTonPrice(null);
    } finally {
      setLoadingPrice(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!isTelegramUser) return;
    setLoadingHistory(true);
    try {
      const data = await apiFetch<WithdrawalRequest[]>('/withdraw/my-requests');
      setHistory(data);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, [isTelegramUser]);

  useEffect(() => {
    fetchTonPrice();
    fetchHistory();
  }, [fetchTonPrice, fetchHistory]);

  // Derived values
  const points = parseInt(pointsInput.replace(/,/g, ''), 10) || 0;
  const usdValue = points / POINTS_PER_USD;
  const tonValue = tonPrice ? usdValue / tonPrice : null;
  const walletValid = isValidTonWallet(wallet);
  const hasEnough = points <= tempMiningPoints;
  const meetsMinimum = points >= MIN_POINTS;
  const canSubmit = points > 0 && meetsMinimum && hasEnough && walletValid && !submitting && isTelegramUser && tonPrice !== null;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiFetch('/withdraw/request', {
        method: 'POST',
        body: JSON.stringify({ pointsAmount: points, walletAddress: wallet.trim() }),
      });
      setSubmitted(true);
      await refreshFromServer();
      await fetchHistory();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden max-h-[92dvh] flex flex-col"
        style={{ background: 'hsl(224,71%,5%)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-shrink-0 border-b border-white/5">
          <div>
            <h2 className="font-bold text-white text-lg">Withdraw</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Convert your mined points to TON</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-5">
          {/* TON Price banner */}
          <div
            className="flex items-center justify-between px-4 py-3 rounded-2xl"
            style={{ background: 'rgba(0,136,204,0.08)', border: '1px solid rgba(0,136,204,0.2)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">💎</span>
              <span className="text-sm font-semibold text-white">TON Price</span>
            </div>
            {loadingPrice ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : tonPrice ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">${tonPrice.toFixed(2)}</span>
                <button onClick={fetchTonPrice} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-white transition-colors">
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <span className="text-xs text-red-400">Price unavailable</span>
            )}
          </div>

          {/* Balance */}
          <div
            className="flex items-center justify-between px-4 py-3 rounded-xl"
            style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}
          >
            <span className="text-xs text-muted-foreground">Available Mined Balance</span>
            <span className="text-sm font-bold text-primary">{Math.floor(tempMiningPoints).toLocaleString()} pts</span>
          </div>

          {submitted ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)' }}>
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="font-bold text-white text-base">Request Submitted!</p>
                <p className="text-sm text-muted-foreground mt-1">Your withdrawal is under review. The admin will process it shortly.</p>
              </div>
              <button
                onClick={() => setSubmitted(false)}
                className="text-xs text-muted-foreground underline underline-offset-2"
              >
                Submit another request
              </button>
            </div>
          ) : (
            /* ── Form ── */
            <div className="flex flex-col gap-4">
              {/* Points input */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  Points to Withdraw
                </label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={`Min ${(MIN_POINTS).toLocaleString()}`}
                    value={pointsInput}
                    onChange={(e) => setPointsInput(e.target.value)}
                    className="w-full h-12 rounded-xl px-4 pr-20 text-white font-semibold bg-white/5 border border-white/10 focus:border-primary/50 focus:outline-none transition-colors"
                  />
                  <button
                    onClick={() => setPointsInput(String(Math.floor(tempMiningPoints)))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-primary hover:text-primary/80 transition-colors"
                  >
                    MAX
                  </button>
                </div>

                {/* Conversion preview */}
                {points > 0 && tonPrice && (
                  <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg bg-white/3">
                    <span className="text-xs text-muted-foreground">{points.toLocaleString()} pts →</span>
                    <div className="text-right">
                      <span className="text-sm font-bold text-white">{tonValue!.toFixed(4)} TON</span>
                      <span className="text-xs text-muted-foreground ml-1.5">(${usdValue.toFixed(4)})</span>
                    </div>
                  </div>
                )}

                {/* Validation messages */}
                {points > 0 && !meetsMinimum && (
                  <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Minimum is {MIN_POINTS.toLocaleString()} points ($0.50)
                  </p>
                )}
                {points > 0 && !hasEnough && (
                  <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Exceeds your mined balance
                  </p>
                )}
              </div>

              {/* Wallet input */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  Your TON Wallet Address
                </label>
                <div className="relative">
                  <Wallet className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="EQ... or UQ..."
                    value={wallet}
                    onChange={(e) => setWallet(e.target.value)}
                    onBlur={() => setWalletTouched(true)}
                    className="w-full h-12 rounded-xl px-4 pl-10 text-white text-sm bg-white/5 border border-white/10 focus:border-primary/50 focus:outline-none transition-colors font-mono"
                  />
                </div>
                {walletTouched && wallet.length > 0 && !walletValid && (
                  <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Invalid TON address format
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground/50 mt-1.5 leading-relaxed">
                  Accepts EQ… / UQ… (48 chars) or raw 0:hex format
                </p>
              </div>

              {/* Warning */}
              <div
                className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs"
                style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.15)' }}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-amber-200/70 leading-relaxed">
                  Points are deducted immediately when you submit. If your request is rejected, points are refunded to your account.
                </p>
              </div>

              {/* Error */}
              {submitError && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {submitError}
                </p>
              )}

              {/* Submit */}
              {!isTelegramUser ? (
                <p className="text-center text-xs text-muted-foreground py-2">Open inside Telegram to withdraw.</p>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="w-full h-12 rounded-xl font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    background: canSubmit
                      ? 'linear-gradient(135deg, hsl(152,76%,50%) 0%, hsl(152,76%,38%) 100%)'
                      : 'rgba(255,255,255,0.06)',
                    color: canSubmit ? 'hsl(224,71%,4%)' : 'rgba(255,255,255,0.3)',
                    boxShadow: canSubmit ? '0 0 20px rgba(52,211,153,0.25)' : 'none',
                  }}
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                  ) : (
                    <>💎 Submit Withdrawal Request</>
                  )}
                </button>
              )}
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Request History
              </h3>
              <div className="flex flex-col gap-2">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="px-4 py-3 rounded-xl flex items-start gap-3"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-bold text-white">{item.tonAmount.toFixed(4)} TON</span>
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.pointsAmount.toLocaleString()} pts · ${item.usdAmount.toFixed(3)} · @${item.tonPriceUsd.toFixed(2)}/TON
                      </p>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5 font-mono truncate">
                        {item.walletAddress.slice(0, 12)}…{item.walletAddress.slice(-6)}
                      </p>
                      {item.adminNote && (
                        <p className="text-xs text-amber-300/70 mt-1 italic">"{item.adminNote}"</p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground/40 flex-shrink-0 mt-0.5">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingHistory && (
            <div className="flex justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Lifetime total info */}
        <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-muted-foreground">Lifetime Points</span>
          <span className="text-xs font-bold text-white">{lifetimePoints.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
