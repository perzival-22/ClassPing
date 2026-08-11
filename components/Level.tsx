"use client";

import { useEffect } from "react";
import {
  levelProgress,
  type XpState,
} from "@/lib/xp";
import { TIERS, type Tier } from "@/lib/pet";

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

/* ── the tier ring ──────────────────────────────────────── */

/**
 * An avatar frame. A ring drawn behind the avatar rather than a border on it,
 * so a gradient works and the image itself is never resized by the decoration.
 *
 * The same aura the pet wears, on the same rungs — the profile picture and the
 * pet portrait are two places the one tier shows up, not two ladders.
 */
export function AvatarFrame({
  tier,
  size,
  children,
}: {
  tier: Tier;
  size: number;
  children: React.ReactNode;
}) {
  const pad = Math.max(2, Math.round(size * 0.055));

  return (
    <span
      className="relative inline-flex items-center justify-center rounded-full"
      style={{ background: tier.ring, padding: pad }}
    >
      {/* The lit inner edge. Its own layer because the frame wraps arbitrary
          children and cannot reach into them to draw it — outset so the
          hairline lands inside the band, matching PetAvatar exactly. */}
      <span
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{ inset: pad, boxShadow: `0 0 0 1px ${tier.sheen}` }}
      />
      {children}
    </span>
  );
}

/**
 * The tier ladder.
 *
 * States plainly that these are earned, not bought. The app sells Pro, and a
 * reward ladder that quietly ended at a paywall would poison both — so the
 * sheet says where the line is instead of leaving the user to discover it.
 */
export function LevelSheet({
  xp,
  onClose,
}: {
  xp: XpState;
  onClose: () => void;
}) {
  const p = levelProgress(xp.xp);
  const next = TIERS.find((t) => t.at > p.level);

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
                ? `${p.need - p.into} XP to level ${p.level + 1} — “${next.label}” tier lands at level ${next.at}.`
                : `${p.need - p.into} XP to level ${p.level + 1}.`}
          </p>
        </div>

        <div className="mt-5 flex justify-between gap-1">
          {TIERS.map((t) => {
            const unlocked = p.level >= t.at;
            return (
              <div key={t.id} className="flex flex-col items-center gap-1.5 flex-1">
                <div
                  className="relative flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full transition"
                  style={{ background: unlocked ? t.ring : "var(--surface-3)" }}
                >
                  {unlocked ? (
                    <img
                      src={t.art}
                      alt={t.label}
                      width={46}
                      height={46}
                      className="absolute left-0 bottom-0"
                      style={{
                        width: "100%",
                        height: "115%",
                        objectFit: "contain",
                        objectPosition: "bottom",
                      }}
                    />
                  ) : (
                    <span className="text-[12px] font-bold text-faint">{t.at}</span>
                  )}
                </div>
                <span
                  className="text-center text-[10.5px] font-medium"
                  style={{ color: unlocked ? "var(--color-muted)" : "var(--color-faint)" }}
                >
                  {unlocked ? t.label : `Lv ${t.at}`}
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-[11.5px] leading-snug text-faint">
          Pet tiers are earned by levelling up — they aren’t
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
  const unlocked = TIERS.find((t) => t.at === level);

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
        {/* The only place the aura moves. When this level is also a tier, the
            new ring sweeps in around the number once and then holds — the
            promotion moment is what the motion is *for*, so it lives here and
            nowhere the user sits and looks. */}
        <div className="relative mx-auto h-[88px] w-[88px]">
          {unlocked && (
            <span
              aria-hidden
              className="tier-arrive absolute inset-0 rounded-full"
              style={{
                background: unlocked.ring,
                boxShadow: `0 0 26px ${unlocked.glow}`,
              }}
            />
          )}
          <div
            className="absolute left-1/2 top-1/2 flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-[family-name:var(--font-fredoka)] text-[30px] font-semibold text-white"
            style={{
              background: "var(--brand-grad-v)",
              boxShadow: unlocked
                ? `0 0 0 1px ${unlocked.sheen}, 0 8px 22px rgba(var(--brand-rgb),.4)`
                : "0 8px 22px rgba(var(--brand-rgb),.4)",
            }}
          >
            {level}
          </div>
        </div>
        <div className="mt-4 font-[family-name:var(--font-fredoka)] text-[24px] font-semibold leading-tight text-brand">
          Level {level}
        </div>
        <p className="mt-1.5 text-[14px] leading-snug text-muted">
          {unlocked
            ? `“${unlocked.label}” tier unlocked.`
            : "The term is adding up."}
        </p>
        <span className="mt-4 block text-[12px] font-medium text-faint">
          Tap to dismiss
        </span>
      </div>
    </button>
  );
}
