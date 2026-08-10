import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql, ensureSchema } from "@/lib/db";
import { check, LIMITS } from "@/lib/ratelimit";

/**
 * Per-stream email preferences.
 *
 * Deliberately *not* Pro-gated. Only Pro users receive these emails, but a
 * lapsed subscriber must still be able to turn them off — gating the off
 * switch behind an active subscription would be the worst possible failure
 * mode for a preference surface.
 *
 * An absent row means every stream is on (the historical default), so the
 * crons COALESCE to TRUE and no backfill was needed when this shipped.
 */

export const runtime = "nodejs";

interface Prefs {
  preClass: boolean;
  postClass: boolean;
  dailyDigest: boolean;
}

const DEFAULTS: Prefs = { preClass: true, postClass: true, dailyDigest: true };

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
  const rl = check(`prefs:${userId}`, LIMITS.prefs.limit, LIMITS.prefs.windowMs);
  if (!rl.ok) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      ),
    };
  }
  if (!sql) {
    return {
      ok: false,
      res: NextResponse.json({ error: "prefs_unavailable" }, { status: 503 }),
    };
  }
  return { ok: true, userId };
}

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.res;

  await ensureSchema();
  const rows = await sql!`
    SELECT pre_class, post_class, daily_digest
    FROM email_prefs WHERE user_id = ${g.userId}
  `;
  // The master switch an unsubscribe link flips. Surfaced so Settings can
  // explain why every stream looks off, and offer to turn mail back on.
  const optout = await sql!`
    SELECT 1 FROM email_optout WHERE user_id = ${g.userId}
  `;

  const prefs: Prefs =
    rows.length === 0
      ? DEFAULTS
      : {
          preClass: rows[0].pre_class === true,
          postClass: rows[0].post_class === true,
          dailyDigest: rows[0].daily_digest === true,
        };

  return NextResponse.json({ ...prefs, unsubscribedAll: optout.length > 0 });
}

export async function PUT(req: Request) {
  const g = await guard();
  if (!g.ok) return g.res;

  let body: Partial<Record<keyof Prefs, unknown>> & {
    unsubscribedAll?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Merge over current values so a partial PUT can't silently reset a stream
  // the caller didn't mention.
  await ensureSchema();
  const rows = await sql!`
    SELECT pre_class, post_class, daily_digest
    FROM email_prefs WHERE user_id = ${g.userId}
  `;
  const current: Prefs =
    rows.length === 0
      ? DEFAULTS
      : {
          preClass: rows[0].pre_class === true,
          postClass: rows[0].post_class === true,
          dailyDigest: rows[0].daily_digest === true,
        };

  const pick = (v: unknown, fallback: boolean) =>
    typeof v === "boolean" ? v : fallback;
  const next: Prefs = {
    preClass: pick(body.preClass, current.preClass),
    postClass: pick(body.postClass, current.postClass),
    dailyDigest: pick(body.dailyDigest, current.dailyDigest),
  };

  await sql!`
    INSERT INTO email_prefs (user_id, pre_class, post_class, daily_digest, updated_at)
    VALUES (${g.userId}, ${next.preClass}, ${next.postClass}, ${next.dailyDigest}, ${Date.now()})
    ON CONFLICT (user_id) DO UPDATE
      SET pre_class = EXCLUDED.pre_class,
          post_class = EXCLUDED.post_class,
          daily_digest = EXCLUDED.daily_digest,
          updated_at = EXCLUDED.updated_at
  `;

  // Turning any stream back on from Settings is an explicit re-subscribe, so
  // it must also clear the master opt-out an unsubscribe link may have set —
  // otherwise the toggle would look on and still deliver nothing.
  if (body.unsubscribedAll === false) {
    await sql!`DELETE FROM email_optout WHERE user_id = ${g.userId}`;
  }

  return NextResponse.json({ ok: true, ...next });
}
