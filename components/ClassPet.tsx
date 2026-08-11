"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_PET_NAME,
  MAX_PET_NAME,
  petStatus,
  TIERS,
  type PetState,
  type PetStatus,
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
        boxShadow: `0 0 ${Math.round(size * 0.3)}px ${status.tier.glow}`,
      }}
    >
      <span
        aria-hidden
        // Keyed on the tier so a promotion remounts the layer and replays the
        // sweep exactly once. Without the key it would animate on every mount —
        // which is every navigation back to Home, i.e. ambient motion by
        // accident.
        key={arriving ? status.tier.id : undefined}
        className={`absolute inset-0 rounded-full${arriving ? " tier-arrive" : ""}`}
        style={{ background: status.tier.ring }}
      />
      <img
        src={status.tier.art}
        alt={`${status.tier.label} tier`}
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
          boxShadow: `0 0 0 1px ${status.tier.sheen}`,
        }}
      />
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
  const status = petStatus(level, pet.bestTier);

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
            {status.tier.label}
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
  const status = petStatus(level, pet.bestTier);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const commit = () => {
    onSave({ name: name.trim().slice(0, MAX_PET_NAME) || DEFAULT_PET_NAME });
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
        className="w-full rounded-t-[26px] bg-white px-5 pb-8 pt-4"
        style={{ boxShadow: "0 -8px 32px rgba(10,8,24,.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-3 h-1 w-10 rounded-full"
          style={{ background: "var(--line-strong)" }}
        />

        <div className="flex flex-col items-center">
          <PetAvatar status={status} size={104} />
          <p className="mt-1 text-center text-[13.5px] leading-snug text-muted">
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
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-faint">
            Tiers
          </div>
          <div className="flex justify-between gap-1">
            {TIERS.map((t) => {
              const unlocked = level >= t.at;
              const isCurrent = t.id === status.tier.id;
              return (
                <div key={t.id} className="flex flex-col items-center gap-1.5 flex-1">
                  <div
                    className="relative flex shrink-0 items-center justify-center rounded-full transition"
                    style={{
                      width: 46,
                      height: 46,
                      background: unlocked ? t.ring : "var(--surface-3)",
                      ...(isCurrent
                        ? { boxShadow: "0 0 0 2.5px var(--bg-card), 0 0 0 5px var(--color-brand)" }
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
                        className="h-10 w-10 rounded-full object-cover"
                        style={{ boxShadow: `0 0 0 1px ${t.sheen}` }}
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
