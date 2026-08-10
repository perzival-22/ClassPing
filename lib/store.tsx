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
}

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
  profile: Profile;
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
  typeof url === "string" && url.startsWith("data:image/") ? url : null;

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
  profile?: Profile;
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
  const [profile, setProfileState] = useState<Profile>(DEFAULT_PROFILE);
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
        JSON.stringify({ classes, tasks, grades, profile, updatedAt }),
      );
    } catch {
      /* storage full / unavailable */
    }
  }, [classes, tasks, grades, profile, updatedAt, hydrated]);

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
            profile,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          updatedAt,
        }),
      }).catch(() => {
        /* offline — next change retries */
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [classes, tasks, grades, profile, updatedAt, hydrated, isPro]);

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

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
    touch();
  }, []);

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
      classes, activeClasses, tasks, grades, profile, hydrated,
      addClass, importItems, updateClass, deleteClass, archiveTerm, unarchiveClass,
      addTask, updateTask, deleteTask, toggleTask,
      addGrade, updateGrade, deleteGrade,
      classById, taskById, gradeById, setProfile,
    }),
    [classes, activeClasses, tasks, grades, profile, hydrated, addClass, importItems, updateClass, deleteClass, archiveTerm, unarchiveClass, addTask, updateTask, deleteTask, toggleTask, addGrade, updateGrade, deleteGrade, classById, taskById, gradeById, setProfile],
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
