/**
 * Assignment streaks and the trophies they earn.
 *
 * This is the *achievement* streak, and it is deliberately a different thing
 * from the gentle "days clear" read in lib/streak.ts. That one measures calm;
 * this one measures momentum: consecutive assignments finished before their
 * deadline. Miss one and it goes back to zero.
 *
 * The loop is short on purpose. Three finishes earns Bronze, five Gold, seven
 * Platinum — and Platinum banks the run and starts the count again, so the
 * reward is always at most seven assignments away instead of receding forever.
 * Trophies, once earned, are permanent: the semester summary is a record of
 * what happened, not a score that can be taken back.
 *
 * Everything here is pure. The store owns the state; this file only says what
 * the next state should be.
 */

export type TrophyTier = "bronze" | "gold" | "platinum";

export interface Milestone {
  tier: TrophyTier;
  /** Streak length that earns this trophy. */
  at: number;
  label: string;
  /**
   * Rim / body colors for the medal icon. Literal, because a gold trophy has
   * to be gold in both themes.
   */
  ring: string;
  face: string;
  /**
   * Soft background for chips and cards. A CSS variable — the pad the medal
   * sits on follows the theme even though the medal doesn't (see globals.css).
   */
  soft: string;
}

/** Ordered by threshold — several can be crossed by a single completion. */
export const MILESTONES: Milestone[] = [
  {
    tier: "bronze",
    at: 3,
    label: "Bronze",
    ring: "#A05A22",
    face: "#CD7F32",
    soft: "var(--trophy-bronze-soft)",
  },
  {
    tier: "gold",
    at: 5,
    label: "Gold",
    ring: "#B8860B",
    face: "#F0B429",
    soft: "var(--trophy-gold-soft)",
  },
  {
    tier: "platinum",
    at: 7,
    label: "Platinum",
    ring: "#6E7C99",
    face: "#B9C5D6",
    soft: "var(--trophy-platinum-soft)",
  },
];

/** Finishing this many in a row banks Platinum and restarts the count. */
export const STREAK_LOOP = 7;

export const milestone = (tier: TrophyTier): Milestone =>
  MILESTONES.find((m) => m.tier === tier) ?? MILESTONES[0];

/** One trophy, kept forever with the moment it was earned. */
export interface Trophy {
  tier: TrophyTier;
  /** ISO timestamp. */
  at: string;
}

export interface TrophyState {
  /** Assignments finished on time since the last miss (or last Platinum). */
  streak: number;
  /** Every trophy ever earned, oldest first. */
  trophies: Trophy[];
  /**
   * Tiers already banked in the *current* run. Without this, ticking a task
   * off and back on at streak 3 would mint a Bronze every time.
   */
  awarded: TrophyTier[];
  /** Task ids already resolved into the streak, so nothing counts twice. */
  counted: string[];
  /** Task ids already counted as a miss, for the same reason. */
  missed: string[];
}

export const emptyTrophyState = (): TrophyState => ({
  streak: 0,
  trophies: [],
  awarded: [],
  counted: [],
  missed: [],
});

/**
 * Read a persisted value back defensively — this crosses localStorage and the
 * sync endpoint, so it can arrive as anything at all.
 */
export function normalizeTrophyState(raw: unknown): TrophyState {
  const empty = emptyTrophyState();
  if (!raw || typeof raw !== "object") return empty;
  const v = raw as Partial<TrophyState>;
  const strings = (a: unknown): string[] =>
    Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  return {
    streak:
      typeof v.streak === "number" && v.streak >= 0
        ? Math.min(Math.floor(v.streak), STREAK_LOOP)
        : 0,
    trophies: Array.isArray(v.trophies)
      ? v.trophies.filter(
          (t): t is Trophy =>
            !!t &&
            typeof t === "object" &&
            MILESTONES.some((m) => m.tier === (t as Trophy).tier) &&
            typeof (t as Trophy).at === "string",
        )
      : [],
    awarded: strings(v.awarded).filter((t): t is TrophyTier =>
      MILESTONES.some((m) => m.tier === t),
    ),
    counted: strings(v.counted),
    missed: strings(v.missed),
  };
}

export interface CompletionResult {
  state: TrophyState;
  /** Trophies minted by this completion, if any — for the celebration. */
  earned: Trophy[];
}

/**
 * Tick an assignment off.
 *
 * `onTime` is the whole game: finishing something that was already overdue is
 * the miss the streak is meant to punish, so it resolves the task without
 * advancing anything. Completing a task that has already been counted is a
 * no-op, which is what keeps toggling from farming trophies.
 */
export function completeTask(
  state: TrophyState,
  taskId: string,
  onTime: boolean,
  now: Date = new Date(),
): CompletionResult {
  if (state.counted.includes(taskId)) return { state, earned: [] };
  const counted = [...state.counted, taskId];

  if (!onTime) {
    return {
      state: {
        ...state,
        counted,
        missed: state.missed.includes(taskId)
          ? state.missed
          : [...state.missed, taskId],
        streak: 0,
        awarded: [],
      },
      earned: [],
    };
  }

  let streak = state.streak + 1;
  let awarded = state.awarded;
  const earned: Trophy[] = [];
  for (const m of MILESTONES) {
    if (streak >= m.at && !awarded.includes(m.tier)) {
      earned.push({ tier: m.tier, at: now.toISOString() });
      awarded = [...awarded, m.tier];
    }
  }

  // Platinum banks the run: the counter goes back to zero and the ladder is
  // climbable again from Bronze.
  if (streak >= STREAK_LOOP) {
    streak = 0;
    awarded = [];
  }

  return {
    state: {
      ...state,
      streak,
      awarded,
      counted,
      trophies: [...state.trophies, ...earned],
    },
    earned,
  };
}

/**
 * An assignment went past its due date without being finished. Resets the run.
 * Idempotent — the store sweeps for these every minute, and a task can only
 * break a streak once.
 */
export function missTask(state: TrophyState, taskId: string): TrophyState {
  if (state.missed.includes(taskId)) return state;
  return {
    ...state,
    missed: [...state.missed, taskId],
    streak: 0,
    awarded: [],
  };
}

/**
 * Un-tick an assignment. The streak steps back so the count keeps matching
 * what's actually done, but trophies already earned stay earned and `awarded`
 * is left alone, so re-ticking the same task can't mint a second copy.
 */
export function uncompleteTask(
  state: TrophyState,
  taskId: string,
): TrophyState {
  if (!state.counted.includes(taskId)) return state;
  const counted = state.counted.filter((id) => id !== taskId);
  // A late completion never advanced the streak, so undoing it must not
  // subtract one either.
  if (state.missed.includes(taskId)) return { ...state, counted };
  return { ...state, counted, streak: Math.max(0, state.streak - 1) };
}

/**
 * Drop bookkeeping for tasks that no longer exist. Without this the two id
 * lists grow for the whole semester and get synced on every change.
 */
export function pruneTrophyState(
  state: TrophyState,
  liveTaskIds: Set<string>,
): TrophyState {
  const counted = state.counted.filter((id) => liveTaskIds.has(id));
  const missed = state.missed.filter((id) => liveTaskIds.has(id));
  if (counted.length === state.counted.length && missed.length === state.missed.length) {
    return state;
  }
  return { ...state, counted, missed };
}

/** How many of each tier have been earned, for the header chips. */
export function trophyCounts(trophies: Trophy[]): Record<TrophyTier, number> {
  const counts: Record<TrophyTier, number> = {
    bronze: 0,
    gold: 0,
    platinum: 0,
  };
  for (const t of trophies) {
    if (t.tier in counts) counts[t.tier]++;
  }
  return counts;
}

/** The next trophy this streak is working toward, or null at the top. */
export function nextMilestone(streak: number): Milestone | null {
  return MILESTONES.find((m) => m.at > streak) ?? null;
}

/** One plotted trophy: when it landed and the running total at that point. */
export interface TimelinePoint {
  tier: TrophyTier;
  at: string;
  /** ms timestamp, for positioning. */
  time: number;
  /** Cumulative trophies including this one. */
  total: number;
}

/**
 * Trophies in the order they were earned, with a running total — the series
 * the semester graph plots. Unparseable timestamps are dropped rather than
 * collapsing the axis to 1970.
 */
export function trophyTimeline(trophies: Trophy[]): TimelinePoint[] {
  return trophies
    .map((t) => ({ ...t, time: new Date(t.at).getTime() }))
    .filter((t) => Number.isFinite(t.time))
    .sort((a, b) => a.time - b.time)
    .map((t, i) => ({ ...t, total: i + 1 }));
}
