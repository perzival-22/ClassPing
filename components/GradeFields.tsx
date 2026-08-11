"use client";

import type { GradeKind } from "@/lib/store";

/**
 * Fields shared by the grade editors — the add form, the full edit screen and
 * the quick editor on the Grades screen.
 *
 * The rules behind them live in lib/gpa.ts (`usedWeight`, `extraCreditHint`,
 * `GRADE_KINDS`) so they're unit-tested rather than trapped in a component:
 * the three editors used to answer the same questions differently, and that's
 * what let them drift apart.
 */

export const GRADE_KINDS: Array<{ id: GradeKind; label: string }> = [
  { id: "assignment", label: "Assignment" },
  { id: "quiz", label: "Quiz" },
  { id: "exam", label: "Exam" },
  { id: "project", label: "Project" },
];

/**
 * What kind of thing was graded.
 *
 * Before this, the add form's "Exam"/"Quiz" buttons just typed that word into
 * the title, so the type wasn't data and nothing could be changed afterwards —
 * renaming "Exam" to "Midterm" lost it entirely.
 */
export function GradeKindPicker({
  value,
  onChange,
  accent = "var(--color-brand)",
  compact,
}: {
  value: GradeKind | undefined;
  /** Passing undefined clears the type — tapping the active chip again. */
  onChange: (kind: GradeKind | undefined) => void;
  accent?: string;
  /** Tighter chips, for the inline editor on the Grades screen. */
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {GRADE_KINDS.map((k) => {
        const on = value === k.id;
        return (
          <button
            key={k.id}
            type="button"
            onClick={() => onChange(on ? undefined : k.id)}
            aria-pressed={on}
            className={`rounded-full font-semibold transition ${
              compact ? "px-2.5 py-1 text-[12px]" : "px-3.5 py-2 text-[13px]"
            }`}
            style={
              on
                ? { background: accent, color: "#fff" }
                : {
                    background: "var(--chip)",
                    color: "var(--color-muted)",
                    boxShadow: "0 1px 3px rgba(30,20,80,.05)",
                  }
            }
          >
            {k.label}
          </button>
        );
      })}
    </div>
  );
}

/** The little colour-coded tag shown on a grade row. */
export function GradeKindTag({ kind }: { kind: GradeKind }) {
  const tone = KIND_TONES[kind];
  return (
    <span
      className="rounded-full px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide"
      style={{ background: tone.bg, color: tone.text }}
    >
      {kind}
    </span>
  );
}

/** Exams read as higher-stakes than a quiz, and the colours should say so. */
const KIND_TONES: Record<GradeKind, { bg: string; text: string }> = {
  exam: { bg: "var(--warn-soft)", text: "var(--warn-ink)" },
  quiz: { bg: "var(--info-soft)", text: "var(--info-ink)" },
  assignment: { bg: "var(--brand-soft)", text: "var(--color-brand)" },
  project: { bg: "var(--good-soft)", text: "var(--good-ink)" },
};

/**
 * How much of the class's 100% this grade would take, and what's left.
 *
 * Weights are shares of a class, but each grade is entered alone, so five
 * items at the default 20% silently fill a class and a sixth pushes past it —
 * at which point the "what do I still need?" answer has nothing to work with.
 * This makes the budget visible while there's still a chance to fix it.
 */
export function WeightBudget({
  used,
  entered,
  className,
  onUseRemaining,
}: {
  /** Weight already allocated to other grades in this class. */
  used: number;
  /** The weight currently typed into the form. NaN while the field is empty. */
  entered: number;
  /** For the copy, e.g. "Organic Chemistry II". */
  className: string;
  /** Fills the field with whatever is unallocated. */
  onUseRemaining: (weight: number) => void;
}) {
  const pending = Number.isFinite(entered) && entered > 0 ? entered : 0;
  const left = Math.max(100 - used, 0);
  const total = used + pending;
  const over = total > 100;
  const canFill = left > 0 && pending !== left;

  return (
    <div className="mt-2.5">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--line)" }}
      >
        <div className="flex h-full">
          <div
            style={{
              width: `${Math.min(used, 100)}%`,
              background: over ? "#E88040" : "var(--color-brand)",
            }}
          />
          <div
            style={{
              width: `${Math.min(pending, Math.max(100 - used, 0))}%`,
              background: over ? "var(--danger)" : "rgba(var(--brand-rgb),.45)",
            }}
          />
        </div>
      </div>

      <p
        className="mt-1.5 px-1 text-[12px] leading-snug"
        style={{ color: over ? "var(--danger-ink)" : "var(--color-muted-2)" }}
      >
        {over ? (
          <>
            This puts {className} at <strong>{round(total)}%</strong> of its
            weight. A class only has 100% to give — the average still works
            (it&apos;s scaled to fit), but &ldquo;what do I still need?&rdquo;
            can&apos;t be answered past 100%.
          </>
        ) : used === 0 ? (
          <>
            First grade for {className} — this takes {round(pending)}% of the
            class, leaving {round(100 - pending)}%.
          </>
        ) : (
          <>
            {round(used)}% of {className} is already logged.{" "}
            {pending > 0
              ? `This takes ${round(pending)}% more, leaving ${round(100 - total)}%.`
              : `${round(left)}% left to allocate.`}
          </>
        )}
      </p>

      {canFill && (
        <button
          type="button"
          onClick={() => onUseRemaining(left)}
          className="mt-1.5 rounded-full px-3 py-1 text-[12px] font-semibold text-brand"
          style={{ background: "var(--brand-soft)" }}
        >
          Use remaining {round(left)}%
        </button>
      )}
    </div>
  );
}

/** Weights are usually whole numbers; don't print 33.333333333333336%. */
const round = (n: number): string => String(Math.round(n * 10) / 10);
