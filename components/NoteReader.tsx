"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { htmlToMd, mdToHtml, type NoteItem } from "@/lib/notes";
import {
  clearHighlight,
  highlightRange,
  rangeHasHighlight,
} from "@/lib/highlight";

/**
 * The phone's view of a lecture: read it, mark it, don't write it.
 *
 * ── Why the phone doesn't get the editor ────────────────────────────────────
 *
 * A lecture gets typed on a laptop and read on a bus. Handing the phone the
 * same `contentEditable` the laptop gets means the keyboard springs up every
 * time a thumb brushes the page, the caret lands somewhere in the middle of
 * last Tuesday, and the note that took forty-five minutes to write quietly
 * grows a stray character. That is a bad trade for a surface nobody drafts on.
 *
 * So the phone renders the note as ordinary, un-editable HTML — no
 * contentEditable, no virtual keyboard, no caret — and offers exactly one
 * action: highlight. Highlighting is the thing you actually want while
 * skimming, it is coarse enough to do accurately with a thumb, and it cannot
 * lose a single word of what was written, because it only ever adds a wrapper
 * around text that is already there.
 *
 * ── Why not the editor with input blocked ───────────────────────────────────
 *
 * The tempting shortcut is to keep `contentEditable` and swallow every
 * `beforeinput` that isn't a highlight — the whole existing pipeline would come
 * along for free. It was rejected because contentEditable is what summons the
 * keyboard on mobile, and suppressing that across engines is a pile of
 * `inputMode` guesswork that fails differently on each one. Non-editable
 * content still supports native text selection everywhere, which is all the
 * highlighter actually needs.
 *
 * ── How a highlight gets back into the note ─────────────────────────────────
 *
 * The rendered DOM is the document, exactly as it is in NoteEditor: `mdToHtml`
 * builds it once, the highlight edits it in place, and `htmlToMd` projects it
 * back to markdown. Nothing here knows or cares that `==` is the marker — that
 * lives in lib/notes.ts and is shared with the desktop editor, so a highlight
 * made on a phone is the same bytes as one made on a laptop.
 */

/** Same four as the desktop editor. Legible under black text in both themes. */
const HIGHLIGHTS = [
  { id: "yellow", value: "#fff3a3", label: "Yellow" },
  { id: "green", value: "#c5f0c8", label: "Green" },
  { id: "blue", value: "#c9e4ff", label: "Blue" },
  { id: "pink", value: "#ffd3e8", label: "Pink" },
] as const;

export function NoteReader({
  note,
  onChange,
}: {
  note: NoteItem;
  /** Called with the note's markdown. Returns false if the budget refused it. */
  onChange: (body: string) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ top: number; left: number } | null>(null);
  const [onMark, setOnMark] = useState(false);

  /*
   * Mounted once per note id, exactly as NoteEditor does it.
   *
   * Keying on `note.body` instead would rebuild the DOM on every highlight —
   * applying one writes markdown to the store, which hands back a new body,
   * which would re-render the thing that had just been edited. Round-tripping
   * through `htmlToMd`/`mdToHtml` is lossless, so it would *work*; it would
   * also throw away the rendered document and any selection on it, twice per
   * tap, for no gain.
   */
  useEffect(() => {
    const el = ref.current;
    if (el) el.innerHTML = mdToHtml(note.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const save = useCallback(() => {
    const el = ref.current;
    if (el) onChange(htmlToMd(el));
  }, [onChange]);

  /** Show the bar wherever the selection is, or hide it when there isn't one. */
  const readSelection = useCallback(() => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.isCollapsed || sel.rangeCount === 0) {
      setBar(null);
      return;
    }
    const range = sel.getRangeAt(0);
    // Selections that start outside the note — the title, the class name — are
    // not ours to act on.
    if (!el.contains(range.commonAncestorContainer)) {
      setBar(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setBar(null);
      return;
    }

    setOnMark(rangeHasHighlight(el, range));
    setBar({
      // Above the selection, clamped inside the note so the bar can't be
      // scrolled off the top of a note highlighted on its first line.
      top: Math.max(4, rect.top - box.top + el.scrollTop - 46),
      left: Math.min(
        Math.max(8, rect.left - box.left + rect.width / 2 - 96),
        Math.max(8, box.width - 200),
      ),
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", readSelection);
    return () => document.removeEventListener("selectionchange", readSelection);
  }, [readSelection]);

  const apply = useCallback(
    (colour: string | null) => {
      const el = ref.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);

      const changed =
        colour === null
          ? clearHighlight(el, range)
          : highlightRange(el, range, colour);

      sel.removeAllRanges();
      setBar(null);
      // A selection of pure whitespace changes nothing, and saving anyway would
      // spend a write and a sync round trip announcing that.
      if (changed > 0) save();
    },
    [save],
  );

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        // Not contentEditable, and that is the whole point — see the header.
        className="note-body no-scrollbar h-full overflow-y-auto px-5 py-4 outline-none"
        // Selection is the one interaction this surface has, so it is enabled
        // explicitly rather than left to whatever the platform defaults to.
        style={{ WebkitUserSelect: "text", userSelect: "text" }}
      />

      {bar && (
        <div
          role="toolbar"
          aria-label="Highlight selected text"
          className="absolute z-20 flex items-center gap-1.5 rounded-full px-2 py-1.5"
          style={{
            top: bar.top,
            left: bar.left,
            background: "var(--bg-card)",
            boxShadow: "0 6px 20px rgba(10,8,24,.28)",
            border: "1px solid var(--line)",
          }}
          // The bar must not steal the selection it is about to act on: a
          // pointerdown that moves focus collapses the range before the click
          // handler ever runs.
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
        >
          {HIGHLIGHTS.map((h) => (
            <button
              key={h.id}
              type="button"
              aria-label={`Highlight ${h.label}`}
              onClick={() => apply(h.value)}
              className="h-7 w-7 rounded-full transition active:scale-90"
              style={{ background: h.value, border: "1px solid rgba(0,0,0,.12)" }}
            />
          ))}
          {onMark && (
            <button
              type="button"
              aria-label="Remove highlight"
              onClick={() => apply(null)}
              className="ml-0.5 h-7 rounded-full px-2.5 text-[12px] font-semibold text-muted transition active:scale-95"
              style={{ background: "var(--surface-2)" }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
