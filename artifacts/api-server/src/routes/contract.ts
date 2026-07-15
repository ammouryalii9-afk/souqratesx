import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import crypto from "node:crypto";
import { db, contractSignaturesTable, adminSettingsTable } from "@workspace/db";
import { getSessionTelegramId, isAdminSession } from "../lib/session";
import { getSettingsMap, asString, bustSettingsCache } from "../lib/settings";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

const CONTRACT_KEYS = [
  "contractBotName",
  "contractBotLogoUrl",
  "contractText",
  "contractParty2Obligations",
  "contractPublicationPage",
];

// ── Public: get contract content ──────────────────────────────────────────────

router.get("/contract/settings", async (req, res): Promise<void> => {
  const settings = await getSettingsMap();
  res.json({
    botName: asString(settings.contractBotName) || "SouqratesX",
    botLogoUrl: asString(settings.contractBotLogoUrl) || "",
    contractText: asString(settings.contractText) || "",
    party2Obligations: asString(settings.contractParty2Obligations) || "",
    publicationPage: asString(settings.contractPublicationPage) || "",
  });
});

// ── Authenticated: sign the contract ──────────────────────────────────────────

router.post("/contract/sign", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);

  const { name, age, country, signatureDataUrl } = req.body as Record<string, unknown>;

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const ageNum = Number(age);
  if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
    res.status(400).json({ error: "valid age required" });
    return;
  }
  if (!country || typeof country !== "string" || !country.trim()) {
    res.status(400).json({ error: "country required" });
    return;
  }
  if (!signatureDataUrl || typeof signatureDataUrl !== "string" || !signatureDataUrl.startsWith("data:image/")) {
    res.status(400).json({ error: "signature required" });
    return;
  }

  const settings = await getSettingsMap();
  const contractText = asString(settings.contractText);
  const contractVersion = crypto.createHash("sha256").update(contractText).digest("hex").slice(0, 12);

  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? null;

  const [row] = await db
    .insert(contractSignaturesTable)
    .values({
      telegramId: telegramId ?? null,
      name: name.trim(),
      age: ageNum,
      country: country.trim(),
      signatureDataUrl,
      contractVersion,
      ipAddress: ip,
    })
    .returning({ id: contractSignaturesTable.id });

  res.json({ ok: true, id: row?.id });
});

// ── Admin: list signatures ─────────────────────────────────────────────────────

router.get("/admin/contract-signatures", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Not admin" }); return; }

  const rows = await db
    .select()
    .from(contractSignaturesTable)
    .orderBy(desc(contractSignaturesTable.signedAt))
    .limit(200);

  res.json(rows.map((r) => ({
    id: r.id,
    telegramId: r.telegramId,
    name: r.name,
    age: r.age,
    country: r.country,
    signatureDataUrl: r.signatureDataUrl,
    contractVersion: r.contractVersion,
    ipAddress: r.ipAddress,
    signedAt: r.signedAt.toISOString(),
  })));
});

router.delete("/admin/contract-signatures/:id", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Not admin" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(contractSignaturesTable).where(eq(contractSignaturesTable.id, id));
  res.json({ ok: true });
});

// ── Admin: update contract settings ───────────────────────────────────────────

router.put("/admin/contract-settings", async (req, res): Promise<void> => {
  if (!isAdminSession(req as never)) { res.status(401).json({ error: "Not admin" }); return; }

  const body = req.body as Record<string, unknown>;
  const allowed: Record<string, string> = {
    botName: "contractBotName",
    botLogoUrl: "contractBotLogoUrl",
    contractText: "contractText",
    party2Obligations: "contractParty2Obligations",
    publicationPage: "contractPublicationPage",
  };

  const writes: Promise<unknown>[] = [];
  for (const [field, key] of Object.entries(allowed)) {
    if (typeof body[field] === "string") {
      writes.push(
        db
          .insert(adminSettingsTable)
          .values({ key, value: sql`${body[field]}::jsonb` })
          .onConflictDoUpdate({ target: adminSettingsTable.key, set: { value: sql`excluded.value` } }),
      );
    }
  }
  await Promise.all(writes);
  bustSettingsCache();
  res.json({ ok: true });
});

export default router;
