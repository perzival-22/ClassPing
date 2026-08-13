import { describe, expect, it } from "vitest";
import {
  applyThemeColor,
  THEME_COLORS,
  THEME_COLOR_SELECTOR,
  type ThemeColorDoc,
} from "./themeColor";

/**
 * A `document` with just enough surface to answer the one question that
 * matters: does this ever take a node away from React?
 *
 * The fake records every call, and deliberately offers no `remove` or
 * `removeChild` at all — an implementation that reached for one wouldn't fail
 * an assertion, it would fail to run.
 */
function fakeDoc(tags: Array<{ content: string; media?: string }>) {
  const created: Array<{ name: string; content: string }> = [];
  const appended: unknown[] = [];
  const selectors: string[] = [];

  const doc: ThemeColorDoc = {
    querySelectorAll(selector) {
      selectors.push(selector);
      return tags;
    },
    createElement() {
      const el = { name: "", content: "" };
      created.push(el);
      return el;
    },
    head: {
      appendChild(node) {
        appended.push(node);
      },
    },
  };
  return { doc, tags, created, appended, selectors };
}

describe("applyThemeColor", () => {
  /**
   * The regression. Removing the media-scoped tags is what killed the router:
   * they are React's nodes, and deleting one leaves it holding a reference to
   * an element with no parent, which throws on the next navigation's commit.
   */
  it("writes every tag and removes none", () => {
    const f = fakeDoc([
      { content: "#f2f2f7", media: "(prefers-color-scheme: light)" },
      { content: "#000000", media: "(prefers-color-scheme: dark)" },
    ]);

    expect(applyThemeColor(f.doc, THEME_COLORS.dark)).toBe(2);
    expect(f.tags.map((t) => t.content)).toEqual(["#000000", "#000000"]);
    // Nothing was created or appended — the existing tags were adopted.
    expect(f.created).toEqual([]);
    expect(f.appended).toEqual([]);
    // And the tags themselves are still there, media and all.
    expect(f.tags).toHaveLength(2);
    expect(f.tags[0].media).toBe("(prefers-color-scheme: light)");
  });

  /**
   * Giving both media variants the same value is the whole trick: the browser
   * still picks one by media query, but the choice no longer changes anything,
   * so the stored profile theme wins on a phone whose system disagrees.
   */
  it("makes the media query irrelevant by agreeing with itself", () => {
    const f = fakeDoc([
      { content: "#f2f2f7", media: "(prefers-color-scheme: light)" },
      { content: "#000000", media: "(prefers-color-scheme: dark)" },
    ]);
    applyThemeColor(f.doc, THEME_COLORS.light);
    expect(new Set(f.tags.map((t) => t.content)).size).toBe(1);
  });

  it("creates one only when the document has none", () => {
    const f = fakeDoc([]);
    expect(applyThemeColor(f.doc, THEME_COLORS.dark)).toBe(0);
    expect(f.created).toHaveLength(1);
    expect(f.created[0]).toEqual({ name: "theme-color", content: "#000000" });
    expect(f.appended).toEqual(f.created);
  });

  it("asks for every theme-color tag, not just the unscoped one", () => {
    const f = fakeDoc([{ content: "" }]);
    applyThemeColor(f.doc, THEME_COLORS.dark);
    expect(f.selectors).toEqual([THEME_COLOR_SELECTOR]);
    // A `:not([media])` filter here would silently leave the media variants
    // carrying the old theme, which is the bug this replaced.
    expect(THEME_COLOR_SELECTOR).not.toMatch(/:not|\[media\]/);
  });

  it("is idempotent — the store re-runs it on every theme or accent change", () => {
    const f = fakeDoc([{ content: "#f2f2f7" }]);
    applyThemeColor(f.doc, THEME_COLORS.dark);
    applyThemeColor(f.doc, THEME_COLORS.dark);
    expect(f.tags[0].content).toBe("#000000");
    expect(f.created).toEqual([]);
  });

  it("names a colour for each theme, and they differ", () => {
    expect(THEME_COLORS.dark).toMatch(/^#[0-9a-f]{6}$/i);
    expect(THEME_COLORS.light).toMatch(/^#[0-9a-f]{6}$/i);
    expect(THEME_COLORS.dark).not.toBe(THEME_COLORS.light);
  });
});
