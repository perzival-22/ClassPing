import type { NextRequest } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email";

/**
 * One-click unsubscribe from the end-of-day digest.
 *
 * Reached from an email client, so there is no session to lean on — the link
 * itself proves ownership via the HMAC token minted in lib/email.ts. Returns a
 * plain HTML page rather than JSON because a human is looking at it.
 */

export const runtime = "nodejs";

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;display:flex;min-height:100dvh;align-items:center;justify-content:center;background:#F4F2FB;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:360px;padding:32px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#221C44;">${title}</div>
    <div style="font-size:14px;color:#7A759C;margin-top:10px;line-height:1.5;">${body}</div>
  </div>
</body>
</html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("u");
  const token = req.nextUrl.searchParams.get("t");

  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
    return page(
      "That link didn't work",
      "It may be incomplete — try tapping the unsubscribe link in the email again.",
      400,
    );
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
    "No more end-of-day emails from ClassPing. Push reminders on your devices aren't affected.",
  );
}
