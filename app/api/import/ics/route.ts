import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isPro } from "@/lib/entitlements";
import { check, LIMITS } from "@/lib/ratelimit";
import { checkImportUrl } from "@/lib/url-guard";
import { parseIcs } from "@/lib/ics-import";

/**
 * Fetch and parse a calendar feed (Canvas / Blackboard / Moodle / Google
 * Classroom). Returns import candidates for the client to confirm — nothing is
 * saved here; the merge happens locally through the store, so the local-first
 * model is preserved.
 *
 * Pro-gated (server work, recurring value), and the fetch is defended:
 *   • the URL is screened for SSRF before we touch it (lib/url-guard),
 *   • redirects are NOT followed — a public URL that 302s to an internal one
 *     would sidestep that screen, so we reject the redirect instead,
 *   • the response is capped and time-boxed so a slow or enormous feed can't
 *     tie up the function.
 */

export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 3 * 1024 * 1024; // a huge personal feed is still < 1MB

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await isPro())) {
    return NextResponse.json(
      { error: "pro_required", message: "Calendar import is a Pro feature." },
      { status: 403 },
    );
  }

  const rl = check(
    `import:${userId}`,
    LIMITS.export.limit,
    LIMITS.export.windowMs,
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many imports. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.url !== "string") {
    return NextResponse.json({ error: "url_required" }, { status: 400 });
  }

  const guard = checkImportUrl(body.url);
  if (!guard.ok || !guard.url) {
    return NextResponse.json(
      { error: "blocked_url", message: guard.reason },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(guard.url, {
      // manual: a 3xx to an internal host must not be followed past the guard.
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: "text/calendar, text/plain, */*" },
    });
  } catch {
    clearTimeout(timer);
    return NextResponse.json(
      { error: "fetch_failed", message: "Couldn't reach that calendar link." },
      { status: 502 },
    );
  }
  clearTimeout(timer);

  if (res.status >= 300 && res.status < 400) {
    return NextResponse.json(
      {
        error: "redirect_blocked",
        message:
          "That link redirects elsewhere. Paste the direct .ics feed URL instead.",
      },
      { status: 400 },
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: "fetch_failed", message: `The feed returned ${res.status}.` },
      { status: 502 },
    );
  }

  // Read with a hard byte ceiling rather than trusting Content-Length.
  const reader = res.body?.getReader();
  if (!reader) {
    return NextResponse.json({ error: "empty_feed" }, { status: 502 });
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return NextResponse.json(
        { error: "feed_too_large", message: "That calendar feed is too large." },
        { status: 413 },
      );
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf-8");

  if (!text.includes("BEGIN:VCALENDAR")) {
    return NextResponse.json(
      {
        error: "not_a_calendar",
        message: "That link didn't return a calendar feed.",
      },
      { status: 400 },
    );
  }

  const result = parseIcs(text);
  return NextResponse.json(result);
}
