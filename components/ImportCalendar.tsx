"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore, type ClassItem, type TaskItem } from "@/lib/store";
import { parseIcs } from "@/lib/ics-import";

/**
 * Import from a school calendar feed (Canvas / Blackboard / Moodle / Google
 * Classroom). The server fetches and parses; this component previews the
 * candidates and only writes them to the store on an explicit confirm — so a
 * bad feed can't silently flood the timetable, and everything imported is
 * editable afterwards (which is why #34 shipped after edit/delete existed).
 */

type Candidates = {
  classes: Array<Omit<ClassItem, "id">>;
  tasks: Array<Omit<TaskItem, "id">>;
  skipped: number;
};

export function ImportCalendar() {
  const router = useRouter();
  const { importItems } = useStore();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Candidates | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const total = preview ? preview.classes.length + preview.tasks.length : 0;

  /** A downloaded .ics file needs no server round-trip and no SSRF screen —
   *  it's a local file, so we read and parse it right here in the browser. */
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking the same file fires again
    if (!file) return;
    setError(null);
    setPreview(null);
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
      setPreview(result);
    } catch {
      setError("Couldn't read that file. Try another.");
    } finally {
      setBusy(false);
    }
  }

  async function loadPreview() {
    setBusy(true);
    setError(null);
    setPreview(null);
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
      setPreview(data as Candidates);
    } catch {
      setError("Something went wrong. Check the link and try again.");
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    if (!preview) return;
    importItems(preview.classes, preview.tasks);
    setDone(preview.classes.length + preview.tasks.length);
    setPreview(null);
    setUrl("");
  }

  return (
    <div
      className="mt-4 rounded-[24px] bg-white px-5 py-5"
      style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
    >
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-faint">
        Import from your school
      </div>
      <p className="text-[13px] leading-snug text-muted">
        Paste the calendar feed link from Canvas, Blackboard, Moodle or Google
        Classroom — or upload a downloaded .ics file — and we&apos;ll pull in
        your classes and deadlines. You review everything before it&apos;s added.
      </p>

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
        className="mt-3 w-full rounded-[15px] px-4 py-[13px] text-[15px] text-ink outline-none"
        style={{
          background: "var(--bg-input)",
          border: "1px solid rgba(var(--brand-rgb),.12)",
        }}
      />

      {error && (
        <p className="mt-2 text-[13px] font-medium text-[var(--danger)]">{error}</p>
      )}

      {done !== null && (
        <p className="mt-2 text-[13px] font-medium text-brand">
          Added {done} {done === 1 ? "item" : "items"} — find them on your
          timetable and Tasks. 🎉
        </p>
      )}

      {preview ? (
        <div className="mt-3">
          <div
            className="rounded-[15px] px-4 py-3"
            style={{ background: "var(--brand-soft)" }}
          >
            <p className="text-[14px] font-semibold text-ink">
              Ready to import {total} {total === 1 ? "item" : "items"}
            </p>
            <p className="mt-0.5 text-[13px] text-muted">
              {preview.classes.length} classes · {preview.tasks.length}{" "}
              assignments
              {preview.skipped > 0 ? ` · ${preview.skipped} skipped` : ""}
            </p>
          </div>
          <div className="mt-3 flex gap-2.5">
            <button
              onClick={() => setPreview(null)}
              className="flex-1 rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-muted"
              style={{ background: "var(--bg-input)" }}
            >
              Cancel
            </button>
            <button
              onClick={confirm}
              disabled={total === 0}
              className="btn-brand flex-1 rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              Add {total}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={loadPreview}
            disabled={busy || url.trim().length === 0}
            className="mt-3 w-full rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-brand transition active:scale-[0.98] disabled:opacity-50"
            style={{ background: "var(--brand-soft)" }}
          >
            {busy ? "Working…" : "Preview import"}
          </button>

          <div className="my-3 flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "var(--bg-input)" }} />
            <span className="text-[11px] font-semibold text-faint">OR</span>
            <div className="h-px flex-1" style={{ background: "var(--bg-input)" }} />
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={handleFile}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="w-full rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-brand transition active:scale-[0.98] disabled:opacity-50"
            style={{ background: "var(--brand-soft)" }}
          >
            Upload an .ics file
          </button>
        </>
      )}
    </div>
  );
}
