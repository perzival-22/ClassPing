"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { TabBar } from "@/components/TabBar";
import { BellSolid } from "@/components/icons";
import { PALETTE } from "@/lib/palette";
import { useStore, type ClassItem, type DayIndex } from "@/lib/store";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];
const DATES = [6, 7, 8, 9, 10];
const START_HOUR = 8;
const END_HOUR = 17;
const PX_PER_HOUR = 62;
const NOW_MIN = 9 * 60 + 45; // mock "current time" → 9:45 AM Monday
const TODAY_COL: DayIndex = 0; // Monday

const y = (mins: number) => ((mins - START_HOUR * 60) / 60) * PX_PER_HOUR;

export default function WeekScreen() {
  const { classes } = useStore();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  const gridHeight = (END_HOUR - START_HOUR) * PX_PER_HOUR;
  const hours = Array.from(
    { length: END_HOUR - START_HOUR + 1 },
    (_, i) => START_HOUR + i,
  );

  // next class on today's column starting within the next hour
  const upcoming = classes
    .filter((c) => c.days.includes(TODAY_COL) && c.start > NOW_MIN)
    .sort((a, b) => a.start - b.start)[0];
  const minsAway = upcoming ? upcoming.start - NOW_MIN : 0;
  const showBanner = !dismissed && upcoming && minsAway <= 60;

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-canvas">
        {/* header */}
        <div className="flex items-end justify-between px-5 pb-2 pt-16">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-muted-2">
              JUL 6 – 10
            </div>
            <h1 className="mt-0.5 font-[family-name:var(--font-fredoka)] text-[32px] font-semibold leading-tight text-ink">
              This Week
            </h1>
          </div>
          <button
            onClick={() => router.push("/class/new")}
            aria-label="Add class"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[22px] text-brand"
            style={{ boxShadow: "0 2px 8px rgba(30,20,80,.08)" }}
          >
            +
          </button>
        </div>

        {/* grid */}
        <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-28 pt-1.5">
          {/* day header */}
          <div className="mb-1.5 flex">
            <div className="w-[30px]" />
            <div className="flex flex-1">
              {DAYS.map((d, i) => {
                const isToday = i === TODAY_COL;
                return (
                  <div key={d} className="flex-1 text-center">
                    <div
                      className="text-[11px] font-semibold"
                      style={{ color: isToday ? "#5B54E8" : "#9A96B4" }}
                    >
                      {d}
                    </div>
                    {isToday ? (
                      <div className="mx-auto mt-[3px] flex h-[26px] w-[26px] items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-white">
                        {DATES[i]}
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[13px] font-semibold text-[#54506F]">
                        {DATES[i]}
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

              {/* now line */}
              <div
                className="absolute left-0 right-0 z-[4] h-0.5 bg-coral"
                style={{ top: y(NOW_MIN) }}
              />
              <div
                className="absolute z-[4] h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-coral"
                style={{ top: y(NOW_MIN), left: -3 }}
              />

              {/* columns */}
              <div className="absolute inset-0 flex">
                {DATES.map((_, dayIdx) => (
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
                        <ClassBlock key={c.id + dayIdx} c={c} />
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
            className="absolute left-3 right-3 top-[60px] z-30 flex items-center gap-3 rounded-[20px] px-3.5 py-3 text-left"
            style={{
              background: "rgba(255,255,255,.82)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              boxShadow: "0 10px 30px rgba(60,40,120,.18)",
              border: "0.5px solid rgba(255,255,255,.6)",
            }}
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

        <TabBar />
      </div>
    </PhoneFrame>
  );
}

function ClassBlock({ c }: { c: ClassItem }) {
  const t = PALETTE[c.color];
  const top = y(c.start);
  const height = Math.max(y(c.end) - y(c.start), 34);
  return (
    <div
      className="absolute overflow-hidden rounded-lg px-[5px] py-[5px]"
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
