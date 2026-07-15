import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trophy, X, CheckCircle2, Flame, Users } from "lucide-react";
import { adminApi } from "./adminApi";

type Competition = {
  id: number;
  title: string;
  description: string | null;
  prizePoints: number;
  entryFeeStars: number;
  maxEntries: number | null;
  status: string;
  type: string;
  requiredInvites: number | null;
  winnerTelegramId: string | null;
  endAt: string;
  createdAt: string;
  entryCount: number;
};

type FormState = {
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  prizePoints: string;
  entryFeeStars: string;
  maxEntries: string;
  endAt: string;
  type: "points" | "referral";
  requiredInvites: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  titleEn: "",
  description: "",
  descriptionEn: "",
  prizePoints: "500000",
  entryFeeStars: "10",
  maxEntries: "",
  endAt: "",
  type: "referral",
  requiredInvites: "100",
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
        titleEn: form.titleEn || undefined,
        description: form.description || undefined,
        descriptionEn: form.descriptionEn || undefined,
        prizePoints: parseInt(form.prizePoints),
        entryFeeStars: parseInt(form.entryFeeStars) || 5,
        maxEntries: form.maxEntries ? parseInt(form.maxEntries) : undefined,
        endAt: new Date(form.endAt).toISOString(),
        type: form.type,
        requiredInvites: form.type === "referral" && form.requiredInvites ? parseInt(form.requiredInvites) : undefined,
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
        setLastResult(`🏆 الفائز: ${r.winner.name} — ${r.winner.gained.toLocaleString()} — جائزة ${r.winner.prize.toLocaleString()} SKP`);
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
          <Trophy className="w-5 h-5 text-yellow-400" /> المسابقات الدورية
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

          {/* Type selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, type: "referral" }))}
              className={`p-3 rounded-lg border text-sm font-bold flex flex-col items-center gap-1 transition-all ${form.type === "referral" ? "border-orange-500/60 bg-orange-500/10 text-orange-400" : "border-white/10 text-white/50"}`}
            >
              <Flame className="w-5 h-5" />
              سباق الدعوات
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, type: "points" }))}
              className={`p-3 rounded-lg border text-sm font-bold flex flex-col items-center gap-1 transition-all ${form.type === "points" ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-400" : "border-white/10 text-white/50"}`}
            >
              <Trophy className="w-5 h-5" />
              مسابقة نقاط
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">العنوان (عربي) *</label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={form.type === "referral" ? "سباق يوليو — أول 100 دعوة يفوز!" : "مسابقة يوليو الكبرى"} required className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Title (English)</label>
              <Input value={form.titleEn} onChange={e => setForm(f => ({ ...f, titleEn: e.target.value }))} placeholder={form.type === "referral" ? "July Race — First 100 referrals wins!" : "July Grand Competition"} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الوصف (عربي)</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="تفاصيل اختيارية..." className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description (English)</label>
              <Input value={form.descriptionEn} onChange={e => setForm(f => ({ ...f, descriptionEn: e.target.value }))} placeholder="Optional details..." className="bg-white/5 border-white/10 text-white" />
            </div>

            {form.type === "referral" ? (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">هدف الدعوات *</label>
                  <Input type="number" min="1" value={form.requiredInvites} onChange={e => setForm(f => ({ ...f, requiredInvites: e.target.value }))} required className="bg-white/5 border-white/10 text-white" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">الجائزة (SKP) *</label>
                  <Input type="number" min="1" value={form.prizePoints} onChange={e => setForm(f => ({ ...f, prizePoints: e.target.value }))} required className="bg-white/5 border-white/10 text-white" />
                </div>
              </>
            ) : (
              <>
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
              </>
            )}

            <div className={form.type === "referral" ? "col-span-2" : ""}>
              <label className="text-xs text-muted-foreground mb-1 block">ينتهي في *</label>
              <Input type="datetime-local" min={minEndAt} value={form.endAt} onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))} required className="bg-white/5 border-white/10 text-white" />
            </div>
          </div>

          <Button type="submit" disabled={creating} className="w-full gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
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
            <div key={c.id} className={`border rounded-xl p-4 ${c.type === "referral" ? "bg-orange-950/20 border-orange-500/20" : "bg-white/5 border-white/10"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${c.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-muted-foreground'}`}>
                      {c.status === 'active' ? 'نشطة' : 'مغلقة'}
                    </span>
                    {c.type === "referral"
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 flex items-center gap-1"><Flame className="w-3 h-3" /> سباق</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center gap-1"><Trophy className="w-3 h-3" /> نقاط</span>
                    }
                    <span className="text-white font-bold text-sm truncate">{c.title}</span>
                  </div>
                  {c.description && <p className="text-xs text-muted-foreground mt-1">{c.description}</p>}
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                    <span>🏆 {c.prizePoints.toLocaleString()} SKP</span>
                    {c.type === "referral"
                      ? <span className="flex items-center gap-1"><Users className="w-3 h-3" /> هدف {c.requiredInvites} دعوة</span>
                      : <span>⭐ {c.entryFeeStars} نجمة</span>
                    }
                    <span>👥 {c.entryCount} مشترك{c.maxEntries ? ` / ${c.maxEntries}` : ''}</span>
                    <span>📅 {new Date(c.endAt).toLocaleDateString('ar-EG')}</span>
                  </div>
                  {c.winnerTelegramId && (
                    <p className="text-xs text-yellow-400 mt-1">🏆 الفائز: {c.winnerTelegramId}</p>
                  )}
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
