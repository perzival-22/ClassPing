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
 * Per-class post-class assignment email.
 *
 * Runs every 5 minutes. For each synced Pro user who hasn't opted out, finds
 * the class that just ended and sends an email asking whether it came with an
 * assignment. This is the email counterpart to the push nudge in
 * /api/cron/post-class — push fires per-class immediately, and this does the
 * same via email for users who prefer or also want email.
 *
 * Distinct from the end-of-day digest (/api/cron/daily-email), which sends one
 * summary covering the whole school day. This fires right after each class ends.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Wide enough to survive GitHub Actions schedule lag. */
const WINDOW_MINS = 20;

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

function renderPostClassEmail(
  cls: StoredClass,
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
            <div style="font-size:13px;font-weight:600;letter-spacing:1px;color:#EE5137;">CLASS JUST ENDED</div>
            <div style="font-size:22px;font-weight:700;color:#221C44;margin-top:8px;line-height:1.3;">
              Did ${esc(cls.name)} come with an assignment?
            </div>
            <div style="font-size:14px;color:#7A759C;margin-top:8px;">
              Log it now while it&rsquo;s fresh &mdash; we&rsquo;ll keep you on track.
              <br />
              <span style="font-size:13px;color:#9A95B8;">${fmtTime(cls.start)} &ndash; ${fmtTime(cls.end)}</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px 10px;text-align:center;">
            <a href="${appBaseUrl}/tasks/new?class=${encodeURIComponent(cls.id)}"
               style="display:inline-block;background:#5B54E8;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:12px;">
              Yes, add assignment
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 24px 28px;text-align:center;">
            <a href="${appBaseUrl}/email/dismissed"
               style="display:inline-block;background:#F0EFF6;color:#5A5578;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:12px;">
              No, I&rsquo;m good
            </a>
          </td>
        </tr>
      </table>
      <div style="max-width:440px;padding:16px 8px;font-size:12px;color:#9A95B8;text-align:center;">
        You&rsquo;re getting this because after-class reminders are on in ClassPing.${
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

    // Most recently ended class within the lookback window.
    const justEnded = todays
      .filter((c) => c.end <= clock.mins && clock.mins - c.end <= WINDOW_MINS)
      .sort((a, b) => b.end - a.end)[0];
    if (!justEnded) continue;

    const claim = await sql`
      INSERT INTO email_post_class_sent (user_id, class_id, day, sent_at)
      VALUES (${user.user_id}, ${justEnded.id}, ${clock.day}, ${now.getTime()})
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
      console.error("[post-class-email] clerk lookup failed", user.user_id, err);
    }
    if (!address) {
      skipped++;
      continue;
    }

    const ok = await sendEmail(
      address,
      `Any assignments from ${justEnded.name}?`,
      renderPostClassEmail(justEnded, unsubscribeUrl(user.user_id)),
    );
    if (ok) sent++;
  }

  await sql`DELETE FROM email_post_class_sent WHERE sent_at < ${now.getTime() - 3 * 86400_000}`;

  return NextResponse.json({ ok: true, checked: users.length, sent, skipped });
}
