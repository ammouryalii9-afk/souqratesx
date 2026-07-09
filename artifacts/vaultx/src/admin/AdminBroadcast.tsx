import { useEffect, useState } from "react";
import { adminApi, type BroadcastJob } from "./adminApi";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

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

export function AdminBroadcast() {
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<"all" | "premium" | "active">("all");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<BroadcastJob[]>([]);

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

  return (
    <div className="flex flex-col gap-4" data-testid="section-admin-broadcast">
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
