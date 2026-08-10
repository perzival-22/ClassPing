import type { ClassItem, DayIndex, TaskItem } from "./store";
import type { SubjectColor } from "./palette";

/**
 * iCalendar import — the inverse of lib/calendar.ts.
 *
 * Canvas, Blackboard, Moodle and Google Classroom all publish a subscribable
 * .ics feed, and pasting that URL is the single highest-leverage way to fill
 * ClassPing without manual entry — the moment students most often abandon a
 * planner. This module is pure: it takes ICS text and returns candidate
 * classes and tasks for the user to confirm before anything is saved.
 *
 * A recurring weekly VEVENT becomes a class (a lecture that meets Mon/Wed).
 * A one-off timed VEVENT becomes a task due at its start (an assignment
 * deadline), with exams recognised from the title.
 */

const BYDAY_TO_INDEX: Record<string, DayIndex> = {
  MO: 0,
  TU: 1,
  WE: 2,
  TH: 3,
  FR: 4,
};
const JS_DAY_TO_INDEX: Record<number, DayIndex | undefined> = {
  1: 0, // Mon
  2: 1,
  3: 2,
  4: 3,
  5: 4, // Fri
};

// Rotated so consecutive imported classes don't all land on the same colour.
const COLORS: SubjectColor[] = [
  "indigo",
  "coral",
  "teal",
  "amber",
  "violet",
  "ocean",
];

const EXAM_RE = /\b(exam|midterm|final|test|quiz)\b/i;

export interface ImportResult {
  classes: Array<Omit<ClassItem, "id">>;
  tasks: Array<Omit<TaskItem, "id">>;
  /** VEVENTs we understood but couldn't map (all-day, past, unparseable). */
  skipped: number;
}

/** Unescape a text value per RFC 5545: \n \, \; \\. */
function unescape(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/**
 * Unfold folded lines (a continuation starts with a space or tab), then split
 * into records. Handles CRLF and bare LF.
 */
function unfold(ics: string): string[] {
  const out: string[] = [];
  for (const line of ics.split(/\r?\n/)) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

interface RawProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Split "DTSTART;TZID=America/New_York:20260810T090000" into its parts. */
function parseProp(line: string): RawProp | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq !== -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

interface ParsedDate {
  date: Date;
  /** True for VALUE=DATE (all-day, no time-of-day). */
  allDay: boolean;
  /** Minutes from local midnight, when a time is present. */
  mins: number;
}

/**
 * Parse an ICS date/time. We read the wall-clock components as local time and
 * ignore TZID: ClassItem stores times zoneless (local to the device), and a
 * student importing their own school's feed wants their own clock, not a
 * conversion. A trailing Z is likewise read as-is — good enough for the
 * date, and the app only ever plots the local wall time anyway.
 */
function parseIcsDate(prop: RawProp): ParsedDate | null {
  const v = prop.value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly || prop.params.VALUE === "DATE") {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(date.getTime())) return null;
    return { date, allDay: true, mins: 0 };
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(v);
  if (!dt) return null;
  const [, y, mo, d, hh, mm] = dt.map(Number);
  const date = new Date(y, mo - 1, d, hh, mm);
  if (Number.isNaN(date.getTime())) return null;
  return { date, allDay: false, mins: hh * 60 + mm };
}

/** Days a recurring event meets, as app DayIndexes (Mon–Fri only). */
function recurringDays(
  rrule: string,
  start: ParsedDate,
): DayIndex[] {
  const byday = /BYDAY=([^;]+)/i.exec(rrule)?.[1];
  if (byday) {
    const days = byday
      .split(",")
      // Strip an ordinal like "2MO" (second Monday) down to the weekday.
      .map((tok) => tok.replace(/^[+-]?\d+/, "").toUpperCase())
      .map((code) => BYDAY_TO_INDEX[code])
      .filter((d): d is DayIndex => d !== undefined);
    return [...new Set(days)].sort((a, b) => a - b);
  }
  // No BYDAY: a weekly event repeats on its start weekday.
  const fromStart = JS_DAY_TO_INDEX[start.date.getDay()];
  return fromStart === undefined ? [] : [fromStart];
}

const shortName = (name: string) =>
  name.trim().split(/\s+/)[0].slice(0, 5) || "Class";

/**
 * Parse ICS text into import candidates.
 *
 * @param now Anchor for "is this in the past?" — injectable for tests.
 * @param limit Safety cap on how much a single feed can add.
 */
export function parseIcs(
  ics: string,
  now: Date = new Date(),
  limit = 200,
): ImportResult {
  const classes: Array<Omit<ClassItem, "id">> = [];
  const tasks: Array<Omit<TaskItem, "id">> = [];
  let skipped = 0;
  let colorIdx = 0;

  const lines = unfold(ics);
  let inEvent = false;
  let props: RawProp[] = [];

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      props = [];
      continue;
    }
    if (line === "END:VEVENT") {
      inEvent = false;
      if (classes.length + tasks.length >= limit) continue;

      const by = (n: string) => props.find((p) => p.name === n);
      const summaryProp = by("SUMMARY");
      const dtstartProp = by("DTSTART");
      if (!summaryProp || !dtstartProp) {
        skipped++;
        continue;
      }
      const title = unescape(summaryProp.value).trim();
      const start = parseIcsDate(dtstartProp);
      if (!title || !start) {
        skipped++;
        continue;
      }

      const rrule = by("RRULE")?.value ?? "";
      const isWeekly = /FREQ=WEEKLY/i.test(rrule);

      if (isWeekly && !start.allDay) {
        // Recurring timed event → a class.
        const days = recurringDays(rrule, start);
        if (days.length === 0) {
          skipped++;
          continue;
        }
        const end = parseIcsDate(by("DTEND") ?? dtstartProp);
        const endMins =
          end && end.mins > start.mins ? end.mins : start.mins + 60;
        const location = by("LOCATION")?.value;
        classes.push({
          name: title,
          short: shortName(title),
          color: COLORS[colorIdx++ % COLORS.length],
          days,
          start: start.mins,
          end: endMins,
          remindBefore: 15,
          alarm: true,
          room: location ? unescape(location).trim() || undefined : undefined,
        });
      } else {
        // One-off event → a task due at its start. Skip anything already past
        // so an old feed doesn't flood the list with dead deadlines.
        if (start.date.getTime() < now.getTime() - 86400_000) {
          skipped++;
          continue;
        }
        tasks.push({
          title,
          classId: "",
          due: start.date.toISOString(),
          reminder: true,
          done: false,
          kind: EXAM_RE.test(title) ? "exam" : "assignment",
        });
      }
      continue;
    }
    if (!inEvent) continue;
    const prop = parseProp(line);
    if (prop) props.push(prop);
  }

  return { classes, tasks, skipped };
}
