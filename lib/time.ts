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

/**
 * Days since the epoch for a "YYYY-MM-DD" date, or null if it isn't one.
 *
 * Anchored to UTC so the arithmetic is pure calendar days: a semester that
 * starts on the 25th starts on the 25th regardless of the reader's timezone,
 * and no DST transition can shorten a week by an hour and round the wrong way.
 */
export function dayNumber(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(ms) ? null : Math.floor(ms / 86_400_000);
}

/** Same, for a local Date — its calendar day, not its UTC instant. */
export function todayNumber(now: Date): number {
  return Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
}

/** How far through the semester we are. */
export interface TermProgress {
  /** "before" the term starts, "during" it, or "after" it ends. */
  phase: "before" | "during" | "after";
  /** Whole days in the term, inclusive of both endpoints. */
  totalDays: number;
  /** Days elapsed including today, clamped to [0, totalDays]. */
  elapsedDays: number;
  /** Days left including today, clamped to [0, totalDays]. */
  remainingDays: number;
  /** 0–1, for a progress bar. */
  fraction: number;
  /** 1-based teaching week the term is in, clamped to the term's length. */
  week: number;
  /** Total weeks the term spans. */
  totalWeeks: number;
}

/**
 * Where `now` falls inside a semester. Returns null unless both dates are set
 * and the range is the right way round — a half-configured term has nothing
 * meaningful to report, and an inverted one is a typo, not a zero-length term.
 */
export function termProgress(
  start: string | null | undefined,
  end: string | null | undefined,
  now: Date,
): TermProgress | null {
  const s = start ? dayNumber(start) : null;
  const e = end ? dayNumber(end) : null;
  if (s === null || e === null || e < s) return null;

  const today = todayNumber(now);
  const totalDays = e - s + 1;
  const totalWeeks = Math.ceil(totalDays / 7);
  const clamp = (v: number) => Math.min(Math.max(v, 0), totalDays);
  const elapsedDays = clamp(today - s + 1);

  return {
    phase: today < s ? "before" : today > e ? "after" : "during",
    totalDays,
    elapsedDays,
    remainingDays: clamp(e - today + 1),
    fraction: elapsedDays / totalDays,
    week: Math.min(Math.max(Math.floor((today - s) / 7) + 1, 1), totalWeeks),
    totalWeeks,
  };
}

/**
 * Does `date` fall inside the configured semester?
 *
 * True when the term isn't set up, and true for whichever half is set — a
 * half-configured term must not blank out the timetable, because the whole
 * point of the dates is to *bound* a schedule, never to hide one by accident.
 * An inverted range (end before start) is a typo, so it's ignored too.
 */
export function isWithinTerm(
  start: string | null | undefined,
  end: string | null | undefined,
  date: Date,
): boolean {
  const s = start ? dayNumber(start) : null;
  const e = end ? dayNumber(end) : null;
  if (s !== null && e !== null && e < s) return true;
  const day = todayNumber(date);
  if (s !== null && day < s) return false;
  if (e !== null && day > e) return false;
  return true;
}

/** "Sep 1 – Dec 15", for telling the user what window they're outside of. */
export function termRangeLabel(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const fmt = (iso: string) => {
    const ms = Date.parse(`${iso}T00:00:00Z`);
    return Number.isNaN(ms)
      ? null
      : new Date(ms).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });
  };
  const s = start ? fmt(start) : null;
  const e = end ? fmt(end) : null;
  if (s && e) return `${s} – ${e}`;
  if (s) return `from ${s}`;
  if (e) return `until ${e}`;
  return null;
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
