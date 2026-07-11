---
name: Drizzle untyped params in CASE default to text
description: Postgres "operator does not exist: integer < text" from parameters wrapped in a CASE/expression via Drizzle sql``
---

When a JS value interpolated into a Drizzle ``sql`...` `` template lands inside a `CASE ... THEN $n ELSE $m END` (or any spot where Postgres can't infer the type from an adjacent column), Postgres binds that parameter as **text**, so a comparison like `int_column < case ... then $n end` fails with `operator does not exist: integer < text`.

**Fix:** add an explicit cast on each branch, e.g. `then ${cap * 2}::int else ${cap}::int end`.

**Why:** a bare `int_column < $n` works because PG infers `$n` from the column, but wrapping `$n` in a CASE removes that context and PG falls back to text. This is invisible to `tsc` and to a raw `psql` test that uses integer *literals* instead of bound params — the bug only reproduces through the parameterized query path.

**How to apply:** any daily-cap / threshold CASE in the provider `creditWithCooldown` queries (adsgram, monetag, and any future rewarded-ad provider copied from them) must keep the `::int` casts. Reproduce reward-path DB errors by curling the real endpoint (e.g. `GET /api/earn/adsgram/postback?userId=...&secret=...&txId=...`) and reading the pino `err` in the api-server workflow log — a plain psql run of the query will NOT surface it.
