import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PET_NAME,
  MAX_PET_NAME,
  TIERS,
  TOP_TIER,
  collection,
  emptyPetState,
  higherTier,
  nextTier,
  normalizePetState,
  petStatus,
  tierById,
  tierFor,
  runwayToLevel,
  tierRank,
  tierRunway,
} from "./pet";
import { MAX_LEVEL, XP_AWARDS, levelFromXp, xpForLevel } from "./xp";

describe("the tier ladder", () => {
  it("promotes at the documented levels", () => {
    expect(tierFor(1).id).toBe("common");
    expect(tierFor(3).id).toBe("bronze");
    expect(tierFor(5).id).toBe("rare");
    expect(tierFor(7).id).toBe("silver");
    expect(tierFor(11).id).toBe("gold");
    expect(tierFor(16).id).toBe("galaxy");
  });

  it("holds the tier between thresholds", () => {
    expect(tierFor(2).id).toBe("common");
    expect(tierFor(4).id).toBe("bronze");
    expect(tierFor(6).id).toBe("rare");
    expect(tierFor(15).id).toBe("gold");
  });

  /**
   * Rare was inserted into a ladder people were already standing on. Silver,
   * Gold and Galaxy had to keep their exact levels and Bronze was only allowed
   * to move earlier, so that no account could be outranked by its own stored
   * `bestTier` after the change — a demotion nobody earned would be
   * indistinguishable from a bug. Pinning the shipped numbers here is what
   * stops a future re-tune from doing it by accident.
   */
  it("never promotes later than the five-tier ladder it replaced", () => {
    const before: Record<string, number> = {
      common: 1, // was "base"
      bronze: 4,
      silver: 7,
      gold: 11,
      galaxy: 16,
    };
    for (const t of TIERS) {
      if (t.id in before) expect(t.at, t.id).toBeLessThanOrEqual(before[t.id]);
    }
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
    expect(tierFor(0).id).toBe("common");
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
    expect(nextTier(3)?.id).toBe("rare");
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
    expect(tierRank("common")).toBe(0);
    expect(tierRank("rare")).toBe(2);
    expect(tierRank("galaxy")).toBe(TIERS.length - 1);
  });

  it("picks the higher of two tiers either way round", () => {
    expect(higherTier("common", "gold")).toBe("gold");
    expect(higherTier("gold", "common")).toBe("gold");
    expect(higherTier("rare", "silver")).toBe("silver");
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
    expect(petStatus(2).line).toMatch(/1 level to Bronze/);
    expect(petStatus(1).line).toMatch(/2 levels to Bronze/);
  });

  /**
   * The badge is the whole reason bestTier exists: clearing a semester resets
   * XP, and a year-old Galaxy must not be taken away by a tidy-up.
   */
  it("keeps the best tier as a badge after a reset", () => {
    const s = petStatus(1, "galaxy");
    expect(s.tier.id).toBe("common");
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

  it("defaults the badge to the bottom rung when none is stored", () => {
    expect(petStatus(1).best.id).toBe("common");
  });
});

describe("the collection", () => {
  it("banks every rung beneath the best one, in ladder order", () => {
    const c = collection("rare");
    expect(c.collected.map((t) => t.id)).toEqual(["common", "bronze", "rare"]);
    expect(c.locked.map((t) => t.id)).toEqual(["silver", "gold", "galaxy"]);
    expect(c.next?.id).toBe("silver");
    expect(c.complete).toBe(false);
  });

  it("gives a brand-new account exactly one pet", () => {
    const c = collection();
    expect(c.collected.map((t) => t.id)).toEqual(["common"]);
    expect(c.next?.id).toBe("bronze");
  });

  it("is complete, with nothing next, at the top", () => {
    const c = collection("galaxy");
    expect(c.collected).toHaveLength(TIERS.length);
    expect(c.locked).toEqual([]);
    expect(c.next).toBeNull();
    expect(c.complete).toBe(true);
  });

  it("never loses or duplicates a rung, at any point on the ladder", () => {
    for (const t of TIERS) {
      const c = collection(t.id);
      expect(c.collected.length + c.locked.length).toBe(TIERS.length);
      expect([...c.collected, ...c.locked].map((x) => x.id)).toEqual(
        TIERS.map((x) => x.id),
      );
      // The best tier is the last thing on the shelf, never still locked.
      expect(c.collected[c.collected.length - 1].id).toBe(t.id);
    }
  });

  /**
   * The whole reason the shelf reads `bestTier` and not the live level:
   * clearing a semester resets XP, and a year-old Galaxy must survive it.
   */
  it("keeps the shelf full after a reset that empties the planner", () => {
    const s = petStatus(1, "galaxy");
    expect(s.tier.id).toBe("common");
    expect(collection(s.best.id).complete).toBe(true);
  });

  /** It is fed from storage, so an id that isn't in the ladder can reach it. */
  it("falls back to the bottom rung rather than an empty shelf", () => {
    const c = collection("diamond" as never);
    expect(c.collected.map((t) => t.id)).toEqual(["common"]);
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
    expect(normalizePetState({ bestTier: "diamond" }).bestTier).toBe("common");
    expect(normalizePetState({ bestTier: 9 }).bestTier).toBe("common");
    expect(normalizePetState({ bestTier: {} }).bestTier).toBe("common");
    expect(normalizePetState({ name: 42 }).name).toBe(DEFAULT_PET_NAME);
  });

  /**
   * "base" was the bottom rung before the six-tier art renamed it "common".
   * It has to be translated rather than rejected, and translated *explicitly*:
   * falling through to the default gives the right answer only for as long as
   * common stays the bottom of the ladder.
   */
  it("carries a pre-rename badge across to its new id", () => {
    expect(normalizePetState({ bestTier: "base" }).bestTier).toBe("common");
    expect(tierById("base")).toBeUndefined();
  });

  /**
   * Older documents carry a `hat` from the cosmetic system that preceded tiers.
   * Per the persisted-shape contract we stopped writing it rather than dropping
   * it, so reading one back must be uneventful.
   */
  it("reads a pre-tier document without complaint", () => {
    expect(normalizePetState({ name: "Bo", hat: "hat-crown" })).toEqual({
      name: "Bo",
      bestTier: "common",
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

describe("the runway to the next tier", () => {
  it("quotes a brand-new account the climb to bronze", () => {
    const bronze = TIERS[1];
    const r = tierRunway(0);
    expect(r.next?.id).toBe("bronze");
    expect(r.xpToGo).toBe(xpForLevel(bronze.at));
    expect(r.assignments).toBe(
      Math.ceil(xpForLevel(bronze.at) / XP_AWARDS.taskOnTime),
    );
  });

  it("counts down as XP lands, and never past the rung", () => {
    const target = xpForLevel(TIERS[1].at);
    expect(tierRunway(target - 1).xpToGo).toBe(1);
    expect(tierRunway(target - 1).assignments).toBe(1);
    // Landing on the threshold promotes, so the runway is to the *next* one.
    expect(tierRunway(target).next?.id).toBe("rare");
  });

  it("stops at the top instead of promising a rung that isn't there", () => {
    const r = tierRunway(xpForLevel(MAX_LEVEL));
    expect(r.next).toBeNull();
    expect(r.xpToGo).toBe(0);
    expect(r.assignments).toBe(0);
  });

  /**
   * `imminent` is what lets the case say "3 assignments to Bronze" instead of
   * burying the prize behind a level number, so it has to be true on exactly
   * the level below a threshold and nowhere else.
   */
  it("flags the rung only from the level directly below it", () => {
    expect(tierRunway(xpForLevel(2)).imminent).toBe(true); // 2 → bronze at 3
    expect(tierRunway(xpForLevel(3)).imminent).toBe(false); // 3 → rare at 5
    expect(tierRunway(xpForLevel(4)).imminent).toBe(true); // 4 → rare at 5
    expect(tierRunway(xpForLevel(6)).imminent).toBe(true); // 6 → silver at 7
    expect(tierRunway(xpForLevel(7)).imminent).toBe(false); // 7 → gold at 11
    expect(tierRunway(xpForLevel(MAX_LEVEL)).imminent).toBe(false);
  });

  /**
   * The same rule, stated once against the ladder rather than at hand-picked
   * levels — the enumeration above is the readable version, this is the one
   * that keeps holding when the thresholds move again.
   */
  it("flags every rung from exactly one level, across the whole ladder", () => {
    for (let level = 1; level < MAX_LEVEL; level++) {
      const r = tierRunway(xpForLevel(level));
      expect(r.imminent, `level ${level}`).toBe(r.next?.at === level + 1);
    }
  });

  /** The number is shown to a user, so it can never be zero-or-negative while
   *  a rung is still being promised, and never NaN from junk in storage. */
  it("always promises at least one more assignment while a rung remains", () => {
    for (let xp = 0; xp <= xpForLevel(MAX_LEVEL); xp += 37) {
      const r = tierRunway(xp);
      if (r.next) {
        expect(r.assignments).toBeGreaterThanOrEqual(1);
        expect(r.xpToGo).toBeGreaterThan(0);
      }
    }
  });

  it("survives nonsense from a hand-edited document", () => {
    for (const junk of [NaN, Infinity, -500, undefined as unknown as number]) {
      const r = tierRunway(junk);
      expect(Number.isFinite(r.assignments)).toBe(true);
      expect(r.assignments).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("the runway to the next level", () => {
  it("is the distance the case actually quotes", () => {
    // Level 7 with 100 XP banked into a 400 XP level: 300 to go, 12 finishes.
    const xp = xpForLevel(7) + 100;
    const r = runwayToLevel(xp, 8);
    expect(r.xpToGo).toBe(xpForLevel(8) - xp);
    expect(r.assignments).toBe(Math.ceil(r.xpToGo / XP_AWARDS.taskOnTime));
  });

  it("never quotes a distance to a level already held", () => {
    expect(runwayToLevel(xpForLevel(9), 5)).toEqual({
      xpToGo: 0,
      assignments: 0,
    });
  });

  /**
   * The whole reason the case quotes levels rather than tiers: the near number
   * must never be the larger of the two. It can equal it — that is precisely
   * the `imminent` case, where one sentence carries both.
   */
  it("never quotes further than the tier runway it stands in for", () => {
    for (let xp = 0; xp <= xpForLevel(MAX_LEVEL); xp += 53) {
      const tier = tierRunway(xp);
      if (!tier.next) continue;
      const level = runwayToLevel(xp, levelFromXp(xp) + 1);
      expect(level.assignments).toBeLessThanOrEqual(tier.assignments);
      expect(level.assignments === tier.assignments).toBe(tier.imminent);
    }
  });
});
