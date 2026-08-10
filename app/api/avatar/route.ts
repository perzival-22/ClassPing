import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { check, LIMITS } from "@/lib/ratelimit";

/**
 * Avatar upload to Vercel Blob.
 *
 * Why this exists: for Pro (synced) users the avatar was a ~180KB base64 data
 * URI riding inside every sync PUT. Storing it in Blob and syncing just the URL
 * (~90 bytes) keeps those writes small. Free users never sync, so their avatar
 * happily stays a local data URI and never comes here.
 *
 * Graceful fallback: when BLOB_READ_WRITE_TOKEN isn't provisioned this returns
 * 501, and the client keeps the data URI it already has — behaviour is then
 * identical to before Blob existed.
 */

export const runtime = "nodejs";

/** Matches the client-side ceiling in lib/avatar.ts (~180KB of base64). */
const MAX_DATA_URL_CHARS = 240_000;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // No token → not configured. The client treats this as "keep the data URI".
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "blob_not_configured" }, { status: 501 });
  }

  // A couple of writes per avatar change, rarely — reuse the push budget.
  const rl = check(`avatar:${userId}`, LIMITS.push.limit, LIMITS.push.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { dataUrl?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const dataUrl = body.dataUrl;
  if (
    typeof dataUrl !== "string" ||
    !dataUrl.startsWith("data:image/") ||
    dataUrl.length > MAX_DATA_URL_CHARS
  ) {
    return NextResponse.json({ error: "invalid_avatar" }, { status: 400 });
  }

  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(5, comma); // e.g. "image/jpeg;base64"
  if (!meta.includes("base64")) {
    return NextResponse.json({ error: "invalid_avatar" }, { status: 400 });
  }
  const contentType = meta.split(";")[0] || "image/jpeg";
  const bytes = Buffer.from(dataUrl.slice(comma + 1), "base64");

  try {
    // A stable per-user key with overwrite means at most one blob per user —
    // re-uploading replaces it rather than accumulating orphans, and the URL
    // stays constant.
    const blob = await put(`avatars/${userId}.jpg`, bytes, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("[avatar] blob put failed", err);
    return NextResponse.json({ error: "upload_failed" }, { status: 502 });
  }
}
