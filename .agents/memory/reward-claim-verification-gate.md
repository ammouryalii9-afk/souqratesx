---
name: Reward-claim watch-time gate
description: How to enforce a "verify a condition before crediting points" rule across all claimable rewards (existing and future) without per-item code.
---

When a user asks for "no points unless the condition is verified" and wants it to apply to *all* claimable items (including ones added later), split the claim flow into two server endpoints rather than trusting a client-side "I did it" flag:

1. `POST /.../:id/start` — records a server timestamp when the user begins the action (e.g. opens an ad link). Idempotent: if already started and not yet claimed, just returns the existing timestamp.
2. `POST /.../:id/claim` — looks up the start record, computes elapsed time server-side, and refuses (429) to credit anything until an admin-configurable minimum has elapsed. Only then does it atomically mark claimed + credit the reward.

**Why:** The client can't be trusted to say "I watched/verified" — it must be checked against a server-recorded start time. Putting the minimum-duration threshold in one global admin setting (not a column per item) means every existing item is instantly covered, and every future item automatically inherits the same gate with zero code changes — consistent with the general "generic effect/condition, not per-instance hardcoding" pattern used for the Stars store.

**How to apply:** For any "claim reward after doing X" feature (sponsored ads, offers, surveys, etc.), add a `startedAt`/`claimedAt` pair (nullable `claimedAt`) to the claim ledger table instead of inserting the claim row only at credit time. Gate the update with `WHERE claimedAt IS NULL` for atomicity. Store the minimum wait duration in the shared admin_settings table so admins can tune it without a deploy, and expose it (plus the user's own startedAt) in the public list endpoint so the frontend can show a live countdown — but always let the server be the actual authority.
