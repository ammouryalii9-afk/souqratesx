---
name: Drizzle untyped params in CASE default to text
description: Postgres "operator does not exist: integer < text" from parameters wrapped in a CASE/expression via Drizzle sql``
---

When a JS value interpolated into a Drizzle ``sql`...` `` template lands inside a `CASE ... THEN $n ELSE $m END` (or any spot where Postgres can't infer the type from an adjacent column), Postgres binds that parameter as **text**, so a comparison like `int_column < case ... then $n end` fails with `operator does not exist: integer < text`.

**Fix:** add an explicit cast on each branch, e.g. `then ${cap * 2}::int else ${cap}::int end`.

**Why:** a bare `int_column < $n` works because PG infers `$n` from the column, but wrapping `$n` in a CASE removes that context and PG falls back to text. This is invisible to `tsc` and to a raw `psql` test that uses integer *literals* instead of bound params — the bug only reproduces through the parameterized query path.

**How to apply:** any daily-cap / threshold CASE in the provider `creditWithCooldown` queries (adsgram, monetag, and any future rewarded-ad provider copied from them) must keep the `::int` casts. Reproduce reward-path DB errors by curling the real endpoint (e.g. `GET /api/earn/adsgram/postback?userId=...&secret=...&txId=...`) and reading the pino `err` in the api-server workflow log — a plain psql run of the query will NOT surface it.

## Sibling gotcha: `to_jsonb($n)` on a bare param → runtime 500

`to_jsonb` is polymorphic (`to_jsonb(anyelement)`). node-postgres sends bound params as **untyped/unknown**, so `to_jsonb(${value})` with a bare interpolated param throws at runtime: `could not determine polymorphic type because input has type unknown`. This 500'd the streak-claim / mystery-box / challenge / achievement endpoints in prod even though a hand-cast raw `pg` test passed (the raw test wrote `to_jsonb($1::text)` — the real `creditedStateSql` did not).

**Fix:** never feed a bare param to `to_jsonb`. Cast by JS type before interpolating — string → `${v}::text`, number → `${v}::numeric` (also keeps it a JSON *number*, not `"3"`), and pass already-typed `SQL` fragments through untouched (`to_jsonb(jsonb)` is identity, no double-wrap). See `creditedStateSql` in `artifacts/api-server/src/lib/weeklyCredit.ts`.

**Same root cause as the CASE gotcha above:** an interpolated param with no adjacent typed column/operator to anchor inference. Whenever a param sits inside a polymorphic function call or a CASE, add an explicit `::type`. Confirm with `SELECT to_jsonb($1)` (fails) vs `SELECT to_jsonb($1::text)` (ok) against the DB.
