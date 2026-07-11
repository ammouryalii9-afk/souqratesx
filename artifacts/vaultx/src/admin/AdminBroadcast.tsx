import { useEffect, useState } from "react";
import { adminApi, type BroadcastJob } from "./adminApi";
import { Button } from "@/components/ui/button";
import { Send, Bell } from "lucide-react";

const AUDIENCE_LABELS: Record<string, string> = {
  all: "جميع المستخدمين",
  premium: "المستخدمون المميزون (بريميوم)",
  active: "النشطون خلال 7 أيام",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  running: "قيد الإرسال",
  completed: "مكتمل",
  failed: "فشل",
};

const DEFAULT_REMINDER =
  "⚡ Your mining rewards are waiting!\n\nYour idle miners kept working — come back and collect your points before they overflow.\n\n🏆 Don't fall behind on the leaderboard — tap to resume mining now.";

export function AdminBroadcast() {
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<"all" | "premium" | "active">("all");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<BroadcastJob[]>([]);

  // Reminder state
  const [reminderDays, setReminderDays] = useState(3);
  const [reminderMessage, setReminderMessage] = useState("");
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ total: number; sent: number; failed: number } | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);

  function loadJobs() {
    adminApi.broadcasts().then(setJobs).catch(() => {});
  }

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 4000);
    return () => clearInterval(interval);
  }, []);

  async function handleSend() {
    if (!message.trim()) return;
    if (!confirm(`إرسال هذه الرسالة إلى ${AUDIENCE_LABELS[audience]}؟`)) return;
    setSending(true);
    setError(null);
    try {
      await adminApi.createBroadcast(message.trim(), audience);
      setMessage("");
      loadJobs();
    } catch {
      setError("فشل إرسال الرسالة الجماعية");
    } finally {
      setSending(false);
    }
  }

  async function handleSendReminders() {
    if (!confirm(`إرسال رسالة تذكيرية لجميع المستخدمين الذين لم يفتحوا التطبيق منذ ${reminderDays} أيام؟`)) return;
    setReminderSending(true);
    setReminderResult(null);
    setReminderError(null);
    try {
      const result = await adminApi.sendReminders(reminderDays, reminderMessage.trim() || undefined);
      setReminderResult(result);
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : "فشل إرسال التذكيرات");
    } finally {
      setReminderSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="section-admin-broadcast">

      {/* ── Reminder Section ─────────────────────────────────── */}
      <div className="bg-white/5 border border-primary/30 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-white text-sm">رسائل تذكيرية للمستخدمين الغائبين</h3>
        </div>
        <p className="text-muted-foreground text-xs">
          ترسل رسالة تلقائية عبر تيليجرام لكل مستخدم لم يفتح التطبيق منذ عدد محدد من الأيام.
          يعمل هذا النظام أيضاً تلقائياً كل 24 ساعة من الخادم.
        </p>

        <div className="flex items-center gap-3">
          <label className="text-muted-foreground text-xs whitespace-nowrap">غياب أكثر من</label>
          <input
            type="number"
            min={1}
            max={90}
            value={reminderDays}
            onChange={(e) => setReminderDays(Math.max(1, Math.min(90, Number(e.target.value))))}
            className="w-20 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-primary"
          />
          <label className="text-muted-foreground text-xs">يوم</label>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs">نص الرسالة (اتركه فارغاً للرسالة الافتراضية بالإنجليزي)</label>
          <textarea
            value={reminderMessage}
            onChange={(e) => setReminderMessage(e.target.value)}
            placeholder={DEFAULT_REMINDER}
            rows={4}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
          />
        </div>

        {reminderResult && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-xs">
            <p className="text-emerald-400 font-medium">✓ تم إرسال التذكيرات</p>
            <p className="text-muted-foreground mt-1">
              إجمالي: {reminderResult.total} | نجح: {reminderResult.sent} | فشل: {reminderResult.failed}
            </p>
          </div>
        )}
        {reminderError && <p className="text-red-400 text-xs">{reminderError}</p>}

        <Button
          disabled={reminderSending}
          onClick={handleSendReminders}
          className="gap-2"
          variant="outline"
        >
          <Bell className="w-4 h-4" />
          {reminderSending ? "جارٍ الإرسال... (قد يستغرق دقائق)" : "إرسال تذكيرات الآن"}
        </Button>
      </div>

      {/* ── Broadcast Section ─────────────────────────────────── */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
        <h3 className="font-bold text-white text-sm">إرسال رسالة جماعية عبر تيليجرام</h3>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="اكتب رسالتك هنا..."
          rows={4}
          data-testid="input-broadcast-message"
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">الجمهور المستهدف</span>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as typeof audience)}
            data-testid="select-broadcast-audience"
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
          >
            {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
              <option key={value} value={value} className="bg-[#141416]">
                {label}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <Button disabled={sending || !message.trim()} onClick={handleSend} data-testid="button-send-broadcast">
          <Send className="w-4 h-4 mr-1" /> {sending ? "جار الإرسال..." : "إرسال"}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-bold text-white text-sm">سجل الرسائل الجماعية</h3>
        {jobs.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">لا يوجد رسائل بعد</p>}
        {jobs.map((job) => (
          <div key={job.id} className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs flex flex-col gap-1" data-testid={`row-broadcast-${job.id}`}>
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">{AUDIENCE_LABELS[job.audience] ?? job.audience}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  job.status === "completed"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : job.status === "failed"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-amber-500/20 text-amber-400"
                }`}
              >
                {STATUS_LABELS[job.status] ?? job.status}
              </span>
            </div>
            <p className="text-muted-foreground break-words">{job.message}</p>
            <div className="text-muted-foreground">
              تم الإرسال إلى {job.sentCount}/{job.totalUsers} {job.failedCount > 0 && `(فشل: ${job.failedCount})`}
            </div>
            <div className="text-muted-foreground">{new Date(job.createdAt).toLocaleString("ar-EG")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
