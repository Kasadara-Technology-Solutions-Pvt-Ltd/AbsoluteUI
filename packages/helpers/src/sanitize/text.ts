/**
 * Text cleanup: invisible characters, Unicode normalization, file names, e-mail and phone
 * normalization, log truncation (docs/PLAN-HELPERS.md section 2, section 5). Not an HTML sanitizer.
 */
import { ValidationError } from '../error/index.js';

/** Zero-width/format characters and bidi embeddings, overrides and isolates (Trojan Source, CVE-2021-42574). */
function isInvisible(c: number, keepJoiners: boolean): boolean {
  if (c < 0xad) return false;
  if (c === 0x200c || c === 0x200d) return !keepJoiners;
  return (
    c === 0xad || // soft hyphen
    c === 0x61c || // Arabic letter mark
    c === 0x115f || c === 0x1160 || c === 0x17b4 || c === 0x17b5 || c === 0x3164 || c === 0xffa0 || // fillers
    (c >= 0x180b && c <= 0x180f) || // Mongolian selectors, vowel separator
    (c >= 0x200b && c <= 0x200f) || // ZWSP, LRM, RLM
    (c >= 0x202a && c <= 0x202e) || // LRE, RLE, PDF, LRO, RLO
    (c >= 0x2060 && c <= 0x206f) || // word joiner, invisible operators, LRI, RLI, FSI, PDI
    c === 0xfeff || // BOM / ZWNBSP
    (c >= 0xfff9 && c <= 0xfffb) // interlinear annotations
  );
}

/** C0/C1 control characters and DEL. */
const isControl = (c: number): boolean => c <= 0x1f || (c >= 0x7f && c <= 0x9f);

/** Removes UTF-16 code units for which `drop` is true (all targets are BMP). O(n). */
function removeChars(text: string, drop: (code: number) => boolean): string {
  let out = '';
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (drop(text.charCodeAt(i))) {
      out += text.slice(start, i);
      start = i + 1;
    }
  }
  return start === 0 ? text : out + text.slice(start);
}

export interface StripInvisibleOptions {
  /**
   * Keep ZWNJ/ZWJ (U+200C/U+200D), which are required in emoji sequences and some scripts
   * (Persian, Indic). Default false: stripped.
   */
  readonly keepJoiners?: boolean;
}

/**
 * Removes zero-width characters and bidi control characters (U+202A-202E, U+2066-2069),
 * which can hide or reorder text (Trojan Source). Variation selectors are kept (emoji).
 * @example stripInvisible('ad' + String.fromCharCode(0x200b) + 'min') // => 'admin'
 */
export function stripInvisible(text: string, options: StripInvisibleOptions = {}): string {
  const keep = options.keepJoiners === true;
  return removeChars(text, (c) => isInvisible(c, keep));
}

/**
 * Removes C0/C1 control characters. Tab, LF and CR are kept unless `keepWhitespace` is false.
 * @example stripControl('a\u0000b') // => 'ab'
 */
export function stripControl(text: string, options: { readonly keepWhitespace?: boolean } = {}): string {
  const keepWs = options.keepWhitespace !== false;
  return removeChars(text, (c) => isControl(c) && !(keepWs && (c === 9 || c === 10 || c === 13)));
}

/**
 * Unicode normalization (`NFC` default). Use `NFKC` to fold compatibility forms
 * (full-width letters, ligatures) before comparisons or search.
 * @example normalizeUnicode('ｆｕｌｌ', 'NFKC') // => 'full'
 */
export function normalizeUnicode(text: string, form: 'NFC' | 'NFD' | 'NFKC' | 'NFKD' = 'NFC'): string {
  return text.normalize(form);
}

/**
 * Trims and collapses runs of whitespace (any Unicode `\s`) to a single space.
 * @example collapseWhitespace('  a \n  b ') // => 'a b'
 */
export function collapseWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// File names

export interface SafeFileNameOptions {
  /** Maximum length in UTF-8 bytes (the common file-system limit). Default 255. */
  readonly maxLength?: number;
  /** Replacement for forbidden characters. Must itself be safe. Default `'_'`. */
  readonly replacement?: string;
  /** Keep a leading dot (hidden files). Default false: leading dots are removed. */
  readonly allowLeadingDot?: boolean;
  /** Used when nothing usable remains. Default `'file'`. */
  readonly fallback?: string;
}

// Path separators, Windows-reserved punctuation, and control characters.
const FILE_PUNCT = '"*/:<>?\\|';
const isFileForbidden = (c: number): boolean => isControl(c) || FILE_PUNCT.includes(String.fromCharCode(c));
const hasFileForbidden = (s: string): boolean => removeChars(s, isFileForbidden) !== s;

/** Replaces forbidden file-name characters with `replacement`. */
function replaceFileForbidden(s: string, replacement: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) out += isFileForbidden(s.charCodeAt(i)) ? replacement : s.charAt(i);
  return out;
}
// CON, PRN, AUX, NUL, COM0-9, LPT0-9 (and superscript digits), with or without extension.
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[\d\u00b9\u00b2\u00b3]|lpt[\d\u00b9\u00b2\u00b3]|conin\$|conout\$)$/i;
const encoder = new TextEncoder();

const isDotOrSpace = (c: string): boolean => c === '.' || c.trim() === '';

function trimEndDotsSpaces(s: string): string {
  let end = s.length;
  while (end > 0 && isDotOrSpace(s.charAt(end - 1))) end--;
  return s.slice(0, end);
}

function trimStartDotsSpaces(s: string): string {
  let start = 0;
  while (start < s.length && isDotOrSpace(s.charAt(start))) start++;
  return s.slice(start);
}

const utf8Length = (s: string): number => encoder.encode(s).length;

/** Truncates to at most `maxBytes` UTF-8 bytes on a code point boundary. */
function truncateUtf8(s: string, maxBytes: number): string {
  let bytes = 0;
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    const n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + n > maxBytes) break;
    bytes += n;
    out += ch;
  }
  return out;
}

/**
 * Makes a string safe to use as a single file name on Windows, macOS and Linux: strips path
 * separators, control and invisible characters, reserved device names (`CON`, `NUL`, `COM1`...),
 * trailing dots/spaces, and leading dots; truncates to `maxLength` UTF-8 bytes keeping the
 * extension.
 * @example safeFileName('../../etc/passwd') // => 'etc_passwd'
 * @example safeFileName('CON.txt') // => '_CON.txt'
 */
export function safeFileName(name: string, options: SafeFileNameOptions = {}): string {
  const { maxLength = 255, replacement = '_', allowLeadingDot = false, fallback = 'file' } = options;
  if (hasFileForbidden(replacement) || /[.\s]/.test(replacement) || stripInvisible(replacement) !== replacement) {
    throw new ValidationError('HLP_SANITIZE_REPLACEMENT', 'The replacement must not contain forbidden file name characters.');
  }
  if (!Number.isInteger(maxLength) || maxLength < 1) throw new ValidationError('HLP_SANITIZE_OPTION', 'maxLength must be a positive integer.');
  // Drop path components first so '../../etc/passwd' becomes 'etc_passwd', not '.._.._etc...'.
  const parts = stripInvisible(name.normalize('NFC')).split(/[/\\]/).filter((p) => p !== '' && p !== '.' && p !== '..');
  let s = replaceFileForbidden(parts.join(replacement), replacement);
  if (replacement !== '') {
    const twice = replacement + replacement;
    while (s.includes(twice)) s = s.replaceAll(twice, replacement);
  }
  s = trimEndDotsSpaces(s.trim());
  if (!allowLeadingDot) s = trimStartDotsSpaces(s);
  if (s === '' || s === '.' || s === '..') s = fallback;
  // Windows treats everything before the first dot as the device name (CON.tar.gz is reserved).
  const firstDot = s.indexOf('.');
  if (WINDOWS_RESERVED.test((firstDot > 0 ? s.slice(0, firstDot) : s).trim())) s = `${replacement === '' ? '_' : replacement}${s}`;
  const dot = s.lastIndexOf('.');
  if (utf8Length(s) > maxLength) {
    const ext = dot > 0 ? s.slice(s.lastIndexOf('.')) : '';
    const extBytes = utf8Length(ext);
    if (ext !== '' && extBytes < maxLength / 2) {
      s = trimEndDotsSpaces(truncateUtf8(s.slice(0, s.length - ext.length), maxLength - extBytes)) + ext;
    } else {
      s = trimEndDotsSpaces(truncateUtf8(s, maxLength));
    }
    if (s === '') s = truncateUtf8(fallback, maxLength);
  }
  return s;
}

// ---------------------------------------------------------------------------
// E-mail and phone

export interface NormalizeEmailOptions {
  /** Lowercase the local part too. Default false (RFC 5321: local parts are case-sensitive). */
  readonly lowercaseLocal?: boolean;
  /**
   * Gmail canonicalization for `gmail.com`/`googlemail.com`: remove dots and `+tag`, map to
   * `gmail.com`. Default false: only use for duplicate detection, never for sending.
   */
  readonly gmail?: boolean;
  /** Remove a `+tag` suffix for every domain. Default false. */
  readonly stripPlusTag?: boolean;
}

const beforePlus = (local: string): string => {
  const i = local.indexOf('+');
  return i < 0 ? local : local.slice(0, i);
};

/**
 * Trims and lowercases the domain of an e-mail address. Returns `undefined` when the input
 * has no single `@` separating non-empty parts or exceeds 254 characters.
 * @example normalizeEmail(' John.Doe@Example.COM ') // => 'John.Doe@example.com'
 */
export function normalizeEmail(email: string, options: NormalizeEmailOptions = {}): string | undefined {
  const s = stripInvisible(email).trim();
  if (s.length > 254) return undefined;
  const at = s.lastIndexOf('@');
  if (at <= 0 || at === s.length - 1) return undefined;
  let local = s.slice(0, at);
  let domain = s.slice(at + 1).toLowerCase();
  if (domain.endsWith('.')) domain = domain.slice(0, -1);
  if (local.includes('@') && !(local.startsWith('"') && local.endsWith('"'))) return undefined;
  if (options.lowercaseLocal === true) local = local.toLowerCase();
  if (options.stripPlusTag === true) local = beforePlus(local);
  if (options.gmail === true && (domain === 'gmail.com' || domain === 'googlemail.com')) {
    local = beforePlus(local.toLowerCase()).replaceAll('.', '');
    domain = 'gmail.com';
  }
  if (local === '') return undefined;
  return `${local}@${domain}`;
}

export interface NormalizePhoneOptions {
  /**
   * Country calling code used when the number has no international prefix, e.g. `'1'`, `'+44'`,
   * `'91'`. Without it, only numbers starting with `+` or `00` normalize.
   */
  readonly defaultCountryCode?: string;
  /** Remove a single national trunk prefix `0` before adding the country code. Default true. */
  readonly stripTrunkZero?: boolean;
}

/**
 * Normalizes a phone number to E.164 (`+<digits>`, 8-15 digits) by digits only; no carrier or
 * numbering-plan logic. Returns `undefined` when the result cannot be E.164.
 * @example normalizePhone('(020) 7946 0958', { defaultCountryCode: '44' }) // => '+442079460958'
 */
export function normalizePhone(input: string, options: NormalizePhoneOptions = {}): string | undefined {
  const s = input.trim();
  if (s.length === 0 || s.length > 64) return undefined;
  // Drop an extension ("x123", "ext. 123").
  const main = s.replace(/(?:ext\.?|x|#) ?\d{1,6}$/i, '').trimEnd();
  if (/[^\d\s().+\-/]/.test(main)) return undefined;
  let digits = main.replace(/\D/g, '');
  const plus = main.startsWith('+');
  if (plus && main.lastIndexOf('+') !== 0) return undefined;
  if (!plus && main.includes('+')) return undefined;
  if (!plus) {
    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    } else {
      const cc = options.defaultCountryCode?.replace(/^\+/, '');
      if (cc === undefined || !/^[1-9]\d{0,2}$/.test(cc)) return undefined;
      if (options.stripTrunkZero !== false && digits.startsWith('0')) digits = digits.slice(1);
      digits = cc + digits;
    }
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) return undefined;
  return `+${digits}`;
}

// ---------------------------------------------------------------------------
// Search queries and logs

export interface SanitizeSearchQueryOptions {
  /** Maximum length in code points. Default 200. */
  readonly maxLength?: number;
  /** Apply NFKC folding (full-width -> ASCII). Default true. */
  readonly fold?: boolean;
}

/**
 * Cleans free-text search input: strips control and invisible characters, folds compatibility
 * forms, collapses whitespace, and limits length. Not an injection defense: always use
 * parameterized queries.
 * @example sanitizeSearchQuery('  hello   world ') // => 'hello world'
 */
export function sanitizeSearchQuery(query: string, options: SanitizeSearchQueryOptions = {}): string {
  const { maxLength = 200, fold = true } = options;
  // Cut early so normalization never runs on megabytes of input.
  let s = query.slice(0, maxLength * 4 + 16);
  s = stripInvisible(stripControl(s, { keepWhitespace: false }));
  if (fold) s = s.normalize('NFKC');
  s = collapseWhitespace(s);
  const cps = Array.from(s);
  return cps.length > maxLength ? cps.slice(0, maxLength).join('').trimEnd() : s;
}

function stringifyForLog(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  if (typeof value === 'bigint') return `${value.toString()}n`;
  if (typeof value === 'symbol' || typeof value === 'function') return value.toString();
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  const seen = new WeakSet();
  try {
    const out = JSON.stringify(value, (_k, v: unknown) => {
      if (typeof v === 'bigint') return `${v.toString()}n`;
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    }) as string | undefined;
    return out ?? Object.prototype.toString.call(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

/**
 * Serializes any value for logging and truncates it to `maxLength` code units (default 1000),
 * appending `...[+N]` with the number of characters removed. Handles cycles and BigInt.
 * @example truncateForLog('x'.repeat(2000), 10) // => 'xx…[+1998]'
 */
export function truncateForLog(value: unknown, maxLength = 1000): string {
  const s = stringifyForLog(value);
  if (s.length <= maxLength) return s;
  let suffix = `\u2026[+${s.length - maxLength}]`;
  let keep = Math.max(0, maxLength - suffix.length);
  suffix = `\u2026[+${s.length - keep}]`;
  keep = Math.max(0, maxLength - suffix.length);
  // Avoid splitting a surrogate pair.
  const code = s.charCodeAt(keep - 1);
  if (keep > 0 && code >= 0xd800 && code <= 0xdbff) keep -= 1;
  return s.slice(0, keep) + suffix;
}
