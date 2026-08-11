"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SubjectColor } from "./palette";
import type { AccentId } from "./accents";
import { registerServiceWorker, showReminder } from "./notifications";
import { fmtTime } from "./time";
import {
  completeTask,
  emptyTrophyState,
  missTask,
  normalizeTrophyState,
  pruneTrophyState,
  uncompleteTask,
  type Trophy,
  type TrophyState,
} from "./trophies";
import {
  XP_AWARDS,
  ackLevel,
  awardXp,
  emptyXpState,
  levelFromXp,
  normalizeXpState,
  type XpState,
} from "./xp";
import { emptyPetState, higherTier, normalizePetState, tierFor, type PetState } from "./pet";
import {
  abandonFight,
  ackResult,
  emptyBossState,
  normalizeBossState,
  settle,
  startFight,
  type BossState,
} from "./boss";
import {
  fitsBudget,
  mergeNotes,
  normalizeNotes,
  type NoteItem,
} from "./notes";
import { useIsPro } from "./useIsPro";

/** Days of the week the app plots (Mon–Fri). 0 = Mon … 4 = Fri */
export type DayIndex = 0 | 1 | 2 | 3 | 4;

export interface ClassItem {
  id: string;
  name: string;
  short: string;
  color: SubjectColor;
  /** meeting days as indexes (0=Mon) */
  days: DayIndex[];
  /** minutes from midnight, e.g. 8:30 -> 510 */
  start: number;
  end: number;
  /** minutes before class to remind (primary in-app + calendar alarm) */
  remindBefore: number;
  alarm: boolean;
  /** extra lead times (minutes) written as additional calendar alarms — Pro */
  reminders?: number[];
  /**
   * Credit hours, used to weight this class in the overall GPA. Undefined
   * counts as 1, which reproduces the unweighted average the app used before
   * credits existed.
   */
  credits?: number;
  /** where it meets, e.g. "Sci 204" — exported as the calendar LOCATION */
  room?: string;
  /** who teaches it */
  instructor?: string;
  /** anything else worth remembering; exported in the calendar DESCRIPTION */
  notes?: string;
  /**
   * Which term this class belongs to, e.g. "Fall 2025". Free text rather than
   * a Term entity: a student names their own terms, and this keeps the synced
   * document flat. Undefined means "current" — every class predating terms.
   */
  term?: string;
  /**
   * Archived classes drop out of Today and the week grid but keep their grades,
   * so last semester stops cluttering this one without erasing the record.
   */
  archived?: boolean;
  /**
   * The grade (in percent) the student is aiming to finish the class at — a
   * goal, not a measurement. Drives the projected GPA on the Grades screen.
   */
  goal?: number;
}

export interface TaskItem {
  id: string;
  title: string;
  classId: string;
  /** ISO date the task is due */
  due: string;
  reminder: boolean;
  done: boolean;
  /**
   * Exams are the highest-stakes thing a student tracks and the thing they
   * most fear missing, so they get their own treatment on Today and in the
   * calendar export. Undefined means "assignment" — every task predating this.
   */
  kind?: "assignment" | "exam";
  /**
   * Anything worth remembering about this piece of work — the brief, what to
   * bring, a page range. Shown when the task is tapped open on the Tasks list.
   */
  notes?: string;
}

/** What a graded item was. Undefined on everything logged before the field. */
export type GradeKind = "exam" | "quiz" | "assignment" | "project";

/** A graded event (exam, assignment, quiz) belonging to a class. */
export interface GradeItem {
  id: string;
  classId: string;
  title: string;
  /** points earned */
  score: number;
  /** points possible */
  max: number;
  /** relative weight within the class, in percent */
  weight: number;
  /** ISO date of the graded event */
  date: string;
  /**
   * Exam, quiz, assignment or project. Undefined on grades logged before the
   * field existed — the title was the only clue then, because the "Exam" and
   * "Quiz" buttons on the add form just typed those words into it.
   */
  kind?: GradeKind;
}

export interface Profile {
  username: string;
  avatarUrl: string | null;
  theme: "light" | "dark";
  /** app-wide accent theme; Pro except "classic" */
  accent: AccentId;
  /** ISO date of finals, drives the DaysToFinals countdown — Pro */
  finalsDate?: string | null;
  /**
   * Which letter-grade scale to apply. Undefined means the US A/A-/B+ default,
   * so nobody's GPA changes just because the option now exists.
   */
  gradeScale?: "standard" | "simple";
  /**
   * The current semester's span, ISO dates. Set in Settings → Term; shown as
   * a progress read there and printed on the grade report. Null means unset —
   * every profile predating the feature.
   */
  termStart?: string | null;
  termEnd?: string | null;
  /** What the current term is called, e.g. "Fall 2025". Titles the report. */
  termName?: string;
  /**
   * Retired. Held an equipped avatar-frame id back when levelling unlocked a
   * shelf of cosmetics; the avatar ring is now derived from the pet's tier and
   * nothing writes this. Kept on the type rather than deleted because it is
   * already in synced documents on real devices, and the persisted-shape
   * contract is to stop writing a field, never to drop one.
   */
  frame?: string;
}

interface Store {
  /** Every class ever added, archived ones included. */
  classes: ClassItem[];
  /**
   * The classes that count as "now" — what Today, the week grid and the
   * calendar export should show. Archived terms are excluded.
   */
  activeClasses: ClassItem[];
  tasks: TaskItem[];
  grades: GradeItem[];
  /** Lecture notes, newest day first. See lib/notes.ts for the dialect. */
  notes: NoteItem[];
  profile: Profile;
  /** Assignment streak and every trophy earned this semester. */
  trophies: TrophyState;
  /**
   * A trophy earned in the last moment or two, for the celebration overlay.
   * The screen that shows it calls `clearTrophy` when the user dismisses it.
   */
  recentTrophy: Trophy | null;
  clearRecentTrophy: () => void;
  /** Lifetime XP and the level it buys — the slow counterpart to the streak. */
  xp: XpState;
  /**
   * A level crossed but not yet celebrated on screen, or null. Derived from
   * `xp.seenLevel` rather than kept as its own event, so it survives a reload
   * mid-celebration and can't fire twice.
   */
  pendingLevel: number | null;
  /** Mark the level-up as seen. */
  ackLevelUp: () => void;
  /**
   * Credit XP for something the store doesn't own — a finished focus block,
   * a boss fight won. Task and trophy awards happen inside `toggleTask`, where
   * the anti-farming guard lives.
   */
  addXp: (amount: number) => void;
  /**
   * The companion. The name the user chose, and the highest tier ever reached —
   * a badge that survives `clearData`, so tidying up after a semester can't
   * demote a rank that took a year to earn. The *live* tier is derived from the
   * XP level and never stored (lib/pet.ts).
   */
  pet: PetState;
  setPet: (updates: Partial<PetState>) => void;
  /**
   * The week-long commitment, if one is running, plus lifetime win/loss counts
   * and the result of the fight that just ended.
   */
  boss: BossState;
  /** Commit to a set of open task ids for the current week. */
  startBoss: (taskIds: string[]) => void;
  /** Walk away from the running fight. Records no loss — see lib/boss.ts. */
  abandonBoss: () => void;
  /** The result overlay has been shown. */
  ackBossResult: () => void;
  /** false until persisted state has been loaded from localStorage */
  hydrated: boolean;
  addClass: (c: Omit<ClassItem, "id">) => void;
  /**
   * Add many classes and tasks at once (calendar import). Each gets a fresh
   * id; imported tasks with no class are attached to the first imported class
   * so they still show a colour and appear in the list.
   */
  importItems: (
    classes: Array<Omit<ClassItem, "id">>,
    tasks: Array<Omit<TaskItem, "id">>,
  ) => void;
  /** Label every current class with `term` and archive them in one action. */
  archiveTerm: (term: string) => void;
  /** Bring a single archived class back into the current term. */
  unarchiveClass: (id: string) => void;
  updateClass: (id: string, updates: Partial<Omit<ClassItem, "id">>) => void;
  deleteClass: (id: string) => void;
  addTask: (t: Omit<TaskItem, "id">) => void;
  updateTask: (id: string, updates: Partial<Omit<TaskItem, "id">>) => void;
  deleteTask: (id: string) => void;
  toggleTask: (id: string) => void;
  addGrade: (g: Omit<GradeItem, "id">) => void;
  updateGrade: (id: string, updates: Partial<Omit<GradeItem, "id">>) => void;
  deleteGrade: (id: string) => void;
  /** This class's notes, newest first. */
  notesForClass: (classId: string) => NoteItem[];
  /** Start a note. Returns its id so the caller can open it immediately. */
  addNote: (classId: string, date: string) => string;
  /**
   * Save an edit.
   *
   * Returns false when the write would push notes past their share of the
   * synced document (lib/notes.ts) — the caller must tell the user rather than
   * drop the keystroke silently, because the alternative is a 413 from
   * `PUT /api/sync` that stops the account syncing with no visible cause.
   */
  updateNote: (
    id: string,
    updates: Partial<Pick<NoteItem, "title" | "body" | "date">>,
  ) => boolean;
  deleteNote: (id: string) => void;
  noteById: (id: string) => NoteItem | undefined;
  /**
   * Empty the whole document — every class, task, grade and trophy, plus the
   * semester it was all attached to — while leaving the account and the user's
   * preferences alone. Irreversible; the caller is responsible for confirming.
   */
  clearData: () => Promise<void>;
  classById: (id: string) => ClassItem | undefined;
  taskById: (id: string) => TaskItem | undefined;
  gradeById: (id: string) => GradeItem | undefined;
  setProfile: (p: Partial<Profile>) => void;
}

/**
 * Item IDs are UUIDs. They have to be globally unique, not just unique on this
 * device: two devices can create classes offline and last-write-wins sync will
 * merge whichever document is newer, and the IDs also become stable calendar
 * UIDs (`classping-class-<id>@classping`). The old 7-char `Math.random()` slug
 * had a birthday collision after only a few thousand items and wasn't safe for
 * either job. `randomUUID` needs a secure context (https/localhost); the
 * fallback covers the rest.
 */
const uid = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Last resort (ancient/insecure context): not a real UUID, but still wide
  // enough that a collision is not a practical concern.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
};

const StoreContext = createContext<Store | null>(null);
const KEY = "classping.v1";
const NOTIFIED_KEY = "classping.notified.v1";

/**
 * Avatars are stored as `data:` URIs so they survive a reload and a sync.
 * Documents written before that fix hold a `blob:` object URL, which is already
 * dead by the time we read it back — drop it so the UI falls back to initials
 * instead of rendering a broken image.
 */
const cleanAvatar = (url: string | null | undefined): string | null =>
  typeof url === "string" &&
  (url.startsWith("data:image/") || url.startsWith("https://"))
    ? url
    : null;

const DEFAULT_PROFILE: Profile = {
  username: "student",
  avatarUrl: null,
  theme: "light",
  accent: "classic",
  finalsDate: null,
};

/** Shape of the synced document (also what localStorage holds). */
interface PersistedState {
  classes: ClassItem[];
  tasks: TaskItem[];
  grades?: GradeItem[];
  /** Lecture notes. Absent on documents written before the editor existed. */
  notes?: NoteItem[];
  profile?: Profile;
  /** Streak + trophy record. Absent on documents written before gamification. */
  trophies?: TrophyState;
  /** Lifetime XP. Two integers — deliberately not an event log; see lib/xp.ts. */
  xp?: XpState;
  /** Pet name and hat. Absent on documents written before the companion. */
  pet?: PetState;
  /** Boss fight in progress and lifetime counts. Absent before boss fights. */
  boss?: BossState;
  /** ms timestamp of the last local mutation — drives last-write-wins sync */
  updatedAt?: number;
  /**
   * IANA timezone of the device that last pushed. Class times are stored as
   * minutes-from-midnight with no zone, so the server-side crons (post-class
   * push, end-of-day email) need this to read the user's wall clock.
   */
  tz?: string;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [grades, setGrades] = useState<GradeItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [profile, setProfileState] = useState<Profile>(DEFAULT_PROFILE);
  const [trophies, setTrophies] = useState<TrophyState>(emptyTrophyState);
  const [recentTrophy, setRecentTrophy] = useState<Trophy | null>(null);
  const [xp, setXp] = useState<XpState>(emptyXpState);
  const [pet, setPetState] = useState<PetState>(emptyPetState);
  const [boss, setBoss] = useState<BossState>(emptyBossState);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const { isPro } = useIsPro();

  // Load persisted state once on mount.
  //
  // The setState calls below are flagged by react-hooks/set-state-in-effect,
  // and disabled deliberately: localStorage does not exist during SSR, so
  // hydration genuinely has to happen after mount. This is the "subscribe to
  // an external system" case the rule permits — it just can't tell, because
  // the read is synchronous.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed.classes) setClasses(parsed.classes);
        if (parsed.tasks) setTasks(parsed.tasks);
        if (parsed.grades) setGrades(parsed.grades);
        if (parsed.notes) setNotes(normalizeNotes(parsed.notes));
        if (parsed.trophies) setTrophies(normalizeTrophyState(parsed.trophies));
        if (parsed.xp) setXp(normalizeXpState(parsed.xp));
        if (parsed.pet) setPetState(normalizePetState(parsed.pet));
        if (parsed.boss) setBoss(normalizeBossState(parsed.boss));
        // Merge over defaults so profiles saved before new fields existed
        // (e.g. accent) still get sensible values.
        if (parsed.profile)
          setProfileState({
            ...DEFAULT_PROFILE,
            ...parsed.profile,
            avatarUrl: cleanAvatar(parsed.profile.avatarUrl),
          });
        if (parsed.updatedAt) setUpdatedAt(parsed.updatedAt);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  // Persist on change (after first load).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          classes,
          tasks,
          grades,
          notes,
          profile,
          trophies,
          xp,
          pet,
          boss,
          updatedAt,
        }),
      );
    } catch {
      /* storage full / unavailable */
    }
  }, [classes, tasks, grades, notes, profile, trophies, xp, pet, boss, updatedAt, hydrated]);

  /* ── cloud sync (Pro) ───────────────────────────────────
     Whole-document, last-write-wins: pull once after hydration, apply the
     newer side, then push local changes debounced. localStorage stays the
     offline cache, so the app keeps working without a connection. */
  const pulledRef = useRef(false);
  const skipPushRef = useRef(false);

  useEffect(() => {
    if (!hydrated || !isPro || pulledRef.current) return;
    pulledRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/sync");
        if (!res.ok) return;
        const server = (await res.json()) as {
          data: PersistedState | null;
          updatedAt: number;
        };
        if (server.data && server.updatedAt > updatedAt) {
          skipPushRef.current = true;
          setClasses(server.data.classes ?? []);
          setTasks(server.data.tasks ?? []);
          setGrades(server.data.grades ?? []);
          // Notes merge instead of being replaced. Everything else in this
          // document is small and edited in one place at a time, so taking the
          // newer side wholesale is fine; a lecture is neither. The laptop is
          // where notes get typed and the phone is what gets carried, so
          // "newest document wins" would let a phone that has never seen
          // today's lecture delete it. See mergeNotes in lib/notes.ts.
          const incoming = normalizeNotes(server.data.notes);
          setNotes((local) => mergeNotes(local, incoming));
          setTrophies(normalizeTrophyState(server.data.trophies));
          setXp(normalizeXpState(server.data.xp));
          setPetState(normalizePetState(server.data.pet));
          setBoss(normalizeBossState(server.data.boss));
          if (server.data.profile)
            setProfileState({
              ...DEFAULT_PROFILE,
              ...server.data.profile,
              avatarUrl: cleanAvatar(server.data.profile.avatarUrl),
            });
          setUpdatedAt(server.updatedAt);
        }
        // If local is newer (or the server is empty — first sync migrates the
        // device's existing data up), the push effect below sends it.
      } catch {
        /* offline — localStorage keeps working */
      }
    })();
  }, [hydrated, isPro, updatedAt]);

  useEffect(() => {
    if (!hydrated || !isPro || !pulledRef.current || updatedAt === 0) return;
    if (skipPushRef.current) {
      skipPushRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      fetch("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            classes,
            tasks,
            grades,
            notes,
            profile,
            trophies,
            xp,
            pet,
            boss,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          updatedAt,
        }),
      }).catch(() => {
        /* offline — next change retries */
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [classes, tasks, grades, notes, profile, trophies, xp, pet, boss, updatedAt, hydrated, isPro]);

  const touch = () => setUpdatedAt(Date.now());

  const addClass = useCallback((c: Omit<ClassItem, "id">) => {
    setClasses((prev) => [...prev, { ...c, id: uid() }]);
    touch();
  }, []);

  const updateClass = useCallback(
    (id: string, updates: Partial<Omit<ClassItem, "id">>) => {
      setClasses((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      );
      touch();
    },
    [],
  );

  const importItems = useCallback(
    (
      newClasses: Array<Omit<ClassItem, "id">>,
      newTasks: Array<Omit<TaskItem, "id">>,
    ) => {
      const withIds = newClasses.map((c) => ({ ...c, id: uid() }));
      // An imported assignment usually names no class (LMS feeds keep them in
      // separate calendars). Fall back to the first imported class so the task
      // still has a colour and a home rather than a dangling classId.
      const fallbackClassId = withIds[0]?.id ?? "";
      setClasses((prev) => [...prev, ...withIds]);
      setTasks((prev) => [
        ...prev,
        ...newTasks.map((t) => ({
          ...t,
          id: uid(),
          classId: t.classId || fallbackClassId,
        })),
      ]);
      touch();
    },
    [],
  );

  const archiveTerm = useCallback((term: string) => {
    const label = term.trim();
    setClasses((prev) =>
      prev.map((c) =>
        c.archived ? c : { ...c, archived: true, term: label || c.term },
      ),
    );
    touch();
  }, []);

  const unarchiveClass = useCallback((id: string) => {
    setClasses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, archived: false } : c)),
    );
    touch();
  }, []);

  const deleteClass = useCallback((id: string) => {
    setClasses((prev) => prev.filter((c) => c.id !== id));
    setTasks((prev) => prev.filter((t) => t.classId !== id));
    setGrades((prev) => prev.filter((g) => g.classId !== id));
    // Notes go with the class. They have nowhere else to live — a note is
    // filed under a class and a day, and an orphan would be unreachable from
    // every screen while still spending the document's size budget.
    setNotes((prev) => prev.filter((n) => n.classId !== id));
    touch();
  }, []);

  const addTask = useCallback((t: Omit<TaskItem, "id">) => {
    setTasks((prev) => [...prev, { ...t, id: uid() }]);
    touch();
  }, []);

  const updateTask = useCallback(
    (id: string, updates: Partial<Omit<TaskItem, "id">>) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      );
      touch();
    },
    [],
  );

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    touch();
  }, []);

  /* ── notes ───────────────────────────────────────────────
     Each note carries its own `updatedAt` so a sync pull can merge them one at
     a time; the document-level `touch()` still runs, because the push is what
     actually sends them. */

  const notesForClass = useCallback(
    (classId: string) =>
      notes
        .filter((n) => n.classId === classId)
        .sort(
          (a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt,
        ),
    [notes],
  );

  const addNote = useCallback((classId: string, date: string) => {
    const id = uid();
    setNotes((prev) => [
      { id, classId, date, title: "", body: "", updatedAt: Date.now() },
      ...prev,
    ]);
    touch();
    return id;
  }, []);

  const updateNote = useCallback(
    (
      id: string,
      updates: Partial<Pick<NoteItem, "title" | "body" | "date">>,
    ) => {
      const current = notes.find((n) => n.id === id);
      if (!current) return false;
      if (
        updates.body !== undefined &&
        !fitsBudget(notes, id, updates.body.length)
      ) {
        return false;
      }
      // A save that changes nothing writes nothing. The editor flushes on
      // blur, on tab-hide and on unmount as well as on a debounce, so the same
      // body arrives here repeatedly; without this, each one would hand back a
      // fresh array and re-arm every effect downstream of `notes`.
      const unchanged = (
        Object.keys(updates) as Array<keyof typeof updates>
      ).every((k) => updates[k] === current[k]);
      if (unchanged) return true;

      setNotes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n,
        ),
      );
      touch();
      return true;
    },
    [notes],
  );

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    touch();
  }, []);

  const noteById = useCallback(
    (id: string) => notes.find((n) => n.id === id),
    [notes],
  );

  /**
   * Tick an assignment off — and move the streak with it.
   *
   * "On time" is measured against the due date at the moment of the tick, so
   * finishing something a week late breaks the run exactly as ignoring it
   * would. A task with an unreadable due date is given the benefit of the
   * doubt rather than punished for bad data.
   */
  const toggleTask = useCallback(
    (id: string) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      const now = new Date();
      const nextDone = !task.done;

      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: nextDone } : t)),
      );

      if (nextDone) {
        const due = new Date(task.due).getTime();
        const onTime = !Number.isFinite(due) || now.getTime() <= due;
        // Whether the trophy module has already resolved this task decides
        // whether XP is owed: without the check, ticking one assignment off and
        // on repeatedly would mint XP forever. `completeTask` guards its own
        // state the same way, so the two stay in step.
        const firstTime = !trophies.counted.includes(id);
        const { state, earned } = completeTask(trophies, id, onTime, now);
        setTrophies(state);
        // The highest tier crossed is the one worth celebrating — crossing two
        // at once is impossible with these thresholds, but the last is still
        // the right one to show.
        if (earned.length > 0) setRecentTrophy(earned[earned.length - 1]);

        if (firstTime) {
          const trophyBonus = earned.reduce(
            (sum, t) => sum + XP_AWARDS.trophy[t.tier],
            0,
          );
          const amount =
            (onTime ? XP_AWARDS.taskOnTime : XP_AWARDS.taskLate) + trophyBonus;
          setXp((prev) => awardXp(prev, amount).state);
        }
      } else {
        setTrophies(uncompleteTask(trophies, id));
        // XP deliberately stays put. Un-ticking is how a mis-tap is corrected
        // and how a student reopens work they thought was finished; clawing
        // the award back would make both feel like a penalty, and the
        // `counted` guard above already stops it being re-earned.
      }
      touch();
    },
    [tasks, trophies],
  );

  const clearRecentTrophy = useCallback(() => setRecentTrophy(null), []);

  const addXp = useCallback((amount: number) => {
    setXp((prev) => {
      const { state } = awardXp(prev, amount);
      return state === prev ? prev : state;
    });
    touch();
  }, []);

  const ackLevelUp = useCallback(() => setXp((prev) => ackLevel(prev)), []);

  /**
   * A level reached but not yet shown. Derived rather than stored as an event:
   * a "you levelled up" flag written at award time would be lost if the tab
   * closed before the overlay appeared, and could fire twice if it didn't.
   */
  const pendingLevel = useMemo(() => {
    const level = levelFromXp(xp.xp);
    return level > xp.seenLevel ? level : null;
  }, [xp]);

  /**
   * Start over without losing the account.
   *
   * Everything the user *made* goes; everything about who they are stays —
   * username, avatar, theme, accent and grading scale all survive, because
   * "clear my data" means an empty planner, not a factory reset of the app's
   * appearance. The semester dates go with it: they describe the term being
   * cleared, and leaving them behind would bound an empty timetable to a
   * window that no longer means anything.
   *
   * The cloud copy is pushed here and now rather than left to the debounced
   * sync effect. That effect waits 1.5s for further edits, and a user who
   * clears their data and immediately closes the tab would leave the old
   * document sitting on the server to be pulled straight back down on their
   * next visit — everything restored, which is the one outcome this action
   * must never produce. The debounced push still fires afterwards; it carries
   * the same `updatedAt`, the server treats it as idempotent, and it covers
   * the case where the immediate attempt failed.
   */
  const clearData = useCallback(async () => {
    const clearedProfile: Profile = {
      ...profile,
      termStart: null,
      termEnd: null,
      termName: undefined,
      finalsDate: null,
    };
    const now = Date.now();

    setClasses([]);
    setTasks([]);
    setGrades([]);
    setNotes([]);
    setTrophies(emptyTrophyState());
    setRecentTrophy(null);
    // XP goes with the trophies, for the same reason: both are a record of
    // work on the planner being emptied, and keeping a level that was earned
    // by assignments which no longer exist would leave the profile describing
    // a term the user just asked to forget. Cosmetics unlocked by that level
    // are lost with it — which is why the confirmation this action requires
    // says "irreversible" and means it.
    setXp(emptyXpState());
    setBoss(emptyBossState());
    setProfileState(clearedProfile);
    setUpdatedAt(now);

    // The reminder-dedupe map is keyed by class and task id, so every entry in
    // it now points at something that no longer exists.
    try {
      localStorage.removeItem(NOTIFIED_KEY);
    } catch {
      /* private mode — the map prunes itself on the next tick anyway */
    }

    if (!isPro) return;
    try {
      await fetch("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            classes: [],
            tasks: [],
            grades: [],
            trophies: emptyTrophyState(),
            xp: emptyXpState(),
            boss: emptyBossState(),
            // Carried through deliberately. Local state keeps the pet, but this
            // body replaces the server document wholesale — omitting it wrote a
            // pet-less document and destroyed `bestTier`, which is the one
            // thing clearing a semester must never take away. The debounced
            // push would restore it a second later, but this immediate PUT
            // exists precisely for the user who clears and closes the tab.
            pet,
            profile: clearedProfile,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          updatedAt: now,
        }),
      });
    } catch {
      /* offline — the debounced push retries, and localStorage is already empty */
    }
    // `pet` is a real dependency, not a formality: the body above carries it
    // through so the earned-tier badge survives, and a stale closure here would
    // push a document holding whatever tier was current when this callback was
    // last built — silently demoting anyone promoted since.
  }, [isPro, profile, pet]);

  const addGrade = useCallback((g: Omit<GradeItem, "id">) => {
    setGrades((prev) => [...prev, { ...g, id: uid() }]);
    touch();
  }, []);

  const updateGrade = useCallback(
    (id: string, updates: Partial<Omit<GradeItem, "id">>) => {
      setGrades((prev) =>
        prev.map((g) => (g.id === id ? { ...g, ...updates } : g)),
      );
      touch();
    },
    [],
  );

  const deleteGrade = useCallback((id: string) => {
    setGrades((prev) => prev.filter((g) => g.id !== id));
    touch();
  }, []);

  // Archived classes stay in `classes` so grades and history survive; every
  // "what's happening now" surface reads this instead.
  const activeClasses = useMemo(
    () => classes.filter((c) => !c.archived),
    [classes],
  );

  const classById = useCallback(
    (id: string) => classes.find((c) => c.id === id),
    [classes],
  );

  const taskById = useCallback(
    (id: string) => tasks.find((t) => t.id === id),
    [tasks],
  );

  const gradeById = useCallback(
    (id: string) => grades.find((g) => g.id === id),
    [grades],
  );

  const setProfile = useCallback((p: Partial<Profile>) => {
    setProfileState((prev) => ({ ...prev, ...p }));
    touch();
  }, []);

  /** Normalised on the way in as well as on the way out. */
  const setPet = useCallback((updates: Partial<PetState>) => {
    setPetState((prev) => normalizePetState({ ...prev, ...updates }));
    touch();
  }, []);

  const startBoss = useCallback((taskIds: string[]) => {
    setBoss((prev) => startFight(prev, taskIds));
    touch();
  }, []);

  const abandonBoss = useCallback(() => {
    setBoss((prev) => abandonFight(prev));
    touch();
  }, []);

  const ackBossResult = useCallback(() => {
    setBoss((prev) => ackResult(prev));
    touch();
  }, []);

  // Ratchet bestTier when level increases
  useEffect(() => {
    if (!hydrated) return;
    const currentTier = tierFor(levelFromXp(xp.xp)).id;
    const best = higherTier(pet.bestTier, currentTier);
    if (best !== pet.bestTier) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPetState((prev) => ({ ...prev, bestTier: best }));
      touch();
    }
  }, [xp.xp, pet.bestTier, hydrated]);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  // Reminder loop: every 30s, fire any class/task notifications whose time has
  // come. Fired IDs are remembered in localStorage so each reminder shows once.
  useEffect(() => {
    if (!hydrated) return;

    const check = () => {
      const now = new Date();
      const dow = (now.getDay() + 6) % 7; // 0 = Mon … 6 = Sun
      const mins = now.getHours() * 60 + now.getMinutes();
      const dayKey = now.toISOString().slice(0, 10);

      let stored: Record<string, true>;
      try {
        stored = JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? "{}");
      } catch {
        stored = {};
      }

      // Prune before we add: class keys are per-day (`class:<id>:<date>`) and
      // are dead weight once that day has passed, and task keys are dead once
      // the task is gone. Without this the map grows for a whole semester and
      // slowly bloats localStorage.
      const liveTaskIds = new Set(tasks.map((t) => t.id));
      const fired: Record<string, true> = {};
      let changed = false;
      for (const key of Object.keys(stored)) {
        // Task keys are per-day too (`task:<id>:<date>`) so the daily nag can
        // re-fire tomorrow; ids never contain ":", so lastIndexOf splits safely.
        // Old-format `task:<id>` keys fail the date check and age out here.
        const keep = key.startsWith("class:")
          ? key.endsWith(`:${dayKey}`)
          : key.startsWith("task:")
            ? key.endsWith(`:${dayKey}`) &&
              liveTaskIds.has(key.slice("task:".length, key.lastIndexOf(":")))
            : false;
        if (keep) fired[key] = true;
        else changed = true;
      }

      // Pre-class reminders (only when the alarm toggle is on).
      if (dow <= 4) {
        for (const c of classes) {
          if (c.archived) continue;
          if (!c.alarm || !c.days.includes(dow as DayIndex)) continue;
          const id = `class:${c.id}:${dayKey}`;
          if (mins >= c.start - c.remindBefore && mins < c.start && !fired[id]) {
            showReminder(
              `${c.name} starts at ${fmtTime(c.start)}`,
              `That's in ${c.start - mins} minute${c.start - mins === 1 ? "" : "s"}.`,
              id,
            );
            fired[id] = true;
            changed = true;
          }
        }
      }

      // Task reminders — the daily nag the toggle promises ("nudge me until
      // it's done"): from 24h before the due date until the task is checked
      // off, once per day. The date in the dedupe key is what makes an open
      // task re-fire tomorrow instead of going silent after one ping.
      for (const t of tasks) {
        if (!t.reminder || t.done) continue;
        const untilDue = new Date(t.due).getTime() - now.getTime();
        if (untilDue > 24 * 3600 * 1000) continue;
        const id = `task:${t.id}:${dayKey}`;
        if (!fired[id]) {
          showReminder(
            untilDue <= 0 ? "Overdue" : "Due in 24 hours",
            `${t.title} — tap ✓ when it's done.`,
            id,
          );
          fired[id] = true;
          changed = true;
        }
      }

      if (changed) {
        try {
          localStorage.setItem(NOTIFIED_KEY, JSON.stringify(fired));
        } catch {
          /* storage full / unavailable */
        }
      }
    };

    check();
    const iv = setInterval(check, 30_000);
    return () => clearInterval(iv);
  }, [classes, tasks, hydrated]);

  /**
   * Missed-assignment sweep.
   *
   * A streak can be broken by something the user *doesn't* do, so nothing but
   * the passage of time will report it — hence a poll rather than an event.
   * Every minute, any open task whose deadline has passed breaks the run once
   * (`missTask` is idempotent), and bookkeeping for deleted tasks is dropped.
   *
   * It converges: once every overdue task is recorded the computed state is
   * reference-equal to the current one and nothing is written.
   */
  useEffect(() => {
    if (!hydrated) return;

    const sweep = () => {
      const now = Date.now();
      let next = pruneTrophyState(trophies, new Set(tasks.map((t) => t.id)));
      for (const t of tasks) {
        if (t.done) continue;
        const due = new Date(t.due).getTime();
        if (!Number.isFinite(due) || due >= now) continue;
        next = missTask(next, t.id);
      }
      if (next === trophies) return;
      setTrophies(next);
      touch();
    };

    sweep();
    const iv = setInterval(sweep, 60_000);
    return () => clearInterval(iv);
  }, [tasks, trophies, hydrated]);

  /**
   * Boss-fight sweep.
   *
   * A poll for the same reason the missed-assignment sweep above is one: two of
   * the three ways a fight ends — the week running out, and the last committed
   * task being deleted — are not things the user does to the fight, so nothing
   * but the passage of time will report them. `settle` returns the same
   * reference when there's nothing to do, which is what makes this converge
   * instead of writing on every tick.
   *
   * The win bonus is paid here rather than inside `settle` so that module stays
   * pure and knows nothing about XP.
   */
  useEffect(() => {
    if (!hydrated) return;

    const sweep = () => {
      const next = settle(boss, tasks);
      if (next === boss) return;
      setBoss(next);
      if (next.won > boss.won) {
        setXp((prev) => awardXp(prev, XP_AWARDS.bossWin).state);
      }
      touch();
    };

    sweep();
    const iv = setInterval(sweep, 60_000);
    return () => clearInterval(iv);
  }, [boss, tasks, hydrated]);

  // Sync dark/light class and accent theme to <html> whenever they change.
  useEffect(() => {
    if (profile.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    document.documentElement.dataset.accent = profile.accent ?? "classic";
  }, [profile.theme, profile.accent]);

  const value = useMemo<Store>(
    () => ({
      classes, activeClasses, tasks, grades, notes, profile, hydrated,
      trophies, recentTrophy, clearRecentTrophy,
      xp, pendingLevel, ackLevelUp, addXp, pet, setPet,
      boss, startBoss, abandonBoss, ackBossResult,
      addClass, importItems, updateClass, deleteClass, archiveTerm, unarchiveClass,
      addTask, updateTask, deleteTask, toggleTask,
      addGrade, updateGrade, deleteGrade,
      notesForClass, addNote, updateNote, deleteNote, noteById,
      clearData, classById, taskById, gradeById, setProfile,
    }),
    [classes, activeClasses, tasks, grades, notes, profile, hydrated, trophies, recentTrophy, clearRecentTrophy, xp, pendingLevel, ackLevelUp, addXp, pet, setPet, boss, startBoss, abandonBoss, ackBossResult, addClass, importItems, updateClass, deleteClass, archiveTerm, unarchiveClass, addTask, updateTask, deleteTask, toggleTask, addGrade, updateGrade, deleteGrade, notesForClass, addNote, updateNote, deleteNote, noteById, clearData, classById, taskById, gradeById, setProfile],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

/* ── time helpers ───────────────────────────────────────── */

/** Re-exported so existing `import { fmtTime } from "@/lib/store"` callers keep
 *  working; the definition lives in lib/time.ts, which the server shares. */
export { fmtTime } from "./time";

export function dueLabel(iso: string): { text: string; urgent: boolean } {
  const due = new Date(iso);
  const day0 = new Date();
  day0.setHours(0, 0, 0, 0);
  const dd = new Date(due);
  dd.setHours(0, 0, 0, 0);
  const diff = Math.round((dd.getTime() - day0.getTime()) / 86400000);
  if (diff < 0) return { text: "Overdue", urgent: true };
  if (diff === 0) return { text: "Due today", urgent: true };
  if (diff === 1) return { text: "Due tomorrow", urgent: true };
  if (diff < 7) return { text: `In ${diff} days`, urgent: false };
  if (diff === 7) return { text: "In 1 week", urgent: false };
  return { text: `In ${Math.round(diff / 7)} weeks`, urgent: false };
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/* ── real-time week helpers ─────────────────────────────── */

/**
 * The Mon–Fri school week the app should display. On weekends we roll forward
 * to next week (the current school week is over) and `todayCol` is null.
 */
export function weekInfo(now: Date): { dates: Date[]; todayCol: DayIndex | null } {
  const dow = (now.getDay() + 6) % 7; // 0 = Mon … 6 = Sun
  const todayCol = dow <= 4 ? (dow as DayIndex) : null;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - dow + (dow > 4 ? 7 : 0));
  const dates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  return { dates, todayCol };
}

/**
 * The class that just finished, for the post-class prompt: the one meeting
 * today whose end time falls within the last `windowMins` minutes. If two
 * ended in that window (back-to-back classes), the most recent one wins.
 * Returns null outside a window — the caller should show nothing to prompt about.
 */
export function justEndedClass(
  classes: ClassItem[],
  now: Date,
  windowMins = 30,
): ClassItem | null {
  const dow = (now.getDay() + 6) % 7; // 0 = Mon … 6 = Sun
  if (dow > 4) return null; // weekend — no classes plotted
  const mins = now.getHours() * 60 + now.getMinutes();

  return (
    classes
      .filter(
        (c) =>
          c.days.includes(dow as DayIndex) &&
          c.end <= mins &&
          mins - c.end <= windowMins,
      )
      .sort((a, b) => b.end - a.end)[0] ?? null
  );
}

/** "Jul 6" */
export function fmtMD(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Ticking clock. Returns null on the server-rendered first paint (so hydration
 * stays consistent), then the live time, refreshed every `intervalMs`.
 */
export function useNow(intervalMs = 30_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // The null-then-set is the point: the server and the first client paint
    // must agree, and they can't if the initial render reads a clock.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const iv = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return now;
}
