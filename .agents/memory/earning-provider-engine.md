---
name: Earning provider engine
description: How SouqratesX's ad/offerwall earning integrations are structured as a provider-agnostic engine, for anyone adding a new earning source.
---

Every earning integration (Adsgram, CPA, Monlix, Bitlabs, and any future one) implements the same `EarnProvider` interface (initialize/isEnabled/getOffers/verifyReward/rewardUser/healthCheck) rather than having bespoke route logic per provider.

**Why:** the user explicitly wanted "ease of integration" for future ad networks/offerwalls without needing new routes, new anti-cheat code, or new admin plumbing each time. Before this, Adsgram and offerwall crediting logic was duplicated per-route.

**How to apply:**
- A provider manager loads each provider's config from a DB table (auto-synced from the existing admin-settings key/value store on boot and after every settings save), and exposes a single unified offers endpoint.
- A single provider-independent reward engine handles verify → idempotent credit (via an idempotency ledger table) → logging → stats → referral bonus for every provider — do not special-case credit logic per provider.
- Adding a new provider = one new provider module + one registry line; no new routes needed.
- Response shapes/status codes of pre-existing routes (Adsgram reward/postback, offerwall postback) were preserved exactly during this refactor for backward compatibility — do this again for any future refactor of the earning system.
