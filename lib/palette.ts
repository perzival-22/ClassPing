export type SubjectColor =
  | "amber"
  | "indigo"
  | "coral"
  | "teal"
  | "pink"
  // Pro-only colors
  | "violet"
  | "mint"
  | "ocean"
  | "slate";

export interface SubjectTheme {
  /**
   * Soft block background. A CSS variable, not a hex: dark mode has to swap
   * these for low-alpha washes (a pastel block is invisible-adjacent on black),
   * and routing them through globals.css means every consumer re-themes for
   * free. Only valid in the browser — see `bar` for the server-safe one.
   */
  bg: string;
  /**
   * Accent bar / dot. Stays a literal hex: it reads on either ground, and the
   * server-rendered grade report (lib/report.ts) can't resolve a variable.
   */
  bar: string;
  /** strong text on the soft bg — a CSS variable, as `bg` */
  text: string;
  /** slightly muted label text — a CSS variable, as `bg` */
  sub: string;
}

const subject = (name: string, bar: string): SubjectTheme => ({
  bg: `var(--subj-${name}-bg)`,
  bar,
  text: `var(--subj-${name}-text)`,
  sub: `var(--subj-${name}-sub)`,
});

export const PALETTE: Record<SubjectColor, SubjectTheme> = {
  amber: subject("amber", "#E39A0E"),
  indigo: subject("indigo", "#5B54E8"),
  coral: subject("coral", "#EE5137"),
  teal: subject("teal", "#0E9F8E"),
  pink: subject("pink", "#D6398B"),
  violet: subject("violet", "#8B3FD9"),
  mint: subject("mint", "#2FA84F"),
  ocean: subject("ocean", "#2C8FE0"),
  slate: subject("slate", "#5A6B8C"),
};

export const SUBJECT_COLORS: SubjectColor[] = [
  "amber",
  "indigo",
  "coral",
  "teal",
  "pink",
];

/** Extra colors unlocked with Pro. */
export const PRO_SUBJECT_COLORS: SubjectColor[] = [
  "violet",
  "mint",
  "ocean",
  "slate",
];

export function isProColor(c: SubjectColor): boolean {
  return PRO_SUBJECT_COLORS.includes(c);
}
