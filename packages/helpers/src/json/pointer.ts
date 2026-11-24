/** JSON Pointer (RFC 6901). Reads follow own properties only; writes are immutable and reject unsafe keys. */
import { LimitError, ValidationError } from '../error/index.js';
import { assertSafeKey, hasOwn } from '../internal/keys.js';
import { type JsonContainer, copyJsonContainer, isJsonContainer } from './internal.js';

const MAX_POINTER_LENGTH = 100_000;
const INDEX = /^(?:0|[1-9]\d{0,14})$/;

const invalid = (): never => {
  throw new ValidationError('HLP_JSON_POINTER_INVALID', 'The JSON Pointer is not valid.');
};

export const notFound = (): never => {
  throw new ValidationError('HLP_JSON_POINTER_NOT_FOUND', 'The JSON Pointer does not resolve to a value.');
};

function unescapeToken(token: string): string {
  if (!token.includes('~')) return token;
  for (let i = 0; i < token.length; i++) {
    if (token[i] === '~' && token[i + 1] !== '0' && token[i + 1] !== '1') invalid();
  }
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Parses a JSON Pointer (or its URI fragment form, `#/...`) into reference tokens.
 * @example parsePointer('/a~1b/0') // => ['a/b', '0']
 */
export function parsePointer(pointer: string): string[] {
  if (typeof pointer !== 'string') invalid();
  if (pointer.length > MAX_POINTER_LENGTH) throw new LimitError('HLP_JSON_POINTER_TOO_LONG', 'The JSON Pointer is too long.');
  let p = pointer;
  if (p.startsWith('#')) {
    try {
      p = decodeURIComponent(p.slice(1));
    } catch {
      invalid();
    }
  }
  if (p === '') return [];
  if (!p.startsWith('/')) invalid();
  return p.slice(1).split('/').map(unescapeToken);
}

/**
 * Formats reference tokens as a JSON Pointer; `fragment: true` gives the URI fragment form.
 * @example formatPointer(['a/b', 0]) // => '/a~1b/0'
 */
export function formatPointer(tokens: readonly (string | number)[], options: { readonly fragment?: boolean } = {}): string {
  const escaped = tokens.map((t) => String(t).replace(/~/g, '~0').replace(/\//g, '~1'));
  if (options.fragment) return `#${escaped.map((t) => `/${encodeURIComponent(t)}`).join('')}`;
  return escaped.map((t) => `/${t}`).join('');
}

/** Array index for a token, `-` -> length when `allowEnd`, otherwise undefined. */
export function arrayIndex(arr: readonly unknown[], token: string, allowEnd: boolean): number | undefined {
  if (token === '-') return allowEnd ? arr.length : undefined;
  if (!INDEX.test(token)) return undefined;
  const i = Number(token);
  return i < arr.length || (allowEnd && i === arr.length) ? i : undefined;
}

const MISSING = Symbol('missing');

export function resolve(doc: unknown, tokens: readonly string[]): unknown {
  let cur = doc;
  for (const t of tokens) {
    if (Array.isArray(cur)) {
      const i = arrayIndex(cur, t, false);
      if (i === undefined) return MISSING;
      cur = cur[i];
    } else if (typeof cur === 'object' && cur !== null && hasOwn(cur, t)) cur = (cur as Record<string, unknown>)[t];
    else return MISSING;
  }
  return cur;
}

/** True when `resolve` found a value. */
export function found(value: unknown): boolean {
  return value !== MISSING;
}

/**
 * Value at the pointer, or `undefined` when it does not resolve.
 * @example getByPointer({ a: [1, 2] }, '/a/1') // => 2
 */
export function getByPointer(doc: unknown, pointer: string): unknown {
  const v = resolve(doc, parsePointer(pointer));
  return v === MISSING ? undefined : v;
}

/**
 * True when the pointer resolves (even to `null`).
 * @example hasPointer({ a: null }, '/a') // => true
 */
export function hasPointer(doc: unknown, pointer: string): boolean {
  return resolve(doc, parsePointer(pointer)) !== MISSING;
}

/** Copies containers along `tokens` (all but the last) and calls `edit` on the copied parent. */
export function editAt(doc: unknown, tokens: readonly string[], edit: (parent: JsonContainer, token: string) => void): unknown {
  for (const t of tokens) assertSafeKey(t);
  const step = (cur: unknown, i: number): JsonContainer => {
    if (!isJsonContainer(cur)) return notFound();
    const copy = copyJsonContainer(cur);
    const token = tokens[i] ?? '';
    if (i === tokens.length - 1) edit(copy, token);
    else {
      const next = resolve(cur, [token]);
      if (next === MISSING) notFound();
      (copy as Record<string, unknown>)[Array.isArray(copy) ? String(arrayIndex(copy, token, false)) : token] = step(next, i + 1);
    }
    return copy;
  };
  return step(doc, 0);
}

/**
 * Returns a copy with `value` set at the pointer. The parent must exist; on arrays the token
 * must be an existing index (replaced), the length, or `-` (appended).
 * @example setByPointer({ a: [1] }, '/a/-', 2) // => { a: [1, 2] }
 */
export function setByPointer(doc: unknown, pointer: string, value: unknown): unknown {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) return value;
  return editAt(doc, tokens, (parent, token) => {
    if (Array.isArray(parent)) {
      const i = arrayIndex(parent, token, true);
      if (i === undefined) notFound();
      else parent[i] = value;
    } else parent[token] = value;
  });
}

/**
 * Returns a copy without the value at the pointer (array elements are spliced out).
 * Throws `HLP_JSON_POINTER_NOT_FOUND` when it does not resolve.
 * @example removeByPointer({ a: 1, b: 2 }, '/a') // => { b: 2 }
 */
export function removeByPointer(doc: unknown, pointer: string): unknown {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) return invalid();
  return editAt(doc, tokens, (parent, token) => {
    if (Array.isArray(parent)) {
      const i = arrayIndex(parent, token, false);
      if (i === undefined) notFound();
      else parent.splice(i, 1);
    } else if (hasOwn(parent, token)) Reflect.deleteProperty(parent, token);
    else notFound();
  });
}
