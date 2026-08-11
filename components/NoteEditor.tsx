"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { htmlToMd, mdToHtml, MAX_NOTE_CHARS, type NoteItem } from "@/lib/notes";

/**
 * The lecture editor.
 *
 * A `contentEditable` driven by `document.execCommand`. That API is formally
 * deprecated and has no replacement — the alternative is reimplementing
 * selection, list merging and undo on top of raw Ranges, which is how editors
 * become 200KB of dependency. Every engine still implements it, the commands
 * used here are the boring ones, and the output is normalised on save by
 * `htmlToMd`, so browser-specific markup never reaches storage.
 *
 * THE SAVE MODEL
 *
 * The DOM is the live document while a note is open; markdown is the
 * projection written to the store. So the editor mounts `mdToHtml` once per
 * note id and does not re-render from props afterwards — re-rendering on every
 * keystroke would fight the caret for it.
 *
 * Saving is deliberately aggressive. A student's worst outcome here is losing
 * 45 minutes of a lecture, so a save fires 500ms after typing stops, again on
 * blur, and again when the page is hidden or being torn down — `pagehide`
 * rather than `beforeunload`, because a phone backgrounding the tab never
 * fires the latter.
 */

/** Highlighter colours. Four, all legible under black text in both themes. */
const HIGHLIGHTS = [
  { id: "yellow", value: "#fff3a3", label: "Yellow" },
  { id: "green", value: "#c5f0c8", label: "Green" },
  { id: "blue", value: "#c9e4ff", label: "Blue" },
  { id: "pink", value: "#ffd3e8", label: "Pink" },
] as const;

/** Markers that turn into a block the moment you type the space after them. */
const SHORTCUTS: Array<{ re: RegExp; run: (ed: HTMLElement) => void }> = [
  { re: /^###$/, run: () => exec("formatBlock", "<h3>") },
  { re: /^##$/, run: () => exec("formatBlock", "<h2>") },
  { re: /^#$/, run: () => exec("formatBlock", "<h1>") },
  { re: /^>$/, run: () => exec("formatBlock", "<blockquote>") },
  { re: /^\[\]$|^\[ \]$/, run: (ed) => toggleChecklist(ed) },
  { re: /^[-*]$/, run: () => exec("insertUnorderedList") },
  { re: /^1\.$/, run: () => exec("insertOrderedList") },
];

function exec(command: string, value?: string) {
  try {
    document.execCommand(command, false, value);
  } catch {
    /* an engine that refuses a command leaves the text alone, which is fine */
  }
}

/** The block element the caret sits in, relative to the editor root. */
function currentBlock(root: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node: Node | null = sel.getRangeAt(0).startContainer;
  while (node && node !== root) {
    if (node.nodeType === 1) {
      const el = node as HTMLElement;
      if (/^(P|DIV|H1|H2|H3|LI|BLOCKQUOTE|PRE)$/.test(el.tagName)) return el;
    }
    node = node.parentNode;
  }
  return null;
}

/**
 * Turn the current list item into a checklist item, or back.
 *
 * There is no execCommand for this, so it rides on `insertUnorderedList` and
 * then marks the produced list. The checkbox itself is drawn by CSS on the
 * `li` — a real `<input>` inside a contentEditable is a node the caret can
 * land in, get selected with, and delete by accident.
 */
function toggleChecklist(root: HTMLElement) {
  const block = currentBlock(root);
  if (!block || block.tagName !== "LI") {
    exec("insertUnorderedList");
  }
  const li = currentBlock(root);
  const list = li?.parentElement;
  if (!list || list.tagName !== "UL") return;
  if (list.hasAttribute("data-checklist")) {
    list.removeAttribute("data-checklist");
    for (const item of Array.from(list.children)) {
      item.removeAttribute("data-checked");
    }
  } else {
    list.setAttribute("data-checklist", "");
    for (const item of Array.from(list.children)) {
      if (!item.hasAttribute("data-checked")) {
        item.setAttribute("data-checked", "false");
      }
    }
  }
}

/**
 * Wrap the selection in `<code>`.
 *
 * There is no execCommand for inline code, so this is the one command driven
 * off Ranges directly. `surroundContents` throws when the selection crosses an
 * element boundary (half of a bold run, say), which is common enough in prose
 * that the fallback is not an edge case.
 */
function wrapInlineCode() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const code = document.createElement("code");
  try {
    range.surroundContents(code);
  } catch {
    code.appendChild(range.extractContents());
    range.insertNode(code);
  }
  // Leave the caret after the span rather than inside it, so the next
  // character typed is prose again.
  sel.removeAllRanges();
  const after = document.createRange();
  after.setStartAfter(code);
  after.collapse(true);
  sel.addRange(after);
}

export function NoteEditor({
  note,
  onChange,
  onFull,
}: {
  note: NoteItem;
  /** Called with the note's markdown. Returns false if the budget refused it. */
  onChange: (body: string) => boolean;
  /** The budget refused a write — the note is at its ceiling. */
  onFull?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [full, setFull] = useState(false);
  const [chars, setChars] = useState(note.body.length);

  // Mount the note's markdown once per id. Re-rendering from `note.body` on
  // every change would move the caret to the start on each keystroke.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = mdToHtml(note.body);
    setDirty(false);
    setFull(false);
    setChars(note.body.length);
    // `styleWithCSS` off keeps bold as <b> rather than a styled span, which is
    // both smaller and what htmlToMd reads first.
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      /* not supported — the serialiser handles styled spans anyway */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const save = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const body = htmlToMd(el);
    setChars(body.length);
    const ok = onChange(body);
    if (!ok) {
      setFull(true);
      onFull?.();
      return;
    }
    setFull(false);
    setDirty(false);
  }, [onChange, onFull]);

  /** Save now, cancelling any pending debounce. */
  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    save();
  }, [save]);

  /**
   * The latest `flush`, reachable from an effect that must not re-subscribe.
   *
   * `onChange` writes to the store, which hands back a new `notes` array, which
   * gives this component a new `onChange` and therefore a new `flush`. If the
   * listener effect below depended on `flush`, every save would tear it down —
   * and its cleanup would save again, which would produce another new `flush`.
   * That is an infinite save loop, and it cost an afternoon to find once.
   */
  const flushRef = useRef(flush);
  // Written in an effect rather than during render — a ref assigned mid-render
  // is torn under concurrent rendering, and the linter is right to say so.
  useEffect(() => {
    flushRef.current = flush;
  });

  // The lid closing, the tab being hidden, the PWA going to the background —
  // every one of these can end the session without a blur, so each one saves.
  // Subscribed once: see flushRef above.
  useEffect(() => {
    const onHide = () => flushRef.current();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      // Unmounting counts too. The parent gives this component a `key` of the
      // note id, so switching notes unmounts it — and this cleanup still holds
      // the *outgoing* note's onChange, which is the only way the last edit
      // lands on the note it was actually typed into.
      flushRef.current();
    };
  }, []);

  const scheduleSave = useCallback(() => {
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      save();
    }, 500);
  }, [save]);

  /**
   * Markdown shortcuts. Typing `## ` at the start of a line turns it into a
   * heading and eats the marker, so a fast typist never has to reach for the
   * toolbar — the reason to have them at all.
   */
  const onBeforeInput = (e: React.FormEvent<HTMLDivElement>) => {
    const ev = e.nativeEvent as InputEvent;
    if (ev.inputType !== "insertText" || ev.data !== " ") return;
    const root = ref.current;
    if (!root) return;
    const block = currentBlock(root);
    if (!block) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    // Only the text between the block's start and the caret counts, so `# `
    // typed mid-sentence stays a hash.
    const probe = range.cloneRange();
    probe.selectNodeContents(block);
    probe.setEnd(range.startContainer, range.startOffset);
    const typed = probe.toString();

    const shortcut = SHORTCUTS.find((s) => s.re.test(typed));
    if (!shortcut) return;

    e.preventDefault();
    // Remove the marker, then apply the block format in its place.
    const kill = document.createRange();
    kill.setStart(probe.startContainer, probe.startOffset);
    kill.setEnd(range.startContainer, range.startOffset);
    sel.removeAllRanges();
    sel.addRange(kill);
    exec("delete");
    shortcut.run(root);
    scheduleSave();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === "b" || key === "i" || key === "u") {
      // The browser's own defaults for these are the commands we want, but
      // running them explicitly keeps the behaviour identical everywhere and
      // lets the save fire.
      e.preventDefault();
      exec(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
      scheduleSave();
    } else if (key === "s") {
      // Nothing to save to a file — but the reflex is universal, and answering
      // it with the browser's Save Page dialog would be alarming.
      e.preventDefault();
      flush();
    }
  };

  /**
   * Clicking the checkbox gutter ticks the item.
   *
   * The box is a CSS `::before` in the item's left padding, so there is no
   * element to bind to — the hit test is the click's offset instead. That
   * keeps the DOM free of `contenteditable=false` islands, which break
   * selection and can be deleted with a single backspace.
   */
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest("li");
    if (!target) return;
    const list = target.parentElement;
    if (!list?.hasAttribute("data-checklist")) return;
    const rect = target.getBoundingClientRect();
    if (e.clientX - rect.left > 26) return;
    target.setAttribute(
      "data-checked",
      target.getAttribute("data-checked") === "true" ? "false" : "true",
    );
    scheduleSave();
  };

  /** Paste as plain text — a paste from a slide deck otherwise arrives with
   *  fonts, colours and tables that neither the dialect nor the budget wants. */
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    exec("insertText", text);
    scheduleSave();
  };

  const near = chars > MAX_NOTE_CHARS * 0.9;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar
        onCommand={(fn) => {
          const el = ref.current;
          if (!el) return;
          el.focus();
          fn(el);
          scheduleSave();
        }}
      />

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Note"
        spellCheck
        className="note-body no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 outline-none md:px-8 md:py-6"
        onInput={scheduleSave}
        onBeforeInput={onBeforeInput}
        onKeyDown={onKeyDown}
        onClick={onClick}
        onPaste={onPaste}
        onBlur={flush}
      />

      <div
        className="flex items-center justify-between px-5 py-2 md:px-8"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <span className="text-[11px] font-medium text-faint">
          {full
            ? "This note is full — nothing more will be saved"
            : dirty
              ? "Saving…"
              : "Saved"}
        </span>
        {(near || full) && (
          <span
            className="text-[11px] font-semibold"
            style={{ color: full ? "var(--danger-ink)" : "var(--warn-ink)" }}
          >
            {chars.toLocaleString()} / {MAX_NOTE_CHARS.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── toolbar ───────────────────────────────────────────────
   One row, no dropdowns except the highlighter. The list in the brief is the
   list here: headings, bold/italic/underline, highlight, bullets, numbers,
   checklist, quote, code, link. Anything else is a lecture going past while
   the student hunts for a menu. */

function Toolbar({ onCommand }: { onCommand: (fn: (ed: HTMLElement) => void) => void }) {
  const [showHighlights, setShowHighlights] = useState(false);

  const link = () => {
    const url = window.prompt("Link to:");
    if (!url) return;
    // Only schemes that can't execute — same rule as the markdown parser, and
    // it has to be enforced here too or the DOM holds one the parser rejects.
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) {
      window.alert("Links must start with https:// or mailto:");
      return;
    }
    exec("createLink", url.trim());
  };

  return (
    <div
      className="no-scrollbar flex shrink-0 items-center gap-0.5 overflow-x-auto px-3 py-2 md:px-6"
      style={{ borderBottom: "1px solid var(--line)" }}
    >
      <Btn label="Heading 1" onClick={() => onCommand(() => exec("formatBlock", "<h1>"))}>
        <span className="text-[13px] font-bold">H1</span>
      </Btn>
      <Btn label="Heading 2" onClick={() => onCommand(() => exec("formatBlock", "<h2>"))}>
        <span className="text-[13px] font-bold">H2</span>
      </Btn>
      <Btn label="Heading 3" onClick={() => onCommand(() => exec("formatBlock", "<h3>"))}>
        <span className="text-[13px] font-bold">H3</span>
      </Btn>
      <Btn label="Body text" onClick={() => onCommand(() => exec("formatBlock", "<p>"))}>
        <span className="text-[12px] font-semibold">Body</span>
      </Btn>

      <Divider />

      <Btn label="Bold" onClick={() => onCommand(() => exec("bold"))}>
        <span className="text-[14px] font-bold">B</span>
      </Btn>
      <Btn label="Italic" onClick={() => onCommand(() => exec("italic"))}>
        <span className="text-[14px] font-semibold italic">I</span>
      </Btn>
      <Btn label="Underline" onClick={() => onCommand(() => exec("underline"))}>
        <span className="text-[14px] font-semibold underline">U</span>
      </Btn>

      <span className="relative">
        <Btn
          label="Highlight"
          onClick={() => setShowHighlights((v) => !v)}
        >
          <span
            className="rounded px-1 text-[13px] font-bold text-[#3a2f00]"
            style={{ background: HIGHLIGHTS[0].value }}
          >
            H
          </span>
        </Btn>
        {showHighlights && (
          <span
            className="absolute left-0 top-full z-20 mt-1 flex gap-1 rounded-[12px] p-1.5"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--line)",
              boxShadow: "0 8px 22px rgba(30,20,80,.16)",
            }}
          >
            {HIGHLIGHTS.map((h) => (
              <button
                key={h.id}
                type="button"
                aria-label={h.label}
                onClick={() => {
                  setShowHighlights(false);
                  onCommand(() => {
                    // hiliteColor needs CSS styling on; the serialiser reads
                    // the resulting span's background back as ==highlight==.
                    exec("styleWithCSS", "true");
                    exec("hiliteColor", h.value);
                    exec("styleWithCSS", "false");
                  });
                }}
                className="h-6 w-6 rounded-full"
                style={{ background: h.value, border: "1px solid var(--line)" }}
              />
            ))}
            <button
              type="button"
              aria-label="Remove highlight"
              onClick={() => {
                setShowHighlights(false);
                onCommand(() => {
                  exec("styleWithCSS", "true");
                  exec("hiliteColor", "transparent");
                  exec("styleWithCSS", "false");
                });
              }}
              className="h-6 w-6 rounded-full text-[13px] font-bold text-muted"
              style={{ border: "1px solid var(--line)" }}
            >
              ×
            </button>
          </span>
        )}
      </span>

      <Divider />

      <Btn label="Bulleted list" onClick={() => onCommand(() => exec("insertUnorderedList"))}>
        <BulletGlyph />
      </Btn>
      <Btn label="Numbered list" onClick={() => onCommand(() => exec("insertOrderedList"))}>
        <span className="text-[12px] font-bold">1.</span>
      </Btn>
      <Btn label="Checklist" onClick={() => onCommand((ed) => toggleChecklist(ed))}>
        <CheckGlyph />
      </Btn>

      <Divider />

      <Btn label="Quote" onClick={() => onCommand(() => exec("formatBlock", "<blockquote>"))}>
        <span className="text-[15px] font-bold leading-none">&rdquo;</span>
      </Btn>
      <Btn label="Inline code" onClick={() => onCommand(wrapInlineCode)}>
        <span className="font-mono text-[12px] font-bold">{"<>"}</span>
      </Btn>
      <Btn label="Code block" onClick={() => onCommand(() => exec("formatBlock", "<pre>"))}>
        <span className="font-mono text-[12px] font-bold">{"{ }"}</span>
      </Btn>
      <Btn label="Link" onClick={() => onCommand(link)}>
        <LinkGlyph />
      </Btn>
    </div>
  );
}

function Btn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // The editor must not lose the selection when the button takes focus,
      // or every command would apply to nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-[9px] px-1.5 text-muted transition hover:text-ink"
      style={{ background: "transparent" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <span
      className="mx-1 h-5 w-px shrink-0"
      style={{ background: "var(--line)" }}
    />
  );
}

function BulletGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none">
      <circle cx="5" cy="7" r="1.7" fill="currentColor" />
      <circle cx="5" cy="12" r="1.7" fill="currentColor" />
      <circle cx="5" cy="17" r="1.7" fill="currentColor" />
      <path
        d="M10 7h9M10 12h9M10 17h9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none">
      <rect
        x="3"
        y="4"
        width="7"
        height="7"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M4.6 14.8l1.8 1.8 3.2-3.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 7.5h8M13 16h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none">
      <path
        d="M10 13.5a3.5 3.5 0 005 0l3-3a3.5 3.5 0 10-5-5l-1 1M14 10.5a3.5 3.5 0 00-5 0l-3 3a3.5 3.5 0 105 5l1-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
