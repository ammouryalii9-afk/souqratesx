---
name: VaultX Telegram auth & sync
description: How VaultX authenticates Telegram WebApp users and persists game progress server-side
---

VaultX (Telegram Mini App) verifies `window.Telegram.WebApp.initData` server-side via HMAC using `TELEGRAM_BOT_TOKEN` (per Telegram's documented WebApp validation scheme), then sets a custom HMAC-signed httpOnly cookie (signed with `SESSION_SECRET`) for session identification — no third-party auth library needed.

**Why:** Telegram Mini Apps don't have a standard OAuth-style login; initData HMAC verification is the official mechanism, and a lightweight signed cookie avoids pulling in a full session store for a single-table use case.

**How to apply:** Game state is stored as a single JSONB blob per user (`vault_users.state`) rather than normalized columns, mirroring the shape of the frontend's in-memory state object. This minimizes migration churn as game features evolve — new state fields just flow through the blob. `lifetimePoints` is kept as a separate denormalized int column for leaderboard sorting.

Frontend behavior: if `window.Telegram.WebApp` / `initData` isn't present (e.g. local dev browser preview), the app skips server auth entirely and runs on localStorage only — this fallback must be preserved so local preview/dev doesn't break. When authenticated, state changes are debounced (~1.5s) before PUT-ing to the server to avoid excessive writes.

Not all local state was migrated to the server blob — daily task tracking in TasksTab (streaks, daily cipher, spin wheel) still uses localStorage only and is scoped as a future improvement if cross-device task sync is needed.
