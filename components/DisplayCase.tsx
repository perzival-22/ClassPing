"use client";

import { PetAvatar, PetShelf } from "./ClassPet";
import { TrophyShelf } from "./Trophies";
import {
  collection,
  DEFAULT_PET_NAME,
  petStatus,
  runwayToLevel,
  tierRunway,
  TIERS,
  type PetState,
} from "@/lib/pet";
import {
  MILESTONES,
  nextMilestone,
  trophyCounts,
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
  const status = petStatus(progress.level, pet.bestTier, pet.equipped);
  const runway = tierRunway(xp.xp);
  const pets = collection(status.best.id);
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
              background: `radial-gradient(120px 96px at 50% 44%, ${status.shown.glow}, transparent 72%)`,
            }}
          />
          <PetAvatar status={status} size={132} />

          <div className="mt-4 flex items-baseline gap-2">
            <span className="max-w-[170px] truncate font-[family-name:var(--font-fredoka)] text-[19px] font-semibold text-ink">
              {pet.name || DEFAULT_PET_NAME}
            </span>
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-faint">
              {status.shown.label}
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

        {/* ── the pets ──
            The tiers already collected, on the same side and in the same
            cabinet as the trophies. Trophies are what a *streak* earned and
            pets are what the *term* earned — two different clocks, but both are
            objects you own, and the rail is where the things you own live.

            It sits above the trophy case rather than below it because it
            belongs to the portrait it hangs under: portrait, the climb, then
            what the climb has put on the shelf. */}
        <div className="mt-7 flex items-center justify-between px-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-faint">
            Pet shelf
          </h2>
          <span className="text-[11px] font-semibold tabular-nums text-muted-2">
            {pets.collected.length}/{TIERS.length}
          </span>
        </div>

        <PetShelf best={status.best.id} onOpen={onOpenPet} />

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
          {/* The same shelf the trophy sheet draws, at the rail's size. It
              was a private copy here until the sheet grew a case of its own —
              two copies of one shelf is one shelf that eventually learns
              something the other doesn't. */}
          {MILESTONES.map((m, i) => (
            <TrophyShelf
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
