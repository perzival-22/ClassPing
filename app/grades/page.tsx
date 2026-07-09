"use client";

import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { TabBar } from "@/components/TabBar";
import { PlusIcon, SparkleIcon, TrashIcon } from "@/components/icons";
import { FinalsCountdown } from "@/components/FinalsCountdown";
import { PALETTE } from "@/lib/palette";
import { useStore, longDate, type GradeItem } from "@/lib/store";
import { classAverage, letterFor, overallGpa, pointsFor } from "@/lib/gpa";
import { useIsPro } from "@/lib/useIsPro";

export default function GradesScreen() {
  const router = useRouter();
  const { classes, grades, deleteGrade, hydrated } = useStore();
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

  const gpa = overallGpa(classes, grades);
  const gradedClasses = classes.filter((c) =>
    grades.some((g) => g.classId === c.id),
  );

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
                : `Across ${gradedClasses.length} graded ${gradedClasses.length === 1 ? "class" : "classes"}.`}
            </p>
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

          {classes.map((c) => {
            const classGrades = grades
              .filter((g) => g.classId === c.id)
              .sort((a, b) => (a.date < b.date ? 1 : -1));
            if (classGrades.length === 0) return null;
            const t = PALETTE[c.color];
            const avg = classAverage(classGrades)!;

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
                      {avg.toFixed(1)}% average
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="text-[20px] font-bold"
                      style={{ color: t.bar }}
                    >
                      {letterFor(avg)}
                    </div>
                    <div className="text-[11px] text-faint">
                      {pointsFor(avg).toFixed(1)} pts
                    </div>
                  </div>
                </div>

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

          {/* DaysToFinals countdown */}
          <FinalsCountdown />
        </div>

        <TabBar />
      </div>
    </PhoneFrame>
  );
}

function GradeRow({
  g,
  onDelete,
}: {
  g: GradeItem;
  onDelete: (id: string) => void;
}) {
  const pct = g.max > 0 ? (g.score / g.max) * 100 : 0;
  return (
    <div
      className="flex items-center gap-3 border-t py-3"
      style={{ borderColor: "rgba(30,20,80,.06)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-ink">
          {g.title}
        </div>
        <div className="mt-[2px] text-[12px] text-muted">
          {longDate(g.date)} · weight {g.weight}%
        </div>
      </div>
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
  );
}
