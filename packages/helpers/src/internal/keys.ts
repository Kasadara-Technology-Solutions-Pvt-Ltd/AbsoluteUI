/**
 * Prototype-pollution guard shared by every path, merge, parse, and query helper
 * (docs/PLAN-HELPERS.md section 5). Internal: not a public subpath.
 */
import { ValidationError } from '../error/index.js';

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

/** True for keys that must never be written through a dynamic path. */
export function isUnsafeKey(key: PropertyKey): boolean {
  return typeof key === 'string' && UNSAFE.has(key);
}

/** Throws `HLP_UNSAFE_KEY` for `__proto__`, `constructor`, and `prototype`. */
export function assertSafeKey(key: PropertyKey): void {
  if (isUnsafeKey(key)) throw new ValidationError('HLP_UNSAFE_KEY', 'Refusing to use an unsafe object key.');
}

/** Own enumerable property check that works for null-prototype objects. */
export function hasOwn(obj: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
