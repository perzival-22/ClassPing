import { describe, expect, it } from "vitest";
import {
  DEFAULT_POMODORO,
  buildPlan,
  focusCount,
  focusMinutesDone,
  normalizeConfig,
  planMinutes,
  roundAt,
  singlePlan,
} from "./study";

const kinds = (rounds: number) =>
  buildPlan({ ...DEFAULT_POMODORO, rounds }).map((b) => b.kind);

describe("buildPlan", () => {
  it("is a single focus block for one round", () => {
    expect(buildPlan({ ...DEFAULT_POMODORO, rounds: 1 })).toEqual([
      { kind: "focus", minutes: 25 },
    ]);
  });

  it("alternates focus and break", () => {
    expect(kinds(3)).toEqual(["focus", "break", "focus", "break", "focus"]);
  });

  /** The session ends on the work, never on a break nobody is waiting through. */
  it("never ends on a break", () => {
    for (let r = 1; r <= 8; r++) {
      expect(kinds(r).at(-1)).toBe("focus");
    }
  });

  it("gives the long break after the fourth focus block", () => {
    const plan = buildPlan({ ...DEFAULT_POMODORO, rounds: 5 });
    const breaks = plan.filter((b) => b.kind === "break");
    expect(breaks.map((b) => b.minutes)).toEqual([5, 5, 5, 15]);
    expect(breaks.at(-1)?.long).toBe(true);
  });

  /**
   * The long break is *earned by* the fourth block, so it only appears when
   * there is more work after it — otherwise a four-round session would end on
   * a fifteen-minute countdown to nothing.
   */
  it("drops the long break when the fourth round is the last", () => {
    const plan = buildPlan({ ...DEFAULT_POMODORO, rounds: 4 });
    expect(plan.some((b) => b.long)).toBe(false);
    expect(plan).toHaveLength(7);
  });

  it("runs the full ladder at the maximum round count", () => {
    const plan = buildPlan({ ...DEFAULT_POMODORO, rounds: 8 });
    // One long break — after the 4th. The 8th round is last, so it earns none.
    expect(plan.filter((b) => b.long)).toHaveLength(1);
    expect(planMinutes(plan)).toBe(8 * 25 + 6 * 5 + 15);
    // Asking for more than the ceiling gets the ceiling, not a longer session.
    expect(planMinutes(buildPlan({ ...DEFAULT_POMODORO, rounds: 9 }))).toBe(
      planMinutes(plan),
    );
  });
});

describe("normalizeConfig", () => {
  it("fills in the defaults for anything missing", () => {
    expect(normalizeConfig({})).toEqual(DEFAULT_POMODORO);
  });

  it("clamps rounds and block lengths into range", () => {
    expect(normalizeConfig({ rounds: 99 }).rounds).toBe(8);
    expect(normalizeConfig({ rounds: 0 }).rounds).toBe(1);
    expect(normalizeConfig({ focus: 9999 }).focus).toBe(240);
    expect(normalizeConfig({ shortBreak: 0 }).shortBreak).toBe(1);
    expect(normalizeConfig({ longBreak: 600 }).longBreak).toBe(60);
  });

  it("rounds fractional input", () => {
    expect(normalizeConfig({ focus: 25.6 }).focus).toBe(26);
  });
});

describe("focusMinutesDone", () => {
  const plan = buildPlan({ ...DEFAULT_POMODORO, rounds: 3 });

  it("is zero before anything finishes", () => {
    expect(focusMinutesDone(plan, 0)).toBe(0);
  });

  /** Breaks are part of the method but they are not the thing being rewarded. */
  it("counts focus minutes only", () => {
    expect(focusMinutesDone(plan, 2)).toBe(25); // focus + break
    expect(focusMinutesDone(plan, 3)).toBe(50); // + focus
    expect(focusMinutesDone(plan, plan.length)).toBe(75);
  });

  it("saturates rather than overcounting past the end", () => {
    expect(focusMinutesDone(plan, 999)).toBe(75);
    expect(focusMinutesDone(plan, -5)).toBe(0);
  });
});

describe("plan readouts", () => {
  it("reports wall-clock length including breaks", () => {
    expect(planMinutes(buildPlan({ ...DEFAULT_POMODORO, rounds: 4 }))).toBe(
      4 * 25 + 3 * 5,
    );
  });

  it("counts the focus blocks", () => {
    expect(focusCount(buildPlan({ ...DEFAULT_POMODORO, rounds: 4 }))).toBe(4);
  });

  it("numbers rounds, with a break reporting the round it follows", () => {
    const plan = buildPlan({ ...DEFAULT_POMODORO, rounds: 3 });
    expect(plan.map((_, i) => roundAt(plan, i))).toEqual([1, 1, 2, 2, 3]);
  });
});

describe("singlePlan", () => {
  it("is one focus block of the given length", () => {
    expect(singlePlan(45)).toEqual([{ kind: "focus", minutes: 45 }]);
  });

  it("clamps to the same ceiling as a Pomodoro block", () => {
    expect(singlePlan(9999)[0].minutes).toBe(240);
    expect(singlePlan(0)[0].minutes).toBe(1);
  });
});
