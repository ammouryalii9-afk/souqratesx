---
name: Vault state-sync authority (one-time flags)
description: How to protect JSONB state keys in PUT /vault/me against stale/tampered client sync, and the special case for one-time-reward flags.
---

# Vault state-sync authority

`PUT /vault/me` accepts the whole game `state` JSONB blob from the client and clamps only `lifetimePoints` (maxPointsPerHourCap). Every other `state` key is client-trusted unless explicitly protected.

- `PROTECTED_STATE_KEYS` (in `vault.ts`) forces the server's stored value over the client's — use it for keys the client must NEVER change (streaks, box cooldowns, claimedAchievements, weeklyPoints/weekKey).

**One-time-reward flags need a DIFFERENT pattern — monotonic, not fully protected.**

**Why:** a one-time flag like `hasClaimedWelcome` must legitimately go false→true exactly once, triggered by the client. If you add it to `PROTECTED_STATE_KEYS`, the server value always wins and the client can never set it true. If you leave it unprotected, a stale/tampered client resets it true→false and re-claims the reward across devices/sessions.

**How to apply:** make it monotonic (sticky-true) in the merge step: `if (existingState[key] === true) mergedState[key] = true;`. Accepts the first claim, blocks all resets. Any future one-time-reward flag in the state blob must do the same, never rely on the client flag alone.
