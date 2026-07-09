"use client";

import { useRouter } from "next/navigation";
import { LockIcon } from "./icons";

/**
 * Extra lead times for a class, written as additional VALARMs in the calendar
 * export so the phone's own calendar delivers them even when the app is fully
 * closed. Pro-gated (locked chips route to /upgrade). The primary reminder
 * (remindBefore) is handled separately, so it's excluded from the options.
 */
const OPTIONS = [
  { label: "1 day", value: 1440 },
  { label: "3 hr", value: 180 },
  { label: "1 hr", value: 60 },
  { label: "10 min", value: 10 },
  { label: "5 min", value: 5 },
];

export function ExtraReminders({
  value,
  onChange,
  isPro,
  primary,
}: {
  value: number[];
  onChange: (v: number[]) => void;
  isPro: boolean;
  primary: number;
}) {
  const router = useRouter();
  const selected = new Set(value);

  const toggle = (v: number) => {
    if (!isPro) {
      router.push("/upgrade");
      return;
    }
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange([...next].sort((a, b) => b - a));
  };

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.filter((o) => o.value !== primary).map((o) => {
        const on = selected.has(o.value);
        return (
          <button
            key={o.value}
            onClick={() => toggle(o.value)}
            className="relative rounded-xl px-3.5 py-2.5 text-[14px] font-semibold transition"
            style={
              on
                ? { background: "var(--color-brand)", color: "#fff" }
                : {
                    background: "#fff",
                    color: "#79749B",
                    boxShadow: "0 1px 3px rgba(30,20,80,.05)",
                    opacity: isPro ? 1 : 0.6,
                  }
            }
          >
            {o.label}
            {!isPro && (
              <span
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white"
                style={{ boxShadow: "0 1px 3px rgba(30,20,80,.2)" }}
              >
                <LockIcon className="h-2.5 w-2.5 text-[#79749B]" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
