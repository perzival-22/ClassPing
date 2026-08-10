"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { TabBar } from "@/components/TabBar";
import { WeekSkeleton } from "@/components/Skeleton";
import { BellSolid, ArrowLeftIcon, ArrowRightIcon, PencilIcon } from "@/components/icons";
import { PALETTE } from "@/lib/palette";
import { useStore, useNow, weekInfo, fmtMD, type ClassItem, type DayIndex } from "@/lib/store";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];
const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"];
// Defaults when the timetable fits inside a typical school day; the grid
// stretches beyond these to fit any class, so nothing renders off-plot.
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 17;
const PX_PER_HOUR = 62;

export default function WeekScreen() {
  const { activeClasses: classes, hydrated } = useStore();
  const [dismissed, setDismissed] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  // The block the user tapped, plus which column they tapped it in — the same
  // class meets on several days and the sheet should say which one it opened.
  const [selected, setSelected] = useState<{ id: string; day: DayIndex } | null>(
    null,
  );
  const now = useNow();

  if (!now || !hydrated) {
    return <WeekSkeleton />;
  }

  // Anchor on the current Mon–Fri school week, then shift by whole weeks.
  const base = weekInfo(now);
  const monday = new Date(base.dates[0]);
  monday.setDate(monday.getDate() + weekOffset * 7);
  const dates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  // "Today" markers (highlight, now-line, upcoming banner) only apply to the
  // current week — clear them while browsing past/future weeks.
  const todayCol = weekOffset === 0 ? base.todayCol : null;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const weekLabel =
    weekOffset === 0
      ? "This Week"
      : weekOffset === 1
        ? "Next Week"
        : weekOffset === -1
          ? "Last Week"
          : weekOffset > 0
            ? `In ${weekOffset} Weeks`
            : `${-weekOffset} Weeks Ago`;
  const rangeLabel = `${dates[0]
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase()} ${dates[0].getDate()} – ${
    dates[0].getMonth() !== dates[4].getMonth()
      ? dates[4].toLocaleDateString("en-US", { month: "short" }).toUpperCase() + " "
      : ""
  }${dates[4].getDate()}`;

  // Grid bounds hug the timetable: a 7am lecture or 6pm seminar used to fall
  // outside the hardcoded 8–5 window and render invisibly off-grid.
  const startHour = Math.min(
    DEFAULT_START_HOUR,
    ...classes.map((c) => Math.floor(c.start / 60)),
  );
  const endHour = Math.max(
    DEFAULT_END_HOUR,
    ...classes.map((c) => Math.ceil(c.end / 60)),
  );
  const y = (mins: number) => ((mins - startHour * 60) / 60) * PX_PER_HOUR;

  const gridHeight = (endHour - startHour) * PX_PER_HOUR;
  const hours = Array.from(
    { length: endHour - startHour + 1 },
    (_, i) => startHour + i,
  );

  // next class on today's column starting within the next hour
  const upcoming =
    todayCol === null
      ? undefined
      : classes
          .filter((c) => c.days.includes(todayCol) && c.start > nowMin)
          .sort((a, b) => a.start - b.start)[0];
  const minsAway = upcoming ? upcoming.start - nowMin : 0;
  const showBanner = !dismissed && upcoming && minsAway <= 60;

  // Resolved from the store rather than captured on tap, so an edit made from
  // inside the sheet is reflected the moment the user comes back.
  const selectedClass = selected
    ? (classes.find((c) => c.id === selected.id) ?? null)
    : null;

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-aurora">
        {/* header */}
        <div className="flex items-end justify-between px-5 pb-2 pt-16">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-muted-2">
              {rangeLabel}
            </div>
            <h1 className="mt-0.5 font-[family-name:var(--font-fredoka)] text-[32px] font-semibold leading-tight text-ink">
              {weekLabel}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset((o) => o - 1)}
              aria-label="Previous week"
              className="glass flex h-10 w-10 items-center justify-center rounded-full text-brand transition active:scale-95"
            >
              <ArrowLeftIcon className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={() => setWeekOffset((o) => o + 1)}
              aria-label="Next week"
              className="glass flex h-10 w-10 items-center justify-center rounded-full text-brand transition active:scale-95"
            >
              <ArrowRightIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        {/* grid */}
        <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-28 pt-1.5">
          {/* day header */}
          <div className="mb-1.5 flex">
            <div className="w-[30px]" />
            <div className="flex flex-1">
              {DAYS.map((d, i) => {
                const isToday = i === todayCol;
                return (
                  <div key={d} className="flex-1 text-center">
                    <div
                      className="text-[11px] font-semibold"
                      style={{ color: isToday ? "var(--color-brand)" : "#9A96B4" }}
                    >
                      {d}
                    </div>
                    {isToday ? (
                      <div className="mx-auto mt-[3px] flex h-[26px] w-[26px] items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-white">
                        {dates[i].getDate()}
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[13px] font-semibold text-[#54506F]">
                        {dates[i].getDate()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* plot area */}
          <div className="flex" style={{ height: gridHeight }}>
            {/* hour gutter */}
            <div className="relative w-[30px]">
              {hours.map((h) => {
                const label = h > 12 ? h - 12 : h;
                return (
                  <div
                    key={h}
                    className="absolute right-1.5 -translate-y-1/2 text-[10px] text-[#ADA9C6]"
                    style={{ top: y(h * 60) }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>

            {/* days */}
            <div className="relative flex-1">
              {/* hour lines */}
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 h-px bg-[#E7E4F1]"
                  style={{ top: y(h * 60) }}
                />
              ))}

              {/* now line — only while a school day is in the plotted window */}
              {todayCol !== null &&
                nowMin >= startHour * 60 &&
                nowMin <= endHour * 60 && (
                  <>
                    <div
                      className="absolute left-0 right-0 z-[4] h-0.5 bg-coral"
                      style={{ top: y(nowMin) }}
                    />
                    <div
                      className="absolute z-[4] h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-coral"
                      style={{ top: y(nowMin), left: -3 }}
                    />
                  </>
                )}

              {/* columns */}
              <div className="absolute inset-0 flex">
                {dates.map((_, dayIdx) => (
                  <div
                    key={dayIdx}
                    className="relative flex-1"
                    style={
                      dayIdx > 0
                        ? { borderLeft: "1px solid #EFEDF6" }
                        : undefined
                    }
                  >
                    {classes
                      .filter((c) => c.days.includes(dayIdx as DayIndex))
                      .map((c) => (
                        <ClassBlock
                          key={c.id + dayIdx}
                          c={c}
                          y={y}
                          onOpen={() =>
                            setSelected({ id: c.id, day: dayIdx as DayIndex })
                          }
                        />
                      ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* in-app reminder banner */}
        {showBanner && upcoming && (
          <button
            onClick={() => setDismissed(true)}
            className="glass absolute left-3 right-3 top-[60px] z-30 flex items-center gap-3 rounded-[20px] px-3.5 py-3 text-left"
          >
            <div
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] text-white"
              style={{ background: "linear-gradient(145deg,#FF8A6E,#FF5A44)" }}
            >
              <BellSolid className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink">
                {upcoming.name} starts soon
              </div>
              <div className="mt-px text-[12.5px] text-muted">
                {fmtHM(upcoming.start)} · that&apos;s in {minsAway} minutes
              </div>
            </div>
            <div className="text-[11px] font-medium text-[#ADA9C6]">now</div>
          </button>
        )}

        {/* tapped a block → the full picture of that class */}
        {selectedClass && selected && (
          <ClassSheet
            c={selectedClass}
            day={selected.day}
            date={dates[selected.day]}
            onClose={() => setSelected(null)}
          />
        )}

        <TabBar />
      </div>
    </PhoneFrame>
  );
}

function ClassBlock({
  c,
  y,
  onOpen,
}: {
  c: ClassItem;
  /** Minutes → px, anchored to the grid's derived start hour. */
  y: (mins: number) => number;
  onOpen: () => void;
}) {
  const t = PALETTE[c.color];
  const top = y(c.start);
  const height = Math.max(y(c.end) - y(c.start), 34);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${c.name}, ${fmtHM(c.start)}`}
      className="absolute overflow-hidden rounded-lg px-[5px] py-[5px] text-left transition active:scale-[0.97]"
      style={{
        left: 2,
        right: 2,
        top,
        height,
        background: t.bg,
        borderLeft: `3px solid ${t.bar}`,
      }}
    >
      <div
        className="text-[10px] font-bold leading-[1.05]"
        style={{ color: t.text }}
      >
        {c.short}
      </div>
      <div
        className="mt-0.5 text-[8px] font-semibold"
        style={{ color: t.sub }}
      >
        {fmtHM(c.start).replace(/ (AM|PM)$/, "")}
      </div>
    </button>
  );
}

/**
 * Details for one class, over the grid.
 *
 * A timetable block is only wide enough for an abbreviation, so everything the
 * student actually needs when they tap it — where it is, who teaches it, the
 * full time, and whatever note they left themselves — has to live somewhere.
 * Here, rather than on a separate screen, so glancing at the week never costs
 * a navigation.
 */
function ClassSheet({
  c,
  day,
  date,
  onClose,
}: {
  c: ClassItem;
  day: DayIndex;
  date: Date;
  onClose: () => void;
}) {
  const router = useRouter();
  const t = PALETTE[c.color];
  const mins = c.end - c.start;
  const otherDays = [...c.days]
    .sort((a, b) => a - b)
    .filter((d) => d !== day)
    .map((d) => DAY_SHORT[d]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop doubles as the dismiss target, the gesture people expect. */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(20,14,50,.35)]"
      />
      <div
        className="relative max-h-[80%] overflow-y-auto rounded-t-[28px] bg-white px-5 pb-8 pt-3"
        style={{ boxShadow: "0 -8px 30px rgba(30,20,80,.18)" }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#E0DDEE]" />

        <div className="flex items-start gap-3">
          <div
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] text-[15px] font-bold"
            style={{ background: t.bg, color: t.text }}
          >
            {c.short}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] font-semibold leading-tight text-ink">
              {c.name}
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {DAY_FULL[day]}, {fmtMD(date)}
            </p>
          </div>
          <button
            onClick={() => router.push(`/class/${c.id}/edit`)}
            aria-label="Edit class"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95"
            style={{ background: "#F0EFF6" }}
          >
            <PencilIcon className="h-[15px] w-[15px] text-muted" />
          </button>
        </div>

        <div
          className="mt-4 rounded-[16px] px-4 py-1"
          style={{ background: "var(--bg-input)" }}
        >
          <DetailRow
            label="Time"
            value={`${fmtHM(c.start)} – ${fmtHM(c.end)}`}
            hint={`${mins} min`}
          />
          <DetailRow label="Room" value={c.room || "Not set"} muted={!c.room} />
          <DetailRow
            label="Teacher"
            value={c.instructor || "Not set"}
            muted={!c.instructor}
          />
          {otherDays.length > 0 && (
            <DetailRow label="Also on" value={otherDays.join(" · ")} />
          )}
          {typeof c.credits === "number" && (
            <DetailRow label="Credits" value={String(c.credits)} />
          )}
          <DetailRow
            label="Reminder"
            value={
              c.alarm ? `${c.remindBefore} min before` : "Off"
            }
            muted={!c.alarm}
          />
        </div>

        {/* the note the student left on this class */}
        {c.notes?.trim() ? (
          <div className="mt-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-faint">
              Your note
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-snug text-ink">
              {c.notes}
            </p>
          </div>
        ) : (
          <button
            onClick={() => router.push(`/class/${c.id}/edit`)}
            className="mt-3.5 w-full rounded-[14px] px-4 py-3 text-left text-[13px] text-muted"
            style={{ background: "var(--bg-input)" }}
          >
            + Add a note for this class — office hours, what to bring…
          </button>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-brand transition active:scale-[0.98]"
          style={{ background: "var(--brand-soft)" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  hint,
  muted,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div
      className="flex items-baseline gap-3 py-2.5"
      style={{ borderBottom: "1px solid rgba(30,20,80,.05)" }}
    >
      <span className="w-[74px] shrink-0 text-[12px] font-semibold text-muted-2">
        {label}
      </span>
      <span
        className="flex-1 text-[14px]"
        style={{ color: muted ? "var(--color-hint)" : "var(--color-ink)" }}
      >
        {value}
      </span>
      {hint && <span className="text-[12px] text-faint">{hint}</span>}
    </div>
  );
}

function fmtHM(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}
