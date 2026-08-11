import { describe, expect, it } from "vitest";
import {
  MAX_COMMITMENT,
  MIN_COMMITMENT,
  abandonFight,
  ackResult,
  canStart,
  daysLeft,
  emptyBossState,
  fightProgress,
  normalizeBossState,
  settle,
  startFight,
  weekDeadline,
  weekKey,
  type BossState,
} from "./boss";
import type { TaskItem } from "./store";

/** Wednesday 12 Aug 2026, local. */
const WED = new Date(2026, 7, 12, 12, 0, 0);
const MONDAY = "2026-08-10";

const task = (id: string, done = false): TaskItem => ({
  id,
  title: id,
  classId: "c1",
  due: "2026-08-14",
  reminder: false,
  done,
});

const running = (ids: string[] = ["a", "b", "c"]): BossState =>
  startFight(emptyBossState(), ids, WED);

describe("weeks", () => {
  it("keys a week by its Monday", () => {
    expect(weekKey(WED)).toBe(MONDAY);
    expect(weekKey(new Date(2026, 7, 10, 0, 1))).toBe(MONDAY); // Monday itself
    expect(weekKey(new Date(2026, 7, 16, 23, 59))).toBe(MONDAY); // Sunday night
    expect(weekKey(new Date(2026, 7, 17, 0, 1))).toBe("2026-08-17"); // next Mon
  });

  it("expires at midnight after the Sunday", () => {
    expect(weekDeadline(MONDAY)).toBe(new Date(2026, 7, 17, 0, 0, 0, 0).getTime());
  });

  /**
   * Stepping a Date rather than adding 7×86400×1000 — otherwise a week
   * containing a DST change is an hour short and the fight expires early.
   */
  it("is a full seven days across a daylight-saving change", () => {
    const beforeDst = "2026-10-26"; // the Monday of the EU/US change window
    const start = new Date(2026, 9, 26).getTime();
    const days = (weekDeadline(beforeDst) - start) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(6.9);
    expect(days).toBeLessThanOrEqual(7.1);
  });

  it("counts whole days left and floors at zero", () => {
    expect(daysLeft(MONDAY, WED)).toBe(5);
    expect(daysLeft(MONDAY, new Date(2026, 7, 20))).toBe(0);
  });
});

describe("startFight", () => {
  it("commits to the chosen tasks in the current week", () => {
    const s = running(["a", "b"]);
    expect(s.current?.week).toBe(MONDAY);
    expect(s.current?.taskIds).toEqual(["a", "b"]);
  });

  it("refuses a commitment below the floor", () => {
    const s = emptyBossState();
    expect(startFight(s, ["a"], WED)).toBe(s);
    expect(startFight(s, [], WED)).toBe(s);
  });

  it("caps an over-long commitment rather than rejecting it", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `t${i}`);
    expect(startFight(emptyBossState(), ids, WED).current?.taskIds).toHaveLength(
      MAX_COMMITMENT,
    );
  });

  it("de-duplicates ids", () => {
    expect(
      startFight(emptyBossState(), ["a", "a", "b"], WED).current?.taskIds,
    ).toEqual(["a", "b"]);
  });

  it("will not start a second fight over a running one", () => {
    const s = running();
    expect(startFight(s, ["x", "y"], WED)).toBe(s);
  });
});

describe("fightProgress", () => {
  const fight = running().current!;

  it("is untouched with nothing done", () => {
    const p = fightProgress(fight, [task("a"), task("b"), task("c")]);
    expect(p).toMatchObject({ total: 3, defeated: 0, cleared: false, voided: false });
    expect(p.fraction).toBe(0);
  });

  it("deals damage as work is finished", () => {
    const p = fightProgress(fight, [task("a", true), task("b"), task("c")]);
    expect(p.defeated).toBe(1);
    expect(p.fraction).toBeCloseTo(1 / 3, 6);
  });

  it("clears when every committed task is done", () => {
    const p = fightProgress(fight, [
      task("a", true),
      task("b", true),
      task("c", true),
    ]);
    expect(p.cleared).toBe(true);
  });

  /** A deleted task shrinks the fight; it can't leave it permanently unwinnable. */
  it("ignores committed tasks that no longer exist", () => {
    const p = fightProgress(fight, [task("a", true), task("b", true)]);
    expect(p.total).toBe(2);
    expect(p.cleared).toBe(true);
  });

  it("reports a fight whose tasks are all gone as void, not cleared", () => {
    const p = fightProgress(fight, []);
    expect(p.voided).toBe(true);
    expect(p.cleared).toBe(false);
  });

  it("is unaffected by tasks outside the commitment", () => {
    const p = fightProgress(fight, [
      task("a"),
      task("b"),
      task("c"),
      task("zzz", true),
    ]);
    expect(p.total).toBe(3);
    expect(p.defeated).toBe(0);
  });
});

describe("settle", () => {
  const all = [task("a"), task("b"), task("c")];

  it("does nothing mid-week with work outstanding — same reference", () => {
    const s = running();
    expect(settle(s, all, WED)).toBe(s);
  });

  it("is a no-op when no fight is running", () => {
    const s = emptyBossState();
    expect(settle(s, all, WED)).toBe(s);
  });

  it("wins the moment the last task is finished, without waiting for Sunday", () => {
    const s = settle(
      running(),
      [task("a", true), task("b", true), task("c", true)],
      WED,
    );
    expect(s.current).toBeNull();
    expect(s.won).toBe(1);
    expect(s.lastResult).toMatchObject({ outcome: "won", defeated: 3, total: 3 });
  });

  it("loses once the deadline passes with work outstanding", () => {
    const s = settle(running(), [task("a", true), task("b"), task("c")], new Date(2026, 7, 20));
    expect(s.lost).toBe(1);
    expect(s.won).toBe(0);
    expect(s.lastResult).toMatchObject({ outcome: "lost", defeated: 1, total: 3 });
  });

  /** Deleting the work is not failing to do it. */
  it("voids rather than loses when every committed task is deleted", () => {
    const s = settle(running(), [], new Date(2026, 7, 20));
    expect(s.current).toBeNull();
    expect(s.lost).toBe(0);
    expect(s.won).toBe(0);
    expect(s.lastResult).toBeNull();
  });

  /** The store polls this; it must converge or it writes on every tick. */
  it("is idempotent once settled", () => {
    const won = settle(running(), [task("a", true), task("b", true), task("c", true)], WED);
    expect(settle(won, all, WED)).toBe(won);
  });

  it("counts wins and losses across several fights", () => {
    let s = settle(running(["a", "b", "c"]), [task("a", true), task("b", true), task("c", true)], WED);
    s = ackResult(s);
    s = startFight(s, ["d", "e"], WED);
    s = settle(s, [task("d"), task("e")], new Date(2026, 7, 20));
    expect(s).toMatchObject({ won: 1, lost: 1 });
  });
});

describe("abandon and acknowledge", () => {
  it("abandoning records no loss", () => {
    const s = abandonFight(running());
    expect(s.current).toBeNull();
    expect(s.lost).toBe(0);
    expect(s.lastResult).toBeNull();
  });

  it("abandoning nothing is a no-op", () => {
    const s = emptyBossState();
    expect(abandonFight(s)).toBe(s);
  });

  it("acknowledging clears the result exactly once", () => {
    const won = settle(running(), [task("a", true), task("b", true), task("c", true)], WED);
    const acked = ackResult(won);
    expect(acked.lastResult).toBeNull();
    expect(acked.won).toBe(1);
    expect(ackResult(acked)).toBe(acked);
  });
});

describe("canStart", () => {
  it("needs no running fight and enough open work", () => {
    expect(canStart(emptyBossState(), 3)).toBe(true);
    expect(canStart(emptyBossState(), MIN_COMMITMENT - 1)).toBe(false);
    expect(canStart(running(), 9)).toBe(false);
  });
});

describe("normalizeBossState", () => {
  it("falls back to empty for anything unrecognisable", () => {
    for (const junk of [null, undefined, 4, "x", []]) {
      expect(normalizeBossState(junk)).toEqual(emptyBossState());
    }
  });

  it("round-trips a real state", () => {
    const s = running();
    expect(normalizeBossState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  /** It crosses the sync endpoint, so a hostile document must not stick. */
  it("drops a fight with a malformed week or too few tasks", () => {
    expect(normalizeBossState({ current: { week: "nope", taskIds: ["a", "b"] } }).current).toBeNull();
    expect(normalizeBossState({ current: { week: MONDAY, taskIds: ["a"] } }).current).toBeNull();
    expect(normalizeBossState({ current: { week: MONDAY, taskIds: "ab" } }).current).toBeNull();
  });

  it("caps a commitment padded past the ceiling", () => {
    const ids = Array.from({ length: 500 }, (_, i) => `t${i}`);
    expect(
      normalizeBossState({ current: { week: MONDAY, taskIds: ids } }).current?.taskIds,
    ).toHaveLength(MAX_COMMITMENT);
  });

  it("clamps hostile counters", () => {
    expect(normalizeBossState({ won: -5, lost: 1e9 })).toMatchObject({
      won: 0,
      lost: 9999,
    });
    expect(normalizeBossState({ won: NaN })).toMatchObject({ won: 0 });
  });

  it("drops a result with an unknown outcome", () => {
    expect(
      normalizeBossState({ lastResult: { week: MONDAY, outcome: "draw" } }).lastResult,
    ).toBeNull();
  });
});
