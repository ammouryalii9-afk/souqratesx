import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Pin, PinOff, Eye, EyeOff } from "lucide-react";

type Announcement = {
  id: number;
  title: string;
  body: string | null;
  emoji: string;
  isPinned: boolean;
  isActive: boolean;
  createdAt: string;
};

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function AdminAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [emoji, setEmoji] = useState("📢");
  const [isPinned, setIsPinned] = useState(false);

  function load() {
    setLoading(true);
    adminFetch<Announcement[]>("/admin/announcements")
      .then(setItems)
      .catch(() => setError("فشل تحميل الإعلانات"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch("/admin/announcements", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), body: body.trim() || null, emoji: emoji.trim() || "📢", isPinned }),
      });
      setTitle(""); setBody(""); setEmoji("📢"); setIsPinned(false);
      setShowForm(false);
      load();
    } catch {
      setError("فشل إنشاء الإعلان");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: Announcement) {
    try {
      await adminFetch(`/admin/announcements/${item.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !item.isActive }) });
      load();
    } catch { setError("فشل تحديث الإعلان"); }
  }

  async function togglePinned(item: Announcement) {
    try {
      await adminFetch(`/admin/announcements/${item.id}`, { method: "PATCH", body: JSON.stringify({ isPinned: !item.isPinned }) });
      load();
    } catch { setError("فشل تحديث الإعلان"); }
  }

  async function handleDelete(item: Announcement) {
    if (!confirm(`حذف "${item.title}"؟`)) return;
    try {
      await adminFetch(`/admin/announcements/${item.id}`, { method: "DELETE" });
      load();
    } catch { setError("فشل حذف الإعلان"); }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="section-admin-announcements">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white text-sm">الإعلانات داخل التطبيق</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">شريط إعلاني يظهر للمستخدمين في الصفحة الرئيسية</p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-4 h-4 mr-1" /> إعلان جديد
        </Button>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {showForm && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              placeholder="إيموجي (مثال: 🎉)"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="w-20 text-center"
            />
            <Input
              placeholder="عنوان الإعلان *"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1"
            />
          </div>
          <textarea
            placeholder="نص الإعلان (اختياري) — تفاصيل أو رابط أو وصف"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="w-4 h-4 accent-emerald-500"
            />
            📌 تثبيت الإعلان في الأعلى دائماً
          </label>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2">
            <Button disabled={saving || !title.trim()} onClick={handleCreate}>
              {saving ? "جار النشر..." : "نشر الإعلان"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="border-white/10 text-muted-foreground">إلغاء</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm text-center py-4">جار التحميل...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <p className="text-2xl mb-2">📭</p>
          <p>لا يوجد إعلانات بعد — انشر أول إعلان للمستخدمين</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`bg-white/5 border rounded-xl p-3 flex items-start gap-3 transition-all ${item.isActive ? "border-white/10" : "border-white/4 opacity-50"}`}
            >
              <span className="text-xl flex-shrink-0 mt-0.5">{item.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium text-sm truncate">{item.title}</span>
                  {item.isPinned && <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full font-medium flex-shrink-0">📌 مثبت</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${item.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-muted-foreground"}`}>
                    {item.isActive ? "نشط" : "متوقف"}
                  </span>
                </div>
                {item.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.body}</p>}
                <p className="text-[10px] text-muted-foreground/40 mt-1">{new Date(item.createdAt).toLocaleDateString('ar-SA')}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={() => togglePinned(item)} className="w-7 h-7 p-0 border-white/10" title={item.isPinned ? "إلغاء التثبيت" : "تثبيت"}>
                  {item.isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggleActive(item)} className="w-7 h-7 p-0 border-white/10" title={item.isActive ? "إيقاف" : "تفعيل"}>
                  {item.isActive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(item)} className="w-7 h-7 p-0">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
