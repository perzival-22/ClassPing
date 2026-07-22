import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { sql, ensureSchema } from "@/lib/db";
import {
  appBaseUrl,
  emailConfigured,
  sendEmail,
  unsubscribeUrl,
} from "@/lib/email";
import { fmtTime, localClock } from "@/lib/time";

/**
 * End-of-day assignment digest, by email.
 *
 * Runs every 30 minutes. For each synced user, works out their local clock;
 * once the last class of their school day has ended, sends one email listing
 * today's classes and asking whether any came with an assignment. "Yes" links
 * into the Add Assignment screen pre-filled with that class; "No" lands on a
 * small sign-off page.
 *
 * The email complements the push nudge (/api/cron/post-class), which fires
 * after *each* class: push is per-class and immediate, email is one per day
 * after the whole day wraps. Same Pro-only constraint for the same reason —
 * only synced (Pro) schedules exist server-side to read.
 */

// Clerk's backend client and Node crypto (HMAC unsubscribe links) — no edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Send only within this window after the day's last class ends. Wide enough
 * that a couple of skipped cron runs still deliver, narrow enough that a
 * newly-deployed cron doesn't email people at midnight about a morning class.
 */
const WINDOW_MINS = 120;

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
  data: { classes?: StoredClass[]; tz?: string } | null;
  /** Most recent push subscription's timezone — fallback when the doc has none. */
  sub_tz: string | null;
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

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The digest itself. Table-and-inline-style HTML because that is still the
 * only thing email clients render consistently — no external CSS, no flexbox.
 */
function renderDigest(classes: StoredClass[], unsubscribe: string | null): string {
  const rows = classes
    .map(
      (c) => `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #EFEDF7;">
            <div style="font-size:15px;font-weight:600;color:#221C44;">${esc(c.name)}</div>
            <div style="font-size:13px;color:#7A759C;margin-top:2px;">${fmtTime(c.start)} – ${fmtTime(c.end)}</div>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #EFEDF7;text-align:right;">
            <a href="${appBaseUrl}/tasks/new?class=${encodeURIComponent(c.id)}"
               style="display:inline-block;background:#5B54E8;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 14px;border-radius:10px;">
              Yes, add it
            </a>
          </td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F4F2FB;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2FB;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;">
        <tr>
          <td style="padding:28px 24px 8px;text-align:center;">
            <div style="font-size:13px;font-weight:600;letter-spacing:1px;color:#EE5137;">CLASSES DONE FOR TODAY</div>
            <div style="font-size:22px;font-weight:700;color:#221C44;margin-top:8px;line-height:1.3;">
              Did any of today&rsquo;s classes come with an assignment?
            </div>
            <div style="font-size:14px;color:#7A759C;margin-top:8px;">
              Log it now while it&rsquo;s fresh &mdash; we&rsquo;ll keep you on track.
            </div>
          </td>
        </tr>
        <tr><td style="padding:16px 12px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
          </table>
        </td></tr>
        <tr>
          <td style="padding:16px 24px 28px;text-align:center;">
            <a href="${appBaseUrl}/email/dismissed"
               style="display:inline-block;background:#F0EFF6;color:#5A5578;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:12px;">
              No, I&rsquo;m good
            </a>
          </td>
        </tr>
      </table>
      <div style="max-width:440px;padding:16px 8px;font-size:12px;color:#9A95B8;text-align:center;">
        You&rsquo;re getting this because end-of-day reminders are on in ClassPing.${
          unsubscribe
            ? ` <a href="${unsubscribe}" style="color:#9A95B8;">Unsubscribe</a>`
            : ""
        }
      </div>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without this check
  // the endpoint is a public button that emails every user on demand.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!sql || !emailConfigured) {
    return NextResponse.json({ error: "email_unavailable" }, { status: 503 });
  }

  await ensureSchema();
  const now = new Date();

  // Every synced user who hasn't unsubscribed. The lateral subquery pulls the
  // newest push subscription's timezone as a fallback for documents synced
  // before the client started including `tz`.
  const users = (await sql`
    SELECT u.user_id, u.data,
      (SELECT s.tz FROM push_subscriptions s
       WHERE s.user_id = u.user_id
       ORDER BY s.created_at DESC LIMIT 1) AS sub_tz
    FROM user_data u
    WHERE NOT EXISTS (SELECT 1 FROM email_optout o WHERE o.user_id = u.user_id)
  `) as unknown as UserRow[];

  const clerk = await clerkClient();
  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    const clock = localClock(user.data?.tz ?? user.sub_tz ?? "", now);
    if (!clock) {
      skipped++; // no usable timezone — better silent than wrong-hour
      continue;
    }
    // The app only plots Mon–Fri.
    if (clock.dow > 4) continue;

    const classes = (user.data?.classes ?? []).filter(isValidClass);
    const todays = classes
      .filter((c) => c.days.includes(clock.dow))
      .sort((a, b) => a.start - b.start);
    if (todays.length === 0) continue;

    // "End of the day" means the last class has ended — someone whose day
    // finishes at 11 AM gets asked at 11 AM, not at some fixed evening hour.
    const lastEnd = Math.max(...todays.map((c) => c.end));
    if (clock.mins < lastEnd || clock.mins - lastEnd > WINDOW_MINS) continue;

    // Claim the send before doing it — same idempotency dance as the push
    // cron. The primary key guarantees at most one digest per user per day
    // even if two invocations overlap.
    const claim = await sql`
      INSERT INTO email_sent (user_id, day, sent_at)
      VALUES (${user.user_id}, ${clock.day}, ${now.getTime()})
      ON CONFLICT (user_id, day) DO NOTHING
      RETURNING user_id
    `;
    if (claim.length === 0) continue;

    // The email address lives in Clerk, not in our tables — look it up per
    // send. If the account has somehow lost its address, skip quietly.
    let address: string | undefined;
    try {
      const cu = await clerk.users.getUser(user.user_id);
      address =
        cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)
          ?.emailAddress ?? cu.emailAddresses[0]?.emailAddress;
    } catch (err) {
      console.error("[daily-email] clerk lookup failed", user.user_id, err);
    }
    if (!address) {
      skipped++;
      continue;
    }

    const ok = await sendEmail(
      address,
      "Any assignments from today's classes?",
      renderDigest(todays, unsubscribeUrl(user.user_id)),
    );
    if (ok) sent++;
  }

  // Old dedupe rows have done their job; stop the table growing forever.
  await sql`DELETE FROM email_sent WHERE sent_at < ${now.getTime() - 3 * 86400_000}`;

  return NextResponse.json({ ok: true, checked: users.length, sent, skipped });
}
