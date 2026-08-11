"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { PALETTE } from "@/lib/palette";
import { useStore, type GradeItem, type GradeKind } from "@/lib/store";
import { extraCreditHint, usedWeight } from "@/lib/gpa";
import { GradeKindPicker, WeightBudget } from "@/components/GradeFields";
import { useIsPro } from "@/lib/useIsPro";

export default function EditGradeScreen({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { hydrated, gradeById } = useStore();
  const { isPro, proLoaded } = useIsPro();

  // Wait for localStorage before deciding the grade doesn't exist — a direct
  // URL load reaches here with an empty store on the first render.
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

  const grade = gradeById(id);
  if (!grade) {
    return (
      <PhoneFrame>
        <div className="flex h-full items-center justify-center bg-aurora">
          <p className="text-muted">Grade not found.</p>
        </div>
      </PhoneFrame>
    );
  }

  return <EditForm grade={grade} />;
}

/** Mounted only once the grade exists, so useState prefills see real data. */
function EditForm({ grade }: { grade: GradeItem }) {
  const router = useRouter();
  const { classes, grades, updateGrade } = useStore();

  const [classId, setClassId] = useState<string | null>(grade.classId);
  const [title, setTitle] = useState(grade.title);
  const [kind, setKind] = useState<GradeKind | undefined>(grade.kind);
  const [score, setScore] = useState(String(grade.score));
  const [max, setMax] = useState(String(grade.max));
  const [weight, setWeight] = useState(String(grade.weight));
  const [date, setDate] = useState(grade.date);

  const selectedClass = classes.find((c) => c.id === classId) ?? null;
  // Everything else in the class — this grade's own weight is what's being
  // edited, so counting it would make the budget read as full already.
  const used = selectedClass
    ? usedWeight(
        grades.filter((g) => g.classId === selectedClass.id && g.id !== grade.id),
      )
    : 0;

  const scoreN = Number(score);
  const maxN = Number(max);
  const weightN = Number(weight);
  const extraCredit = extraCreditHint(scoreN, maxN);
  // score > max stays allowed — extra credit is real and classAverage handles
  // it. See the same note on the add form.
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

  const save = () => {
    if (!canSave || !selectedClass) return;
    updateGrade(grade.id, {
      classId: selectedClass.id,
      title: title.trim(),
      score: scoreN,
      max: maxN,
      weight: weightN,
      date,
      kind,
    });
    router.push("/grades");
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
          <div className="text-[17px] font-semibold text-ink">Edit Grade</div>
          <button
            onClick={save}
            disabled={!canSave}
            className="text-[16px] font-semibold"
            style={{ color: canSave ? "var(--color-brand)" : "var(--color-hint)" }}
          >
            Save
          </button>
        </div>

        <div className="no-scrollbar flex flex-1 flex-col gap-[18px] overflow-y-auto px-[18px] pb-8 pt-2">
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
                            background: "var(--chip)",
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
            <GradeKindPicker value={kind} onChange={setKind} />
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
              <NumberBox label="WEIGHT %" value={weight} onChange={setWeight} />
            </div>
            {extraCredit && (
              <p className="mt-2 px-1 text-[12px] leading-snug text-[var(--warn-ink)]">
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
        </div>

        <div className="px-[18px] pb-10 pt-2.5">
          <button
            onClick={save}
            disabled={!canSave}
            className="btn-brand w-full rounded-[17px] py-[17px] text-center text-[17px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            Save changes
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
