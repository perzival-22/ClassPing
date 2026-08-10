import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * The classic set is enforced outright — none of it can break the app:
 * the site never runs in a frame, always serves over HTTPS on Vercel, and
 * requests no powerful browser features.
 *
 * The CSP ships as Report-Only first, on purpose. Clerk's widget loads
 * scripts and workers from our production Clerk origin and Cloudflare's
 * challenge iframe, and an enforced policy with one origin wrong locks
 * every user out of sign-in. Watch the browser console (and any reports)
 * for violations across sign-in, OAuth, upgrade, and settings flows for a
 * week or two, then rename the header to `Content-Security-Policy`.
 */

// Production Clerk frontend API (decoded from the publishable key).
const CLERK_ORIGIN = "https://clerk.classping.space";

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // 'unsafe-inline'/'unsafe-eval': Next.js inline runtime + clerk-js. Try
  // dropping 'unsafe-eval' once report-only shows it clean in production.
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${CLERK_ORIGIN} https://challenges.cloudflare.com`,
  `connect-src 'self' ${CLERK_ORIGIN} https://clerk-telemetry.com`,
  // data: — avatars can be inline data URIs (lib/avatar.ts); the blob host —
  // avatars uploaded to Vercel Blob; img.clerk.com — OAuth profile pictures.
  "img-src 'self' data: blob: https://img.clerk.com https://*.public.blob.vercel-storage.com",
  "style-src 'self' 'unsafe-inline'",
  `frame-src ${CLERK_ORIGIN} https://challenges.cloudflare.com`,
  // Service worker + Clerk's web workers.
  "worker-src 'self' blob:",
  "media-src 'self'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
