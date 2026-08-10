import type { TaskItem } from "./store";

/**
 * "Term at a glance" — encouragement derived entirely from data the app
 * already has, so it costs no new schema and no new syncing.
 *
 * Deliberately gentle. Study apps lean on streaks because they work, but a
 * guilt-driven counter backfires on students who are already behind: the
 * streak here counts *days with nothing overdue*, which a struggling user can
 * always restart by clearing their backlog, rather than days of perfect
 * completion, which can become permanently unreachable.
 */

export interface TermStats {
  /** Assignments ticked off, ever. */
  completed: number;
  /** Open items already past their due date. */
  overdue: number;
  /** Open items due in the next 7 days. */
  dueThisWeek: number;
  /** Consecutive days up to today with nothing overdue. Capped for sanity. */
  streak: number;
}

const DAY_MS = 86400_000;
/** Looking further back than a school year tells us nothing useful. */
const MAX_STREAK_DAYS = 365;

const startOfDay = (d: Date): number => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.getTime();
};

/**
 * Was anything overdue at the end of `dayStart`?
 *
 * A task counts as overdue on a past day when it was due before that day
 * ended and it is *still* not done — we don't record completion timestamps,
 * so a finished task is treated as never having been a problem. That reads
 * generously on purpose: the number should encourage, not accuse.
 */
function hadOverdue(tasks: TaskItem[], dayEnd: number): boolean {
  return tasks.some((t) => {
    if (t.done) return false;
    const due = new Date(t.due).getTime();
    return Number.isFinite(due) && due < dayEnd;
  });
}

export function termStats(tasks: TaskItem[], now: Date = new Date()): TermStats {
  const today = startOfDay(now);
  const nowMs = now.getTime();

  let completed = 0;
  let overdue = 0;
  let dueThisWeek = 0;

  for (const t of tasks) {
    if (t.done) {
      completed++;
      continue;
    }
    const due = new Date(t.due).getTime();
    if (!Number.isFinite(due)) continue;
    if (due < nowMs) overdue++;
    else if (due - nowMs <= 7 * DAY_MS) dueThisWeek++;
  }

  // Only count back as far as this student has actually been using the app.
  // Without this bound, someone whose two tasks are both ticked off would be
  // told they'd been clear for a year — flattering, and obviously untrue.
  const earliestDue = tasks.reduce((min, t) => {
    const due = new Date(t.due).getTime();
    return Number.isFinite(due) && due < min ? due : min;
  }, Infinity);
  const daysInUse = Number.isFinite(earliestDue)
    ? Math.max(1, Math.ceil((today + DAY_MS - earliestDue) / DAY_MS))
    : 0;
  const limit = Math.min(MAX_STREAK_DAYS, daysInUse);

  // Walk back while each day ended clean.
  let streak = 0;
  for (let i = 0; i < limit; i++) {
    const dayEnd = today + DAY_MS - i * DAY_MS;
    if (hadOverdue(tasks, dayEnd)) break;
    streak++;
  }

  return { completed, overdue, dueThisWeek, streak };
}
