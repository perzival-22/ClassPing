import { createHmac, timingSafeEqual } from "crypto";

/**
 * Transactional email via Resend's REST API.
 *
 * Plain fetch instead of the `resend` SDK — we make exactly one call shape
 * (send an HTML email), and the raw endpoint keeps the dependency tree flat.
 *
 * The sender must be an address on a domain verified in the Resend dashboard
 * (SPF + DKIM records added at the DNS host). Until RESEND_API_KEY is set,
 * `emailConfigured` is false and callers degrade instead of throwing — the
 * same pattern lib/push.ts uses for missing VAPID keys.
 */

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "ClassPing <no-reply@classping.space>";

/** False when the API key isn't configured — callers degrade instead of throwing. */
export const emailConfigured = Boolean(apiKey);

/**
 * Absolute origin for links inside emails. Email clients have no concept of a
 * relative URL, so every href must be fully qualified. APP_URL wins when set;
 * otherwise Vercel's production-domain env fills in on deployed builds.
 */
export const appBaseUrl =
  process.env.APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * Send one HTML email. Returns false on any failure — the caller treats a
 * failed send like a failed push: log, leave the dedupe row in place, move on.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error("[email] send failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed", err);
    return false;
  }
}

/* ── unsubscribe links ─────────────────────────────────────
   The link in the email footer must work from any device with no login —
   the reader taps it inside Gmail, not inside the PWA. So the URL itself
   carries proof of who it belongs to: an HMAC of the user id, signed with a
   server secret. Nobody can forge an opt-out for someone else's account
   without the secret, and there's no token table to store or expire. */

const linkSecret = process.env.EMAIL_LINK_SECRET ?? process.env.CRON_SECRET;

export function unsubscribeToken(userId: string): string | null {
  if (!linkSecret) return null;
  return createHmac("sha256", linkSecret).update(userId).digest("hex");
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = unsubscribeToken(userId);
  if (!expected || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function unsubscribeUrl(userId: string): string | null {
  const token = unsubscribeToken(userId);
  if (!token) return null;
  return `${appBaseUrl}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${token}`;
}
