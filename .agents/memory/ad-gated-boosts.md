---
name: Ad-gated boosts (non-point rewards)
description: How SouqratesX gates non-point rewards (energy refill, turbo) behind watching a fixed number of rewarded ads.
---

Some boosts (e.g. full energy refill, temporary turbo) are granted after watching a fixed count of rewarded ads (e.g. 3), rather than instantly. This is different from the Tasks-tab "watch ad for points" feature.

**Why:** energy/turbo are purely client-authoritative state (no server credit, no anti-cheat concern), so there's no need to route them through the reward engine (`reward_transactions`/`provider_logs`) which exists to protect real point/money credits from double-crediting and exploits. Reusing it here would be unnecessary complexity for a reward that isn't money-equivalent.

**How to apply:** implement as a local progress counter (0..N) per boost type, incremented each time a rewarded ad completes successfully (prefer whichever ad provider — Adsgram/Monetag — is enabled in `PublicConfig`), reset to 0 once the threshold is hit and the boost is granted directly via the existing client-state setters. Don't call the provider "claim ad reward" endpoints for this — those credit points server-side and are for the separate points-earning feature.
