"use client";

import { PetAvatar } from "./ClassPet";
import { TrophyIcon } from "./icons";
import {
  DEFAULT_PET_NAME,
  petStatus,
  runwayToLevel,
  tierRunway,
  type PetState,
} from "@/lib/pet";
import {
  MILESTONES,
  nextMilestone,
  trophyCounts,
  type Milestone,
  type TrophyState,
} from "@/lib/trophies";
import { levelProgress, type XpState } from "@/lib/xp";

/**
 * The display case — Home's right-hand rail, from `xl` up.
 *
 * Everything the app rewards you with, standing still in one place. On the
 * phone these live as rows you scroll past: the pet is a 58px card near the top
 * of Home, and the trophies are a bar on Tasks that you only meet if you go
 * looking. Both are *objects you own*, and a list is the wrong container for
 * an object you own — a case is.
 *
 * It mirrors Sidebar deliberately: same card surface, same hairline, same
 * width family. Navigation on the left, what the navigation has earned you on
 * the right, and the day's work in the middle. That symmetry is the whole
 * reason the rail can be this quiet and still read as part of the room.
 *
 * Nothing here is new state. The portrait is the tier the XP level already
 * grants, the shelves are the trophies already banked, and the runway is
 * arithmetic over both — a second scoreboard that could disagree with the
 * first is worse than no scoreboard at all.
 */
export function DisplayCase({
  pet,
  xp,
  trophies,
  onOpenPet,
  onOpenTrophies,
}: {
  pet: PetState;
  xp: XpState;
  trophies: TrophyState;
  /** Opens the pet sheet — where it gets named. */
  onOpenPet: () => void;
  /** Opens the trophy timeline. */
  onOpenTrophies: () => void;
}) {
  const progress = levelProgress(xp.xp);
  const status = petStatus(progress.level, pet.bestTier);
  const runway = tierRunway(xp.xp);
  const nextLevel = runwayToLevel(xp.xp, progress.level + 1);
  const counts = trophyCounts(trophies.trophies);
  const total = trophies.trophies.length;
  const nextTrophy = nextMilestone(trophies.streak);

  return (
    <aside
      className="hidden shrink-0 flex-col xl:flex xl:w-[300px]"
      style={{
        background: "var(--bg-card)",
        borderLeft: "1px solid var(--line)",
      }}
    >
      <div className="no-scrollbar flex h-full flex-col overflow-y-auto px-4 pb-6 pt-7">
        {/* ── the portrait ──
            Big enough to be looked at rather than read. The niche behind it is
            the tier's own glow, so the light in the case changes as the ladder
            does — the one place in the app where the reward gets to be the
            biggest thing on screen. */}
        <button
          onClick={onOpenPet}
          aria-label={`${pet.name || DEFAULT_PET_NAME}: ${status.line}. Open pet.`}
          className="relative flex cursor-pointer flex-col items-center rounded-[22px] px-3 pb-4 pt-6 transition hover:brightness-[.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.99]"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-2 top-2 h-[150px] rounded-[20px]"
            style={{
              background: `radial-gradient(120px 96px at 50% 44%, ${status.tier.glow}, transparent 72%)`,
            }}
          />
          <PetAvatar status={status} size={132} />

          <div className="mt-4 flex items-baseline gap-2">
            <span className="max-w-[170px] truncate font-[family-name:var(--font-fredoka)] text-[19px] font-semibold text-ink">
              {pet.name || DEFAULT_PET_NAME}
            </span>
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-faint">
              {status.tier.label}
            </span>
          </div>

          {status.demoted && (
            <span
              className="mt-1.5 rounded-full px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-wide text-white"
              style={{ background: status.best.ring }}
            >
              {status.best.label} earned
            </span>
          )}
        </button>

        {/* ── the climb ──
            The bar is the level; the line under it is what the level is worth.
            Quoted in assignments because a level is an abstraction and an
            assignment is a thing on the Tasks screen — see tierRunway. */}
        <div className="mt-3 px-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold text-ink">
              Level {progress.level}
              <span className="ml-1.5 font-medium text-muted-2">
                {progress.title}
              </span>
            </span>
            <span className="shrink-0 text-[11.5px] font-medium tabular-nums text-faint">
              {progress.atMax ? "Max" : `${progress.into} / ${progress.need}`}
            </span>
          </div>

          <div
            className="mt-2 h-[6px] w-full overflow-hidden rounded-full"
            style={{ background: "var(--surface-3)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round(progress.fraction * 100)}%`,
                background: "var(--brand-grad)",
                transition: "width .45s ease-out",
              }}
            />
          </div>

          {/* The near distance, always in assignments — it is the only number
              here small enough to act on today. The tier gets the line under
              it, unless it *is* the next level, in which case one sentence
              carries both and the prize is named in it. */}
          <p className="mt-2.5 text-[12.5px] leading-snug text-muted">
            {runway.next ? (
              <>
                About{" "}
                <span className="font-semibold text-ink">
                  {(runway.imminent ? runway : nextLevel).assignments}
                </span>{" "}
                more{" "}
                {(runway.imminent ? runway : nextLevel).assignments === 1
                  ? "assignment"
                  : "assignments"}{" "}
                on time to{" "}
                <span className="font-semibold text-ink">
                  {runway.imminent
                    ? `${runway.next.label} tier`
                    : `level ${progress.level + 1}`}
                </span>
                .
              </>
            ) : (
              <>Top tier. {pet.name || DEFAULT_PET_NAME} is as good as it gets.</>
            )}
          </p>

          {runway.next && !runway.imminent && (
            <p className="mt-1 text-[12px] leading-snug text-muted-2">
              <span className="font-semibold">{runway.next.label}</span> tier
              unlocks at level {runway.next.at}.
            </p>
          )}
        </div>

        {/* ── the case ── */}
        <div className="mt-7 flex items-center justify-between px-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">
            Trophy case
          </h2>
          <span className="text-[11px] font-semibold tabular-nums text-muted-2">
            {total}
          </span>
        </div>

        <button
          onClick={onOpenTrophies}
          aria-label={`Trophy case: ${total} earned. Open the timeline.`}
          className="mt-2 cursor-pointer rounded-[20px] px-3.5 pb-2.5 pt-3.5 text-left transition hover:brightness-[.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.99]"
          style={{
            background: "var(--surface-2)",
            // Recessed rather than raised: a cabinet is a hole in the wall with
            // shelves in it, and an inset edge is the cheapest way to say so.
            boxShadow: "inset 0 2px 5px rgba(30,20,80,.07)",
          }}
        >
          {MILESTONES.map((m, i) => (
            <Shelf
              key={m.tier}
              milestone={m}
              count={counts[m.tier]}
              last={i === MILESTONES.length - 1}
            />
          ))}

          {/* What the current run is worth. Without this the case is a record
              of the past; with it, the next medal has a distance. */}
          <div className="flex items-baseline justify-between pb-1 pt-2">
            <span className="text-[11px] font-medium text-muted-2">
              Current streak
            </span>
            <span className="text-[11.5px] font-semibold text-ink">
              {nextTrophy
                ? `${trophies.streak}/${nextTrophy.at} to ${nextTrophy.label}`
                : `${trophies.streak} in a row`}
            </span>
          </div>
        </button>
      </div>
    </aside>
  );
}

/**
 * One shelf: the medals standing on a ledge, captioned underneath.
 *
 * Drawn as objects rather than as a number with an icon next to it, because
 * three bronzes in a row is a thing you can see at a glance and "3" is a thing
 * you have to read. Past eight they stop being countable by eye, so the rest
 * collapse into a tally — a shelf that wraps to three rows stops looking like
 * a shelf.
 *
 * An empty shelf keeps its ledge and its caption. That emptiness is the whole
 * explanation of what the streak is for, and it is the state most users are in
 * on the day they first see this.
 */
function Shelf({
  milestone,
  count,
  last,
}: {
  milestone: Milestone;
  count: number;
  last: boolean;
}) {
  const shown = Math.min(count, 8);
  const extra = count - shown;

  return (
    <div className={last ? "" : "mb-2"}>
      <div className="flex min-h-[30px] items-end gap-[3px] px-0.5">
        {Array.from({ length: shown }).map((_, i) => (
          <TrophyIcon
            key={i}
            className="h-[22px] w-[22px] shrink-0"
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
