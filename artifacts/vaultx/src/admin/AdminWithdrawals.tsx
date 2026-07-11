import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock, Loader2, RefreshCw, Copy, Check } from "lucide-react";

type WithdrawalRequest = {
  id: number;
  telegramId: string;
  pointsAmount: number;
  usdAmount: number;
  tonAmount: number;
  tonPriceUsd: number;
  walletAddress: string;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  createdAt: string;
  processedAt: string | null;
  username: string | null;
  firstName: string | null;
};

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

function StatusBadge({ status }: { status: WithdrawalRequest["status"] }) {
  if (status === "pending") return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
      <Clock className="w-2.5 h-2.5" /> انتظار
    </span>
  );
  if (status === "approved") return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 className="w-2.5 h-2.5" /> موافق
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
      <XCircle className="w-2.5 h-2.5" /> مرفوض
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-white transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export function AdminWithdrawals() {
  const [items, setItems] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const [noteInput, setNoteInput] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  function load() {
    setLoading(true);
    setError(null);
    adminFetch<WithdrawalRequest[]>("/admin/withdrawals")
      .then(setItems)
      .catch(() => setError("فشل تحميل طلبات السحب"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function approve(item: WithdrawalRequest) {
    setActionId(item.id);
    try {
      await adminFetch(`/admin/withdrawals/${item.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ adminNote: noteInput[item.id] ?? "" }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الموافقة");
    } finally {
      setActionId(null);
    }
  }

  async function reject(item: WithdrawalRequest) {
    if (!noteInput[item.id]?.trim()) {
      setError("يجب كتابة سبب الرفض");
      return;
    }
    setActionId(item.id);
    try {
      await adminFetch(`/admin/withdrawals/${item.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ adminNote: noteInput[item.id] }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الرفض");
    } finally {
      setActionId(null);
    }
  }

  const pending = items.filter((i) => i.status === "pending");
  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <div className="flex flex-col gap-4" data-testid="section-admin-withdrawals">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white text-sm">طلبات السحب</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {pending.length > 0 ? (
              <span className="text-amber-400 font-semibold">{pending.length} طلب معلق</span>
            ) : (
              "لا توجد طلبات معلقة"
            )}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="border-white/10 gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> تحديث
        </Button>
      </div>

      {error && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${filter === f ? "bg-primary text-black" : "bg-white/5 text-muted-foreground border border-white/8 hover:bg-white/10"}`}
          >
            {f === "all" ? "الكل" : f === "pending" ? "معلق" : f === "approved" ? "موافق" : "مرفوض"}
            {f === "pending" && pending.length > 0 && (
              <span className="ml-1 px-1 rounded-full text-[9px] bg-amber-500 text-black font-black">{pending.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-sm">لا توجد طلبات في هذه الفئة</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl border p-4 flex flex-col gap-3 transition-all ${item.status === "pending" ? "border-amber-500/20 bg-amber-500/4" : item.status === "approved" ? "border-emerald-500/15 bg-emerald-500/3" : "border-white/6 bg-white/2"}`}
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold text-white text-base">{item.tonAmount.toFixed(4)} TON</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.pointsAmount.toLocaleString()} نقطة · ${item.usdAmount.toFixed(3)} · @${item.tonPriceUsd.toFixed(2)}/TON
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString("ar-SA")}</p>
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">{new Date(item.createdAt).toLocaleTimeString("ar-SA")}</p>
                </div>
              </div>

              {/* User info */}
              <div className="bg-white/4 border border-white/6 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-white">
                    {item.firstName ?? item.username ?? "مستخدم غير معروف"}
                    {item.username && <span className="text-muted-foreground font-normal ml-1">@{item.username}</span>}
                  </p>
                  <p className="text-[10px] text-muted-foreground">ID: {item.telegramId}</p>
                </div>
              </div>

              {/* Wallet */}
              <div className="bg-white/3 border border-white/6 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground mb-0.5">محفظة TON</p>
                  <p className="text-xs font-mono text-white break-all">{item.walletAddress}</p>
                </div>
                <CopyButton text={item.walletAddress} />
              </div>

              {/* Admin note (existing) */}
              {item.adminNote && (
                <p className="text-xs text-muted-foreground italic px-1">"{item.adminNote}"</p>
              )}

              {/* Actions for pending */}
              {item.status === "pending" && (
                <div className="flex flex-col gap-2">
                  <textarea
                    placeholder="ملاحظة (مطلوبة عند الرفض، اختيارية عند الموافقة)"
                    value={noteInput[item.id] ?? ""}
                    onChange={(e) => setNoteInput((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    rows={2}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 resize-none"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => approve(item)}
                      disabled={actionId === item.id}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
                    >
                      {actionId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      موافقة — تأكيد التحويل
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => reject(item)}
                      disabled={actionId === item.id}
                      className="flex-1 gap-1"
                    >
                      {actionId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                      رفض — إعادة النقاط
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 text-center">
                    الموافقة تعني أنك أرسلت {item.tonAmount.toFixed(4)} TON إلى المحفظة المذكورة فعلاً
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
