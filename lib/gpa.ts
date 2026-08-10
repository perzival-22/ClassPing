import type { ClassItem, GradeItem } from "./store";

/**
 * Grade maths.
 *
 * Per class: weighted average percentage across graded events.
 * Overall GPA: credit-weighted mean of the 4.0-scale points of every class
 * that has at least one grade — a 4-credit class moves the number twice as
 * much as a 2-credit one, which is how every registrar actually computes it.
 * Classes with no credits recorded count as 1, so the unweighted behaviour
 * this replaced still holds for anyone who never fills the field in.
 */

/** Weighted class average in percent, or null with no usable grades. */
export function classAverage(grades: GradeItem[]): number | null {
  const valid = grades.filter((g) => g.max > 0 && g.weight > 0);
  if (valid.length === 0) return null;
  const totalWeight = valid.reduce((s, g) => s + g.weight, 0);
  const weighted = valid.reduce((s, g) => s + (g.score / g.max) * g.weight, 0);
  return (weighted / totalWeight) * 100;
}

/** One band of a letter-grade scale: score at or above `min` earns it. */
export interface ScaleBand {
  min: number;
  letter: string;
  points: number;
}

/**
 * US 4.0 scale. Not every school grades this way — a UK or IB student needs
 * different bands entirely — so it's the default rather than the only option.
 */
export const DEFAULT_SCALE: ScaleBand[] = [
  { min: 93, letter: "A", points: 4.0 },
  { min: 90, letter: "A-", points: 3.7 },
  { min: 87, letter: "B+", points: 3.3 },
  { min: 83, letter: "B", points: 3.0 },
  { min: 80, letter: "B-", points: 2.7 },
  { min: 77, letter: "C+", points: 2.3 },
  { min: 73, letter: "C", points: 2.0 },
  { min: 70, letter: "C-", points: 1.7 },
  { min: 67, letter: "D+", points: 1.3 },
  { min: 63, letter: "D", points: 1.0 },
  { min: 60, letter: "D-", points: 0.7 },
];

/** A stricter scale, common in schools that don't use plus/minus bands. */
export const SIMPLE_SCALE: ScaleBand[] = [
  { min: 90, letter: "A", points: 4.0 },
  { min: 80, letter: "B", points: 3.0 },
  { min: 70, letter: "C", points: 2.0 },
  { min: 60, letter: "D", points: 1.0 },
];

export const SCALES = {
  standard: DEFAULT_SCALE,
  simple: SIMPLE_SCALE,
} as const;

export type ScaleId = keyof typeof SCALES;

/** Sorted high-to-low so the first match wins, whatever order was supplied. */
const ordered = (scale: ScaleBand[]) =>
  [...scale].sort((a, b) => b.min - a.min);

export function letterFor(pct: number, scale: ScaleBand[] = DEFAULT_SCALE): string {
  for (const band of ordered(scale)) if (pct >= band.min) return band.letter;
  return "F";
}

export function pointsFor(pct: number, scale: ScaleBand[] = DEFAULT_SCALE): number {
  for (const band of ordered(scale)) if (pct >= band.min) return band.points;
  return 0;
}

/** Credits a class carries toward the GPA. Unset means "count it once". */
export function creditsFor(c: ClassItem): number {
  return typeof c.credits === "number" && c.credits > 0 ? c.credits : 1;
}

/** Overall GPA on the 4.0 scale, or null if no class has grades yet. */
export function overallGpa(
  classes: ClassItem[],
  grades: GradeItem[],
  scale: ScaleBand[] = DEFAULT_SCALE,
): number | null {
  let totalCredits = 0;
  let totalPoints = 0;
  for (const c of classes) {
    const avg = classAverage(grades.filter((g) => g.classId === c.id));
    if (avg === null) continue;
    const credits = creditsFor(c);
    totalCredits += credits;
    totalPoints += pointsFor(avg, scale) * credits;
  }
  if (totalCredits === 0) return null;
  return totalPoints / totalCredits;
}

/**
 * Projected end-of-term GPA, assuming every class lands on its goal.
 *
 * Classes with a goal set contribute the points that goal percentage would
 * earn; classes without one contribute their current average, so the number
 * always answers "where do I end up if the plan holds?". Returns null until
 * at least one class has a goal — with no goals set there is no projection,
 * just the actual GPA, and showing both would be showing the same number twice.
 */
export function projectedGpa(
  classes: ClassItem[],
  grades: GradeItem[],
  scale: ScaleBand[] = DEFAULT_SCALE,
): number | null {
  if (!classes.some((c) => typeof c.goal === "number" && c.goal > 0)) {
    return null;
  }
  let totalCredits = 0;
  let totalPoints = 0;
  for (const c of classes) {
    const hasGoal = typeof c.goal === "number" && c.goal > 0;
    const pct = hasGoal
      ? c.goal!
      : classAverage(grades.filter((g) => g.classId === c.id));
    if (pct === null) continue;
    const credits = creditsFor(c);
    totalCredits += credits;
    totalPoints += pointsFor(pct, scale) * credits;
  }
  if (totalCredits === 0) return null;
  return totalPoints / totalCredits;
}

/* ── "what do I need on the final?" ───────────────────────── */

export interface WhatIfResult {
  /** Percentage needed on the remaining weight to hit the target. */
  needed: number;
  /** The weight (in the same units as GradeItem.weight) not yet graded. */
  remainingWeight: number;
  /** True when the target is already locked in regardless of what's left. */
  alreadySecured: boolean;
  /** True when no score on the remaining work can reach the target. */
  outOfReach: boolean;
}

/**
 * What score does the remaining work need to average for the class to finish
 * at `targetPct`?
 *
 * This is the question a student most wants answered right before a final,
 * and the moment they're most likely to open the app. Weights are treated as
 * shares of 100: if the logged grades total 70 units of weight, 30 remain.
 *
 * Returns null when nothing is left to grade — there's no question to answer.
 */
export function whatIfNeeded(
  grades: GradeItem[],
  targetPct: number,
): WhatIfResult | null {
  const valid = grades.filter((g) => g.max > 0 && g.weight > 0);
  const usedWeight = valid.reduce((s, g) => s + g.weight, 0);
  const remainingWeight = 100 - usedWeight;
  if (remainingWeight <= 0) return null;

  // Points already banked, expressed against a 100-weight total.
  const earned = valid.reduce((s, g) => s + (g.score / g.max) * g.weight, 0);
  const needed = ((targetPct - earned) / remainingWeight) * 100;

  return {
    needed,
    remainingWeight,
    alreadySecured: needed <= 0,
    // Above 100 is only *usually* impossible — extra credit exists — so this
    // flags it rather than refusing to show the number.
    outOfReach: needed > 100,
  };
}
