import { db, userActivityLogTable } from "@workspace/db";

export async function logUserActivity(telegramId: string, type: string, details: Record<string, unknown> = {}): Promise<void> {
  await db.insert(userActivityLogTable).values({ telegramId, type, details });
}
