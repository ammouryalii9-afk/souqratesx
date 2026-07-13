import { useEffect, useState } from "react";
import { adminApi, type StarProduct, type StarProductEffectType } from "./adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Star, Power, Pencil, ChevronUp, ChevronDown } from "lucide-react";

const EFFECT_LABELS: Record<StarProductEffectType, string> = {
  points: "نقاط فورية",
  energy_refill: "تعبئة الطاقة بالكامل",
  turbo_boost: "تسريع التعدين (تربو)",
  premium_days: "اشتراك بريميوم (أيام)",
  permanent_multiplier: "مضاعف نقاط دائم (%)",
  badge: "شارة مميزة",
  skin: "سكن (شكل) مخصص",
  mining_level_up: "🚀 رفع مستوى التعدين",
  squad_gold: "✦ اسم فِرقة ذهبي",
  competition_entry: "🏆 تذكرة مسابقة",
};

const EFFECT_VALUE_LABEL: Record<StarProductEffectType, string | null> = {
  points: "عدد النقاط الممنوحة",
  energy_refill: null,
  turbo_boost: "مدة التسريع بالثواني",
  premium_days: "عدد أيام البريميوم",
  permanent_multiplier: "نسبة الزيادة الدائمة % (مثال: 10)",
  badge: "رقم تعريف الشارة (Badge ID)",
  skin: "رقم تعريف السكن (Skin ID)",
  mining_level_up: "مستوى التعدين المستهدف (مثال: 5)",
  squad_gold: null,
  competition_entry: "رقم المسابقة (Competition ID)",
};

type FormState = {
  title: string;
  description: string;
  imageUrl: string;
  priceStars: string;
  effectType: StarProductEffectType;
  effectValue: string;
  sortOrder: string;
  benefitsBullets: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  imageUrl: "",
  priceStars: "100",
  effectType: "points",
  effectValue: "1000",
  sortOrder: "0",
  benefitsBullets: "",
};

export function AdminStarStore() {
  const [products, setProducts] = useState<StarProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function loadProducts() {
    setLoading(true);
    adminApi
      .starProducts()
      .then((rows) => setProducts([...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)))
      .catch(() => setError("فشل تحميل منتجات المتجر"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadProducts();
  }, []);

  function openEdit(product: StarProduct) {
    setEditingId(product.id);
    setForm({
      title: product.title,
      description: product.description ?? "",
      imageUrl: product.imageUrl ?? "",
      priceStars: String(product.priceStars),
      effectType: product.effectType,
      effectValue: product.effectValue != null ? String(product.effectValue) : "",
      sortOrder: String(product.sortOrder),
      benefitsBullets: product.benefitsBullets ?? "",
    });
    setError(null);
    setShowForm(true);
  }

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setError(null);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.priceStars) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        priceStars: Number(form.priceStars),
        effectType: form.effectType,
        effectValue: EFFECT_VALUE_LABEL[form.effectType] && form.effectValue ? Number(form.effectValue) : null,
        sortOrder: Number(form.sortOrder) || 0,
        benefitsBullets: form.benefitsBullets.trim() || null,
      };
      if (editingId !== null) {
        await adminApi.updateStarProduct(editingId, payload);
      } else {
        await adminApi.createStarProduct(payload);
      }
      cancelForm();
      loadProducts();
    } catch {
      setError("فشل حفظ المنتج");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(product: StarProduct) {
    try {
      await adminApi.updateStarProduct(product.id, { isActive: !product.isActive });
      loadProducts();
    } catch {
      setError("فشل تحديث المنتج");
    }
  }

  async function handleDelete(product: StarProduct) {
    if (!confirm(`هل تريد حذف المنتج "${product.title}"؟`)) return;
    try {
      await adminApi.deleteStarProduct(product.id);
      loadProducts();
    } catch {
      setError("فشل حذف المنتج");
    }
  }

  async function moveOrder(product: StarProduct, direction: "up" | "down") {
    const sorted = [...products].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    const idx = sorted.findIndex((p) => p.id === product.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx]!;
    const newOrder = other.sortOrder;
    const otherOrder = product.sortOrder;
    await Promise.all([
      adminApi.updateStarProduct(product.id, { sortOrder: newOrder }),
      adminApi.updateStarProduct(other.id, { sortOrder: otherOrder }),
    ]);
    loadProducts();
  }

  const sortedProducts = [...products].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  return (
    <div className="flex flex-col gap-4" data-testid="section-admin-star-store">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-white text-sm">متجر نجوم تيليجرام (Stars Store)</h3>
        <Button size="sm" onClick={openNew} data-testid="button-toggle-star-product-form">
          <Plus className="w-4 h-4 mr-1" /> إضافة منتج
        </Button>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-white text-xs font-bold">{editingId ? "تعديل المنتج" : "منتج جديد"}</p>
          <Input placeholder="اسم المنتج *" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} data-testid="input-star-product-title" />
          <textarea
            placeholder="وصف قصير يظهر تحت الاسم (اختياري)"
            value={form.description}
            onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2}
            data-testid="input-star-product-description"
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <textarea
            placeholder={"مزايا المنتج (سطر لكل ميزة) — تظهر في نافذة التأكيد قبل الدفع\nمثال:\n✅ 100 فيديو يومياً بدلاً من 50\n✅ شارة VIP على الليدربورد"}
            value={form.benefitsBullets}
            onChange={(e) => setForm(f => ({ ...f, benefitsBullets: e.target.value }))}
            rows={4}
            className="w-full rounded-lg bg-white/5 border border-amber-500/20 px-3 py-2 text-sm text-white placeholder:text-muted-foreground/60 focus:outline-none focus:border-amber-500/50"
          />
          <p className="text-[10px] text-amber-400/70">⬆ هذه المزايا تظهر للمستخدم في نافذة تأكيد الشراء — اكتب كل ميزة في سطر منفصل</p>
          <Input placeholder="رابط صورة (اختياري)" value={form.imageUrl} onChange={(e) => setForm(f => ({ ...f, imageUrl: e.target.value }))} data-testid="input-star-product-image" />
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="السعر بالنجوم *" value={form.priceStars} onChange={(e) => setForm(f => ({ ...f, priceStars: e.target.value }))} data-testid="input-star-product-price" />
            <Input type="number" placeholder="الأولوية (0 = أول)" value={form.sortOrder} onChange={(e) => setForm(f => ({ ...f, sortOrder: e.target.value }))} />
          </div>
          <select
            value={form.effectType}
            onChange={(e) => setForm(f => ({ ...f, effectType: e.target.value as StarProductEffectType }))}
            data-testid="select-star-product-effect"
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
          >
            {(Object.keys(EFFECT_LABELS) as StarProductEffectType[]).map((key) => (
              <option key={key} value={key} className="bg-[#0D0D0F]">{EFFECT_LABELS[key]}</option>
            ))}
          </select>
          {EFFECT_VALUE_LABEL[form.effectType] && (
            <Input type="number" placeholder={EFFECT_VALUE_LABEL[form.effectType] ?? ""} value={form.effectValue} onChange={(e) => setForm(f => ({ ...f, effectValue: e.target.value }))} data-testid="input-star-product-effect-value" />
          )}
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2">
            <Button disabled={saving || !form.title.trim() || !form.priceStars} onClick={handleSave} data-testid="button-create-star-product">
              <Star className="w-4 h-4 mr-1" /> {saving ? "جار الحفظ..." : (editingId ? "حفظ التعديلات" : "إنشاء المنتج")}
            </Button>
            <Button variant="outline" onClick={cancelForm} className="border-white/10 text-muted-foreground">إلغاء</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm text-center py-4">جار التحميل...</p>
      ) : sortedProducts.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-4">لا يوجد منتجات بعد</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sortedProducts.map((product, idx) => (
            <div
              key={product.id}
              className={`bg-white/5 border rounded-lg p-3 flex items-center gap-3 transition-all ${product.isActive ? "border-white/10" : "border-white/5 opacity-60"}`}
              data-testid={`row-admin-star-product-${product.id}`}
            >
              {/* Sort controls */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveOrder(product, "up")}
                  disabled={idx === 0}
                  className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-white disabled:opacity-20 transition-colors"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  onClick={() => moveOrder(product, "down")}
                  disabled={idx === sortedProducts.length - 1}
                  className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-white disabled:opacity-20 transition-colors"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              {product.imageUrl && <img src={product.imageUrl} alt={product.title} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium text-sm truncate">{product.title}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${product.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-muted-foreground"}`}>
                    {product.isActive ? "نشط" : "متوقف"}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  ⭐ {product.priceStars.toLocaleString()} — {EFFECT_LABELS[product.effectType]}
                  {product.effectValue != null ? ` (${product.effectValue.toLocaleString()})` : ""}
                  {" · "}<span className="text-muted-foreground/60">ترتيب: {product.sortOrder}</span>
                </p>
                {product.benefitsBullets && (
                  <p className="text-[10px] text-amber-400/70 mt-0.5 truncate">
                    📋 {product.benefitsBullets.split("\n").filter(Boolean).length} مزايا محددة
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={() => openEdit(product)} className="w-8 h-8 p-0 border-white/10 hover:border-primary/40 hover:text-primary" title="تعديل">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleToggleActive(product)} className="w-8 h-8 p-0 border-white/10 hover:border-primary/40" data-testid={`button-toggle-star-product-${product.id}`} title={product.isActive ? "إيقاف" : "تفعيل"}>
                  <Power className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(product)} className="w-8 h-8 p-0" data-testid={`button-delete-star-product-${product.id}`} title="حذف">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
