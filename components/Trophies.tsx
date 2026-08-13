"use client";

import { useEffect } from "react";
import { TrophyIcon } from "./icons";
import {
  MILESTONES,
  STREAK_LOOP,
  milestone,
  nextMilestone,
  trophyCounts,
  type Milestone,
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

/* ── the case ───────────────────────────────────────────── */

/**
 * One tier's shelf: its medals standing on a lit ledge, named underneath.
 *
 * Drawn as objects rather than as a number with an icon next to it, because
 * three bronzes in a row is a thing you can see at a glance and "3" is a thing
 * you have to read. Past `max` they stop being countable by eye, so the rest
 * collapse into a tally — a shelf that wraps to three rows stops looking like
 * a shelf.
 *
 * An empty shelf keeps its ledge and its caption. That emptiness is the whole
 * explanation of what the streak is for, and it is the state most users are in
 * on the day they first see this.
 *
 * Shared by the rail and the sheet at two sizes. It used to be a private copy
 * in each, which is exactly the arrangement where one of them learns something
 * the other doesn't.
 */
export function TrophyShelf({
  milestone,
  count,
  last,
  size = 22,
  max = 8,
}: {
  milestone: Milestone;
  count: number;
  last: boolean;
  /** Medal size in px. The rail is cramped; the sheet has a little more room. */
  size?: number;
  /**
   * How many medals to draw before collapsing the rest into "+N".
   *
   * Eight, and the ceiling is arithmetic rather than taste: the narrowest
   * phone still in service is 320px, which leaves the case 252px of inner
   * width, and nine 24px medals with their gaps plus a "+N" does not fit in
   * it. A shelf whose contents slide out of the cabinet is worse than one
   * that says "+4" — and the exact count is printed on the same row anyway.
   */
  max?: number;
}) {
  const shown = Math.min(count, max);
  const extra = count - shown;

  return (
    <div className={last ? "" : "mb-2"}>
      <div
        className="flex items-end gap-[3px] px-0.5"
        style={{ minHeight: size + 8 }}
      >
        {Array.from({ length: shown }).map((_, i) => (
          <TrophyIcon
            key={i}
            className="shrink-0"
            style={{ width: size, height: size }}
            face={milestone.face}
            ring={milestone.ring}
          />
        ))}
        {extra > 0 && (
          <span
            className="ml-0.5 text-[11px] font-bold tabular-nums"
            style={{ color: milestone.ring }}
          >
            +{extra}
          </span>
        )}
      </div>

      {/* The ledge. Two tones rather than one line: a lit top edge over a
          darker body is what reads as a shelf with depth instead of a rule. */}
      <div
        className="h-[3px] rounded-full"
        style={{
          background: "var(--line-strong)",
          boxShadow: "inset 0 1px 0 var(--pill-active)",
          opacity: count > 0 ? 1 : 0.55,
        }}
      />

      <div className="flex items-baseline justify-between pt-[3px]">
        <span
          className="text-[10.5px] font-semibold uppercase tracking-wide"
          style={{
            color: count > 0 ? "var(--color-muted-2)" : "var(--color-hint)",
          }}
        >
          {milestone.label}
        </span>
        <span
          className="text-[12px] font-bold tabular-nums"
          style={{ color: count > 0 ? milestone.ring : "var(--color-hint)" }}
        >
          {count}
        </span>
      </div>
    </div>
  );
}

/**
 * The trophy case — every medal earned, standing on three shelves.
 *
 * This replaced a line graph of cumulative trophies over time, and the swap was
 * about what the thing is *for*. The graph answered "when did my term pick up?"
 * — a real question, but an analytics one, and it needed a date axis, a
 * cumulative series and a fallback for the common case of every trophy landing
 * in one afternoon. What a student opens this sheet to see is what they have,
 * which is a shelf of objects, not a trend.
 *
 * It is deliberately the same cabinet as the pet shelf in components/ClassPet:
 * recessed surface, lit ledges, a count per row. Trophies are what a *streak*
 * earned and pets are what the *term* earned — two different clocks — but both
 * are objects you own, and two kinds of reward in two unrelated containers
 * would read as two apps.
 */
export function TrophyCase({
  trophies,
  size = 24,
  max = 8,
}: {
  trophies: TrophyState;
  size?: number;
  max?: number;
}) {
  const counts = trophyCounts(trophies.trophies);
  const next = nextMilestone(trophies.streak);

  return (
    <div
      className="rounded-[20px] px-3.5 pb-2.5 pt-3.5"
      style={{
        background: "var(--surface-2)",
        // Recessed rather than raised: a cabinet is a hole in the wall with
        // shelves in it, and an inset edge is the cheapest way to say so.
        boxShadow: "inset 0 2px 5px rgba(30,20,80,.07)",
      }}
    >
      {MILESTONES.map((m, i) => (
        <TrophyShelf
          key={m.tier}
          milestone={m}
          count={counts[m.tier]}
          last={i === MILESTONES.length - 1}
          size={size}
          max={max}
        />
      ))}

      {/* What the current run is worth. Without this the case is a record of
          the past; with it, the next medal has a distance. */}
      <div className="flex items-baseline justify-between pb-1 pt-2.5">
        <span className="text-[11px] font-medium text-muted-2">
          Current streak
        </span>
        <span className="text-[11.5px] font-semibold text-ink">
          {next
            ? `${trophies.streak}/${next.at} to ${next.label}`
            : `${trophies.streak} in a row`}
        </span>
      </div>
    </div>
  );
}

/** The case in a sheet, with the semester total above it. */
export function TrophyCaseSheet({
  trophies,
  onClose,
}: {
  trophies: TrophyState;
  onClose: () => void;
}) {
  const total = trophies.trophies.length;

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
      aria-label="Trophy case"
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
          {total === 0
            ? "Nothing on the shelves yet. Finish three assignments in a row before their deadlines and Bronze is yours."
            : `Every one you've earned this semester — ${total} so far.`}
        </p>

        {/* The case, at sheet size. The three stat tiles that used to sit
            above the graph are gone with it: the shelves already carry a count
            per tier, and a number printed twice on one screen is a number that
            can eventually disagree with itself. */}
        <div className="mt-4">
          <TrophyCase trophies={trophies} />
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
