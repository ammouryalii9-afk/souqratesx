import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Grid3x3, Users, Coins, StopCircle } from "lucide-react";
import { adminApi, type PixelCyclesData } from "./adminApi";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active: { label: "نشطة", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  distributing: { label: "توزيع", cls: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  completed: { label: "مكتملة", cls: "bg-white/10 text-white/60 border-white/10" },
};

export function AdminPixels() {
  const [data, setData] = useState<PixelCyclesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    adminApi
      .pixelCycles()
      .then(setData)
      .catch(() => setError("فشل تحميل دورات البكسلات"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function closeCycle() {
    if (!confirm("إغلاق الدورة النشطة الآن وتوزيع الأرباح على حاملي البكسلات؟ لا يمكن التراجع.")) return;
    setClosing(true);
    setError(null);
    try {
      await adminApi.closePixelCycle();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل إغلاق الدورة");
    } finally {
      setClosing(false);
    }
  }

  const active = data?.cycles.find((c) => c.status === "active");

  return (
    <div className="flex flex-col gap-4" data-testid="section-admin-pixels">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
            <Grid3x3 className="w-4 h-4 text-primary" /> البكسلات
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            دورات الاستثمار وتوزيع أرباح الإعلانات — الإعدادات تُعدَّل من تبويب الإعدادات
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="border-white/10 gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> تحديث
        </Button>
      </div>

      {error && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      {loading || !data ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Current settings summary */}
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
                  <p className="text-muted-foreground flex items-center justify-center gap-1"><Grid3x3 className="w-3 h-3" /> مُباع</p>
                  <p className="font-black text-white mt-0.5">{data.activeStats.sold.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground flex items-center justify-center gap-1"><Users className="w-3 h-3" /> حاملون</p>
                  <p className="font-black text-white mt-0.5">{data.activeStats.holders.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground flex items-center justify-center gap-1"><Coins className="w-3 h-3" /> إيراد الدورة</p>
                  <p className="font-black text-white mt-0.5">{active.totalAdRevenueSkx.toLocaleString()} SKX</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mb-3">
                تنتهي: {new Date(active.endDate).toLocaleString()}
              </p>
              <Button
                size="sm"
                variant="destructive"
                onClick={closeCycle}
                disabled={closing}
                className="gap-1 w-full"
              >
                {closing ? <Loader2 className="w-3 h-3 animate-spin" /> : <StopCircle className="w-3 h-3" />}
                إغلاق الدورة وتوزيع الأرباح الآن
              </Button>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground rounded-2xl border border-white/6 bg-white/2">
              <p className="text-3xl mb-2">🧊</p>
              <p className="text-sm">لا توجد دورة نشطة حاليًا</p>
              {data.settings.autoStart && (
                <p className="text-[10px] mt-1 text-muted-foreground/60">سيبدأ النظام دورة جديدة تلقائيًا خلال الفحص الدوري القادم</p>
              )}
            </div>
          )}

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
