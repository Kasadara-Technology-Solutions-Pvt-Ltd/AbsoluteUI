/** HTTP error construction, problem-details mapping and header redaction. */
import { HttpError } from '@absoluteui/helpers/error';
import { isJsonContentType, parseProblemDetails, parseRetryAfter, problemToFieldErrors, safeUrlForLog, statusText, userMessageForStatus, type ProblemDetails, type StatusMessageCatalog } from '@absoluteui/helpers/http';import { safeJsonParse } from '@absoluteui/helpers/json';

/** Header names whose values `redactHeaders` always hides. */
export const SENSITIVE_HEADERS: readonly string[] = ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'proxy-authorization', 'x-xsrf-token', 'x-csrf-token'];

/** Headers input accepted by `redactHeaders`. */
export type HeadersLike = Headers | readonly (readonly [string, string])[] | Readonly<Record<string, string | undefined>>;

/**
 * Lowercased copy of `headers` with credential values replaced by `'[REDACTED]'`, for logging.
 * @example
 * redactHeaders({ Authorization: 'Bearer abc', Accept: 'application/json' });
 * // => { authorization: '[REDACTED]', accept: 'application/json' }
 */
export function redactHeaders(headers: HeadersLike | undefined, extra: readonly string[] = []): Record<string, string> {
  const hidden = new Set([...SENSITIVE_HEADERS, ...extra.map((h) => h.toLowerCase())]);
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  if (headers === undefined) return out;
  const put = (name: string, value: string | undefined): void => {
    if (value === undefined) return;
    const key = name.toLowerCase();
    out[key] = hidden.has(key) ? '[REDACTED]' : value;
  };
  if (headers instanceof Headers) headers.forEach((v, k) => { put(k, v); });
  else if (Array.isArray(headers)) for (const [k, v] of headers as readonly (readonly [string, string])[]) put(k, v);
  else for (const [k, v] of Object.entries(headers as Readonly<Record<string, string | undefined>>)) put(k, v);
  return out;
}

/**
 * True when `value` is an `HttpError`, optionally with the given status.
 * @example
 * import { HttpError } from '@absoluteui/helpers/error';
 * const e: unknown = new HttpError('SVC_HTTP_STATUS', 'Not found.', { status: 404 });
 * isHttpError(e, 404); // => true
 * isHttpError(e, 500); // => false
 * isHttpError(new Error('boom')); // => false
 */
export function isHttpError(value: unknown, status?: number): value is HttpError {
  return value instanceof HttpError && (status === undefined || value.status === status);
}

/**
 * RFC 9457 problem details for an `HttpError`: the server's document when it sent one, otherwise
 * a synthesized `about:blank` problem. `undefined` for other errors.
 * @example
 * import { HttpError } from '@absoluteui/helpers/error';
 * const error = new HttpError('SVC_HTTP_STATUS', 'Check the highlighted fields.', { status: 422, fields: { email: 'Enter a valid email address.' } });
 * const p = toProblem(error);
 * p?.status; // => 422
 * p?.fieldErrors; // => { email: 'Enter a valid email address.' }
 * toProblem(new Error('boom')); // => undefined
 */
export function toProblem(error: unknown): ProblemDetails | undefined {
  if (!(error instanceof HttpError)) return undefined;
  const parsed = error.problem === undefined ? undefined : parseProblemDetails(error.problem);
  if (parsed) return parsed;
  return {
    type: 'about:blank',
    title: error.statusText !== '' ? error.statusText : statusText(error.status),
    ...(error.status >= 100 && error.status <= 599 ? { status: error.status } : {}),
    detail: error.message,
    extensions: {},
    fieldErrors: error.fields,
  };
}

/**
 * Decides whether a server-supplied message (Problem Details `detail`, or a top-level `message`
 * string) replaces the catalog message. Default: never (server text may leak internals or be
 * unlocalized).
 */
export type TrustServerMessages = boolean | ((info: { readonly status: number; readonly url: string; readonly problem: ProblemDetails | undefined }) => boolean);

/** Internal: data used to build an `HttpError` for a non-success response. */
export interface ErrorResponseInfo {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly bodyText: string | undefined;
  readonly method: string;
  readonly url: string;
  readonly messages?: StatusMessageCatalog | undefined;
  readonly trustServerMessages?: TrustServerMessages | undefined;
}

const TRACEPARENT_RE = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/;
const REQUEST_ID_RE = /^[\x21-\x7e]{1,128}$/;
const SERVER_MESSAGE_MAX = 500;

/**
 * Correlation id of a response: `X-Request-Id`, `X-Correlation-Id`, or the trace id of
 * `traceparent`. Values that are not 1 to 128 visible ASCII characters are ignored.
 * @example
 * requestIdOf(new Headers({ 'x-request-id': 'req-42' })); // => 'req-42'
 * requestIdOf(new Headers({ traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' })); // => '4bf92f3577b34da6a3ce929d0e0e4736'
 * requestIdOf(new Headers()); // => undefined
 */
export function requestIdOf(headers: Headers): string | undefined {
  for (const name of ['x-request-id', 'x-correlation-id']) {
    const v = headers.get(name)?.trim();
    if (v !== undefined && REQUEST_ID_RE.test(v)) return v;
  }
  return TRACEPARENT_RE.exec(headers.get('traceparent')?.trim() ?? '')?.[1];
}

/** A server message fit for display: a string of 1 to 500 characters, whitespace collapsed, no control characters. */
function displayable(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point.
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text !== '' && text.length <= SERVER_MESSAGE_MAX ? text : undefined;
}

/** Internal: `HttpError` (`SVC_HTTP_STATUS`) with parsed problem details and field errors. Messages never contain the URL or body. */
export function responseError(info: ErrorResponseInfo): HttpError {
  let problem: Record<string, unknown> | undefined;
  let parsedProblem: ProblemDetails | undefined;
  let body: unknown;
  let fields: Record<string, string> = {};
  if (info.bodyText !== undefined && info.bodyText !== '' && isJsonContentType(info.headers.get('content-type'))) {
    const parsed = safeJsonParse(info.bodyText, { maxDepth: 32, unsafeKeys: 'strip' });
    if (parsed.ok) {
      body = parsed.value;
      parsedProblem = parseProblemDetails(parsed.value);
      if (parsedProblem) {
        const { extensions, fieldErrors: fe, ...std } = parsedProblem;
        problem = { ...extensions, ...std };
        fields = { ...fe };
      } else fields = problemToFieldErrors(parsed.value);
    }
  }
  const trust = info.trustServerMessages;
  const trusted = typeof trust === 'function' ? trust({ status: info.status, url: safeUrlForLog(info.url), problem: parsedProblem }) : trust === true;
  const serverMessage = trusted ? (displayable(parsedProblem?.detail) ?? displayable(typeof body === 'object' && body !== null ? (body as { message?: unknown }).message : undefined)) : undefined;
  const retryAfterMs = parseRetryAfter(info.headers.get('retry-after'));
  const requestId = requestIdOf(info.headers);
  return new HttpError('SVC_HTTP_STATUS', serverMessage ?? userMessageForStatus(info.status, info.messages), {
    status: info.status,
    statusText: info.statusText !== '' ? info.statusText : statusText(info.status),
    method: info.method,
    url: safeUrlForLog(info.url),
    fields,
    ...(problem ? { problem } : {}),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(body === undefined ? {} : { body }),
  });
}

const isOffline = (): boolean => (globalThis as { navigator?: { onLine?: unknown } }).navigator?.onLine === false;

/** Internal: network failure (`SVC_HTTP_NETWORK`, status 0; category `offline` when the browser reports no connection). */
export function networkError(method: string, url: string, cause: unknown, messages?: StatusMessageCatalog): HttpError {
  return new HttpError('SVC_HTTP_NETWORK', userMessageForStatus(0, messages), { status: 0, method, url: safeUrlForLog(url), cause, category: isOffline() ? 'offline' : 'network' });
}

/** Internal: the response body failed parsing or validation (`SVC_HTTP_INVALID_RESPONSE`). */
export function invalidResponseError(status: number, method: string, url: string, cause?: unknown): HttpError {
  return new HttpError('SVC_HTTP_INVALID_RESPONSE', 'The server response was not in the expected format.', { status, method, url: safeUrlForLog(url), category: 'bad-response', retryable: false, ...(cause === undefined ? {} : { cause }) });
}

/** Internal: the caller, `cancelAll`, a group, or a newer call with the same `cancelKey` cancelled the request (`SVC_HTTP_ABORTED`). */
export function cancelledError(method: string, url: string, cause: unknown): HttpError {
  const reason = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : undefined;
  return new HttpError('SVC_HTTP_ABORTED', 'The request was cancelled.', { status: 0, method, url: safeUrlForLog(url), category: 'cancelled', retryable: false, cause, ...(reason === undefined ? {} : { details: { reason } }) });
}

/** Internal: the whole-request deadline passed (`SVC_HTTP_TIMEOUT`). */
export function timeoutError(method: string, url: string, messages?: StatusMessageCatalog): HttpError {
  return new HttpError('SVC_HTTP_TIMEOUT', userMessageForStatus(408, messages), { status: 0, method, url: safeUrlForLog(url), category: 'timeout' });
}

/** Internal: the response exceeded `maxResponseBytes` (`SVC_HTTP_RESPONSE_TOO_LARGE`). */
export function tooLargeError(status: number, method: string, url: string, cause: unknown): HttpError {
  return new HttpError('SVC_HTTP_RESPONSE_TOO_LARGE', 'The server response is too large to load.', { status, method, url: safeUrlForLog(url), category: 'too-large', retryable: false, cause });
}

/**
 * True when `error` is a cancelled request (caller signal, `cancelAll`, `cancelGroup`, or a newer
 * call with the same `cancelKey`). UIs usually ignore these.
 * @example
 * import { HttpError } from '@absoluteui/helpers/error';
 * isCancelled(new HttpError('SVC_HTTP_ABORTED', 'The request was cancelled.', { status: 0, category: 'cancelled' })); // => true
 * isCancelled(new HttpError('SVC_HTTP_STATUS', 'Not found.', { status: 404 })); // => false
 */
export function isCancelled(error: unknown): boolean {
  return error instanceof HttpError && error.category === 'cancelled';
}
