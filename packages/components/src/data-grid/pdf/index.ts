/**
 * @absoluteui/components/data-grid/pdf (R11-19, G10d): PDF export of the Data Grid with our own
 * zero-dependency writer: paginated tables with repeated header rows, group and total rows, page
 * numbers, portrait or landscape. Latin text uses the standard PDF fonts; other scripts need a
 * TrueType or OpenType font from the application (embedded, with Unicode text extraction).
 * Right-to-left grids mirror their columns with simplified bidirectional ordering; Arabic letters are
 * not shaped. For full script support use the browser's Save as PDF through `print()`.
 */
import type { DataGrid, DataGridExportOptions } from '../data-grid.js';
import { embeddedFont, parseFont, standardFont, type ParsedFont, type PdfFont } from './font.js';

export { parseFont, winAnsiByte, type ParsedFont, type PdfFont } from './font.js';

export interface DataGridPdfOptions extends Omit<DataGridExportOptions, 'text'> {
  /** The title at the top of the first page and in the document properties (default: the grid label). */
  readonly title?: string;
  /** Default `a4`. */
  readonly pageSize?: 'a4' | 'letter';
  /** Default `landscape`. */
  readonly orientation?: 'portrait' | 'landscape';
  /** Points (1/72 inch), default 36. */
  readonly margin?: number;
  /** Points, default 9. */
  readonly fontSize?: number;
  /** TrueType or OpenType font bytes for text the standard fonts cannot show (any script); `bold` defaults to `regular`. */
  readonly fonts?: { readonly regular: Uint8Array | ArrayBuffer; readonly bold?: Uint8Array | ArrayBuffer };
  /** Right-to-left layout (default: the grid's direction). */
  readonly rightToLeft?: boolean;
  /** Column group header rows. Default true. */
  readonly columnGroups?: boolean;
  /** "Page 1 of 3" text, with {page} and {pages}. Default "Page {page} of {pages}". */
  readonly pageLabel?: string;
}

const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const MAX_ROWS = 100_000;

function fail(property: string, expected: string): never {
  throw new TypeError(`Invalid PDF export: ${property} must be ${expected}.`);
}

const encoder = new TextEncoder();
const num = (n: number): string => String(Math.round(n * 100) / 100);

/** Deflate a stream (FlateDecode) when the browser can; otherwise the stream stays uncompressed. */
async function deflate(data: Uint8Array): Promise<{ bytes: Uint8Array; filtered: boolean }> {
  if (typeof CompressionStream !== 'function') return { bytes: data, filtered: false };
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new CompressionStream('deflate'));
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), filtered: true };
}

/** Objects numbered from 1, written with a cross-reference table. */
class PdfWriter {
  readonly #objects: (Uint8Array | null)[] = [];

  reserve(): number {
    this.#objects.push(null);
    return this.#objects.length;
  }

  set(id: number, body: string | Uint8Array): void {
    const head = encoder.encode(`${String(id)} 0 obj\n`);
    const content = typeof body === 'string' ? encoder.encode(body) : body;
    const tail = encoder.encode('\nendobj\n');
    const out = new Uint8Array(head.length + content.length + tail.length);
    out.set(head);
    out.set(content, head.length);
    out.set(tail, head.length + content.length);
    this.#objects[id - 1] = out;
  }

  add(body: string | Uint8Array): number {
    const id = this.reserve();
    this.set(id, body);
    return id;
  }

  async stream(dict: string, data: Uint8Array, compress = true): Promise<number> {
    const { bytes, filtered } = compress ? await deflate(data) : { bytes: data, filtered: false };
    const head = encoder.encode(`<< ${dict} /Length ${String(bytes.length)}${filtered ? ' /Filter /FlateDecode' : ''} >>\nstream\n`);
    const tail = encoder.encode('\nendstream');
    const body = new Uint8Array(head.length + bytes.length + tail.length);
    body.set(head);
    body.set(bytes, head.length);
    body.set(tail, head.length + bytes.length);
    return this.add(body);
  }

  finish(root: number, info: number): Blob {
    // A binary comment marks the file as binary for transfer tools.
    const header = new Uint8Array([...encoder.encode('%PDF-1.7\n%'), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);
    const parts: Uint8Array[] = [header];
    const offsets: number[] = [];
    let at = header.length;
    for (const o of this.#objects) {
      offsets.push(at);
      const body = o ?? encoder.encode('');
      parts.push(body);
      at += body.length;
    }
    const xref = [`xref\n0 ${String(this.#objects.length + 1)}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
    parts.push(encoder.encode(`${xref}trailer\n<< /Size ${String(this.#objects.length + 1)} /Root ${String(root)} 0 R /Info ${String(info)} 0 R >>\nstartxref\n${String(at)}\n%%EOF\n`));
    return new Blob(parts.map((p) => new Uint8Array(p)), { type: 'application/pdf' });
  }
}

/** A PDF text string for the document information dictionary (UTF-16BE with a byte order mark). */
function infoText(text: string): string {
  let hex = '<FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0');
  return `${hex}>`;
}

const RTL = new RegExp(`[${String.fromCharCode(0x0590)}-${String.fromCharCode(0x08ff)}${String.fromCharCode(0xfb1d)}-${String.fromCharCode(0xfdff)}${String.fromCharCode(0xfe70)}-${String.fromCharCode(0xfefe)}]`, 'u');
const ELLIPSIS = String.fromCharCode(0x2026);

/**
 * Simplified bidirectional ordering for right-to-left text: runs of right-to-left letters are reversed
 * and the runs are laid out from the right; digits and Latin runs keep their order. Not the full Unicode
 * algorithm; no Arabic shaping.
 */
export function visualOrder(text: string, rtl: boolean): string {
  if (!rtl && !RTL.test(text)) return text;
  const runs: { text: string; rtl: boolean }[] = [];
  for (const ch of text) {
    const r = RTL.test(ch) || (rtl && /\s/u.test(ch) && runs.at(-1)?.rtl === true);
    const last = runs.at(-1);
    if (last?.rtl === r) last.text += ch;
    else runs.push({ text: ch, rtl: r });
  }
  const ordered = rtl ? runs.reverse() : runs;
  return ordered
    .map((r) => {
      if (!r.rtl) return r.text;
      let reversed = '';
      for (const ch of r.text) reversed = ch + reversed;
      return reversed;
    })
    .join('');
}

interface Cell {
  readonly text: string;
  readonly end: boolean;
  readonly bold: boolean;
  readonly indent: number;
}

/**
 * The grid as a PDF Blob: the `toCsv` row and column choices, column widths scaled to the page, header rows
 * repeated on every page, bold group and total rows, end-aligned numbers, and page numbers. More than 100,000
 * rows throws. The PDF is not tagged: assistive technology reads the text in reading order; for structure,
 * prefer the grid itself, CSV, or Excel.
 */
export async function toPdf<Row>(grid: DataGrid<Row>, options: DataGridPdfOptions = {}): Promise<Blob> {
  const o: unknown = options;
  if (typeof o !== 'object' || o === null) fail('options', 'an object');
  if (options.pageSize !== undefined && !(options.pageSize in PAGE_SIZES)) fail('pageSize', '"a4" | "letter"');
  const orientation: unknown = options.orientation;
  if (orientation !== undefined && orientation !== 'portrait' && orientation !== 'landscape') fail('orientation', '"portrait" | "landscape"');
  const margin = options.margin ?? 36;
  const size = options.fontSize ?? 9;
  if (!(margin >= 0 && margin <= 144)) fail('margin', 'a number of points from 0 to 144');
  if (!(size >= 4 && size <= 24)) fail('fontSize', 'a number of points from 4 to 24');
  const data = grid.getExportData({ ...options, text: 'all' });
  if (data.rows.length > MAX_ROWS) fail('rows', `at most ${String(MAX_ROWS)} rows (export CSV or Excel)`);
  const doc = grid.host.ownerDocument;
  const label = grid.host.querySelector('[role="grid"], [role="treegrid"]')?.getAttribute('aria-label') ?? 'Grid';
  const title = options.title ?? label;
  const rtl = options.rightToLeft ?? (typeof getComputedStyle === 'function' && getComputedStyle(grid.host).direction === 'rtl');
  const toBytes = (b: Uint8Array | ArrayBuffer): Uint8Array => (b instanceof Uint8Array ? b : new Uint8Array(b));
  const parsed: { regular: ParsedFont; bold: ParsedFont } | null = options.fonts
    ? (() => {
        const regular = parseFont(toBytes(options.fonts.regular));
        return { regular, bold: options.fonts.bold ? parseFont(toBytes(options.fonts.bold)) : regular };
      })()
    : null;
  const fonts = parsed ? { regular: embeddedFont(parsed.regular), bold: embeddedFont(parsed.bold) } : { regular: standardFont(false, doc), bold: standardFont(true, doc) };
  const [w0, h0] = PAGE_SIZES[options.pageSize ?? 'a4'];
  const [pageW, pageH] = (options.orientation ?? 'landscape') === 'landscape' ? [h0, w0] : [w0, h0];
  const avail = pageW - margin * 2;
  // Column widths: the grid's (px to pt), scaled down to fit the page.
  const natural = data.columns.map((c) => Math.max(24, c.width * 0.75));
  const total = natural.reduce((a, b) => a + b, 0);
  const scale = total > avail ? avail / total : 1;
  const widths = natural.map((w) => w * scale);
  const order = data.columns.map((_c, i) => i);
  if (rtl) order.reverse();
  const xs: number[] = [];
  let x = margin;
  for (const i of order) {
    xs[i] = x;
    x += widths[i] ?? 0;
  }
  const rowH = size * 1.7;
  const pad = 3;
  const headerRows: Cell[][] = [];
  if (options.columnGroups !== false) {
    for (const run of data.headerRows) {
      const cells: Cell[] = [];
      for (const cell of run) {
        cells.push({ text: cell.text, end: false, bold: true, indent: 0 });
        for (let k = 1; k < cell.span; k++) cells.push({ text: '', end: false, bold: true, indent: 0 });
      }
      headerRows.push(cells);
    }
  }
  headerRows.push(data.columns.map((c) => ({ text: c.header, end: false, bold: true, indent: 0 })));
  const body: Cell[][] = data.rows.map((r) =>
    r.cells.map((cell, i) => {
      const def = data.columns[i]?.def;
      const numeric = def?.type === 'number' || def?.type === 'currency';
      const group = def?.id.startsWith('aui-group') === true;
      return { text: cell.text, end: def?.align === 'end' || (def?.align === undefined && numeric), bold: r.kind !== 'data', indent: group ? r.level * 8 : 0 };
    }),
  );
  /** Fit text into a width, cutting it with an ellipsis. */
  const fit = (text: string, font: PdfFont, width: number): string => {
    if (font.width(text, size) <= width) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (font.width(`${text.slice(0, mid)}${ELLIPSIS}`, size) <= width) lo = mid;
      else hi = mid - 1;
    }
    return lo === 0 ? '' : `${text.slice(0, lo)}${ELLIPSIS}`;
  };
  const drawRow = (cells: readonly Cell[], top: number, shade: boolean): string => {
    const y = top - rowH;
    let ops = '';
    if (shade) ops += `0.93 g ${num(margin)} ${num(y)} ${num(x - margin)} ${num(rowH)} re f 0 g\n`;
    ops += `0.6 G 0.4 w ${num(margin)} ${num(y)} m ${num(x)} ${num(y)} l S 0 G\n`;
    cells.forEach((cell, i) => {
      if (cell.text === '') return;
      const font = cell.bold ? fonts.bold : fonts.regular;
      const cellX = xs[i] ?? margin;
      const width = Math.max(0, (widths[i] ?? 0) - pad * 2 - cell.indent);
      const text = visualOrder(fit(cell.text, font, width), rtl);
      const w = font.width(text, size);
      const end = cell.end !== rtl;
      const tx = end ? cellX + (widths[i] ?? 0) - pad - w - (rtl ? cell.indent : 0) : cellX + pad + (rtl ? 0 : cell.indent);
      ops += `BT /${cell.bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(tx)} ${num(y + rowH * 0.32)} Td ${font.encode(text)} Tj ET\n`;
    });
    return ops;
  };
  // Pages: the title on the first, the header rows on every page, then as many body rows as fit.
  const pages: string[] = [];
  const titleH = size * 2.4;
  let index = 0;
  do {
    let ops = '';
    let top = pageH - margin;
    if (pages.length === 0) {
      const t = visualOrder(fit(title, fonts.bold, avail), rtl);
      const tw = fonts.bold.width(t, size * 1.5);
      ops += `BT /F2 ${num(size * 1.5)} Tf ${num(rtl ? pageW - margin - tw : margin)} ${num(top - size * 1.5)} Td ${fonts.bold.encode(t)} Tj ET\n`;
      top -= titleH;
    }
    for (const h of headerRows) {
      ops += drawRow(h, top, true);
      top -= rowH;
    }
    const bottom = margin + size * 2;
    while (index < body.length && top - rowH >= bottom) {
      ops += drawRow(body[index] ?? [], top, false);
      top -= rowH;
      index++;
    }
    pages.push(ops);
  } while (index < body.length);
  // Write the document.
  const pdf = new PdfWriter();
  const catalog = pdf.reserve();
  const pagesId = pdf.reserve();
  const fontRefs = await writeFonts(pdf, parsed, fonts);
  const pageIds: number[] = [];
  const pageLabel = options.pageLabel ?? 'Page {page} of {pages}';
  for (let p = 0; p < pages.length; p++) {
    const footer = visualOrder(pageLabel.split('{page}').join(String(p + 1)).split('{pages}').join(String(pages.length)), rtl);
    const fw = fonts.regular.width(footer, size * 0.9);
    const ops = `${pages[p] ?? ''}BT /F1 ${num(size * 0.9)} Tf ${num((pageW - fw) / 2)} ${num(margin * 0.6)} Td ${fonts.regular.encode(footer)} Tj ET\n`;
    const content = await pdf.stream('', encoder.encode(ops));
    pageIds.push(pdf.add(`<< /Type /Page /Parent ${String(pagesId)} 0 R /MediaBox [0 0 ${num(pageW)} ${num(pageH)}] /Resources << /Font << /F1 ${String(fontRefs.regular)} 0 R /F2 ${String(fontRefs.bold)} 0 R >> >> /Contents ${String(content)} 0 R >>`));
  }
  pdf.set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(' ')}] /Count ${String(pageIds.length)} >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${String(pagesId)} 0 R /Lang ${infoText(data.locale)} /ViewerPreferences << /DisplayDocTitle true >> >>`);
  const now = new Date();
  const date = `D:${String(now.getUTCFullYear())}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}Z`;
  const info = pdf.add(`<< /Title ${infoText(title)} /Producer ${infoText('AbsoluteUI Data Grid')} /CreationDate (${date}) >>`);
  return pdf.finish(catalog, info);
}

/** The two font resources: standard Helvetica, or the embedded application fonts (Type0, Identity-H). */
async function writeFonts(pdf: PdfWriter, parsed: { regular: ParsedFont; bold: ParsedFont } | null, fonts: { regular: PdfFont; bold: PdfFont }): Promise<{ regular: number; bold: number }> {
  if (!parsed) {
    const regular = pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const bold = pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    return { regular, bold };
  }
  const written = new Map<ParsedFont, number>();
  const write = async (font: ParsedFont, use: PdfFont): Promise<number> => {
    const known = written.get(font);
    if (known !== undefined) return known;
    const used = (use as PdfFont & { used?: Map<number, number> }).used ?? new Map<number, number>();
    const scale = 1000 / font.unitsPerEm;
    const file = await pdf.stream(font.cff ? '/Subtype /OpenType' : `/Length1 ${String(font.bytes.length)}`, font.bytes);
    const name = `/${font.name}${String(written.size + 1)}`;
    const descriptor = pdf.add(`<< /Type /FontDescriptor /FontName ${name} /Flags 32 /FontBBox [${font.bbox.map((v) => num(v * scale)).join(' ')}] /ItalicAngle ${num(font.italicAngle)} /Ascent ${num(font.ascent * scale)} /Descent ${num(font.descent * scale)} /CapHeight ${num(font.capHeight * scale)} /StemV 80 /${font.cff ? 'FontFile3' : 'FontFile2'} ${String(file)} 0 R >>`);
    const glyphs = [...used.keys()].sort((a, b) => a - b);
    const w = glyphs.map((g) => `${String(g)} [${num(font.advance(g) * scale)}]`).join(' ');
    const cid = pdf.add(`<< /Type /Font /Subtype /${font.cff ? 'CIDFontType0' : 'CIDFontType2'} /BaseFont ${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${String(descriptor)} 0 R /W [${w}]${font.cff ? '' : ' /CIDToGIDMap /Identity'} >>`);
    // ToUnicode: glyph ids back to the characters (copy and search in viewers).
    const entries = glyphs.map((g) => {
      const cp = used.get(g) ?? 0xfffd;
      const s = String.fromCodePoint(cp);
      let u = '';
      for (let i = 0; i < s.length; i++) u += s.charCodeAt(i).toString(16).padStart(4, '0');
      return `<${g.toString(16).padStart(4, '0')}> <${u}>`;
    });
    const chunks: string[] = [];
    for (let i = 0; i < entries.length; i += 100) chunks.push(`${String(Math.min(100, entries.length - i))} beginbfchar\n${entries.slice(i, i + 100).join('\n')}\nendbfchar`);
    const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chunks.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
    const toUnicode = await pdf.stream('', encoder.encode(cmap));
    const id = pdf.add(`<< /Type /Font /Subtype /Type0 /BaseFont ${name} /Encoding /Identity-H /DescendantFonts [${String(cid)} 0 R] /ToUnicode ${String(toUnicode)} 0 R >>`);
    written.set(font, id);
    return id;
  };
  const regular = await write(parsed.regular, fonts.regular);
  const bold = await write(parsed.bold, fonts.bold);
  return { regular, bold };
}
