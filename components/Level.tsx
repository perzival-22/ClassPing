"use client";

import { useEffect } from "react";
import {
  COSMETICS,
  cosmeticById,
  levelProgress,
  nextCosmetic,
  unlockedCosmetics,
  type Cosmetic,
  type XpState,
} from "@/lib/xp";

/**
 * The level readout, its unlock shelf, and the moment a level lands.
 *
 * Sits beside the trophy cabinet on the Tasks screen and reads deliberately
 * quieter than it: trophies are the loud short loop, this is the line that
 * only moves a little each week. The two are answering different questions —
 * "am I on a run right now?" versus "what has this whole term added up to?"
 */

/* ── the bar ────────────────────────────────────────────── */

export function LevelBar({
  xp,
  onOpen,
}: {
  xp: XpState;
  /** Opens the unlock shelf. */
  onOpen: () => void;
}) {
  const p = levelProgress(xp.xp);

  return (
    <button
      onClick={onOpen}
      aria-label={`Level ${p.level}, ${p.title}. ${
        p.atMax ? "Everything unlocked." : `${p.need - p.into} XP to the next level.`
      } Open unlocks.`}
      className="glass flex w-full items-center gap-3 rounded-[18px] px-3 py-2.5 text-left transition active:scale-[0.99]"
    >
      <div
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full font-[family-name:var(--font-fredoka)] text-[15px] font-semibold text-white"
        style={{
          background: "var(--brand-grad-v)",
          boxShadow: "0 2px 8px rgba(var(--brand-rgb),.3)",
        }}
      >
        {p.level}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13.5px] font-semibold text-ink">
            {p.title}
          </span>
          <span className="shrink-0 text-[11.5px] font-medium tabular-nums text-faint">
            {p.atMax ? "Max" : `${p.into} / ${p.need}`}
          </span>
        </div>
        <div
          className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full"
          style={{ background: "var(--surface-3)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round(p.fraction * 100)}%`,
              background: "var(--brand-grad)",
              transition: "width .45s ease-out",
            }}
          />
        </div>
      </div>
    </button>
  );
}

/* ── cosmetics ──────────────────────────────────────────── */

/**
 * An avatar frame. A ring drawn behind the avatar rather than a border on it,
 * so a gradient works and the image itself is never resized by the decoration.
 */
export function AvatarFrame({
  cosmeticId,
  size,
  children,
}: {
  cosmeticId?: string;
  size: number;
  children: React.ReactNode;
}) {
  const frame = cosmeticById(cosmeticId);
  if (!frame || frame.kind !== "frame") return <>{children}</>;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{
        background: frame.css,
        padding: Math.max(2, Math.round(size * 0.055)),
      }}
    >
      {children}
    </span>
  );
}

/**
 * One tile on the shelf — earned in colour, locked as a flat plate showing the
 * level that opens it.
 *
 * Frames are equipped from here; hats are equipped on the pet itself, where
 * you can see them being worn. Tapping a locked tile does nothing on purpose:
 * a tile that offered an upsell would turn the reward ladder into a storefront,
 * which is exactly the thing this shelf is separated from Pro to avoid.
 */
function CosmeticTile({
  cosmetic,
  earned,
  equipped,
  onEquip,
}: {
  cosmetic: Cosmetic;
  earned: boolean;
  equipped: boolean;
  onEquip?: () => void;
}) {
  const interactive = earned && !!onEquip;
  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      {...(interactive
        ? {
            onClick: onEquip,
            "aria-pressed": equipped,
            "aria-label": `${cosmetic.label}${equipped ? ", equipped" : ""}`,
          }
        : {})}
      className="flex flex-col items-center gap-1.5"
    >
      <div
        className="flex h-[46px] w-[46px] items-center justify-center rounded-full transition"
        style={{
          background: earned ? cosmetic.css : "var(--surface-3)",
          ...(equipped
            ? { boxShadow: "0 0 0 2.5px var(--bg-card), 0 0 0 5px var(--color-brand)" }
            : {}),
        }}
      >
        {earned ? (
          <span
            className="h-[26px] w-[26px] rounded-full"
            style={{ background: "var(--bg-card)" }}
          />
        ) : (
          <span className="text-[12px] font-bold text-faint">{cosmetic.at}</span>
        )}
      </div>
      <span
        className="max-w-[62px] truncate text-center text-[10.5px] font-medium"
        style={{ color: earned ? "var(--color-muted)" : "var(--color-faint)" }}
      >
        {earned ? cosmetic.label : `Lv ${cosmetic.at}`}
      </span>
    </Tag>
  );
}

/**
 * The unlock shelf.
 *
 * States plainly that these are earned, not bought. The app sells Pro, and a
 * reward ladder that quietly ended at a paywall would poison both — so the
 * shelf says where the line is instead of leaving the user to discover it.
 */
export function LevelSheet({
  xp,
  frame,
  onEquipFrame,
  onClose,
}: {
  xp: XpState;
  /** Currently equipped avatar frame, if any. */
  frame?: string;
  /** Passing the same id again takes it off. */
  onEquipFrame: (id: string | undefined) => void;
  onClose: () => void;
}) {
  const p = levelProgress(xp.xp);
  const earned = new Set(unlockedCosmetics(p.level).map((c) => c.id));
  const next = nextCosmetic(p.level);
  // Re-checked against the level rather than trusted: the id crosses the sync
  // endpoint, so an edited document must not equip something unearned.
  const equippedFrame = earned.has(frame ?? "") ? frame : undefined;

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
      aria-label="Level and unlocks"
    >
      <div
        className="w-full rounded-t-[26px] bg-white px-5 pb-8 pt-4"
        style={{ boxShadow: "0 -8px 32px rgba(10,8,24,.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: "var(--line-strong)" }}
        />

        <div className="text-center">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-faint">
            Level {p.level}
          </div>
          <div className="mt-1 font-[family-name:var(--font-fredoka)] text-[26px] font-semibold leading-none text-ink">
            {p.title}
          </div>
          <p className="mt-2 text-[13px] leading-snug text-muted">
            {p.atMax
              ? `${xp.xp} XP. Everything below is yours.`
              : next
                ? `${p.need - p.into} XP to level ${p.level + 1} — “${next.label}” lands at level ${next.at}.`
                : `${p.need - p.into} XP to level ${p.level + 1}.`}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-5 gap-x-2 gap-y-4">
          {COSMETICS.map((c) => (
            <CosmeticTile
              key={c.id}
              cosmetic={c}
              earned={earned.has(c.id)}
              equipped={c.kind === "frame" && equippedFrame === c.id}
              onEquip={
                c.kind === "frame"
                  ? () => onEquipFrame(equippedFrame === c.id ? undefined : c.id)
                  : undefined
              }
            />
          ))}
        </div>

        <p className="mt-4 text-center text-[11.5px] leading-snug text-muted-2">
          Tap a ring to wear it on your avatar. Hats are worn on your pet.
        </p>
        <p className="mt-2 text-center text-[11.5px] leading-snug text-faint">
          Frames and pet accessories are earned by levelling up — they aren’t
          part of Pro, and Pro doesn’t unlock them.
        </p>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-brand transition active:scale-[0.98]"
          style={{ background: "var(--brand-soft)" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

/* ── the moment ─────────────────────────────────────────── */

/**
 * A level landing. Mirrors the trophy celebration so the two read as one
 * family, and auto-dismisses on the same timing — long enough to read, short
 * enough to stay out of the way of the next thing.
 */
export function LevelUpCelebration({
  level,
  onClose,
}: {
  level: number;
  onClose: () => void;
}) {
  const unlocked = COSMETICS.filter((c) => c.at === level);

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
          className="mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full font-[family-name:var(--font-fredoka)] text-[30px] font-semibold text-white"
          style={{
            background: "var(--brand-grad-v)",
            boxShadow: "0 8px 22px rgba(var(--brand-rgb),.4)",
          }}
        >
          {level}
        </div>
        <div className="mt-4 font-[family-name:var(--font-fredoka)] text-[24px] font-semibold leading-tight text-brand">
          Level {level}
        </div>
        <p className="mt-1.5 text-[14px] leading-snug text-muted">
          {unlocked.length > 0
            ? `“${unlocked.map((c) => c.label).join("” and “")}” unlocked.`
            : "The term is adding up."}
        </p>
        <span className="mt-4 block text-[12px] font-medium text-faint">
          Tap to dismiss
        </span>
      </div>
    </button>
  );
}
