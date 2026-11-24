/**
 * Shared internals for `ds`: default ordering, validation, and error helpers. Not a public entry.
 */
import { HelperError, ValidationError } from '../error/index.js';

/** Three-way comparer: negative when `a` sorts before `b`, zero when equal, positive otherwise. */
export type Comparer<T> = (a: T, b: T) => number;

/**
 * Natural ordering for numbers, strings (code-unit order), bigints, booleans, and `Date`s.
 * `NaN` sorts after every other number. Mixed or unsupported types throw `HLP_DS_NOT_COMPARABLE`.
 * @example
 * [3, 1, 2].sort(naturalCompare); // => [1, 2, 3]
 */
export function naturalCompare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a < b) return -1;
    if (a > b) return 1;
    if (a === b) return 0;
    return Number.isNaN(a) ? (Number.isNaN(b) ? 0 : 1) : -1;
  }
  if ((typeof a === 'string' && typeof b === 'string') || (typeof a === 'bigint' && typeof b === 'bigint') || (typeof a === 'boolean' && typeof b === 'boolean')) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (a instanceof Date && b instanceof Date) return naturalCompare(a.getTime(), b.getTime());
  throw new ValidationError('HLP_DS_NOT_COMPARABLE', 'Values are not comparable without a custom comparer.');
}

/** Throws `HLP_DS_INVALID_CAPACITY` unless `n` is a positive safe integer (or zero when allowed). */
export function assertCapacity(n: number, allowZero = false): void {
  if (!Number.isSafeInteger(n) || n < (allowZero ? 0 : 1)) throw new ValidationError('HLP_DS_INVALID_CAPACITY', 'Capacity must be a positive integer.');
}

/** Throws `HLP_DS_INVALID_TTL` unless `ms` is a finite number greater than zero. */
export function assertTtl(ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0) throw new ValidationError('HLP_DS_INVALID_TTL', 'TTL must be a finite number of milliseconds greater than zero.');
}

/** Error thrown when a structure is modified while one of its iterators is active. */
export function concurrentModification(): HelperError {
  return new HelperError('HLP_DS_CONCURRENT_MODIFICATION', 'The collection was modified during iteration.', { kind: 'conflict' });
}
