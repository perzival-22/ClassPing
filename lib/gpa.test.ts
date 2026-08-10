import { describe, expect, it } from "vitest";
import {
  SIMPLE_SCALE,
  classAverage,
  creditsFor,
  extraCreditHint,
  letterFor,
  overallGpa,
  pointsFor,
  projectedGpa,
  remainingWeight,
  usedWeight,
  whatIfNeeded,
} from "./gpa";
import type { ClassItem, GradeItem } from "./store";

const grade = (over: Partial<GradeItem> = {}): GradeItem => ({
  id: "g1",
  classId: "c1",
  title: "Quiz",
  score: 90,
  max: 100,
  weight: 100,
  date: "2026-08-01",
  ...over,
});

const klass = (over: Partial<ClassItem> = {}): ClassItem => ({
  id: "c1",
  name: "Chemistry",
  short: "Chem",
  color: "indigo",
  days: [0, 2],
  start: 600,
  end: 680,
  remindBefore: 15,
  alarm: true,
  ...over,
});

describe("classAverage", () => {
  it("returns null with nothing usable", () => {
    expect(classAverage([])).toBeNull();
    expect(classAverage([grade({ max: 0 })])).toBeNull();
    expect(classAverage([grade({ weight: 0 })])).toBeNull();
  });

  it("weights each grade by its declared weight", () => {
    // 100% at weight 30, 50% at weight 70 -> 65%.
    const avg = classAverage([
      grade({ id: "a", score: 10, max: 10, weight: 30 }),
      grade({ id: "b", score: 5, max: 10, weight: 70 }),
    ]);
    expect(avg).toBeCloseTo(65, 10);
  });

  it("normalises when weights do not total 100", () => {
    // Same 50/50 split expressed as 5 and 5 rather than 50 and 50.
    const avg = classAverage([
      grade({ id: "a", score: 100, max: 100, weight: 5 }),
      grade({ id: "b", score: 80, max: 100, weight: 5 }),
    ]);
    expect(avg).toBeCloseTo(90, 10);
  });

  it("ignores unusable entries but keeps the rest", () => {
    const avg = classAverage([
      grade({ id: "a", score: 100, max: 100, weight: 50 }),
      grade({ id: "b", score: 1, max: 0, weight: 50 }), // max 0 -> dropped
    ]);
    expect(avg).toBeCloseTo(100, 10);
  });

  it("handles extra credit above the maximum", () => {
    expect(classAverage([grade({ score: 110, max: 100 })])).toBeCloseTo(110, 10);
  });
});

describe("letterFor / pointsFor", () => {
  it("maps the boundaries of each band exactly", () => {
    expect(letterFor(100)).toBe("A");
    expect(letterFor(93)).toBe("A");
    expect(letterFor(92.9)).toBe("A-");
    expect(letterFor(90)).toBe("A-");
    expect(letterFor(89.9)).toBe("B+");
    expect(letterFor(60)).toBe("D-");
    expect(letterFor(59.9)).toBe("F");
    expect(letterFor(0)).toBe("F");
  });

  it("gives F zero points and A four", () => {
    expect(pointsFor(95)).toBe(4.0);
    expect(pointsFor(90)).toBe(3.7);
    expect(pointsFor(59)).toBe(0);
  });
});

describe("overallGpa", () => {
  it("is null until something is graded", () => {
    expect(overallGpa([klass()], [])).toBeNull();
    expect(overallGpa([], [grade()])).toBeNull();
  });

  it("averages the points of graded classes only", () => {
    const classes = [klass({ id: "c1" }), klass({ id: "c2" }), klass({ id: "c3" })];
    const grades = [
      grade({ id: "g1", classId: "c1", score: 95, max: 100 }), // A  -> 4.0
      grade({ id: "g2", classId: "c2", score: 85, max: 100 }), // B  -> 3.0
      // c3 has no grades and must not drag the average toward zero.
    ];
    expect(overallGpa(classes, grades)).toBeCloseTo(3.5, 10);
  });

  it("ignores grades belonging to classes not in the list", () => {
    // This is what scopes the headline GPA to the current term: archived
    // classes are excluded from `classes`, so their grades must not count.
    const grades = [
      grade({ id: "g1", classId: "c1", score: 95, max: 100 }),
      grade({ id: "g2", classId: "archived", score: 10, max: 100 }),
    ];
    expect(overallGpa([klass({ id: "c1" })], grades)).toBeCloseTo(4.0, 10);
  });

  it("weights classes by credit hours", () => {
    // A (4.0) in a 4-credit class, B (3.0) in a 1-credit class.
    // Unweighted that's 3.5; credit-weighted it's (16 + 3) / 5 = 3.8.
    const classes = [
      klass({ id: "c1", credits: 4 }),
      klass({ id: "c2", credits: 1 }),
    ];
    const grades = [
      grade({ id: "g1", classId: "c1", score: 95, max: 100 }),
      grade({ id: "g2", classId: "c2", score: 85, max: 100 }),
    ];
    expect(overallGpa(classes, grades)).toBeCloseTo(3.8, 10);
  });

  it("treats a class with no credits as one credit", () => {
    // Guarantees the pre-credits behaviour is unchanged for existing users.
    const classes = [klass({ id: "c1" }), klass({ id: "c2" })];
    const grades = [
      grade({ id: "g1", classId: "c1", score: 95, max: 100 }),
      grade({ id: "g2", classId: "c2", score: 85, max: 100 }),
    ];
    expect(overallGpa(classes, grades)).toBeCloseTo(3.5, 10);
    expect(creditsFor(klass())).toBe(1);
    expect(creditsFor(klass({ credits: 0 }))).toBe(1);
    expect(creditsFor(klass({ credits: -3 }))).toBe(1);
  });

  it("honours an alternative letter scale", () => {
    // 90% is an A- (3.7) on the default scale but a flat A (4.0) here.
    expect(letterFor(90, SIMPLE_SCALE)).toBe("A");
    expect(pointsFor(90, SIMPLE_SCALE)).toBe(4.0);
    const gpa = overallGpa(
      [klass({ id: "c1" })],
      [grade({ classId: "c1", score: 90, max: 100 })],
      SIMPLE_SCALE,
    );
    expect(gpa).toBeCloseTo(4.0, 10);
  });
});

describe("usedWeight / remainingWeight", () => {
  it("is zero for a class with nothing logged", () => {
    expect(usedWeight([])).toBe(0);
    expect(remainingWeight([])).toBe(100);
  });

  it("adds up the weights already spent", () => {
    const gs = [
      grade({ id: "a", weight: 20 }),
      grade({ id: "b", weight: 30 }),
    ];
    expect(usedWeight(gs)).toBe(50);
    expect(remainingWeight(gs)).toBe(50);
  });

  it("ignores entries a percentage can't be taken from", () => {
    // Same filter classAverage and whatIfNeeded apply, so the budget shown in
    // the form agrees with the maths on the Grades screen.
    const gs = [
      grade({ id: "a", weight: 40 }),
      grade({ id: "b", weight: 30, max: 0 }),
      grade({ id: "c", weight: 0 }),
    ];
    expect(usedWeight(gs)).toBe(40);
    expect(remainingWeight(gs)).toBe(60);
  });

  it("reports over-allocation but never negative remaining", () => {
    // Six assignments at the form's default 20% — the case that used to make
    // the what-if answer vanish with no explanation.
    const six = Array.from({ length: 6 }, (_, i) =>
      grade({ id: `g${i}`, weight: 20 }),
    );
    expect(usedWeight(six)).toBe(120);
    expect(remainingWeight(six)).toBe(0);
    expect(whatIfNeeded(six, 90)).toBeNull();
  });

  it("agrees with whatIfNeeded about where the boundary is", () => {
    const five = Array.from({ length: 5 }, (_, i) =>
      grade({ id: `g${i}`, weight: 20 }),
    );
    expect(remainingWeight(five)).toBe(0);
    expect(whatIfNeeded(five, 90)).toBeNull();

    const four = five.slice(0, 4);
    expect(remainingWeight(four)).toBe(20);
    expect(whatIfNeeded(four, 90)!.remainingWeight).toBe(20);
  });
});

describe("extraCreditHint", () => {
  it("says nothing for a score within range", () => {
    expect(extraCreditHint(90, 100)).toBeNull();
    expect(extraCreditHint(100, 100)).toBeNull();
    expect(extraCreditHint(0, 100)).toBeNull();
  });

  it("labels a score above the maximum", () => {
    // classAverage supports this (see "handles extra credit above the
    // maximum"), so the forms label it instead of refusing to save it.
    expect(extraCreditHint(110, 100)).toContain("extra credit");
    expect(extraCreditHint(110, 100)).toContain("110%");
  });

  it("stays quiet on a half-typed form", () => {
    expect(extraCreditHint(NaN, 100)).toBeNull();
    expect(extraCreditHint(50, NaN)).toBeNull();
    expect(extraCreditHint(50, 0)).toBeNull();
  });
});

describe("projectedGpa", () => {
  it("is null until any class has a goal", () => {
    expect(projectedGpa([klass()], [grade()])).toBeNull();
    expect(projectedGpa([], [])).toBeNull();
  });

  it("uses the goal for classes that have one", () => {
    // Currently a C (75%) but aiming for an A — the projection believes the goal.
    const classes = [klass({ id: "c1", goal: 95 })];
    const grades = [grade({ classId: "c1", score: 75, max: 100 })];
    expect(projectedGpa(classes, grades)).toBeCloseTo(4.0, 10);
  });

  it("falls back to the current average for classes without a goal", () => {
    // c1 aims for an A (4.0); c2 has no goal and sits at a B (3.0).
    const classes = [klass({ id: "c1", goal: 95 }), klass({ id: "c2" })];
    const grades = [
      grade({ id: "g1", classId: "c1", score: 60, max: 100 }),
      grade({ id: "g2", classId: "c2", score: 85, max: 100 }),
    ];
    expect(projectedGpa(classes, grades)).toBeCloseTo(3.5, 10);
  });

  it("counts a goal even when the class has no grades yet", () => {
    expect(projectedGpa([klass({ goal: 85 })], [])).toBeCloseTo(3.0, 10);
  });

  it("weights the projection by credit hours", () => {
    // A-goal (4.0) in 4 credits, B-goal (3.0) in 1 -> (16 + 3) / 5 = 3.8.
    const classes = [
      klass({ id: "c1", goal: 95, credits: 4 }),
      klass({ id: "c2", goal: 85, credits: 1 }),
    ];
    expect(projectedGpa(classes, [])).toBeCloseTo(3.8, 10);
  });

  it("ignores zero and negative goals", () => {
    expect(projectedGpa([klass({ goal: 0 })], [grade()])).toBeNull();
    expect(projectedGpa([klass({ goal: -5 })], [grade()])).toBeNull();
  });

  it("honours an alternative letter scale", () => {
    // 90% projects to an A- (3.7) on the standard scale, a flat A (4.0) here.
    expect(projectedGpa([klass({ goal: 90 })], [], SIMPLE_SCALE)).toBeCloseTo(
      4.0,
      10,
    );
  });
});

describe("whatIfNeeded", () => {
  it("returns null when nothing is left to grade", () => {
    expect(whatIfNeeded([grade({ weight: 100 })], 90)).toBeNull();
  });

  it("works out the score the remaining weight must average", () => {
    // 80% banked on 50 weight = 40 points. To finish at 90 the other half
    // must supply 50 points out of 50 weight — i.e. 100%.
    const res = whatIfNeeded([grade({ score: 80, max: 100, weight: 50 })], 90)!;
    expect(res.remainingWeight).toBe(50);
    expect(res.needed).toBeCloseTo(100, 10);
    expect(res.outOfReach).toBe(false);
    expect(res.alreadySecured).toBe(false);
  });

  it("flags a target that is already locked in", () => {
    // 100% on 80 weight already exceeds a target of 70.
    const res = whatIfNeeded([grade({ score: 100, max: 100, weight: 80 })], 70)!;
    expect(res.alreadySecured).toBe(true);
    expect(res.needed).toBeLessThanOrEqual(0);
  });

  it("flags a target that cannot be reached", () => {
    // 20% banked on 90 weight; 10 weight left can't rescue a 90 target.
    const res = whatIfNeeded([grade({ score: 20, max: 100, weight: 90 })], 90)!;
    expect(res.outOfReach).toBe(true);
    expect(res.needed).toBeGreaterThan(100);
  });

  it("ignores unusable grades when measuring used weight", () => {
    const res = whatIfNeeded(
      [
        grade({ id: "a", score: 90, max: 100, weight: 40 }),
        grade({ id: "b", score: 1, max: 0, weight: 30 }), // dropped
      ],
      90,
    )!;
    expect(res.remainingWeight).toBe(60);
  });
});
