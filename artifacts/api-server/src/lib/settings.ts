import { db, adminSettingsTable } from "@workspace/db";

// In-memory TTL cache: getSettingsMap() is called on nearly every request
// (vault sync, withdrawals, earn routes, config/public), and each call was a
// full-table read against the remote Supabase pooler. 30s of staleness is
// harmless for admin tunables. NOTE: each cluster worker has its own cache —
// bustSettingsCache() only clears the worker that handled the admin save, so
// other workers may serve values up to TTL_MS stale. That is acceptable.
const TTL_MS = 30_000;

let cached: { data: Record<string, unknown>; expiresAt: number } | null = null;

export async function getSettingsMap(): Promise<Record<string, unknown>> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const rows = await db.select().from(adminSettingsTable);
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  cached = { data: settings, expiresAt: Date.now() + TTL_MS };
  return settings;
}

/** Call after any write to admin_settings so the next read sees fresh values. */
export function bustSettingsCache(): void {
  cached = null;
}

export function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
