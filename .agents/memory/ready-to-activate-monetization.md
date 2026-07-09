---
name: Ready-to-activate monetization pattern
description: How to wire multiple monetization providers (ads, offerwalls, in-app currency) so they auto-activate purely from admin-panel key entry, with no code changes or redeploy per provider.
---

Store all provider credentials/URLs in a freeform key-value settings table (no schema migration per provider). Expose a single public/non-secret config endpoint that derives boolean `enabled` flags by checking whether the required keys/urls are present (e.g. `enabled: !!blockId`), never exposing the secrets themselves.

**Why:** The user explicitly wanted "ready to activate" integrations before having real provider accounts — pasting a key into the admin settings UI should be the only action needed to turn a feature on for players, with zero additional deploys or code changes.

**How to apply:**
- Frontend always fetches the public config on load and gates each monetization UI element (button, purchase option) on its `enabled` flag rather than hardcoding provider availability.
- Reward-granting endpoints (ad rewards, offerwall postbacks, in-app purchases) must be server-authoritative: never trust client-reported completion, and enforce anti-abuse windows (cooldowns/daily caps) via dedicated DB columns, not client state.
- Postback/webhook endpoints from external providers should validate a shared secret stored alongside that provider's other settings, keyed by provider id.
