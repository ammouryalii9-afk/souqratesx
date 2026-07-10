---
name: Placeholder ad simulations
description: Some SouqratesX game-loop flows were originally built with a fake client-side timer standing in for a rewarded ad, instead of calling a real ad SDK.
---

Before real ad providers (Adsgram, Monetag) existed, at least one flow — "Transfer Earnings to Vault" in `VaultTab.tsx` — simulated watching a rewarded ad with a plain `setInterval` progress bar and text like "Simulating rewarded video...". It never called any ad SDK; it just delayed the claim by a fixed duration.

**Why:** when a user reported "an ad shows during transfer but it's not a paid ad — it's one you built," the cause was this leftover placeholder, not a bug in the real Adsgram/Monetag integration. Ad providers being correctly wired elsewhere (Tasks tab) doesn't mean every "watch an ad" touchpoint in the app actually calls them — some are still simulated stand-ins from before those providers existed.

**How to apply:** when auditing or extending ad-provider coverage, grep the frontend for dialogs/timers with ad-like copy ("Watching Ad", "Simulating", fixed-duration progress bars) that don't call `showAdsgramRewardedAd`/`showMonetagRewardedAd` (or future provider SDKs). Wire them to a real provider (falling back to the old fake-progress behavior only when no provider is configured, so the feature doesn't outright break for admins who haven't pasted keys yet).
