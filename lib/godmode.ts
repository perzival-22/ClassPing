/**
 * Godmode — a whole simulated academic year, for looking at.
 *
 * Every reward in this app is slow on purpose. The trophy loop is seven
 * assignments, the pet ladder is a hundred levels and twenty-seven portraits,
 * and the top of it is priced at about thirty-six teaching weeks (lib/xp.ts).
 * That is the right shape for a student and a terrible one for anybody trying
 * to see whether Astral Galaxy actually looks good next to Crystal Gold — you
 * cannot review a year-long reward curve by living through it.
 *
 * So this builds the document that a diligent student would be holding at the
 * end of that year: five classes, a term of assignments, a full grade book,
 * a lecture typed up for every class, a cabinet of trophies and enough XP to
 * stand on the last rung of the ladder.
 *
 * ── What this is not ────────────────────────────────────────────────────────
 *
 * It is not a cheat, and it is deliberately impossible to reach by accident.
 * It is dev-only (see app/dev/godmode), it replaces the document rather than
 * adding to it, and everything it writes goes through the same normalisers
 * that storage and sync use — so a seeded document is a *valid* document, and
 * if the shape here ever drifts from the real one, the normalisers reject it
 * rather than quietly showing a screen no real user could ever produce.
 *
 * Everything here is pure. It builds a document and returns it; applying it is
 * somebody else's problem.
 */

import { emptyBossState, isoDate, type BossState } from "./boss";
import type { ClassItem, GradeItem, Profile, TaskItem } from "./store";
import { MAX_NOTE_CHARS, type NoteItem } from "./notes";
import { TOP_TIER, type PetState } from "./pet";
import { MAX_LEVEL, xpForLevel, type XpState } from "./xp";
import {
  MILESTONES,
  type Trophy,
  type TrophyState,
  type TrophyTier,
} from "./trophies";

/** Deterministic, so two runs produce the same year and diffs stay readable. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const CLASSES: Array<
  Pick<ClassItem, "name" | "short" | "color" | "days" | "start" | "end"> & {
    instructor: string;
    room: string;
    credits: number;
  }
> = [
  { name: "Organic Chemistry", short: "CHEM", color: "teal", days: [0, 2, 4], start: 540, end: 615, instructor: "Dr. Awuor", room: "Sci 204", credits: 4 },
  { name: "Linear Algebra", short: "MATH", color: "indigo", days: [0, 2], start: 630, end: 735, instructor: "Prof. Ndele", room: "Mat 110", credits: 3 },
  { name: "Modern History", short: "HIST", color: "amber", days: [1, 3], start: 780, end: 885, instructor: "Dr. Kimani", room: "Hum 8", credits: 3 },
  { name: "Cell Biology", short: "BIO", color: "coral", days: [1, 3], start: 600, end: 675, instructor: "Dr. Otieno", room: "Sci 118", credits: 4 },
  { name: "Statistics", short: "STAT", color: "pink", days: [4], start: 870, end: 975, instructor: "Prof. Wanjiru", room: "Mat 003", credits: 3 },
];

const TASK_TITLES = [
  "Problem set", "Lab report", "Reading response", "Midterm review",
  "Group presentation", "Essay draft", "Chapter exercises", "Case study",
  "Field notes", "Seminar prep", "Data analysis", "Peer review",
];

const GRADE_TITLES: Array<[string, GradeItem["kind"], number]> = [
  ["Quiz 1", "quiz", 10],
  ["Problem set 2", "assignment", 10],
  ["Midterm", "exam", 30],
  ["Lab practical", "project", 20],
  ["Quiz 3", "quiz", 10],
  ["Final paper", "project", 20],
];

/**
 * A lecture, in the note dialect.
 *
 * Written to exercise the renderer rather than to be read: every block kind the
 * parser knows — headings, both list kinds, a checklist, a quote, a fence — and
 * every inline marker including `==highlight==`, which is the one thing the
 * phone's reader can itself produce. A seeded note that only contained
 * paragraphs would make NoteReader look finished when it had never rendered a
 * list.
 */
function lecture(className: string, week: number, r: () => number): string {
  const topic = [
    "Foundations", "Second pass", "Worked examples", "Edge cases",
    "Proofs and counter-examples", "Applications", "Revision",
  ][week % 7];

  return [
    `# ${className} — week ${week}`,
    `## ${topic}`,
    "",
    `The core claim from today: **${topic.toLowerCase()} matter more than the notation**, and the notation is what the exam asks about anyway.`,
    "",
    "### What was actually covered",
    "- The setup, and why the obvious approach fails",
    "- ==The result to memorise for the midterm==",
    "- A worked example, start to finish",
    "- *Two* exceptions that were waved at and not explained",
    "",
    "1. State the problem in the standard form",
    "2. Check the preconditions hold — ==this is the step everyone skips==",
    "3. Apply the method",
    "4. Sanity-check the magnitude of the answer",
    "",
    "> Asked in the lecture: does this hold when the assumption is dropped?",
    "> Answer: no, and the counter-example is in the reading.",
    "",
    "### To do before next week",
    "- [x] Re-read the chapter opening",
    `- [x] Attempt questions 1–${3 + Math.floor(r() * 6)}`,
    "- [ ] Ask about the third exception in office hours",
    "- [ ] Rewrite these notes properly",
    "",
    "Reference implementation from the slides:",
    "",
    "```",
    "for step in method:",
    "    check(step.preconditions)",
    "    result = apply(step)",
    "```",
    "",
    `See also the handout on __${topic.toLowerCase()}__ and the \`worked-examples\` sheet.`,
  ].join("\n");
}

export interface GodmodeDocument {
  classes: ClassItem[];
  tasks: TaskItem[];
  grades: GradeItem[];
  notes: NoteItem[];
  trophies: TrophyState;
  xp: XpState;
  pet: PetState;
  boss: BossState;
  profile: Partial<Profile>;
  updatedAt: number;
}

/**
 * Build the document.
 *
 * `now` is injected so the year lands somewhere sensible relative to whenever
 * this is run — assignments in the recent past are done, the ones ahead are
 * not, and one is deliberately overdue so the screens that care about lateness
 * have something to show.
 */
export function buildGodmodeDocument(now: Date = new Date()): GodmodeDocument {
  const r = rng(20260812);
  const id = (prefix: string, n: number) => `gm-${prefix}-${n}`;
  const day = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return d;
  };

  const classes: ClassItem[] = CLASSES.map((c, i) => ({
    ...c,
    id: id("class", i),
    remindBefore: 15,
    alarm: true,
    term: "Fall 2026",
    goal: 88 + Math.floor(r() * 8),
  }));

  /* ── a term of assignments ──────────────────────────────
     Mostly done and on time, because that is what produced the trophies and
     the XP below. A handful are still open, and exactly one is overdue — the
     streak in lib/trophies.ts is only legible next to something that broke it. */
  const tasks: TaskItem[] = [];
  let t = 0;
  for (let week = -14; week <= 2; week++) {
    for (const c of classes) {
      if (r() < 0.35) continue;
      const due = day(week * 7 + Math.floor(r() * 5));
      const past = due.getTime() < now.getTime();
      tasks.push({
        id: id("task", t),
        title: `${TASK_TITLES[t % TASK_TITLES.length]} — ${c.short}`,
        classId: c.id,
        due: due.toISOString(),
        reminder: true,
        // Everything in the past is finished except the one deliberate miss.
        done: past && t !== 9,
        kind: r() < 0.15 ? "exam" : "assignment",
      });
      t++;
    }
  }

  const grades: GradeItem[] = [];
  let g = 0;
  for (const c of classes) {
    for (const [title, kind, weight] of GRADE_TITLES) {
      const max = kind === "exam" ? 100 : 50;
      // A strong-but-human spread: mostly 78–98%, nothing suspiciously perfect.
      const pct = 0.78 + r() * 0.2;
      grades.push({
        id: id("grade", g++),
        classId: c.id,
        title,
        score: Math.round(max * pct),
        max,
        weight,
        date: isoDate(day(-70 + Math.floor(r() * 60))),
        kind,
      });
    }
  }

  /* ── a lecture per class, per fortnight ─────────────────
     Enough that the notes list has to scroll and the class filter has to do
     something, and few enough to stay well inside the notes budget. */
  const notes: NoteItem[] = [];
  let n = 0;
  for (let week = 1; week <= 7; week++) {
    for (const c of classes) {
      const date = isoDate(day(-(8 - week) * 7 - Math.floor(r() * 3)));
      const body = lecture(c.name, week, r).slice(0, MAX_NOTE_CHARS);
      notes.push({
        id: id("note", n++),
        classId: c.id,
        date,
        title: n % 3 === 0 ? "" : `${c.short} — week ${week}`,
        body,
        updatedAt: day(-(8 - week) * 7).getTime(),
      });
    }
  }
  notes.sort((a, b) => b.date.localeCompare(a.date));

  /* ── the cabinet ────────────────────────────────────────
     Trophies are minted by completing assignments, so a full year of them is
     a run of loops: bronze at 3, gold at 5, platinum at 7, then the count
     restarts. Twelve loops is what ~85 on-time finishes actually buys. */
  const earned: Trophy[] = [];
  for (let loop = 0; loop < 12; loop++) {
    for (const m of MILESTONES) {
      earned.push({
        tier: m.tier as TrophyTier,
        at: day(-250 + loop * 20 + m.at).toISOString(),
      });
    }
  }
  const trophies: TrophyState = {
    // Mid-run, so the bar reads "4/5 to Gold" rather than sitting at zero.
    streak: 4,
    trophies: earned,
    awarded: ["bronze"],
    counted: tasks.filter((x) => x.done).map((x) => x.id),
    missed: [tasks[9]?.id].filter((x): x is string => !!x),
  };

  /* ── the top of the ladder ──────────────────────────────
     Exactly MAX_LEVEL, not more: the point is to see the last rung, and
     `seenLevel` is set with it so a hundred level-up overlays don't queue up
     the moment the app opens. */
  const xp: XpState = {
    xp: xpForLevel(MAX_LEVEL),
    seenLevel: MAX_LEVEL,
    credited: [],
    creditDay: "",
    creditSpent: 0,
  };

  const pet: PetState = { name: "Mochi", bestTier: TOP_TIER.id };

  return {
    classes,
    tasks,
    grades,
    notes,
    trophies,
    xp,
    pet,
    boss: { ...emptyBossState(), won: 9, lost: 2 },
    profile: {
      termName: "Fall 2026",
      termStart: isoDate(day(-112)),
      termEnd: isoDate(day(28)),
      finalsDate: isoDate(day(21)),
    },
    updatedAt: now.getTime(),
  };
}

/** The key lib/store.tsx persists under. Godmode replaces exactly this. */
export const GODMODE_STORAGE_KEY = "classping.v1";
