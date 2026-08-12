import { describe, expect, it } from "vitest";
import { emailAllowed } from "./godmodeAccess";

/**
 * The door is closed by default and opens for exactly one list. Both halves of
 * that sentence are worth a test: a gate that fails open is worse than no gate,
 * and a gate that fails closed on a trailing space gets "fixed" by being
 * loosened.
 */
describe("the godmode allowlist", () => {
  const LIST = "kelvinmusiomi99@gmail.com";

  it("lets a listed address through", () => {
    expect(emailAllowed("kelvinmusiomi99@gmail.com", LIST)).toBe(true);
  });

  it("turns everyone else away", () => {
    expect(emailAllowed("someone@else.com", LIST)).toBe(false);
    expect(emailAllowed("kelvinmusiomi99@gmail.co", LIST)).toBe(false);
    // Not a substring match — a suffix must not be enough.
    expect(emailAllowed("evilkelvinmusiomi99@gmail.com", LIST)).toBe(false);
  });

  /** Unset, empty or whitespace-only means nobody, never everybody. */
  it("is closed by default", () => {
    for (const raw of [undefined, "", "   ", ",", ", ,"]) {
      expect(emailAllowed("kelvinmusiomi99@gmail.com", raw), String(raw)).toBe(
        false,
      );
    }
  });

  it("has nobody to admit when nobody is signed in", () => {
    for (const email of [undefined, null, "", "  "]) {
      expect(emailAllowed(email, LIST), String(email)).toBe(false);
    }
  });

  it("ignores case and stray whitespace on both sides", () => {
    expect(emailAllowed("Kelvinmusiomi99@Gmail.com", LIST)).toBe(true);
    expect(emailAllowed("  kelvinmusiomi99@gmail.com  ", LIST)).toBe(true);
    expect(
      emailAllowed("kelvinmusiomi99@gmail.com", "  KELVINMUSIOMI99@GMAIL.COM "),
    ).toBe(true);
  });

  it("reads a multi-address list", () => {
    const list = "a@x.com, b@y.com ,c@z.com";
    for (const e of ["a@x.com", "b@y.com", "c@z.com"]) {
      expect(emailAllowed(e, list), e).toBe(true);
    }
    expect(emailAllowed("d@w.com", list)).toBe(false);
  });
});
