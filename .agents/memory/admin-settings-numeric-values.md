---
name: Admin settings numeric text fields
description: A "text"-type admin settings field can still get persisted as a JSON number in the freeform key/value settings table, breaking string-only coercion helpers.
---

`admin_settings` is a freeform JSONB key/value blob validated only as `z.record(z.string(), z.unknown())` — no per-key type enforcement server-side.

Any code that reads a settings value expected to be a string (e.g. an ID, URL, or key pasted by an admin) must coerce numbers too, not just check `typeof v === "string"`. If a value like a numeric ID (`"11266318"`) ends up stored as a JSON number instead of a string, a strict `typeof value === "string" ? value : ""` helper silently returns `""`, which looks like "not configured yet" (feature stays disabled) with no error surfaced anywhere.

**Why:** happened with a Monetag zone ID field — the value round-tripped through the admin UI as a number and got silently dropped by the settings-sync code, so the provider stayed disabled even after the admin saved a real value. No exception was thrown; the only symptom was `enabled: false` persisting after save.

**How to apply:** any `asString`/`asStr` helper reading from `admin_settings` (or similar freeform settings stores) should accept `typeof value === "number" && Number.isFinite(value)` and coerce via `String(value)`, in addition to the plain string case. Apply this consistently across all copies of such helpers (this codebase has near-duplicate ones in `lib/settings.ts`, `providers/manager.ts`, `providers/adsgram.ts`, `providers/monetag.ts`, `providers/offerwall.ts`) — fixing only one copy leaves the bug in the others.
