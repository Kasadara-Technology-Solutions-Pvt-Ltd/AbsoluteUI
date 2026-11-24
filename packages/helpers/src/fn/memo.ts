import { ValidationError } from '../error/index.js';

export interface MemoizeOptions<A extends unknown[]> {
  /** Cache key from the arguments. Default: the first argument (compared with SameValueZero). */
  readonly key?: (...args: A) => unknown;
  /** Maximum cached results; least recently used are evicted. Default 1000. */
  readonly maxSize?: number;
  /** Time to live per result in ms. Default: no expiry. */
  readonly ttlMs?: number;
  /** Clock in ms, injectable for tests. Default `Date.now`. */
  readonly now?: () => number;
}

/** A memoized function with cache controls. */
export interface Memoized<A extends unknown[], R> {
  (...args: A): R;
  /** Drops every cached result. */
  clear(): void;
  /** Drops the result cached for these arguments. */
  delete(...args: A): boolean;
  /** Number of cached results. */
  readonly size: number;
}

/**
 * Caches results of `fn` in a bounded LRU map (default 1000 entries), optionally with a TTL.
 * Throws are not cached; returned promises are (including ones that later reject - clear on failure if needed).
 * @example
 * const fib = memoize((n: number): number => (n < 2 ? n : fib(n - 1) + fib(n - 2)));
 * fib(50); // => 12586269025
 * let loads = 0;
 * const label = memoize((id: string, lang: string) => { loads++; return `${id}:${lang}`; }, { key: (id, lang) => `${id}|${lang}`, ttlMs: 60_000 });
 * label('EMP-1', 'de');
 * label('EMP-1', 'de'); // => 'EMP-1:de'
 * loads; // => 1
 */
export function memoize<A extends unknown[], R>(fn: (...args: A) => R, options: MemoizeOptions<A> = {}): Memoized<A, R> {
  const maxSize = options.maxSize ?? 1000;
  if (!Number.isSafeInteger(maxSize) || maxSize < 1) throw new ValidationError('HLP_FN_INVALID_SIZE', 'maxSize must be a positive integer.');
  const ttl = options.ttlMs;
  if (ttl !== undefined && (!Number.isFinite(ttl) || ttl <= 0)) throw new ValidationError('HLP_FN_INVALID_TTL', 'ttlMs must be a finite number greater than zero.');
  const keyOf = options.key ?? ((...args: A): unknown => args[0]);
  const now = options.now ?? Date.now;
  const cache = new Map<unknown, { value: R; expires: number }>();

  const memoized = (...args: A): R => {
    const key = keyOf(...args);
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      if (hit.expires > now()) {
        cache.set(key, hit);
        return hit.value;
      }
    }
    const value = fn(...args);
    cache.set(key, { value, expires: ttl === undefined ? Infinity : now() + ttl });
    if (cache.size > maxSize) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    return value;
  };
  memoized.clear = (): void => {
    cache.clear();
  };
  memoized.delete = (...args: A): boolean => cache.delete(keyOf(...args));
  Object.defineProperty(memoized, 'size', { get: () => cache.size, enumerable: true });
  return memoized as Memoized<A, R>;
}

/**
 * Remembers only the latest call: returns the cached result while the arguments are equal
 * (same length, each `Object.is`, or a custom `isEqual`).
 * @example
 * interface Row { name: string }
 * let runs = 0;
 * const visible = memoizeOne((rows: Row[], filter: string) => { runs++; return rows.filter((r) => r.name.includes(filter)); });
 * const rows: Row[] = [{ name: 'Ada' }, { name: 'Grace' }];
 * visible(rows, 'Ad'); // => [{ name: 'Ada' }]
 * visible(rows, 'Ad'); // same arguments: cached
 * runs; // => 1
 */
export function memoizeOne<A extends unknown[], R>(fn: (...args: A) => R, isEqual: (next: A, prev: A) => boolean = shallowEqualArgs): (...args: A) => R {
  let last: { args: A; value: R } | undefined;
  return (...args: A): R => {
    if (last && isEqual(args, last.args)) return last.value;
    const value = fn(...args);
    last = { args, value };
    return value;
  };
}

function shallowEqualArgs(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}
