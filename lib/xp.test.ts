import { describe, expect, it } from "vitest";
import {
  DAILY_CREATION_XP,
  MAX_CREDITED,
  MAX_LEVEL,
  XP_AWARDS,
  ackLevel,
  awardCreation,
  awardXp,
  emptyXpState,
  levelFromXp,
  levelProgress,
  levelTitle,
  normalizeXpState,
  pruneXpState,
  xpForLevel,
  type XpState,
} from "./xp";

/** An XpState with just the two numbers that matter to a given test set. */
const state = (xp: number, seenLevel: number): XpState => ({
  ...emptyXpState(),
  xp,
  seenLevel,
});

describe("the level curve", () => {
  it("starts everyone at level 1 with nothing", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(levelFromXp(0)).toBe(1);
    expect(levelProgress(0).level).toBe(1);
  });

  it("matches the documented thresholds", () => {
    expect(xpForLevel(2)).toBe(40);
    expect(xpForLevel(10)).toBe(432);
    expect(xpForLevel(100)).toBe(13_662);
  });

  /**
   * The curve got shallower when it got longer, and it had to: levels drive the
   * pet's tier, so a total that used to buy level L must never buy less than L
   * now. Anything else takes back a pet somebody earned.
   */
  it("never buys fewer levels than the 30-level curve it replaced", () => {
    const old = (l: number) => 25 * (l - 1) * (l + 2);
    for (let l = 1; l <= 30; l++) {
      expect(levelFromXp(old(l)), `old level ${l}`).toBeGreaterThanOrEqual(l);
    }
  });

  /** levelFromXp inverts xpForLevel in closed form — the two must agree. */
  it("inverts the threshold exactly at every boundary", () => {
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const need = xpForLevel(l);
      expect(levelFromXp(need)).toBe(l);
      if (l > 1) expect(levelFromXp(need - 1)).toBe(l - 1);
    }
  });

  it("rises monotonically across the whole range", () => {
    let last = -1;
    for (let xp = 0; xp < 15_000; xp += 37) {
      const l = levelFromXp(xp);
      expect(l).toBeGreaterThanOrEqual(last);
      last = l;
    }
  });

  it("never exceeds the ceiling, however much is thrown at it", () => {
    expect(levelFromXp(9_999_999)).toBe(MAX_LEVEL);
  });

  /**
   * Junk floors to level 1 rather than rising to the ceiling. Corrupt input
   * should never *grant* anything — a document that arrives with xp: Infinity
   * would otherwise jump straight to the top tier.
   */
  it("treats junk input as level 1 rather than NaN or a windfall", () => {
    expect(levelFromXp(NaN)).toBe(1);
    expect(levelFromXp(-500)).toBe(1);
    expect(levelFromXp(Infinity)).toBe(1);
  });
});

describe("levelProgress", () => {
  it("reports position within the current level", () => {
    const p = levelProgress(61); // level 2 starts at 40, level 3 at 82
    expect(p.level).toBe(2);
    expect(p.into).toBe(21);
    expect(p.need).toBe(42);
    expect(p.fraction).toBeCloseTo(0.5, 6);
    expect(p.atMax).toBe(false);
  });

  it("is a full bar at the ceiling, not a divide by zero", () => {
    const p = levelProgress(xpForLevel(MAX_LEVEL) + 5000);
    expect(p.atMax).toBe(true);
    expect(p.need).toBe(0);
    expect(p.fraction).toBe(1);
    expect(Number.isNaN(p.fraction)).toBe(false);
  });

  it("names the band", () => {
    expect(levelTitle(1)).toBe("Starter");
    expect(levelTitle(9)).toBe("Regular");
    expect(levelTitle(40)).toBe("Scholar");
    expect(levelTitle(MAX_LEVEL)).toBe("Legend");
  });
});

describe("awardXp", () => {
  it("adds and reports the gain", () => {
    const r = awardXp(emptyXpState(), XP_AWARDS.taskOnTime);
    expect(r.state.xp).toBe(XP_AWARDS.taskOnTime);
    expect(r.gained).toBe(XP_AWARDS.taskOnTime);
    expect(r.leveledUp).toBeNull();
  });

  it("announces the level exactly once, on the award that crosses it", () => {
    const r1 = awardXp(state(30, 1), 10); // lands exactly on 40, level 2
    expect(r1.leveledUp).toBe(2);
    const r2 = awardXp(r1.state, 10);
    expect(r2.leveledUp).toBeNull();
  });

  /**
   * The counter is monotonic by design: a tier can never be taken back, so a
   * negative award is dropped rather than applied.
   */
  it("refuses to subtract", () => {
    const s = state(500, 3);
    expect(awardXp(s, -100).state).toBe(s);
    expect(awardXp(s, 0).state).toBe(s);
    expect(awardXp(s, NaN).state).toBe(s);
    expect(awardXp(s, Infinity).state).toBe(s);
  });

  it("floors fractional awards", () => {
    expect(awardXp(emptyXpState(), 25.9).state.xp).toBe(25);
  });

  it("saturates at the ceiling and reports the truncated gain", () => {
    const near = state(xpForLevel(MAX_LEVEL) - 10, MAX_LEVEL);
    const r = awardXp(near, 1000);
    expect(r.state.xp).toBe(xpForLevel(MAX_LEVEL));
    expect(r.gained).toBe(10);
  });

  /** A whole term of work must not overflow into anything strange. */
  it("survives a semester of awards", () => {
    let s = emptyXpState();
    for (let i = 0; i < 500; i++) s = awardXp(s, XP_AWARDS.taskOnTime).state;
    expect(s.xp).toBe(
      Math.min(500 * XP_AWARDS.taskOnTime, xpForLevel(MAX_LEVEL)),
    );
    expect(levelFromXp(s.xp)).toBeLessThanOrEqual(MAX_LEVEL);
  });
});

/**
 * The awards are a claim about what this app values, and the claim is made in
 * their ratios rather than in any one number. These are the ratios.
 */
describe("what the awards say", () => {
  /** A 25-minute Pomodoro, the timer's default block. */
  const BLOCK = 25 * XP_AWARDS.focusMinute;

  it("pays the work better than the paperwork", () => {
    expect(BLOCK).toBeGreaterThan(XP_AWARDS.taskOnTime);
    expect(XP_AWARDS.taskOnTime + XP_AWARDS.focusedFinish).toBeGreaterThan(
      BLOCK,
    );
  });

  /** Nothing punishes: the tick still pays properly on its own, and late work
   *  still pays something. A student who did the work without the timer has
   *  not been fined for it. */
  it("still pays a plain tick, and still pays late work", () => {
    expect(XP_AWARDS.taskOnTime).toBeGreaterThanOrEqual(BLOCK * 0.6);
    expect(XP_AWARDS.taskLate).toBeGreaterThan(0);
    expect(XP_AWARDS.taskOnTime).toBeGreaterThan(XP_AWARDS.taskLate);
  });

  /**
   * Writing a deadline down is not the same as meeting it, and the awards have
   * to keep saying so. Creation is deliberately a fraction of completion — the
   * moment admin outpays the work, the app is paying people to type.
   */
  it("pays the work far better than setting the work up", () => {
    for (const admin of [
      XP_AWARDS.classAdded,
      XP_AWARDS.taskAdded,
      XP_AWARDS.noteWritten,
    ]) {
      expect(admin).toBeLessThan(XP_AWARDS.taskOnTime);
      expect(admin * 3).toBeLessThanOrEqual(XP_AWARDS.taskOnTime + BLOCK);
    }
  });

  /**
   * The pacing claim in xp.ts's header, held to the arithmetic: every one of
   * the twenty-seven pets has to be reachable inside an academic year, so a
   * student who actually uses the app has to finish the year at MAX_LEVEL.
   *
   * The model is one week of a real term — three assignments logged, finished
   * on time and one of them from the timer, four focus blocks, three lectures
   * typed up — plus the trophy income that streak of on-time finishes throws
   * off, which is a third of the total and would flatter the curve badly if it
   * were left out.
   */
  const WEEKLY =
    3 * XP_AWARDS.taskOnTime +
    4 * BLOCK +
    XP_AWARDS.focusedFinish +
    3 * XP_AWARDS.taskAdded +
    3 * XP_AWARDS.noteWritten +
    // A seven-finish loop pays all three medals and takes 7/3 weeks at this rate.
    (XP_AWARDS.trophy.bronze +
      XP_AWARDS.trophy.gold +
      XP_AWARDS.trophy.platinum) /
      (7 / 3);

  it("tops the ladder out inside an academic year, and not before", () => {
    const YEAR = 36;
    expect(levelFromXp(WEEKLY * YEAR)).toBe(MAX_LEVEL);
    // Not so fast that the last families arrive before the spring — a ladder
    // finished at Christmas has nine idle months at the top of it.
    expect(levelFromXp(WEEKLY * 20)).toBeLessThan(MAX_LEVEL);
  });

  /** And the student who never opens the timer still gets there, just later —
   *  a slower climb, not a locked door. */
  it("keeps the checkbox-only student on the same ladder", () => {
    const weekly = WEEKLY - 4 * BLOCK - XP_AWARDS.focusedFinish;
    expect(levelFromXp(weekly * 36)).toBeGreaterThan(MAX_LEVEL * 0.6);
  });
});

describe("creation awards", () => {
  const day = new Date(2026, 0, 15);

  it("pays an item once and never again", () => {
    const first = awardCreation(emptyXpState(), "class", "c1", day);
    expect(first.gained).toBe(XP_AWARDS.classAdded);

    const second = awardCreation(first.state, "class", "c1", day);
    expect(second.gained).toBe(0);
    // Same reference, so a caller can fire this on every render without churn.
    expect(second.state).toBe(first.state);
  });

  it("keeps the three id spaces apart", () => {
    let s = emptyXpState();
    // Same id, three kinds: three awards, because they are three things.
    for (const kind of ["class", "task", "note"] as const) {
      s = awardCreation(s, kind, "shared-id", day).state;
    }
    expect(s.xp).toBe(
      XP_AWARDS.classAdded + XP_AWARDS.taskAdded + XP_AWARDS.noteWritten,
    );
    expect(s.credited).toHaveLength(3);
  });

  it("stops paying once the day's ceiling is reached", () => {
    let s = emptyXpState();
    for (let i = 0; i < 200; i++) {
      s = awardCreation(s, "task", `t${i}`, day).state;
    }
    expect(s.creditSpent).toBeLessThanOrEqual(DAILY_CREATION_XP);
    expect(s.xp).toBeLessThanOrEqual(DAILY_CREATION_XP);
  });

  /**
   * A partial award would still mark the item credited and rob it of the rest
   * forever, so an item that doesn't fit under the ceiling waits for tomorrow
   * rather than being paid a fraction of what it is worth.
   */
  it("never pays an item a fraction of its award", () => {
    let s = { ...emptyXpState(), creditDay: "2026-01-15" };
    s = { ...s, creditSpent: DAILY_CREATION_XP - 1 };
    const r = awardCreation(s, "class", "c1", day);
    expect(r.gained).toBe(0);
    expect(r.state.credited).not.toContain("c:c1");
  });

  it("starts paying again when the day turns over", () => {
    let s = emptyXpState();
    for (let i = 0; i < 200; i++) {
      s = awardCreation(s, "task", `t${i}`, day).state;
    }
    const spent = s.xp;
    const tomorrow = new Date(2026, 0, 16);
    const r = awardCreation(s, "class", "c1", tomorrow);
    expect(r.gained).toBe(XP_AWARDS.classAdded);
    expect(r.state.xp).toBe(spent + XP_AWARDS.classAdded);
    expect(r.state.creditSpent).toBe(XP_AWARDS.classAdded);
  });

  it("ignores an empty id rather than crediting one shared key", () => {
    const r = awardCreation(emptyXpState(), "task", "", day);
    expect(r.gained).toBe(0);
    expect(r.state.credited).toEqual([]);
  });

  it("caps the credited list so the document can't grow without bound", () => {
    let s = emptyXpState();
    // Past the cap, on a fresh day each time so the ceiling never bites.
    for (let i = 0; i < MAX_CREDITED + 50; i++) {
      s = awardCreation(s, "task", `t${i}`, new Date(2026, 0, 1 + i)).state;
    }
    expect(s.credited.length).toBeLessThanOrEqual(MAX_CREDITED);
    // The cap drops the oldest, so the most recent are the ones still held.
    expect(s.credited).toContain(`t:t${MAX_CREDITED + 49}`);
  });

  it("prunes credits for items that no longer exist", () => {
    let s = emptyXpState();
    s = awardCreation(s, "class", "keep", day).state;
    s = awardCreation(s, "task", "gone", day).state;

    const pruned = pruneXpState(s, new Set(["c:keep"]));
    expect(pruned.credited).toEqual(["c:keep"]);
    // Nothing to drop is the same reference — this runs on every store sweep.
    expect(pruneXpState(pruned, new Set(["c:keep"]))).toBe(pruned);
  });

  it("leaves XP alone when a credit is pruned", () => {
    const s = awardCreation(emptyXpState(), "class", "c1", day).state;
    expect(pruneXpState(s, new Set()).xp).toBe(XP_AWARDS.classAdded);
  });
});

describe("ackLevel", () => {
  it("catches seenLevel up to the real level", () => {
    expect(ackLevel(state(xpForLevel(4), 1)).seenLevel).toBe(4);
  });

  it("is a no-op — same reference — when already caught up", () => {
    const s = state(xpForLevel(4), 4);
    expect(ackLevel(s)).toBe(s);
  });

  it("never walks seenLevel backwards", () => {
    expect(ackLevel(state(0, 5)).seenLevel).toBe(5);
  });
});

describe("normalizeXpState", () => {
  it("falls back to empty for anything unrecognisable", () => {
    for (const junk of [null, undefined, 7, "x", [], {}]) {
      expect(normalizeXpState(junk)).toEqual(emptyXpState());
    }
  });

  it("keeps a sane stored value", () => {
    expect(normalizeXpState({ xp: 320, seenLevel: 3 })).toEqual(state(320, 3));
  });

  /** It crosses the sync endpoint, so a hostile document must not stick. */
  it("clamps hostile or corrupt values", () => {
    expect(normalizeXpState({ xp: -5, seenLevel: 0 })).toEqual(state(0, 1));
    expect(normalizeXpState({ xp: 1e12, seenLevel: 999 })).toEqual(
      state(xpForLevel(MAX_LEVEL), MAX_LEVEL),
    );
    expect(normalizeXpState({ xp: NaN, seenLevel: NaN })).toEqual(emptyXpState());
    expect(normalizeXpState({ xp: "500", seenLevel: "3" })).toEqual(
      emptyXpState(),
    );
  });

  /**
   * A document written before creation awards existed has none of these
   * fields. It must read back as an account that has never been credited —
   * not as one owed a term of back-pay, and not as one that throws.
   */
  it("reads a pre-creation-award document as simply uncredited", () => {
    const s = normalizeXpState({ xp: 320, seenLevel: 3 });
    expect(s.credited).toEqual([]);
    expect(s.creditDay).toBe("");
    expect(s.creditSpent).toBe(0);
  });

  it("clamps a hostile credit ledger", () => {
    const s = normalizeXpState({
      xp: 10,
      seenLevel: 1,
      credited: ["c:a", 7, null, "", "t:b"],
      creditDay: 5,
      creditSpent: 1e9,
    });
    expect(s.credited).toEqual(["c:a", "t:b"]);
    expect(s.creditDay).toBe("");
    expect(s.creditSpent).toBe(DAILY_CREATION_XP);
  });

  it("refuses to carry more credits than the cap", () => {
    const credited = Array.from({ length: MAX_CREDITED + 500 }, (_, i) => `t:${i}`);
    expect(normalizeXpState({ xp: 0, seenLevel: 1, credited }).credited).toHaveLength(
      MAX_CREDITED,
    );
  });
});
