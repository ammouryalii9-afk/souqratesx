import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Plus, Trophy, X, CheckCircle2, Flame, Users,
  ArrowLeft, Medal, Clock, ChevronRight,
} from "lucide-react";
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

type Participant = {
  rank: number;
  telegramId: string;
  name: string;
  joinedAt: string | null;
  gained: number;
  atEntry: number;
  current: number;
};

type DetailData = {
  competition: {
    id: number;
    title: string;
    type: string | null;
    requiredInvites: number | null;
    prizePoints: number;
    status: string | null;
    endAt: Date | string;
  };
  participants: Participant[];
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

const MEDALS = ["🥇", "🥈", "🥉"];

export function AdminCompetitions() {
  const [items, setItems] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  // Detail view
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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

  async function openDetail(id: number) {
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const r = await adminApi.get<DetailData>(`/admin/competitions/${id}/participants`);
      setDetail(r);
    } catch {
      setDetailError("فشل تحميل التفاصيل");
    } finally {
      setDetailLoading(false);
    }
  }

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
      if (detail?.competition.id === id) {
        openDetail(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإغلاق");
    } finally {
      setClosingId(null);
    }
  }

  const minEndAt = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);

  // ─── Detail View ────────────────────────────────────────────────────────────
  if (detail || detailLoading || detailError) {
    const comp = detail?.competition;
    const participants = detail?.participants ?? [];
    const required = comp?.requiredInvites ?? 0;
    const isReferral = comp?.type === "referral";

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setDetail(null); setDetailError(null); }}
            className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white truncate">{comp?.title ?? "تفاصيل المسابقة"}</h2>
            <p className="text-xs text-muted-foreground">
              {participants.length} مشترك
              {required > 0 && ` · الهدف ${required} دعوة`}
              {comp && ` · ${comp.prizePoints.toLocaleString()} SKP`}
            </p>
          </div>
          {comp?.status === "active" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleClose(comp.id)}
              disabled={closingId === comp.id}
              className="shrink-0"
            >
              {closingId === comp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "إغلاق"}
            </Button>
          )}
        </div>

        {detailLoading && (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}

        {detailError && (
          <div className="bg-red-900/30 border border-red-500/30 text-red-400 p-3 rounded-lg text-sm">{detailError}</div>
        )}

        {detail && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-white">{participants.length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">مشترك</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-green-400">
                  {required > 0
                    ? participants.filter(p => p.gained >= required).length
                    : participants.filter(p => p.gained > 0).length}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {required > 0 ? "وصل الهدف" : "نشطون"}
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-orange-400">
                  {participants[0]?.gained ?? 0}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {isReferral ? "أعلى دعوات" : "أعلى نقاط"}
                </p>
              </div>
            </div>

            {/* Participants list */}
            {participants.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">لا يوجد مشتركين بعد</div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold px-1">
                  المشتركون — مرتبون حسب التقدم
                </p>
                {participants.map((p) => {
                  const pct = required > 0 ? Math.min(100, (p.gained / required) * 100) : 0;
                  const done = required > 0 && p.gained >= required;
                  return (
                    <div key={p.telegramId} className="bg-white/4 border border-white/5 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {/* Rank */}
                        <span className="text-base w-7 text-center shrink-0">
                          {p.rank <= 3 ? MEDALS[p.rank - 1] : (
                            <span className="text-xs text-white/30 font-mono">#{p.rank}</span>
                          )}
                        </span>

                        {/* Name + joined */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                          <p className="text-[10px] text-white/30">
                            <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                            {p.joinedAt ? new Date(p.joinedAt).toLocaleString("ar-EG") : "—"}
                          </p>
                        </div>

                        {/* Progress numbers */}
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-bold ${done ? "text-green-400" : "text-orange-300"}`}>
                            {p.gained.toLocaleString()}
                            {required > 0 && (
                              <span className="text-white/30 font-normal"> / {required}</span>
                            )}
                          </p>
                          <p className="text-[10px] text-white/30">
                            {isReferral ? `${p.current} إجمالي · كان ${p.atEntry}` : `${p.current.toLocaleString()} نقطة`}
                          </p>
                        </div>
                      </div>

                      {/* Progress bar (referral only) */}
                      {required > 0 && (
                        <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: done ? "#22c55e" : pct >= 66 ? "#f97316" : "#6366f1",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ─── List View ──────────────────────────────────────────────────────────────
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
            <button
              key={c.id}
              onClick={() => openDetail(c.id)}
              className={`w-full text-right border rounded-xl p-4 transition-all hover:border-white/20 active:scale-[0.99] ${c.type === "referral" ? "bg-orange-950/20 border-orange-500/20" : "bg-white/5 border-white/10"}`}
            >
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
                <Medal className="w-4 h-4 text-white/20 shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
