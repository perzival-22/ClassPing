export type SubjectColor = "amber" | "indigo" | "coral" | "teal" | "pink";

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
};

export const SUBJECT_COLORS: SubjectColor[] = [
  "amber",
  "indigo",
  "coral",
  "teal",
  "pink",
];
