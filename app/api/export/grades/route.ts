import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isPro } from "@/lib/entitlements";
import { buildGradeReport, buildGradeReportPdf } from "@/lib/report";
import { SCALES } from "@/lib/gpa";
import { check, LIMITS } from "@/lib/ratelimit";
import type { ClassItem, GradeItem, TaskItem } from "@/lib/store";

/**
 * Semester grade report, as CSV for a spreadsheet or PDF for printing.
 * Mirrors /api/export exactly: Pro re-checked server-side so edited local
 * state can't bypass it, rate limited, and the data itself arrives in the
 * request body because it lives on the device.
 */

/** Sanity cap — a personal record will never come close to this. */
const MAX_ITEMS = 500;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await isPro())) {
    return NextResponse.json(
      { error: "pro_required", message: "Grade export is a Pro feature." },
      { status: 403 },
    );
  }

  const rl = check(
    `export:${userId}`,
    LIMITS.export.limit,
    LIMITS.export.windowMs,
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many exports. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: {
    classes?: unknown;
    grades?: unknown;
    tasks?: unknown;
    scale?: unknown;
    termName?: unknown;
    format?: unknown;
    studentName?: unknown;
    termStart?: unknown;
    termEnd?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const classes = Array.isArray(body.classes)
    ? (body.classes.slice(0, MAX_ITEMS) as ClassItem[])
    : [];
  const grades = Array.isArray(body.grades)
    ? (body.grades.slice(0, MAX_ITEMS) as GradeItem[])
    : [];
  const tasks = Array.isArray(body.tasks)
    ? (body.tasks.slice(0, MAX_ITEMS) as TaskItem[])
    : [];
  const scale =
    body.scale === "simple" ? SCALES.simple : SCALES.standard;
  const text = (v: unknown, max: number): string | undefined =>
    typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined;
  const termName = text(body.termName, 64);

  if (body.format === "pdf") {
    const pdf = buildGradeReportPdf(classes, grades, {
      scale,
      termName,
      tasks,
      studentName: text(body.studentName, 64),
      termStart: text(body.termStart, 10),
      termEnd: text(body.termEnd, 10),
    });
    // A fresh ArrayBuffer, because the typed array may be a view into a
    // larger pooled buffer and Response would then send the whole pool.
    return new Response(pdf.slice().buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="classping-grades.pdf"',
      },
    });
  }

  const csv = buildGradeReport(classes, grades, { scale, termName });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": 'attachment; filename="classping-grades.csv"',
    },
  });
}
