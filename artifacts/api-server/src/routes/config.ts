import { Router, type IRouter } from "express";
import { GetPublicConfigResponse } from "@workspace/api-zod";
import { getSettingsMap, asString, asNumber } from "../lib/settings";

const router: IRouter = Router();

router.get("/config/public", async (_req, res): Promise<void> => {
  const settings = await getSettingsMap();

  const cpaUrl = asString(settings.cpaOfferwallUrl);
  const monlixUrl = asString(settings.monlixOfferwallUrl);
  const bitlabsUrl = asString(settings.bitlabsOfferwallUrl);
  const lootablyUrl = asString(settings.lootablyOfferwallUrl);
  const revlumUrl = asString(settings.revlumOfferwallUrl);
  const ayetstudiosUrl = asString(settings.ayetstudiosOfferwallUrl);
  const offertoroUrl = asString(settings.offertoroOfferwallUrl);
  const toroxUrl = asString(settings.toroxOfferwallUrl);
  const yandexadsUrl = asString(settings.yandexadsOfferwallUrl);
  const adsterraUrl = asString(settings.adsterraOfferwallUrl);
  const propelleradsUrl = asString(settings.propelleradsOfferwallUrl);
  const cpaleadUrl = asString(settings.cpaleadOfferwallUrl);
  const adscendmediaUrl = asString(settings.adscendmediaOfferwallUrl);
  const adgemUrl = asString(settings.adgemOfferwallUrl);
  const cpxresearchAppId = asString(settings.cpxresearchAppId);
  const cpxresearchUrl = cpxresearchAppId ? `https://offers.cpx-research.com/index.php?app_id=${cpxresearchAppId}` : "";

  const defaultTerms = `مرحباً بك في SouqratesX!\n\nبالضغط على "قبول" فإنك توافق على:\n• الاستخدام الشخصي فقط للتطبيق\n• عدم استخدام أي أدوات أو برامج تلاعب\n• أن النقاط المكتسبة قابلة للتحويل وفق الشروط المعلنة\n• حق المنصة في إيقاف أي حساب يثبت تلاعبه\n\nنجمع بياناتك الأساسية (معرّف تيليجرام) لحفظ تقدمك فقط، ولا نشاركها مع أي طرف ثالث.`;
  const defaultWelcome = `مرحباً بك في SouqratesX ⛏️\n\nاستخرج النقاط، طوّر منجمك، وحوّل جهدك إلى مكافآت حقيقية.`;

  res.json(
    GetPublicConfigResponse.parse({
      botMessages: {
        termsText: asString(settings.appTermsText) || defaultTerms,
        welcomeText: asString(settings.appWelcomeText) || defaultWelcome,
      },
      adsgram: {
        enabled: Boolean(asString(settings.adsgramBlockId)),
        blockId: asString(settings.adsgramBlockId) || null,
        bannerBlockId: asString(settings.adsgramBannerBlockId) || null,
        rewardPoints: asNumber(settings.adsgramRewardPoints, 100),
        cooldownSeconds: asNumber(settings.adsgramCooldownSeconds, 30),
        dailyCap: asNumber(settings.adsgramDailyCap, 20),
      },
      monetag: {
        enabled: Boolean(asString(settings.monetagZoneId)),
        zoneId: asString(settings.monetagZoneId) || null,
        rewardPoints: asNumber(settings.monetagRewardPoints, 100),
        cooldownSeconds: asNumber(settings.monetagCooldownSeconds, 30),
        dailyCap: asNumber(settings.monetagDailyCap, 20),
      },
      offerwalls: [
        {
          id: "cpa",
          name: "CPA Offerwall",
          url: cpaUrl || null,
          enabled: Boolean(cpaUrl && asString(settings.cpaApiKey)),
        },
        {
          id: "monlix",
          name: "Monlix Surveys",
          url: monlixUrl || null,
          enabled: Boolean(monlixUrl && asString(settings.monlixApiKey)),
        },
        {
          id: "bitlabs",
          name: "Bitlabs Surveys",
          url: bitlabsUrl || null,
          enabled: Boolean(bitlabsUrl && asString(settings.bitlabsApiKey)),
        },
        {
          id: "lootably",
          name: "Lootably",
          url: lootablyUrl || null,
          enabled: Boolean(lootablyUrl && asString(settings.lootablyApiKey)),
        },
        {
          id: "revlum",
          name: "Revlum",
          url: revlumUrl || null,
          enabled: Boolean(revlumUrl && asString(settings.revlumApiKey)),
        },
        {
          id: "ayetstudios",
          name: "AyeT-Studios",
          url: ayetstudiosUrl || null,
          enabled: Boolean(ayetstudiosUrl && asString(settings.ayetstudiosApiKey)),
        },
        {
          id: "offertoro",
          name: "OfferToro",
          url: offertoroUrl || null,
          enabled: Boolean(offertoroUrl && asString(settings.offertoroApiKey)),
        },
        {
          id: "torox",
          name: "Torox",
          url: toroxUrl || null,
          enabled: Boolean(toroxUrl && asString(settings.toroxApiKey)),
        },
        {
          id: "yandexads",
          name: "Yandex Ads",
          url: yandexadsUrl || null,
          enabled: Boolean(yandexadsUrl && asString(settings.yandexadsApiKey)),
        },
        {
          id: "adsterra",
          name: "Adsterra",
          url: adsterraUrl || null,
          enabled: Boolean(adsterraUrl && asString(settings.adsterraApiKey)),
        },
        {
          id: "propellerads",
          name: "PropellerAds",
          url: propelleradsUrl || null,
          enabled: Boolean(propelleradsUrl && asString(settings.propelleradsApiKey)),
        },
        {
          id: "cpalead",
          name: "CPALead",
          url: cpaleadUrl || null,
          enabled: Boolean(cpaleadUrl && asString(settings.cpaleadApiKey)),
        },
        {
          id: "adscendmedia",
          name: "Adscend Media",
          url: adscendmediaUrl || null,
          enabled: Boolean(adscendmediaUrl && asString(settings.adscendmediaApiKey)),
        },
        {
          id: "adgem",
          name: "AdGem",
          url: adgemUrl || null,
          enabled: Boolean(adgemUrl && asString(settings.adgemPostbackSecret)),
        },
        {
          id: "cpxresearch",
          name: "CPX Research",
          url: cpxresearchUrl || null,
          enabled: Boolean(cpxresearchAppId && asString(settings.cpxresearchSecureHash)),
        },
      ],
      exoclick: {
        enabled: Boolean(asString(settings.exoclickZoneId) && asString(settings.exoclickInsClass)),
        zoneId: asString(settings.exoclickZoneId) || null,
        insClass: asString(settings.exoclickInsClass) || null,
      },
      stars: {
        enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      },
    }),
  );
});

export default router;
