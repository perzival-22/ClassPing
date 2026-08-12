"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { parseIcs, planImport, type ImportResult } from "@/lib/ics-import";
import { FREE_CLASS_LIMIT } from "@/lib/plan";
import { useIsPro } from "@/lib/useIsPro";

/**
 * Import from a school calendar feed (Canvas / Blackboard / Moodle / Google
 * Classroom). Previews the candidates and only writes them to the store on an
 * explicit confirm — so a bad feed can't silently flood the timetable, and
 * everything imported is editable afterwards.
 *
 * ── Where the paywall sits, and why it moved ────────────────────────────────
 *
 * The whole feature used to be Pro. That put the single highest-leverage way to
 * fill ClassPing behind a payment the user had no reason to make yet: the first
 * screen a new account sees is an empty timetable, and the fastest route out of
 * it asked for a card before the app had done anything at all.
 *
 * So the line now runs between the two halves, which were never the same thing
 * to serve. A downloaded .ics file is parsed here in the browser — no request,
 * no cost, no SSRF surface, works offline — and is free. A feed *URL* is a
 * server fetch, rate-limited and screened (app/api/import/ics), and it is the
 * one that keeps working all term as the timetable changes. Free gets the
 * one-time superpower; Pro buys the standing one.
 */

type Candidates = ImportResult;

/* ── the guts, worn two ways ────────────────────────────────
   A card on Settings, and a sheet on the empty Home screen. One body: the
   flow has a preview gate in the middle of it, and two copies of a state
   machine is two chances for only one of them to be right. */
function ImportPanel({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const { importItems, classes } = useStore();
  const { isPro, proLoaded } = useIsPro();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Candidates | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Default to the unlocked layout until Clerk answers: a paying user seeing
  // their own feature wearing a PRO badge for a frame is the worse flash.
  const locked = proLoaded && !isPro;

  const plan = found
    ? planImport(found, { existingClasses: classes.length, isPro })
    : null;

  /** A downloaded .ics file needs no server round-trip and no SSRF screen —
   *  it's a local file, so we read and parse it right here in the browser. */
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking the same file fires again
    if (!file) return;
    setError(null);
    setFound(null);
    setDone(null);
    if (file.size > 3 * 1024 * 1024) {
      setError("That file is too large to be a calendar.");
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      if (!text.includes("BEGIN:VCALENDAR")) {
        setError("That file isn't a calendar (.ics) file.");
        return;
      }
      const result = parseIcs(text);
      if (result.classes.length + result.tasks.length === 0) {
        setError("No classes or deadlines were found in that file.");
        return;
      }
      setFound(result);
    } catch {
      setError("Couldn't read that file. Try another.");
    } finally {
      setBusy(false);
    }
  }

  async function loadPreview() {
    setBusy(true);
    setError(null);
    setFound(null);
    setDone(null);
    try {
      const res = await fetch("/api/import/ics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.status === 403) {
        router.push("/upgrade");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Couldn't import that calendar.");
        return;
      }
      setFound(data as Candidates);
    } catch {
      setError("Something went wrong. Check the link and try again.");
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    if (!plan) return;
    importItems(plan.classes, plan.tasks);
    setDone(plan.total);
    setFound(null);
    setUrl("");
    onDone?.();
  }

  return (
    <>
      <p className="text-[13px] leading-snug text-muted">
        {locked
          ? "Download the calendar file from Canvas, Blackboard, Moodle or Google Classroom and drop it in — we'll pull out your classes and deadlines. You review everything before it's added."
          : "Paste the calendar feed link from Canvas, Blackboard, Moodle or Google Classroom — or upload a downloaded .ics file — and we'll pull in your classes and deadlines. You review everything before it's added."}
      </p>

      {error && (
        <p className="mt-2 text-[13px] font-medium text-[var(--danger)]">
          {error}
        </p>
      )}

      {done !== null && (
        <p className="mt-2 text-[13px] font-medium text-brand">
          Added {done} {done === 1 ? "item" : "items"} — find them on your
          timetable and Tasks. 🎉
        </p>
      )}

      {plan ? (
        <div className="mt-3">
          <div
            className="rounded-[15px] px-4 py-3"
            style={{ background: "var(--brand-soft)" }}
          >
            <p className="text-[14px] font-semibold text-ink">
              Ready to import {plan.total}{" "}
              {plan.total === 1 ? "item" : "items"}
            </p>
            <p className="mt-0.5 text-[13px] text-muted">
              {plan.classes.length}{" "}
              {plan.classes.length === 1 ? "class" : "classes"} ·{" "}
              {plan.tasks.length}{" "}
              {plan.tasks.length === 1 ? "assignment" : "assignments"}
              {found && found.skipped > 0 ? ` · ${found.skipped} skipped` : ""}
            </p>
          </div>

          {/* Said before the write, not after it: the free plan's ceiling is
              the one thing about this flow a user could feel tricked by. */}
          {plan.heldBack > 0 && (
            <button
              onClick={() => router.push("/upgrade")}
              className="mt-2 w-full cursor-pointer rounded-[15px] px-4 py-3 text-left"
              style={{ background: "var(--warn-soft)" }}
            >
              <p
                className="text-[13px] font-semibold"
                style={{ color: "var(--warn-ink)" }}
              >
                {plan.heldBack} {plan.heldBack === 1 ? "class" : "classes"}{" "}
                won&apos;t fit on the free plan
              </p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
                Free holds {FREE_CLASS_LIMIT} classes and you have{" "}
                {classes.length}. Your deadlines all come through either way —
                tap to see Pro.
              </p>
            </button>
          )}

          <div className="mt-3 flex gap-2.5">
            <button
              onClick={() => setFound(null)}
              className="flex-1 cursor-pointer rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-muted transition active:scale-[0.98]"
              style={{ background: "var(--bg-input)" }}
            >
              Cancel
            </button>
            <button
              onClick={confirm}
              disabled={plan.total === 0}
              className="btn-brand flex-1 cursor-pointer rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:cursor-default disabled:opacity-50"
            >
              Add {plan.total}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Free: the file is the whole feature and gets the primary button.
              Pro: the feed comes first, because it's the one worth repeating. */}
          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={handleFile}
          />

          {locked ? (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="btn-brand mt-3 w-full cursor-pointer rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:cursor-default disabled:opacity-50"
              >
                {busy ? "Reading…" : "Upload an .ics file"}
              </button>

              <div className="my-3 flex items-center gap-3">
                <div
                  className="h-px flex-1"
                  style={{ background: "var(--line)" }}
                />
                <span className="text-[11px] font-semibold text-faint">OR</span>
                <div
                  className="h-px flex-1"
                  style={{ background: "var(--line)" }}
                />
              </div>

              <button
                onClick={() => router.push("/upgrade")}
                className="w-full cursor-pointer rounded-[15px] px-4 py-3 text-left transition hover:brightness-[.98]"
                style={{ background: "var(--bg-input)" }}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-[14px] font-semibold text-ink">
                    Paste a live feed link
                  </span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white"
                    style={{ background: "var(--color-brand)" }}
                  >
                    PRO
                  </span>
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                  Keeps pulling new deadlines all semester, instead of a
                  one-time file.
                </span>
              </button>
            </>
          ) : (
            <>
              <input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                inputMode="url"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="https://…/feed.ics"
                className="mt-3 w-full rounded-[15px] px-4 py-[13px] text-[15px] text-ink outline-none transition focus:outline-2 focus:outline-offset-[-1px] focus:outline-brand"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid rgba(var(--brand-rgb),.12)",
                }}
              />

              <button
                onClick={loadPreview}
                disabled={busy || url.trim().length === 0}
                className="mt-3 w-full cursor-pointer rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-brand transition active:scale-[0.98] disabled:cursor-default disabled:opacity-50"
                style={{ background: "var(--brand-soft)" }}
              >
                {busy ? "Working…" : "Preview import"}
              </button>

              <div className="my-3 flex items-center gap-3">
                <div
                  className="h-px flex-1"
                  style={{ background: "var(--line)" }}
                />
                <span className="text-[11px] font-semibold text-faint">OR</span>
                <div
                  className="h-px flex-1"
                  style={{ background: "var(--line)" }}
                />
              </div>

              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="w-full cursor-pointer rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-brand transition active:scale-[0.98] disabled:cursor-default disabled:opacity-50"
                style={{ background: "var(--brand-soft)" }}
              >
                Upload an .ics file
              </button>
            </>
          )}
        </>
      )}
    </>
  );
}

/* ── the Settings card ──────────────────────────────────── */

export function ImportCalendar() {
  return (
    <div
      className="mt-4 rounded-[24px] bg-white px-5 py-5"
      style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
    >
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-faint">
        Import from your school
      </div>
      <ImportPanel />
    </div>
  );
}

/* ── the empty-state sheet ──────────────────────────────── */

/**
 * The same panel, reached from the one screen where it matters most: a Home
 * with nothing on it. A sheet rather than a route because the import *is* the
 * empty state's job — sending someone to Settings to fill an empty timetable
 * is asking them to go find the feature that was supposed to find them.
 */
export function ImportSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      // Rises from the bottom edge on a phone, where a sheet is the native
      // shape; a centred dialog from `md`, where one stuck to the floor of a
      // 900px window reads as a browser notification, not a task.
      className="absolute inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
      style={{ background: "rgba(10,8,24,.55)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Import your schedule"
    >
      <div
        className="max-h-full w-full overflow-y-auto rounded-t-[26px] bg-white px-5 pb-8 pt-4 md:max-w-[520px] md:rounded-[26px] md:pb-6"
        style={{ boxShadow: "0 -8px 32px rgba(10,8,24,.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-3 h-1 w-10 rounded-full md:hidden"
          style={{ background: "var(--line-strong)" }}
        />

        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-fredoka)] text-[19px] font-semibold text-ink">
            Import your schedule
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer px-1 text-[22px] leading-none text-hint transition hover:text-muted"
          >
            ×
          </button>
        </div>

        {/* Closing on success would hide the "added 12 items" line that proves
            it worked, so the sheet stays put and the screen behind it fills. */}
        <ImportPanel />
      </div>
    </div>
  );
}
