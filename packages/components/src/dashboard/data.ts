/**
 * Dashboard data layer (R18-5, R18-6, R18-8, S3, S9, S10). Requests go through a host fetcher (the host
 * owns authentication); the dashboard enforces the origin allowlist, credential rules, timeouts, response
 * size limits, retries, ttl caching, and request sharing between widgets.
 */
import { getByPointer, safeJsonParse } from '@absoluteui/helpers/json';
import type { CredentialsMode, DataSourceDefinition, HttpDataSource, HttpMethod } from './definition.js';
import { interpolateJson, interpolateText, type VariableValue } from './variables.js';

/** The request the dashboard asks the fetcher to perform. Already allow-listed and interpolated. */
export interface DashboardRequest {
  /** Data source id. */
  readonly source: string;
  /** Absolute URL. */
  readonly url: string;
  readonly method: HttpMethod;
  readonly headers: Readonly<Record<string, string>>;
  /** JSON text for POST. */
  readonly body?: string;
  readonly credentials: CredentialsMode;
  readonly timeoutMs: number;
  readonly maxBytes: number;
}

/**
 * Performs a request and resolves with the parsed JSON response. Add authentication here (tokens,
 * interceptors, your own HTTP client). Must honor `signal`. Throw `DashboardDataError` (or any error) on
 * failure; a `status` property on the error is used for the message and for retries.
 */
export type DashboardFetcher = (request: DashboardRequest, signal: AbortSignal) => Promise<unknown>;

export type DashboardDataErrorKind = 'blocked' | 'network' | 'http' | 'timeout' | 'too-large' | 'parse' | 'aborted';

export class DashboardDataError extends Error {
  override readonly name = 'DashboardDataError';
  readonly kind: DashboardDataErrorKind;
  readonly status: number | null;
  constructor(kind: DashboardDataErrorKind, message: string, status: number | null = null) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export interface DataStoreOptions {
  /** Fetcher; default `defaultFetcher` (global fetch). */
  readonly fetcher?: DashboardFetcher;
  /** Exact origins (scheme://host[:port]) that may be requested besides the page origin. */
  readonly allowedOrigins?: readonly string[];
  /** Base for root-relative URLs and the "same origin". Default: `location.href`. */
  readonly baseUrl?: string;
  /** Retries for GET on network errors, 408, 429, and 5xx. Default 2. */
  readonly retries?: number;
  /** First retry delay in ms (doubles, with jitter). Default 500. */
  readonly retryDelay?: number;
}

const DEFAULT_TIMEOUT_S = 30;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/** Normalizes and validates allowlist entries; throws on anything that is not a bare http(s) origin. */
export function normalizeOrigins(list: readonly string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const entry of list ?? []) {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new TypeError(`Invalid allowed origin: expected scheme://host[:port], got a value that is not a URL.`);
    }
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin !== entry.replace(/\/$/, '') || url.username !== '' || url.password !== '') {
      throw new TypeError('Invalid allowed origin: expected an http(s) origin without path, query, or user info.');
    }
    out.add(url.origin);
  }
  return out;
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const length = Number(response.headers.get('content-length') ?? 'NaN');
  if (Number.isFinite(length) && length > maxBytes) throw new DashboardDataError('too-large', 'The response is larger than the limit.');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new DashboardDataError('too-large', 'The response is larger than the limit.');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Fetcher based on global `fetch`: no redirects followed, JSON only, size-limited. */
export const defaultFetcher: DashboardFetcher = async (request, signal) => {
  const headers: Record<string, string> = { Accept: 'application/json', ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...request.headers };
  const init: RequestInit = { method: request.method, headers, credentials: request.credentials, signal, redirect: 'error', referrerPolicy: 'strict-origin-when-cross-origin' };
  if (request.body !== undefined) init.body = request.body;
  let response: Response;
  try {
    response = await fetch(request.url, init);
  } catch (error) {
    if (signal.aborted) throw error;
    throw new DashboardDataError('network', 'The request failed (network, CORS, or redirect).');
  }
  if (!response.ok) throw new DashboardDataError('http', `The server answered ${String(response.status)}.`, response.status);
  if (response.status === 204) return null;
  const text = await readLimited(response, request.maxBytes);
  const parsed = safeJsonParse(text, { maxLength: request.maxBytes, maxKeys: 100_000, unsafeKeys: 'strip' });
  if (!parsed.ok) throw new DashboardDataError('parse', 'The response is not valid JSON.');
  return parsed.value;
};

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DashboardDataError('aborted', 'Aborted.'));
      return;
    }
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      reject(new DashboardDataError('aborted', 'Aborted.'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function statusOf(error: unknown): number | null {
  if (error instanceof DashboardDataError) return error.status;
  if (error !== null && typeof error === 'object' && 'status' in error && typeof error.status === 'number') return error.status;
  return null;
}

function retryable(error: unknown): boolean {
  if (error instanceof DashboardDataError) {
    if (error.kind === 'network' || error.kind === 'timeout') return true;
    if (error.kind !== 'http') return false;
  }
  const status = statusOf(error);
  if (status === null) return !(error instanceof DashboardDataError);
  return status === 408 || status === 429 || status >= 500;
}

interface Entry {
  key: string;
  value?: unknown;
  error?: unknown;
  at: number;
  promise?: Promise<unknown>;
  controller?: AbortController;
}

export interface LoadResult {
  readonly data: unknown;
  /** Epoch ms when the data arrived. */
  readonly at: number;
}

/**
 * Loads and caches data sources. One entry per source; a new request for the same source (changed
 * variables, refresh) aborts the previous one ("latest wins"). Identical concurrent loads share a promise.
 */
export class DataStore {
  readonly #fetcher: DashboardFetcher;
  readonly #origins: Set<string>;
  readonly #base: URL;
  readonly #retries: number;
  readonly #retryDelay: number;
  readonly #entries = new Map<string, Entry>();
  #disposed = false;

  constructor(options: DataStoreOptions = {}) {
    this.#fetcher = options.fetcher ?? defaultFetcher;
    this.#origins = normalizeOrigins(options.allowedOrigins);
    this.#base = new URL(options.baseUrl ?? globalThis.location.href);
    this.#retries = Math.max(0, Math.min(5, options.retries ?? 2));
    this.#retryDelay = Math.max(0, options.retryDelay ?? 500);
  }

  /** Builds the request for an http source, enforcing R18-6. Throws DashboardDataError('blocked'). */
  buildRequest(id: string, def: HttpDataSource, values: ReadonlyMap<string, VariableValue>): DashboardRequest {
    const url = new URL(def.url, this.#base);
    const sameOrigin = url.origin === this.#base.origin;
    const listed = this.#origins.has(url.origin);
    if (!sameOrigin && !listed) throw new DashboardDataError('blocked', 'The data source origin is not on the allowlist.');
    const credentials = def.credentials ?? 'same-origin';
    if (credentials === 'include' && !sameOrigin && !listed) throw new DashboardDataError('blocked', 'Credentials are only sent to allow-listed origins.');
    for (const [name, value] of Object.entries(def.params ?? {})) {
      url.searchParams.append(name, typeof value === 'string' ? interpolateText(value, values) : String(value));
    }
    const request: { -readonly [K in keyof DashboardRequest]: DashboardRequest[K] } = {
      source: id,
      url: url.href,
      method: def.method ?? 'GET',
      headers: { ...(def.headers ?? {}) },
      credentials,
      timeoutMs: (def.timeout ?? DEFAULT_TIMEOUT_S) * 1000,
      maxBytes: def.maxBytes ?? DEFAULT_MAX_BYTES,
    };
    if (def.body !== undefined) request.body = JSON.stringify(interpolateJson(def.body, values));
    return request;
  }

  /** Cache key of a source for the current variable values. */
  keyOf(id: string, def: DataSourceDefinition, values: ReadonlyMap<string, VariableValue>): string {
    if (def.kind !== 'http') return `${id}|${def.kind}`;
    const r = this.buildRequest(id, def, values);
    return `${id}|${r.method}|${r.url}|${r.body ?? ''}`;
  }

  /** Cached result when fresh (within ttl, or in-flight sharing for ttl 0). */
  peek(id: string, def: DataSourceDefinition, values: ReadonlyMap<string, VariableValue>): LoadResult | undefined {
    const entry = this.#entries.get(id);
    if (entry?.value === undefined || entry.error !== undefined) return undefined;
    let key: string;
    try {
      key = this.keyOf(id, def, values);
    } catch {
      return undefined;
    }
    if (entry.key !== key) return undefined;
    const ttl = def.kind === 'http' ? (def.ttl ?? 0) : Number.POSITIVE_INFINITY;
    return Date.now() - entry.at <= ttl * 1000 ? { data: entry.value, at: entry.at } : undefined;
  }

  /** The stored value for the current request, regardless of ttl (re-rendering after a definition change). */
  current(id: string, def: DataSourceDefinition, values: ReadonlyMap<string, VariableValue>): LoadResult | undefined {
    const entry = this.#entries.get(id);
    if (entry?.value === undefined) return undefined;
    try {
      return entry.key === this.keyOf(id, def, values) ? { data: entry.value, at: entry.at } : undefined;
    } catch {
      return undefined;
    }
  }

  /** Loads a source. `force` skips the cache (manual refresh, interval). */
  load(id: string, def: DataSourceDefinition, values: ReadonlyMap<string, VariableValue>, force = false): Promise<LoadResult> {
    if (this.#disposed) return Promise.reject(new DashboardDataError('aborted', 'The dashboard was destroyed.'));
    let key: string;
    try {
      key = this.keyOf(id, def, values);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new DashboardDataError('blocked', 'The request could not be built.'));
    }
    const existing = this.#entries.get(id);
    if (existing?.key === key) {
      if (existing.promise) return existing.promise.then(() => ({ data: existing.value, at: existing.at }));
      if (!force) {
        const fresh = this.peek(id, def, values);
        if (fresh) return Promise.resolve(fresh);
      }
    }
    existing?.controller?.abort();
    const controller = new AbortController();
    const entry: Entry = { key, at: 0, controller };
    if (existing?.value !== undefined) {
      // Keep the last good value for the stale display while the new request runs.
      entry.value = existing.value;
      entry.at = existing.at;
    }
    this.#entries.set(id, entry);
    const run = this.#run(id, def, values, controller.signal);
    entry.promise = run.then(
      (data) => {
        if (this.#entries.get(id) === entry) {
          entry.value = data;
          delete entry.error;
          entry.at = Date.now();
          delete entry.promise;
          delete entry.controller;
        }
        return data;
      },
      (error: unknown) => {
        if (this.#entries.get(id) === entry) {
          entry.error = error;
          delete entry.promise;
          delete entry.controller;
        }
        throw error;
      },
    );
    return entry.promise.then((data) => ({ data, at: entry.at || Date.now() }));
  }

  /** Last good data of a source, even when stale or after an error. */
  lastGood(id: string): LoadResult | undefined {
    const e = this.#entries.get(id);
    return e?.value === undefined ? undefined : { data: e.value, at: e.at };
  }

  invalidate(id?: string): void {
    if (id === undefined) {
      for (const e of this.#entries.values()) e.controller?.abort();
      this.#entries.clear();
      return;
    }
    this.#entries.get(id)?.controller?.abort();
    this.#entries.delete(id);
  }

  dispose(): void {
    this.#disposed = true;
    this.invalidate();
  }

  async #run(id: string, def: DataSourceDefinition, values: ReadonlyMap<string, VariableValue>, signal: AbortSignal): Promise<unknown> {
    if (def.kind === 'static') return def.data;
    if (def.kind === 'mock') {
      await delay(def.delay ?? 0, signal);
      if (def.failStatus !== undefined) throw new DashboardDataError('http', `The server answered ${String(def.failStatus)}.`, def.failStatus);
      return def.data;
    }
    const request = this.buildRequest(id, def, values);
    let attempt = 0;
    for (;;) {
      try {
        const data = await this.#once(request, signal);
        return def.select === undefined ? data : (getByPointer(data, def.select));
      } catch (error) {
        if (signal.aborted) throw new DashboardDataError('aborted', 'Aborted.');
        if (request.method !== 'GET' || attempt >= this.#retries || !retryable(error)) throw error;
        const base = this.#retryDelay * 2 ** attempt;
        attempt++;
        await delay(base / 2 + Math.random() * base, signal);
      }
    }
  }

  async #once(request: DashboardRequest, outer: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const onAbort = (): void => {
      controller.abort();
    };
    outer.addEventListener('abort', onAbort, { once: true });
    const state = { timedOut: false };
    const timer = setTimeout(() => {
      state.timedOut = true;
      controller.abort();
    }, request.timeoutMs);
    try {
      return await this.#fetcher(request, controller.signal);
    } catch (error) {
      if (state.timedOut) throw new DashboardDataError('timeout', 'The request timed out.');
      throw error;
    } finally {
      clearTimeout(timer);
      outer.removeEventListener('abort', onAbort);
    }
  }
}
