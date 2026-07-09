/**
 * App-wide accent themes. The CSS lives in globals.css keyed off
 * `data-accent` on <html>; this registry drives the Settings swatches.
 * "classic" is free, the rest are Pro.
 */
export type AccentId = "classic" | "ocean" | "sunset" | "forest" | "rose";

export interface Accent {
  id: AccentId;
  label: string;
  /** swatch color shown in Settings */
  swatch: string;
}

export const ACCENTS: Accent[] = [
  { id: "classic", label: "Classic", swatch: "#5B54E8" },
  { id: "ocean", label: "Ocean", swatch: "#2E86E8" },
  { id: "sunset", label: "Sunset", swatch: "#EE5A3C" },
  { id: "forest", label: "Forest", swatch: "#14A085" },
  { id: "rose", label: "Rose", swatch: "#D6398B" },
];

export const FREE_ACCENT: AccentId = "classic";

export function isProAccent(id: AccentId): boolean {
  return id !== FREE_ACCENT;
}
