import type { ClassItem, GradeItem } from "./store";
import {
  DEFAULT_SCALE,
  type ScaleBand,
  classAverage,
  creditsFor,
  letterFor,
  overallGpa,
  pointsFor,
} from "./gpa";

/**
 * Semester grade report as CSV — the shareable artifact at the end of a term.
 *
 * CSV rather than PDF: it opens in Sheets, Excel and Numbers without a
 * renderer dependency, and a student can hand it to a parent or paste it into
 * a scholarship form. Rows are one per graded event, with a per-class summary
 * and an overall line, so the file is readable as-is and pivotable if wanted.
 */

/**
 * Quote a CSV field, and defuse spreadsheet formula injection.
 *
 * Class and assignment titles are user input. A value beginning with =, +, -
 * or @ is executed as a formula by Excel and Sheets on open, so a class named
 * `=HYPERLINK("http://evil","click")` would become a live link in a file the
 * student might forward to someone else. Prefixing with an apostrophe makes
 * it inert text while still displaying the original characters.
 */
export function csvField(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const row = (cells: Array<string | number>) => cells.map(csvField).join(",");

export interface GradeReportOptions {
  scale?: ScaleBand[];
  /** Shown in the header line, e.g. "Fall 2025". */
  termName?: string;
  /** Overridable so the output is deterministic in tests. */
  generatedAt?: Date;
}

export function buildGradeReport(
  classes: ClassItem[],
  grades: GradeItem[],
  { scale = DEFAULT_SCALE, termName, generatedAt = new Date() }: GradeReportOptions = {},
): string {
  const lines: string[] = [];

  lines.push(row(["ClassPing grade report"]));
  if (termName) lines.push(row(["Term", termName]));
  lines.push(row(["Generated", generatedAt.toISOString().slice(0, 10)]));
  lines.push("");

  lines.push(
    row([
      "Class",
      "Credits",
      "Item",
      "Date",
      "Score",
      "Out of",
      "Percent",
      "Weight %",
    ]),
  );

  for (const c of classes) {
    const mine = [...grades.filter((g) => g.classId === c.id)].sort((a, b) =>
      a.date < b.date ? -1 : 1,
    );
    if (mine.length === 0) continue;

    for (const g of mine) {
      const pct = g.max > 0 ? (g.score / g.max) * 100 : 0;
      lines.push(
        row([
          c.name,
          creditsFor(c),
          g.title,
          g.date,
          g.score,
          g.max,
          pct.toFixed(1),
          g.weight,
        ]),
      );
    }
  }

  lines.push("");
  lines.push(row(["Class summary"]));
  lines.push(row(["Class", "Credits", "Average %", "Letter", "Points"]));

  for (const c of classes) {
    const avg = classAverage(grades.filter((g) => g.classId === c.id));
    if (avg === null) continue;
    lines.push(
      row([
        c.name,
        creditsFor(c),
        avg.toFixed(1),
        letterFor(avg, scale),
        pointsFor(avg, scale).toFixed(1),
      ]),
    );
  }

  const gpa = overallGpa(classes, grades, scale);
  lines.push("");
  lines.push(row(["Overall GPA", gpa === null ? "n/a" : gpa.toFixed(2)]));

  // Trailing newline so the file ends cleanly in every editor.
  return lines.join("\r\n") + "\r\n";
}

/** Download the report so the browser saves it as a file. */
export function downloadGradeReport(csv: string, filename = "classping-grades.csv") {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
