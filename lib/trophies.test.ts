import { describe, expect, it } from "vitest";
import {
  completeTask,
  emptyTrophyState,
  missTask,
  nextMilestone,
  normalizeTrophyState,
  pruneTrophyState,
  trophyCounts,
  trophyTimeline,
  uncompleteTask,
  type TrophyState,
} from "./trophies";

const NOW = new Date("2026-08-10T12:00:00Z");

/** Finish `n` assignments on time, starting from `state`. */
function run(n: number, state: TrophyState = emptyTrophyState(), from = 0) {
  let s = state;
  for (let i = 0; i < n; i++) {
    s = completeTask(s, `t${from + i}`, true, NOW).state;
  }
  return s;
}

describe("streak counting", () => {
  it("starts at zero with nothing earned", () => {
    const s = emptyTrophyState();
    expect(s.streak).toBe(0);
    expect(s.trophies).toEqual([]);
  });

  it("advances one per on-time completion", () => {
    expect(run(1).streak).toBe(1);
    expect(run(2).streak).toBe(2);
    expect(run(4).streak).toBe(4);
  });

  it("ignores a task that has already been counted", () => {
    const once = completeTask(emptyTrophyState(), "t1", true, NOW).state;
    const twice = completeTask(once, "t1", true, NOW).state;
    expect(twice.streak).toBe(1);
    expect(twice).toBe(once);
  });

  it("resets when a completion is late", () => {
    const s = completeTask(run(2), "late", false, NOW).state;
    expect(s.streak).toBe(0);
  });

  it("resets when an assignment is missed outright", () => {
    expect(missTask(run(4), "gone").streak).toBe(0);
  });

  it("counts a given miss only once", () => {
    const missedOnce = missTask(run(2), "gone");
    const after = run(1, missedOnce, 90);
    expect(after.streak).toBe(1);
    expect(missTask(after, "gone").streak).toBe(1);
  });
});

describe("trophy milestones", () => {
  it("earns Bronze at 3", () => {
    const { state, earned } = completeTask(run(2), "third", true, NOW);
    expect(earned.map((t) => t.tier)).toEqual(["bronze"]);
    expect(trophyCounts(state.trophies)).toEqual({
      bronze: 1,
      gold: 0,
      platinum: 0,
    });
  });

  it("earns Gold at 5 without re-earning Bronze", () => {
    const { state, earned } = completeTask(run(4), "fifth", true, NOW);
    expect(earned.map((t) => t.tier)).toEqual(["gold"]);
    expect(trophyCounts(state.trophies)).toEqual({
      bronze: 1,
      gold: 1,
      platinum: 0,
    });
  });

  it("earns Platinum at 7 and resets the streak to start the loop again", () => {
    const { state, earned } = completeTask(run(6), "seventh", true, NOW);
    expect(earned.map((t) => t.tier)).toEqual(["platinum"]);
    expect(state.streak).toBe(0);
    expect(state.awarded).toEqual([]);
    expect(trophyCounts(state.trophies)).toEqual({
      bronze: 1,
      gold: 1,
      platinum: 1,
    });
  });

  it("earns a second set on the next loop of seven", () => {
    const s = run(14);
    expect(trophyCounts(s.trophies)).toEqual({
      bronze: 2,
      gold: 2,
      platinum: 2,
    });
    expect(s.streak).toBe(0);
  });

  it("gives no trophy for a broken run", () => {
    const s = run(2, missTask(run(2), "gone"), 50);
    expect(s.trophies).toEqual([]);
    expect(s.streak).toBe(2);
  });

  it("stamps each trophy with when it was earned", () => {
    const s = run(3);
    expect(s.trophies[0].at).toBe(NOW.toISOString());
  });

  it("names the next trophy to aim for", () => {
    expect(nextMilestone(0)?.tier).toBe("bronze");
    expect(nextMilestone(3)?.tier).toBe("gold");
    expect(nextMilestone(6)?.tier).toBe("platinum");
    expect(nextMilestone(7)).toBeNull();
  });
});

describe("un-ticking a task", () => {
  it("steps the streak back", () => {
    expect(uncompleteTask(run(2), "t1").streak).toBe(1);
  });

  it("keeps trophies already earned", () => {
    const s = uncompleteTask(run(3), "t2");
    expect(trophyCounts(s.trophies).bronze).toBe(1);
    expect(s.streak).toBe(2);
  });

  it("cannot mint a second copy by re-ticking the same task", () => {
    const s = uncompleteTask(run(3), "t2");
    const again = completeTask(s, "t2", true, NOW);
    expect(again.earned).toEqual([]);
    expect(trophyCounts(again.state.trophies).bronze).toBe(1);
  });

  it("does not subtract for a late completion that never counted", () => {
    const late = completeTask(run(3), "late", false, NOW).state;
    expect(uncompleteTask(late, "late").streak).toBe(0);
  });

  it("ignores a task that was never completed", () => {
    const s = run(2);
    expect(uncompleteTask(s, "nope")).toBe(s);
  });
});

describe("housekeeping", () => {
  it("forgets bookkeeping for deleted tasks", () => {
    const s = missTask(run(2), "gone");
    const pruned = pruneTrophyState(s, new Set(["t0"]));
    expect(pruned.counted).toEqual(["t0"]);
    expect(pruned.missed).toEqual([]);
    expect(pruned.trophies).toEqual(s.trophies);
  });

  it("returns the same object when there is nothing to prune", () => {
    const s = run(2);
    expect(pruneTrophyState(s, new Set(["t0", "t1"]))).toBe(s);
  });

  it("reads a corrupt persisted value back as an empty state", () => {
    expect(normalizeTrophyState(null)).toEqual(emptyTrophyState());
    expect(normalizeTrophyState("nonsense")).toEqual(emptyTrophyState());
    expect(
      normalizeTrophyState({ streak: -4, trophies: [{ tier: "wood" }] }),
    ).toEqual(emptyTrophyState());
  });

  it("keeps valid persisted trophies", () => {
    const s = normalizeTrophyState({
      streak: 2,
      trophies: [{ tier: "gold", at: NOW.toISOString() }],
      awarded: ["bronze"],
      counted: ["t0", 7],
      missed: [],
    });
    expect(s.streak).toBe(2);
    expect(s.trophies).toHaveLength(1);
    expect(s.counted).toEqual(["t0"]);
  });
});

describe("semester timeline", () => {
  it("plots trophies oldest first with a running total", () => {
    const pts = trophyTimeline([
      { tier: "gold", at: "2026-03-01T10:00:00Z" },
      { tier: "bronze", at: "2026-02-01T10:00:00Z" },
    ]);
    expect(pts.map((p) => p.tier)).toEqual(["bronze", "gold"]);
    expect(pts.map((p) => p.total)).toEqual([1, 2]);
  });

  it("drops trophies with an unreadable timestamp", () => {
    expect(trophyTimeline([{ tier: "bronze", at: "whenever" }])).toEqual([]);
  });
});
