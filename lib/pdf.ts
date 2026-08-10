/**
 * A very small PDF writer.
 *
 * The grade report is the one thing a student prints or hands to someone else,
 * and CSV is the wrong shape for that — it opens in a spreadsheet, not a page.
 * A real PDF library is megabytes and pulls font binaries with it, so this
 * writes the file directly instead: uncompressed streams, and the two standard
 * Type1 fonts (Helvetica and Helvetica-Bold) that every reader already has, so
 * nothing has to be embedded.
 *
 * The output is deliberately plain — no compression, no object streams — which
 * keeps it greppable in tests and diffable by eye when the layout misbehaves.
 */

/** US Letter, in points. Letter over A4 because the audience is US students. */
export const PAGE_W = 612;
export const PAGE_H = 792;
export const MARGIN = 48;
export const CONTENT_W = PAGE_W - MARGIN * 2;

/**
 * Helvetica advance widths, in 1/1000 em, for WinAnsi codes 32–126. Taken from
 * the Adobe core-14 metrics. Codes outside this range (accented Latin-1) fall
 * back to DEFAULT_W, which is close enough that a wrapped line never overruns
 * noticeably — those characters are rare in class names and never in numbers.
 */
const HELV_W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

/** Helvetica-Bold, same range and units. */
const HELV_BOLD_W = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
  584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278,
  556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
  500, 389, 280, 389, 584,
];

const DEFAULT_W = 556;

/**
 * Characters WinAnsiEncoding places outside Latin-1's own slots. Text typed on
 * a phone is full of curly quotes and en-dashes — mapping them beats printing
 * a page of question marks.
 */
const WIN_ANSI_EXTRAS: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84,
  "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88,
  "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
  "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93,
  "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

/**
 * Fold a JS string down to WinAnsi bytes, one char per code unit.
 *
 * Everything the fonts can't render becomes "?" rather than being dropped, so
 * a name written in a non-Latin script still occupies a visible slot instead of
 * silently vanishing from the report.
 */
export function toWinAnsi(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code === 0x0a || code === 0x0d || code === 0x09) {
      out += " ";
    } else if (code >= 0x20 && code <= 0x7e) {
      out += ch;
    } else if (code >= 0xa0 && code <= 0xff) {
      out += ch;
    } else if (WIN_ANSI_EXTRAS[ch] !== undefined) {
      out += String.fromCharCode(WIN_ANSI_EXTRAS[ch]);
    } else {
      out += "?";
    }
  }
  return out;
}

/** Width of already-encoded text at `size`, in points. */
function encodedWidth(encoded: string, size: number, bold: boolean): number {
  const table = bold ? HELV_BOLD_W : HELV_W;
  let units = 0;
  for (let i = 0; i < encoded.length; i++) {
    const c = encoded.charCodeAt(i);
    units += c >= 32 && c <= 126 ? table[c - 32] : DEFAULT_W;
  }
  return (units * size) / 1000;
}

/** Width the report will actually render `text` at. */
export function textWidth(text: string, size: number, bold = false): number {
  return encodedWidth(toWinAnsi(text), size, bold);
}

/** PDF literal string: escape the three characters that would end it early. */
function pdfString(encoded: string): string {
  return `(${encoded.replace(/([\\()])/g, "\\$1")})`;
}

/** PDF numbers must never come out in exponent notation. */
const n = (x: number): string => {
  const r = Math.round(x * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

function hexToRgbOp(hex: string, stroke = false): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return `${n(r)} ${n(g)} ${n(b)} ${stroke ? "RG" : "rg"}`;
}

export interface TextOptions {
  size?: number;
  bold?: boolean;
  /** Hex fill, e.g. "#1E1450". */
  color?: string;
  /** Left edge; defaults to the page margin. */
  x?: number;
  /** Baseline-to-baseline distance. Defaults to 1.35 × size. */
  leading?: number;
  /** Right-align the text so it *ends* at `x`. */
  alignRight?: boolean;
}

const INK = "#1E1450";

/**
 * Page-at-a-time document builder.
 *
 * The cursor runs top-down (`y` shrinks) because that's how the report reads;
 * PDF's own coordinate space is bottom-up, and the conversion happens at the
 * single point where text is emitted.
 */
export class PdfDoc {
  private pages: string[][] = [];
  private ops: string[] = [];
  private cursor = PAGE_H - MARGIN;

  constructor(
    private readonly meta: { title: string; author?: string; createdAt?: Date } = {
      title: "Document",
    },
  ) {
    this.pages.push(this.ops);
  }

  /** Current baseline position, measured down from the top of the page. */
  get y(): number {
    return this.cursor;
  }

  set y(v: number) {
    this.cursor = v;
  }

  /** Vertical room left before the bottom margin. */
  get room(): number {
    return this.cursor - MARGIN;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  newPage(): void {
    this.ops = [];
    this.pages.push(this.ops);
    this.cursor = PAGE_H - MARGIN;
  }

  /** Break to a new page unless `height` still fits on this one. */
  need(height: number): void {
    if (this.room < height) this.newPage();
  }

  space(h: number): void {
    this.cursor -= h;
  }

  /** Split `text` into lines that each fit `maxWidth`. */
  wrap(text: string, maxWidth: number, size: number, bold = false): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split(/\r?\n/)) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && textWidth(candidate, size, bold) > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  /** Shorten `text` with an ellipsis until it fits `maxWidth`. */
  ellipsize(text: string, maxWidth: number, size: number, bold = false): string {
    if (textWidth(text, size, bold) <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && textWidth(`${cut}…`, size, bold) > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return `${cut.trimEnd()}…`;
  }

  /** Draw one line of text and advance the cursor past it. */
  text(text: string, opts: TextOptions = {}): void {
    const {
      size = 10,
      bold = false,
      color = INK,
      leading = size * 1.35,
      alignRight = false,
    } = opts;
    const encoded = toWinAnsi(text);
    const anchor = opts.x ?? MARGIN;
    const x = alignRight ? anchor - encodedWidth(encoded, size, bold) : anchor;
    // Cursor marks the top of the line; drop to the baseline before drawing.
    const baseline = this.cursor - size;
    this.ops.push(
      `BT ${hexToRgbOp(color)} /${bold ? "F2" : "F1"} ${n(size)} Tf ` +
        `1 0 0 1 ${n(x)} ${n(baseline)} Tm ${pdfString(encoded)} Tj ET`,
    );
    this.cursor -= leading;
  }

  /** Wrapped block of text, breaking pages as needed. */
  paragraph(
    text: string,
    opts: TextOptions & { maxWidth?: number } = {},
  ): void {
    const { size = 10, bold = false, leading = size * 1.35 } = opts;
    const maxWidth = opts.maxWidth ?? CONTENT_W - ((opts.x ?? MARGIN) - MARGIN);
    for (const line of this.wrap(text, maxWidth, size, bold)) {
      this.need(leading);
      this.text(line, { ...opts, leading });
    }
  }

  /** Filled rectangle, positioned from the top of the page like the cursor. */
  rect(x: number, top: number, w: number, h: number, color: string): void {
    this.ops.push(
      `${hexToRgbOp(color)} ${n(x)} ${n(top - h)} ${n(w)} ${n(h)} re f`,
    );
  }

  /** Horizontal rule at the cursor, which then advances past `gap`. */
  rule(color = "#E7E4F1", gap = 8, width = 0.75): void {
    this.need(gap + width);
    this.ops.push(
      `${hexToRgbOp(color, true)} ${n(width)} w ${n(MARGIN)} ${n(this.cursor)} m ` +
        `${n(PAGE_W - MARGIN)} ${n(this.cursor)} l S`,
    );
    this.cursor -= gap;
  }

  /**
   * Serialize to PDF bytes.
   *
   * `footer` runs once per page at the end, when the total is finally known —
   * "Page 2 of 5" can't be written while page 2 is being laid out.
   */
  build(footer?: (page: number, total: number) => string): Uint8Array {
    const total = this.pages.length;
    if (footer) {
      const size = 8;
      for (let i = 0; i < total; i++) {
        const encoded = toWinAnsi(footer(i + 1, total));
        this.pages[i].push(
          `BT ${hexToRgbOp("#9A96B4")} /F1 ${size} Tf ` +
            `1 0 0 1 ${n(MARGIN)} ${n(MARGIN - 18)} Tm ${pdfString(encoded)} Tj ET`,
        );
      }
    }

    // Object 1 catalog, 2 pages, 3/4 fonts, 5 info, then page + content pairs.
    const FIRST_PAGE_OBJ = 6;
    const pageObjIds = this.pages.map((_, i) => FIRST_PAGE_OBJ + i * 2);
    const objects: string[] = [
      `<< /Type /Catalog /Pages 2 0 R >>`,
      `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${total} >>`,
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
      this.infoObject(),
    ];

    for (let i = 0; i < total; i++) {
      const contentId = pageObjIds[i] + 1;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
      );
      const stream = this.pages[i].join("\n");
      objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    }

    // Every byte written here is Latin-1, so a character index is a byte
    // offset — which is exactly what the xref table needs.
    let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefAt = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f\r\n`;
    for (const off of offsets) {
      pdf += `${off.toString().padStart(10, "0")} 00000 n\r\n`;
    }
    pdf +=
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\n` +
      `startxref\n${xrefAt}\n%%EOF\n`;

    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
    return bytes;
  }

  private infoObject(): string {
    const d = this.meta.createdAt ?? new Date();
    const p = (v: number) => v.toString().padStart(2, "0");
    const stamp =
      `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
      `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
    return (
      `<< /Title ${pdfString(toWinAnsi(this.meta.title))} ` +
      `/Author ${pdfString(toWinAnsi(this.meta.author ?? "ClassPing"))} ` +
      `/Producer (ClassPing) /CreationDate (${stamp}) >>`
    );
  }
}
