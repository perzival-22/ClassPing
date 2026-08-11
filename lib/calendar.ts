/**
 * iCalendar (.ics) export — mirrors the in-app reminder rules so the phone's
 * own calendar can deliver them while the app is closed: classes repeat weekly
 * with an alarm `remindBefore` minutes ahead (when the class alarm is on), and
 * open tasks get an alarm 24 hours before they're due.
 *
 * Times are written as floating local times (no timezone), which calendars
 * interpret in the device's own timezone — right for a school schedule.
 */
import type { ClassItem, DayIndex, TaskItem } from "./store";

const BYDAY = ["MO", "TU", "WE", "TH", "FR"] as const;

/**
 * The semester the timetable belongs to, as ISO "YYYY-MM-DD" dates. Either
 * end may be missing — a half-set term still bounds the half it knows.
 */
export interface TermWindow {
  start?: string | null;
  end?: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Local midnight on an ISO date, or null if it isn't one. */
function parseTermDate(iso: string | null | undefined): Date | null {
  if (!iso || !ISO_DATE.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The window to write events inside, or null when it's unset or inverted.
 * `from` is the earliest date an event may start; `until` the last day of the
 * term at 23:59 local.
 */
function resolveWindow(term: TermWindow | undefined): {
  from: Date | null;
  until: Date | null;
} | null {
  const from = parseTermDate(term?.start);
  const untilDay = parseTermDate(term?.end);
  if (from && untilDay && untilDay < from) return null; // typo, not a term
  if (!from && !untilDay) return null;
  const until = untilDay ? new Date(untilDay) : null;
  until?.setHours(23, 59, 0, 0);
  return { from, until };
}

const pad = (n: number) => n.toString().padStart(2, "0");

/** Human lead time for an alarm description: "1 day", "3 hours", "15 minutes". */
function leadLabel(mins: number): string {
  if (mins % 1440 === 0) {
    const d = mins / 1440;
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  if (mins % 60 === 0) {
    const h = mins / 60;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${mins} minute${mins === 1 ? "" : "s"}`;
}

function fmtLocal(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  );
}

function fmtUtcNow(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape text per RFC 5545: backslash, semicolon, comma, newlines. */
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold long content lines (RFC 5545 §3.1: continuations start with a space). */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 73) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  parts.push(" " + rest);
  return parts.join("\r\n");
}

/** Soonest date (today or later) that falls on one of the class's weekdays. */
function nextOccurrence(days: DayIndex[], startMins: number, base: Date): Date {
  const d = new Date(base);
  for (let i = 0; i < 7; i++) {
    const dow = (d.getDay() + 6) % 7; // 0 = Mon … 6 = Sun
    if (dow <= 4 && days.includes(dow as DayIndex)) break;
    d.setDate(d.getDate() + 1);
  }
  d.setHours(Math.floor(startMins / 60), startMins % 60, 0, 0);
  return d;
}

export function buildCalendarFile(
  classes: ClassItem[],
  tasks: TaskItem[],
  classNameById: (id: string) => string | undefined,
  /** The user's "today", used to anchor weekly recurrences. When this runs on
   *  the server, the caller passes the client's local wall-clock time. */
  now: Date = new Date(),
  /**
   * The semester these classes run in. When set, class events start no earlier
   * than the first day of term and stop repeating after the last — otherwise a
   * timetable exported in September is still ringing alarms the next June.
   */
  term?: TermWindow,
): string {
  const stamp = fmtUtcNow();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ClassPing//Timetable//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ClassPing",
  ];

  const window = resolveWindow(term);

  for (const c of classes) {
    if (c.days.length === 0) continue;
    // Anchor to the first meeting inside the term. Before the semester begins
    // that's its opening week rather than this week; during it, today.
    const anchor =
      window?.from && window.from > now ? window.from : now;
    const start = nextOccurrence(c.days, c.start, anchor);
    // The whole term is behind us — there is nothing left to put in a calendar.
    if (window?.until && start > window.until) continue;
    const end = new Date(start);
    end.setHours(Math.floor(c.end / 60), c.end % 60, 0, 0);
    const byday = c.days
      .slice()
      .sort((a, b) => a - b)
      .map((d) => BYDAY[d])
      .join(",");
    // UNTIL is written as a floating local time, matching DTSTART. RFC 5545
    // §3.3.10 requires the two to agree, and a Z-suffixed UNTIL against a
    // floating start silently drops or adds a final week either side of UTC.
    const rrule =
      `RRULE:FREQ=WEEKLY;BYDAY=${byday}` +
      (window?.until ? `;UNTIL=${fmtLocal(window.until)}` : "");
    lines.push(
      "BEGIN:VEVENT",
      // Stable UID: re-importing after edits updates the event on most
      // calendars instead of duplicating it.
      `UID:classping-class-${c.id}@classping`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${fmtLocal(start)}`,
      `DTEND:${fmtLocal(end)}`,
      rrule,
      `SUMMARY:${esc(c.name)}`,
    );
    // LOCATION is what makes a calendar entry actually useful on a phone —
    // most apps turn it into a tappable map or show it on the lock screen.
    if (c.room) lines.push(`LOCATION:${esc(c.room)}`);
    const detail = [
      c.instructor ? `With ${c.instructor}` : null,
      c.notes || null,
    ].filter(Boolean);
    if (detail.length > 0) {
      lines.push(`DESCRIPTION:${esc(detail.join("\n"))}`);
    }
    if (c.alarm) {
      // Primary reminder plus any extra Pro lead times, de-duped, earliest
      // heads-up first — each becomes its own alarm the native calendar fires.
      const offsets = Array.from(
        new Set([c.remindBefore, ...(c.reminders ?? [])]),
      ).sort((a, b) => b - a);
      for (const mins of offsets) {
        lines.push(
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `TRIGGER:-PT${mins}M`,
          `DESCRIPTION:${esc(`${c.name} starts in ${leadLabel(mins)}`)}`,
          "END:VALARM",
        );
      }
    }
    lines.push("END:VEVENT");
  }

  for (const t of tasks) {
    if (t.done) continue;
    const due = new Date(t.due);
    if (Number.isNaN(due.getTime())) continue;
    const isExam = t.kind === "exam";
    // An exam blocks out a realistic sitting; an assignment is a deadline
    // moment, so it stays a short marker.
    const end = new Date(due.getTime() + (isExam ? 90 : 30) * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:classping-task-${t.id}@classping`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${fmtLocal(due)}`,
      `DTEND:${fmtLocal(end)}`,
      `SUMMARY:${esc(isExam ? `📝 ${t.title}` : `${t.title} due`)}`,
    );
    const className = classNameById(t.classId);
    if (className) lines.push(`DESCRIPTION:${esc(className)}`);
    if (t.reminder) {
      // Exams deserve more than a day's warning — nobody revises overnight
      // on purpose. A week out, then the usual 24 hours.
      const offsets = isExam
        ? [{ trigger: "-P7D", label: "in a week" }, { trigger: "-PT24H", label: "in 24 hours" }]
        : [{ trigger: "-PT24H", label: "in 24 hours" }];
      for (const o of offsets) {
        lines.push(
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `TRIGGER:${o.trigger}`,
          `DESCRIPTION:${esc(`${t.title} is ${isExam ? "" : "due "}${o.label}`)}`,
          "END:VALARM",
        );
      }
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Download the calendar file so the phone offers to import it. */
export function downloadCalendarFile(ics: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "classping.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
