import type { NextRequest } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email";

/**
 * One-click unsubscribe from ClassPing email.
 *
 * Reached from an email client, so there is no session to lean on — the link
 * itself proves ownership via the HMAC token minted in lib/email.ts. Returns a
 * plain HTML page rather than JSON because a human is looking at it.
 *
 * The GET only *offers* to unsubscribe; the POST behind the button is what
 * writes. Corporate mail scanners and link prefetchers fetch every URL in an
 * inbox, and a state-changing GET would let them silently opt people out of
 * mail they still want.
 */

export const runtime = "nodejs";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(title: string, body: string, status = 200, form?: string): Response {
  return new Response(
    `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;display:flex;min-height:100dvh;align-items:center;justify-content:center;background:#F4F2FB;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:360px;padding:32px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#221C44;">${title}</div>
    <div style="font-size:14px;color:#7A759C;margin-top:10px;line-height:1.5;">${body}</div>
    ${form ?? ""}
  </div>
</body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Nothing here should sit in a shared cache, and the page must never
        // be prefetched into one on a user's behalf.
        "Cache-Control": "no-store",
      },
    },
  );
}

const BAD_LINK = () =>
  page(
    "That link didn't work",
    "It may be incomplete or expired — open the most recent ClassPing email and tap unsubscribe there, or turn email off in Settings.",
    400,
  );

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("u");
  const token = req.nextUrl.searchParams.get("t");
  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
    return BAD_LINK();
  }

  // Confirmation only — the write happens on POST.
  return page(
    "Unsubscribe from ClassPing email?",
    "You'll stop receiving class reminders and the end-of-day digest. Push reminders on your devices aren't affected.",
    200,
    `<form method="POST" style="margin-top:22px;">
      <input type="hidden" name="u" value="${esc(userId)}">
      <input type="hidden" name="t" value="${esc(token)}">
      <button type="submit" style="width:100%;padding:15px;border:0;border-radius:15px;background:#5b54e8;color:#fff;font-size:16px;font-weight:600;cursor:pointer;">Yes, unsubscribe me</button>
    </form>
    <div style="font-size:13px;color:#ADA9C6;margin-top:14px;">You can turn email back on any time in Settings.</div>`,
  );
}

export async function POST(req: NextRequest) {
  // Accept the token from the form body, falling back to the query string so
  // an RFC 8058 List-Unsubscribe-Post from a mail client also works.
  let userId = req.nextUrl.searchParams.get("u");
  let token = req.nextUrl.searchParams.get("t");
  try {
    const form = await req.formData();
    userId = (form.get("u") as string | null) ?? userId;
    token = (form.get("t") as string | null) ?? token;
  } catch {
    /* no form body — query string it is */
  }

  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
    return BAD_LINK();
  }
  if (!sql) {
    return page(
      "Something went wrong",
      "We couldn't update your preferences just now. Please try again later.",
      503,
    );
  }

  await ensureSchema();
  await sql`
    INSERT INTO email_optout (user_id, created_at)
    VALUES (${userId}, ${Date.now()})
    ON CONFLICT (user_id) DO NOTHING
  `;

  return page(
    "You're unsubscribed",
    "No more emails from ClassPing. Push reminders on your devices aren't affected, and you can turn email back on any time in Settings.",
  );
}
