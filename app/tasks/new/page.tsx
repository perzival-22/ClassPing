"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Toggle } from "@/components/Toggle";
import { FlagIcon } from "@/components/icons";
import { PALETTE } from "@/lib/palette";
import { useStore, longDate } from "@/lib/store";
import { ensureNotificationPermission, showReminder } from "@/lib/notifications";

const DUE_PRESETS = [
  { label: "Tomorrow", days: 1 },
  { label: "2 days", days: 2 },
  { label: "3 days", days: 3 },
  { label: "4 days", days: 4 },
  { label: "5 days", days: 5 },
  { label: "6 days", days: 6 },
  { label: "1 week", days: 7 },
];

function dueDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function AddAssignment() {
  const router = useRouter();
  const params = useSearchParams();
  const { classes, addTask, classById } = useStore();

  const initialClass = params.get("class") ?? classes[0]?.id ?? "";
  const [classId, setClassId] = useState(initialClass);
  const [picking, setPicking] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDays, setDueDays] = useState(3);
  const [reminder, setReminder] = useState(true);

  const selected = classById(classId);
  const canSave = title.trim().length > 0 && !!selected;

  const dueText = useMemo(() => longDate(dueDate(dueDays)), [dueDays]);

  const save = async () => {
    if (!canSave) return;
    addTask({
      title: title.trim(),
      classId,
      due: dueDate(dueDays),
      reminder,
      done: false,
    });
    // Confirm notifications work for the reminder the user just set up.
    if (reminder && (await ensureNotificationPermission())) {
      showReminder(
        "Reminder set ✓",
        `We'll nudge you 24 hours before "${title.trim()}" is due.`,
        "setup-confirm",
      );
    }
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
            New Assignment
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

          {/* name */}
          <div>
            <div className="mb-[7px] px-1 text-[12px] font-semibold tracking-wide text-muted-2">
              ASSIGNMENT
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
              DUE IN
            </div>
            <div className="flex flex-wrap gap-2">
              {DUE_PRESETS.map((p) => {
                const on = dueDays === p.days;
                return (
                  <button
                    key={p.days}
                    onClick={() => setDueDays(p.days)}
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

        <div className="px-[18px] pb-10 pt-2.5">
          <button
            onClick={save}
            disabled={!canSave}
            className="btn-brand w-full rounded-[17px] py-[17px] text-center text-[17px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            Save assignment
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}

export default function AddAssignmentScreen() {
  return (
    <Suspense fallback={null}>
      <AddAssignment />
    </Suspense>
  );
}
