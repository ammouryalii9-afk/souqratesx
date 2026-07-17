import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, Sword, Shield, Trophy, Ticket, RefreshCw, Trash2, Grid3x3, Power, Users, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShopConfig {
  skxPerStar: number;
  skxCustomMin: number;
  skxCustomMax: number;
  shield3hStars: number;
  shieldFullStars: number;
  decoyStars: number;
  radarStars: number;
  multiStrikeStars: number;
  extraCellsStars: number;
}

const SHOP_DEFAULTS: ShopConfig = {
  skxPerStar: 2000,
  skxCustomMin: 2000,
  skxCustomMax: 10000000,
  shield3hStars: 20,
  shieldFullStars: 80,
  decoyStars: 50,
  radarStars: 15,
  multiStrikeStars: 30,
  extraCellsStars: 500,
};

const SHOP_ITEMS_META = [
  { key: "shield3hStars",    icon: "🛡️", label: "Shield 3h" },
  { key: "shieldFullStars",  icon: "🔰", label: "Full Shield" },
  { key: "decoyStars",       icon: "💥", label: "Decoy Trap" },
  { key: "radarStars",       icon: "📡", label: "Radar Scan" },
  { key: "multiStrikeStars", icon: "⚡", label: "Multi-Strike ×5" },
  { key: "extraCellsStars",  icon: "🗺️", label: "Extra Cells ×3" },
] as const;

type ShopItemKey = typeof SHOP_ITEMS_META[number]["key"];

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

async function adminPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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

interface PhantomSettings {
  phantomEnabled: boolean;
  phantomDensity: number;
  phantomMinRealPlayers: number;
}

async function fetchArcadeSettings(): Promise<{ arcadeEnabled: boolean; arcadeWhitelist: string } & PhantomSettings> {
  const data = await adminGet<Record<string, unknown>>("/api/admin/settings");
  return {
    arcadeEnabled: data.arcadeEnabled === true || data.arcadeEnabled === "true",
    arcadeWhitelist: typeof data.arcadeWhitelist === "string" ? data.arcadeWhitelist : "",
    phantomEnabled: data.arcadePhantomEnabled === true || data.arcadePhantomEnabled === "true",
    phantomDensity: typeof data.arcadePhantomDensity === "number" ? data.arcadePhantomDensity : 15,
    phantomMinRealPlayers: typeof data.arcadePhantomMinRealPlayers === "number" ? data.arcadePhantomMinRealPlayers : 30,
  };
}

async function saveArcadeSettings(enabled: boolean, whitelist: string): Promise<void> {
  await adminPut("/api/admin/settings", {
    arcadeEnabled: enabled,
    arcadeWhitelist: whitelist.trim(),
  });
}

async function savePhantomSettings(s: PhantomSettings): Promise<void> {
  await adminPut("/api/admin/settings", {
    arcadePhantomEnabled: s.phantomEnabled,
    arcadePhantomDensity: s.phantomDensity,
    arcadePhantomMinRealPlayers: s.phantomMinRealPlayers,
  });
}

async function fetchShopConfig(): Promise<ShopConfig> {
  return adminGet<ShopConfig>("/api/arcade/shop/config");
}

async function saveShopConfig(cfg: ShopConfig): Promise<void> {
  await adminPut("/api/admin/settings", {
    arcadeSkxPerStar:       cfg.skxPerStar,
    arcadeSkxCustomMin:     cfg.skxCustomMin,
    arcadeSkxCustomMax:     cfg.skxCustomMax,
    arcadeShield3hStars:    cfg.shield3hStars,
    arcadeShieldFullStars:  cfg.shieldFullStars,
    arcadeDecoyStars:       cfg.decoyStars,
    arcadeRadarStars:       cfg.radarStars,
    arcadeMultiStrikeStars: cfg.multiStrikeStars,
    arcadeExtraCellsStars:  cfg.extraCellsStars,
  });
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

  // General settings state
  const [arcadeEnabled, setArcadeEnabled] = useState(false);
  const [whitelist, setWhitelist] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shop config state
  const [shopCfg, setShopCfg] = useState<ShopConfig>(SHOP_DEFAULTS);
  const [shopLoading, setShopLoading] = useState(true);
  const [shopSaving, setShopSaving] = useState(false);
  const [shopSaved, setShopSaved] = useState(false);
  const shopSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Phantom players state
  const [phantomEnabled, setPhantomEnabled] = useState(false);
  const [phantomDensity, setPhantomDensity] = useState(15);
  const [phantomMinReal, setPhantomMinReal] = useState(30);
  const [phantomSaving, setPhantomSaving] = useState(false);
  const [phantomSaved, setPhantomSaved] = useState(false);
  const phantomSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const s = await fetchArcadeSettings();
      setArcadeEnabled(s.arcadeEnabled);
      setWhitelist(s.arcadeWhitelist);
      setPhantomEnabled(s.phantomEnabled);
      setPhantomDensity(s.phantomDensity);
      setPhantomMinReal(s.phantomMinRealPlayers);
    } catch { /* ignore */ } finally {
      setSettingsLoading(false);
    }
  }, []);

  const loadShopConfig = useCallback(async () => {
    setShopLoading(true);
    try {
      const cfg = await fetchShopConfig();
      setShopCfg(cfg);
    } catch { /* ignore */ } finally {
      setShopLoading(false);
    }
  }, []);

  const handleSaveShopConfig = useCallback(async () => {
    setShopSaving(true);
    setShopSaved(false);
    try {
      await saveShopConfig(shopCfg);
      setShopSaved(true);
      if (shopSavedTimer.current) clearTimeout(shopSavedTimer.current);
      shopSavedTimer.current = setTimeout(() => setShopSaved(false), 2500);
    } catch { /* ignore */ } finally {
      setShopSaving(false);
    }
  }, [shopCfg]);

  const handleSaveSettings = useCallback(async (enabled: boolean, wl: string) => {
    setSettingsSaving(true);
    setSettingsSaved(false);
    try {
      await saveArcadeSettings(enabled, wl);
      setSettingsSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSettingsSaved(false), 2500);
    } catch { /* ignore */ } finally {
      setSettingsSaving(false);
    }
  }, []);

  const handleSavePhantom = useCallback(async () => {
    setPhantomSaving(true);
    setPhantomSaved(false);
    try {
      await savePhantomSettings({ phantomEnabled, phantomDensity, phantomMinRealPlayers: phantomMinReal });
      setPhantomSaved(true);
      if (phantomSavedTimer.current) clearTimeout(phantomSavedTimer.current);
      phantomSavedTimer.current = setTimeout(() => setPhantomSaved(false), 2500);
    } catch { /* ignore */ } finally {
      setPhantomSaving(false);
    }
  }, [phantomEnabled, phantomDensity, phantomMinReal]);

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

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { loadShopConfig(); }, [loadShopConfig]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadSessions(); }, [loadSessions]);

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
        <Button size="sm" variant="outline" onClick={() => { loadStats(); loadSessions(); loadSettings(); }}
          className="border-white/10 text-xs">
          <RefreshCw className="w-3 h-3 mr-1" /> تحديث
        </Button>
      </div>

      {/* ── Enable / Disable Card ── */}
      <div className={`rounded-2xl border p-4 transition-all ${
        arcadeEnabled
          ? "bg-[#22c55e]/10 border-[#22c55e]/30"
          : "bg-white/[0.03] border-white/10"
      }`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            arcadeEnabled ? "bg-[#22c55e]/20" : "bg-white/5"
          }`}>
            <Power className={`w-4 h-4 ${arcadeEnabled ? "text-[#22c55e]" : "text-muted-foreground"}`} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">تفعيل اللعبة</p>
            <p className="text-[10px] text-muted-foreground">
              {arcadeEnabled ? "اللعبة مفعّلة لجميع المستخدمين" : "اللعبة مُعطَّلة — الوصول عبر القائمة البيضاء فقط"}
            </p>
          </div>

          {/* Toggle switch */}
          {settingsLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : (
            <button
              onClick={() => {
                const next = !arcadeEnabled;
                setArcadeEnabled(next);
                handleSaveSettings(next, whitelist);
              }}
              disabled={settingsSaving}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                arcadeEnabled ? "bg-[#22c55e]" : "bg-white/10"
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                arcadeEnabled ? "translate-x-5" : "translate-x-0"
              }`} />
            </button>
          )}
        </div>

        {/* Whitelist section */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Users className="w-3 h-3 text-muted-foreground" />
            <p className="text-[11px] font-semibold text-muted-foreground">
              القائمة البيضاء (Telegram IDs) — مفصولة بفواصل
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={whitelist}
              onChange={(e) => setWhitelist(e.target.value)}
              placeholder="123456789, 987654321"
              className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors font-mono"
              dir="ltr"
            />
            <Button
              size="sm"
              onClick={() => handleSaveSettings(arcadeEnabled, whitelist)}
              disabled={settingsSaving}
              className="shrink-0 text-xs px-3"
            >
              {settingsSaving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : settingsSaved ? (
                "✓ حُفظ"
              ) : (
                "حفظ"
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            المستخدمون في هذه القائمة يمكنهم اللعب حتى لو كانت اللعبة مُعطَّلة — مفيد للاختبار
          </p>
        </div>
      </div>

      {/* ── Phantom Players Card ── */}
      <div className={`rounded-2xl border p-4 transition-all ${
        phantomEnabled
          ? "bg-purple-500/10 border-purple-500/30"
          : "bg-white/[0.03] border-white/10"
      }`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            phantomEnabled ? "bg-purple-500/20" : "bg-white/5"
          }`}>
            <span className="text-lg">👻</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">لاعبون وهميون (Phantom Players)</p>
            <p className="text-[10px] text-muted-foreground">
              خلايا وهمية تملأ الشبكة — تُعطَّل تلقائياً عند وجود لاعبين حقيقيين كافيين
            </p>
          </div>
          {settingsLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : (
            <button
              onClick={() => setPhantomEnabled((v) => !v)}
              disabled={phantomSaving}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                phantomEnabled ? "bg-purple-500" : "bg-white/10"
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                phantomEnabled ? "translate-x-5" : "translate-x-0"
              }`} />
            </button>
          )}
        </div>

        <div className="space-y-4">
          {/* Density */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-muted-foreground">كثافة الخلايا الوهمية</p>
              <span className="text-[11px] font-black text-purple-400">{phantomDensity}%</span>
            </div>
            <input
              type="range"
              min={1}
              max={60}
              value={phantomDensity}
              onChange={(e) => setPhantomDensity(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
            <p className="text-[10px] text-muted-foreground/60">
              نسبة الخلايا الوهمية من إجمالي الشبكة (1–60%)
            </p>
          </div>

          {/* Min real players */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-muted-foreground">حد التعطيل التلقائي</p>
              <span className="text-[11px] font-black text-purple-400">{phantomMinReal} لاعب</span>
            </div>
            <input
              type="range"
              min={1}
              max={200}
              value={phantomMinReal}
              onChange={(e) => setPhantomMinReal(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
            <p className="text-[10px] text-muted-foreground/60">
              عندما يبلغ عدد اللاعبين الحقيقيين هذا الرقم، تُوقَف الخلايا الوهمية تلقائياً
            </p>
          </div>

          <Button
            size="sm"
            onClick={handleSavePhantom}
            disabled={phantomSaving}
            className="w-full text-xs bg-purple-600 hover:bg-purple-500"
          >
            {phantomSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : phantomSaved ? "✓ حُفظ" : "حفظ إعدادات الـ Phantom"}
          </Button>
        </div>
      </div>

      {/* ── Shop Prices Card ── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-indigo-500/15">
            <ShoppingBag className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">أسعار متجر Arcade</p>
            <p className="text-[10px] text-muted-foreground">بالنجوم — تُطبَّق فوراً على المستخدمين</p>
          </div>
          <Button
            size="sm"
            onClick={handleSaveShopConfig}
            disabled={shopSaving || shopLoading}
            className="shrink-0 text-xs px-3 bg-indigo-600 hover:bg-indigo-500"
          >
            {shopSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : shopSaved ? "✓ حُفظ" : "حفظ"}
          </Button>
        </div>

        {shopLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
            <Loader2 className="w-3 h-3 animate-spin" /> جارٍ التحميل...
          </div>
        ) : (
          <div className="space-y-3">
            {/* Item prices */}
            <div className="grid grid-cols-2 gap-2">
              {SHOP_ITEMS_META.map(({ key, icon, label }) => (
                <div key={key} className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2">
                  <span className="text-base shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] text-muted-foreground leading-none mb-1">{label}</p>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        value={shopCfg[key as ShopItemKey]}
                        onChange={(e) => setShopCfg((prev) => ({ ...prev, [key]: Math.max(1, parseInt(e.target.value) || 1) }))}
                        className="w-full bg-transparent text-white text-xs font-black outline-none"
                      />
                      <span className="text-[10px] text-yellow-400 shrink-0">⭐</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* SKX / Star rate */}
            <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-3 py-2.5">
              <p className="text-[10px] font-bold text-indigo-300 mb-2">💎 معدل SKX للنجمة الواحدة</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[9px] text-muted-foreground mb-1">SKX / نجمة</p>
                  <input
                    type="number"
                    min={100}
                    value={shopCfg.skxPerStar}
                    onChange={(e) => setShopCfg((prev) => ({ ...prev, skxPerStar: Math.max(100, parseInt(e.target.value) || 100) }))}
                    className="w-full bg-transparent text-white text-xs font-black outline-none border-b border-white/10 pb-0.5"
                  />
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground mb-1">حد أدنى (SKX)</p>
                  <input
                    type="number"
                    min={100}
                    value={shopCfg.skxCustomMin}
                    onChange={(e) => setShopCfg((prev) => ({ ...prev, skxCustomMin: Math.max(100, parseInt(e.target.value) || 100) }))}
                    className="w-full bg-transparent text-white text-xs font-black outline-none border-b border-white/10 pb-0.5"
                  />
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground mb-1">حد أقصى (SKX)</p>
                  <input
                    type="number"
                    min={1000}
                    value={shopCfg.skxCustomMax}
                    onChange={(e) => setShopCfg((prev) => ({ ...prev, skxCustomMax: Math.max(1000, parseInt(e.target.value) || 1000) }))}
                    className="w-full bg-transparent text-white text-xs font-black outline-none border-b border-white/10 pb-0.5"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
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
