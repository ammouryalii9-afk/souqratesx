import { Router, type IRouter } from "express";
import { GetPublicConfigResponse } from "@workspace/api-zod";
import { getSettingsMap, asString, asNumber } from "../lib/settings";

const router: IRouter = Router();

let cachedBotUsername: string | null = null;
let botUsernamePromise: Promise<string | null> | null = null;

async function fetchBotUsername(): Promise<string | null> {
  if (cachedBotUsername) return cachedBotUsername;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (!botUsernamePromise) {
    botUsernamePromise = fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(3000),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; result?: { username?: string } }>)
      .then((data) => {
        const username = data?.result?.username ?? null;
        if (username) cachedBotUsername = username;
        return username;
      })
      .catch(() => null)
      .finally(() => {
        botUsernamePromise = null;
      });
  }
  return botUsernamePromise;
}

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

  const defaultTerms = `By tapping "Accept" you agree to:\n• Personal use of the app only\n• No bots, scripts, or cheat tools\n• The platform may suspend accounts found cheating\n• Earned points are redeemable per the published withdrawal terms\n\nWe collect only your Telegram ID to save your progress. We never share it with third parties.`;
  const defaultWelcome = `Welcome to SouqratesX ⛏️\n\nTap to mine, upgrade your miner, and turn your effort into real rewards.`;

  res.json(
    GetPublicConfigResponse.parse({
      botMessages: {
        termsText: asString(settings.appTermsText) || defaultTerms,
        welcomeText: asString(settings.appWelcomeText) || defaultWelcome,
      },
      botUsername: await fetchBotUsername(),
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
      onclicka: {
        enabled: Boolean(asString(settings.onclickaSpotId)),
        spotId: asString(settings.onclickaSpotId) || null,
        inpageId: asString(settings.onclickaInpageId) || null,
        rewardPoints: asNumber(settings.onclickaRewardPoints, 100),
        cooldownSeconds: asNumber(settings.onclickaCooldownSeconds, 30),
        dailyCap: asNumber(settings.onclickaDailyCap, 20),
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
          enabled: Boolean(cpaleadUrl && asString(settings.cpaleadPostbackSecret)),
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
      pointsPerDollar: asNumber(settings.pointsPerDollar, 2_000_000),
      dollarBonus: asNumber(settings.dollarBonus, 0),
    }),
  );
});

export default router;
