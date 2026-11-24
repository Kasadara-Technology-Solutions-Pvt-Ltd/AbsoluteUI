/**
 * RFC 9457 Problem Details parsing and mapping to form field errors.
 */
import { LimitError } from '../error/index.js';
import { isUnsafeKey } from '../internal/keys.js';
import { isPlainObject } from '../is/index.js';

/** Normalized problem details. Members with the wrong JSON type are ignored (RFC 9457 section 3.1). */
export interface ProblemDetails {
  /** Problem type URI; `'about:blank'` when absent. */
  readonly type: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly instance?: string;
  /** Every other member (unsafe keys dropped). */
  readonly extensions: Readonly<Record<string, unknown>>;
  /** Field errors extracted with {@link problemToFieldErrors}. */
  readonly fieldErrors: Readonly<Record<string, string>>;
}

const STANDARD = new Set(['type', 'title', 'status', 'detail', 'instance']);

/**
 * True for an object that looks like RFC 9457 problem details: at least one of `type`,
 * `title` or `status`, and every standard member present has the right type.
 * @example isProblemDetails({ title: 'Out of credit', status: 403 }) // => true
 */
export function isProblemDetails(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  const { type, title, status, detail, instance } = value;
  if (type !== undefined && typeof type !== 'string') return false;
  if (title !== undefined && typeof title !== 'string') return false;
  if (status !== undefined && !(Number.isInteger(status) && (status as number) >= 100 && (status as number) <= 599)) return false;
  if (detail !== undefined && typeof detail !== 'string') return false;
  if (instance !== undefined && typeof instance !== 'string') return false;
  return type !== undefined || title !== undefined || status !== undefined;
}

/** Converts a JSON Pointer (`#/items/2/qty` or `/items/2/qty`) to `items[2].qty`. */
function pointerToPath(pointer: string): string {
  let p = pointer.startsWith('#') ? pointer.slice(1) : pointer;
  if (!p.startsWith('/')) return p.startsWith('$.') ? p.slice(2) : p;
  p = p.slice(1);
  let out = '';
  for (const raw of p.split('/')) {
    let seg = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    try {
      seg = decodeURIComponent(seg);
    } catch {
      // keep as is
    }
    out += /^\d+$/.test(seg) ? `[${seg}]` : out === '' ? seg : `.${seg}`;
  }
  return out;
}

const firstString = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.find((x): x is string => typeof x === 'string');
  return undefined;
};

/**
 * Extracts field errors from common problem-details extensions: `invalid-params`
 * (`[{ name, reason }]`, RFC 7807), `errors` as `[{ detail, pointer }]` (RFC 9457 example),
 * `[{ field, message }]`, or `{ field: string | string[] }` (ASP.NET), and `violations`
 * (`[{ field, message }]`). Pointers become paths like `items[2].qty`; first message per field.
 * @example problemToFieldErrors({ errors: [{ detail: 'must be positive', pointer: '#/age' }] }) // => { age: 'must be positive' }
 */
export function problemToFieldErrors(problem: unknown, maxFields = 200): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isPlainObject(problem)) return out;
  const src = isPlainObject(problem.extensions) ? { ...problem.extensions, ...problem } : problem;
  const add = (field: unknown, message: unknown): void => {
    const f = typeof field === 'string' ? pointerToPath(field.trim()) : undefined;
    const m = firstString(message);
    if (f === undefined || m === undefined || isUnsafeKey(f) || Object.keys(out).length >= maxFields) return;
    if (!Object.prototype.hasOwnProperty.call(out, f)) out[f] = m;
  };
  const fromList = (list: unknown): void => {
    if (!Array.isArray(list)) return;
    for (const item of list.slice(0, maxFields)) {
      if (!isPlainObject(item)) continue;
      add(item.pointer ?? item.field ?? item.name ?? item.path ?? item.propertyPath ?? item.parameter, item.detail ?? item.reason ?? item.message ?? item.title);
    }
  };
  fromList(src['invalid-params']);
  fromList(src.violations);
  const errors = src.errors;
  if (Array.isArray(errors)) fromList(errors);
  else if (isPlainObject(errors)) for (const k of Object.keys(errors).slice(0, maxFields)) add(k, errors[k]);
  return out;
}

/**
 * Parses RFC 9457 problem details from a JSON string or an already-parsed value. Returns
 * `undefined` when the input is not a problem-details object. JSON text over `maxLength`
 * (default 1 000 000) throws `HLP_HTTP_PROBLEM_TOO_LARGE`.
 * @example parseProblemDetails('{"type":"https://example.com/probs/out-of-credit","title":"You do not have enough credit.","status":403,"balance":30}')
 * // { type: 'https://example.com/probs/out-of-credit', title: '…', status: 403, extensions: { balance: 30 }, fieldErrors: {} }
 */
export function parseProblemDetails(input: unknown, options: { readonly maxLength?: number } = {}): ProblemDetails | undefined {
  const { maxLength = 1_000_000 } = options;
  let value = input;
  if (typeof input === 'string') {
    if (input.length > maxLength) throw new LimitError('HLP_HTTP_PROBLEM_TOO_LARGE', 'The problem details document is too large.', { details: { maxLength } });
    try {
      value = JSON.parse(input, (k, v: unknown) => (isUnsafeKey(k) ? undefined : v)) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!isPlainObject(value)) return undefined;
  const v = value;
  const out: { -readonly [K in keyof ProblemDetails]: ProblemDetails[K] } = { type: typeof v.type === 'string' && v.type !== '' ? v.type : 'about:blank', extensions: {}, fieldErrors: {} };
  if (typeof v.title === 'string') out.title = v.title;
  if (Number.isInteger(v.status) && (v.status as number) >= 100 && (v.status as number) <= 599) out.status = v.status as number;
  if (typeof v.detail === 'string') out.detail = v.detail;
  if (typeof v.instance === 'string') out.instance = v.instance;
  const ext: Record<string, unknown> = {};
  for (const k of Object.keys(v)) if (!STANDARD.has(k) && !isUnsafeKey(k)) ext[k] = v[k];
  out.extensions = ext;
  out.fieldErrors = problemToFieldErrors(v);
  if (out.title === undefined && out.status === undefined && out.detail === undefined && v.type === undefined) return undefined;
  return out;
}
