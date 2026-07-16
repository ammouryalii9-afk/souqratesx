import { useEffect, useState } from "react";
import { adminApi, type BroadcastJob, type LangStat } from "./adminApi";
import { Button } from "@/components/ui/button";
import { Send, Bell, Globe } from "lucide-react";

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
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);
  const [langStats, setLangStats] = useState<LangStat[]>([]);
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

  function toggleLang(code: string) {
    setSelectedLangs(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  }

  useEffect(() => {
    loadJobs();
    adminApi.broadcastLangStats().then(setLangStats).catch(() => {});
    const interval = setInterval(loadJobs, 4000);
    return () => clearInterval(interval);
  }, []);

  async function handleSend() {
    if (!message.trim()) return;
    const langNote = selectedLangs.length > 0 ? ` (لغات: ${selectedLangs.join(", ")})` : "";
    if (!confirm(`إرسال هذه الرسالة إلى ${AUDIENCE_LABELS[audience]}${langNote}؟`)) return;
    setSending(true);
    setError(null);
    try {
      await adminApi.createBroadcast(message.trim(), audience, selectedLangs.length > 0 ? selectedLangs : undefined);
      setMessage("");
      setSelectedLangs([]);
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

      {/* ── T005: Sponsored Push Campaigns ────────────────────── */}
      <SponsoredCampaignForm onCreated={() => {
        adminApi.broadcasts().then(setJobs).catch(() => null);
      }} />

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

        {/* ── Language Filter ─────────────────────────────────── */}
        {langStats.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-primary" />
              <span className="text-muted-foreground text-xs">تصفية حسب لغة المستخدم (اتركها فارغة لجميع اللغات)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {langStats.map(({ langCode, count }) => {
                const selected = selectedLangs.includes(langCode);
                return (
                  <button
                    key={langCode}
                    type="button"
                    onClick={() => toggleLang(langCode)}
                    className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                      selected
                        ? "bg-primary/30 border-primary text-white"
                        : "bg-white/5 border-white/10 text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {langCode} <span className="opacity-60">({count.toLocaleString()})</span>
                  </button>
                );
              })}
            </div>
            {selectedLangs.length > 0 && (
              <p className="text-xs text-primary">
                ✓ سيصل الإشعار فقط لمستخدمي: {selectedLangs.join(", ")}
              </p>
            )}
          </div>
        )}

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
            {job.langFilter && (
              <div className="text-[10px] bg-blue-400/10 text-blue-300 border border-blue-400/20 px-2 py-0.5 rounded-full inline-block mt-1">
                🌍 لغات: {job.langFilter}
              </div>
            )}
          {job.isSponsored === 1 && (
            <div className="text-[10px] bg-yellow-400/10 text-yellow-300 border border-yellow-400/20 px-2 py-0.5 rounded-full inline-block mt-1">
              📢 حملة إعلانية مدفوعة{job.sponsorName ? ` — ${job.sponsorName}` : ''}
            </div>
          )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sponsored Campaign Form ───────────────────────────────────────────────────
function SponsoredCampaignForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorUrl, setSponsorUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setErr(null);
    try {
      await adminApi.post("/admin/broadcast", { message: msg, audience: "all", sponsorName, sponsorUrl, isSponsored: 1 });
      setMsg(""); setSponsorName(""); setSponsorUrl(""); setOpen(false);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "فشل الإرسال");
    } finally { setSending(false); }
  }

  if (!open) {
    return (
      <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-yellow-300 text-sm">📢 حملات إعلانية مدفوعة</h3>
            <p className="text-xs text-muted-foreground mt-0.5">أرسل إشعار دعائي لجميع المستخدمين بسم المعلن</p>
          </div>
          <button onClick={() => setOpen(true)} className="text-xs bg-yellow-400/10 border border-yellow-400/30 text-yellow-300 px-3 py-1.5 rounded-lg font-bold hover:bg-yellow-400/20 transition-all">
            + إنشاء حملة
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-yellow-300 text-sm">📢 حملة إعلانية جديدة</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground text-xs hover:text-white">إلغاء</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">نص الرسالة الإعلانية *</label>
          <textarea value={msg} onChange={e => setMsg(e.target.value)} required rows={3}
            placeholder="اكتب نص الإعلان هنا..."
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-yellow-400" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">اسم المعلن</label>
          <input value={sponsorName} onChange={e => setSponsorName(e.target.value)} placeholder="مثال: شركة X" className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-yellow-400" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">رابط المعلن</label>
          <input value={sponsorUrl} onChange={e => setSponsorUrl(e.target.value)} placeholder="https://..." className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-yellow-400" />
        </div>
      </div>
      {err && <p className="text-red-400 text-xs">{err}</p>}
      <button type="submit" disabled={sending || !msg.trim()} className="bg-yellow-400/20 hover:bg-yellow-400/30 text-yellow-300 border border-yellow-400/30 text-sm font-bold py-2 rounded-lg disabled:opacity-50 transition-all">
        {sending ? "جارٍ الإرسال..." : "📢 إرسال الحملة الإعلانية"}
      </button>
    </form>
  );
}
