import { useEffect, useState } from "react";
import { adminApi, type AntiCheatData } from "./adminApi";
import { ShieldAlert, AlertTriangle, Trophy, Users2, Ban } from "lucide-react";

function UserRow({
  telegramId, username, firstName, lifetimePoints, isBanned, extra, extraLabel, onBan,
}: {
  telegramId: string; username: string | null; firstName: string | null;
  lifetimePoints: number; isBanned: boolean;
  extra?: number | string; extraLabel?: string; onBan: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-white truncate">{firstName ?? username ?? telegramId}</span>
          {isBanned && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">محظور</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{telegramId}</span>
          <span className="text-[10px] text-primary font-semibold">{lifetimePoints.toLocaleString()} pts</span>
          {extra !== undefined && (
            <span className="text-[10px] font-bold text-amber-400">{typeof extra === "number" ? extra.toLocaleString() : extra} {extraLabel}</span>
          )}
        </div>
      </div>
      {!isBanned && (
        <button
          onClick={() => onBan(telegramId)}
          className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors"
        >
          حظر
        </button>
      )}
    </div>
  );
}

export function AdminAntiCheat() {
  const [data, setData] = useState<AntiCheatData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banning, setBanning] = useState<string | null>(null);

  const load = () => {
    setError(null);
    adminApi.antiCheat().then(setData).catch(() => setError("فشل تحميل البيانات"));
  };

  useEffect(() => { load(); }, []);

  const [bulkBanning, setBulkBanning] = useState(false);

  const handleBan = async (telegramId: string) => {
    if (!confirm(`حظر المستخدم ${telegramId}؟`)) return;
    setBanning(telegramId);
    try {
      await adminApi.updateUser(telegramId, { isBanned: true });
      load();
    } catch { /* ignore */ } finally {
      setBanning(null);
    }
  };

  const handleBulkBan = async () => {
    if (!data) return;
    const ids = data.suspicious.filter((u) => !u.is_banned).map((u) => u.telegram_id);
    if (ids.length === 0) return;
    if (!confirm(`حظر ${ids.length} مستخدم مشبوه دفعة واحدة؟`)) return;
    setBulkBanning(true);
    try {
      await adminApi.post("/admin/users/bulk-ban", { telegramIds: ids, ban: true });
      load();
    } catch { /* ignore */ } finally {
      setBulkBanning(false);
    }
  };

  if (error) return <p className="text-red-400 text-sm">{error}</p>;

  return (
    <div className="space-y-5" data-testid="section-admin-anticheat">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-400" /> مكافحة الغش
        </h2>
        {data && (
          <span className="text-[10px] text-muted-foreground bg-white/5 px-2 py-1 rounded-lg">
            حد النقاط/ساعة: {data.capPerHour.toLocaleString()}
          </span>
        )}
      </div>

      {/* Suspicious — high earners */}
      <div className="rounded-2xl overflow-hidden" style={{
        background: "linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(239,68,68,0.02) 100%)",
        border: "1px solid rgba(239,68,68,0.2)",
      }}>
        <div className="px-4 py-3 border-b border-red-500/10 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-sm font-bold text-white">مشبوهون — تجاوزوا الحد في 24 ساعة</span>
          {data && data.suspicious.some((u) => !u.is_banned) && (
            <button
              onClick={handleBulkBan}
              disabled={bulkBanning}
              className="ml-auto px-2.5 py-1 rounded-lg text-[10px] font-bold text-red-400 border border-red-500/40 bg-red-500/15 hover:bg-red-500/25 transition-colors disabled:opacity-50"
              data-testid="button-bulk-ban"
            >
              {bulkBanning ? "..." : "حظر الكل"}
            </button>
          )}
          {data && !data.suspicious.some((u) => !u.is_banned) && <span className="ml-auto text-xs font-bold text-red-400">{data.suspicious.length}</span>}
        </div>
        <div className="px-4">
          {!data ? (
            <div className="py-4 space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />)}</div>
          ) : data.suspicious.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">لا يوجد مستخدمون مشبوهون ✓</p>
          ) : data.suspicious.map((u) => (
            <UserRow
              key={u.telegram_id}
              telegramId={u.telegram_id}
              username={u.username}
              firstName={u.first_name}
              lifetimePoints={u.lifetime_points}
              isBanned={u.is_banned}
              extra={u.earned_24h}
              extraLabel="pts/24h"
              onBan={banning ? () => {} : handleBan}
            />
          ))}
        </div>
      </div>

      {/* Multi-account ring candidates */}
      <div className="rounded-2xl overflow-hidden" style={{
        background: "linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(245,158,11,0.02) 100%)",
        border: "1px solid rgba(245,158,11,0.2)",
      }}>
        <div className="px-4 py-3 border-b border-amber-500/10 flex items-center gap-2">
          <Users2 className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-white">إحالات مشبوهة — أكثر من 20 إحالة</span>
          {data && <span className="ml-auto text-xs font-bold text-amber-400">{data.multiAccountCandidates.length}</span>}
        </div>
        <div className="px-4">
          {!data ? (
            <div className="py-4 space-y-2">{[1, 2].map(i => <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />)}</div>
          ) : data.multiAccountCandidates.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">لا يوجد مرشحون ✓</p>
          ) : data.multiAccountCandidates.map((u) => (
            <UserRow
              key={u.referrer_id}
              telegramId={u.referrer_id}
              username={u.referrer_username}
              firstName={u.referrer_first_name}
              lifetimePoints={u.lifetime_points}
              isBanned={u.is_banned}
              extra={u.referral_count}
              extraLabel="إحالة"
              onBan={banning ? () => {} : handleBan}
            />
          ))}
        </div>
      </div>

      {/* Top earners sanity check */}
      <div className="rounded-2xl overflow-hidden" style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-white">أعلى 10 لاعبين — كل الأوقات</span>
        </div>
        <div className="px-4">
          {!data ? (
            <div className="py-4 space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />)}</div>
          ) : data.topEarners.map((u, idx) => (
            <div key={u.telegram_id} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
              <span className="text-xs font-black text-muted-foreground w-5 text-center">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-white truncate block">{u.first_name ?? u.username ?? u.telegram_id}</span>
                <span className="text-[10px] text-primary font-semibold">{Number(u.lifetime_points).toLocaleString()} pts</span>
              </div>
              {u.is_banned && <Ban className="w-3.5 h-3.5 text-red-400 shrink-0" />}
              {!u.is_banned && (
                <button onClick={() => handleBan(u.telegram_id)} className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors">
                  حظر
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
