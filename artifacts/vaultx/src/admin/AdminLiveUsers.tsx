import { useEffect, useRef, useState } from "react";
import { adminApi, type LiveUser } from "./adminApi";
import { Radio, Clock, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

function fmtDuration(seconds: number): string {
  if (seconds <= 0) return "0د";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}س ${m}د`;
  if (m > 0) return `${m}د ${s}ث`;
  return `${s}ث`;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 10) return "الآن";
  if (diff < 60) return `منذ ${diff}ث`;
  return `منذ ${Math.floor(diff / 60)}د`;
}

function UserRow({ user }: { user: LiveUser }) {
  const display = user.username ? `@${user.username}` : (user.firstName ?? user.telegramId);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-muted-foreground flex-shrink-0 overflow-hidden">
        {user.photoUrl
          ? <img src={user.photoUrl} alt="" className="w-full h-full object-cover" />
          : display[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{display}</p>
        <p className="text-[10px] text-muted-foreground">{user.lifetimePoints.toLocaleString()} نقطة</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs text-emerald-400 font-medium">{fmtRelative(user.lastSeenAt)}</p>
        <p className="text-[10px] text-muted-foreground">جلسة: {fmtDuration(user.totalSessionSeconds)}</p>
      </div>
    </div>
  );
}

function TopRow({ user, rank }: { user: LiveUser; rank: number }) {
  const display = user.username ? `@${user.username}` : (user.firstName ?? user.telegramId);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <span className="w-6 text-center text-xs text-muted-foreground flex-shrink-0 font-bold">#{rank}</span>
      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs text-muted-foreground flex-shrink-0 overflow-hidden">
        {user.photoUrl
          ? <img src={user.photoUrl} alt="" className="w-full h-full object-cover" />
          : display[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{display}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs text-amber-400 font-medium">{fmtDuration(user.totalSessionSeconds)}</p>
      </div>
    </div>
  );
}

export function AdminLiveUsers() {
  const [live, setLive] = useState<LiveUser[]>([]);
  const [top, setTop] = useState<LiveUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const [liveData, topData] = await Promise.all([
        adminApi.liveUsers(),
        adminApi.topSessionUsers(),
      ]);
      setLive(liveData);
      setTop(topData);
      setLastRefresh(new Date());
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 15_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-4" data-testid="section-admin-live-users">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            المستخدمون المتصلون
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {live.length > 0 ? `${live.length} متصل خلال آخر 3 دقائق` : "لا يوجد متصلون حالياً"}
            {lastRefresh && (
              <span className="ml-2 opacity-60">· آخر تحديث {lastRefresh.toLocaleTimeString('ar-SA')}</span>
            )}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="border-white/10 h-8 px-3">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm text-center py-6">جار التحميل...</p>
      ) : (
        <>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            {live.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">لا يوجد مستخدمون متصلون الآن</p>
            ) : (
              <div>
                {live.map((u) => <UserRow key={u.telegramId} user={u} />)}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              أكثر المستخدمين وقتاً في التطبيق (كل الوقت)
            </h3>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              {top.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-4">لا توجد بيانات جلسات بعد</p>
              ) : (
                <div>
                  {top.map((u, i) => <TopRow key={u.telegramId} user={u} rank={i + 1} />)}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
