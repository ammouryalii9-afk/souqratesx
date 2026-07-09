import { Router, type IRouter } from "express";
import { GetPublicConfigResponse } from "@workspace/api-zod";
import { getSettingsMap, asString, asNumber } from "../lib/settings";

const router: IRouter = Router();

router.get("/config/public", async (_req, res): Promise<void> => {
  const settings = await getSettingsMap();

  const cpaUrl = asString(settings.cpaOfferwallUrl);
  const monlixUrl = asString(settings.monlixOfferwallUrl);
  const bitlabsUrl = asString(settings.bitlabsOfferwallUrl);

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
      ],
      stars: {
        enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      },
    }),
  );
});

export default router;
