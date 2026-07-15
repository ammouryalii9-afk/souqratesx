import React, { useEffect, useState } from "react";
import { Plus, Trash2, Edit2, Check, X, Users, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

type Challenge = {
  id: number;
  title: string;
  description: string | null;
  channelUrl: string;
  requiredInvites: number;
  rewardSkp: number;
  iconEmoji: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
};

type Completion = {
  id: number;
  telegramId: string;
  firstName: string | null;
  username: string | null;
  claimedAt: string;
};

const EMPTY: Omit<Challenge, "id" | "createdAt"> = {
  title: "",
  description: "",
  channelUrl: "",
  requiredInvites: 20,
  rewardSkp: 50000,
  iconEmoji: "👥",
  isActive: true,
  sortOrder: 0,
};

async function apiFetch(path: string, init?: RequestInit) {
  const r = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function AdminGroupChallenges() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Challenge> | null>(null);
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [viewingCompletions, setViewingCompletions] = useState<{ challenge: Challenge; completions: Completion[] } | null>(null);
  const [completionsLoading, setCompletionsLoading] = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch("/admin/group-challenges")
      .then(d => setChallenges(d.challenges))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing({ ...EMPTY }); setIsNew(true); };
  const openEdit = (c: Challenge) => { setEditing({ ...c }); setIsNew(false); };
  const cancelEdit = () => { setEditing(null); setIsNew(false); };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      if (isNew) {
        await apiFetch("/admin/group-challenges", { method: "POST", body: JSON.stringify(editing) });
      } else {
        await apiFetch(`/admin/group-challenges/${editing.id}`, { method: "PUT", body: JSON.stringify(editing) });
      }
      load();
      cancelEdit();
    } catch {
      alert("حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذا التحدي؟")) return;
    await apiFetch(`/admin/group-challenges/${id}`, { method: "DELETE" });
    load();
  };

  const viewCompletions = async (c: Challenge) => {
    setCompletionsLoading(true);
    try {
      const d = await apiFetch(`/admin/group-challenges/${c.id}/completions`);
      setViewingCompletions({ challenge: c, completions: d.completions });
    } catch {
      alert("لم يتم تحميل البيانات");
    } finally {
      setCompletionsLoading(false);
    }
  };

  if (viewingCompletions) {
    const { challenge, completions } = viewingCompletions;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setViewingCompletions(null)}>← رجوع</Button>
          <h2 className="text-lg font-bold text-white">مكتملو: {challenge.title}</h2>
          <span className="text-sm text-muted-foreground">({completions.length} مستخدم)</span>
        </div>
        <div className="bg-card border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="p-3 text-right text-muted-foreground font-medium">المستخدم</th>
                <th className="p-3 text-right text-muted-foreground font-medium">Telegram ID</th>
                <th className="p-3 text-right text-muted-foreground font-medium">تاريخ الاستلام</th>
              </tr>
            </thead>
            <tbody>
              {completions.length === 0 && (
                <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">لا يوجد مستخدمون بعد</td></tr>
              )}
              {completions.map(comp => (
                <tr key={comp.id} className="border-b border-white/5 hover:bg-white/3">
                  <td className="p-3 text-white">{comp.firstName ?? "—"} {comp.username ? `@${comp.username}` : ""}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{comp.telegramId}</td>
                  <td className="p-3 text-muted-foreground">{new Date(comp.claimedAt).toLocaleString("ar")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">تحديات الدعوة الجماعية</h2>
          <p className="text-sm text-muted-foreground mt-1">أضف أصدقاء → احصل على نقاط SKP</p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> تحدي جديد
        </Button>
      </div>

      {/* Editor */}
      {editing && (
        <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-4">
          <h3 className="font-bold text-white">{isNew ? "تحدي جديد" : "تعديل التحدي"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">العنوان *</label>
              <input
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={editing.title ?? ""}
                onChange={e => setEditing(p => ({ ...p, title: e.target.value }))}
                placeholder="مثال: أدعو 20 صديقاً للمجموعة"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">الوصف</label>
              <input
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={editing.description ?? ""}
                onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                placeholder="اختياري"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">رابط المجموعة / القناة</label>
              <input
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={editing.channelUrl ?? ""}
                onChange={e => setEditing(p => ({ ...p, channelUrl: e.target.value }))}
                placeholder="https://t.me/yourgroup"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">عدد الدعوات المطلوب</label>
              <input
                type="number"
                min={1}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={editing.requiredInvites ?? 20}
                onChange={e => setEditing(p => ({ ...p, requiredInvites: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">المكافأة (SKP)</label>
              <input
                type="number"
                min={1}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={editing.rewardSkp ?? 50000}
                onChange={e => setEditing(p => ({ ...p, rewardSkp: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الأيقونة</label>
              <input
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={editing.iconEmoji ?? "👥"}
                onChange={e => setEditing(p => ({ ...p, iconEmoji: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الترتيب</label>
              <input
                type="number"
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={editing.sortOrder ?? 0}
                onChange={e => setEditing(p => ({ ...p, sortOrder: Number(e.target.value) }))}
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={editing.isActive ?? true}
                onChange={e => setEditing(p => ({ ...p, isActive: e.target.checked }))}
              />
              <label htmlFor="isActive" className="text-sm text-white">مفعّل</label>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving} size="sm" className="gap-2">
              <Check className="w-4 h-4" /> {saving ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
            <Button onClick={cancelEdit} variant="ghost" size="sm">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">جارٍ التحميل…</div>
      ) : challenges.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          لا توجد تحديات. أضف تحدياً جديداً!
        </div>
      ) : (
        <div className="space-y-3">
          {challenges.map(c => (
            <div key={c.id} className="bg-card border border-white/5 rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)" }}>
                {c.iconEmoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-white text-sm">{c.title}</h3>
                  {!c.isActive && <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded">مخفي</span>}
                </div>
                {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-primary font-bold">+{c.rewardSkp.toLocaleString()} SKP</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" /> {c.requiredInvites} دعوة
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => viewCompletions(c)} disabled={completionsLoading}>
                  <Eye className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openEdit(c)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="w-8 h-8 text-destructive hover:text-destructive" onClick={() => remove(c.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
