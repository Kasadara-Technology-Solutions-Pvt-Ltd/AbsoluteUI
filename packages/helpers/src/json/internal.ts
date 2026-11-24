/** Internal JSON helpers (not exported from the module entry). */
import { isPlainObject } from '../is/index.js';
import { hasOwn } from '../internal/keys.js';
import { daysInMonth } from '../date/plain-date.js';

export type JsonContainer = Record<string, unknown> | unknown[];

export function isJsonContainer(value: unknown): value is JsonContainer {
  return Array.isArray(value) || isPlainObject(value);
}

/** Shallow copy of a container, keeping a null prototype. */
export function copyJsonContainer(value: JsonContainer): JsonContainer {
  if (Array.isArray(value)) return value.slice();
  if (Object.getPrototypeOf(value) === null) return Object.assign(Object.create(null) as Record<string, unknown>, value);
  return { ...value };
}

/** Deep copy of the plain-object/array structure (leaves shared). Assumes acyclic JSON data. */
export function cloneJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (isPlainObject(value)) {
    const out = copyJsonContainer(value) as Record<string, unknown>;
    for (const k of Object.keys(out)) out[k] = cloneJson(out[k]);
    return out;
  }
  return value;
}

/** JSON data equality: key-order independent, numbers by value (`0 === -0`). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!jsonEqual(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    for (const k of ka) if (!hasOwn(b, k) || !jsonEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

// Date-time with a mandatory zone designator; bounded length before matching.
const ISO_DATE_TIME = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/;

/** Epoch ms for a strict ISO 8601 date-time string with `Z` or an offset; otherwise undefined. */
export function parseIsoDateTimeWithZone(text: string): number | undefined {
  if (text.length < 17 || text.length > 40) return undefined;
  const m = ISO_DATE_TIME.exec(text);
  if (!m) return undefined;
  const [, ys = '', mos = '', ds = '', hs = '', mis = '', ss = '0', frac = '', zone = 'Z'] = m;
  if (ys === '-000000') return undefined;
  const y = Number(ys);
  const mo = Number(mos);
  const d = Number(ds);
  const h = Number(hs);
  const mi = Number(mis);
  const s = Number(ss);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || s > 59) return undefined;
  let offset = 0;
  if (zone !== 'Z') {
    const oh = Number(zone.slice(1, 3));
    const om = Number(zone.slice(4, 6));
    if (oh > 23 || om > 59) return undefined;
    offset = (zone.startsWith('-') ? -1 : 1) * (oh * 60 + om);
  }
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  dt.setUTCHours(h, mi - offset, s, Math.floor(Number(`0.${frac || '0'}`) * 1000));
  const ms = dt.getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

/** UTF-8 byte length of a string without allocating (lone surrogates count as U+FFFD, 3 bytes). */
export function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        n += 4;
        i++;
      } else n += 3;
    } else n += 3;
  }
  return n;
}
