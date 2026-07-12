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

**Progression fields need the monotonic pattern too (numeric max / union).**

**Why:** a real player lost their paid mining-level upgrade (2→1) when a stale session (second device / old tab / reopened WebView) pushed an outdated state blob. Only `lifetimePoints` was decrease-protected; the rest of the blob regressed silently.

**How to apply:** in the PUT /vault/me merge, clamp upgrade-type numerics to `max(server, client)` (`miningLevel`, `maxEnergy`, `permanentMultiplierPercent`), union purchased-item lists (`ownedSkinIds`, `ownedBadgeIds`), and merge `passiveCards` per-card keeping the higher level. Do NOT clamp spendable balances (`tempMiningPoints`) — spending legitimately lowers them. Any new upgrade/purchase field added to the state blob must be added to this monotonic merge or it will regress the same way. Residual caveat: merge is read-then-write, so a narrow concurrent-PUT window remains; and after an admin reset, an old live client can re-upload prior progression until it re-hydrates.
