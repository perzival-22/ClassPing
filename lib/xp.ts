/**
 * Experience and levels — the long arc of a semester.
 *
 * This is deliberately a different instrument from the trophies in
 * lib/trophies.ts. A trophy streak measures *momentum*: seven assignments and
 * it resets, so the next reward is never far away. XP measures *accumulation*:
 * it only ever goes up, nothing resets it, and a bad fortnight costs progress
 * rather than erasing it. A student who breaks a streak in week 9 should still
 * be able to see that week 1 through 8 happened.
 *
 * ── Two rules this file exists to enforce ───────────────────────────────────
 *
 * 1. A counter, never a ledger. The whole document syncs as one JSONB row with
 *    a 512KB ceiling (app/api/sync/route.ts), and the item cap there only
 *    covers classes, tasks and grades — a per-event XP history under its own
 *    key would grow unbounded and eventually break sync outright, silently,
 *    long after the change that caused it. So: two integers, and everything
 *    else derived.
 *
 * 2. XP cosmetics are not app accents. Accents are the Pro shelf
 *    (lib/accents.ts): one free, nine paid. If levelling unlocked those too,
 *    either Pro is devalued or a Level 9 reward turns out to need a credit
 *    card. So XP pays out in a different currency entirely — avatar frames and
 *    things the pet can wear — and the two shelves never touch.
 */

export interface XpState {
  /** Lifetime XP. Monotonic: nothing in the app subtracts from it. */
  xp: number;
  /**
   * The highest level already celebrated on screen. This is what lets a
   * level-up be noticed exactly once without keeping a history of them.
   */
  seenLevel: number;
}

export const emptyXpState = (): XpState => ({ xp: 0, seenLevel: 1 });

/**
 * What each thing is worth.
 *
 * Finishing late still pays. The app's whole posture is that a student who is
 * behind should be able to climb back rather than be told the term is a
 * write-off — the streak already punishes lateness, and having the slow-moving
 * counter punish it a second time would just make the number useless to the
 * people who most need a reason to keep going.
 */
export const XP_AWARDS = {
  taskOnTime: 25,
  taskLate: 10,
  /** Per minute of focus actually completed — a 25 minute block pays 25. */
  focusMinute: 1,
  trophy: { bronze: 50, gold: 100, platinum: 200 },
  bossWin: 150,
} as const;

/**
 * The curve. Level n → n+1 costs 100 + 50(n−1), so the cumulative threshold for
 * level L closes to 25(L−1)(L+2): 100 for level 2, 450 for 4, 2700 for 10.
 *
 * Sized against a real term rather than picked for feel: roughly three
 * assignments and four focus blocks a week is ~175 XP, which lands a student
 * around level 10 by the end of a fifteen-week semester. Fast enough that the
 * first few levels arrive during onboarding, slow enough that the last one
 * still means something in April.
 */
export const MAX_LEVEL = 30;

/** Total lifetime XP needed to *be* this level. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return 25 * (l - 1) * (l + 2);
}

/** The level a given lifetime total buys, solved rather than looped. */
export function levelFromXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  if (xp >= xpForLevel(MAX_LEVEL)) return MAX_LEVEL;
  // Invert xp = 25(L-1)(L+2)  ⇒  L = (-1 + sqrt(9 + 4xp/25)) / 2
  let level = Math.floor((-1 + Math.sqrt(9 + (4 * xp) / 25)) / 2);
  // Correct for floating-point error at the boundaries, where sqrt of a
  // perfect square can land a hair under the integer and floor a whole level
  // away. Cheaper and more obviously right than reasoning about the epsilon.
  if (xpForLevel(level + 1) <= xp) level++;
  else if (xpForLevel(level) > xp) level--;
  return Math.min(MAX_LEVEL, Math.max(1, level));
}

/** Names for the bands. Warm rather than corporate — it's a student's app. */
const TITLES: { at: number; title: string }[] = [
  { at: 1, title: "Starter" },
  { at: 3, title: "Regular" },
  { at: 5, title: "Focused" },
  { at: 8, title: "Diligent" },
  { at: 12, title: "Scholar" },
  { at: 17, title: "Honours" },
  { at: 23, title: "Legend" },
];

export function levelTitle(level: number): string {
  let title = TITLES[0].title;
  for (const t of TITLES) if (level >= t.at) title = t.title;
  return title;
}

export interface LevelProgress {
  level: number;
  title: string;
  /** XP earned since this level began. */
  into: number;
  /** XP this level costs in total. Zero once MAX_LEVEL is reached. */
  need: number;
  /** 0–1, for the bar. Full at max level. */
  fraction: number;
  atMax: boolean;
}

export function levelProgress(xp: number): LevelProgress {
  const total = Math.max(0, Math.floor(xp) || 0);
  const level = levelFromXp(total);
  const atMax = level >= MAX_LEVEL;
  const base = xpForLevel(level);
  const need = atMax ? 0 : xpForLevel(level + 1) - base;
  const into = atMax ? 0 : total - base;
  return {
    level,
    title: levelTitle(level),
    into,
    need,
    fraction: atMax ? 1 : Math.min(1, into / need),
    atMax,
  };
}

export interface AwardResult {
  state: XpState;
  /** The level just reached, when this award crossed one. Null otherwise. */
  leveledUp: number | null;
  /** XP actually added, after clamping — for the "+25 XP" toast. */
  gained: number;
}

/**
 * Add XP. Never subtracts: a negative or non-finite award is dropped rather
 * than applied, because the only way an unlocked cosmetic can be taken back is
 * a bug, and a user watching their level fall would reasonably assume the app
 * had lost their work.
 */
export function awardXp(state: XpState, amount: number): AwardResult {
  const safe = Number.isFinite(amount) ? Math.floor(amount) : 0;
  if (safe <= 0) return { state, leveledUp: null, gained: 0 };

  const before = levelFromXp(state.xp);
  // Cap at the max level's threshold: past there the number is decorative, and
  // an unbounded integer syncing forever is the one thing this file avoids.
  const xp = Math.min(state.xp + safe, xpForLevel(MAX_LEVEL));
  const after = levelFromXp(xp);

  return {
    state: { ...state, xp },
    leveledUp: after > before ? after : null,
    gained: xp - state.xp,
  };
}

/** Mark every level up to the current one as celebrated. */
export function ackLevel(state: XpState): XpState {
  const level = levelFromXp(state.xp);
  return state.seenLevel >= level ? state : { ...state, seenLevel: level };
}

/**
 * Read a persisted value back defensively — this crosses localStorage and the
 * sync endpoint, so it can arrive as anything at all.
 */
export function normalizeXpState(raw: unknown): XpState {
  if (!raw || typeof raw !== "object") return emptyXpState();
  const v = raw as Partial<XpState>;
  const xp =
    typeof v.xp === "number" && Number.isFinite(v.xp) && v.xp > 0
      ? Math.min(Math.floor(v.xp), xpForLevel(MAX_LEVEL))
      : 0;
  const seen =
    typeof v.seenLevel === "number" && Number.isFinite(v.seenLevel)
      ? Math.min(Math.max(Math.floor(v.seenLevel), 1), MAX_LEVEL)
      : 1;
  return { xp, seenLevel: seen };
}

/* ── cosmetics ──────────────────────────────────────────── */

/**
 * What levelling actually buys.
 *
 * `frame` rings the avatar; `hat` is worn by the ClassPet. Neither is an app
 * accent, and that separation is the point (see the header). It also means
 * these cost nothing to draw — a frame is a CSS gradient and a hat is a few
 * SVG paths — so the reward ladder doesn't depend on commissioning art.
 */
export type CosmeticKind = "frame" | "hat";

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  label: string;
  /** Level at which it unlocks. */
  at: number;
  /** CSS background for the frame ring, or the accent colour of a hat. */
  css: string;
}

export const COSMETICS: Cosmetic[] = [
  { id: "frame-mint", kind: "frame", label: "Mint ring", at: 2, css: "linear-gradient(135deg,#5ED9B4,#2FA98A)" },
  { id: "hat-cap", kind: "hat", label: "Cap", at: 3, css: "#5B54E8" },
  { id: "frame-dusk", kind: "frame", label: "Dusk ring", at: 5, css: "linear-gradient(135deg,#F7A072,#E0566E)" },
  { id: "hat-beanie", kind: "hat", label: "Beanie", at: 7, css: "#E0566E" },
  { id: "frame-tide", kind: "frame", label: "Tide ring", at: 9, css: "linear-gradient(135deg,#5AA9FF,#3D5BF0)" },
  { id: "hat-scarf", kind: "hat", label: "Scarf", at: 11, css: "#0E9F8E" },
  { id: "frame-ember", kind: "frame", label: "Ember ring", at: 14, css: "linear-gradient(135deg,#FFC94D,#F0713A)" },
  { id: "hat-crown", kind: "hat", label: "Crown", at: 16, css: "#F0B429" },
  { id: "frame-aurora", kind: "frame", label: "Aurora ring", at: 20, css: "linear-gradient(135deg,#C026D3,#5B54E8,#2FC9A8)" },
  { id: "hat-halo", kind: "hat", label: "Halo", at: 22, css: "#B9C5D6" },
];

export const cosmeticById = (id: string | undefined): Cosmetic | undefined =>
  id ? COSMETICS.find((c) => c.id === id) : undefined;

/** Everything this level has earned, in unlock order. */
export function unlockedCosmetics(level: number, kind?: CosmeticKind): Cosmetic[] {
  return COSMETICS.filter((c) => c.at <= level && (!kind || c.kind === kind));
}

/** The next thing to look forward to, for the "Level 5 unlocks…" line. */
export function nextCosmetic(level: number): Cosmetic | null {
  return COSMETICS.find((c) => c.at > level) ?? null;
}
