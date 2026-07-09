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
  /** soft block background */
  bg: string;
  /** accent bar / dot */
  bar: string;
  /** strong text on the soft bg */
  text: string;
  /** slightly muted label text */
  sub: string;
}

export const PALETTE: Record<SubjectColor, SubjectTheme> = {
  amber: { bg: "#FEF1D8", bar: "#E39A0E", text: "#9A6800", sub: "#B98A2E" },
  indigo: { bg: "#ECEBFB", bar: "#5B54E8", text: "#4038B8", sub: "#6E67C9" },
  coral: { bg: "#FFE8E3", bar: "#EE5137", text: "#B93318", sub: "#D75B44" },
  teal: { bg: "#DEF4EF", bar: "#0E9F8E", text: "#0A7568", sub: "#279C8C" },
  pink: { bg: "#FBE5F0", bar: "#D6398B", text: "#A81E67", sub: "#C74F92" },
  violet: { bg: "#F3E9FC", bar: "#8B3FD9", text: "#6820AB", sub: "#8F58BF" },
  mint: { bg: "#E2F7E6", bar: "#2FA84F", text: "#1F7A38", sub: "#4A9C60" },
  ocean: { bg: "#DFF0FC", bar: "#2C8FE0", text: "#1B69AC", sub: "#4A8DC2" },
  slate: { bg: "#E9EBF3", bar: "#5A6B8C", text: "#3E4C68", sub: "#6E7C99" },
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
