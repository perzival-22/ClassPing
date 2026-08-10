"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { TabBar } from "@/components/TabBar";
import { PencilIcon, PlusIcon, SparkleIcon, TrashIcon } from "@/components/icons";
import { FinalsCountdown } from "@/components/FinalsCountdown";
import { PALETTE } from "@/lib/palette";
import { useStore, longDate, type ClassItem, type GradeItem } from "@/lib/store";
import { downloadGradeReport, downloadGradeReportPdf } from "@/lib/report";
import {
  SCALES,
  type ScaleBand,
  classAverage,
  creditsFor,
  letterFor,
  overallGpa,
  pointsFor,
  projectedGpa,
  extraCreditHint,
  usedWeight,
  whatIfNeeded,
} from "@/lib/gpa";
import { useIsPro } from "@/lib/useIsPro";

export default function GradesScreen() {
  const router = useRouter();
  const { classes, activeClasses, grades, profile, deleteGrade, hydrated } =
    useStore();
  const { isPro, proLoaded } = useIsPro();

  if (!hydrated || !proLoaded) {
    return (
      <PhoneFrame>
        <div className="h-full bg-aurora" />
      </PhoneFrame>
    );
  }

  // Grades & GPA is a Pro feature.
  if (!isPro) {
    return (
      <PhoneFrame>
        <div className="flex h-full flex-col bg-aurora">
          <div className="flex flex-1 flex-col items-center justify-center px-8 pb-24 text-center">
            <div
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full text-white"
              style={{
                background: "var(--brand-grad)",
                boxShadow: "0 6px 20px rgba(var(--brand-rgb),.35)",
              }}
            >
              <SparkleIcon className="h-9 w-9 text-[#FFD76E]" />
            </div>
            <h2 className="mt-5 font-[family-name:var(--font-fredoka)] text-[22px] font-semibold text-ink">
              Track your grades with Pro
            </h2>
            <p className="mt-2 text-[14px] leading-snug text-muted">
              Log exams, assignments and quizzes per class, and watch your GPA
              update as scores come in — synced across your devices.
            </p>
            <button
              onClick={() => router.push("/upgrade")}
              className="btn-brand mt-6 w-full rounded-[17px] py-[15px] text-center text-[16px] font-semibold text-white transition active:scale-[0.98]"
            >
              See Pro plans
            </button>
          </div>
          <TabBar />
        </div>
      </PhoneFrame>
    );
  }

  // GPA covers the current term only. Blending every course ever taken makes
  // the number meaningless by year two, which is the whole reason archiving
  // exists — past terms keep their own GPA below.
  const scale = SCALES[profile.gradeScale ?? "standard"];
  const gpa = overallGpa(activeClasses, grades, scale);
  // Where the term lands if every goal is met. Null until a goal exists —
  // with none set it would just restate the GPA above it.
  const projected = projectedGpa(activeClasses, grades, scale);
  const gradedClasses = activeClasses.filter((c) =>
    grades.some((g) => g.classId === c.id),
  );
  // Only worth mentioning credits once they'd actually change the number.
  const usesCredits = activeClasses.some((c) => typeof c.credits === "number");

  // Archived classes that have grades, bucketed by the term they were
  // archived under. Undated archives fall back to a neutral heading.
  const pastTerms = new Map<string, typeof classes>();
  for (const c of classes) {
    if (!c.archived) continue;
    if (!grades.some((g) => g.classId === c.id)) continue;
    const key = c.term?.trim() || "Earlier";
    pastTerms.set(key, [...(pastTerms.get(key) ?? []), c]);
  }

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-aurora">
        {/* header */}
        <div className="flex items-center justify-between px-5 pb-3 pt-16">
          <h1 className="font-[family-name:var(--font-fredoka)] text-[28px] font-semibold leading-tight text-ink">
            Grades
          </h1>
          <button
            onClick={() => router.push("/grades/new")}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold text-brand transition active:scale-95"
            style={{ background: "var(--brand-soft)" }}
          >
            <PlusIcon className="h-[14px] w-[14px]" />
            Add grade
          </button>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-36">
          {/* GPA hero */}
          <div
            className="rounded-[24px] px-5 py-6 text-white"
            style={{
              background: "var(--brand-grad)",
              boxShadow: "0 6px 20px rgba(var(--brand-rgb),.3)",
            }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-widest text-white/70">
              Overall GPA
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-[family-name:var(--font-fredoka)] text-[44px] font-semibold leading-none">
                {gpa === null ? "—" : gpa.toFixed(2)}
              </span>
              <span className="text-[14px] text-white/75">/ 4.0</span>
            </div>
            <p className="mt-2 text-[12px] text-white/75">
              {gpa === null
                ? "Add your first grade to see your GPA."
                : `Across ${gradedClasses.length} graded ${gradedClasses.length === 1 ? "class" : "classes"}${
                    usesCredits ? ", weighted by credit hours" : ""
                  }.`}
            </p>

            {/* Where the term ends up if every class goal is met. */}
            {projected !== null && (
              <div
                className="mt-3.5 flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5"
                style={{ background: "rgba(255,255,255,.16)" }}
              >
                <span className="text-[15px]">🎯</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-white/70">
                    Projected by end of term
                  </div>
                  <div className="mt-px text-[12px] text-white/85">
                    If you hit every goal you&apos;ve set.
                  </div>
                </div>
                <span className="font-[family-name:var(--font-fredoka)] text-[24px] font-semibold leading-none">
                  {projected.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* per-class sections */}
          {classes.length === 0 && (
            <div
              className="mt-4 rounded-[18px] bg-white px-4 py-6 text-center"
              style={{ boxShadow: "0 2px 10px rgba(30,20,80,.05)" }}
            >
              <p className="text-[14px] text-muted">
                Add a class first, then log grades for it.
              </p>
              <button
                onClick={() => router.push("/class/new")}
                className="mt-3 text-[14px] font-semibold text-brand"
              >
                + Add your first class
              </button>
            </div>
          )}

          {activeClasses.map((c) => {
            // Newest first. localeCompare rather than `a < b ? 1 : -1`, which
            // never returns 0 and so claims either order for two grades sharing
            // a date — logging several in one sitting is the common case, and
            // the result was left to whichever sort V8 picked for that length.
            // Sort is stable, so same-day grades stay in the order they were
            // added.
            const classGrades = grades
              .filter((g) => g.classId === c.id)
              .sort((a, b) => b.date.localeCompare(a.date));
            // A class with a goal but no grades still belongs here — that's
            // the plan for it, and it counts toward the projection above.
            if (classGrades.length === 0 && !c.goal) return null;
            const t = PALETTE[c.color];
            const avg = classAverage(classGrades);

            return (
              <div
                key={c.id}
                className="mt-4 overflow-hidden rounded-[24px] bg-white"
                style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
              >
                {/* class header */}
                <div className="flex items-center gap-3 px-5 pt-5">
                  <div
                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] text-[13px] font-bold"
                    style={{ background: t.bg, color: t.text }}
                  >
                    {c.short}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-ink">
                      {c.name}
                    </div>
                    <div className="mt-[2px] text-[12px] text-muted">
                      {avg === null
                        ? "No grades logged yet"
                        : `${avg.toFixed(1)}% average`}
                      {typeof c.credits === "number"
                        ? ` · ${creditsFor(c)} cr`
                        : ""}
                    </div>
                  </div>
                  {avg !== null && (
                    <div className="text-right">
                      <div
                        className="text-[20px] font-bold"
                        style={{ color: t.bar }}
                      >
                        {letterFor(avg, scale)}
                      </div>
                      <div className="text-[11px] text-faint">
                        {pointsFor(avg, scale).toFixed(1)} pts
                      </div>
                    </div>
                  )}
                </div>

                {/* the target, and what's left to play for */}
                <GoalBlock
                  c={c}
                  grades={classGrades}
                  accent={t.bar}
                  scale={scale}
                />

                {/* grade rows */}
                <div className="mt-3 px-5 pb-4">
                  {classGrades.map((g) => (
                    <GradeRow key={g.id} g={g} onDelete={deleteGrade} />
                  ))}
                </div>
              </div>
            );
          })}

          {classes.length > 0 && grades.length === 0 && (
            <div
              className="mt-4 rounded-[18px] bg-white px-4 py-6 text-center"
              style={{ boxShadow: "0 2px 10px rgba(30,20,80,.05)" }}
            >
              <p className="text-[14px] text-muted">
                No grades logged yet. Add your first exam, assignment or quiz.
              </p>
              <button
                onClick={() => router.push("/grades/new")}
                className="mt-3 text-[14px] font-semibold text-brand"
              >
                + Add your first grade
              </button>
            </div>
          )}

          {/* ── export ──
              Available as soon as there's a term to describe, not just once
              a GPA exists: the PDF is the whole record, grades or not. */}
          {activeClasses.length > 0 && <ExportReportButton />}

          {/* ── past terms ──
              Archived work keeps its own frozen GPA instead of diluting this
              term's. This is what makes the app usable in year two. */}
          {[...pastTerms.entries()].map(([term, termClasses]) => {
            const termGpa = overallGpa(termClasses, grades, scale);
            return (
              <div key={term} className="mt-6">
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="text-[15px] font-semibold text-muted">
                    {term}
                  </h2>
                  <span className="text-[13px] font-semibold text-muted-2">
                    {termGpa === null ? "—" : `${termGpa.toFixed(2)} GPA`}
                  </span>
                </div>
                <div
                  className="overflow-hidden rounded-[18px] bg-white"
                  style={{ boxShadow: "0 2px 10px rgba(30,20,80,.05)" }}
                >
                  {termClasses.map((c, i) => {
                    const avg = classAverage(
                      grades.filter((g) => g.classId === c.id),
                    );
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 px-4 py-3"
                        style={
                          i ? { borderTop: "1px solid rgba(30,20,80,.06)" } : undefined
                        }
                      >
                        <div
                          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-[11px] font-bold"
                          style={{
                            background: PALETTE[c.color].bg,
                            color: PALETTE[c.color].text,
                          }}
                        >
                          {c.short}
                        </div>
                        <div className="min-w-0 flex-1 truncate text-[14px] text-ink">
                          {c.name}
                        </div>
                        <div className="text-[14px] font-semibold text-muted">
                          {avg === null ? "—" : letterFor(avg, scale)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* DaysToFinals countdown */}
          <FinalsCountdown />
        </div>

        <TabBar />
      </div>
    </PhoneFrame>
  );
}

/**
 * Downloads the term's record — the shareable artifact at the end of a
 * semester. PDF is the primary: it's the one you print or hand to a parent or
 * an advisor, and it carries each class with its grades, its assignments and
 * the note attached to it. CSV stays for anyone who wants to pivot the numbers.
 *
 * Pro-gated server-side like the calendar export; this screen is already behind
 * the Pro wall, so a 403 here means a lapsed plan.
 */
function ExportReportButton() {
  const router = useRouter();
  const { activeClasses, grades, tasks, profile } = useStore();
  const [exporting, setExporting] = useState<"pdf" | "csv" | null>(null);
  const [failed, setFailed] = useState(false);

  const run = async (format: "pdf" | "csv") => {
    setExporting(format);
    setFailed(false);
    try {
      const classIds = new Set(activeClasses.map((c) => c.id));
      const res = await fetch("/api/export/grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          classes: activeClasses,
          grades,
          // Archived terms are excluded above, so their work must be too.
          tasks: tasks.filter((t) => classIds.has(t.classId)),
          scale: profile.gradeScale ?? "standard",
          termName: profile.termName,
          studentName: profile.username,
          termStart: profile.termStart,
          termEnd: profile.termEnd,
        }),
      });
      if (res.status === 403) {
        router.push("/upgrade");
        return;
      }
      if (!res.ok) throw new Error(`export failed: ${res.status}`);
      if (format === "pdf") {
        downloadGradeReportPdf(await res.arrayBuffer());
      } else {
        downloadGradeReport(await res.text());
      }
    } catch {
      setFailed(true);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="mt-5">
      <button
        onClick={() => run("pdf")}
        disabled={exporting !== null}
        className="btn-brand w-full rounded-[15px] py-[14px] text-center text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
      >
        {exporting === "pdf" ? "Building your report…" : "Download report (PDF)"}
      </button>
      <p className="mt-2 text-center text-[12px] leading-snug text-muted-2">
        Every class with its grades, assignments and notes — ready to print.
      </p>
      <button
        onClick={() => run("csv")}
        disabled={exporting !== null}
        className="mt-2.5 w-full rounded-[15px] py-[11px] text-center text-[14px] font-semibold text-brand transition active:scale-[0.98] disabled:opacity-50"
        style={{ background: "var(--brand-soft)" }}
      >
        {exporting === "csv" ? "Exporting…" : "Spreadsheet instead (CSV)"}
      </button>
      {failed && (
        <p className="mt-2 text-center text-[12px] text-muted-2">
          Export didn&apos;t work — check your connection and try again.
        </p>
      )}
    </div>
  );
}

/**
 * The class's target grade, and what it will take to get there.
 *
 * The target is saved on the class rather than held in local state, because
 * it's the input to the projected GPA in the hero — a goal you have to re-pick
 * every visit can't predict anything. Picking the active band again clears it.
 *
 * "What do I need on the final?" is the single most-wanted number in a grade
 * tracker and the reason to open the app the week before finals, so it sits
 * directly under the target it's answering for.
 */
function GoalBlock({
  c,
  grades,
  accent,
  scale,
}: {
  c: ClassItem;
  grades: GradeItem[];
  accent: string;
  scale: ScaleBand[];
}) {
  const { updateClass } = useStore();
  const [picking, setPicking] = useState(false);

  // The top bands of whichever scale the student uses, so the chips read as
  // real grades ("A−") instead of arbitrary percentages.
  const bands = [...scale].sort((a, b) => b.min - a.min).slice(0, 5);
  const goal = typeof c.goal === "number" && c.goal > 0 ? c.goal : null;
  const result = goal === null ? null : whatIfNeeded(grades, goal);
  const avg = classAverage(grades);
  const open = picking || goal === null;
  // whatIfNeeded goes quiet once the weights total 100 or more. That's correct
  // for a class that really is fully graded and wrong for one where the
  // weights were mistyped, and the two look identical from here — so tell them
  // apart rather than letting the answer disappear without explanation.
  const used = usedWeight(grades);
  const over = used > 100;

  return (
    <div
      className="mx-5 mt-1 rounded-[14px] px-3.5 py-3"
      style={{ background: "var(--bg-input)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-muted">
          {goal === null ? "Aiming for" : "Goal"}
        </span>
        {goal !== null && !picking ? (
          <button
            onClick={() => setPicking(true)}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold text-white transition active:scale-95"
            style={{ background: accent }}
          >
            {letterFor(goal, scale)} · {goal}%
            <PencilIcon className="h-[11px] w-[11px]" />
          </button>
        ) : null}
      </div>

      {open && (
        <div className="mt-2 flex flex-wrap gap-1">
          {bands.map((b) => {
            const on = goal === b.min;
            return (
              <button
                key={b.letter}
                onClick={() => {
                  updateClass(c.id, { goal: on ? undefined : b.min });
                  setPicking(false);
                }}
                className="rounded-full px-2.5 py-1 text-[12px] font-bold transition"
                style={
                  on
                    ? { background: accent, color: "#fff" }
                    : { background: "#fff", color: "var(--color-muted)" }
                }
              >
                {b.letter}
              </button>
            );
          })}
          {goal !== null && (
            <button
              onClick={() => {
                updateClass(c.id, { goal: undefined });
                setPicking(false);
              }}
              className="rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-muted-2"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {goal === null ? (
        // The over-weight warning has to reach people who never set a goal
        // too — it's a data problem, not a goal problem.
        <p className="mt-2 text-[12.5px] leading-snug text-muted">
          {over ? (
            <>
              Heads up: your logged weights add up to{" "}
              <span className="font-bold" style={{ color: "#C0392B" }}>
                {Math.round(used * 10) / 10}%
              </span>
              , more than the 100% a class has. Tap a grade to fix its weight.
            </>
          ) : (
            <>
              Set a target and we&apos;ll work out what you still need — and
              fold it into your projected GPA.
            </>
          )}
        </p>
      ) : result ? (
        <p className="mt-2 text-[13px] leading-snug text-ink">
          {result.alreadySecured ? (
            <>
              Already locked in — even a zero on the remaining{" "}
              {result.remainingWeight}% keeps you there. 🎉
            </>
          ) : (
            <>
              You need{" "}
              <span className="font-bold" style={{ color: accent }}>
                {result.needed.toFixed(1)}%
              </span>{" "}
              on the remaining {result.remainingWeight}% of the grade.
              {result.outOfReach && (
                <span className="text-muted">
                  {" "}
                  That&apos;s above full marks — only extra credit gets you
                  there.
                </span>
              )}
            </>
          )}
        </p>
      ) : over ? (
        <p className="mt-2 text-[13px] leading-snug text-ink">
          Your logged weights add up to{" "}
          <span className="font-bold" style={{ color: "#C0392B" }}>
            {Math.round(used * 10) / 10}%
          </span>
          , more than the 100% a class has. The average still works — it&apos;s
          scaled to fit — but there&apos;s no &ldquo;remaining&rdquo; left to
          work out what you need. Tap a grade to fix its weight.
        </p>
      ) : (
        // Weights total exactly 100, so the class really is fully graded —
        // there's nothing left to predict, just a result to report.
        <p className="mt-2 text-[13px] leading-snug text-ink">
          {avg === null
            ? "Nothing graded yet."
            : avg >= goal
              ? `Everything's graded — you finished at ${avg.toFixed(1)}%. Goal met. 🎉`
              : `Everything's graded — you finished at ${avg.toFixed(1)}%, ${(goal - avg).toFixed(1)} points short.`}
        </p>
      )}
    </div>
  );
}

/**
 * One graded item. Tapping it opens the score and weight for editing right
 * here — changing "what I got" after a re-mark is the most common edit by far,
 * and bouncing to a separate screen for two numbers was too much ceremony.
 * The full editor (title, class, date) is one more tap away.
 */
function GradeRow({
  g,
  onDelete,
}: {
  g: GradeItem;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const { updateGrade } = useStore();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(String(g.score));
  const [max, setMax] = useState(String(g.max));
  const [weight, setWeight] = useState(String(g.weight));

  const pct = g.max > 0 ? (g.score / g.max) * 100 : 0;
  const scoreN = Number(score);
  const maxN = Number(max);
  const weightN = Number(weight);
  const extraCredit = extraCreditHint(scoreN, maxN);
  const canSave =
    Number.isFinite(scoreN) &&
    scoreN >= 0 &&
    Number.isFinite(maxN) &&
    maxN > 0 &&
    Number.isFinite(weightN) &&
    weightN > 0 &&
    weightN <= 100;

  const openEditor = () => {
    // Re-seed from the store each time, so a cancelled edit doesn't leave
    // stale text in the fields when the row is reopened.
    setScore(String(g.score));
    setMax(String(g.max));
    setWeight(String(g.weight));
    setOpen(true);
  };

  return (
    <div className="border-t" style={{ borderColor: "rgba(30,20,80,.06)" }}>
      <div className="flex items-center gap-3 py-3">
        <button
          onClick={() => (open ? setOpen(false) : openEditor())}
          aria-expanded={open}
          aria-label={`Edit ${g.title}`}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate text-[14px] font-medium text-ink">
            {g.title}
          </div>
          <div className="mt-[2px] text-[12px] text-muted">
            {longDate(g.date)} · weight {g.weight}%
          </div>
        </button>
        <div className="text-right">
          <div className="text-[14px] font-semibold text-ink">
            {g.score}/{g.max}
          </div>
          <div className="text-[11px] text-faint">{pct.toFixed(0)}%</div>
        </div>
        <button
          onClick={() => onDelete(g.id)}
          aria-label={`Delete ${g.title}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition active:scale-95"
          style={{ background: "#F0EFF6" }}
        >
          <TrashIcon className="h-[15px] w-[15px] text-[#9A96B4]" />
        </button>
      </div>

      {open && (
        <div
          className="mb-3 rounded-[14px] px-3 py-3"
          style={{ background: "var(--bg-input)" }}
        >
          <div className="flex gap-2">
            <QuickNumber label="EARNED" value={score} onChange={setScore} />
            <QuickNumber label="OUT OF" value={max} onChange={setMax} />
            <QuickNumber label="WEIGHT %" value={weight} onChange={setWeight} />
          </div>
          {extraCredit && (
            <p className="mt-2 px-0.5 text-[12px] leading-snug text-[#A96A00]">
              {extraCredit}
            </p>
          )}
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={() => router.push(`/grades/${g.id}/edit`)}
              className="text-[12.5px] font-semibold text-muted"
            >
              More options
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setOpen(false)}
              className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-muted"
              style={{ background: "#fff" }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!canSave) return;
                updateGrade(g.id, {
                  score: scoreN,
                  max: maxN,
                  weight: weightN,
                });
                setOpen(false);
              }}
              disabled={!canSave}
              className="btn-brand rounded-full px-4 py-1.5 text-[13px] font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex-1 rounded-[12px] bg-white px-3 py-2">
      <div className="text-[10px] font-semibold text-faint">{label}</div>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full bg-transparent text-[16px] font-medium text-ink outline-none"
      />
    </label>
  );
}
