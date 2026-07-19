import { useEffect, useState } from "react";
import { adminApi, type AdminSettingsMap } from "./adminApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save, Plus, Trash2, GripVertical, ExternalLink } from "lucide-react";

interface AdsFeature { icon: string; title: string; desc: string; url: string }
interface AdsLink { label: string; url: string; icon: string }

const TEXT_FIELDS = [
  { key: "adsPageTitle",      label: "عنوان التطبيق الرئيسي",             placeholder: "SouqratesX" },
  { key: "adsPageTagline",    label: "النص التعريفي (تحت العنوان)",        placeholder: "منصة SouqrateX" },
  { key: "adsPageCtaText",    label: "نص زر الدعوة (CTA)",                placeholder: "العب على تيليجرام" },
  { key: "adsPageCtaEmoji",   label: "إيموجي زر الدعوة",                  placeholder: "✈️" },
  { key: "adsPageFooterText", label: "نص التذييل",                        placeholder: "انضم لآلاف اللاعبين الآن وابدأ رحلتك" },
] as const;

const DEFAULT_FEATURES: AdsFeature[] = [
  { icon: '⛏️', title: 'التعدين التلقائي',  desc: 'اضغط وعدّن النقاط في كل وقت، وارابح بشكل سلبي حتى وأنت غائب.', url: '' },
  { icon: '🎮', title: 'ألعاب يومية',       desc: 'العجلة، تحدي الذاكرة، والنقر السريع — العب يومياً واكسب نقاطاً إضافية.', url: '' },
  { icon: '👥', title: 'نظام الإحالة',      desc: 'ادعُ أصدقاءك واكسب نسبة من أرباحهم. كلما دعوت أكثر، ربحت أكثر.', url: '' },
  { icon: '🛡️', title: 'الفِرَق',           desc: 'أنشئ فرقتك أو انضم لفرقة وتنافس على قائمة أفضل الفِرَق عالمياً.', url: '' },
  { icon: '💎', title: 'عملة SKX',          desc: 'حوّل نقاطك إلى عملة SKX القابلة للسحب وشارك في نظام البكسلات.', url: '' },
];

function parseJsonArray<T>(raw: unknown, fallback: T[]): T[] {
  try {
    if (typeof raw === "string" && raw.trim()) return JSON.parse(raw) as T[];
    if (Array.isArray(raw)) return raw as T[];
  } catch { /* ignore */ }
  return fallback;
}

export function AdminAdsPageEditor() {
  const [values, setValues] = useState<AdminSettingsMap>({});
  const [features, setFeatures] = useState<AdsFeature[]>(DEFAULT_FEATURES);
  const [links, setLinks] = useState<AdsLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminApi.settings().then(v => {
      setValues(v);
      setFeatures(parseJsonArray<AdsFeature>(v.adsPageFeatures, DEFAULT_FEATURES)
        .map(f => ({ icon: f.icon ?? '', title: f.title ?? '', desc: f.desc ?? '', url: f.url ?? '' })));
      setLinks(parseJsonArray<AdsLink>(v.adsPageExtraLinks, [])
        .map(l => ({ label: l.label ?? '', url: l.url ?? '', icon: l.icon ?? '' })));
    }).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const payload: AdminSettingsMap = { ...values };
      TEXT_FIELDS.forEach(f => { payload[f.key] = values[f.key] ?? f.placeholder; });
      payload.adsPageFeatures  = features.map(f => ({ icon: f.icon, title: f.title, desc: f.desc, url: f.url || null }));
      payload.adsPageExtraLinks = links.map(l => ({ label: l.label, url: l.url, icon: l.icon || null }));
      const updated = await adminApi.updateSettings(payload);
      setValues(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const previewUrl = `/adspage`;

  if (loading) return <p className="text-sm text-muted-foreground">جار التحميل...</p>;

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">محرر صفحة الإعلانات</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            تحكم كامل في محتوى <span className="font-mono text-purple-400">/adspage</span> — العنوان، البطاقات، الروابط
          </p>
        </div>
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white border border-white/10 rounded-lg px-3 py-1.5 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          معاينة
        </a>
      </div>

      {/* ── النصوص الأساسية ── */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3">النصوص الأساسية</h3>
        <div className="flex flex-col gap-3">
          {TEXT_FIELDS.map(field => (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{field.label}</span>
              <Input
                value={(values[field.key] as string) ?? field.placeholder}
                onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
              />
            </label>
          ))}
        </div>
      </div>

      {/* ── بطاقات الميزات ── */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">بطاقات الميزات</h3>
          <button
            type="button"
            onClick={() => setFeatures(f => [...f, { icon: '⭐', title: '', desc: '', url: '' }])}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded-lg px-2 py-1"
          >
            <Plus className="w-3 h-3" /> إضافة بطاقة
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {features.map((f, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  value={f.icon}
                  onChange={e => setFeatures(arr => arr.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))}
                  placeholder="إيموجي"
                  className="w-16 text-center"
                />
                <Input
                  value={f.title}
                  onChange={e => setFeatures(arr => arr.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                  placeholder="العنوان"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setFeatures(arr => arr.filter((_, j) => j !== i))}
                  className="text-red-400 hover:text-red-300 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <textarea
                rows={2}
                value={f.desc}
                onChange={e => setFeatures(arr => arr.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))}
                placeholder="الوصف"
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                dir="rtl"
              />
              <Input
                value={f.url}
                onChange={e => setFeatures(arr => arr.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                placeholder="رابط (اختياري — اتركه فارغاً إذا لا تريد رابطاً)"
                dir="ltr"
              />
            </div>
          ))}
          {features.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد بطاقات — اضغط "إضافة بطاقة" لإنشاء أول ميزة</p>
          )}
        </div>
      </div>

      {/* ── روابط إضافية ── */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">روابط إضافية (أزرار)</h3>
          <button
            type="button"
            onClick={() => setLinks(l => [...l, { label: '', url: '', icon: '' }])}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded-lg px-2 py-1"
          >
            <Plus className="w-3 h-3" /> إضافة رابط
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {links.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={l.icon}
                onChange={e => setLinks(arr => arr.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))}
                placeholder="🔗"
                className="w-14 text-center"
              />
              <Input
                value={l.label}
                onChange={e => setLinks(arr => arr.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                placeholder="نص الزر"
                className="flex-1"
              />
              <Input
                value={l.url}
                onChange={e => setLinks(arr => arr.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                placeholder="https://..."
                className="flex-1"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setLinks(arr => arr.filter((_, j) => j !== i))}
                className="text-red-400 hover:text-red-300 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {links.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">لا توجد روابط — اضغط "إضافة رابط" لإضافة زر</p>
          )}
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="sticky bottom-4">
        <Save className="w-4 h-4 mr-1" />
        {saving ? "جار الحفظ..." : saved ? "تم الحفظ ✓" : "حفظ صفحة الإعلانات"}
      </Button>
    </div>
  );
}
