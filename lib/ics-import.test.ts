import { describe, expect, it } from "vitest";
import { parseIcs, planImport, type ImportResult } from "./ics-import";
import { FREE_CLASS_LIMIT } from "./plan";

const NOW = new Date("2026-08-10T08:00:00");

/** Wrap VEVENT bodies in a minimal VCALENDAR. */
const cal = (...events: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");

const vevent = (...lines: string[]) =>
  ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

describe("parseIcs — classes", () => {
  it("turns a weekly recurring event into a class with the right days", () => {
    const ics = cal(
      vevent(
        "SUMMARY:Organic Chemistry",
        "DTSTART:20260810T100000",
        "DTEND:20260810T112000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
        "LOCATION:Science 204",
      ),
    );
    const { classes, tasks } = parseIcs(ics, NOW);
    expect(tasks).toHaveLength(0);
    expect(classes).toHaveLength(1);
    const c = classes[0];
    expect(c.name).toBe("Organic Chemistry");
    expect(c.days).toEqual([0, 2, 4]); // Mon, Wed, Fri
    expect(c.start).toBe(600); // 10:00
    expect(c.end).toBe(680); // 11:20
    expect(c.room).toBe("Science 204");
    expect(c.alarm).toBe(true);
  });

  it("derives the day from DTSTART when RRULE has no BYDAY", () => {
    // 2026-08-10 is a Monday.
    const ics = cal(
      vevent("SUMMARY:Lecture", "DTSTART:20260810T090000", "RRULE:FREQ=WEEKLY"),
    );
    expect(parseIcs(ics, NOW).classes[0].days).toEqual([0]);
  });

  it("strips a BYDAY ordinal prefix like 2MO", () => {
    const ics = cal(
      vevent(
        "SUMMARY:Seminar",
        "DTSTART:20260810T090000",
        "RRULE:FREQ=WEEKLY;BYDAY=2MO,3WE",
      ),
    );
    expect(parseIcs(ics, NOW).classes[0].days).toEqual([0, 2]);
  });

  it("drops weekend-only recurring events (the app is Mon–Fri)", () => {
    const ics = cal(
      vevent(
        "SUMMARY:Sat Lab",
        "DTSTART:20260815T090000",
        "RRULE:FREQ=WEEKLY;BYDAY=SA,SU",
      ),
    );
    const res = parseIcs(ics, NOW);
    expect(res.classes).toHaveLength(0);
    expect(res.skipped).toBe(1);
  });

  it("defaults to a one-hour block when DTEND is missing or invalid", () => {
    const ics = cal(
      vevent("SUMMARY:Studio", "DTSTART:20260810T140000", "RRULE:FREQ=WEEKLY"),
    );
    const c = parseIcs(ics, NOW).classes[0];
    expect(c.start).toBe(840);
    expect(c.end).toBe(900);
  });

  it("gives consecutive classes different colours", () => {
    const ics = cal(
      vevent("SUMMARY:A", "DTSTART:20260810T090000", "RRULE:FREQ=WEEKLY"),
      vevent("SUMMARY:B", "DTSTART:20260811T090000", "RRULE:FREQ=WEEKLY"),
    );
    const [a, b] = parseIcs(ics, NOW).classes;
    expect(a.color).not.toBe(b.color);
  });
});

describe("parseIcs — tasks", () => {
  it("turns a one-off future event into a task due at its start", () => {
    const ics = cal(
      vevent("SUMMARY:Essay draft", "DTSTART:20260812T235900"),
    );
    const { tasks } = parseIcs(ics, NOW);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Essay draft");
    expect(tasks[0].kind).toBe("assignment");
    expect(new Date(tasks[0].due).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("recognises exams from the title", () => {
    for (const title of ["Midterm Exam", "Final", "Unit 3 Quiz", "Chem Test"]) {
      const ics = cal(vevent(`SUMMARY:${title}`, "DTSTART:20260901T090000"));
      expect(parseIcs(ics, NOW).tasks[0].kind).toBe("exam");
    }
  });

  it("skips events already in the past", () => {
    const ics = cal(vevent("SUMMARY:Old thing", "DTSTART:20260101T090000"));
    const res = parseIcs(ics, NOW);
    expect(res.tasks).toHaveLength(0);
    expect(res.skipped).toBe(1);
  });

  it("treats an all-day VALUE=DATE event as a task, not a class", () => {
    const ics = cal(
      vevent("SUMMARY:Reading due", "DTSTART;VALUE=DATE:20260812"),
    );
    const res = parseIcs(ics, NOW);
    expect(res.classes).toHaveLength(0);
    expect(res.tasks).toHaveLength(1);
  });
});

describe("parseIcs — robustness", () => {
  it("unfolds folded lines", () => {
    const ics = cal(
      [
        "BEGIN:VEVENT",
        "SUMMARY:A very long class name that the feed has wrapped",
        " across two physical lines",
        "DTSTART:20260810T090000",
        "RRULE:FREQ=WEEKLY",
        "END:VEVENT",
      ].join("\r\n"),
    );
    expect(parseIcs(ics, NOW).classes[0].name).toBe(
      "A very long class name that the feed has wrappedacross two physical lines",
    );
  });

  it("unescapes reserved characters in titles", () => {
    const ics = cal(
      vevent("SUMMARY:Maths\\, Stats\\; Adv", "DTSTART:20260901T090000"),
    );
    expect(parseIcs(ics, NOW).tasks[0].title).toBe("Maths, Stats; Adv");
  });

  it("reads DTSTART with parameters", () => {
    const ics = cal(
      vevent(
        "SUMMARY:Lecture",
        "DTSTART;TZID=America/New_York:20260810T090000",
        "RRULE:FREQ=WEEKLY",
      ),
    );
    expect(parseIcs(ics, NOW).classes[0].start).toBe(540);
  });

  it("skips a VEVENT with no SUMMARY or no DTSTART", () => {
    const ics = cal(
      vevent("DTSTART:20260901T090000"),
      vevent("SUMMARY:No date"),
    );
    const res = parseIcs(ics, NOW);
    expect(res.classes).toHaveLength(0);
    expect(res.tasks).toHaveLength(0);
    expect(res.skipped).toBe(2);
  });

  it("handles empty or non-calendar input without throwing", () => {
    expect(parseIcs("", NOW)).toEqual({ classes: [], tasks: [], skipped: 0 });
    expect(parseIcs("garbage not ics", NOW).skipped).toBe(0);
  });

  it("caps how much a single feed can add", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      vevent(`SUMMARY:Task ${i}`, "DTSTART:20260901T090000"),
    );
    const res = parseIcs(cal(...many), NOW, 10);
    expect(res.classes.length + res.tasks.length).toBe(10);
  });
});

/**
 * The free plan's class ceiling. app/class/new/page.tsx has always enforced it
 * on the manual path; these are the tests that stop the importer being the
 * hole in it now that free accounts can import.
 */
describe("planImport — the free class ceiling", () => {
  const found = (classes: number, tasks: number): ImportResult => ({
    classes: Array.from({ length: classes }, (_, i) => ({
      name: `Class ${i}`,
      short: `C${i}`,
      color: "indigo" as const,
      days: [0] as never,
      start: 540,
      end: 600,
      remindBefore: 15,
      alarm: true,
    })),
    tasks: Array.from({ length: tasks }, (_, i) => ({
      title: `Task ${i}`,
      classId: "",
      due: "2026-09-01T09:00:00.000Z",
      reminder: true,
      done: false,
    })),
    skipped: 0,
  });

  it("lets Pro import everything", () => {
    const plan = planImport(found(9, 20), { existingClasses: 7, isPro: true });
    expect(plan.classes).toHaveLength(9);
    expect(plan.heldBack).toBe(0);
    expect(plan.total).toBe(29);
  });

  it("fills a free account only up to the limit", () => {
    const plan = planImport(found(8, 3), { existingClasses: 0, isPro: false });
    expect(plan.classes).toHaveLength(FREE_CLASS_LIMIT);
    expect(plan.heldBack).toBe(8 - FREE_CLASS_LIMIT);
  });

  it("counts the classes a free user already has", () => {
    const plan = planImport(found(4, 0), { existingClasses: 3, isPro: false });
    expect(plan.classes).toHaveLength(FREE_CLASS_LIMIT - 3);
    expect(plan.heldBack).toBe(2);
  });

  it("holds back every class once a free account is full", () => {
    const plan = planImport(found(3, 6), {
      existingClasses: FREE_CLASS_LIMIT,
      isPro: false,
    });
    expect(plan.classes).toHaveLength(0);
    expect(plan.heldBack).toBe(3);
    // The deadlines still land: they're uncapped, and a due date with no class
    // is worth more than no due date at all.
    expect(plan.tasks).toHaveLength(6);
    expect(plan.total).toBe(6);
  });

  it("never caps deadlines on either plan", () => {
    for (const isPro of [true, false]) {
      expect(
        planImport(found(0, 40), { existingClasses: 99, isPro }).tasks,
      ).toHaveLength(40);
    }
  });

  /** A grandfathered account can hold more than the limit — we never lock or
   *  delete — so the room left must floor at zero rather than go negative. */
  it("survives an account already over the limit", () => {
    const plan = planImport(found(2, 1), { existingClasses: 12, isPro: false });
    expect(plan.classes).toHaveLength(0);
    expect(plan.room).toBe(0);
    expect(plan.heldBack).toBe(2);
  });
});
