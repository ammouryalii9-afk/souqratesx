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

  res.json(
    GetPublicConfigResponse.parse({
      adsgram: {
        enabled: Boolean(asString(settings.adsgramBlockId)),
        blockId: asString(settings.adsgramBlockId) || null,
        rewardPoints: asNumber(settings.adsgramRewardPoints, 100),
        cooldownSeconds: asNumber(settings.adsgramCooldownSeconds, 30),
        dailyCap: asNumber(settings.adsgramDailyCap, 20),
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
      ],
      stars: {
        enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      },
    }),
  );
});

export default router;
