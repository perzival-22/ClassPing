import { describe, expect, it } from "vitest";
import { buildGradeReport, buildGradeReportPdf, csvField } from "./report";
import { SIMPLE_SCALE } from "./gpa";
import type { ClassItem, GradeItem, TaskItem } from "./store";

const klass = (over: Partial<ClassItem> = {}): ClassItem => ({
  id: "c1",
  name: "Chemistry",
  short: "Chem",
  color: "indigo",
  days: [0],
  start: 600,
  end: 680,
  remindBefore: 15,
  alarm: true,
  ...over,
});

const grade = (over: Partial<GradeItem> = {}): GradeItem => ({
  id: "g1",
  classId: "c1",
  title: "Midterm",
  score: 90,
  max: 100,
  weight: 100,
  date: "2026-08-01",
  ...over,
});

const AT = new Date("2026-08-10T12:00:00Z");
const build = (
  classes: ClassItem[],
  grades: GradeItem[],
  opts = {},
) => buildGradeReport(classes, grades, { generatedAt: AT, ...opts });

describe("csvField", () => {
  it("leaves plain values alone", () => {
    expect(csvField("Chemistry")).toBe("Chemistry");
    expect(csvField(42)).toBe("42");
  });

  it("quotes and doubles embedded quotes", () => {
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("quotes values containing commas or newlines", () => {
    expect(csvField("Maths, Adv")).toBe('"Maths, Adv"');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });

  it("defuses spreadsheet formula injection", () => {
    // Excel and Sheets execute these on open; the report is a file a student
    // may well forward to someone else.
    expect(csvField('=HYPERLINK("http://evil","x")')).toBe(
      `"'=HYPERLINK(""http://evil"",""x"")"`,
    );
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("-2")).toBe("'-2");
    expect(csvField("@cmd")).toBe("'@cmd");
  });
});

describe("buildGradeReport", () => {
  it("includes a header, the term and the generation date", () => {
    const csv = build([klass()], [grade()], { termName: "Fall 2025" });
    expect(csv).toContain("ClassPing grade report");
    expect(csv).toContain("Fall 2025");
    expect(csv).toContain("2026-08-10");
  });

  it("writes one row per graded item", () => {
    const csv = build(
      [klass()],
      [
        grade({ id: "a", title: "Quiz 1", score: 8, max: 10, weight: 20 }),
        grade({ id: "b", title: "Quiz 2", score: 9, max: 10, weight: 20 }),
      ],
    );
    expect(csv).toContain("Chemistry,1,Quiz 1,,2026-08-01,8,10,80.0,20");
    expect(csv).toContain("Chemistry,1,Quiz 2,,2026-08-01,9,10,90.0,20");
  });

  it("carries the item's type, and leaves it blank when unset", () => {
    const csv = build(
      [klass()],
      [
        grade({ id: "a", title: "Midterm", kind: "exam" }),
        grade({ id: "b", title: "Homework", date: "2026-08-02" }),
      ],
    );
    expect(csv).toContain("Type");
    expect(csv).toContain("Chemistry,1,Midterm,exam,2026-08-01");
    expect(csv).toContain("Chemistry,1,Homework,,2026-08-02");
  });

  it("orders items by date", () => {
    const csv = build(
      [klass()],
      [
        grade({ id: "a", title: "Later", date: "2026-09-01" }),
        grade({ id: "b", title: "Earlier", date: "2026-07-01" }),
      ],
    );
    expect(csv.indexOf("Earlier")).toBeLessThan(csv.indexOf("Later"));
  });

  it("keeps same-day items in the order they were added", () => {
    // Logging several grades in one sitting gives them all today's date. The
    // old comparator never returned 0, so their order was whatever V8's sort
    // happened to produce for that array length.
    const csv = build(
      [klass()],
      ["First", "Second", "Third", "Fourth"].map((title, i) =>
        grade({ id: `g${i}`, title, date: "2026-08-01" }),
      ),
    );
    const at = (t: string) => csv.indexOf(t);
    expect(at("First")).toBeLessThan(at("Second"));
    expect(at("Second")).toBeLessThan(at("Third"));
    expect(at("Third")).toBeLessThan(at("Fourth"));
  });

  it("summarises each class and the overall GPA", () => {
    const csv = build([klass()], [grade({ score: 95, max: 100 })]);
    expect(csv).toContain("Class summary");
    expect(csv).toContain("Chemistry,1,95.0,A,4.0");
    expect(csv).toContain("Overall GPA,4.00");
  });

  it("reports credits and weights the GPA by them", () => {
    const csv = build(
      [klass({ id: "c1", credits: 4 }), klass({ id: "c2", name: "Art", credits: 1 })],
      [
        grade({ id: "g1", classId: "c1", score: 95, max: 100 }),
        grade({ id: "g2", classId: "c2", score: 85, max: 100 }),
      ],
    );
    expect(csv).toContain("Chemistry,4,95.0,A,4.0");
    expect(csv).toContain("Art,1,85.0,B,3.0");
    expect(csv).toContain("Overall GPA,3.80");
  });

  it("honours an alternative scale", () => {
    const csv = build([klass()], [grade({ score: 90, max: 100 })], {
      scale: SIMPLE_SCALE,
    });
    expect(csv).toContain("Chemistry,1,90.0,A,4.0");
  });

  it("skips classes with no grades", () => {
    const csv = build([klass({ id: "c1" }), klass({ id: "c2", name: "Empty" })], [grade()]);
    expect(csv).not.toContain("Empty");
  });

  it("says n/a rather than crashing when nothing is graded", () => {
    expect(build([klass()], [])).toContain("Overall GPA,n/a");
  });

  it("uses CRLF endings and ends with a newline", () => {
    const csv = build([klass()], [grade()]);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(csv)).toBe(false);
  });
});

describe("buildGradeReportPdf", () => {
  const task = (over: Partial<TaskItem> = {}): TaskItem => ({
    id: "t1",
    title: "Lab write-up",
    classId: "c1",
    due: "2026-08-14",
    reminder: true,
    done: false,
    ...over,
  });

  /**
   * Streams are written uncompressed precisely so the rendered text can be
   * asserted on; every drawn string appears as a `(…) Tj` operator.
   */
  const render = (bytes: Uint8Array): string =>
    Array.from(bytes, (b) => String.fromCharCode(b)).join("");

  const pdf = (
    classes: ClassItem[],
    grades: GradeItem[],
    opts: Parameters<typeof buildGradeReportPdf>[2] = {},
  ) => render(buildGradeReportPdf(classes, grades, { generatedAt: AT, ...opts }));

  it("produces an openable PDF", () => {
    const out = pdf([klass()], [grade()]);
    expect(out.startsWith("%PDF-")).toBe(true);
    expect(out.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("prints the term, the dates and the generation date", () => {
    const out = pdf([klass()], [grade()], {
      termName: "Fall 2025",
      termStart: "2025-08-25",
      termEnd: "2025-12-12",
    });
    expect(out).toContain("(Fall 2025 Grade Report) Tj");
    // The en-dash is written as its WinAnsi byte, not an escape sequence.
    expect(out).toContain("Aug 25, 2025 \x96 Dec 12, 2025");
    expect(out).toContain("Generated Aug 10, 2026");
  });

  it("prints the class, its grades and the overall GPA", () => {
    const out = pdf([klass()], [grade({ title: "Midterm", score: 95 })]);
    expect(out).toContain("(Chemistry) Tj");
    expect(out).toContain("(Midterm) Tj");
    expect(out).toContain("(95 / 100) Tj");
    expect(out).toContain("(4.00) Tj");
  });

  it("prints assignments under the class that set them", () => {
    const out = pdf([klass()], [grade()], {
      tasks: [
        task({ id: "t1", title: "Lab write-up" }),
        task({ id: "t2", title: "Final exam", kind: "exam", done: true }),
      ],
    });
    expect(out).toContain("(Lab write-up) Tj");
    expect(out).toContain("(Final exam  \\(exam\\)) Tj");
    expect(out).toContain("(Open) Tj");
    expect(out).toContain("(Done) Tj");
  });

  it("prints a grade's type next to its title", () => {
    const out = pdf([klass()], [grade({ title: "Midterm", kind: "exam" })]);
    expect(out).toContain("(Midterm  \\(exam\\)) Tj");
  });

  it("prints an assignment's notes under it", () => {
    // The brief is half the reason the task exists — a title alone would
    // leave it off the page you revise from.
    const out = pdf([klass()], [grade()], {
      tasks: [task({ notes: "Read chapters 4-6 and write 500 words." })],
    });
    expect(out).toContain("Read chapters 4-6 and write 500 words.");
  });

  it("prints the private note attached to a class", () => {
    const out = pdf([klass({ notes: "Office hours Tuesday" })], [grade()]);
    expect(out).toContain("(NOTES) Tj");
    expect(out).toContain("Office hours Tuesday");
  });

  it("shows the goal and the projected GPA when one is set", () => {
    const out = pdf([klass({ goal: 95 })], [grade({ score: 70, max: 100 })]);
    expect(out).toContain("(Projected 4.00) Tj");
    expect(out).toContain("Goal 95% \\(A\\)");
  });

  it("leaves the projection out when no class has a goal", () => {
    expect(pdf([klass()], [grade()])).not.toContain("Projected");
  });

  it("trims a class name that would run under its own grade", () => {
    const long =
      "Introduction to Organic Chemistry II and Advanced Laboratory Practice";
    const out = pdf([klass({ name: long })], [grade()]);
    expect(out).not.toContain(`(${long}) Tj`);
    expect(out).toMatch(/\(Introduction to Organic [^)]*\x85\) Tj/);
  });

  it("includes a class that has nothing logged yet", () => {
    // The PDF is the printable term record, not just a grade dump — a class
    // with no scores still belongs on it.
    const out = pdf([klass({ id: "c9", name: "Studio Art" })], []);
    expect(out).toContain("(Studio Art) Tj");
    expect(out).toContain("(Nothing logged for this class yet.) Tj");
  });

  it("survives a long term without dropping content", () => {
    const classes = Array.from({ length: 8 }, (_, i) =>
      klass({ id: `c${i}`, name: `Class ${i}` }),
    );
    const grades = classes.flatMap((c, i) =>
      Array.from({ length: 6 }, (_, j) =>
        grade({ id: `g${i}-${j}`, classId: c.id, title: `Item ${j}`, weight: 16 }),
      ),
    );
    const out = pdf(classes, grades);
    expect(out).toContain("(Class 0) Tj");
    expect(out).toContain("(Class 7) Tj");
    expect(out).toMatch(/\/Count [2-9]/);
  });

  it("does not crash on an empty term", () => {
    const out = pdf([], []);
    expect(out).toContain("(No classes in this term yet.) Tj");
  });
});
