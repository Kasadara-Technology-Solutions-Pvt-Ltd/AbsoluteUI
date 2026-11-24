/** Safe JSON parsing with limits and prototype-pollution protection. */
import { HelperError, LimitError, type Result, ValidationError, err, ok } from '../error/index.js';
import { isUnsafeKey } from '../internal/keys.js';
import { parseIsoDateTimeWithZone } from './internal.js';

/** Reviver called bottom-up like `JSON.parse`'s; returning `undefined` removes an object property. */
export type JsonReviver = (key: string, value: unknown, holder: Readonly<Record<string, unknown>> | readonly unknown[]) => unknown;

export interface SafeJsonParseOptions {
  /** Maximum text length in UTF-16 code units. Default 10,000,000. */
  readonly maxLength?: number;
  /** Maximum nesting of arrays/objects. Default 256. */
  readonly maxDepth?: number;
  /** Maximum keys in any one object. Default 10,000. */
  readonly maxKeys?: number;
  /** `'error'` (default) fails on `__proto__`/`constructor`/`prototype` keys; `'strip'` removes them. */
  readonly unsafeKeys?: 'error' | 'strip';
  /** Revive ISO 8601 date-time strings that carry `Z` or an offset into `Date`s. Default false. */
  readonly dates?: boolean;
  /** Custom revivers, applied in order after the date reviver. */
  readonly reviver?: JsonReviver | readonly JsonReviver[];
}

export interface SafeJsonParseGuardOptions<T> extends SafeJsonParseOptions {
  /** Shape check; failing values produce `HLP_JSON_SHAPE`. */
  readonly validate: (value: unknown) => value is T;
}

const DEFAULT_MAX_LENGTH = 10_000_000;

/** Linear pre-scan: false when nesting exceeds `maxDepth`. Ignores brackets inside strings. */
function depthWithin(text: string, maxDepth: number): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 92) i++;
      else if (c === 34) inString = false;
    } else if (c === 34) inString = true;
    else if (c === 123 || c === 91) {
      if (++depth > maxDepth) return false;
    } else if (c === 125 || c === 93) depth--;
  }
  return true;
}

function composeRevivers(options: SafeJsonParseOptions): JsonReviver | undefined {
  const list: JsonReviver[] = [];
  if (options.dates) {
    list.push((_, v) => {
      if (typeof v !== 'string') return v;
      const ms = parseIsoDateTimeWithZone(v);
      return ms === undefined ? v : new Date(ms);
    });
  }
  const { reviver } = options;
  if (typeof reviver === 'function') list.push(reviver);
  else if (reviver) list.push(...reviver);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  return (key, value, holder) => {
    let v = value;
    for (const r of list) {
      v = r(key, v, holder);
      if (v === undefined) return undefined;
    }
    return v;
  };
}

function parseCore(text: unknown, options: SafeJsonParseOptions): unknown {
  const { maxLength = DEFAULT_MAX_LENGTH, maxDepth = 256, maxKeys = 10_000, unsafeKeys = 'error' } = options;
  if (typeof text !== 'string') throw new ValidationError('HLP_JSON_INVALID_INPUT', 'JSON input must be a string.');
  if (text.length > maxLength) throw new LimitError('HLP_JSON_TOO_LONG', 'JSON text exceeds the maximum length.', { details: { maxLength } });
  if (!depthWithin(text, maxDepth)) throw new LimitError('HLP_JSON_TOO_DEEP', 'JSON nesting exceeds the maximum depth.', { details: { maxDepth } });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // The platform message quotes the input, so it is deliberately not kept as the cause.
    throw new ValidationError('HLP_JSON_SYNTAX', 'The text is not valid JSON.');
  }
  const revive = composeRevivers(options);
  const walk = (holder: Record<string, unknown> | unknown[], key: string, value: unknown): unknown => {
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) value[i] = walk(value, String(i), value[i]);
      } else {
        const obj = value as Record<string, unknown>;
        const keys = Object.keys(obj);
        if (keys.length > maxKeys) throw new LimitError('HLP_JSON_TOO_MANY_KEYS', 'A JSON object has too many keys.', { details: { maxKeys } });
        for (const k of keys) {
          if (isUnsafeKey(k)) {
            if (unsafeKeys === 'error') throw new ValidationError('HLP_JSON_UNSAFE_KEY', 'JSON contains an unsafe object key.');
            Reflect.deleteProperty(obj, k);
            continue;
          }
          const r = walk(obj, k, obj[k]);
          if (r === undefined) Reflect.deleteProperty(obj, k);
          else obj[k] = r;
        }
      }
    }
    if (!revive) return value;
    try {
      return revive(key, value, holder);
    } catch (e) {
      if (e instanceof HelperError) throw e;
      throw new HelperError('HLP_JSON_REVIVER', 'A JSON reviver failed.', { cause: e, kind: 'validation' });
    }
  };
  return walk({ '': parsed }, '', parsed);
}

function toHelperError(e: unknown): HelperError {
  return e instanceof HelperError ? e : new HelperError('HLP_JSON_PARSE', 'JSON parsing failed.', { cause: e });
}

/**
 * Parses JSON without throwing. Enforces length, depth and key-count limits (`LimitError`),
 * rejects or strips prototype-pollution keys, and never echoes input in error messages.
 * @example
 * safeJsonParse('{"a":1}'); // => { ok: true, value: { a: 1 } }
 * const r = safeJsonParse('{"a":');
 * r.ok ? undefined : r.error.code; // => 'HLP_JSON_SYNTAX'
 */
export function safeJsonParse<T>(text: unknown, options: SafeJsonParseGuardOptions<T>): Result<T, HelperError>;
export function safeJsonParse(text: unknown, options?: SafeJsonParseOptions): Result<unknown, HelperError>;
export function safeJsonParse(text: unknown, options: SafeJsonParseOptions & { readonly validate?: (value: unknown) => boolean } = {}): Result<unknown, HelperError> {
  try {
    const value = parseCore(text, options);
    if (options.validate && !options.validate(value)) return err(new ValidationError('HLP_JSON_SHAPE', 'JSON does not have the expected shape.'));
    return ok(value);
  } catch (e) {
    return err(toHelperError(e));
  }
}

/**
 * Like `safeJsonParse` but throws the `HelperError`.
 * @example
 * const cfg = parseJsonOrThrow('{"retries":3}', { maxDepth: 32 }); // => { retries: 3 }
 * parseJsonOrThrow('{"retries":'); // => throws HLP_JSON_SYNTAX
 */
export function parseJsonOrThrow<T>(text: unknown, options: SafeJsonParseGuardOptions<T>): T;
export function parseJsonOrThrow(text: unknown, options?: SafeJsonParseOptions): unknown;
export function parseJsonOrThrow(text: unknown, options: SafeJsonParseOptions = {}): unknown {
  const r = safeJsonParse(text, options);
  if (!r.ok) throw r.error;
  return r.value;
}

/**
 * True when `text` parses within the limits.
 * @example isValidJson('[1,2]') // => true
 */
export function isValidJson(text: unknown, options: SafeJsonParseOptions = {}): boolean {
  return safeJsonParse(text, options).ok;
}
