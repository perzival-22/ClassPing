"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { PALETTE } from "@/lib/palette";
import { useStore, type GradeKind } from "@/lib/store";
import { extraCreditHint, remainingWeight, usedWeight } from "@/lib/gpa";
import {
  GRADE_KINDS,
  GradeKindPicker,
  WeightBudget,
} from "@/components/GradeFields";
import { useIsPro } from "@/lib/useIsPro";

const DEFAULT_WEIGHT = 20;

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function AddGradeScreen() {
  const router = useRouter();
  const { classes, grades, addGrade, hydrated } = useStore();
  const { isPro, proLoaded } = useIsPro();

  // Logging a term's grades means several in a row for the same class, so
  // start on the class the last grade went to rather than on nothing.
  const [classId, setClassId] = useState<string | null>(
    () => grades[grades.length - 1]?.classId ?? null,
  );
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<GradeKind | undefined>("assignment");
  const [score, setScore] = useState("");
  const [max, setMax] = useState("100");
  const [weight, setWeight] = useState(String(DEFAULT_WEIGHT));
  const [date, setDate] = useState(todayIso());
  const [addedCount, setAddedCount] = useState(0);

  /**
   * Picking a type fills an empty title with its label, which is what the old
   * preset buttons did — except the type is now real data, so renaming this to
   * "Midterm" no longer throws away the fact that it was an exam.
   */
  const pickKind = (next: GradeKind | undefined) => {
    setKind(next);
    const wasLabel = GRADE_KINDS.some((k) => k.label === title.trim());
    if (next && (title.trim() === "" || wasLabel)) {
      setTitle(GRADE_KINDS.find((k) => k.id === next)!.label);
    }
  };

  if (!hydrated || !proLoaded) {
    return (
      <PhoneFrame>
        <div className="h-full bg-aurora" />
      </PhoneFrame>
    );
  }

  // Pro feature — same gate as the grades list.
  if (!isPro) {
    router.replace("/grades");
    return (
      <PhoneFrame>
        <div className="h-full bg-aurora" />
      </PhoneFrame>
    );
  }

  // A class the store no longer has (deleted since mount) must not stay
  // selected, or Save would write a grade with a dangling classId.
  const selectedClass = classes.find((c) => c.id === classId) ?? null;
  const classGrades = selectedClass
    ? grades.filter((g) => g.classId === selectedClass.id)
    : [];
  const used = usedWeight(classGrades);
  const left = remainingWeight(classGrades);

  const scoreN = Number(score);
  const maxN = Number(max);
  const weightN = Number(weight);
  const extraCredit = extraCreditHint(scoreN, maxN);
  // score > max is allowed on purpose: extra credit is real, and classAverage
  // already handles it. The form used to block it, which meant a 105/100 could
  // be logged by tapping a row on the Grades screen but not created here.
  const canSave =
    selectedClass !== null &&
    title.trim().length > 0 &&
    Number.isFinite(scoreN) &&
    scoreN >= 0 &&
    Number.isFinite(maxN) &&
    maxN > 0 &&
    Number.isFinite(weightN) &&
    weightN > 0 &&
    weightN <= 100 &&
    date.length > 0;

  const commit = () => {
    if (!canSave || !selectedClass) return false;
    addGrade({
      classId: selectedClass.id,
      title: title.trim(),
      score: scoreN,
      max: maxN,
      weight: weightN,
      date,
      kind,
    });
    return true;
  };

  const save = () => {
    if (commit()) router.push("/grades");
  };

  /** Keeps the class and the date, clears what changes per item. */
  const saveAndAddAnother = () => {
    if (!commit()) return;
    setTitle("");
    setScore("");
    setMax("100");
    // Suggest what's left after this one rather than the flat default, so a
    // run of assignments doesn't walk itself past 100%. Once the class is
    // full, fall back to the default and let the budget meter say why.
    const leftAfter = Math.max(left - weightN, 0);
    setWeight(String(leftAfter > 0 ? Math.min(DEFAULT_WEIGHT, leftAfter) : DEFAULT_WEIGHT));
    setAddedCount((n) => n + 1);
  };

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-aurora">
        {/* nav */}
        <div className="flex items-center justify-between px-5 pb-2.5 pt-[60px]">
          <button
            onClick={() => router.push("/grades")}
            className="text-[16px] font-medium text-muted-2"
          >
            Cancel
          </button>
          <div className="text-[17px] font-semibold text-ink">New Grade</div>
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
          {classes.length === 0 ? (
            <div
              className="rounded-[18px] bg-white px-4 py-6 text-center"
              style={{ boxShadow: "0 2px 10px rgba(30,20,80,.05)" }}
            >
              <p className="text-[14px] text-muted">
                You need a class before you can log a grade.
              </p>
              <button
                onClick={() => router.push("/class/new")}
                className="mt-3 text-[14px] font-semibold text-brand"
              >
                + Add your first class
              </button>
            </div>
          ) : (
            <>
              {/* class */}
              <Field label="CLASS">
                <div className="flex flex-wrap gap-2">
                  {classes.map((c) => {
                    const t = PALETTE[c.color];
                    const on = classId === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setClassId(c.id)}
                        className="rounded-xl px-3.5 py-2.5 text-[14px] font-semibold transition"
                        style={
                          on
                            ? { background: t.bar, color: "#fff" }
                            : {
                                background: "#fff",
                                color: t.text,
                                boxShadow: "0 1px 3px rgba(30,20,80,.05)",
                              }
                        }
                      >
                        {c.short}
                      </button>
                    );
                  })}
                </div>
              </Field>

              {/* type */}
              <Field label="TYPE">
                <GradeKindPicker value={kind} onChange={pickKind} />
              </Field>

              {/* title */}
              <Field label="WHAT WAS GRADED?">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-[15px] bg-white px-4 py-[15px] text-[16px] text-ink outline-none"
                  style={{ boxShadow: "0 1px 4px rgba(30,20,80,.05)" }}
                  placeholder="e.g. Midterm exam"
                />
              </Field>

              {/* score */}
              <Field label="SCORE">
                <div className="flex gap-2.5">
                  <NumberBox label="EARNED" value={score} onChange={setScore} />
                  <NumberBox label="OUT OF" value={max} onChange={setMax} />
                  <NumberBox
                    label="WEIGHT %"
                    value={weight}
                    onChange={setWeight}
                  />
                </div>
                {extraCredit && (
                  <p className="mt-2 px-1 text-[12px] leading-snug text-[#A96A00]">
                    {extraCredit}
                  </p>
                )}
                {selectedClass && (
                  <WeightBudget
                    used={used}
                    entered={weightN}
                    className={selectedClass.name}
                    onUseRemaining={(w) => setWeight(String(w))}
                  />
                )}
              </Field>

              {/* date */}
              <Field label="DATE">
                <label
                  className="block rounded-[15px] bg-white px-4 py-3"
                  style={{ boxShadow: "0 1px 4px rgba(30,20,80,.05)" }}
                >
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-transparent text-[16px] text-ink outline-none"
                  />
                </label>
              </Field>
            </>
          )}
        </div>

        {classes.length > 0 && (
          <div className="px-[18px] pb-10 pt-2.5">
            {addedCount > 0 && (
              <p className="mb-2 text-center text-[13px] font-medium text-brand">
                {addedCount} grade{addedCount === 1 ? "" : "s"} added —
                {selectedClass ? ` still on ${selectedClass.short}.` : ""}
              </p>
            )}
            <button
              onClick={save}
              disabled={!canSave}
              className="btn-brand w-full rounded-[17px] py-[17px] text-center text-[17px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
            >
              Add grade
            </button>
            {/* Logging a term means several in a row for one class; this keeps
                the class and the date so only the item's own numbers change. */}
            <button
              onClick={saveAndAddAnother}
              disabled={!canSave}
              className="mt-2.5 w-full rounded-[17px] py-[13px] text-center text-[15px] font-semibold text-brand transition active:scale-[0.98] disabled:opacity-50"
              style={{ background: "var(--brand-soft)" }}
            >
              Save & add another
            </button>
          </div>
        )}
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

function NumberBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label
      className="flex-1 rounded-[15px] bg-white px-3.5 py-3"
      style={{ boxShadow: "0 1px 4px rgba(30,20,80,.05)" }}
    >
      <div className="text-[11px] font-semibold text-faint">{label}</div>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full bg-transparent text-[17px] font-medium text-ink outline-none"
      />
    </label>
  );
}
