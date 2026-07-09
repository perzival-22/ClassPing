"use client";

import { useState } from "react";
import { useStore, longDate } from "@/lib/store";

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysUntil(iso: string): number {
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/**
 * DaysToFinals — a live countdown to the user's finals date, shown at the
 * bottom of the (Pro-gated) Grades screen. The date is stored on the profile
 * so it syncs across devices. Tapping the card lets the user set/edit it.
 */
export function FinalsCountdown() {
  const { profile, setProfile } = useStore();
  const finals = profile.finalsDate ?? null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(finals ?? todayIso());

  const showForm = editing || !finals;
  const days = finals ? daysUntil(finals) : null;

  const openEdit = () => {
    setDraft(finals ?? todayIso());
    setEditing(true);
  };
  const save = () => {
    if (!draft) return;
    setProfile({ finalsDate: draft });
    setEditing(false);
  };
  const clear = () => {
    setProfile({ finalsDate: null });
    setEditing(false);
  };

  return (
    <div
      className="mt-4 rounded-[24px] px-5 py-5 text-white"
      style={{
        background: "var(--brand-grad)",
        boxShadow: "0 6px 20px rgba(var(--brand-rgb),.3)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-white/70">
          Days to Finals
        </div>
        {finals && !editing && (
          <button
            onClick={openEdit}
            className="text-[12px] font-semibold text-white/80"
          >
            Edit
          </button>
        )}
      </div>

      {!showForm && days !== null ? (
        <>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-[family-name:var(--font-fredoka)] text-[44px] font-semibold leading-none">
              {days > 0 ? days : days === 0 ? "Today" : "Done"}
            </span>
            {days > 0 && (
              <span className="text-[14px] text-white/75">
                day{days === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <p className="mt-2 text-[12px] text-white/75">
            {days > 1
              ? `Finals begin ${longDate(finals!)}. You've got this.`
              : days === 1
                ? `Finals are tomorrow — ${longDate(finals!)}.`
                : days === 0
                  ? "Finals are today. Good luck! 🍀"
                  : `Finals were ${longDate(finals!)}. Set a new date for next term.`}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-white/80">
            {finals
              ? "Update your finals date."
              : "Add your finals date to see a live countdown."}
          </p>
          <input
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="mt-3 w-full rounded-[12px] bg-white px-3 py-2.5 text-[15px] text-ink outline-none"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={save}
              disabled={!draft}
              className="rounded-[12px] bg-white px-4 py-2 text-[14px] font-semibold text-brand transition active:scale-95 disabled:opacity-50"
            >
              Save
            </button>
            {finals && (
              <button
                onClick={clear}
                className="rounded-[12px] bg-white/15 px-4 py-2 text-[14px] font-semibold text-white transition active:scale-95"
              >
                Clear
              </button>
            )}
            {editing && finals && (
              <button
                onClick={() => setEditing(false)}
                className="rounded-[12px] px-4 py-2 text-[14px] font-semibold text-white/80"
              >
                Cancel
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
