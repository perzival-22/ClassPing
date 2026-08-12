import { describe, expect, it } from "vitest";
import { buildGodmodeDocument } from "./godmode";
import { normalizeNotes, notesSize, MAX_NOTES_CHARS, parseBlocks } from "./notes";
import { collection, normalizePetState, tierFor, TIERS } from "./pet";
import { normalizeTrophyState, trophyCounts } from "./trophies";
import { MAX_LEVEL, levelFromXp, normalizeXpState, xpForLevel } from "./xp";

/**
 * The seed exists to be looked at, which is exactly why it needs testing: a
 * screen filled with data that no real document could contain teaches you
 * nothing about the screen. Every check here is "would storage accept this?"
 * rather than "is it pretty?".
 */
const now = new Date(2026, 7, 12);
const doc = buildGodmodeDocument(now);

describe("the godmode document", () => {
  it("survives every normaliser unchanged", () => {
    expect(normalizeXpState(doc.xp)).toEqual(doc.xp);
    expect(normalizePetState(doc.pet)).toEqual(doc.pet);
    expect(normalizeNotes(doc.notes)).toEqual(doc.notes);
    // The trophy normaliser clamps `streak` to the loop length and filters the
    // id lists, so equality here is the real assertion: nothing was clamped.
    expect(normalizeTrophyState(doc.trophies)).toEqual(doc.trophies);
  });

  it("is deterministic, so two runs diff cleanly", () => {
    expect(buildGodmodeDocument(now)).toEqual(doc);
  });

  it("gives every id a godmode prefix, so a seed is always recognisable", () => {
    for (const list of [doc.classes, doc.tasks, doc.grades, doc.notes]) {
      for (const item of list) expect(item.id).toMatch(/^gm-/);
    }
  });

  it("has no duplicate ids anywhere", () => {
    const ids = [
      ...doc.classes.map((c) => c.id),
      ...doc.tasks.map((t) => t.id),
      ...doc.grades.map((g) => g.id),
      ...doc.notes.map((n) => n.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points every task, grade and note at a class that exists", () => {
    const classIds = new Set(doc.classes.map((c) => c.id));
    for (const t of doc.tasks) expect(classIds.has(t.classId), t.id).toBe(true);
    for (const g of doc.grades) expect(classIds.has(g.classId), g.id).toBe(true);
    for (const n of doc.notes) expect(classIds.has(n.classId), n.id).toBe(true);
  });
});

describe("what it puts on screen", () => {
  it("stands on the last rung with the whole collection banked", () => {
    expect(levelFromXp(doc.xp.xp)).toBe(MAX_LEVEL);
    expect(doc.xp.xp).toBe(xpForLevel(MAX_LEVEL));
    expect(tierFor(levelFromXp(doc.xp.xp)).id).toBe(doc.pet.bestTier);

    const c = collection(doc.pet.bestTier);
    expect(c.complete).toBe(true);
    expect(c.collected).toHaveLength(TIERS.length);
  });

  /** A hundred queued level-up overlays is not a screenshot of anything. */
  it("has already acknowledged every level it granted", () => {
    expect(doc.xp.seenLevel).toBe(levelFromXp(doc.xp.xp));
  });

  it("fills the trophy cabinet with all three metals", () => {
    const counts = trophyCounts(doc.trophies.trophies);
    expect(counts.bronze).toBeGreaterThan(5);
    expect(counts.gold).toBeGreaterThan(5);
    expect(counts.platinum).toBeGreaterThan(5);
    // Mid-run rather than at zero, so the streak read has something to say.
    expect(doc.trophies.streak).toBeGreaterThan(0);
  });

  it("leaves work both done and outstanding, including one genuine miss", () => {
    expect(doc.tasks.some((t) => t.done)).toBe(true);
    expect(doc.tasks.some((t) => !t.done)).toBe(true);
    const overdue = doc.tasks.filter(
      (t) => !t.done && new Date(t.due).getTime() < now.getTime(),
    );
    expect(overdue.length).toBeGreaterThanOrEqual(1);
  });

  it("writes a note for every class, using every block the parser knows", () => {
    for (const c of doc.classes) {
      expect(doc.notes.some((n) => n.classId === c.id), c.short).toBe(true);
    }
    const kinds = new Set(
      doc.notes.flatMap((n) => parseBlocks(n.body).map((b) => b.kind)),
    );
    for (const kind of ["h1", "h2", "h3", "p", "ul", "ol", "check", "quote", "code"]) {
      expect(kinds.has(kind as never), kind).toBe(true);
    }
  });

  /** The phone's reader can only make highlights, so it needs some to render. */
  it("seeds highlights, which is the one mark a phone can make", () => {
    expect(doc.notes.some((n) => n.body.includes("=="))).toBe(true);
  });

  it("stays inside the notes budget it shares with the sync ceiling", () => {
    expect(notesSize(doc.notes)).toBeLessThan(MAX_NOTES_CHARS);
  });

  it("leaves the credit ledger empty, so seeded items never pay XP", () => {
    expect(doc.xp.credited).toEqual([]);
  });
});
