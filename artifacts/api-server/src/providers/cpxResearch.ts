import { createHash } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, vaultUsersTable, rewardTransactionsTable } from "@workspace/db";
import type { EarnOffer, EarnProvider, HealthCheckResult, ProviderContext, RewardResult, RewardVerifyInput } from "./types";

interface CpxResearchConfig {
  appId: string;
  secureHash: string;
}

function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/**
 * CPX Research survey wall. Unlike the generic offerwall factory (shared
 * postback secret), CPX signs each postback with an MD5 hash of
 * `trans_id + secureHash` instead of sending the secret directly — so it
 * can't reuse `createOfferwallProvider`. Also supports reversals (status=2)
 * for disqualified/chargeback surveys, which no other provider needs yet.
 */
export function createCpxResearchProvider(): EarnProvider {
  let config: CpxResearchConfig = { appId: "", secureHash: "" };
  let enabled = false;

  return {
    key: "cpxresearch",
    type: "offerwall",

    initialize(rawConfig) {
      config = {
        appId: asStr(rawConfig["appId"]),
        secureHash: asStr(rawConfig["secureHash"]),
      };
      enabled = config.appId.length > 0 && config.secureHash.length > 0;
    },

    isEnabled() {
      return enabled;
    },

    async getOffers(ctx: ProviderContext): Promise<EarnOffer[]> {
      if (!enabled) return [];
      const url = `https://offers.cpx-research.com/index.php?app_id=${encodeURIComponent(config.appId)}&ext_user_id=${encodeURIComponent(ctx.telegramId)}&username=${encodeURIComponent(ctx.telegramId)}`;
      return [{ providerKey: "cpxresearch", type: "offerwall", title: "CPX Research", rewardPoints: 0, url }];
    },

    async verifyReward(input: RewardVerifyInput) {
      const raw = input.raw;
      const status = asStr(raw["status"]);
      const transId = asStr(raw["trans_id"]);
      const receivedHash = asStr(raw["hash"]);
      const amountLocal = Number(raw["amount_local"]);

      if (!transId || !receivedHash) {
        return { verified: false, amount: 0, txId: transId || "unknown", reason: "Missing trans_id or hash" };
      }

      const expectedHash = createHash("md5").update(`${transId}${config.secureHash}`).digest("hex");
      if (expectedHash !== receivedHash) {
        return { verified: false, amount: 0, txId: transId, reason: "Invalid postback secret" };
      }

      if (status === "2") {
        // Reversal (disqualified/chargeback survey) — reverse the original credit.
        const [original] = await db
          .select()
          .from(rewardTransactionsTable)
          .where(and(eq(rewardTransactionsTable.providerKey, "cpxresearch"), eq(rewardTransactionsTable.txId, transId)))
          .limit(1);

        if (!original || original.status !== "credited") {
          return { verified: false, amount: 0, txId: `${transId}-reversal`, reason: "No matching credited transaction to reverse" };
        }

        return { verified: true, amount: -original.amount, txId: `${transId}-reversal` };
      }

      if (!Number.isFinite(amountLocal) || amountLocal <= 0) {
        return { verified: false, amount: 0, txId: transId, reason: "Invalid amount_local" };
      }

      return { verified: true, amount: Math.round(amountLocal), txId: transId };
    },

    async rewardUser(telegramId: string, amount: number, _txId: string): Promise<RewardResult> {
      const [updated] = await db
        .update(vaultUsersTable)
        .set({ lifetimePoints: sql`greatest(0, ${vaultUsersTable.lifetimePoints} + ${amount})` })
        .where(and(eq(vaultUsersTable.telegramId, telegramId), eq(vaultUsersTable.isBanned, false)))
        .returning();

      if (!updated) {
        return { ok: false, creditedPoints: 0, lifetimePoints: 0, reason: "Unknown or banned user" };
      }
      return { ok: true, creditedPoints: amount, lifetimePoints: updated.lifetimePoints };
    },

    async healthCheck(): Promise<HealthCheckResult> {
      const start = Date.now();
      return { healthy: enabled, latencyMs: Date.now() - start, message: enabled ? undefined : "Not configured" };
    },
  };
}
