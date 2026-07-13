---
name: Claim vs whole-state sync race
description: Why every whole-state JSONB write must be guarded against concurrent server-side balance conversions (claimSeq optimistic concurrency)
---

**Rule:** any endpoint that replaces the whole `state` JSONB from a stale pre-read (read-modify-write, like the client sync) must carry an optimistic-concurrency guard in its UPDATE WHERE (`state->>'claimSeq'` unchanged since pre-read). Server-side conversions (claim) bump `claimSeq` atomically in the same UPDATE that moves the balance.

**Why:** a debounced client sync that read state before a claim and wrote after it would resurrect the pre-claim Mined buffer and revert the claimed balance — enabling double-claims. PROTECTED_STATE_KEYS alone doesn't help, because the protected values are merged from the *stale pre-read*, not the current row.

**How to apply:** when the guard fails (0 rows), drop the stale write and return the current row — the client keeps running totals, so the next debounced sync re-applies cleanly. Incremental SQL writers (`jsonb_set` on the live row, e.g. creditedStateSql / pendingBonus / Stars effects) don't need the guard — only stale whole-state replacement does.
