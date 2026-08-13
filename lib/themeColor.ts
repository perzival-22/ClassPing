/**
 * Keeping the OS chrome the same colour as the app.
 *
 * `theme-color` is what an installed PWA tints its status bar with. The static
 * pair in app/layout.tsx's `viewport` export is keyed on the *system* colour
 * scheme, which is not the same question as the theme: this app stores the
 * choice on the profile, so somebody running it dark on a light phone gets a
 * light bar over a black screen unless something corrects it after hydration.
 *
 * ── Why this is a module and not four lines in an effect ────────────────────
 *
 * Because the four lines in an effect were wrong in a way that took down the
 * router, and the fix deserves a test that can't be quietly undone.
 *
 * The obvious implementation deletes the media-scoped tags so the
 * unconditional one wins. Those tags are rendered by React from `viewport`,
 * so React owns them — removing one behind its back leaves a node in its tree
 * whose parent is gone, and the next navigation dies in the commit phase with
 * "Cannot read properties of null (reading 'removeChild')". On screen that is a
 * flash and a first click that does nothing, because the second click runs
 * against a tree that has already abandoned those nodes.
 *
 * The rule this module exists to enforce: **write, never remove.** Every
 * theme-color tag gets the same value, so whichever one the browser's media
 * query picks is the right one and the selection stops mattering. React leaves
 * the attribute alone — its diff compares one render's props to the next's, and
 * both are the unchanged static value from `viewport`, so it never writes over
 * this.
 */

/** The slice of `document` this needs — structural, so a test can fake it. */
export interface ThemeColorDoc {
  querySelectorAll(selector: string): ArrayLike<{ content: string }>;
  createElement(tag: "meta"): { name: string; content: string };
  head: { appendChild(node: unknown): void };
}

export const THEME_COLOR_SELECTOR = 'meta[name="theme-color"]';

/** The frame colour each theme paints, and therefore what the chrome matches. */
export const THEME_COLORS = { dark: "#000000", light: "#f2f2f7" } as const;

/**
 * Point every theme-color tag at `colour`.
 *
 * Returns how many existing tags were written. Zero means none were found and
 * one was created — only reachable if `viewport` stops declaring any, which is
 * why it is a fallback rather than the main path.
 */
export function applyThemeColor(doc: ThemeColorDoc, colour: string): number {
  const tags = doc.querySelectorAll(THEME_COLOR_SELECTOR);

  if (tags.length === 0) {
    const meta = doc.createElement("meta");
    meta.name = "theme-color";
    meta.content = colour;
    doc.head.appendChild(meta);
    return 0;
  }

  for (let i = 0; i < tags.length; i++) tags[i].content = colour;
  return tags.length;
}
