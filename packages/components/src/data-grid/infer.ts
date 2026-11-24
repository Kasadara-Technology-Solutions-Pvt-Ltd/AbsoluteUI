/**
 * Auto-generated columns (G7f): columns inferred from the rows, and typed values for rows read as
 * text (a CSV file dropped on the grid, `fileDrop`, parsed with `@absoluteui/helpers/csv`). Input is
 * untrusted: sizes are bounded and keys stay own data properties (no prototype writes).
 */
import { isInstantLike, isPlainDate } from '../data-table/model.js';
import { fail, type DataGridColumn } from './model.js';

export interface InferColumnsOptions {
  /** Rows inspected for keys and types (default 100, at most 10000). */
  readonly sample?: number;
  /** Keys left out. */
  readonly exclude?: readonly string[];
}

/** A typed CSV value (`coerceCsvValues`). */
export type CsvValue = string | number | boolean | null;

const MAX_COLUMNS = 1000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** "hireDate", "hire_date", "hire-date" read "Hire date". */
export function headerFromKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter((w) => w !== '')
    .map((w) => w.toLowerCase());
  const text = words.join(' ');
  return text === '' ? key : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Columns for the rows' own keys (first seen first): number, boolean, date (PlainDate), datetime
 * (Instant or ZonedDateTime), else text. Keys holding only objects or arrays are left out, as are
 * keys starting with `aui-` (reserved for generated columns).
 */
export function inferColumns<Row>(rows: readonly Row[], options: InferColumnsOptions = {}): DataGridColumn<Row>[] {
  if (!Array.isArray(rows)) fail('inferColumns.rows', 'array');
  const sample = options.sample ?? 100;
  if (!Number.isInteger(sample) || sample < 1 || sample > 10_000) fail('inferColumns.sample', 'integer from 1 to 10000');
  const exclude = options.exclude ?? [];
  if (!Array.isArray(exclude) || !exclude.every((k) => typeof k === 'string')) fail('inferColumns.exclude', 'array of keys');
  const skip = new Set(exclude);
  const kinds = new Map<string, Set<string>>();
  for (const row of rows.slice(0, sample)) {
    if (!isRecord(row)) continue;
    for (const key of Object.keys(row)) {
      if (skip.has(key) || key === '' || key.startsWith('aui-')) continue;
      let set = kinds.get(key);
      if (!set) {
        if (kinds.size >= MAX_COLUMNS) continue;
        set = new Set();
        kinds.set(key, set);
      }
      const v = row[key];
      if (v === null || v === undefined || v === '') continue;
      set.add(typeof v === 'number' && Number.isFinite(v) ? 'number' : typeof v === 'boolean' ? 'boolean' : isPlainDate(v) ? 'date' : isInstantLike(v) ? 'datetime' : typeof v === 'object' ? 'object' : 'text');
    }
  }
  const columns: DataGridColumn<Row>[] = [];
  for (const [key, set] of kinds) {
    if (set.size === 1 && set.has('object')) continue;
    const only = set.size === 1 ? [...set][0] : undefined;
    const type = only === 'number' || only === 'boolean' || only === 'date' || only === 'datetime' ? only : 'text';
    columns.push({ id: key, header: headerFromKey(key), field: key, ...(type === 'text' ? {} : { type }) });
  }
  return columns;
}

/**
 * Typed values for rows read as text (for example `parseCsv(text, { header: true }).rows` from
 * `@absoluteui/helpers/csv`): numbers (`12.5`, `-3`, `1e3`) and `true` / `false` become numbers and
 * booleans, empty cells null; numbers with leading zeros (codes) and unsafe integers stay text.
 */
export function coerceCsvValues(rows: readonly Readonly<Record<string, string>>[]): Record<string, CsvValue>[] {
  if (!Array.isArray(rows)) fail('coerceCsvValues.rows', 'array of records');
  const read = (raw: unknown): CsvValue => {
    if (typeof raw !== 'string') return null;
    const v = raw.trim();
    if (v === '') return null;
    if (v === 'true' || v === 'false') return v === 'true';
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(v) && !/^-?0\d/.test(v)) {
      const n = Number(v);
      if (Number.isFinite(n) && !(Number.isInteger(n) && !Number.isSafeInteger(n))) return n;
    }
    return raw;
  };
  // Object.fromEntries defines own data properties: a "__proto__" key never touches the prototype.
  return rows.map((row) => (isRecord(row) ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, read(v)])) : {}));
}
