import { useEffect, useState } from "react";
import { adminApi, type AdminSettingsMap } from "./adminApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Save, Cpu, Flame, Globe, Leaf, Star, Gem, Plus, Trash2, GripVertical } from "lucide-react";

interface AdsFeature { icon: string; title: string; desc: string; url: string }
interface AdsLink { label: string; url: string; icon: string }

const COMBO_ICON_OPTIONS = [
  { id: 'cpu', icon: Cpu, label: 'CPU' },
  { id: 'flame', icon: Flame, label: 'Flame' },
  { id: 'globe', icon: Globe, label: 'Globe' },
  { id: 'leaf', icon: Leaf, label: 'Leaf' },
  { id: 'star', icon: Star, label: 'Star' },
  { id: 'gem', icon: Gem, label: 'Gem' },
];

type ToggleDef = { key: string; label: string; description: string; defaultOn?: boolean };

const FEATURE_TOGGLES: ToggleDef[] = [
  {
    key: "maintenanceMode",
    label: "🔧 وضع الصيانة",
    description: "إيقاف البوت مؤقتاً — يُظهر لجميع المستخدمين شاشة صيانة بدلاً من اللعبة",
  },
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
  {
    key: "pixelCycleAutoStart",
    label: "🟩 بدء دورات البكسلات تلقائيًا",
    description: "عند انتهاء دورة بكسلات وتوزيع أرباحها، تبدأ دورة جديدة تلقائيًا (مفعّل افتراضيًا)",
    defaultOn: true,
  },
  {
    key: "squadWeeklyPrizesEnabled",
    label: "🏆 الجوائز الأسبوعية للفرق",
    description: "كل اثنين: أعضاء أفضل 3 فرق يحصلون على مكافأة مشتركة (مقسّمة على عدد الأعضاء)",
  },
  {
    key: "squadRankBonusEnabled",
    label: "⚡ مضاعف نقاط الفريق #1",
    description: "أعضاء الفريق الأول في الترتيب يكسبون نسبة إضافية على كل مكافأة إعلان أو عرض",
  },
  {
    key: "squadGrowthMilestonesEnabled",
    label: "🎯 مكافآت نمو الفريق (Milestones)",
    description: "عند وصول الفريق لـ 10 / 25 / 50 / 100 عضو، يحصل الجميع تلقائياً على مكافأة",
  },
];

type FieldDef = {
  key: string;
  label: string;
  type: "number" | "text" | "textarea" | "json";
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
      { key: "gameToSpendablePercent", label: "نسبة الألعاب/الضغط للرصيد القابل للسحب (%) — 0 = لوحة ترتيب فقط، الإعلانات دائماً 100%", type: "number", defaultValue: 0 },
      { key: "skpToSkxConversionRate", label: "نسبة تحويل SKP إلى SKX عند الضغط على Claim (%) — الباقي يُحرق", type: "number", defaultValue: 5 },
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
    title: "GigaPub (Offerwall SDK)",
    fields: [
      { key: "gigapubProjectId", label: "GigaPub Project ID", type: "text", defaultValue: "" },
      { key: "gigapubSecret", label: "GigaPub Secret (للتحقق من المكافآت)", type: "text", defaultValue: "" },
    ],
  },
  {
    title: "عضوية Premium",
    fields: [
      { key: "premiumEarningsMultiplier", label: "مضاعف الأرباح لمشتركي Premium", type: "number", defaultValue: 2 },
    ],
  },
  {
    title: "البكسلات (استثمار وتوزيع أرباح الإعلانات)",
    fields: [
      { key: "pixelTotalSupply", label: "المعروض الكلي من البكسلات لكل دورة", type: "number", defaultValue: 10000 },
      { key: "pixelPriceUSD", label: "سعر البكسل الواحد بالدولار (مثال: 0.01 = سنت واحد) — يُضاف لرصيد المستخدم بالدولار عند إغلاق الدورة", type: "number", defaultValue: 0 },
      { key: "pixelDividendPercent", label: "نسبة أرباح الإعلانات الموزّعة على حاملي البكسلات (%)", type: "number", defaultValue: 35 },
      { key: "pixelCycleDays", label: "مدة الدورة (أيام)", type: "number", defaultValue: 15 },
      { key: "maxPixelsPerPurchase", label: "الحد الأقصى للبكسلات في عملية شراء واحدة", type: "number", defaultValue: 1000 },
      {
        key: "pixelPriceTiers",
        label: 'شرائح الأسعار (JSON) — مثال: [{"upTo":2500,"price":500},{"upTo":5000,"price":750},{"upTo":7500,"price":1000},{"upTo":10000,"price":1500}]',
        type: "json",
        defaultValue: '[{"upTo":2500,"price":500},{"upTo":5000,"price":750},{"upTo":7500,"price":1000},{"upTo":10000,"price":1500}]',
      },
    ],
  },
  {
    title: "صفحة الإعلانات (/adspage) — النصوص الأساسية",
    fields: [
      { key: "adsPageTitle", label: "عنوان التطبيق الرئيسي", type: "text", defaultValue: "SouqratesX" },
      { key: "adsPageTagline", label: "النص التعريفي (تحت العنوان)", type: "text", defaultValue: "منصة SouqrateX" },
      { key: "adsPageCtaText", label: "نص زر الدعوة (CTA)", type: "text", defaultValue: "العب على تيليجرام" },
      { key: "adsPageCtaEmoji", label: "إيموجي زر الدعوة", type: "text", defaultValue: "✈️" },
      { key: "adsPageFooterText", label: "نص التذييل", type: "text", defaultValue: "انضم لآلاف اللاعبين الآن وابدأ رحلتك" },
    ],
  },
  {
    title: "الفرق (Squad) — مكافآت الأعضاء",
    fields: [
      { key: "squadJoinBonus", label: "مكافأة انضمام للفريق (مرة واحدة لكل حساب)", type: "number", defaultValue: 5000 },
      { key: "squadWeeklyPrize1", label: "جائزة الفريق #1 أسبوعياً (تُقسَّم على الأعضاء — SKX)", type: "number", defaultValue: 500000 },
      { key: "squadWeeklyPrize2", label: "جائزة الفريق #2 أسبوعياً (SKX)", type: "number", defaultValue: 250000 },
      { key: "squadWeeklyPrize3", label: "جائزة الفريق #3 أسبوعياً (SKX)", type: "number", defaultValue: 100000 },
      { key: "squadRankBonusPercent", label: "% مكافأة مضاعفة لأعضاء الفريق #1 على مكافآت الإعلانات والعروض (0 = معطّل)", type: "number", defaultValue: 20 },
      { key: "squadGrowthMilestone10", label: "مكافأة كل عضو عند وصول الفريق لـ 10 أعضاء (SKP)", type: "number", defaultValue: 10000 },
      { key: "squadGrowthMilestone25", label: "مكافأة كل عضو عند وصول الفريق لـ 25 عضواً (SKP)", type: "number", defaultValue: 25000 },
      { key: "squadGrowthMilestone50", label: "مكافأة كل عضو عند وصول الفريق لـ 50 عضواً (SKP)", type: "number", defaultValue: 50000 },
      { key: "squadGrowthMilestone100", label: "مكافأة كل عضو عند وصول الفريق لـ 100 عضو (SKP)", type: "number", defaultValue: 100000 },
    ],
  },
];

const DEFAULT_FEATURES: AdsFeature[] = [
  { icon: '⛏️', title: 'التعدين التلقائي', desc: 'اضغط وعدّن النقاط في كل وقت، وارابح بشكل سلبي حتى وأنت غائب.', url: '' },
  { icon: '🎮', title: 'ألعاب يومية', desc: 'العجلة، تحدي الذاكرة، والنقر السريع — العب يومياً واكسب نقاطاً إضافية.', url: '' },
  { icon: '👥', title: 'نظام الإحالة', desc: 'ادعُ أصدقاءك واكسب نسبة من أرباحهم. كلما دعوت أكثر، ربحت أكثر.', url: '' },
  { icon: '🛡️', title: 'الفِرَق', desc: 'أنشئ فرقتك أو انضم لفرقة وتنافس على قائمة أفضل الفِرَق عالمياً.', url: '' },
  { icon: '💎', title: 'عملة SKX', desc: 'حوّل نقاطك إلى عملة SKX القابلة للسحب وشارك في نظام البكسلات.', url: '' },
];

export function AdminSettings() {
  const [values, setValues] = useState<AdminSettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [settingUpWebhook, setSettingUpWebhook] = useState(false);
  const [adsFeatures, setAdsFeatures] = useState<AdsFeature[]>(DEFAULT_FEATURES);
  const [adsLinks, setAdsLinks] = useState<AdsLink[]>([]);

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
      .then((v) => {
        setValues(v);
        try {
          const raw = v.adsPageFeatures;
          if (typeof raw === "string" && raw.trim()) {
            const parsed = JSON.parse(raw) as AdsFeature[];
            if (Array.isArray(parsed)) setAdsFeatures(parsed.map(f => ({ icon: f.icon ?? '', title: f.title ?? '', desc: f.desc ?? '', url: f.url ?? '' })));
          } else if (Array.isArray(raw)) {
            setAdsFeatures((raw as AdsFeature[]).map(f => ({ icon: f.icon ?? '', title: f.title ?? '', desc: f.desc ?? '', url: f.url ?? '' })));
          }
        } catch { /* keep defaults */ }
        try {
          const raw = v.adsPageExtraLinks;
          if (typeof raw === "string" && raw.trim()) {
            const parsed = JSON.parse(raw) as AdsLink[];
            if (Array.isArray(parsed)) setAdsLinks(parsed.map(l => ({ label: l.label ?? '', url: l.url ?? '', icon: l.icon ?? '' })));
          } else if (Array.isArray(raw)) {
            setAdsLinks((raw as AdsLink[]).map(l => ({ label: l.label ?? '', url: l.url ?? '', icon: l.icon ?? '' })));
          }
        } catch { /* keep defaults */ }
      })
      .finally(() => setLoading(false));
  }, []);

  const [jsonErrors, setJsonErrors] = useState<Record<string, boolean>>({});

  async function saveAll() {
    setSaving(true);
    setSaved(false);
    try {
      // JSON fields are edited as raw text but must be stored as real JSON
      // (the settings table is jsonb and the server expects an array).
      const payload: AdminSettingsMap = { ...values };
      const errors: Record<string, boolean> = {};
      for (const section of SECTIONS) {
        for (const field of section.fields) {
          if (field.type !== "json") continue;
          const raw = payload[field.key];
          if (typeof raw === "string" && raw.trim() !== "") {
            try {
              const parsed = JSON.parse(raw);
              // pixelPriceTiers must be a non-empty array of {upTo, price}
              // with positive numbers — the server silently ignores anything
              // else (Array.isArray check), which would confuse admins.
              if (field.key === "pixelPriceTiers") {
                const valid =
                  Array.isArray(parsed) &&
                  parsed.length > 0 &&
                  parsed.every(
                    (t) =>
                      t &&
                      typeof t === "object" &&
                      typeof t.upTo === "number" &&
                      typeof t.price === "number" &&
                      t.upTo > 0 &&
                      t.price > 0,
                  );
                if (!valid) {
                  errors[field.key] = true;
                  continue;
                }
              }
              payload[field.key] = parsed;
            } catch {
              errors[field.key] = true;
            }
          }
        }
      }
      setJsonErrors(errors);
      if (Object.keys(errors).length > 0) {
        setSaving(false);
        return;
      }
      payload.adsPageFeatures = adsFeatures.map(f => ({ icon: f.icon, title: f.title, desc: f.desc, url: f.url || null }));
      payload.adsPageExtraLinks = adsLinks.map(l => ({ label: l.label, url: l.url, icon: l.icon || null }));
      const updated = await adminApi.updateSettings(payload);
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
                checked={values[t.key] === undefined ? Boolean(t.defaultOn) : Boolean(values[t.key])}
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
      {/* ── المهام اليومية (شيفرة + كومبو) ── */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3">المهام اليومية</h3>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">كلمة الشيفرة اليومية (بالإنجليزية، حروف كبيرة — مثال: BOSS)</span>
            <Input
              type="text"
              data-testid="input-setting-dailyCipherWord"
              value={(values['dailyCipherWord'] as string) ?? 'BOSS'}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, dailyCipherWord: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))
              }
              placeholder="BOSS"
              dir="ltr"
              maxLength={10}
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">الكومبو اليومي — اختر 3 أيقونات</span>
            <div className="flex gap-2 flex-wrap">
              {COMBO_ICON_OPTIONS.map(({ id, icon: Icon, label }) => {
                const currentCombo: string[] = (() => {
                  try { return JSON.parse((values['dailyComboIds'] as string) || '["star","globe","gem"]'); }
                  catch { return ['star', 'globe', 'gem']; }
                })();
                const selected = currentCombo.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    title={label}
                    onClick={() => {
                      const combo: string[] = (() => {
                        try { return JSON.parse((values['dailyComboIds'] as string) || '["star","globe","gem"]'); }
                        catch { return ['star', 'globe', 'gem']; }
                      })();
                      let next: string[];
                      if (combo.includes(id)) {
                        next = combo.filter((x) => x !== id);
                      } else if (combo.length < 3) {
                        next = [...combo, id];
                      } else {
                        next = combo;
                      }
                      setValues((prev) => ({ ...prev, dailyComboIds: JSON.stringify(next) }));
                    }}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-colors ${
                      selected
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="text-[10px]">{label}</span>
                  </button>
                );
              })}
            </div>
            <span className="text-[11px] text-muted-foreground">
              محدد: {(() => {
                try { return (JSON.parse((values['dailyComboIds'] as string) || '["star","globe","gem"]') as string[]).join(', ') || 'لا شيء'; }
                catch { return 'خطأ في JSON'; }
              })()} {' '}{(() => {
                try { const c = JSON.parse((values['dailyComboIds'] as string) || '["star","globe","gem"]'); return c.length === 3 ? '✓' : `(${c.length}/3)`; }
                catch { return ''; }
              })()}
            </span>
          </div>
        </div>
      </div>

      {/* ── محرر بطاقات ميزات /adspage ── */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">صفحة الإعلانات — بطاقات الميزات</h3>
          <button
            type="button"
            onClick={() => setAdsFeatures(f => [...f, { icon: '⭐', title: '', desc: '', url: '' }])}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded-lg px-2 py-1"
          >
            <Plus className="w-3 h-3" /> إضافة بطاقة
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {adsFeatures.map((f, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  value={f.icon}
                  onChange={e => setAdsFeatures(arr => arr.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))}
                  placeholder="إيموجي"
                  className="w-16 text-center"
                />
                <Input
                  value={f.title}
                  onChange={e => setAdsFeatures(arr => arr.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                  placeholder="العنوان"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setAdsFeatures(arr => arr.filter((_, j) => j !== i))}
                  className="text-red-400 hover:text-red-300 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <textarea
                rows={2}
                value={f.desc}
                onChange={e => setAdsFeatures(arr => arr.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))}
                placeholder="الوصف"
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                dir="rtl"
              />
              <Input
                value={f.url}
                onChange={e => setAdsFeatures(arr => arr.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                placeholder="رابط (اختياري — اتركه فارغاً إذا لا تريد رابطاً)"
                dir="ltr"
              />
            </div>
          ))}
          {adsFeatures.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد بطاقات — اضغط "إضافة بطاقة" لإنشاء أول ميزة</p>
          )}
        </div>
      </div>

      {/* ── محرر روابط إضافية /adspage ── */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">صفحة الإعلانات — روابط إضافية</h3>
          <button
            type="button"
            onClick={() => setAdsLinks(l => [...l, { label: '', url: '', icon: '' }])}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded-lg px-2 py-1"
          >
            <Plus className="w-3 h-3" /> إضافة رابط
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {adsLinks.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={l.icon}
                onChange={e => setAdsLinks(arr => arr.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))}
                placeholder="🔗"
                className="w-14 text-center"
              />
              <Input
                value={l.label}
                onChange={e => setAdsLinks(arr => arr.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                placeholder="نص الزر"
                className="flex-1"
              />
              <Input
                value={l.url}
                onChange={e => setAdsLinks(arr => arr.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                placeholder="https://..."
                className="flex-1"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setAdsLinks(arr => arr.filter((_, j) => j !== i))}
                className="text-red-400 hover:text-red-300 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {adsLinks.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">لا توجد روابط — اضغط "إضافة رابط" لإضافة زر رابط</p>
          )}
        </div>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.title} className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-sm font-bold text-white mb-3">{section.title}</h3>
          <div className="flex flex-col gap-3">
            {section.fields.map((field) => (
              <label key={field.key} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{field.label}</span>
                {field.type === "textarea" || field.type === "json" ? (
                  <>
                    <textarea
                      rows={4}
                      data-testid={`input-setting-${field.key}`}
                      value={
                        typeof values[field.key] === "string"
                          ? (values[field.key] as string)
                          : values[field.key] !== undefined && values[field.key] !== null
                            ? JSON.stringify(values[field.key])
                            : (field.defaultValue as string)
                      }
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                      dir={field.type === "json" ? "ltr" : "auto"}
                    />
                    {field.type === "json" && jsonErrors[field.key] && (
                      <span className="text-[11px] text-red-400">صيغة JSON غير صحيحة — لم يتم الحفظ</span>
                    )}
                  </>
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
