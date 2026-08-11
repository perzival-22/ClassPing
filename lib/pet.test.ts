import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PET_NAME,
  MAX_PET_NAME,
  TIERS,
  TOP_TIER,
  emptyPetState,
  higherTier,
  nextTier,
  normalizePetState,
  petStatus,
  tierById,
  tierFor,
  tierRank,
} from "./pet";
import { MAX_LEVEL, levelFromXp, xpForLevel } from "./xp";

describe("the tier ladder", () => {
  it("promotes at the documented levels", () => {
    expect(tierFor(1).id).toBe("base");
    expect(tierFor(4).id).toBe("bronze");
    expect(tierFor(7).id).toBe("silver");
    expect(tierFor(11).id).toBe("gold");
    expect(tierFor(16).id).toBe("galaxy");
  });

  it("holds the tier between thresholds", () => {
    expect(tierFor(3).id).toBe("base");
    expect(tierFor(6).id).toBe("bronze");
    expect(tierFor(15).id).toBe("gold");
  });

  it("holds the top tier for every level above it", () => {
    expect(tierFor(MAX_LEVEL).id).toBe("galaxy");
    expect(tierFor(999).id).toBe("galaxy");
  });

  it("is ordered and has unique ids", () => {
    const ats = TIERS.map((t) => t.at);
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
    expect(new Set(TIERS.map((t) => t.id)).size).toBe(TIERS.length);
  });

  it("starts at level 1 so a new user always has a tier", () => {
    expect(TIERS[0].at).toBe(1);
    expect(tierFor(0).id).toBe("base");
  });

  /**
   * The top tier has to be reachable inside an academic year or it is a rumour
   * rather than a reward. At roughly 175 XP a week — three assignments and four
   * focus blocks — Galaxy should land somewhere near a full year, not a decade.
   */
  it("keeps the top tier reachable in about an academic year", () => {
    const weeks = xpForLevel(TOP_TIER.at) / 175;
    expect(weeks).toBeGreaterThan(20);
    expect(weeks).toBeLessThan(52);
  });

  it("puts the first promotion within the first few weeks", () => {
    expect(xpForLevel(TIERS[1].at) / 175).toBeLessThan(4);
  });

  it("points at the next rung, and at nothing from the top", () => {
    expect(nextTier(1)?.id).toBe("bronze");
    expect(nextTier(10)?.id).toBe("gold");
    expect(nextTier(16)).toBeNull();
    expect(nextTier(MAX_LEVEL)).toBeNull();
  });

  it("looks up by id, tolerating a missing one", () => {
    expect(tierById("gold")?.label).toBe("Gold");
    expect(tierById("nope")).toBeUndefined();
    expect(tierById(undefined)).toBeUndefined();
  });

  it("ranks tiers in ladder order", () => {
    expect(tierRank("base")).toBe(0);
    expect(tierRank("galaxy")).toBe(TIERS.length - 1);
  });

  it("picks the higher of two tiers either way round", () => {
    expect(higherTier("base", "gold")).toBe("gold");
    expect(higherTier("gold", "base")).toBe("gold");
    expect(higherTier("silver", "silver")).toBe("silver");
  });
});

describe("tier presentation", () => {
  it("gives every tier art, a ring, a sheen and a glow", () => {
    for (const t of TIERS) {
      expect(t.art).toMatch(/^\/pet\/.+\.(jpg|jpeg|png|webp)$/);
      expect(t.ring.length).toBeGreaterThan(0);
      expect(t.sheen).toMatch(/^rgba\(/);
      expect(t.glow).toMatch(/^rgba\(/);
    }
  });

  /**
   * The aura ladder costs nothing to load, and that is a property worth
   * defending rather than a happy accident: the moment one rung reaches for a
   * file, the ring stops being guaranteed to paint on a cold offline start, and
   * the bottom of the ladder is exactly where a missing asset is
   * indistinguishable from having no ring at all.
   */
  it("draws every ring in CSS alone, with no asset behind it", () => {
    for (const t of TIERS) {
      expect(t.ring, t.id).toMatch(/^conic-gradient\(from /);
      expect(t.ring, t.id).not.toMatch(/url\(/);
    }
  });

  /**
   * One light source across the set. Rings that sweep from different angles
   * read as five unrelated objects rather than five rungs of one thing.
   */
  it("lights every ring from the same angle", () => {
    const angles = new Set(
      TIERS.map((t) => /^conic-gradient\(from ([^,]+),/.exec(t.ring)?.[1]),
    );
    expect(angles.size).toBe(1);
    expect([...angles][0]).toBeDefined();
  });

  /**
   * The art path is a string, so every check above passes just as happily when
   * it points at a file that isn't there — which is exactly how all five tiers
   * once shipped naming `.webp` at a folder holding `.jpg`. Nothing failed; the
   * images simply 404'd on device. So this reads the disk.
   */
  it("points at files that actually exist", () => {
    const publicDir = path.join(__dirname, "..", "public");
    for (const t of TIERS) {
      expect(fs.existsSync(path.join(publicDir, t.art)), t.art).toBe(true);
    }
  });

  /** The service worker precaches by literal URL, so its list must agree. */
  it("is precached by the service worker, exactly", () => {
    const sw = fs.readFileSync(
      path.join(__dirname, "..", "public", "sw.js"),
      "utf-8",
    );
    const listed = [...sw.matchAll(/"(\/pet\/[^"]+)"/g)].map((m) => m[1]);
    expect([...listed].sort()).toEqual([...TIERS.map((t) => t.art)].sort());
  });

  it("names an art file per tier, with no duplicates", () => {
    expect(new Set(TIERS.map((t) => t.art)).size).toBe(TIERS.length);
  });

  /** The ring ladder is what reads at 58px, so no two rungs may share a look. */
  it("gives every tier a distinct ring", () => {
    expect(new Set(TIERS.map((t) => t.ring)).size).toBe(TIERS.length);
  });

  /**
   * The aura and the skin climb together or they are two ladders, which is the
   * one thing this ladder is not allowed to be. There is no separate list of
   * ring thresholds to compare against — the rings hang off the tiers
   * themselves, so the check that matters is that nothing ever grows one.
   */
  it("hangs the ring off the tier, so both ladders are one", () => {
    for (const t of TIERS) {
      expect(tierFor(t.at).ring, `level ${t.at}`).toBe(t.ring);
      // And the rung below it wears the rung below's ring, never this one.
      if (t.at > 1) expect(tierFor(t.at - 1).ring).not.toBe(t.ring);
    }
  });
});

describe("petStatus", () => {
  it("reports the tier the level has earned and what's next", () => {
    const s = petStatus(7);
    expect(s.tier.id).toBe("silver");
    expect(s.next?.id).toBe("gold");
    expect(s.levelsToNext).toBe(4);
  });

  it("has nothing left to climb at the top", () => {
    const s = petStatus(16, "galaxy");
    expect(s.next).toBeNull();
    expect(s.levelsToNext).toBe(0);
    expect(s.line).toMatch(/top tier/i);
  });

  it("counts down in the singular on the last level before a promotion", () => {
    expect(petStatus(3).line).toMatch(/1 level to Bronze/);
    expect(petStatus(2).line).toMatch(/2 levels to Bronze/);
  });

  /**
   * The badge is the whole reason bestTier exists: clearing a semester resets
   * XP, and a year-old Galaxy must not be taken away by a tidy-up.
   */
  it("keeps the best tier as a badge after a reset", () => {
    const s = petStatus(1, "galaxy");
    expect(s.tier.id).toBe("base");
    expect(s.best.id).toBe("galaxy");
    expect(s.demoted).toBe(true);
  });

  it("is not demoted when the level has caught up with the badge", () => {
    const s = petStatus(16, "galaxy");
    expect(s.demoted).toBe(false);
    expect(s.best.id).toBe("galaxy");
  });

  it("treats a badge below the current tier as no badge at all", () => {
    const s = petStatus(11, "bronze");
    expect(s.best.id).toBe("gold");
    expect(s.demoted).toBe(false);
  });

  it("defaults the badge to base when none is stored", () => {
    expect(petStatus(1).best.id).toBe("base");
  });
});

describe("normalizePetState", () => {
  it("falls back to the default for anything unrecognisable", () => {
    for (const junk of [null, undefined, 5, "x", []]) {
      expect(normalizePetState(junk)).toEqual(emptyPetState());
    }
  });

  it("keeps a valid name and badge", () => {
    expect(normalizePetState({ name: "Mochi", bestTier: "gold" })).toEqual({
      name: "Mochi",
      bestTier: "gold",
    });
  });

  it("trims, truncates and rejects a blank name", () => {
    expect(normalizePetState({ name: "  Bo  " }).name).toBe("Bo");
    expect(normalizePetState({ name: "   " }).name).toBe(DEFAULT_PET_NAME);
    expect(normalizePetState({ name: "x".repeat(200) }).name).toHaveLength(
      MAX_PET_NAME,
    );
  });

  /** It crosses the sync endpoint, so a hostile document must not stick. */
  it("rejects a badge that isn't a real tier", () => {
    expect(normalizePetState({ bestTier: "diamond" }).bestTier).toBe("base");
    expect(normalizePetState({ bestTier: 9 }).bestTier).toBe("base");
    expect(normalizePetState({ bestTier: {} }).bestTier).toBe("base");
    expect(normalizePetState({ name: 42 }).name).toBe(DEFAULT_PET_NAME);
  });

  /**
   * Older documents carry a `hat` from the cosmetic system that preceded tiers.
   * Per the persisted-shape contract we stopped writing it rather than dropping
   * it, so reading one back must be uneventful.
   */
  it("reads a pre-tier document without complaint", () => {
    expect(normalizePetState({ name: "Bo", hat: "hat-crown" })).toEqual({
      name: "Bo",
      bestTier: "base",
    });
  });
});

describe("tiers against the XP curve", () => {
  it("every threshold is inside the reachable level range", () => {
    for (const t of TIERS) {
      expect(t.at).toBeGreaterThanOrEqual(1);
      expect(t.at).toBeLessThanOrEqual(MAX_LEVEL);
    }
  });

  it("promotes exactly on the XP that buys the threshold level", () => {
    for (const t of TIERS) {
      expect(tierFor(levelFromXp(xpForLevel(t.at))).id).toBe(t.id);
      if (t.at > 1) {
        expect(tierFor(levelFromXp(xpForLevel(t.at) - 1)).id).not.toBe(t.id);
      }
    }
  });
});
