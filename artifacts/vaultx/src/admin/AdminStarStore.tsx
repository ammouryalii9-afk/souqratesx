import { useEffect, useState } from "react";
import { adminApi, type StarProduct, type StarProductEffectType } from "./adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Star, Power } from "lucide-react";

const EFFECT_LABELS: Record<StarProductEffectType, string> = {
  points: "نقاط فورية",
  energy_refill: "تعبئة الطاقة بالكامل",
  turbo_boost: "تسريع التعدين (تربو)",
  premium_days: "اشتراك بريميوم (أيام)",
  permanent_multiplier: "مضاعف نقاط دائم (%)",
  badge: "شارة مميزة",
  skin: "سكن (شكل) مخصص",
};

const EFFECT_VALUE_LABEL: Record<StarProductEffectType, string | null> = {
  points: "عدد النقاط الممنوحة",
  energy_refill: null,
  turbo_boost: "مدة التسريع بالثواني",
  premium_days: "عدد أيام البريميوم",
  permanent_multiplier: "نسبة الزيادة الدائمة % (مثال: 10)",
  badge: "رقم تعريف الشارة (Badge ID)",
  skin: "رقم تعريف السكن (Skin ID)",
};

export function AdminStarStore() {
  const [products, setProducts] = useState<StarProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [priceStars, setPriceStars] = useState("100");
  const [effectType, setEffectType] = useState<StarProductEffectType>("points");
  const [effectValue, setEffectValue] = useState("1000");

  function loadProducts() {
    setLoading(true);
    adminApi
      .starProducts()
      .then(setProducts)
      .catch(() => setError("فشل تحميل منتجات المتجر"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadProducts();
  }, []);

  function resetForm() {
    setTitle("");
    setDescription("");
    setImageUrl("");
    setPriceStars("100");
    setEffectType("points");
    setEffectValue("1000");
  }

  async function handleCreate() {
    if (!title.trim() || !priceStars) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.createStarProduct({
        title: title.trim(),
        description: description.trim() || null,
        imageUrl: imageUrl.trim() || null,
        priceStars: Number(priceStars),
        effectType,
        effectValue: EFFECT_VALUE_LABEL[effectType] ? Number(effectValue) : null,
      });
      resetForm();
      setShowForm(false);
      loadProducts();
    } catch {
      setError("فشل إنشاء المنتج");
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

  return (
    <div className="flex flex-col gap-4" data-testid="section-admin-star-store">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-white text-sm">متجر نجوم تيليجرام (Stars Store)</h3>
        <Button size="sm" onClick={() => setShowForm((v) => !v)} data-testid="button-toggle-star-product-form">
          <Plus className="w-4 h-4 mr-1" /> إضافة منتج
        </Button>
      </div>

      {showForm && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
          <Input placeholder="اسم المنتج" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-star-product-title" />
          <textarea
            placeholder="وصف قصير (اختياري)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            data-testid="input-star-product-description"
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <Input placeholder="رابط صورة (اختياري)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} data-testid="input-star-product-image" />
          <Input
            type="number"
            placeholder="السعر بعدد النجوم"
            value={priceStars}
            onChange={(e) => setPriceStars(e.target.value)}
            data-testid="input-star-product-price"
          />
          <select
            value={effectType}
            onChange={(e) => setEffectType(e.target.value as StarProductEffectType)}
            data-testid="select-star-product-effect"
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
          >
            {(Object.keys(EFFECT_LABELS) as StarProductEffectType[]).map((key) => (
              <option key={key} value={key} className="bg-[#0D0D0F]">
                {EFFECT_LABELS[key]}
              </option>
            ))}
          </select>
          {EFFECT_VALUE_LABEL[effectType] && (
            <Input
              type="number"
              placeholder={EFFECT_VALUE_LABEL[effectType] ?? ""}
              value={effectValue}
              onChange={(e) => setEffectValue(e.target.value)}
              data-testid="input-star-product-effect-value"
            />
          )}
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <Button disabled={saving || !title.trim() || !priceStars} onClick={handleCreate} data-testid="button-create-star-product">
            <Star className="w-4 h-4 mr-1" /> {saving ? "جار الإنشاء..." : "إنشاء المنتج"}
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm text-center py-4">جار التحميل...</p>
      ) : products.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-4">لا يوجد منتجات بعد</p>
      ) : (
        <div className="flex flex-col gap-2">
          {products.map((product) => (
            <div
              key={product.id}
              className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-center gap-3"
              data-testid={`row-admin-star-product-${product.id}`}
            >
              {product.imageUrl && <img src={product.imageUrl} alt={product.title} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium text-sm truncate">{product.title}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                      product.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-muted-foreground"
                    }`}
                  >
                    {product.isActive ? "نشط" : "متوقف"}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  ⭐ {product.priceStars.toLocaleString()} — {EFFECT_LABELS[product.effectType]}
                  {product.effectValue != null ? ` (${product.effectValue.toLocaleString()})` : ""}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleToggleActive(product)} data-testid={`button-toggle-star-product-${product.id}`}>
                <Power className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleDelete(product)} data-testid={`button-delete-star-product-${product.id}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
