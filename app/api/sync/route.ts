import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isPro } from "@/lib/entitlements";
import { sql, ensureSchema } from "@/lib/db";

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

export async function PUT(req: Request) {
  const g = await guard();
  if (!g.ok) return g.res;

  let body: { data?: unknown; updatedAt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.data !== "object" || body.data === null) {
    return NextResponse.json({ error: "invalid_data" }, { status: 400 });
  }
  const updatedAt =
    typeof body.updatedAt === "number" && Number.isFinite(body.updatedAt)
      ? body.updatedAt
      : Date.now();

  await ensureSchema();
  // Last write wins: an older device can't clobber newer data.
  await sql!`
    INSERT INTO user_data (user_id, data, updated_at)
    VALUES (${g.userId}, ${JSON.stringify(body.data)}::jsonb, ${updatedAt})
    ON CONFLICT (user_id) DO UPDATE
      SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
      WHERE user_data.updated_at <= EXCLUDED.updated_at
  `;
  return NextResponse.json({ ok: true });
}
