---
name: Background bonus credits & lazy weekly reset
description: Why background jobs credit pending_bonus_points (redeemed at hydration) instead of state.tempMiningPoints, and why lazy weekly resets must archive prev-week scores.
---

## Rule 1: background spendable credits go through a pending column

Any server-side credit to the spendable balance that is NOT triggered by the online client itself (weekly prize jobs, referral milestones, admin gifts) must be written to a dedicated pending column and folded into the state JSONB only at a hydration moment (auth response, GET state) via one atomic UPDATE with guard-in-WHERE (`pending > 0`) + RETURNING.

**Why:** the client-authoritative sync (debounced PUT) sends its stale spendable balance verbatim; a direct server write to `state.tempMiningPoints` is silently erased seconds later if the user is online. Hydration is safe because the client is about to replace its local state with the response.

**How to apply:** never `jsonb_set` a spendable field from a background job. Credit the pending column + lifetime column, redeem at hydration. The guard-in-WHERE makes concurrent redeems exactly-once.

## Rule 2: lazy period resets must archive before overwriting

Weekly scores reset lazily (on the user's first credit of the new week), but the prize job runs on a timer — without archiving, early-week activity destroys the finished week's scores before the job reads them.

**Why:** a lazy reset plus a periodic reader is a destroy-before-read race by construction.

**How to apply:** every rollover path (client-sync merge AND server credit SQL) must copy `weekKey`/`weeklyPoints` into `prevWeekKey`/`prevWeekPoints` before resetting; the reader queries a CASE over both locations. Protect all these keys from client tampering. Seed/claim the "last awarded period" marker atomically so restarts and first boots can't double- or bogus-pay.

## Frontend rule
When a reward moves to the server-side pending channel, remove the client's optimistic `setTempMiningPoints`/`addLifetimePoints` for that flow and call `refreshFromServer()` instead — the optimistic bump plus later pending redemption double-credits via the debounced PUT sync. Hydration responses expose `redeemedBonus` to drive the reward popup.
