/**
 * RFC 4180 CSV writer with OWASP CSV-injection neutralization (docs/PLAN-HELPERS.md section 5).
 */
import { ValidationError } from '../error/index.js';

export interface EscapeCsvCellOptions {
  /** Default `,`. */
  readonly delimiter?: string;
  /** `'minimal'` (default) quotes only when needed; `'all'` quotes every cell. */
  readonly quote?: 'minimal' | 'all';
  /**
   * Prefix cells that start with `=`, `+`, `-`, `@`, tab or CR (and their full-width forms)
   * with `'` so spreadsheets do not evaluate them as formulas. Default true.
   */
  readonly injectionProtection?: boolean;
}

// = + - @ TAB CR, and full-width ＝ ＋ － ＠ (U+FF1D, U+FF0B, U+FF0D, U+FF20).
const FORMULA_START = new Set([0x3d, 0x2b, 0x2d, 0x40, 0x09, 0x0d, 0xff1d, 0xff0b, 0xff0d, 0xff20]);

/** True when a spreadsheet could interpret the cell as a formula. @example isFormulaLike('=1+1') // => true */
export function isFormulaLike(cell: string): boolean {
  return cell.length > 0 && FORMULA_START.has(cell.charCodeAt(0));
}

/**
 * Escapes one cell: quotes it when it contains the delimiter, a quote, CR/LF, or leading or
 * trailing spaces, doubling inner quotes; neutralizes formula-like text by default.
 * @example escapeCsvCell('say "hi"') // => '"say ""hi"""'
 * @example escapeCsvCell('=SUM(A1)') // => "'=SUM(A1)"
 */
export function escapeCsvCell(value: string, options: EscapeCsvCellOptions = {}): string {
  const { delimiter = ',', quote = 'minimal', injectionProtection = true } = options;
  const cell = injectionProtection && isFormulaLike(value) ? `'${value}` : value;
  const needs =
    quote === 'all' ||
    cell.includes(delimiter) ||
    cell.includes('"') ||
    cell.includes('\n') ||
    cell.includes('\r') ||
    (cell.length > 0 && (cell.charCodeAt(0) === 32 || cell.charCodeAt(cell.length - 1) === 32));
  return needs ? `"${cell.replaceAll('"', '""')}"` : cell;
}

/** A column for object rows. */
export interface CsvColumn<T> {
  /** Property to read. */
  readonly key: string;
  /** Header text. Default: the key. */
  readonly header?: string;
  /** Converts the value before writing. */
  readonly format?: (value: unknown, row: T) => unknown;
}

export interface CsvStringifyOptions<T> extends EscapeCsvCellOptions {
  /** Columns for object rows (default: keys in first-seen order), or header names for array rows. */
  readonly columns?: readonly (string | CsvColumn<T>)[];
  /** Write a header row. Default true for object rows (and array rows with `columns`). */
  readonly header?: boolean;
  /** Line terminator. Default `\r\n` (RFC 4180). */
  readonly eol?: '\r\n' | '\n';
  /** Prepend a UTF-8 BOM so Excel detects the encoding. Default false. */
  readonly bom?: boolean;
  /** End the output with a line terminator. Default true. */
  readonly trailingEol?: boolean;
}

/** Converts any value to cell text: dates -> ISO 8601, objects -> JSON, nullish -> empty. */
function toCellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString();
  if (typeof v === 'symbol' || typeof v === 'function') return '';
  try {
    // JSON.stringify returns undefined for some inputs despite its declared type.
    const json = JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x)) as unknown;
    return typeof json === 'string' ? json : '';
  } catch {
    return '';
  }
}

/**
 * Writes rows (arrays or objects) as CSV. Numbers, booleans and dates are never prefixed by
 * injection protection (a negative number stays numeric); strings are.
 * @example stringifyCsv([{ name: 'Ada', score: 1 }]) // => 'name,score\r\nAda,1\r\n'
 * @example stringifyCsv([['a', 'b'], ['1', '2']], { eol: '\n' }) // => 'a,b\n1,2\n'
 */
export function stringifyCsv<T extends object>(rows: readonly T[] | readonly (readonly unknown[])[], options: CsvStringifyOptions<T> = {}): string {
  const { delimiter = ',', quote = 'minimal', injectionProtection = true, eol = '\r\n', bom = false, trailingEol = true } = options;
  if (delimiter.length !== 1 || delimiter === '"' || delimiter === '\n' || delimiter === '\r') throw new ValidationError('HLP_CSV_OPTION', 'The delimiter must be a single character other than the quote or a line break.');
  const cell = (v: unknown): string => escapeCsvCell(toCellText(v), { delimiter, quote, injectionProtection: injectionProtection && typeof v === 'string' });
  const headerCell = (s: string): string => escapeCsvCell(s, { delimiter, quote, injectionProtection });
  const lines: string[] = [];
  const line = (cells: readonly string[]): string => (cells.length === 1 && cells[0] === '' ? '""' : cells.join(delimiter));
  const first = rows[0];
  const arrayRows = first === undefined ? options.columns === undefined || options.columns.every((c) => typeof c === 'string') : Array.isArray(first);
  if (arrayRows) {
    const names = (options.columns ?? []).map((c) => (typeof c === 'string' ? c : (c.header ?? c.key)));
    if (names.length > 0 && options.header !== false) lines.push(line(names.map(headerCell)));
    for (const r of rows as readonly (readonly unknown[])[]) lines.push(line(r.map(cell)));
  } else {
    const objects = rows as readonly T[];
    let cols: CsvColumn<T>[];
    if (options.columns) {
      cols = options.columns.map((c) => (typeof c === 'string' ? { key: c } : c));
    } else {
      const seen = new Set<string>();
      for (const r of objects) for (const k of Object.keys(r)) seen.add(k);
      cols = [...seen].map((key) => ({ key }));
    }
    if (options.header !== false) lines.push(line(cols.map((c) => headerCell(c.header ?? c.key))));
    for (const r of objects) {
      const rec = r as Readonly<Record<string, unknown>>;
      lines.push(line(cols.map((c) => {
        const raw = Object.prototype.hasOwnProperty.call(rec, c.key) ? rec[c.key] : undefined;
        return cell(c.format ? c.format(raw, r) : raw);
      })));
    }
  }
  const body = lines.join(eol);
  return (bom ? String.fromCharCode(0xfeff) : '') + body + (trailingEol && lines.length > 0 ? eol : '');
}
