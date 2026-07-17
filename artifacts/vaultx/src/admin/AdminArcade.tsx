import { useEffect, useState, useCallback } from "react";
import { Loader2, Sword, Shield, Trophy, Ticket, RefreshCw, Trash2, Grid3x3 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ArcadeStats {
  totalActive: number;
  totalWon: number;
  totalDestroyed: number;
  ticketsToday: number;
  roomStats: { easy?: number; tactical?: number; hardcore?: number };
}

interface ArcadeSession {
  id: number;
  telegramId: string;
  roomType: string;
  gridX: number;
  gridY: number;
  durationHours: number;
  finalPoints: number;
  status: string;
  expiresAt: string;
  createdAt: string;
  shieldExpiresAt: string | null;
  isDecoy: boolean;
  destroyedBy: string | null;
}

interface SessionsResponse {
  sessions: ArcadeSession[];
  total: number;
}

function formatRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "انتهى";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}س ${m}د` : `${m}د`;
}

async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function adminDelete(path: string): Promise<void> {
  const res = await fetch(path, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function fetchStats(): Promise<ArcadeStats> {
  return adminGet<ArcadeStats>("/api/arcade/admin/stats");
}

async function fetchSessions(status: string, room: string): Promise<SessionsResponse> {
  const params = new URLSearchParams({ status, limit: "100" });
  if (room) params.set("room", room);
  return adminGet<SessionsResponse>(`/api/arcade/admin/sessions?${params}`);
}

async function cancelSession(id: number): Promise<void> {
  return adminDelete(`/api/arcade/admin/sessions/${id}`);
}

const ROOM_COLORS: Record<string, string> = {
  easy: "#22c55e",
  tactical: "#f59e0b",
  hardcore: "#ef4444",
};

const ROOM_LABELS: Record<string, string> = {
  easy: "Easy Grid",
  tactical: "Tactical",
  hardcore: "Hardcore",
};

export function AdminArcade() {
  const [stats, setStats] = useState<ArcadeStats | null>(null);
  const [sessions, setSessions] = useState<ArcadeSession[]>([]);
  const [total, setTotal] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("active");
  const [filterRoom, setFilterRoom] = useState("");
  const [cancelling, setCancelling] = useState<number | null>(null);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await fetchStats();
      setStats(s);
    } catch {
      // ignore
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const data = await fetchSessions(filterStatus, filterRoom);
      setSessions(data.sessions);
      setTotal(data.total);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [filterStatus, filterRoom]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function handleCancel(id: number) {
    setCancelling(id);
    try {
      await cancelSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      await loadStats();
    } catch {
      // ignore
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-white">🎮 SKX Arcade</h2>
          <p className="text-xs text-muted-foreground">Hidden Pixel Grid — إدارة شاملة</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { loadStats(); loadSessions(); }}
          className="border-white/10 text-xs">
          <RefreshCw className="w-3 h-3 mr-1" /> تحديث
        </Button>
      </div>

      {/* Stats cards */}
      {statsLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل...
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/20 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Grid3x3 className="w-4 h-4 text-[#22c55e]" />
              <span className="text-xs text-muted-foreground">جلسات نشطة</span>
            </div>
            <p className="text-2xl font-black text-white">{stats.totalActive}</p>
            <div className="mt-2 flex flex-col gap-0.5">
              {(["easy", "tactical", "hardcore"] as const).map((r) => (
                <div key={r} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: ROOM_COLORS[r] }} />
                  <span className="text-[10px] text-muted-foreground">{ROOM_LABELS[r]}</span>
                  <span className="ml-auto text-[10px] font-bold text-white">{stats.roomStats[r] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-rows-3 gap-2">
            <div className="rounded-xl bg-white/[0.04] border border-white/5 p-2.5 flex items-center gap-2">
              <Ticket className="w-4 h-4 text-yellow-400 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">تذاكر اليوم</p>
                <p className="text-base font-black text-white">{stats.ticketsToday}</p>
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.04] border border-white/5 p-2.5 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#22c55e] shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">فازوا</p>
                <p className="text-base font-black text-white">{stats.totalWon}</p>
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.04] border border-white/5 p-2.5 flex items-center gap-2">
              <Sword className="w-4 h-4 text-red-400 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">دُمِّروا</p>
                <p className="text-base font-black text-white">{stats.totalDestroyed}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/5">
          {["active", "won", "destroyed", "credited"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                filterStatus === s ? "bg-primary text-black" : "text-muted-foreground hover:text-white"
              }`}
            >
              {s === "active" ? "نشط" : s === "won" ? "فاز" : s === "destroyed" ? "مدمَّر" : "مُكافأ"}
            </button>
          ))}
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/5">
          <button
            onClick={() => setFilterRoom("")}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
              !filterRoom ? "bg-primary text-black" : "text-muted-foreground hover:text-white"
            }`}
          >
            الكل
          </button>
          {["easy", "tactical", "hardcore"].map((r) => (
            <button
              key={r}
              onClick={() => setFilterRoom(r)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                filterRoom === r ? "text-black" : "text-muted-foreground hover:text-white"
              }`}
              style={filterRoom === r ? { background: ROOM_COLORS[r] } : {}}
            >
              {ROOM_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Sessions table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">
            {sessionsLoading ? "جارٍ التحميل..." : `${total} جلسة`}
          </p>
        </div>

        {sessionsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">لا توجد جلسات</div>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => {
              const roomColor = ROOM_COLORS[s.roomType] ?? "#888";
              const hasShield = s.shieldExpiresAt && new Date(s.shieldExpiresAt) > new Date();
              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-white/5 bg-white/[0.02] p-3"
                >
                  <div className="flex items-start gap-3">
                    {/* Room badge */}
                    <div
                      className="shrink-0 px-2 py-1 rounded-lg text-[9px] font-black uppercase mt-0.5"
                      style={{ background: roomColor + "20", color: roomColor }}
                    >
                      {ROOM_LABELS[s.roomType] ?? s.roomType}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono text-white">({s.gridX}, {s.gridY})</span>
                        <span className="text-[10px] text-muted-foreground">{s.durationHours}س</span>
                        <span className="text-[10px] font-bold" style={{ color: roomColor }}>
                          +{s.finalPoints.toLocaleString()}
                        </span>
                        {hasShield && <Shield className="w-3 h-3 text-cyan-400" />}
                        {s.isDecoy && <span className="text-[10px]">💥 فخ</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-mono text-muted-foreground/60">
                          {s.telegramId}
                        </span>
                        {s.status === "active" && (
                          <span className="text-[10px] text-[#22c55e] font-bold">
                            ⏱ {formatRemaining(s.expiresAt)}
                          </span>
                        )}
                        {s.status === "destroyed" && s.destroyedBy && (
                          <span className="text-[10px] text-red-400">
                            ⚔️ من {s.destroyedBy === "admin" ? "المدير" : s.destroyedBy}
                          </span>
                        )}
                        <span className="text-[9px] text-muted-foreground/40">
                          {new Date(s.createdAt).toLocaleString("ar")}
                        </span>
                      </div>
                    </div>

                    {/* Cancel button (active only) */}
                    {s.status === "active" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCancel(s.id)}
                        disabled={cancelling === s.id}
                        className="shrink-0 h-7 w-7 p-0 text-red-400 hover:bg-red-500/10"
                      >
                        {cancelling === s.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
