---
name: Client-authoritative points anti-cheat via delta cap
description: How to close a "client sends arbitrary points" exploit without rearchitecting a client-authoritative P2E game loop
---

When a Play-to-Earn game's state (points/currency) is stored as a client-synced blob for simplicity, a full rewrite to server-simulated authority is disproportionate while cash payout is still disabled/placeholder.

**Rule:** on the sync endpoint, track `lastPointsSyncAt` server-side and clamp any client-reported increase to `elapsedSeconds * adminConfiguredCapPerSecond`, rather than accepting the client's number outright or rejecting the whole sync. Never allow the client to decrease the stored value (keep server's higher value on conflicting/stale syncs).

**Why:** this closes the "just send a huge number" exploit and bounds the damage of any future automated-cheat vector, while preserving the low-migration-churn client-authoritative architecture and not breaking legitimate fast progression (cap should be generous and admin-tunable, not a fixed guess).

**How to apply:** revisit this the moment real-money withdrawal is enabled — at that point genuine server-side simulation of at least the withdrawal-eligible balance becomes worth the cost; the delta cap is a mitigation, not a full fix.
