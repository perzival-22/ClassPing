import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isPro } from "@/lib/entitlements";
import { sql, ensureSchema } from "@/lib/db";
import { pushConfigured } from "@/lib/push";
import { check, LIMITS } from "@/lib/ratelimit";

/**
 * Web Push subscription registry (Pro).
 *
 * POST   — register this device (or refresh its timezone).
 * DELETE — unregister it, when the user turns notifications off.
 *
 * Pro-gated to match /api/sync: the post-class cron reads a user's schedule out
 * of `user_data`, and only Pro users' schedules are ever uploaded there. A free
 * user's classes live solely in localStorage, so there'd be nothing to send.
 */

// web-push signs with Node's crypto — this route can't run on the edge.
export const runtime = "nodejs";

async function guard(): Promise<
  { ok: true; userId: string } | { ok: false; res: NextResponse }
> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      res: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  if (!(await isPro())) {
    return {
      ok: false,
      res: NextResponse.json({ error: "pro_required" }, { status: 403 }),
    };
  }
  const rl = check(`push:${userId}`, LIMITS.push.limit, LIMITS.push.windowMs);
  if (!rl.ok) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      ),
    };
  }
  if (!sql || !pushConfigured) {
    return {
      ok: false,
      res: NextResponse.json({ error: "push_unavailable" }, { status: 503 }),
    };
  }
  return { ok: true, userId };
}

/** A PushSubscription as `subscription.toJSON()` serializes it. */
interface SubscriptionBody {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  tz?: unknown;
}

export async function POST(req: Request) {
  const g = await guard();
  if (!g.ok) return g.res;

  let body: SubscriptionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const authKey = body.keys?.auth;
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    typeof p256dh !== "string" ||
    typeof authKey !== "string"
  ) {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  }

  // Trust but verify the client's timezone: it's interpolated into a Postgres
  // query and then fed to Intl, so bound it to plausible IANA shape and length.
  const tz =
    typeof body.tz === "string" &&
    body.tz.length <= 64 &&
    /^[A-Za-z0-9+_\-/]+$/.test(body.tz)
      ? body.tz
      : "UTC";

  await ensureSchema();

  // The endpoint is the identity of the device. Re-subscribing (a new browser
  // session, a refreshed timezone, or a subscription the browser rotated) must
  // update the existing row rather than duplicate it. Re-binding user_id also
  // covers a shared device where a second student signs in: the endpoint follows
  // whoever subscribed most recently, so the previous user stops being pushed to
  // it instead of leaking their class names onto someone else's lock screen.
  await sql!`
    INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, tz, created_at)
    VALUES (${endpoint}, ${g.userId}, ${p256dh}, ${authKey}, ${tz}, ${Date.now()})
    ON CONFLICT (endpoint) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          p256dh  = EXCLUDED.p256dh,
          auth    = EXCLUDED.auth,
          tz      = EXCLUDED.tz
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const g = await guard();
  if (!g.ok) return g.res;

  let endpoint: unknown;
  try {
    endpoint = (await req.json())?.endpoint;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof endpoint !== "string") {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  }

  await ensureSchema();
  // Scoped to the caller so nobody can unsubscribe another user's device by
  // guessing an endpoint.
  await sql!`
    DELETE FROM push_subscriptions
    WHERE endpoint = ${endpoint} AND user_id = ${g.userId}
  `;

  return NextResponse.json({ ok: true });
}
