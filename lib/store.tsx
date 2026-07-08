"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SubjectColor } from "./palette";

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
  /** minutes before class to remind */
  remindBefore: number;
  alarm: boolean;
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

export interface Profile {
  username: string;
  avatarUrl: string | null;
}

interface Store {
  classes: ClassItem[];
  tasks: TaskItem[];
  profile: Profile;
  addClass: (c: Omit<ClassItem, "id">) => void;
  addTask: (t: Omit<TaskItem, "id">) => void;
  toggleTask: (id: string) => void;
  classById: (id: string) => ClassItem | undefined;
  setProfile: (p: Partial<Profile>) => void;
}

const uid = () => Math.random().toString(36).slice(2, 9);

export const TODAY = new Date(2026, 6, 6); // months are 0-indexed


const StoreContext = createContext<Store | null>(null);
const KEY = "classping.v1";

const DEFAULT_PROFILE: Profile = { username: "student", avatarUrl: null };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [profile, setProfileState] = useState<Profile>(DEFAULT_PROFILE);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted state once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          classes: ClassItem[];
          tasks: TaskItem[];
          profile?: Profile;
        };
        if (parsed.classes) setClasses(parsed.classes);
        if (parsed.tasks) setTasks(parsed.tasks);
        if (parsed.profile) setProfileState(parsed.profile);
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
      localStorage.setItem(KEY, JSON.stringify({ classes, tasks, profile }));
    } catch {
      /* storage full / unavailable */
    }
  }, [classes, tasks, profile, hydrated]);

  const addClass = useCallback((c: Omit<ClassItem, "id">) => {
    setClasses((prev) => [...prev, { ...c, id: uid() }]);
  }, []);

  const addTask = useCallback((t: Omit<TaskItem, "id">) => {
    setTasks((prev) => [...prev, { ...t, id: uid() }]);
  }, []);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  }, []);

  const classById = useCallback(
    (id: string) => classes.find((c) => c.id === id),
    [classes],
  );

  const setProfile = useCallback((p: Partial<Profile>) => {
    setProfileState((prev) => ({ ...prev, ...p }));
  }, []);

  const value = useMemo<Store>(
    () => ({ classes, tasks, profile, addClass, addTask, toggleTask, classById, setProfile }),
    [classes, tasks, profile, addClass, addTask, toggleTask, classById, setProfile],
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
  const day0 = new Date(TODAY);
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
