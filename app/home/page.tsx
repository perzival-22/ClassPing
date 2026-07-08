"use client";

import { useState } from "react";
import { PhoneFrame } from "@/components/PhoneFrame";
import { TabBar } from "@/components/TabBar";
import { ArrowRightIcon, ArrowLeftIcon, BellIcon } from "@/components/icons";
import { PALETTE } from "@/lib/palette";
import { useStore, type ClassItem, type DayIndex } from "@/lib/store";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DATES = [6, 7, 8, 9, 10];
const TODAY_COL: DayIndex = 0;
const NOW_MIN = 9 * 60 + 45;

function fmtHM(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function fmtRange(start: number, end: number) {
  const sH = Math.floor(start / 60);
  const eH = Math.floor(end / 60);
  const sAmpm = sH >= 12 ? "PM" : "AM";
  const eAmpm = eH >= 12 ? "PM" : "AM";
  const s12 = sH % 12 === 0 ? 12 : sH % 12;
  const e12 = eH % 12 === 0 ? 12 : eH % 12;
  const sm = (start % 60).toString().padStart(2, "0");
  const em = (end % 60).toString().padStart(2, "0");
  if (sAmpm === eAmpm) {
    return `${s12}:${sm} – ${e12}:${em} ${eAmpm}`;
  }
  return `${s12}:${sm} ${sAmpm} – ${e12}:${em} ${eAmpm}`;
}

const hour = Math.floor(NOW_MIN / 60);
const GREETING =
  hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

export default function HomeScreen() {
  const { classes, profile } = useStore();
  const [offset, setOffset] = useState(0);

  const dayIndex = ((TODAY_COL + offset) % 5) as DayIndex;
  const isToday = offset === 0;

  const dayClasses = classes
    .filter((c) => c.days.includes(dayIndex))
    .sort((a, b) => a.start - b.start);

  const isEmpty = dayClasses.length === 0;
  // Have we looped through all 5 working days with no classes anywhere?
  const checkedAll = offset >= 4 && isEmpty;

  const nextDayIndex = ((dayIndex + 1) % 5) as DayIndex;
  const nextDayName = DAY_NAMES[nextDayIndex];

  // Label for the day pill
  const dayLabel = isToday
    ? `Today · ${DAY_SHORT[dayIndex]}, Jul ${DATES[dayIndex]}`
    : `${DAY_NAMES[dayIndex]} · Jul ${DATES[dayIndex]}`;

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-canvas">
        {/* header */}
        <div className="px-5 pb-2 pt-16">
          <p className="text-[13px] font-semibold text-muted-2">
            {GREETING}, {profile.username.split(/[.\s_-]/)[0] || profile.username} 👋
          </p>
          <h1 className="mt-0.5 font-[family-name:var(--font-fredoka)] text-[30px] font-semibold leading-tight text-ink">
            {isToday ? "Today's Schedule" : `${DAY_NAMES[dayIndex]}'s Schedule`}
          </h1>
        </div>

        {/* day navigation pill */}
        <div className="flex items-center gap-2 px-5 pb-3 pt-1">
          {!isToday && (
            <button
              onClick={() => setOffset((o) => Math.max(0, o - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white transition active:scale-95"
              style={{ boxShadow: "0 1px 6px rgba(30,20,80,.09)" }}
              aria-label="Previous day"
            >
              <ArrowLeftIcon className="h-[18px] w-[18px] text-brand" />
            </button>
          )}
          <span
            className="rounded-full px-3.5 py-[6px] text-[13px] font-semibold"
            style={{
              background: isToday ? "#EAE9FB" : "#F0EFF6",
              color: isToday ? "#5B54E8" : "#6B6790",
            }}
          >
            {dayLabel}
          </span>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-32 pt-1">
          {/* ── classes exist ── */}
          {!isEmpty && (
            <div className="flex flex-col gap-3">
              {dayClasses.map((c) => (
                <ClassCard key={c.id} c={c} nowMin={isToday ? NOW_MIN : -1} />
              ))}
            </div>
          )}

          {/* ── empty state ── */}
          {isEmpty && !checkedAll && (
            <div className="mt-10 flex flex-col items-center text-center">
              <div
                className="mb-5 flex h-[80px] w-[80px] items-center justify-center rounded-[28px]"
                style={{ background: "#EAE9FB" }}
              >
                <span className="text-[38px]">🌿</span>
              </div>
              <h2 className="text-[20px] font-semibold text-ink">
                Looks like you&apos;re free!
              </h2>
              <p className="mt-1.5 max-w-[220px] text-[14px] leading-snug text-muted">
                {isToday
                  ? "Nothing scheduled for today."
                  : `Nothing on ${DAY_NAMES[dayIndex]}.`}
              </p>
              <button
                onClick={() => setOffset((o) => o + 1)}
                className="mt-6 flex items-center gap-2 rounded-[15px] px-5 py-[13px] text-[15px] font-semibold text-white transition active:scale-[0.97]"
                style={{
                  background: "linear-gradient(180deg, #6157ec, #5045d8)",
                  boxShadow: "0 10px 24px rgba(80,69,216,.32)",
                }}
              >
                View {nextDayName}
                <ArrowRightIcon className="h-[18px] w-[18px]" />
              </button>
            </div>
          )}

          {/* ── whole week is free ── */}
          {checkedAll && (
            <div className="mt-10 flex flex-col items-center text-center">
              <div
                className="mb-5 flex h-[80px] w-[80px] items-center justify-center rounded-[28px]"
                style={{ background: "#EAE9FB" }}
              >
                <span className="text-[38px]">🎉</span>
              </div>
              <h2 className="text-[20px] font-semibold text-ink">
                You&apos;re all free this week!
              </h2>
              <p className="mt-1.5 max-w-[230px] text-[14px] leading-snug text-muted">
                No classes scheduled Mon – Fri. Enjoy your time!
              </p>
              <button
                onClick={() => setOffset(0)}
                className="mt-6 rounded-[15px] px-5 py-[13px] text-[15px] font-semibold text-brand transition active:scale-[0.97]"
                style={{ background: "#EAE9FB" }}
              >
                Back to Today
              </button>
            </div>
          )}

          {/* ── next-day teaser when viewing today and today has classes ── */}
          {isToday && !isEmpty && (
            <button
              onClick={() => setOffset(1)}
              className="mt-5 flex w-full items-center justify-between rounded-[18px] px-4 py-3.5 transition active:scale-[0.98]"
              style={{
                background: "rgba(91,84,232,.06)",
                border: "1px solid rgba(91,84,232,.1)",
              }}
            >
              <span className="text-[14px] font-semibold text-brand">
                View {DAY_NAMES[1]}&apos;s schedule
              </span>
              <ArrowRightIcon className="h-[18px] w-[18px] text-brand" />
            </button>
          )}
        </div>

        <TabBar />
      </div>
    </PhoneFrame>
  );
}

function ClassCard({ c, nowMin }: { c: ClassItem; nowMin: number }) {
  const t = PALETTE[c.color];
  const isPast = nowMin > 0 && nowMin > c.end;
  const isNow = nowMin > 0 && nowMin >= c.start && nowMin <= c.end;

  return (
    <div
      className="flex items-stretch gap-0 overflow-hidden rounded-[18px] bg-white transition"
      style={{
        boxShadow: "0 2px 10px rgba(30,20,80,.06)",
        opacity: isPast ? 0.55 : 1,
      }}
    >
      {/* color bar */}
      <div className="w-[5px] shrink-0" style={{ background: t.bar }} />

      <div className="flex min-w-0 flex-1 items-center gap-3 py-4 pl-4 pr-4">
        {/* colored icon blob */}
        <div
          className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[13px] text-[15px] font-bold"
          style={{ background: t.bg, color: t.text }}
        >
          {c.short}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-ink">
            {c.name}
          </div>
          <div className="mt-[3px] text-[13px] text-muted">
            {fmtRange(c.start, c.end)}
          </div>
        </div>

        {isNow && (
          <span className="shrink-0 rounded-full bg-[#34C759] px-2.5 py-[4px] text-[11px] font-bold text-white">
            Now
          </span>
        )}
        {isPast && (
          <span className="shrink-0 text-[12px] font-medium text-hint">
            Done
          </span>
        )}
        {!isNow && !isPast && nowMin > 0 && (
          <div className="flex shrink-0 items-center gap-1 text-[12px] text-muted">
            <BellIcon className="h-[14px] w-[14px]" />
            <span>{fmtHM(c.start)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
