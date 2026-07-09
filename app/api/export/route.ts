import { NextResponse } from "next/server";
import { isPro } from "@/lib/entitlements";
import { buildCalendarFile } from "@/lib/calendar";
import type { ClassItem, TaskItem } from "@/lib/store";

/** Sanity cap — a personal timetable will never come close to this. */
const MAX_ITEMS = 300;

/**
 * Builds the .ics calendar file. Pro-only: the entitlement is re-checked here
 * on the server, so a client with edited local state still can't export.
 *
 * The schedule data itself lives on the device (localStorage), so the client
 * sends it in the request body along with its local wall-clock time (`now`,
 * a naive "YYYY-MM-DDTHH:mm:ss" string) to anchor weekly recurrences to the
 * user's timezone rather than the server's.
 */
export async function POST(req: Request) {
  if (!(await isPro())) {
    return NextResponse.json(
      { error: "pro_required", message: "Calendar export is a Pro feature." },
      { status: 403 },
    );
  }

  let body: { classes?: unknown; tasks?: unknown; now?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const classes = Array.isArray(body.classes)
    ? (body.classes.slice(0, MAX_ITEMS) as ClassItem[])
    : [];
  const tasks = Array.isArray(body.tasks)
    ? (body.tasks.slice(0, MAX_ITEMS) as TaskItem[])
    : [];

  let now = new Date();
  if (typeof body.now === "string") {
    const parsed = new Date(body.now);
    if (!Number.isNaN(parsed.getTime())) now = parsed;
  }

  const nameById = new Map(classes.map((c) => [c.id, c.name]));
  const ics = buildCalendarFile(classes, tasks, (id) => nameById.get(id), now);

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar;charset=utf-8",
      "Content-Disposition": 'attachment; filename="classping.ics"',
    },
  });
}
