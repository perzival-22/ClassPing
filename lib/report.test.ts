import { describe, expect, it } from "vitest";
import { buildGradeReport, csvField } from "./report";
import { SIMPLE_SCALE } from "./gpa";
import type { ClassItem, GradeItem } from "./store";

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
    expect(csv).toContain("Chemistry,1,Quiz 1,2026-08-01,8,10,80.0,20");
    expect(csv).toContain("Chemistry,1,Quiz 2,2026-08-01,9,10,90.0,20");
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
