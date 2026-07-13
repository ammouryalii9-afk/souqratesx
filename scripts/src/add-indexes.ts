import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

const INDEXES = [
  {
    name: "vu_state_week_key_idx",
    ddl: `CREATE INDEX IF NOT EXISTS vu_state_week_key_idx ON vault_users ((state->>'weekKey'))`,
  },
  {
    name: "vu_state_weekly_pts_idx",
    ddl: `CREATE INDEX IF NOT EXISTS vu_state_weekly_pts_idx ON vault_users (((state->>'weeklyPoints')::numeric) DESC) WHERE state->>'weeklyPoints' IS NOT NULL`,
  },
  {
    name: "vu_leaderboard_partial_idx",
    ddl: `CREATE INDEX IF NOT EXISTS vu_leaderboard_partial_idx ON vault_users (lifetime_points DESC) WHERE is_banned = false`,
  },
  {
    name: "vu_state_prev_week_key_idx",
    ddl: `CREATE INDEX IF NOT EXISTS vu_state_prev_week_key_idx ON vault_users ((state->>'prevWeekKey')) WHERE state->>'prevWeekKey' IS NOT NULL`,
  },
  {
    name: "vu_lifetime_pts_idx",
    ddl: `CREATE INDEX IF NOT EXISTS vu_lifetime_pts_idx ON vault_users (lifetime_points)`,
  },
  {
    name: "vu_is_banned_idx",
    ddl: `CREATE INDEX IF NOT EXISTS vu_is_banned_idx ON vault_users (is_banned)`,
  },
  {
    name: "vu_referrer_id_idx",
    ddl: `CREATE INDEX IF NOT EXISTS vu_referrer_id_idx ON vault_users (referrer_id)`,
  },
  {
    name: "vu_squad_id_idx",
    ddl: `CREATE INDEX IF NOT EXISTS vu_squad_id_idx ON vault_users (squad_id)`,
  },
  {
    name: "vu_updated_at_idx",
    ddl: `CREATE INDEX IF NOT EXISTS vu_updated_at_idx ON vault_users (updated_at)`,
  },
];

async function main() {
  console.log("Applying performance indexes to vault_users...\n");

  for (const idx of INDEXES) {
    try {
      await db.execute(sql.raw(idx.ddl));
      console.log(`✅  ${idx.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌  ${idx.name}: ${msg}`);
    }
  }

  const existing = await db.execute(sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'vault_users'
    ORDER BY indexname
  `);
  console.log("\nAll indexes on vault_users:");
  for (const row of existing.rows) {
    console.log(" •", (row as { indexname: string }).indexname);
  }

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
