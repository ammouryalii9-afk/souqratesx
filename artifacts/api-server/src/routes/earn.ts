import { Router, type IRouter } from "express";
import { ClaimAdsgramRewardResponse, OfferwallPostbackResponse, GetEarnOffersResponse } from "@workspace/api-zod";
import { getSessionTelegramId } from "../lib/session";
import { rateLimit } from "../lib/rateLimit";
import { getProvider, getUnifiedOffers } from "../providers/manager";
import { processReward } from "../providers/rewardEngine";

const router: IRouter = Router();

router.get("/earn/offers", rateLimit("earnOffers", 60, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const offers = await getUnifiedOffers({ telegramId });
  res.json(GetEarnOffersResponse.parse({ offers }));
});

router.post("/earn/adsgram/reward", rateLimit("adsgram", 30, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const provider = getProvider("adsgram");
  if (!provider) {
    res.status(500).json({ error: "Adsgram provider not registered" });
    return;
  }
  if (!provider.isEnabled()) {
    res.status(403).json({ error: "Adsgram is currently disabled" });
    return;
  }

  const result = await processReward(provider, { telegramId, raw: {} });
  if (!result.ok) {
    res.status(429).json({ error: result.reason ?? "Ad reward not available yet (cooldown or daily limit)" });
    return;
  }

  res.json(ClaimAdsgramRewardResponse.parse({ creditedPoints: result.creditedPoints, lifetimePoints: result.lifetimePoints }));
});

router.post("/earn/monetag/reward", rateLimit("monetag", 30, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const provider = getProvider("monetag");
  if (!provider) {
    res.status(500).json({ error: "Monetag provider not registered" });
    return;
  }
  if (!provider.isEnabled()) {
    res.status(403).json({ error: "Monetag is currently disabled" });
    return;
  }

  const result = await processReward(provider, { telegramId, raw: {} });
  if (!result.ok) {
    res.status(429).json({ error: result.reason ?? "Ad reward not available yet (cooldown or daily limit)" });
    return;
  }

  res.json(ClaimAdsgramRewardResponse.parse({ creditedPoints: result.creditedPoints, lifetimePoints: result.lifetimePoints }));
});

router.post("/earn/onclicka/reward", rateLimit("onclicka", 30, 60_000), async (req, res): Promise<void> => {
  const telegramId = getSessionTelegramId(req);
  if (!telegramId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const provider = getProvider("onclicka");
  if (!provider) {
    res.status(500).json({ error: "Onclicka provider not registered" });
    return;
  }
  if (!provider.isEnabled()) {
    res.status(403).json({ error: "Onclicka is currently disabled" });
    return;
  }

  const result = await processReward(provider, { telegramId, raw: {} });
  if (!result.ok) {
    res.status(429).json({ error: result.reason ?? "Ad reward not available yet (cooldown or daily limit)" });
    return;
  }

  res.json(ClaimAdsgramRewardResponse.parse({ creditedPoints: result.creditedPoints, lifetimePoints: result.lifetimePoints }));
});

router.get("/earn/adsgram/postback", rateLimit("postback", 60, 60_000), async (req, res): Promise<void> => {
  const telegramId = typeof req.query.userId === "string" ? req.query.userId : "";
  const secret = typeof req.query.secret === "string" ? req.query.secret : "";
  const txId = typeof req.query.txId === "string" && req.query.txId.length > 0 ? req.query.txId : undefined;

  if (!telegramId) {
    res.status(400).json({ error: "Missing userId" });
    return;
  }

  const provider = getProvider("adsgram");
  if (!provider) {
    res.status(500).json({ error: "Adsgram provider not registered" });
    return;
  }

  const result = await processReward(provider, { telegramId, secret, txId, raw: { ...req.query } });
  if (!result.ok) {
    if (result.reason === "Invalid postback secret") {
      req.log.warn("Rejected Adsgram postback with invalid secret");
      res.status(403).json({ error: "Invalid postback secret" });
      return;
    }
    res.status(400).json({ error: result.reason ?? "Unknown/banned user or cooldown/daily cap reached" });
    return;
  }

  req.log.info({ telegramId, creditedPoints: result.creditedPoints }, "Adsgram postback credited");
  res.json(ClaimAdsgramRewardResponse.parse({ creditedPoints: result.creditedPoints, lifetimePoints: result.lifetimePoints }));
});

router.get("/earn/offerwall/postback", rateLimit("postback", 60, 60_000), async (req, res): Promise<void> => {
  const providerKey = typeof req.query.provider === "string" ? req.query.provider : "";
  const telegramId = typeof req.query.telegramId === "string" ? req.query.telegramId : "";
  const amountRaw = Number(req.query.amount);
  const secret = typeof req.query.secret === "string" ? req.query.secret : "";
  const txIdRaw = req.query.txId ?? req.query.transId ?? req.query.tx;
  const txId = typeof txIdRaw === "string" && txIdRaw.length > 0 ? txIdRaw : undefined;

  const provider = getProvider(providerKey);
  if (!provider || provider.type !== "offerwall" || !telegramId || !Number.isFinite(amountRaw) || amountRaw <= 0) {
    res.status(400).json({ error: "Invalid provider or missing params" });
    return;
  }

  const result = await processReward(provider, { telegramId, secret, txId, amount: amountRaw, raw: { ...req.query } });
  if (!result.ok) {
    if (result.reason === "Invalid postback secret") {
      req.log.warn({ provider: providerKey }, "Rejected offerwall postback with invalid secret");
      res.status(403).json({ error: "Invalid postback secret" });
      return;
    }
    res.status(400).json({ error: result.reason ?? "Unknown or banned user" });
    return;
  }

  req.log.info({ provider: providerKey, telegramId, creditedPoints: result.creditedPoints }, "Offerwall postback credited");
  res.json(OfferwallPostbackResponse.parse({ creditedPoints: result.creditedPoints, lifetimePoints: result.lifetimePoints }));
});

router.get("/earn/cpxresearch/postback", rateLimit("postback", 60, 60_000), async (req, res): Promise<void> => {
  const telegramId = typeof req.query.user_id === "string" ? req.query.user_id : "";

  if (!telegramId) {
    res.status(400).json({ error: "Missing user_id" });
    return;
  }

  const provider = getProvider("cpxresearch");
  if (!provider) {
    res.status(500).json({ error: "CPX Research provider not registered" });
    return;
  }

  const result = await processReward(provider, { telegramId, raw: { ...req.query } });
  if (!result.ok) {
    if (result.reason === "Invalid postback secret") {
      req.log.warn("Rejected CPX Research postback with invalid hash");
      res.status(403).json({ error: "Invalid postback secret" });
      return;
    }
    res.status(400).json({ error: result.reason ?? "Unknown/banned user or invalid transaction" });
    return;
  }

  req.log.info({ telegramId, creditedPoints: result.creditedPoints }, "CPX Research postback credited");
  res.json(OfferwallPostbackResponse.parse({ creditedPoints: result.creditedPoints, lifetimePoints: result.lifetimePoints }));
});

export default router;
