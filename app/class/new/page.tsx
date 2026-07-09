"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Toggle } from "@/components/Toggle";
import { ColorPicker } from "@/components/ColorPicker";
import { BellSolid, SparkleIcon } from "@/components/icons";
import { type SubjectColor } from "@/lib/palette";
import { useStore, type DayIndex } from "@/lib/store";
import { ensureNotificationPermission, showReminder } from "@/lib/notifications";
import { useIsPro } from "@/lib/useIsPro";
import { FREE_CLASS_LIMIT } from "@/lib/plan";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const REMIND_OPTIONS = [
  { label: "10 min", value: 10 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hr", value: 60 },
];

function parseTime(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}
function toInput(mins: number): string {
  return `${Math.floor(mins / 60)
    .toString()
    .padStart(2, "0")}:${(mins % 60).toString().padStart(2, "0")}`;
}

export default function AddClassScreen() {
  const router = useRouter();
  const { addClass, classes, hydrated } = useStore();
  const { isPro, proLoaded } = useIsPro();

  // Free plan: gate *adding* beyond the limit. Users who already have more
  // classes keep them all — nothing existing is ever locked or removed.
  const atLimit =
    hydrated && proLoaded && !isPro && classes.length >= FREE_CLASS_LIMIT;

  const [name, setName] = useState("Foundations of Machine Learning");
  const [days, setDays] = useState<Set<number>>(new Set([0, 2]));
  const [start, setStart] = useState(600); // 10:00
  const [end, setEnd] = useState(680); // 11:20
  const [remind, setRemind] = useState(15);
  const [alarm, setAlarm] = useState(true);
  const [color, setColor] = useState<SubjectColor>("indigo");

  const canSave = name.trim().length > 0 && days.size > 0 && !atLimit;

  const toggleDay = (i: number) => {
    setDays((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const save = async () => {
    if (!canSave) return;
    const weekdays = [...days].filter((d) => d <= 4) as DayIndex[];
    addClass({
      name: name.trim(),
      short: name.trim().split(/\s+/)[0].slice(0, 5),
      color,
      days: weekdays.length ? weekdays : [0],
      start,
      end,
      remindBefore: remind,
      alarm,
    });
    // Confirm notifications work for the reminder the user just set up.
    if (alarm && (await ensureNotificationPermission())) {
      showReminder(
        "Reminders are on 🎉",
        `We'll ping you ${remind} min before ${name.trim()}.`,
        "setup-confirm",
      );
    }
    router.push("/week");
  };

  if (atLimit) {
    return (
      <PhoneFrame>
        <div className="flex h-full flex-col bg-aurora">
          <div className="flex items-center px-5 pb-2.5 pt-[60px]">
            <button
              onClick={() => router.push("/week")}
              className="text-[16px] font-medium text-muted-2"
            >
              Back
            </button>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-8 pb-24 text-center">
            <div
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full text-white"
              style={{
                background: "linear-gradient(145deg,#6c63ff,#5045d8)",
                boxShadow: "0 6px 20px rgba(91,84,232,.35)",
              }}
            >
              <SparkleIcon className="h-9 w-9 text-[#FFD76E]" />
            </div>
            <h2 className="mt-5 font-[family-name:var(--font-fredoka)] text-[22px] font-semibold text-ink">
              Your free timetable is full
            </h2>
            <p className="mt-2 text-[14px] leading-snug text-muted">
              The free plan holds {FREE_CLASS_LIMIT} classes. Upgrade to
              ClassPing Pro for unlimited classes, calendar export, and premium
              colors.
            </p>
            <button
              onClick={() => router.push("/upgrade")}
              className="btn-brand mt-6 w-full rounded-[17px] py-[15px] text-center text-[16px] font-semibold text-white transition active:scale-[0.98]"
            >
              See Pro plans
            </button>
          </div>
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-aurora">
        {/* nav */}
        <div className="flex items-center justify-between px-5 pb-2.5 pt-[60px]">
          <button
            onClick={() => router.push("/week")}
            className="text-[16px] font-medium text-muted-2"
          >
            Cancel
          </button>
          <div className="text-[17px] font-semibold text-ink">New Class</div>
          <button
            onClick={save}
            disabled={!canSave}
            className="text-[16px] font-semibold"
            style={{ color: canSave ? "#5B54E8" : "#C4C0DC" }}
          >
            Save
          </button>
        </div>

        <div className="no-scrollbar flex flex-1 flex-col gap-[18px] overflow-y-auto px-[18px] pb-8 pt-2">
          {/* name */}
          <Field label="CLASS NAME">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[15px] bg-white px-4 py-[15px] text-[16px] text-ink outline-none"
              style={{ boxShadow: "0 1px 4px rgba(30,20,80,.05)" }}
              placeholder="e.g. Organic Chemistry II"
            />
          </Field>

          {/* color */}
          <Field label="COLOR">
            <ColorPicker value={color} onChange={setColor} isPro={isPro} />
          </Field>

          {/* days */}
          <Field label="MEETING DAYS">
            <div className="flex justify-between gap-[7px]">
              {DAY_LABELS.map((d, i) => {
                const on = days.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-semibold transition"
                    style={
                      on
                        ? { background: "#5B54E8", color: "#fff" }
                        : {
                            background: "#fff",
                            color: i > 4 ? "#C4C0DC" : "#9A96B4",
                            boxShadow: "0 1px 3px rgba(30,20,80,.05)",
                          }
                    }
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* time */}
          <Field label="TIME">
            <div className="flex gap-2.5">
              <TimeBox
                label="STARTS"
                value={start}
                onChange={(v) => {
                  setStart(v);
                  if (v >= end) setEnd(v + 80);
                }}
              />
              <TimeBox label="ENDS" value={end} onChange={setEnd} />
            </div>
          </Field>

          {/* remind */}
          <Field label="REMIND ME BEFORE">
            <div className="flex gap-2">
              {REMIND_OPTIONS.map((o) => {
                const on = remind === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() => setRemind(o.value)}
                    className="flex-1 rounded-xl py-[11px] text-center text-[14px] font-semibold transition"
                    style={
                      on
                        ? { background: "#5B54E8", color: "#fff" }
                        : {
                            background: "#fff",
                            color: "#79749B",
                            boxShadow: "0 1px 3px rgba(30,20,80,.05)",
                          }
                    }
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* alarm */}
          <div
            className="flex items-center justify-between rounded-[15px] bg-white px-4 py-[15px]"
            style={{ boxShadow: "0 1px 4px rgba(30,20,80,.05)" }}
          >
            <div className="flex items-center gap-[11px]">
              <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#FFEDE8] text-coral">
                <BellSolid className="h-[18px] w-[18px]" />
              </div>
              <div>
                <div className="text-[15px] font-semibold text-ink">
                  Pre-class alarm
                </div>
                <div className="mt-px text-[12px] text-muted-2">
                  Buzz {remind} min before class
                </div>
              </div>
            </div>
            <Toggle on={alarm} onChange={setAlarm} />
          </div>
        </div>

        <div className="px-[18px] pb-10 pt-2.5">
          <button
            onClick={save}
            disabled={!canSave}
            className="btn-brand w-full rounded-[17px] py-[17px] text-center text-[17px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            Add to timetable
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-[7px] px-1 text-[12px] font-semibold tracking-wide text-muted-2">
        {label}
      </div>
      {children}
    </div>
  );
}

function TimeBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label
      className="flex-1 rounded-[15px] bg-white px-3.5 py-3"
      style={{ boxShadow: "0 1px 4px rgba(30,20,80,.05)" }}
    >
      <div className="text-[11px] font-semibold text-faint">{label}</div>
      <input
        type="time"
        value={toInput(value)}
        onChange={(e) => onChange(parseTime(e.target.value))}
        className="mt-0.5 w-full bg-transparent text-[17px] font-medium text-ink outline-none"
      />
    </label>
  );
}
