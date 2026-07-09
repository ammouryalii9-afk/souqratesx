import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "SUPABASE_DATABASE_URL or DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString,
  ssl: process.env.SUPABASE_DATABASE_URL ? { rejectUnauthorized: false } : undefined,
  // Keep connections alive and reuse them — establishing a fresh TLS
  // connection to the remote pooler costs ~1s per query otherwise.
  keepAlive: true,
  max: 10,
  idleTimeoutMillis: 5 * 60 * 1000,
});

// Warm up one connection at boot so the first user request doesn't pay the
// TLS handshake cost.
pool
  .query("SELECT 1")
  .catch((err) => console.error("DB warm-up query failed:", err?.message ?? err));

export const db = drizzle(pool, { schema });

export * from "./schema";
