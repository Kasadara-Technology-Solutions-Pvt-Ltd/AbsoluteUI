/**
 * A small SpreadsheetML (.xlsx) writer (R11-17): shared strings, typed cells, deduplicated styles
 * and number formats, frozen panes, row outlines, merged cells, hyperlinks, images, and sheet
 * protection. Text is always written as text: formulas come only from `formula`, never from values.
 */
import { zipFiles, type ZipFileInput } from '@absoluteui/helpers/zip';

export type XlsxBorder = 'thin' | 'medium' | 'thick';

/** A cell style. Colors are `#RRGGBB`. */
export interface XlsxStyle {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly color?: string;
  readonly fill?: string;
  readonly fontSize?: number;
  /** Every side, or per side with the `border*` keys. */
  readonly border?: XlsxBorder;
  readonly borderTop?: XlsxBorder;
  readonly borderBottom?: XlsxBorder;
  readonly borderColor?: string;
  readonly align?: 'start' | 'center' | 'end';
  readonly verticalAlign?: 'top' | 'center' | 'bottom';
  readonly wrap?: boolean;
  /** Indent level (0 to 15). */
  readonly indent?: number;
  /** An Excel number format such as `#,##0.00` or `yyyy-mm-dd`. */
  readonly numberFormat?: string;
}

export type XlsxValue = string | number | boolean | null;

export interface XlsxCell {
  readonly value: XlsxValue;
  readonly style?: XlsxStyle;
  /** A formula without the leading `=`. */
  readonly formula?: string;
  /** An http, https, or mailto link. */
  readonly link?: string;
}

export interface XlsxRow {
  readonly cells: readonly (XlsxCell | null)[];
  /** Outline level (0 to 7). */
  readonly outlineLevel?: number;
  readonly hidden?: boolean;
  /** The row's outline group is collapsed (set on the summary row). */
  readonly collapsed?: boolean;
}

export interface XlsxImage {
  /** 0-based cell position. */
  readonly row: number;
  readonly column: number;
  readonly bytes: Uint8Array;
  readonly type: 'png' | 'jpeg';
  /** Size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly alt?: string;
}

export interface XlsxProtection {
  /** Hashed with SHA-512, a random salt, and `spinCount` rounds; never stored. */
  readonly password?: string;
  /** Default 100000 (Excel's); at least 1, at most 10000000. */
  readonly spinCount?: number;
  /** What users may still do on the protected sheet. */
  readonly allow?: readonly ('sort' | 'autoFilter' | 'formatColumns' | 'formatRows' | 'selectLockedCells')[];
}

export interface XlsxSheet {
  readonly name: string;
  /** Column widths in characters (undefined: Excel's default). */
  readonly widths?: readonly (number | undefined)[];
  readonly rows: readonly XlsxRow[];
  /** Rows and columns frozen at the top and start. */
  readonly freeze?: { readonly rows: number; readonly columns: number };
  /** Merged ranges, 0-based and inclusive. */
  readonly merges?: readonly { readonly top: number; readonly left: number; readonly bottom: number; readonly right: number }[];
  /** An AutoFilter on these 0-based, inclusive cells (usually the header row and the data below). */
  readonly autoFilter?: { readonly top: number; readonly left: number; readonly bottom: number; readonly right: number };
  readonly images?: readonly XlsxImage[];
  readonly protection?: XlsxProtection;
  readonly rightToLeft?: boolean;
  /** Outline summary rows above their details (true, the default for grids) or below. */
  readonly summaryAbove?: boolean;
}

export interface XlsxWorkbook {
  readonly sheets: readonly XlsxSheet[];
  readonly creator?: string;
  readonly title?: string;
}

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAX_TEXT = 32767;
const MAX_ROWS = 1_048_576;
const MAX_COLUMNS = 16_384;
const COLOR = /^#[0-9a-f]{6}$/i;

function fail(property: string, expected: string): never {
  throw new TypeError(`Invalid Excel export: ${property} must be ${expected}.`);
}

/** XML text: escaped, without characters XML 1.0 forbids (controls, unpaired surrogates, U+FFFE/U+FFFF). */
export function xmlText(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += value.charAt(i) + value.charAt(i + 1);
        i++;
      }
      continue;
    }
    if ((c >= 0xdc00 && c <= 0xdfff) || c === 0xfffe || c === 0xffff || (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d)) continue;
    const ch = value.charAt(i);
    out += ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : ch;
  }
  return out;
}

/** A1 column letters for a 0-based index. */
export function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export const cellRef = (row: number, column: number): string => `${columnName(column)}${String(row + 1)}`;

/** Excel's serial day number (1900 date system) for a calendar date and time of day. */
export function excelSerial(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, millisecond = 0): number {
  const days = (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000;
  return days + (hour * 3_600_000 + minute * 60_000 + second * 1000 + millisecond) / 86_400_000;
}

/** Sheet names: at most 31 characters, none of `[]:*?/\`, unique (case-insensitive), not empty. */
export function sheetNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((raw, i) => {
    const base = raw.replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || `Sheet${String(i + 1)}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - String(n).length - 3)} (${String(n)})`;
    used.add(name.toLowerCase());
    return name;
  });
}

/** A link with an allowed scheme, or null. */
function safeLink(link: string): string | null {
  try {
    const url = new URL(link);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:' ? url.href : null;
  } catch {
    return null;
  }
}

function assertStyle(style: XlsxStyle, at: string): void {
  for (const key of ['color', 'fill', 'borderColor'] as const) if (style[key] !== undefined && !COLOR.test(style[key])) fail(`${at}.${key}`, 'a #RRGGBB color');
  for (const key of ['border', 'borderTop', 'borderBottom'] as const) if (style[key] !== undefined && !['thin', 'medium', 'thick'].includes(style[key])) fail(`${at}.${key}`, '"thin" | "medium" | "thick"');
  if (style.fontSize !== undefined && !(style.fontSize >= 1 && style.fontSize <= 409)) fail(`${at}.fontSize`, 'a number from 1 to 409');
  if (style.indent !== undefined && !(Number.isInteger(style.indent) && style.indent >= 0 && style.indent <= 15)) fail(`${at}.indent`, 'an integer from 0 to 15');
  if (style.numberFormat !== undefined && (typeof style.numberFormat !== 'string' || style.numberFormat.length > 255)) fail(`${at}.numberFormat`, 'a format of at most 255 characters');
}

/** Deduplicated fonts, fills, borders, number formats, and cell formats. */
class Styles {
  readonly #fonts: string[] = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'];
  readonly #fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  readonly #borders: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  readonly #formats = new Map<string, number>();
  readonly #xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  readonly #byKey = new Map<string, number>();

  #index(list: string[], xml: string): number {
    const i = list.indexOf(xml);
    if (i >= 0) return i;
    list.push(xml);
    return list.length - 1;
  }

  id(style: XlsxStyle | undefined): number {
    if (!style) return 0;
    const key = JSON.stringify(style);
    const known = this.#byKey.get(key);
    if (known !== undefined) return known;
    const argb = (c: string): string => `FF${c.slice(1).toUpperCase()}`;
    const font = `<font>${style.bold ? '<b/>' : ''}${style.italic ? '<i/>' : ''}${style.underline ? '<u/>' : ''}<sz val="${String(style.fontSize ?? 11)}"/>${style.color ? `<color rgb="${argb(style.color)}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`;
    const fill = style.fill ? `<fill><patternFill patternType="solid"><fgColor rgb="${argb(style.fill)}"/><bgColor indexed="64"/></patternFill></fill>` : null;
    const side = (name: string, b: XlsxBorder | undefined): string => (b ? `<${name} style="${b}"><color rgb="${argb(style.borderColor ?? '#000000')}"/></${name}>` : `<${name}/>`);
    const all = style.border;
    const hasBorder = all ?? style.borderTop ?? style.borderBottom;
    const border = hasBorder ? `<border>${side('left', all)}${side('right', all)}${side('top', style.borderTop ?? all)}${side('bottom', style.borderBottom ?? all)}<diagonal/></border>` : null;
    let numFmt = 0;
    if (style.numberFormat !== undefined && style.numberFormat !== 'General') {
      numFmt = this.#formats.get(style.numberFormat) ?? 164 + this.#formats.size;
      this.#formats.set(style.numberFormat, numFmt);
    }
    const fontId = this.#index(this.#fonts, font);
    const fillId = fill ? this.#index(this.#fills, fill) : 0;
    const borderId = border ? this.#index(this.#borders, border) : 0;
    const horizontal = style.align === 'start' ? 'left' : style.align === 'end' ? 'right' : style.align;
    const alignment = horizontal || style.verticalAlign || style.wrap || style.indent ? `<alignment${horizontal ? ` horizontal="${horizontal}"` : ''}${style.verticalAlign ? ` vertical="${style.verticalAlign}"` : ''}${style.wrap ? ' wrapText="1"' : ''}${style.indent ? ` indent="${String(style.indent)}"` : ''}/>` : '';
    const xf = `<xf numFmtId="${String(numFmt)}" fontId="${String(fontId)}" fillId="${String(fillId)}" borderId="${String(borderId)}" xfId="0"${numFmt ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${alignment ? ' applyAlignment="1">' + alignment + '</xf>' : '/>'}`;
    const id = this.#index(this.#xfs, xf);
    this.#byKey.set(key, id);
    return id;
  }

  xml(): string {
    const formats = [...this.#formats].map(([code, id]) => `<numFmt numFmtId="${String(id)}" formatCode="${xmlText(code)}"/>`);
    const list = (tag: string, items: readonly string[]): string => `<${tag} count="${String(items.length)}">${items.join('')}</${tag}>`;
    return `${XML}<styleSheet xmlns="${MAIN}">${formats.length > 0 ? list('numFmts', formats) : ''}${list('fonts', this.#fonts)}${list('fills', this.#fills)}${list('borders', this.#borders)}<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>${list('cellXfs', this.#xfs)}<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

const toBase64 = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

/** ECMA-376 sheet protection hash: SHA-512 over salt and UTF-16LE password, then `spinCount` rounds over hash and a 32-bit little-endian counter. */
export async function protectionHash(password: string, salt: Uint8Array, spinCount: number): Promise<string> {
  const subtle = 'crypto' in globalThis ? globalThis.crypto.subtle : undefined;
  if (!subtle) throw new Error('Excel sheet protection with a password needs Web Crypto (a secure context).');
  const pass = new Uint8Array(password.length * 2);
  for (let i = 0; i < password.length; i++) {
    const c = password.charCodeAt(i);
    pass[i * 2] = c & 0xff;
    pass[i * 2 + 1] = c >> 8;
  }
  const first = new Uint8Array(salt.length + pass.length);
  first.set(salt);
  first.set(pass, salt.length);
  let hash = new Uint8Array(await subtle.digest('SHA-512', first));
  const round = new Uint8Array(hash.length + 4);
  for (let i = 0; i < spinCount; i++) {
    round.set(hash);
    round[64] = i & 0xff;
    round[65] = (i >>> 8) & 0xff;
    round[66] = (i >>> 16) & 0xff;
    round[67] = (i >>> 24) & 0xff;
    hash = new Uint8Array(await subtle.digest('SHA-512', round));
  }
  return toBase64(hash);
}

const isPng = (b: Uint8Array): boolean => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpeg = (b: Uint8Array): boolean => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** Write a workbook as an .xlsx Blob. Untrusted values are safe: text is escaped and never becomes a formula. */
export async function writeXlsx(workbook: XlsxWorkbook): Promise<Blob> {
  const list: unknown = workbook.sheets;
  if (!Array.isArray(list) || list.length === 0 || list.length > 255) fail('sheets', 'an array of 1 to 255 sheets');
  const styles = new Styles();
  const strings = new Map<string, number>();
  const shared = (text: string): number => {
    let i = strings.get(text);
    if (i === undefined) {
      i = strings.size;
      strings.set(text, i);
    }
    return i;
  };
  const files: ZipFileInput[] = [];
  const names = sheetNames(workbook.sheets.map((s) => s.name));
  const linkStyle: XlsxStyle = { color: '#0563C1', underline: true };
  let drawingCount = 0;
  let imageCount = 0;
  const contentImages = new Set<string>();
  const drawingOverrides: string[] = [];
  for (let n = 0; n < workbook.sheets.length; n++) {
    const sheet = workbook.sheets[n];
    if (!sheet) continue;
    if (sheet.rows.length > MAX_ROWS) fail(`sheets[${String(n)}].rows`, `at most ${String(MAX_ROWS)} rows`);
    const rels: string[] = [];
    const links: string[] = [];
    let width = 0;
    const rowsXml: string[] = [];
    let maxLevel = 0;
    sheet.rows.forEach((row, r) => {
      if (row.cells.length > MAX_COLUMNS) fail(`sheets[${String(n)}].rows[${String(r)}]`, `at most ${String(MAX_COLUMNS)} cells`);
      width = Math.max(width, row.cells.length);
      const level = Math.max(0, Math.min(7, Math.trunc(row.outlineLevel ?? 0)));
      maxLevel = Math.max(maxLevel, level);
      const cells: string[] = [];
      row.cells.forEach((cell, c) => {
        if (!cell) return;
        const ref = cellRef(r, c);
        let link: string | null = null;
        if (cell.link !== undefined) {
          link = safeLink(cell.link);
          if (link !== null) {
            rels.push(`<Relationship Id="rId${String(rels.length + 1)}" Type="${REL}/hyperlink" Target="${xmlText(link)}" TargetMode="External"/>`);
            links.push(`<hyperlink ref="${ref}" r:id="rId${String(rels.length)}"/>`);
          }
        }
        if (cell.style) assertStyle(cell.style, `sheets[${String(n)}] cell ${ref} style`);
        const s = styles.id(link !== null ? { ...linkStyle, ...cell.style } : cell.style);
        const sAttr = s ? ` s="${String(s)}"` : '';
        if (cell.formula !== undefined) {
          const f = cell.formula.replace(/^=/, '');
          cells.push(`<c r="${ref}"${sAttr}><f>${xmlText(f)}</f></c>`);
          return;
        }
        const v = cell.value;
        if (v === null) {
          if (s) cells.push(`<c r="${ref}"${sAttr}/>`);
        } else if (typeof v === 'number') {
          if (Number.isFinite(v)) cells.push(`<c r="${ref}"${sAttr}><v>${String(v)}</v></c>`);
          else if (s) cells.push(`<c r="${ref}"${sAttr}/>`);
        } else if (typeof v === 'boolean') cells.push(`<c r="${ref}"${sAttr} t="b"><v>${v ? '1' : '0'}</v></c>`);
        else cells.push(`<c r="${ref}"${sAttr} t="s"><v>${String(shared(v.slice(0, MAX_TEXT)))}</v></c>`);
      });
      const attrs = `${level ? ` outlineLevel="${String(level)}"` : ''}${row.hidden ? ' hidden="1"' : ''}${row.collapsed ? ' collapsed="1"' : ''}`;
      rowsXml.push(`<row r="${String(r + 1)}"${attrs}>${cells.join('')}</row>`);
    });
    // Images: one drawing per sheet.
    let drawingXml = '';
    if (sheet.images && sheet.images.length > 0) {
      drawingCount++;
      const drawingRels: string[] = [];
      const anchors = sheet.images.map((img, i) => {
        const bytes = img.bytes;
        if (!(bytes instanceof Uint8Array) || !((img.type === 'png' && isPng(bytes)) || (img.type === 'jpeg' && isJpeg(bytes)))) fail(`sheets[${String(n)}].images[${String(i)}]`, 'PNG or JPEG bytes matching type');
        if (!(img.width > 0 && img.height > 0 && img.width <= 10000 && img.height <= 10000)) fail(`sheets[${String(n)}].images[${String(i)}] size`, '1 to 10000 pixels');
        imageCount++;
        const ext = img.type === 'png' ? 'png' : 'jpeg';
        contentImages.add(ext);
        files.push({ name: `xl/media/image${String(imageCount)}.${ext}`, data: bytes, compression: 'store' });
        drawingRels.push(`<Relationship Id="rId${String(i + 1)}" Type="${REL}/image" Target="../media/image${String(imageCount)}.${ext}"/>`);
        const cx = Math.round(img.width * 9525);
        const cy = Math.round(img.height * 9525);
        return `<xdr:oneCellAnchor><xdr:from><xdr:col>${String(img.column)}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${String(img.row)}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${String(cx)}" cy="${String(cy)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${String(i + 2)}" name="Picture ${String(i + 1)}" descr="${xmlText(img.alt ?? '')}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${String(i + 1)}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${String(cx)}" cy="${String(cy)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
      });
      files.push({ name: `xl/drawings/drawing${String(drawingCount)}.xml`, data: `${XML}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}">${anchors.join('')}</xdr:wsDr>` });
      files.push({ name: `xl/drawings/_rels/drawing${String(drawingCount)}.xml.rels`, data: `${XML}<Relationships xmlns="${PKG_REL}">${drawingRels.join('')}</Relationships>` });
      drawingOverrides.push(`<Override PartName="/xl/drawings/drawing${String(drawingCount)}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      rels.push(`<Relationship Id="rId${String(rels.length + 1)}" Type="${REL}/drawing" Target="../drawings/drawing${String(drawingCount)}.xml"/>`);
      drawingXml = `<drawing r:id="rId${String(rels.length)}"/>`;
    }
    // Protection.
    let protection = '';
    if (sheet.protection) {
      const p = sheet.protection;
      const allow = new Set(p.allow ?? []);
      const flags = `${allow.has('sort') ? ' sort="0"' : ''}${allow.has('autoFilter') ? ' autoFilter="0"' : ''}${allow.has('formatColumns') ? ' formatColumns="0"' : ''}${allow.has('formatRows') ? ' formatRows="0"' : ''}${allow.has('selectLockedCells') ? '' : ' selectLockedCells="1"'}`;
      if (p.password !== undefined && p.password !== '') {
        const spin = p.spinCount ?? 100_000;
        if (!(Number.isInteger(spin) && spin >= 1 && spin <= 10_000_000)) fail('protection.spinCount', 'an integer from 1 to 10000000');
        const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
        const hash = await protectionHash(p.password, salt, spin);
        protection = `<sheetProtection algorithmName="SHA-512" hashValue="${hash}" saltValue="${toBase64(salt)}" spinCount="${String(spin)}" sheet="1" objects="1" scenarios="1"${flags}/>`;
      } else protection = `<sheetProtection sheet="1" objects="1" scenarios="1"${flags}/>`;
    }
    const fr = sheet.freeze;
    let pane = '';
    if (fr && (fr.rows > 0 || fr.columns > 0)) {
      const active = fr.rows > 0 && fr.columns > 0 ? 'bottomRight' : fr.rows > 0 ? 'bottomLeft' : 'topRight';
      pane = `<pane${fr.columns > 0 ? ` xSplit="${String(fr.columns)}"` : ''}${fr.rows > 0 ? ` ySplit="${String(fr.rows)}"` : ''} topLeftCell="${cellRef(fr.rows, fr.columns)}" activePane="${active}" state="frozen"/><selection pane="${active}"/>`;
    }
    const cols = (sheet.widths ?? [])
      .map((w, i) => (w === undefined ? '' : `<col min="${String(i + 1)}" max="${String(i + 1)}" width="${String(Math.round(Math.max(1, Math.min(255, w)) * 100) / 100)}" customWidth="1"/>`))
      .join('');
    const range = (m: { top: number; left: number; bottom: number; right: number }): string => `${cellRef(m.top, m.left)}:${cellRef(m.bottom, m.right)}`;
    const merges = sheet.merges && sheet.merges.length > 0 ? `<mergeCells count="${String(sheet.merges.length)}">${sheet.merges.map((m) => `<mergeCell ref="${range(m)}"/>`).join('')}</mergeCells>` : '';
    const dimension = sheet.rows.length > 0 && width > 0 ? `A1:${cellRef(sheet.rows.length - 1, width - 1)}` : 'A1';
    const xml = `${XML}<worksheet xmlns="${MAIN}" xmlns:r="${REL}">${maxLevel > 0 ? `<sheetPr><outlinePr summaryBelow="${sheet.summaryAbove === false ? '1' : '0'}"/></sheetPr>` : ''}<dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0"${sheet.rightToLeft ? ' rightToLeft="1"' : ''}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"${maxLevel > 0 ? ` outlineLevelRow="${String(maxLevel)}"` : ''}/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rowsXml.join('')}</sheetData>${protection}${sheet.autoFilter ? `<autoFilter ref="${range(sheet.autoFilter)}"/>` : ''}${merges}${links.length > 0 ? `<hyperlinks>${links.join('')}</hyperlinks>` : ''}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>${drawingXml}</worksheet>`;
    files.push({ name: `xl/worksheets/sheet${String(n + 1)}.xml`, data: xml });
    if (rels.length > 0) files.push({ name: `xl/worksheets/_rels/sheet${String(n + 1)}.xml.rels`, data: `${XML}<Relationships xmlns="${PKG_REL}">${rels.join('')}</Relationships>` });
  }
  const sheetCount = workbook.sheets.length;
  const indexes = Array.from({ length: sheetCount }, (_, i) => i + 1);
  // The AutoFilter ranges need the hidden _FilterDatabase names Excel writes.
  const defined = workbook.sheets
    .map((s, i) => (s.autoFilter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${String(i)}" hidden="1">'${(names[i] ?? '').replace(/'/g, "''")}'!$${columnName(s.autoFilter.left)}$${String(s.autoFilter.top + 1)}:$${columnName(s.autoFilter.right)}$${String(s.autoFilter.bottom + 1)}</definedName>` : ''))
    .join('');
  const sst = [...strings.keys()].map((t) => `<si><t xml:space="preserve">${xmlText(t)}</t></si>`).join('');
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  files.push(
    { name: '[Content_Types].xml', data: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${contentImages.has('png') ? '<Default Extension="png" ContentType="image/png"/>' : ''}${contentImages.has('jpeg') ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : ''}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${indexes.map((i) => `<Override PartName="/xl/worksheets/sheet${String(i)}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>${drawingOverrides.join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: 'docProps/core.xml', data: `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${workbook.title ? `<dc:title>${xmlText(workbook.title)}</dc:title>` : ''}${workbook.creator ? `<dc:creator>${xmlText(workbook.creator)}</dc:creator>` : ''}<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>` },
    { name: 'xl/workbook.xml', data: `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets>${indexes.map((i) => `<sheet name="${xmlText(names[i - 1] ?? '')}" sheetId="${String(i)}" r:id="rId${String(i)}"/>`).join('')}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ''}</workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `${XML}<Relationships xmlns="${PKG_REL}">${indexes.map((i) => `<Relationship Id="rId${String(i)}" Type="${REL}/worksheet" Target="worksheets/sheet${String(i)}.xml"/>`).join('')}<Relationship Id="rId${String(sheetCount + 1)}" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId${String(sheetCount + 2)}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: styles.xml() },
    { name: 'xl/sharedStrings.xml', data: `${XML}<sst xmlns="${MAIN}" count="${String(strings.size)}" uniqueCount="${String(strings.size)}">${sst}</sst>` },
  );
  const blob = await zipFiles(files);
  return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
