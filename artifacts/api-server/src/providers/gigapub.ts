import { createHmac } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, vaultUsersTable, rewardTransactionsTable } from "@workspace/db";
import { skxCreditFields } from "../lib/skxCredit";
import type { EarnOffer, EarnProvider, HealthCheckResult, ProviderContext, RewardResult, RewardVerifyInput } from "./types";

interface GigaPubConfig {
  projectId: string;
  secret: string;
}

function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/**
 * GigaPub Offerwall — SDK-embedded wall (no external URL).
 * The SDK fires a `rewardClaim` event; the server verifies the hash and credits SKX.
 *
 * Postback endpoint: POST /earn/gigapub/reward
 * Payload: { userId, rewardId, amount, hash }
 * Hash verification: HMAC-SHA256(rewardId + userId + amount, secret)
 */
export function createGigaPubProvider(): EarnProvider {
  let config: GigaPubConfig = { projectId: "", secret: "" };
  let enabled = false;

  return {
    key: "gigapub",
    type: "offerwall",

    initialize(rawConfig) {
      config = {
        projectId: asStr(rawConfig["projectId"]),
        secret: asStr(rawConfig["secret"]),
      };
      enabled = config.projectId.length > 0;
    },

    isEnabled() {
      return enabled;
    },

    async getOffers(_ctx: ProviderContext): Promise<EarnOffer[]> {
      if (!enabled) return [];
      return [{
        providerKey: "gigapub",
        type: "offerwall",
        title: "GigaPub",
        rewardPoints: 0,
        url: undefined,
        meta: { projectId: config.projectId, sdkEmbedded: true },
      }];
    },

    async verifyReward(input: RewardVerifyInput) {
      const raw = input.raw;
      const rewardId = asStr(raw["rewardId"]);
      const userId   = asStr(raw["userId"]);
      const amount   = Number(raw["amount"]);
      const hash     = asStr(raw["hash"]);

      if (!rewardId || !userId || !hash) {
        return { verified: false, amount: 0, txId: rewardId || "unknown", reason: "Missing required fields" };
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        return { verified: false, amount: 0, txId: rewardId, reason: "Invalid amount" };
      }

      // Verify HMAC-SHA256 signature if secret is configured
      if (config.secret) {
        const expected = createHmac("sha256", config.secret)
          .update(`${rewardId}${userId}${amount}`)
          .digest("hex");
        if (expected !== hash) {
          return { verified: false, amount: 0, txId: rewardId, reason: "Invalid postback secret" };
        }
      }

      // Idempotency check — rewardId must be unique
      const existing = await db
        .select()
        .from(rewardTransactionsTable)
        .where(and(
          eq(rewardTransactionsTable.providerKey, "gigapub"),
          eq(rewardTransactionsTable.txId, rewardId),
        ))
        .limit(1);

      if (existing.length > 0) {
        return { verified: false, amount: 0, txId: rewardId, reason: "Already credited" };
      }

      return { verified: true, amount: Math.round(amount), txId: rewardId };
    },

    async rewardUser(telegramId: string, amount: number, _txId: string): Promise<RewardResult> {
      const [updated] = await db
        .update(vaultUsersTable)
        .set(skxCreditFields(amount))
        .where(and(eq(vaultUsersTable.telegramId, telegramId), eq(vaultUsersTable.isBanned, false)))
        .returning();

      if (!updated) {
        return { ok: false, creditedPoints: 0, lifetimePoints: 0, reason: "Unknown or banned user" };
      }
      return { ok: true, creditedPoints: amount, lifetimePoints: updated.lifetimePoints };
    },

    async healthCheck(): Promise<HealthCheckResult> {
      return { healthy: enabled, latencyMs: 0, message: enabled ? undefined : "Not configured (missing projectId)" };
    },
  };
}
