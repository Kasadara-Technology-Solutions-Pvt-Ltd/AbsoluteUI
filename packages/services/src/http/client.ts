/** `fetch`-based HTTP client (docs/PLAN-HELPERS.md section 3, docs/PLAN-R6.md). No global access until a request is made. */
import { anySignal, raceSignal, retry } from '@absoluteui/helpers/async';
import { HelperError, HttpError, LimitError, ValidationError, isAbortError, toError } from '@absoluteui/helpers/error';
import { composeStatusMessages, isSafeMethod, isRetryableStatus, isSuccess, safeUrlForLog, type StatusMessageCatalog } from '@absoluteui/helpers/http';
import { safeJsonParse, type SafeJsonParseOptions } from '@absoluteui/helpers/json';
import { uuidV4 } from '@absoluteui/helpers/random';
import { fnv1a32, utf8Decode } from '@absoluteui/helpers/encoding';
import { isAbsoluteUrl, isSafeUrl, isSameOrigin, joinUrl, withQuery, type QueryInput } from '@absoluteui/helpers/url';
import { expectedLength, meterStream, readBytes, type TransferProgress } from './body.js';
import { cancelledError, invalidResponseError, networkError, redactHeaders, requestIdOf, responseError, timeoutError, tooLargeError, type TrustServerMessages } from './errors.js';

/** How the response body is returned. */
export type ResponseType = 'json' | 'text' | 'blob' | 'arrayBuffer' | 'stream' | 'response';

/** Data type produced by each `ResponseType`; `T` is the JSON payload type. */
export interface ResponseTypeMap<T> {
  json: T;
  text: string;
  blob: Blob;
  arrayBuffer: ArrayBuffer;
  stream: ReadableStream<Uint8Array>;
  response: Response;
}

/** Minimal `fetch` signature; inject one for tests or SSR. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Retry policy. Only idempotent methods (or requests with an idempotency key) are retried. */
export interface RetryPolicy {
  /** Retries after the first attempt. Default 2. */
  readonly retries: number;
  /** Methods retried. Default GET, HEAD, OPTIONS, PUT, DELETE. */
  readonly methods: readonly string[];
  /** Statuses retried: list or predicate. Default `isRetryableStatus` (408, 425, 429, 500, 502, 503, 504). */
  readonly statuses: readonly number[] | ((status: number) => boolean);
  /** Retry network failures (status 0). Default true. */
  readonly network: boolean;
  /** Wait for `Retry-After`; a value above `maxDelayMs` stops retrying. Default true. */
  readonly respectRetryAfter: boolean;
  /** First backoff delay in ms. Default 300. */
  readonly baseDelayMs: number;
  /** Maximum delay between attempts in ms. Default 30 000. */
  readonly maxDelayMs: number;
}

/** Mutable request passed to request interceptors. */
export interface HttpRequestContext {
  method: string;
  url: string;
  readonly headers: Headers;
  body: BodyInit | null;
  credentials: RequestCredentials;
  cache: RequestCache | undefined;
  redirect: RequestRedirect | undefined;
  readonly signal: AbortSignal;
  /** 1-based attempt number. */
  readonly attempt: number;
}

type Awaitable<T> = T | Promise<T>;
/** Transforms the request: change it in place, return a replacement, or return a `Response` to skip the network. */
export type RequestInterceptor = (request: HttpRequestContext) => Awaitable<HttpRequestContext | Response | undefined>;
/** Transforms the response: may return a replacement `Response`. */
export type ResponseInterceptor = (response: Response, request: HttpRequestContext) => Awaitable<Response | undefined>;
/** Called with the final error (not for cancellations); returning a 2xx `Response` recovers. */
export type ErrorInterceptor = (error: Error, request: { readonly method: string; readonly url: string }) => Awaitable<Response | undefined>;

/** Interceptors of one kind; `use` returns a function that removes the interceptor again. */
export interface InterceptorRegistry<F> {
  use(interceptor: F): () => void;
  clear(): void;
  readonly size: number;
}

/** Runtime interceptor registration. */
export interface HttpInterceptors {
  readonly request: InterceptorRegistry<RequestInterceptor>;
  readonly response: InterceptorRegistry<ResponseInterceptor>;
  readonly error: InterceptorRegistry<ErrorInterceptor>;
}

/** Per-request interceptors, run after the client's for requests and before them for responses and errors. */
export interface RequestInterceptors {
  readonly request?: RequestInterceptor | readonly RequestInterceptor[];
  readonly response?: ResponseInterceptor | readonly ResponseInterceptor[];
  readonly error?: ErrorInterceptor | readonly ErrorInterceptor[];
}

/** One call (`get`, `post`, `send`, ...) as hooks and `pending` see it. */
export interface HttpCallInfo {
  /** Unique within the page. */
  readonly id: number;
  readonly method: string;
  /** Full request URL, including the query string. */
  readonly url: string;
  readonly group: string | undefined;
  readonly cancelKey: string | undefined;
  /** `Date.now()` when the call started. */
  readonly startedAt: number;
}

/** One network exchange of a call, as hooks see it. */
export interface HttpRequestInfo {
  readonly call: HttpCallInfo;
  readonly method: string;
  readonly url: string;
  /** Request headers after interceptors, with credentials redacted (`redactHeaders`). */
  readonly headers: Readonly<Record<string, string>>;
  /** 1-based attempt number. */
  readonly attempt: number;
}

/** How a call ended. */
export type HttpOutcome = 'success' | 'error' | 'cancelled';

/** Passed to `onComplete`, exactly once per call. */
export interface HttpCallResult {
  readonly call: HttpCallInfo;
  readonly outcome: HttpOutcome;
  readonly durationMs: number;
  readonly response: HttpResponse<unknown> | undefined;
  readonly error: Error | undefined;
}

/**
 * Lifecycle observers. Hooks never change the request or response (use interceptors for that),
 * are not awaited, and a hook that throws or rejects is reported to `logger.warn` and ignored.
 * Client hooks run before child-client hooks, which run before per-request hooks.
 */
export interface HttpHooks {
  /** Each exchange, after request interceptors, just before `fetch`. */
  beforeRequest?(request: HttpRequestInfo): void | Promise<void>;
  /** Each exchange, when `fetch` settles: headers received (`response`) or network failure (`error`). */
  afterRequest?(info: { readonly request: HttpRequestInfo; readonly response: Response | undefined; readonly error: Error | undefined; readonly durationMs: number }): void | Promise<void>;
  /** Each exchange, after response interceptors, before the body is read. Do not read the body here. */
  beforeResponse?(info: { readonly request: HttpRequestInfo | undefined; readonly response: Response }): void | Promise<void>;
  /** Accepted response with its body parsed and validated (or served from the ETag cache). */
  afterResponse?(info: { readonly call: HttpCallInfo; readonly response: HttpResponse<unknown> }): void | Promise<void>;
  /** Before each retry. */
  onRetry?(info: { readonly call: HttpCallInfo; readonly error: Error; readonly attempt: number; readonly delayMs: number }): void | Promise<void>;
  /** Once per successful call. */
  onSuccess?(response: HttpResponse<unknown>, call: HttpCallInfo): void | Promise<void>;
  /** Once per failed call (not for cancellations). An `HttpError` for every transport or HTTP failure. */
  onError?(error: Error, call: HttpCallInfo): void | Promise<void>;
  /** Once per cancelled call. */
  onCancel?(error: HttpError, call: HttpCallInfo): void | Promise<void>;
  /** Once per call, after `onSuccess`, `onError`, or `onCancel`. */
  onComplete?(result: HttpCallResult): void | Promise<void>;
}

/** Cached representation for conditional GETs. */
export interface EtagEntry {
  readonly etag: string;
  readonly body: unknown;
}

/** Storage for the ETag cache (sync or async). Keys never contain credentials. */
export interface EtagStore {
  get(key: string): Awaitable<EtagEntry | undefined>;
  set(key: string, entry: EtagEntry): Awaitable<void>;
  delete(key: string): Awaitable<void>;
}

/** Bearer-token hook. Concurrent 401s share one `refresh()` and each request is retried once. */
export interface HttpAuth {
  getToken(): Promise<string | null>;
  refresh?(): Promise<void>;
  /** Authorization scheme. Default `'Bearer'`. */
  readonly scheme?: string;
}

/** Double-submit CSRF protection: copies a cookie into a header for same-origin unsafe methods. */
export interface XsrfOptions {
  /** Default `'XSRF-TOKEN'`. */
  readonly cookieName?: string;
  /** Default `'X-XSRF-TOKEN'`. */
  readonly headerName?: string;
}

/** Diagnostic sink; receives redacted headers and URLs without query strings only. */
export interface HttpLogger {
  debug?(message: string, context: Readonly<Record<string, unknown>>): void;
  warn?(message: string, context: Readonly<Record<string, unknown>>): void;
}

export interface HttpClientOptions {
  /** Prefix for relative request URLs. */
  readonly baseUrl?: string;
  /** Default headers, or a function returning them per request. */
  readonly headers?: HeadersInit | (() => Awaitable<HeadersInit>);
  /** Whole-request deadline including retries; 0 disables. Default 30 000. */
  readonly timeoutMs?: number;
  /** Retry policy overrides, or `false` to disable retries. */
  readonly retry?: Partial<RetryPolicy> | false;
  /** Default `'same-origin'`. */
  readonly credentials?: RequestCredentials;
  /** Custom `fetch` (tests, SSR, instrumentation). Default: the global `fetch`, resolved per request. */
  readonly fetch?: FetchLike;
  /** Initial request interceptors (more can be added with `client.interceptors.request.use`). */
  readonly onRequest?: RequestInterceptor | readonly RequestInterceptor[];
  readonly onResponse?: ResponseInterceptor | readonly ResponseInterceptor[];
  readonly onError?: ErrorInterceptor | readonly ErrorInterceptor[];
  /** Lifecycle observers for every call of this client. */
  readonly hooks?: HttpHooks;
  /** Share identical in-flight GETs (same URL, headers and response type). Default true. */
  readonly dedupeGets?: boolean;
  /** Conditional GET cache for `json`/`text` responses: `true` for a bounded in-memory store, or a custom store. Default off. */
  readonly etagCache?: boolean | EtagStore;
  /** Maximum response size in bytes, enforced while streaming (`HttpError` `SVC_HTTP_RESPONSE_TOO_LARGE`). */
  readonly maxResponseBytes?: number;
  /** JSON parse limits (`safeJsonParse`). */
  readonly json?: SafeJsonParseOptions;
  readonly auth?: HttpAuth;
  readonly xsrf?: XsrfOptions | boolean;
  /** Localized or custom messages for `HttpError.message` (see `localizedStatusMessages`). */
  readonly messages?: StatusMessageCatalog;
  /** Use the server's Problem Details `detail` (or top-level `message`) as `HttpError.message`. Default false. */
  readonly trustServerMessages?: TrustServerMessages;
  /**
   * Global error handler for failed calls (never cancellations), for toasts or sign-in redirects.
   * Calls failing the same way (category and status) within `reportDedupeMs` are reported once.
   */
  readonly reportError?: (error: Error) => void;
  /** Default 2 000. */
  readonly reportDedupeMs?: number;
  /** Converts the error a call rejects with (after hooks and `reportError`), e.g. into application errors. */
  readonly mapError?: (error: Error) => Error;
  readonly logger?: HttpLogger;
}

export interface RequestOptions<T = unknown, R extends ResponseType = ResponseType> {
  /** Query parameters appended with `buildQuery` semantics. */
  readonly query?: QueryInput;
  /** Plain values are JSON-serialized; `FormData`, `Blob`, `URLSearchParams`, buffers, streams and strings pass through. */
  readonly body?: unknown;
  readonly headers?: HeadersInit;
  readonly signal?: AbortSignal | undefined;
  /** Default `'json'`. */
  readonly responseType?: R;
  /** Type guard for JSON data; failure throws `HttpError` `SVC_HTTP_INVALID_RESPONSE`. */
  readonly validate?: (data: unknown) => data is T;
  /** Sets `Idempotency-Key` (`true` generates a UUID) and makes POST/PATCH retryable. */
  readonly idempotencyKey?: boolean | string;
  /** Accepted statuses. Default: any 2xx. */
  readonly expectStatus?: number | readonly number[] | ((status: number) => boolean);
  /** Download progress from the response stream; `total` from `Content-Length` when known. */
  readonly onDownloadProgress?: (progress: TransferProgress) => void;
  readonly timeoutMs?: number;
  readonly retry?: Partial<RetryPolicy> | false;
  readonly cache?: RequestCache;
  readonly credentials?: RequestCredentials;
  readonly redirect?: RequestRedirect;
  /** Per-request override of `dedupeGets`. */
  readonly dedupe?: boolean;
  /** Per-request override of the ETag cache. */
  readonly etag?: boolean;
  /** Cancel together with `client.cancelGroup(group)`. */
  readonly group?: string;
  /** Latest wins: starting a call with the same key on the same client cancels the previous one. */
  readonly cancelKey?: string;
  readonly interceptors?: RequestInterceptors;
  readonly hooks?: HttpHooks;
}

/** Response data with metadata. */
export interface HttpResponse<D> {
  readonly data: D;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  /** Final URL after redirects. */
  readonly url: string;
  /** True when served from the ETag cache after a 304. */
  readonly fromCache: boolean;
  /** Correlation id from the response headers (`requestIdOf`). */
  readonly requestId: string | undefined;
}

type BodylessOptions<T, R extends ResponseType> = Omit<RequestOptions<T, R>, 'body'>;

/** Client returned by `createHttpClient`. */
export interface HttpClient {
  request<T = unknown, R extends ResponseType = 'json'>(method: string, url: string, options?: RequestOptions<T, R>): Promise<ResponseTypeMap<T>[R]>;
  /** Like `request` but resolves with status and headers too. */
  send<T = unknown, R extends ResponseType = 'json'>(method: string, url: string, options?: RequestOptions<T, R>): Promise<HttpResponse<ResponseTypeMap<T>[R]>>;
  get<T = unknown, R extends ResponseType = 'json'>(url: string, options?: BodylessOptions<T, R>): Promise<ResponseTypeMap<T>[R]>;
  head(url: string, options?: BodylessOptions<unknown, 'response'>): Promise<Response>;
  delete<T = unknown, R extends ResponseType = 'json'>(url: string, options?: BodylessOptions<T, R>): Promise<ResponseTypeMap<T>[R]>;
  post<T = unknown, R extends ResponseType = 'json'>(url: string, body?: unknown, options?: BodylessOptions<T, R>): Promise<ResponseTypeMap<T>[R]>;
  put<T = unknown, R extends ResponseType = 'json'>(url: string, body?: unknown, options?: BodylessOptions<T, R>): Promise<ResponseTypeMap<T>[R]>;
  patch<T = unknown, R extends ResponseType = 'json'>(url: string, body?: unknown, options?: BodylessOptions<T, R>): Promise<ResponseTypeMap<T>[R]>;
  /** Runtime interceptor registration. */
  readonly interceptors: HttpInterceptors;
  /**
   * Child client that inherits this client's options, interceptors, hooks, auth refresh, and
   * ETag store, and adds its own. `options` override; headers merge (child wins); messages
   * compose (child first). Cancelling the parent cancels the child's calls too.
   */
  extend(options?: HttpClientOptions): HttpClient;
  /** Calls in progress on this client and its children. */
  readonly pending: readonly HttpCallInfo[];
  /** Cancels every call in progress on this client and its children. Returns how many were cancelled. */
  cancelAll(reason?: string): number;
  /** Cancels the calls started with `{ group }`. Returns how many were cancelled. */
  cancelGroup(group: string, reason?: string): number;
  /** Observes the number of calls in progress (for a global progress indicator). Returns an unsubscribe function. */
  onPendingChange(listener: (count: number) => void): () => void;
}

const DEFAULT_POLICY: RetryPolicy = {
  retries: 2,
  methods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'],
  statuses: (s) => isRetryableStatus(s),
  network: true,
  respectRetryAfter: true,
  baseDelayMs: 300,
  maxDelayMs: 30_000,
};

const TOKEN_RE = /^[!#$%&'*+\-.^`|~\w]{1,32}$/;
const IDEMPOTENCY_RE = /^[\x21-\x7e]{1,255}$/;
const MAX_TIMEOUT = 2_147_483_647;
const ERROR_BODY_MAX = 1_000_000;
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

let nextCallId = 1;

const asList = <F>(v: F | readonly F[] | undefined): readonly F[] => (v === undefined ? [] : Array.isArray(v) ? (v as readonly F[]) : [v as F]);

function registry<F>(initial: readonly F[]): InterceptorRegistry<F> & { readonly list: () => readonly F[] } {
  let items: F[] = [...initial];
  return {
    use(interceptor) {
      // Copy on write: a call in progress keeps the list it started with.
      items = [...items, interceptor];
      let removed = false;
      return () => {
        if (removed) return;
        removed = true;
        const i = items.lastIndexOf(interceptor);
        if (i >= 0) items = [...items.slice(0, i), ...items.slice(i + 1)];
      };
    },
    clear() {
      items = [];
    },
    get size() {
      return items.length;
    },
    list: () => items,
  };
}

/** Bounded in-memory ETag store (LRU, 200 entries). */
function memoryEtagStore(max = 200): EtagStore {
  const map = new Map<string, EtagEntry>();
  return {
    get(key) {
      const v = map.get(key);
      if (v) {
        map.delete(key);
        map.set(key, v);
      }
      return v;
    },
    set(key, entry) {
      map.delete(key);
      map.set(key, entry);
      if (map.size > max) {
        const first = map.keys().next();
        if (first.done !== true) map.delete(first.value);
      }
    },
    delete(key) {
      map.delete(key);
    },
  };
}

function assertTimeout(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0 || ms > MAX_TIMEOUT) throw new ValidationError('SVC_HTTP_INVALID_TIMEOUT', 'timeoutMs must be a finite number of milliseconds within the timer range.');
}

function isBodyInit(v: unknown): v is BodyInit {
  return (
    typeof v === 'string' ||
    v instanceof Blob ||
    v instanceof ArrayBuffer ||
    ArrayBuffer.isView(v) ||
    (typeof FormData !== 'undefined' && v instanceof FormData) ||
    v instanceof URLSearchParams ||
    (typeof ReadableStream !== 'undefined' && v instanceof ReadableStream)
  );
}

/** JSON-serializes plain values; passes platform bodies through. */
function serializeBody(body: unknown, headers: Headers): BodyInit | null {
  if (body === undefined || body === null) return null;
  if (isBodyInit(body)) return body;
  // JSON.stringify returns undefined for functions and symbols despite its declared type.
  const stringify: (value: unknown) => string | undefined = JSON.stringify;
  let json: string | undefined;
  try {
    json = stringify(body);
  } catch (e) {
    throw new ValidationError('SVC_HTTP_INVALID_BODY', 'The request body cannot be serialized as JSON.', { cause: e });
  }
  if (json === undefined) throw new ValidationError('SVC_HTTP_INVALID_BODY', 'The request body cannot be serialized as JSON.');
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return json;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

function currentOrigin(): string | undefined {
  const loc = (globalThis as { location?: { href?: unknown } }).location;
  return typeof loc?.href === 'string' ? loc.href : undefined;
}

function statusAccepted(status: number, expect: RequestOptions['expectStatus']): boolean {
  if (expect === undefined) return isSuccess(status);
  if (typeof expect === 'function') return expect(status);
  return typeof expect === 'number' ? status === expect : expect.includes(status);
}

async function discard(response: Response): Promise<void> {
  if (response.body && !response.bodyUsed) await response.body.cancel().catch(() => undefined);
}

function cloneData<D>(data: D): D {
  if (data instanceof ArrayBuffer) return data.slice(0) as D;
  if (typeof data === 'object' && data !== null && !(data instanceof Blob)) return structuredClone(data);
  return data;
}

const isPromiseLike = (v: unknown): v is PromiseLike<unknown> => typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function';

/** A family of clients (root and `extend` children): pending calls and interceptors per node. */
interface ClientNode {
  readonly parent: ClientNode | undefined;
  readonly pending: Map<number, PendingEntry>;
  readonly keys: Map<string, PendingEntry>;
  readonly listeners: Set<(count: number) => void>;
  readonly request: ReturnType<typeof registry<RequestInterceptor>>;
  readonly response: ReturnType<typeof registry<ResponseInterceptor>>;
  readonly error: ReturnType<typeof registry<ErrorInterceptor>>;
  readonly hooks: HttpHooks | undefined;
}

interface PendingEntry {
  readonly info: HttpCallInfo;
  readonly controller: AbortController;
}

/** State shared by a client and the children that inherit the corresponding option. */
interface AuthState {
  refreshing: Promise<void> | undefined;
}
interface ReportState {
  readonly last: Map<string, number>;
}

interface Config {
  readonly options: HttpClientOptions;
  readonly headerSources: readonly (HttpClientOptions['headers'])[];
  readonly etagStore: EtagStore | undefined;
  readonly auth: AuthState;
  readonly report: ReportState;
  readonly messages: StatusMessageCatalog | undefined;
}

function nodeFor(parent: ClientNode | undefined, options: HttpClientOptions): ClientNode {
  return {
    parent,
    pending: new Map(),
    keys: new Map(),
    listeners: new Set(),
    request: registry(asList(options.onRequest)),
    response: registry(asList(options.onResponse)),
    error: registry(asList(options.onError)),
    hooks: options.hooks,
  };
}

/** Options a child client inherits: everything except the parent's own interceptors and hooks, which run through the chain. */
function inheritable(options: HttpClientOptions): HttpClientOptions {
  const out: { -readonly [K in keyof HttpClientOptions]: HttpClientOptions[K] } = { ...options };
  delete out.onRequest;
  delete out.onResponse;
  delete out.onError;
  delete out.hooks;
  return out;
}

function mergeRetry(parent: HttpClientOptions['retry'], child: HttpClientOptions['retry']): HttpClientOptions['retry'] {
  if (child === undefined) return parent;
  if (child === false) return false;
  return { ...(parent === false ? {} : parent), ...child };
}

/**
 * Creates a `fetch` client with timeouts, idempotent-only retries (honouring `Retry-After`),
 * in-flight GET de-duplication, an optional ETag cache, typed JSON guards, RFC 9457 problem
 * details on errors, auth refresh and CSRF headers, runtime interceptors, lifecycle hooks,
 * cancellation (all, by group, or latest-wins), and child clients.
 *
 * Every transport or HTTP failure rejects with an `HttpError` whose `category` says why:
 * non-2xx -> `SVC_HTTP_STATUS` (message from the catalog, `fields` from problem details);
 * network failure -> status 0 `SVC_HTTP_NETWORK` (`network` or `offline`); deadline ->
 * `SVC_HTTP_TIMEOUT` (`timeout`); cancellation -> `SVC_HTTP_ABORTED` (`cancelled`, never retried
 * or reported); unparsable or invalid body -> `SVC_HTTP_INVALID_RESPONSE` (`bad-response`);
 * `maxResponseBytes` exceeded -> `SVC_HTTP_RESPONSE_TOO_LARGE` (`too-large`). Invalid arguments
 * throw `ValidationError`. Redirects follow `fetch` defaults: browsers drop `Authorization` on
 * cross-origin redirects and cookies follow `credentials` (default `'same-origin'`).
 * @example
 * interface User { id: number; name: string }
 * const isUser = (d: unknown): d is User => typeof d === 'object' && d !== null && 'id' in d && 'name' in d;
 * const api = createHttpClient({
 *   baseUrl: '/api',
 *   auth: { getToken: async () => sessionStorage.getItem('token'), refresh: async () => { await fetch('/auth/refresh', { method: 'POST' }); } },
 *   hooks: { onError: (error) => console.warn(error.message) },
 * });
 * const user = await api.get('/users/42', { validate: isUser });
 * await api.post('/orders', { sku: 'LAPTOP-14', qty: 1 }, { idempotencyKey: true });
 * @example
 * // Interceptors transform; child clients inherit and add.
 * import { createMockFetch } from '@absoluteui/services/http-mock';
 * const fetch = createMockFetch([{ url: /./, respond: (r) => ({ body: { tenant: r.headers.get('x-tenant'), path: r.url.pathname } }) }]);
 * const api = createHttpClient({ fetch, baseUrl: 'http://localhost/api' });
 * const remove = api.interceptors.request.use((req) => { req.headers.set('x-tenant', 'acme'); return undefined; });
 * const hr = api.extend({ baseUrl: 'http://localhost/hr' });
 * await hr.get('/employees'); // => { tenant: 'acme', path: '/hr/employees' }
 * remove();
 * await api.get('/employees'); // => { tenant: null, path: '/api/employees' }
 * @example
 * // Cancellation: latest wins, groups, everything.
 * import { createMockFetch } from '@absoluteui/services/http-mock';
 * import { isCancelled } from '@absoluteui/services/http';
 * const fetch = createMockFetch([{ url: /./, delayMs: 20, respond: (r) => ({ body: [r.url.searchParams.get('q')] }) }]);
 * const api = createHttpClient({ fetch, baseUrl: 'http://localhost' });
 * const first = api.get('/search', { query: { q: 'ad' }, cancelKey: 'people' });
 * const second = api.get('/search', { query: { q: 'ada' }, cancelKey: 'people' });
 * isCancelled(await first.catch((e: unknown) => e)); // => true
 * await second; // => ['ada']
 * const report = api.get('/report', { group: 'reports' });
 * api.cancelGroup('reports'); // => 1
 * isCancelled(await report.catch((e: unknown) => e)); // => true
 * @example
 * // Errors and hooks: categories, default messages, one report for parallel failures.
 * import { createMockFetch } from '@absoluteui/services/http-mock';
 * import { HttpError } from '@absoluteui/helpers/error';
 * const fetch = createMockFetch([{ url: /./, status: 401 }]);
 * const reported: string[] = [];
 * const outcomes: string[] = [];
 * const api = createHttpClient({ fetch, retry: false, reportError: (e) => { reported.push(e.message); }, hooks: { onComplete: (r) => { outcomes.push(r.outcome); } } });
 * const [e] = await Promise.all([api.get('http://localhost/a').catch((x: unknown) => x), api.get('http://localhost/b').catch((x: unknown) => x)]);
 * e instanceof HttpError && e.category; // => 'unauthorized'
 * reported; // => ['Your session has ended. Sign in again to continue.']
 * outcomes; // => ['error', 'error']
 */
export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const etagStore = options.etagCache === true ? memoryEtagStore() : options.etagCache === false || options.etagCache === undefined ? undefined : options.etagCache;
  return buildClient({ options, headerSources: [options.headers], etagStore, auth: { refreshing: undefined }, report: { last: new Map() }, messages: options.messages }, nodeFor(undefined, options));
}

function buildClient(config: Config, node: ClientNode): HttpClient {
  const options = config.options;
  const clientTimeout = options.timeoutMs ?? 30_000;
  assertTimeout(clientTimeout);
  const clientRetry = options.retry;
  const etagStore = config.etagStore;
  const xsrf = options.xsrf === true ? {} : options.xsrf === false ? undefined : options.xsrf;
  const log = options.logger;
  const inflight = new Map<string, { readonly promise: Promise<HttpResponse<unknown>>; readonly controller: AbortController; refs: number }>();
  const reportDedupeMs = options.reportDedupeMs ?? 2_000;
  if (!Number.isFinite(reportDedupeMs) || reportDedupeMs < 0) throw new ValidationError('SVC_HTTP_INVALID_DEDUPE', 'reportDedupeMs must be a non-negative number of milliseconds.');

  /** Root first, this client last. */
  const chain: readonly ClientNode[] = (() => {
    const out: ClientNode[] = [];
    for (let n: ClientNode | undefined = node; n; n = n.parent) out.unshift(n);
    return out;
  })();

  const warn = (message: string, context: Readonly<Record<string, unknown>>): void => {
    log?.warn?.(message, context);
  };

  /** Runs one hook of every level; failures are logged and never break the call. */
  const fire = (hooks: readonly (HttpHooks | undefined)[], name: keyof HttpHooks, run: (h: HttpHooks) => unknown): void => {
    for (const h of hooks) {
      if (h?.[name] === undefined) continue;
      try {
        const r = run(h);
        if (isPromiseLike(r)) r.then(undefined, (e: unknown) => { warn('http hook failed', { hook: name, error: toError(e).name }); });
      } catch (e) {
        warn('http hook failed', { hook: name, error: toError(e).name });
      }
    }
  };

  const notify = (n: ClientNode): void => {
    const count = n.pending.size;
    for (const l of n.listeners) {
      try {
        l(count);
      } catch (e) {
        warn('http pending listener failed', { error: toError(e).name });
      }
    }
  };

  const resolveFetch = (): FetchLike => {
    if (options.fetch) return options.fetch;
    if (typeof globalThis.fetch !== 'function') throw new HelperError('SVC_HTTP_NO_FETCH', 'fetch is not available in this environment.', { kind: 'unsupported' });
    return globalThis.fetch.bind(globalThis);
  };

  const refreshOnce = (refresh: () => Promise<void>): Promise<void> => {
    config.auth.refreshing ??= Promise.resolve()
      .then(refresh)
      .finally(() => {
        config.auth.refreshing = undefined;
      });
    return config.auth.refreshing;
  };

  const buildUrl = (url: string, query: QueryInput | undefined): string => {
    let full = url;
    if (options.baseUrl !== undefined && !isAbsoluteUrl(url) && !url.startsWith('//')) {
      const cut = url.search(/[?#]/);
      const path = cut < 0 ? url : url.slice(0, cut);
      const suffix = cut < 0 ? '' : url.slice(cut);
      full = (path === '' ? options.baseUrl : joinUrl(options.baseUrl, path)) + suffix;
    }
    if (!isSafeUrl(full, { allowedSchemes: ['http', 'https'] })) throw new ValidationError('SVC_HTTP_INVALID_URL', 'The request URL is not an allowed http(s) URL.');
    return query === undefined ? full : withQuery(full, query);
  };

  const policyFor = (override: Partial<RetryPolicy> | false | undefined): RetryPolicy | undefined => {
    if (clientRetry === false || override === false) return undefined;
    return { ...DEFAULT_POLICY, ...clientRetry, ...override };
  };

  const statusRetryable = (policy: RetryPolicy, status: number): boolean => (typeof policy.statuses === 'function' ? policy.statuses(status) : policy.statuses.includes(status));

  /** Maps an abort of `signal` to the error to throw: the deadline's timeout, otherwise a cancellation. */
  const abortError = (signal: AbortSignal, method: string, url: string): HttpError => {
    const reason: unknown = signal.reason;
    if (reason instanceof HttpError) return reason;
    return cancelledError(method, url, reason);
  };

  async function readText(response: Response, signal: AbortSignal, maxBytes: number | undefined, onProgress: ((p: TransferProgress) => void) | undefined): Promise<string> {
    if (maxBytes === undefined && onProgress === undefined) return raceSignal(response.text(), signal);
    return utf8Decode(await readBytes(response, { signal, maxBytes, onProgress }));
  }

  async function parseBody(response: Response, method: string, url: string, responseType: ResponseType, signal: AbortSignal, onProgress: ((p: TransferProgress) => void) | undefined): Promise<unknown> {
    const maxBytes = options.maxResponseBytes;
    if (responseType === 'response') return response;
    const empty = method === 'HEAD' || NULL_BODY.has(response.status);
    if (responseType === 'stream') {
      const body = empty || !response.body ? new ReadableStream<Uint8Array>({ start: (c) => { c.close(); } }) : response.body;
      return maxBytes === undefined && onProgress === undefined ? body : meterStream(body, expectedLength(response.headers), maxBytes, onProgress);
    }
    try {
      if (responseType === 'blob') {
        if (empty) return new Blob([]);
        if (maxBytes === undefined && onProgress === undefined) return await raceSignal(response.blob(), signal);
        const type = response.headers.get('content-type') ?? '';
        return new Blob([await readBytes(response, { signal, maxBytes, onProgress })], { type });
      }
      if (responseType === 'arrayBuffer') {
        if (empty) return new ArrayBuffer(0);
        if (maxBytes === undefined && onProgress === undefined) return await raceSignal(response.arrayBuffer(), signal);
        return (await readBytes(response, { signal, maxBytes, onProgress })).buffer;
      }
      const text = empty ? '' : await readText(response, signal, maxBytes, onProgress);
      if (responseType === 'text') return text;
      if (text === '') return undefined;
      const parsed = safeJsonParse(text, options.json);
      if (!parsed.ok) throw invalidResponseError(response.status, method, url, parsed.error);
      return parsed.value;
    } catch (e) {
      if (e instanceof LimitError && e.code === 'SVC_HTTP_RESPONSE_TOO_LARGE') throw tooLargeError(response.status, method, url, e);
      throw e;
    }
  }

  async function errorFor(response: Response, method: string, url: string, signal: AbortSignal): Promise<HttpError> {
    let bodyText: string | undefined;
    try {
      const limit = Math.min(options.maxResponseBytes ?? ERROR_BODY_MAX, ERROR_BODY_MAX);
      bodyText = utf8Decode(await readBytes(response, { signal, maxBytes: limit }));
    } catch {
      if (signal.aborted) throw abortError(signal, method, url);
      bodyText = undefined;
    }
    return responseError({ status: response.status, statusText: response.statusText, headers: response.headers, bodyText, method, url, messages: config.messages, trustServerMessages: options.trustServerMessages });
  }

  const etagKey = (url: string, responseType: ResponseType, headers: Headers): string => {
    const authz = headers.get('authorization');
    return `${responseType} ${url}${authz === null ? '' : ` #${fnv1a32(authz).toString(36)}`}`;
  };

  const resolveHeaders = async (): Promise<Headers> => {
    const out = new Headers();
    for (const source of config.headerSources) {
      const h = typeof source === 'function' ? await source() : source;
      new Headers(h).forEach((v, k) => { out.set(k, v); });
    }
    return out;
  };

  /** Performs the request with retries; returns raw (unvalidated) data. `signal` covers the call (caller, cancellation). */
  async function execute(method: string, url: string, opts: RequestOptions, call: HttpCallInfo, callSignal: AbortSignal): Promise<HttpResponse<unknown>> {
    const responseType = opts.responseType ?? 'json';
    const timeoutMs = opts.timeoutMs ?? clientTimeout;
    assertTimeout(timeoutMs);
    const started = Date.now();
    const safeUrl = safeUrlForLog(url);
    const hookLevels = [...chain.map((n) => n.hooks), opts.hooks];
    const requestInterceptors = [...chain.flatMap((n) => n.request.list()), ...asList(opts.interceptors?.request)];
    const responseInterceptors = [...asList(opts.interceptors?.response), ...[...chain].reverse().flatMap((n) => n.response.list())];
    const errorInterceptors = [...asList(opts.interceptors?.error), ...[...chain].reverse().flatMap((n) => n.error.list())];

    const idemKey = opts.idempotencyKey === true ? uuidV4() : typeof opts.idempotencyKey === 'string' ? opts.idempotencyKey : undefined;
    if (idemKey !== undefined && !IDEMPOTENCY_RE.test(idemKey)) throw new ValidationError('SVC_HTTP_INVALID_IDEMPOTENCY_KEY', 'The idempotency key must be 1 to 255 visible ASCII characters.');
    const policy = policyFor(opts.retry);
    const replayable = !(typeof ReadableStream !== 'undefined' && opts.body instanceof ReadableStream);
    const methodRetryable = policy !== undefined && (policy.methods.some((m) => m.toUpperCase() === method) || (idemKey !== undefined && (method === 'POST' || method === 'PATCH')));
    const retries = policy !== undefined && methodRetryable && replayable ? policy.retries : 0;
    const useEtag = etagStore !== undefined && (opts.etag ?? true) && method === 'GET' && (responseType === 'json' || responseType === 'text') && opts.cache !== 'no-store' && opts.cache !== 'reload';

    const baseHeaders = await resolveHeaders();
    const deadline = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => { deadline.abort(timeoutError(method, url, config.messages)); }, timeoutMs) : undefined;
    const signal = anySignal([callSignal, deadline.signal]);
    // A function, so TypeScript does not narrow `aborted` across awaits.
    const isAborted = (): boolean => signal.aborted;

    const buildRequest = async (attempt: number): Promise<{ req: HttpRequestContext; token: string | null }> => {
      const headers = new Headers(baseHeaders);
      new Headers(opts.headers).forEach((v, k) => { headers.set(k, v); });
      if (!headers.has('accept') && responseType === 'json') headers.set('accept', 'application/json, application/problem+json;q=0.9, */*;q=0.1');
      const body = serializeBody(opts.body, headers);
      let token: string | null = null;
      if (options.auth && !headers.has('authorization')) {
        token = await options.auth.getToken();
        if (token !== null) headers.set('authorization', `${options.auth.scheme ?? 'Bearer'} ${token}`);
      }
      if (idemKey !== undefined) headers.set('idempotency-key', idemKey);
      if (xsrf && !isSafeMethod(method)) {
        const origin = currentOrigin();
        const target = origin === undefined ? undefined : new URL(url, origin).href;
        if (origin !== undefined && target !== undefined && isSameOrigin(target, origin)) {
          const headerName = xsrf.headerName ?? 'X-XSRF-TOKEN';
          const value = readCookie(xsrf.cookieName ?? 'XSRF-TOKEN');
          if (value !== undefined && !headers.has(headerName)) headers.set(headerName, value);
        }
      }
      const req: HttpRequestContext = { method, url, headers, body, credentials: opts.credentials ?? options.credentials ?? 'same-origin', cache: opts.cache, redirect: opts.redirect, signal, attempt };
      return { req, token };
    };

    const runResponseInterceptors = async (response: Response, req: HttpRequestContext, info: HttpRequestInfo | undefined): Promise<Response> => {
      let current = response;
      for (const i of responseInterceptors) {
        const r = await i(current, req);
        if (r) current = r;
      }
      const final = current;
      fire(hookLevels, 'beforeResponse', (h) => h.beforeResponse?.({ request: info, response: final }));
      return current;
    };

    const exchange = async (req: HttpRequestContext): Promise<Response> => {
      let current = req;
      for (const i of requestInterceptors) {
        const r = await i(current);
        if (r instanceof Response) return runResponseInterceptors(r, current, undefined);
        if (r) current = r;
      }
      if (signal.aborted) throw abortError(signal, method, url);
      const info: HttpRequestInfo = { call, method: current.method, url: current.url, headers: redactHeaders(current.headers), attempt: current.attempt };
      fire(hookLevels, 'beforeRequest', (h) => h.beforeRequest?.(info));
      log?.debug?.('http request', { method: current.method, url: safeUrlForLog(current.url), headers: info.headers, attempt: current.attempt });
      const init: RequestInit & { duplex?: 'half' } = {
        method: current.method,
        headers: current.headers,
        body: current.body,
        credentials: current.credentials,
        signal,
        ...(current.cache === undefined ? {} : { cache: current.cache }),
        ...(current.redirect === undefined ? {} : { redirect: current.redirect }),
        ...(typeof ReadableStream !== 'undefined' && current.body instanceof ReadableStream ? { duplex: 'half' as const } : {}),
      };
      const sent = Date.now();
      let response: Response;
      try {
        response = await raceSignal(resolveFetch()(current.url, init), signal);
      } catch (e) {
        const error = isAborted() ? abortError(signal, method, url) : e instanceof HelperError ? e : networkError(method, url, e, config.messages);
        fire(hookLevels, 'afterRequest', (h) => h.afterRequest?.({ request: info, response: undefined, error, durationMs: Date.now() - sent }));
        throw error;
      }
      const received = response;
      fire(hookLevels, 'afterRequest', (h) => h.afterRequest?.({ request: info, response: received, error: undefined, durationMs: Date.now() - sent }));
      return runResponseInterceptors(response, current, info);
    };

    const accepted = (data: unknown, response: Response, fromCache: boolean, status = response.status): HttpResponse<unknown> => {
      const result: HttpResponse<unknown> = { data, status, statusText: response.statusText, headers: response.headers, url: response.url || url, fromCache, requestId: requestIdOf(response.headers) };
      fire(hookLevels, 'afterResponse', (h) => h.afterResponse?.({ call, response: result }));
      return result;
    };

    const attemptOnce = async (attempt: number): Promise<HttpResponse<unknown>> => {
      const first = await buildRequest(attempt);
      const token = first.token;
      let req = first.req;
      const cacheKey = useEtag ? etagKey(url, responseType, req.headers) : undefined;
      const cached = cacheKey !== undefined && etagStore ? await etagStore.get(cacheKey) : undefined;
      if (cached && !req.headers.has('if-none-match')) req.headers.set('if-none-match', cached.etag);
      let response = await exchange(req);
      if (response.status === 401 && options.auth?.refresh) {
        const refresh = options.auth.refresh.bind(options.auth);
        await discard(response);
        try {
          const now = await options.auth.getToken();
          if (now === token) await refreshOnce(refresh);
        } catch (e) {
          warn('http auth refresh failed', { method, url: safeUrl, code: toError(e).name });
        }
        ({ req } = await buildRequest(attempt));
        if (cached && !req.headers.has('if-none-match')) req.headers.set('if-none-match', cached.etag);
        response = await exchange(req);
      }
      log?.debug?.('http response', { method, url: safeUrl, status: response.status, durationMs: Date.now() - started });
      if (response.status === 304 && cached) {
        await discard(response);
        return accepted(cloneData(cached.body), response, true, 304);
      }
      if (!statusAccepted(response.status, opts.expectStatus)) throw await errorFor(response, method, url, signal);
      const data = await parseBody(response, method, url, responseType, signal, opts.onDownloadProgress);
      if (cacheKey !== undefined && etagStore && response.status === 200) {
        const etag = response.headers.get('etag');
        if (etag !== null && etag.length <= 1024) await etagStore.set(cacheKey, { etag, body: cloneData(data) });
      }
      return accepted(data, response, false);
    };

    try {
      try {
        return await retry(attemptOnce, {
          retries,
          signal,
          minDelay: policy?.baseDelayMs ?? 0,
          maxDelay: policy?.maxDelayMs ?? 0,
          retryIf: (e) => {
            if (!policy || !(e instanceof HttpError)) return false;
            if (e.status === 0) return policy.network && e.code === 'SVC_HTTP_NETWORK';
            if (e.code !== 'SVC_HTTP_STATUS' || !statusRetryable(policy, e.status)) return false;
            const ra = e.retryAfterMs;
            return !(policy.respectRetryAfter && ra !== undefined && ra > policy.maxDelayMs);
          },
          delayFor: (e) => {
            const ra = e instanceof HttpError ? e.retryAfterMs : undefined;
            return policy?.respectRetryAfter === true ? ra : undefined;
          },
          onRetry: (e, attempt, delayMs) => {
            warn('http retry', { method, url: safeUrl, attempt, delayMs, status: e instanceof HttpError ? e.status : undefined });
            fire(hookLevels, 'onRetry', (h) => h.onRetry?.({ call, error: e, attempt, delayMs }));
          },
        });
      } catch (e) {
        if (signal.aborted && !(e instanceof HttpError)) throw abortError(signal, method, url);
        throw e;
      }
    } catch (e) {
      const error = toError(e);
      if (!isAbortError(error)) {
        for (const i of errorInterceptors) {
          const r = await i(error, { method, url: safeUrl });
          if (r instanceof Response && isSuccess(r.status)) {
            const data = await parseBody(r, method, url, responseType, new AbortController().signal, undefined);
            return { data, status: r.status, statusText: r.statusText, headers: r.headers, url: r.url || url, fromCache: false, requestId: requestIdOf(r.headers) };
          }
        }
      }
      throw error;
    } finally {
      // For 'stream' and 'response' the deadline covers the time to headers; the caller's signal still cancels the body.
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** Registers a call on this client and its ancestors; returns the unregister function. */
  const track = (entry: PendingEntry): (() => void) => {
    for (const n of chain) {
      n.pending.set(entry.info.id, entry);
      notify(n);
    }
    const key = entry.info.cancelKey;
    if (key !== undefined) {
      node.keys.get(key)?.controller.abort('superseded');
      node.keys.set(key, entry);
    }
    return () => {
      if (key !== undefined && node.keys.get(key) === entry) node.keys.delete(key);
      for (const n of chain) {
        if (n.pending.delete(entry.info.id)) notify(n);
      }
    };
  };

  const report = (error: Error): void => {
    if (!options.reportError) return;
    const key = error instanceof HttpError ? `${error.category}:${String(error.status)}` : error.name;
    const now = Date.now();
    const last = config.report.last.get(key);
    if (last !== undefined && now - last < reportDedupeMs) return;
    config.report.last.set(key, now);
    try {
      options.reportError(error);
    } catch (e) {
      warn('http reportError failed', { error: toError(e).name });
    }
  };

  async function send<T, R extends ResponseType>(methodIn: string, urlIn: string, opts: RequestOptions<T, R> = {}): Promise<HttpResponse<ResponseTypeMap<T>[R]>> {
    const method = methodIn.toUpperCase();
    if (!TOKEN_RE.test(method)) throw new ValidationError('SVC_HTTP_INVALID_METHOD', 'The HTTP method is not a valid token.');
    const url = buildUrl(urlIn, opts.query);
    const responseType: ResponseType = opts.responseType ?? 'json';
    const hookLevels = [...chain.map((n) => n.hooks), opts.hooks];
    const call: HttpCallInfo = { id: nextCallId++, method, url, group: opts.group, cancelKey: opts.cancelKey, startedAt: Date.now() };
    const controller = new AbortController();
    const callSignal = anySignal([opts.signal, controller.signal]);
    const untrack = track({ info: call, controller });
    let outcome: HttpOutcome = 'error';
    let response: HttpResponse<unknown> | undefined;
    let failure: Error | undefined;
    try {
      const dedupe = (opts.dedupe ?? options.dedupeGets ?? true) && method === 'GET' && opts.body === undefined && responseType !== 'stream' && responseType !== 'response' && opts.onDownloadProgress === undefined;
      const { validate, ...rest } = opts;
      let result: HttpResponse<unknown>;
      if (dedupe) {
        const h = new Headers(opts.headers);
        const hk: string[] = [];
        h.forEach((v, k) => hk.push(`${k}:${v}`));
        const key = `${responseType} ${url} ${hk.sort().join('\n')} ${String(opts.timeoutMs)} ${String(opts.cache)}`;
        let shared = inflight.get(key);
        const creator = shared === undefined;
        if (!shared) {
          // The shared request is cancelled only when every caller has left (docs/PLAN-R6.md section 5).
          const sharedController = new AbortController();
          const promise = execute(method, url, rest, call, sharedController.signal).finally(() => {
            if (inflight.get(key)?.promise === promise) inflight.delete(key);
          });
          shared = { promise, controller: sharedController, refs: 0 };
          inflight.set(key, shared);
        }
        const entry = shared;
        entry.refs++;
        try {
          const got = await raceSignal(entry.promise, callSignal);
          // Joined callers get their own copy so one caller's mutations never leak into another's data.
          result = creator ? got : { ...got, data: cloneData(got.data) };
        } catch (e) {
          throw callSignal.aborted ? abortError(callSignal, method, url) : toError(e);
        } finally {
          entry.refs--;
          if (entry.refs === 0 && callSignal.aborted) entry.controller.abort(callSignal.reason);
        }
      } else {
        result = await execute(method, url, rest, call, callSignal);
      }
      if (validate && responseType === 'json' && !validate(result.data)) throw invalidResponseError(result.status, method, url);
      response = result;
      outcome = 'success';
      fire(hookLevels, 'onSuccess', (hk) => hk.onSuccess?.(result, call));
      // The data shape is guaranteed by `responseType` (and by `validate` for JSON when supplied).
      return result as HttpResponse<ResponseTypeMap<T>[R]>;
    } catch (e) {
      const error = callSignal.aborted && !(e instanceof HttpError && e.category !== 'cancelled') ? abortError(callSignal, method, url) : toError(e);
      failure = error;
      if (error instanceof HttpError && error.category === 'cancelled') {
        outcome = 'cancelled';
        fire(hookLevels, 'onCancel', (hk) => hk.onCancel?.(error, call));
      } else {
        fire(hookLevels, 'onError', (hk) => hk.onError?.(error, call));
        report(error);
      }
      throw options.mapError ? options.mapError(error) : error;
    } finally {
      untrack();
      const result: HttpCallResult = { call, outcome, durationMs: Date.now() - call.startedAt, response, error: failure };
      fire(hookLevels, 'onComplete', (hk) => hk.onComplete?.(result));
    }
  }

  const request = async <T, R extends ResponseType>(method: string, url: string, opts?: RequestOptions<T, R>): Promise<ResponseTypeMap<T>[R]> => (await send(method, url, opts)).data;

  const cancelWhere = (match: (e: PendingEntry) => boolean, reason: string): number => {
    let n = 0;
    for (const e of [...node.pending.values()]) {
      if (!match(e) || e.controller.signal.aborted) continue;
      e.controller.abort(reason);
      n++;
    }
    return n;
  };

  return {
    request,
    send,
    get: (url, opts) => request('GET', url, opts),
    head: (url, opts) => request('HEAD', url, { ...opts, responseType: 'response' }),
    delete: (url, opts) => request('DELETE', url, opts),
    post: (url, body, opts) => request('POST', url, { ...opts, body }),
    put: (url, body, opts) => request('PUT', url, { ...opts, body }),
    patch: (url, body, opts) => request('PATCH', url, { ...opts, body }),
    interceptors: { request: node.request, response: node.response, error: node.error },
    extend(child = {}) {
      const retryPolicy = mergeRetry(options.retry, child.retry);
      const merged: HttpClientOptions = { ...inheritable(options), ...child, ...(retryPolicy === undefined ? {} : { retry: retryPolicy }) };
      const childEtag = child.etagCache === undefined ? etagStore : child.etagCache === true ? memoryEtagStore() : child.etagCache === false ? undefined : child.etagCache;
      return buildClient(
        {
          options: merged,
          headerSources: child.headers === undefined ? config.headerSources : [...config.headerSources, child.headers],
          etagStore: childEtag,
          auth: child.auth === undefined ? config.auth : { refreshing: undefined },
          report: child.reportError === undefined ? config.report : { last: new Map() },
          messages: child.messages === undefined ? config.messages : composeStatusMessages(child.messages, config.messages),
        },
        nodeFor(node, child),
      );
    },
    get pending() {
      return [...node.pending.values()].map((e) => e.info);
    },
    cancelAll: (reason = 'cancelled') => cancelWhere(() => true, reason),
    cancelGroup: (group, reason = 'cancelled') => cancelWhere((e) => e.info.group === group, reason),
    onPendingChange(listener) {
      node.listeners.add(listener);
      return () => {
        node.listeners.delete(listener);
      };
    },
  };
}
