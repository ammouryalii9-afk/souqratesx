import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2, RefreshCw, Grid3x3, Users, Coins,
  StopCircle, PlayCircle, DollarSign, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  adminApi,
  type PixelCyclesData,
  type PixelHoldersData,
  type PixelHolder,
} from "./adminApi";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active:       { label: "نشطة",    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  distributing: { label: "توزيع",   cls: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  completed:    { label: "مكتملة",  cls: "bg-white/10 text-white/60 border-white/10" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function usdDisplay(cents: number) {
  return `$${(cents / 100).toFixed(3)}`;
}

function displayName(h: PixelHolder) {
  if (h.username) return `@${h.username}`;
  if (h.firstName) return h.firstName;
  return h.telegramId;
}

// ─── Credit-per-pixel panel ───────────────────────────────────────────────────
function CreditPanel({ onDone }: { onDone: () => void }) {
  const [usdPerPixel, setUsdPerPixel] = useState("");
  const [busy,        setBusy]        = useState(false);
  const [result,      setResult]      = useState<string | null>(null);
  const [err,         setErr]         = useState<string | null>(null);

  async function apply() {
    const val = parseFloat(usdPerPixel);
    if (!isFinite(val) || val <= 0) { setErr("أدخل قيمة أكبر من صفر"); return; }
    if (!confirm(`سيتم إضافة $${val} لكل بيكسل مشترى — هل أنت متأكد؟`)) return;
    setBusy(true); setErr(null); setResult(null);
    try {
      const r = await adminApi.creditPerPixel(val);
      setResult(
        `✅ تم — ${r.usersCredited} مستخدم · إجمالي ${usdDisplay(r.totalUsdCents)} أضيف للأرصدة (دورة #${r.cycleId})`,
      );
      setUsdPerPixel("");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "فشلت العملية");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 mb-1">
        <DollarSign className="w-4 h-4 text-amber-400" />
        <p className="font-bold text-white text-sm">توزيع أرباح بالدولار</p>
      </div>
      <p className="text-[11px] text-white/45 -mt-1">
        أدخل المبلغ بالدولار لكل بيكسل مشترى · يُضاف تلقائياً لرصيد جميع الحاملين في الدورة
      </p>

      <div className="flex gap-2">
        <input
          type="number"
          step="0.001"
          min="0"
          placeholder="مثال: 0.006"
          value={usdPerPixel}
          onChange={e => setUsdPerPixel(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-400/50"
        />
        <Button
          size="sm"
          onClick={apply}
          disabled={busy || !usdPerPixel}
          className="bg-amber-500 hover:bg-amber-400 text-black font-black shrink-0 px-4"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "تطبيق"}
        </Button>
      </div>

      {err    && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}
      {result && <p className="text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">{result}</p>}
    </div>
  );
}

// ─── Holders leaderboard ──────────────────────────────────────────────────────
function HoldersTable({ data }: { data: PixelHoldersData }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? data.holders : data.holders.slice(0, 10);

  if (data.holders.length === 0) {
    return (
      <p className="text-[11px] text-white/30 text-center py-4">
        لا يوجد مستخدمون يمتلكون بيكسل في الدورة الحالية
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Header */}
      <div className="grid grid-cols-[1.5rem_1fr_5rem_6rem] gap-2 px-2 text-[10px] font-semibold text-white/30 uppercase tracking-wide mb-0.5">
        <span>#</span>
        <span>المستخدم</span>
        <span className="text-right">البيكسل</span>
        <span className="text-right">الرصيد $</span>
      </div>

      {shown.map((h, i) => (
        <div
          key={h.telegramId}
          className="grid grid-cols-[1.5rem_1fr_5rem_6rem] gap-2 px-2 py-2.5 rounded-xl bg-white/3 border border-white/5 items-center"
        >
          <span className="text-[11px] text-white/30 font-bold">{i + 1}</span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">{displayName(h)}</p>
            <p className="text-[10px] text-white/30 truncate">{h.telegramId}</p>
          </div>
          <p className="text-xs font-bold text-white/80 text-right tabular-nums">
            {h.pixels.toLocaleString()}
          </p>
          <p className={`text-xs font-black text-right tabular-nums ${h.pixelUsdCents > 0 ? "text-emerald-400" : "text-white/30"}`}>
            {usdDisplay(h.pixelUsdCents)}
          </p>
        </div>
      ))}

      {data.holders.length > 10 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center justify-center gap-1.5 text-[11px] text-white/35 py-2 hover:text-white/60 transition-colors"
        >
          {expanded
            ? <><ChevronUp className="w-3.5 h-3.5" /> عرض أقل</>
            : <><ChevronDown className="w-3.5 h-3.5" /> عرض الكل ({data.holders.length})</>}
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdminPixels() {
  const [data,     setData]     = useState<PixelCyclesData | null>(null);
  const [holders,  setHolders]  = useState<PixelHoldersData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [hLoading, setHLoading] = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [closing,  setClosing]  = useState(false);
  const [starting, setStarting] = useState(false);

  function load() {
    setLoading(true); setError(null);
    adminApi.pixelCycles()
      .then(setData)
      .catch(() => setError("فشل تحميل دورات البكسلات"))
      .finally(() => setLoading(false));
  }

  function loadHolders() {
    setHLoading(true);
    adminApi.pixelHolders()
      .then(setHolders)
      .catch(() => {})
      .finally(() => setHLoading(false));
  }

  function loadAll() { load(); loadHolders(); }

  useEffect(() => { loadAll(); }, []);

  async function startCycle() {
    if (!confirm("بدء دورة بكسلات جديدة الآن؟")) return;
    setStarting(true); setError(null);
    try { await adminApi.startPixelCycle(); loadAll(); }
    catch (e) { setError(e instanceof Error ? e.message : "فشل بدء الدورة"); }
    finally   { setStarting(false); }
  }

  async function closeCycle() {
    if (!confirm("إغلاق الدورة النشطة الآن وتوزيع الأرباح على حاملي البكسلات؟ لا يمكن التراجع.")) return;
    setClosing(true); setError(null);
    try { await adminApi.closePixelCycle(); loadAll(); }
    catch (e) { setError(e instanceof Error ? e.message : "فشل إغلاق الدورة"); }
    finally   { setClosing(false); }
  }

  const active = data?.cycles.find((c) => c.status === "active");

  return (
    <div className="flex flex-col gap-4" data-testid="section-admin-pixels">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
            <Grid3x3 className="w-4 h-4 text-primary" /> البكسلات
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            دورات الاستثمار وتوزيع أرباح الإعلانات — الإعدادات تُعدَّل من تبويب الإعدادات
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={loadAll} className="border-white/10 gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> تحديث
        </Button>
      </div>

      {error && (
        <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      )}

      {loading || !data ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Settings summary */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl border border-white/6 bg-white/2 p-3">
              <p className="text-muted-foreground">المعروض لكل دورة</p>
              <p className="font-bold text-white mt-0.5">{data.settings.totalSupply.toLocaleString()} بكسل</p>
            </div>
            <div className="rounded-xl border border-white/6 bg-white/2 p-3">
              <p className="text-muted-foreground">نسبة التوزيع من إيراد الإعلانات</p>
              <p className="font-bold text-white mt-0.5">{data.settings.dividendPercent}%</p>
            </div>
            <div className="rounded-xl border border-white/6 bg-white/2 p-3">
              <p className="text-muted-foreground">مدة الدورة</p>
              <p className="font-bold text-white mt-0.5">{data.settings.cycleDays} يوم</p>
            </div>
            <div className="rounded-xl border border-white/6 bg-white/2 p-3">
              <p className="text-muted-foreground">بدء تلقائي للدورة التالية</p>
              <p className="font-bold text-white mt-0.5">{data.settings.autoStart ? "مفعّل" : "متوقف"}</p>
            </div>
          </div>

          {/* Active cycle */}
          {active && data.activeStats ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-white text-sm">الدورة النشطة #{active.id}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_LABELS.active.cls}`}>
                  {STATUS_LABELS.active.label}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px] mb-3">
                <div>
                  <p className="text-muted-foreground flex items-center justify-center gap-1">
                    <Grid3x3 className="w-3 h-3" /> مُباع
                  </p>
                  <p className="font-black text-white mt-0.5">{data.activeStats.sold.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground flex items-center justify-center gap-1">
                    <Users className="w-3 h-3" /> حاملون
                  </p>
                  <p className="font-black text-white mt-0.5">{data.activeStats.holders.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground flex items-center justify-center gap-1">
                    <Coins className="w-3 h-3" /> إيراد الدورة
                  </p>
                  <p className="font-black text-white mt-0.5">{active.totalAdRevenueSkx.toLocaleString()} SKX</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mb-3">
                تنتهي: {new Date(active.endDate).toLocaleString()}
              </p>
              <Button
                size="sm" variant="destructive" onClick={closeCycle}
                disabled={closing} className="gap-1 w-full"
              >
                {closing
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <StopCircle className="w-3 h-3" />}
                إغلاق الدورة وتوزيع الأرباح الآن
              </Button>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground rounded-2xl border border-white/6 bg-white/2 flex flex-col items-center gap-3">
              <p className="text-3xl">🧊</p>
              <p className="text-sm">لا توجد دورة نشطة حاليًا</p>
              <Button
                size="sm" onClick={startCycle} disabled={starting}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {starting
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <PlayCircle className="w-3.5 h-3.5" />}
                بدء دورة جديدة الآن
              </Button>
              {data.settings.autoStart && (
                <p className="text-[10px] text-muted-foreground/60">
                  أو سيبدأ النظام دورة تلقائيًا خلال الفحص الدوري القادم
                </p>
              )}
            </div>
          )}

          {/* ── Credit per pixel ── */}
          <CreditPanel onDone={loadHolders} />

          {/* ── Holders leaderboard ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                أرباح المستخدمين
              </h4>
              {holders && (
                <span className="text-[10px] text-white/30">
                  دورة #{holders.cycleId} · {holders.holders.length} مستخدم
                </span>
              )}
            </div>
            {hLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : holders ? (
              <HoldersTable data={holders} />
            ) : null}
          </div>

          {/* Cycle history */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">سجل الدورات</h4>
            {data.cycles.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60">لا توجد دورات بعد</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.cycles.map((c) => {
                  const st = STATUS_LABELS[c.status] ?? STATUS_LABELS.completed;
                  return (
                    <div key={c.id} className="rounded-xl border border-white/6 bg-white/2 p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-white text-xs">دورة #{c.id}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(c.startDate).toLocaleDateString()} ← {new Date(c.endDate).toLocaleDateString()}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {c.totalPixelsSold.toLocaleString()} بكسل مُباع · إيراد {c.totalAdRevenueSkx.toLocaleString()} SKX · وُزِّع {c.distributionAmountSkx.toLocaleString()} SKX
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
