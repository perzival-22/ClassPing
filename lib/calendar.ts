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

const pad = (n: number) => n.toString().padStart(2, "0");

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
function nextOccurrence(days: DayIndex[], startMins: number): Date {
  const d = new Date();
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

  for (const c of classes) {
    if (c.days.length === 0) continue;
    const start = nextOccurrence(c.days, c.start);
    const end = new Date(start);
    end.setHours(Math.floor(c.end / 60), c.end % 60, 0, 0);
    const byday = c.days
      .slice()
      .sort((a, b) => a - b)
      .map((d) => BYDAY[d])
      .join(",");
    lines.push(
      "BEGIN:VEVENT",
      // Stable UID: re-importing after edits updates the event on most
      // calendars instead of duplicating it.
      `UID:classping-class-${c.id}@classping`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${fmtLocal(start)}`,
      `DTEND:${fmtLocal(end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
      `SUMMARY:${esc(c.name)}`,
    );
    if (c.alarm) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:-PT${c.remindBefore}M`,
        `DESCRIPTION:${esc(`${c.name} starts in ${c.remindBefore} minutes`)}`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }

  for (const t of tasks) {
    if (t.done) continue;
    const due = new Date(t.due);
    if (Number.isNaN(due.getTime())) continue;
    const end = new Date(due.getTime() + 30 * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:classping-task-${t.id}@classping`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${fmtLocal(due)}`,
      `DTEND:${fmtLocal(end)}`,
      `SUMMARY:${esc(`${t.title} due`)}`,
    );
    const className = classNameById(t.classId);
    if (className) lines.push(`DESCRIPTION:${esc(className)}`);
    if (t.reminder) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "TRIGGER:-PT24H",
        `DESCRIPTION:${esc(`${t.title} is due in 24 hours`)}`,
        "END:VALARM",
      );
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
