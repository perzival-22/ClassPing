"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { TabBar } from "@/components/TabBar";
import { TasksSkeleton } from "@/components/Skeleton";
import { StudyTimer } from "@/components/StudyTimer";
import {
  TrophyBar,
  TrophyCelebration,
  TrophyGraphSheet,
} from "@/components/Trophies";
import {
  CheckIcon,
  ChevronRightIcon,
  PencilIcon,
  TimerIcon,
  TrophyIcon,
} from "@/components/icons";
import { PALETTE } from "@/lib/palette";
import { useStore, dueLabel, longDate, type TaskItem } from "@/lib/store";

export default function TasksScreen() {
  const router = useRouter();
  const {
    tasks,
    classById,
    toggleTask,
    trophies,
    recentTrophy,
    clearRecentTrophy,
    hydrated,
  } = useStore();
  const [tab, setTab] = useState<"open" | "done">("open");
  const [showTrophies, setShowTrophies] = useState(false);
  /** The assignment a study block is running for, if any. */
  const [timerFor, setTimerFor] = useState<TaskItem | null>(null);

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const list = tab === "open" ? open : done;

  if (!hydrated) {
    return <TasksSkeleton />;
  }

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-aurora">
        {/* trophies, above everything — the streak is the reason the rest of
            this screen gets opened */}
        <div className="px-5 pb-1 pt-12">
          <TrophyBar trophies={trophies} onOpen={() => setShowTrophies(true)} />
        </div>

        {/* header */}
        <div className="flex items-end justify-between px-5 pb-2 pt-3">
          <div className="flex items-center gap-2.5">
            <h1 className="font-[family-name:var(--font-fredoka)] text-[32px] font-semibold leading-none text-ink">
              Tasks
            </h1>
            {open.length > 0 && (
              <span className="mb-1 rounded-full bg-coral px-2.5 py-[3px] text-[13px] font-bold text-white">
                {open.length} open
              </span>
            )}
          </div>
          <button
            onClick={() => setShowTrophies(true)}
            aria-label="Trophy timeline"
            className="mb-0.5 flex items-center gap-1.5 rounded-full px-3 py-[7px] text-[13px] font-semibold text-brand transition active:scale-95"
            style={{ background: "var(--brand-soft)" }}
          >
            <TrophyIcon
              className="h-[15px] w-[15px]"
              face="var(--color-brand)"
              ring="var(--color-brand)"
            />
            Trophies
          </button>
        </div>

        {/* segmented */}
        <div className="px-5 pb-1 pt-2">
          <div className="flex w-full rounded-xl bg-[var(--surface-3)] p-[3px]">
            {(["open", "done"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 rounded-[9px] py-[7px] text-center text-[14px] transition"
                style={
                  tab === t
                    ? {
                        background: "var(--pill-active)",
                        fontWeight: 600,
                        color: "var(--color-ink)",
                        boxShadow: "0 1px 3px rgba(0,0,0,.08)",
                      }
                    : { fontWeight: 500, color: "var(--color-muted-2)" }
                }
              >
                {t === "open" ? "Open" : "Done"}
              </button>
            ))}
          </div>
        </div>

        {/* list */}
        <div className="no-scrollbar flex flex-1 flex-col gap-[11px] overflow-y-auto px-[18px] pb-28 pt-3">
          {list.length === 0 && (
            <div className="mt-16 text-center text-[15px] text-muted-2">
              {tab === "open"
                ? "🎉 All caught up — no open tasks."
                : "Nothing completed yet."}
            </div>
          )}
          {list.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              className={classById(t.classId)?.name ?? "—"}
              dot={PALETTE[classById(t.classId)?.color ?? "indigo"].bar}
              onToggle={() => toggleTask(t.id)}
              onEdit={() => router.push(`/tasks/${t.id}/edit`)}
              onStart={() => setTimerFor(t)}
            />
          ))}
        </div>

        {showTrophies && (
          <TrophyGraphSheet
            trophies={trophies}
            onClose={() => setShowTrophies(false)}
          />
        )}

        {timerFor && (
          <StudyTimer
            title={timerFor.title}
            onClose={() => setTimerFor(null)}
            onFinishTask={
              // Only offered while it's still open — the finished state
              // shouldn't hand you a button that un-ticks the task.
              timerFor.done ? undefined : () => toggleTask(timerFor.id)
            }
          />
        )}

        {recentTrophy && (
          <TrophyCelebration
            trophy={recentTrophy}
            onClose={clearRecentTrophy}
          />
        )}

        <TabBar />
      </div>
    </PhoneFrame>
  );
}

/**
 * One assignment, expandable to its full detail.
 *
 * Tapping used to jump straight to the edit form, which meant there was
 * nowhere to simply *read* a task — and no reason to write a note on one,
 * since a note you can only see inside a form isn't worth keeping. So the row
 * opens in place: due date and time, type, class, and the note. Editing is one
 * more tap from there.
 */
function TaskRow({
  task,
  className,
  dot,
  onToggle,
  onEdit,
  onStart,
}: {
  task: TaskItem;
  className: string;
  dot: string;
  onToggle: () => void;
  onEdit: () => void;
  /** Open a study block for this assignment. */
  onStart: () => void;
}) {
  const [open, setOpen] = useState(false);
  const due = dueLabel(task.due);
  const dueAt = new Date(task.due);
  // 23:59 is the "no specific time" sentinel the task forms write.
  const hasTime = !(dueAt.getHours() === 23 && dueAt.getMinutes() === 59);

  return (
    <div
      className="rounded-[17px] bg-white"
      style={{
        boxShadow: "0 1px 5px rgba(30,20,80,.05)",
        opacity: task.done ? 0.7 : 1,
      }}
    >
      <div className="flex items-start gap-3 px-4 py-[15px]">
        <button
          onClick={onToggle}
          aria-label={task.done ? "Mark as open" : "Mark as done"}
          className="mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full transition"
          style={
            task.done
              ? { background: "var(--good)", color: "#fff" }
              : { border: "2px solid var(--line-strong)" }
          }
        >
          {task.done && <CheckIcon className="h-[15px] w-[15px]" />}
        </button>

        {/* Row body expands; the circle stays its own tap target. */}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`Details for ${task.title}`}
          className="min-w-0 flex-1 text-left"
        >
          <div
            className="text-[16px] font-semibold"
            style={
              task.done
                ? { color: "var(--color-muted-2)", textDecoration: "line-through" }
                : { color: "var(--color-ink)" }
            }
          >
            {task.kind === "exam" && !task.done && (
              <span
                className="mr-1.5 rounded-full px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide"
                style={{ background: "var(--warn-soft)", color: "var(--warn-ink)" }}
              >
                Exam
              </span>
            )}
            {task.title}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: task.done ? "var(--color-hint)" : dot }}
            />
            <span
              className="text-[13px]"
              style={
                task.done
                  ? { color: "var(--color-hint)", textDecoration: "line-through" }
                  : { color: "var(--color-muted-2)" }
              }
            >
              {className}
            </span>
            {task.notes?.trim() && (
              <span className="text-[13px] text-hint">· 📝</span>
            )}
          </div>
        </button>

        {!task.done && (
          <span
            className="whitespace-nowrap rounded-full px-2.5 py-[5px] text-[12px] font-bold"
            style={
              due.urgent
                ? { background: "var(--danger-soft)", color: "var(--danger-ink)" }
                : { background: "var(--surface-2)", color: "var(--color-muted-2)" }
            }
          >
            {due.text}
          </span>
        )}

        <ChevronRightIcon
          className="mt-1 h-4 w-4 shrink-0 text-hint transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        />
      </div>

      {open && (
        <div
          className="px-4 pb-4 pl-[54px]"
          style={{ borderTop: "1px solid rgba(30,20,80,.06)" }}
        >
          <div className="pt-2.5">
            <Detail
              label="Due"
              value={
                longDate(task.due) +
                (hasTime
                  ? ` · ${dueAt.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : "")
              }
            />
            <Detail label="Type" value={task.kind === "exam" ? "Exam" : "Assignment"} />
            <Detail label="Class" value={className} />
            <Detail
              label="Reminder"
              value={task.reminder ? "Nudging until done" : "Off"}
            />
          </div>

          {task.notes?.trim() ? (
            <div className="mt-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-faint">
                Notes
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-snug text-ink">
                {task.notes}
              </p>
            </div>
          ) : (
            <p className="mt-2.5 text-[13px] text-hint">
              No notes yet — add one to remember what this actually asks for.
            </p>
          )}

          {/* The primary action on an open assignment is to *start* it, so it
              gets the full-width filled button and Edit steps down to a quiet
              pill beside it. */}
          {!task.done && (
            <button
              onClick={onStart}
              className="btn-brand mt-3.5 flex w-full items-center justify-center gap-2 rounded-[14px] py-[12px] text-[15px] font-semibold text-white transition active:scale-[0.98]"
            >
              <TimerIcon className="h-[17px] w-[17px]" />
              Let&apos;s Do It
            </button>
          )}

          <button
            onClick={onEdit}
            className="mt-3 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-brand transition active:scale-95"
            style={{ background: "var(--brand-soft)" }}
          >
            <PencilIcon className="h-[13px] w-[13px]" />
            Edit assignment
          </button>
        </div>
      )}
    </div>
  );
}

/** One label/value line inside an expanded task. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-[3px]">
      <span className="w-[64px] shrink-0 text-[12px] font-medium text-muted-2">
        {label}
      </span>
      <span className="flex-1 text-[13px] text-ink">{value}</span>
    </div>
  );
}
