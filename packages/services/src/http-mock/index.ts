/**
 * In-memory `fetch` for tests, demos, and prototypes (docs/PLAN-R6.md D9): a route table with
 * statuses, JSON bodies, headers, delays, and network failures, plus a call log. Pass it as
 * `createHttpClient({ fetch })`.
 */
import { abortReason, sleep } from '@absoluteui/helpers/async';
import { ValidationError } from '@absoluteui/helpers/error';
import { safeJsonParse } from '@absoluteui/helpers/json';
import type { FetchLike } from '../http/client.js';

/** A request as a mock route sees it. */
export interface MockRequest {
  readonly method: string;
  readonly url: URL;
  readonly headers: Headers;
  /** The body when it was a string (JSON bodies are strings), otherwise `undefined`. */
  readonly bodyText: string | undefined;
  /** The body parsed as JSON, or `undefined` when it is not JSON. */
  readonly json: unknown;
}

/** What a `respond` function may return instead of a `Response`. */
export interface MockReply {
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: HeadersInit;
}

export interface MockRoute {
  /** Default: any method. */
  readonly method?: string;
  /**
   * A path (`'/api/employees'`, matched against the pathname; include `?` to match the query too),
   * a full URL, a regular expression tested against the full URL, or a predicate.
   */
  readonly url: string | RegExp | ((url: URL) => boolean);
  /** Default 200. */
  readonly status?: number;
  /** Plain values are sent as JSON; strings, `Blob`s, and buffers as they are. */
  readonly body?: unknown;
  readonly headers?: HeadersInit;
  /** Simulated latency; honours the request's abort signal. */
  readonly delayMs?: number;
  /** Fail like a dropped connection (`fetch` rejects with `TypeError`). */
  readonly network?: boolean;
  /** Dynamic reply; wins over `status`, `body`, and `headers`. */
  readonly respond?: (request: MockRequest) => Response | MockReply | Promise<Response | MockReply>;
  /** Use the route this many times, then fall through to later routes. Default: unlimited. */
  readonly times?: number;
}

/** One recorded call. */
export interface MockCall {
  readonly request: MockRequest;
  /** Index of the matching route, or -1. */
  readonly route: number;
}

export interface MockFetchOptions {
  /** Base for relative request URLs. Default `'http://localhost/'`. */
  readonly base?: string;
  /** Unmatched requests: `'throw'` (default; rejects with an `Error` naming the request), `'network'`, or a reply. */
  readonly onUnhandled?: 'throw' | 'network' | ((request: MockRequest) => Response | MockReply);
}

/** A `FetchLike` with a call log. */
export interface MockFetch extends FetchLike {
  readonly calls: readonly MockCall[];
  /** Adds a route after the existing ones. */
  route(route: MockRoute): void;
  /** Clears the call log and restores every route's `times`. */
  reset(): void;
}

const isBinary = (v: unknown): v is Blob | ArrayBuffer | ArrayBufferView => v instanceof Blob || v instanceof ArrayBuffer || ArrayBuffer.isView(v);

const isProblem = (v: unknown): boolean => typeof v === 'object' && v !== null && ('title' in v || 'type' in v) && 'status' in v;

/** Bytes of a buffer or view, copied into a plain `ArrayBuffer` (Blob parts cannot be shared memory). */
function copyBytes(value: ArrayBuffer | ArrayBufferView): Uint8Array<ArrayBuffer> {
  const view = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const out = new Uint8Array(view.byteLength);
  out.set(view);
  return out;
}

function toResponse(reply: MockReply): Response {
  const status = reply.status ?? 200;
  if (!Number.isInteger(status) || status < 200 || status > 599) throw new ValidationError('SVC_HTTP_MOCK_STATUS', 'A mock status must be an integer from 200 to 599.');
  const headers = new Headers(reply.headers);
  const nullBody = status === 204 || status === 205 || status === 304;
  let body: BodyInit | null = null;
  if (!nullBody && reply.body !== undefined) {
    if (typeof reply.body === 'string') body = reply.body;
    else if (isBinary(reply.body)) body = reply.body instanceof Blob ? reply.body : new Blob([copyBytes(reply.body)]);
    else {
      body = JSON.stringify(reply.body);
      if (!headers.has('content-type')) headers.set('content-type', status >= 400 && isProblem(reply.body) ? 'application/problem+json' : 'application/json');
    }
  }
  return new Response(body, { status, headers });
}

function matches(route: MockRoute, method: string, url: URL): boolean {
  if (route.method !== undefined && route.method.toUpperCase() !== method) return false;
  const u = route.url;
  if (typeof u === 'function') return u(url);
  if (u instanceof RegExp) return u.test(url.href);
  if (/^https?:\/\//i.test(u)) return u === url.href || u === `${url.origin}${url.pathname}`;
  return u.includes('?') ? u === url.pathname + url.search : u === url.pathname;
}

/**
 * Creates an in-memory `fetch`. Routes are tried in order; the first match answers.
 * @example
 * import { createHttpClient } from '@absoluteui/services/http';
 * const fetch = createMockFetch([
 *   { method: 'GET', url: '/api/employees/42', body: { id: 42, name: 'Ada' } },
 *   { method: 'POST', url: '/api/leave', status: 422, body: { title: 'Invalid', status: 422, errors: { days: 'Choose at least one day.' } } },
 * ]);
 * const api = createHttpClient({ fetch, retry: false });
 * await api.get('http://localhost/api/employees/42'); // => { id: 42, name: 'Ada' }
 * const error = await api.post('http://localhost/api/leave', { days: 0 }).catch((e: unknown) => e);
 * (error as { status: number }).status; // => 422
 * fetch.calls.length; // => 2
 * fetch.calls[1]?.request.json; // => { days: 0 }
 */
export function createMockFetch(routes: readonly MockRoute[] = [], options: MockFetchOptions = {}): MockFetch {
  const table: MockRoute[] = [...routes];
  const used = new Map<number, number>();
  const calls: MockCall[] = [];
  const base = options.base ?? 'http://localhost/';

  const fetchImpl = async (input: string, init: RequestInit): Promise<Response> => {
    const signal = init.signal ?? undefined;
    if (signal?.aborted) throw abortReason(signal);
    const method = (init.method ?? 'GET').toUpperCase();
    const url = new URL(input, base);
    const bodyText = typeof init.body === 'string' ? init.body : undefined;
    const parsed = bodyText === undefined ? undefined : safeJsonParse(bodyText);
    const request: MockRequest = { method, url, headers: new Headers(init.headers), bodyText, json: parsed?.ok === true ? parsed.value : undefined };
    const index = table.findIndex((r, i) => matches(r, method, url) && (r.times === undefined || (used.get(i) ?? 0) < r.times));
    calls.push({ request, route: index });
    const route = index < 0 ? undefined : table[index];
    if (!route) {
      const unhandled = options.onUnhandled ?? 'throw';
      if (unhandled === 'network') throw new TypeError('Failed to fetch');
      if (unhandled === 'throw') throw new Error(`No mock route for ${method} ${url.pathname}.`);
      const r = unhandled(request);
      return r instanceof Response ? r : toResponse(r);
    }
    used.set(index, (used.get(index) ?? 0) + 1);
    if (route.delayMs !== undefined && route.delayMs > 0) await sleep(route.delayMs, signal ? { signal } : {});
    if (route.network === true) throw new TypeError('Failed to fetch');
    if (route.respond) {
      const r = await route.respond(request);
      return r instanceof Response ? r : toResponse(r);
    }
    return toResponse({ ...(route.status === undefined ? {} : { status: route.status }), ...(route.body === undefined ? {} : { body: route.body }), ...(route.headers === undefined ? {} : { headers: route.headers }) });
  };

  return Object.assign(fetchImpl, {
    calls,
    route(route: MockRoute) {
      table.push(route);
    },
    reset() {
      calls.length = 0;
      used.clear();
    },
  });
}
