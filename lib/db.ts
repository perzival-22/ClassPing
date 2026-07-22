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

  /**
   * Web Push subscriptions. Keyed by endpoint, not user: one student may have
   * the PWA installed on a phone, a tablet and a laptop, and each is a separate
   * subscription that must be pushed to individually.
   *
   * `tz` is load-bearing. Class times are stored as minutes-from-midnight with
   * no timezone (see ClassItem.start/end) — meaningful on-device against the
   * local clock, meaningless to a cron running in UTC. We record the browser's
   * IANA zone at subscribe time so the cron can work out what the user's own
   * wall clock currently reads.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint   text PRIMARY KEY,
      user_id    text NOT NULL,
      p256dh     text NOT NULL,
      auth       text NOT NULL,
      tz         text NOT NULL DEFAULT 'UTC',
      created_at bigint NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
      ON push_subscriptions (user_id)
  `;

  /**
   * One row per notification actually sent. The cron runs on an interval and
   * matches classes that ended within a window wider than that interval (so a
   * late or skipped run can still catch up), which means the same class can
   * match on two consecutive runs. The primary key is what makes the send
   * idempotent: we INSERT first and only push if the insert won the race, so a
   * student is never pinged twice about the same class on the same day — even
   * if two cron invocations overlap.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS push_sent (
      user_id  text NOT NULL,
      class_id text NOT NULL,
      day      text NOT NULL,
      sent_at  bigint NOT NULL,
      PRIMARY KEY (user_id, class_id, day)
    )
  `;

  /**
   * One row per end-of-day digest email actually sent. Same idempotency story
   * as push_sent: the cron INSERTs first and only emails if the insert won,
   * so overlapping runs can't double-send. Keyed per day, not per class —
   * the digest covers the whole school day in one message.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS email_sent (
      user_id text NOT NULL,
      day     text NOT NULL,
      sent_at bigint NOT NULL,
      PRIMARY KEY (user_id, day)
    )
  `;

  /**
   * Users who clicked the unsubscribe link in a digest. A row here means
   * never email this user again; deleting the row (no UI for it yet) would
   * re-enable. Kept separate from user_data so an opt-out survives even if
   * the synced document is rewritten wholesale.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS email_optout (
      user_id    text PRIMARY KEY,
      created_at bigint NOT NULL
    )
  `;

  schemaReady = true;
}
