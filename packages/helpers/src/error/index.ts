/**
 * Error model for helpers and services (docs/PLAN-HELPERS.md section 2, section 5).
 * Messages never contain user-supplied values; put data in `details` only when it is safe.
 */

/** Stable error category used for mapping errors to UI and HTTP responses. */
export type ErrorKind = 'validation' | 'not-found' | 'conflict' | 'http' | 'timeout' | 'aborted' | 'unauthorized' | 'forbidden' | 'unsupported' | 'limit' | 'internal';

export interface HelperErrorOptions {
  /** Underlying error (ES2022 `cause`). */
  readonly cause?: unknown;
  /** Structured, non-sensitive context. Never include secrets or raw user input. */
  readonly details?: Readonly<Record<string, unknown>>;
  /** Field-level messages keyed by field path, for form error summaries. */
  readonly fields?: Readonly<Record<string, string>>;
}

/**
 * Base error with a stable machine-readable `code`.
 * @example
 * const e = new HelperError('HLP_JSON_TOO_DEEP', 'JSON nesting exceeds the limit.', { kind: 'limit' });
 * e.code; // => 'HLP_JSON_TOO_DEEP'
 * e.kind; // => 'limit'
 * e instanceof Error; // => true
 */
export class HelperError extends Error {
  override name = 'HelperError';
  readonly code: string;
  readonly kind: ErrorKind;
  readonly details: Readonly<Record<string, unknown>>;
  readonly fields: Readonly<Record<string, string>>;

  constructor(code: string, message: string, options: HelperErrorOptions & { readonly kind?: ErrorKind } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.kind = options.kind ?? 'internal';
    this.details = Object.freeze({ ...options.details });
    this.fields = Object.freeze({ ...options.fields });
  }
}

/**
 * Input failed validation. `fields` maps field paths to messages.
 * @example
 * const e = new ValidationError('HRM_EMP_INVALID', 'Fix the highlighted fields.', { fields: { email: 'Enter a valid email address.' } });
 * e.kind; // => 'validation'
 * e.fields; // => { email: 'Enter a valid email address.' }
 */
export class ValidationError extends HelperError {
  override name = 'ValidationError';
  constructor(code: string, message: string, options: HelperErrorOptions = {}) {
    super(code, message, { ...options, kind: 'validation' });
  }
}

/**
 * @example
 * new NotFoundError('HRM_EMP_NOT_FOUND', 'Employee not found.').kind; // => 'not-found'
 */
export class NotFoundError extends HelperError {
  override name = 'NotFoundError';
  constructor(code: string, message: string, options: HelperErrorOptions = {}) {
    super(code, message, { ...options, kind: 'not-found' });
  }
}

/**
 * @example
 * new ConflictError('HRM_EMP_VERSION', 'The record was changed by someone else.').kind; // => 'conflict'
 */
export class ConflictError extends HelperError {
  override name = 'ConflictError';
  constructor(code: string, message: string, options: HelperErrorOptions = {}) {
    super(code, message, { ...options, kind: 'conflict' });
  }
}

/**
 * @example
 * const e = new TimeoutError();
 * [e.code, e.kind, e.message]; // => ['HLP_TIMEOUT', 'timeout', 'The operation timed out.']
 */
export class TimeoutError extends HelperError {
  override name = 'TimeoutError';
  constructor(code = 'HLP_TIMEOUT', message = 'The operation timed out.', options: HelperErrorOptions = {}) {
    super(code, message, { ...options, kind: 'timeout' });
  }
}

/**
 * @example
 * const e = new AbortError();
 * e.code; // => 'HLP_ABORTED'
 * isAbortError(e); // => true
 */
export class AbortError extends HelperError {
  override name = 'AbortError';
  constructor(code = 'HLP_ABORTED', message = 'The operation was aborted.', options: HelperErrorOptions = {}) {
    super(code, message, { ...options, kind: 'aborted' });
  }
}

/**
 * A limit (size, depth, count, quota) was exceeded.
 * @example
 * const e = new LimitError('HRM_IMPORT_TOO_LARGE', 'The import has too many rows.', { details: { max: 10000 } });
 * [e.kind, e.details]; // => ['limit', { max: 10000 }]
 */
export class LimitError extends HelperError {
  override name = 'LimitError';
  constructor(code: string, message: string, options: HelperErrorOptions = {}) {
    super(code, message, { ...options, kind: 'limit' });
  }
}

/**
 * Why an HTTP call failed, for choosing a message, a retry, or a sign-in flow. `client` covers
 * the 4xx statuses without a more specific category.
 */
export type HttpFailureCategory =
  | 'network'
  | 'offline'
  | 'timeout'
  | 'cancelled'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation'
  | 'rate-limited'
  | 'client'
  | 'server'
  | 'unavailable'
  | 'bad-response'
  | 'too-large';

const STATUS_CATEGORY: ReadonlyMap<number, HttpFailureCategory> = new Map<number, HttpFailureCategory>([
  [0, 'network'], [400, 'validation'], [401, 'unauthorized'], [403, 'forbidden'], [404, 'not-found'], [408, 'timeout'], [409, 'conflict'], [410, 'not-found'],
  [412, 'conflict'], [413, 'too-large'], [422, 'validation'], [429, 'rate-limited'], [502, 'unavailable'], [503, 'unavailable'], [504, 'timeout'],
]);

/**
 * Failure category of a status: specific statuses first, then `client` (4xx) or `server` (5xx).
 * @example httpFailureCategory(422) // => 'validation'
 * @example httpFailureCategory(503) // => 'unavailable'
 * @example httpFailureCategory(418) // => 'client'
 */
export function httpFailureCategory(status: number): HttpFailureCategory {
  const known = STATUS_CATEGORY.get(status);
  if (known !== undefined) return known;
  return status >= 500 && status <= 599 ? 'server' : 'client';
}

const RETRYABLE_CATEGORIES: ReadonlySet<HttpFailureCategory> = new Set(['network', 'offline', 'timeout', 'rate-limited', 'unavailable']);

export interface HttpErrorOptions extends HelperErrorOptions {
  /** HTTP status; 0 when no response arrived (network failure, timeout, cancellation). */
  readonly status: number;
  readonly statusText?: string;
  /** Parsed RFC 9457 problem details, if the server sent them. */
  readonly problem?: Readonly<Record<string, unknown>>;
  /** Request method and URL without query string (safe for logs). */
  readonly method?: string;
  readonly url?: string;
  /** Default: `httpFailureCategory(status)`. */
  readonly category?: HttpFailureCategory;
  /** Default: true for network, offline, timeout, rate-limited, and unavailable failures, and for 425 and 500. */
  readonly retryable?: boolean;
  /** Server-requested wait before retrying (`Retry-After`), in milliseconds. */
  readonly retryAfterMs?: number;
  /** Correlation id from the response (`X-Request-Id`, `X-Correlation-Id`, or the `traceparent` trace id). */
  readonly requestId?: string;
  /** Parsed JSON error body (application error codes, custom envelopes). Never included in `toJSON`. */
  readonly body?: unknown;
}

/** Log-safe summary of an `HttpError` (`JSON.stringify` uses it). */
export interface HttpErrorJson {
  readonly name: string;
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly category: HttpFailureCategory;
  readonly retryable: boolean;
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly requestId: string | undefined;
  readonly retryAfterMs: number | undefined;
  readonly fields: Readonly<Record<string, string>>;
  readonly problemType: string | undefined;
}

/**
 * A failed HTTP call: an unsuccessful status, or no response at all (status 0 with category
 * `network`, `offline`, `timeout`, or `cancelled`). `message` is the user-facing message.
 * @example
 * const e = new HttpError('HLP_HTTP_404', 'Not found.', { status: 404, method: 'GET', url: '/api/employees/42' });
 * [e.status, e.kind, e.category, e.retryable]; // => [404, 'not-found', 'not-found', false]
 * @example
 * const e = new HttpError('SVC_HTTP_STATUS', 'Too many requests.', { status: 429, retryAfterMs: 2000, requestId: 'req-7' });
 * [e.category, e.retryable, e.retryAfterMs]; // => ['rate-limited', true, 2000]
 * JSON.parse(JSON.stringify(e)).requestId; // => 'req-7'
 */
export class HttpError extends HelperError {
  override name = 'HttpError';
  readonly status: number;
  readonly statusText: string;
  readonly problem: Readonly<Record<string, unknown>> | undefined;
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly category: HttpFailureCategory;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  readonly requestId: string | undefined;
  readonly body: unknown;

  constructor(code: string, message: string, options: HttpErrorOptions) {
    const category = options.category ?? httpFailureCategory(options.status);
    const kind: ErrorKind =
      category === 'cancelled' ? 'aborted'
      : category === 'timeout' && options.status === 0 ? 'timeout'
      : options.status === 401 ? 'unauthorized'
      : options.status === 403 ? 'forbidden'
      : options.status === 404 ? 'not-found'
      : options.status === 409 ? 'conflict'
      : 'http';
    super(code, message, { ...options, kind });
    this.status = options.status;
    this.statusText = options.statusText ?? '';
    this.problem = options.problem;
    this.method = options.method;
    this.url = options.url;
    this.category = category;
    this.retryable = options.retryable ?? (RETRYABLE_CATEGORIES.has(category) || options.status === 425 || options.status === 500);
    this.retryAfterMs = options.retryAfterMs;
    this.requestId = options.requestId;
    this.body = options.body;
  }

  /** Log-safe summary: no headers, `body`, query string, or problem details beyond the type. */
  toJSON(): HttpErrorJson {
    const type = this.problem?.type;
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      category: this.category,
      retryable: this.retryable,
      method: this.method,
      url: this.url,
      requestId: this.requestId,
      retryAfterMs: this.retryAfterMs,
      fields: this.fields,
      problemType: typeof type === 'string' ? type : undefined,
    };
  }
}

/**
 * True when `value` is a `HelperError`, optionally with the given code.
 * @example
 * const e = new ConflictError('HRM_EMP_VERSION', 'The record was changed by someone else.');
 * isHelperError(e, 'HRM_EMP_VERSION'); // => true
 * isHelperError(new Error('Plain.')); // => false
 */
export function isHelperError(value: unknown, code?: string): value is HelperError {
  return value instanceof HelperError && (code === undefined || value.code === code);
}

/**
 * True for any abort, from `AbortController`, DOM, or this package.
 * @example
 * isAbortError(new DOMException('Stopped.', 'AbortError')); // => true
 * isAbortError(new TimeoutError()); // => false
 */
export function isAbortError(value: unknown): boolean {
  // Covers AbortError and a cancelled HttpError (kind 'aborted').
  if (value instanceof HelperError && value.kind === 'aborted') return true;
  return typeof value === 'object' && value !== null && (value as { name?: unknown }).name === 'AbortError';
}

/**
 * Normalizes anything thrown into an `Error`. Non-error values become a `HelperError`
 * with code `HLP_NON_ERROR_THROWN` and the value kept only as `cause`.
 * @example
 * toError(new RangeError('Out of range.')).message; // => 'Out of range.'
 * isHelperError(toError('boom'), 'HLP_NON_ERROR_THROWN'); // => true
 */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new HelperError('HLP_NON_ERROR_THROWN', 'A non-error value was thrown.', { cause: value });
}

/** Plain, JSON-safe representation of an error. */
export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly kind?: ErrorKind;
  readonly status?: number;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly fields?: Readonly<Record<string, string>>;
  readonly stack?: string;
  readonly cause?: SerializedError;
}

export interface SerializeErrorOptions {
  /** Include stack traces. Default false: stacks leak paths and code structure. */
  readonly includeStack?: boolean;
  /** Maximum `cause` chain depth. Default 5. */
  readonly maxDepth?: number;
}

/**
 * Converts an error (and its `cause` chain) into a JSON-safe object.
 * @example
 * const e = new HttpError('HLP_HTTP_503', 'Service unavailable.', { status: 503 });
 * serializeError(e); // => { name: 'HttpError', message: 'Service unavailable.', code: 'HLP_HTTP_503', kind: 'http', status: 503 }
 */
export function serializeError(value: unknown, options: SerializeErrorOptions = {}): SerializedError {
  const { includeStack = false, maxDepth = 5 } = options;
  const walk = (v: unknown, depth: number): SerializedError => {
    const e = toError(v);
    const out: { -readonly [K in keyof SerializedError]: SerializedError[K] } = { name: e.name, message: e.message };
    if (e instanceof HelperError) {
      out.code = e.code;
      out.kind = e.kind;
      if (Object.keys(e.details).length) out.details = e.details;
      if (Object.keys(e.fields).length) out.fields = e.fields;
    }
    if (e instanceof HttpError) out.status = e.status;
    if (includeStack && e.stack !== undefined) out.stack = e.stack;
    if (e.cause !== undefined && depth < maxDepth && !(e instanceof HelperError && e.code === 'HLP_NON_ERROR_THROWN')) out.cause = walk(e.cause, depth + 1);
    return out;
  };
  return walk(value, 0);
}

/**
 * Rebuilds a `HelperError` from `serializeError` output (for example, received from a worker).
 * Unknown shapes become `HLP_INVALID_SERIALIZED_ERROR`.
 * @example
 * const e = deserializeError({ name: 'NotFoundError', message: 'Employee not found.', code: 'HRM_EMP_NOT_FOUND', kind: 'not-found' });
 * [e.name, e.code, e.kind]; // => ['NotFoundError', 'HRM_EMP_NOT_FOUND', 'not-found']
 * deserializeError(42).code; // => 'HLP_INVALID_SERIALIZED_ERROR'
 */
export function deserializeError(value: unknown): HelperError {
  if (typeof value !== 'object' || value === null) return new HelperError('HLP_INVALID_SERIALIZED_ERROR', 'Invalid serialized error.');
  const v = value as Partial<Record<keyof SerializedError, unknown>>;
  const message = typeof v.message === 'string' ? v.message : 'Unknown error.';
  const code = typeof v.code === 'string' ? v.code : 'HLP_DESERIALIZED';
  const opts: HelperErrorOptions = {
    ...(isRecord(v.details) ? { details: v.details } : {}),
    ...(isStringRecord(v.fields) ? { fields: v.fields } : {}),
    ...(v.cause !== undefined ? { cause: deserializeError(v.cause) } : {}),
  };
  const err = typeof v.status === 'number' ? new HttpError(code, message, { ...opts, status: v.status }) : new HelperError(code, message, { ...opts, kind: isKind(v.kind) ? v.kind : 'internal' });
  if (typeof v.name === 'string') err.name = v.name;
  return err;
}

const KINDS: readonly ErrorKind[] = ['validation', 'not-found', 'conflict', 'http', 'timeout', 'aborted', 'unauthorized', 'forbidden', 'unsupported', 'limit', 'internal'];
const isKind = (v: unknown): v is ErrorKind => typeof v === 'string' && (KINDS as readonly string[]).includes(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringRecord = (v: unknown): v is Record<string, string> => isRecord(v) && Object.values(v).every((x) => typeof x === 'string');

// ---------------------------------------------------------------------------
// Result

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}
/** Discriminated success/failure value for code paths that must not throw. */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * @example
 * const r = ok(42); // => { ok: true, value: 42 }
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * @example
 * const r = err(new ValidationError('HRM_LEAVE_RANGE', 'The end date is before the start date.'));
 * r.ok; // => false
 * r.error.code; // => 'HRM_LEAVE_RANGE'
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Runs `fn`, capturing a throw as `Err`.
 * @example
 * const r = tryCatch(() => JSON.parse('{"id":1}')); // => { ok: true, value: { id: 1 } }
 * tryCatch(() => JSON.parse('{')).ok; // => false
 */
export function tryCatch<T>(fn: () => T): Result<T> {
  try {
    return ok(fn());
  } catch (e) {
    return err(toError(e));
  }
}

/**
 * Awaits `fn`, capturing a rejection as `Err`.
 * @example
 * const r = await tryCatchAsync(async () => { throw new TimeoutError(); });
 * r.ok; // => false
 */
export async function tryCatchAsync<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(toError(e));
  }
}

/**
 * Returns the value or throws the error.
 * @example
 * unwrap(ok(5)); // => 5
 * unwrap(err(new NotFoundError('HRM_EMP_NOT_FOUND', 'Employee not found.'))); // => throws HRM_EMP_NOT_FOUND
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error instanceof Error ? result.error : toError(result.error);
}

/**
 * Returns the value or `fallback`.
 * @example
 * unwrapOr(tryCatch(() => JSON.parse('{')), {}); // => {}
 */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Maps the success value.
 * @example
 * mapResult(ok(20), (days) => days * 8); // => { ok: true, value: 160 }
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Maps the error value.
 * @example
 * mapError(err(404), (status) => `HTTP ${status}`); // => { ok: false, error: 'HTTP 404' }
 */
export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/**
 * Collects results: all values, or the first error.
 * @example
 * combineResults([ok(1), ok(2)]); // => { ok: true, value: [1, 2] }
 * combineResults([ok(1), err('E_ROW_2'), err('E_ROW_3')]); // => { ok: false, error: 'E_ROW_2' }
 */
export function combineResults<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
}

/**
 * Field-error map for form error summaries (`error-summary`, `form-field`).
 * Collects `fields` from `ValidationError`s; other errors go under `formKey`.
 * @example
 * const errors = [new ValidationError('HLP_V', 'Invalid.', { fields: { email: 'Enter a valid email address.' } }), new Error('Server unavailable.')];
 * fieldErrors(errors); // => { email: 'Enter a valid email address.', _form: 'Server unavailable.' }
 */
export function fieldErrors(errors: readonly unknown[], formKey = '_form'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors) {
    if (e instanceof HelperError && Object.keys(e.fields).length) {
      for (const [k, v] of Object.entries(e.fields)) if (!(k in out)) out[k] = v;
    } else if (!(formKey in out)) {
      out[formKey] = toError(e).message;
    }
  }
  return out;
}

/**
 * Throws a `HelperError` with code `HLP_ASSERT` when `condition` is falsy.
 * @example
 * const budget = -5;
 * invariant(budget >= 0, 'Budget must not be negative.'); // => throws HLP_ASSERT
 */
export function invariant(condition: unknown, message = 'Invariant failed.', code = 'HLP_ASSERT'): asserts condition {
  if (!condition) throw new HelperError(code, message);
}

/**
 * Exhaustiveness check for `switch` statements.
 * @example
 * type Shift = 'day' | 'night';
 * function label(shift: Shift): string {
 *   switch (shift) {
 *     case 'day': return 'Day shift';
 *     case 'night': return 'Night shift';
 *     default: return assertNever(shift); // compile error if a Shift is not handled
 *   }
 * }
 * label('night'); // => 'Night shift'
 */
export function assertNever(value: never, message = 'Unexpected value.'): never {
  throw new HelperError('HLP_UNREACHABLE', message, { cause: value });
}
