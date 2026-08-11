"use client";

import { useEffect } from "react";
import { TrophyIcon } from "./icons";
import {
  MILESTONES,
  STREAK_LOOP,
  milestone,
  nextMilestone,
  trophyCounts,
  trophyTimeline,
  type Trophy,
  type TrophyState,
} from "@/lib/trophies";

/**
 * The trophy cabinet: a count of each tier, the graph of when they landed,
 * and the moment one is won.
 */

/* ── header row ─────────────────────────────────────────── */

/**
 * Bronze / Gold / Platinum with their totals, sitting above everything else
 * on the Tasks screen. Shown at zero too — an empty cabinet is the thing that
 * explains what the streak is for.
 */
export function TrophyBar({
  trophies,
  onOpen,
}: {
  trophies: TrophyState;
  /** Opens the timeline graph. */
  onOpen: () => void;
}) {
  const counts = trophyCounts(trophies.trophies);
  const total = trophies.trophies.length;
  const next = nextMilestone(trophies.streak);

  return (
    <button
      onClick={onOpen}
      aria-label={`Trophies: ${total} earned. Open the timeline.`}
      className="glass flex w-full items-center gap-2 rounded-[18px] px-3 py-2.5 text-left transition active:scale-[0.99]"
    >
      <div className="flex flex-1 items-center gap-1.5">
        {MILESTONES.map((m) => (
          <span
            key={m.tier}
            className="flex items-center gap-1 rounded-full px-2 py-[3px]"
            style={{
              background: m.soft,
              opacity: counts[m.tier] > 0 ? 1 : 0.5,
            }}
            title={m.label}
          >
            <TrophyIcon
              className="h-[15px] w-[15px]"
              face={m.face}
              ring={m.ring}
            />
            <span
              className="text-[12.5px] font-bold tabular-nums"
              style={{ color: m.ring }}
            >
              {counts[m.tier]}
            </span>
          </span>
        ))}
      </div>

      {/* What the current run is worth, so the row is a live thing rather
          than a scoreboard of the past. */}
      <span className="shrink-0 text-right text-[11px] font-medium leading-tight text-muted-2">
        {next ? (
          <>
            {trophies.streak}/{next.at}
            <br />
            to {next.label}
          </>
        ) : (
          <>
            {STREAK_LOOP}/{STREAK_LOOP}
            <br />
            complete
          </>
        )}
      </span>
    </button>
  );
}

/* ── the graph ──────────────────────────────────────────── */

const W = 320;
const H = 168;
const PAD = { top: 14, right: 14, bottom: 26, left: 26 };

const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * When each trophy was earned, plotted as a running total.
 *
 * Cumulative rather than per-tier: the line only ever climbs, so the shape
 * says something true and encouraging — where the flat stretches were, and
 * where the semester picked up. Each point is colored by the tier it was.
 */
export function TrophyGraph({ trophies }: { trophies: Trophy[] }) {
  const points = trophyTimeline(trophies);

  if (points.length === 0) {
    return (
      <div className="py-10 text-center">
        <span className="text-[34px]">🏆</span>
        <p className="mx-auto mt-3 max-w-[230px] text-[13.5px] leading-snug text-muted">
          No trophies yet. Finish three assignments in a row before their
          deadlines and Bronze is yours.
        </p>
      </div>
    );
  }

  const first = points[0].time;
  const last = points[points.length - 1].time;
  const span = last - first;
  // A run of trophies earned in one sitting collapses to a single x — space
  // those evenly by order instead, so the line stays a line.
  const byIndex = span < 3600_000;

  const maxY = points[points.length - 1].total;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const x = (p: (typeof points)[number], i: number) =>
    points.length === 1
      ? PAD.left + plotW / 2
      : PAD.left +
        plotW *
          (byIndex ? i / (points.length - 1) : (p.time - first) / span);
  const y = (total: number) => PAD.top + plotH * (1 - total / maxY);

  const path = points.map((p, i) => `${x(p, i)},${y(p.total)}`).join(" ");
  // Gridlines at whole trophies, thinned so a long semester doesn't stripe.
  const step = Math.max(1, Math.ceil(maxY / 4));
  const ticks: number[] = [];
  for (let v = step; v <= maxY; v += step) ticks.push(v);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Line graph of ${points.length} trophies earned between ${shortDate(first)} and ${shortDate(last)}`}
      >
        {/* horizontal rules + y labels */}
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--line)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={y(v) + 3.5}
              textAnchor="end"
              fontSize="9"
              fill="var(--color-faint)"
            >
              {v}
            </text>
          </g>
        ))}

        {/* baseline */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          stroke="var(--line)"
          strokeWidth="1"
        />

        {/* the climb */}
        {points.length > 1 && (
          <polyline
            points={path}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* one dot per trophy, in its own metal */}
        {points.map((p, i) => {
          const m = milestone(p.tier);
          return (
            <circle
              key={`${p.at}-${i}`}
              cx={x(p, i)}
              cy={y(p.total)}
              r="5"
              fill={m.face}
              stroke={m.ring}
              strokeWidth="1.8"
            />
          );
        })}

        {/* x labels: just the ends — a phone-width axis can't hold more */}
        <text
          x={PAD.left}
          y={H - 8}
          fontSize="9.5"
          fill="var(--color-faint)"
          textAnchor="start"
        >
          {shortDate(first)}
        </text>
        {points.length > 1 && (
          <text
            x={W - PAD.right}
            y={H - 8}
            fontSize="9.5"
            fill="var(--color-faint)"
            textAnchor="end"
          >
            {shortDate(last)}
          </text>
        )}
      </svg>

      {/* the same data as a list, which is what you actually read to answer
          "when did I get that one?" — and what a screen reader gets */}
      <ul className="mt-3 flex flex-col gap-1.5">
        {points
          .slice()
          .reverse()
          .slice(0, 8)
          .map((p, i) => {
            const m = milestone(p.tier);
            return (
              <li
                key={`${p.at}-${i}`}
                className="flex items-center gap-2.5 rounded-[12px] px-2.5 py-1.5"
                style={{ background: "var(--bg-input)" }}
              >
                <TrophyIcon
                  className="h-[16px] w-[16px] shrink-0"
                  face={m.face}
                  ring={m.ring}
                />
                <span className="flex-1 text-[13px] font-semibold text-ink">
                  {m.label}
                </span>
                <span className="text-[12px] text-muted-2">
                  {new Date(p.time).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </li>
            );
          })}
      </ul>
      {points.length > 8 && (
        <p className="mt-2 text-center text-[12px] text-faint">
          Showing the 8 most recent of {points.length}.
        </p>
      )}
    </div>
  );
}

/** The graph in a sheet, with the semester totals above it. */
export function TrophyGraphSheet({
  trophies,
  onClose,
}: {
  trophies: TrophyState;
  onClose: () => void;
}) {
  const counts = trophyCounts(trophies.trophies);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(10,8,24,.55)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Trophy timeline"
    >
      <div
        className="no-scrollbar max-h-[86%] w-full overflow-y-auto rounded-t-[26px] bg-white px-5 pb-8 pt-4"
        style={{ boxShadow: "0 -8px 32px rgba(10,8,24,.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: "var(--line-strong)" }}
        />

        <h2 className="font-[family-name:var(--font-fredoka)] text-[22px] font-semibold leading-tight text-ink">
          Your trophies
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-muted">
          Every one you&apos;ve earned this semester, and when it landed.
        </p>

        <div className="mt-4 flex gap-2.5">
          {MILESTONES.map((m) => (
            <div
              key={m.tier}
              className="flex-1 rounded-[16px] px-2 py-3 text-center"
              style={{ background: m.soft }}
            >
              <TrophyIcon
                className="mx-auto h-[22px] w-[22px]"
                face={m.face}
                ring={m.ring}
              />
              <div
                className="mt-1.5 text-[20px] font-bold leading-none tabular-nums"
                style={{ color: m.ring }}
              >
                {counts[m.tier]}
              </div>
              <div
                className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide"
                style={{ color: m.ring, opacity: 0.85 }}
              >
                {m.label}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <TrophyGraph trophies={trophies.trophies} />
        </div>

        <div
          className="mt-5 rounded-[16px] px-4 py-3.5"
          style={{ background: "var(--bg-input)" }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-widest text-faint">
            How it works
          </div>
          <p className="mt-1.5 text-[13px] leading-snug text-muted">
            Finish assignments before their deadline and the streak climbs:
            3 in a row is Bronze, 5 is Gold, 7 is Platinum. Hit Platinum and
            the count starts again from zero. Miss one and it resets.
          </p>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-brand transition active:scale-[0.98]"
          style={{ background: "var(--brand-soft)" }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

/* ── the moment one is won ──────────────────────────────── */

/** A tap-anywhere overlay announcing a new trophy. */
export function TrophyCelebration({
  trophy,
  onClose,
}: {
  trophy: Trophy;
  onClose: () => void;
}) {
  const m = milestone(trophy.tier);

  // Long enough to read, short enough not to be in the way of the next tick.
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <button
      onClick={onClose}
      aria-label="Dismiss"
      className="absolute inset-0 z-[60] flex items-center justify-center px-8"
      style={{ background: "rgba(10,8,24,.6)" }}
    >
      <div
        role="status"
        className="w-full rounded-[26px] px-6 py-7 text-center"
        style={{
          background: "var(--bg-card)",
          boxShadow: "0 18px 48px rgba(10,8,24,.4)",
        }}
      >
        <div
          className="mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full"
          style={{ background: m.soft }}
        >
          <TrophyIcon className="h-10 w-10" face={m.face} ring={m.ring} />
        </div>
        <div
          className="mt-4 font-[family-name:var(--font-fredoka)] text-[24px] font-semibold leading-tight"
          style={{ color: m.ring }}
        >
          {m.label} unlocked
        </div>
        <p className="mt-1.5 text-[14px] leading-snug text-muted">
          {m.tier === "platinum"
            ? "Seven in a row. The streak resets — go and win it again."
            : `${m.at} assignments in a row, all before the deadline.`}
        </p>
        <span className="mt-4 block text-[12px] font-medium text-faint">
          Tap to dismiss
        </span>
      </div>
    </button>
  );
}
