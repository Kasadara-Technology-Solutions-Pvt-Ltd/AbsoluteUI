/** JSON serialization: tolerant (`safeJsonStringify`), canonical, pretty, and size helpers. */
import { LimitError, ValidationError } from '../error/index.js';
import { utf8Length } from './internal.js';

export interface SafeJsonStringifyOptions {
  /** `'placeholder'` (default) writes `circularPlaceholder`; `'error'` throws `HLP_JSON_CIRCULAR`. */
  readonly circular?: 'placeholder' | 'error';
  /** Default `'[Circular]'`. */
  readonly circularPlaceholder?: string;
  /** `'string'` (default) writes BigInts as decimal strings; `'error'` throws `HLP_JSON_BIGINT`. */
  readonly bigint?: 'string' | 'error';
  /** `'entries'` (default) writes maps as `[[key, value], ...]`; `'object'` as an object with stringified keys. */
  readonly map?: 'entries' | 'object';
  /** `'iso'` (default, `null` for invalid dates) or `'epoch'` milliseconds. */
  readonly date?: 'iso' | 'epoch';
  /** `'object'` (default) writes `{ name, message, code? }`; `'message'` writes the message string. */
  readonly error?: 'object' | 'message';
  /** Indentation, as for `JSON.stringify`. */
  readonly indent?: number | string;
  /** Maximum output length in UTF-16 code units; longer output throws `HLP_JSON_TOO_LONG`. */
  readonly maxLength?: number;
}

function define(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
  else target[key] = value;
}

function hasToJson(v: object): v is { toJSON: (key: string) => unknown } {
  return typeof (v as { toJSON?: unknown }).toJSON === 'function';
}

/**
 * `JSON.stringify` that never throws on cycles or BigInt (by default) and serializes Map, Set,
 * Error and typed arrays. Shared (non-circular) references are written normally.
 * Returns `undefined` for values JSON cannot represent at the top level (`undefined`, functions, symbols).
 * @example safeJsonStringify({ n: 1n, s: new Set([1]) }) // => '{"n":"1","s":[1]}'
 */
export function safeJsonStringify(value: unknown, options: SafeJsonStringifyOptions = {}): string | undefined {
  const { circular = 'placeholder', circularPlaceholder = '[Circular]', bigint = 'string', map = 'entries', date = 'iso', error = 'object', indent, maxLength } = options;
  const stack = new Set<object>();
  const conv = (input: unknown, key: string): unknown => {
    let v = input;
    if (typeof v === 'bigint') {
      if (bigint === 'error') throw new ValidationError('HLP_JSON_BIGINT', 'BigInt values cannot be serialized.');
      return v.toString();
    }
    if (typeof v !== 'object' || v === null) return v;
    if (v instanceof Date) {
      const t = v.getTime();
      if (date === 'epoch') return Number.isNaN(t) ? null : t;
      return Number.isNaN(t) ? null : v.toISOString();
    }
    if (v instanceof Number || v instanceof String || v instanceof Boolean) return v.valueOf();
    if (hasToJson(v)) {
      v = v.toJSON(key);
      if (typeof v !== 'object' || v === null) return conv(v, key);
    }
    const o = v;
    if (stack.has(o)) {
      if (circular === 'error') throw new ValidationError('HLP_JSON_CIRCULAR', 'The value contains a circular reference.');
      return circularPlaceholder;
    }
    stack.add(o);
    let out: unknown;
    if (o instanceof Map) {
      if (map === 'object') {
        const rec: Record<string, unknown> = {};
        for (const [k, x] of o as Map<unknown, unknown>) {
          const ck = conv(k, '');
          const ks = typeof ck === 'string' ? ck : ((JSON.stringify(ck) as string | undefined) ?? '');
          define(rec, ks, conv(x, ks));
        }
        out = rec;
      } else out = [...(o as Map<unknown, unknown>)].map(([k, x], i) => [conv(k, String(i)), conv(x, String(i))]);
    } else if (o instanceof Set) out = [...(o as Set<unknown>)].map((x, i) => conv(x, String(i)));
    else if (o instanceof Error) {
      if (error === 'message') out = o.message;
      else {
        const code = (o as { code?: unknown }).code;
        out = { name: o.name, message: o.message, ...(typeof code === 'string' ? { code } : {}) };
      }
    } else if (Array.isArray(o)) out = o.map((x: unknown, i) => conv(x, String(i)));
    else if (ArrayBuffer.isView(o) && !(o instanceof DataView)) out = Array.from(o as unknown as ArrayLike<unknown>, (x, i) => conv(x, String(i)));
    else {
      const rec: Record<string, unknown> = {};
      for (const k of Object.keys(o)) define(rec, k, conv((o as Record<string, unknown>)[k], k));
      out = rec;
    }
    stack.delete(o);
    return out;
  };
  const text = JSON.stringify(conv(value, ''), null, indent) as string | undefined;
  if (text !== undefined && maxLength !== undefined && text.length > maxLength) throw new LimitError('HLP_JSON_TOO_LONG', 'JSON output exceeds the maximum length.', { details: { maxLength } });
  return text;
}

const notSerializable = (): never => {
  throw new ValidationError('HLP_JSON_NOT_SERIALIZABLE', 'The value cannot be represented as canonical JSON.');
};

/**
 * Canonical JSON (RFC 8785-like): keys sorted by UTF-16 code units, no whitespace, numbers in
 * ECMAScript form. `undefined`/function/symbol properties are omitted (array slots become `null`).
 * Throws for non-finite numbers, BigInt, cycles and a top-level `undefined`.
 * @example canonicalJson({ b: 1, a: [true, 1e21] }) // => '{"a":[true,1e+21],"b":1}'
 */
export function canonicalJson(value: unknown): string {
  const stack = new Set<object>();
  const walk = (input: unknown, key: string): string | undefined => {
    let v = input;
    if (typeof v === 'object' && v !== null && hasToJson(v)) v = v.toJSON(key);
    if (v instanceof Number || v instanceof String || v instanceof Boolean) v = v.valueOf();
    switch (typeof v) {
      case 'string':
        return JSON.stringify(v);
      case 'boolean':
        return v ? 'true' : 'false';
      case 'number':
        return Number.isFinite(v) ? JSON.stringify(v) : notSerializable();
      case 'bigint':
        return notSerializable();
      case 'undefined':
      case 'function':
      case 'symbol':
        return undefined;
      default:
        break;
    }
    if (v === null) return 'null';
    const o = v as object;
    if (stack.has(o)) throw new ValidationError('HLP_JSON_CIRCULAR', 'The value contains a circular reference.');
    stack.add(o);
    let out: string;
    if (Array.isArray(o)) out = `[${o.map((x: unknown, i) => walk(x, String(i)) ?? 'null').join(',')}]`;
    else {
      const parts: string[] = [];
      for (const k of Object.keys(o).sort()) {
        const s = walk((o as Record<string, unknown>)[k], k);
        if (s !== undefined) parts.push(`${JSON.stringify(k)}:${s}`);
      }
      out = `{${parts.join(',')}}`;
    }
    stack.delete(o);
    return out;
  };
  return walk(value, '') ?? notSerializable();
}

/**
 * Indented JSON via `safeJsonStringify` (empty string for unrepresentable values).
 * @example prettyJson({ a: 1 }) // => '{\n  "a": 1\n}'
 */
export function prettyJson(value: unknown, indent: number | string = 2): string {
  return safeJsonStringify(value, { indent }) ?? '';
}

/**
 * UTF-8 byte size of the value's JSON (via `safeJsonStringify`); 0 when unrepresentable.
 * @example jsonByteSize({ s: 'é' }) // => 10
 */
export function jsonByteSize(value: unknown, options: SafeJsonStringifyOptions = {}): number {
  const text = safeJsonStringify(value, options);
  return text === undefined ? 0 : utf8Length(text);
}
