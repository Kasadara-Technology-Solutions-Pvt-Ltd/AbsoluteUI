/**
 * CSV serialization (RFC 4180) with spreadsheet formula-injection protection
 * (OWASP "CSV Injection"): a cell whose text starts with `=`, `+`, `-`, `@`, a tab,
 * or a carriage return is prefixed with a single quote and always quoted, so
 * spreadsheet applications treat it as text. Numbers produced by the table itself
 * (not by consumer callbacks) are trusted and never prefixed.
 */
import { configurationError } from '@absoluteui/core';

export type DataTableCsvDelimiter = ',' | ';' | '\t';

export interface DataTableCsvOptions {
  /** `visible` (default: displayed columns in display order), `all` (every column in column order, hidden too), or explicit column ids. */
  columns?: 'visible' | 'all' | readonly string[];
  /**
   * `filtered` (default: every row that matches the filters and search, in sort
   * order, across all pages), `page` (the current page), `selected` (selected rows in
   * sort order, ignoring filters), or `all` (every row in sort order, ignoring filters).
   * In server mode only the loaded rows exist, so every choice is limited to them.
   */
  rows?: 'filtered' | 'page' | 'selected' | 'all';
  /** Header row with the column headers. Default true. */
  header?: boolean;
  /**
   * `formatted` (default: the displayed text, `format()` or typed formatting) or
   * `raw` (numbers, `true`/`false`, ISO 8601 dates, ISO 8601 UTC instants, strings).
   */
  values?: 'formatted' | 'raw';
  /** Default `,`. */
  delimiter?: DataTableCsvDelimiter;
  /** Default `\r\n` (RFC 4180). */
  lineEnding?: '\r\n' | '\n';
  /** Prefix a UTF-8 byte order mark (helps some spreadsheet applications detect UTF-8). Default false. */
  bom?: boolean;
  /** Formula-injection protection. Default true; disable only for trusted, non-spreadsheet consumers. */
  escapeFormulas?: boolean;
}

/** A CSV cell value; `trusted` numbers come from the table's own number formatting. */
export interface CsvValue {
  readonly text: string;
  readonly trusted: boolean;
}

const FORMULA_START = new Set(['=', '+', '-', '@', '\t', '\r']);
const DELIMITERS: readonly string[] = [',', ';', '\t'];
/** One scan per field: delimiter, double quote, CR, or LF (RFC 4180 section 2.6). */
const NEEDS_QUOTES_COMMA = /[,"\r\n]/;
const NEEDS_QUOTES = new Map<string, RegExp>([[',', NEEDS_QUOTES_COMMA], [';', /[;"\r\n]/], ['\t', /[\t"\r\n]/]]);
const VALUES: readonly string[] = ['formatted', 'raw'];
const LINE_ENDINGS: readonly string[] = ['\r\n', '\n'];

export function assertCsvOptions(o: DataTableCsvOptions): void {
  const bad = (property: string, expected: string): never => {
    throw configurationError('DATA_TABLE_CSV', 'Invalid CSV export options.', { component: 'dataTable', property: `dataTable.toCsv.${property}`, expected });
  };
  const columns: unknown = o.columns;
  if (columns !== undefined && columns !== 'visible' && columns !== 'all' && !(Array.isArray(columns) && columns.every((c) => typeof c === 'string'))) bad('columns', '"visible" | "all" | column id array');
  if (o.rows !== undefined && !['filtered', 'page', 'selected', 'all'].includes(o.rows)) bad('rows', '"filtered" | "page" | "selected" | "all"');
  if (o.header !== undefined && typeof o.header !== 'boolean') bad('header', 'boolean');
  if (o.values !== undefined && !VALUES.includes(o.values)) bad('values', '"formatted" | "raw"');
  if (o.delimiter !== undefined && !DELIMITERS.includes(o.delimiter)) bad('delimiter', '"," | ";" | "\\t"');
  if (o.lineEnding !== undefined && !LINE_ENDINGS.includes(o.lineEnding)) bad('lineEnding', '"\\r\\n" | "\\n"');
  if (o.bom !== undefined && typeof o.bom !== 'boolean') bad('bom', 'boolean');
  if (o.escapeFormulas !== undefined && typeof o.escapeFormulas !== 'boolean') bad('escapeFormulas', 'boolean');
}

/** One CSV field: formula-escaped (unless trusted) and quoted when needed (RFC 4180 section 2.5-2.7). */
export function csvField(value: CsvValue, delimiter: string, escapeFormulas: boolean): string {
  let text = value.text;
  let quote = false;
  if (escapeFormulas && !value.trusted && text !== '' && FORMULA_START.has(text.charAt(0))) {
    text = `'${text}`;
    quote = true;
  }
  if (quote || (NEEDS_QUOTES.get(delimiter) ?? NEEDS_QUOTES_COMMA).test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Serialize a header and body rows. */
export function toCsvText(header: readonly string[] | null, rows: Iterable<readonly CsvValue[]>, options: DataTableCsvOptions): string {
  const delimiter = options.delimiter ?? ',';
  const eol = options.lineEnding ?? '\r\n';
  const escape = options.escapeFormulas ?? true;
  const lines: string[] = [];
  if (header) lines.push(header.map((h) => csvField({ text: h, trusted: false }, delimiter, escape)).join(delimiter));
  for (const row of rows) lines.push(row.map((v) => csvField(v, delimiter, escape)).join(delimiter));
  return (options.bom === true ? '\ufeff' : '') + lines.join(eol);
}

/**
 * Save CSV text (or a Blob) as a file through a temporary object URL and an
 * `<a download>` click. The only function in this component with a download side
 * effect; nothing calls it implicitly.
 */
export function downloadCsv(csv: string | Blob, filename: string, doc: Document = document): void {
  if (typeof filename !== 'string' || filename.trim() === '') {
    throw configurationError('DATA_TABLE_CSV', 'Invalid CSV file name.', { component: 'dataTable', property: 'dataTable.downloadCsv.filename', expected: 'non-empty string' });
  }
  const blob = typeof csv === 'string' ? new Blob([csv], { type: 'text/csv;charset=utf-8' }) : csv;
  const view = doc.defaultView ?? window;
  const url = view.URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  doc.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Some browsers read the URL after the click task; revoke it shortly after.
    view.setTimeout(() => {
      view.URL.revokeObjectURL(url);
    }, 1000);
  }
}
