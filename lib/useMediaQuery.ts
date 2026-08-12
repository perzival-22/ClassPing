"use client";

import { useSyncExternalStore } from "react";

/**
 * Track a CSS media query from React.
 *
 * Almost everything responsive in this app is a Tailwind `md:` class, which is
 * the right tool: CSS is evaluated before paint, costs nothing, and can't
 * disagree with itself between server and client. This exists for the cases
 * where the two breakpoints need *different components* rather than different
 * styles — where rendering both and hiding one would mean mounting two editors
 * over the same note.
 *
 * `useSyncExternalStore` rather than `useState` + an effect, because it is the
 * hook that has a server snapshot: React renders the server value on the server
 * and during hydration, then swaps to the live one. Reading `matchMedia` in an
 * effect instead would paint the wrong branch for one frame on every load.
 *
 * The server snapshot is always `false`. Server-side there is no viewport to
 * ask, so the answer has to be a guess, and this app is a phone-first PWA —
 * guessing "not desktop" means the phone, which is almost every session, never
 * sees a swap at all.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Is this a screen wide enough to write on?
 *
 * 768px is Tailwind's `md`, which is where app/classes/page.tsx already splits
 * its list and detail panes — so "there is room for two panes" and "there is
 * room to type a lecture" are deliberately the same question with one answer.
 */
export const DESKTOP_QUERY = "(min-width: 768px)";
