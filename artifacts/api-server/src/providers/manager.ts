import { db, providersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { createAdsgramProvider } from "./adsgram";
import { createMonetagProvider } from "./monetag";
import { createCpxResearchProvider } from "./cpxResearch";
import { createOfferwallProvider } from "./offerwall";
import type { EarnOffer, EarnProvider, ProviderContext } from "./types";

const REGISTRY: EarnProvider[] = [
  createAdsgramProvider(),
  createMonetagProvider(),
  createCpxResearchProvider(),
  createOfferwallProvider("cpa", "\u0639\u0631\u0648\u0636 CPA"),
  createOfferwallProvider("monlix", "Monlix"),
  createOfferwallProvider("bitlabs", "Bitlabs"),
  createOfferwallProvider("lootably", "Lootably"),
  createOfferwallProvider("revlum", "Revlum"),
  createOfferwallProvider("ayetstudios", "AyeT-Studios"),
  createOfferwallProvider("offertoro", "OfferToro"),
  createOfferwallProvider("torox", "Torox"),
  createOfferwallProvider("yandexads", "Yandex Ads"),
  createOfferwallProvider("adsterra", "Adsterra"),
  createOfferwallProvider("propellerads", "PropellerAds"),
  createOfferwallProvider("cpalead", "CPALead"),
  createOfferwallProvider("adscendmedia", "Adscend Media"),
];

const providersByKey = new Map<string, EarnProvider>(REGISTRY.map((p) => [p.key, p]));

let loaded = false;

/**
 * Loads provider rows from the DB and (re)initializes each in-memory provider
 * instance with its stored config. Safe to call repeatedly (e.g. after an
 * admin settings change) to hot-reload config without a restart.
 */
export async function loadProviders(): Promise<void> {
  const rows = await db.select().from(providersTable);
  const byKey = new Map(rows.map((r) => [r.key, r]));

  for (const provider of REGISTRY) {
    const row = byKey.get(provider.key);
    const config = (row?.config as Record<string, unknown>) ?? {};
    provider.initialize(row?.enabled ? config : {});
  }
  loaded = true;
  logger.info({ providers: REGISTRY.map((p) => ({ key: p.key, enabled: p.isEnabled() })) }, "Providers loaded");
}

export function getProvider(key: string): EarnProvider | undefined {
  return providersByKey.get(key);
}

export function listProviders(): EarnProvider[] {
  return REGISTRY;
}

export async function ensureLoaded(): Promise<void> {
  if (!loaded) await loadProviders();
}

/** Aggregated, unified offer list across every enabled provider. */
export async function getUnifiedOffers(ctx: ProviderContext): Promise<EarnOffer[]> {
  await ensureLoaded();
  const results = await Promise.all(
    REGISTRY.filter((p) => p.isEnabled()).map(async (p) => {
      try {
        return await p.getOffers(ctx);
      } catch (err) {
        logger.error({ err, provider: p.key }, "Provider getOffers failed");
        return [];
      }
    }),
  );
  return results.flat();
}

/**
 * Upserts the `providers` table config from the flat `admin_settings` keys
 * (the same keys the `/manager` Settings tab already writes to), so admins
 * keep using the existing settings UI and providers auto-activate the moment
 * real keys are saved — no separate provider-admin UI needed yet (Phase 5).
 * Call this both at boot and after every `PUT /admin/settings`.
 */
export async function syncProvidersFromSettings(settings: Record<string, unknown>): Promise<void> {
  const asStr = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
  const asNum = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

  const seeds: { key: string; name: string; type: "rewarded_ad" | "offerwall"; config: Record<string, unknown> }[] = [
    {
      key: "adsgram",
      name: "Adsgram",
      type: "rewarded_ad",
      config: {
        blockId: asStr(settings["adsgramBlockId"]),
        rewardPoints: asNum(settings["adsgramRewardPoints"], 100),
        cooldownSeconds: asNum(settings["adsgramCooldownSeconds"], 30),
        dailyCap: asNum(settings["adsgramDailyCap"], 20),
        postbackSecret: asStr(settings["adsgramPostbackSecret"]),
      },
    },
    {
      key: "cpa",
      name: "CPA Offerwall",
      type: "offerwall",
      config: { apiKey: asStr(settings["cpaApiKey"]), url: asStr(settings["cpaOfferwallUrl"]), postbackSecret: asStr(settings["cpaPostbackSecret"]) },
    },
    {
      key: "monlix",
      name: "Monlix",
      type: "offerwall",
      config: { apiKey: asStr(settings["monlixApiKey"]), url: asStr(settings["monlixOfferwallUrl"]), postbackSecret: asStr(settings["monlixPostbackSecret"]) },
    },
    {
      key: "bitlabs",
      name: "Bitlabs",
      type: "offerwall",
      config: { apiKey: asStr(settings["bitlabsApiKey"]), url: asStr(settings["bitlabsOfferwallUrl"]), postbackSecret: asStr(settings["bitlabsPostbackSecret"]) },
    },
    {
      key: "lootably",
      name: "Lootably",
      type: "offerwall",
      config: {
        apiKey: asStr(settings["lootablyApiKey"]),
        url: asStr(settings["lootablyOfferwallUrl"]),
        postbackSecret: asStr(settings["lootablyPostbackSecret"]),
      },
    },
    {
      key: "revlum",
      name: "Revlum",
      type: "offerwall",
      config: {
        apiKey: asStr(settings["revlumApiKey"]),
        url: asStr(settings["revlumOfferwallUrl"]),
        postbackSecret: asStr(settings["revlumPostbackSecret"]),
      },
    },
    {
      key: "ayetstudios",
      name: "AyeT-Studios",
      type: "offerwall",
      config: {
        apiKey: asStr(settings["ayetstudiosApiKey"]),
        url: asStr(settings["ayetstudiosOfferwallUrl"]),
        postbackSecret: asStr(settings["ayetstudiosPostbackSecret"]),
      },
    },
    {
      key: "offertoro",
      name: "OfferToro",
      type: "offerwall",
      config: {
        apiKey: asStr(settings["offertoroApiKey"]),
        url: asStr(settings["offertoroOfferwallUrl"]),
        postbackSecret: asStr(settings["offertoroPostbackSecret"]),
      },
    },
    {
      key: "torox",
      name: "Torox",
      type: "offerwall",
      config: {
        apiKey: asStr(settings["toroxApiKey"]),
        url: asStr(settings["toroxOfferwallUrl"]),
        postbackSecret: asStr(settings["toroxPostbackSecret"]),
      },
    },
    {
      key: "yandexads",
      name: "Yandex Ads",
      type: "offerwall",
      config: {
        apiKey: asStr(settings["yandexadsApiKey"]),
        url: asStr(settings["yandexadsOfferwallUrl"]),
        postbackSecret: asStr(settings["yandexadsPostbackSecret"]),
      },
    },
    {
      key: "adsterra",
      name: "Adsterra",
      type: "offerwall",
      config: {
        apiKey: asStr(settings["adsterraApiKey"]),
        url: asStr(settings["adsterraOfferwallUrl"]),
        postbackSecret: asStr(settings["adsterraPostbackSecret"]),
      },
    },
    {
      key: "propellerads",
      name: "PropellerAds",
      type: "offerwall",
      config: {
        apiKey: asStr(settings["propelleradsApiKey"]),
        url: asStr(settings["propelleradsOfferwallUrl"]),
        postbackSecret: asStr(settings["propelleradsPostbackSecret"]),
      },
    },
    {
      key: "cpalead",
      name: "CPALead",
      type: "offerwall",
      config: {
        apiKey: asStr(settings["cpaleadApiKey"]),
        url: asStr(settings["cpaleadOfferwallUrl"]),
        postbackSecret: asStr(settings["cpaleadPostbackSecret"]),
      },
    },
    {
      key: "monetag",
      name: "Monetag",
      type: "rewarded_ad",
      config: {
        zoneId: asStr(settings["monetagZoneId"]),
        rewardPoints: asNum(settings["monetagRewardPoints"], 100),
        cooldownSeconds: asNum(settings["monetagCooldownSeconds"], 30),
        dailyCap: asNum(settings["monetagDailyCap"], 20),
      },
    },
    {
      key: "adscendmedia",
      name: "Adscend Media",
      type: "offerwall",
      config: {
        apiKey: asStr(settings["adscendmediaApiKey"]),
        url: asStr(settings["adscendmediaOfferwallUrl"]),
        postbackSecret: asStr(settings["adscendmediaPostbackSecret"]),
      },
    },
    {
      key: "cpxresearch",
      name: "CPX Research",
      type: "offerwall",
      config: {
        appId: asStr(settings["cpxresearchAppId"]),
        secureHash: asStr(settings["cpxresearchSecureHash"]),
      },
    },
  ];

  for (const seed of seeds) {
    const enabled =
      seed.type === "rewarded_ad"
        ? Boolean((seed.config["blockId"] as string) || (seed.config["zoneId"] as string) || "")
        : seed.key === "cpxresearch"
          ? Boolean((seed.config["appId"] as string) && (seed.config["secureHash"] as string))
          : Boolean((seed.config["url"] as string) || "");
    await db
      .insert(providersTable)
      .values({ key: seed.key, name: seed.name, type: seed.type, enabled, priority: 0, config: seed.config })
      .onConflictDoUpdate({
        target: providersTable.key,
        set: { config: seed.config, enabled },
      });
  }

  await loadProviders();
}
