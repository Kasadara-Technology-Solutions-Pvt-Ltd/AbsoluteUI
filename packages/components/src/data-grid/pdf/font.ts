/**
 * Fonts for the PDF writer (R11-19, G10d): the standard Helvetica fonts with WinAnsi (Windows-1252)
 * encoding, measured through canvas text metrics of Arial (metric-compatible with Helvetica), and
 * application TrueType or OpenType fonts parsed for embedding (cmap, advance widths, metrics).
 */

/** Windows-1252 bytes 0x80-0x9F that differ from Latin-1 (the rest of 0x20-0xFF maps to itself). */
const CP1252: ReadonlyMap<number, number> = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

/** The WinAnsi byte of a code point, or null when the standard fonts cannot show it. */
export function winAnsiByte(cp: number): number | null {
  if (cp >= 0x20 && cp <= 0x7e) return cp;
  if (cp >= 0xa0 && cp <= 0xff) return cp;
  return CP1252.get(cp) ?? null;
}

/** A font the writer can use: its PDF resource, how to measure, and how to encode text. */
export interface PdfFont {
  /** Width of text in points at a size. */
  width(text: string, size: number): number;
  /** The PDF string operand for text (literal or hex). */
  encode(text: string): string;
}

/** Text widths of the standard Helvetica fonts, measured with canvas (Arial has Helvetica's metrics). */
export function standardFont(bold: boolean, doc: Document | null): PdfFont {
  const ctx = doc?.createElement('canvas').getContext('2d') ?? null;
  const cache = new Map<string, number>();
  if (ctx) ctx.font = `${bold ? 'bold ' : ''}100px Arial, Helvetica, "Liberation Sans", sans-serif`;
  return {
    width: (text, size) => {
      let w = cache.get(text);
      if (w === undefined) {
        w = ctx ? ctx.measureText(text).width / 100 : text.length * 0.55;
        if (cache.size > 5000) cache.clear();
        cache.set(text, w);
      }
      return w * size;
    },
    encode: (text) => {
      let out = '(';
      for (const ch of text) {
        const b = winAnsiByte(ch.codePointAt(0) ?? 0x3f) ?? 0x3f;
        if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
        else if (b >= 0x20 && b <= 0x7e) out += String.fromCharCode(b);
        else out += `\\${b.toString(8).padStart(3, '0')}`;
      }
      return `${out})`;
    },
  };
}

/** The parts of a TrueType or OpenType font the writer needs. */
export interface ParsedFont {
  readonly bytes: Uint8Array;
  /** CFF outlines (OpenType) rather than TrueType glyphs. */
  readonly cff: boolean;
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  readonly capHeight: number;
  readonly bbox: readonly [number, number, number, number];
  readonly italicAngle: number;
  readonly name: string;
  glyph(cp: number): number;
  advance(glyph: number): number;
}

/** Parse a TrueType or OpenType font (throws for other files or fonts whose license forbids embedding). */
export function parseFont(input: Uint8Array): ParsedFont {
  const bytes = input;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bad = (why: string): never => {
    throw new TypeError(`Invalid PDF font: ${why}.`);
  };
  if (bytes.length < 12) bad('too short');
  const tag = view.getUint32(0);
  if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565) bad('not a TrueType or OpenType font (collections are not supported)');
  const count = view.getUint16(4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    if (at + 16 > bytes.length) bad('table directory out of range');
    const name = String.fromCharCode(bytes[at] ?? 0, bytes[at + 1] ?? 0, bytes[at + 2] ?? 0, bytes[at + 3] ?? 0);
    const offset = view.getUint32(at + 8);
    const length = view.getUint32(at + 12);
    if (offset + length > bytes.length) bad(`table ${name} out of range`);
    tables.set(name, { offset, length });
  }
  const table = (name: string): { offset: number; length: number } => tables.get(name) ?? bad(`missing table ${name}`);
  const head = table('head');
  const unitsPerEm = view.getUint16(head.offset + 18) || 1000;
  const bbox: [number, number, number, number] = [view.getInt16(head.offset + 36), view.getInt16(head.offset + 38), view.getInt16(head.offset + 40), view.getInt16(head.offset + 42)];
  const hhea = table('hhea');
  const metrics = view.getUint16(hhea.offset + 34);
  let ascent = view.getInt16(hhea.offset + 4);
  let descent = view.getInt16(hhea.offset + 6);
  let capHeight = ascent;
  const os2 = tables.get('OS/2');
  if (os2) {
    const fsType = view.getUint16(os2.offset + 8);
    // Restricted license embedding: bit 1 set, and neither preview/print (bit 2) nor editable (bit 3).
    if ((fsType & 0x000f) === 0x0002) bad('its license forbids embedding');
    if (os2.length >= 72) {
      ascent = view.getInt16(os2.offset + 68);
      descent = view.getInt16(os2.offset + 70);
    }
    const version = view.getUint16(os2.offset);
    if (version >= 2 && os2.length >= 90) capHeight = view.getInt16(os2.offset + 88);
  }
  const post = tables.get('post');
  const italicAngle = post ? view.getInt32(post.offset + 4) / 65536 : 0;
  const hmtx = table('hmtx');
  const advance = (g: number): number => {
    const i = Math.min(g, metrics - 1);
    const at = hmtx.offset + i * 4;
    return at + 2 <= hmtx.offset + hmtx.length ? view.getUint16(at) : 0;
  };
  // cmap: format 12 (full Unicode) preferred, else format 4 (BMP).
  const cmap = table('cmap');
  const subtables = view.getUint16(cmap.offset + 2);
  let f12 = -1;
  let f4 = -1;
  for (let i = 0; i < subtables; i++) {
    const at = cmap.offset + 4 + i * 8;
    const platform = view.getUint16(at);
    const encoding = view.getUint16(at + 2);
    const offset = cmap.offset + view.getUint32(at + 4);
    if (offset + 4 > bytes.length) continue;
    const format = view.getUint16(offset);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 12) f12 = offset;
    else if (format === 4) f4 = offset;
  }
  if (f12 < 0 && f4 < 0) bad('no Unicode character map');
  const cache = new Map<number, number>();
  const glyph = (cp: number): number => {
    const hit = cache.get(cp);
    if (hit !== undefined) return hit;
    let g = 0;
    if (f12 >= 0) {
      const groups = view.getUint32(f12 + 12);
      let lo = 0;
      let hi = groups - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const at = f12 + 16 + mid * 12;
        const start = view.getUint32(at);
        const end = view.getUint32(at + 4);
        if (cp < start) hi = mid - 1;
        else if (cp > end) lo = mid + 1;
        else {
          g = view.getUint32(at + 8) + (cp - start);
          break;
        }
      }
    } else if (cp <= 0xffff) {
      const segs = view.getUint16(f4 + 6) / 2;
      const ends = f4 + 14;
      const starts = ends + segs * 2 + 2;
      const deltas = starts + segs * 2;
      const ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        if (cp > view.getUint16(ends + s * 2)) continue;
        const start = view.getUint16(starts + s * 2);
        if (cp < start) break;
        const delta = view.getInt16(deltas + s * 2);
        const range = view.getUint16(ranges + s * 2);
        if (range === 0) g = (cp + delta) & 0xffff;
        else {
          const at = ranges + s * 2 + range + (cp - start) * 2;
          const raw = at + 2 <= bytes.length ? view.getUint16(at) : 0;
          g = raw === 0 ? 0 : (raw + delta) & 0xffff;
        }
        break;
      }
    }
    cache.set(cp, g);
    return g;
  };
  return { bytes, cff: tables.has('CFF ') || tables.has('CFF2'), unitsPerEm, ascent, descent, capHeight, bbox, italicAngle, name: 'AUIEmbedded', glyph, advance };
}

/** An embedded font: measures with its advances and encodes glyph ids (2 bytes, Identity-H); tracks used glyphs. */
export function embeddedFont(font: ParsedFont): PdfFont & { readonly used: Map<number, number> } {
  const used = new Map<number, number>();
  return {
    used,
    width: (text, size) => {
      let w = 0;
      for (const ch of text) w += font.advance(font.glyph(ch.codePointAt(0) ?? 0));
      return (w / font.unitsPerEm) * size;
    },
    encode: (text) => {
      let hex = '<';
      for (const ch of text) {
        const cp = ch.codePointAt(0) ?? 0;
        const g = font.glyph(cp);
        if (g !== 0 && !used.has(g)) used.set(g, cp);
        hex += g.toString(16).padStart(4, '0');
      }
      return `${hex}>`;
    },
  };
}
