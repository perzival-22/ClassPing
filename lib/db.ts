import { neon } from "@neondatabase/serverless";

/**
 * Neon Postgres, provisioned via the Vercel Marketplace. One row per user:
 * the whole store document as JSONB plus a last-write-wins timestamp —
 * exactly mirroring the client's localStorage model.
 *
 * When DATABASE_URL isn't set (e.g. before provisioning), `sql` is null and
 * the sync API responds 503; the app itself keeps working offline-first.
 */
export const sql = process.env.DATABASE_URL
  ? neon(process.env.DATABASE_URL)
  : null;

let schemaReady = false;

export async function ensureSchema() {
  if (!sql || schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS user_data (
      user_id    text PRIMARY KEY,
      data       jsonb NOT NULL,
      updated_at bigint NOT NULL
    )
  `;
  schemaReady = true;
}
