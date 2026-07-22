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
 * Pre-class email reminder.
 *
 * Runs every 5 minutes. For each synced Pro user who hasn't opted out, finds
 * any class whose reminder window ("remindBefore" minutes before start) overlaps
 * the current local time and sends a heads-up email. The reminder lead time is
 * the one the user picked when creating the class (10 / 15 / 30 / 60 min).
 *
 * Pro-only for the same reason as every other server-side notification: only
 * synced (Pro) schedules exist server-side to read.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How far past the reminder fire-time to still count it as "now". Sized wider
 * than the 5-minute cron interval so a late GitHub Actions run doesn't silently
 * drop the reminder.
 */
const WINDOW_MINS = 20;

interface StoredClass {
  id: string;
  name: string;
  days: number[];
  start: number;
  end: number;
  remindBefore: number;
}

interface UserRow {
  user_id: string;
  data: { classes?: StoredClass[]; tz?: string } | null;
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
    typeof k.end === "number" &&
    typeof k.remindBefore === "number" &&
    k.remindBefore > 0
  );
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderReminderEmail(
  cls: StoredClass,
  minsUntil: number,
  unsubscribe: string | null,
): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F4F2FB;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2FB;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;">
        <tr>
          <td style="padding:28px 24px 8px;text-align:center;">
            <div style="font-size:13px;font-weight:600;letter-spacing:1px;color:#5B54E8;">CLASS REMINDER</div>
            <div style="font-size:22px;font-weight:700;color:#221C44;margin-top:8px;line-height:1.3;">
              ${esc(cls.name)} starts soon
            </div>
            <div style="font-size:14px;color:#7A759C;margin-top:8px;">
              Starting at ${fmtTime(cls.start)} &mdash; that&rsquo;s in about ${minsUntil} minute${minsUntil === 1 ? "" : "s"}.
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px 28px;text-align:center;">
            <a href="${appBaseUrl}/week"
               style="display:inline-block;background:#5B54E8;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:12px;">
              Open ClassPing
            </a>
          </td>
        </tr>
      </table>
      <div style="max-width:440px;padding:16px 8px;font-size:12px;color:#9A95B8;text-align:center;">
        You&rsquo;re getting this because class reminders are on in ClassPing.${
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
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!sql || !emailConfigured) {
    return NextResponse.json({ error: "email_unavailable" }, { status: 503 });
  }

  await ensureSchema();
  const now = new Date();

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
      skipped++;
      continue;
    }
    if (clock.dow > 4) continue;

    const classes = (user.data?.classes ?? []).filter(isValidClass);
    const todays = classes.filter((c) => c.days.includes(clock.dow));

    // Find the first class whose reminder window contains "now":
    // the reminder fires at (start - remindBefore). We accept up to WINDOW_MINS
    // past that moment so a delayed cron still delivers.
    const toRemind = todays.find((c) => {
      const reminderAt = c.start - c.remindBefore;
      return (
        clock.mins >= reminderAt &&
        clock.mins < c.start &&
        clock.mins - reminderAt <= WINDOW_MINS
      );
    });
    if (!toRemind) continue;

    const minsUntil = toRemind.start - clock.mins;

    // Claim the send before doing it — same INSERT-first idempotency pattern as
    // every other cron in this app.
    const claim = await sql`
      INSERT INTO email_reminder_sent (user_id, class_id, day, sent_at)
      VALUES (${user.user_id}, ${toRemind.id}, ${clock.day}, ${now.getTime()})
      ON CONFLICT (user_id, class_id, day) DO NOTHING
      RETURNING class_id
    `;
    if (claim.length === 0) continue;

    let address: string | undefined;
    try {
      const cu = await clerk.users.getUser(user.user_id);
      address =
        cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)
          ?.emailAddress ?? cu.emailAddresses[0]?.emailAddress;
    } catch (err) {
      console.error("[pre-class-email] clerk lookup failed", user.user_id, err);
    }
    if (!address) {
      skipped++;
      continue;
    }

    const ok = await sendEmail(
      address,
      `${toRemind.name} starts in ${minsUntil} minute${minsUntil === 1 ? "" : "s"}`,
      renderReminderEmail(toRemind, minsUntil, unsubscribeUrl(user.user_id)),
    );
    if (ok) sent++;
  }

  await sql`DELETE FROM email_reminder_sent WHERE sent_at < ${now.getTime() - 3 * 86400_000}`;

  return NextResponse.json({ ok: true, checked: users.length, sent, skipped });
}
