import { useEffect, useState } from "react";
import { adminApi, type ProviderReportData } from "./adminApi";
import { Zap, CheckCircle2, XCircle, Clock, TrendingUp } from "lucide-react";

const PROVIDER_COLORS: Record<string, string> = {
  adsgram: "#38bdf8",
  monetag: "#a78bfa",
  monlix: "#fb923c",
  bitlabs: "#34d399",
  lootably: "#f472b6",
  revlum: "#facc15",
  ayet: "#60a5fa",
  torox: "#4ade80",
  offertoro: "#f87171",
  cpx: "#c084fc",
  cpалead: "#fbbf24",
  adsterra: "#2dd4bf",
  propeller: "#fb7185",
  adscend: "#a3e635",
};

function colorFor(key: string) {
  return PROVIDER_COLORS[key.toLowerCase()] ?? "hsl(152,76%,55%)";
}

export function AdminProviderReports() {
  const [data, setData] = useState<ProviderReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setData(null);
    setError(null);
    adminApi.providerReport(days).then(setData).catch(() => setError("فشل تحميل البيانات"));
  }, [days]);

  if (error) return <p className="text-red-400 text-sm">{error}</p>;

  // Build aggregated totals per provider from recentTx
  const providerTotals = data
    ? Object.values(
        data.recentTx.reduce<Record<string, { key: string; total_points: number; total_rewards: number; avg_reward: number; days: number }>>((acc, row) => {
          if (!acc[row.provider_key]) acc[row.provider_key] = { key: row.provider_key, total_points: 0, total_rewards: 0, avg_reward: 0, days: 0 };
          acc[row.provider_key].total_points += row.total_points;
          acc[row.provider_key].total_rewards += row.total_rewards;
          acc[row.provider_key].days++;
          return acc;
        }, {}),
      ).map((p) => ({ ...p, avg_reward: p.total_rewards > 0 ? Math.round(p.total_points / p.total_rewards) : 0 }))
    : [];

  // Error stats by provider
  const errorMap = data
    ? Object.fromEntries(data.errorRate.map((r) => [r.provider_key, r]))
    : {};

  return (
    <div className="space-y-5" data-testid="section-admin-providers">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" /> تقارير المزودين
        </h2>
        <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${days === d ? "bg-primary text-black" : "bg-white/5 text-muted-foreground hover:text-white"}`}
            >
              {d}y
            </button>
          ))}
        </div>
      </div>

      {/* Provider status pills */}
      <div>
        <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">حالة المزودين</p>
        {!data ? (
          <div className="flex flex-wrap gap-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-8 w-24 bg-white/5 rounded-full animate-pulse" />)}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.providers.map((p) => (
              <div key={p.key} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold" style={{
                background: p.enabled ? `${colorFor(p.key)}18` : "rgba(255,255,255,0.04)",
                border: `1px solid ${p.enabled ? colorFor(p.key) + "40" : "rgba(255,255,255,0.08)"}`,
                color: p.enabled ? colorFor(p.key) : "#6b7280",
              }}>
                {p.enabled ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {p.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revenue summary cards */}
      {!data ? (
        <div className="grid grid-cols-2 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-white/5 rounded-2xl animate-pulse" />)}</div>
      ) : providerTotals.length === 0 ? (
        <div className="rounded-2xl p-6 text-center text-sm text-muted-foreground" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          لا توجد معاملات في الفترة المحددة
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {providerTotals.sort((a, b) => b.total_points - a.total_points).map((p) => {
            const color = colorFor(p.key);
            const err = errorMap[p.key];
            const errRate = err && err.total_events > 0 ? Math.round((err.error_count / err.total_events) * 100) : 0;
            return (
              <div key={p.key} className="rounded-2xl p-4 relative overflow-hidden" style={{
                background: `linear-gradient(160deg, ${color}10 0%, ${color}03 100%)`,
                border: `1px solid ${color}25`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05)`,
              }}>
                <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color }}>{p.key}</p>
                <p className="text-xl font-black text-white tabular-nums">{p.total_points.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">نقاط إجمالية</p>
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">{p.total_rewards.toLocaleString()} معاملة</span>
                  {errRate > 0 && (
                    <span className="text-red-400 font-bold">{errRate}% خطأ</span>
                  )}
                </div>
                {err && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{err.avg_latency_ms ?? 0}ms متوسط</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Error log table */}
      {data && data.errorRate.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-white">أداء المزودين التفصيلي</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-4 py-2 text-left text-muted-foreground font-semibold">المزود</th>
                  <th className="px-4 py-2 text-right text-muted-foreground font-semibold">أحداث</th>
                  <th className="px-4 py-2 text-right text-muted-foreground font-semibold">أخطاء</th>
                  <th className="px-4 py-2 text-right text-muted-foreground font-semibold">متوسط وقت</th>
                </tr>
              </thead>
              <tbody>
                {data.errorRate.map((r) => {
                  const errPct = r.total_events > 0 ? Math.round((r.error_count / r.total_events) * 100) : 0;
                  const color = colorFor(r.provider_key);
                  return (
                    <tr key={r.provider_key} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                      <td className="px-4 py-2.5">
                        <span className="font-bold" style={{ color }}>{r.provider_key}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-white font-semibold">{r.total_events.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={errPct > 10 ? "text-red-400 font-bold" : errPct > 5 ? "text-amber-400 font-bold" : "text-green-400 font-semibold"}>
                          {r.error_count} ({errPct}%)
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{r.avg_latency_ms ?? "—"}ms</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
