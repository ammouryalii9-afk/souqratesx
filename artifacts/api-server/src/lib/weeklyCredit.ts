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
  // NOTE: node-postgres sends bound params as untyped, so a bare `to_jsonb($n)` throws
  // "could not determine polymorphic type because input has type unknown". Every param
  // fed to to_jsonb (or compared/added) MUST carry an explicit cast.
  expr = sql`jsonb_set(${expr}, '{weeklyPoints}', to_jsonb((CASE WHEN ${S}->>'weekKey' = ${wk}::text THEN COALESCE((${S}->>'weeklyPoints')::numeric, 0) ELSE 0 END) + ${reward}::numeric))`;
  expr = sql`jsonb_set(${expr}, '{weekKey}', to_jsonb(${wk}::text))`;
  // Reward points must also land in the spendable "Mined" balance (state.tempMiningPoints),
  // not just lifetimePoints/Total — otherwise refreshFromServer() shows the reward only in the
  // Total counter and the player can't spend it on upgrades.
  expr = sql`jsonb_set(${expr}, '{tempMiningPoints}', to_jsonb(COALESCE((${S}->>'tempMiningPoints')::numeric, 0) + ${reward}::numeric))`;
  for (const [key, value] of Object.entries(patches)) {
    const arg: SQL =
      typeof value === "string" ? sql`${value}::text`
      : typeof value === "number" ? sql`${value}::numeric`
      : value; // already a typed SQL fragment
    expr = sql`jsonb_set(${expr}, ${`{${key}}`}::text[], to_jsonb(${arg}))`;
  }
  return expr;
}
