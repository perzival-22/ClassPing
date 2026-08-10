import { createHmac, timingSafeEqual } from "crypto";

/**
 * Svix webhook signature verification (Clerk signs its webhooks with Svix).
 *
 * Implemented against the documented scheme rather than pulling in the `svix`
 * package — same reasoning as lib/email.ts talking to Resend over plain fetch:
 * one call shape, and the dependency tree stays flat.
 *
 * Scheme: sign `${id}.${timestamp}.${body}` with HMAC-SHA256 under the
 * base64-decoded secret (the part after `whsec_`), base64 the result, and
 * compare against one of the space-delimited `v1,<sig>` entries in the
 * `svix-signature` header.
 */

/** Reject anything older/newer than this to blunt replay attacks. */
const TOLERANCE_MS = 5 * 60_000;

export function verifySvixSignature(
  secret: string | undefined,
  headers: Headers,
  rawBody: string,
): boolean {
  if (!secret) return false;
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) return false;

  const sentAt = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > TOLERANCE_MS) {
    return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  // The header may carry several signatures during a secret rotation; any one
  // matching is a pass.
  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    const given = Buffer.from(value, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      return true;
    }
  }
  return false;
}

/**
 * Pull the Clerk user id out of a webhook payload.
 *
 * Clerk's Billing payload shapes aren't published in the docs (the dashboard's
 * Event Catalog is the reference), so rather than hard-code one field path we
 * try the plausible ones and then fall back to scanning for anything shaped
 * like a Clerk user id. Subscription events are per-payer, so the only such id
 * in the payload is the subscriber's.
 */
export function findClerkUserId(payload: unknown): string | null {
  const isUserId = (v: unknown): v is string =>
    typeof v === "string" && /^user_[A-Za-z0-9]+$/.test(v);

  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): string | null => {
    if (depth > 6 || node === null || typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);

    const obj = node as Record<string, unknown>;
    // Prefer an explicitly named field before resorting to the scan.
    for (const key of ["user_id", "payer_id", "instance_user_id", "id"]) {
      if (isUserId(obj[key])) return obj[key] as string;
    }
    for (const value of Object.values(obj)) {
      if (isUserId(value)) return value;
      const nested = walk(value, depth + 1);
      if (nested) return nested;
    }
    return null;
  };

  return walk(payload, 0);
}
