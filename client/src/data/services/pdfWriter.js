/**
 * MINIMAL PDF WRITER (Android conversion — Phase C)
 * ================================================
 * A tiny, dependency-free PDF 1.4 generator.
 *
 * Why not a library: the app must produce a REAL, downloadable PDF on the
 * device without pulling a large PDF engine into the Android bundle. This
 * writer produces a valid PDF with a title, summary lines and simple tables —
 * everything the report screen needs — using nothing but the PDF spec.
 *
 * The output is a standard PDF that opens in any viewer.
 */

/** Escape a string for a PDF literal string. */
const escapeText = (text) =>
  String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    // The default PDF font (Helvetica) is WinAnsi; map a few common
    // characters that the report copy uses.
    .replace(/₹/g, 'Rs.')
    .replace(/[–—]/g, '-')
    .replace(/['']/g, "'")
    .replace(/['']/g, "'")
    .replace(/[^\x20-\x7E]/g, '');

/** A4 in points. */
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;

class PdfBuilder {
  constructor() {
    this.pages = [];
    this.current = null;
    this.newPage();
  }

  newPage() {
    this.current = { operations: [], y: PAGE_HEIGHT - MARGIN };
    this.pages.push(this.current);
    return this.current;
  }

  /** Ensure there is room for `height` more points; start a new page if not. */
  ensureSpace(height) {
    if (this.current.y - height < MARGIN) this.newPage();
  }

  text(content, { size = 10, x = MARGIN, bold = false, color = [0, 0, 0] } = {}) {
    this.ensureSpace(size + 4);
    const font = bold ? '/F2' : '/F1';
    const [r, g, b] = color;
    this.current.operations.push(
      `BT ${r} ${g} ${b} rg ${font} ${size} Tf 1 0 0 1 ${x} ${this.current.y - size} Tm (${escapeText(content)}) Tj ET`
    );
    this.current.y -= size + 4;
  }

  /** A horizontal rule. */
  rule({ color = [0.85, 0.85, 0.85], width = 0.7 } = {}) {
    this.ensureSpace(6);
    const [r, g, b] = color;
    this.current.operations.push(
      `${r} ${g} ${b} RG ${width} w ${MARGIN} ${this.current.y} m ${PAGE_WIDTH - MARGIN} ${this.current.y} l S`
    );
    this.current.y -= 10;
  }

  /** A simple two-column table row. */
  row(left, right, { bold = false, size = 9 } = {}) {
    this.ensureSpace(size + 5);
    const font = bold ? '/F2' : '/F1';
    const [r, g, b] = [0.1, 0.1, 0.1];
    this.current.operations.push(
      `BT ${r} ${g} ${b} rg ${font} ${size} Tf 1 0 0 1 ${MARGIN} ${this.current.y - size} Tm (${escapeText(left)}) Tj ET`
    );
    const rightText = escapeText(right);
    // Right-align the right-hand value.
    const approxWidth = rightText.length * size * 0.5;
    const x = PAGE_WIDTH - MARGIN - approxWidth;
    this.current.operations.push(
      `BT ${r} ${g} ${b} rg ${font} ${size} Tf 1 0 0 1 ${Math.max(MARGIN, x)} ${this.current.y - size} Tm (${rightText}) Tj ET`
    );
    this.current.y -= size + 5;
  }

  /** Build the final PDF bytes. */
  build() {
    const objects = [];
    const pageCount = this.pages.length;

    // 1: Catalog, 2: Pages, 3: Font F1, 4: Font F2, then per page:
    // page object + content stream.
    const pageObjectStart = 5;

    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${this.pages
      .map((_, index) => `${pageObjectStart + index * 2} 0 R`)
      .join(' ')}] /Count ${pageCount} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    this.pages.forEach((page, index) => {
      const pageObjectNumber = pageObjectStart + index * 2;
      const contentObjectNumber = pageObjectNumber + 1;

      objects[pageObjectNumber] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;

      const stream = page.operations.join('\n');
      objects[contentObjectNumber] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });

    // Serialise with a cross-reference table.
    let pdf = '%PDF-1.4\n';
    const offsets = [];

    for (let i = 1; i < objects.length; i += 1) {
      if (!objects[i]) continue;
      offsets[i] = pdf.length;
      pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xrefOffset = pdf.length;
    const maxObject = objects.length;
    pdf += `xref\n0 ${maxObject}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i < maxObject; i += 1) {
      const offset = offsets[i] ?? 0;
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${maxObject} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    // Latin-1 encoding: every character written above is WinAnsi-safe.
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i += 1) {
      const code = pdf.charCodeAt(i);
      bytes[i] = code < 256 ? code : 63; // '?' for anything unexpected
    }
    return bytes;
  }
}

/**
 * Create a simple report PDF.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.subtitle]
 * @param {Array<{label:string,value:string}>} [options.summary]
 * @param {Array<{columns:string[],rows:string[][]}>} [options.tables]
 * @returns {Uint8Array}
 */
export const buildReportPdf = ({ title, subtitle, summary = [], tables = [] }) => {
  const pdf = new PdfBuilder();

  pdf.text(title, { size: 16, bold: true, color: [0.1, 0.1, 0.1] });
  if (subtitle) pdf.text(subtitle, { size: 9, color: [0.45, 0.45, 0.45] });
  pdf.text(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, {
    size: 8,
    color: [0.55, 0.55, 0.55]
  });
  pdf.rule();

  if (summary.length > 0) {
    pdf.text('Summary', { size: 11, bold: true });
    for (const item of summary) {
      pdf.row(`${item.label}:`, String(item.value));
    }
    pdf.rule();
  }

  for (const table of tables) {
    if (!table.rows || table.rows.length === 0) continue;

    if (table.title) pdf.text(table.title, { size: 11, bold: true });

    if (table.columns?.length) {
      const label = table.columns[0];
      const value = table.columns[1] ?? 'Value';
      pdf.row(label, value, { bold: true, size: 8 });
    }

    for (const row of table.rows) {
      pdf.row(String(row[0] ?? ''), String(row[1] ?? ''), { size: 9 });
    }
    pdf.rule();
  }

  return pdf.build();
};

export default buildReportPdf;
