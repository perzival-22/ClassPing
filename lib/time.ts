/**
 * Time helpers shared by the client store and the server-side cron.
 *
 * These live outside store.tsx because that file is a "use client" module —
 * server code (the post-class cron) needs `fmtTime` too, and importing it from
 * the client store would drag React state into a route handler.
 */

/** 510 -> "8:30 AM" */
export function fmtTime(mins: number): string {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/** The user's own wall clock, derived from an IANA timezone. */
export interface LocalClock {
  /** 0 = Mon … 6 = Sun, matching the app's DayIndex convention. */
  dow: number;
  /** Minutes from local midnight — the same unit ClassItem.start/end use. */
  mins: number;
  /** Local calendar date, "YYYY-MM-DD". Used as the per-day dedupe key. */
  day: string;
}

const WEEKDAY: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

/**
 * What time is it *for this user*?
 *
 * ClassItem stores start/end as minutes-from-midnight with no timezone, which
 * is unambiguous on the device (it means local time) and meaningless to a cron
 * running in UTC. Intl does the conversion — and it handles DST correctly,
 * which naive offset arithmetic would not.
 *
 * Returns null for an unrecognized timezone rather than silently falling back
 * to UTC: notifying someone at the wrong hour is worse than not notifying them.
 */
export function localClock(tz: string, now: Date): LocalClock | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);
  } catch {
    return null;
  }

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const dow = WEEKDAY[get("weekday")];
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  if (dow === undefined || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return {
    dow,
    mins: hour * 60 + minute,
    day: `${get("year")}-${get("month")}-${get("day")}`,
  };
}
