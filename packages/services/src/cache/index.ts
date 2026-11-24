/**
 * Async cache with single-flight loading, TTL, stale-while-revalidate, LRU bounds and abort support
 * (docs/PLAN-HELPERS.md section 3).
 */
import { HelperError, ValidationError, toError } from '@absoluteui/helpers/error';
import { abortReason, raceSignal } from '@absoluteui/helpers/async';
import { LRUCache } from '@absoluteui/helpers/ds';

/** Options for {@link createAsyncCache}. */
export interface AsyncCacheOptions<K, V> {
  /** Loads a value. `signal` aborts when every caller waiting for this load has aborted (or it is invalidated with no callers). */
  readonly load: (key: K, signal: AbortSignal) => Promise<V> | V;
  /** Fresh lifetime in ms. Default `Infinity` (until evicted or invalidated). */
  readonly ttlMs?: number;
  /** After `ttlMs`, serve the stale value for this long while reloading in the background. Default 0. */
  readonly staleWhileRevalidateMs?: number;
  /** LRU capacity. Default 500. */
  readonly maxSize?: number;
  /** Maps keys to a primitive cache key (for object keys). Default identity. */
  readonly keyFn?: (key: K) => unknown;
  /** Cache failures for this long (negative caching). Default 0: errors are never cached. */
  readonly errorTtlMs?: number;
  /** Receives background revalidation failures (the stale value stays until it expires). */
  readonly onError?: (error: Error, key: K) => void;
  /** Clock in ms, injectable for tests. Default `Date.now`. */
  readonly now?: () => number;
}

/** Counters from {@link AsyncCache.stats}. */
export interface AsyncCacheStats {
  /** Fresh values served. */
  readonly hits: number;
  /** Calls that had to wait for a load (including joins of an in-flight load). */
  readonly misses: number;
  /** Stale values served during revalidation. */
  readonly stale: number;
  /** Loads started. */
  readonly loads: number;
  /** Loads that failed. */
  readonly errors: number;
  /** Entries currently stored. */
  readonly size: number;
}

/** Per-call options for {@link AsyncCache.get}. */
export interface AsyncCacheGetOptions {
  /** Stops waiting (rejects with `AbortError`); the shared load continues while other callers wait. */
  readonly signal?: AbortSignal;
  /** Ignore cached values and load (still single-flight). */
  readonly force?: boolean;
}

/** Cache returned by {@link createAsyncCache}. */
export interface AsyncCache<K, V> {
  get(key: K, options?: AsyncCacheGetOptions): Promise<V>;
  /** Cached value (fresh or stale) without loading or touching stats. */
  peek(key: K): V | undefined;
  /** True when a fresh or stale value is cached. */
  has(key: K): boolean;
  /** Stores `value` as fresh. */
  prime(key: K, value: V): void;
  /** Drops the entry; an in-flight load for `key` still settles its current callers but its result is not stored. */
  invalidate(key: K): void;
  /** Drops every entry matching `predicate` (by original key). */
  invalidateWhere(predicate: (key: K) => boolean): number;
  clear(): void;
  stats(): AsyncCacheStats;
}

interface Entry<K, V> {
  readonly key: K;
  readonly ok: boolean;
  readonly value: V | undefined;
  readonly error: Error | undefined;
  readonly freshUntil: number;
  readonly staleUntil: number;
}

interface Flight<V> {
  readonly token: object;
  readonly promise: Promise<V>;
  readonly controller: AbortController;
  waiters: number;
}

function assertMs(v: number, name: string): void {
  if (!(v >= 0) || Number.isNaN(v)) throw new ValidationError('SVC_CACHE_INVALID_OPTION', 'Cache durations must be non-negative numbers.', { details: { name } });
}

/**
 * Creates an async cache. Concurrent `get`s for one key share one load (single-flight); stale values are
 * served while a background reload runs; errors are not cached unless `errorTtlMs` is set.
 * @example
 * let calls = 0;
 * const users = createAsyncCache({
 *   load: async (id: number) => { calls++; return { id, name: 'Ada' }; },
 *   ttlMs: 60_000,
 *   staleWhileRevalidateMs: 300_000,
 * });
 * await users.get(42); // => { id: 42, name: 'Ada' }
 * await users.get(42); // => { id: 42, name: 'Ada' } // served from cache
 * calls; // => 1
 */
export function createAsyncCache<K, V>(options: AsyncCacheOptions<K, V>): AsyncCache<K, V> {
  const { load, ttlMs = Infinity, staleWhileRevalidateMs = 0, maxSize = 500, keyFn = (k: K): unknown => k, errorTtlMs = 0, onError, now = Date.now } = options;
  if (typeof load !== 'function') throw new ValidationError('SVC_CACHE_INVALID_OPTION', 'load must be a function.');
  assertMs(ttlMs, 'ttlMs');
  assertMs(staleWhileRevalidateMs, 'staleWhileRevalidateMs');
  assertMs(errorTtlMs, 'errorTtlMs');
  const entries = new LRUCache<unknown, Entry<K, V>>({ maxSize });
  const flights = new Map<unknown, Flight<V>>();
  let hits = 0;
  let misses = 0;
  let stale = 0;
  let loads = 0;
  let errors = 0;

  const live = (ck: unknown): Entry<K, V> | undefined => {
    const e = entries.get(ck);
    if (!e) return undefined;
    if (e.staleUntil <= now() && e.freshUntil <= now()) {
      entries.delete(ck);
      return undefined;
    }
    return e;
  };

  const start = (key: K, ck: unknown): Flight<V> => {
    const existing = flights.get(ck);
    if (existing) return existing;
    const controller = new AbortController();
    const token = {};
    const mine = (): boolean => flights.get(ck)?.token === token;
    loads++;
    const promise = (async (): Promise<V> => {
      // Yield once so the flight is registered before `load` runs (a synchronous throw must still clean up).
      await Promise.resolve();
      try {
        const value = await load(key, controller.signal);
        if (mine()) {
          const t = now();
          entries.set(ck, { key, ok: true, value, error: undefined, freshUntil: t + ttlMs, staleUntil: t + ttlMs + staleWhileRevalidateMs });
        }
        return value;
      } catch (e) {
        errors++;
        const error = toError(e);
        if (mine()) {
          if (errorTtlMs > 0) {
            const t = now();
            entries.set(ck, { key, ok: false, value: undefined, error, freshUntil: t + errorTtlMs, staleUntil: t + errorTtlMs });
          }
        }
        throw error;
      } finally {
        if (mine()) flights.delete(ck);
      }
    })();
    const flight: Flight<V> = { token, promise, controller, waiters: 0 };
    flights.set(ck, flight);
    // Background revalidations may have no waiter; avoid unhandled rejections.
    promise.catch(() => undefined);
    return flight;
  };

  const join = (flight: Flight<V>, signal: AbortSignal | undefined): Promise<V> => {
    if (!signal) {
      flight.waiters++;
      return flight.promise.finally(() => {
        flight.waiters--;
      });
    }
    if (signal.aborted) return Promise.reject(abortReason(signal));
    flight.waiters++;
    let left = false;
    const leave = (): void => {
      if (left) return;
      left = true;
      flight.waiters--;
    };
    const onAbort = (): void => {
      leave();
      if (flight.waiters === 0) flight.controller.abort(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    return raceSignal(flight.promise, signal).finally(() => {
      signal.removeEventListener('abort', onAbort);
      leave();
    });
  };

  const dropFlight = (ck: unknown): void => {
    const f = flights.get(ck);
    if (!f) return;
    flights.delete(ck);
    // Detached: current waiters still receive the result, which is not stored. Abort only if nobody waits.
    if (f.waiters === 0) f.controller.abort(new HelperError('SVC_CACHE_INVALIDATED', 'The cache entry was invalidated.', { kind: 'aborted' }));
  };

  return {
    async get(key, opts = {}) {
      const ck = keyFn(key);
      if (!opts.force) {
        const e = live(ck);
        if (e) {
          const t = now();
          if (e.freshUntil > t) {
            hits++;
            if (!e.ok) throw e.error ?? new HelperError('SVC_CACHE_LOAD_FAILED', 'Loading the value failed.');
            return e.value as V;
          }
          if (e.ok) {
            stale++;
            if (!flights.has(ck)) {
              start(key, ck).promise.catch((err: unknown) => {
                try {
                  onError?.(toError(err), key);
                } catch {
                  // Ignore reporter failures.
                }
              });
            }
            return e.value as V;
          }
        }
      }
      misses++;
      if (opts.force) dropFlight(ck);
      return join(start(key, ck), opts.signal);
    },
    peek(key) {
      const e = live(keyFn(key));
      return e?.ok ? e.value : undefined;
    },
    has(key) {
      return live(keyFn(key))?.ok === true;
    },
    prime(key, value) {
      const ck = keyFn(key);
      dropFlight(ck);
      const t = now();
      entries.set(ck, { key, ok: true, value, error: undefined, freshUntil: t + ttlMs, staleUntil: t + ttlMs + staleWhileRevalidateMs });
    },
    invalidate(key) {
      const ck = keyFn(key);
      entries.delete(ck);
      dropFlight(ck);
    },
    invalidateWhere(predicate) {
      let n = 0;
      for (const [ck, e] of entries.toArray()) {
        if (predicate(e.key)) {
          entries.delete(ck);
          dropFlight(ck);
          n++;
        }
      }
      return n;
    },
    clear() {
      entries.clear();
      for (const ck of [...flights.keys()]) dropFlight(ck);
    },
    stats() {
      return { hits, misses, stale, loads, errors, size: entries.size };
    },
  };
}
