import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, starProductsTable } from "@workspace/db";
import { CreateStarsInvoiceBody, CreateStarsInvoiceResponse, GetStoreProductsResponse } from "@workspace/api-zod";
import { getSessionTelegramId } from "../lib/session";
import { createStarsInvoiceLink, isTelegramBotConfigured } from "../lib/telegramBot";

const router: IRouter = Router();

router.get("/store/products", async (req, res): Promise<void> => {
  // Public endpoint — no auth required to browse the product catalogue.
  // Auth is only enforced at purchase time (/stars/invoice).
  const rows = await db
    .select()
    .from(starProductsTable)
    .where(eq(starProductsTable.isActive, true))
    .orderBy(starProductsTable.sortOrder, starProductsTable.priceStars);

  res.json(
    GetStoreProductsResponse.parse(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        titleAr: row.titleAr,
        description: row.description,
        descriptionAr: row.descriptionAr,
        imageUrl: row.imageUrl,
        priceStars: row.priceStars,
        effectType: row.effectType,
        effectValue: row.effectValue,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
        benefitsBullets: row.benefitsBullets,
        benefitsBulletsAr: row.benefitsBulletsAr,
        createdAt: row.createdAt.toISOString(),
      })),
    ),
  );
});

router.post("/stars/invoice", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (!isTelegramBotConfigured()) {
    res.status(400).json({ error: "Telegram Stars purchases are not configured" });
    return;
  }

  const parsed = CreateStarsInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db.select().from(starProductsTable).where(eq(starProductsTable.id, parsed.data.productId));
  if (!product || !product.isActive) {
    res.status(400).json({ error: "Unknown product" });
    return;
  }

  const payload = JSON.stringify({ telegramId, productId: product.id });

  try {
    const invoiceUrl = await createStarsInvoiceLink({
      title: product.title,
      description: product.description ?? product.title,
      payload,
      amountStars: product.priceStars,
    });

    res.json(CreateStarsInvoiceResponse.parse({ invoiceUrl, priceStars: product.priceStars }));
  } catch (err) {
    req.log.error({ err }, "Failed to create Telegram Stars invoice");
    res.status(400).json({ error: "Failed to create invoice, check TELEGRAM_BOT_TOKEN" });
  }
});

// ── Stack Tower: continue invoice (10 XTR) ────────────────────────────────────
router.post("/games/stack/continue-invoice", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }

  if (!isTelegramBotConfigured()) {
    res.status(400).json({ error: "Stars purchases not configured" });
    return;
  }

  try {
    const invoiceUrl = await createStarsInvoiceLink({
      title:        "Stack Tower — Continue",
      description:  "Resume your game from the current floor",
      payload:      JSON.stringify({ telegramId, type: "stack-continue" }),
      amountStars:  10,
    });
    res.json({ invoiceUrl, priceStars: 10 });
  } catch (err) {
    req.log.error({ err }, "Failed to create stack continue invoice");
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

// ── Color Switch: continue invoice ────────────────────────────────────────────
router.post("/games/colorswitch/continue-invoice", async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (!isTelegramBotConfigured()) { res.status(400).json({ error: "Stars purchases not configured" }); return; }
  try {
    const invoiceUrl = await createStarsInvoiceLink({
      title:       "Color Switch — Continue",
      description: "Resume your run from the current score",
      payload:     JSON.stringify({ telegramId, type: "colorswitch-continue" }),
      amountStars: 10,
    });
    res.json({ invoiceUrl, priceStars: 10 });
  } catch (err) {
    req.log.error({ err }, "Failed to create colorswitch continue invoice");
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

export default router;
