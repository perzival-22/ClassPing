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
}

export interface TaskItem {
  id: string;
  title: string;
  classId: string;
  /** ISO date the task is due */
  due: string;
  reminder: boolean;
  done: boolean;
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
}

interface Store {
  classes: ClassItem[];
  tasks: TaskItem[];
  grades: GradeItem[];
  profile: Profile;
  /** false until persisted state has been loaded from localStorage */
  hydrated: boolean;
  addClass: (c: Omit<ClassItem, "id">) => void;
  updateClass: (id: string, updates: Partial<Omit<ClassItem, "id">>) => void;
  deleteClass: (id: string) => void;
  addTask: (t: Omit<TaskItem, "id">) => void;
  toggleTask: (id: string) => void;
  addGrade: (g: Omit<GradeItem, "id">) => void;
  deleteGrade: (id: string) => void;
  classById: (id: string) => ClassItem | undefined;
  setProfile: (p: Partial<Profile>) => void;
}

const uid = () => Math.random().toString(36).slice(2, 9);

const StoreContext = createContext<Store | null>(null);
const KEY = "classping.v1";
const NOTIFIED_KEY = "classping.notified.v1";

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
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        if (parsed.classes) setClasses(parsed.classes);
        if (parsed.tasks) setTasks(parsed.tasks);
        if (parsed.grades) setGrades(parsed.grades);
        // Merge over defaults so profiles saved before new fields existed
        // (e.g. accent) still get sensible values.
        if (parsed.profile)
          setProfileState({ ...DEFAULT_PROFILE, ...parsed.profile });
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
            setProfileState({ ...DEFAULT_PROFILE, ...server.data.profile });
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
          data: { classes, tasks, grades, profile },
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

  const deleteGrade = useCallback((id: string) => {
    setGrades((prev) => prev.filter((g) => g.id !== id));
    touch();
  }, []);

  const classById = useCallback(
    (id: string) => classes.find((c) => c.id === id),
    [classes],
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

      let fired: Record<string, true>;
      try {
        fired = JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? "{}");
      } catch {
        fired = {};
      }
      let changed = false;

      // Pre-class reminders (only when the alarm toggle is on).
      if (dow <= 4) {
        for (const c of classes) {
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

      // Task reminders — 24 hours before the due date.
      for (const t of tasks) {
        if (!t.reminder || t.done) continue;
        const untilDue = new Date(t.due).getTime() - now.getTime();
        const id = `task:${t.id}`;
        if (untilDue > 0 && untilDue <= 24 * 3600 * 1000 && !fired[id]) {
          showReminder("Due in 24 hours", `${t.title} — tap ✓ when it's done.`, id);
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
      classes, tasks, grades, profile, hydrated,
      addClass, updateClass, deleteClass,
      addTask, toggleTask, addGrade, deleteGrade, classById, setProfile,
    }),
    [classes, tasks, grades, profile, hydrated, addClass, updateClass, deleteClass, addTask, toggleTask, addGrade, deleteGrade, classById, setProfile],
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

export function fmtTime(mins: number): string {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

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
    setNow(new Date());
    const iv = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return now;
}
