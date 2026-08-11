/**
 * Boss fights — a week you decide to take seriously.
 *
 * Midterms week doesn't feel like seven assignments, it feels like one large
 * undifferentiated dread. This reframes it: on Monday you name the handful of
 * things that actually make up the week, and each one finished takes a visible
 * bite out of a single thing rather than crossing one line off an endless list.
 * The work is identical; what changes is that it becomes finite and legible.
 *
 * ── What it commits to ──────────────────────────────────────────────────────
 *
 * Existing tasks, chosen by the student. Not study sessions: a Pomodoro is time
 * spent, and time spent is exactly the measure that lets a bad week feel
 * productive without anything being finished. Damage lands when work is done.
 *
 * ── The tone rule ───────────────────────────────────────────────────────────
 *
 * Losing costs nothing. No XP is taken, no trophy is revoked, the streak is
 * untouched — a lost fight simply isn't a won one. lib/streak.ts is careful for
 * the same reason: a student in a bad week is the one person a punishment
 * mechanic will drive out of the app entirely, and they're also the person who
 * most needs to open it on Monday and try again.
 *
 * ── Storage ─────────────────────────────────────────────────────────────────
 *
 * One optional fight plus two counters. As with lib/xp.ts, deliberately not a
 * history: the synced document has a hard size ceiling, and a per-week record
 * kept for a whole degree is how you quietly break sync two years from now.
 */

import type { TaskItem } from "./store";

/** Fewer than this isn't a boss, it's a Tuesday. */
export const MIN_COMMITMENT = 2;
/** More than this is a to-do list wearing a costume, and it's unwinnable. */
export const MAX_COMMITMENT = 10;

export interface BossFight {
  /** ISO date (YYYY-MM-DD) of the Monday this fight belongs to — its identity. */
  week: string;
  /** Task ids committed to, in the order they were chosen. */
  taskIds: string[];
  /** ISO timestamp the commitment was made. */
  startedAt: string;
}

export type BossOutcome = "won" | "lost";

export interface BossResult {
  week: string;
  outcome: BossOutcome;
  /** How many of the committed tasks were finished. */
  defeated: number;
  total: number;
}

export interface BossState {
  /** The fight in progress, if any. */
  current: BossFight | null;
  /** Lifetime counters — not a ledger. */
  won: number;
  lost: number;
  /** The most recent result, held only until the UI has shown it. */
  lastResult: BossResult | null;
}

export const emptyBossState = (): BossState => ({
  current: null,
  won: 0,
  lost: 0,
  lastResult: null,
});

/* ── weeks ──────────────────────────────────────────────── */

const pad = (n: number) => n.toString().padStart(2, "0");

/** Local YYYY-MM-DD. Deliberately not toISOString, which would shift the day. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The Monday of the week containing `now`, as a YYYY-MM-DD key. */
export function weekKey(now: Date): string {
  const dow = (now.getDay() + 6) % 7; // 0 = Mon … 6 = Sun
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - dow);
  return isoDate(monday);
}

/**
 * The instant a fight expires: midnight at the end of the following Sunday.
 *
 * Built by stepping a real Date rather than adding seven days of milliseconds,
 * so a week containing a daylight-saving change is still a week and a fight
 * doesn't quietly expire an hour early in October.
 */
export function weekDeadline(week: string): number {
  const [y, m, d] = week.split("-").map(Number);
  const monday = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  monday.setDate(monday.getDate() + 7);
  return monday.getTime();
}

/** Whole days left before the deadline, floored at zero. */
export function daysLeft(week: string, now: Date): number {
  const ms = weekDeadline(week) - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/* ── progress ───────────────────────────────────────────── */

export interface BossProgress {
  /** Committed tasks that still exist. */
  total: number;
  /** Of those, the ones finished. */
  defeated: number;
  /** 0–1 damage dealt. A fight with nothing left in it reads as complete. */
  fraction: number;
  /** True once every surviving committed task is done. */
  cleared: boolean;
  /**
   * Every committed task has been deleted. The fight is void rather than lost —
   * removing work you no longer have to do is not the same as failing to do it.
   */
  voided: boolean;
}

export function fightProgress(
  fight: BossFight,
  tasks: TaskItem[],
): BossProgress {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const live = fight.taskIds
    .map((id) => byId.get(id))
    .filter((t): t is TaskItem => !!t);
  const defeated = live.filter((t) => t.done).length;
  const total = live.length;
  return {
    total,
    defeated,
    fraction: total === 0 ? 1 : defeated / total,
    cleared: total > 0 && defeated === total,
    voided: total === 0,
  };
}

/* ── transitions ────────────────────────────────────────── */

/**
 * Commit to a week.
 *
 * Refuses if a fight is already running — one week, one boss. The caller is
 * expected to have swept for a stale fight first (see `settle`), so the only
 * way to hit that branch is starting a second fight in the same week.
 */
export function startFight(
  state: BossState,
  taskIds: string[],
  now: Date = new Date(),
): BossState {
  if (state.current) return state;
  const unique = Array.from(new Set(taskIds)).slice(0, MAX_COMMITMENT);
  if (unique.length < MIN_COMMITMENT) return state;
  return {
    ...state,
    current: {
      week: weekKey(now),
      taskIds: unique,
      startedAt: now.toISOString(),
    },
    lastResult: null,
  };
}

/**
 * Resolve the running fight if it's finished, expired or emptied.
 *
 * Called on a poll rather than driven by events, because two of the three ways
 * a fight ends — the deadline passing, and the last committed task being
 * deleted — aren't things the user does to the fight. Idempotent: once there's
 * nothing to settle it returns the same reference, so the store's effect
 * converges instead of writing on every tick.
 */
export function settle(
  state: BossState,
  tasks: TaskItem[],
  now: Date = new Date(),
): BossState {
  const fight = state.current;
  if (!fight) return state;

  const progress = fightProgress(fight, tasks);

  if (progress.voided) {
    // Nothing left to fight. Not a loss — see the note on `voided`.
    return { ...state, current: null, lastResult: null };
  }

  if (progress.cleared) {
    return {
      ...state,
      current: null,
      won: state.won + 1,
      lastResult: {
        week: fight.week,
        outcome: "won",
        defeated: progress.defeated,
        total: progress.total,
      },
    };
  }

  if (now.getTime() >= weekDeadline(fight.week)) {
    return {
      ...state,
      current: null,
      lost: state.lost + 1,
      lastResult: {
        week: fight.week,
        outcome: "lost",
        defeated: progress.defeated,
        total: progress.total,
      },
    };
  }

  return state;
}

/** Give up on the running fight without recording a loss. */
export function abandonFight(state: BossState): BossState {
  return state.current ? { ...state, current: null, lastResult: null } : state;
}

/** The result overlay has been shown. */
export function ackResult(state: BossState): BossState {
  return state.lastResult ? { ...state, lastResult: null } : state;
}

/** Whether a new fight can be started right now. */
export function canStart(state: BossState, openTaskCount: number): boolean {
  return state.current === null && openTaskCount >= MIN_COMMITMENT;
}

/* ── persistence ────────────────────────────────────────── */

const isWeekKey = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

const count = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0
    ? Math.min(Math.floor(v), 9999)
    : 0;

/** Defensive read — this crosses localStorage and the sync endpoint. */
export function normalizeBossState(raw: unknown): BossState {
  if (!raw || typeof raw !== "object") return emptyBossState();
  const v = raw as Partial<BossState>;

  let current: BossFight | null = null;
  const c = v.current;
  if (c && typeof c === "object" && isWeekKey(c.week) && Array.isArray(c.taskIds)) {
    const taskIds = c.taskIds
      .filter((id): id is string => typeof id === "string" && id.length <= 64)
      .slice(0, MAX_COMMITMENT);
    if (taskIds.length >= MIN_COMMITMENT) {
      current = {
        week: c.week,
        taskIds,
        startedAt:
          typeof c.startedAt === "string" ? c.startedAt : new Date().toISOString(),
      };
    }
  }

  let lastResult: BossResult | null = null;
  const r = v.lastResult;
  if (
    r &&
    typeof r === "object" &&
    isWeekKey(r.week) &&
    (r.outcome === "won" || r.outcome === "lost")
  ) {
    lastResult = {
      week: r.week,
      outcome: r.outcome,
      defeated: count(r.defeated),
      total: count(r.total),
    };
  }

  return { current, won: count(v.won), lost: count(v.lost), lastResult };
}
