import { sql, type SQL } from "drizzle-orm";
import { vaultUsersTable } from "@workspace/db";

/** ISO-ish week key = the Monday (UTC) of the current week, e.g. "2026-07-06". */
export function weekKey(d = new Date()): string {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay(); // 0 Sun .. 6 Sat
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return dt.toISOString().slice(0, 10);
}

/**
 * Builds a JSONB expression for `vault_users.state` that:
 *  - adds `reward` to `state.weeklyPoints` (resetting it when the week rolls over), and
 *  - keeps `state.weekKey` current, and
 *  - applies each scalar/SQL patch to the given top-level key.
 *
 * Patch values may be primitives (bound as params) or SQL fragments — this lets
 * callers compute counters atomically against the live row (e.g. `x + 1`) so that
 * concurrent updates increment correctly instead of racing on a JS-precomputed value.
 *
 * Use together with a guard predicate in the UPDATE's WHERE clause so that
 * already-claimed / capped requests update 0 rows (Postgres re-evaluates the WHERE
 * against the committed row for the second concurrent writer, preventing double-credit).
 */
export function creditedStateSql(reward: number, patches: Record<string, string | number | SQL>): SQL {
  const S = vaultUsersTable.state;
  const wk = weekKey();
  let expr: SQL = sql`${S}`;
  expr = sql`jsonb_set(${expr}, '{weeklyPoints}', to_jsonb((CASE WHEN ${S}->>'weekKey' = ${wk} THEN COALESCE((${S}->>'weeklyPoints')::numeric, 0) ELSE 0 END) + ${reward}))`;
  expr = sql`jsonb_set(${expr}, '{weekKey}', to_jsonb(${wk}::text))`;
  for (const [key, value] of Object.entries(patches)) {
    expr = sql`jsonb_set(${expr}, ${`{${key}}`}::text[], to_jsonb(${value}))`;
  }
  return expr;
}
