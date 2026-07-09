import { db, adminSettingsTable } from "@workspace/db";

export async function getSettingsMap(): Promise<Record<string, unknown>> {
  const rows = await db.select().from(adminSettingsTable);
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
