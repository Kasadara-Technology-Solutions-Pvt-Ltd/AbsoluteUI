/**
 * Small composable schema validator (docs/PLAN-HELPERS.md section 2, section 5, section 6). Not a full schema
 * library: builders are plain functions (tree-shakeable), output objects are freshly built and
 * never receive `__proto__`/`constructor`/`prototype` keys, depth and size are bounded, and
 * failures map field paths (`address.zip`, `items[2].qty`) to actionable, localizable messages.
 */
import { ValidationError, err, ok, type Result } from '../error/index.js';
import { assertSafeKey, hasOwn, isUnsafeKey } from '../internal/keys.js';
import { isPlainObject } from '../is/index.js';
import { formatPlainDate, isPlainDate, parsePlainDate, plainDateFromInstant, toEpochDay, toPlainDate, type DateInput, type PlainDate } from '../date/plain-date.js';
import { isEmail, isUrl, type EmailOptions, type UrlOptions } from './formats.js';

/** One validation failure. `params` hold schema-defined values (limits, options), never input. */
export interface Issue {
  /** Field path: `''` for the root, `address.zip`, `items[2].qty`. */
  readonly path: string;
  /** Message code, for example `string.min`, resolved through the message catalog. */
  readonly code: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** Internal traversal state (exported for declaration output only). */
export interface ParseContext {
  readonly issues: Issue[];
  depth: number;
  nodes: number;
  stopped: boolean;
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxIssues: number;
  readonly maxStringLength: number;
}

/** Internal parse outcome. */
export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/** A validator for values of type `T`. Build with the `v.*` functions. */
export interface Schema<T> {
  readonly kind: string;
  /** True for `v.optional(...)`: the property may be absent from an object. */
  readonly optional: boolean;
  /** @internal Runs the check; prefer {@link validate}. */
  readonly run: (input: unknown, ctx: ParseContext, path: string) => Outcome<T>;
}

/** Schema produced by `v.optional`. */
export interface OptionalSchema<T> extends Schema<T | undefined> {
  readonly optional: true;
}

/**
 * Output type of a schema.
 * @example
 * const userSchema = v.object({ email: v.string({ email: true }), age: v.optional(v.number()) });
 * type User = Infer<typeof userSchema>; // { email: string; age?: number | undefined }
 */
export type Infer<S> = S extends Schema<infer T> ? T : never;

type Shape = Readonly<Record<string, Schema<unknown>>>;
type OptionalKeys<S extends Shape> = { [K in keyof S]: S[K] extends { readonly optional: true } ? K : never }[keyof S];
type Simplify<T> = { [K in keyof T]: T[K] } & {};
/** Object type inferred from a shape; `v.optional` properties become optional. */
export type InferShape<S extends Shape> = Simplify<{ -readonly [K in Exclude<keyof S, OptionalKeys<S>>]: Infer<S[K]> } & { -readonly [K in OptionalKeys<S>]?: Infer<S[K]> }>;

const FAIL: Outcome<never> = Object.freeze({ ok: false });
const pass = <T>(value: T): Outcome<T> => ({ ok: true, value });

function issue(ctx: ParseContext, path: string, code: string, params: Readonly<Record<string, unknown>> = {}): Outcome<never> {
  if (ctx.issues.length < ctx.maxIssues) ctx.issues.push({ path, code, params });
  else ctx.stopped = true;
  return FAIL;
}

function enter(ctx: ParseContext, path: string): boolean {
  ctx.nodes++;
  if (ctx.nodes > ctx.maxNodes) {
    if (!ctx.stopped) issue(ctx, '', 'limit.size', { max: ctx.maxNodes });
    ctx.stopped = true;
    return false;
  }
  if (ctx.depth > ctx.maxDepth) {
    issue(ctx, path, 'limit.depth', { max: ctx.maxDepth });
    return false;
  }
  return !ctx.stopped;
}

const IDENT = /^[a-z_$][\w$]*$/i;
const keyPath = (path: string, key: string): string => {
  const k = key.length > 100 ? key.slice(0, 100) : key;
  const seg = IDENT.test(k) ? k : `[${JSON.stringify(k)}]`;
  return path === '' || seg.startsWith('[') ? path + seg : `${path}.${seg}`;
};
const indexPath = (path: string, i: number): string => `${path}[${i}]`;

function make<T>(kind: string, run: (input: unknown, ctx: ParseContext, path: string) => Outcome<T>): Schema<T> {
  return Object.freeze({ kind, optional: false, run: (input: unknown, ctx: ParseContext, path: string) => (enter(ctx, path) ? run(input, ctx, path) : FAIL) });
}

const codePointLength = (s: string): number => {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0xdc00 || c > 0xdfff) n++;
  }
  return n;
};

// ---------------------------------------------------------------------------
// Builders

export interface StringOptions {
  /** Minimum length in code points. `min >= 1` reports an empty value as `required`. */
  readonly min?: number;
  /** Maximum length in code points. */
  readonly max?: number;
  /** Pattern the value must match (`g`/`y` flags are ignored). Keep it linear-time. */
  readonly pattern?: RegExp;
  /** Message code for a pattern mismatch. Default `string.pattern`. */
  readonly patternCode?: string;
  /** Trim before checking; the output is trimmed. Default false. */
  readonly trim?: boolean;
  /** Lowercase the output. Default false. */
  readonly lowercase?: boolean;
  /** Require an e-mail address ({@link isEmail}). */
  readonly email?: boolean | EmailOptions;
  /** Require an absolute URL ({@link isUrl}; http/https by default). */
  readonly url?: boolean | UrlOptions;
}

/**
 * String schema.
 * @example string({ min: 1, max: 80, trim: true })
 */
export function string(options: StringOptions = {}): Schema<string> {
  const { min, max, trim = false, lowercase = false, patternCode = 'string.pattern' } = options;
  const pattern = options.pattern ? new RegExp(options.pattern.source, options.pattern.flags.replace(/[gy]/g, '')) : undefined;
  const emailOpts = options.email === true ? {} : options.email === false ? undefined : options.email;
  const urlOpts = options.url === true ? {} : options.url === false ? undefined : options.url;
  return make('string', (input, ctx, path) => {
    if (input === undefined || input === null) return issue(ctx, path, 'required');
    if (typeof input !== 'string') return issue(ctx, path, 'type.string');
    if (input.length > ctx.maxStringLength) return issue(ctx, path, 'limit.size', { max: ctx.maxStringLength });
    let s = trim ? input.trim() : input;
    if (lowercase) s = s.toLowerCase();
    if (s === '' && min !== undefined && min > 0) return issue(ctx, path, 'required');
    const len = min !== undefined || max !== undefined ? codePointLength(s) : 0;
    if (min !== undefined && len < min) return issue(ctx, path, 'string.min', { min });
    if (max !== undefined && len > max) return issue(ctx, path, 'string.max', { max });
    if (emailOpts && !isEmail(s, emailOpts)) return issue(ctx, path, 'string.email');
    if (urlOpts && !isUrl(s, urlOpts)) return issue(ctx, path, 'string.url');
    if (pattern && !pattern.test(s)) return issue(ctx, path, patternCode);
    return pass(s);
  });
}

export interface NumberOptions {
  readonly min?: number;
  readonly max?: number;
  /** Require a safe integer. */
  readonly integer?: boolean;
  /** Accept numeric strings (trimmed, plain decimal) such as form input. Default false. */
  readonly coerce?: boolean;
}

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * Finite number schema (`NaN` and infinities are rejected).
 * @example number({ min: 0, integer: true })
 */
export function number(options: NumberOptions = {}): Schema<number> {
  const { min, max, integer = false, coerce = false } = options;
  return make('number', (input, ctx, path) => {
    let n = input;
    if (coerce && typeof n === 'string') {
      const s = n.trim();
      if (s === '') return issue(ctx, path, 'required');
      n = s.length <= 400 && DECIMAL.test(s) ? Number(s) : Number.NaN;
    }
    if (n === undefined || n === null) return issue(ctx, path, 'required');
    if (typeof n !== 'number' || !Number.isFinite(n)) return issue(ctx, path, 'type.number');
    if (integer && !Number.isSafeInteger(n)) return issue(ctx, path, 'number.integer');
    if (min !== undefined && n < min) return issue(ctx, path, 'number.min', { min });
    if (max !== undefined && n > max) return issue(ctx, path, 'number.max', { max });
    return pass(n);
  });
}

/**
 * Boolean schema. With `coerce`, accepts `'true'/'false'`, `'on'/'off'`, `'yes'/'no'`, `'1'/'0'`.
 * @example boolean({ coerce: true })
 */
export function boolean(options: { readonly coerce?: boolean } = {}): Schema<boolean> {
  const coerce = options.coerce === true;
  return make('boolean', (input, ctx, path) => {
    if (typeof input === 'boolean') return pass(input);
    if (coerce && typeof input === 'string') {
      const s = input.trim().toLowerCase();
      if (s === 'true' || s === 'on' || s === 'yes' || s === '1') return pass(true);
      if (s === 'false' || s === 'off' || s === 'no' || s === '0') return pass(false);
    }
    if (input === undefined || input === null) return issue(ctx, path, 'required');
    return issue(ctx, path, 'type.boolean');
  });
}

export interface DateOptions {
  /** Earliest allowed date (inclusive). */
  readonly min?: DateInput;
  /** Latest allowed date (inclusive). */
  readonly max?: DateInput;
  /** Time zone used to take the calendar date of a `Date` input. Default: runtime zone. */
  readonly timeZone?: string;
}

/**
 * Date-only schema producing a `PlainDate`. Accepts `'YYYY-MM-DD'`, a `PlainDate`, or a valid
 * `Date` (its calendar date in `timeZone`).
 * @example date({ min: '2000-01-01' })
 */
export function date(options: DateOptions = {}): Schema<PlainDate> {
  const min = options.min === undefined ? undefined : toPlainDate(options.min);
  const max = options.max === undefined ? undefined : toPlainDate(options.max);
  const { timeZone } = options;
  return make('date', (input, ctx, path) => {
    if (input === undefined || input === null || input === '') return issue(ctx, path, 'required');
    let d: PlainDate | undefined;
    if (typeof input === 'string') d = parsePlainDate(input.trim());
    else if (isPlainDate(input)) d = parsePlainDate(formatPlainDate(input));
    else if (input instanceof Date && !Number.isNaN(input.getTime())) d = plainDateFromInstant(input, timeZone);
    if (!d) return issue(ctx, path, 'type.date');
    if (min && toEpochDay(d) < toEpochDay(min)) return issue(ctx, path, 'date.min', { min: formatPlainDate(min) });
    if (max && toEpochDay(d) > toEpochDay(max)) return issue(ctx, path, 'date.max', { max: formatPlainDate(max) });
    return pass(d);
  });
}

/**
 * Exactly one primitive value.
 * @example literal('admin')
 */
export function literal<const T extends string | number | boolean | null>(value: T): Schema<T> {
  return make('literal', (input, ctx, path) => (Object.is(input, value) ? pass(value) : input === undefined ? issue(ctx, path, 'required') : issue(ctx, path, 'literal', { expected: value })));
}

/**
 * One of a fixed list of strings or numbers.
 * @example enumOf(['draft', 'published'] as const)
 */
export function enumOf<const T extends readonly (string | number)[]>(values: T): Schema<T[number]> {
  const set = new Set<unknown>(values);
  const options = Object.freeze([...values]);
  return make('enum', (input, ctx, path) => {
    if (set.has(input)) return pass(input as T[number]);
    if (input === undefined || input === null || input === '') return issue(ctx, path, 'required');
    return issue(ctx, path, 'enum', { options });
  });
}

/**
 * Array schema; every item is validated and reported with its index.
 * @example array(string(), { min: 1, max: 10 })
 */
export function array<T>(item: Schema<T>, options: { readonly min?: number; readonly max?: number } = {}): Schema<T[]> {
  const { min, max } = options;
  return make('array', (input, ctx, path) => {
    if (input === undefined || input === null) return issue(ctx, path, 'required');
    if (!Array.isArray(input)) return issue(ctx, path, 'type.array');
    if (input.length > ctx.maxNodes) return issue(ctx, path, 'limit.size', { max: ctx.maxNodes });
    if (min !== undefined && input.length < min) return issue(ctx, path, 'array.min', { min });
    if (max !== undefined && input.length > max) return issue(ctx, path, 'array.max', { max });
    const out: T[] = [];
    let good = true;
    ctx.depth++;
    try {
      for (let i = 0; i < input.length; i++) {
        if (ctx.stopped) return FAIL;
        const r = item.run(input[i], ctx, indexPath(path, i));
        if (r.ok) out.push(r.value);
        else good = false;
      }
    } finally {
      ctx.depth--;
    }
    return good ? pass(out) : FAIL;
  });
}

export interface ObjectOptions {
  /**
   * Keys not in the shape: `'strip'` (default) drops them, `'error'` reports each, `'keep'`
   * copies them. `__proto__`, `constructor` and `prototype` are always rejected.
   */
  readonly unknownKeys?: 'strip' | 'error' | 'keep';
}

/**
 * Object schema. Accepts plain objects only and builds a fresh output object.
 * @example object({ name: string({ min: 1 }), age: optional(number({ integer: true })) })
 */
export function object<const S extends Shape>(shape: S, options: ObjectOptions = {}): Schema<InferShape<S>> {
  const unknownKeys = options.unknownKeys ?? 'strip';
  const keys = Object.keys(shape);
  for (const k of keys) assertSafeKey(k);
  const known = new Set(keys);
  return make('object', (input, ctx, path) => {
    if (input === undefined || input === null) return issue(ctx, path, 'required');
    if (!isPlainObject(input)) return issue(ctx, path, 'type.object');
    const out: Record<string, unknown> = {};
    let good = true;
    ctx.depth++;
    try {
      for (const k of keys) {
        if (ctx.stopped) return FAIL;
        const schema = shape[k];
        if (!schema) continue;
        const present = hasOwn(input, k);
        const r = schema.run(present ? input[k] : undefined, ctx, keyPath(path, k));
        if (!r.ok) good = false;
        else if (present || r.value !== undefined) out[k] = r.value;
      }
      for (const k of Object.keys(input)) {
        if (known.has(k)) continue;
        if (isUnsafeKey(k)) {
          good = false;
          issue(ctx, keyPath(path, k), 'object.unsafeKey');
        } else if (unknownKeys === 'error') {
          good = false;
          issue(ctx, keyPath(path, k), 'object.unknownKey');
        } else if (unknownKeys === 'keep') {
          out[k] = input[k];
        }
      }
    } finally {
      ctx.depth--;
    }
    return good ? pass(out as InferShape<S>) : FAIL;
  });
}

/**
 * Allows `undefined` (and a missing object property).
 * @example optional(string())
 */
export function optional<T>(schema: Schema<T>): OptionalSchema<T> {
  return Object.freeze({ kind: 'optional', optional: true as const, run: (input: unknown, ctx: ParseContext, path: string): Outcome<T | undefined> => (input === undefined ? pass(undefined) : schema.run(input, ctx, path)) });
}

/**
 * Allows `null`.
 * @example nullable(date())
 */
export function nullable<T>(schema: Schema<T>): Schema<T | null> {
  return Object.freeze({ kind: 'nullable', optional: schema.optional, run: (input: unknown, ctx: ParseContext, path: string): Outcome<T | null> => (input === null ? pass(null) : schema.run(input, ctx, path)) });
}

/**
 * First matching schema wins. If none match, one `union` issue is reported at the path.
 * @example union(literal('auto'), number({ min: 0 }))
 */
export function union<const S extends readonly Schema<unknown>[]>(...schemas: S): Schema<Infer<S[number]>> {
  return make('union', (input, ctx, path) => {
    for (const s of schemas) {
      const scratch: ParseContext = { ...ctx, issues: [], stopped: false };
      const r = s.run(input, scratch, path);
      ctx.nodes = scratch.nodes;
      if (r.ok) return r as Outcome<Infer<S[number]>>;
      if (scratch.issues.some((i) => i.code.startsWith('limit.'))) {
        for (const i of scratch.issues) issue(ctx, i.path, i.code, i.params);
        return FAIL;
      }
    }
    if (input === undefined || input === null) return issue(ctx, path, 'required');
    return issue(ctx, path, 'union');
  });
}

/**
 * Adds a custom rule; runs only when the base schema passed. A throwing predicate counts as
 * a failure.
 * @example refine(string(), (s) => s !== 'admin', 'username.reserved')
 */
export function refine<T>(schema: Schema<T>, predicate: (value: T) => boolean, code = 'custom', params: Readonly<Record<string, unknown>> = {}): Schema<T> {
  return Object.freeze({
    kind: schema.kind,
    optional: schema.optional,
    run: (input: unknown, ctx: ParseContext, path: string): Outcome<T> => {
      const r = schema.run(input, ctx, path);
      if (!r.ok) return r;
      let okay: boolean;
      try {
        okay = predicate(r.value);
      } catch {
        okay = false;
      }
      return okay ? r : issue(ctx, path, code, params);
    },
  });
}

/**
 * Maps the validated value. A throwing mapper reports `invalid` at the path.
 * @example transform(string({ trim: true }), (s) => s.split(','))
 */
export function transform<T, U>(schema: Schema<T>, fn: (value: T) => U): Schema<U> {
  return Object.freeze({
    kind: schema.kind,
    optional: schema.optional,
    run: (input: unknown, ctx: ParseContext, path: string): Outcome<U> => {
      const r = schema.run(input, ctx, path);
      if (!r.ok) return r;
      try {
        return pass(fn(r.value));
      } catch {
        return issue(ctx, path, 'invalid');
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Messages and entry point

/** Resolves a message code to text. Replace it to localize. */
export type MessageCatalog = (code: string, params: Readonly<Record<string, unknown>>) => string;

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : v === null ? 'null' : '');

const MESSAGES: Readonly<Record<string, (p: Readonly<Record<string, unknown>>) => string>> = {
  required: () => 'Enter a value for this field.',
  'type.string': () => 'Enter text.',
  'type.number': () => 'Enter a number, for example 42 or 3.5.',
  'type.boolean': () => 'Choose yes or no.',
  'type.date': () => 'Enter a date in the format YYYY-MM-DD.',
  'type.array': () => 'Provide a list of values.',
  'type.object': () => 'Provide the details for this section.',
  'string.min': (p) => `Enter at least ${str(p.min)} characters.`,
  'string.max': (p) => `Enter no more than ${str(p.max)} characters.`,
  'string.pattern': () => 'Enter a value in the required format.',
  'string.email': () => 'Enter an email address in the format name@example.com.',
  'string.url': () => 'Enter a web address in the format https://example.com.',
  'number.integer': () => 'Enter a whole number without decimals.',
  'number.min': (p) => `Enter a number that is ${str(p.min)} or more.`,
  'number.max': (p) => `Enter a number that is ${str(p.max)} or less.`,
  'date.min': (p) => `Enter a date on or after ${str(p.min)}.`,
  'date.max': (p) => `Enter a date on or before ${str(p.max)}.`,
  literal: (p) => `Enter ${str(p.expected)}.`,
  enum: (p) => {
    const opts = Array.isArray(p.options) ? (p.options as unknown[]) : [];
    return opts.length > 0 && opts.length <= 10 ? `Choose one of: ${opts.map(str).join(', ')}.` : 'Choose one of the available options.';
  },
  'array.min': (p) => `Add at least ${str(p.min)} ${p.min === 1 ? 'item' : 'items'}.`,
  'array.max': (p) => `Add no more than ${str(p.max)} ${p.max === 1 ? 'item' : 'items'}.`,
  'object.unknownKey': () => 'Remove this field; it is not recognized.',
  'object.unsafeKey': () => 'Remove this field; its name is not allowed.',
  union: () => 'Enter a value in one of the accepted formats.',
  invalid: () => 'Check this value and correct it.',
  custom: () => 'Check this value and correct it.',
  'limit.depth': () => 'The data is nested too deeply. Simplify it and try again.',
  'limit.size': () => 'The data is too large. Reduce its size and try again.',
};

/**
 * English default catalog. Unknown codes get a generic, still actionable message.
 * @example defaultMessages('string.min', { min: 3 }) // => 'Enter at least 3 characters.'
 */
export const defaultMessages: MessageCatalog = (code, params) => {
  const fn = hasOwn(MESSAGES, code) ? MESSAGES[code] : undefined;
  return fn ? fn(params) : 'Check this value and correct it.';
};

export interface ValidateOptions {
  /** Message catalog; defaults to {@link defaultMessages}. */
  readonly messages?: MessageCatalog;
  /** Maximum object/array nesting. Default 32. */
  readonly maxDepth?: number;
  /** Maximum number of values visited. Default 100 000. */
  readonly maxNodes?: number;
  /** Stop after this many issues. Default 100. */
  readonly maxIssues?: number;
  /** Maximum string length (UTF-16 units) before any check. Default 1 000 000. */
  readonly maxStringLength?: number;
  /** `fields` key for root-level issues. Default `'_form'`. */
  readonly formKey?: string;
}

/**
 * Validates `input`. On failure returns a `ValidationError` (`HLP_VALIDATE_FAILED`) whose
 * `fields` map each path to its first message and whose `details.issues` list every issue.
 * @example
 * const r = validate(v.object({ email: v.string({ email: true }) }), { email: 'x' });
 * r.ok ? {} : r.error.fields; // => { email: 'Enter an email address in the format name@example.com.' }
 */
export function validate<T>(schema: Schema<T>, input: unknown, options: ValidateOptions = {}): Result<T, ValidationError> {
  const { messages = defaultMessages, maxDepth = 32, maxNodes = 100_000, maxIssues = 100, maxStringLength = 1_000_000, formKey = '_form' } = options;
  const ctx: ParseContext = { issues: [], depth: 0, nodes: 0, stopped: false, maxDepth, maxNodes, maxIssues, maxStringLength };
  const r = schema.run(input, ctx, '');
  if (r.ok && ctx.issues.length === 0) return ok(r.value);
  const fields: Record<string, string> = {};
  for (const i of ctx.issues) {
    const key = i.path === '' ? formKey : i.path;
    if (!hasOwn(fields, key)) Object.defineProperty(fields, key, { value: messages(i.code, i.params), enumerable: true, writable: true, configurable: true });
  }
  return err(new ValidationError('HLP_VALIDATE_FAILED', 'The input is not valid.', { fields, details: { issues: ctx.issues.map((i) => ({ path: i.path, code: i.code, params: i.params })) } }));
}

/**
 * Binds a message catalog (for example a localized one) to {@link validate}.
 * @example
 * const check = createValidator((code) => `validation.${code}`);
 * const r = check(v.object({ name: v.string({ min: 1 }) }), { name: 42 });
 * r.ok ? {} : r.error.fields; // => { name: 'validation.type.string' }
 */
export function createValidator(messages: MessageCatalog, defaults: Omit<ValidateOptions, 'messages'> = {}) {
  return <T>(schema: Schema<T>, input: unknown, options: Omit<ValidateOptions, 'messages'> = {}): Result<T, ValidationError> => validate(schema, input, { ...defaults, ...options, messages });
}
