import { beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "crypto";

/**
 * Unsubscribe link signing.
 *
 * `lib/email.ts` reads its secret at module load, so the env has to be set
 * before the first import — hence the dynamic import in beforeAll.
 */
const SECRET = "test-email-link-secret";
const USER = "user_3GCvKbMk2g7N7BXeCBMF0QDpM5o";

let unsubscribeToken: (u: string) => string | null;
let verifyUnsubscribeToken: (u: string, t: string) => boolean;

beforeAll(async () => {
  process.env.EMAIL_LINK_SECRET = SECRET;
  const mod = await import("./email");
  unsubscribeToken = mod.unsubscribeToken;
  verifyUnsubscribeToken = mod.verifyUnsubscribeToken;
});

/** The pre-timestamp format still sitting in already-delivered inboxes. */
const legacyToken = (userId: string) =>
  createHmac("sha256", SECRET).update(userId).digest("hex");

describe("unsubscribeToken", () => {
  it("mints a timestamped token", () => {
    expect(unsubscribeToken(USER)).toMatch(/^\d{10}\.[0-9a-f]{64}$/);
  });

  it("round-trips", () => {
    expect(verifyUnsubscribeToken(USER, unsubscribeToken(USER)!)).toBe(true);
  });
});

describe("verifyUnsubscribeToken", () => {
  it("still accepts the legacy bare-digest format", () => {
    // Load-bearing: rejecting these would silently break the unsubscribe link
    // in every email already delivered.
    expect(verifyUnsubscribeToken(USER, legacyToken(USER))).toBe(true);
  });

  it("rejects a legacy digest belonging to someone else", () => {
    expect(verifyUnsubscribeToken(USER, legacyToken("user_other"))).toBe(false);
  });

  it("rejects a token issued for a different user", () => {
    expect(verifyUnsubscribeToken("user_other", unsubscribeToken(USER)!)).toBe(
      false,
    );
  });

  it("accepts a token just inside the 90-day window", () => {
    const ts = Math.floor((Date.now() - 89 * 86400_000) / 1000);
    const mac = createHmac("sha256", SECRET).update(`${USER}.${ts}`).digest("hex");
    expect(verifyUnsubscribeToken(USER, `${ts}.${mac}`)).toBe(true);
  });

  it("rejects an expired token", () => {
    const ts = Math.floor((Date.now() - 91 * 86400_000) / 1000);
    const mac = createHmac("sha256", SECRET).update(`${USER}.${ts}`).digest("hex");
    expect(verifyUnsubscribeToken(USER, `${ts}.${mac}`)).toBe(false);
  });

  it("rejects a tampered timestamp", () => {
    const token = unsubscribeToken(USER)!;
    const [ts, mac] = token.split(".");
    expect(verifyUnsubscribeToken(USER, `${Number(ts) - 1}.${mac}`)).toBe(false);
  });

  it("returns false rather than throwing on multi-byte input", () => {
    // 64 multi-byte characters pass a naive `.length === 64` check but decode
    // to 128 bytes, which made timingSafeEqual throw a 500 on a public route.
    expect(() => verifyUnsubscribeToken(USER, "é".repeat(64))).not.toThrow();
    expect(verifyUnsubscribeToken(USER, "é".repeat(64))).toBe(false);
  });

  it("rejects malformed tokens", () => {
    for (const bad of ["", "nope", "1.2", "..", `${Date.now()}.`, "z".repeat(64)]) {
      expect(verifyUnsubscribeToken(USER, bad)).toBe(false);
    }
  });
});
