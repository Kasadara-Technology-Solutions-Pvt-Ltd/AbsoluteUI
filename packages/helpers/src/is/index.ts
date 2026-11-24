/**
 * Type guards and assertion functions (docs/PLAN-HELPERS.md section 2).
 */
import { ValidationError } from '../error/index.js';

/** `null` or `undefined`. @example isNil(undefined) // => true */
export function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Neither `null` nor `undefined`. Useful as a filter: `arr.filter(isDefined)`.
 * @example
 * [1, null, 2, undefined].filter(isDefined); // => [1, 2]
 */
export function isDefined<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

/**
 * @example
 * isString('EMP-001'); // => true
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Any `number`, including `NaN` and `Infinity`. Prefer `isFiniteNumber`.
 * @example
 * isNumber(NaN); // => true
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

/** A number that is not `NaN` or `±Infinity`. @example isFiniteNumber(NaN) // => false */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * @example
 * isInteger(40.5); // => false
 */
export function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}

/**
 * Integer within `Number.MIN_SAFE_INTEGER..MAX_SAFE_INTEGER`.
 * @example
 * isSafeInteger(2 ** 53); // => false
 */
export function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

/**
 * @example
 * isBigInt(10n); // => true
 */
export function isBigInt(value: unknown): value is bigint {
  return typeof value === 'bigint';
}

/**
 * @example
 * isBoolean('true'); // => false
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * @example
 * isSymbol(Symbol.iterator); // => true
 */
export function isSymbol(value: unknown): value is symbol {
  return typeof value === 'symbol';
}

/**
 * @example
 * isFunction(() => 1); // => true
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- the guard's purpose is the generic Function type
export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

/**
 * Any non-null object, including arrays.
 * @example
 * isObject([]); // => true
 */
export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/**
 * Object literal or `Object.create(null)`; not arrays, dates, maps, class instances.
 * @example
 * isPlainObject({ id: 1 }); // => true
 * isPlainObject(new Date()); // => false
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * @example
 * isArray('abc'); // => false
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Non-empty array with a narrowed tuple type.
 * @example
 * const ids: number[] = [7, 9];
 * if (isNonEmptyArray(ids)) ids[0].toFixed(); // first element typed as number
 * isNonEmptyArray([]); // => false
 */
export function isNonEmptyArray<T>(value: readonly T[] | null | undefined): value is readonly [T, ...T[]] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Any valid `Date` (not `Invalid Date`).
 * @example
 * isValidDate(new Date('2026-13-45')); // => false
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * @example
 * isDate(new Date(NaN)); // => true
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

/**
 * @example
 * isRegExp(/^EMP-/); // => true
 */
export function isRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp;
}

/**
 * @example
 * isMap(new Map()); // => true
 */
export function isMap(value: unknown): value is Map<unknown, unknown> {
  return value instanceof Map;
}

/**
 * @example
 * isSet(new Set([1])); // => true
 */
export function isSet(value: unknown): value is Set<unknown> {
  return value instanceof Set;
}

/**
 * @example
 * isError(new TypeError('Bad input.')); // => true
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Has a callable `then`.
 * @example
 * isPromiseLike(Promise.resolve(1)); // => true
 * isPromiseLike({ then: 1 }); // => false
 */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === 'object' || typeof value === 'function') && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

/**
 * Implements `Symbol.iterator` (strings included).
 * @example
 * isIterable('abc'); // => true
 * isIterable({}); // => false
 */
export function isIterable(value: unknown): value is Iterable<unknown> {
  return value !== null && value !== undefined && typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function';
}

/**
 * @example
 * async function* rows() { yield 1; }
 * isAsyncIterable(rows()); // => true
 */
export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return value !== null && value !== undefined && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function';
}

/**
 * `ArrayBuffer`, typed array, or `DataView`.
 * @example
 * isBinary(new Uint8Array(4)); // => true
 */
export function isBinary(value: unknown): value is ArrayBuffer | ArrayBufferView {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

/**
 * `string | number | boolean | bigint | symbol | null | undefined`.
 * @example
 * isPrimitive(null); // => true
 * isPrimitive({}); // => false
 */
export function isPrimitive(value: unknown): value is string | number | boolean | bigint | symbol | null | undefined {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

/**
 * Empty check: `null`/`undefined`, `''`, `[]`, empty `Map`/`Set`, `{}` with no own keys.
 * Numbers and booleans are never empty.
 * @example isEmpty({}) // => true
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' || Array.isArray(value)) return value.length === 0;
  if (value instanceof Map || value instanceof Set) return value.size === 0;
  if (ArrayBuffer.isView(value)) return value.byteLength === 0;
  if (value instanceof ArrayBuffer) return value.byteLength === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

/**
 * `null`, `undefined`, or a string with only whitespace.
 * @example
 * isBlank('   '); // => true
 * isBlank(0); // => false
 */
export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim().length === 0);
}

/**
 * Value is one of `options` (uses `SameValueZero`).
 * @example
 * const status: unknown = 'active';
 * isOneOf(status, ['active', 'on-leave'] as const); // => true
 */
export function isOneOf<const T extends readonly unknown[]>(value: unknown, options: T): value is T[number] {
  return options.includes(value);
}

/**
 * Key exists as an own property; narrows the object type.
 * @example
 * const payload: unknown = JSON.parse('{"id":42}');
 * hasKey(payload, 'id'); // => true
 */
export function hasKey<K extends PropertyKey>(value: unknown, key: K): value is Record<K, unknown> {
  return typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Running in a browser main thread or worker with `document` or `self`.
 * @example
 * isBrowserLike(); // true in a browser or worker, false in Node without a DOM
 */
export function isBrowserLike(): boolean {
  return typeof globalThis.document !== 'undefined' || (typeof globalThis.self !== 'undefined' && typeof (globalThis as { importScripts?: unknown }).importScripts === 'function');
}

// ---------------------------------------------------------------------------
// Assertions

function fail(expected: string, name?: string): never {
  throw new ValidationError('HLP_TYPE_ASSERTION', `Expected ${expected}.`, name === undefined ? {} : { details: { name } });
}

/**
 * @example
 * const input: unknown = 'ada@example.com';
 * assertString(input, 'input');
 * input.toUpperCase(); // => 'ADA@EXAMPLE.COM'
 * assertString(42, 'email'); // => throws HLP_TYPE_ASSERTION
 */
export function assertString(value: unknown, name?: string): asserts value is string {
  if (typeof value !== 'string') fail('a string', name);
}

/**
 * @example
 * assertFiniteNumber(Infinity, 'salary'); // => throws HLP_TYPE_ASSERTION
 */
export function assertFiniteNumber(value: unknown, name?: string): asserts value is number {
  if (!isFiniteNumber(value)) fail('a finite number', name);
}

/**
 * @example
 * assertInteger(2.5, 'leaveDays'); // => throws HLP_TYPE_ASSERTION
 */
export function assertInteger(value: unknown, name?: string): asserts value is number {
  if (!Number.isInteger(value)) fail('an integer', name);
}

/**
 * @example
 * assertBoolean('yes', 'active'); // => throws HLP_TYPE_ASSERTION
 */
export function assertBoolean(value: unknown, name?: string): asserts value is boolean {
  if (typeof value !== 'boolean') fail('a boolean', name);
}

/**
 * @example
 * assertPlainObject([], 'filters'); // => throws HLP_TYPE_ASSERTION
 */
export function assertPlainObject(value: unknown, name?: string): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) fail('a plain object', name);
}

/**
 * @example
 * assertArray({ length: 0 }, 'rows'); // => throws HLP_TYPE_ASSERTION
 */
export function assertArray(value: unknown, name?: string): asserts value is unknown[] {
  if (!Array.isArray(value)) fail('an array', name);
}

/**
 * @example
 * const manager: string | undefined = undefined;
 * assertDefined(manager, 'manager'); // => throws HLP_TYPE_ASSERTION
 */
export function assertDefined<T>(value: T, name?: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) fail('a defined value', name);
}

/**
 * @example
 * assertValidDate(new Date('not a date'), 'hireDate'); // => throws HLP_TYPE_ASSERTION
 */
export function assertValidDate(value: unknown, name?: string): asserts value is Date {
  if (!isValidDate(value)) fail('a valid Date', name);
}
