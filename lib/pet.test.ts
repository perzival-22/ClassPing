import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FAMILIES,
  FAMILY_BAND,
  GRADES,
  RESERVED_TIER_IDS,
  TIERS,
  TOP_TIER,
  collection,
  emptyPetState,
  higherTier,
  nextTier,
  normalizePetState,
  petStatus,
  shelves,
  shownTier,
  tierById,
  tierFor,
  runwayToLevel,
  tierRank,
  tierRunway,
  DEFAULT_PET_NAME,
  MAX_PET_NAME,
  type TierId,
} from "./pet";
import { MAX_LEVEL, XP_AWARDS, levelFromXp, xpForLevel } from "./xp";

describe("the shape of the ladder", () => {
  it("is five families of six grades, less the reserved slots", () => {
    expect(FAMILIES).toHaveLength(5);
    expect(GRADES).toHaveLength(6);
    expect(TIERS).toHaveLength(FAMILIES.length * GRADES.length - RESERVED_TIER_IDS.size);
    expect(TIERS).toHaveLength(27);
  });

  it("gives every family a twenty-level band, in order, ending at the ceiling", () => {
    FAMILIES.forEach((f, i) => {
      expect(f.from, f.id).toBe(1 + i * FAMILY_BAND);
    });
    expect(TIERS[0].at).toBe(1);
    expect(TOP_TIER.at).toBe(MAX_LEVEL);
    expect(TOP_TIER.id).toBe("astral-galaxy");
  });

  it("promotes at the documented levels", () => {
    expect(tierFor(1).id).toBe("base-common");
    expect(tierFor(4).id).toBe("base-bronze");
    expect(tierFor(20).id).toBe("base-galaxy");
    expect(tierFor(21).id).toBe("ghost-common");
    expect(tierFor(41).id).toBe("ember-common");
    expect(tierFor(61).id).toBe("crystal-common");
    expect(tierFor(100).id).toBe("astral-galaxy");
  });

  it("holds the tier between thresholds", () => {
    expect(tierFor(3).id).toBe("base-common");
    expect(tierFor(19).id).toBe("base-gold");
    expect(tierFor(99).id).toBe("astral-gold");
  });

  /** A reserved level promotes nothing — it is held empty until the art lands. */
  it("carries the previous rung across a reserved level", () => {
    expect(tierFor(8).id).toBe("base-bronze"); // base-rare reserved at 8
    expect(tierFor(56).id).toBe("ember-silver"); // ember-gold reserved at 56
    expect(tierFor(60).id).toBe("ember-silver"); // ember-galaxy reserved at 60
  });

  it("holds the top tier for every level above it", () => {
    expect(tierFor(MAX_LEVEL).id).toBe("astral-galaxy");
    expect(tierFor(999).id).toBe("astral-galaxy");
  });

  it("is ordered by level and has unique ids", () => {
    const ats = TIERS.map((t) => t.at);
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
    expect(new Set(TIERS.map((t) => t.id)).size).toBe(TIERS.length);
  });

  it("starts at level 1 so a new user always has a tier", () => {
    expect(TIERS[0].at).toBe(1);
    expect(tierFor(0).id).toBe("base-common");
  });

  it("names a tier by its family and grade", () => {
    expect(tierById("ember-silver")?.label).toBe("Ember Silver");
    expect(tierById("astral-galaxy")?.label).toBe("Astral Galaxy");
    expect(tierById("nope")).toBeUndefined();
    expect(tierById(undefined)).toBeUndefined();
  });

  it("points at the next rung, and at nothing from the top", () => {
    expect(nextTier(1)?.id).toBe("base-bronze");
    expect(nextTier(4)?.id).toBe("base-silver"); // base-rare is reserved
    expect(nextTier(20)?.id).toBe("ghost-common");
    expect(nextTier(MAX_LEVEL)).toBeNull();
  });

  it("ranks tiers in ladder order", () => {
    expect(tierRank("base-common")).toBe(0);
    expect(tierRank(TOP_TIER.id)).toBe(TIERS.length - 1);
  });

  it("picks the higher of two tiers either way round", () => {
    expect(higherTier("base-common", "crystal-gold")).toBe("crystal-gold");
    expect(higherTier("crystal-gold", "base-common")).toBe("crystal-gold");
    expect(higherTier("ember-rare", "ember-rare")).toBe("ember-rare");
    // Across families the family wins, because the band is the outer axis.
    expect(higherTier("base-galaxy", "ghost-common")).toBe("ghost-common");
  });
});

describe("the reserved slots", () => {
  /**
   * The reservation exists only because the art doesn't. If a file appears,
   * this fails and names it — which is the only reliable way to be told the
   * slot can be opened, since nothing else in the app would notice.
   */
  it("is exactly the set of slots with no artwork on disk", () => {
    const publicDir = path.join(__dirname, "..", "public");
    const absent: string[] = [];
    for (const f of FAMILIES) {
      for (const g of GRADES) {
        const art = path.join(publicDir, "pet", `${f.prefix}_${g.id}.jpg`);
        if (!fs.existsSync(art)) absent.push(`${f.id}-${g.id}`);
      }
    }
    expect([...absent].sort()).toEqual([...RESERVED_TIER_IDS].sort());
  });

  it("holds the level open rather than closing the gap", () => {
    // base-rare is reserved at 8, so nothing is promoted there and the rung
    // above it keeps the level it would have had anyway.
    expect(TIERS.some((t) => t.at === 8)).toBe(false);
    expect(tierById("base-silver")?.at).toBe(12);
    expect(tierById("crystal-common")?.at).toBe(61);
  });

  it("never offers a tier whose art is reserved", () => {
    for (const id of RESERVED_TIER_IDS) {
      expect(tierById(id), id).toBeUndefined();
    }
  });
});

describe("tier presentation", () => {
  it("gives every tier art, a ring, a sheen and a glow", () => {
    for (const t of TIERS) {
      expect(t.art, t.id).toMatch(/^\/pet\/.+\.(jpg|jpeg|png|webp)$/);
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
    for (const g of GRADES) {
      expect(g.ring, g.id).toMatch(/^conic-gradient\(from /);
      expect(g.ring, g.id).not.toMatch(/url\(/);
    }
  });

  /**
   * One light source across the set. Rings that sweep from different angles
   * read as six unrelated objects rather than six rungs of one thing.
   */
  it("lights every ring from the same angle", () => {
    const angles = new Set(
      GRADES.map((g) => /^conic-gradient\(from ([^,]+),/.exec(g.ring)?.[1]),
    );
    expect(angles.size).toBe(1);
    expect([...angles][0]).toBeDefined();
  });

  /**
   * The ring answers "how far into this family?" and the portrait answers
   * "which family?". So the six grades must be distinct from each other — and
   * the deliberate repeat across families is what makes Gold read as Gold
   * wherever it turns up.
   */
  it("gives every grade a distinct ring, and repeats it across families", () => {
    expect(new Set(GRADES.map((g) => g.ring)).size).toBe(GRADES.length);
    const golds = TIERS.filter((t) => t.grade.id === "gold");
    expect(golds.length).toBeGreaterThan(1);
    expect(new Set(golds.map((t) => t.ring)).size).toBe(1);
  });

  /** Within a family the aura and the skin climb together, or it isn't a ladder. */
  it("changes the ring at every rung inside a family", () => {
    for (const f of FAMILIES) {
      const rings = TIERS.filter((t) => t.family.id === f.id).map((t) => t.ring);
      expect(new Set(rings).size, f.id).toBe(rings.length);
    }
  });

  /**
   * The art path is a string, so every check above passes just as happily when
   * it points at a file that isn't there — which is exactly how five tiers once
   * shipped naming `.webp` at a folder holding `.jpg`. Nothing failed; the
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

  /**
   * The whole set is precached on install, so its weight is a cold-start cost
   * paid by every user on a phone. Each portrait is a 512px crop of a 2048px
   * original for exactly this reason, and the budget is worth defending.
   */
  it("keeps the whole collection inside a sane precache budget", () => {
    const publicDir = path.join(__dirname, "..", "public");
    let bytes = 0;
    for (const t of TIERS) bytes += fs.statSync(path.join(publicDir, t.art)).size;
    expect(bytes).toBeLessThan(3 * 1024 * 1024);
  });
});

describe("the collection", () => {
  it("banks every rung beneath the best one, in ladder order", () => {
    const c = collection("base-silver");
    expect(c.collected.map((t) => t.id)).toEqual([
      "base-common",
      "base-bronze",
      "base-silver",
    ]);
    expect(c.next?.id).toBe("base-gold");
    expect(c.complete).toBe(false);
  });

  it("gives a brand-new account exactly one pet", () => {
    const c = collection();
    expect(c.collected.map((t) => t.id)).toEqual(["base-common"]);
    expect(c.next?.id).toBe("base-bronze");
  });

  it("is complete, with nothing next, at the top", () => {
    const c = collection(TOP_TIER.id);
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
      expect(c.collected[c.collected.length - 1].id).toBe(t.id);
    }
  });

  /**
   * The whole reason the shelf reads `bestTier` and not the live level:
   * clearing a semester resets XP, and a year of collecting must survive it.
   */
  it("keeps the shelf full after a reset that empties the planner", () => {
    const s = petStatus(1, TOP_TIER.id);
    expect(s.tier.id).toBe("base-common");
    expect(collection(s.best.id).complete).toBe(true);
  });

  /** It is fed from storage, so an id that isn't in the ladder can reach it. */
  it("falls back to the bottom rung rather than an empty shelf", () => {
    const c = collection("diamond" as never);
    expect(c.collected.map((t) => t.id)).toEqual(["base-common"]);
  });
});

describe("the shelves", () => {
  it("returns one row per family, always, even the untouched ones", () => {
    const rows = shelves("base-bronze");
    expect(rows.map((r) => r.family.id)).toEqual(FAMILIES.map((f) => f.id));
    expect(rows[0].held).toBe(2);
    expect(rows[0].full).toBe(false);
    expect(rows.slice(1).every((r) => r.untouched)).toBe(true);
  });

  it("counts every rung of the set exactly once", () => {
    for (const t of TIERS) {
      const rows = shelves(t.id);
      expect(rows.reduce((n, r) => n + r.tiers.length, 0)).toBe(TIERS.length);
      expect(rows.reduce((n, r) => n + r.held, 0)).toBe(tierRank(t.id) + 1);
    }
  });

  it("knows a family is short its reserved art", () => {
    const rows = shelves(TOP_TIER.id);
    const ember = rows.find((r) => r.family.id === "ember")!;
    expect(ember.tiers).toHaveLength(4);
    expect(ember.full).toBe(true);
    expect(rows.every((r) => r.full)).toBe(true);
  });

  it("fills earlier families completely before later ones start", () => {
    const rows = shelves("ember-rare");
    expect(rows[0].full).toBe(true); // base
    expect(rows[1].full).toBe(true); // ghost
    expect(rows[2].held).toBe(3); // ember: common, bronze, rare
    expect(rows[3].untouched).toBe(true); // crystal
  });
});

describe("petStatus", () => {
  it("reports the tier the level has earned and what's next", () => {
    const s = petStatus(21);
    expect(s.tier.id).toBe("ghost-common");
    expect(s.next?.id).toBe("ghost-bronze");
    expect(s.levelsToNext).toBe(3);
  });

  it("has nothing left to climb at the top", () => {
    const s = petStatus(MAX_LEVEL, TOP_TIER.id);
    expect(s.next).toBeNull();
    expect(s.levelsToNext).toBe(0);
    expect(s.line).toMatch(/top tier/i);
  });

  it("counts down in the singular on the last level before a promotion", () => {
    expect(petStatus(3).line).toMatch(/1 level to Base Bronze/);
    expect(petStatus(2).line).toMatch(/2 levels to Base Bronze/);
  });

  /**
   * The badge is the whole reason bestTier exists: clearing a semester resets
   * XP, and a year-old Astral must not be taken away by a tidy-up.
   */
  it("keeps the best tier as a badge after a reset", () => {
    const s = petStatus(1, TOP_TIER.id);
    expect(s.tier.id).toBe("base-common");
    expect(s.best.id).toBe(TOP_TIER.id);
    expect(s.demoted).toBe(true);
  });

  it("is not demoted when the level has caught up with the badge", () => {
    const s = petStatus(MAX_LEVEL, TOP_TIER.id);
    expect(s.demoted).toBe(false);
  });

  it("treats a badge below the current tier as no badge at all", () => {
    const s = petStatus(61, "ghost-bronze");
    expect(s.best.id).toBe("crystal-common");
    expect(s.demoted).toBe(false);
  });

  it("defaults the badge to the bottom rung when none is stored", () => {
    expect(petStatus(1).best.id).toBe("base-common");
  });
});

describe("picking a pet to display", () => {
  it("shows the level's own tier when nothing is picked", () => {
    const s = petStatus(41, "ember-common");
    expect(s.shown.id).toBe("ember-common");
    expect(s.shown.id).toBe(s.tier.id);
    expect(s.pinned).toBe(false);
  });

  it("shows the picked pet instead, and says it is pinned", () => {
    const s = petStatus(41, "ember-common", "base-galaxy");
    expect(s.shown.id).toBe("base-galaxy");
    expect(s.pinned).toBe(true);
    // The ladder is untouched: still standing on Ember Common, still climbing.
    expect(s.tier.id).toBe("ember-common");
    expect(s.next?.id).toBe("ember-bronze");
  });

  /**
   * The one rule that matters. `equipped` is the only field in this file that
   * grants an appearance rather than recording one, so a document naming a rung
   * the account has never reached must not be able to wear it.
   */
  it("refuses a pet that hasn't been collected", () => {
    const s = petStatus(4, "base-bronze", "astral-galaxy");
    expect(s.shown.id).toBe("base-bronze");
    expect(s.pinned).toBe(false);
  });

  it("refuses an id that isn't a tier at all", () => {
    for (const junk of ["diamond", "", "ember-galaxy"]) {
      const s = petStatus(61, "crystal-common", junk as TierId);
      expect(s.shown.id, junk).toBe("crystal-common");
    }
  });

  /** Every collected pet must be wearable, at every point on the ladder. */
  it("honours any rung at or below the best one", () => {
    for (const best of TIERS) {
      for (const want of TIERS) {
        const s = petStatus(best.at, best.id, want.id);
        const allowed = tierRank(want.id) <= tierRank(best.id);
        expect(s.shown.id, `${want.id} on ${best.id}`).toBe(
          allowed ? want.id : best.id,
        );
      }
    }
  });

  /**
   * A cleared semester keeps the shelf, so it must keep the choice too —
   * `best` is what was earned, and that is what a pick is measured against.
   */
  it("keeps a pinned pet after a reset that empties the planner", () => {
    const s = petStatus(1, "crystal-gold", "ghost-galaxy");
    expect(s.shown.id).toBe("ghost-galaxy");
    expect(s.tier.id).toBe("base-common");
    expect(s.demoted).toBe(true);
  });

  it("never lets the display change what the ladder reports", () => {
    const plain = petStatus(52, "ember-silver");
    const pinned = petStatus(52, "ember-silver", "base-common");
    expect(pinned.tier.id).toBe(plain.tier.id);
    expect(pinned.next?.id).toBe(plain.next?.id);
    expect(pinned.levelsToNext).toBe(plain.levelsToNext);
    expect(pinned.best.id).toBe(plain.best.id);
    expect(pinned.line).toBe(plain.line);
  });

  it("resolves the same tier through the shownTier shorthand", () => {
    const pet = { bestTier: "ghost-gold" as TierId, equipped: "base-bronze" as TierId };
    expect(shownTier(36, pet).id).toBe("base-bronze");
    expect(shownTier(36, { bestTier: "ghost-gold" }).id).toBe("ghost-gold");
  });
});

describe("normalizePetState", () => {
  it("falls back to the default for anything unrecognisable", () => {
    for (const junk of [null, undefined, 5, "x", []]) {
      expect(normalizePetState(junk)).toEqual(emptyPetState());
    }
  });

  it("keeps a valid name and badge", () => {
    expect(normalizePetState({ name: "Mochi", bestTier: "crystal-gold" })).toEqual({
      name: "Mochi",
      bestTier: "crystal-gold",
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
    expect(normalizePetState({ bestTier: "diamond" }).bestTier).toBe("base-common");
    expect(normalizePetState({ bestTier: 9 }).bestTier).toBe("base-common");
    expect(normalizePetState({ bestTier: {} }).bestTier).toBe("base-common");
    expect(normalizePetState({ name: 42 }).name).toBe(DEFAULT_PET_NAME);
    // A reserved slot is not a tier, however plausible the id looks.
    expect(normalizePetState({ bestTier: "ember-galaxy" }).bestTier).toBe(
      "base-common",
    );
  });

  /**
   * Two generations of stored ids have to survive: "base" from before the
   * six-tier art, and the bare grade ids from the six-rung ghost ladder.
   *
   * Each is translated by the *work* that earned it rather than by the artwork
   * it wore — the old "common" was free at level 1, so it becomes the rung that
   * is free at level 1 now, not the ghost portrait that shares its name and
   * costs level 21. These are the values that arithmetic produces; the reason
   * they are pinned is that a change to the live curve silently moves all of
   * them.
   */
  it("carries both pre-family generations across by what they cost", () => {
    for (const [old, want] of [
      ["base", "base-common"],
      ["common", "base-common"],
      ["bronze", "base-bronze"],
      ["rare", "base-silver"],
      ["silver", "ghost-common"],
      ["gold", "ember-common"],
      ["galaxy", "crystal-bronze"],
    ] as const) {
      expect(normalizePetState({ bestTier: old }).bestTier, old).toBe(want);
    }
  });

  /**
   * The bottom rung was free on every ladder there has ever been, so migrating
   * it must never hand out a badge. Getting this wrong marks every existing
   * account demoted the first time it opens the app.
   */
  it("never turns a free bottom rung into an earned badge", () => {
    for (const old of ["base", "common"]) {
      const s = petStatus(1, normalizePetState({ bestTier: old }).bestTier);
      expect(s.demoted, old).toBe(false);
    }
  });

  /** Every legacy id must land on a rung that still exists. */
  it("never migrates a badge onto a rung that isn't there", () => {
    for (const old of ["base", "common", "bronze", "rare", "silver", "gold", "galaxy"]) {
      const id = normalizePetState({ bestTier: old }).bestTier;
      expect(tierById(id), old).toBeDefined();
    }
  });

  /**
   * Older documents carry a `hat` from the cosmetic system that preceded tiers.
   * Per the persisted-shape contract we stopped writing it rather than dropping
   * it, so reading one back must be uneventful.
   */
  it("reads a pre-tier document without complaint", () => {
    expect(normalizePetState({ name: "Bo", hat: "hat-crown" })).toEqual({
      name: "Bo",
      bestTier: "base-common",
    });
  });

  it("keeps an equipped pet the account has collected", () => {
    expect(
      normalizePetState({ bestTier: "crystal-gold", equipped: "ghost-rare" }),
    ).toEqual({
      name: DEFAULT_PET_NAME,
      bestTier: "crystal-gold",
      equipped: "ghost-rare",
    });
  });

  /**
   * The field crosses the sync endpoint and is the only one that grants an
   * appearance, so a document claiming to wear something it never earned has
   * to be disarmed here rather than in the picker that renders it.
   */
  it("drops an equipped pet that outranks what was earned", () => {
    const s = normalizePetState({
      bestTier: "base-bronze",
      equipped: "astral-galaxy",
    });
    expect(s.equipped).toBeUndefined();
    expect(s.bestTier).toBe("base-bronze");
  });

  it("drops an equipped pet that isn't a real tier", () => {
    for (const junk of ["diamond", 9, {}, null, "ember-galaxy"]) {
      expect(
        normalizePetState({ bestTier: "astral-galaxy", equipped: junk }).equipped,
        String(junk),
      ).toBeUndefined();
    }
  });

  /** Unset means "follow my level", so the key is absent rather than null. */
  it("omits the key entirely when no pet is pinned", () => {
    expect("equipped" in normalizePetState({ bestTier: "ghost-gold" })).toBe(
      false,
    );
  });

  /** A pick written under an older ladder has to survive the same migration. */
  it("migrates a legacy equipped id the same way as the badge", () => {
    const s = normalizePetState({ bestTier: "galaxy", equipped: "bronze" });
    expect(s.bestTier).toBe("crystal-bronze");
    expect(s.equipped).toBe("base-bronze");
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
      expect(tierFor(levelFromXp(xpForLevel(t.at))).id, t.id).toBe(t.id);
      if (t.at > 1) {
        expect(tierFor(levelFromXp(xpForLevel(t.at) - 1)).id).not.toBe(t.id);
      }
    }
  });

  /**
   * The point of a hundred levels: every one of the twenty-seven has to be
   * reachable inside an academic year, or the last families are decoration.
   * The weekly figure is the model held in lib/xp.test.ts.
   */
  it("puts the whole collection inside an academic year", () => {
    const weekly = 380;
    expect(xpForLevel(TOP_TIER.at) / weekly).toBeLessThan(40);
    expect(xpForLevel(TOP_TIER.at) / weekly).toBeGreaterThan(24);
  });

  it("puts the first promotion within the first few weeks", () => {
    expect(xpForLevel(TIERS[1].at) / 380).toBeLessThan(2);
  });
});

describe("the runway to the next tier", () => {
  it("quotes a brand-new account the climb to the second rung", () => {
    const second = TIERS[1];
    const r = tierRunway(0);
    expect(r.next?.id).toBe(second.id);
    expect(r.xpToGo).toBe(xpForLevel(second.at));
    expect(r.assignments).toBe(
      Math.ceil(xpForLevel(second.at) / XP_AWARDS.taskOnTime),
    );
  });

  it("counts down as XP lands, and never past the rung", () => {
    const target = xpForLevel(TIERS[1].at);
    expect(tierRunway(target - 1).xpToGo).toBe(1);
    expect(tierRunway(target - 1).assignments).toBe(1);
    // Landing on the threshold promotes, so the runway is to the *next* one.
    expect(tierRunway(target).next?.id).toBe(TIERS[2].id);
  });

  it("stops at the top instead of promising a rung that isn't there", () => {
    const r = tierRunway(xpForLevel(MAX_LEVEL));
    expect(r.next).toBeNull();
    expect(r.xpToGo).toBe(0);
    expect(r.assignments).toBe(0);
  });

  /**
   * `imminent` is what lets the case say "3 assignments to Base Bronze"
   * instead of burying the prize behind a level number, so it has to be true on
   * exactly the level below a threshold and nowhere else.
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
    const xp = xpForLevel(7) + 20;
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

/**
 * A ladder people are already standing on. Every restructure so far has been
 * held to one rule — a threshold may move earlier or stay put, never later —
 * because levels grant pets and a pet that disappears is indistinguishable
 * from a bug. The curve restretch in lib/xp.ts made every stored total buy a
 * higher level, so this now has to hold across both changes at once.
 */
describe("nobody loses a pet", () => {
  const oldXpForLevel = (l: number) => 25 * (l - 1) * (l + 2);
  /** The six-rung ghost ladder as shipped: the id stored, and its level. */
  const SHIPPED: Array<[string, number]> = [
    ["common", 1],
    ["bronze", 3],
    ["rare", 5],
    ["silver", 7],
    ["gold", 11],
    ["galaxy", 16],
  ];

  /**
   * The badge and the level have to arrive at the same place. If the badge is
   * higher, every returning account is told it has been demoted; if it is
   * lower, the ratchet in the store quietly overwrites it and the migration was
   * pointless. Equality is the only outcome that is neither.
   */
  it("lands the migrated badge exactly where the account's own XP lands", () => {
    for (const [stored, oldLevel] of SHIPPED) {
      const xp = oldXpForLevel(oldLevel);
      const migrated = normalizePetState({ bestTier: stored }).bestTier;
      const earned = tierFor(levelFromXp(xp));
      expect(migrated, `${stored} at ${xp}xp`).toBe(earned.id);
      expect(petStatus(levelFromXp(xp), migrated).demoted, stored).toBe(false);
    }
  });

  /** And no stored total may buy a lower rung than it used to. */
  it("never walks a returning account down the ladder", () => {
    for (let oldLevel = 1; oldLevel <= 30; oldLevel++) {
      const xp = oldXpForLevel(oldLevel);
      // Rank on the old six-rung ladder, by its own thresholds.
      const oldRank = [1, 3, 5, 7, 11, 16].filter((at) => oldLevel >= at).length - 1;
      // The equivalent rung today, counted the same way: how many rungs deep.
      const nowRank = tierRank(tierFor(levelFromXp(xp)).id);
      expect(nowRank, `old level ${oldLevel}`).toBeGreaterThanOrEqual(oldRank);
    }
  });

  /**
   * The badge exists for exactly one case: a semester was cleared, XP went to
   * zero, and the rung that was genuinely earned has to survive it. That case
   * *should* read as demoted — that is the badge doing its job.
   */
  it("still shows an earned badge over an emptied planner", () => {
    const migrated = normalizePetState({ bestTier: "galaxy" }).bestTier;
    const s = petStatus(1, migrated);
    expect(s.tier.id).toBe("base-common");
    expect(s.best.id).toBe(migrated);
    expect(s.demoted).toBe(true);
  });
});
