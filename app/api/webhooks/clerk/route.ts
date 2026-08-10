import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { verifySvixSignature, findClerkUserId } from "@/lib/svix";

/**
 * Clerk billing webhook — keeps the server's entitlement snapshot honest.
 *
 * Why this exists: the notification crons run without a session, so they can't
 * call isPro(). Before this route, a cancelled subscriber kept receiving push
 * and all three email streams indefinitely — a paid feature leaking, and real
 * Resend quota spent on people who stopped paying.
 *
 * ClassPing sells exactly one plan (PRO_PLAN in lib/plan.ts), so any
 * subscription item ending *is* Pro ending. That's why nothing here has to
 * match a plan slug — a fragile thing to do against an undocumented payload.
 *
 * Configure in the Clerk Dashboard → Webhooks: point it at
 * /api/webhooks/clerk, subscribe to the subscription/subscriptionItem events,
 * and put the signing secret in CLERK_WEBHOOK_SIGNING_SECRET.
 */

export const runtime = "nodejs";

/**
 * Access is actually over. Note `subscriptionItem.canceled` is deliberately
 * absent: Clerk fires it when the user cancels, but a cancelled subscription
 * normally runs to the end of the paid period. Revoking on cancel would cut
 * off someone who has paid through the month.
 */
const REVOKE_EVENTS = new Set([
  "subscriptionItem.ended",
  "subscriptionItem.abandoned",
]);

/** Access is (re)confirmed. */
const GRANT_EVENTS = new Set([
  "subscription.active",
  "subscriptionItem.active",
]);

export async function POST(req: Request) {
  // Must read the raw body: the signature covers the exact bytes sent, so
  // re-serializing parsed JSON would break verification.
  const raw = await req.text();

  if (!verifySvixSignature(
    process.env.CLERK_WEBHOOK_SIGNING_SECRET,
    req.headers,
    raw,
  )) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event: { type?: unknown; data?: unknown };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const type = typeof event.type === "string" ? event.type : "";
  const revoke = REVOKE_EVENTS.has(type);
  const grant = GRANT_EVENTS.has(type);
  // 200 on events we don't act on: a non-2xx makes Svix retry forever.
  if (!revoke && !grant) {
    return NextResponse.json({ ok: true, ignored: type });
  }

  const userId = findClerkUserId(event.data ?? event);
  if (!userId) {
    // Worth surfacing — it means the payload shape moved and entitlements are
    // silently going stale. The id itself is opaque, so logging it is fine.
    console.error("[clerk-webhook] no user id in payload for", type);
    return NextResponse.json({ ok: true, skipped: "no_user_id" });
  }
  if (!sql) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  await ensureSchema();
  const pro = grant;
  await sql`
    INSERT INTO entitlements (user_id, pro, updated_at)
    VALUES (${userId}, ${pro}, ${Date.now()})
    ON CONFLICT (user_id) DO UPDATE
      SET pro = EXCLUDED.pro, updated_at = EXCLUDED.updated_at
  `;

  // Push stops at the source: drop this user's device subscriptions so the
  // post-class cron has nothing to send to. Re-subscribing from Settings goes
  // through /api/push/subscribe, which re-checks isPro() server-side.
  if (revoke) {
    await sql`DELETE FROM push_subscriptions WHERE user_id = ${userId}`;
  }

  return NextResponse.json({ ok: true, type, pro });
}
