// One-off connectivity check: creates the sync table if needed and counts rows.
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(".env.local", "utf8");
const m = env.match(/^DATABASE_URL=(.+)$/m);
if (!m) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}
const sql = neon(m[1].trim().replace(/^["']|["']$/g, ""));
await sql`
  CREATE TABLE IF NOT EXISTS user_data (
    user_id    text PRIMARY KEY,
    data       jsonb NOT NULL,
    updated_at bigint NOT NULL
  )
`;
const r = await sql`SELECT count(*)::int AS n FROM user_data`;
console.log(`DB OK — user_data table ready, ${r[0].n} row(s).`);
