import type { ClassItem, GradeItem, TaskItem } from "./store";
import {
  DEFAULT_SCALE,
  type ScaleBand,
  classAverage,
  creditsFor,
  letterFor,
  overallGpa,
  pointsFor,
  projectedGpa,
} from "./gpa";
import { PALETTE } from "./palette";
import { fmtTime } from "./time";
import { CONTENT_W, MARGIN, PAGE_W, PAGE_H, PdfDoc, textWidth } from "./pdf";

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
      a.date.localeCompare(b.date),
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
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

/** Same, for the PDF edition. */
export function downloadGradeReportPdf(
  bytes: ArrayBuffer,
  filename = "classping-grades.pdf",
) {
  downloadBlob(new Blob([bytes], { type: "application/pdf" }), filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* ── PDF edition ──────────────────────────────────────────
   What CSV can't be: something you print, or hand to a parent or an advisor.
   One section per class carrying its grades, its open work and the private
   note attached to it — the whole term on paper. */

const INK = "#1E1450";
const MUTED = "#615C86";
const FAINT = "#9A96B4";
const BRAND = "#5B54E8";
const RULE = "#E7E4F1";
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/** Right edges of the summary table's numeric columns. */
const SUMMARY_COLS = { credits: 288, average: 358, letter: 418, goal: 488, points: PAGE_W - MARGIN };
/** Grade rows: item is a left edge, the rest are right edges. */
const GRADE_COLS = { item: MARGIN + 10, date: 262, score: 350, pct: 452, weight: PAGE_W - MARGIN };
const TASK_COLS = { title: MARGIN + 10, due: 380, status: PAGE_W - MARGIN };

interface Cell {
  text: string;
  /** Left edge, or the right edge when `alignRight` is set. */
  x: number;
  alignRight?: boolean;
  bold?: boolean;
  color?: string;
  /** Truncate with an ellipsis past this width. */
  maxWidth?: number;
}

/** One line of a table: every cell shares a baseline, then the cursor drops. */
function pdfRow(
  doc: PdfDoc,
  cells: Cell[],
  { size = 9.5, leading = 15 }: { size?: number; leading?: number } = {},
) {
  doc.need(leading);
  const top = doc.y;
  for (const cell of cells) {
    doc.y = top;
    doc.text(
      cell.maxWidth
        ? doc.ellipsize(cell.text, cell.maxWidth, size, cell.bold)
        : cell.text,
      {
        x: cell.x,
        size,
        bold: cell.bold,
        color: cell.color ?? INK,
        alignRight: cell.alignRight,
        leading,
      },
    );
  }
  doc.y = top - leading;
}

/** "Aug 1, 2026". Pinned to UTC so a date-only ISO never slips a day. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Mon · Wed · Fri, 10:00 AM – 11:20 AM" — the class's standing appointment. */
function meetingLine(c: ClassItem): string {
  const days = [...c.days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(" · ");
  const time = `${fmtTime(c.start)} – ${fmtTime(c.end)}`;
  return days ? `${days}, ${time}` : time;
}

export interface GradeReportPdfOptions extends GradeReportOptions {
  /** Open and completed work, printed under the class that assigned it. */
  tasks?: TaskItem[];
  /** Printed under the title, so the page identifies whose record it is. */
  studentName?: string;
  /** The semester's span, ISO dates, from Settings → Term. */
  termStart?: string | null;
  termEnd?: string | null;
}

export function buildGradeReportPdf(
  classes: ClassItem[],
  grades: GradeItem[],
  {
    scale = DEFAULT_SCALE,
    termName,
    tasks = [],
    studentName,
    termStart,
    termEnd,
    generatedAt = new Date(),
  }: GradeReportPdfOptions = {},
): Uint8Array {
  const doc = new PdfDoc({
    title: termName ? `ClassPing grade report — ${termName}` : "ClassPing grade report",
    author: studentName,
    createdAt: generatedAt,
  });

  const gpa = overallGpa(classes, grades, scale);
  const projected = projectedGpa(classes, grades, scale);

  /* ── title block ── */
  doc.rect(0, PAGE_H, PAGE_W, 5, BRAND);
  doc.y = PAGE_H - MARGIN;

  const titleTop = doc.y;
  doc.text("CLASSPING", { size: 8, bold: true, color: BRAND });
  doc.space(2);
  doc.text(termName ? `${termName} Grade Report` : "Grade Report", {
    size: 22,
    bold: true,
  });

  // GPA sits opposite the title rather than below it: it's the number anyone
  // picking up the page looks for first.
  const afterTitle = doc.y;
  doc.y = titleTop;
  doc.text("OVERALL GPA", {
    x: PAGE_W - MARGIN,
    alignRight: true,
    size: 8,
    bold: true,
    color: FAINT,
  });
  doc.space(2);
  doc.text(gpa === null ? "—" : `${gpa.toFixed(2)} / 4.0`, {
    x: PAGE_W - MARGIN,
    alignRight: true,
    size: 20,
    bold: true,
    color: BRAND,
  });
  if (projected !== null) {
    doc.text(`Projected ${projected.toFixed(2)}`, {
      x: PAGE_W - MARGIN,
      alignRight: true,
      size: 9,
      color: MUTED,
    });
  }
  doc.y = Math.min(afterTitle, doc.y);

  const meta = [
    studentName,
    termStart && termEnd
      ? `${fmtDate(termStart)} – ${fmtDate(termEnd)}`
      : termStart
        ? `From ${fmtDate(termStart)}`
        : termEnd
          ? `Through ${fmtDate(termEnd)}`
          : null,
    `Generated ${fmtDate(generatedAt.toISOString().slice(0, 10))}`,
  ].filter(Boolean) as string[];
  doc.space(4);
  doc.text(meta.join("  ·  "), { size: 9, color: MUTED });
  doc.space(6);
  doc.rule(RULE, 16);

  /* ── summary table ── */
  const graded = classes.filter((c) =>
    grades.some((g) => g.classId === c.id),
  );
  if (graded.length > 0) {
    doc.text("Summary", { size: 13, bold: true });
    doc.space(4);
    pdfRow(doc, headerCells(), { size: 8 });
    doc.rule(RULE, 6);

    for (const c of graded) {
      const avg = classAverage(grades.filter((g) => g.classId === c.id))!;
      pdfRow(doc, [
        { text: c.name, x: MARGIN, maxWidth: 190, bold: true },
        { text: String(creditsFor(c)), x: SUMMARY_COLS.credits, alignRight: true, color: MUTED },
        { text: `${avg.toFixed(1)}%`, x: SUMMARY_COLS.average, alignRight: true, color: MUTED },
        { text: letterFor(avg, scale), x: SUMMARY_COLS.letter, alignRight: true, bold: true },
        {
          text: typeof c.goal === "number" && c.goal > 0 ? `${c.goal}%` : "—",
          x: SUMMARY_COLS.goal,
          alignRight: true,
          color: MUTED,
        },
        {
          text: pointsFor(avg, scale).toFixed(1),
          x: SUMMARY_COLS.points,
          alignRight: true,
          color: MUTED,
        },
      ]);
    }

    doc.rule(RULE, 10);
    pdfRow(doc, [
      { text: "Overall GPA", x: MARGIN, bold: true },
      {
        text: gpa === null ? "n/a" : gpa.toFixed(2),
        x: PAGE_W - MARGIN,
        alignRight: true,
        bold: true,
        color: BRAND,
      },
    ]);
    if (projected !== null) {
      pdfRow(doc, [
        { text: "Projected GPA (if every goal is met)", x: MARGIN, color: MUTED },
        {
          text: projected.toFixed(2),
          x: PAGE_W - MARGIN,
          alignRight: true,
          bold: true,
          color: MUTED,
        },
      ]);
    }
    doc.space(12);
  }

  /* ── one section per class ── */
  for (const c of classes) {
    // localeCompare, not `a < b ? -1 : 1` — the latter never returns 0, so two
    // items sharing a date get an order decided by the sort implementation
    // rather than by us. Stable sort keeps same-day entries as entered.
    const mine = [...grades.filter((g) => g.classId === c.id)].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const work = [...tasks.filter((t) => t.classId === c.id)].sort((a, b) =>
      a.due.localeCompare(b.due),
    );
    const avg = classAverage(mine);
    const bar = PALETTE[c.color]?.bar ?? BRAND;

    // Keep the heading with at least the first row under it rather than
    // stranding a class name at the foot of a page.
    doc.need(90);
    doc.space(6);

    // Measure the grade first so the name can be trimmed to whatever space is
    // left — otherwise a long title runs straight under it.
    const summary =
      avg === null ? "No grades yet" : `${letterFor(avg, scale)}  ·  ${avg.toFixed(1)}%`;
    const nameWidth =
      CONTENT_W - 10 - textWidth(summary, 12, avg !== null) - 14;

    const headTop = doc.y;
    doc.rect(MARGIN, headTop, 3, 15, bar);
    doc.text(doc.ellipsize(c.name, nameWidth, 13, true), {
      x: MARGIN + 10,
      size: 13,
      bold: true,
    });
    const afterName = doc.y;
    doc.y = headTop;
    doc.text(summary, {
      x: PAGE_W - MARGIN,
      alignRight: true,
      size: 12,
      bold: avg !== null,
      color: avg === null ? FAINT : bar,
    });
    doc.y = afterName;

    const detail = [
      c.instructor,
      c.room,
      meetingLine(c),
      `${creditsFor(c)} ${creditsFor(c) === 1 ? "credit" : "credits"}`,
      typeof c.goal === "number" && c.goal > 0
        ? `Goal ${c.goal}% (${letterFor(c.goal, scale)})`
        : null,
    ].filter(Boolean) as string[];
    doc.text(doc.ellipsize(detail.join("  ·  "), CONTENT_W - 10, 9), {
      x: MARGIN + 10,
      size: 9,
      color: MUTED,
    });
    doc.space(4);

    /* the private note the student attached to this class */
    if (c.notes?.trim()) {
      doc.need(30);
      doc.text("NOTES", { x: MARGIN + 10, size: 7.5, bold: true, color: FAINT });
      doc.paragraph(c.notes.trim(), {
        x: MARGIN + 10,
        maxWidth: CONTENT_W - 10,
        size: 9.5,
        color: INK,
      });
      doc.space(4);
    }

    /* grades */
    if (mine.length > 0) {
      doc.need(40);
      pdfRow(
        doc,
        [
          { text: "GRADED WORK", x: GRADE_COLS.item, bold: true, color: FAINT },
          { text: "DATE", x: GRADE_COLS.date, bold: true, color: FAINT },
          { text: "SCORE", x: GRADE_COLS.score, bold: true, color: FAINT },
          { text: "%", x: GRADE_COLS.pct, alignRight: true, bold: true, color: FAINT },
          { text: "WEIGHT", x: GRADE_COLS.weight, alignRight: true, bold: true, color: FAINT },
        ],
        { size: 7.5, leading: 12 },
      );
      for (const g of mine) {
        const pct = g.max > 0 ? (g.score / g.max) * 100 : 0;
        pdfRow(doc, [
          { text: g.title, x: GRADE_COLS.item, maxWidth: 195 },
          { text: fmtDate(g.date), x: GRADE_COLS.date, color: MUTED },
          { text: `${g.score} / ${g.max}`, x: GRADE_COLS.score, color: MUTED },
          { text: `${pct.toFixed(1)}%`, x: GRADE_COLS.pct, alignRight: true, bold: true },
          { text: `${g.weight}%`, x: GRADE_COLS.weight, alignRight: true, color: MUTED },
        ]);
      }
      doc.space(2);
    }

    /* assignments */
    if (work.length > 0) {
      doc.need(40);
      pdfRow(
        doc,
        [
          { text: "ASSIGNMENTS", x: TASK_COLS.title, bold: true, color: FAINT },
          { text: "DUE", x: TASK_COLS.due, bold: true, color: FAINT },
          { text: "STATUS", x: TASK_COLS.status, alignRight: true, bold: true, color: FAINT },
        ],
        { size: 7.5, leading: 12 },
      );
      for (const t of work) {
        pdfRow(doc, [
          {
            text: t.kind === "exam" ? `${t.title}  (exam)` : t.title,
            x: TASK_COLS.title,
            maxWidth: 310,
          },
          { text: fmtDate(t.due), x: TASK_COLS.due, color: MUTED },
          {
            text: t.done ? "Done" : "Open",
            x: TASK_COLS.status,
            alignRight: true,
            bold: !t.done,
            color: t.done ? MUTED : INK,
          },
        ]);
      }
      doc.space(2);
    }

    if (mine.length === 0 && work.length === 0) {
      doc.text("Nothing logged for this class yet.", {
        x: MARGIN + 10,
        size: 9.5,
        color: FAINT,
      });
    }

    doc.space(4);
    doc.rule(RULE, 10);
  }

  if (classes.length === 0) {
    doc.text("No classes in this term yet.", { size: 11, color: MUTED });
  }

  return doc.build(
    (page, total) =>
      `ClassPing${termName ? ` · ${termName}` : ""} · Page ${page} of ${total}`,
  );
}

function headerCells(): Cell[] {
  return [
    { text: "CLASS", x: MARGIN, bold: true, color: FAINT },
    { text: "CREDITS", x: SUMMARY_COLS.credits, alignRight: true, bold: true, color: FAINT },
    { text: "AVERAGE", x: SUMMARY_COLS.average, alignRight: true, bold: true, color: FAINT },
    { text: "GRADE", x: SUMMARY_COLS.letter, alignRight: true, bold: true, color: FAINT },
    { text: "GOAL", x: SUMMARY_COLS.goal, alignRight: true, bold: true, color: FAINT },
    { text: "POINTS", x: SUMMARY_COLS.points, alignRight: true, bold: true, color: FAINT },
  ];
}
