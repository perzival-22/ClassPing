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
 * 2. What levelling grants is never something Pro sells. Accents are the Pro
 *    shelf (lib/accents.ts): one free, nine paid. Levels grant the pet's tier
 *    (lib/pet.ts) — a different kind of object entirely, granted automatically,
 *    and never shown in the same picker. So no reward ladder here can ever
 *    terminate at a paywall.
 */

export interface XpState {
  /** Lifetime XP. Monotonic: nothing in the app subtracts from it. */
  xp: number;
  /**
   * The highest level already celebrated on screen. This is what lets a
   * level-up be noticed exactly once without keeping a history of them.
   */
  seenLevel: number;
  /**
   * Items that have already paid a creation award, as `creditKey` strings.
   *
   * This is the one place this file keeps a list, and it is kept for the same
   * reason lib/trophies.ts keeps `counted`: without it, un-adding and re-adding
   * a class mints XP every time. It is bounded twice over — pruned against the
   * items that still exist (`pruneXpState`) and hard-capped at MAX_CREDITED —
   * so rule 1 in the header still holds: no unbounded history in the document.
   */
  credited: string[];
  /** Local `YYYY-MM-DD` the creation cap is counting. */
  creditDay: string;
  /** Creation XP already paid on `creditDay`. Resets when the day turns over. */
  creditSpent: number;
}

/**
 * Ceiling on the credited list, in case pruning never runs — a corrupt or
 * partially-synced document must not be able to grow the payload without limit.
 * Comfortably above MAX_NOTES plus a term of classes and deadlines.
 */
export const MAX_CREDITED = 1200;

export const emptyXpState = (): XpState => ({
  xp: 0,
  seenLevel: 1,
  credited: [],
  creditDay: "",
  creditSpent: 0,
});

/**
 * What each thing is worth.
 *
 * Finishing late still pays. The app's whole posture is that a student who is
 * behind should be able to climb back rather than be told the term is a
 * write-off — the streak already punishes lateness, and having the slow-moving
 * counter punish it a second time would just make the number useless to the
 * people who most need a reason to keep going.
 *
 * ── Why the tick is no longer the best-paid thing ───────────────────────────
 *
 * A checkbox costs a tap. A focus block costs twenty-five minutes. Paying them
 * the same said the two were worth the same, which is the one claim this app
 * should never make — the point was never the admin of marking work done, it
 * was the work.
 *
 * So the weight moved rather than grew: the plain tick came down, and finishing
 * a task *from* a completed focus block pays a bonus on top of it. The ladder
 * is now 20 for a tick, 25 for a block, 45 for a block that ended in the thing
 * actually being finished. Nothing was taken away from someone who does the
 * work and forgets the timer — 20 is still a real award, and late still pays.
 *
 * It is deliberately not verification. A timer proves elapsed minutes, not
 * attention, and anyone determined to inflate a number only they can see is
 * welcome to; there is no leaderboard here and nothing to win off anyone else.
 * This is reward design, not an anti-cheat system.
 */
export const XP_AWARDS = {
  taskOnTime: 20,
  taskLate: 10,
  /** Per minute of focus actually completed — a 25 minute block pays 25. */
  focusMinute: 1,
  /**
   * On top of the task award, when the tick came from a finished focus block
   * rather than from the list. Granted under the same first-time-only guard as
   * the task award itself (see toggleTask in lib/store.tsx), so re-ticking
   * can't mint it twice.
   */
  focusedFinish: 25,
  trophy: { bronze: 50, gold: 100, platinum: 200 },
  bossWin: 150,

  /* ── setting the app up, which is also work ──────────────────────────────
   *
   * Filling a timetable in, logging a deadline before it bites and typing a
   * lecture up are all things this app exists to make happen, and none of them
   * paid anything. The ladder now runs to a hundred levels and has to be
   * climbable inside a year, so these carry the part of the week that isn't
   * ticking boxes.
   *
   * They are worth a fraction of finishing something, and that ratio is the
   * claim: writing a deadline down is not the same as meeting it. A test holds
   * the gap so nobody ever quietly makes admin the best-paid thing in the app
   * again.
   *
   * None of them are announced. See `silent` in the store's award path — a
   * reward you are told about becomes a target, and the moment "+5 XP" appears
   * for adding a task, adding tasks is a thing people do for XP rather than
   * because they have homework. These are meant to reward the term you were
   * having anyway, so they land in the total and say nothing.
   */
  /** First time a class is added. Timetables are built once and lived in. */
  classAdded: 15,
  /** First time an assignment is logged, whatever becomes of it later. */
  taskAdded: 5,
  /** First time a note grows past NOTE_XP_CHARS — see below. */
  noteWritten: 10,
} as const;

/**
 * How much of a note counts as having written one.
 *
 * A note pays once, when it first crosses this length. Paying on creation would
 * pay for an empty note, and paying per keystroke or per save would pay for
 * holding down a key — so the award is hung on the note having actual content
 * in it, and hung on the note's *id*, so the same lecture can't pay twice by
 * being edited over three days.
 */
export const NOTE_XP_CHARS = 180;

/**
 * The most creation XP one day can pay, across all three sources above.
 *
 * Creation is the one award in this file the user controls the timing of
 * completely: an assignment has to be finished before its deadline to pay, but
 * fifty assignments can be typed in in an afternoon. The per-item guard stops a
 * single item paying twice; this stops a single sitting paying for a term.
 *
 * Set well above a genuinely busy day — five classes and a dozen deadlines at
 * the start of a semester is 135, comfortably inside it — so the only person
 * who ever meets this ceiling is someone going out of their way to.
 */
export const DAILY_CREATION_XP = 200;

/**
 * The curve. Level n → n+1 costs 40 + 2(n−1), so the cumulative threshold for
 * level L closes to (L−1)(L+38): 40 for level 2, 432 for 10, 13,662 for 100.
 *
 * ── Why a hundred levels, and why this shape ────────────────────────────────
 *
 * The ladder carries twenty-seven pets across five families (lib/pet.ts), and
 * every one of them has to be reachable inside an academic year or the last
 * families are a rumour rather than a reward. That is the constraint the curve
 * is solved for, not a feel: about 36 teaching weeks, at roughly 380 XP a week
 * for a student who actually uses the app, is a shade under 14,000 XP — so
 * level 100 sits at 13,662 and the top family lands in the closing weeks.
 *
 * The increment is deliberately shallow. Over 30 levels a steep quadratic was
 * fine; stretched over 100 the same shape would price the last level at four
 * figures and the ladder would visibly stall halfway up. At +2 XP per level the
 * first rung costs 40 and the hundredth costs 238 — a step that grows enough to
 * be felt across a year, and never enough to become a wall.
 *
 * ── What this replaced, and what it did to everyone's level ─────────────────
 *
 * The old curve was 25(L−1)(L+2) over 30 levels. It was much steeper, so every
 * stored XP total now buys a *higher* level than it did — 2,700 XP was level 10
 * and is now level 37. That direction is the only acceptable one: levels drive
 * the pet's tier, and a curve change that walked anyone backwards would take
 * away a pet they had earned. Existing accounts get a one-time jump up the new
 * ladder, which is the honest price of restretching it.
 *
 * A test holds the pacing arithmetic, because a doc comment about how long a
 * year takes is exactly the kind of claim that rots the first time a constant
 * moves.
 */
export const MAX_LEVEL = 100;

/** Total lifetime XP needed to *be* this level. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return (l - 1) * (l + 38);
}

/** The level a given lifetime total buys, solved rather than looped. */
export function levelFromXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  if (xp >= xpForLevel(MAX_LEVEL)) return MAX_LEVEL;
  // Invert xp = (L-1)(L+38) = L² + 37L - 38  ⇒  L = (-37 + sqrt(1521 + 4xp)) / 2
  let level = Math.floor((-37 + Math.sqrt(1521 + 4 * xp)) / 2);
  // Correct for floating-point error at the boundaries, where sqrt of a
  // perfect square can land a hair under the integer and floor a whole level
  // away. Cheaper and more obviously right than reasoning about the epsilon.
  if (xpForLevel(level + 1) <= xp) level++;
  else if (xpForLevel(level) > xp) level--;
  return Math.min(MAX_LEVEL, Math.max(1, level));
}

/**
 * Names for the bands. Warm rather than corporate — it's a student's app.
 *
 * Spread across the hundred levels in the same proportions they held across
 * thirty, so the rhythm a returning user knows is preserved even though every
 * number under it moved.
 */
const TITLES: { at: number; title: string }[] = [
  { at: 1, title: "Starter" },
  { at: 8, title: "Regular" },
  { at: 15, title: "Focused" },
  { at: 25, title: "Diligent" },
  { at: 39, title: "Scholar" },
  { at: 56, title: "Honours" },
  { at: 76, title: "Legend" },
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
 * than applied. A level going backwards would demote the pet's tier, and a user
 * watching their rank fall would reasonably assume the app had lost their work.
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

/* ── creation awards ────────────────────────────────────── */

export type CreationKind = "class" | "task" | "note";

const CREATION_AWARD: Record<CreationKind, number> = {
  class: XP_AWARDS.classAdded,
  task: XP_AWARDS.taskAdded,
  note: XP_AWARDS.noteWritten,
};

/**
 * The key an item is remembered under.
 *
 * Prefixed by kind because the three id spaces are generated independently and
 * nothing guarantees a note id can't equal a task id — an unprefixed key would
 * silently let one of them swallow the other's award.
 */
export const creditKey = (kind: CreationKind, id: string): string =>
  `${kind[0]}:${id}`;

/** Local `YYYY-MM-DD`. The cap is a *day* to a student, not 24 rolling hours. */
function localDay(d: Date = new Date()): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Pay for something being created, at most once ever and at most so much a day.
 *
 * Returns the state unchanged — same reference — when the item has already
 * paid, when the day's ceiling is reached, or when the kind is unknown, so a
 * caller can fire this on every render of a note without churning state.
 *
 * A partial award is deliberately *not* paid when the ceiling is close: half an
 * award would still mark the item as credited and quietly rob it of the rest
 * forever. The item stays uncredited and pays in full tomorrow.
 */
export function awardCreation(
  state: XpState,
  kind: CreationKind,
  id: string,
  now: Date = new Date(),
): AwardResult {
  const amount = CREATION_AWARD[kind];
  if (!amount || !id) return { state, leveledUp: null, gained: 0 };

  const key = creditKey(kind, id);
  if (state.credited.includes(key)) return { state, leveledUp: null, gained: 0 };

  const day = localDay(now);
  const spent = state.creditDay === day ? state.creditSpent : 0;
  if (spent + amount > DAILY_CREATION_XP) {
    return { state, leveledUp: null, gained: 0 };
  }

  const paid = awardXp(state, amount);
  // Saturating at MAX_LEVEL still credits the item: it has been paid what
  // there was left to pay, and leaving it open would re-check it forever.
  const credited = [...state.credited, key];
  return {
    ...paid,
    state: {
      ...paid.state,
      credited:
        credited.length > MAX_CREDITED
          ? credited.slice(credited.length - MAX_CREDITED)
          : credited,
      creditDay: day,
      creditSpent: spent + amount,
    },
  };
}

/**
 * Drop credits for items that no longer exist.
 *
 * Mirrors pruneTrophyState: without it the list grows for the whole semester
 * and is synced on every change. The trade is that deleting a class and adding
 * it back pays a second time — which the daily ceiling already bounds, and
 * which is the right way round, because the alternative is a list that
 * remembers every assignment a student ever binned.
 */
export function pruneXpState(state: XpState, liveKeys: Set<string>): XpState {
  const credited = state.credited.filter((k) => liveKeys.has(k));
  return credited.length === state.credited.length
    ? state
    : { ...state, credited };
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

  // A document written before creation awards existed has none of the three
  // fields below, and reads back as an account that has simply never been
  // credited for anything — which is exactly right. Nothing is back-paid: the
  // awards are for the term you are having, not the one you already had.
  const credited = Array.isArray(v.credited)
    ? v.credited
        .filter((k): k is string => typeof k === "string" && k.length > 0)
        .slice(0, MAX_CREDITED)
    : [];
  const creditDay = typeof v.creditDay === "string" ? v.creditDay : "";
  const creditSpent =
    typeof v.creditSpent === "number" && Number.isFinite(v.creditSpent)
      ? Math.min(Math.max(Math.floor(v.creditSpent), 0), DAILY_CREATION_XP)
      : 0;

  return { xp, seenLevel: seen, credited, creditDay, creditSpent };
}

/* ── what levelling buys ────────────────────────────────

   Nothing here any more, and that is the point.

   Levels used to unlock a shelf of frames and hats you equipped by hand. Both
   are gone: the reward is now the pet's tier (lib/pet.ts), which the level
   grants automatically — one ladder, no picker, nothing to forget to put on.

   The rule the old shelf existed to enforce still stands, and is now enforced
   by construction. App accents are the Pro ladder (lib/accents.ts): one free,
   nine paid. Tiers are the XP ladder. They are different kinds of object, they
   never appear in the same picker, and no amount of levelling ever lands a user
   at a paywall — because levelling no longer hands out anything that can be
   bought. */
