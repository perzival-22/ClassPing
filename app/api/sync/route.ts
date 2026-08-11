import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isPro } from "@/lib/entitlements";
import { sql, ensureSchema } from "@/lib/db";
import { check, LIMITS } from "@/lib/ratelimit";

/**
 * Cloud sync (Pro): stores the user's whole ClassPing document with
 * last-write-wins semantics. GET pulls, PUT pushes. Scoped to the
 * authenticated Clerk user; entitlement re-checked server-side.
 */

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
  const rl = check(`sync:${userId}`, LIMITS.sync.limit, LIMITS.sync.windowMs);
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
      res: NextResponse.json({ error: "sync_unavailable" }, { status: 503 }),
    };
  }
  return { ok: true, userId };
}

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.res;

  await ensureSchema();
  const rows = await sql!`
    SELECT data, updated_at FROM user_data WHERE user_id = ${g.userId}
  `;
  if (rows.length === 0) {
    return NextResponse.json({ data: null, updatedAt: 0 });
  }
  return NextResponse.json({
    data: rows[0].data,
    updatedAt: Number(rows[0].updated_at),
  });
}

/**
 * Server-side bounds on the synced document. The client enforces its own
 * limits (240KB avatar cap in lib/avatar.ts, arrays that only grow by user
 * taps), but nothing stops a scripted client from PUTting arbitrary payloads —
 * and Neon bills on write throughput and storage. The size cap is the real
 * defense; the shape checks stay deliberately loose so optional fields added
 * by newer clients keep syncing (persisted-shape contract).
 */
const MAX_DOC_CHARS = 512 * 1024;
const MAX_ITEMS = 2000;
/** Mirror of MAX_ENCODED_CHARS in lib/avatar.ts — re-checked because the
    client-side cap is advisory to anyone talking to this route directly. */
const MAX_AVATAR_CHARS = 240_000;

function validDoc(data: Record<string, unknown>): boolean {
  // `notes` is item-capped alongside the rest. Its real constraint is length
  // rather than count — one note can be 20KB where a task is 200 bytes — and
  // that is enforced by MAX_DOC_CHARS above and by the client-side budget in
  // lib/notes.ts, which refuses the keystroke instead of discovering the
  // ceiling as a 413 that silently stops the account syncing.
  for (const key of ["classes", "tasks", "grades", "notes"]) {
    const v = data[key];
    if (v !== undefined && (!Array.isArray(v) || v.length > MAX_ITEMS)) {
      return false;
    }
  }
  const tz = data.tz;
  if (tz !== undefined && (typeof tz !== "string" || tz.length > 64)) {
    return false;
  }
  const profile = data.profile;
  if (profile !== undefined) {
    if (typeof profile !== "object" || profile === null || Array.isArray(profile)) {
      return false;
    }
    const avatar = (profile as Record<string, unknown>).avatarUrl;
    if (typeof avatar === "string" && avatar.length > MAX_AVATAR_CHARS) {
      return false;
    }
  }
  return true;
}

export async function PUT(req: Request) {
  const g = await guard();
  if (!g.ok) return g.res;

  // Cap before parsing: route handlers get no framework body limit (only
  // Vercel's ~4.5MB platform cap), and JSONB parse is CPU we pay for.
  const raw = await req.text();
  if (raw.length > MAX_DOC_CHARS) {
    return NextResponse.json({ error: "document_too_large" }, { status: 413 });
  }
  let body: { data?: unknown; updatedAt?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body.data !== "object" ||
    body.data === null ||
    Array.isArray(body.data) ||
    !validDoc(body.data as Record<string, unknown>)
  ) {
    return NextResponse.json({ error: "invalid_data" }, { status: 400 });
  }

  // Clamp the client clock. A device stamping the far future (hostile, or
  // just a phone set to 2099) would otherwise win last-write-wins forever,
  // silently bricking the account's sync with no path back.
  const now = Date.now();
  const claimed =
    typeof body.updatedAt === "number" && Number.isFinite(body.updatedAt)
      ? body.updatedAt
      : now;
  const updatedAt = Math.min(Math.max(claimed, 0), now + 5 * 60_000);

  await ensureSchema();
  // Last write wins: an older device can't clobber newer data. RETURNING
  // tells us whether this write actually applied, so a stale device isn't
  // told `ok` when its push was a no-op.
  const rows = await sql!`
    INSERT INTO user_data (user_id, data, updated_at)
    VALUES (${g.userId}, ${JSON.stringify(body.data)}::jsonb, ${updatedAt})
    ON CONFLICT (user_id) DO UPDATE
      SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
      WHERE user_data.updated_at <= EXCLUDED.updated_at
    RETURNING user_id
  `;
  return NextResponse.json({ ok: true, applied: rows.length > 0 });
}
