/**
 * PII masking in free text and secret redaction in objects for logs (docs/PLAN-HELPERS.md section 5).
 * Neither function mutates its input.
 */
import { isUnsafeKey } from '../internal/keys.js';
import { isPlainObject } from '../is/index.js';

export interface MaskPiiOptions {
  /** Mask e-mail addresses (`j***@example.com`). Default true. */
  readonly email?: boolean;
  /** Mask phone numbers of 7-15 digits, keeping the last 2. Default true. */
  readonly phone?: boolean;
  /** Mask Luhn-valid card numbers, keeping the last 4. Default true. */
  readonly card?: boolean;
  /** Mask checksum-valid IBANs, keeping the country code and last 4. Default true. */
  readonly iban?: boolean;
  /** Mask `123-45-6789`-shaped numbers, keeping the last 4. Default true. */
  readonly ssn?: boolean;
  /** Mask character. Default `'*'`. */
  readonly maskChar?: string;
  /** Input longer than this is truncated before masking (bounded work). Default 1 000 000. */
  readonly maxLength?: number;
}

// Bounded quantifiers everywhere: linear per match start, no catastrophic backtracking.
const EMAIL = /[\w%+.-]{1,64}@[a-z\d-]{1,63}(?:\.[a-z\d-]{1,63}){1,10}/gi;
const IBAN_COMPACT = /\b[A-Z]{2}\d{2}[A-Z\d]{11,30}\b/g;
const IBAN_SPACED = /\b[A-Z]{2}\d{2}(?: [A-Z\d]{4}){2,7}(?: [A-Z\d]{1,4})?\b/g;
const CARD = /\b\d(?:[ -]?\d){11,18}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const PHONE = /(?<![\w+])\+?(?:\(\d{1,4}\)|\d)(?:[ ().-]{0,2}\d){6,16}\b/g;

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function ibanChecksumOk(compact: string): boolean {
  const s = compact.slice(4) + compact.slice(0, 4);
  let rem = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    const v = c >= 65 ? c - 55 : c - 48;
    rem = v > 9 ? (rem * 100 + v) % 97 : (rem * 10 + v) % 97;
  }
  return rem === 1;
}

/** Replaces digits with `mask` except the last `keep` digits; separators stay. */
function maskDigits(text: string, keep: number, mask: string): string {
  let total = 0;
  for (const ch of text) if (ch >= '0' && ch <= '9') total++;
  let seen = 0;
  let out = '';
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') {
      seen++;
      out += seen > total - keep ? ch : mask;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Masks e-mail addresses, phone numbers, card numbers, IBANs and SSN-shaped numbers in free
 * text (for logs, support tickets, previews). Heuristic: never a substitute for not logging PII.
 * @example maskPii('Mail ada@example.com, card 4111 1111 1111 1111') // => 'Mail a***@example.com, card **** **** **** 1111'
 */
export function maskPii(text: string, options: MaskPiiOptions = {}): string {
  const { email = true, phone = true, card = true, iban = true, ssn = true, maskChar = '*', maxLength = 1_000_000 } = options;
  const mask = maskChar === '' ? '*' : (Array.from(maskChar)[0] ?? '*');
  let s = text;
  if (s.length > maxLength) s = s.slice(0, maxLength);
  if (email) {
    s = s.replace(EMAIL, (m) => {
      const at = m.indexOf('@');
      return `${Array.from(m.slice(0, at))[0] ?? ''}${mask.repeat(3)}${m.slice(at)}`;
    });
  }
  if (iban) {
    const maskIban = (m: string): string => {
      const compact = m.replaceAll(' ', '');
      if (!ibanChecksumOk(compact)) return m;
      let kept = 0;
      let out = '';
      const total = compact.length;
      for (const ch of m) {
        if (ch === ' ') {
          out += ch;
          continue;
        }
        kept++;
        out += kept <= 2 || kept > total - 4 ? ch : mask;
      }
      return out;
    };
    s = s.replace(IBAN_SPACED, maskIban).replace(IBAN_COMPACT, maskIban);
  }
  if (card) s = s.replace(CARD, (m) => (luhn(m.replace(/\D/g, '')) ? maskDigits(m, 4, mask) : m));
  if (ssn) s = s.replace(SSN, (m) => maskDigits(m, 4, mask));
  if (phone) {
    s = s.replace(PHONE, (m) => {
      const n = m.replace(/\D/g, '').length;
      return n >= 7 && n <= 15 ? maskDigits(m, 2, mask) : m;
    });
  }
  return s;
}

/**
 * Default secret-looking key pattern for {@link redact}.
 * @example
 * redact({ name: 'Ada', ssn: '123-45-6789', apiKey: 'k1' }, { keys: [...DEFAULT_REDACT_KEYS, /ssn/i] }); // => { name: 'Ada', ssn: '[REDACTED]', apiKey: '[REDACTED]' }
 */
export const DEFAULT_REDACT_KEYS: readonly RegExp[] = [/pass|pwd|secret|token|authori[sz]ation|api[-_]?key|cookie|session|credential|private[-_]?key/i];

export interface RedactOptions {
  /** Key patterns (RegExp) or exact names (case-insensitive) to redact. Default {@link DEFAULT_REDACT_KEYS}. */
  readonly keys?: readonly (RegExp | string)[];
  /** Replacement value. Default `'[REDACTED]'`. */
  readonly replacement?: unknown;
  /** Recurse into nested objects, arrays and Maps. Default true. */
  readonly deep?: boolean;
  /** Deeper values become `'[Truncated]'`. Default 20. */
  readonly maxDepth?: number;
  /** Also run {@link maskPii} on string values. Default false. */
  readonly maskStrings?: boolean | MaskPiiOptions;
}

/**
 * Returns a copy with values under secret-looking keys replaced (for logs and telemetry).
 * Plain objects, arrays and Maps are copied; other objects are kept by reference. Cycles become
 * `'[Circular]'`; unsafe keys (`__proto__`...) are dropped.
 * @example redact({ user: 'ada', password: 'x', headers: { Authorization: 'Bearer t' } })
 * // { user: 'ada', password: '[REDACTED]', headers: { Authorization: '[REDACTED]' } }
 */
export function redact<T>(value: T, options: RedactOptions = {}): T {
  const { keys = DEFAULT_REDACT_KEYS, replacement = '[REDACTED]', deep = true, maxDepth = 20, maskStrings = false } = options;
  const exact = new Set(keys.filter((k): k is string => typeof k === 'string').map((k) => k.toLowerCase()));
  const patterns = keys.filter((k): k is RegExp => k instanceof RegExp).map((r) => new RegExp(r.source, r.flags.replace(/[gy]/g, '')));
  const isSecret = (key: string): boolean => exact.has(key.toLowerCase()) || patterns.some((r) => r.test(key));
  const maskOpts: MaskPiiOptions | undefined = maskStrings === false ? undefined : maskStrings === true ? {} : maskStrings;
  const ancestors = new Set<object>();

  const go = (v: unknown, depth: number): unknown => {
    if (typeof v === 'string') return maskOpts ? maskPii(v, maskOpts) : v;
    if (typeof v !== 'object' || v === null) return v;
    const container = Array.isArray(v) || isPlainObject(v) || v instanceof Map;
    if (!container) return v;
    if (ancestors.has(v)) return '[Circular]';
    if (depth > 0 && !deep) return v;
    if (depth >= maxDepth) return '[Truncated]';
    ancestors.add(v);
    try {
      if (Array.isArray(v)) return v.map((item) => go(item, depth + 1));
      if (v instanceof Map) {
        const out = new Map<unknown, unknown>();
        for (const [k, item] of v) out.set(k, typeof k === 'string' && isSecret(k) ? replacement : go(item, depth + 1));
        return out;
      }
      const src = v;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src)) {
        if (isUnsafeKey(k)) continue;
        out[k] = isSecret(k) ? replacement : go(src[k], depth + 1);
      }
      return out;
    } finally {
      ancestors.delete(v);
    }
  };
  return go(value, 0) as T;
}
