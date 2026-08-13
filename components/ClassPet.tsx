"use client";

import { useEffect, useState } from "react";
import {
  collection,
  DEFAULT_PET_NAME,
  MAX_PET_NAME,
  petStatus,
  shelves,
  TIERS,
  type PetState,
  type PetStatus,
  type Shelf,
  type Tier,
  type TierId,
} from "@/lib/pet";

/**
 * The ClassPet — a rank portrait.
 *
 * There is no expression left to draw (see the header of lib/pet.ts): the pet
 * is the long-arc reward and the only thing it reports is which tier the term
 * has earned. So nothing here plots anything — it frames the tier's artwork.
 */

export function PetAvatar({
  status,
  size = 96,
  arriving = false,
}: {
  status: PetStatus;
  size?: number;
  /**
   * Play the one-shot sweep. Off everywhere by default, and deliberately so: a
   * ring that turns forever on the home screen fights the calm the rest of the
   * app is built around. The motion belongs to the moment the tier is *won*,
   * where it says "this just changed" — after that it says nothing.
   */
  arriving?: boolean;
}) {
  /**
   * The ring is its own layer behind a smaller circular image, rather than a
   * `border` or padding on the image's own box. Three reasons: every tier's
   * ring is a conic gradient, which a border renders as four flat edges instead
   * of a sweep; the art is opaque, so it has to be clipped to the disc anyway;
   * and a separate layer is the only version that can be rotated on arrival
   * without spinning the portrait with it.
   *
   * That clipping is the load-bearing part. The artwork is JPEG — which cannot
   * carry an alpha channel — so it arrives as a filled rectangle. Laid over the
   * ring it would read as a photo pasted on a coloured circle; masked into the
   * disc it reads as a portrait, and the differing source aspect ratios stop
   * mattering because `object-cover` fills the circle either way.
   */
  const ring = Math.max(2, Math.round(size * 0.055));
  const inner = size - ring * 2;

  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        boxShadow: `0 0 ${Math.round(size * 0.3)}px ${status.shown.glow}`,
      }}
    >
      <span
        aria-hidden
        // Keyed on the tier so a promotion remounts the layer and replays the
        // sweep exactly once. Without the key it would animate on every mount —
        // which is every navigation back to Home, i.e. ambient motion by
        // accident.
        key={arriving ? status.shown.id : undefined}
        className={`absolute inset-0 rounded-full${arriving ? " tier-arrive" : ""}`}
        style={{ background: status.shown.ring }}
      />
      <img
        src={status.shown.art}
        alt={`${status.shown.label} tier`}
        width={inner}
        height={inner}
        decoding="async"
        className="absolute rounded-full object-cover"
        style={{
          top: ring,
          left: ring,
          width: inner,
          height: inner,
          // The hairline where ring meets portrait. Drawn outward from the
          // image so it sits *inside* the band, which is what turns a flat
          // arc into a lit inner edge — see `sheen` in lib/pet.ts.
          boxShadow: `0 0 0 1px ${status.shown.sheen}`,
        }}
      />
    </div>
  );
}

/* ── one pet, standing on the shelf ─────────────────────── */

/**
 * A collected pet at shelf size, or the empty socket where one will go.
 *
 * The socket keeps the full width of the pet it is waiting for rather than
 * collapsing the row down to what has been earned. A shelf with six places and
 * three things on it says "half way"; a shelf with three things on it says
 * "finished", and the gap is the entire reason to look at this twice.
 */
function ShelfPet({ tier, collected }: { tier: Tier; collected: boolean }) {
  const SIZE = 34;
  const RING = 3;

  if (!collected) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold tabular-nums"
        style={{
          width: SIZE,
          height: SIZE,
          background: "var(--surface-3)",
          color: "var(--color-hint)",
        }}
        title={`${tier.label} — level ${tier.at}`}
      >
        {tier.at}
      </span>
    );
  }

  return (
    <span
      className="relative block shrink-0 rounded-full"
      style={{ width: SIZE, height: SIZE, background: tier.ring }}
      title={tier.label}
    >
      <img
        // Decorative: the row lives inside a button that already names the
        // whole collection, so six alt texts here would only be noise.
        alt=""
        src={tier.art}
        width={SIZE - RING * 2}
        height={SIZE - RING * 2}
        loading="lazy"
        decoding="async"
        className="absolute rounded-full object-cover"
        style={{
          top: RING,
          left: RING,
          width: SIZE - RING * 2,
          height: SIZE - RING * 2,
          boxShadow: `0 0 0 1px ${tier.sheen}`,
        }}
      />
    </span>
  );
}

/**
 * One family's row: its pets standing on a lit ledge, named underneath.
 *
 * The ledge and the caption are lifted from the trophy shelf in DisplayCase on
 * purpose — a lit top edge over a darker body is what reads as a shelf with
 * depth instead of a rule, and two kinds of reward in two visually unrelated
 * containers would read as two apps.
 *
 * An untouched family keeps its ledge, its name and its full complement of
 * empty sockets. That emptiness is how a user finds out Astral exists, and it
 * is the state every family but the first is in on the day they first look.
 */
function FamilyRow({ shelf, last }: { shelf: Shelf; last: boolean }) {
  return (
    <div className={last ? "" : "mb-2.5"}>
      <div className="flex min-h-[38px] items-end gap-[3px] px-0.5">
        {shelf.tiers.map((t, i) => (
          <ShelfPet key={t.id} tier={t} collected={i < shelf.held} />
        ))}
      </div>

      <div
        className="h-[3px] rounded-full"
        style={{
          background: "var(--line-strong)",
          boxShadow: "inset 0 1px 0 var(--pill-active)",
          // A family you haven't started is a real shelf you don't own yet.
          opacity: shelf.untouched ? 0.55 : 1,
        }}
      />

      <div className="flex items-baseline justify-between gap-2 pt-[3px]">
        <span
          className="text-[10.5px] font-semibold uppercase tracking-wide"
          style={{
            color: shelf.untouched
              ? "var(--color-hint)"
              : "var(--color-muted-2)",
          }}
        >
          {shelf.family.label}
        </span>
        <span
          className="text-[12px] font-bold tabular-nums"
          style={{
            color: shelf.untouched ? "var(--color-hint)" : "var(--color-ink)",
          }}
        >
          {shelf.held}/{shelf.tiers.length}
        </span>
      </div>
    </div>
  );
}

/**
 * The pet shelf — every pet ever collected, five families deep.
 *
 * One row per family rather than one row of twenty-seven, which is the whole
 * reason lib/pet.ts grew a family axis: a flat row that long has no shape, and
 * "nineteen of twenty-seven" is a number nobody can picture. Five rows of six
 * can be read at a glance, and each one is a thing with a name.
 *
 * What it is *not* is a second scoreboard. Nothing here is state — see
 * `shelves` in lib/pet.ts, which derives every row from the one stored field,
 * so the shelf can never disagree with the portrait above it.
 */
export function PetShelf({
  best,
  onOpen,
}: {
  /** The highest tier ever reached — `petStatus(...).best.id`. */
  best: TierId;
  onOpen: () => void;
}) {
  const rows = shelves(best);
  const { collected, next } = collection(best);

  return (
    <button
      onClick={onOpen}
      aria-label={`Pet shelf: ${collected.length} of ${TIERS.length} pets collected.${
        next ? ` ${next.label} unlocks at level ${next.at}.` : ""
      } Open pet.`}
      className="mt-2 w-full cursor-pointer rounded-[20px] px-3.5 pb-2.5 pt-3.5 text-left transition hover:brightness-[.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.99]"
      style={{
        background: "var(--surface-2)",
        boxShadow: "inset 0 2px 5px rgba(30,20,80,.07)",
      }}
    >
      {rows.map((shelf, i) => (
        <FamilyRow
          key={shelf.family.id}
          shelf={shelf}
          last={i === rows.length - 1}
        />
      ))}

      <div className="flex items-baseline justify-between gap-2 pt-2">
        <span className="text-[11px] font-medium text-muted-2">
          {next ? "Next up" : "Complete"}
        </span>
        <span className="truncate text-[11.5px] font-semibold text-ink">
          {next ? `${next.label} at level ${next.at}` : "Every pet collected"}
        </span>
      </div>
    </button>
  );
}

/* ── the full ladder, as a sheet reads it ───────────────── */

/**
 * Twenty-seven pets in five labelled rows.
 *
 * Shared by the pet sheet and the level sheet rather than written twice. They
 * showed the same six chips side by side for as long as the ladder was six
 * long, and two copies of a thing this fiddly is two chances for only one of
 * them to learn about families.
 *
 * The grid is six columns wide whatever the family holds, so Base's five pets
 * and Ember's four line up under Ghost's six instead of each row finding its
 * own rhythm. The empty cells at the end of a short row are not placeholders
 * for anything — those families simply have fewer pets in them.
 */
export function TierLadder({
  best,
  current,
  onPick,
}: {
  /** Highest tier ever reached, which is what counts as collected. */
  best: TierId;
  /** The tier being *worn* right now, ringed in the brand colour. */
  current?: TierId;
  /**
   * Makes the collected pets choosable. Omitted on read-only surfaces — the
   * level sheet shows the same ladder purely as a record of the climb, and a
   * chip that looks tappable there would promise something that screen can't
   * deliver.
   */
  onPick?: (id: TierId) => void;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {shelves(best).map((shelf) => (
        <div key={shelf.family.id}>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span
              className="text-[10.5px] font-semibold uppercase tracking-wide"
              style={{
                color: shelf.untouched
                  ? "var(--color-hint)"
                  : "var(--color-muted)",
              }}
            >
              {shelf.family.label}
            </span>
            <span
              className="text-[10.5px] font-semibold tabular-nums"
              style={{
                color: shelf.untouched
                  ? "var(--color-hint)"
                  : "var(--color-muted-2)",
              }}
            >
              {shelf.held}/{shelf.tiers.length}
            </span>
          </div>

          <div className="grid grid-cols-6 gap-1.5">
            {shelf.tiers.map((t, i) => {
              /*
               * Collected, not "the level currently supports". Those are the
               * same thing right up until a semester is cleared, at which point
               * the level resets and `bestTier` doesn't — and a shelf that takes
               * back an Astral you spent a year earning is the exact outcome
               * bestTier exists to prevent. The brand ring still marks the tier
               * being *worn*, so the sheet says both things: what you own, and
               * what you have on today.
               */
              const unlocked = i < shelf.held;
              /*
               * Only a collected pet is choosable, and the check is `unlocked`
               * rather than anything the caller passed: a locked chip is a
               * level number on a grey disc, and making that tappable would
               * offer a pet the account does not have. `petStatus` refuses it
               * again on the way through, so a bug here is cosmetic rather
               * than a way to wear Astral Galaxy at level 3.
               */
              const choosable = unlocked && !!onPick;
              const Chip = choosable ? "button" : "div";
              return (
                <Chip
                  key={t.id}
                  {...(choosable
                    ? {
                        type: "button" as const,
                        onClick: () => onPick(t.id),
                        "aria-pressed": t.id === current,
                        "aria-label": `Show ${t.label}`,
                      }
                    : {})}
                  title={`${t.label} — level ${t.at}`}
                  className={`relative flex aspect-square w-full items-center justify-center rounded-full transition${
                    choosable ? " cursor-pointer active:scale-95" : ""
                  }`}
                  style={{
                    background: unlocked ? t.ring : "var(--surface-3)",
                    ...(t.id === current
                      ? {
                          boxShadow:
                            "0 0 0 2.5px var(--bg-card), 0 0 0 5px var(--color-brand)",
                        }
                      : {}),
                  }}
                >
                  {unlocked ? (
                    // Clipped into the disc for the same reason as the main
                    // portrait: the art is opaque, so left unmasked it covers
                    // the ring it is supposed to be sitting inside.
                    <img
                      src={t.art}
                      alt={t.label}
                      width={40}
                      height={40}
                      loading="lazy"
                      decoding="async"
                      className="h-[86%] w-[86%] rounded-full object-cover"
                      style={{ boxShadow: `0 0 0 1px ${t.sheen}` }}
                    />
                  ) : (
                    <span className="text-[11px] font-bold tabular-nums text-faint">
                      {t.at}
                    </span>
                  )}
                </Chip>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── the home-screen card ───────────────────────────────── */

export function ClassPetCard({
  pet,
  level,
  onOpen,
}: {
  pet: PetState;
  level: number;
  onOpen: () => void;
}) {
  const status = petStatus(level, pet.bestTier, pet.equipped);

  return (
    <button
      onClick={onOpen}
      className="glass flex w-full items-center gap-3 rounded-[20px] px-3.5 py-3 text-left transition active:scale-[0.99]"
      aria-label={`${pet.name || DEFAULT_PET_NAME}: ${status.line}. Open pet.`}
    >
      <PetAvatar status={status} size={58} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-[family-name:var(--font-fredoka)] text-[16px] font-semibold text-ink">
            {pet.name || DEFAULT_PET_NAME}
          </span>
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-faint">
            {status.shown.label}
          </span>
          {status.demoted && (
            <span
              className="shrink-0 rounded-full px-[5px] py-[2px] text-[9px] font-bold uppercase tracking-wide text-white"
              style={{ background: status.best.ring }}
            >
              {status.best.label} earned
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">{status.line}</p>
      </div>
    </button>
  );
}

/* ── naming ─────────────────────────────────────────────── */

export function PetSheet({
  pet,
  level,
  onSave,
  onClose,
}: {
  pet: PetState;
  level: number;
  onSave: (next: Partial<PetState>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(pet.name || DEFAULT_PET_NAME);
  /*
   * The pick is local until Done, exactly like the name field beside it.
   *
   * That is what lets the portrait at the top of this sheet be a live preview:
   * tapping a pet shows you it immediately, and backing out with Escape or a
   * tap on the scrim leaves the saved document untouched. Committing on every
   * tap would write and sync a document per chip while somebody browses.
   */
  const [equipped, setEquipped] = useState<TierId | undefined>(pet.equipped);
  const status = petStatus(level, pet.bestTier, equipped);
  const pets = collection(status.best.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const commit = () => {
    onSave({
      name: name.trim().slice(0, MAX_PET_NAME) || DEFAULT_PET_NAME,
      equipped,
    });
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(10,8,24,.55)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Your pet"
    >
      <div
        // Scrolls since the ladder became five families deep — matching the
        // trophy timeline sheet, which has been this tall all along.
        className="no-scrollbar max-h-[88%] w-full overflow-y-auto rounded-t-[26px] bg-white px-5 pb-8 pt-4"
        style={{ boxShadow: "0 -8px 32px rgba(10,8,24,.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-3 h-1 w-10 rounded-full"
          style={{ background: "var(--line-strong)" }}
        />

        <div className="flex flex-col items-center">
          <PetAvatar status={status} size={104} />
          {/* Names the pet on screen, which is the one thing the portrait
              can't say for itself once it stopped always being the newest. */}
          <p className="mt-2 text-center font-[family-name:var(--font-fredoka)] text-[16px] font-semibold leading-none text-ink">
            {status.shown.label}
          </p>
          <p className="mt-1.5 text-center text-[13.5px] leading-snug text-muted">
            {status.line}
          </p>
          <p className="mt-1 text-center text-[11.5px] text-faint">
            {status.next
              ? `${status.tier.label} — ${status.next.label} at level ${status.next.at}`
              : `${status.tier.label} — the top of the ladder`}
          </p>
        </div>

        <label
          className="mt-4 flex items-center gap-3 rounded-[15px] px-4 py-[11px]"
          style={{
            background: "var(--bg-input)",
            border: "1px solid rgba(var(--brand-rgb),.12)",
          }}
        >
          <span className="text-[11px] font-semibold tracking-wide text-faint">
            NAME
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, MAX_PET_NAME))}
            maxLength={MAX_PET_NAME}
            className="w-full bg-transparent text-[16px] font-semibold text-ink outline-none"
            aria-label="Pet name"
          />
        </label>

        <div className="mt-6">
          <div className="mb-1 flex items-baseline justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-faint">
              Pet shelf
            </div>
            <div className="text-[11px] font-semibold tabular-nums text-muted-2">
              {pets.collected.length}/{TIERS.length}
            </div>
          </div>

          {/* The instruction, and the way back out of a choice.
              A pinned pet needs an undo that is visible from the same place
              the choice was made — otherwise "follow my level again" is a
              state you can enter and not leave. */}
          <div className="mb-3 flex min-h-[22px] items-center justify-between gap-2">
            <span className="text-[11.5px] leading-snug text-muted-2">
              {status.pinned
                ? `Showing ${status.shown.label}.`
                : "Tap any pet you've collected to show it."}
            </span>
            {status.pinned && (
              <button
                type="button"
                onClick={() => setEquipped(undefined)}
                className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-brand transition active:scale-95"
                style={{ background: "var(--brand-soft)" }}
              >
                Follow my level
              </button>
            )}
          </div>

          <TierLadder
            best={status.best.id}
            current={status.shown.id}
            onPick={(id) =>
              // Tapping the pet you are already showing puts you back on the
              // level — so the chip is a toggle and the ladder never needs a
              // second control to mean "stop pinning this one".
              setEquipped((prev) => (prev === id ? undefined : id))
            }
          />
        </div>

        <button
          onClick={commit}
          className="btn-brand mt-6 w-full rounded-[15px] py-[15px] text-center text-[16px] font-semibold text-white transition active:scale-[0.98]"
        >
          Done
        </button>
      </div>
    </div>
  );
}
