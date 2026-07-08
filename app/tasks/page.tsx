"use client";

import { useState } from "react";
import { PhoneFrame } from "@/components/PhoneFrame";
import { TabBar } from "@/components/TabBar";
import { TasksSkeleton } from "@/components/Skeleton";
import { CheckIcon } from "@/components/icons";
import { PALETTE } from "@/lib/palette";
import { useStore, dueLabel, type TaskItem } from "@/lib/store";

export default function TasksScreen() {
  const { tasks, classById, toggleTask, hydrated } = useStore();
  const [tab, setTab] = useState<"open" | "done">("open");

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const list = tab === "open" ? open : done;

  if (!hydrated) {
    return <TasksSkeleton />;
  }

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-aurora">
        {/* header */}
        <div className="flex items-end justify-between px-5 pb-2 pt-16">
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
        </div>

        {/* segmented */}
        <div className="px-5 pb-1 pt-2">
          <div className="flex w-full rounded-xl bg-[#E5E2F1] p-[3px]">
            {(["open", "done"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 rounded-[9px] py-[7px] text-center text-[14px] transition"
                style={
                  tab === t
                    ? {
                        background: "#fff",
                        fontWeight: 600,
                        color: "#211D46",
                        boxShadow: "0 1px 3px rgba(0,0,0,.08)",
                      }
                    : { fontWeight: 500, color: "#7A759C" }
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
            />
          ))}
        </div>

        <TabBar />
      </div>
    </PhoneFrame>
  );
}

function TaskRow({
  task,
  className,
  dot,
  onToggle,
}: {
  task: TaskItem;
  className: string;
  dot: string;
  onToggle: () => void;
}) {
  const due = dueLabel(task.due);
  return (
    <div
      className="flex items-start gap-3 rounded-[17px] bg-white px-4 py-[15px]"
      style={{
        boxShadow: "0 1px 5px rgba(30,20,80,.05)",
        opacity: task.done ? 0.7 : 1,
      }}
    >
      <button
        onClick={onToggle}
        aria-label={task.done ? "Mark as open" : "Mark as done"}
        className="mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full transition"
        style={
          task.done
            ? { background: "#34C759", color: "#fff" }
            : { border: "2px solid #DDD9EC" }
        }
      >
        {task.done && <CheckIcon className="h-[15px] w-[15px]" />}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className="text-[16px] font-semibold"
          style={
            task.done
              ? { color: "#A6A2BE", textDecoration: "line-through" }
              : { color: "#211D46" }
          }
        >
          {task.title}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: task.done ? "#C9C4D6" : dot }}
          />
          <span
            className="text-[13px]"
            style={
              task.done
                ? { color: "#B4B0C6", textDecoration: "line-through" }
                : { color: "#8D89AD" }
            }
          >
            {className}
          </span>
        </div>
      </div>

      {!task.done && (
        <span
          className="whitespace-nowrap rounded-full px-2.5 py-[5px] text-[12px] font-bold"
          style={
            due.urgent
              ? { background: "#FFE8E3", color: "#D33B22" }
              : { background: "#F0EFF6", color: "#7A759C" }
          }
        >
          {due.text}
        </span>
      )}
    </div>
  );
}
