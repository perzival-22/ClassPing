/**
 * App-wide accent themes. The CSS lives in globals.css keyed off
 * `data-accent` on <html>; this registry drives the Settings swatches.
 * "classic" is free, every other theme is Pro.
 */
export type AccentId =
  | "classic"
  | "ocean"
  | "sunset"
  | "forest"
  | "rose"
  // Vibrant set — Pro
  | "aurora"
  | "electric"
  | "lime"
  | "crimson"
  | "mango";

/**
 * Which shelf a theme sits on in Settings. The vibrant set is louder than the
 * originals and is grouped separately so the picker reads as two deliberate
 * families rather than one long wall of dots.
 */
export type AccentGroup = "core" | "vibrant";

export interface Accent {
  id: AccentId;
  label: string;
  /** swatch color shown in Settings */
  swatch: string;
  group: AccentGroup;
}

export const ACCENTS: Accent[] = [
  { id: "classic", label: "Classic", swatch: "#5B54E8", group: "core" },
  { id: "ocean", label: "Ocean", swatch: "#2E86E8", group: "core" },
  { id: "sunset", label: "Sunset", swatch: "#EE5A3C", group: "core" },
  { id: "forest", label: "Forest", swatch: "#14A085", group: "core" },
  { id: "rose", label: "Rose", swatch: "#D6398B", group: "core" },
  { id: "aurora", label: "Aurora", swatch: "#C026D3", group: "vibrant" },
  { id: "electric", label: "Electric", swatch: "#0891B2", group: "vibrant" },
  { id: "lime", label: "Lime", swatch: "#57920C", group: "vibrant" },
  { id: "crimson", label: "Crimson", swatch: "#E11D48", group: "vibrant" },
  { id: "mango", label: "Mango", swatch: "#D97706", group: "vibrant" },
];

export const FREE_ACCENT: AccentId = "classic";

export function isProAccent(id: AccentId): boolean {
  return id !== FREE_ACCENT;
}

export const accentsIn = (group: AccentGroup): Accent[] =>
  ACCENTS.filter((a) => a.group === group);
