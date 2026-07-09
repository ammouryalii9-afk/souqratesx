import { Router, type IRouter } from "express";
import { CreateStarsInvoiceBody, CreateStarsInvoiceResponse } from "@workspace/api-zod";
import { getSessionTelegramId } from "../lib/session";
import { getSettingsMap, asNumber } from "../lib/settings";
import { createStarsInvoiceLink, isTelegramBotConfigured } from "../lib/telegramBot";

const router: IRouter = Router();

const PRODUCTS: Record<string, { title: string; description: string; settingsKey: string; fallbackPrice: number }> = {
  energy_refill: {
    title: "Full Energy Refill",
    description: "Instantly refill your energy to the max.",
    settingsKey: "starsEnergyRefillPriceStars",
    fallbackPrice: 30,
  },
  boost: {
    title: "Mining Boost",
    description: "Temporary mining speed boost.",
    settingsKey: "starsBoostPriceStars",
    fallbackPrice: 50,
  },
  premium_month: {
    title: "SouqratesX Premium (1 Month)",
    description: "Unlock the Premium earnings multiplier for 30 days.",
    settingsKey: "premiumMonthlyPriceStars",
    fallbackPrice: 200,
  },
};

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

  const product = PRODUCTS[parsed.data.product];
  if (!product) {
    res.status(400).json({ error: "Unknown product" });
    return;
  }

  const settings = await getSettingsMap();
  const priceStars = asNumber(settings[product.settingsKey], product.fallbackPrice);

  const payload = JSON.stringify({ telegramId, product: parsed.data.product });

  try {
    const invoiceUrl = await createStarsInvoiceLink({
      title: product.title,
      description: product.description,
      payload,
      amountStars: priceStars,
    });

    res.json(CreateStarsInvoiceResponse.parse({ invoiceUrl, priceStars }));
  } catch (err) {
    req.log.error({ err }, "Failed to create Telegram Stars invoice");
    res.status(400).json({ error: "Failed to create invoice, check TELEGRAM_BOT_TOKEN" });
  }
});

export default router;
