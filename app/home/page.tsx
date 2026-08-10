"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { TabBar } from "@/components/TabBar";
import { InstallPrompt } from "@/components/InstallPrompt";
import { HomeSkeleton } from "@/components/Skeleton";
import {
  ArrowRightIcon,
  ArrowLeftIcon,
  BellIcon,
  ChevronRightIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
} from "@/components/icons";
import { PALETTE } from "@/lib/palette";
import {
  useStore,
  useNow,
  weekInfo,
  fmtMD,
  dueLabel,
  justEndedClass,
  type ClassItem,
  type DayIndex,
  type TaskItem,
} from "@/lib/store";
import { termStats } from "@/lib/streak";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function fmtHM(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function greeting(hour: number) {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function fmtRange(start: number, end: number) {
  const sH = Math.floor(start / 60);
  const eH = Math.floor(end / 60);
  const sAmpm = sH >= 12 ? "PM" : "AM";
  const eAmpm = eH >= 12 ? "PM" : "AM";
  const s12 = sH % 12 === 0 ? 12 : sH % 12;
  const e12 = eH % 12 === 0 ? 12 : eH % 12;
  const sm = (start % 60).toString().padStart(2, "0");
  const em = (end % 60).toString().padStart(2, "0");
  if (sAmpm === eAmpm) {
    return `${s12}:${sm} – ${e12}:${em} ${eAmpm}`;
  }
  return `${s12}:${sm} ${sAmpm} – ${e12}:${em} ${eAmpm}`;
}

const DAY_ABBR = ["M", "T", "W", "Th", "F"];

export default function HomeScreen() {
  // activeClasses, not classes: an archived term keeps its grades but must
  // stop showing up in Today, the week grid and My Classes.
  const {
    activeClasses: classes,
    tasks,
    profile,
    classById,
    deleteClass,
    hydrated,
  } = useStore();
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [promptDismissed, setPromptDismissed] = useState<string | null>(null);
  const now = useNow();

  if (!now || !hydrated) {
    return <HomeSkeleton />;
  }

  const { dates, todayCol } = weekInfo(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const dayIndex = (((todayCol ?? 0) + offset) % 5) as DayIndex;
  const isToday = offset === 0 && todayCol !== null;

  const dayClasses = classes
    .filter((c) => c.days.includes(dayIndex))
    .sort((a, b) => a.start - b.start);

  // Open assignments across all classes, soonest due first.
  const openTasks = tasks
    .filter((t) => !t.done)
    .sort((a, b) => a.due.localeCompare(b.due));

  const isEmpty = dayClasses.length === 0;
  // Have we looped through all 5 working days with no classes anywhere?
  const checkedAll = offset >= 4 && isEmpty;
  // Nothing has ever been added. "Looks like you're free!" is the wrong thing
  // to tell someone who hasn't set anything up yet — it reads as a dead end
  // on the one screen that has to get them to first value.
  const isFirstRun = classes.length === 0;

  const nextDayIndex = ((dayIndex + 1) % 5) as DayIndex;
  const nextDayName = DAY_NAMES[nextDayIndex];

  // Label for the day pill
  const dayLabel = isToday
    ? `Today · ${DAY_SHORT[dayIndex]}, ${fmtMD(dates[dayIndex])}`
    : `${DAY_NAMES[dayIndex]} · ${fmtMD(dates[dayIndex])}`;

  // A class that finished in the last half hour. Pro users get asked this by
  // push; without this banner free users never see the post-class capture loop
  // at all, even though it's the most distinctive thing the app does.
  const justEnded = isToday ? justEndedClass(classes, now) : null;
  const showPrompt = justEnded !== null && promptDismissed !== justEnded.id;

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-aurora">
        {/* header */}
        <div className="px-5 pb-2 pt-12">
          <p className="text-[13px] font-semibold text-muted-2">
            {greeting(now.getHours())}, {profile.username.split(/[.\s_-]/)[0] || profile.username} 👋
          </p>
          <h1 className="mt-0.5 font-[family-name:var(--font-fredoka)] text-[30px] font-semibold leading-tight text-ink">
            {isToday ? "Today's Schedule" : `${DAY_NAMES[dayIndex]}'s Schedule`}
          </h1>
        </div>

        {/* day navigation pill */}
        <div className="flex items-center gap-2 px-5 pb-3 pt-1">
          {!isToday && (
            <button
              onClick={() => setOffset((o) => Math.max(0, o - 1))}
              className="glass flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95"
              aria-label="Previous day"
            >
              <ArrowLeftIcon className="h-[18px] w-[18px] text-brand" />
            </button>
          )}
          <span
            className="glass rounded-full px-3.5 py-[6px] text-[13px] font-semibold"
            style={{
              color: isToday ? "var(--color-brand)" : "var(--color-muted)",
            }}
          >
            {dayLabel}
          </span>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-32 pt-1">
          {/* ── just-ended class → capture what it assigned ── */}
          {showPrompt && justEnded && (
            <div
              className="mb-3 flex items-center gap-3 rounded-[18px] px-4 py-3.5"
              style={{
                background: "rgba(var(--brand-rgb),.07)",
                border: "1px solid rgba(var(--brand-rgb),.14)",
              }}
            >
              <div
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] text-[17px]"
                style={{ background: "var(--brand-soft)" }}
              >
                ✍️
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">
                  {justEnded.name} just finished
                </div>
                <div className="mt-px text-[12.5px] text-muted">
                  Did it come with an assignment?
                </div>
              </div>
              <button
                onClick={() => router.push(`/prompt?class=${justEnded.id}`)}
                className="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white"
                style={{ background: "var(--color-brand)" }}
              >
                Log it
              </button>
              <button
                onClick={() => setPromptDismissed(justEnded.id)}
                aria-label="Dismiss"
                className="shrink-0 px-1 text-[18px] leading-none text-hint"
              >
                ×
              </button>
            </div>
          )}

          {/* ── classes exist ── */}
          {!isEmpty && (
            <div className="flex flex-col gap-3">
              {dayClasses.map((c) => (
                <ClassCard key={c.id} c={c} nowMin={isToday ? nowMin : -1} />
              ))}
            </div>
          )}

          {/* ── first run: one job, get a class in ── */}
          {isFirstRun && (
            <div className="mt-6">
              <div
                className="rounded-[24px] px-5 py-6 text-white"
                style={{
                  background: "var(--brand-grad)",
                  boxShadow: "0 6px 20px rgba(var(--brand-rgb),.3)",
                }}
              >
                <div className="font-[family-name:var(--font-fredoka)] text-[22px] font-semibold leading-tight">
                  Let&apos;s set up your week
                </div>
                <p className="mt-1.5 text-[14px] leading-snug text-white/85">
                  Add your classes once and ClassPing takes it from there —
                  your timetable, your deadlines, and a nudge before each one.
                </p>
                <button
                  onClick={() => router.push("/class/new")}
                  className="mt-4 w-full rounded-[15px] bg-white py-[14px] text-center text-[16px] font-semibold transition active:scale-[0.98]"
                  style={{ color: "var(--color-brand)" }}
                >
                  Add your first class
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-2.5">
                <OnboardStep
                  n={1}
                  title="Add a class"
                  body="Name it, pick the days and times. Takes about 20 seconds."
                />
                <OnboardStep
                  n={2}
                  title="Your week fills in"
                  body="See today at a glance, and the whole week on the Week tab."
                />
                <OnboardStep
                  n={3}
                  title="Get reminded"
                  body="A heads-up before class starts, and before work is due."
                />
              </div>
            </div>
          )}

          {/* ── empty state ── */}
          {!isFirstRun && isEmpty && !checkedAll && (
            <div className="mt-10 flex flex-col items-center text-center">
              <div
                className="mb-5 flex h-[80px] w-[80px] items-center justify-center rounded-[28px]"
                style={{ background: "var(--brand-soft)" }}
              >
                <span className="text-[38px]">🌿</span>
              </div>
              <h2 className="text-[20px] font-semibold text-ink">
                Looks like you&apos;re free!
              </h2>
              <p className="mt-1.5 max-w-[220px] text-[14px] leading-snug text-muted">
                {isToday
                  ? "Nothing scheduled for today."
                  : `Nothing on ${DAY_NAMES[dayIndex]}.`}
              </p>
              <button
                onClick={() => setOffset((o) => o + 1)}
                className="mt-6 flex items-center gap-2 rounded-[15px] px-5 py-[13px] text-[15px] font-semibold text-white transition active:scale-[0.97]"
                style={{
                  background: "var(--brand-grad-v)",
                  boxShadow: "0 10px 24px rgba(var(--brand-rgb),.32)",
                }}
              >
                View {nextDayName}
                <ArrowRightIcon className="h-[18px] w-[18px]" />
              </button>
            </div>
          )}

          {/* ── whole week is free ── */}
          {!isFirstRun && checkedAll && (
            <div className="mt-10 flex flex-col items-center text-center">
              <div
                className="mb-5 flex h-[80px] w-[80px] items-center justify-center rounded-[28px]"
                style={{ background: "var(--brand-soft)" }}
              >
                <span className="text-[38px]">🎉</span>
              </div>
              <h2 className="text-[20px] font-semibold text-ink">
                You&apos;re all free this week!
              </h2>
              <p className="mt-1.5 max-w-[230px] text-[14px] leading-snug text-muted">
                No classes scheduled Mon – Fri. Enjoy your time!
              </p>
              <button
                onClick={() => setOffset(0)}
                className="mt-6 rounded-[15px] px-5 py-[13px] text-[15px] font-semibold text-brand transition active:scale-[0.97]"
                style={{ background: "var(--brand-soft)" }}
              >
                Back to Today
              </button>
            </div>
          )}

          {/* ── next-day teaser when viewing today and today has classes ── */}
          {isToday && !isEmpty && (
            <button
              onClick={() => setOffset(1)}
              className="mt-5 flex w-full items-center justify-between rounded-[18px] px-4 py-3.5 transition active:scale-[0.98]"
              style={{
                background: "rgba(var(--brand-rgb),.06)",
                border: "1px solid rgba(var(--brand-rgb),.1)",
              }}
            >
              <span className="text-[14px] font-semibold text-brand">
                View {DAY_NAMES[1]}&apos;s schedule
              </span>
              <ArrowRightIcon className="h-[18px] w-[18px] text-brand" />
            </button>
          )}

          {/* Everything below is empty-by-definition before the first class,
              so first run shows the setup card alone rather than a stack of
              empty sections. */}
          {!isFirstRun && (
            <>
          {/* ── this term at a glance ── */}
          <TermGlance tasks={tasks} now={now} />

          {/* ── Assignments ── */}
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-semibold text-ink">
                  Assignments
                </h2>
                {openTasks.length > 0 && (
                  <span className="rounded-full bg-coral px-2 py-[2px] text-[11px] font-bold text-white">
                    {openTasks.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => router.push("/tasks")}
                className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold text-brand transition active:scale-95"
                style={{ background: "var(--brand-soft)" }}
              >
                View all
                <ArrowRightIcon className="h-[13px] w-[13px]" />
              </button>
            </div>

            {openTasks.length === 0 ? (
              <div
                className="rounded-[18px] bg-white px-4 py-6 text-center"
                style={{ boxShadow: "0 2px 10px rgba(30,20,80,.05)" }}
              >
                <p className="text-[14px] text-muted">
                  🎉 No open assignments.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {openTasks.slice(0, 4).map((t) => {
                  const cls = classById(t.classId);
                  const dot = PALETTE[cls?.color ?? "indigo"].bar;
                  const due = dueLabel(t.due);
                  return (
                    <button
                      key={t.id}
                      onClick={() => router.push("/tasks")}
                      className="flex items-center gap-3 rounded-[18px] bg-white px-4 py-3.5 text-left transition active:scale-[0.98]"
                      style={{ boxShadow: "0 2px 10px rgba(30,20,80,.05)" }}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: dot }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold text-ink">
                          {t.kind === "exam" && (
                            <span
                              className="mr-1.5 rounded-full px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide"
                              style={{ background: "#FFF0D6", color: "#A96A00" }}
                            >
                              Exam
                            </span>
                          )}
                          {t.title}
                        </div>
                        <div className="mt-[2px] truncate text-[12px] text-muted">
                          {cls?.name ?? "—"}
                        </div>
                      </div>
                      <span
                        className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-[5px] text-[12px] font-bold"
                        style={
                          due.urgent
                            ? { background: "#FFE8E3", color: "#D33B22" }
                            : {
                                background: "var(--brand-soft)",
                                color: "var(--color-muted)",
                              }
                        }
                      >
                        {due.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── My Classes ── */}
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-ink">My Classes</h2>
              <button
                onClick={() => router.push("/class/new")}
                className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold text-brand transition active:scale-95"
                style={{ background: "var(--brand-soft)" }}
              >
                <PlusIcon className="h-[14px] w-[14px]" />
                Add
              </button>
            </div>

            {classes.length === 0 ? (
              <div
                className="rounded-[18px] bg-white px-4 py-6 text-center"
                style={{ boxShadow: "0 2px 10px rgba(30,20,80,.05)" }}
              >
                <p className="text-[14px] text-muted">No classes added yet.</p>
                <button
                  onClick={() => router.push("/class/new")}
                  className="mt-3 text-[14px] font-semibold text-brand"
                >
                  + Add your first class
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {classes.map((c) => {
                  const t = PALETTE[c.color];
                  const dayStr = c.days
                    .slice()
                    .sort((a, b) => a - b)
                    .map((d) => DAY_ABBR[d])
                    .join(" · ");
                  const isConfirming = confirmDeleteId === c.id;

                  return (
                    <div
                      key={c.id}
                      className="overflow-hidden rounded-[18px] bg-white"
                      style={{ boxShadow: "0 2px 10px rgba(30,20,80,.05)" }}
                    >
                      {/* main row */}
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div
                          className="h-[38px] w-[38px] shrink-0 rounded-[11px] flex items-center justify-center text-[13px] font-bold"
                          style={{ background: t.bg, color: t.text }}
                        >
                          {c.short}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-semibold text-ink">
                            {c.name}
                          </div>
                          <div className="mt-[2px] text-[12px] text-muted">
                            {dayStr}
                          </div>
                        </div>
                        <button
                          onClick={() => router.push(`/class/${c.id}/edit`)}
                          aria-label="Edit class"
                          className="flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95"
                          style={{ background: "#F0EFF6" }}
                        >
                          <PencilIcon className="h-[15px] w-[15px] text-muted" />
                        </button>
                        <button
                          onClick={() =>
                            setConfirmDeleteId(isConfirming ? null : c.id)
                          }
                          aria-label="Delete class"
                          className="flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95"
                          style={{
                            background: isConfirming ? "#FFE8E3" : "#F0EFF6",
                          }}
                        >
                          <TrashIcon
                            className="h-[15px] w-[15px]"
                            style={{
                              color: isConfirming ? "#E84040" : "#9A96B4",
                            }}
                          />
                        </button>
                      </div>

                      {/* inline delete confirmation */}
                      {isConfirming && (
                        <div
                          className="flex items-center justify-between px-4 py-3"
                          style={{ background: "#FFF5F5", borderTop: "1px solid #FFE0E0" }}
                        >
                          <p className="text-[13px] font-medium text-[#C0392B]">
                            Delete &ldquo;{c.name}&rdquo;?
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-muted"
                              style={{ background: "#F0EFF6" }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                deleteClass(c.id);
                                setConfirmDeleteId(null);
                              }}
                              className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-white"
                              style={{ background: "#E84040" }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Grades & GPA ── */}
          <button
            onClick={() => router.push("/grades")}
            className="mt-5 flex w-full items-center gap-3 rounded-[18px] bg-white px-4 py-4 text-left transition active:scale-[0.98]"
            style={{ boxShadow: "0 2px 10px rgba(30,20,80,.05)" }}
          >
            <div
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] text-[17px]"
              style={{ background: "var(--brand-soft)" }}
            >
              🎓
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-semibold text-ink">
                Grades & GPA
              </div>
              <div className="mt-[2px] text-[12px] text-muted">
                Log scores and track your GPA
              </div>
            </div>
            <ArrowRightIcon className="h-[18px] w-[18px] text-brand" />
          </button>
            </>
          )}
        </div>

        <InstallPrompt />
        <TabBar />
      </div>
    </PhoneFrame>
  );
}

/**
 * A quiet progress read, derived entirely from tasks the user already has.
 * Hidden until there's something to say — an empty stat row on day one is
 * noise, and a zeroed streak is discouraging for no reason.
 */
function TermGlance({ tasks, now }: { tasks: TaskItem[]; now: Date }) {
  const stats = termStats(tasks, now);
  if (tasks.length === 0) return null;

  return (
    <div
      className="mt-6 flex gap-2.5 rounded-[18px] bg-white px-4 py-3.5"
      style={{ boxShadow: "0 2px 10px rgba(30,20,80,.05)" }}
    >
      <Stat value={stats.completed} label="done" />
      <div className="w-px shrink-0" style={{ background: "#F0EFF6" }} />
      <Stat
        value={stats.dueThisWeek}
        label="this week"
        tone={stats.dueThisWeek > 0 ? "brand" : undefined}
      />
      <div className="w-px shrink-0" style={{ background: "#F0EFF6" }} />
      {stats.overdue > 0 ? (
        <Stat value={stats.overdue} label="overdue" tone="warn" />
      ) : (
        <Stat
          value={stats.streak}
          label={stats.streak === 1 ? "day clear" : "days clear"}
          tone="good"
        />
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "warn" | "good" | "brand";
}) {
  const color =
    tone === "warn"
      ? "#D33B22"
      : tone === "good"
        ? "#2E9E4F"
        : tone === "brand"
          ? "var(--color-brand)"
          : "var(--color-ink)";
  return (
    <div className="flex-1 text-center">
      <div className="text-[19px] font-bold leading-none" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-medium text-muted-2">{label}</div>
    </div>
  );
}

/** One numbered step in the first-run setup card. */
function OnboardStep({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-[18px] bg-white px-4 py-3.5"
      style={{ boxShadow: "0 2px 10px rgba(30,20,80,.05)" }}
    >
      <div
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-brand"
        style={{ background: "var(--brand-soft)" }}
      >
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-ink">{title}</div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{body}</p>
      </div>
    </div>
  );
}

function ClassCard({ c, nowMin }: { c: ClassItem; nowMin: number }) {
  const t = PALETTE[c.color];
  const isPast = nowMin > 0 && nowMin > c.end;
  const isNow = nowMin > 0 && nowMin >= c.start && nowMin <= c.end;
  const [open, setOpen] = useState(false);

  const daysStr = c.days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DAY_SHORT[d])
    .join(" · ");

  return (
    <div
      className="overflow-hidden rounded-[18px] bg-white transition"
      style={{
        boxShadow: "0 2px 10px rgba(30,20,80,.06)",
        opacity: isPast ? 0.55 : 1,
      }}
    >
      <div className="flex items-stretch">
        {/* color bar */}
        <div className="w-[5px] shrink-0" style={{ background: t.bar }} />

        {/* Tapping the row reveals the rest — days, full time, room, teacher,
            and any private note. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 py-4 pl-4 pr-3 text-left"
        >
          {/* colored icon blob */}
          <div
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[13px] text-[15px] font-bold"
            style={{ background: t.bg, color: t.text }}
          >
            {c.short}
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-ink">
              {c.name}
            </div>
            <div className="mt-[3px] truncate text-[13px] text-muted">
              {fmtRange(c.start, c.end)}
              {c.room ? ` · ${c.room}` : ""}
            </div>
          </div>

          {isNow && (
            <span className="shrink-0 rounded-full bg-[#34C759] px-2.5 py-[4px] text-[11px] font-bold text-white">
              Now
            </span>
          )}
          {isPast && (
            <span className="shrink-0 text-[12px] font-medium text-hint">
              Done
            </span>
          )}
          {!isNow && !isPast && nowMin > 0 && (
            <div className="flex shrink-0 items-center gap-1 text-[12px] text-muted">
              <BellIcon className="h-[14px] w-[14px]" />
              <span>{fmtHM(c.start)}</span>
            </div>
          )}

          <ChevronRightIcon
            className="h-4 w-4 shrink-0 text-hint transition-transform"
            style={{ transform: open ? "rotate(90deg)" : "none" }}
          />
        </button>
      </div>

      {/* details drawer */}
      {open && (
        <div
          className="px-4 pb-3.5 pl-[52px] pt-1"
          style={{ borderTop: "1px solid rgba(30,20,80,.06)" }}
        >
          <ClassDetail label="Days" value={daysStr} />
          <ClassDetail label="Time" value={fmtRange(c.start, c.end)} />
          {c.room && <ClassDetail label="Room" value={c.room} />}
          {c.instructor && <ClassDetail label="Teacher" value={c.instructor} />}
          {c.notes && (
            <div className="mt-2">
              <div className="text-[12px] font-medium text-muted-2">Notes</div>
              <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-ink">
                {c.notes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One label/value line inside an expanded class card. */
function ClassDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-[3px]">
      <span className="w-[60px] shrink-0 text-[12px] font-medium text-muted-2">
        {label}
      </span>
      <span className="flex-1 text-[13px] text-ink">{value}</span>
    </div>
  );
}
