---
name: In-app admin panel via pathname-gated route
description: How SouqratesX's /manager admin panel is wired into the existing vaultx artifact instead of a separate artifact.
---

Build a super-admin control panel as a client-side pathname check in the root artifact's `main.tsx` (e.g. `window.location.pathname.startsWith("/manager")` renders an `AdminApp` tree instead of the normal `App`), rather than registering a brand-new artifact.

**Why:** The admin panel is part of the same product (same domain/branding/purpose) and the artifact already has SPA rewrites (`/* -> /index.html`) in production, so any path resolves to the same bundle. Creating a separate artifact would duplicate hosting/build/workflow setup for no benefit.

**How to apply:** Use a distinct signed httpOnly session cookie for admin auth (different name from the player session cookie) gated by a secret password (e.g. `ADMIN_PASSWORD`), with its own `requireAdmin` middleware in the API server. Store freeform/evolving admin-configurable settings (feature toggles, third-party API keys not yet available, economy tuning) in a generic key-value JSONB table rather than adding schema columns per setting — avoids migrations as new integrations (ad networks, offerwalls, surveys, subscriptions) get added over time.
