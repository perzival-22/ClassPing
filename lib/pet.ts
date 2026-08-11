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

/** Five tiers. Level thresholds match the art's own captions. */
export type TierId = "base" | "bronze" | "silver" | "gold" | "galaxy";

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
 * on every rung — that shared light source is what makes five different
 * gradients read as one set. What climbs is the *amplitude*: base swings across
 * a narrow band of slate, and only the top tier leaves a single hue at all.
 */
export const TIERS: Tier[] = [
  {
    id: "base",
    label: "Base",
    at: 1,
    art: "/pet/pet_base.jpg",
    // Quiet, but not flat. The stops stay inside one slate family so it never
    // competes with the accent, while the sweep still catches an edge.
    ring:
      "conic-gradient(from 210deg,#8A93A6,#B7BFCE,#798196,#A6AEBE,#8A93A6)",
    sheen: "rgba(255,255,255,.55)",
    glow: "rgba(154,163,181,.22)",
  },
  {
    id: "bronze",
    label: "Bronze",
    at: 4,
    art: "/pet/pet_bronze.jpg",
    ring:
      "conic-gradient(from 210deg,#8C5524,#E0A063,#A8672F,#D69255,#8C5524)",
    sheen: "rgba(255,232,203,.42)",
    glow: "rgba(208,139,79,.26)",
  },
  {
    id: "silver",
    label: "Silver",
    at: 7,
    art: "/pet/pet_silver.jpg",
    ring:
      "conic-gradient(from 210deg,#94A2B6,#EDF2F8,#A9B6C8,#DCE4EE,#94A2B6)",
    sheen: "rgba(255,255,255,.6)",
    glow: "rgba(220,227,236,.28)",
  },
  {
    id: "gold",
    label: "Gold",
    at: 11,
    art: "/pet/pet_gold.jpg",
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
    art: "/pet/pet_galaxy.jpg",
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
  bestTier: "base",
});

/**
 * Defensive read — this crosses localStorage and the sync endpoint.
 *
 * Documents written before tiers carry a `hat` field. It is deliberately not
 * removed here and not an error: per the persisted-shape contract we stop
 * writing a field rather than dropping it, so an older client's document keeps
 * round-tripping without a migration.
 */
export function normalizePetState(raw: unknown): PetState {
  if (!raw || typeof raw !== "object") return emptyPetState();
  const v = raw as Partial<PetState>;
  const name =
    typeof v.name === "string" && v.name.trim()
      ? v.name.trim().slice(0, MAX_PET_NAME)
      : DEFAULT_PET_NAME;
  const bestTier =
    typeof v.bestTier === "string" && TIERS.some((t) => t.id === v.bestTier)
      ? (v.bestTier as TierId)
      : "base";
  return { name, bestTier };
}

/* ── progress ───────────────────────────────────────────── */

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

export function petStatus(level: number, bestTier: TierId = "base"): PetStatus {
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
