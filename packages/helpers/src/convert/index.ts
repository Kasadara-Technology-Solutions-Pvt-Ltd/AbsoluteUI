/**
 * Strict conversions (docs/PLAN-HELPERS.md section 2 `convert`). Every `to*` returns `undefined` on
 * failure, never `NaN`; `...OrThrow` variants throw `ValidationError`.
 */
import { type Result, ValidationError, err, ok } from '../error/index.js';
import { isPlainObject } from '../is/index.js';
import { assertSafeKey, hasOwn, isUnsafeKey } from '../internal/keys.js';
import { daysInMonth } from '../date/plain-date.js';
import { type ParseBooleanOptions, parseBoolean } from '../boolean/index.js';

const MAX_NUMBER_TEXT = 1000;
const NUMERIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const BIDI = /[\u061c\u200e\u200f]/g;

interface LocaleSymbols {
  readonly group: string;
  readonly decimal: string;
  readonly minus: string;
  readonly digits: ReadonlyMap<string, string>;
}

const symbolCache = new Map<string, LocaleSymbols>();

function localeSymbols(locale: string): LocaleSymbols {
  let s = symbolCache.get(locale);
  if (s) return s;
  const parts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(-12345.6);
  const part = (type: string, fallback: string): string => (parts.find((p) => p.type === type)?.value ?? fallback).replace(BIDI, '');
  const plain = new Intl.NumberFormat(locale, { useGrouping: false });
  const digits = new Map<string, string>();
  for (let i = 0; i <= 9; i++) digits.set(plain.format(i).replace(BIDI, ''), String(i));
  s = { group: part('group', ','), decimal: part('decimal', '.'), minus: part('minusSign', '-'), digits };
  if (symbolCache.size >= 32) symbolCache.clear();
  symbolCache.set(locale, s);
  return s;
}

const SPACE_GROUPS = new Set([' ', '\u00a0', '\u202f', '\u2009']);

function normalizeLocaleNumber(text: string, locale: string): string {
  const { group, decimal, minus, digits } = localeSymbols(locale);
  const spaceGroup = SPACE_GROUPS.has(group);
  let out = '';
  for (const ch of text.replace(BIDI, '')) {
    const d = digits.get(ch);
    if (d !== undefined) out += d;
    else if (ch === decimal) out += '.';
    else if (ch === group || (spaceGroup && SPACE_GROUPS.has(ch))) continue;
    else if (ch === minus || ch === '\u2212') out += '-';
    else out += ch;
  }
  return out;
}

export interface ToNumberOptions {
  /** Parse locale-formatted text (group/decimal separators, native digits), e.g. `'de'` for `'1.234,5'`. */
  readonly locale?: string;
}

/**
 * Strict number conversion. Accepts finite numbers, safe-range bigints and numeric strings
 * (trimmed; sign, decimals, exponent; `-` U+2212 as minus). Rejects `''`, whitespace, `'12abc'`,
 * hex, `NaN` and `+/-Infinity`.
 * @example toNumber(' -1.5e3 ') // => -1500
 * @example toNumber('1.234,5', { locale: 'de' }) // => 1234.5
 * @example toNumber('12abc') // => undefined
 */
export function toNumber(value: unknown, options: ToNumberOptions = {}): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : undefined;
  }
  if (typeof value !== 'string' || value.length > MAX_NUMBER_TEXT) return undefined;
  let t = value.trim();
  if (options.locale !== undefined) t = normalizeLocaleNumber(t, options.locale);
  else if (t.startsWith('\u2212')) t = `-${t.slice(1)}`;
  if (!NUMERIC.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** How `toInteger` treats fractions. `'none'` rejects them; `'round'` rounds half away from zero. */
export type IntegerRounding = 'none' | 'trunc' | 'floor' | 'ceil' | 'round' | 'half-even';

export interface ToIntegerOptions extends ToNumberOptions {
  /** Default `'none'`. */
  readonly rounding?: IntegerRounding;
}

function roundInt(n: number, mode: IntegerRounding): number | undefined {
  switch (mode) {
    case 'none':
      return Number.isInteger(n) ? n : undefined;
    case 'trunc':
      return Math.trunc(n);
    case 'floor':
      return Math.floor(n);
    case 'ceil':
      return Math.ceil(n);
    case 'round':
      return Math.sign(n) * Math.round(Math.abs(n));
    case 'half-even': {
      const f = Math.floor(n);
      const d = n - f;
      if (d !== 0.5) return d < 0.5 ? f : f + 1;
      return f % 2 === 0 ? f : f + 1;
    }
  }
}

/**
 * Strict integer conversion with an explicit rounding mode.
 * @example toInteger('42') // => 42
 * @example toInteger('2.5', { rounding: 'half-even' }) // => 2
 * @example toInteger(1.5) // => undefined // rounding 'none'
 */
export function toInteger(value: unknown, options: ToIntegerOptions = {}): number | undefined {
  const n = toNumber(value, options);
  if (n === undefined) return undefined;
  const r = roundInt(n, options.rounding ?? 'none');
  return r === undefined ? undefined : r + 0;
}

/**
 * Like `toInteger` but also requires `Number.MIN_SAFE_INTEGER..MAX_SAFE_INTEGER`.
 * @example toSafeInteger('9007199254740993') // => undefined
 */
export function toSafeInteger(value: unknown, options: ToIntegerOptions = {}): number | undefined {
  const n = toInteger(value, options);
  return n !== undefined && Number.isSafeInteger(n) ? n : undefined;
}

const BIGINT_TEXT = /^[+-]?\d+$/;

/**
 * Converts bigints, integer numbers and decimal integer strings (trimmed, up to 10,000 digits) to `bigint`.
 * @example toBigInt('-12345678901234567890') // => -12345678901234567890n
 */
export function toBigInt(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return Number.isInteger(value) ? BigInt(value) : undefined;
  if (typeof value !== 'string' || value.length > 10_001) return undefined;
  const t = value.trim();
  return BIGINT_TEXT.test(t) ? BigInt(t) : undefined;
}

/**
 * Boolean conversion via `parseBoolean` (true/false/yes/no/y/n/on/off/1/0).
 * @example toBoolean('off') // => false
 */
export function toBoolean(value: unknown, options: ParseBooleanOptions = {}): boolean | undefined {
  return parseBoolean(value, options);
}

const MAX_TIME = 8.64e15;
const ISO = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?)?$/;

function parseIso(text: string): number | undefined {
  if (text.length < 10 || text.length > 40) return undefined;
  const m = ISO.exec(text);
  if (!m) return undefined;
  const [, ys = '', mos = '', ds = '', hs, mis = '0', ss = '0', frac = '', zone] = m;
  if (ys === '-000000') return undefined;
  const y = Number(ys);
  const mo = Number(mos);
  const d = Number(ds);
  const h = Number(hs ?? '0');
  const mi = Number(mis);
  const s = Number(ss);
  const ms = Math.floor(Number(`0.${frac || '0'}`) * 1000);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || s > 59) return undefined;
  const dt = new Date(0);
  if (hs !== undefined && zone === undefined) {
    // Date-time without a zone is local time (ECMAScript semantics).
    dt.setFullYear(y, mo - 1, d);
    dt.setHours(h, mi, s, ms);
  } else {
    let offset = 0;
    if (zone !== undefined && zone !== 'Z') {
      const oh = Number(zone.slice(1, 3));
      const om = Number(zone.slice(4, 6));
      if (oh > 23 || om > 59) return undefined;
      offset = (zone.startsWith('-') ? -1 : 1) * (oh * 60 + om);
    }
    dt.setUTCFullYear(y, mo - 1, d);
    dt.setUTCHours(h, mi - offset, s, ms);
  }
  const t = dt.getTime();
  return Number.isNaN(t) ? undefined : t;
}

/**
 * Strict date conversion: valid `Date` (copied), epoch milliseconds, or ISO 8601 text only -
 * `YYYY-MM-DD` (UTC midnight) or `YYYY-MM-DDTHH:mm[:ss[.fff]]` with optional `Z`/`+/-HH:mm`
 * (no zone = local time). Ambiguous forms like `'01/02/2026'` are rejected.
 * @example toDate('2026-09-29T10:00:00Z')?.getTime() // => 1790676000000
 * @example toDate('01/02/2026') // => undefined
 */
export function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : new Date(value.getTime());
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= MAX_TIME ? new Date(value) : undefined;
  if (typeof value !== 'string') return undefined;
  const t = parseIso(value.trim());
  return t === undefined ? undefined : new Date(t);
}

function defineKey(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
  else target[key] = value;
}

function jsonish(value: unknown): string {
  const stack = new Set<object>();
  const conv = (v: unknown): unknown => {
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'symbol') return v.toString();
    if (typeof v !== 'object' || v === null) return v;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
    if (stack.has(v)) return '[Circular]';
    stack.add(v);
    let out: unknown;
    if (Array.isArray(v)) out = v.map(conv);
    else if (v instanceof Map) out = [...(v as Map<unknown, unknown>)].map(([k, x]) => [conv(k), conv(x)]);
    else if (v instanceof Set) out = [...(v as Set<unknown>)].map(conv);
    else {
      const rec: Record<string, unknown> = {};
      for (const k of Object.keys(v)) defineKey(rec, k, conv((v as Record<string, unknown>)[k]));
      out = rec;
    }
    stack.delete(v);
    return out;
  };
  const text = JSON.stringify(conv(value)) as string | undefined;
  return text ?? '';
}

/**
 * Human-safe string for any value; never `'[object Object]'`. Nullish -> `''`; dates -> ISO;
 * errors -> `'Name: message'`; plain objects, arrays, maps and sets -> JSON (cycles as `'[Circular]'`,
 * bigints as strings); objects with their own `toString` use it.
 * @example toStringSafe({ a: 1n }) // => '{"a":"1"}'
 * @example toStringSafe(Symbol('x')) // => 'Symbol(x)'
 */
export function toStringSafe(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
      return Object.is(value, -0) ? '0' : String(value);
    case 'bigint':
    case 'boolean':
      return String(value);
    case 'symbol':
      return value.toString();
    case 'undefined':
      return '';
    case 'function':
      return value.name ? `[Function: ${value.name}]` : '[Function]';
    default:
      break;
  }
  if (value === null) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  if (value instanceof Error) return value.message ? `${value.name}: ${value.message}` : value.name;
  if (value instanceof RegExp) return value.toString();
  if (Array.isArray(value) || isPlainObject(value) || value instanceof Map || value instanceof Set) return jsonish(value);
  const custom = (value as { toString?: unknown }).toString;
  if (typeof custom === 'function' && custom !== Object.prototype.toString) {
    const s: unknown = custom.call(value);
    if (typeof s === 'string') return s;
  }
  return jsonish(value);
}

const isIterable = (v: unknown): v is Iterable<unknown> => typeof v === 'object' && v !== null && typeof (v as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function';

/**
 * Array from anything: nullish -> `[]`, arrays copied, iterables (Set, Map entries, generators) spread,
 * strings and other values wrapped (`'ab'` -> `['ab']`).
 * @example toArray(new Set([1, 2])) // => [1, 2]
 * @example toArray(5) // => [5]
 */
export function toArray<T>(value: Iterable<T> | T | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return (value as T[]).slice();
  if (isIterable(value)) return Array.from(value);
  return [value];
}

/**
 * Set from anything, with `toArray` rules (nullish -> empty set).
 * @example toSet([1, 1, 2]).size // => 2
 */
export function toSet<T>(value: Iterable<T> | T | null | undefined): Set<T> {
  return new Set(toArray(value));
}

/**
 * Map from a map (copied), an iterable of `[key, value]` pairs or a plain object; nullish -> empty map.
 * Returns `undefined` for anything else.
 * @example toMap({ a: 1 })?.get('a') // => 1
 */
export function toMap<K, V>(value: ReadonlyMap<K, V> | Iterable<readonly [K, V]>): Map<K, V> | undefined;
export function toMap<V>(value: Readonly<Record<string, V>>): Map<string, V> | undefined;
export function toMap(value: unknown): Map<unknown, unknown> | undefined;
export function toMap(value: unknown): Map<unknown, unknown> | undefined {
  if (value === null || value === undefined) return new Map();
  if (value instanceof Map) return new Map(value as Map<unknown, unknown>);
  if (isPlainObject(value)) return new Map(Object.entries(value));
  if (isIterable(value) && typeof value !== 'string') {
    const m = new Map<unknown, unknown>();
    for (const e of value) {
      if (!Array.isArray(e) || e.length !== 2) return undefined;
      m.set(e[0], e[1]);
    }
    return m;
  }
  return undefined;
}

/**
 * Plain object from a plain object (shallow copy), class instance (own enumerable props), `Map`
 * or iterable (including arrays) of `[key, value]` pairs with string/number keys. Unsafe keys (`__proto__`, ...) from maps/pairs -> `undefined`.
 * @example toPlainObject(new Map([['a', 1]])) // => { a: 1 }
 */
export function toPlainObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const out: Record<string, unknown> = {};
  if (value instanceof Map || isIterable(value)) {
    const entries = value instanceof Map ? (value as Map<unknown, unknown>) : (value);
    for (const e of entries) {
      if (!Array.isArray(e) || e.length !== 2) return undefined;
      const [k, v] = e as [unknown, unknown];
      if (typeof k !== 'string' && typeof k !== 'number') return undefined;
      const key = String(k);
      if (isUnsafeKey(key)) return undefined;
      out[key] = v;
    }
    return out;
  }
  for (const k of Object.keys(value)) defineKey(out, k, (value as Record<string, unknown>)[k]);
  return out;
}

/**
 * `toNumber` or throw `ValidationError` (`HLP_CONVERT_NUMBER`).
 * @example toNumberOrThrow('3') // => 3
 */
export function toNumberOrThrow(value: unknown, options: ToNumberOptions = {}): number {
  const n = toNumber(value, options);
  if (n === undefined) throw new ValidationError('HLP_CONVERT_NUMBER', 'Expected a number.');
  return n;
}

/**
 * `toInteger` or throw `ValidationError` (`HLP_CONVERT_INTEGER`).
 * @example toIntegerOrThrow('7') // => 7
 */
export function toIntegerOrThrow(value: unknown, options: ToIntegerOptions = {}): number {
  const n = toInteger(value, options);
  if (n === undefined) throw new ValidationError('HLP_CONVERT_INTEGER', 'Expected an integer.');
  return n;
}

/**
 * `toDate` or throw `ValidationError` (`HLP_CONVERT_DATE`).
 * @example toDateOrThrow('2026-01-01')
 */
export function toDateOrThrow(value: unknown): Date {
  const d = toDate(value);
  if (d === undefined) throw new ValidationError('HLP_CONVERT_DATE', 'Expected an ISO 8601 date.');
  return d;
}

/**
 * Strict integer parse for radix 2-36: optional sign, digits only (no whitespace, prefixes or
 * trailing text); `undefined` when invalid or outside the safe-integer range.
 * @example parseIntStrict('ff', 16) // => 255
 * @example parseIntStrict('12px') // => undefined
 */
export function parseIntStrict(text: string, radix = 10): number | undefined {
  if (!Number.isInteger(radix) || radix < 2 || radix > 36) throw new ValidationError('HLP_CONVERT_RADIX', 'The radix must be an integer from 2 to 36.');
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_NUMBER_TEXT) return undefined;
  const start = text.startsWith('-') || text.startsWith('+') ? 1 : 0;
  if (start === text.length) return undefined;
  for (let i = start; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const lower = c | 0x20;
    const digit = c >= 48 && c <= 57 ? c - 48 : lower >= 97 && lower <= 122 ? lower - 87 : 99;
    if (digit >= radix) return undefined;
  }
  const n = Number.parseInt(text, radix);
  return Number.isSafeInteger(n) ? n + 0 : undefined;
}

// ---------------------------------------------------------------------------
// Coercion table

/** Target types for `coerce`. */
export interface CoerceTypes {
  string: string;
  number: number;
  integer: number;
  'safe-integer': number;
  bigint: bigint;
  boolean: boolean;
  date: Date;
  array: unknown[];
}
export type CoerceKind = keyof CoerceTypes;

const coercers: { readonly [K in CoerceKind]: (v: unknown) => CoerceTypes[K] | undefined } = {
  string: (v) => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean' || v instanceof Date ? toStringSafe(v) : undefined),
  number: (v) => toNumber(v),
  integer: (v) => toInteger(v),
  'safe-integer': (v) => toSafeInteger(v),
  bigint: toBigInt,
  boolean: (v) => toBoolean(v),
  date: toDate,
  array: (v) => toArray(v),
};

/**
 * Converts `value` to the named kind with the strict `to*` rules; `undefined` on failure.
 * @example coerce('42', 'integer') // => 42
 */
export function coerce<K extends CoerceKind>(value: unknown, kind: K): CoerceTypes[K] | undefined {
  return coercers[kind](value);
}

/** Field spec for `coerceFields`: a kind, or a kind with `optional`. */
export type FieldSpec = CoerceKind | { readonly kind: CoerceKind; readonly optional?: boolean };
type SpecKind<S> = S extends CoerceKind ? S : S extends { readonly kind: infer K extends CoerceKind } ? K : never;
/** Result shape of `coerceFields`. */
export type Coerced<S extends Readonly<Record<string, FieldSpec>>> = { -readonly [P in keyof S]: S[P] extends { readonly optional: true } ? CoerceTypes[SpecKind<S[P]>] | undefined : CoerceTypes[SpecKind<S[P]>] };

/**
 * Coerces a record (e.g. form or query values) by a schema. Missing, `null` and blank values fail
 * as required unless `optional`. Errors come back as one `ValidationError` (`HLP_CONVERT_FIELDS`)
 * whose `fields` maps each bad key to a message.
 * @example
 * coerceFields({ age: '42', active: 'yes' }, { age: 'integer', active: 'boolean' });
 * // ok({ age: 42, active: true })
 */
export function coerceFields<S extends Readonly<Record<string, FieldSpec>>>(input: unknown, schema: S): Result<Coerced<S>, ValidationError> {
  const src = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  const fields: Record<string, string> = {};
  for (const [key, spec] of Object.entries(schema)) {
    assertSafeKey(key);
    const kind = typeof spec === 'string' ? spec : spec.kind;
    const optional = typeof spec === 'string' ? false : spec.optional === true;
    const raw = hasOwn(src, key) ? src[key] : undefined;
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      if (optional) out[key] = undefined;
      else fields[key] = 'Required.';
      continue;
    }
    const v = coercers[kind](raw);
    if (v === undefined) fields[key] = `Expected ${kind}.`;
    else out[key] = v;
  }
  if (Object.keys(fields).length) return err(new ValidationError('HLP_CONVERT_FIELDS', 'One or more fields are invalid.', { fields }));
  return ok(out as Coerced<S>);
}
