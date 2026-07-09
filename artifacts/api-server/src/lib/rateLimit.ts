import type { Request, Response, NextFunction, RequestHandler } from "express";

type Bucket = { count: number; resetAt: number };

const stores = new Map<string, Map<string, Bucket>>();

function clientIp(req: Request): string {
  // req.ip respects Express "trust proxy" configuration (set in app.ts),
  // so clients cannot spoof their identity via X-Forwarded-For directly.
  return req.ip ?? "unknown";
}

export function rateLimit(name: string, maxRequests: number, windowMs: number): RequestHandler {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  const buckets = stores.get(name)!;

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = clientIp(req);
    const bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      res.status(429).json({ error: "Too many requests, slow down" });
      return;
    }
    next();
  };
}

// Periodic cleanup so long-running processes don't grow memory unboundedly.
setInterval(() => {
  const now = Date.now();
  for (const buckets of stores.values()) {
    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) {
        buckets.delete(key);
      }
    }
  }
}, 60_000).unref();
