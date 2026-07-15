# SouqratesX

Telegram Mini App (Play-to-Earn) — tap-mine SKP points, upgrade miners, farm passively, complete tasks. Progress synced permanently to Postgres.

## Run & Operate

```bash
pnpm --filter @workspace/api-server run dev      # API server (port 5000)
pnpm --filter @workspace/vaultx run dev          # Frontend
pnpm run typecheck                                # Full typecheck
pnpm --filter @workspace/api-spec run codegen    # Regenerate API hooks + Zod schemas (run after openapi.yaml changes)
pnpm --filter @workspace/db run push             # Push DB schema (dev only)
```

**Required secrets:** `SUPABASE_DATABASE_URL`, `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`, `ADMIN_PASSWORD`

After any backend change: restart `api-server` workflow. After publishing: re-run "ربط Webhook الآن" in Admin Settings.

## Stack

- pnpm workspaces · Node.js 24 · TypeScript 5.9
- API: Express 5 · DB: PostgreSQL + Drizzle ORM · Validation: Zod v4 + drizzle-zod
- Build: esbuild (CJS) · Frontend: React + Vite · Codegen: Orval (from OpenAPI spec)

## Key Files

| Path | Purpose |
|------|---------|
| `artifacts/vaultx/src/context/VaultContext.tsx` | Core game state, auth bootstrap, server sync |
| `artifacts/vaultx/src/lib/telegram.ts` | Telegram WebApp SDK helpers + `haptic()` |
| `artifacts/api-server/src/routes/auth.ts` | `initData` HMAC verification + session cookie |
| `artifacts/api-server/src/routes/vault.ts` | GET/PUT game state, leaderboard |
| `artifacts/api-server/src/routes/admin.ts` | Admin panel API (stats, users, settings, audit) |
| `artifacts/api-server/src/routes/squads.ts` | Squad CRUD + leaderboard |
| `artifacts/api-server/src/routes/pixels.ts` | Pixel market/buy/me + admin cycle management |
| `artifacts/api-server/src/providers/` | Provider Engine: Adsgram, offerwalls, manager, rewardEngine |
| `artifacts/api-server/src/lib/pendingBonus.ts` | `redeemPendingBonus()` — folds pending SKP at hydration |
| `artifacts/api-server/src/lib/skxCredit.ts` | `skpRewardFields()` (all rewards) · `skxCreditFields()` (pixels only) |
| `artifacts/api-server/src/lib/weeklyCredit.ts` | `weekKey()` + `creditedStateSql()` — every server-side point credit uses this |
| `artifacts/api-server/src/lib/settings.ts` | `getSettingsMap()` with 30s TTL cache |
| `artifacts/api-server/src/lib/referral.ts` | `linkReferrer()` + `awardReferralBonus()` |
| `artifacts/api-server/src/lib/squadSignup.ts` | Auto-join squad + credit owner as referrer at signup |
| `artifacts/api-server/src/index.ts` | Cluster setup · weekly prize job · daily reminders (PRIMARY only) |
| `artifacts/api-server/src/routes/telegramWebhook.ts` | Stars payments · /start handler |
| `artifacts/vaultx/src/admin/` | `/manager` admin panel frontend |
| `artifacts/vaultx/src/components/BonusRewardModal.tsx` | Animated SKP reward popup (count-up + haptic) |
| `lib/db/src/schema/vaultUsers.ts` | `vault_users` table — source of truth |
| `lib/db/src/schema/providers.ts` | `providers`, `provider_logs`, `reward_transactions`, `provider_statistics` |
| `lib/db/src/schema/pixels.ts` | `pixel_cycles`, `pixels`, `pixel_dividends` |
| `lib/api-spec/openapi.yaml` | Source of truth for all API contracts |

## Architecture Decisions

**State storage:** Single JSONB blob (`vault_users.state`) mirrors frontend shape; `lifetimePoints` is a separate column for leaderboard sorting.

**Dual currency (SKP / SKX):**
- **SKP** (soft) = `state.tempMiningPoints` — spendable on upgrades/skins, never withdrawable.
- **SKX** (hard) = `vault_users.skx_balance` — only withdrawable balance. `POST /vault/convert` converts SKP→SKX atomically at admin `skpToSkxConversionRate`% (default 5%).
- `claimSeq` in `PROTECTED_STATE_KEYS` guards `PUT /vault/me` — stale syncs racing a convert are dropped.

**Reward credit rule — ALL rewards = SKP via `pending_bonus_points`:**
- Every earning path (ads, offerwalls, referrals, partner tasks, sponsored ads, squad bonuses/milestones, weekly prizes) credits `vault_users.pending_bonus_points` via `skpRewardFields()`.
- Pixel dividends are the ONLY SKX exception (`skxCreditFields()`).
- `redeemPendingBonus()` folds pending into `state.tempMiningPoints` atomically at hydration (auth + GET /vault/me), returns `{ user, amount }`.
- Responses include `redeemedBonus`; frontend shows `BonusRewardModal` with count-up animation + haptic.
- **Frontend flows must NOT optimistically bump `tempMiningPoints`** — call `refreshFromServer()` instead. Optimistic bump + pending redemption = double credit via debounced PUT sync.

**Background credits:** Must go to `pending_bonus_points`, never `state.tempMiningPoints` directly — an online client's debounced `PUT /vault/me` sends stale tempMiningPoints and would erase the credit.

**Weekly leaderboard:** Resets lazily on first credit of the new week. Every rollover path must archive old score to `prevWeekKey`/`prevWeekPoints` before overwriting. Both fields + `weekKey` are in `PROTECTED_STATE_KEYS`.

**Anti-cheat:** `PUT /vault/me` clamps `lifetimePoints` increases above `maxPointsPerHourCap` (default 3M/hr). Progression fields are monotonic (miningLevel/maxEnergy/ownedSkins etc. clamp to max(server, client)).

**Admin panel:** Lives at `/manager` inside `vaultx` artifact. Separate signed httpOnly cookie (`souqratesx_admin_session`), expires 12h. Protected by `ADMIN_PASSWORD`.

**Telegram auth:** Official `initData` HMAC verification. Dev preview always 401s (no valid initData) — expected. Frontend falls back to localStorage outside Telegram; this fallback must be preserved.

**DB:** Supabase Postgres via `SUPABASE_DATABASE_URL` (pooler URL — direct host is IPv6-only). Pool uses keepAlive + warm-up query at boot; removing it adds ~1s/query.

## Product Features

- **Core loop:** Tap-mine · miner upgrades · energy system · 8h farm cycle · passive income cards
- **Games tab:** Speed Tap · Memory Match · Lucky Wheel (3 free daily spins)
- **Tasks tab:** Daily cipher (Morse) · daily combo · daily spin · streak tracking · partner tasks · sponsored ads · offerwalls
- **Squads:** Create/join/leave · viral invite via `startapp=squad_<id>` · leaderboard by summed lifetimePoints · one-time join bonus (`hasClaimedSquadBonus`)
- **Referrals:** Server-authoritative · `linkReferrer()` runs every login (idempotent) · milestones (1/5/10/25/50/100 invites) · 10% referral bonus on verified earning paths only
- **Pixels:** 6th tab · buy pixels with SKX · tiered pricing · 35% of ad revenue distributed as dividends per cycle
- **Weekly prizes:** Top-10 paid each Monday (1M/600k/400k/250k/150k/100k×5) · bilingual AR+EN DM · idempotent via `lastWeeklyPrizeWeekKey`
- **Daily reminders:** Bot DMs inactive users (>3 days) once/day · PRIMARY process only
- **Offline earnings:** Popup on return after ≥10 min · client-computed from `profitPerHour` · capped at 3h · bounded by `maxPointsPerHourCap`
- **Onboarding:** 3-step carousel + 5,000 SKP welcome gift · `hasClaimedWelcome` monotonic (sticky-true) in state merge
- **Skins Shop:** Buy cosmetic skins with SKP · prices in `VaultContext.SKINS`
- **Stars (XTR):** Real Telegram invoices · webhook auto-approves · effects applied server-side atomically
- **Bot /start:** Sets webhook + commands + menu button together via "ربط Webhook الآن" · requires HTTPS

## Monetization (Provider Engine)

All providers share the same pipeline: verify → idempotency (`reward_transactions`) → SKP credit → log → referral bonus.

Adding a new provider = one module + one line in `manager.ts`. Keys are pasted in Admin Settings; no code change needed to activate.

| Provider | Status |
|----------|--------|
| Adsgram (rewarded video + server postback) | Ready — paste `adsgramBlockId` |
| Onclicka rewarded video (`onclckvd.com/tma.js`) | Ready — paste `onclickaSpotId` |
| Onclicka inpage passive (`onclckmn.com/onclicka.js`) | Ready — paste `onclickaInpageId` |
| Monetag | Ready |
| CPA / Monlix / Bitlabs / Lootably / Revlum / AyeT / OfferToro / Torox / Adsterra / PropellerAds / CPALead / Adscend | Accounts pending approval |
| Telegram Stars | Ready (requires HTTPS + webhook setup) |

Each offerwall postback secret must be unique — a leaked secret on one network can't forge rewards on others.

## Security

- Webhook authenticated via HMAC-derived `secret_token` in `X-Telegram-Bot-Api-Secret-Token`
- CORS restricted to `REPLIT_DOMAINS` + dev domain · cookies `sameSite: lax`
- `is_banned` enforced at login, sync, ads, offerwalls · banned users hidden from leaderboard
- Per-IP rate limits: auth 20/min · vault 60/min · adsgram 30/min · postbacks 60/min · admin login 5/min · divided by worker count
- Withdrawals race-proof: deduct+insert in one DB transaction · partial unique index `one_pending_withdrawal_per_user` · admin approve/reject via `UPDATE ... WHERE status='pending' RETURNING`
- Stars purchases atomic `jsonb_set` SQL (no read-modify-write race)
- Partner-task verification fails CLOSED: API errors → 503, no benefit-of-doubt crediting
- Anti-cheat rate window has 5s floor (sub-second syncs can't inflate hourly cap)

## Gotchas

- Run `codegen` after every `openapi.yaml` change; restart `api-server` after backend changes.
- `TELEGRAM_BOT_TOKEN` must match the bot that launched the Mini App — mismatch → silent localStorage fallback.
- Local dev preview always gets 401 on `/api/auth/telegram` (no valid `initData`) — expected, not a bug.
- Re-run "ربط Webhook الآن" after every publish or `SESSION_SECRET` change.
- Onclicka has TWO different SDK scripts: rewarded video uses `js.onclckvd.com/tma.js`; inpage uses `js.onclckmn.com/onclicka.js`. Wrong script = eternal "SDK unavailable".

## User Preferences

- Real cash withdrawal deferred — ship Telegram auth + server-side progress first.
- Ad network keys (Adsgram/CPA/Monlix/Bitlabs) provided later — integrations ready to activate via Admin Settings.
