/**
 * Lecture notes — the data model and the markup dialect they're stored in.
 *
 * WHY MARKDOWN AND NOT HTML
 *
 * The editor is a `contentEditable`, so the live document is a DOM tree. What
 * gets *saved* is markdown, for three reasons that all matter here:
 *
 *   • Size. The synced document has a hard 512KB ceiling (app/api/sync), and
 *     notes are the first thing in this app whose length is up to the user.
 *     `**bold**` costs 4 characters; `<strong></strong>` costs 17.
 *   • Safety. Storing HTML means one day rendering HTML that came back over
 *     the wire. Markdown is re-parsed into a DOM we build ourselves, escaping
 *     as we go, so a synced note can never inject markup.
 *   • Export. `.md` and `.txt` are the same file, and lib/pdf.ts wants lines
 *     of text with a style per line — which is what this parses to anyway.
 *
 * THE DIALECT
 *
 * Deliberately small, and mostly CommonMark. Two deviations, both because a
 * student writing lecture notes wants them and markdown has no spelling:
 *
 *   __text__   underline   (CommonMark reads this as bold; we already have **)
 *   ==text==   highlight   (the extension most editors settled on)
 *
 * Everything else is what you'd guess: `#`/`##`/`###`, `-`, `1.`, `- [ ]`,
 * `>`, ``` fences, `` `code` ``, `[text](url)`.
 */

/** One note. Belongs to a class, and to the day it was taken. */
export interface NoteItem {
  id: string;
  /** The class this was taken in. Never empty — notes live under a class. */
  classId: string;
  /**
   * The day the lecture happened, as `YYYY-MM-DD`. Not a timestamp: two notes
   * on the same day are two notes, and the date is a heading, not a clock.
   */
  date: string;
  /**
   * What the student called it. Empty means "untitled" and the list falls back
   * to the first line of the body, so a note never has to be named to be found.
   */
  title: string;
  /** The note itself, in the dialect above. */
  body: string;
  /**
   * ms timestamp of the last edit *to this note*. The document as a whole
   * already has one for last-write-wins sync; this exists so a pull can merge
   * note-by-note instead of taking one side wholesale — the laptop is where
   * lectures get typed and the phone is what gets carried, so "newest document
   * wins" is the wrong rule for exactly this array.
   */
  updatedAt: number;
}

/* ── budget ────────────────────────────────────────────────
   The whole document must stay under 512KB or `PUT /api/sync` returns 413 and
   the user's sync stops — silently, from their point of view. So notes get an
   explicit allowance well inside that, and the editor refuses to grow past it
   rather than letting a student discover the ceiling by losing a term's work.

   This is a stopgap. The real fix is notes on their own endpoint, keyed per
   note, so length stops being a shared resource. */

/** Longest single note. A dense 90-minute lecture runs 4–6k characters. */
export const MAX_NOTE_CHARS = 20_000;
/** Most notes we'll keep. Five classes × three a week × a 15-week term ≈ 225. */
export const MAX_NOTES = 400;
/** Total characters across all notes — the share of the document they may use. */
export const MAX_NOTES_CHARS = 300_000;

/** Characters currently spent on notes. */
export function notesSize(notes: NoteItem[]): number {
  let n = 0;
  for (const note of notes) n += note.body.length + note.title.length;
  return n;
}

/**
 * Is there room for note `id` to become `nextBodyLength` characters?
 *
 * Asked before an edit is accepted, so it measures the *replacement* rather
 * than an addition — cutting a full note down is always allowed.
 */
export function fitsBudget(
  notes: NoteItem[],
  id: string,
  nextBodyLength: number,
): boolean {
  if (nextBodyLength > MAX_NOTE_CHARS) return false;
  const others = notes.filter((n) => n.id !== id);
  return notesSize(others) + nextBodyLength <= MAX_NOTES_CHARS;
}

/* ── normalisation ─────────────────────────────────────────
   Read defensively: this array arrives from localStorage and from another
   device's document, either of which may have been written by a build that
   didn't have the field yet. */

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function normalizeNotes(raw: unknown): NoteItem[] {
  if (!Array.isArray(raw)) return [];
  const out: NoteItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const n = item as Record<string, unknown>;
    const id = str(n.id);
    const classId = str(n.classId);
    if (!id || !classId) continue;
    out.push({
      id,
      classId,
      date: str(n.date),
      title: str(n.title).slice(0, 200),
      body: str(n.body).slice(0, MAX_NOTE_CHARS),
      updatedAt: typeof n.updatedAt === "number" ? n.updatedAt : 0,
    });
    if (out.length >= MAX_NOTES) break;
  }
  return out;
}

/**
 * Merge two note arrays, newest edit per id winning.
 *
 * Used when a sync pull finds a newer server document. Replacing the array
 * wholesale is what the rest of the document does, and it's wrong here: a
 * lecture typed on the laptop and a checkbox ticked on the phone are not in
 * conflict, they're two notes, and only one of them should move.
 *
 * A note absent from one side is kept, not deleted — a deletion that has to
 * beat an edit needs a tombstone, and losing a note is worse than keeping one
 * the user meant to bin. Deleting again is one tap; retyping a lecture isn't.
 */
export function mergeNotes(a: NoteItem[], b: NoteItem[]): NoteItem[] {
  const byId = new Map<string, NoteItem>();
  for (const note of a) byId.set(note.id, note);
  for (const note of b) {
    const mine = byId.get(note.id);
    if (!mine || note.updatedAt > mine.updatedAt) byId.set(note.id, note);
  }
  return [...byId.values()]
    .sort((x, y) => y.date.localeCompare(x.date) || y.updatedAt - x.updatedAt)
    .slice(0, MAX_NOTES);
}

/** `YYYY-MM-DD` for a local date — the key notes are filed under. */
export function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "Mon, Sep 8" for a `YYYY-MM-DD` key. Falls back to the raw key. */
export function dayLabel(key: string, today = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return key;
  if (dayKey(d) === dayKey(today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Drop block and inline markers, leaving readable text. */
export function stripMarkers(line: string): string {
  return line
    .replace(/^\s{0,3}(#{1,3}\s+|>\s?|[-*]\s+\[[ xX]\]\s*|[-*]\s+|\d+\.\s+)/, "")
    .replace(/^```.*$/, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|==|`|\*)/g, "")
    .replace(/\\([\\*_=`[\]])/g, "$1");
}

/**
 * What to call a note in a list. The typed title if there is one, else the
 * first line of the body with its markers stripped, else "Untitled".
 */
export function noteTitle(note: { title: string; body: string }): string {
  const typed = note.title.trim();
  if (typed) return typed;
  for (const line of note.body.split("\n")) {
    const text = stripMarkers(line).trim();
    if (text) return text.slice(0, 80);
  }
  return "Untitled note";
}

/** A one-line preview of the body — everything after the line the title took. */
export function notePreview(body: string, max = 120): string {
  const lines = body.split("\n").map((l) => stripMarkers(l).trim());
  const first = lines.findIndex(Boolean);
  const text = (first === -1 ? [] : lines.slice(first + 1))
    .filter(Boolean)
    .join(" ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Plain text of the whole note — what `.txt` export and search read. */
export function noteText(body: string): string {
  return body
    .split("\n")
    .map((l) => stripMarkers(l))
    .join("\n");
}

/* ── markdown → HTML ───────────────────────────────────────
   The editor mounts this once per note; from then on the DOM is the live
   document and `htmlToMd` projects it back. */

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESC[c]);
}

/**
 * Only `http(s):` and `mailto:` survive. Everything else — `javascript:`
 * above all — is left as plain text, because this markdown may have arrived
 * from another device's document rather than from the person reading it.
 */
function safeHref(url: string): string | null {
  const trimmed = url.trim();
  return /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : null;
}

/**
 * A stash slot in the text being transformed.
 *
 * U+0000 can't appear in the input — it isn't typeable and `htmlToMd` never
 * emits one — which makes it a placeholder no note content can collide with.
 * A printable sentinel could not promise that.
 */
const SLOT_OPEN = "\u0000";
const SLOT_CLOSE = "\u0001";
const SLOT_RE = /\u0000(\d+)\u0001/g;

/**
 * Inline markers → HTML, on already-escaped text.
 *
 * Two things are lifted out before the marker passes run and put back after:
 * backslash-escaped characters (`\*` is a literal asterisk, not emphasis) and
 * code spans (whose contents are literal, so `` `**x**` `` must survive). Both
 * would otherwise be re-read as markup by the very passes they escape.
 */
export function inlineToHtml(escaped: string): string {
  const stash: string[] = [];
  const keep = (html: string) => {
    stash.push(html);
    return `${SLOT_OPEN}${stash.length - 1}${SLOT_CLOSE}`;
  };

  let s = escaped
    .replace(/\\([\\*_=`[\]])/g, (_, ch: string) => keep(ch))
    .replace(/`([^`]+)`/g, (_, body: string) => keep(`<code>${body}</code>`));

  s = s.replace(
    /\[([^\]]*)\]\(([^)\s]*)\)/g,
    (whole, text: string, url: string) => {
      const href = safeHref(url);
      return href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${text || escapeHtml(href)}</a>`
        : whole;
    },
  );

  // Longest markers first: ** before *, so bold isn't read as two italics.
  s = s
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^_]+)__/g, "<u>$1</u>")
    .replace(/==([^=]+)==/g, "<mark>$1</mark>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<i>$2</i>");

  return s.replace(SLOT_RE, (_, i: string) => stash[Number(i)] ?? "");
}

interface Block {
  kind: "h1" | "h2" | "h3" | "p" | "quote" | "code" | "ul" | "ol" | "check";
  text: string;
  checked?: boolean;
}

/** Split markdown into line-level blocks. Exported for the tests. */
export function parseBlocks(md: string): Block[] {
  const out: Block[] = [];
  const lines = md.split("\n");
  let inFence = false;
  let fence: string[] = [];

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (inFence) {
        out.push({ kind: "code", text: fence.join("\n") });
        fence = [];
        inFence = false;
      } else {
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fence.push(line);
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      out.push({
        kind: `h${heading[1].length}` as "h1" | "h2" | "h3",
        text: heading[2],
      });
      continue;
    }
    const check = /^[-*]\s+\[([ xX])\]\s*(.*)$/.exec(line);
    if (check) {
      out.push({
        kind: "check",
        text: check[2],
        checked: check[1].toLowerCase() === "x",
      });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      out.push({ kind: "ul", text: bullet[1] });
      continue;
    }
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (numbered) {
      out.push({ kind: "ol", text: numbered[1] });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      out.push({ kind: "quote", text: quote[1] });
      continue;
    }
    out.push({ kind: "p", text: line });
  }

  // An unterminated fence is still a code block — a student who typed ``` and
  // kept going shouldn't watch the rest of the lecture render as headings.
  if (inFence) out.push({ kind: "code", text: fence.join("\n") });
  return out;
}

/** Markdown → the HTML the editor edits. */
export function mdToHtml(md: string): string {
  const blocks = parseBlocks(md);
  const html: string[] = [];
  let list: "ul" | "ol" | "check" | null = null;

  const closeList = () => {
    if (list === "ol") html.push("</ol>");
    else if (list) html.push("</ul>");
    list = null;
  };

  for (const b of blocks) {
    const listKind =
      b.kind === "ul" || b.kind === "ol" || b.kind === "check" ? b.kind : null;
    if (!listKind) closeList();

    if (listKind) {
      if (list !== listKind) {
        closeList();
        if (listKind === "ol") html.push("<ol>");
        else if (listKind === "check") html.push('<ul data-checklist="">');
        else html.push("<ul>");
        list = listKind;
      }
      const inner = inlineToHtml(escapeHtml(b.text)) || "<br>";
      html.push(
        listKind === "check"
          ? `<li data-checked="${b.checked ? "true" : "false"}">${inner}</li>`
          : `<li>${inner}</li>`,
      );
      continue;
    }

    if (b.kind === "code") {
      html.push(`<pre>${escapeHtml(b.text)}</pre>`);
      continue;
    }
    const inner = inlineToHtml(escapeHtml(b.text)) || "<br>";
    if (b.kind === "quote") html.push(`<blockquote>${inner}</blockquote>`);
    else if (b.kind === "p") html.push(`<p>${inner}</p>`);
    else html.push(`<${b.kind}>${inner}</${b.kind}>`);
  }
  closeList();

  return html.join("") || "<p><br></p>";
}

/* ── HTML → markdown ───────────────────────────────────────
   The editor's DOM is whatever the browser's editing commands produced, which
   differs between engines. This normalises it: anything unrecognised
   contributes its text and nothing else, so an unexpected wrapper degrades to
   plain content instead of corrupting the note. */

const NBSP = /\u00a0/g;
const ZWSP = /\u200b/g;

/** Does this element carry a highlight? */
function isHighlight(el: Element): boolean {
  if (el.tagName === "MARK") return true;
  const bg = (el as HTMLElement).style?.backgroundColor;
  return (
    !!bg && bg !== "transparent" && !/rgba\(0,\s*0,\s*0,\s*0\)/.test(bg)
  );
}

/** Escape the characters that would otherwise be read back as markers. */
function escapeMd(text: string): string {
  return text
    .replace(NBSP, " ")
    .replace(ZWSP, "")
    .replace(/([\\*_=`[\]])/g, "\\$1");
}

function inlineToMd(node: Node): string {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    return escapeMd(node.textContent ?? "");
  }
  if (node.nodeType !== 1 /* ELEMENT_NODE */) return "";

  const el = node as HTMLElement;
  const inner = childrenToMd(el);

  switch (el.tagName) {
    case "BR":
      return "\n";
    case "B":
    case "STRONG":
      return inner.trim() ? `**${inner}**` : inner;
    case "I":
    case "EM":
      return inner.trim() ? `*${inner}*` : inner;
    case "U":
      return inner.trim() ? `__${inner}__` : inner;
    case "CODE":
      // Code spans are literal, so the escaping the text nodes just applied
      // has to come back off — `\*` inside backticks is two characters.
      return inner.trim() ? `\`${inner.replace(/\\(.)/g, "$1")}\`` : inner;
    case "A": {
      const safe = safeHref(el.getAttribute("href") ?? "");
      return safe ? `[${inner}](${safe})` : inner;
    }
    default:
      if (isHighlight(el)) return inner.trim() ? `==${inner}==` : inner;
      return inner;
  }
}

function childrenToMd(el: Node): string {
  let out = "";
  for (const child of Array.from(el.childNodes)) out += inlineToMd(child);
  return out;
}

const BLOCK_PREFIX: Record<string, string> = {
  H1: "# ",
  H2: "## ",
  H3: "### ",
  BLOCKQUOTE: "> ",
};

/** The editor's DOM → markdown. */
export function htmlToMd(root: HTMLElement): string {
  const lines: string[] = [];

  const pushBlock = (el: HTMLElement, prefix = "") => {
    // A block can contain <br>s; each becomes its own line, keeping the prefix.
    const md = childrenToMd(el);
    /*
     * ...but a block that is *only* a <br> is one empty line, not two.
     *
     * `<p><br></p>` is what every engine writes for a blank line, and what
     * mdToHtml emits for one. Serialising it as "\n" and splitting on "\n"
     * yields two empty strings, so every blank line in a note gained a
     * companion each time the note was rendered and saved again — "one\n\ntwo"
     * became nine newlines after three round trips. Slow on the desktop
     * editor, which mounts once; immediate on the phone's reader, which round
     * trips the whole note to apply a highlight. Notes have a hard character
     * budget (MAX_NOTES_CHARS), so left alone this eventually eats it.
     */
    const parts = md === "\n" ? [""] : md.split("\n");
    for (const part of parts) lines.push(prefix + part);
  };

  const walk = (parent: Node) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 3 /* TEXT_NODE */) {
        const text = (node.textContent ?? "").replace(NBSP, " ");
        if (text.trim()) lines.push(escapeMd(text));
        continue;
      }
      if (node.nodeType !== 1 /* ELEMENT_NODE */) continue;
      const el = node as HTMLElement;

      switch (el.tagName) {
        case "H1":
        case "H2":
        case "H3":
        case "BLOCKQUOTE":
          pushBlock(el, BLOCK_PREFIX[el.tagName]);
          break;
        case "PRE":
          lines.push("```");
          for (const l of (el.textContent ?? "").split("\n")) lines.push(l);
          lines.push("```");
          break;
        case "UL":
        case "OL": {
          let n = 1;
          const checklist = el.hasAttribute("data-checklist");
          for (const child of Array.from(el.children)) {
            if (child.tagName !== "LI") continue;
            const li = child as HTMLElement;
            const md = childrenToMd(li).split("\n").join(" ");
            if (checklist) {
              const done = li.getAttribute("data-checked") === "true";
              lines.push(`- [${done ? "x" : " "}] ${md}`);
            } else if (el.tagName === "OL") {
              lines.push(`${n++}. ${md}`);
            } else {
              lines.push(`- ${md}`);
            }
          }
          break;
        }
        case "P":
        case "DIV":
          pushBlock(el);
          break;
        case "BR":
          lines.push("");
          break;
        default:
          // An unknown wrapper — walk into it rather than lose what's inside.
          walk(el);
      }
    }
  };

  walk(root);

  // Trailing blank lines are an artefact of the editor always keeping an empty
  // paragraph at the end; without this they'd grow by one on every save.
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.join("\n");
}
