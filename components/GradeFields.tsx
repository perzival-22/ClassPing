"use client";

/**
 * The weight-budget meter shared by the two grade forms.
 *
 * The copy that goes with it lives in lib/gpa.ts (`usedWeight`,
 * `extraCreditHint`) so the rules are unit-tested rather than trapped in a
 * component — the forms used to answer the same questions differently, and
 * that's what let them drift apart.
 */

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
        style={{ background: "#EDEBF6" }}
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
              background: over ? "#E84040" : "rgba(var(--brand-rgb),.45)",
            }}
          />
        </div>
      </div>

      <p
        className="mt-1.5 px-1 text-[12px] leading-snug"
        style={{ color: over ? "#C0392B" : "var(--color-muted-2)" }}
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
