---
name: VaultX spendable vs lifetime points
description: The two different "points" fields in VaultX game state and why crediting only one leaves a purchase/reward invisible in-game.
---

VaultX tracks two separate point numbers per user:

- `vault_users.lifetime_points` (DB column) — a monotonically-increasing, read-only counter used only for the leaderboard and anti-cheat delta capping. The player cannot spend this directly.
- `state.tempMiningPoints` (inside the JSONB `state` blob) — the actual spendable/mined balance the frontend displays and lets the player spend on upgrades, etc. `VaultContext.refreshFromServer()` reads this exact key.

**Why:** A star-product "points" effect (and any future server-side point grant) was once written to `lifetimePoints` only (or to a wrong/made-up key like `state.points`), which silently updated the leaderboard number but never touched the player's usable balance — the purchase appeared to do nothing in-game even though the DB was technically credited.

**How to apply:** Any code that credits "points" to a player (Stars purchase effects, ad rewards, admin manual credits, etc.) must increment **both** `lifetimePoints` and `state.tempMiningPoints` together, keyed by the literal frontend field name `tempMiningPoints` — never invent a new state key for points.
