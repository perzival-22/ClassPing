"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Toggle } from "@/components/Toggle";
import { FlagIcon } from "@/components/icons";
import { PALETTE } from "@/lib/palette";
import { useStore, longDate, type TaskItem } from "@/lib/store";

// Same shortcuts as the add screen; the date input covers everything else.
const DUE_PRESETS = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "2 days", days: 2 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
];

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date `daysAhead` from now, as a date-input value. */
function dateInputValue(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local wall-clock → stored ISO; no time picked means end of day. */
function dueIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "23:59").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

export default function EditAssignmentScreen({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { hydrated, taskById } = useStore();

  // Wait for localStorage before deciding the task doesn't exist — a direct
  // URL load reaches here with an empty store on the first render.
  if (!hydrated) {
    return (
      <PhoneFrame>
        <div className="h-full bg-aurora" />
      </PhoneFrame>
    );
  }

  const task = taskById(id);
  if (!task) {
    return (
      <PhoneFrame>
        <div className="flex h-full items-center justify-center bg-aurora">
          <p className="text-muted">Assignment not found.</p>
        </div>
      </PhoneFrame>
    );
  }

  return <EditForm task={task} />;
}

/** Mounted only once the task exists, so useState prefills see real data. */
function EditForm({ task }: { task: TaskItem }) {
  const router = useRouter();
  const { classes, classById, updateTask, deleteTask } = useStore();

  const existingDue = new Date(task.due);
  // 23:59 is the "no specific time" sentinel written by the add screen.
  const isEndOfDay =
    existingDue.getHours() === 23 && existingDue.getMinutes() === 59;

  const [classId, setClassId] = useState(task.classId);
  const [picking, setPicking] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [kind, setKind] = useState<"assignment" | "exam">(
    task.kind === "exam" ? "exam" : "assignment",
  );
  const [dueDate, setDueDate] = useState(
    `${existingDue.getFullYear()}-${pad(existingDue.getMonth() + 1)}-${pad(existingDue.getDate())}`,
  );
  const [dueTime, setDueTime] = useState(
    isEndOfDay ? "" : `${pad(existingDue.getHours())}:${pad(existingDue.getMinutes())}`,
  );
  const [reminder, setReminder] = useState(task.reminder);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selected = classById(classId);
  const canSave = title.trim().length > 0 && !!selected && dueDate.length > 0;

  const dueText = useMemo(
    () => longDate(dueIso(dueDate, dueTime)) + (dueTime ? ` · ${dueTime}` : ""),
    [dueDate, dueTime],
  );

  const save = () => {
    if (!canSave) return;
    updateTask(task.id, {
      title: title.trim(),
      classId,
      due: dueIso(dueDate, dueTime),
      reminder,
      kind,
    });
    router.push("/tasks");
  };

  const remove = () => {
    // Two-tap confirm — same guard the class list uses before destroying data.
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteTask(task.id);
    router.push("/tasks");
  };

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-aurora">
        {/* nav */}
        <div className="flex items-center justify-between px-5 pb-2.5 pt-[60px]">
          <button
            onClick={() => router.back()}
            className="text-[16px] font-medium text-muted-2"
          >
            Cancel
          </button>
          <div className="text-[17px] font-semibold text-ink">
            Edit Assignment
          </div>
          <button
            onClick={save}
            disabled={!canSave}
            className="text-[16px] font-semibold"
            style={{ color: canSave ? "var(--color-brand)" : "#C4C0DC" }}
          >
            Save
          </button>
        </div>

        <div className="no-scrollbar flex flex-1 flex-col gap-[18px] overflow-y-auto px-[18px] pb-8 pt-2">
          {/* class */}
          <div>
            <div className="mb-[7px] px-1 text-[12px] font-semibold tracking-wide text-muted-2">
              CLASS
            </div>
            <button
              onClick={() => setPicking((p) => !p)}
              className="flex w-full items-center justify-between rounded-[15px] bg-white px-4 py-[14px]"
              style={{ boxShadow: "0 1px 4px rgba(30,20,80,.05)" }}
            >
              <div className="flex items-center gap-[11px]">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: PALETTE[selected?.color ?? "indigo"].bar,
                  }}
                />
                <span className="text-[16px] font-medium text-ink">
                  {selected?.name ?? "Select a class"}
                </span>
              </div>
              <span className="text-[14px] font-semibold text-brand">
                Change
              </span>
            </button>

            {picking && (
              <div
                className="mt-2 overflow-hidden rounded-[15px] bg-white"
                style={{ boxShadow: "0 1px 4px rgba(30,20,80,.05)" }}
              >
                {classes.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setClassId(c.id);
                      setPicking(false);
                    }}
                    className="flex w-full items-center gap-[11px] px-4 py-3 text-left"
                    style={{
                      borderTop: i ? "0.5px solid #EFEDF6" : undefined,
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: PALETTE[c.color].bar }}
                    />
                    <span className="text-[15px] text-ink">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* what kind */}
          <div>
            <div className="mb-[7px] px-1 text-[12px] font-semibold tracking-wide text-muted-2">
              TYPE
            </div>
            <div className="flex w-full rounded-xl bg-[#E5E2F1] p-[3px]">
              {(
                [
                  { id: "assignment", label: "Assignment" },
                  { id: "exam", label: "Exam" },
                ] as const
              ).map((k) => (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  className="flex-1 rounded-[9px] py-[7px] text-center text-[14px] transition"
                  style={
                    kind === k.id
                      ? {
                          background: "#fff",
                          fontWeight: 600,
                          color: "#211D46",
                          boxShadow: "0 1px 3px rgba(0,0,0,.08)",
                        }
                      : { fontWeight: 500, color: "#7A759C" }
                  }
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {/* name */}
          <div>
            <div className="mb-[7px] px-1 text-[12px] font-semibold tracking-wide text-muted-2">
              {kind === "exam" ? "EXAM" : "ASSIGNMENT"}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-[15px] bg-white px-4 py-[15px] text-[16px] text-ink outline-none"
              style={{ boxShadow: "0 1px 4px rgba(30,20,80,.05)" }}
              placeholder="e.g. Reading response: Rawls, Ch. 3"
            />
          </div>

          {/* due */}
          <div>
            <div className="mb-[7px] px-1 text-[12px] font-semibold tracking-wide text-muted-2">
              DUE
            </div>
            <div className="flex flex-wrap gap-2">
              {DUE_PRESETS.map((p) => {
                const on = dueDate === dateInputValue(p.days);
                return (
                  <button
                    key={p.days}
                    onClick={() => setDueDate(dateInputValue(p.days))}
                    className="rounded-xl px-[15px] py-2.5 text-[14px] font-semibold transition"
                    style={
                      on
                        ? { background: "var(--color-brand)", color: "#fff" }
                        : {
                            background: "#fff",
                            color: "#79749B",
                            boxShadow: "0 1px 3px rgba(30,20,80,.05)",
                          }
                    }
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2.5 flex gap-2.5">
              <label
                className="flex-1 rounded-[15px] bg-white px-3.5 py-3"
                style={{ boxShadow: "0 1px 4px rgba(30,20,80,.05)" }}
              >
                <div className="text-[11px] font-semibold text-faint">DATE</div>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => e.target.value && setDueDate(e.target.value)}
                  className="mt-0.5 w-full bg-transparent text-[16px] font-medium text-ink outline-none"
                />
              </label>
              <label
                className="flex-1 rounded-[15px] bg-white px-3.5 py-3"
                style={{ boxShadow: "0 1px 4px rgba(30,20,80,.05)" }}
              >
                <div className="text-[11px] font-semibold text-faint">
                  TIME (OPTIONAL)
                </div>
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="mt-0.5 w-full bg-transparent text-[16px] font-medium text-ink outline-none"
                />
              </label>
            </div>
            <div className="mx-1 mt-3 text-[13px] text-muted-2">
              Due <span className="font-semibold text-ink">{dueText}</span>
            </div>
          </div>

          {/* reminder */}
          <div
            className="flex items-center justify-between rounded-[15px] bg-white px-4 py-[15px]"
            style={{ boxShadow: "0 1px 4px rgba(30,20,80,.05)" }}
          >
            <div className="flex items-center gap-[11px]">
              <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#ECEBFB] text-brand">
                <FlagIcon className="h-[17px] w-[17px]" />
              </div>
              <div>
                <div className="text-[15px] font-semibold text-ink">
                  Daily reminder
                </div>
                <div className="mt-px text-[12px] text-muted-2">
                  Nudge me until it&apos;s done
                </div>
              </div>
            </div>
            <Toggle on={reminder} onChange={setReminder} />
          </div>
        </div>

        <div className="flex flex-col gap-2.5 px-[18px] pb-10 pt-2.5">
          <button
            onClick={save}
            disabled={!canSave}
            className="btn-brand w-full rounded-[17px] py-[17px] text-center text-[17px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            Save changes
          </button>
          <button
            onClick={remove}
            className="w-full rounded-[17px] py-[15px] text-center text-[16px] font-semibold transition active:scale-[0.98]"
            style={
              confirmDelete
                ? { background: "#D33B22", color: "#fff" }
                : { background: "#FFE8E3", color: "#D33B22" }
            }
          >
            {confirmDelete ? "Tap again to delete" : "Delete assignment"}
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}
