/**
 * The ClassPet — a companion that reflects how the term is going.
 *
 * ── What it is allowed to know ──────────────────────────────────────────────
 *
 * Everything here is derived from data the app already keeps: the task counts
 * and days-clear streak from lib/streak.ts, the assignment streak from
 * lib/trophies.ts, and the level from lib/xp.ts. Notably *not* attendance —
 * ClassPing has never recorded whether a class was attended, and inventing that
 * signal would mean a new persisted field, a new thing to tap, and a guess
 * about what an unanswered prompt means. A phone left in a bag is not a skipped
 * lecture, and a pet that sulks at a student who actually showed up is worse
 * than no pet at all.
 *
 * ── Why mood is computed and not stored ─────────────────────────────────────
 *
 * The persisted state is two optional strings: a name and a hat. Mood is a pure
 * function of the term, recomputed on every render. Storing it would let it
 * drift out of step with the tasks that are supposed to cause it — a pet still
 * sulking about an assignment that was finished on another device is a bug
 * report, and a stored mood is how you get one.
 *
 * ── Tone ────────────────────────────────────────────────────────────────────
 *
 * The gentleness in lib/streak.ts is deliberate and this file inherits it. A
 * student who is behind already knows. The pet's worst state is subdued and its
 * line offers a way back in; nothing here scolds, and nothing is ever framed as
 * the pet being hurt by the user. Guilt is an effective motivator right up
 * until it makes someone close the app for good.
 */

import type { TermStats } from "./streak";

export interface PetState {
  /** What the student calls it. Empty means "not named yet". */
  name: string;
  /** Equipped hat — a cosmetic id from lib/xp.ts, earned by levelling. */
  hat?: string;
}

export const DEFAULT_PET_NAME = "Pip";
export const MAX_PET_NAME = 24;

export const emptyPetState = (): PetState => ({ name: DEFAULT_PET_NAME });

/** Defensive read — this crosses localStorage and the sync endpoint. */
export function normalizePetState(raw: unknown): PetState {
  if (!raw || typeof raw !== "object") return emptyPetState();
  const v = raw as Partial<PetState>;
  const name =
    typeof v.name === "string" && v.name.trim()
      ? v.name.trim().slice(0, MAX_PET_NAME)
      : DEFAULT_PET_NAME;
  // The hat is validated against the real cosmetic list by the component that
  // draws it; here we only guarantee it's a short string and not, say, an
  // object that would blow up when spread into a style.
  const hat =
    typeof v.hat === "string" && v.hat.length > 0 && v.hat.length <= 40
      ? v.hat
      : undefined;
  return hat ? { name, hat } : { name };
}

/* ── growth ─────────────────────────────────────────────── */

export type PetStage = "egg" | "sprout" | "grown" | "radiant";

export interface Stage {
  id: PetStage;
  /** Level at which the pet reaches this stage. */
  at: number;
  label: string;
}

/**
 * Growth tracks the XP level rather than a counter of its own.
 *
 * One long-arc number is enough for the app to have, and hanging the pet off it
 * means the two features can never disagree about how the term has gone — a
 * pet that looked thriving beside a level that said otherwise would make both
 * numbers untrustworthy.
 */
export const STAGES: Stage[] = [
  { id: "egg", at: 1, label: "Egg" },
  { id: "sprout", at: 2, label: "Sprout" },
  { id: "grown", at: 6, label: "Grown" },
  { id: "radiant", at: 12, label: "Radiant" },
];

export function petStage(level: number): Stage {
  let stage = STAGES[0];
  for (const s of STAGES) if (level >= s.at) stage = s;
  return stage;
}

/** The next stage and the level it needs, or null once fully grown. */
export function nextStage(level: number): Stage | null {
  return STAGES.find((s) => s.at > level) ?? null;
}

/* ── mood ───────────────────────────────────────────────── */

/**
 * Ordered worst to best. `resting` is not on that scale — it's the state before
 * there is anything to have an opinion about.
 */
export type PetMood = "resting" | "droopy" | "concerned" | "content" | "bright" | "beaming";

export interface PetStatus {
  mood: PetMood;
  stage: Stage;
  /** One line, in the pet's voice, shown beside it. */
  line: string;
}

export interface PetSignals {
  stats: TermStats;
  /** The assignment streak from lib/trophies.ts — consecutive on-time finishes. */
  trophyStreak: number;
  level: number;
  /** Whether the planner has anything in it at all. */
  hasTasks: boolean;
}

/**
 * Thresholds.
 *
 * Three overdue rather than one for the lowest mood: a single slipped deadline
 * is an ordinary week, and a pet that droops at the first one would spend most
 * of the term drooping, which makes the signal worthless as well as unkind.
 */
const DROOPY_OVERDUE = 3;
const BEAMING_STREAK = 5;
const BRIGHT_DAYS_CLEAR = 3;

export function petStatus({
  stats,
  trophyStreak,
  level,
  hasTasks,
}: PetSignals): PetStatus {
  const stage = petStage(level);

  if (!hasTasks) {
    return {
      mood: "resting",
      stage,
      line:
        stage.id === "egg"
          ? "Add an assignment and I’ll wake up."
          : "Nothing on the list. Enjoy it.",
    };
  }

  if (stats.overdue >= DROOPY_OVERDUE) {
    return {
      mood: "droopy",
      stage,
      // Names the smallest possible next step. The point of this state is to
      // be a way back in, not a verdict on the term.
      line: `${stats.overdue} things are past due. Pick the quickest one?`,
    };
  }

  if (stats.overdue > 0) {
    return {
      mood: "concerned",
      stage,
      line:
        stats.overdue === 1
          ? "One overdue. Not a crisis — shall we?"
          : `${stats.overdue} overdue. One at a time.`,
    };
  }

  if (trophyStreak >= BEAMING_STREAK) {
    return {
      mood: "beaming",
      stage,
      line: `${trophyStreak} in a row, all on time. You’re flying.`,
    };
  }

  if (stats.streak >= BRIGHT_DAYS_CLEAR) {
    return {
      mood: "bright",
      stage,
      line: `${stats.streak} days with nothing overdue.`,
    };
  }

  return {
    mood: "content",
    stage,
    line:
      stats.dueThisWeek > 0
        ? `${stats.dueThisWeek} due this week. We’ve got time.`
        : "All clear right now.",
  };
}

/**
 * How wide the eyes open and how far the mouth curves, 0–1. Kept here rather
 * than in the component so the drawing has no opinions of its own — the SVG is
 * one shape driven by numbers, not six hand-drawn faces to keep in sync.
 */
export function moodExpression(mood: PetMood): {
  /** 1 = wide awake, 0 = closed. */
  eyes: number;
  /** 1 = big smile, −1 = frown. */
  mouth: number;
  /** Body tint, as a CSS variable name from globals.css. */
  tint: string;
} {
  switch (mood) {
    case "beaming":
      return { eyes: 1, mouth: 1, tint: "var(--good)" };
    case "bright":
      return { eyes: 0.95, mouth: 0.7, tint: "var(--color-brand)" };
    case "content":
      return { eyes: 0.85, mouth: 0.4, tint: "var(--color-brand)" };
    case "concerned":
      return { eyes: 0.75, mouth: -0.15, tint: "var(--warn-ink)" };
    case "droopy":
      return { eyes: 0.45, mouth: -0.5, tint: "var(--color-muted-2)" };
    case "resting":
      return { eyes: 0.12, mouth: 0.2, tint: "var(--color-muted-2)" };
  }
}
