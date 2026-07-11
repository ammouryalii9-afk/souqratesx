import { useState, useEffect } from "react";
import { adminApi } from "./adminApi";
import { Plus, Pencil, Trash2, Loader2, ExternalLink, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

type PartnerTask = {
  id: number;
  title: string;
  description: string | null;
  channelUsername: string;
  channelUrl: string;
  iconEmoji: string;
  rewardPoints: number;
  isActive: boolean;
  sortOrder: number;
  completions: number;
  createdAt: string;
};

type TaskForm = {
  title: string;
  description: string;
  channelUsername: string;
  channelUrl: string;
  iconEmoji: string;
  rewardPoints: number;
  isActive: boolean;
  sortOrder: number;
};

const EMPTY_FORM: TaskForm = {
  title: "",
  description: "",
  channelUsername: "",
  channelUrl: "",
  iconEmoji: "📢",
  rewardPoints: 5000,
  isActive: true,
  sortOrder: 0,
};

export function AdminPartnerTasks() {
  const [tasks, setTasks] = useState<PartnerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.get<PartnerTask[]>("/admin/partner-tasks");
      setTasks(data);
    } catch {
      setError("Failed to load partner tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  function openEdit(task: PartnerTask) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description ?? "",
      channelUsername: task.channelUsername,
      channelUrl: task.channelUrl,
      iconEmoji: task.iconEmoji,
      rewardPoints: task.rewardPoints,
      isActive: task.isActive,
      sortOrder: task.sortOrder,
    });
    setError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.channelUsername.trim() || !form.channelUrl.trim()) {
      setError("Title, Channel Username and Channel URL are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        channelUsername: form.channelUsername.replace(/^@/, ""),
        description: form.description || null,
      };
      if (editingId !== null) {
        await adminApi.put(`/admin/partner-tasks/${editingId}`, payload);
        setSuccess("Task updated.");
      } else {
        await adminApi.post("/admin/partner-tasks", payload);
        setSuccess("Task created.");
      }
      setShowForm(false);
      setEditingId(null);
      await load();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this partner task? All user completions will also be removed.")) return;
    setDeleting(id);
    try {
      await adminApi.del(`/admin/partner-tasks/${id}`);
      await load();
    } catch {
      setError("Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  async function toggleActive(task: PartnerTask) {
    try {
      await adminApi.put(`/admin/partner-tasks/${task.id}`, { isActive: !task.isActive });
      await load();
    } catch {
      setError("Update failed");
    }
  }

  const EMOJI_OPTIONS = ["📢", "📣", "🔔", "💬", "🎯", "🎁", "💎", "🚀", "⭐", "🌟", "💰", "🏆", "🎮", "🔥", "⚡"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">مهام الشركاء</h2>
          <p className="text-xs text-muted-foreground mt-0.5">قنوات/مجموعات تيليجرام — ينضم المستخدم ويحصل على نقاط بعد التحقق عبر Bot API</p>
        </div>
        <Button onClick={openNew} size="sm" className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30">
          <Plus className="w-4 h-4 mr-1" /> مهمة جديدة
        </Button>
      </div>

      {success && (
        <div className="rounded-xl px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">{success}</div>
      )}
      {error && !showForm && (
        <div className="rounded-xl px-4 py-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="rounded-2xl border border-white/10 bg-white/3 p-5 space-y-4">
          <h3 className="font-bold text-white text-base">{editingId ? "تعديل المهمة" : "مهمة جديدة"}</h3>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-muted-foreground mb-1">عنوان المهمة *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Join SouqrateX Channel"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-muted-foreground mb-1">وصف (اختياري)</label>
                <input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Join our official Telegram channel for updates"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Channel Username * <span className="text-white/30">(بدون @)</span></label>
                <input
                  value={form.channelUsername}
                  onChange={e => setForm(f => ({ ...f, channelUsername: e.target.value.replace(/^@/, "") }))}
                  placeholder="SouqrateXOfficial"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">رابط القناة *</label>
                <input
                  value={form.channelUrl}
                  onChange={e => setForm(f => ({ ...f, channelUrl: e.target.value }))}
                  placeholder="https://t.me/SouqrateXOfficial"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">النقاط</label>
                <input
                  type="number"
                  min={1}
                  value={form.rewardPoints}
                  onChange={e => setForm(f => ({ ...f, rewardPoints: Number(e.target.value) }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">الترتيب</label>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-muted-foreground mb-1">أيقونة</label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, iconEmoji: emoji }))}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                        form.iconEmoji === emoji
                          ? "bg-primary/30 border-2 border-primary"
                          : "bg-white/5 border border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-white/10 rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:w-4 after:h-4 after:transition-all peer-checked:after:translate-x-5" />
                </label>
                <span className="text-sm text-muted-foreground">مفعّلة (تظهر للمستخدمين)</span>
              </div>
            </div>

            {error && (
              <div className="rounded-lg px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>
            )}

            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={saving} size="sm" className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? "حفظ التعديلات" : "إنشاء المهمة")}
              </Button>
              <Button type="button" onClick={cancelForm} size="sm" variant="outline" className="border-white/10 text-muted-foreground">
                إلغاء
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Tasks List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          لا توجد مهام بعد. أضف أول مهمة شريك!
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <div
              key={task.id}
              className={`rounded-xl border p-4 transition-all ${
                task.isActive ? "border-white/8 bg-white/3" : "border-white/4 bg-white/1 opacity-60"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)' }}>
                  {task.iconEmoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-white text-sm">{task.title}</h3>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      task.isActive ? "bg-emerald-500/15 text-emerald-400" : "bg-white/10 text-muted-foreground"
                    }`}>
                      {task.isActive ? "مفعّل" : "موقوف"}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs font-bold text-primary">+{task.rewardPoints.toLocaleString()} pts</span>
                    <a
                      href={task.channelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-white flex items-center gap-0.5 transition-colors"
                    >
                      @{task.channelUsername} <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="w-3 h-3" /> {task.completions} اكتملت
                    </span>
                    <span className="text-xs text-muted-foreground">ترتيب: {task.sortOrder}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => toggleActive(task)}
                    title={task.isActive ? "إيقاف" : "تفعيل"}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all border border-white/10 hover:border-primary/30 hover:text-primary text-muted-foreground"
                  >
                    {task.isActive ? "⏸" : "▶"}
                  </button>
                  <button
                    onClick={() => openEdit(task)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all border border-white/10 hover:border-primary/30 hover:text-primary text-muted-foreground"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(task.id)}
                    disabled={deleting === task.id}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all border border-white/10 hover:border-red-500/30 hover:text-red-400 text-muted-foreground"
                  >
                    {deleting === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-300/80 space-y-1">
        <p className="font-bold text-amber-300">⚠️ ملاحظة حول التحقق من العضوية</p>
        <p>لكي يعمل التحقق، يجب أن يكون البوت <strong>مشرفاً</strong> في القناة/المجموعة الخاصة. القنوات العامة تعمل تلقائياً.</p>
        <p>إذا كانت القناة خاصة، استخدم رقم chat_id (مثل -1001234567890) بدلاً من اسم المستخدم.</p>
        <p>إذا لم يكن البوت مُهيأً (TELEGRAM_BOT_TOKEN)، يُمنح المكافأة مباشرةً بدون تحقق.</p>
      </div>
    </div>
  );
}
