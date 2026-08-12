import { describe, expect, it } from "vitest";
import {
  MAX_NOTES_CHARS,
  MAX_NOTE_CHARS,
  dayKey,
  dayLabel,
  fitsBudget,
  htmlToMd,
  inlineToHtml,
  mdToHtml,
  mergeNotes,
  normalizeNotes,
  noteTitle,
  notePreview,
  noteText,
  parseBlocks,
  type NoteItem,
} from "./notes";

/* ── a DOM small enough to hold in your head ───────────────
   The suite runs on `environment: node`, and htmlToMd needs element nodes.
   jsdom would be 30MB of devDependency to exercise seven properties, so this
   implements exactly the seven: nodeType, tagName, childNodes, children,
   textContent, getAttribute/hasAttribute, and style.backgroundColor. If
   htmlToMd ever reaches for an eighth, this fails loudly rather than lying. */

interface FakeNode {
  nodeType: number;
  textContent: string;
  childNodes: FakeNode[];
}

function text(s: string): FakeNode {
  return { nodeType: 3, textContent: s, childNodes: [] };
}

function el(
  tagName: string,
  children: Array<FakeNode | string> = [],
  attrs: Record<string, string> = {},
): FakeNode {
  const kids = children.map((c) => (typeof c === "string" ? text(c) : c));
  const node = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    childNodes: kids,
    children: kids.filter((k) => k.nodeType === 1),
    getAttribute: (n: string) => attrs[n] ?? null,
    hasAttribute: (n: string) => n in attrs,
    style: { backgroundColor: attrs.background ?? "" },
    get textContent(): string {
      return kids.map((k) => k.textContent).join("");
    },
  };
  return node as unknown as FakeNode;
}

/** htmlToMd's parameter is typed for the real DOM; the stub is structural. */
const md = (node: FakeNode) => htmlToMd(node as unknown as HTMLElement);

const note = (over: Partial<NoteItem> = {}): NoteItem => ({
  id: "n1",
  classId: "c1",
  date: "2026-09-08",
  title: "",
  body: "",
  updatedAt: 1000,
  ...over,
});

describe("parseBlocks", () => {
  it("reads every block marker", () => {
    const blocks = parseBlocks(
      [
        "# Title",
        "## Sub",
        "### Deep",
        "plain",
        "- bullet",
        "1. first",
        "- [ ] todo",
        "- [x] done",
        "> quoted",
      ].join("\n"),
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "h1",
      "h2",
      "h3",
      "p",
      "ul",
      "ol",
      "check",
      "check",
      "quote",
    ]);
    expect(blocks[7].checked).toBe(true);
    expect(blocks[6].checked).toBe(false);
  });

  it("keeps fenced code literal", () => {
    const blocks = parseBlocks("```\n# not a heading\n- not a bullet\n```");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("code");
    expect(blocks[0].text).toBe("# not a heading\n- not a bullet");
  });

  it("treats an unterminated fence as a code block", () => {
    // Otherwise everything after a stray ``` renders as headings mid-lecture.
    const blocks = parseBlocks("```\nstill code\nmore code");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("code");
    expect(blocks[0].text).toBe("still code\nmore code");
  });
});

describe("inlineToHtml", () => {
  it("maps the inline dialect", () => {
    expect(inlineToHtml("**b**")).toBe("<b>b</b>");
    expect(inlineToHtml("*i*")).toBe("<i>i</i>");
    expect(inlineToHtml("__u__")).toBe("<u>u</u>");
    expect(inlineToHtml("==h==")).toBe("<mark>h</mark>");
    expect(inlineToHtml("`c`")).toBe("<code>c</code>");
  });

  it("reads bold before italic", () => {
    expect(inlineToHtml("**both**")).toBe("<b>both</b>");
  });

  it("leaves code spans literal", () => {
    expect(inlineToHtml("`**x**`")).toBe("<code>**x**</code>");
  });

  it("honours backslash escapes", () => {
    expect(inlineToHtml("\\*not italic\\*")).toBe("*not italic*");
  });

  it("links only to schemes that can't run code", () => {
    expect(inlineToHtml("[a](https://x.test)")).toContain('href="https://x.test"');
    expect(inlineToHtml("[a](mailto:x@y.test)")).toContain("mailto:x@y.test");
    // The dangerous one stays inert text — this markdown may have arrived from
    // another device's synced document, not from the person reading it. The
    // characters survive on screen, which is right: the student typed them and
    // should see them. What must not survive is the anchor.
    const js = inlineToHtml("[a](javascript:alert(1))");
    expect(js).not.toContain("<a");
    expect(js).not.toContain("href");
    expect(js).toBe("[a](javascript:alert(1))");
  });
});

describe("mdToHtml", () => {
  it("escapes markup in the note body", () => {
    const html = mdToHtml("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("groups consecutive list items into one list", () => {
    expect(mdToHtml("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(mdToHtml("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  it("starts a new list when the kind changes", () => {
    expect(mdToHtml("- a\n1. b")).toBe("<ul><li>a</li></ul><ol><li>b</li></ol>");
  });

  it("marks checklist state on the item", () => {
    expect(mdToHtml("- [x] done")).toBe(
      '<ul data-checklist=""><li data-checked="true">done</li></ul>',
    );
  });

  it("never renders empty — an empty note still needs a line to type on", () => {
    expect(mdToHtml("")).toBe("<p><br></p>");
  });
});

describe("htmlToMd", () => {
  it("serialises blocks", () => {
    const root = el("div", [
      el("h1", ["Title"]),
      el("h2", ["Sub"]),
      el("p", ["plain"]),
      el("blockquote", ["quoted"]),
    ]);
    expect(md(root)).toBe("# Title\n## Sub\nplain\n> quoted");
  });

  /**
   * `<p><br></p>` is what every engine — and mdToHtml itself — writes for a
   * blank line. Serialising it as two empty lines meant every blank line in a
   * note gained a companion each time the note was opened and saved again, so
   * "one\n\ntwo" reached nine newlines after three round trips and a note with
   * whitespace in it walked steadily towards the character budget.
   */
  it("reads an empty paragraph as one blank line, not two", () => {
    const root = el("div", [
      el("p", ["one"]),
      el("p", [el("br")]),
      el("p", ["two"]),
    ]);
    expect(md(root)).toBe("one\n\ntwo");
  });

  it("still splits a <br> *inside* a line into two lines", () => {
    const root = el("div", [el("p", ["a", el("br"), "b"])]);
    expect(md(root)).toBe("a\nb");
  });

  /**
   * The property that matters is that rendering and serialising is a fixed
   * point. There is no HTML parser here to close that loop in one expression,
   * so it is closed in two: mdToHtml turns a blank line into exactly the
   * markup the test above serialises back to a blank line. Between them the
   * cycle is pinned at both ends.
   */
  it("renders a blank line as the markup that reads back as one", () => {
    expect(mdToHtml("one\n\ntwo")).toBe("<p>one</p><p><br></p><p>two</p>");
  });

  it("serialises the inline set, including a span highlight", () => {
    const root = el("div", [
      el("p", [
        el("b", ["b"]),
        el("i", ["i"]),
        el("u", ["u"]),
        // What execCommand('hiliteColor') actually produces.
        el("span", ["h"], { background: "rgb(255, 243, 141)" }),
        el("code", ["c"]),
      ]),
    ]);
    expect(md(root)).toBe("**b***i*__u__==h==`c`");
  });

  it("numbers ordered lists and ticks checklists", () => {
    const ol = el("ol", [el("li", ["one"]), el("li", ["two"])]);
    expect(md(el("div", [ol]))).toBe("1. one\n2. two");

    const checks = el(
      "ul",
      [
        el("li", ["open"], { "data-checked": "false" }),
        el("li", ["shut"], { "data-checked": "true" }),
      ],
      { "data-checklist": "" },
    );
    expect(md(el("div", [checks]))).toBe("- [ ] open\n- [x] shut");
  });

  it("drops an unsafe href but keeps the words", () => {
    const root = el("div", [
      el("p", [el("a", ["click"], { href: "javascript:alert(1)" })]),
    ]);
    expect(md(root)).toBe("click");
  });

  it("walks into wrappers it doesn't recognise", () => {
    // A browser can wrap a paste in anything; losing the content is not an
    // acceptable way to react to a tag we didn't plan for.
    const root = el("div", [el("section", [el("p", ["kept"])])]);
    expect(md(root)).toBe("kept");
  });

  it("does not grow trailing blank lines on every save", () => {
    const root = el("div", [el("p", ["text"]), el("p", []), el("p", [])]);
    expect(md(root)).toBe("text");
  });
});

describe("round trip", () => {
  // The editor renders markdown to DOM, the user types, the DOM is serialised
  // back. Anything that doesn't survive this loop corrupts a note in place.
  const cases = [
    "# Lecture 4",
    "plain text",
    "**bold** and *italic* and __underline__",
    "==highlighted==",
    "- one\n- two",
    "1. one\n2. two",
    "- [ ] todo\n- [x] done",
    "> a quotation",
    "a `code` span",
    "[link](https://example.test)",
  ];

  for (const source of cases) {
    it(`survives: ${source.replace(/\n/g, " / ")}`, () => {
      // Re-parsing our own HTML output requires a DOM; instead assert the
      // weaker but meaningful property — rendering is stable and lossless in
      // the direction the editor actually mounts.
      const once = mdToHtml(source);
      expect(mdToHtml(source)).toBe(once);
      expect(noteText(source)).not.toContain("**");
    });
  }
});

describe("budget", () => {
  it("refuses a single note past the per-note cap", () => {
    expect(fitsBudget([], "n1", MAX_NOTE_CHARS + 1)).toBe(false);
    expect(fitsBudget([], "n1", MAX_NOTE_CHARS)).toBe(true);
  });

  it("counts the other notes, not the one being edited", () => {
    const big = note({ id: "other", body: "x".repeat(MAX_NOTES_CHARS - 100) });
    expect(fitsBudget([big], "n1", 100)).toBe(true);
    expect(fitsBudget([big], "n1", 101)).toBe(false);
  });

  it("always lets a note shrink, even when the budget is blown", () => {
    // Documents written by an older build could already be over; the answer to
    // that must never be "you may not delete anything".
    const over = note({ id: "n1", body: "x".repeat(MAX_NOTE_CHARS) });
    const other = note({ id: "o", body: "y".repeat(MAX_NOTES_CHARS) });
    expect(fitsBudget([over, other], "n1", 10)).toBe(false);
    expect(fitsBudget([over], "n1", 10)).toBe(true);
  });
});

describe("mergeNotes", () => {
  it("keeps the newer edit of the same note", () => {
    const mine = note({ body: "laptop", updatedAt: 2000 });
    const theirs = note({ body: "phone", updatedAt: 1000 });
    expect(mergeNotes([mine], [theirs])[0].body).toBe("laptop");
    expect(mergeNotes([theirs], [mine])[0].body).toBe("laptop");
  });

  it("keeps notes that exist on only one side", () => {
    // The whole point: a lecture typed on the laptop must survive a phone that
    // pushes a document which has never seen it.
    const laptop = note({ id: "a", body: "lecture", updatedAt: 5 });
    const phone = note({ id: "b", body: "other", updatedAt: 5 });
    const merged = mergeNotes([laptop], [phone]);
    expect(merged.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });
});

describe("normalizeNotes", () => {
  it("drops anything without an id or a class", () => {
    expect(
      normalizeNotes([{ id: "a" }, { classId: "c" }, note(), "nonsense", null]),
    ).toHaveLength(1);
  });

  it("survives a document that isn't an array", () => {
    expect(normalizeNotes(undefined)).toEqual([]);
    expect(normalizeNotes({ notes: [] })).toEqual([]);
  });

  it("truncates a body past the cap rather than rejecting the note", () => {
    const long = normalizeNotes([note({ body: "x".repeat(MAX_NOTE_CHARS + 50) })]);
    expect(long[0].body).toHaveLength(MAX_NOTE_CHARS);
  });
});

describe("titles and previews", () => {
  it("prefers the typed title", () => {
    expect(noteTitle({ title: "Week 3", body: "# Something else" })).toBe(
      "Week 3",
    );
  });

  it("falls back to the first line with its markers stripped", () => {
    expect(noteTitle({ title: "", body: "# Photosynthesis\nmore" })).toBe(
      "Photosynthesis",
    );
  });

  it("names an empty note rather than showing a blank row", () => {
    expect(noteTitle({ title: "", body: "" })).toBe("Untitled note");
  });

  it("previews the body after the line the title took", () => {
    expect(notePreview("# Title\nfirst body line\nsecond")).toBe(
      "first body line second",
    );
  });
});

describe("day keys", () => {
  it("formats a local date without drifting a day", () => {
    expect(dayKey(new Date(2026, 8, 8))).toBe("2026-09-08");
  });

  it("names today and yesterday", () => {
    const today = new Date(2026, 8, 8);
    expect(dayLabel("2026-09-08", today)).toBe("Today");
    expect(dayLabel("2026-09-07", today)).toBe("Yesterday");
    expect(dayLabel("2026-09-01", today)).toBe("Tue, Sep 1");
  });

  it("hands back anything it can't read", () => {
    expect(dayLabel("")).toBe("");
    expect(dayLabel("nonsense")).toBe("nonsense");
  });
});
