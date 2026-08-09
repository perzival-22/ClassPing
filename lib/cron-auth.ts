import { createHash, timingSafeEqual } from "crypto";

/**
 * Shared bearer-token check for the cron routes.
 *
 * The caller (GitHub Actions) sends `Authorization: Bearer $CRON_SECRET`.
 * Without this check every cron endpoint is a public button that emails or
 * pushes to the entire user base on demand — middleware deliberately leaves
 * these routes open to Clerk so the runner doesn't need a session.
 *
 * Both sides are hashed before comparing: `timingSafeEqual` demands
 * equal-length inputs, and hashing gives us that for free while removing
 * the early-exit timing signal a plain `!==` leaks byte by byte.
 */
export function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (!secret || !header) return false;
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}
