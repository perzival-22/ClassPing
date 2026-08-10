import { describe, expect, it } from "vitest";
import { CONTENT_W, PdfDoc, textWidth, toWinAnsi } from "./pdf";

/** The bytes back as a Latin-1 string, which is how they were written. */
const decode = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => String.fromCharCode(b)).join("");

describe("toWinAnsi", () => {
  it("passes ASCII straight through", () => {
    expect(toWinAnsi("Chemistry 101")).toBe("Chemistry 101");
  });

  it("keeps accented Latin-1 letters", () => {
    expect(toWinAnsi("Café")).toBe("Café");
  });

  it("maps the punctuation phones actually produce", () => {
    expect(toWinAnsi("don’t")).toBe("don\x92t");
    expect(toWinAnsi("a–b")).toBe("a\x96b");
    expect(toWinAnsi("…")).toBe("\x85");
  });

  it("substitutes rather than drops what the font can't render", () => {
    // A dropped character would silently shorten a name; a "?" shows it.
    expect(toWinAnsi("日本語")).toBe("???");
    expect(toWinAnsi("🎓")).toBe("?");
  });

  it("flattens newlines and tabs to spaces", () => {
    expect(toWinAnsi("a\nb\tc")).toBe("a b c");
  });
});

describe("textWidth", () => {
  it("measures Helvetica against its published metrics", () => {
    // 'i' is 222/1000 em, 'M' is 833 — at 10pt that's 2.22 and 8.33 points.
    expect(textWidth("i", 10)).toBeCloseTo(2.22, 6);
    expect(textWidth("M", 10)).toBeCloseTo(8.33, 6);
  });

  it("makes bold wider than regular", () => {
    expect(textWidth("Chemistry", 10, true)).toBeGreaterThan(
      textWidth("Chemistry", 10),
    );
  });

  it("scales linearly with size", () => {
    expect(textWidth("Midterm", 20)).toBeCloseTo(textWidth("Midterm", 10) * 2, 6);
  });
});

describe("PdfDoc layout", () => {
  it("wraps text to the given width", () => {
    const doc = new PdfDoc();
    const lines = doc.wrap(
      "Office hours are Tuesday afternoon in the science building annex",
      120,
      10,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(textWidth(line, 10)).toBeLessThanOrEqual(120);
    }
    expect(lines.join(" ")).toContain("Office hours");
  });

  it("keeps explicit line breaks", () => {
    const doc = new PdfDoc();
    expect(doc.wrap("one\ntwo", CONTENT_W, 10)).toEqual(["one", "two"]);
  });

  it("ellipsizes only what overflows", () => {
    const doc = new PdfDoc();
    expect(doc.ellipsize("Chem", 200, 10)).toBe("Chem");
    const cut = doc.ellipsize("Introduction to Organic Chemistry II", 60, 10);
    expect(cut.endsWith("…")).toBe(true);
    expect(textWidth(cut, 10)).toBeLessThanOrEqual(60);
  });

  it("starts a new page when the content runs past the bottom margin", () => {
    const doc = new PdfDoc();
    expect(doc.pageCount).toBe(1);
    for (let i = 0; i < 80; i++) doc.paragraph(`line ${i}`, { size: 10 });
    expect(doc.pageCount).toBeGreaterThan(1);
  });
});

describe("PdfDoc.build", () => {
  const simple = () => {
    const doc = new PdfDoc({
      title: "Test report",
      createdAt: new Date("2026-08-10T12:00:00Z"),
    });
    doc.text("Hello (world)", { size: 12, bold: true });
    return doc;
  };

  it("emits a well-formed PDF envelope", () => {
    const pdf = decode(simple().build());
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/Type /Catalog");
    expect(pdf).toContain("/Type /Pages");
    expect(pdf).toContain("/BaseFont /Helvetica");
    expect(pdf).toContain("/BaseFont /Helvetica-Bold");
  });

  it("points every xref entry at its object header", () => {
    // A wrong offset here is the classic way to produce a file that looks fine
    // in a hex dump and fails to open in a reader.
    const pdf = decode(simple().build());
    const xrefAt = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xrefAt, xrefAt + 4)).toBe("xref");

    const entries = [...pdf.slice(xrefAt).matchAll(/^(\d{10}) 00000 n$/gm)];
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach((m, i) => {
      const off = Number(m[1]);
      expect(pdf.slice(off)).toMatch(new RegExp(`^${i + 1} 0 obj`));
    });
  });

  it("declares each content stream's true length", () => {
    const pdf = decode(simple().build());
    for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = m.index! + m[0].length;
      const end = pdf.indexOf("\nendstream", start);
      expect(end - start).toBe(Number(m[1]));
    }
  });

  it("escapes parentheses and backslashes inside strings", () => {
    const pdf = decode(simple().build());
    expect(pdf).toContain("(Hello \\(world\\)) Tj");
  });

  it("counts pages and writes the footer once per page", () => {
    const doc = new PdfDoc();
    for (let i = 0; i < 120; i++) doc.paragraph(`line ${i}`);
    const total = doc.pageCount;
    const pdf = decode(doc.build((page, n) => `Page ${page} of ${n}`));
    expect(total).toBeGreaterThan(1);
    expect(pdf).toContain(`/Count ${total}`);
    expect(pdf).toContain(`(Page 1 of ${total}) Tj`);
    expect(pdf).toContain(`(Page ${total} of ${total}) Tj`);
  });

  it("records the title in the document info", () => {
    const pdf = decode(simple().build());
    expect(pdf).toContain("/Title (Test report)");
    expect(pdf).toContain("(D:20260810120000Z)");
  });
});
