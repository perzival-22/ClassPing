"use client";

import { useRouter } from "next/navigation";
import {
  SUBJECT_COLORS,
  PRO_SUBJECT_COLORS,
  PALETTE,
  type SubjectColor,
} from "@/lib/palette";
import { LockIcon } from "./icons";

/**
 * Subject color swatches. Pro colors show a lock for free users and route to
 * the upgrade screen when tapped. A pro color that is already the current
 * value stays selectable (e.g. a lapsed subscriber editing an old class) —
 * we gate picking new ones, never touch what a user already has.
 */
export function ColorPicker({
  value,
  onChange,
  isPro,
}: {
  value: SubjectColor;
  onChange: (c: SubjectColor) => void;
  isPro: boolean;
}) {
  const router = useRouter();

  const swatch = (c: SubjectColor, locked: boolean) => (
    <button
      key={c}
      onClick={() => (locked ? router.push("/upgrade") : onChange(c))}
      aria-label={locked ? `${c} (Pro)` : c}
      className="relative h-9 w-9 rounded-full transition"
      style={{
        background: PALETTE[c].bar,
        opacity: locked ? 0.45 : 1,
        outline: value === c ? `2px solid ${PALETTE[c].bar}` : "none",
        outlineOffset: 2,
      }}
    >
      {locked && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white"
          style={{ boxShadow: "0 1px 3px rgba(30,20,80,.2)" }}
        >
          <LockIcon className="h-2.5 w-2.5 text-[#79749B]" />
        </span>
      )}
    </button>
  );

  return (
    <div className="flex flex-wrap gap-2.5">
      {SUBJECT_COLORS.map((c) => swatch(c, false))}
      {PRO_SUBJECT_COLORS.map((c) => swatch(c, !isPro && value !== c))}
    </div>
  );
}
