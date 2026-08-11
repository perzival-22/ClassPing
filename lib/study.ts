/**
 * The shape of a study session.
 *
 * A single block is one decision — "how long" — and the timer already handled
 * that well. Pomodoro is a *sequence* of blocks, and the sequencing is the only
 * part with rules worth getting wrong: breaks go between focus blocks and never
 * after the last one, and every fourth break is the long one. That's the whole
 * of it, so it lives here as data the timer walks rather than as branching
 * inside the component.
 *
 * Pure on purpose. The component owns the clock; this file only says what the
 * session is made of and how much of it counted as work.
 */

export type BlockKind = "focus" | "break";

export interface StudyBlock {
  kind: BlockKind;
  minutes: number;
  /** True for the longer break earned after a run of focus blocks. */
  long?: boolean;
}

export interface PomodoroConfig {
  /** Minutes of work per focus block. */
  focus: number;
  shortBreak: number;
  longBreak: number;
  /** How many focus blocks the whole session contains. */
  rounds: number;
}

/** The classic 25/5/15, four rounds — the default because it's the one people
 *  have heard of, and a familiar shape is easier to commit to than a tuned one. */
export const DEFAULT_POMODORO: PomodoroConfig = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
  rounds: 4,
};

/** A long break replaces the short one after this many focus blocks. */
export const ROUNDS_PER_LONG_BREAK = 4;

export const MAX_ROUNDS = 8;
/** Matches the single-block ceiling — a "focus block" of four hours isn't one. */
export const MAX_BLOCK_MINUTES = 240;

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(n)));

export function normalizeConfig(c: Partial<PomodoroConfig>): PomodoroConfig {
  return {
    focus: clamp(c.focus ?? DEFAULT_POMODORO.focus, 1, MAX_BLOCK_MINUTES),
    shortBreak: clamp(c.shortBreak ?? DEFAULT_POMODORO.shortBreak, 1, 60),
    longBreak: clamp(c.longBreak ?? DEFAULT_POMODORO.longBreak, 1, 60),
    rounds: clamp(c.rounds ?? DEFAULT_POMODORO.rounds, 1, MAX_ROUNDS),
  };
}

/**
 * Expand a config into the blocks to run, in order.
 *
 * No trailing break: the session ends on the work, because a break you're told
 * to take after you've stopped working is just a countdown to nothing. The long
 * break lands after every fourth focus block, but only when more work follows —
 * so a plain four-round session ends cleanly at the fourth focus.
 */
export function buildPlan(config: PomodoroConfig): StudyBlock[] {
  const { focus, shortBreak, longBreak, rounds } = normalizeConfig(config);
  const plan: StudyBlock[] = [];
  for (let i = 1; i <= rounds; i++) {
    plan.push({ kind: "focus", minutes: focus });
    if (i === rounds) break; // the session ends on work
    const long = i % ROUNDS_PER_LONG_BREAK === 0;
    plan.push({
      kind: "break",
      minutes: long ? longBreak : shortBreak,
      ...(long ? { long: true } : {}),
    });
  }
  return plan;
}

/** A single timed block, so the timer can run one code path for both modes. */
export function singlePlan(minutes: number): StudyBlock[] {
  return [{ kind: "focus", minutes: clamp(minutes, 1, MAX_BLOCK_MINUTES) }];
}

/**
 * Minutes of *focus* in the first `count` blocks — what a session is worth once
 * it's over, and what XP is paid on. Breaks are excluded: resting is part of the
 * method, but it isn't the thing being rewarded.
 */
export function focusMinutesDone(plan: StudyBlock[], count: number): number {
  return plan
    .slice(0, Math.max(0, Math.min(count, plan.length)))
    .reduce((sum, b) => (b.kind === "focus" ? sum + b.minutes : sum), 0);
}

/** Wall-clock length of the whole plan, for the "about an hour" line in setup. */
export function planMinutes(plan: StudyBlock[]): number {
  return plan.reduce((sum, b) => sum + b.minutes, 0);
}

/** How many focus blocks are in the plan, for "round 2 of 4". */
export function focusCount(plan: StudyBlock[]): number {
  return plan.filter((b) => b.kind === "focus").length;
}

/** Which focus block `index` is, 1-based. Breaks report the round they follow. */
export function roundAt(plan: StudyBlock[], index: number): number {
  return plan
    .slice(0, Math.min(index + 1, plan.length))
    .filter((b) => b.kind === "focus").length;
}
