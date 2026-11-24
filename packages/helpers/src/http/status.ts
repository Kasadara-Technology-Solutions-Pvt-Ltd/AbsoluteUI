/**
 * HTTP status codes, methods and user-facing messages (RFC 9110). Pure data; no fetch.
 */

/** Named status codes (RFC 9110 and registered extensions). @example httpStatus.NOT_FOUND // => 404 */
export const httpStatus = Object.freeze({
  CONTINUE: 100,
  SWITCHING_PROTOCOLS: 101,
  PROCESSING: 102,
  EARLY_HINTS: 103,
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NON_AUTHORITATIVE_INFORMATION: 203,
  NO_CONTENT: 204,
  RESET_CONTENT: 205,
  PARTIAL_CONTENT: 206,
  MULTI_STATUS: 207,
  ALREADY_REPORTED: 208,
  IM_USED: 226,
  MULTIPLE_CHOICES: 300,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  USE_PROXY: 305,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  CONTENT_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  IM_A_TEAPOT: 418,
  MISDIRECTED_REQUEST: 421,
  UNPROCESSABLE_CONTENT: 422,
  LOCKED: 423,
  FAILED_DEPENDENCY: 424,
  TOO_EARLY: 425,
  UPGRADE_REQUIRED: 426,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
  UNAVAILABLE_FOR_LEGAL_REASONS: 451,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
  VARIANT_ALSO_NEGOTIATES: 506,
  INSUFFICIENT_STORAGE: 507,
  LOOP_DETECTED: 508,
  NOT_EXTENDED: 510,
  NETWORK_AUTHENTICATION_REQUIRED: 511,
} as const);

export type HttpStatusName = keyof typeof httpStatus;

const REASON: ReadonlyMap<number, string> = new Map<number, string>([
  [100, 'Continue'], [101, 'Switching Protocols'], [102, 'Processing'], [103, 'Early Hints'],
  [200, 'OK'], [201, 'Created'], [202, 'Accepted'], [203, 'Non-Authoritative Information'], [204, 'No Content'], [205, 'Reset Content'], [206, 'Partial Content'], [207, 'Multi-Status'], [208, 'Already Reported'], [226, 'IM Used'],
  [300, 'Multiple Choices'], [301, 'Moved Permanently'], [302, 'Found'], [303, 'See Other'], [304, 'Not Modified'], [305, 'Use Proxy'], [307, 'Temporary Redirect'], [308, 'Permanent Redirect'],
  [400, 'Bad Request'], [401, 'Unauthorized'], [402, 'Payment Required'], [403, 'Forbidden'], [404, 'Not Found'], [405, 'Method Not Allowed'], [406, 'Not Acceptable'], [407, 'Proxy Authentication Required'], [408, 'Request Timeout'], [409, 'Conflict'], [410, 'Gone'], [411, 'Length Required'], [412, 'Precondition Failed'], [413, 'Content Too Large'], [414, 'URI Too Long'], [415, 'Unsupported Media Type'], [416, 'Range Not Satisfiable'], [417, 'Expectation Failed'], [418, "I'm a teapot"], [421, 'Misdirected Request'], [422, 'Unprocessable Content'], [423, 'Locked'], [424, 'Failed Dependency'], [425, 'Too Early'], [426, 'Upgrade Required'], [428, 'Precondition Required'], [429, 'Too Many Requests'], [431, 'Request Header Fields Too Large'], [451, 'Unavailable For Legal Reasons'],
  [500, 'Internal Server Error'], [501, 'Not Implemented'], [502, 'Bad Gateway'], [503, 'Service Unavailable'], [504, 'Gateway Timeout'], [505, 'HTTP Version Not Supported'], [506, 'Variant Also Negotiates'], [507, 'Insufficient Storage'], [508, 'Loop Detected'], [510, 'Not Extended'], [511, 'Network Authentication Required'],
]);

/**
 * Standard reason phrase, or `''` for unregistered codes.
 * @example statusText(404) // => 'Not Found'
 */
export function statusText(status: number): string {
  return REASON.get(status) ?? '';
}

const inClass = (status: number, base: number): boolean => Number.isInteger(status) && status >= base && status < base + 100;

/** 1xx. @example isInformational(103) // => true */
export function isInformational(status: number): boolean {
  return inClass(status, 100);
}
/** 2xx. @example isSuccess(204) // => true */
export function isSuccess(status: number): boolean {
  return inClass(status, 200);
}
/** 3xx. @example isRedirect(302) // => true */
export function isRedirect(status: number): boolean {
  return inClass(status, 300);
}
/** 4xx. @example isClientError(404) // => true */
export function isClientError(status: number): boolean {
  return inClass(status, 400);
}
/** 5xx. @example isServerError(503) // => true */
export function isServerError(status: number): boolean {
  return inClass(status, 500);
}

/** Statuses retried by default: 408, 425, 429, 500, 502, 503, 504. @example DEFAULT_RETRYABLE_STATUSES.has(503) // => true */
export const DEFAULT_RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * True when a request that failed with `status` may succeed if retried. Combine with
 * {@link isIdempotentMethod}: never blindly retry a POST.
 * @example isRetryableStatus(503) // => true
 */
export function isRetryableStatus(status: number, retryable: ReadonlySet<number> | readonly number[] = DEFAULT_RETRYABLE_STATUSES): boolean {
  return Array.isArray(retryable) ? retryable.includes(status) : (retryable as ReadonlySet<number>).has(status);
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);
const IDEMPOTENT = new Set([...SAFE, 'PUT', 'DELETE']);

/**
 * RFC 9110 section 9.2.2 idempotent methods: GET, HEAD, OPTIONS, TRACE, PUT, DELETE (case-insensitive).
 * @example isIdempotentMethod('put') // => true
 */
export function isIdempotentMethod(method: string): boolean {
  return IDEMPOTENT.has(method.toUpperCase());
}

/**
 * RFC 9110 section 9.2.1 safe (read-only) methods: GET, HEAD, OPTIONS, TRACE.
 * @example isSafeMethod('POST') // => false
 */
export function isSafeMethod(method: string): boolean {
  return SAFE.has(method.toUpperCase());
}

/** Replacement messages by status; return `undefined` to fall back to the defaults. */
export type StatusMessageCatalog = (status: number) => string | undefined;

/** Messages keyed by status code, for translation files and overrides. */
export type StatusMessages = Readonly<Partial<Record<number, string>>>;

/**
 * Plain-language English message for every registered status code, plus `0` (network failure),
 * for alerts, toasts, and error summaries. Frozen; copy it as the starting point of a translation.
 * @example DEFAULT_STATUS_MESSAGES[404] // => 'The item could not be found. It may have been moved or deleted.'
 * @example Object.keys(DEFAULT_STATUS_MESSAGES).length // => 63
 */
export const DEFAULT_STATUS_MESSAGES: StatusMessages = Object.freeze({
  0: 'Unable to connect. Check your internet connection and try again.',
  100: 'The server is ready to receive the rest of the request.',
  101: 'The connection is switching to a different protocol.',
  102: 'The server is still processing the request.',
  103: 'The server is preparing the response.',
  200: 'Done.',
  201: 'Created.',
  202: 'Accepted. It will be processed shortly.',
  203: 'Done. The information came from another source and may differ from the original.',
  204: 'Done.',
  205: 'Done. Clear the form to continue.',
  206: 'Part of the content was returned.',
  207: 'Done. Some parts have their own results.',
  208: 'Done. Some items were already included.',
  226: 'Done.',
  300: 'Several versions are available. Choose one to continue.',
  301: 'This item has moved to a new address.',
  302: 'This item is temporarily at a different address.',
  303: 'The result is available at a different address.',
  304: 'The item has not changed.',
  305: 'This item must be accessed through a proxy.',
  307: 'This item is temporarily at a different address.',
  308: 'This item has moved to a new address.',
  400: 'Some of the information is not valid. Check it and try again.',
  401: 'Your session has ended. Sign in again to continue.',
  402: 'Payment is required to do this.',
  403: 'You do not have permission to do this. Contact your administrator if you need access.',
  404: 'The item could not be found. It may have been moved or deleted.',
  405: 'This action is not available. Reload the page and try again.',
  406: 'The server cannot provide this in a supported format.',
  407: 'Sign in to the proxy server to continue.',
  408: 'The request took too long. Check your connection and try again.',
  409: 'This item was changed by someone else. Reload it and try again.',
  410: 'This item is no longer available.',
  411: 'The request was incomplete. Try again.',
  412: 'This item was changed by someone else. Reload it and try again.',
  413: 'The file or data is too large. Reduce its size and try again.',
  414: 'The request is too long. Shorten your search or filters and try again.',
  415: 'This file type is not supported. Choose a different file and try again.',
  416: 'The requested part of the file is not available.',
  417: 'The server could not meet the requirements of the request. Try again.',
  418: 'The server cannot do this.',
  421: 'The request reached the wrong server. Try again.',
  422: 'Some of the information is not valid. Check it and try again.',
  423: 'This item is locked. Try again later or contact the person who is editing it.',
  424: 'This could not be completed because a related action failed.',
  425: 'The server is not ready to process this yet. Try again.',
  426: 'This needs a newer connection. Update your browser or app and try again.',
  428: 'Reload this item before changing it, then try again.',
  429: 'Too many requests. Wait a moment and try again.',
  431: 'The request is too large. Clear the cookies for this site and try again.',
  451: 'This content is not available for legal reasons.',
  500: 'Something went wrong on our side. Try again later.',
  501: 'This action is not supported.',
  502: 'The service is temporarily unavailable. Try again in a few minutes.',
  503: 'The service is temporarily unavailable. Try again in a few minutes.',
  504: 'The service is taking too long to respond. Try again in a few minutes.',
  505: 'The server does not support this connection. Try again later.',
  506: 'The server is not set up correctly. Try again later.',
  507: 'The server is out of storage. Try again later.',
  508: 'The server stopped processing this request. Try again later.',
  510: 'The server needs more information to complete this.',
  511: 'Sign in to the network (for example, a Wi-Fi sign-in page) to continue.',
});

/** Status class of a code; `network` for 0 (no response). */
export type StatusClass = 'network' | 'informational' | 'success' | 'redirect' | 'client-error' | 'server-error' | 'unknown';

/**
 * Status class of a code.
 * @example statusClass(0) // => 'network'
 * @example statusClass(422) // => 'client-error'
 */
export function statusClass(status: number): StatusClass {
  if (status === 0) return 'network';
  if (isInformational(status)) return 'informational';
  if (isSuccess(status)) return 'success';
  if (isRedirect(status)) return 'redirect';
  if (isClientError(status)) return 'client-error';
  if (isServerError(status)) return 'server-error';
  return 'unknown';
}

const CLASS_FALLBACK: Readonly<Record<StatusClass, string>> = {
  network: DEFAULT_STATUS_MESSAGES[0] ?? '',
  informational: 'The request is in progress.',
  success: 'Done.',
  redirect: 'This item is at a different address.',
  'client-error': 'The request could not be completed. Check the information and try again.',
  'server-error': 'Something went wrong on our side. Try again later.',
  unknown: 'Something unexpected happened. Try again.',
};

/**
 * Plain-language message for a status (0 = network failure). `catalog` entries win; then
 * {@link DEFAULT_STATUS_MESSAGES}; then a message for the status class.
 * @example userMessageForStatus(503) // => 'The service is temporarily unavailable. Try again in a few minutes.'
 * @example
 * userMessageForStatus(404, (s) => (s === 404 ? 'No such employee.' : undefined)); // => 'No such employee.'
 * userMessageForStatus(499); // => 'The request could not be completed. Check the information and try again.'
 */
export function userMessageForStatus(status: number, catalog?: StatusMessageCatalog): string {
  const custom = catalog?.(status);
  if (custom !== undefined) return custom;
  return DEFAULT_STATUS_MESSAGES[status] ?? CLASS_FALLBACK[statusClass(status)];
}

/**
 * Catalog from a messages object.
 * @example
 * const catalog = statusMessageCatalog({ 404: 'No such employee.' });
 * [catalog(404), catalog(500)]; // => ['No such employee.', undefined]
 */
export function statusMessageCatalog(messages: StatusMessages): StatusMessageCatalog {
  return (status) => (Object.hasOwn(messages, status) ? messages[status] : undefined);
}

/**
 * Catalog for a locale from per-locale message objects, falling back from the full tag to its
 * language (`fr-CA` -> `fr`). Missing entries fall through to the English defaults.
 * @example
 * const catalog = localizedStatusMessages({ fr: { 404: 'Élément introuvable.' } }, 'fr-CA');
 * userMessageForStatus(404, catalog); // => 'Élément introuvable.'
 * userMessageForStatus(503, catalog); // => 'The service is temporarily unavailable. Try again in a few minutes.'
 */
export function localizedStatusMessages(catalogs: Readonly<Record<string, StatusMessages>>, locale: string): StatusMessageCatalog {
  const chain: StatusMessages[] = [];
  const parts = locale.split('-');
  for (let n = parts.length; n > 0; n--) {
    const tag = parts.slice(0, n).join('-');
    const found = Object.entries(catalogs).find(([k]) => k.toLowerCase() === tag.toLowerCase());
    if (found) chain.push(found[1]);
  }
  return composeStatusMessages(...chain.map(statusMessageCatalog));
}

/**
 * One catalog from several; the first that defines a status wins.
 * @example
 * const app = composeStatusMessages(statusMessageCatalog({ 404: 'No such employee.' }), statusMessageCatalog({ 404: 'Not here.', 409: 'Someone else saved first.' }));
 * [app(404), app(409), app(500)]; // => ['No such employee.', 'Someone else saved first.', undefined]
 */
export function composeStatusMessages(...catalogs: readonly (StatusMessageCatalog | undefined)[]): StatusMessageCatalog {
  return (status) => {
    for (const c of catalogs) {
      const m = c?.(status);
      if (m !== undefined) return m;
    }
    return undefined;
  };
}

/** Everything a UI needs to describe a status. */
export interface StatusDescription {
  readonly status: number;
  /** Standard reason phrase, `''` when unregistered. */
  readonly reason: string;
  /** Plain-language message (`userMessageForStatus`). */
  readonly message: string;
  readonly statusClass: StatusClass;
}

/**
 * Reason phrase, message, and class of a status.
 * @example
 * describeStatus(429);
 * // => { status: 429, reason: 'Too Many Requests', message: 'Too many requests. Wait a moment and try again.', statusClass: 'client-error' }
 */
export function describeStatus(status: number, catalog?: StatusMessageCatalog): StatusDescription {
  return { status, reason: statusText(status), message: userMessageForStatus(status, catalog), statusClass: statusClass(status) };
}
