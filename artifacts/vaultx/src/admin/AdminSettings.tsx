import { useEffect, useState } from "react";
import { adminApi, type AdminSettingsMap } from "./adminApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";

type FieldDef = {
  key: string;
  label: string;
  type: "number" | "text";
  defaultValue: number | string;
};

const SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "اقتصاد اللعبة",
    fields: [
      { key: "tapPointsPerTap", label: "نقاط كل ضغطة", type: "number", defaultValue: 1 },
      { key: "energyMax", label: "الحد الأقصى للطاقة", type: "number", defaultValue: 1000 },
      { key: "farmingDurationHours", label: "مدة الفارمينج (ساعات)", type: "number", defaultValue: 8 },
      { key: "referralRatePercent", label: "نسبة عمولة الإحالة (%)", type: "number", defaultValue: 10 },
    ],
  },
  {
    title: "Adsgram (إعلانات)",
    fields: [
      { key: "adsgramBlockId", label: "Adsgram Block ID", type: "text", defaultValue: "" },
      { key: "adsgramRewardPoints", label: "نقاط مقابل كل عرض إعلان", type: "number", defaultValue: 100 },
      { key: "adsgramCooldownSeconds", label: "مدة الانتظار بين الإعلانات (ثانية)", type: "number", defaultValue: 30 },
      { key: "adsgramDailyCap", label: "الحد الأقصى للإعلانات يوميًا", type: "number", defaultValue: 20 },
    ],
  },
  {
    title: "عروض CPA / Offerwall",
    fields: [
      { key: "cpaApiKey", label: "CPA Offerwall API Key", type: "text", defaultValue: "" },
      { key: "cpaOfferwallUrl", label: "رابط الـ Offerwall", type: "text", defaultValue: "" },
      { key: "cpaPostbackSecret", label: "Postback Secret (للتحقق من الإشعارات)", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "الاستبيانات (Monlix / Bitlabs)",
    fields: [
      { key: "monlixApiKey", label: "Monlix API Key", type: "text", defaultValue: "" },
      { key: "monlixOfferwallUrl", label: "رابط Monlix", type: "text", defaultValue: "" },
      { key: "monlixPostbackSecret", label: "Monlix Postback Secret", type: "text", defaultValue: "" },
      { key: "bitlabsApiKey", label: "Bitlabs API Key", type: "text", defaultValue: "" },
      { key: "bitlabsOfferwallUrl", label: "رابط Bitlabs", type: "text", defaultValue: "" },
      { key: "bitlabsPostbackSecret", label: "Bitlabs Postback Secret", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "Telegram Stars",
    fields: [
      { key: "starsBoostPriceStars", label: "سعر تعزيز النقاط (Stars)", type: "number", defaultValue: 50 },
      { key: "starsEnergyRefillPriceStars", label: "سعر إعادة شحن الطاقة (Stars)", type: "number", defaultValue: 30 },
    ],
  },
  {
    title: "عضوية Premium",
    fields: [
      { key: "premiumMonthlyPriceStars", label: "سعر الاشتراك الشهري (Stars)", type: "number", defaultValue: 200 },
      { key: "premiumEarningsMultiplier", label: "مضاعف الأرباح لمشتركي Premium", type: "number", defaultValue: 2 },
    ],
  },
];

export function AdminSettings() {
  const [values, setValues] = useState<AdminSettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [settingUpWebhook, setSettingUpWebhook] = useState(false);

  async function setupWebhook() {
    setSettingUpWebhook(true);
    setWebhookStatus(null);
    try {
      const result = await adminApi.setupTelegramWebhook();
      setWebhookStatus(`تم الربط بنجاح: ${result.webhookUrl}`);
    } catch (err) {
      setWebhookStatus(err instanceof Error ? `فشل: ${err.message}` : "فشل ربط الـ Webhook");
    } finally {
      setSettingUpWebhook(false);
    }
  }

  useEffect(() => {
    adminApi
      .settings()
      .then(setValues)
      .finally(() => setLoading(false));
  }, []);

  async function saveAll() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await adminApi.updateSettings(values);
      setValues(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted-foreground text-sm">جار التحميل...</p>;

  return (
    <div className="flex flex-col gap-5" data-testid="section-admin-settings">
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-2">Telegram Bot Webhook</h3>
        <p className="text-xs text-muted-foreground mb-3">
          فعّل هذا لتفعيل استقبال مدفوعات Telegram Stars (يتطلب أن يكون TELEGRAM_BOT_TOKEN مضبوطًا).
        </p>
        <Button onClick={setupWebhook} disabled={settingUpWebhook} data-testid="button-setup-webhook" variant="secondary">
          {settingUpWebhook ? "جار الربط..." : "ربط Webhook الآن"}
        </Button>
        {webhookStatus && <p className="text-xs text-muted-foreground mt-2 break-all">{webhookStatus}</p>}
      </div>
      {SECTIONS.map((section) => (
        <div key={section.title} className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-sm font-bold text-white mb-3">{section.title}</h3>
          <div className="flex flex-col gap-3">
            {section.fields.map((field) => (
              <label key={field.key} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{field.label}</span>
                <Input
                  type={field.type}
                  data-testid={`input-setting-${field.key}`}
                  value={(values[field.key] as string | number | undefined) ?? field.defaultValue}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </div>
      ))}

      <Button onClick={saveAll} disabled={saving} data-testid="button-save-settings" className="sticky bottom-4">
        <Save className="w-4 h-4 mr-1" />
        {saving ? "جار الحفظ..." : saved ? "تم الحفظ ✓" : "حفظ كل الإعدادات"}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        ملاحظة: المفاتيح (API Keys) هنا جاهزة للتفعيل — أدخلها عند الحصول عليها من المزودين.
      </p>
    </div>
  );
}
