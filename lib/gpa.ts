import type { ClassItem, GradeItem } from "./store";

/**
 * Grade math. Per class: weighted average percentage across graded events.
 * Overall GPA: mean of the 4.0-scale points of every class that has at least
 * one grade (unweighted by credits — the app doesn't track credit hours).
 */

/** Weighted class average in percent, or null with no usable grades. */
export function classAverage(grades: GradeItem[]): number | null {
  const valid = grades.filter((g) => g.max > 0 && g.weight > 0);
  if (valid.length === 0) return null;
  const totalWeight = valid.reduce((s, g) => s + g.weight, 0);
  const weighted = valid.reduce((s, g) => s + (g.score / g.max) * g.weight, 0);
  return (weighted / totalWeight) * 100;
}

const SCALE: Array<[min: number, letter: string, points: number]> = [
  [93, "A", 4.0],
  [90, "A-", 3.7],
  [87, "B+", 3.3],
  [83, "B", 3.0],
  [80, "B-", 2.7],
  [77, "C+", 2.3],
  [73, "C", 2.0],
  [70, "C-", 1.7],
  [67, "D+", 1.3],
  [63, "D", 1.0],
  [60, "D-", 0.7],
];

export function letterFor(pct: number): string {
  for (const [min, letter] of SCALE) if (pct >= min) return letter;
  return "F";
}

export function pointsFor(pct: number): number {
  for (const [min, , points] of SCALE) if (pct >= min) return points;
  return 0;
}

/** Overall GPA on the 4.0 scale, or null if no class has grades yet. */
export function overallGpa(
  classes: ClassItem[],
  grades: GradeItem[],
): number | null {
  const points: number[] = [];
  for (const c of classes) {
    const avg = classAverage(grades.filter((g) => g.classId === c.id));
    if (avg !== null) points.push(pointsFor(avg));
  }
  if (points.length === 0) return null;
  return points.reduce((s, p) => s + p, 0) / points.length;
}
