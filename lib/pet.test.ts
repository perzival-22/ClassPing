import { describe, expect, it } from "vitest";
import {
  DEFAULT_PET_NAME,
  MAX_PET_NAME,
  STAGES,
  emptyPetState,
  moodExpression,
  nextStage,
  normalizePetState,
  petStage,
  petStatus,
  type PetMood,
  type PetSignals,
} from "./pet";
import type { TermStats } from "./streak";

const stats = (over: Partial<TermStats> = {}): TermStats => ({
  completed: 0,
  overdue: 0,
  dueThisWeek: 0,
  streak: 0,
  ...over,
});

const signals = (over: Partial<PetSignals> = {}): PetSignals => ({
  stats: stats(),
  trophyStreak: 0,
  level: 5,
  hasTasks: true,
  ...over,
});

describe("petStage", () => {
  it("starts as an egg and grows with the level", () => {
    expect(petStage(1).id).toBe("egg");
    expect(petStage(2).id).toBe("sprout");
    expect(petStage(6).id).toBe("grown");
    expect(petStage(12).id).toBe("radiant");
  });

  it("holds the last stage past the final threshold", () => {
    expect(petStage(30).id).toBe("radiant");
  });

  it("points at what's next, and at nothing once fully grown", () => {
    expect(nextStage(1)?.id).toBe("sprout");
    expect(nextStage(6)?.id).toBe("radiant");
    expect(nextStage(12)).toBeNull();
  });

  it("keeps the stage table ordered", () => {
    const ats = STAGES.map((s) => s.at);
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
  });
});

describe("petStatus", () => {
  it("rests when the planner is empty, whatever else is true", () => {
    const s = petStatus(signals({ hasTasks: false, trophyStreak: 9 }));
    expect(s.mood).toBe("resting");
  });

  it("tells a brand-new user what to do", () => {
    const s = petStatus(signals({ hasTasks: false, level: 1 }));
    expect(s.line).toMatch(/add an assignment/i);
  });

  /**
   * The tone rule, asserted rather than trusted: a single missed deadline is an
   * ordinary week. Drooping at the first one would make the signal both
   * worthless and unkind.
   */
  it("does not droop at one overdue item", () => {
    expect(petStatus(signals({ stats: stats({ overdue: 1 }) })).mood).toBe(
      "concerned",
    );
    expect(petStatus(signals({ stats: stats({ overdue: 2 }) })).mood).toBe(
      "concerned",
    );
    expect(petStatus(signals({ stats: stats({ overdue: 3 }) })).mood).toBe(
      "droopy",
    );
  });

  it("beams on a long on-time streak", () => {
    expect(petStatus(signals({ trophyStreak: 5 })).mood).toBe("beaming");
  });

  it("brightens on days clear when there is no streak yet", () => {
    const s = petStatus(signals({ stats: stats({ streak: 3 }) }));
    expect(s.mood).toBe("bright");
    expect(s.line).toMatch(/3 days/);
  });

  it("is merely content in a normal week", () => {
    expect(petStatus(signals({ stats: stats({ dueThisWeek: 2 }) })).mood).toBe(
      "content",
    );
  });

  /** Overdue work outranks a good streak — the pet reports now, not history. */
  it("lets overdue work override a streak", () => {
    const s = petStatus(
      signals({ stats: stats({ overdue: 4, streak: 9 }), trophyStreak: 7 }),
    );
    expect(s.mood).toBe("droopy");
  });

  it("carries the stage through on every mood", () => {
    expect(petStatus(signals({ level: 12 })).stage.id).toBe("radiant");
    expect(petStatus(signals({ level: 1, hasTasks: false })).stage.id).toBe("egg");
  });

  /**
   * Nothing the pet says may read as an accusation. Cheap to assert and the
   * exact thing a well-meaning copy edit would break.
   */
  it("never scolds", () => {
    const cases: PetSignals[] = [
      signals({ hasTasks: false }),
      signals({ stats: stats({ overdue: 1 }) }),
      signals({ stats: stats({ overdue: 5 }) }),
      signals({ trophyStreak: 6 }),
      signals({ stats: stats({ streak: 4 }) }),
      signals({ stats: stats({ dueThisWeek: 3 }) }),
    ];
    for (const c of cases) {
      const { line } = petStatus(c);
      expect(line).not.toMatch(/you (never|failed|should|didn|always)/i);
      expect(line).not.toMatch(/lazy|disappoint|sad|hungry|dying|sick/i);
      expect(line.length).toBeLessThan(70);
    }
  });
});

describe("moodExpression", () => {
  const moods: PetMood[] = [
    "resting",
    "droopy",
    "concerned",
    "content",
    "bright",
    "beaming",
  ];

  it("returns drawable numbers for every mood", () => {
    for (const m of moods) {
      const e = moodExpression(m);
      expect(e.eyes).toBeGreaterThanOrEqual(0);
      expect(e.eyes).toBeLessThanOrEqual(1);
      expect(e.mouth).toBeGreaterThanOrEqual(-1);
      expect(e.mouth).toBeLessThanOrEqual(1);
      expect(e.tint).toMatch(/^var\(--/);
    }
  });

  /** The face has to actually track the mood, or it's just decoration. */
  it("curves the mouth up for good moods and down for bad", () => {
    expect(moodExpression("beaming").mouth).toBeGreaterThan(
      moodExpression("content").mouth,
    );
    expect(moodExpression("content").mouth).toBeGreaterThan(
      moodExpression("concerned").mouth,
    );
    expect(moodExpression("concerned").mouth).toBeGreaterThan(
      moodExpression("droopy").mouth,
    );
  });

  it("keeps the resting eyes nearly shut", () => {
    expect(moodExpression("resting").eyes).toBeLessThan(0.2);
  });
});

describe("normalizePetState", () => {
  it("falls back to the default for anything unrecognisable", () => {
    for (const junk of [null, undefined, 5, "x", []]) {
      expect(normalizePetState(junk)).toEqual(emptyPetState());
    }
  });

  it("keeps a valid name and hat", () => {
    expect(normalizePetState({ name: "Mochi", hat: "hat-cap" })).toEqual({
      name: "Mochi",
      hat: "hat-cap",
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
  it("drops a hat that isn't a short string", () => {
    expect(normalizePetState({ hat: {} }).hat).toBeUndefined();
    expect(normalizePetState({ hat: "" }).hat).toBeUndefined();
    expect(normalizePetState({ hat: "z".repeat(500) }).hat).toBeUndefined();
    expect(normalizePetState({ name: 42 }).name).toBe(DEFAULT_PET_NAME);
  });

  it("omits the hat key entirely when there is none", () => {
    expect("hat" in normalizePetState({ name: "Bo" })).toBe(false);
  });
});
