/**
 * Format validators returning booleans (docs/PLAN-HELPERS.md section 2, section 5). Every check bounds input
 * length before any regular expression runs, and every pattern is linear-time.
 */
import { ValidationError } from '../error/index.js';

const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isAsciiDigit = (c: number): boolean => c >= 48 && c <= 57;
const isAsciiAlpha = (c: number): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
/** True when some UTF-16 unit satisfies `pred`. */
const someCode = (s: string, pred: (c: number) => boolean): boolean => {
  for (let i = 0; i < s.length; i++) if (pred(s.charCodeAt(i))) return true;
  return false;
};

// ---------------------------------------------------------------------------
// E-mail and URLs

export interface EmailOptions {
  /** Allow non-ASCII (internationalized) local parts and domain labels. Default false. */
  readonly allowIdn?: boolean;
  /** Require a dot in the domain (reject `user@localhost`). Default true. */
  readonly requireTld?: boolean;
}

const ATEXT_SYMBOLS = "!#$%&'*+/=?^_`{|}~-";
const encoder = new TextEncoder();

function isAtext(c: number, idn: boolean): boolean {
  if (isAsciiAlpha(c) || isAsciiDigit(c)) return true;
  if (c < 128) return ATEXT_SYMBOLS.includes(String.fromCharCode(c));
  // Non-ASCII: letters/marks only when IDN is allowed; never controls, spaces or format chars.
  return idn && c > 0x9f && c !== 0xa0 && c !== 0xad && !(c >= 0x2000 && c <= 0x206f) && c !== 0xfeff && c !== 0x3000;
}

function isDomainName(domain: string, idn: boolean, requireTld: boolean): boolean {
  let ascii = domain;
  if (idn && someCode(domain, (c) => c > 0x7e)) {
    // Convert to Punycode with the platform URL parser; it also applies IDNA mapping.
    try {
      ascii = new URL(`http://${domain}/`).hostname;
    } catch {
      return false;
    }
    if (ascii.startsWith('[')) return false;
  }
  if (ascii.length > 253 || ascii.length === 0) return false;
  const labels = ascii.split('.');
  if (requireTld && labels.length < 2) return false;
  for (const label of labels) {
    if (label.length === 0 || label.length > 63 || label.startsWith('-') || label.endsWith('-')) return false;
    for (let i = 0; i < label.length; i++) {
      const c = label.charCodeAt(i);
      if (!isAsciiAlpha(c) && !isAsciiDigit(c) && c !== 45) return false;
    }
  }
  const tld = labels[labels.length - 1] ?? '';
  // A top-level domain is never all-numeric (rejects user@1.2.3.4).
  return !(requireTld && /^\d+$/.test(tld));
}

/**
 * Practical RFC 5322 `addr-spec` subset: dot-atom local part (no quoted strings, comments or
 * IP literals), host-name domain; at most 254 characters overall and 64 bytes before the `@`.
 * @example isEmail('ada@example.com') // => true
 * @example isEmail('a..b@example.com') // => false
 */
export function isEmail(value: unknown, options: EmailOptions = {}): value is string {
  const { allowIdn = false, requireTld = true } = options;
  if (!isStr(value, 254)) return false;
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (encoder.encode(local).length > 64) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  for (let i = 0; i < local.length; i++) {
    const c = local.charCodeAt(i);
    if (c !== 46 && !isAtext(c, allowIdn)) return false;
  }
  return isDomainName(domain, allowIdn, requireTld);
}

export interface UrlOptions {
  /** Allowed schemes without the colon. Default `['http', 'https']`. */
  readonly schemes?: readonly string[];
  /** Require a host (rejects `mailto:` etc. unless false). Default true. */
  readonly requireHost?: boolean;
  /** Allow `user:password@` credentials (a phishing vector). Default false. */
  readonly allowCredentials?: boolean;
  /** Maximum length. Default 2048. */
  readonly maxLength?: number;
}

/**
 * Absolute URL check via the platform URL parser plus a scheme allow-list. Rejects raw
 * whitespace/control characters (which the parser would silently strip) and, by default,
 * embedded credentials.
 * @example isUrl('https://example.com/a?b=1') // => true
 * @example isUrl('javascript:alert(1)') // => false
 */
export function isUrl(value: unknown, options: UrlOptions = {}): value is string {
  const { schemes = ['http', 'https'], requireHost = true, allowCredentials = false, maxLength = 2048 } = options;
  if (!isStr(value, maxLength) || someCode(value, (c) => c <= 0x20 || c === 0x7f) || /\s/.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if (!schemes.some((s) => s.toLowerCase() === scheme)) return false;
  if (requireHost && url.hostname === '') return false;
  if (!allowCredentials && (url.username !== '' || url.password !== '')) return false;
  return true;
}

/**
 * `http:` or `https:` URL with a host and no credentials.
 * @example isHttpUrl('https://example.com') // => true
 */
export function isHttpUrl(value: unknown): value is string {
  return isUrl(value);
}

// ---------------------------------------------------------------------------
// Phones

/**
 * E.164: `+`, a non-zero country code digit, 7-15 digits in total, nothing else.
 * @example isPhoneE164('+442079460958') // => true
 */
export function isPhoneE164(value: unknown): value is string {
  return isStr(value, 16) && /^\+[1-9]\d{6,14}$/.test(value);
}

/**
 * Loose phone check for user input: digits, spaces, `()`, `-`, `.`, an optional leading `+`,
 * and 7-15 digits.
 * @example isPhone('+1 (555) 010-9999') // => true
 */
export function isPhone(value: unknown): value is string {
  if (!isStr(value, 32) || !/^\+?[\d\s().-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

// ---------------------------------------------------------------------------
// Banking and cards

/** IBAN lengths per ISO 13616 registry country (SWIFT IBAN registry). */
const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24,
  DE: 22, DJ: 27, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FK: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27,
  GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MN: 20, MR: 27, MT: 31, MU: 30, NI: 28, NL: 18, NO: 15, OM: 23, PK: 24, PL: 28,
  PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, RU: 33, SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28,
  TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20, YE: 30,
};

/** Countries with a known IBAN length. @example IBAN_COUNTRIES.includes('DE') // => true */
export const IBAN_COUNTRIES: readonly string[] = Object.freeze(Object.keys(IBAN_LENGTHS));

function mod97(s: string): number {
  let rem = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const v = c >= 65 ? c - 55 : c - 48;
    rem = v > 9 ? (rem * 100 + v) % 97 : (rem * 10 + v) % 97;
  }
  return rem;
}

/**
 * ISO 13616 IBAN: country length table and ISO 7064 mod-97 checksum. Spaces are ignored;
 * letters are case-insensitive.
 * @example isIban('GB82 WEST 1234 5698 7654 32') // => true
 */
export function isIban(value: unknown): value is string {
  if (!isStr(value, 50)) return false;
  const s = value.replaceAll(' ', '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z\d]{11,30}$/.test(s)) return false;
  const len = IBAN_LENGTHS[s.slice(0, 2)];
  if (len === undefined || len !== s.length) return false;
  return mod97(s.slice(4) + s.slice(0, 4)) === 1;
}

/**
 * ISO 9362 BIC/SWIFT code: 4-letter institution, 2-letter country, 2 location characters,
 * optional 3-character branch. Case-insensitive.
 * @example isBic('DEUTDEFF500') // => true
 */
export function isBic(value: unknown): value is string {
  return isStr(value, 11) && /^[A-Z]{6}[A-Z\d]{2}(?:[A-Z\d]{3})?$/i.test(value);
}

/**
 * Luhn (mod 10) checksum over a digit string. Non-digits make it false.
 * @example luhnCheck('79927398713') // => true
 */
export function luhnCheck(digits: string): boolean {
  if (digits.length === 0 || digits.length > 64) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const cardDigits = (value: unknown): string | undefined => {
  if (!isStr(value, 30) || !/^\d[\d -]*$/.test(value)) return undefined;
  return value.replace(/[ -]/g, '');
};

/**
 * Payment card number: 12-19 digits (spaces and dashes allowed) with a valid Luhn checksum.
 * @example isCreditCard('4111 1111 1111 1111') // => true
 */
export function isCreditCard(value: unknown): value is string {
  const d = cardDigits(value);
  return d !== undefined && d.length >= 12 && d.length <= 19 && luhnCheck(d);
}

/** Card networks recognized by {@link cardBrand}. */
export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'diners' | 'jcb' | 'unionpay' | 'maestro';

const inRange = (prefix: string, len: number, min: number, max: number): boolean => {
  if (prefix.length < len) return false;
  const n = Number(prefix.slice(0, len));
  return n >= min && n <= max;
};

/**
 * Card network by IIN range and length (no Luhn check; combine with {@link isCreditCard}).
 * Returns `undefined` when no network matches.
 * @example cardBrand('4111111111111111') // => 'visa'
 * @example cardBrand('378282246310005') // => 'amex'
 */
export function cardBrand(value: unknown): CardBrand | undefined {
  const d = cardDigits(value);
  if (d === undefined) return undefined;
  const len = d.length;
  if (inRange(d, 2, 34, 34) || inRange(d, 2, 37, 37)) return len === 15 ? 'amex' : undefined;
  if (d.startsWith('4')) return len === 13 || len === 16 || len === 19 ? 'visa' : undefined;
  if (inRange(d, 2, 51, 55) || inRange(d, 4, 2221, 2720)) return len === 16 ? 'mastercard' : undefined;
  if (inRange(d, 3, 300, 305) || inRange(d, 2, 36, 36) || inRange(d, 2, 38, 39)) return len >= 14 && len <= 19 ? 'diners' : undefined;
  if (inRange(d, 4, 3528, 3589)) return len >= 16 && len <= 19 ? 'jcb' : undefined;
  if (d.startsWith('6011') || inRange(d, 3, 644, 649) || d.startsWith('65') || inRange(d, 6, 622126, 622925)) return len >= 16 && len <= 19 ? 'discover' : undefined;
  if (d.startsWith('62') || d.startsWith('81')) return len >= 16 && len <= 19 ? 'unionpay' : undefined;
  if (['5018', '5020', '5038', '5893', '6304', '6759', '6761', '6762', '6763'].some((p) => d.startsWith(p)) || inRange(d, 2, 56, 58) || d.startsWith('50') || d.startsWith('6')) {
    return len >= 12 && len <= 19 ? 'maestro' : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Identifiers

const UUID = /^[\da-f]{8}-[\da-f]{4}-([1-8])[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

/**
 * RFC 9562 UUID (versions 1-8, variant 10xx). Without `version`, the nil and max UUIDs are
 * accepted too.
 * @example isUuid('0190f2a8-1b2c-7d3e-8f40-123456789abc', 7) // => true
 */
export function isUuid(value: unknown, version?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): value is string {
  if (!isStr(value, 36) || value.length !== 36) return false;
  if (version === undefined && (value === '00000000-0000-0000-0000-000000000000' || value.toLowerCase() === 'ffffffff-ffff-ffff-ffff-ffffffffffff')) return true;
  const m = UUID.exec(value);
  return m !== null && (version === undefined || Number(m[1]) === version);
}

/**
 * ULID: 26 Crockford base32 characters, first character 0-7 (48-bit timestamp).
 * @example isUlid('01ARZ3NDEKTSV4RRFFQ69G5FAV') // => true
 */
export function isUlid(value: unknown): value is string {
  return isStr(value, 26) && /^[0-7][\dA-HJKMNP-TV-Z]{25}$/i.test(value);
}

/**
 * Dotted-quad IPv4 with no leading zeros (`01.2.3.4` is rejected as ambiguous octal).
 * @example isIpv4('192.168.0.1') // => true
 */
export function isIpv4(value: unknown): value is string {
  if (!isStr(value, 15)) return false;
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^(?:0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
}

/**
 * IPv6 in any RFC 4291 text form, including `::` compression and an embedded IPv4 tail.
 * Zone identifiers (`%eth0`) are rejected.
 * @example isIpv6('2001:db8::ff00:42:8329') // => true
 */
export function isIpv6(value: unknown): value is string {
  if (!isStr(value, 45)) return false;
  const halves = value.split('::');
  if (halves.length > 2) return false;
  const parse = (part: string): number | undefined => {
    if (part === '') return 0;
    const groups = part.split(':');
    let count = 0;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i] ?? '';
      if (i === groups.length - 1 && g.includes('.')) {
        if (!isIpv4(g)) return undefined;
        count += 2;
      } else if (/^[\da-f]{1,4}$/i.test(g)) {
        count += 1;
      } else {
        return undefined;
      }
    }
    return count;
  };
  const head = parse(halves[0] ?? '');
  if (head === undefined) return false;
  if (halves.length === 1) return head === 8;
  const tail = parse(halves[1] ?? '');
  if (tail === undefined) return false;
  // An embedded IPv4 may only appear at the very end.
  if ((halves[0] ?? '').includes('.')) return false;
  return head + tail <= 7;
}

/**
 * CIDR block: IPv4 with `/0`-`/32` or IPv6 with `/0`-`/128`.
 * @example isCidr('10.0.0.0/8') // => true
 */
export function isCidr(value: unknown, version?: 4 | 6): value is string {
  if (!isStr(value, 49)) return false;
  const slash = value.lastIndexOf('/');
  if (slash < 0) return false;
  const addr = value.slice(0, slash);
  const prefix = value.slice(slash + 1);
  if (!/^(?:0|[1-9]\d{0,2})$/.test(prefix)) return false;
  const n = Number(prefix);
  if (version !== 6 && isIpv4(addr)) return n <= 32;
  if (version !== 4 && isIpv6(addr)) return n <= 128;
  return false;
}

/**
 * MAC-48 address as `01:23:45:67:89:ab`, `01-23-45-67-89-ab` or `0123.4567.89ab`.
 * @example isMacAddress('01:23:45:67:89:AB') // => true
 */
export function isMacAddress(value: unknown): value is string {
  if (!isStr(value, 17)) return false;
  return /^[\da-f]{2}(?::[\da-f]{2}){5}$/i.test(value) || /^[\da-f]{2}(?:-[\da-f]{2}){5}$/i.test(value) || /^[\da-f]{4}(?:\.[\da-f]{4}){2}$/i.test(value);
}

/**
 * CSS hex colour `#rgb`, `#rrggbb`, and (unless `alpha: false`) `#rgba`, `#rrggbbaa`.
 * @example isHexColor('#1a2b3c') // => true
 */
export function isHexColor(value: unknown, options: { readonly alpha?: boolean; readonly requireHash?: boolean } = {}): value is string {
  const { alpha = true, requireHash = true } = options;
  if (!isStr(value, 9)) return false;
  const hex = value.startsWith('#') ? value.slice(1) : requireHash ? '' : value;
  if (!/^[\da-f]+$/i.test(hex)) return false;
  return hex.length === 3 || hex.length === 6 || (alpha && (hex.length === 4 || hex.length === 8));
}

/**
 * Lowercase URL slug: ASCII letters and digits in hyphen-separated groups (max 200 chars).
 * @example isSlug('hello-world-2') // => true
 */
export function isSlug(value: unknown): value is string {
  return isStr(value, 200) && /^[a-z\d]+(?:-[a-z\d]+)*$/.test(value);
}

// ---------------------------------------------------------------------------
// Passwords

export interface PasswordPolicy {
  /** Minimum length in code points. Default 12. */
  readonly minLength?: number;
  /** Maximum length in code points (bounds hashing cost). Default 128. */
  readonly maxLength?: number;
  readonly requireLowercase?: boolean;
  readonly requireUppercase?: boolean;
  readonly requireDigit?: boolean;
  readonly requireSymbol?: boolean;
  /** Minimum number of distinct character classes (of the four) regardless of the flags. Default 0. */
  readonly minClasses?: number;
  /** Allow spaces (passphrases). Default false. */
  readonly allowSpaces?: boolean;
  /** Reject passwords from the built-in common list (and `extraCommon`). Default true. */
  readonly rejectCommon?: boolean;
  /** Additional forbidden passwords, such as the product name or the user's e-mail. */
  readonly extraCommon?: readonly string[];
}

/** Failure codes returned by {@link isStrongPassword}. */
export type PasswordFailure = 'too-short' | 'too-long' | 'missing-lowercase' | 'missing-uppercase' | 'missing-digit' | 'missing-symbol' | 'too-few-classes' | 'contains-space' | 'common';

export interface PasswordCheck {
  readonly valid: boolean;
  readonly failures: readonly PasswordFailure[];
}

const COMMON_PASSWORDS = new Set([
  'password', 'passw0rd', 'p@ssw0rd', 'p@ssword', '123456', '12345678', '123456789', '1234567890', 'qwerty', 'qwertyuiop', 'abc123', 'letmein',
  'welcome', 'admin', 'administrator', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'sunshine', 'princess', 'master', 'login',
  'trustno1', 'changeme', 'secret', 'qazwsx', '111111', '000000', 'default', 'root', 'test', 'guest', 'summer', 'winter', 'spring', 'autumn',
]);

/**
 * Checks a password against a policy and returns every failed rule as a code the UI can
 * translate. Defaults: 12-128 characters, all four classes, no spaces, not common. NIST SP
 * 800-63B favours length over composition; relax the class flags for passphrase policies.
 * @example isStrongPassword('Tr1cky-Horse-42') // => { valid: true, failures: [] }
 * @example isStrongPassword('Password123!').failures // => ['common']
 */
export function isStrongPassword(value: string, policy: PasswordPolicy = {}): PasswordCheck {
  const { minLength = 12, maxLength = 128, requireLowercase = true, requireUppercase = true, requireDigit = true, requireSymbol = true, minClasses = 0, allowSpaces = false, rejectCommon = true } = policy;
  const failures: PasswordFailure[] = [];
  const s = typeof value === 'string' ? value : '';
  // Count code points without materializing huge arrays.
  let length = 0;
  for (let i = 0; i < s.length && length <= maxLength; i++) {
    const c = s.charCodeAt(i);
    // Count a surrogate pair once.
    if (c < 0xdc00 || c > 0xdfff) length++;
  }
  if (length < minLength) failures.push('too-short');
  if (length > maxLength) failures.push('too-long');
  const probe = length > maxLength ? s.slice(0, maxLength * 2) : s;
  const lower = /\p{Ll}/u.test(probe);
  const upper = /\p{Lu}/u.test(probe);
  const digit = /\p{Nd}/u.test(probe);
  const symbol = /[^\p{L}\p{Nd}\s]/u.test(probe);
  if (requireLowercase && !lower) failures.push('missing-lowercase');
  if (requireUppercase && !upper) failures.push('missing-uppercase');
  if (requireDigit && !digit) failures.push('missing-digit');
  if (requireSymbol && !symbol) failures.push('missing-symbol');
  if ([lower, upper, digit, symbol].filter(Boolean).length < minClasses) failures.push('too-few-classes');
  if (!allowSpaces && /\s/.test(probe)) failures.push('contains-space');
  if (rejectCommon && probe.length <= 256) {
    const norm = probe.toLowerCase();
    // Strip common decorations: trailing digits/symbols ("Password123!") and leading digits.
    const core = norm.replace(/^[\d\W_]{1,8}/, '').replace(/[\d\W_]{1,8}$/, '');
    const extra = new Set((policy.extraCommon ?? []).map((x) => x.toLowerCase()));
    if (COMMON_PASSWORDS.has(norm) || COMMON_PASSWORDS.has(core) || extra.has(norm) || extra.has(core)) failures.push('common');
  }
  return { valid: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// Postal codes

const POSTAL: Readonly<Record<string, RegExp>> = {
  US: /^\d{5}(?:-\d{4})?$/,
  CA: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i,
  GB: /^(?:GIR ?0AA|[A-PR-UWYZ](?:\d[\dA-HJKPSTUW]?|[A-HK-Y]\d[\dABEHMNPRV-Y]?) ?\d[ABD-HJLNP-UW-Z]{2})$/i,
  IE: /^(?:[AC-FHKNPRTV-Y]\d{2}|D6W) ?[\dAC-FHKNPRTV-Y]{4}$/i,
  IN: /^[1-9]\d{2} ?\d{3}$/,
  DE: /^\d{5}$/,
  FR: /^\d{5}$/,
  IT: /^\d{5}$/,
  ES: /^(?:0[1-9]|[1-4]\d|5[0-2])\d{3}$/,
  NL: /^[1-9]\d{3} ?(?!SA|SD|SS)[A-Z]{2}$/i,
  BE: /^[1-9]\d{3}$/,
  CH: /^[1-9]\d{3}$/,
  AT: /^[1-9]\d{3}$/,
  DK: /^\d{4}$/,
  NO: /^\d{4}$/,
  SE: /^[1-9]\d{2} ?\d{2}$/,
  FI: /^\d{5}$/,
  PL: /^\d{2}-\d{3}$/,
  PT: /^\d{4}-\d{3}$/,
  CZ: /^\d{3} ?\d{2}$/,
  AU: /^\d{4}$/,
  NZ: /^\d{4}$/,
  JP: /^\d{3}-?\d{4}$/,
  CN: /^\d{6}$/,
  SG: /^\d{6}$/,
  KR: /^\d{5}$/,
  BR: /^\d{5}-?\d{3}$/,
  MX: /^\d{5}$/,
  ZA: /^\d{4}$/,
  AE: /^\d{5,6}$/,
};

/** ISO 3166-1 alpha-2 codes supported by {@link isPostalCode}. @example POSTAL_CODE_COUNTRIES.includes('GB') // => true */
export const POSTAL_CODE_COUNTRIES: readonly string[] = Object.freeze(Object.keys(POSTAL));

/**
 * Postal code format for a country in {@link POSTAL_CODE_COUNTRIES} (format only; not an
 * address lookup). Unsupported countries return false.
 * @example isPostalCode('SW1A 1AA', 'GB') // => true
 * @example isPostalCode('90210-1234', 'US') // => true
 */
export function isPostalCode(value: unknown, country: string): value is string {
  const re = Object.prototype.hasOwnProperty.call(POSTAL, country.toUpperCase()) ? POSTAL[country.toUpperCase()] : undefined;
  return re !== undefined && isStr(value, 10) && re.test(value.trim()) && value.trim() === value;
}

// ---------------------------------------------------------------------------
// Dates, versions, tokens

const daysIn = (y: number, m: number): number => (m === 2 ? ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28) : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0);

/**
 * Strict calendar date `YYYY-MM-DD` (4-digit year, real day of month).
 * @example isIsoDate('2024-02-29') // => true
 * @example isIsoDate('2023-02-29') // => false
 */
export function isIsoDate(value: unknown): value is string {
  if (!isStr(value, 10)) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysIn(Number(m[1]), month);
}

/**
 * Strict RFC 3339 date-time: `YYYY-MM-DDTHH:mm[:ss[.fraction]]` plus `Z` or `+/-HH:MM`
 * (required unless `requireOffset: false`). Uppercase `T`/`Z` only; no leap seconds.
 * @example isIsoDateTime('2026-09-29T14:30:00.123Z') // => true
 */
export function isIsoDateTime(value: unknown, options: { readonly requireOffset?: boolean; readonly requireSeconds?: boolean } = {}): value is string {
  const { requireOffset = true, requireSeconds = false } = options;
  if (!isStr(value, 35)) return false;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-](\d{2}):(\d{2}))?$/.exec(value);
  if (!m?.[1] || !isIsoDate(m[1])) return false;
  if (Number(m[2]) > 23 || Number(m[3]) > 59) return false;
  if (m[4] === undefined ? requireSeconds : Number(m[4]) > 59) return false;
  if (m[5] === undefined) return !requireOffset;
  return m[5] === 'Z' || (Number(m[6]) <= 23 && Number(m[7]) <= 59);
}

function decodeBase64UrlJson(segment: string): unknown {
  const b64 = segment.replaceAll('-', '+').replaceAll('_', '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}

const isJsonObject = (v: unknown): boolean => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * JWS compact serialization shape: three base64url segments whose header is a JSON object with
 * a string `alg` and whose payload is a JSON object. Structure only: this never means the token
 * is valid, trusted or unexpired; verify signatures on the server.
 * @example isJwtShape('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln') // => true
 */
export function isJwtShape(value: unknown, options: { readonly maxLength?: number } = {}): value is string {
  if (!isStr(value, options.maxLength ?? 16_384)) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const [h = '', p = '', sig = ''] = parts;
  const seg = /^[\w-]+$/;
  if (!seg.test(h) || !seg.test(p) || (sig !== '' && !seg.test(sig))) return false;
  if (h.length % 4 === 1 || p.length % 4 === 1 || sig.length % 4 === 1) return false;
  try {
    const header = decodeBase64UrlJson(h);
    if (!isJsonObject(header) || typeof (header as { alg?: unknown }).alg !== 'string') return false;
    return isJsonObject(decodeBase64UrlJson(p));
  } catch {
    return false;
  }
}

/** Parsed Semantic Versioning 2.0.0 value. */
export interface SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
  readonly build: readonly string[];
}

const NUMERIC_ID = /^(?:0|[1-9]\d*)$/;
const ALNUM_ID = /^[\da-z-]+$/i;

/**
 * Parses a strict SemVer 2.0.0 string (no `v` prefix, no leading zeros, safe-integer parts).
 * @example parseSemver('1.2.3-rc.1+build.5') // => { major: 1, minor: 2, patch: 3, prerelease: ['rc', '1'], build: ['build', '5'] }
 */
export function parseSemver(value: unknown): SemVer | undefined {
  if (!isStr(value, 256)) return undefined;
  const plus = value.indexOf('+');
  const main = plus < 0 ? value : value.slice(0, plus);
  const buildText = plus < 0 ? undefined : value.slice(plus + 1);
  const dash = main.indexOf('-');
  const core = dash < 0 ? main : main.slice(0, dash);
  const preText = dash < 0 ? undefined : main.slice(dash + 1);
  const nums = core.split('.');
  if (nums.length !== 3 || !nums.every((n) => NUMERIC_ID.test(n) && n.length <= 16)) return undefined;
  const [major = 0, minor = 0, patch = 0] = nums.map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) return undefined;
  const prerelease = preText === undefined ? [] : preText.split('.');
  if (preText !== undefined && !prerelease.every((id) => ALNUM_ID.test(id) && (!/^\d+$/.test(id) || NUMERIC_ID.test(id)))) return undefined;
  const build = buildText === undefined ? [] : buildText.split('.');
  if (buildText !== undefined && !build.every((id) => ALNUM_ID.test(id))) return undefined;
  return { major, minor, patch, prerelease, build };
}

/**
 * Strict SemVer 2.0.0 check.
 * @example isSemver('1.0.0-alpha.1') // => true
 * @example isSemver('01.0.0') // => false
 */
export function isSemver(value: unknown): value is string {
  return parseSemver(value) !== undefined;
}

const cmp = (a: number, b: number): -1 | 0 | 1 => (a < b ? -1 : a > b ? 1 : 0);

/**
 * SemVer 2.0.0 precedence (`-1`, `0`, `1`); build metadata is ignored. Throws a
 * `ValidationError` with code `HLP_VALIDATE_SEMVER` for invalid input.
 * @example compareSemver('1.0.0-alpha', '1.0.0') // => -1
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) throw new SemverError();
  const core = cmp(x.major, y.major) || cmp(x.minor, y.minor) || cmp(x.patch, y.patch);
  if (core !== 0) return core;
  if (x.prerelease.length === 0 || y.prerelease.length === 0) return cmp(y.prerelease.length, x.prerelease.length);
  const n = Math.min(x.prerelease.length, y.prerelease.length);
  for (let i = 0; i < n; i++) {
    const p = x.prerelease[i] ?? '';
    const q = y.prerelease[i] ?? '';
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return p.length !== q.length ? cmp(p.length, q.length) : p < q ? -1 : 1;
    if (pn) return -1;
    if (qn) return 1;
    return p < q ? -1 : 1;
  }
  return cmp(x.prerelease.length, y.prerelease.length);
}

class SemverError extends ValidationError {
  constructor() {
    super('HLP_VALIDATE_SEMVER', 'Expected a Semantic Versioning 2.0.0 string.');
  }
}

// ---------------------------------------------------------------------------
// Geo and product codes

const DECIMAL_DEGREES = /^[+-]?\d{1,3}(?:\.\d{1,15})?$/;

const toDegrees = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.length <= 20 && DECIMAL_DEGREES.test(value)) return Number(value);
  return undefined;
};

/**
 * Latitude in decimal degrees, -90...90 (number or plain decimal string).
 * @example isLatitude(51.5074) // => true
 */
export function isLatitude(value: unknown): boolean {
  const n = toDegrees(value);
  return n !== undefined && n >= -90 && n <= 90;
}

/**
 * Longitude in decimal degrees, -180...180 (number or plain decimal string).
 * @example isLongitude('-0.1278') // => true
 */
export function isLongitude(value: unknown): boolean {
  const n = toDegrees(value);
  return n !== undefined && n >= -180 && n <= 180;
}

function ean13Ok(d: string): boolean {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (d.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === d.charCodeAt(12) - 48;
}

/**
 * EAN-13 / GTIN-13 barcode with a valid check digit.
 * @example isEan13('4006381333931') // => true
 */
export function isEan13(value: unknown): value is string {
  return isStr(value, 13) && /^\d{13}$/.test(value) && ean13Ok(value);
}

/**
 * ISBN-10 or ISBN-13 (hyphens and spaces ignored) with a valid check digit. Pass `10` or `13`
 * to require one form.
 * @example isIsbn('978-0-306-40615-7') // => true
 * @example isIsbn('0-306-40615-2', 10) // => true
 */
export function isIsbn(value: unknown, version?: 10 | 13): value is string {
  if (!isStr(value, 20) || !/^[\d -]+X?$/i.test(value)) return false;
  const s = value.replace(/[ -]/g, '').toUpperCase();
  if (s.length === 13 && version !== 10) return (s.startsWith('978') || s.startsWith('979')) && /^\d{13}$/.test(s) && ean13Ok(s);
  if (s.length === 10 && version !== 13) {
    if (!/^\d{9}[\dX]$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const c = s.charAt(i);
      sum += (c === 'X' ? 10 : Number(c)) * (10 - i);
    }
    return sum % 11 === 0;
  }
  return false;
}
