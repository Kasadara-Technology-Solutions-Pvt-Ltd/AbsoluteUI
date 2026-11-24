/**
 * Form validation engine (SPEC section 18.8). Pure constraint checks shared by every
 * input, mirroring the HTML constraint validation model, plus localized messages.
 * Messages never include the user's value (section 14.4); only constraint parameters.
 */
import { configurationError, getMessage, registerMessages } from '@absoluteui/core';

registerMessages('validation', 'en', {
  valueMissing: 'This field is required.',
  valueMissingChoice: 'Select an option.',
  valueMissingCheckbox: 'Check this box to continue.',
  tooShort: 'Enter at least {minLength} characters.',
  tooLong: 'Enter {maxLength} characters or fewer.',
  patternMismatch: 'Enter a value in the requested format.',
  typeMismatchEmail: 'Enter a valid email address.',
  typeMismatchUrl: 'Enter a valid URL, including the scheme (for example https://).',
  badInput: 'Enter a number.',
  rangeUnderflow: 'Enter a value of {min} or more.',
  rangeOverflow: 'Enter a value of {max} or less.',
  stepMismatch: 'Enter a valid value. The nearest valid values are {lower} and {upper}.',
  tooFewSelected: 'Select at least {min} options.',
  tooFewSelectedOne: 'Select at least 1 option.',
  tooManySelected: 'Select {max} options or fewer.',
  tooManySelectedOne: 'Select 1 option or fewer.',
});

export type ValidationErrorCode =
  | 'value-missing'
  | 'too-short'
  | 'too-long'
  | 'pattern-mismatch'
  | 'type-mismatch'
  | 'bad-input'
  | 'range-underflow'
  | 'range-overflow'
  | 'step-mismatch'
  | 'too-few-selected'
  | 'too-many-selected'
  | 'custom';

/** Validity of one control. `message` is localized and empty when valid. */
export interface FieldValidity {
  readonly valid: boolean;
  readonly error: ValidationErrorCode | null;
  readonly message: string;
}

export const VALID: FieldValidity = Object.freeze({ valid: true, error: null, message: '' });

export interface TextConstraints {
  readonly required?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: RegExp | null;
  readonly type?: 'text' | 'email' | 'url' | 'tel' | 'password' | 'search';
}

export interface NumberConstraints {
  readonly required?: boolean;
  readonly min?: number | null;
  readonly max?: number | null;
  readonly step?: number | null;
  /** Step base (HTML: min, else 0). */
  readonly stepBase?: number;
}

export interface Outcome {
  readonly error: ValidationErrorCode | null;
  readonly params: Readonly<Record<string, string | number>>;
}

const OK: Outcome = Object.freeze({ error: null, params: {} });

// WHATWG HTML "valid email address" production.
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** Length in Unicode code points (what users perceive better than UTF-16 units). */
export function textLength(value: string): number {
  return Array.from(value).length;
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol.length > 1 && (url.host !== '' || url.protocol === 'mailto:');
  } catch {
    return false;
  }
}

/**
 * Compile an HTML `pattern` attribute value exactly like the browser does
 * (anchored, `v` flag). Invalid patterns are developer errors.
 */
export function compilePattern(pattern: string | undefined, component: string): RegExp | null {
  if (pattern === undefined || pattern === '') return null;
  try {
    return new RegExp(`^(?:${pattern})$`, 'v');
  } catch {
    throw configurationError('FIELD_PATTERN', 'Invalid pattern.', { component, property: `${component}.pattern`, expected: 'valid RegExp source (v flag)' });
  }
}

export function checkText(value: string, c: TextConstraints): Outcome {
  if (value === '') return c.required ? { error: 'value-missing', params: {} } : OK;
  const length = textLength(value);
  if (c.type === 'email' && !EMAIL_RE.test(value)) return { error: 'type-mismatch', params: { type: 'email' } };
  if (c.type === 'url' && !isUrl(value)) return { error: 'type-mismatch', params: { type: 'url' } };
  if (c.minLength !== undefined && length < c.minLength) return { error: 'too-short', params: { minLength: c.minLength } };
  if (c.maxLength !== undefined && length > c.maxLength) return { error: 'too-long', params: { maxLength: c.maxLength } };
  if (c.pattern && !c.pattern.test(value)) return { error: 'pattern-mismatch', params: {} };
  return OK;
}

/** Floating-point tolerant step check. Returns the nearest valid neighbours on mismatch. */
export function checkStep(value: number, step: number, base: number): { lower: number; upper: number } | null {
  if (!(step > 0)) return null;
  const n = (value - base) / step;
  const rounded = Math.round(n);
  if (Math.abs(n - rounded) < 1e-9 * Math.max(1, Math.abs(n))) return null;
  const decimals = Math.max(decimalPlaces(step), decimalPlaces(base));
  const fix = (x: number): number => Number(x.toFixed(Math.min(20, decimals)));
  return { lower: fix(base + Math.floor(n) * step), upper: fix(base + Math.ceil(n) * step) };
}

export function decimalPlaces(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const s = String(x);
  const e = /e-(\d+)$/.exec(s);
  if (e) return Number(e[1]) + (s.split('e')[0]?.split('.')[1]?.length ?? 0);
  return s.split('.')[1]?.length ?? 0;
}

export function checkNumber(value: number | null, badInput: boolean, c: NumberConstraints): Outcome {
  if (badInput) return { error: 'bad-input', params: {} };
  if (value === null) return c.required ? { error: 'value-missing', params: {} } : OK;
  if (c.min !== undefined && c.min !== null && value < c.min) return { error: 'range-underflow', params: { min: c.min } };
  if (c.max !== undefined && c.max !== null && value > c.max) return { error: 'range-overflow', params: { max: c.max } };
  if (c.step !== undefined && c.step !== null) {
    const near = checkStep(value, c.step, c.stepBase ?? c.min ?? 0);
    if (near) return { error: 'step-mismatch', params: near };
  }
  return OK;
}

export interface MessageContext {
  readonly locale: string;
  /** How missing values are phrased. Default `text`. */
  readonly kind?: 'text' | 'choice' | 'checkbox';
  /** Formats numeric parameters (e.g. locale number formatting). */
  readonly formatNumber?: (n: number) => string;
}

/** Localized message for an outcome. */
export function messageFor(outcome: Outcome, ctx: MessageContext): string {
  const p = outcome.params;
  const num = (key: string): string => {
    const v = p[key];
    return typeof v === 'number' && ctx.formatNumber ? ctx.formatNumber(v) : String(v ?? '');
  };
  const m = (key: string, params: Record<string, string | number> = {}): string => getMessage('validation', key, params, ctx.locale);
  switch (outcome.error) {
    case null:
      return '';
    case 'value-missing':
      return m(ctx.kind === 'choice' ? 'valueMissingChoice' : ctx.kind === 'checkbox' ? 'valueMissingCheckbox' : 'valueMissing');
    case 'too-short':
      return m('tooShort', { minLength: num('minLength') });
    case 'too-long':
      return m('tooLong', { maxLength: num('maxLength') });
    case 'pattern-mismatch':
      return m('patternMismatch');
    case 'type-mismatch':
      return m(p.type === 'url' ? 'typeMismatchUrl' : 'typeMismatchEmail');
    case 'bad-input':
      return m('badInput');
    case 'range-underflow':
      return m('rangeUnderflow', { min: num('min') });
    case 'range-overflow':
      return m('rangeOverflow', { max: num('max') });
    case 'step-mismatch':
      return m('stepMismatch', { lower: num('lower'), upper: num('upper') });
    case 'too-few-selected':
      return p.min === 1 ? m('tooFewSelectedOne') : m('tooFewSelected', { min: num('min') });
    case 'too-many-selected':
      return p.max === 1 ? m('tooManySelectedOne') : m('tooManySelected', { max: num('max') });
    case 'custom':
      return String(p.message ?? '');
  }
}

/**
 * Combine a built-in outcome with consumer validation. Precedence: built-in
 * constraint, then the `validate` callback, then an externally set custom error
 * (for example from a server or a cross-field rule).
 */
export function resolveValidity(outcome: Outcome, ctx: MessageContext, custom: string | null, external: string | null): FieldValidity {
  if (outcome.error !== null) return Object.freeze({ valid: false, error: outcome.error, message: messageFor(outcome, ctx) });
  const message = custom ?? external;
  if (message !== null && message !== '') return Object.freeze({ valid: false, error: 'custom', message });
  return VALID;
}

/** Run a consumer validator; its result must be a string (error) or null. */
export function runValidator<V>(validate: ((value: V) => string | null) | undefined, value: V): string | null {
  if (!validate) return null;
  const result = validate(value);
  return typeof result === 'string' && result !== '' ? result : null;
}
