import { describe, expect, it } from "vitest";
import { buildCalendarFile } from "./calendar";
import type { ClassItem, TaskItem } from "./store";

const klass = (over: Partial<ClassItem> = {}): ClassItem => ({
  id: "c1",
  name: "Chemistry",
  short: "Chem",
  color: "indigo",
  days: [0, 2],
  start: 600, // 10:00
  end: 680, // 11:20
  remindBefore: 15,
  alarm: true,
  ...over,
});

const task = (over: Partial<TaskItem> = {}): TaskItem => ({
  id: "t1",
  title: "Essay",
  classId: "c1",
  due: "2026-08-12T23:59:00",
  reminder: true,
  done: false,
  ...over,
});

/** Anchor so weekly recurrences resolve deterministically. */
const NOW = new Date("2026-08-10T08:00:00");
const nameById = () => "Chemistry";

const build = (classes: ClassItem[], tasks: TaskItem[] = []) =>
  buildCalendarFile(classes, tasks, nameById, NOW);

describe("buildCalendarFile structure", () => {
  it("wraps everything in a VCALENDAR and ends with CRLF", () => {
    const ics = build([klass()]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("uses CRLF line endings throughout, per RFC 5545", () => {
    const ics = build([klass()], [task()]);
    // No bare LF that isn't part of a CRLF pair.
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it("balances every BEGIN with an END", () => {
    const ics = build([klass()], [task()]);
    // Anchored: an unanchored /END:/ also matches inside DTEND:.
    const begins = ics.match(/^BEGIN:/gm)?.length ?? 0;
    const ends = ics.match(/^END:/gm)?.length ?? 0;
    expect(begins).toBe(ends);
    expect(begins).toBeGreaterThan(0);
  });

  it("skips a class that meets on no days", () => {
    expect(build([klass({ days: [] })])).not.toContain("SUMMARY:Chemistry");
  });

  it("skips completed tasks and unparseable due dates", () => {
    const ics = build([], [
      task({ id: "a", title: "Done thing", done: true }),
      task({ id: "b", title: "Broken thing", due: "not-a-date" }),
    ]);
    expect(ics).not.toContain("Done thing");
    expect(ics).not.toContain("Broken thing");
  });
});

describe("classes", () => {
  it("writes a weekly rule with the right days", () => {
    // 0 = Mon, 2 = Wed
    expect(build([klass({ days: [0, 2] })])).toContain(
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
    );
    expect(build([klass({ days: [4] })])).toContain(
      "RRULE:FREQ=WEEKLY;BYDAY=FR",
    );
  });

  it("gives each class a stable UID so re-import updates rather than duplicates", () => {
    expect(build([klass({ id: "abc" })])).toContain(
      "UID:classping-class-abc@classping",
    );
  });

  it("writes floating local times with no Z suffix", () => {
    const ics = build([klass({ start: 600, end: 680 })]);
    expect(ics).toMatch(/DTSTART:\d{8}T100000\r\n/);
    expect(ics).toMatch(/DTEND:\d{8}T112000\r\n/);
    expect(ics).not.toMatch(/DTSTART:\d{8}T\d{6}Z/);
  });

  it("emits one alarm per distinct lead time, earliest first", () => {
    const ics = build([klass({ remindBefore: 15, reminders: [60, 15, 1440] })]);
    const triggers = [...ics.matchAll(/TRIGGER:-PT(\d+)M/g)].map((m) => m[1]);
    expect(triggers).toEqual(["1440", "60", "15"]);
  });

  it("writes no alarms when the class alarm is off", () => {
    expect(build([klass({ alarm: false })])).not.toContain("BEGIN:VALARM");
  });

  it("exports the room as LOCATION and the teacher as DESCRIPTION", () => {
    const ics = build([klass({ room: "Sci 204", instructor: "Dr Vance" })]);
    expect(ics).toContain("LOCATION:Sci 204");
    expect(ics).toContain("DESCRIPTION:With Dr Vance");
  });

  it("omits LOCATION when no room is set", () => {
    expect(build([klass()])).not.toContain("LOCATION:");
  });
});

describe("semester window", () => {
  const withTerm = (start: string | null, end: string | null) =>
    buildCalendarFile([klass()], [], nameById, NOW, { start, end });

  it("repeats forever when no term is set", () => {
    expect(build([klass()])).not.toContain("UNTIL=");
  });

  it("stops the weekly rule at the end of term", () => {
    expect(withTerm("2026-08-01", "2026-12-15")).toContain(
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261215T235900",
    );
  });

  it("starts a not-yet-begun term on its first meeting, not this week", () => {
    // NOW is 10 Aug 2026; term opens Mon 7 Sep, and the class meets Mon/Wed.
    expect(withTerm("2026-09-07", "2026-12-15")).toContain(
      "DTSTART:20260907T100000",
    );
  });

  it("anchors to today once the term is under way", () => {
    // 10 Aug 2026 is itself a Monday, so the next meeting is today.
    expect(withTerm("2026-08-01", "2026-12-15")).toContain(
      "DTSTART:20260810T100000",
    );
  });

  it("omits a class whose term has already ended", () => {
    expect(withTerm("2026-01-05", "2026-05-01")).not.toContain(
      "SUMMARY:Chemistry",
    );
  });

  it("bounds the half of the term that is set", () => {
    expect(withTerm(null, "2026-12-15")).toContain("UNTIL=20261215T235900");
    expect(withTerm("2026-09-07", null)).toContain("DTSTART:20260907T100000");
  });

  it("ignores an inverted range rather than dropping the timetable", () => {
    const ics = withTerm("2026-12-15", "2026-08-01");
    expect(ics).toContain("SUMMARY:Chemistry");
    expect(ics).not.toContain("UNTIL=");
  });

  it("ignores a malformed date", () => {
    expect(withTerm("not-a-date", "also-not")).not.toContain("UNTIL=");
  });

  it("keeps deadlines even when they fall outside the term", () => {
    // A deadline is a real date on a real calendar; only the recurring
    // timetable is what the semester bounds.
    const ics = buildCalendarFile(
      [],
      [task({ due: "2027-01-04T09:00:00" })],
      nameById,
      NOW,
      { start: "2026-08-01", end: "2026-12-15" },
    );
    expect(ics).toContain("SUMMARY:Essay due");
  });
});

describe("tasks and exams", () => {
  it("gives an assignment a single 24-hour alarm", () => {
    const ics = build([], [task()]);
    expect(ics).toContain("TRIGGER:-PT24H");
    expect(ics).not.toContain("TRIGGER:-P7D");
  });

  it("gives an exam a week's warning as well", () => {
    const ics = build([], [task({ kind: "exam" })]);
    expect(ics).toContain("TRIGGER:-P7D");
    expect(ics).toContain("TRIGGER:-PT24H");
  });

  it("blocks 90 minutes for an exam and 30 for an assignment", () => {
    const exam = build([], [task({ kind: "exam", due: "2026-08-12T09:00:00" })]);
    expect(exam).toMatch(/DTSTART:20260812T090000/);
    expect(exam).toMatch(/DTEND:20260812T103000/);

    const essay = build([], [task({ due: "2026-08-12T09:00:00" })]);
    expect(essay).toMatch(/DTEND:20260812T093000/);
  });

  it("writes no alarm when the task reminder is off", () => {
    expect(build([], [task({ reminder: false })])).not.toContain("BEGIN:VALARM");
  });
});

describe("escaping and folding", () => {
  it("escapes the characters RFC 5545 reserves", () => {
    const ics = build([klass({ name: "Maths; Stats, Adv\\Core" })]);
    expect(ics).toContain("SUMMARY:Maths\\; Stats\\, Adv\\\\Core");
  });

  it("turns newlines in notes into literal \\n rather than breaking the line", () => {
    const ics = build([klass({ notes: "Bring:\nlab coat" })]);
    expect(ics).toContain("DESCRIPTION:Bring:\\nlab coat");
    // The raw newline must not have split the property across lines
    // without a folding space.
    expect(ics).not.toContain("DESCRIPTION:Bring:\r\nlab");
  });

  it("folds long lines with a leading space on continuations", () => {
    const ics = build([klass({ name: "N".repeat(200) })]);
    for (const line of ics.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
    // A folded continuation is recognisable by its leading space.
    expect(ics).toMatch(/\r\n N/);
  });
});
