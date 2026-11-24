/** Internal object helpers (not exported from the module entry). */
import { ValidationError } from '../error/index.js';
import { isPlainObject } from '../is/index.js';

export type AnyRecord = Record<PropertyKey, unknown>;

/** Sentinel for "no own property". */
export const MISSING: unique symbol = Symbol('missing');

/**
 * Copies a key onto a fresh object without invoking the `__proto__` setter,
 * so copying an own `__proto__` data property can never change a prototype.
 */
export function put(target: object, key: PropertyKey, value: unknown): void {
  if (key === '__proto__') Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
  else (target as AnyRecord)[key] = value;
}

/** Own property value or `MISSING`; never reads through the prototype chain. */
export function ownValue(obj: unknown, key: PropertyKey): unknown {
  if ((typeof obj !== 'object' && typeof obj !== 'function') || obj === null) return MISSING;
  return Object.prototype.hasOwnProperty.call(obj, key) ? (obj as AnyRecord)[key] : MISSING;
}

/** Shallow copy of a plain object, keeping a null prototype. */
export function copyPlain(obj: Record<string, unknown>): Record<string, unknown> {
  if (Object.getPrototypeOf(obj) === null) return Object.assign(Object.create(null) as Record<string, unknown>, obj);
  return { ...obj };
}

/** Plain object or array. */
export function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || isPlainObject(value);
}

/** Shallow copy of a container. */
export function copyContainer(value: Record<string, unknown> | unknown[]): Record<string, unknown> | unknown[] {
  return Array.isArray(value) ? value.slice() : copyPlain(value);
}

export const circular = (): never => {
  throw new ValidationError('HLP_OBJECT_CIRCULAR', 'The value contains a circular reference.');
};

/** Own enumerable string and symbol keys. */
export function ownEnumerableKeys(obj: object): PropertyKey[] {
  const keys: PropertyKey[] = Object.keys(obj);
  for (const s of Object.getOwnPropertySymbols(obj)) if (Object.prototype.propertyIsEnumerable.call(obj, s)) keys.push(s);
  return keys;
}

/** Element at a known-valid index (keeps `noUncheckedIndexedAccess` honest without `!`). */
export function at<T>(items: readonly T[], index: number): T {
  if (index < 0 || index >= items.length) throw new ValidationError('HLP_OBJECT_INVALID_PATH', 'The property path is not valid.');
  return items[index] as T;
}
