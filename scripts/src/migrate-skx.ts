// One-time migration for the SKX/SKP dual-currency economy.
// 1. skx_balance = GREATEST(claimedPoints - withdrawnPoints, 0) + pendingBonusPoints
//    (preserves every user's earned withdrawable balance + unfolded server bonuses)
// 2. Zeroes pending_bonus_points (folded in) and strips the retired
//    claimedPoints/adMiningPoints keys from the state JSONB.
// 3. Seeds new admin_settings keys (ON CONFLICT DO NOTHING).
// 4. Creates the initial active pixel cycle if none exists.
import { db, pool, vaultUsersTable, adminSettingsTable, pixelCyclesTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";

async function main() {
  // ── 1+2. Balance migration (idempotent: only rows still carrying claimedPoints) ──
  const migrated = await db.execute(sql`
    UPDATE vault_users
    SET skx_balance = skx_balance
        + GREATEST(COALESCE((state->>'claimedPoints')::numeric, 0) - withdrawn_points, 0)::bigint
        + pending_bonus_points,
      pending_bonus_points = 0,
      state = (state - 'claimedPoints') - 'adMiningPoints'
    WHERE state ? 'claimedPoints' OR pending_bonus_points > 0
  `);
  console.log(`Migrated ${migrated.rowCount} users to skx_balance`);

  // ── 3. Admin settings seeds ──
  const seeds: Array<[string, unknown]> = [
    ["skpToSkxConversionRate", 5],
    ["pixelTotalSupply", 10000],
    [
      "pixelPriceTiers",
      [
        { upTo: 1000, price: 2500 },
        { upTo: 3000, price: 3000 },
        { upTo: 5000, price: 4000 },
        { upTo: 7000, price: 5500 },
        { upTo: 9000, price: 7000 },
        { upTo: 10000, price: 10000 },
      ],
    ],
    ["pixelDividendPercent", 35],
    ["pixelCycleDays", 15],
    ["pixelCycleAutoStart", true],
    ["maxPixelsPerPurchase", 1000],
  ];
  for (const [key, value] of seeds) {
    await db
      .insert(adminSettingsTable)
      .values({ key, value })
      .onConflictDoNothing();
  }
  console.log("Seeded admin settings");

  // ── 4. Initial active cycle ──
  const [active] = await db.select().from(pixelCyclesTable).where(eq(pixelCyclesTable.status, "active"));
  if (!active) {
    const end = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const [cycle] = await db.insert(pixelCyclesTable).values({ endDate: end }).returning();
    console.log(`Created initial pixel cycle #${cycle!.id} ending ${end.toISOString()}`);
  } else {
    console.log(`Active cycle already exists: #${active.id}`);
  }

  // Sanity: show a few balances
  const sample = await db
    .select({ tid: vaultUsersTable.telegramId, skx: vaultUsersTable.skxBalance })
    .from(vaultUsersTable)
    .orderBy(sql`skx_balance DESC`)
    .limit(5);
  console.log("Top SKX balances:", sample);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
