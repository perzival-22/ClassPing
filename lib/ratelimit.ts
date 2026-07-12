/**
 * Per-user rate limiting for the API routes.
 *
 * A fixed window held in module memory. On Vercel's Fluid Compute a function
 * instance is reused across many requests, so this genuinely throttles the
 * realistic abuse case (one authenticated account hammering an endpoint in a
 * loop). It is deliberately *not* a distributed limiter: counters aren't shared
 * between instances or regions, so a determined attacker spraying across cold
 * starts can exceed the nominal limit by a constant factor.
 *
 * That trade-off is fine here — both endpoints are already behind auth *and* a
 * paid Pro entitlement, so the blast radius is one paying account. If we ever
 * need a hard guarantee, swap the Map for a shared store (Upstash Redis via the
 * Vercel Marketplace) behind this same `check()` signature; no caller changes.
 */

interface Window {
  /** Requests seen in the current window. */
  count: number;
  /** Epoch ms when the current window expires. */
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Drop expired entries so a long-lived instance can't leak memory per user. */
function sweep(now: number) {
  if (windows.size < 1000) return;
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds the caller should wait before retrying. Only meaningful when !ok. */
  retryAfter: number;
}

/**
 * Count one request against `key`'s budget.
 *
 * @param key    Caller identity + route, e.g. `sync:user_2abc`.
 * @param limit  Requests allowed per window.
 * @param windowMs Window length in ms.
 */
export function check(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  w.count += 1;
  if (w.count > limit) {
    return { ok: false, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Budgets. Sized well above real usage so a normal student never sees a 429:
 * the client debounces sync pushes by 1.5s and pulls once per session, and a
 * calendar export is a deliberate button press.
 */
export const LIMITS = {
  /** Whole-document read/write against Postgres. */
  sync: { limit: 60, windowMs: 60_000 },
  /** Builds an .ics — real CPU, so a tighter budget. */
  export: { limit: 10, windowMs: 60_000 },
  /** Registering a push subscription — a couple of writes per device, rarely. */
  push: { limit: 20, windowMs: 60_000 },
} as const;
