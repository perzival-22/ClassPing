"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_PET_NAME,
  MAX_PET_NAME,
  moodExpression,
  nextStage,
  petStatus,
  type PetSignals,
  type PetState,
  type PetStatus,
} from "@/lib/pet";
import { cosmeticById, unlockedCosmetics, type Cosmetic } from "@/lib/xp";

/**
 * The ClassPet, drawn.
 *
 * One shape driven by numbers rather than a set of hand-drawn faces: the mood
 * comes out of lib/pet.ts as an eye opening, a mouth curve and a tint, and
 * everything below just plots them. Adding a mood is then a line in the pure
 * module and nothing here, which is the only way six expressions stay
 * consistent with each other over time.
 *
 * Every hat is a few paths for the same reason the frames in lib/xp.ts are CSS
 * gradients — the reward ladder shouldn't depend on commissioning art.
 */

/* ── hats ───────────────────────────────────────────────── */

function Hat({ id, color }: { id: string; color: string }) {
  switch (id) {
    case "hat-cap":
      return (
        <g>
          <path d="M30 30 Q50 10 70 30 Z" fill={color} />
          <path d="M66 30 Q80 30 80 35 L66 35 Z" fill={color} opacity={0.75} />
        </g>
      );
    case "hat-beanie":
      return (
        <g>
          <path d="M31 31 Q50 8 69 31 Z" fill={color} />
          <rect x="29" y="29" width="42" height="7" rx="3.5" fill={color} opacity={0.75} />
          <circle cx="50" cy="10" r="4" fill={color} />
        </g>
      );
    case "hat-scarf":
      // Worn, not hatted — it reads as a different slot at a glance.
      return (
        <g>
          <rect x="30" y="66" width="40" height="8" rx="4" fill={color} />
          <path d="M60 72 L66 86 L58 84 Z" fill={color} opacity={0.85} />
        </g>
      );
    case "hat-crown":
      return (
        <path
          d="M32 30 L36 16 L43 25 L50 13 L57 25 L64 16 L68 30 Z"
          fill={color}
        />
      );
    case "hat-halo":
      return (
        <ellipse
          cx="50"
          cy="16"
          rx="17"
          ry="5"
          fill="none"
          stroke={color}
          strokeWidth="3.5"
        />
      );
    default:
      return null;
  }
}

/* ── the pet ────────────────────────────────────────────── */

export function PetAvatar({
  status,
  hat,
  size = 96,
}: {
  status: PetStatus;
  /** Cosmetic id; ignored unless it resolves to a real, unlocked hat. */
  hat?: Cosmetic;
  size?: number;
}) {
  const { eyes, mouth, tint } = moodExpression(status.mood);
  const stage = status.stage.id;
  const isEgg = stage === "egg";

  // Eye aperture and mouth curvature, both straight from the mood.
  const eyeR = 1.2 + eyes * 4.2;
  const mouthY = 62 + (mouth < 0 ? 2 : 0);
  const mouthCtrl = mouthY + mouth * 11;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`${status.stage.label}, looking ${status.mood}`}
    >
      {stage === "radiant" && (
        <g opacity={0.9}>
          {[
            [16, 26],
            [84, 34],
            [22, 74],
            [80, 70],
          ].map(([x, y], i) => (
            <path
              key={i}
              d={`M${x} ${y - 5} L${x + 1.6} ${y - 1.6} L${x + 5} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 5} L${x - 1.6} ${y + 1.6} L${x - 5} ${y} L${x - 1.6} ${y - 1.6} Z`}
              fill={tint}
              opacity={0.55}
            />
          ))}
        </g>
      )}

      {/* body — an egg is narrower and taller; everything after it is a blob */}
      <ellipse
        cx="50"
        cy={isEgg ? 56 : 58}
        rx={isEgg ? 26 : 30}
        ry={isEgg ? 33 : 28}
        fill={tint}
        fillOpacity={0.2}
        stroke={tint}
        strokeWidth="2.5"
      />

      {stage !== "egg" && stage !== "sprout" && (
        // Ears arrive with the second growth step, so the change is visible.
        <>
          <ellipse cx="28" cy="38" rx="7" ry="10" fill={tint} fillOpacity={0.2} stroke={tint} strokeWidth="2.5" />
          <ellipse cx="72" cy="38" rx="7" ry="10" fill={tint} fillOpacity={0.2} stroke={tint} strokeWidth="2.5" />
        </>
      )}

      {stage === "sprout" && (
        <path
          d="M50 30 Q56 18 64 21 Q60 31 50 30 Z"
          fill={tint}
          fillOpacity={0.55}
        />
      )}

      {isEgg ? (
        // No face yet — a crack, so the egg reads as "not hatched" rather than
        // "broken", and the first level-up visibly changes something.
        <path
          d="M36 52 L44 46 L40 58 L50 50"
          fill="none"
          stroke={tint}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ) : (
        <>
          <ellipse cx="40" cy="54" rx="3.4" ry={eyeR} fill={tint} />
          <ellipse cx="60" cy="54" rx="3.4" ry={eyeR} fill={tint} />
          <path
            d={`M41 ${mouthY} Q50 ${mouthCtrl} 59 ${mouthY}`}
            fill="none"
            stroke={tint}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </>
      )}

      {hat && <Hat id={hat.id} color={hat.css} />}
    </svg>
  );
}

/* ── the home-screen card ───────────────────────────────── */

export function ClassPetCard({
  pet,
  signals,
  onOpen,
}: {
  pet: PetState;
  signals: PetSignals;
  onOpen: () => void;
}) {
  const status = petStatus(signals);
  // Resolved here rather than trusted from storage: the id crosses the sync
  // endpoint, and an unlocked-looking hat from an edited document shouldn't
  // draw. Falls back to bare-headed, which is always valid.
  const hat = cosmeticById(pet.hat);
  const earned = hat && hat.kind === "hat" && hat.at <= signals.level ? hat : undefined;

  return (
    <button
      onClick={onOpen}
      className="glass flex w-full items-center gap-3 rounded-[20px] px-3.5 py-3 text-left transition active:scale-[0.99]"
      aria-label={`${pet.name || DEFAULT_PET_NAME}: ${status.line}. Open pet.`}
    >
      <PetAvatar status={status} hat={earned} size={58} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-[family-name:var(--font-fredoka)] text-[16px] font-semibold text-ink">
            {pet.name || DEFAULT_PET_NAME}
          </span>
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-faint">
            {status.stage.label}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">{status.line}</p>
      </div>
    </button>
  );
}

/* ── name + wardrobe ────────────────────────────────────── */

export function PetSheet({
  pet,
  signals,
  onSave,
  onClose,
}: {
  pet: PetState;
  signals: PetSignals;
  onSave: (next: Partial<PetState>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(pet.name || DEFAULT_PET_NAME);
  const status = petStatus(signals);
  const hats = unlockedCosmetics(signals.level, "hat");
  const locked = nextStage(signals.level);
  const current = cosmeticById(pet.hat);
  const worn = current && current.kind === "hat" && current.at <= signals.level
    ? current
    : undefined;

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
          <PetAvatar status={status} hat={worn} size={104} />
          <p className="mt-1 text-center text-[13.5px] leading-snug text-muted">
            {status.line}
          </p>
          <p className="mt-1 text-center text-[11.5px] text-faint">
            {locked
              ? `${status.stage.label} — grows at level ${locked.at}`
              : `${status.stage.label} — fully grown`}
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

        <div className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-faint">
          Wardrobe
        </div>
        {hats.length === 0 ? (
          <p className="mt-2 text-[13px] leading-snug text-muted-2">
            Nothing yet — the first hat is earned at level 3.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2.5">
            <button
              onClick={() => onSave({ hat: undefined })}
              className="rounded-[13px] px-3 py-2 text-[12.5px] font-semibold transition active:scale-95"
              style={
                worn
                  ? { background: "var(--bg-input)", color: "var(--color-muted)" }
                  : { background: "var(--surface-3)", color: "var(--color-ink)" }
              }
            >
              None
            </button>
            {hats.map((h) => (
              <button
                key={h.id}
                onClick={() => onSave({ hat: h.id })}
                className="rounded-[13px] px-3 py-2 text-[12.5px] font-semibold transition active:scale-95"
                style={
                  worn?.id === h.id
                    ? { background: h.css, color: "#fff" }
                    : { background: "var(--bg-input)", color: "var(--color-muted)" }
                }
              >
                {h.label}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={commit}
          className="btn-brand mt-5 w-full rounded-[15px] py-[15px] text-center text-[16px] font-semibold text-white transition active:scale-[0.98]"
        >
          Done
        </button>
      </div>
    </div>
  );
}
