import { useEffect, useState } from "react";
import { adminApi, type SponsoredAd } from "./adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Megaphone, Power } from "lucide-react";

export function AdminAds() {
  const [ads, setAds] = useState<SponsoredAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [rewardPoints, setRewardPoints] = useState("5000");
  const [notify, setNotify] = useState(true);

  function loadAds() {
    setLoading(true);
    adminApi
      .ads()
      .then(setAds)
      .catch(() => setError("فشل تحميل الإعلانات"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAds();
  }, []);

  function resetForm() {
    setTitle("");
    setDescription("");
    setImageUrl("");
    setLinkUrl("");
    setRewardPoints("5000");
    setNotify(true);
  }

  async function handleCreate() {
    if (!title.trim() || !linkUrl.trim() || !rewardPoints) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.createAd({
        title: title.trim(),
        description: description.trim() || null,
        imageUrl: imageUrl.trim() || null,
        linkUrl: linkUrl.trim(),
        rewardPoints: Number(rewardPoints),
        notify,
      });
      resetForm();
      setShowForm(false);
      loadAds();
    } catch {
      setError("فشل إنشاء الإعلان");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(ad: SponsoredAd) {
    try {
      await adminApi.updateAd(ad.id, { isActive: !ad.isActive });
      loadAds();
    } catch {
      setError("فشل تحديث الإعلان");
    }
  }

  async function handleDelete(ad: SponsoredAd) {
    if (!confirm(`هل تريد حذف الإعلان "${ad.title}"؟`)) return;
    try {
      await adminApi.deleteAd(ad.id);
      loadAds();
    } catch {
      setError("فشل حذف الإعلان");
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="section-admin-ads">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-white text-sm">الإعلانات الممولة (Sponsored Ads)</h3>
        <Button size="sm" onClick={() => setShowForm((v) => !v)} data-testid="button-toggle-ad-form">
          <Plus className="w-4 h-4 mr-1" /> إضافة إعلان
        </Button>
      </div>

      {showForm && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
          <Input placeholder="عنوان الإعلان" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-ad-title" />
          <textarea
            placeholder="وصف قصير (اختياري)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            data-testid="input-ad-description"
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <Input placeholder="رابط صورة (اختياري)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} data-testid="input-ad-image" />
          <Input placeholder="رابط الإعلان (الذي يفتحه المستخدم)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} data-testid="input-ad-link" />
          <Input
            type="number"
            placeholder="عدد النقاط كمكافأة"
            value={rewardPoints}
            onChange={(e) => setRewardPoints(e.target.value)}
            data-testid="input-ad-reward"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} data-testid="checkbox-ad-notify" />
            إرسال إشعار تيليجرام لجميع المستخدمين عند الإنشاء
          </label>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <Button disabled={saving || !title.trim() || !linkUrl.trim()} onClick={handleCreate} data-testid="button-create-ad">
            <Megaphone className="w-4 h-4 mr-1" /> {saving ? "جار الإنشاء..." : "إنشاء ونشر"}
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm text-center py-4">جار التحميل...</p>
      ) : ads.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-4">لا يوجد إعلانات بعد</p>
      ) : (
        <div className="flex flex-col gap-2">
          {ads.map((ad) => (
            <div key={ad.id} className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-center gap-3" data-testid={`row-admin-ad-${ad.id}`}>
              {ad.imageUrl && <img src={ad.imageUrl} alt={ad.title} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium text-sm truncate">{ad.title}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                      ad.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-muted-foreground"
                    }`}
                  >
                    {ad.isActive ? "نشط" : "متوقف"}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">+{ad.rewardPoints.toLocaleString()} نقطة</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleToggleActive(ad)} data-testid={`button-toggle-ad-${ad.id}`}>
                <Power className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleDelete(ad)} data-testid={`button-delete-ad-${ad.id}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
