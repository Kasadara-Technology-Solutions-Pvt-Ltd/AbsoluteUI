import { AbortError, HelperError, ValidationError, toError } from '../error/index.js';
import { assertDelay, deferred, throwIfAborted, type Deferred, type SignalOptions } from './signal.js';

export interface BatcherOptions<K> {
  /** Keys per `loadMany` call. Default 100. */
  readonly maxBatchSize?: number;
  /** Ms to collect keys before dispatching. Default 0 (end of the current microtask queue). */
  readonly delay?: number;
  /** Maps a key to its identity for de-duplication within a batch. Default: the key itself (SameValueZero). */
  readonly cacheKey?: (key: K) => unknown;
}

/** Batching loader returned by `createBatcher`. */
export interface Batcher<K, V> {
  /** Loads one key; concurrent calls are coalesced into one `loadMany`. */
  load(key: K): Promise<V>;
  /** Loads several keys (each may land in the same or different batches). */
  loadMany(keys: readonly K[]): Promise<V[]>;
  /** Dispatches the pending batch now. */
  flush(): void;
}

/**
 * DataLoader-style batching: collects `load(key)` calls and resolves them from one `loadMany(keys)` call.
 * `loadMany` must return one result per key in the same order; an `Error` element rejects just that key.
 * No caching across batches (combine with `memoize` or a cache if needed).
 * @example
 * const requests: string[][] = [];
 * const users = createBatcher((ids: string[]) => {
 *   requests.push(ids);
 *   return ids.map((id) => ({ id, name: `Employee ${id}` }));
 * });
 * const [a, b] = await Promise.all([users.load('1'), users.load('2')]);
 * b; // => { id: '2', name: 'Employee 2' }
 * requests; // => [['1', '2']] // one request for both keys
 */
export function createBatcher<K, V>(loadMany: (keys: K[]) => PromiseLike<readonly (V | Error)[]> | readonly (V | Error)[], options: BatcherOptions<K> = {}): Batcher<K, V> {
  const maxBatchSize = options.maxBatchSize ?? 100;
  if (!Number.isSafeInteger(maxBatchSize) || maxBatchSize < 1) throw new ValidationError('HLP_ASYNC_INVALID_BATCH_SIZE', 'maxBatchSize must be a positive integer.');
  const delay = options.delay ?? 0;
  assertDelay(delay, 'delay');
  const identity = options.cacheKey ?? ((k: K): unknown => k);
  let batch: Map<unknown, { key: K; waiters: Deferred<V>[] }> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const dispatch = (): void => {
    const current = batch;
    batch = undefined;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!current || current.size === 0) return;
    const entries = [...current.values()];
    const failAll = (e: unknown): void => {
      for (const en of entries) for (const w of en.waiters) w.reject(toError(e));
    };
    Promise.resolve()
      .then(() => loadMany(entries.map((e) => e.key)))
      .then((values) => {
        if (values.length !== entries.length) {
          failAll(new HelperError('HLP_ASYNC_BATCH_LENGTH', 'The batch loader returned a different number of results than keys.', { details: { expected: entries.length, actual: values.length } }));
          return;
        }
        entries.forEach((en, i) => {
          const v = values[i] as V | Error;
          for (const w of en.waiters) {
            if (v instanceof Error) w.reject(v);
            else w.resolve(v);
          }
        });
      }, failAll);
  };

  const load = (key: K): Promise<V> => {
    batch ??= new Map();
    const id = identity(key);
    let entry = batch.get(id);
    if (!entry) {
      entry = { key, waiters: [] };
      batch.set(id, entry);
    }
    const d = deferred<V>();
    entry.waiters.push(d);
    if (batch.size >= maxBatchSize) dispatch();
    else if (timer === undefined && batch.size === 1 && entry.waiters.length === 1) {
      if (delay === 0) {
        const scheduled = batch;
        queueMicrotask(() => {
          if (batch === scheduled) dispatch();
        });
      } else timer = setTimeout(dispatch, delay);
    }
    return d.promise;
  };

  return {
    load,
    loadMany: (keys) => Promise.all(keys.map(load)),
    flush: dispatch,
  };
}

/**
 * De-duplicates concurrent calls: while a call for a key is in flight, callers with the same key share its promise.
 * @example
 * let fetches = 0;
 * const getConfig = singleFlight(async (env: string) => {
 *   fetches++;
 *   return { env, currency: 'EUR' };
 * });
 * await Promise.all([getConfig('prod'), getConfig('prod')]);
 * fetches; // => 1
 */
export function singleFlight<A extends unknown[], R>(fn: (...args: A) => PromiseLike<R> | R, keyFn: (...args: A) => unknown = (...args: A): unknown => args[0]): (...args: A) => Promise<R> {
  const inflight = new Map<unknown, Promise<R>>();
  return (...args: A): Promise<R> => {
    const key = keyFn(...args);
    const existing = inflight.get(key);
    if (existing) return existing;
    const p = Promise.resolve()
      .then(() => fn(...args))
      .finally(() => {
        if (inflight.get(key) === p) inflight.delete(key);
      });
    inflight.set(key, p);
    return p;
  };
}

/** A debounced async function. */
export interface DebouncedAsync<A extends unknown[], R> {
  (...args: A): Promise<R>;
  /** Drops the scheduled call and rejects every waiting caller with `AbortError`. */
  cancel(): void;
}

type Outcome<R> = { ok: true; value: R } | { ok: false; error: unknown };

/**
 * Debounces an async function so only the latest arguments are executed. Choice: every caller whose call
 * was superseded receives the result of the latest call (not an `AbortError`), so all awaiting UI settles on
 * fresh data; results of runs superseded while in flight are discarded. `cancel()` rejects waiters with `AbortError`.
 * @example
 * const search = debounceAsync(async (q: string) => [`${q}: 3 matches`], 20);
 * const [first, latest] = await Promise.all([search('ad'), search('ada')]);
 * first; // => ['ada: 3 matches'] // superseded callers get the latest result
 * latest; // => ['ada: 3 matches']
 */
export function debounceAsync<A extends unknown[], R>(fn: (...args: A) => PromiseLike<R> | R, wait: number): DebouncedAsync<A, R> {
  assertDelay(wait, 'wait');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | undefined;
  let generation = 0;
  let waiting: Deferred<R>[] = [];
  let orphans: Deferred<R>[] = [];
  const inflight = new Set<Deferred<R>[]>();
  let latest: { gen: number; outcome: Outcome<R> } | undefined;

  const settle = (callers: readonly Deferred<R>[], outcome: Outcome<R>): void => {
    for (const c of callers) {
      if (outcome.ok) c.resolve(outcome.value);
      else c.reject(toError(outcome.error));
    }
  };
  const fire = (): void => {
    timer = undefined;
    const args = lastArgs;
    const callers = waiting;
    waiting = [];
    const gen = generation;
    if (!args) return;
    inflight.add(callers);
    void Promise.resolve()
      .then(() => fn(...args))
      .then(
        (value): Outcome<R> => ({ ok: true, value }),
        (error: unknown): Outcome<R> => ({ ok: false, error }),
      )
      .then((outcome) => {
        if (!inflight.delete(callers)) return; // cancelled
        if (gen === generation) {
          latest = { gen, outcome };
          settle([...callers, ...orphans], outcome);
          orphans = [];
        } else if (latest?.gen === generation) settle(callers, latest.outcome);
        else orphans.push(...callers);
      });
  };

  const debounced = (...args: A): Promise<R> => {
    lastArgs = args;
    generation++;
    const d = deferred<R>();
    waiting.push(d);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(fire, wait);
    return d.promise;
  };
  debounced.cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    generation++;
    const error = new AbortError();
    const all = [...waiting, ...orphans, ...[...inflight].flat()];
    waiting = [];
    orphans = [];
    inflight.clear();
    for (const c of all) c.reject(error);
  };
  return debounced;
}

type Awaitable<T> = T | PromiseLike<T>;

/**
 * Async left-to-right composition; each step may return a promise.
 * @example
 * const employees = new Map([['u1', { name: 'Ada', deptId: 'd7' }]]);
 * const departmentOf = asyncPipe(
 *   async (id: string) => employees.get(id),
 *   (e) => e?.deptId ?? 'unassigned',
 *   async (deptId) => `Department ${deptId}`,
 * );
 * await departmentOf('u1'); // => 'Department d7'
 */
export function asyncPipe<A extends unknown[], B>(ab: (...a: A) => Awaitable<B>): (...a: A) => Promise<B>;
export function asyncPipe<A extends unknown[], B, C>(ab: (...a: A) => Awaitable<B>, bc: (b: B) => Awaitable<C>): (...a: A) => Promise<C>;
export function asyncPipe<A extends unknown[], B, C, D>(ab: (...a: A) => Awaitable<B>, bc: (b: B) => Awaitable<C>, cd: (c: C) => Awaitable<D>): (...a: A) => Promise<D>;
export function asyncPipe<A extends unknown[], B, C, D, E>(ab: (...a: A) => Awaitable<B>, bc: (b: B) => Awaitable<C>, cd: (c: C) => Awaitable<D>, de: (d: D) => Awaitable<E>): (...a: A) => Promise<E>;
export function asyncPipe<A extends unknown[], B, C, D, E, F>(ab: (...a: A) => Awaitable<B>, bc: (b: B) => Awaitable<C>, cd: (c: C) => Awaitable<D>, de: (d: D) => Awaitable<E>, ef: (e: E) => Awaitable<F>): (...a: A) => Promise<F>;
export function asyncPipe<A extends unknown[], B, C, D, E, F, G>(ab: (...a: A) => Awaitable<B>, bc: (b: B) => Awaitable<C>, cd: (c: C) => Awaitable<D>, de: (d: D) => Awaitable<E>, ef: (e: E) => Awaitable<F>, fg: (f: F) => Awaitable<G>): (...a: A) => Promise<G>;
export function asyncPipe<A extends unknown[], B, C, D, E, F, G, H>(ab: (...a: A) => Awaitable<B>, bc: (b: B) => Awaitable<C>, cd: (c: C) => Awaitable<D>, de: (d: D) => Awaitable<E>, ef: (e: E) => Awaitable<F>, fg: (f: F) => Awaitable<G>, gh: (g: G) => Awaitable<H>): (...a: A) => Promise<H>;
export function asyncPipe(first: (...args: unknown[]) => unknown, ...rest: ((arg: unknown) => unknown)[]): (...args: unknown[]) => Promise<unknown> {
  return async (...args: unknown[]) => {
    let value = await first(...args);
    for (const f of rest) value = await f(value);
    return value;
  };
}

/**
 * Wraps a sync iterable (of values or promises) or an async iterable as an async iterable.
 * @example
 * const names: string[] = [];
 * for await (const name of toAsyncIterable([Promise.resolve('Ada'), 'Grace'])) names.push(name);
 * names; // => ['Ada', 'Grace']
 */
export async function* toAsyncIterable<T>(source: Iterable<T | PromiseLike<T>> | AsyncIterable<T>): AsyncGenerator<T> {
  for await (const item of source) yield item;
}

export interface CollectOptions extends SignalOptions {
  /** Stop after this many items (the source's `return()` is called). Default: no limit. */
  readonly limit?: number;
}

/**
 * Collects an async (or sync) iterable into an array, optionally capped at `limit` items.
 * @example
 * async function* rows() {
 *   for (let i = 1; i <= 1_000; i++) yield i;
 * }
 * await collectAsync(rows(), { limit: 3 }); // => [1, 2, 3]
 */
export async function collectAsync<T>(source: AsyncIterable<T> | Iterable<T>, options: CollectOptions = {}): Promise<T[]> {
  const { limit = Infinity, signal } = options;
  if (!(limit >= 0)) throw new ValidationError('HLP_ASYNC_INVALID_LIMIT', 'limit must be a non-negative number.');
  const out: T[] = [];
  throwIfAborted(signal);
  if (limit === 0) return out;
  for await (const item of source) {
    throwIfAborted(signal);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
