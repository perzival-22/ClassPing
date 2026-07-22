// One-off diagnostic: what does the daily-email cron see for each user?
// Run: node scripts/inspect-users.mjs   (reads DATABASE_URL from .env.local)
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = env.match(/^\s*DATABASE_URL=(.+)$/m)?.[1]?.trim();
const sql = neon(url);

const rows = await sql`
  SELECT u.user_id, u.data,
    (SELECT count(*) FROM push_subscriptions s WHERE s.user_id = u.user_id) AS subs
  FROM user_data u
`;
for (const r of rows) {
  const d = r.data ?? {};
  const classes = (d.classes ?? []).map(
    (c) => `${c.name} days=[${c.days}] ${c.start}-${c.end}`,
  );
  console.log(r.user_id, "tz=" + (d.tz ?? "none"), "subs=" + r.subs);
  for (const c of classes) console.log("   ", c);
}
