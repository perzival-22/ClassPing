/**
 * SSRF guard for the ICS import, which fetches a URL the user pastes in.
 *
 * The threat: a URL like http://169.254.169.254/latest/meta-data or
 * http://localhost:5432 would make our server reach into the cloud metadata
 * endpoint or an internal service and hand the response back. We only ever
 * *parse* the response as calendar text, but a reflected body is still a leak.
 *
 * This is best-effort at the hostname layer: it rejects non-HTTP schemes,
 * literal private/loopback/link-local IPs, and obvious internal hostnames. It
 * does NOT resolve DNS, so a public hostname pointing at a private address
 * (DNS rebinding) is not caught here — the deployment's network egress rules
 * are the backstop for that. Kept as a pure function so it's unit-testable.
 */

/** Reserved IPv4 ranges that must never be fetched server-side. */
function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return true; // malformed — reject
  const [a, b] = o;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // private
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    a >= 224 // multicast / reserved
  );
}

function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    h === "::1" || // loopback
    h === "::" ||
    h.startsWith("fe80") || // link-local
    h.startsWith("fc") || // unique local
    h.startsWith("fd") ||
    h.startsWith("::ffff:") // IPv4-mapped — could wrap a private v4
  );
}

export interface UrlCheck {
  ok: boolean;
  /** Present when ok — the normalized URL safe to hand to fetch(). */
  url?: string;
  /** Present when !ok — a user-facing reason. */
  reason?: string;
}

export function checkImportUrl(raw: string): UrlCheck {
  // webcal:// is how calendar feeds are commonly shared. Rewrite the scheme
  // in the string before parsing: the URL API refuses to switch a non-special
  // scheme like webcal: to a special one like https: after the fact.
  const input = raw.trim().replace(/^webcal:\/\//i, "https://");

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, reason: "That doesn't look like a valid link." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http(s) calendar links are supported." };
  }

  const host = parsed.hostname.toLowerCase();
  const blockedHost =
    host === "localhost" ||
    host === "metadata" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    isPrivateIpv4(host) ||
    isPrivateIpv6(host);

  if (blockedHost) {
    return { ok: false, reason: "That link points somewhere we can't fetch." };
  }

  return { ok: true, url: parsed.toString() };
}
