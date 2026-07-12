import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { sendPush, pushConfigured, type StoredSubscription } from "@/lib/push";
import { fmtTime, localClock } from "@/lib/time";

/**
 * Post-class nudge.
 *
 * Runs every 5 minutes. For each user with a push subscription, works out what
 * their local clock reads, finds the class that just ended, and pushes "Did
 * this class come with an assignment?" with Yes/No actions.
 *
 * Why the server has the schedule at all: Pro users' whole store document is
 * synced to `user_data` by /api/sync, so their classes are already here. That
 * is also why the feature is Pro-only — a free user's schedule never leaves
 * their phone, so there is nothing for this job to read.
 */

// web-push signs with Node's crypto — this route can't run on the edge.
export const runtime = "nodejs";
// Never serve a cached result; the whole point is that each run sees "now".
export const dynamic = "force-dynamic";

/**
 * How far back to look for a class that ended.
 *
 * Deliberately wider than the 5-minute cron interval, so a late or skipped run
 * still catches the class rather than missing it forever. The overlap that
 * creates is harmless: `push_sent` makes the send idempotent.
 */
const WINDOW_MINS = 12;

/** Only the fields this job actually reads out of the synced document. */
interface StoredClass {
  id: string;
  name: string;
  days: number[];
  start: number;
  end: number;
}

interface UserRow {
  user_id: string;
  tz: string;
  data: { classes?: StoredClass[] } | null;
}

function isValidClass(c: unknown): c is StoredClass {
  const k = c as StoredClass;
  return (
    !!k &&
    typeof k.id === "string" &&
    typeof k.name === "string" &&
    Array.isArray(k.days) &&
    typeof k.start === "number" &&
    typeof k.end === "number"
  );
}

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without this check
  // the endpoint is a public button that spams every user's phone on demand.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!sql || !pushConfigured) {
    return NextResponse.json({ error: "push_unavailable" }, { status: 503 });
  }

  await ensureSchema();
  const now = new Date();

  // One row per subscribed user: their synced schedule, plus the timezone of
  // the device they most recently subscribed from — the best available guess at
  // where they physically are right now.
  const users = (await sql`
    SELECT DISTINCT ON (s.user_id) s.user_id, s.tz, u.data
    FROM push_subscriptions s
    JOIN user_data u ON u.user_id = s.user_id
    ORDER BY s.user_id, s.created_at DESC
  `) as unknown as UserRow[];

  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    const clock = localClock(user.tz, now);
    if (!clock) {
      skipped++; // unrecognized timezone — better silent than wrong-hour
      continue;
    }
    // The app only plots Mon–Fri.
    if (clock.dow > 4) continue;

    const classes = (user.data?.classes ?? []).filter(isValidClass);
    const todays = classes.filter((c) => c.days.includes(clock.dow));

    // The class that just ended. If two ended inside the window (back-to-back
    // classes), the most recent one wins — the student is walking out of *that*
    // one, and we'd rather ask once than fire two notifications at once.
    const justEnded = todays
      .filter((c) => c.end <= clock.mins && clock.mins - c.end <= WINDOW_MINS)
      .sort((a, b) => b.end - a.end)[0];
    if (!justEnded) continue;

    // Claim the send before doing it. If a previous run already notified this
    // user about this class today — or a concurrent run is doing it right now —
    // the insert is a no-op and we bail. This, not the window arithmetic, is
    // what guarantees exactly one notification per class per day.
    const claim = await sql`
      INSERT INTO push_sent (user_id, class_id, day, sent_at)
      VALUES (${user.user_id}, ${justEnded.id}, ${clock.day}, ${now.getTime()})
      ON CONFLICT (user_id, class_id, day) DO NOTHING
      RETURNING class_id
    `;
    if (claim.length === 0) continue;

    // What to say if they tap "No". The service worker can't work this out —
    // it only sees the payload — so decide it here, while we have the schedule.
    const next = todays
      .filter((c) => c.start > clock.mins)
      .sort((a, b) => a.start - b.start)[0];
    const dismiss = next
      ? `Enjoy ${next.name} at ${fmtTime(next.start)} 👋`
      : "Have a great rest of your day 👋";

    const subs = (await sql`
      SELECT endpoint, p256dh, auth
      FROM push_subscriptions
      WHERE user_id = ${user.user_id}
    `) as unknown as StoredSubscription[];

    // Push to every device the user has installed, not just the newest.
    const results = await Promise.allSettled(
      subs.map((sub) =>
        sendPush(sub, {
          kind: "post-class",
          title: `${justEnded.name} just ended`,
          body: "Did this class come with an assignment?",
          url: `/tasks/new?class=${encodeURIComponent(justEnded.id)}`,
          promptUrl: `/prompt?class=${encodeURIComponent(justEnded.id)}`,
          tag: `post-class:${justEnded.id}:${clock.day}`,
          dismiss,
        }),
      ),
    );
    if (results.some((r) => r.status === "fulfilled" && r.value)) sent++;
  }

  // Yesterday's dedupe rows have done their job. Without this the table grows
  // by one row per class per school day, forever.
  await sql`DELETE FROM push_sent WHERE sent_at < ${now.getTime() - 3 * 86400_000}`;

  return NextResponse.json({ ok: true, checked: users.length, sent, skipped });
}
