import { useEffect, useState } from "react";
import { adminApi, type AdminSettingsMap } from "./adminApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Save } from "lucide-react";

type ToggleDef = { key: string; label: string; description: string };

const FEATURE_TOGGLES: ToggleDef[] = [
  {
    key: "weeklyPrizesEnabled",
    label: "🏆 الجوائز الأسبوعية التلقائية",
    description: "توزيع جوائز تلقائية على أفضل 10 لاعبين كل أسبوع (1M / 600k / ... / 100k نقطة)",
  },
  {
    key: "referralMilestonesEnabled",
    label: "🎯 مكافآت أهداف الإحالة",
    description: "مكافآت تصاعدية عند وصول المُحيل إلى 5 / 10 / 25 / 50 / 100 دعوة",
  },
  {
    key: "offlineEarningsEnabled",
    label: "🕐 أرباح وضع عدم الاتصال",
    description: "يعرض للاعب نافذة بأرباحه السلبية بعد غياب 10 دقائق أو أكثر (سقف 3 ساعات)",
  },
];

type FieldDef = {
  key: string;
  label: string;
  type: "number" | "text" | "textarea";
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
      { key: "adMinWatchSeconds", label: "الحد الأدنى لمشاهدة الإعلان قبل استلام المكافأة (ثانية) — لكل الإعلانات الحالية والمستقبلية", type: "number", defaultValue: 15 },
      { key: "pointsPerDollar", label: "عدد النقاط = 1 دولار (افتراضي: 2000000)", type: "number", defaultValue: 2000000 },
      { key: "dollarBonus", label: "مبلغ Bonus بالدولار يُعرض بجانب رصيد المستخدم (0 = مخفي)", type: "number", defaultValue: 0 },
    ],
  },
  {
    title: "Adsgram (إعلانات)",
    fields: [
      { key: "adsgramBlockId", label: "Adsgram Block ID", type: "text", defaultValue: "" },
      { key: "adsgramBannerBlockId", label: "Adsgram Banner Block ID (بانر غير مزعج، اختياري)", type: "text", defaultValue: "" },
      { key: "adsgramRewardPoints", label: "نقاط مقابل كل عرض إعلان", type: "number", defaultValue: 100 },
      { key: "adsgramCooldownSeconds", label: "مدة الانتظار بين الإعلانات (ثانية)", type: "number", defaultValue: 30 },
      { key: "adsgramDailyCap", label: "الحد الأقصى للإعلانات يوميًا", type: "number", defaultValue: 20 },
      { key: "adsgramPostbackSecret", label: "Adsgram Postback Secret", type: "text", defaultValue: "" },
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
    title: "Lootably (Offerwall)",
    fields: [
      { key: "lootablyApiKey", label: "Lootably API Key", type: "text", defaultValue: "" },
      { key: "lootablyOfferwallUrl", label: "رابط Lootably", type: "text", defaultValue: "" },
      { key: "lootablyPostbackSecret", label: "Lootably Postback Secret", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "Revlum (Offerwall)",
    fields: [
      { key: "revlumApiKey", label: "Revlum API Key", type: "text", defaultValue: "" },
      { key: "revlumOfferwallUrl", label: "رابط Revlum", type: "text", defaultValue: "" },
      { key: "revlumPostbackSecret", label: "Revlum Postback Secret", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "AyeT-Studios (Offerwall)",
    fields: [
      { key: "ayetstudiosApiKey", label: "AyeT-Studios API Key", type: "text", defaultValue: "" },
      { key: "ayetstudiosOfferwallUrl", label: "رابط AyeT-Studios", type: "text", defaultValue: "" },
      { key: "ayetstudiosPostbackSecret", label: "AyeT-Studios Postback Secret", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "OfferToro (Offerwall)",
    fields: [
      { key: "offertoroApiKey", label: "OfferToro API Key", type: "text", defaultValue: "" },
      { key: "offertoroOfferwallUrl", label: "رابط OfferToro", type: "text", defaultValue: "" },
      { key: "offertoroPostbackSecret", label: "OfferToro Postback Secret", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "Torox (Offerwall)",
    fields: [
      { key: "toroxApiKey", label: "Torox API Key", type: "text", defaultValue: "" },
      { key: "toroxOfferwallUrl", label: "رابط Torox", type: "text", defaultValue: "" },
      { key: "toroxPostbackSecret", label: "Torox Postback Secret", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "Yandex Ads (Offerwall)",
    fields: [
      { key: "yandexadsApiKey", label: "Yandex Ads API Key", type: "text", defaultValue: "" },
      { key: "yandexadsOfferwallUrl", label: "رابط Yandex Ads", type: "text", defaultValue: "" },
      { key: "yandexadsPostbackSecret", label: "Yandex Ads Postback Secret", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "Adsterra (Offerwall)",
    fields: [
      { key: "adsterraApiKey", label: "Adsterra API Key", type: "text", defaultValue: "" },
      { key: "adsterraOfferwallUrl", label: "رابط Adsterra", type: "text", defaultValue: "" },
      { key: "adsterraPostbackSecret", label: "Adsterra Postback Secret", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "PropellerAds (Offerwall)",
    fields: [
      { key: "propelleradsApiKey", label: "PropellerAds API Key", type: "text", defaultValue: "" },
      { key: "propelleradsOfferwallUrl", label: "رابط PropellerAds", type: "text", defaultValue: "" },
      { key: "propelleradsPostbackSecret", label: "PropellerAds Postback Secret", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "CPALead (Offerwall)",
    fields: [
      { key: "cpaleadApiKey", label: "CPALead API Key", type: "text", defaultValue: "" },
      { key: "cpaleadOfferwallUrl", label: "رابط CPALead", type: "text", defaultValue: "" },
      { key: "cpaleadPostbackSecret", label: "CPALead Postback Secret", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "Monetag (إعلان مكافأة)",
    fields: [
      { key: "monetagZoneId", label: "Monetag Zone ID", type: "text", defaultValue: "" },
      { key: "monetagRewardPoints", label: "نقاط مقابل كل عرض إعلان", type: "number", defaultValue: 100 },
      { key: "monetagCooldownSeconds", label: "مدة الانتظار بين الإعلانات (ثانية)", type: "number", defaultValue: 30 },
      { key: "monetagDailyCap", label: "الحد الأقصى للإعلانات يوميًا", type: "number", defaultValue: 20 },
    ],
  },
  {
    title: "Onclicka (إعلان مكافأة)",
    fields: [
      { key: "onclickaSpotId", label: "Onclicka Video Spot ID (إعلان الفيديو بمكافأة)", type: "text", defaultValue: "" },
      { key: "onclickaInpageId", label: "Onclicka Inpage ID (إعلانات تلقائية داخل الصفحة)", type: "text", defaultValue: "" },
      { key: "onclickaRewardPoints", label: "نقاط مقابل كل عرض إعلان", type: "number", defaultValue: 100 },
      { key: "onclickaCooldownSeconds", label: "مدة الانتظار بين الإعلانات (ثانية)", type: "number", defaultValue: 30 },
      { key: "onclickaDailyCap", label: "الحد الأقصى للإعلانات يوميًا", type: "number", defaultValue: 20 },
    ],
  },
  {
    title: "رسائل البوت والشروط",
    fields: [
      { key: "botStartMessage", label: "رسالة /start (HTML مدعوم)", type: "textarea" as const, defaultValue: "" },
      { key: "botHelpText", label: "نص المساعدة (زر ℹ️ المساعدة)", type: "textarea" as const, defaultValue: "" },
      { key: "botPolicyText", label: "سياسة الاستخدام (زر 📜 السياسة)", type: "textarea" as const, defaultValue: "" },
      { key: "appWelcomeText", label: "نص الترحيب داخل التطبيق (بطاقة الشروط)", type: "textarea" as const, defaultValue: "" },
      { key: "appTermsText", label: "نص الشروط داخل التطبيق (بطاقة الشروط)", type: "textarea" as const, defaultValue: "" },
    ],
  },

  {
    title: "ExoClick (إعلان بيني - Mobile Fullpage Interstitial)",
    fields: [
      { key: "exoclickZoneId", label: "ExoClick Zone ID", type: "text", defaultValue: "" },
      { key: "exoclickInsClass", label: "ExoClick INS Class (مثال: eas6a97888e33)", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "Adscend Media (Offerwall)",
    fields: [
      { key: "adscendmediaApiKey", label: "Adscend Media API Key", type: "text", defaultValue: "" },
      { key: "adscendmediaOfferwallUrl", label: "رابط Adscend Media", type: "text", defaultValue: "" },
      { key: "adscendmediaPostbackSecret", label: "Adscend Media Postback Secret", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "AdGem (Offerwall)",
    fields: [
      { key: "adgemApiKey", label: "AdGem API Key / Token", type: "text", defaultValue: "" },
      { key: "adgemOfferwallUrl", label: "رابط AdGem", type: "text", defaultValue: "" },
      { key: "adgemPostbackSecret", label: "AdGem Postback Secret", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "CPX Research (استبيانات)",
    fields: [
      { key: "cpxresearchAppId", label: "CPX Research App ID", type: "text", defaultValue: "" },
      { key: "cpxresearchSecureHash", label: "CPX Research Secure Hash", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "عضوية Premium",
    fields: [
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

      {/* ── ميزات اللعبة (أزرار تفعيل / إيقاف) ── */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-1">ميزات اللعبة</h3>
        <p className="text-xs text-muted-foreground mb-4">كل الميزات معطّلة بشكل افتراضي — فعّلها متى شئت.</p>
        <div className="flex flex-col gap-4">
          {FEATURE_TOGGLES.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-white">{t.label}</span>
                <span className="text-xs text-muted-foreground">{t.description}</span>
              </div>
              <Switch
                checked={Boolean(values[t.key])}
                onCheckedChange={(checked) =>
                  setValues((prev) => ({ ...prev, [t.key]: checked }))
                }
                data-testid={`toggle-${t.key}`}
              />
            </div>
          ))}
        </div>
      </div>

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
                {field.type === "textarea" ? (
                  <textarea
                    rows={4}
                    data-testid={`input-setting-${field.key}`}
                    value={(values[field.key] as string | undefined) ?? (field.defaultValue as string)}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                    dir="auto"
                  />
                ) : (
                  <Input
                    type={field.type as "text" | "number"}
                    data-testid={`input-setting-${field.key}`}
                    value={(values[field.key] as string | number | undefined) ?? field.defaultValue}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value,
                      }))
                    }
                  />
                )}
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
