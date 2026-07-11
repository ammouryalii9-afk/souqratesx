import { showAdsgramRewardedAd } from "./adsgram";
import { showMonetagRewardedAd } from "./monetag";
import type { PublicConfig } from "./gameApi";

export type AdProvider = "adsgram" | "monetag";

/**
 * Returns true when the error from an ad SDK means "no ad available right now"
 * (as opposed to the user intentionally dismissing the ad).
 */
function isNoFillError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  // Adsgram SDK rejects with { type: 'no_fill' } when inventory is empty
  if (e.type === "no_fill" || e.type === "NO_FILL") return true;
  if (typeof e.message === "string") {
    const msg = e.message.toLowerCase();
    return (
      msg.includes("no_fill") ||
      msg.includes("no fill") ||
      msg.includes("no ad") ||
      msg.includes("not available") ||
      msg.includes("unavailable") ||
      msg.includes("sdk unavailable")
    );
  }
  return false;
}

/**
 * Tries Adsgram first; if no ad is available (no-fill error), falls back to
 * Monetag automatically. Returns which provider actually served the ad so the
 * caller can claim the correct reward.
 *
 * Throws (does NOT fall back) when the user intentionally dismisses the ad.
 */
export async function watchRewardedAdWithFallback(
  config: PublicConfig | null,
): Promise<AdProvider> {
  const adsgramReady = config?.adsgram.enabled && config.adsgram.blockId;
  const monetagReady = config?.monetag.enabled && config.monetag.zoneId;

  if (adsgramReady) {
    try {
      await showAdsgramRewardedAd(config!.adsgram.blockId as string);
      return "adsgram";
    } catch (err) {
      if (isNoFillError(err) && monetagReady) {
        // Adsgram has no inventory — silently try Monetag
        await showMonetagRewardedAd(config!.monetag.zoneId as string);
        return "monetag";
      }
      // User dismissed or real SDK error — rethrow
      throw err;
    }
  }

  if (monetagReady) {
    await showMonetagRewardedAd(config!.monetag.zoneId as string);
    return "monetag";
  }

  throw new Error("No ad provider is available right now");
}
