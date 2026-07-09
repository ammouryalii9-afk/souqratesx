---
name: Sponsored ads feature
description: Admin-created paid ads that notify via Telegram and appear as claimable tasks
---

Admin can create a "sponsored ad" (title/description/image/link/reward points) from the admin panel. Two effects fire from one create action:

1. Optional Telegram broadcast notification — reuses the existing broadcast-job table/runner rather than building a separate notification pipeline.
2. The ad becomes a claimable task in the player-facing Tasks tab: user opens the link, then claims the reward once.

**Why:** Reusing the broadcast infra avoids duplicating Telegram send logic/rate limiting; a separate ad-claims table (unique on ad+user) gives idempotent claiming without touching the anti-cheat point-sync path.

**How to apply:** Claim crediting must go through the same atomic-increment + `awardReferralBonus` pattern used elsewhere (never trust client-submitted point deltas). Public `GET /ads` requires an authenticated player session — 401 in local dev browser preview (no valid Telegram `initData`) is expected, not a bug.
