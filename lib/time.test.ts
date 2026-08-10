import { describe, expect, it } from "vitest";
import { fmtTime, localClock } from "./time";

/** The app's convention: 0 = Mon … 6 = Sun, unlike JS getDay(). */
const expectedDow = (d: Date) => (d.getUTCDay() + 6) % 7;

describe("fmtTime", () => {
  it("formats minutes-from-midnight as 12-hour time", () => {
    expect(fmtTime(510)).toBe("8:30 AM");
    expect(fmtTime(0)).toBe("12:00 AM");
    expect(fmtTime(720)).toBe("12:00 PM");
    expect(fmtTime(1439)).toBe("11:59 PM");
    expect(fmtTime(780)).toBe("1:00 PM");
  });

  it("pads minutes", () => {
    expect(fmtTime(605)).toBe("10:05 AM");
  });
});

describe("localClock", () => {
  it("derives the wall clock in a given zone", () => {
    const instant = new Date("2026-08-10T09:15:00Z");
    const clock = localClock("UTC", instant);
    expect(clock).not.toBeNull();
    expect(clock!.mins).toBe(9 * 60 + 15);
    expect(clock!.day).toBe("2026-08-10");
    // Cross-checked against Date arithmetic, which is a different mechanism
    // from the Intl weekday string localClock actually parses.
    expect(clock!.dow).toBe(expectedDow(instant));
  });

  it("applies a zone offset rather than assuming UTC", () => {
    // 16:30 UTC is 12:30 in New York during daylight saving.
    const instant = new Date("2026-08-10T16:30:00Z");
    expect(localClock("America/New_York", instant)!.mins).toBe(12 * 60 + 30);
    expect(localClock("UTC", instant)!.mins).toBe(16 * 60 + 30);
  });

  it("rolls the local date backwards across the dateline", () => {
    // Just past midnight UTC is still the previous evening in Los Angeles.
    const instant = new Date("2026-08-10T02:00:00Z");
    const la = localClock("America/Los_Angeles", instant)!;
    expect(la.day).toBe("2026-08-09");
    expect(la.mins).toBe(19 * 60); // 7pm
  });

  it("handles a half-hour offset zone", () => {
    const instant = new Date("2026-08-10T00:00:00Z");
    expect(localClock("Asia/Kolkata", instant)!.mins).toBe(5 * 60 + 30);
  });

  it("returns null for an unusable timezone", () => {
    // Load-bearing: the crons skip a user rather than fall back to UTC,
    // because notifying at the wrong hour is worse than not notifying.
    expect(localClock("Not/AZone", new Date())).toBeNull();
    expect(localClock("", new Date())).toBeNull();
    expect(localClock("'; DROP TABLE users; --", new Date())).toBeNull();
  });

  it("reports midnight as minute zero, not 1440", () => {
    const clock = localClock("UTC", new Date("2026-08-10T00:00:00Z"))!;
    expect(clock.mins).toBe(0);
    expect(clock.day).toBe("2026-08-10");
  });
});
