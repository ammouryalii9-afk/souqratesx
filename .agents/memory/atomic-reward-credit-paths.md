---
name: Atomic reward credit paths + weekly points
description: How server-side reward endpoints (engage, achievements) must credit points without races and keep the weekly leaderboard correct in SouqratesX.
---

# Atomic reward credit paths + weekly points

Two rules every server-side path that credits `vault_users.lifetime_points` must follow:

1. **Credit atomically with a guard predicate, never read-then-write.**
   Put the "not already claimed / not over cap / cooldown elapsed" check inside the
   `UPDATE ... WHERE`, then check `rowCount`/returned rows — if 0, respond 409/429.
   Postgres re-evaluates the WHERE against the committed row for the second concurrent
   writer (EvalPlanQual), so only one claim wins. A JS `if (already) return` before a
   separate UPDATE is racy and double-credits under concurrent requests.
   - For counters that legitimately increment multiple times (e.g. ad-box daily count),
     compute the new value in SQL against the live column (`x + 1`), not a JS-precomputed
     constant, or two concurrent writers both write the same value.

2. **Every credit path must also bump `state.weeklyPoints` (and refresh `state.weekKey`).**
   `weeklyPoints`/`weekKey` live inside the JSONB `state` blob, not columns. The weekly
   leaderboard reads them. Only `PUT /vault/me` updated them originally, so streak /
   mystery-box / challenge / achievement rewards were invisible to the weekly board until
   the shared helper `creditedStateSql()` was added.

**Why:** this is a real-money play-to-earn app; the codebase's stated convention is
"all credit paths are atomic SQL increments." Read-then-write claims violated it and the
weekly leaderboard silently undercounted server-side rewards.

**How to apply:** use `artifacts/api-server/src/lib/weeklyCredit.ts` — `weekKey()` (single
source of truth, imported by vault.ts too so the week boundary can't drift) and
`creditedStateSql(reward, patches)` which builds the JSONB `state` update that credits
weekly points and applies scalar/SQL patches. Pair it with a guard in the WHERE clause.

**Additional rules from the 2026-07 full audit (money paths):**
- **Two-statement money flows (deduct + insert, gate + refund) must be a DB transaction
  or gate-first.** Withdrawal request = deduct + insert inside `db.transaction` backed by a
  partial unique index (one pending per user) — never manual "refund on catch", because a
  transient DB error would then mint points. Admin approve/reject = atomic
  `UPDATE ... WHERE status='pending' RETURNING` gate FIRST, refund only after winning it.
- **Verification failures must fail CLOSED.** Partner-task "benefit of doubt" on Telegram
  API errors let everyone mass-claim during any bot/channel misconfig; return 503 instead.
- **JSONB state effects from webhooks (Stars purchases) must be single-statement
  `jsonb_set` SQL**, not read-modify-write — RMW races with the frequent `PUT /vault/me`
  sync and silently clobbers state (remember `::int`/`::bigint` casts on bound params).
- **In-memory rate limits run per cluster worker** — divide configured limits by worker
  count (floor, min 1) or the effective limit is N× the intended one.

**Known accepted limitation:** `POST /engage/mysterybox/open` with `source:"ad"` trusts the
client that an ad was watched — it is only bounded by the 5/day cap. The frontend shows an
ad via the Adsgram/Monetag SDK first, but that SDK call does NOT credit the server or
increment `adsWatchedToday`, so gating the ad-box on `adsWatchedToday` would break the
feature. Consistent with the game already being client-authoritative (tap mining trusted via
`PUT /vault/me`) and cash withdrawal deferred. A real fix needs an ad postback/nonce tied to
the specific view.
