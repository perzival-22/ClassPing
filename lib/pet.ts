/**
 * The ClassPet — a rank you wear, earned across a term.
 *
 * ── What this is, and what it deliberately isn't ────────────────────────────
 *
 * The pet used to have moods: it read the week off your overdue count and
 * changed colour and expression to match. That's gone, on purpose. Colour can
 * either carry *state* or carry *reward*, and it cannot do both — the moment a
 * tier has its own painted identity, tinting it to say "you're behind" either
 * ruins the art or says nothing. So state now lives entirely where it already
 * lived and was already good: the trophy streak (lib/trophies.ts) and the
 * gentle days-clear read (lib/streak.ts). The pet is the long-arc reward, and
 * it only ever moves in one direction.
 *
 * That makes it a status object rather than a companion — closer to a Crew skin
 * than a Tamagotchi. The trade is deliberate: you lose "check the pet is okay"
 * and gain "watch the skin get better", which is the stronger hook for the
 * audience and the one that doesn't require guilt to work.
 *
 * ── Storage ─────────────────────────────────────────────────────────────────
 *
 * A name, and the best tier ever reached. Tier itself is *derived* from the XP
 * level and never stored — a stored tier is one more thing that can disagree
 * with the number that produced it.
 */

import { levelFromXp, xpForLevel, XP_AWARDS } from "./xp";

/**
 * Five families of six grades — twenty-seven pets, spread over a hundred levels.
 *
 * ── Why the ladder is two-dimensional now ───────────────────────────────────
 *
 * It used to be one row of six. At twenty-seven that stops working: a flat list
 * that long has no shape, and "rung nineteen of twenty-seven" is a number
 * nobody can hold. So the ladder gained an axis. A *family* is a band of twenty
 * levels with its own artwork and its own name — Base, Ghost, Ember, Crystal,
 * Astral, in that order — and a *grade* is the rung inside it, the same six
 * everywhere: Common, Bronze, Rare, Silver, Gold, Galaxy.
 *
 * That reads as "Ember Silver", which is a thing you can say out loud and hold
 * in your head, and it means the shelf can be five short rows instead of one
 * unreadable one. It also makes the whole ladder derivable: nothing below is
 * hand-written per pet, because twenty-seven hand-written entries is
 * twenty-seven chances for one of them to disagree with the others.
 *
 * ── Where the colour lives ──────────────────────────────────────────────────
 *
 * The ring, sheen and glow hang off the *grade*, not the tier. Every family's
 * art escalates the same way — pale and quiet at Common, most intense at Galaxy
 * — so one set of six metals fits all five families, and the ring answers "how
 * far into this family am I?" while the portrait answers "which family?".
 *
 * The alternative was twenty-seven bespoke gradients. That is not five times
 * richer, it is five times more to keep in tune, and it would have thrown away
 * the one thing the repeat buys: at a glance, Gold looks like Gold whichever
 * family it belongs to, which is what makes the grade ladder legible at all.
 */

export type FamilyId = "base" | "ghost" | "ember" | "crystal" | "astral";
export type GradeId =
  | "common"
  | "bronze"
  | "rare"
  | "silver"
  | "gold"
  | "galaxy";

/** `${family}-${grade}` — every tier's id, and what `bestTier` stores. */
export type TierId = `${FamilyId}-${GradeId}`;

/**
 * Badges written by earlier ladders, and the level each was earned at.
 *
 * `bestTier` is the one field in this file that is *stored*, so restructuring
 * the ladder is a data migration whether or not it is written like one. Two
 * generations have to be carried: "base", the bottom rung before the six-tier
 * art, and the bare grade ids of the six-rung ghost ladder that replaced it.
 *
 * ── Why by level and not by name ────────────────────────────────────────────
 *
 * The obvious migration is by artwork: the old "galaxy" wore `ghost_galaxy`,
 * so call it `ghost-galaxy`. That is wrong in both directions and the tests
 * caught it. The old bottom rung was called "common" and was free at level 1 —
 * translating it to `ghost-common`, which now costs level 21, hands a badge to
 * every account that never earned one and marks all of them demoted the moment
 * they open the app. Read the other way, the old "galaxy" cost level 16 on a
 * far steeper curve, which is a great deal more work than `ghost-galaxy` asks
 * for today.
 *
 * So the translation goes through the *work*: what level did this badge cost,
 * what is that much XP worth on the curve in lib/xp.ts now, and which rung does
 * that buy. That keeps the badge exactly level with what the same account's own
 * XP re-earns — which is what stops it reading as a demotion — and it degrades
 * correctly for the one case the badge exists for, an account that cleared its
 * data and has a real earned rung to show above an empty planner.
 */
const LEGACY_TIER_LEVELS: Record<string, number> = {
  /** The rung before the ghost ladder — free, at the bottom, wearing `pet_*`. */
  base: 1,
  /** The six-rung ghost ladder, at the levels it charged. */
  common: 1,
  bronze: 3,
  rare: 5,
  silver: 7,
  gold: 11,
  galaxy: 16,
};

/**
 * The 30-level curve those badges were earned on: 25(L−1)(L+2).
 *
 * Kept here, deliberately, rather than left in lib/xp.ts. It is not the app's
 * curve any more and nothing else may use it — it exists only to price a
 * historical badge, and a dead constant sitting in the live economy is an
 * invitation to accidentally reach for it.
 */
const legacyXpForLevel = (level: number): number =>
  25 * (level - 1) * (level + 2);

/** Translate a stored badge from an earlier ladder, or undefined if it isn't one. */
function migrateTierId(stored: string): TierId | undefined {
  const level = LEGACY_TIER_LEVELS[stored];
  if (level === undefined) return undefined;
  return tierFor(levelFromXp(legacyXpForLevel(level))).id;
}

export interface Family {
  id: FamilyId;
  label: string;
  /** Filename prefix in public/pet. */
  prefix: string;
  /** The level this family's Common lands on. Its band runs `from`..`from+19`. */
  from: number;
}

/**
 * The five bands, twenty levels each, in the order they are earned.
 *
 * Even bands rather than tuned ones, deliberately. The levels themselves are
 * not evenly priced — lib/xp.ts charges more for each one — so an even band in
 * levels is already an accelerating band in work, and tuning the bands on top
 * of that would be compounding a curve that is already curved.
 */
export const FAMILY_BAND = 20;

export const FAMILIES: Family[] = [
  { id: "base", label: "Base", prefix: "pet", from: 1 },
  { id: "ghost", label: "Ghost", prefix: "ghost", from: 21 },
  { id: "ember", label: "Ember", prefix: "ember", from: 41 },
  { id: "crystal", label: "Crystal", prefix: "crystal", from: 61 },
  { id: "astral", label: "Astral", prefix: "astral", from: 81 },
];

export interface Grade {
  id: GradeId;
  label: string;
  /** Levels above the family's first rung. */
  offset: number;
  /**
   * The aura ring, as a CSS background.
   *
   * Every rung is a conic gradient, and always has been on purpose: a conic
   * sweep is what makes a 3px band read as a *bezel* — something machined —
   * instead of a coloured hairline. It also means the whole ladder is one kind
   * of object, so the top grade is the same instrument turned up rather than a
   * different one. No files: this is the only ladder in the app that costs
   * nothing to load.
   *
   * All six sweep `from 210deg` so the bright quarter lands in the same place
   * on every rung — that shared light source is what makes six different
   * gradients read as one set. What climbs is the *amplitude*: Common swings
   * across a narrow band of sage, and only Galaxy leaves a single hue at all.
   */
  ring: string;
  /**
   * The hairline where the ring meets the portrait.
   *
   * Load-bearing at the bottom of the ladder. A flat grey band on a grey UI
   * reads to a brand-new user as "the image failed to load"; a lit inner edge
   * reads as a thing you have. So Common gets the brightest sheen of the six,
   * not the dimmest — the ladder has to be legible from its first rung or the
   * climb never registers as one.
   */
  sheen: string;
  /** Soft bloom behind the character. rgba so it works on either theme. */
  glow: string;
}

/**
 * Six grades, spaced 0/3/7/11/15/19 levels into their family's band.
 *
 * The gaps widen as you climb inside a family (3, 4, 4, 4, 4) and the family
 * boundary adds a fifth — so arriving at a new family is always the longest
 * wait and the biggest visible change, which is the shape a reward ladder
 * wants. It also leaves the band's last level free at the top of every family
 * except Astral, where Galaxy lands exactly on 100.
 */
export const GRADES: Grade[] = [
  {
    id: "common",
    label: "Common",
    offset: 0,
    // Quiet, but not flat. The stops stay inside one desaturated sage family:
    // bright enough to read as a bezel, dull enough not to compete with
    // whichever accent the user is running.
    ring:
      "conic-gradient(from 210deg,#7D9C84,#BFD9C4,#6E8E77,#A8C6AF,#7D9C84)",
    sheen: "rgba(255,255,255,.55)",
    glow: "rgba(141,178,150,.24)",
  },
  {
    id: "bronze",
    label: "Bronze",
    offset: 3,
    // Copper rather than the paler tan several families use for this grade.
    // The cloak is the light fabric and the ring is the metal, and the distance
    // that buys is what keeps this rung from reading as Gold at 46px.
    ring:
      "conic-gradient(from 210deg,#8C5524,#E0A063,#A8672F,#D69255,#8C5524)",
    sheen: "rgba(255,232,203,.42)",
    glow: "rgba(208,139,79,.26)",
  },
  {
    id: "rare",
    label: "Rare",
    offset: 7,
    // Saturated azure, and saturated on purpose: Silver's ring is a near-white
    // that carries a blue undertone, so a pale blue here would have given the
    // ladder two rungs that differ only in how washed out they are.
    ring:
      "conic-gradient(from 210deg,#1E5FBF,#7EC4FF,#2A79D6,#5AA8F5,#1E5FBF)",
    sheen: "rgba(214,235,255,.5)",
    glow: "rgba(70,140,235,.28)",
  },
  {
    id: "silver",
    label: "Silver",
    offset: 11,
    ring:
      "conic-gradient(from 210deg,#94A2B6,#EDF2F8,#A9B6C8,#DCE4EE,#94A2B6)",
    sheen: "rgba(255,255,255,.6)",
    glow: "rgba(220,227,236,.28)",
  },
  {
    id: "gold",
    label: "Gold",
    offset: 15,
    ring:
      "conic-gradient(from 210deg,#C9932B,#FFDE86,#D9A93E,#F7CF70,#C9932B)",
    sheen: "rgba(255,247,215,.5)",
    glow: "rgba(255,215,106,.30)",
  },
  {
    id: "galaxy",
    label: "Galaxy",
    offset: 19,
    // The only grade that changes hue as it sweeps. The top of a family should
    // not look like the same object in a different colour — it should look like
    // a different kind of object.
    ring:
      "conic-gradient(from 210deg,#7B2FF7,#C026D3,#4F46E5,#22D3EE,#A855F7,#7B2FF7)",
    sheen: "rgba(233,213,255,.55)",
    glow: "rgba(147,51,234,.34)",
  },
];

/**
 * Slots whose artwork does not exist yet.
 *
 * Their levels stay *reserved* rather than being closed up. Squeezing the
 * ladder to twenty-seven consecutive rungs and re-expanding it when the art
 * lands would move every threshold above the gap, and a threshold that moves
 * later takes a pet off somebody's shelf — the one thing this ladder is not
 * allowed to do. So the level is held empty, the rung simply isn't offered, and
 * dropping the file in is the whole change.
 *
 * A test asserts this set is exactly the set of slots with no file on disk, so
 * adding `ember_gold.jpg` fails the suite until this entry comes out — which is
 * the only reliable way to be told that the reservation is no longer needed.
 */
export const RESERVED_TIER_IDS: ReadonlySet<string> = new Set<TierId>([
  "base-rare",
  "ember-gold",
  "ember-galaxy",
]);

export interface Tier {
  id: TierId;
  family: Family;
  grade: Grade;
  /** "Ember Silver" — what this pet is called. */
  label: string;
  /** XP level at which this tier is reached. */
  at: number;
  /** Served from public/pet — see the art cache bucket in public/sw.js. */
  art: string;
  /** The grade's ring. See Grade.ring. */
  ring: string;
  /** The grade's sheen. See Grade.sheen. */
  sheen: string;
  /** The grade's glow. See Grade.glow. */
  glow: string;
}

const tierId = (f: Family, g: Grade): TierId => `${f.id}-${g.id}`;

/**
 * Every rung that exists, in ladder order.
 *
 * Built rather than listed. The families and grades above are the only things
 * anyone edits; the twenty-seven entries here are what those two tables imply,
 * which is why no rung can end up with a level that disagrees with its family's
 * band or a ring that disagrees with its grade.
 */
export const TIERS: Tier[] = FAMILIES.flatMap((family) =>
  GRADES.filter((grade) => !RESERVED_TIER_IDS.has(tierId(family, grade)))
    .map((grade) => ({
      id: tierId(family, grade),
      family,
      grade,
      label: `${family.label} ${grade.label}`,
      at: family.from + grade.offset,
      art: `/pet/${family.prefix}_${grade.id}.jpg`,
      ring: grade.ring,
      sheen: grade.sheen,
      glow: grade.glow,
    })),
);

export const FIRST_TIER = TIERS[0];
export const TOP_TIER = TIERS[TIERS.length - 1];

/** The tier a level has earned. */
export function tierFor(level: number): Tier {
  let tier = TIERS[0];
  for (const t of TIERS) if (level >= t.at) tier = t;
  return tier;
}

/** The next tier up, or null at the top. */
export function nextTier(level: number): Tier | null {
  return TIERS.find((t) => t.at > level) ?? null;
}

export const tierById = (id: string | undefined): Tier | undefined =>
  id ? TIERS.find((t) => t.id === id) : undefined;

/** Rank of a tier in the ladder, for comparing two of them. */
export const tierRank = (id: TierId): number =>
  TIERS.findIndex((t) => t.id === id);

/** Whichever of the two sits higher. Used to keep `bestTier` monotonic. */
export function higherTier(a: TierId, b: TierId): TierId {
  return tierRank(a) >= tierRank(b) ? a : b;
}

/* ── state ──────────────────────────────────────────────── */

export interface PetState {
  /** What the student calls it. */
  name: string;
  /**
   * The highest tier ever reached, kept forever.
   *
   * `clearData` empties the planner and resets XP with it, which would
   * otherwise demote someone from Galaxy to Base for the crime of tidying up
   * after a semester. A tier took a year to earn; clearing a timetable should
   * not take it away. So the live tier follows the level, and this is the badge
   * that doesn't.
   */
  bestTier: TierId;
}

export const DEFAULT_PET_NAME = "Pip";
export const MAX_PET_NAME = 24;

export const emptyPetState = (): PetState => ({
  name: DEFAULT_PET_NAME,
  bestTier: FIRST_TIER.id,
});

/**
 * Defensive read — this crosses localStorage and the sync endpoint.
 *
 * Documents written before tiers carry a `hat` field. It is deliberately not
 * removed here and not an error: per the persisted-shape contract we stop
 * writing a field rather than dropping it, so an older client's document keeps
 * round-tripping without a migration.
 *
 * Documents written by either earlier ladder carry a badge id this one has
 * never heard of. Those are translated rather than rejected — see
 * LEGACY_TIER_LEVELS.
 */
export function normalizePetState(raw: unknown): PetState {
  if (!raw || typeof raw !== "object") return emptyPetState();
  const v = raw as Partial<PetState>;
  const name =
    typeof v.name === "string" && v.name.trim()
      ? v.name.trim().slice(0, MAX_PET_NAME)
      : DEFAULT_PET_NAME;

  const stored =
    typeof v.bestTier === "string"
      ? (migrateTierId(v.bestTier) ?? v.bestTier)
      : undefined;
  const bestTier =
    stored && TIERS.some((t) => t.id === stored)
      ? (stored as TierId)
      : FIRST_TIER.id;

  return { name, bestTier };
}

/* ── the collection ─────────────────────────────────────── */

export interface Collection {
  /** Every rung banked, bottom to top. Never empty — Common is free. */
  collected: Tier[];
  /** The rungs still to earn, in the order they arrive. */
  locked: Tier[];
  /** The next one to land on the shelf, or null once the set is complete. */
  next: Tier | null;
  /** True when every rung has been collected. */
  complete: boolean;
}

/**
 * What the shelf holds.
 *
 * Derived from `bestTier` alone and stored nowhere. The ladder is climbed one
 * rung at a time and no rung can be skipped, so the highest one ever reached
 * *is* the list of everything beneath it — a second field enumerating what has
 * been collected could only ever disagree with the number that produced it,
 * which is the same reason the live tier is derived rather than stored (see the
 * header of this file).
 *
 * It reads `bestTier` rather than the current level on purpose: the shelf is a
 * record of what you have owned, and clearing a semester must not empty it. A
 * cleared account shows Common as its live tier and still has every rung it
 * ever earned standing on the shelf, which is exactly what `bestTier` is for.
 */
export function collection(bestTier: TierId = FIRST_TIER.id): Collection {
  // tierRank returns -1 for an id that isn't in the ladder. Storage is the only
  // way one gets here and normalizePetState already filters it, but the shelf
  // showing nothing at all is a bad way to find that out.
  const rank = Math.max(0, tierRank(bestTier));
  const locked = TIERS.slice(rank + 1);
  return {
    collected: TIERS.slice(0, rank + 1),
    locked,
    next: locked[0] ?? null,
    complete: locked.length === 0,
  };
}

export interface Shelf {
  family: Family;
  /** Every rung of this family that has art, in grade order. */
  tiers: Tier[];
  /** How many of them are collected. The first `held` of `tiers`. */
  held: number;
  /** True once the whole family is on the shelf. */
  full: boolean;
  /** True before any of it is — the families still entirely ahead of you. */
  untouched: boolean;
}

/**
 * The collection cut into the five family rows the shelf actually draws.
 *
 * A flat list of twenty-seven is the thing the family axis exists to avoid, and
 * every surface that shows the collection wants the same grouping — so the
 * grouping is computed once here rather than three times in JSX, where the
 * three copies would eventually disagree about what "collected" means.
 *
 * Families with no art at all are still returned. An empty row with a name on
 * it is how a user finds out Astral exists, and a ladder that only shows you
 * what you already have is not a ladder.
 */
export function shelves(bestTier: TierId = FIRST_TIER.id): Shelf[] {
  const rank = Math.max(0, tierRank(bestTier));
  return FAMILIES.map((family) => {
    const tiers = TIERS.filter((t) => t.family.id === family.id);
    const held = tiers.filter((t) => tierRank(t.id) <= rank).length;
    return {
      family,
      tiers,
      held,
      full: held === tiers.length,
      untouched: held === 0,
    };
  });
}

/* ── progress ───────────────────────────────────────────── */

/**
 * How far the next tier is, in the currency a student actually spends.
 *
 * "Two levels to Silver" is true and says nothing — nobody knows what a level
 * costs. Assignments are the unit the app is *about*, so the runway is also
 * quoted in them, priced at XP_AWARDS.taskOnTime: a plain tick from the list,
 * which is both the commonest way work gets logged and the *cheapest* of the
 * routes, so the figure errs long rather than short.
 *
 * It is therefore an equivalence, not a rule, and the UI has to say so —
 * finishing from a study block pays more than double, and focus minutes,
 * trophies and a boss win all pay into the same pot, so the real number is
 * usually smaller. Approximate and honest beats exact and wrong: the point is
 * to turn an abstract ladder into "a week and a bit of work".
 *
 * Which is also why the *tier* runway is rarely the one to show. Silver to Gold
 * is four levels, which quotes as seventy-odd assignments — true, and a number
 * that reads as a wall rather than a goal. So the caller asks for the next
 * level's runway normally and this one only when the two coincide (`imminent`),
 * where the number is small and the prize is the thing the user actually wants.
 */
export interface Runway {
  /** XP still owed to reach the target level. */
  xpToGo: number;
  /** On-time assignments that would cover it, rounded up. */
  assignments: number;
}

/** The distance from a lifetime total to any level above it. */
export function runwayToLevel(xp: number, level: number): Runway {
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  const xpToGo = Math.max(0, xpForLevel(level) - total);
  return { xpToGo, assignments: Math.ceil(xpToGo / XP_AWARDS.taskOnTime) };
}

export interface TierRunway extends Runway {
  /** The rung being climbed to, or null at the top. */
  next: Tier | null;
  /**
   * True when the next tier is also the next level — the one case where the
   * two distances collapse into a single sentence.
   */
  imminent: boolean;
}

export function tierRunway(xp: number): TierRunway {
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  const level = levelFromXp(total);
  const next = nextTier(level);
  if (!next) return { next: null, xpToGo: 0, assignments: 0, imminent: false };

  return {
    next,
    imminent: next.at === level + 1,
    ...runwayToLevel(total, next.at),
  };
}

export interface PetStatus {
  /** What the current level has earned. */
  tier: Tier;
  /** The next rung, or null at the top. */
  next: Tier | null;
  /** Levels still to climb before `next`. Zero at the top. */
  levelsToNext: number;
  /** True when the badge outranks the tier the current level supports. */
  demoted: boolean;
  /** The badge — highest ever reached. Equals `tier` unless data was cleared. */
  best: Tier;
  /** One line for the card. */
  line: string;
}

export function petStatus(
  level: number,
  bestTier: TierId = FIRST_TIER.id,
): PetStatus {
  const tier = tierFor(level);
  const next = nextTier(level);
  const best = tierById(higherTier(bestTier, tier.id)) ?? FIRST_TIER;
  const demoted = tierRank(best.id) > tierRank(tier.id);

  const line = next
    ? `Level ${level} · ${next.at - level} ${
        next.at - level === 1 ? "level" : "levels"
      } to ${next.label}`
    : `Level ${level} · top tier`;

  return {
    tier,
    next,
    levelsToNext: next ? next.at - level : 0,
    demoted,
    best,
    line,
  };
}
