"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon } from "./icons";
import { showReminder } from "@/lib/notifications";

/**
 * A study block for one assignment.
 *
 * The hard part of an assignment is starting it, so this asks for one decision
 * — how long — and then gets out of the way. Presets first, because picking
 * "25 minutes" is a decision a stuck student can make and "how long will this
 * take?" is not.
 *
 * The countdown is derived from a wall-clock deadline rather than decremented
 * on a tick: a phone that sleeps mid-session throttles or stops the interval,
 * and a counter that pauses when the screen locks would quietly lie about how
 * long the block actually ran.
 */

const PRESETS = [15, 25, 45, 60] as const;
const MAX_MINUTES = 240;

type Phase = "setup" | "running" | "paused" | "done";

const two = (n: number) => n.toString().padStart(2, "0");

/** 3671 -> "1:01:11", 125 -> "2:05" */
function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

export function StudyTimer({
  title,
  onClose,
  onFinishTask,
}: {
  title: string;
  /** Dismiss the sheet. */
  onClose: () => void;
  /** Tick the assignment off from the finished state, if it isn't already. */
  onFinishTask?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [minutes, setMinutes] = useState<number>(25);
  /** Seconds still to run. While running this is recomputed from the clock. */
  const [remaining, setRemaining] = useState(25 * 60);
  /** ms timestamp the block ends at — only meaningful while running. */
  const endAtRef = useRef(0);

  const total = minutes * 60;

  const start = useCallback(
    (mins: number) => {
      const secs = Math.round(mins * 60);
      endAtRef.current = Date.now() + secs * 1000;
      setMinutes(mins);
      setRemaining(secs);
      setPhase("running");
    },
    [],
  );

  const pause = useCallback(() => {
    setRemaining(Math.max(0, (endAtRef.current - Date.now()) / 1000));
    setPhase("paused");
  }, []);

  const resume = useCallback(() => {
    endAtRef.current = Date.now() + remaining * 1000;
    setPhase("running");
  }, [remaining]);

  // The countdown itself. Half-second ticks so the displayed second never
  // appears to skip; the value shown always comes from the deadline.
  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => {
      const left = (endAtRef.current - Date.now()) / 1000;
      if (left <= 0) {
        setRemaining(0);
        setPhase("done");
        showReminder(
          "Study block finished",
          `${minutes} minute${minutes === 1 ? "" : "s"} on “${title}”. Nice work.`,
          "classping-study-timer",
        );
        return;
      }
      setRemaining(left);
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [phase, minutes, title]);

  // Escape closes, as it would on any dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const elapsedFraction =
    phase === "setup" || total === 0 ? 0 : 1 - Math.min(1, remaining / total);

  // Progress ring geometry.
  const R = 74;
  const CIRC = 2 * Math.PI * R;

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(10,8,24,.55)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Study timer for ${title}`}
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
            {phase === "done" ? "Block complete" : "Working on"}
          </div>
          <div className="mt-1 truncate text-[16px] font-semibold text-ink">
            {title}
          </div>
        </div>

        {phase === "setup" ? (
          <>
            <div className="mt-5 grid grid-cols-4 gap-2.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setMinutes(p)}
                  className="rounded-[14px] py-3 text-center transition active:scale-95"
                  style={
                    minutes === p
                      ? {
                          background: "var(--color-brand)",
                          color: "#fff",
                          boxShadow: "0 2px 8px rgba(var(--brand-rgb),.35)",
                        }
                      : {
                          background: "var(--bg-input)",
                          color: "var(--color-muted)",
                        }
                  }
                >
                  <div className="text-[18px] font-bold leading-none">{p}</div>
                  <div className="mt-1 text-[10.5px] font-medium opacity-80">
                    min
                  </div>
                </button>
              ))}
            </div>

            <label
              className="mt-3 flex items-center gap-3 rounded-[15px] px-4 py-[11px]"
              style={{
                background: "var(--bg-input)",
                border: "1px solid rgba(var(--brand-rgb),.12)",
              }}
            >
              <span className="text-[11px] font-semibold tracking-wide text-faint">
                OR SET
              </span>
              <input
                type="number"
                min={1}
                max={MAX_MINUTES}
                value={minutes}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  setMinutes(Math.min(MAX_MINUTES, Math.max(1, Math.round(v))));
                }}
                className="w-full bg-transparent text-[16px] font-semibold text-ink outline-none"
                aria-label="Minutes"
              />
              <span className="text-[13px] text-muted">min</span>
            </label>

            <button
              onClick={() => start(minutes)}
              className="btn-brand mt-4 w-full rounded-[15px] py-[15px] text-center text-[16px] font-semibold text-white transition active:scale-[0.98]"
            >
              Start {minutes} minutes
            </button>
            <button
              onClick={onClose}
              className="mt-2 w-full py-2 text-center text-[14px] font-medium text-muted"
            >
              Not now
            </button>
          </>
        ) : (
          <>
            <div className="relative mx-auto mt-5 h-[180px] w-[180px]">
              <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
                <circle
                  cx="90"
                  cy="90"
                  r={R}
                  fill="none"
                  stroke="var(--bg-input)"
                  strokeWidth="11"
                />
                <circle
                  cx="90"
                  cy="90"
                  r={R}
                  fill="none"
                  stroke="var(--color-brand)"
                  strokeWidth="11"
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - elapsedFraction)}
                  style={{ transition: "stroke-dashoffset .5s linear" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {phase === "done" ? (
                  <>
                    <span className="text-[40px] leading-none">🎉</span>
                    <span className="mt-2 text-[13px] font-medium text-muted">
                      {minutes} min done
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-[family-name:var(--font-fredoka)] text-[38px] font-semibold leading-none text-ink tabular-nums">
                      {clock(remaining)}
                    </span>
                    <span className="mt-1.5 text-[12px] font-medium text-muted-2">
                      {phase === "paused" ? "Paused" : "left"}
                    </span>
                  </>
                )}
              </div>
            </div>

            {phase === "done" ? (
              <div className="mt-5 flex flex-col gap-2.5">
                {onFinishTask && (
                  <button
                    onClick={() => {
                      onFinishTask();
                      onClose();
                    }}
                    className="btn-brand flex w-full items-center justify-center gap-2 rounded-[15px] py-[15px] text-[16px] font-semibold text-white transition active:scale-[0.98]"
                  >
                    <CheckIcon className="h-[15px] w-[15px]" />
                    Mark it done
                  </button>
                )}
                <button
                  onClick={() => setPhase("setup")}
                  className="w-full rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-brand transition active:scale-[0.98]"
                  style={{ background: "var(--brand-soft)" }}
                >
                  Another block
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-1.5 text-center text-[14px] font-medium text-muted"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="mt-5 flex gap-2.5">
                <button
                  onClick={() => setPhase("setup")}
                  className="flex-1 rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-muted transition active:scale-[0.98]"
                  style={{ background: "var(--bg-input)" }}
                >
                  Stop
                </button>
                <button
                  onClick={phase === "running" ? pause : resume}
                  className="btn-brand flex-1 rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-white transition active:scale-[0.98]"
                >
                  {phase === "running" ? "Pause" : "Resume"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
