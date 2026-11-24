/**
 * Response-shape assertions and error classification. Works with `Response` or any object with
 * `status` and `headers.get()`; performs no I/O.
 */
import { HelperError, HttpError, isAbortError } from '../error/index.js';
import { isJsonContentType, parseContentType } from './headers.js';
import { isSuccess, statusText } from './status.js';

/** Minimal response shape (satisfied by the Fetch API `Response`). */
export interface ResponseLike {
  readonly status: number;
  readonly statusText?: string;
  readonly url?: string;
  readonly headers: { get(name: string): string | null };
}

export interface AssertResponseOptions {
  /** Accepted status(es) or predicate. Default: any 2xx. */
  readonly expectStatus?: number | readonly number[] | ((status: number) => boolean);
  /** `'json'` (`application/json` or `+json`), a media type, or a list of media types. */
  readonly expectContentType?: 'json' | (string & {}) | readonly string[];
  /** Request method, recorded on the error. */
  readonly method?: string;
}

/**
 * Strips credentials, query and fragment from a URL so it is safe to log.
 * @example safeUrlForLog('https://u:p@api.example.com/a?token=x#f') // => 'https://api.example.com/a'
 */
export function safeUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin === 'null' ? u.protocol : u.origin}${u.pathname}`;
  } catch {
    const cut = url.search(/[?#]/);
    return cut < 0 ? url : url.slice(0, cut);
  }
}

/**
 * Throws `HttpError` unless the response has an expected status (`HLP_HTTP_STATUS`) and content
 * type (`HLP_HTTP_CONTENT_TYPE`). Messages never contain the URL query or body. 204, 205 and
 * 304 responses skip the content-type check.
 * @example
 * const res = new Response('{"id":7}', { headers: { 'content-type': 'application/json' } });
 * assertResponse(res, { expectContentType: 'json' });
 * const data: unknown = await res.json(); // => { id: 7 }
 * assertResponse(new Response(null, { status: 404 })); // => throws HttpError
 */
export function assertResponse(response: ResponseLike, options: AssertResponseOptions = {}): void {
  const { expectStatus = isSuccess, expectContentType, method } = options;
  const status = response.status;
  const okStatus = typeof expectStatus === 'function' ? expectStatus(status) : typeof expectStatus === 'number' ? status === expectStatus : expectStatus.includes(status);
  const base = {
    status,
    statusText: response.statusText !== undefined && response.statusText !== '' ? response.statusText : statusText(status),
    ...(method === undefined ? {} : { method: method.toUpperCase() }),
    ...(response.url === undefined || response.url === '' ? {} : { url: safeUrlForLog(response.url) }),
  };
  if (!okStatus) throw new HttpError('HLP_HTTP_STATUS', `The server responded with an unexpected status (${status}).`, base);
  if (expectContentType === undefined || status === 204 || status === 205 || status === 304) return;
  const header = response.headers.get('content-type');
  let okType: boolean;
  if (expectContentType === 'json') okType = isJsonContentType(header);
  else {
    const mt = parseContentType(header)?.mediaType;
    const wanted = typeof expectContentType === 'string' ? [expectContentType] : expectContentType;
    okType = mt !== undefined && wanted.some((w) => w.toLowerCase() === mt);
  }
  if (!okType) throw new HttpError('HLP_HTTP_CONTENT_TYPE', 'The server responded with an unexpected content type.', { ...base, details: { expected: expectContentType } });
}

/** Coarse error category for choosing a message, retry or sign-in flow. */
export type HttpErrorCategory = 'network' | 'timeout' | 'aborted' | 'client' | 'server' | 'auth' | 'unknown';

/**
 * Classifies anything thrown by a fetch-based call.
 * @example classifyHttpError(new TypeError('Failed to fetch')) // => 'network'
 * @example
 * import { HttpError } from '@absoluteui/helpers/error';
 * classifyHttpError(new HttpError('X', 'Failed.', { status: 401 })); // => 'auth'
 */
export function classifyHttpError(error: unknown): HttpErrorCategory {
  if (typeof error !== 'object' || error === null) return 'unknown';
  const name = (error as { name?: unknown }).name;
  if (name === 'TimeoutError' || (error instanceof HelperError && error.kind === 'timeout')) return 'timeout';
  if (isAbortError(error)) return 'aborted';
  const status = (error as { status?: unknown }).status;
  if (typeof status === 'number' && Number.isInteger(status)) {
    if (status === 0) return 'network';
    if (status === 401 || status === 403 || status === 407) return 'auth';
    if (status === 408 || status === 504) return 'timeout';
    if (status >= 400 && status < 500) return 'client';
    if (status >= 500 && status < 600) return 'server';
  }
  if (error instanceof HelperError && (error.kind === 'unauthorized' || error.kind === 'forbidden')) return 'auth';
  // fetch() rejects with TypeError for network failures (DNS, CORS, offline, reset).
  if (error instanceof TypeError) return 'network';
  return 'unknown';
}
