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

/** Six tiers, bottom to top. */
export type TierId =
  | "common"
  | "bronze"
  | "rare"
  | "silver"
  | "gold"
  | "galaxy";

/**
 * Ids that shipped before the six-tier art, mapped onto their replacements.
 *
 * `bestTier` is the one field in this file that is *stored*, so renaming a rung
 * is a data migration whether or not it is written like one. "base" and
 * "common" are the same rung — the bottom one — so the mapping is lossless, and
 * without it every account that had never climbed past the bottom would fail
 * validation on read. It happens to land on the same value as the fallback
 * today; that stops being true the moment a rung is ever added *below* common,
 * which is exactly the kind of change that would otherwise silently promote
 * every legacy account by one.
 */
const LEGACY_TIER_IDS: Record<string, TierId> = { base: "common" };

export interface Tier {
  id: TierId;
  label: string;
  /** XP level at which this tier is reached. */
  at: number;
  /** Served from public/pet — see the art cache bucket in public/sw.js. */
  art: string;
  /**
   * The aura ring, as a CSS background.
   *
   * Slate up to galaxy purple, on the *same* rungs as the skin — one ladder,
   * two expressions of it. A second progression with its own thresholds (the
   * old cosmetic frames at levels 2/5/9/14/20) put two competing ladders on one
   * screen, which reads as noise rather than as progress.
   *
   * Every rung is a conic gradient, and always has been on purpose: a conic
   * sweep is what makes a 3px band read as a *bezel* — something machined —
   * instead of a coloured hairline. It also means the whole ladder is one kind
   * of object, so the top tier is the same instrument turned up rather than a
   * different one. No files: this is the only ladder in the app that costs
   * nothing to load.
   */
  ring: string;
  /**
   * The hairline where the ring meets the portrait.
   *
   * Load-bearing at the bottom of the ladder. A flat grey band on a grey UI
   * reads to a brand-new user as "the image failed to load"; a lit inner edge
   * reads as a thing you have. So base gets the brightest sheen of the six, not
   * the dimmest — the ladder has to be legible from its first rung or the
   * climb never registers as one.
   */
  sheen: string;
  /** Soft bloom behind the character. rgba so it works on either theme. */
  glow: string;
}

/**
 * Every ring sweeps `from 210deg` so the bright quarter lands in the same place
 * on every rung — that shared light source is what makes six different
 * gradients read as one set. What climbs is the *amplitude*: common swings
 * across a narrow band of sage, and only the top tier leaves a single hue at
 * all.
 *
 * ── Why the thresholds sit where they do ────────────────────────────────────
 *
 * Rare was added between Bronze and Silver, and adding a rung to a ladder
 * people are already standing on is the part that needed care: Silver, Gold and
 * Galaxy keep the exact levels they have always had, and Bronze moved *down*
 * from 4 to 3 to open the gap Rare slots into. Every threshold therefore moved
 * earlier or not at all, so no existing account can wake up outranked by its
 * own `bestTier` badge — a promotion is a gift and a demotion is a bug, and a
 * renumbering that quietly did the second would have been indistinguishable
 * from one.
 *
 * The gaps widen as you climb (2, 2, 2, 4, 5). Early rungs land close together
 * because the first weeks are where the ladder has to prove it moves at all;
 * the last one is far enough away to still be worth arriving at.
 */
export const TIERS: Tier[] = [
  {
    id: "common",
    label: "Common",
    at: 1,
    art: "/pet/ghost_common.jpg",
    // Quiet, but not flat. The stops stay inside one desaturated sage family,
    // picked up off the art's own robe: bright enough to read as a bezel, dull
    // enough not to compete with whichever accent the user is running.
    ring:
      "conic-gradient(from 210deg,#7D9C84,#BFD9C4,#6E8E77,#A8C6AF,#7D9C84)",
    sheen: "rgba(255,255,255,.55)",
    glow: "rgba(141,178,150,.24)",
  },
  {
    id: "bronze",
    label: "Bronze",
    at: 3,
    art: "/pet/ghost_bronze.jpg",
    // Deliberately kept as copper rather than matched to the art's paler tan.
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
    at: 5,
    art: "/pet/ghost_rare.jpg",
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
    at: 7,
    art: "/pet/ghost_silver.jpg",
    ring:
      "conic-gradient(from 210deg,#94A2B6,#EDF2F8,#A9B6C8,#DCE4EE,#94A2B6)",
    sheen: "rgba(255,255,255,.6)",
    glow: "rgba(220,227,236,.28)",
  },
  {
    id: "gold",
    label: "Gold",
    at: 11,
    art: "/pet/ghost_gold.jpg",
    ring:
      "conic-gradient(from 210deg,#C9932B,#FFDE86,#D9A93E,#F7CF70,#C9932B)",
    sheen: "rgba(255,247,215,.5)",
    glow: "rgba(255,215,106,.30)",
  },
  {
    id: "galaxy",
    label: "Galaxy",
    at: 16,
    // The only rung that changes hue as it sweeps. The top tier should not look
    // like the same object in a different colour — it should look like a
    // different kind of object.
    art: "/pet/ghost_galaxy.jpg",
    ring:
      "conic-gradient(from 210deg,#7B2FF7,#C026D3,#4F46E5,#22D3EE,#A855F7,#7B2FF7)",
    sheen: "rgba(233,213,255,.55)",
    glow: "rgba(147,51,234,.34)",
  },
];

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
 * Documents written before the six-tier art carry `bestTier: "base"`, which is
 * translated here rather than rejected — see LEGACY_TIER_IDS.
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
      ? (LEGACY_TIER_IDS[v.bestTier] ?? v.bestTier)
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
