// One-off end-to-end test of the daily-email cron against a real account.
//
// Temporarily rewrites the target user's synced doc so "today's last class
// just ended" is true, hits the production endpoint, then restores the exact
// original document in a finally block. updated_at is never touched, so the
// user's own device neither pulls the doctored doc nor loses its state —
// last-write-wins means their next real sync overwrites everything anyway.
//
// Run: node scripts/test-daily-email.mjs
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

const USER = "user_3GFTL2QkJDyIatC7cAC7lYSArVC";
const TZ = "Africa/Nairobi";
const BASE = "https://classping.space";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^\\s*${k}=(.+)$`, "m"))?.[1]?.trim();
const sql = neon(get("DATABASE_URL"));
const secret = get("CRON_SECRET");

const [row] = await sql`SELECT data FROM user_data WHERE user_id = ${USER}`;
if (!row) throw new Error("user row not found");
const original = row.data;

// Local wall-clock minutes in the target tz.
const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
}).formatToParts(new Date());
const val = (t) => Number(parts.find((p) => p.type === t).value);
const nowMins = val("hour") * 60 + val("minute");

// Make every class of today end 5 minutes ago, so lastEnd is inside the
// send window no matter what the real schedule says.
const doctored = {
  ...original,
  tz: TZ,
  classes: (original.classes ?? []).map((c) => ({
    ...c,
    start: Math.max(0, nowMins - 65),
    end: nowMins - 5,
  })),
};

try {
  await sql`
    UPDATE user_data SET data = ${JSON.stringify(doctored)}::jsonb
    WHERE user_id = ${USER}
  `;
  const res = await fetch(`${BASE}/api/cron/daily-email`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  console.log("endpoint:", res.status, await res.text());
} finally {
  await sql`
    UPDATE user_data SET data = ${JSON.stringify(original)}::jsonb
    WHERE user_id = ${USER}
  `;
  // Clear the dedupe row so tonight's organic digest still sends.
  const gone = await sql`
    DELETE FROM email_sent WHERE user_id = ${USER} RETURNING day
  `;
  console.log("restored original doc; cleared dedupe rows:", gone.length);
}
