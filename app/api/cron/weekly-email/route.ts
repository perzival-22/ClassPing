import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { sql, ensureSchema } from "@/lib/db";
import { authorizeCron } from "@/lib/cron-auth";
import {
  appBaseUrl,
  emailConfigured,
  sendEmail,
  unsubscribeUrl,
} from "@/lib/email";
import { fmtTime, localClock } from "@/lib/time";

/**
 * The Sunday "week ahead" email.
 *
 * Every other email this app sends fires *during* the school day, which means
 * they only ever reach someone already in term rhythm. Sunday evening is when
 * students actually plan, and it's the moment a lapsed user is most winnable
 * back — so this is the cheapest re-engagement available on top of
 * infrastructure that already exists.
 *
 * Shows the week's classes grouped by day, plus anything due in the next
 * seven days, exams first.
 */

// Clerk's backend client and Node crypto (HMAC unsubscribe links) — no edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Local hour the send window opens, and how long it stays open. */
const SEND_FROM_MINS = 18 * 60; // 18:00 local
const WINDOW_MINS = 150; // …through ~20:30, absorbing a late cron run

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** Only the fields this job reads out of the synced document. */
interface StoredClass {
  id: string;
  name: string;
  days: number[];
  start: number;
  end: number;
  room?: string;
  archived?: boolean;
}

interface StoredTask {
  id: string;
  title: string;
  classId: string;
  due: string;
  done?: boolean;
  kind?: string;
}

interface UserRow {
  user_id: string;
  data: {
    classes?: StoredClass[];
    tasks?: StoredTask[];
    tz?: string;
  } | null;
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

function isValidTask(t: unknown): t is StoredTask {
  const k = t as StoredTask;
  return (
    !!k &&
    typeof k.id === "string" &&
    typeof k.title === "string" &&
    typeof k.due === "string"
  );
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderWeekAhead(
  classes: StoredClass[],
  tasks: StoredTask[],
  classNameById: (id: string) => string | undefined,
  unsubscribe: string | null,
): string {
  const dayRows = DAY_NAMES.map((name, dow) => {
    const todays = classes
      .filter((c) => c.days.includes(dow))
      .sort((a, b) => a.start - b.start);
    if (todays.length === 0) {
      return `<tr><td style="padding:7px 0;border-bottom:1px solid #EFEDF6;">
        <div style="font-size:13px;font-weight:600;color:#221C44;">${name}</div>
        <div style="font-size:13px;color:#ADA9C6;margin-top:2px;">No classes</div>
      </td></tr>`;
    }
    const items = todays
      .map(
        (c) =>
          `<div style="font-size:13px;color:#7A759C;margin-top:2px;">${fmtTime(
            c.start,
          )} · ${esc(c.name)}${c.room ? ` · ${esc(c.room)}` : ""}</div>`,
      )
      .join("");
    return `<tr><td style="padding:7px 0;border-bottom:1px solid #EFEDF6;">
      <div style="font-size:13px;font-weight:600;color:#221C44;">${name}</div>
      ${items}
    </td></tr>`;
  }).join("");

  const dueRows =
    tasks.length === 0
      ? `<div style="font-size:14px;color:#7A759C;">Nothing due in the next 7 days. 🎉</div>`
      : tasks
          .map((t) => {
            const cls = classNameById(t.classId);
            const isExam = t.kind === "exam";
            const due = new Date(t.due);
            const when = due.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
            return `<div style="font-size:14px;color:#221C44;margin-bottom:7px;">
              ${isExam ? `<span style="background:#FFF0D6;color:#A96A00;font-size:11px;font-weight:700;padding:2px 6px;border-radius:9px;">EXAM</span> ` : ""}
              ${esc(t.title)}
              <span style="color:#ADA9C6;">— ${esc(when)}${cls ? ` · ${esc(cls)}` : ""}</span>
            </div>`;
          })
          .join("");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F4F2FB;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2FB;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fff;border-radius:20px;padding:28px;">
      <tr><td>
        <div style="font-size:20px;font-weight:700;color:#221C44;">Your week ahead</div>
        <div style="font-size:14px;color:#7A759C;margin-top:6px;line-height:1.5;">
          Here's what's coming up. A couple of minutes now saves a scramble later.
        </div>

        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#ADA9C6;margin-top:22px;">CLASSES</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
          ${dayRows}
        </table>

        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#ADA9C6;margin-top:22px;">DUE THIS WEEK</div>
        <div style="margin-top:8px;">${dueRows}</div>

        <a href="${appBaseUrl}/home" style="display:block;margin-top:24px;background:#5b54e8;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:14px;font-size:16px;font-weight:600;">Open ClassPing</a>
      </td></tr>
    </table>
    ${
      unsubscribe
        ? `<div style="font-size:12px;color:#ADA9C6;margin-top:16px;">
             <a href="${unsubscribe}" style="color:#ADA9C6;">Unsubscribe</a>
           </div>`
        : ""
    }
  </td></tr>
</table>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
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
      AND COALESCE(
        (SELECT p.weekly FROM email_prefs p WHERE p.user_id = u.user_id),
        TRUE)
      AND COALESCE(
        (SELECT e.pro FROM entitlements e WHERE e.user_id = u.user_id),
        TRUE)
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
    // Sunday evening, in the user's own timezone.
    if (clock.dow !== 6) continue;
    if (clock.mins < SEND_FROM_MINS) continue;
    if (clock.mins - SEND_FROM_MINS > WINDOW_MINS) continue;

    // Archived terms are history — never plan a week around them.
    const classes = (user.data?.classes ?? [])
      .filter(isValidClass)
      .filter((c) => !c.archived);
    const allTasks = (user.data?.tasks ?? []).filter(isValidTask);

    const weekEnd = now.getTime() + 7 * 86400_000;
    const upcoming = allTasks
      .filter((t) => {
        if (t.done) return false;
        const due = new Date(t.due).getTime();
        return Number.isFinite(due) && due <= weekEnd;
      })
      // Exams first, then soonest — the highest-stakes thing leads.
      .sort((a, b) => {
        const ax = a.kind === "exam" ? 0 : 1;
        const bx = b.kind === "exam" ? 0 : 1;
        if (ax !== bx) return ax - bx;
        return a.due.localeCompare(b.due);
      });

    // Nothing to say — don't send an empty email just because it's Sunday.
    if (classes.length === 0 && upcoming.length === 0) continue;

    const claim = await sql`
      INSERT INTO email_weekly_sent (user_id, day, sent_at)
      VALUES (${user.user_id}, ${clock.day}, ${now.getTime()})
      ON CONFLICT (user_id, day) DO NOTHING
      RETURNING user_id
    `;
    if (claim.length === 0) continue;

    let address: string | undefined;
    try {
      const cu = await clerk.users.getUser(user.user_id);
      address =
        cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)
          ?.emailAddress ?? cu.emailAddresses[0]?.emailAddress;
    } catch (err) {
      console.error("[weekly-email] clerk lookup failed", user.user_id, err);
    }
    if (!address) {
      skipped++;
      continue;
    }

    const nameById = (id: string) => classes.find((c) => c.id === id)?.name;
    const ok = await sendEmail(
      address,
      upcoming.length > 0
        ? `Your week ahead — ${upcoming.length} thing${upcoming.length === 1 ? "" : "s"} due`
        : "Your week ahead",
      renderWeekAhead(classes, upcoming, nameById, unsubscribeUrl(user.user_id)),
    );
    if (ok) sent++;
  }

  await sql`DELETE FROM email_weekly_sent WHERE sent_at < ${now.getTime() - 30 * 86400_000}`;

  return NextResponse.json({ ok: true, checked: users.length, sent, skipped });
}
