import { useEffect, useState } from "react";
import { adminApi, type AnalyticsData } from "./adminApi";
import { TrendingUp, Users, Repeat2, Trophy } from "lucide-react";

const LEAGUE_COLORS: Record<string, string> = {
  Bronze: "#cd7f32",
  Silver: "#9ca3af",
  Gold: "#f59e0b",
  Diamond: "#38bdf8",
};

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-16 text-right shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-bold text-white w-12 shrink-0">{value.toLocaleString()}</span>
    </div>
  );
}

function SparkLine({ data, color = "hsl(152,76%,55%)" }: { data: number[]; color?: string }) {
  if (data.length < 2) return <div className="h-12 flex items-center justify-center text-xs text-muted-foreground">لا بيانات</div>;
  const max = Math.max(...data, 1);
  const w = 200;
  const h = 48;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const area = `M${pts[0]} ` + pts.slice(1).map((p) => `L${p}`).join(" ") + ` L${w},${h} L0,${h} Z`;
  const line = `M${pts[0]} ` + pts.slice(1).map((p) => `L${p}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12 overflow-visible">
      <defs>
        <linearGradient id={`sg-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(14);

  useEffect(() => {
    setData(null);
    setError(null);
    adminApi.analytics(days).then(setData).catch(() => setError("فشل تحميل البيانات"));
  }, [days]);

  if (error) return <p className="text-red-400 text-sm">{error}</p>;

  const userCounts = data?.newUsersByDay.map((r) => r.count) ?? [];
  const rewardCounts = data?.rewardsByDay.map((r) => r.total_points) ?? [];
  const maxLeague = Math.max(...(data?.leagueDistribution.map((l) => l.count) ?? [1]), 1);

  return (
    <div className="space-y-5" data-testid="section-admin-analytics">
      {/* Days selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" /> التحليلات
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

      {/* Retention cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4" style={{
          background: "linear-gradient(135deg, rgba(52,211,153,0.08) 0%, rgba(52,211,153,0.02) 100%)",
          border: "1px solid rgba(52,211,153,0.15)",
        }}>
          <div className="flex items-center gap-2 mb-2">
            <Repeat2 className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-semibold">D1 Retention</span>
          </div>
          {data ? (
            <>
              <div className="text-3xl font-black text-white">
                {data.retention.d1Rate !== null ? `${data.retention.d1Rate}%` : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">من {data.retention.d1Total.toLocaleString()} مستخدم</div>
            </>
          ) : <div className="text-muted-foreground text-sm animate-pulse">...</div>}
        </div>
        <div className="rounded-2xl p-4" style={{
          background: "linear-gradient(135deg, rgba(56,189,248,0.08) 0%, rgba(56,189,248,0.02) 100%)",
          border: "1px solid rgba(56,189,248,0.15)",
        }}>
          <div className="flex items-center gap-2 mb-2">
            <Repeat2 className="w-4 h-4 text-sky-400" />
            <span className="text-xs text-muted-foreground font-semibold">D7 Retention</span>
          </div>
          {data ? (
            <>
              <div className="text-3xl font-black text-white">
                {data.retention.d7Rate !== null ? `${data.retention.d7Rate}%` : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">من {data.retention.d7Total.toLocaleString()} مستخدم</div>
            </>
          ) : <div className="text-muted-foreground text-sm animate-pulse">...</div>}
        </div>
      </div>

      {/* New users sparkline */}
      <div className="rounded-2xl p-4" style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-white">مستخدمون جدد / يوم</span>
          </div>
          {data && <span className="text-xs font-bold text-primary">{userCounts.reduce((a, b) => a + b, 0).toLocaleString()} إجمالي</span>}
        </div>
        {data ? <SparkLine data={userCounts} /> : <div className="h-12 bg-white/5 rounded-lg animate-pulse" />}
        {data && data.newUsersByDay.length > 0 && (
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>{data.newUsersByDay[0]?.date?.slice(5)}</span>
            <span>{data.newUsersByDay[data.newUsersByDay.length - 1]?.date?.slice(5)}</span>
          </div>
        )}
      </div>

      {/* Rewards sparkline */}
      <div className="rounded-2xl p-4" style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-bold text-white">نقاط مكتسبة عبر المزودين / يوم</span>
          </div>
          {data && <span className="text-xs font-bold text-amber-400">{rewardCounts.reduce((a, b) => a + b, 0).toLocaleString()} pts</span>}
        </div>
        {data ? <SparkLine data={rewardCounts} color="#f59e0b" /> : <div className="h-12 bg-white/5 rounded-lg animate-pulse" />}
      </div>

      {/* League distribution */}
      <div className="rounded-2xl p-4" style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-white">توزيع اللاعبين حسب الدوري</span>
        </div>
        {data ? (
          <div className="space-y-3">
            {data.leagueDistribution.map((l) => (
              <MiniBar
                key={l.league}
                label={l.league}
                value={l.count}
                max={maxLeague}
                color={LEAGUE_COLORS[l.league] ?? "#9ca3af"}
              />
            ))}
          </div>
        ) : <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-4 bg-white/5 rounded-full animate-pulse" />)}</div>}
      </div>
    </div>
  );
}
