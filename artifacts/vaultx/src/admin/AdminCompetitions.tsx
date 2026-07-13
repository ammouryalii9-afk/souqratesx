import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trophy, X, CheckCircle2 } from "lucide-react";
import { adminApi } from "./adminApi";

type Competition = {
  id: number;
  title: string;
  description: string | null;
  prizePoints: number;
  entryFeeStars: number;
  maxEntries: number | null;
  status: string;
  endAt: string;
  createdAt: string;
  entryCount: number;
};

type FormState = {
  title: string;
  description: string;
  prizePoints: string;
  entryFeeStars: string;
  maxEntries: string;
  endAt: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  prizePoints: "1000000",
  entryFeeStars: "10",
  maxEntries: "",
  endAt: "",
};

export function AdminCompetitions() {
  const [items, setItems] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    adminApi
      .get<{ competitions: Competition[] }>("/admin/competitions")
      .then(r => setItems(r.competitions))
      .catch(() => setError("فشل تحميل المسابقات"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await adminApi.post("/admin/competitions", {
        title: form.title,
        description: form.description || undefined,
        prizePoints: parseInt(form.prizePoints),
        entryFeeStars: parseInt(form.entryFeeStars),
        maxEntries: form.maxEntries ? parseInt(form.maxEntries) : undefined,
        endAt: new Date(form.endAt).toISOString(),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإنشاء");
    } finally {
      setCreating(false);
    }
  }

  async function handleClose(id: number) {
    if (!confirm("إغلاق هذه المسابقة وإعلان الفائز الآن؟")) return;
    setClosingId(id);
    setLastResult(null);
    try {
      const r = await adminApi.post<{ winner: { name: string; gained: number; prize: number } | null }>(`/admin/competitions/${id}/close`, {});
      if (r.winner) {
        setLastResult(`🏆 الفائز: ${r.winner.name} — مكسب ${r.winner.gained.toLocaleString()} نقطة — جائزة ${r.winner.prize.toLocaleString()} نقطة`);
      } else {
        setLastResult("✓ أُغلقت المسابقة — لا مشتركين");
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإغلاق");
    } finally {
      setClosingId(null);
    }
  }

  const minEndAt = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" /> المسابقات المدفوعة
        </h2>
        <Button size="sm" onClick={() => setShowForm(v => !v)} className="gap-1">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "إلغاء" : "مسابقة جديدة"}
        </Button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-500/30 text-red-400 p-3 rounded-lg text-sm">{error}</div>}
      {lastResult && <div className="bg-green-900/30 border border-green-500/30 text-green-400 p-3 rounded-lg text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" />{lastResult}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-white/80">مسابقة جديدة</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">عنوان المسابقة *</label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="مثال: مسابقة يوليو الكبرى" required className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">الوصف</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="تفاصيل اختيارية..." className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الجائزة (نقاط) *</label>
              <Input type="number" min="1" value={form.prizePoints} onChange={e => setForm(f => ({ ...f, prizePoints: e.target.value }))} required className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">رسوم الدخول (⭐) *</label>
              <Input type="number" min="1" value={form.entryFeeStars} onChange={e => setForm(f => ({ ...f, entryFeeStars: e.target.value }))} required className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الحد الأقصى للمشتركين</label>
              <Input type="number" min="1" value={form.maxEntries} onChange={e => setForm(f => ({ ...f, maxEntries: e.target.value }))} placeholder="غير محدد" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ينتهي في *</label>
              <Input type="datetime-local" min={minEndAt} value={form.endAt} onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))} required className="bg-white/5 border-white/10 text-white" />
            </div>
          </div>
          <Button type="submit" disabled={creating} className="w-full gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            إنشاء المسابقة
          </Button>
        </form>
      )}

      {loading ? (
        <div className="py-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">لا توجد مسابقات حتى الآن</div>
      ) : (
        <div className="space-y-3">
          {items.map(c => (
            <div key={c.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${c.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-muted-foreground'}`}>
                      {c.status === 'active' ? 'نشطة' : 'مغلقة'}
                    </span>
                    <span className="text-white font-bold text-sm truncate">{c.title}</span>
                  </div>
                  {c.description && <p className="text-xs text-muted-foreground mt-1">{c.description}</p>}
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                    <span>🏆 {c.prizePoints.toLocaleString()} نقطة</span>
                    <span>⭐ {c.entryFeeStars} نجمة</span>
                    <span>👥 {c.entryCount} مشترك{c.maxEntries ? ` / ${c.maxEntries}` : ''}</span>
                    <span>📅 {new Date(c.endAt).toLocaleDateString('ar-EG')}</span>
                  </div>
                </div>
                {c.status === 'active' && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleClose(c.id)}
                    disabled={closingId === c.id}
                    className="shrink-0"
                  >
                    {closingId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "إغلاق وإعلان"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
