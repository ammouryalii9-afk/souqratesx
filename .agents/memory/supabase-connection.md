---
name: Supabase connection gotchas
description: Why the app must use the Supabase pooler URL and how the DB env vars resolve
---

- The direct Supabase connection host (`db.<ref>.supabase.co:5432`) is IPv6-only and does NOT resolve from the Replit environment (`getaddrinfo ENOTFOUND`). Always ask for the **Session/Transaction pooler** URL (`aws-0-<region>.pooler.supabase.com`).
- **Why:** hit this exact failure when first wiring `SUPABASE_DATABASE_URL`; the fix was re-requesting the pooler string from the user.
- **How to apply:** any new Postgres client, drizzle-kit push, or script must use `SUPABASE_DATABASE_URL` (pooler) with `ssl: { rejectUnauthorized: false }`. `DATABASE_URL` (Replit Helium DB) is runtime-managed and only a fallback.
- Production deployments need `SUPABASE_DATABASE_URL` present in the production environment too — dev and prod share the same Supabase DB.
