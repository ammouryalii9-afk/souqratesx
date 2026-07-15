import { useEffect, useState } from "react";
import { adminApi, type AdminStats } from "./adminApi";
import { Users, Coins, Crown, Ban, UserPlus, DollarSign, Send, Bell, Radio } from "lucide-react";

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary">{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold text-white">{value}</div>
      </div>
    </div>
  );
}

function RemindersTool() {
  const [inactiveDays, setInactiveDays] = useState(3);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setSending(true);
    setResult(null);
    setError(null);
    try {
      const res = await adminApi.sendReminders(inactiveDays, message.trim() || undefined);
      setResult(`تم الإرسال إلى ${res.sent} من ${res.total} مستخدم (فشل: ${res.failed})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل إرسال التذكيرات");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3" data-testid="section-reminders-tool">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-white">إرسال تذكير للمستخدمين غير النشطين</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        يرسل رسالة تيليجرام لكل مستخدم لم يفتح التطبيق منذ عدد الأيام المحدد لتشجيعه على العودة.
      </p>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground whitespace-nowrap">غير نشط منذ</label>
        <input
          type="number"
          min={1}
          max={90}
          value={inactiveDays}
          onChange={(e) => setInactiveDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
          className="w-20 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          data-testid="input-reminder-days"
        />
        <span className="text-xs text-muted-foreground">يوم</span>
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="رسالة مخصصة (اختياري) — اتركها فارغة لاستخدام الرسالة الافتراضية"
        rows={2}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none"
        data-testid="input-reminder-message"
      />
      <button
        onClick={handleSend}
        disabled={sending}
        className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold py-2.5 rounded-lg disabled:opacity-50 transition-all"
        data-testid="button-send-reminders"
      >
        <Send className="w-4 h-4" />
        {sending ? "جار الإرسال..." : "إرسال التذكيرات"}
      </button>
      {result && <p className="text-xs text-emerald-400" data-testid="text-reminder-result">{result}</p>}
      {error && <p className="text-xs text-red-400" data-testid="text-reminder-error">{error}</p>}
    </div>
  );
}

export function AdminOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .stats()
      .then(setStats)
      .catch(() => setError("فشل تحميل الإحصائيات"));
  }, []);

  if (error) return <p className="text-red-400 text-sm" data-testid="text-overview-error">{error}</p>;
  if (!stats) return <p className="text-muted-foreground text-sm">جار التحميل...</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3" data-testid="section-admin-overview">
        <StatCard icon={<Users className="w-5 h-5" />} label="إجمالي المستخدمين" value={stats.totalUsers} />
        <StatCard icon={<UserPlus className="w-5 h-5" />} label="مستخدمون جدد اليوم" value={stats.newUsersToday} />
        <StatCard icon={<Coins className="w-5 h-5" />} label="إجمالي النقاط" value={stats.totalLifetimePoints.toLocaleString()} />
        <StatCard icon={<DollarSign className="w-5 h-5" />} label="إجمالي الرصيد $" value={stats.totalBalanceUSD.toFixed(2)} />
        <StatCard icon={<Crown className="w-5 h-5" />} label="مستخدمو بريميوم" value={stats.premiumUsers} />
        <StatCard icon={<Ban className="w-5 h-5" />} label="محظورون" value={stats.bannedUsers} />
        <StatCard
          icon={<Radio className="w-5 h-5 text-emerald-400 animate-pulse" />}
          label="متصل الآن"
          value={stats.onlineNow}
        />
      </div>
      <RemindersTool />
    </div>
  );
}
