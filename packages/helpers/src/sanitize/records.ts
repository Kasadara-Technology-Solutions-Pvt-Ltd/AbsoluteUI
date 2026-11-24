/**
 * Record cleanup: trimming, nullish/empty removal, normalization, de-duplication and type
 * coercion (docs/PLAN-HELPERS.md section 2). Inputs are never mutated; output objects are fresh and
 * never receive `__proto__`, `constructor` or `prototype` keys.
 */
import { LimitError } from '../error/index.js';
import { isUnsafeKey } from '../internal/keys.js';
import { isPlainObject } from '../is/index.js';
import { collapseWhitespace, stripInvisible } from './text.js';

export interface DeepOptions {
  /** Recurse into nested plain objects and arrays. */
  readonly deep?: boolean;
  /** Maximum nesting depth; deeper input throws `HLP_SANITIZE_TOO_DEEP`. Default 100. */
  readonly maxDepth?: number;
}

type Recurse = (child: unknown) => unknown;
type Visit = (value: unknown, recurse: Recurse, register: (original: object, copy: unknown) => void) => unknown;

const isContainer = (v: unknown): v is object => Array.isArray(v) || isPlainObject(v);

/**
 * Visits `root`, copying arrays and plain objects through `visit`; other values are shared.
 * Without `deep`, nested containers are passed through untouched. Cycle-safe: a container
 * seen again maps to its copy.
 */
function walk(root: unknown, deep: boolean, maxDepth: number, visit: Visit): unknown {
  const copies = new WeakMap<object, unknown>();
  const register = (original: object, copy: unknown): void => {
    copies.set(original, copy);
  };
  const go = (value: unknown, depth: number): unknown => {
    if (depth > maxDepth) throw new LimitError('HLP_SANITIZE_TOO_DEEP', 'Input nesting exceeds the limit.', { details: { maxDepth } });
    const recurse: Recurse = (child) => {
      if (isContainer(child)) {
        if (!deep) return child;
        const done = copies.get(child);
        if (done !== undefined) return done;
      }
      return go(child, depth + 1);
    };
    return visit(value, recurse, register);
  };
  return go(root, 0);
}

/** Builds a fresh container of the same kind, registered before its children for cycles. */
function copyContainer(value: unknown, recurse: Recurse, register: (original: object, copy: unknown) => void, keep: (child: unknown) => boolean): unknown {
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    register(value, out);
    for (const item of value) {
      const v = recurse(item);
      if (keep(v)) out.push(v);
    }
    return out;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    register(value, out);
    for (const key of Object.keys(value)) {
      if (isUnsafeKey(key)) continue;
      const v = recurse(value[key]);
      if (keep(v)) out[key] = v;
    }
    return out;
  }
  return value;
}

/**
 * Trims every string; with `deep` (default true) also inside nested plain objects and arrays.
 * @example trimStrings({ name: ' Ada ', tags: [' x '] }) // => { name: 'Ada', tags: ['x'] }
 */
export function trimStrings<T>(value: T, options: DeepOptions = {}): T {
  const { deep = true, maxDepth = 100 } = options;
  return walk(value, deep, maxDepth, (v, recurse, register) => (typeof v === 'string' ? v.trim() : copyContainer(v, recurse, register, () => true))) as T;
}

/**
 * Removes `null` and `undefined` properties and array items (top level unless `deep`).
 * @example removeNullish({ a: 1, b: null, c: undefined }) // => { a: 1 }
 */
export function removeNullish<T>(value: T, options: DeepOptions = {}): T {
  const { deep = false, maxDepth = 100 } = options;
  return walk(value, deep, maxDepth, (v, recurse, register) => copyContainer(v, recurse, register, (c) => c !== null && c !== undefined)) as T;
}

export interface RemoveEmptyOptions extends DeepOptions {
  /** Treat whitespace-only strings as empty. Default true. */
  readonly whitespace?: boolean;
  /** Also remove `null` and `undefined`. Default true. */
  readonly nullish?: boolean;
}

/**
 * Removes empty strings, empty arrays and empty plain objects (and, by default, nullish values).
 * With `deep`, containers that become empty after cleaning are removed too.
 * @example removeEmpty({ a: '', b: [], c: {}, d: 0 }) // => { d: 0 }
 */
export function removeEmpty<T>(value: T, options: RemoveEmptyOptions = {}): T {
  const { deep = false, maxDepth = 100, whitespace = true, nullish = true } = options;
  const keep = (c: unknown): boolean => {
    if (c === null || c === undefined) return !nullish;
    if (typeof c === 'string') return (whitespace ? c.trim() : c) !== '';
    if (Array.isArray(c)) return c.length > 0;
    if (isPlainObject(c)) return Object.keys(c).length > 0;
    return true;
  };
  return walk(value, deep, maxDepth, (v, recurse, register) => copyContainer(v, recurse, register, keep)) as T;
}

export interface NormalizeRecordRules {
  /** Trim string values. Default true. */
  readonly trim?: boolean;
  /** Collapse internal whitespace runs to one space. Default false. */
  readonly collapseWhitespace?: boolean;
  /** Remove zero-width and bidi control characters. Default true. */
  readonly stripInvisible?: boolean;
  /** Turn empty strings (after trimming) into `null`. Default false. */
  readonly emptyToNull?: boolean;
  /** Lowercase property names. Default false. */
  readonly lowercaseKeys?: boolean;
  /** Also trim property names. Default true. */
  readonly trimKeys?: boolean;
  /** Fields to convert to numbers (invalid -> `null`). Matched after key normalization. */
  readonly toNumber?: readonly string[];
  /** Fields to convert to booleans (`true/false/yes/no/y/n/1/0/on/off`; invalid -> `null`). */
  readonly toBoolean?: readonly string[];
  /** Fields to lowercase (for example e-mail addresses). */
  readonly lowercase?: readonly string[];
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'on']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0', 'off']);

function parseBooleanLoose(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return TRUE_WORDS.has(s) ? true : FALSE_WORDS.has(s) ? false : null;
}

// Plain decimal with optional sign, grouping-free; bounded length keeps it linear.
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function parseNumberStrict(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length === 0 || s.length > 400 || !DECIMAL.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalizes one flat record: trims strings, strips invisible characters, optionally collapses
 * whitespace, maps empty strings to `null`, normalizes keys, and converts listed fields.
 * @example
 * normalizeRecord({ ' Age ': ' 42 ', Name: ' Ada  L ' }, { lowercaseKeys: true, collapseWhitespace: true, toNumber: ['age'] })
 * // { age: 42, name: 'Ada L' }
 */
export function normalizeRecord(record: Readonly<Record<string, unknown>>, rules: NormalizeRecordRules = {}): Record<string, unknown> {
  const { trim = true, collapseWhitespace: collapse = false, stripInvisible: strip = true, emptyToNull = false, lowercaseKeys = false, trimKeys = true } = rules;
  const numbers = new Set(rules.toNumber);
  const booleans = new Set(rules.toBoolean);
  const lower = new Set(rules.lowercase);
  const out: Record<string, unknown> = {};
  for (const rawKey of Object.keys(record)) {
    let key = strip ? stripInvisible(rawKey) : rawKey;
    if (trimKeys) key = key.trim();
    if (lowercaseKeys) key = key.toLowerCase();
    if (isUnsafeKey(key) || isUnsafeKey(rawKey)) continue;
    let v = record[rawKey];
    if (typeof v === 'string') {
      let t = strip ? stripInvisible(v) : v;
      if (collapse) t = collapseWhitespace(t);
      else if (trim) t = t.trim();
      if (lower.has(key)) t = t.toLowerCase();
      v = emptyToNull && t === '' ? null : t;
    }
    if (numbers.has(key) && v !== null && v !== undefined) v = parseNumberStrict(v);
    else if (booleans.has(key) && v !== null && v !== undefined) v = parseBooleanLoose(v);
    out[key] = v;
  }
  return out;
}

export interface DedupeOptions {
  /** Which duplicate survives. Default `'first'`. Order follows the survivors' positions. */
  readonly keep?: 'first' | 'last';
}

/**
 * Removes duplicates by a key (compared with `SameValueZero`), in O(n).
 * @example dedupeBy([{ id: 1, v: 'a' }, { id: 1, v: 'b' }], (r) => r.id, { keep: 'last' }) // => [{ id: 1, v: 'b' }]
 */
export function dedupeBy<T>(records: readonly T[], keyFn: (record: T, index: number) => unknown, options: DedupeOptions = {}): T[] {
  const keepLast = options.keep === 'last';
  const winner = new Map<unknown, number>();
  records.forEach((r, i) => {
    const k = keyFn(r, i);
    if (keepLast || !winner.has(k)) winner.set(k, i);
  });
  const indices = new Set(winner.values());
  return records.filter((_, i) => indices.has(i));
}

export interface CleanRecordsOptions<T> {
  /** Normalization rules applied to every record. Default: trim + strip invisible. */
  readonly normalize?: NormalizeRecordRules | false;
  /** Drop records whose values are all nullish or empty strings. Default true. */
  readonly dropEmpty?: boolean;
  /** De-duplicate by this key after normalization. */
  readonly dedupeBy?: (record: Record<string, unknown>, index: number) => unknown;
  /** Which duplicate survives. Default `'first'`. */
  readonly keep?: 'first' | 'last';
  /** Final filter. */
  readonly filter?: (record: Record<string, unknown>) => boolean;
  /** Final mapping. */
  readonly map?: (record: Record<string, unknown>) => T;
}

/**
 * Cleaning pipeline for imported rows: normalize -> drop empty rows -> dedupe -> filter -> map.
 * @example
 * const rows = [{ name: ' Ada ', email: 'ada@example.com' }, { name: '', email: '' }, { name: 'Ada L.', email: 'ada@example.com' }];
 * cleanRecords(rows, { normalize: { emptyToNull: true }, dedupeBy: (r) => r.email, keep: 'last' }); // => [{ name: 'Ada L.', email: 'ada@example.com' }]
 */
export function cleanRecords<T = Record<string, unknown>>(records: readonly Readonly<Record<string, unknown>>[], options: CleanRecordsOptions<T> = {}): T[] {
  const { normalize = {}, dropEmpty = true, keep = 'first' } = options;
  let rows = records.map((r) => (normalize === false ? normalizeRecord(r, { trim: false, stripInvisible: false, trimKeys: false }) : normalizeRecord(r, normalize)));
  if (dropEmpty) rows = rows.filter((r) => Object.values(r).some((v) => v !== null && v !== undefined && v !== ''));
  if (options.dedupeBy) rows = dedupeBy(rows, options.dedupeBy, { keep });
  if (options.filter) rows = rows.filter(options.filter);
  const map = options.map;
  return map ? rows.map(map) : (rows as T[]);
}

/** Target types for {@link coerceRecordTypes}. */
export type CoerceType = 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'json';

export interface CoerceOptions {
  /** What to do with values that cannot be converted. Default `'null'`. */
  readonly onInvalid?: 'null' | 'keep' | 'omit';
  /** Drop properties not listed in the type map. Default false. */
  readonly strip?: boolean;
}

/**
 * Converts record fields from strings to the listed types (CSV/form import). `date` yields a
 * `Date` from an ISO 8601 string; `json` parses JSON text (max 100 000 characters).
 * @example coerceRecordTypes({ n: '4', ok: 'yes' }, { n: 'integer', ok: 'boolean' }) // => { n: 4, ok: true }
 */
export function coerceRecordTypes(record: Readonly<Record<string, unknown>>, types: Readonly<Record<string, CoerceType>>, options: CoerceOptions = {}): Record<string, unknown> {
  const { onInvalid = 'null', strip = false } = options;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (isUnsafeKey(key)) continue;
    const raw = record[key];
    const type = Object.prototype.hasOwnProperty.call(types, key) ? types[key] : undefined;
    if (type === undefined) {
      if (!strip) out[key] = raw;
      continue;
    }
    if (raw === null || raw === undefined || raw === '') {
      out[key] = null;
      continue;
    }
    const v = coerceOne(raw, type);
    if (v !== INVALID) out[key] = v;
    else if (onInvalid === 'null') out[key] = null;
    else if (onInvalid === 'keep') out[key] = raw;
  }
  return out;
}

const INVALID: unique symbol = Symbol('invalid');
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function coerceOne(raw: unknown, type: CoerceType): unknown {
  switch (type) {
    case 'string':
      return typeof raw === 'string' ? raw : typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'bigint' ? String(raw) : INVALID;
    case 'number':
      return parseNumberStrict(raw) ?? INVALID;
    case 'integer': {
      const n = parseNumberStrict(raw);
      return n !== null && Number.isSafeInteger(n) ? n : INVALID;
    }
    case 'boolean':
      return parseBooleanLoose(raw) ?? INVALID;
    case 'date': {
      if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? INVALID : new Date(raw.getTime());
      if (typeof raw !== 'string' || raw.length > 40 || !ISO_DATE_TIME.test(raw.trim())) return INVALID;
      const d = new Date(raw.trim());
      return Number.isNaN(d.getTime()) ? INVALID : d;
    }
    case 'json': {
      if (typeof raw !== 'string' || raw.length > 100_000) return INVALID;
      try {
        return JSON.parse(raw, (k, v: unknown) => (isUnsafeKey(k) ? undefined : v)) as unknown;
      } catch {
        return INVALID;
      }
    }
  }
}
