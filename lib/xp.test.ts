import { describe, expect, it } from "vitest";
import {
  MAX_LEVEL,
  XP_AWARDS,
  ackLevel,
  awardXp,
  emptyXpState,
  levelFromXp,
  levelProgress,
  levelTitle,
  normalizeXpState,
  xpForLevel,
} from "./xp";

describe("the level curve", () => {
  it("starts everyone at level 1 with nothing", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(levelFromXp(0)).toBe(1);
    expect(levelProgress(0).level).toBe(1);
  });

  it("matches the documented thresholds", () => {
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(4)).toBe(450);
    expect(xpForLevel(10)).toBe(2700);
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
    for (let xp = 0; xp < 25_000; xp += 37) {
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
    const p = levelProgress(150); // level 2 starts at 100, level 3 at 250
    expect(p.level).toBe(2);
    expect(p.into).toBe(50);
    expect(p.need).toBe(150);
    expect(p.fraction).toBeCloseTo(1 / 3, 6);
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
    expect(levelTitle(4)).toBe("Regular");
    expect(levelTitle(12)).toBe("Scholar");
    expect(levelTitle(MAX_LEVEL)).toBe("Legend");
  });
});

describe("awardXp", () => {
  it("adds and reports the gain", () => {
    const r = awardXp(emptyXpState(), XP_AWARDS.taskOnTime);
    expect(r.state.xp).toBe(25);
    expect(r.gained).toBe(25);
    expect(r.leveledUp).toBeNull();
  });

  it("announces the level exactly once, on the award that crosses it", () => {
    const r1 = awardXp({ xp: 90, seenLevel: 1 }, 10); // lands exactly on 100
    expect(r1.leveledUp).toBe(2);
    const r2 = awardXp(r1.state, 10);
    expect(r2.leveledUp).toBeNull();
  });

  /**
   * The counter is monotonic by design: a tier can never be taken back, so a
   * negative award is dropped rather than applied.
   */
  it("refuses to subtract", () => {
    const state = { xp: 500, seenLevel: 3 };
    expect(awardXp(state, -100).state).toBe(state);
    expect(awardXp(state, 0).state).toBe(state);
    expect(awardXp(state, NaN).state).toBe(state);
    expect(awardXp(state, Infinity).state).toBe(state);
  });

  it("floors fractional awards", () => {
    expect(awardXp(emptyXpState(), 25.9).state.xp).toBe(25);
  });

  it("saturates at the ceiling and reports the truncated gain", () => {
    const near = { xp: xpForLevel(MAX_LEVEL) - 10, seenLevel: MAX_LEVEL };
    const r = awardXp(near, 1000);
    expect(r.state.xp).toBe(xpForLevel(MAX_LEVEL));
    expect(r.gained).toBe(10);
  });

  /** A whole term of work must not overflow into anything strange. */
  it("survives a semester of awards", () => {
    let s = emptyXpState();
    for (let i = 0; i < 500; i++) s = awardXp(s, XP_AWARDS.taskOnTime).state;
    expect(s.xp).toBe(Math.min(500 * 25, xpForLevel(MAX_LEVEL)));
    expect(levelFromXp(s.xp)).toBeLessThanOrEqual(MAX_LEVEL);
  });
});

describe("ackLevel", () => {
  it("catches seenLevel up to the real level", () => {
    expect(ackLevel({ xp: 450, seenLevel: 1 }).seenLevel).toBe(4);
  });

  it("is a no-op — same reference — when already caught up", () => {
    const state = { xp: 450, seenLevel: 4 };
    expect(ackLevel(state)).toBe(state);
  });

  it("never walks seenLevel backwards", () => {
    expect(ackLevel({ xp: 0, seenLevel: 5 }).seenLevel).toBe(5);
  });
});

describe("normalizeXpState", () => {
  it("falls back to empty for anything unrecognisable", () => {
    for (const junk of [null, undefined, 7, "x", [], {}]) {
      expect(normalizeXpState(junk)).toEqual(emptyXpState());
    }
  });

  it("keeps a sane stored value", () => {
    expect(normalizeXpState({ xp: 320, seenLevel: 3 })).toEqual({
      xp: 320,
      seenLevel: 3,
    });
  });

  /** It crosses the sync endpoint, so a hostile document must not stick. */
  it("clamps hostile or corrupt values", () => {
    expect(normalizeXpState({ xp: -5, seenLevel: 0 })).toEqual({
      xp: 0,
      seenLevel: 1,
    });
    expect(normalizeXpState({ xp: 1e12, seenLevel: 999 })).toEqual({
      xp: xpForLevel(MAX_LEVEL),
      seenLevel: MAX_LEVEL,
    });
    expect(normalizeXpState({ xp: NaN, seenLevel: NaN })).toEqual(emptyXpState());
    expect(normalizeXpState({ xp: "500", seenLevel: "3" })).toEqual(
      emptyXpState(),
    );
  });
});
