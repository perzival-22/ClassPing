"use client";

import { useEffect, useState } from "react";
import {
  MAX_COMMITMENT,
  MIN_COMMITMENT,
  daysLeft,
  fightProgress,
  type BossFight,
  type BossResult,
} from "@/lib/boss";
import { dueLabel, type TaskItem } from "@/lib/store";
import { XP_AWARDS } from "@/lib/xp";

/**
 * The week you decided to take seriously.
 *
 * The visual job is to make a heavy week look finite. A list of seven things is
 * seven separate dreads; one bar that visibly empties is a single thing with an
 * end, and that reframing is the entire feature — the work underneath is
 * identical either way.
 *
 * Nothing here scolds on a loss. See the tone note in lib/boss.ts.
 */

/* ── the card ───────────────────────────────────────────── */

export function BossCard({
  fight,
  tasks,
  onStart,
  onOpen,
  canStart,
  now,
}: {
  fight: BossFight | null;
  tasks: TaskItem[];
  /** Open the commitment picker. */
  onStart: () => void;
  /** Open the running fight's detail. */
  onOpen: () => void;
  canStart: boolean;
  now: Date;
}) {
  if (!fight) {
    // Hidden rather than shown-and-disabled when there isn't enough work to
    // commit to: an inert button on the busiest screen in the app is noise, and
    // "you need two open assignments" is not a thing anyone needs told.
    if (!canStart) return null;
    return (
      <button
        onClick={onStart}
        className="glass flex w-full items-center gap-3 rounded-[18px] px-3.5 py-2.5 text-left transition active:scale-[0.99]"
      >
        <span
          className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[10px] text-[16px]"
          style={{ background: "var(--danger-soft)" }}
        >
          ⚔️
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-ink">
            Take on this week
          </span>
          <span className="block text-[11.5px] text-muted">
            Pick what has to get done by Sunday
          </span>
        </span>
      </button>
    );
  }

  const p = fightProgress(fight, tasks);
  const left = daysLeft(fight.week, now);
  const hp = 1 - p.fraction;

  return (
    <button
      onClick={onOpen}
      aria-label={`Boss week: ${p.defeated} of ${p.total} done, ${left} days left.`}
      className="glass w-full rounded-[18px] px-3.5 py-2.5 text-left transition active:scale-[0.99]"
    >
      <div className="flex items-center gap-2">
        <span className="text-[15px]">⚔️</span>
        <span className="flex-1 text-[13.5px] font-semibold text-ink">
          {p.defeated} of {p.total} down
        </span>
        <span
          className="text-[11.5px] font-semibold tabular-nums"
          style={{
            color: left <= 1 ? "var(--danger-ink)" : "var(--color-faint)",
          }}
        >
          {left === 0 ? "Last hours" : left === 1 ? "1 day left" : `${left} days left`}
        </span>
      </div>
      {/* Health, not progress: it drains as work is finished, which is the
          right direction for something being beaten. */}
      <div
        className="mt-2 h-[7px] w-full overflow-hidden rounded-full"
        style={{ background: "var(--surface-3)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.round(hp * 100)}%`,
            background:
              hp > 0.6
                ? "var(--danger)"
                : hp > 0.25
                  ? "var(--warn-ink)"
                  : "var(--good)",
            transition: "width .5s ease-out, background .5s linear",
          }}
        />
      </div>
    </button>
  );
}

/* ── committing ─────────────────────────────────────────── */

export function BossSetupSheet({
  tasks,
  onCommit,
  onClose,
}: {
  /** Open tasks only — you can't commit to work that's already done. */
  tasks: TaskItem[];
  onCommit: (taskIds: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: string) =>
    setPicked((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX_COMMITMENT
          ? prev
          : [...prev, id],
    );

  const enough = picked.length >= MIN_COMMITMENT;

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(10,8,24,.55)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose this week's commitment"
    >
      <div
        className="flex max-h-[86%] w-full flex-col rounded-t-[26px] bg-white px-5 pb-8 pt-4"
        style={{ boxShadow: "0 -8px 32px rgba(10,8,24,.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: "var(--line-strong)" }}
        />

        <div className="text-center">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-faint">
            Boss week
          </div>
          <div className="mt-1 font-[family-name:var(--font-fredoka)] text-[24px] font-semibold leading-none text-ink">
            What has to get done?
          </div>
          <p className="mt-2 text-[13px] leading-snug text-muted">
            Pick {MIN_COMMITMENT}–{MAX_COMMITMENT}. Finish them all by Sunday
            night to win the week.
          </p>
        </div>

        <div className="no-scrollbar mt-4 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2">
            {tasks.map((t) => {
              const on = picked.includes(t.id);
              const due = dueLabel(t.due);
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  aria-pressed={on}
                  className="flex items-center gap-3 rounded-[15px] px-3.5 py-3 text-left transition active:scale-[0.99]"
                  style={{
                    background: on ? "var(--brand-soft)" : "var(--bg-input)",
                    border: on
                      ? "1px solid rgba(var(--brand-rgb),.35)"
                      : "1px solid transparent",
                  }}
                >
                  <span
                    className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                    style={{
                      background: on ? "var(--color-brand)" : "transparent",
                      border: on ? "none" : "2px solid var(--line-strong)",
                    }}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">
                      {t.title}
                    </span>
                    <span
                      className="block text-[12px]"
                      style={{
                        color: due.urgent
                          ? "var(--danger-ink)"
                          : "var(--color-muted-2)",
                      }}
                    >
                      {due.text}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => {
            onCommit(picked);
            onClose();
          }}
          disabled={!enough}
          className="btn-brand mt-4 w-full rounded-[15px] py-[15px] text-center text-[16px] font-semibold text-white transition active:scale-[0.98]"
          style={enough ? undefined : { opacity: 0.45 }}
        >
          {enough
            ? `Commit to ${picked.length}`
            : `Pick at least ${MIN_COMMITMENT}`}
        </button>
        <button
          onClick={onClose}
          className="mt-2 w-full py-2 text-center text-[14px] font-medium text-muted"
        >
          Not this week
        </button>
      </div>
    </div>
  );
}

/* ── the running fight ──────────────────────────────────── */

export function BossDetailSheet({
  fight,
  tasks,
  now,
  onToggleTask,
  onAbandon,
  onClose,
}: {
  fight: BossFight;
  tasks: TaskItem[];
  now: Date;
  onToggleTask: (id: string) => void;
  onAbandon: () => void;
  onClose: () => void;
}) {
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const committed = fight.taskIds
    .map((id) => byId.get(id))
    .filter((t): t is TaskItem => !!t);
  const p = fightProgress(fight, tasks);
  const left = daysLeft(fight.week, now);

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
      aria-label="This week's boss"
    >
      <div
        className="flex max-h-[86%] w-full flex-col rounded-t-[26px] bg-white px-5 pb-8 pt-4"
        style={{ boxShadow: "0 -8px 32px rgba(10,8,24,.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: "var(--line-strong)" }}
        />

        <div className="text-center">
          <div className="text-[36px] leading-none">
            {p.fraction > 0.66 ? "🥊" : p.fraction > 0.33 ? "😰" : "👹"}
          </div>
          <div className="mt-2 font-[family-name:var(--font-fredoka)] text-[24px] font-semibold leading-none text-ink">
            {p.defeated} of {p.total} down
          </div>
          <p className="mt-1.5 text-[13px] text-muted">
            {left === 0
              ? "Last hours of the week."
              : `${left} day${left === 1 ? "" : "s"} left. Worth ${XP_AWARDS.bossWin} XP.`}
          </p>
        </div>

        <div className="no-scrollbar mt-4 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2">
            {committed.map((t) => (
              <button
                key={t.id}
                onClick={() => onToggleTask(t.id)}
                className="flex items-center gap-3 rounded-[15px] px-3.5 py-3 text-left transition active:scale-[0.99]"
                style={{ background: "var(--bg-input)" }}
              >
                <span
                  className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                  style={{
                    background: t.done ? "var(--good)" : "transparent",
                    border: t.done ? "none" : "2px solid var(--line-strong)",
                  }}
                >
                  {t.done ? "✓" : ""}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[14px] font-semibold"
                  style={{
                    color: t.done ? "var(--color-faint)" : "var(--color-ink)",
                    textDecoration: t.done ? "line-through" : "none",
                  }}
                >
                  {t.title}
                </span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          className="btn-brand mt-4 w-full rounded-[15px] py-[15px] text-center text-[16px] font-semibold text-white transition active:scale-[0.98]"
        >
          Keep going
        </button>
        <button
          onClick={() => {
            if (!confirmAbandon) {
              setConfirmAbandon(true);
              return;
            }
            onAbandon();
            onClose();
          }}
          className="mt-2 w-full py-2 text-center text-[13.5px] font-medium"
          style={{ color: confirmAbandon ? "var(--danger-ink)" : "var(--color-muted)" }}
        >
          {/* Walking away is free — it records no loss, so the confirmation is
              about the accidental tap, not about talking anyone out of it. */}
          {confirmAbandon ? "Tap again to call it off" : "Call it off"}
        </button>
      </div>
    </div>
  );
}

/* ── the result ─────────────────────────────────────────── */

export function BossResultOverlay({
  result,
  onClose,
}: {
  result: BossResult;
  onClose: () => void;
}) {
  const won = result.outcome === "won";

  useEffect(() => {
    const t = setTimeout(onClose, 6000);
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
          className="mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full text-[34px]"
          style={{ background: won ? "var(--good-soft)" : "var(--surface-3)" }}
        >
          {won ? "🏅" : "🌥️"}
        </div>
        <div
          className="mt-4 font-[family-name:var(--font-fredoka)] text-[24px] font-semibold leading-tight"
          style={{ color: won ? "var(--good-ink)" : "var(--color-ink)" }}
        >
          {won ? "Week defeated" : "That one got away"}
        </div>
        {/* The losing line is the whole tone rule in one sentence: it names what
            was actually finished, and points at Monday. Nothing was taken. */}
        <p className="mt-1.5 text-[14px] leading-snug text-muted">
          {won
            ? `All ${result.total} finished. +${XP_AWARDS.bossWin} XP.`
            : `${result.defeated} of ${result.total} done — that still counts. New week, new boss.`}
        </p>
        <span className="mt-4 block text-[12px] font-medium text-faint">
          Tap to dismiss
        </span>
      </div>
    </button>
  );
}
