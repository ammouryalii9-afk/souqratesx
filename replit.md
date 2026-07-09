# SouqratesX

SouqratesX is a Telegram Mini App (Play-to-Earn) where users tap-mine points, upgrade miners, farm passive rewards, and complete daily tasks, with progress synced permanently to a server-side database.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/vaultx run dev` — run the SouqratesX frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — used to sign the SouqratesX session cookie
- Required env: `TELEGRAM_BOT_TOKEN` — used to verify Telegram WebApp `initData` server-side

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite (SouqratesX artifact), Telegram WebApp SDK

## Where things live

- `artifacts/vaultx` — the Telegram Mini App frontend (React/Vite)
- `artifacts/vaultx/src/context/VaultContext.tsx` — core game state, Telegram auth bootstrap, and server sync logic
- `artifacts/vaultx/src/lib/telegram.ts` — Telegram WebApp SDK helpers
- `artifacts/api-server` — Express API server
- `artifacts/api-server/src/routes/auth.ts` — Telegram `initData` verification + session cookie issuance
- `artifacts/api-server/src/routes/vault.ts` — get/update game state, leaderboard
- `artifacts/api-server/src/lib/telegramAuth.ts` — HMAC verification of Telegram `initData`
- `artifacts/api-server/src/lib/session.ts` — signed session cookie helpers
- `lib/db/src/schema/vaultUsers.ts` — `vault_users` table (source of truth for user schema)
- `lib/db/src/schema/adminSettings.ts` — `admin_settings` key/value table for global platform config (economy tuning, ads, CPA/offerwalls, surveys, Stars, Premium — API keys pending from user)
- `lib/db/src/schema/adminAuditLog.ts` — `admin_audit_log` table logging every admin panel write action
- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `artifacts/api-server/src/routes/admin.ts` — admin panel API (login/logout/me, stats, user CRUD/ban/premium/stars, settings, audit log)
- `artifacts/vaultx/src/admin/` — the `/manager` admin panel frontend (login, overview, users, settings, audit log tabs)

## Architecture decisions

- Game state is stored as a single JSONB blob (`vault_users.state`) rather than normalized columns, mirroring the frontend's in-memory state shape to minimize migration churn as features evolve.
- `lifetimePoints` is kept as a separate denormalized int column on `vault_users` for fast leaderboard sorting.
- `lifetimePoints` anti-cheat: `PUT /vault/me` no longer trusts the client's `lifetimePoints` blindly. It compares against the server's stored value + `lastPointsSyncAt`, and clamps any increase above an admin-tunable `admin_settings.maxPointsPerHourCap` (default 3,000,000/hr) rather than rejecting the sync outright — keeps the client-authoritative game loop but caps how much any single exploit attempt can inject. Decreases from the client are always ignored (server value wins).
- Telegram haptic feedback is wired via `artifacts/vaultx/src/lib/telegram.ts`'s `haptic()` helper (no-ops outside Telegram) on taps, upgrades, and all game interactions for a smoother native feel.
- Telegram auth uses the official `initData` HMAC verification scheme (no OAuth/third-party auth library) plus a custom lightweight HMAC-signed httpOnly session cookie.
- The frontend gracefully falls back to localStorage-only progress when not running inside Telegram (e.g. local dev browser preview) — this fallback must be preserved.
- Admin panel lives at the `/manager` client route inside the same `vaultx` artifact (root `main.tsx` checks `window.location.pathname` and renders `AdminApp` instead of the game `App`), rather than a separate artifact — avoids duplicating hosting/build setup.
- Admin auth uses a separate signed httpOnly cookie (`souqratesx_admin_session`, distinct from the player session cookie) gated by the `ADMIN_PASSWORD` secret — not tied to any Telegram identity.
- Platform-wide tunables (economy rates, and placeholder keys for Adsgram/CPA offerwalls/Monlix/Bitlabs/Telegram Stars/Premium) are stored in the freeform `admin_settings` key-value table so new integrations can add settings without schema migrations.

## Product

- Tap-to-mine core loop with miner level upgrades and energy system
- Idle mining, passive income cards, and an 8-hour farming cycle
- Games tab: 3 mini-games for extra points — Speed Tap (10s tap sprint), Memory Match (card matching), Lucky Wheel (3 free daily spins). (A 4th game, "Tappy Dodge", was removed — its physics/lifecycle bugs were too costly to keep debugging.)
- Daily tasks: streak tracking, daily cipher (Morse code), daily spin wheel
- Referral system with trickling referral earnings
- Global leaderboard by lifetime points
- Real Telegram user identity and permanent server-side progress persistence (works across devices)
- Withdraw button is currently a placeholder — no real cash withdrawal flow yet
- Admin control panel at `/manager` (password-protected via `ADMIN_PASSWORD` secret): overview stats, user search/edit/ban/premium/stars/delete, platform settings (economy + placeholders for Adsgram/CPA/Monlix/Bitlabs/Stars/Premium keys), audit log
- Monetization is fully wired end-to-end and auto-activates once the admin pastes real keys into Admin Settings — no further code changes needed per provider:
  - `/config/public` exposes only non-secret "enabled" flags/prices derived from `admin_settings` (e.g. Adsgram enabled iff `adsgramBlockId` set; offerwalls enabled iff url+key set; Stars/Premium enabled iff `TELEGRAM_BOT_TOKEN` is present).
  - Adsgram: frontend loads the Adsgram SDK dynamically and calls `/earn/adsgram/reward` (server-authoritative; cooldown + daily cap enforced via `vault_users.adsWatchedToday/adsWatchedDate/lastAdRewardAt`). Additionally, `GET /earn/adsgram/postback?userId=[userId]&secret=...&txId=...` exists as a server-to-server Reward URL for Adsgram's dashboard (Adsgram requires the URL literally contain the substring `[userId]`) — validated against the `adsgramPostbackSecret` admin setting, dedup'd via `processed_transactions` when `txId` is sent, and shares the same cooldown/daily-cap/ban checks as the client-triggered path.
  - CPA/Monlix/Bitlabs: outbound offerwall links append `sub1=<telegramId>`; providers postback to `/earn/offerwall/postback?provider=...&telegramId=...&amount=...&secret=...` validated against the matching `*PostbackSecret` admin setting.
  - Telegram Stars: `/stars/invoice` creates a real Stars (XTR) invoice via the Bot API using `TELEGRAM_BOT_TOKEN`; `/telegram/webhook` auto-approves `pre_checkout_query` and credits `starsBalance` / extends `premiumExpiresAt` on `successful_payment`. Admin Settings has a "ربط Webhook الآن" (setup webhook) button calling `/admin/telegram/setup-webhook` — requires HTTPS, so it only succeeds after publishing (expected failure on localhost dev).
- Bot `/start` flow: `/admin/telegram/setup-webhook` now also calls `setMyCommands` (registers `/start`) and `setChatMenuButton` (sets a persistent "فتح التطبيق" web_app menu button next to the message box). The webhook handler (`artifacts/api-server/src/routes/telegramWebhook.ts`) replies to a `/start` message with a welcome text + an inline `web_app` button that opens the Mini App at the root domain. All three (webhook, commands, menu button) require HTTPS and are set together from the same admin action — must re-run "ربط Webhook الآن" after every deploy to a new domain.

## Security hardening (launch readiness)

- Telegram webhook is authenticated: `setWebhook` registers a `secret_token` (HMAC-derived from `SESSION_SECRET`), and `/telegram/webhook` rejects calls without a matching `X-Telegram-Bot-Api-Secret-Token` header — must re-run "ربط Webhook الآن" after changing `SESSION_SECRET` or deploying, or Telegram's calls get 403.
- CORS is restricted to the app's own domains (`REPLIT_DOMAINS` + dev domain) with credentials; cookies are `sameSite: lax` (app + API are same-origin via path routing).
- `is_banned` is enforced at login, state sync, ad rewards, offerwall credits, and banned users are hidden from the leaderboard.
- In-memory per-IP rate limits (behind `trust proxy: 1` so IPs can't be spoofed): auth 20/min, vault sync 60/min, adsgram 30/min, postbacks 60/min, admin login 5/min.
- All credit paths are atomic SQL increments; adsgram cooldown/daily-cap are re-checked inside the UPDATE's WHERE clause (no double-credit races). Offerwall credits capped at 1M/postback.
- `processed_transactions` table (`lib/db/src/schema/processedTransactions.ts`) is an idempotency ledger: Stars payments dedupe on `telegram_payment_charge_id`; offerwall postbacks dedupe on `txId`/`transId`/`tx` query param when the provider sends one.
- Server refuses to boot without `SESSION_SECRET`. Admin session tokens embed an issue timestamp and expire server-side after 12h.
- Client hydration is server-authoritative: on successful Telegram auth, ALL game fields are set from server state (defaults when empty) — stale localStorage never survives a server-side reset. Progress-mutating actions are no-op'd while the auth request is in flight so pre-hydration taps can't be lost/overwritten. The localStorage-only fallback outside Telegram is preserved.
- DB pool uses keepAlive + warm-up query at boot — remote Supabase pooler TLS handshake cost ~1s/query before this; don't remove it or every request slows down.
- DB is Supabase Postgres via `SUPABASE_DATABASE_URL` (pooler URL — the direct `db.*.supabase.co` host is IPv6-only and unreachable); falls back to `DATABASE_URL` if unset. All user balances were zeroed on 2026-07-09 to prepare for launch.

## User preferences

- User wants SouqratesX to eventually support real cash withdrawal, but explicitly deferred that in favor of first shipping real Telegram auth + persistent server-side progress.
- User will create Adsgram/CPA/Monlix/Bitlabs accounts and provide API keys later — build integrations "ready to activate" via the admin settings panel now, without blocking on real keys.

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`, and restart `api-server` after backend changes.
- `TELEGRAM_BOT_TOKEN` must match the actual bot used to launch the Mini App, or `initData` verification will always fail (frontend falls back to localStorage silently in that case).
- Local dev preview simulates a Telegram WebView but without a valid signed `initData`, so `/api/auth/telegram` will 401 in that environment — this is expected, not a bug.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
