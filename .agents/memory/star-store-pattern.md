---
name: Generic paid-feature store pattern
description: How to let an admin define arbitrary purchasable features (Telegram Stars store) without code changes per product.
---

Instead of hardcoding each purchasable product as an enum/string switch in both the invoice-creation route and the payment-webhook handler, model products as DB rows with a generic `effectType` enum (e.g. `points`, `energy_refill`, `turbo_boost`, `premium_days`) plus a single numeric `effectValue` whose meaning depends on `effectType`.

**Why:** The user wanted to add/edit/delete/price arbitrary paid features from the admin panel without further code changes each time. A hardcoded product map (or a `product` string enum in the API contract) requires a backend + OpenAPI + frontend change for every new SKU. A generic effect model lets the admin panel do full CRUD against one table, and the webhook/invoice routes stay static — they just interpret `effectType`/`effectValue` generically (switch by effectType, but never by specific product identity).

**How to apply:** When building any "admin defines N purchasable things, each granting some server-side effect" feature (IAP-style):
- Store products in their own table with `effectType` + `effectValue`, not one column per possible effect.
- Invoice/purchase APIs should take a `productId` (foreign key), not a `product` string enum — the enum locks you back into hardcoding.
- The webhook/fulfillment code applies the effect generically via a switch on `effectType` (not on product identity), so adding a new *instance* of an existing effect type (e.g. a second energy-refill SKU at a different price) requires zero code changes — only an admin-panel row.
- Only add a new `effectType` case (a real code change) when a genuinely new kind of server-side effect is needed, not for a new price/variant of an existing effect.
