import { useEffect, useState } from "react";
import { adminApi, type AdminUserDetail, type AdminUserSummary, type UserActivityEntry, type UserDeepStats } from "./adminApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Ban, CheckCircle2, Crown, History, Search, Trash2, X, BarChart2, Copy, Check } from "lucide-react";

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  adsgram_reward: "مشاهدة إعلان (Adsgram)",
  offerwall_credit: "مكافأة من عرض (Offerwall)",
  stars_purchase: "شراء عبر Telegram Stars",
  update_user: "تعديل من المدير",
  delete_user: "حذف من المدير",
  update_settings: "تعديل الإعدادات",
  setup_telegram_webhook: "إعداد Webhook",
  create_broadcast: "إرسال رسالة جماعية",
};

const PROVIDER_LABELS: Record<string, string> = {
  adsgram: "Adsgram (إعلانات)",
  offerwall: "Offerwall",
  monlix: "Monlix",
  bitlabs: "Bitlabs",
  lootably: "Lootably",
  revlum: "Revlum",
  ayet: "AyeT-Studios",
  offertoro: "OfferToro",
  torox: "Torox",
  telegram_stars: "Telegram Stars",
};

function CopyBadge({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs transition-colors group"
      title={`نسخ ${label}`}
    >
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-white font-mono font-bold">{value}</span>
      {copied
        ? <Check className="w-3 h-3 text-emerald-400 shrink-0" />
        : <Copy className="w-3 h-3 text-muted-foreground group-hover:text-white shrink-0 transition-colors" />}
    </button>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-0.5">
      <span className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</span>
      <span className="text-white font-bold text-base">{typeof value === "number" ? value.toLocaleString() : value}</span>
      {sub && <span className="text-muted-foreground text-[10px]">{sub}</span>}
    </div>
  );
}

function UserStatsView({ telegramId }: { telegramId: string }) {
  const [stats, setStats] = useState<UserDeepStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.userStats(telegramId).then(setStats).catch(() => setError("فشل تحميل الإحصائيات"));
  }, [telegramId]);

  if (error) return <p className="text-red-400 text-xs">{error}</p>;
  if (!stats) return <p className="text-muted-foreground text-sm">جار التحميل...</p>;

  const totalRewards = stats.rewardsByProvider.reduce((s, r) => s + r.total_rewards, 0);
  const totalPoints = stats.rewardsByProvider.reduce((s, r) => s + Number(r.total_points), 0);

  return (
    <div className="flex flex-col gap-3" data-testid="section-user-stats">
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="إجمالي المكافآت" value={totalRewards} />
        <StatCard label="نقاط من المزودين" value={totalPoints} />
        <StatCard label="إجمالي الأحداث" value={stats.totalEvents} />
        <StatCard label="الأخطاء" value={stats.errorCount} sub={stats.totalEvents > 0 ? `${((stats.errorCount / stats.totalEvents) * 100).toFixed(1)}%` : undefined} />
      </div>

      {stats.rewardsByProvider.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">تفصيل المكافآت بالمزود</h4>
          {stats.rewardsByProvider.map((r) => (
            <div key={r.provider_key} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
              <span className="text-white font-medium">{PROVIDER_LABELS[r.provider_key] ?? r.provider_key}</span>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>{r.total_rewards} مكافأة</span>
                <span className="text-primary font-bold">{Number(r.total_points).toLocaleString()} نقطة</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {stats.rewardsByProvider.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-2">لا توجد مكافآت مسجلة بعد</p>
      )}
    </div>
  );
}

function UserActivityView({ telegramId }: { telegramId: string }) {
  const [entries, setEntries] = useState<UserActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.userActivity(telegramId).then(setEntries).catch(() => setError("فشل تحميل السجل"));
  }, [telegramId]);

  if (error) return <p className="text-red-400 text-xs">{error}</p>;
  if (!entries) return <p className="text-muted-foreground text-sm">جار التحميل...</p>;
  if (entries.length === 0) return <p className="text-muted-foreground text-sm text-center py-4">لا يوجد نشاط مسجل</p>;

  return (
    <div className="flex flex-col gap-2 max-h-80 overflow-y-auto" data-testid="section-user-activity">
      {entries.map((entry, idx) => (
        <div key={idx} className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className={`font-medium ${entry.source === "admin" ? "text-amber-400" : "text-primary"}`}>
              {ACTIVITY_TYPE_LABELS[entry.type] ?? entry.type}
            </span>
            <span className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString("ar-EG")}</span>
          </div>
          {Object.keys(entry.details).length > 0 && (
            <div className="text-muted-foreground break-all">
              {Object.entries(entry.details)
                .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                .join(" • ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function UserEditor({ telegramId, onClose, onChanged }: { telegramId: string; onClose: () => void; onChanged: () => void }) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"info" | "stats" | "activity">("info");

  useEffect(() => {
    adminApi.user(telegramId).then(setUser).catch(() => setError("فشل تحميل المستخدم"));
  }, [telegramId]);

  async function save(patch: Partial<AdminUserDetail>) {
    setSaving(true);
    setError(null);
    try {
      const updated = await adminApi.updateUser(telegramId, patch);
      setUser(updated);
      onChanged();
    } catch {
      setError("فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("حذف هذا المستخدم نهائياً؟")) return;
    await adminApi.deleteUser(telegramId);
    onChanged();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-[#141416] border border-white/10 rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white">تفاصيل المستخدم</h2>
          <button onClick={onClose} data-testid="button-close-user-editor"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        {!user ? (
          <p className="text-muted-foreground text-sm">جار التحميل...</p>
        ) : (
          <div className="flex flex-col gap-4 text-sm">

            {/* ── Identity header ── */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
              <div className="font-bold text-white text-base">
                {user.firstName} {user.lastName} {user.username ? `@${user.username}` : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyBadge value={String(user.internalId)} label="User ID" />
                <CopyBadge value={user.telegramId} label="Telegram ID" />
              </div>
            </div>

            {/* ── Quick stats strip ── */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="مجموع النقاط (كل الوقت)" value={user.lifetimePoints} />
              <StatCard label="رصيد الإيجار الحالي" value={user.currentPoints} />
              <StatCard label="مستوى التعدين" value={user.miningLevel} sub={`${user.profitPerHour.toLocaleString()} نقطة/ساعة`} />
              <StatCard label="الطاقة الحالية" value={`${user.energy}/${user.maxEnergy}`} />
              <StatCard label="إعلانات اليوم" value={user.adsWatchedToday} />
              <StatCard label="نجوم Stars" value={user.starsBalance} />
            </div>

            {/* ── Referrals block ── */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground text-[10px] uppercase tracking-wider">الإحالات</span>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-white font-bold text-lg">{user.referralCount}</div>
                  <div className="text-muted-foreground">إجمالي الأصدقاء</div>
                </div>
                <div>
                  <div className="text-primary font-bold text-lg">{user.referralEarnings.toLocaleString()}</div>
                  <div className="text-muted-foreground">نقاط من الإحالات</div>
                </div>
                <div>
                  <div className="text-white font-bold text-lg">{user.referrerId ? "نعم" : "لا"}</div>
                  <div className="text-muted-foreground">تم إحالته</div>
                </div>
              </div>
              {user.referrerId && (
                <div className="mt-1">
                  <CopyBadge value={user.referrerId} label="أحاله" />
                </div>
              )}
            </div>

            {/* ── Tabs ── */}
            <div className="flex gap-1 bg-white/5 rounded-lg p-1">
              {(["info", "stats", "activity"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setView(tab)}
                  data-testid={`tab-user-${tab}`}
                  className={`flex-1 flex items-center justify-center gap-1 text-xs font-medium py-1.5 rounded-md transition-colors ${view === tab ? "bg-primary text-black" : "text-muted-foreground"}`}
                >
                  {tab === "info" && "التعديل"}
                  {tab === "stats" && <><BarChart2 className="w-3.5 h-3.5" /> المزودون</>}
                  {tab === "activity" && <><History className="w-3.5 h-3.5" /> السجل</>}
                </button>
              ))}
            </div>

            {view === "activity" && <UserActivityView telegramId={telegramId} />}
            {view === "stats" && <UserStatsView telegramId={telegramId} />}

            {view === "info" && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">النقاط الدائمة</span>
                  <Input
                    type="number"
                    defaultValue={user.lifetimePoints}
                    data-testid="input-edit-lifetime-points"
                    onBlur={(e) => save({ lifetimePoints: Number(e.target.value) })}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">رصيد النجوم (Stars)</span>
                  <Input
                    type="number"
                    defaultValue={user.starsBalance}
                    data-testid="input-edit-stars-balance"
                    onBlur={(e) => save({ starsBalance: Number(e.target.value) })}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">ملاحظات المدير</span>
                  <Input
                    defaultValue={user.notes ?? ""}
                    data-testid="input-edit-notes"
                    onBlur={(e) => save({ notes: e.target.value || null })}
                  />
                </label>

                <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2"><Ban className="w-4 h-4" /> محظور</span>
                  <Button size="sm" variant={user.isBanned ? "destructive" : "outline"} disabled={saving} data-testid="button-toggle-ban" onClick={() => save({ isBanned: !user.isBanned })}>
                    {user.isBanned ? "إلغاء الحظر" : "حظر"}
                  </Button>
                </div>

                <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2"><Crown className="w-4 h-4" /> بريميوم</span>
                  <Button size="sm" variant={user.isPremium ? "secondary" : "outline"} disabled={saving} data-testid="button-toggle-premium" onClick={() => save({ isPremium: !user.isPremium })}>
                    {user.isPremium ? "إلغاء البريميوم" : "منح بريميوم"}
                  </Button>
                </div>

                {error && <p className="text-red-400 text-xs">{error}</p>}

                <Button variant="destructive" className="mt-2" data-testid="button-delete-user" onClick={handleDelete}>
                  <Trash2 className="w-4 h-4 mr-1" /> حذف المستخدم نهائياً
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminUsers() {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    adminApi
      .users({ search: search || undefined, limit: 50 })
      .then((res) => {
        setUsers(res.users);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(load, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="flex flex-col gap-3" data-testid="section-admin-users">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="بحث بالاسم أو المستخدم أو الآيدي"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-user-search"
        />
      </div>
      <p className="text-xs text-muted-foreground">{total} مستخدم</p>
      <div className="flex flex-col gap-2">
        {users.map((u) => (
          <button
            key={u.telegramId}
            onClick={() => setSelected(u.telegramId)}
            data-testid={`row-user-${u.telegramId}`}
            className="text-left bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between hover:bg-white/10 transition-colors"
          >
            <div>
              <div className="text-white text-sm font-medium">
                {u.firstName} {u.lastName} {u.username ? `@${u.username}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">ID: {u.telegramId} • {u.lifetimePoints.toLocaleString()} نقطة</div>
            </div>
            <div className="flex items-center gap-1">
              {u.isPremium && <Crown className="w-4 h-4 text-primary" />}
              {u.isBanned ? <Ban className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            </div>
          </button>
        ))}
        {!loading && users.length === 0 && <p className="text-muted-foreground text-sm text-center py-6">لا يوجد مستخدمون</p>}
      </div>

      {selected && (
        <UserEditor
          telegramId={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
