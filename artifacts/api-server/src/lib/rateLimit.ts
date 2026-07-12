import type { Request, Response, NextFunction, RequestHandler } from "express";
import cluster from "node:cluster";
import os from "node:os";

// Buckets are per-process, but the server runs one cluster worker per CPU.
// Divide each configured limit by the worker count so the EFFECTIVE per-IP
// limit across all workers matches the configured number (approximately —
// the proxy distributes requests across workers).
const WORKER_COUNT = cluster.isWorker ? Math.max(1, os.cpus().length) : 1;

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
  // floor (not ceil) so the aggregate across workers never exceeds the
  // configured limit; minimum 1 so tiny limits still allow requests.
  const effectiveMax = Math.max(1, Math.floor(maxRequests / WORKER_COUNT));

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
    if (bucket.count > effectiveMax) {
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
