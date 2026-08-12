"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon } from "./icons";
import { showReminder } from "@/lib/notifications";
import { XP_AWARDS } from "@/lib/xp";
import { AMBIENCES, ambienceUrl, type AmbienceId } from "@/lib/ambient";
import {
  DEFAULT_POMODORO,
  MAX_BLOCK_MINUTES,
  buildPlan,
  focusCount,
  planMinutes,
  roundAt,
  singlePlan,
  type PomodoroConfig,
  type StudyBlock,
} from "@/lib/study";

/**
 * A study session for one assignment.
 *
 * The hard part of an assignment is starting it, so this asks for one decision
 * — how long — and then gets out of the way. Presets first, because picking
 * "25 minutes" is a decision a stuck student can make and "how long will this
 * take?" is not.
 *
 * The countdown is derived from a wall-clock deadline rather than decremented
 * on a tick: a phone that sleeps mid-session throttles or stops the interval,
 * and a counter that pauses when the screen locks would quietly lie about how
 * long the block actually ran. That property is why a Pomodoro run works at all
 * here — it's the same clock, walked over a list of blocks (lib/study.ts)
 * instead of a single one.
 *
 * Both modes therefore run one code path: a plan is always an array, and a
 * plain timer is a plan of length one.
 */

const PRESETS = [15, 25, 45, 60] as const;
const ROUND_CHOICES = [2, 3, 4, 6] as const;

type Phase = "setup" | "running" | "paused" | "done";
type Mode = "single" | "pomodoro";

const two = (n: number) => n.toString().padStart(2, "0");

/** 3671 -> "1:01:11", 125 -> "2:05" */
function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** "1h 55m" — the wall-clock cost of committing to a plan, breaks included. */
function span(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function StudyTimer({
  title,
  onClose,
  onFinishTask,
  onFocusComplete,
}: {
  title: string;
  /** Dismiss the sheet. */
  onClose: () => void;
  /** Tick the assignment off from the finished state, if it isn't already. */
  onFinishTask?: () => void;
  /**
   * A focus block just ran to the end, with its length in minutes.
   *
   * Fired per block rather than once per session on purpose: a student who
   * closes the sheet after three rounds of four has still done three rounds,
   * and work already finished shouldn't evaporate because the session was
   * abandoned. Breaks never fire it — resting is part of the method, but it
   * isn't the thing being rewarded.
   */
  onFocusComplete?: (minutes: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [mode, setMode] = useState<Mode>("single");
  const [minutes, setMinutes] = useState<number>(25);
  const [config, setConfig] = useState<PomodoroConfig>(DEFAULT_POMODORO);
  const [plan, setPlan] = useState<StudyBlock[]>(() => singlePlan(25));
  const [index, setIndex] = useState(0);
  /** Seconds still to run. While running this is recomputed from the clock. */
  const [remaining, setRemaining] = useState(25 * 60);
  const [zen, setZen] = useState(false);
  const [ambience, setAmbience] = useState<AmbienceId | null>(null);
  /** ms timestamp the current block ends at — only meaningful while running. */
  const endAtRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const block = plan[index] ?? plan[0];
  const total = (block?.minutes ?? 1) * 60;
  const isBreak = block?.kind === "break";
  const rounds = focusCount(plan);

  /** The plan the setup screen is describing, before it's committed to. */
  const previewPlan = useMemo(
    () => (mode === "single" ? singlePlan(minutes) : buildPlan(config)),
    [mode, minutes, config],
  );

  const startPlan = useCallback((next: StudyBlock[]) => {
    const first = next[0];
    endAtRef.current = Date.now() + first.minutes * 60_000;
    setPlan(next);
    setIndex(0);
    setRemaining(first.minutes * 60);
    setPhase("running");
  }, []);

  const pause = useCallback(() => {
    setRemaining(Math.max(0, (endAtRef.current - Date.now()) / 1000));
    setPhase("paused");
  }, []);

  const resume = useCallback(() => {
    endAtRef.current = Date.now() + remaining * 1000;
    setPhase("running");
  }, [remaining]);

  const reset = useCallback(() => {
    setPhase("setup");
    setZen(false);
    setIndex(0);
  }, []);

  /**
   * The current block ran out. Credit it, then either move to the next one or
   * end the session.
   *
   * Blocks advance on their own rather than waiting for a tap. The whole point
   * of the wall-clock deadline is that the phone can be in a pocket when a
   * block ends, and a Pomodoro that stalls there until someone looks at it
   * would report a two-hour session that was really twenty-five minutes of
   * work and ninety-five of a stalled screen.
   */
  const advance = useCallback(() => {
    const finished = plan[index];
    if (finished?.kind === "focus") onFocusComplete?.(finished.minutes);

    const nextIndex = index + 1;
    if (nextIndex >= plan.length) {
      setRemaining(0);
      setPhase("done");
      setZen(false);
      showReminder(
        "Session complete",
        `${span(planMinutes(plan))} on “${title}”. Nice work.`,
        "classping-study-timer",
      );
      return;
    }

    const next = plan[nextIndex];
    endAtRef.current = Date.now() + next.minutes * 60_000;
    setIndex(nextIndex);
    setRemaining(next.minutes * 60);
    showReminder(
      next.kind === "break"
        ? next.long
          ? "Long break"
          : "Break time"
        : `Round ${roundAt(plan, nextIndex)} of ${rounds}`,
      next.kind === "break"
        ? `${next.minutes} minutes off. Stand up.`
        : `${next.minutes} more minutes on “${title}”.`,
      "classping-study-timer",
    );
  }, [plan, index, title, rounds, onFocusComplete]);

  // The countdown itself. Half-second ticks so the displayed second never
  // appears to skip; the value shown always comes from the deadline.
  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => {
      const left = (endAtRef.current - Date.now()) / 1000;
      if (left <= 0) {
        advance();
        return;
      }
      setRemaining(left);
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [phase, advance]);

  /**
   * Ambient playback.
   *
   * Deliberately kept running across a break instead of stopping and starting
   * with each block. Two reasons: silence arriving on the dot is a jolt in a
   * room someone has settled into, and — the load-bearing one — iOS is far
   * happier letting an element that is already playing continue than letting a
   * paused one resume without a fresh tap. Starting once, from the tap on
   * "Start", is the only moment we can rely on.
   */
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!ambience || phase === "setup" || phase === "done" || phase === "paused") {
      el.pause();
      return;
    }
    el.volume = 0.55;
    void el.play().catch(() => {
      /* blocked without a gesture — the session runs fine in silence */
    });
  }, [ambience, phase]);

  /**
   * Lock-screen transport. The session is meant to be started and pocketed, so
   * the phone's own controls should govern it rather than requiring the app be
   * reopened to pause. Guarded because Media Session is absent on some
   * browsers and every handler is optional there.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    if (phase === "setup" || phase === "done") {
      ms.playbackState = "none";
      return;
    }
    ms.metadata = new MediaMetadata({
      title: isBreak ? "Break" : title,
      artist: rounds > 1 ? `Round ${roundAt(plan, index)} of ${rounds}` : "Study block",
      album: "ClassPing",
    });
    ms.playbackState = phase === "running" ? "playing" : "paused";
    try {
      ms.setActionHandler("pause", () => pause());
      ms.setActionHandler("play", () => resume());
    } catch {
      /* handler unsupported — the in-app controls still work */
    }
    return () => {
      try {
        ms.setActionHandler("pause", null);
        ms.setActionHandler("play", null);
      } catch {
        /* nothing to clean up */
      }
    };
  }, [phase, isBreak, title, rounds, plan, index, pause, resume]);

  // Escape closes, as it would on any dialog — or leaves zen first, since
  // that's the layer the user is actually looking at.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zen) setZen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, zen]);

  const elapsedFraction =
    phase === "setup" || total === 0 ? 0 : 1 - Math.min(1, remaining / total);

  /** Ring geometry. */
  const R = 74;
  const CIRC = 2 * Math.PI * R;
  const ringColor = isBreak ? "var(--good)" : "var(--color-brand)";

  /**
   * Pre-render the loop on selection rather than on start. Synthesis is tens of
   * milliseconds of arithmetic, and doing it inside the "Start" handler would
   * spend the user gesture that the first play() needs to be allowed.
   */
  const pickAmbience = useCallback((id: AmbienceId) => {
    setAmbience((prev) => {
      if (prev === id) return null;
      try {
        ambienceUrl(id);
      } catch {
        /* generation failed — the <audio> src simply won't resolve */
      }
      return id;
    });
  }, []);

  const timeReadout = (
    <>
      <span className="font-[family-name:var(--font-fredoka)] font-semibold leading-none text-ink tabular-nums">
        {clock(remaining)}
      </span>
      <span className="mt-1.5 text-[12px] font-medium text-muted-2">
        {phase === "paused" ? "Paused" : isBreak ? "break" : "left"}
      </span>
    </>
  );

  /* ── zen ────────────────────────────────────────────────
     Everything the screen can lose, lost: no sheet, no chrome, no scrim over a
     list that's still faintly readable underneath. Just the block and a way
     back out. */
  if (zen && (phase === "running" || phase === "paused")) {
    return (
      <div
        className="absolute inset-0 z-50 flex flex-col items-center justify-center px-8"
        style={{ background: "var(--color-canvas)" }}
        role="dialog"
        aria-modal="true"
        aria-label={`Focus mode: ${title}`}
      >
        <div className="text-center text-[11px] font-semibold uppercase tracking-widest text-faint">
          {isBreak ? "Break" : rounds > 1 ? `Round ${roundAt(plan, index)} of ${rounds}` : "Focus"}
        </div>
        <div className="mt-3 max-w-full truncate text-center text-[15px] font-medium text-muted">
          {isBreak ? "Rest" : title}
        </div>
        <div className="mt-6 flex flex-col items-center">
          <span
            className="font-[family-name:var(--font-fredoka)] text-[64px] font-semibold leading-none tabular-nums"
            style={{ color: ringColor }}
          >
            {clock(remaining)}
          </span>
        </div>
        <div
          className="mt-8 h-[3px] w-full max-w-[220px] overflow-hidden rounded-full"
          style={{ background: "var(--bg-input)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${elapsedFraction * 100}%`,
              background: ringColor,
              transition: "width .5s linear",
            }}
          />
        </div>
        <div className="mt-10 flex items-center gap-2.5">
          <button
            onClick={phase === "running" ? pause : resume}
            className="rounded-[15px] px-6 py-[13px] text-[15px] font-semibold text-muted transition active:scale-[0.98]"
            style={{ background: "var(--bg-input)" }}
          >
            {phase === "running" ? "Pause" : "Resume"}
          </button>
          <button
            onClick={() => setZen(false)}
            className="rounded-[15px] px-6 py-[13px] text-[15px] font-semibold text-brand transition active:scale-[0.98]"
            style={{ background: "var(--brand-soft)" }}
          >
            Exit
          </button>
        </div>
        {ambience && (
          <audio ref={audioRef} src={ambienceUrl(ambience)} loop preload="auto" />
        )}
      </div>
    );
  }

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
            {phase === "done"
              ? "Session complete"
              : isBreak
                ? "Break"
                : "Working on"}
          </div>
          <div className="mt-1 truncate text-[16px] font-semibold text-ink">
            {isBreak && phase !== "setup" && phase !== "done" ? "Rest" : title}
          </div>
        </div>

        {phase === "setup" ? (
          <>
            {/* Mode. A plain block stays the default — Pomodoro is a method you
                opt into, not a tax on someone who just wants 45 minutes. */}
            <div
              className="mt-4 flex rounded-[14px] p-1"
              style={{ background: "var(--surface-3)" }}
            >
              {(["single", "pomodoro"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex-1 rounded-[11px] py-2 text-[13px] font-semibold transition"
                  style={
                    mode === m
                      ? {
                          background: "var(--pill-active)",
                          color: "var(--color-ink)",
                          boxShadow: "0 1px 3px rgba(10,8,24,.14)",
                        }
                      : { color: "var(--color-muted)" }
                  }
                >
                  {m === "single" ? "One block" : "Pomodoro"}
                </button>
              ))}
            </div>

            {mode === "single" ? (
              <>
                <div className="mt-4 grid grid-cols-4 gap-2.5">
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
                    max={MAX_BLOCK_MINUTES}
                    value={minutes}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      setMinutes(
                        Math.min(MAX_BLOCK_MINUTES, Math.max(1, Math.round(v))),
                      );
                    }}
                    className="w-full bg-transparent text-[16px] font-semibold text-ink outline-none"
                    aria-label="Minutes"
                  />
                  <span className="text-[13px] text-muted">min</span>
                </label>
              </>
            ) : (
              <>
                <div className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-faint">
                  Focus block
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setConfig((c) => ({ ...c, focus: p }))}
                      className="rounded-[14px] py-2.5 text-center transition active:scale-95"
                      style={
                        config.focus === p
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
                      <div className="text-[16px] font-bold leading-none">{p}</div>
                      <div className="mt-0.5 text-[10px] font-medium opacity-80">
                        min
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-3.5 text-[11px] font-semibold uppercase tracking-widest text-faint">
                  Rounds
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2.5">
                  {ROUND_CHOICES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setConfig((c) => ({ ...c, rounds: r }))}
                      className="rounded-[14px] py-2.5 text-center text-[16px] font-bold transition active:scale-95"
                      style={
                        config.rounds === r
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
                      {r}
                    </button>
                  ))}
                </div>

                <div className="mt-3 text-center text-[12.5px] text-muted">
                  {config.rounds} × {config.focus} min, {config.shortBreak} min
                  breaks — {span(planMinutes(previewPlan))} in all
                </div>
              </>
            )}

            {/* Ambience. Generated on the device, so this list costs nothing to
                ship and nothing to stream. */}
            <div className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-faint">
              Sound
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2.5">
              <button
                onClick={() => setAmbience(null)}
                className="rounded-[14px] py-2.5 text-center text-[12.5px] font-semibold transition active:scale-95"
                style={
                  ambience === null
                    ? { background: "var(--surface-3)", color: "var(--color-ink)" }
                    : { background: "var(--bg-input)", color: "var(--color-muted)" }
                }
              >
                Silent
              </button>
              {AMBIENCES.map((a) => (
                <button
                  key={a.id}
                  onClick={() => pickAmbience(a.id)}
                  title={a.hint}
                  className="rounded-[14px] py-2.5 text-center text-[12.5px] font-semibold transition active:scale-95"
                  style={
                    ambience === a.id
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
                  {a.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => startPlan(previewPlan)}
              className="btn-brand mt-4 w-full rounded-[15px] py-[15px] text-center text-[16px] font-semibold text-white transition active:scale-[0.98]"
            >
              {mode === "single"
                ? `Start ${minutes} minutes`
                : `Start ${config.rounds} rounds`}
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
            {rounds > 1 && phase !== "done" && (
              <div className="mt-3 flex items-center justify-center gap-1.5">
                {plan
                  .map((b, i) => ({ b, i }))
                  .filter(({ b }) => b.kind === "focus")
                  .map(({ i }, n) => {
                    const done = i < index;
                    const current = i === index;
                    return (
                      <span
                        key={i}
                        aria-label={`Round ${n + 1}${done ? " done" : current ? " in progress" : ""}`}
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: current ? 20 : 8,
                          background: done
                            ? "var(--color-brand)"
                            : current
                              ? ringColor
                              : "var(--line-strong)",
                        }}
                      />
                    );
                  })}
              </div>
            )}

            <div className="relative mx-auto mt-4 h-[180px] w-[180px]">
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
                  stroke={ringColor}
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
                      {span(planMinutes(plan))} done
                    </span>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-[38px]">
                    {timeReadout}
                  </div>
                )}
              </div>
            </div>

            {phase === "done" ? (
              <div className="mt-5 flex flex-col gap-2.5">
                {onFinishTask && (
                  <>
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
                    {/* Ticking off here is worth more than ticking off in the
                        list, and a reward nobody is told about changes nobody's
                        behaviour — so the button says what it pays. */}
                    <p className="-mt-1 text-center text-[12px] text-muted">
                      Worth{" "}
                      <span className="font-semibold text-brand">
                        +{XP_AWARDS.taskOnTime + XP_AWARDS.focusedFinish} XP
                      </span>{" "}
                      finished from a focus block.
                    </p>
                  </>
                )}
                <button
                  onClick={reset}
                  className="w-full rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-brand transition active:scale-[0.98]"
                  style={{ background: "var(--brand-soft)" }}
                >
                  Another session
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-1.5 text-center text-[14px] font-medium text-muted"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="mt-5 flex gap-2.5">
                  <button
                    onClick={reset}
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
                <button
                  onClick={() => setZen(true)}
                  className="mt-2 w-full py-2 text-center text-[14px] font-medium text-brand"
                >
                  Focus mode
                </button>
              </>
            )}
          </>
        )}

        {ambience && (
          <audio ref={audioRef} src={ambienceUrl(ambience)} loop preload="auto" />
        )}
      </div>
    </div>
  );
}
