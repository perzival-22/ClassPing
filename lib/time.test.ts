import { describe, expect, it } from "vitest";
import { dayNumber, fmtTime, localClock, termProgress } from "./time";

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

describe("dayNumber", () => {
  it("counts whole days between dates", () => {
    expect(dayNumber("2025-08-26")! - dayNumber("2025-08-25")!).toBe(1);
    expect(dayNumber("2026-01-01")! - dayNumber("2025-01-01")!).toBe(365);
  });

  it("rejects anything that isn't a plain ISO date", () => {
    expect(dayNumber("")).toBeNull();
    expect(dayNumber("25/08/2025")).toBeNull();
    expect(dayNumber("2025-13-45")).toBeNull();
  });
});

describe("termProgress", () => {
  const FALL = { start: "2025-08-25", end: "2025-12-12" }; // 110 days, 16 weeks

  /** Local noon, so the result can't depend on the runner's timezone. */
  const at = (iso: string) => new Date(`${iso}T12:00:00`);

  it("needs both ends of the term", () => {
    expect(termProgress(null, FALL.end, at("2025-09-01"))).toBeNull();
    expect(termProgress(FALL.start, null, at("2025-09-01"))).toBeNull();
    expect(termProgress(undefined, undefined, at("2025-09-01"))).toBeNull();
  });

  it("rejects a term that ends before it starts", () => {
    expect(termProgress("2025-12-12", "2025-08-25", at("2025-09-01"))).toBeNull();
  });

  it("counts both endpoints as part of the term", () => {
    const p = termProgress(FALL.start, FALL.end, at("2025-08-25"))!;
    expect(p.totalDays).toBe(110);
    expect(p.totalWeeks).toBe(16);
    expect(p.phase).toBe("during");
    expect(p.elapsedDays).toBe(1);
    expect(p.remainingDays).toBe(110);
    expect(p.week).toBe(1);
  });

  it("reports the week the term is in", () => {
    // Day 8 is the first day of week 2.
    expect(termProgress(FALL.start, FALL.end, at("2025-09-01"))!.week).toBe(2);
    expect(termProgress(FALL.start, FALL.end, at("2025-08-31"))!.week).toBe(1);
    expect(termProgress(FALL.start, FALL.end, at("2025-12-12"))!.week).toBe(16);
  });

  it("flags the term as not started yet", () => {
    const p = termProgress(FALL.start, FALL.end, at("2025-08-01"))!;
    expect(p.phase).toBe("before");
    expect(p.elapsedDays).toBe(0);
    expect(p.fraction).toBe(0);
  });

  it("flags a finished term without overrunning the bar", () => {
    const p = termProgress(FALL.start, FALL.end, at("2026-03-01"))!;
    expect(p.phase).toBe("after");
    expect(p.elapsedDays).toBe(p.totalDays);
    expect(p.remainingDays).toBe(0);
    expect(p.fraction).toBe(1);
  });

  it("handles a single-day term", () => {
    const p = termProgress("2025-08-25", "2025-08-25", at("2025-08-25"))!;
    expect(p.totalDays).toBe(1);
    expect(p.totalWeeks).toBe(1);
    expect(p.fraction).toBe(1);
    expect(p.week).toBe(1);
  });

  it("is unaffected by a DST change inside the term", () => {
    // US DST ends 2 Nov 2025; a naive ms/86400000 span would be an hour short
    // and could round a day off the count.
    const p = termProgress(FALL.start, FALL.end, at("2025-11-03"))!;
    expect(p.elapsedDays).toBe(71);
    expect(p.remainingDays).toBe(40);
    expect(p.elapsedDays + p.remainingDays).toBe(p.totalDays + 1);
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
