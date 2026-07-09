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
- `lib/api-spec/openapi.yaml` — source of truth for all API contracts

## Architecture decisions

- Game state is stored as a single JSONB blob (`vault_users.state`) rather than normalized columns, mirroring the frontend's in-memory state shape to minimize migration churn as features evolve.
- `lifetimePoints` is kept as a separate denormalized int column on `vault_users` for fast leaderboard sorting.
- Telegram auth uses the official `initData` HMAC verification scheme (no OAuth/third-party auth library) plus a custom lightweight HMAC-signed httpOnly session cookie.
- The frontend gracefully falls back to localStorage-only progress when not running inside Telegram (e.g. local dev browser preview) — this fallback must be preserved.

## Product

- Tap-to-mine core loop with miner level upgrades and energy system
- Idle mining, passive income cards, and an 8-hour farming cycle
- Daily tasks: streak tracking, daily cipher (Morse code), daily spin wheel
- Referral system with trickling referral earnings
- Global leaderboard by lifetime points
- Real Telegram user identity and permanent server-side progress persistence (works across devices)
- Withdraw button is currently a placeholder — no real cash withdrawal flow yet

## User preferences

- User wants SouqratesX to eventually support real cash withdrawal, but explicitly deferred that in favor of first shipping real Telegram auth + persistent server-side progress.

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`, and restart `api-server` after backend changes.
- `TELEGRAM_BOT_TOKEN` must match the actual bot used to launch the Mini App, or `initData` verification will always fail (frontend falls back to localStorage silently in that case).
- Local dev preview simulates a Telegram WebView but without a valid signed `initData`, so `/api/auth/telegram` will 401 in that environment — this is expected, not a bug.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
