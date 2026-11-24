/**
 * String helpers: Unicode-aware case conversion, slugify, grapheme-safe truncation, masking,
 * HTML/RegExp escaping, safe templates, edit distance, fuzzy matching, pluralization
 * (docs/PLAN-HELPERS.md section 2, section 5, section 6). Formatting uses `Intl` with cached formatters.
 */
import { ValidationError } from '../error/index.js';
import { hasOwn, isUnsafeKey } from '../internal/keys.js';
import { cached, fold, foldWithMap, graphemeArray, iterGraphemes, localeKey, lower, stripDiacritics, upper } from './internal.js';
import { splitWords } from './words.js';

export { splitWords } from './words.js';
export type { SplitWordsOptions } from './words.js';

/** Options for locale-sensitive helpers. Without `locale`, case mapping is locale-independent. */
export interface LocaleOptions {
  readonly locale?: Intl.LocalesArgument;
}

// ---------------------------------------------------------------------------
// Case conversion

const APOSTROPHES_RE = /['\u2019]/gu;

function caseWords(s: string): string[] {
  return splitWords(s).map((w) => w.replace(APOSTROPHES_RE, ''));
}

/** Uppercases the first code point (with its marks), lowercases the rest. */
function capWord(w: string, locale: Intl.LocalesArgument): string {
  const first = String.fromCodePoint(w.codePointAt(0) ?? 0);
  return upper(first, locale) + lower(w.slice(first.length), locale);
}

/**
 * `camelCase`. Acronyms are lowered (`XMLHttpRequest` -> `xmlHttpRequest`).
 * @example
 * camelCase('user_first-name'); // => 'userFirstName'
 */
export function camelCase(s: string, options: LocaleOptions = {}): string {
  return caseWords(s)
    .map((w, i) => (i === 0 ? lower(w, options.locale) : capWord(w, options.locale)))
    .join('');
}

/**
 * `PascalCase`.
 * @example
 * pascalCase('user first name'); // => 'UserFirstName'
 */
export function pascalCase(s: string, options: LocaleOptions = {}): string {
  return caseWords(s)
    .map((w) => capWord(w, options.locale))
    .join('');
}

function joinLower(s: string, sep: string, locale: Intl.LocalesArgument): string {
  return caseWords(s)
    .map((w) => lower(w, locale))
    .join(sep);
}

/**
 * `kebab-case`.
 * @example
 * kebabCase('XMLHttpRequest'); // => 'xml-http-request'
 */
export function kebabCase(s: string, options: LocaleOptions = {}): string {
  return joinLower(s, '-', options.locale);
}

/**
 * `snake_case`.
 * @example
 * snakeCase('userFirstName'); // => 'user_first_name'
 */
export function snakeCase(s: string, options: LocaleOptions = {}): string {
  return joinLower(s, '_', options.locale);
}

/**
 * `dot.case`.
 * @example
 * dotCase('userFirstName'); // => 'user.first.name'
 */
export function dotCase(s: string, options: LocaleOptions = {}): string {
  return joinLower(s, '.', options.locale);
}

/**
 * `CONSTANT_CASE`.
 * @example
 * constantCase('maxRetryCount'); // => 'MAX_RETRY_COUNT'
 */
export function constantCase(s: string, options: LocaleOptions = {}): string {
  return caseWords(s)
    .map((w) => upper(w, options.locale))
    .join('_');
}

/**
 * Common English minor words for `titleCase({ minorWords })`.
 * @example
 * titleCase('war and peace', { minorWords: ENGLISH_MINOR_WORDS }); // => 'War and Peace'
 */
export const ENGLISH_MINOR_WORDS: readonly string[] = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'over', 'per', 'the', 'to', 'up', 'via', 'vs', 'with'];

export interface TitleCaseOptions extends LocaleOptions {
  /** Words kept lowercase unless first or last (compared case-insensitively). Default none. */
  readonly minorWords?: Iterable<string>;
}

/**
 * `Title Case` from any identifier or phrase (words joined by spaces).
 * @example
 * titleCase('the_lord-of the rings', { minorWords: ENGLISH_MINOR_WORDS }); // => 'The Lord of the Rings'
 */
export function titleCase(s: string, options: TitleCaseOptions = {}): string {
  const { locale } = options;
  const minor = new Set<string>();
  if (options.minorWords) for (const w of options.minorWords) minor.add(lower(w, locale));
  const words = caseWords(s);
  return words
    .map((w, i) => {
      const l = lower(w, locale);
      return i > 0 && i < words.length - 1 && minor.has(l) ? l : capWord(w, locale);
    })
    .join(' ');
}

/**
 * `Sentence case` (first word capitalized, words joined by spaces).
 * @example
 * sentenceCase('userFirstName'); // => 'User first name'
 */
export function sentenceCase(s: string, options: LocaleOptions = {}): string {
  return caseWords(s)
    .map((w, i) => (i === 0 ? capWord(w, options.locale) : lower(w, options.locale)))
    .join(' ');
}

export interface CapitalizeOptions extends LocaleOptions {
  /** Lowercase the rest of the string. Default false. */
  readonly lowerRest?: boolean;
}

/**
 * Uppercases the first character (locale-aware: `{ locale: 'tr' }` maps `i` -> `İ`).
 * @example
 * capitalize('élan'); // => 'Élan'
 */
export function capitalize(s: string, options: CapitalizeOptions = {}): string {
  if (s === '') return s;
  const first = String.fromCodePoint(s.codePointAt(0) ?? 0);
  const rest = s.slice(first.length);
  return upper(first, options.locale) + (options.lowerRest === true ? lower(rest, options.locale) : rest);
}

/**
 * Lowercases the first character.
 * @example
 * uncapitalize('Hello World'); // => 'hello World'
 */
export function uncapitalize(s: string, options: LocaleOptions = {}): string {
  if (s === '') return s;
  const first = String.fromCodePoint(s.codePointAt(0) ?? 0);
  return lower(first, options.locale) + s.slice(first.length);
}

// ---------------------------------------------------------------------------
// Slugs and diacritics

/**
 * Removes Latin/Greek/Cyrillic diacritics (`é` -> `e`, `ł` -> `l`); vowel signs of other scripts are kept.
 * @example
 * removeDiacritics('Crème Brûlée, Łódź'); // => 'Creme Brulee, Lodz'
 */
export function removeDiacritics(s: string): string {
  return stripDiacritics(s);
}

const LIGATURES: Readonly<Record<string, string>> = { \u00df: 'ss', \u1e9e: 'SS', \u00e6: 'ae', \u00c6: 'AE', \u0153: 'oe', \u0152: 'OE', \u00fe: 'th', \u00de: 'TH', \u00f0: 'd', \u00d0: 'D', \u0131: 'i' };
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;
const MARK_CHAR_RE = /\p{M}/u;

export interface SlugifyOptions extends LocaleOptions {
  /** Default `-`. */
  readonly separator?: string;
  /** Default true. */
  readonly lowercase?: boolean;
  /** Keep only ASCII letters and digits. Default false (Unicode letters such as `東京` are kept). */
  readonly ascii?: boolean;
  /** Maximum length in code points; cuts at a separator when possible. */
  readonly maxLength?: number;
}

/**
 * URL slug: NFKD, diacritics removed, locale-aware lowercasing, non-word runs to one separator.
 * @example
 * slugify('Crème Brûlée & Café!'); // => 'creme-brulee-cafe'
 * slugify('İstanbul', { locale: 'tr' }); // => 'istanbul'
 */
export function slugify(s: string, options: SlugifyOptions = {}): string {
  const { separator = '-', lowercase = true, ascii = false, maxLength, locale } = options;
  let t = lowercase ? lower(s, locale) : s;
  t = Array.from(stripDiacritics(t, 'NFKD'), (c) => LIGATURES[c] ?? c).join('');
  // Compatibility decomposition can introduce capitals (`№` -> `No`).
  if (lowercase) t = lower(t, locale);
  let out: string[] = [];
  let pending = false;
  let kept = false;
  for (const ch of t) {
    if (ch === "'" || ch === '\u2019') continue;
    const isWord = WORD_CHAR_RE.test(ch) || (kept && MARK_CHAR_RE.test(ch));
    if (isWord && (!ascii || ch.charCodeAt(0) < 128)) {
      if (pending && out.length) out.push(separator);
      pending = false;
      out.push(ch);
      kept = true;
    } else {
      pending = true;
      kept = false;
    }
  }
  if (maxLength !== undefined && maxLength >= 0) {
    const cps = Array.from(out.join(''));
    if (cps.length > maxLength) {
      let cut = cps.slice(0, maxLength).join('');
      const lastSep = separator ? cut.lastIndexOf(separator) : -1;
      const nextStartsSep = separator !== '' && cps.slice(maxLength).join('').startsWith(separator);
      if (!nextStartsSep && lastSep > cut.length / 2) cut = cut.slice(0, lastSep);
      while (separator !== '' && cut.endsWith(separator)) cut = cut.slice(0, -separator.length);
      out = [cut];
    }
  }
  return out.join('');
}

// ---------------------------------------------------------------------------
// Graphemes

/**
 * User-perceived characters (extended grapheme clusters via `Intl.Segmenter`, with a fallback).
 * @example
 * graphemes('👍🏽e\u0301'); // => ['👍🏽', 'e\u0301'] // 2 graphemes
 */
export function graphemes(s: string): string[] {
  return graphemeArray(s);
}

/**
 * Number of user-perceived characters.
 * @example
 * graphemeLength('👨\u200d👩\u200d👧'); // => 1
 */
export function graphemeLength(s: string): number {
  let n = 0;
  for (const it = iterGraphemes(s); it.next().done !== true; ) n++;
  return n;
}

/**
 * Reverses by grapheme clusters, keeping emoji and combining marks intact.
 * @example
 * reverseGraphemes('ab👍🏽'); // => '👍🏽ba'
 */
export function reverseGraphemes(s: string): string {
  return graphemeArray(s).reverse().join('');
}

/**
 * Length in the given unit: `grapheme` (default), `codePoint`, or `codeUnit` (UTF-16).
 * @example
 * charCount('😀', { unit: 'codeUnit' }); // => 2
 */
export function charCount(s: string, options: { readonly unit?: 'grapheme' | 'codePoint' | 'codeUnit' } = {}): number {
  const unit = options.unit ?? 'grapheme';
  if (unit === 'codeUnit') return s.length;
  if (unit === 'codePoint') {
    let n = 0;
    for (const it = s[Symbol.iterator](); it.next().done !== true; ) n++;
    return n;
  }
  return graphemeLength(s);
}

export interface TruncateOptions {
  /** Appended when truncated; counts toward `length`. Default `...`. */
  readonly omission?: string;
  /** Cut at the last whitespace before the limit when possible. Default false. */
  readonly wordBoundary?: boolean;
}

const isSpace = (g: string): boolean => /^\s+$/u.test(g);
const TRAIL_PUNCT = new Set([',', ';', ':', '-', '\u2013', '\u2014']);

/**
 * Truncates to at most `length` grapheme clusters including the omission. Never splits emoji or accents.
 * @example
 * truncate('Hello wonderful world', 12, { wordBoundary: true }); // => 'Hello…'
 * truncate('👍🏽👍🏽👍🏽', 2); // => '👍🏽…'
 */
export function truncate(s: string, length: number, options: TruncateOptions = {}): string {
  const { omission = '\u2026', wordBoundary = false } = options;
  const max = Math.max(0, Math.floor(length));
  const head = graphemeArray(s, max + 1);
  if (head.length <= max) return s;
  const om = graphemeArray(omission);
  if (om.length >= max) return om.slice(0, max).join('');
  let keep = head.slice(0, max - om.length);
  if (wordBoundary && !isSpace(head[keep.length] ?? ' ')) {
    let i = keep.length - 1;
    while (i >= 0 && !isSpace(keep[i] ?? '')) i--;
    if (i > 0) keep = keep.slice(0, i);
  }
  while (keep.length && (isSpace(keep[keep.length - 1] ?? '') || TRAIL_PUNCT.has(keep[keep.length - 1] ?? ''))) keep.pop();
  return keep.join('') + omission;
}

/**
 * Truncates in the middle, keeping the start and end (file names, IDs).
 * @example
 * truncateMiddle('annual-report-2026-final.pdf', 15); // => 'annual-…nal.pdf'
 */
export function truncateMiddle(s: string, length: number, options: { readonly omission?: string } = {}): string {
  const omission = options.omission ?? '\u2026';
  const max = Math.max(0, Math.floor(length));
  const g = graphemeArray(s);
  if (g.length <= max) return s;
  const om = graphemeArray(omission);
  if (om.length >= max) return om.slice(0, max).join('');
  const avail = max - om.length;
  const front = Math.ceil(avail / 2);
  const back = avail - front;
  return g.slice(0, front).join('') + omission + (back > 0 ? g.slice(g.length - back).join('') : '');
}

/**
 * Centers `s` in `width` grapheme columns with `fill`.
 * @example
 * center('ab', 6, '*'); // => '**ab**'
 */
export function center(s: string, width: number, fill = ' '): string {
  const len = graphemeLength(s);
  const f = graphemeArray(fill);
  if (len >= width || f.length === 0) return s;
  const pad = (n: number): string => Array.from({ length: n }, (_, i) => f[i % f.length] ?? ' ').join('');
  const total = width - len;
  const left = Math.floor(total / 2);
  return pad(left) + s + pad(total - left);
}

// ---------------------------------------------------------------------------
// Masking

export interface MaskOptions {
  /** Characters left visible at the start. Default 0. */
  readonly visibleStart?: number;
  /** Characters left visible at the end. Default 0. */
  readonly visibleEnd?: number;
  /** Default `*`. */
  readonly maskChar?: string;
  /** Characters kept as-is and not counted (for example `' -'` for formatted card numbers). */
  readonly preserve?: string;
}

/**
 * Masks all but the visible start/end characters (grapheme-safe). If the visible parts would
 * reveal everything, everything is masked.
 * @example
 * mask('4111111111111111', { visibleEnd: 4 }); // => '••••••••••••1111'
 * mask('4111 1111 1111 1111', { visibleEnd: 4, preserve: ' ' }); // => '•••• •••• •••• 1111'
 */
export function mask(s: string, options: MaskOptions = {}): string {
  const { visibleStart = 0, visibleEnd = 0, maskChar = '\u2022', preserve = '' } = options;
  const g = graphemeArray(s);
  const keepSet = new Set(graphemeArray(preserve));
  const maskable: number[] = [];
  g.forEach((c, i) => {
    if (!keepSet.has(c)) maskable.push(i);
  });
  const vs = Math.max(0, Math.floor(visibleStart));
  const ve = Math.max(0, Math.floor(visibleEnd));
  const reveal = new Set<number>();
  if (vs + ve < maskable.length) {
    for (let i = 0; i < vs; i++) reveal.add(maskable[i] ?? -1);
    for (let i = maskable.length - ve; i < maskable.length; i++) reveal.add(maskable[i] ?? -1);
  }
  return g.map((c, i) => (keepSet.has(c) || reveal.has(i) ? c : maskChar)).join('');
}

export interface MaskEmailOptions {
  readonly maskChar?: string;
  /** Visible characters at the start of the local part. Default 1. */
  readonly visible?: number;
  /** Also mask the domain name (the top-level domain stays). Default false. */
  readonly maskDomain?: boolean;
}

/**
 * Masks the local part of an email address.
 * @example
 * maskEmail('john.doe@example.com'); // => 'j•••••••@example.com'
 * maskEmail('ann@example.com', { maskDomain: true }); // => 'a••@e••••••.com'
 */
export function maskEmail(email: string, options: MaskEmailOptions = {}): string {
  const { maskChar = '\u2022', visible = 1, maskDomain = false } = options;
  const at = email.lastIndexOf('@');
  if (at <= 0) return mask(email, { maskChar });
  const local = mask(email.slice(0, at), { visibleStart: visible, maskChar });
  let domain = email.slice(at + 1);
  if (maskDomain) {
    const dot = domain.lastIndexOf('.');
    domain = dot > 0 ? mask(domain.slice(0, dot), { visibleStart: 1, maskChar }) + domain.slice(dot) : mask(domain, { visibleStart: 1, maskChar });
  }
  return `${local}@${domain}`;
}

// ---------------------------------------------------------------------------
// Whitespace and control characters

/**
 * Normalizes line endings (CRLF, CR, U+2028/9 -> LF), turns other whitespace (tabs, NBSP, thin spaces)
 * into plain spaces, and drops BOM/zero-width spaces. Structure (runs, newlines) is kept.
 * @example
 * normalizeWhitespace('a\u00a0b\r\nc'); // => 'a b\nc'
 */
export function normalizeWhitespace(s: string): string {
  return s
    .replace(/\r\n?|[\u2028\u2029]/gu, '\n')
    .replace(/[\u200b\ufeff]/gu, '')
    .replace(/[^\S\n]/gu, ' ');
}

/**
 * Trims and collapses every whitespace run (including newlines) to one space.
 * @example
 * collapseWhitespace('  a \n\t b  '); // => 'a b'
 */
export function collapseWhitespace(s: string): string {
  return s.trim().replace(/\s+/gu, ' ');
}

export interface StripControlOptions {
  /** Keep tab, LF and CR. Default true. */
  readonly keepWhitespace?: boolean;
  /** Also remove bidi embedding/override/isolate controls (Trojan Source). Default true. */
  readonly stripBidi?: boolean;
}

/**
 * Removes C0/C1 control characters and, by default, bidi override controls.
 * @example
 * stripControlChars('a\u0000b\u202ec\n'); // => 'abc\n'
 */
export function stripControlChars(s: string, options: StripControlOptions = {}): string {
  const keepWs = options.keepWhitespace ?? true;
  const bidi = options.stripBidi ?? true;
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    const control = c < 0x20 || (c >= 0x7f && c <= 0x9f);
    if (control && !(keepWs && (c === 0x09 || c === 0x0a || c === 0x0d))) continue;
    if (bidi && ((c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069))) continue;
    out += ch;
  }
  return out;
}

/**
 * Splits on LF, CRLF, CR, U+2028 and U+2029.
 * @example
 * splitLines('a\r\nb\nc'); // => ['a', 'b', 'c']
 */
export function splitLines(s: string): string[] {
  return s.split(/\r\n|[\n\r\u2028\u2029]/u);
}

/**
 * Prefixes each line with `indent` (a string or a number of spaces). Blank lines stay blank unless `indentEmpty`.
 * @example
 * indent('a\nb', 2); // => '  a\n  b'
 */
export function indent(s: string, prefix: string | number = 2, options: { readonly indentEmpty?: boolean } = {}): string {
  const p = typeof prefix === 'number' ? ' '.repeat(Math.max(0, Math.floor(prefix))) : prefix;
  return s
    .split('\n')
    .map((l) => (l.trim() === '' && options.indentEmpty !== true ? l : p + l))
    .join('\n');
}

/**
 * Removes the longest common leading whitespace of non-blank lines.
 * @example
 * dedent('    a\n      b'); // => 'a\n  b'
 */
export function dedent(s: string): string {
  const lines = s.split('\n');
  let common: string | undefined;
  for (const l of lines) {
    if (l.trim() === '') continue;
    let n = 0;
    while (n < l.length && (l.charAt(n) === ' ' || l.charAt(n) === '\t')) n++;
    const ws = l.slice(0, n);
    if (common === undefined) common = ws;
    else {
      let k = 0;
      while (k < common.length && k < ws.length && common.charAt(k) === ws.charAt(k)) k++;
      common = common.slice(0, k);
    }
    if (common === '') break;
  }
  if (!common) return s;
  const c = common;
  return lines.map((l) => (l.startsWith(c) ? l.slice(c.length) : l.trimStart())).join('\n');
}

export interface WrapTextOptions {
  /** Break words longer than `width`. Default true. */
  readonly breakWords?: boolean;
  /** Line separator. Default `\n`. */
  readonly newline?: string;
}

/**
 * Greedy word wrap to `width` grapheme columns; existing line breaks are kept.
 * @example
 * wrapText('The quick brown fox', 10); // => 'The quick\nbrown fox'
 */
export function wrapText(s: string, width: number, options: WrapTextOptions = {}): string {
  const { breakWords = true, newline = '\n' } = options;
  const w = Math.max(1, Math.floor(width));
  const out: string[] = [];
  for (const para of splitLines(s)) {
    const words = para.split(/\s+/u).filter((x) => x !== '');
    if (!words.length) {
      out.push('');
      continue;
    }
    let line: string[] = [];
    let lineLen = 0;
    const push = (): void => {
      out.push(line.join(''));
      line = [];
      lineLen = 0;
    };
    for (const word of words) {
      let g = graphemeArray(word);
      if (lineLen > 0 && lineLen + 1 + g.length > w) push();
      if (breakWords) {
        while (g.length > w - (lineLen > 0 ? lineLen + 1 : 0) && g.length > w) {
          if (lineLen > 0) push();
          out.push(g.slice(0, w).join(''));
          g = g.slice(w);
        }
      }
      if (!g.length) continue;
      if (lineLen > 0) {
        line.push(' ');
        lineLen++;
      }
      line.push(g.join(''));
      lineLen += g.length;
    }
    if (lineLen > 0) push();
  }
  return out.join(newline);
}

// ---------------------------------------------------------------------------
// Counting and searching

const wordSegmenters = new Map<string, Intl.Segmenter>();

/**
 * Word count using `Intl.Segmenter` word boundaries (works for scripts without spaces, such as Japanese).
 * @example
 * wordCount("Don't stop, it's 2026!"); // => 4
 */
export function wordCount(s: string, options: LocaleOptions = {}): number {
  if (typeof Intl.Segmenter === 'function') {
    const seg = cached(wordSegmenters, localeKey(options.locale), () => new Intl.Segmenter(options.locale, { granularity: 'word' }));
    let n = 0;
    for (const x of seg.segment(s)) if (x.isWordLike === true) n++;
    return n;
  }
  return s.match(/[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

/**
 * Counts occurrences of a literal substring (non-overlapping by default).
 * @example
 * countOccurrences('aaaa', 'aa'); // => 2
 * countOccurrences('aaaa', 'aa', { overlapping: true }); // => 3
 */
export function countOccurrences(s: string, sub: string, options: { readonly overlapping?: boolean } = {}): number {
  if (sub === '') return 0;
  const step = options.overlapping === true ? 1 : sub.length;
  let n = 0;
  for (let i = s.indexOf(sub); i >= 0; i = s.indexOf(sub, i + step)) n++;
  return n;
}

/**
 * Replaces every occurrence of a literal string; `$` patterns in `replacement` are not interpreted.
 * @example
 * replaceAllSafe('a.b.c', '.', '$&'); // => 'a$&b$&c'
 */
export function replaceAllSafe(s: string, search: string, replacement: string): string {
  if (search === '') return s;
  return s.split(search).join(replacement);
}

/**
 * Text between the first `start` and the next `end`; `undefined` when either is missing.
 * @example
 * between('key=[value]', '[', ']'); // => 'value'
 */
export function between(s: string, start: string, end: string): string | undefined {
  const i = s.indexOf(start);
  if (i < 0) return undefined;
  const from = i + start.length;
  const j = s.indexOf(end, from);
  return j < 0 ? undefined : s.slice(from, j);
}

/**
 * True when `s` starts with any prefix.
 * @example
 * startsWithAny('https://x', ['http://', 'https://']); // => true
 */
export function startsWithAny(s: string, prefixes: Iterable<string>): boolean {
  for (const p of prefixes) if (s.startsWith(p)) return true;
  return false;
}

/**
 * True when `s` ends with any suffix.
 * @example
 * endsWithAny('photo.JPG'.toLowerCase(), ['.jpg', '.png']); // => true
 */
export function endsWithAny(s: string, suffixes: Iterable<string>): boolean {
  for (const p of suffixes) if (s.endsWith(p)) return true;
  return false;
}

export interface IgnoreCaseOptions extends LocaleOptions {
  /** Also ignore accents (`é` = `e`). Default false. */
  readonly ignoreAccents?: boolean;
}

/**
 * Case-insensitive (optionally accent-insensitive) substring test with locale-aware case folding.
 * @example
 * containsIgnoreCase('Crème Brûlée', 'BRULEE', { ignoreAccents: true }); // => true
 */
export function containsIgnoreCase(haystack: string, needle: string, options: IgnoreCaseOptions = {}): boolean {
  const accents = options.ignoreAccents === true;
  return fold(haystack.normalize('NFC'), options.locale, accents).includes(fold(needle.normalize('NFC'), options.locale, accents));
}

const collators = new Map<string, Intl.Collator>();
function collator(options: IgnoreCaseOptions): Intl.Collator {
  const sensitivity = options.ignoreAccents === true ? 'base' : 'accent';
  return cached(collators, `${localeKey(options.locale)}|${sensitivity}`, () => new Intl.Collator(options.locale, { sensitivity }));
}

/**
 * Case-insensitive equality via `Intl.Collator` (sensitivity `accent`, or `base` with `ignoreAccents`).
 * @example
 * equalsIgnoreCase('Straße', 'STRASSE', { locale: 'de' }); // true where the collator treats ß as ss
 */
export function equalsIgnoreCase(a: string, b: string, options: IgnoreCaseOptions = {}): boolean {
  return collator(options).compare(a, b) === 0;
}

/**
 * Case-insensitive locale comparison (-1, 0, 1) for sorting.
 * @example
 * ['b', 'A', 'a'].sort((x, y) => compareIgnoreCase(x, y)); // => ['A', 'a', 'b']
 */
export function compareIgnoreCase(a: string, b: string, options: IgnoreCaseOptions = {}): -1 | 0 | 1 {
  const r = collator(options).compare(a, b);
  return r < 0 ? -1 : r > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Character classes

/**
 * True for one or more Unicode letters (combining marks allowed after a letter).
 * @example
 * isAlpha('Ñandú'); // => true
 */
export function isAlpha(s: string): boolean {
  return /^(?:\p{L}\p{M}*)+$/u.test(s);
}

/**
 * True for one or more Unicode decimal digits (`\p{Nd}`, including non-Latin digits such as `٣`).
 * @example
 * isNumeric('0123'); // => true
 * isNumeric('1.5'); // => false
 */
export function isNumeric(s: string): boolean {
  return /^\p{Nd}+$/u.test(s);
}

/**
 * True for one or more Unicode letters or decimal digits.
 * @example
 * isAlphanumeric('abc123'); // => true
 */
export function isAlphanumeric(s: string): boolean {
  return /^(?:[\p{L}\p{Nd}]\p{M}*)+$/u.test(s);
}

/**
 * Code points of `s`.
 * @example
 * toCodePoints('a😀'); // => [97, 128512]
 */
export function toCodePoints(s: string): number[] {
  return Array.from(s, (c) => c.codePointAt(0) ?? 0);
}

/**
 * UTF-8 byte length without allocating (lone surrogates count as U+FFFD, 3 bytes).
 * @example
 * byteLengthUtf8('€'); // => 3
 */
export function byteLengthUtf8(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Escaping and templates

const HTML_ESC: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escapes `& < > " '` for HTML text and attribute values. Not a sanitizer.
 * @example
 * escapeHtml('<a href="x">Tom & Jerry\'s</a>'); // => '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;'
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESC[c] ?? c);
}

const HTML_UNESC: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

/**
 * Decodes `&amp; &lt; &gt; &quot; &apos; &nbsp;` and numeric references (`&#39;`, `&#x27;`).
 * Invalid code points become U+FFFD.
 * @example
 * unescapeHtml('Tom &amp; Jerry&#39;s &#x1F600;'); // => "Tom & Jerry's 😀"
 */
export function unescapeHtml(s: string): string {
  return s.replace(/&(?:#(\d{1,7})|#x([\da-f]{1,6})|(amp|lt|gt|quot|apos|nbsp));/gi, (m, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (name !== undefined) return HTML_UNESC[name.toLowerCase()] ?? m;
    const cp = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? '', 16);
    if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '\ufffd';
    return String.fromCodePoint(cp);
  });
}

/**
 * Escapes RegExp syntax characters so `s` matches literally (valid with and without the `u` flag).
 * @example
 * new RegExp(escapeRegExp('1+1=2?')).test('1+1=2?'); // => true
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[$()*+./?[\\\]^{|}]/g, '\\$&');
}

export interface TemplateOptions {
  /** Missing or non-primitive values: `keep` the placeholder (default), use `empty` string, or throw (`error`). */
  readonly missing?: 'keep' | 'empty' | 'error';
  /** Applied to each substituted value (for example `escapeHtml`). */
  readonly escape?: (value: string) => string;
}

/**
 * Safe `{name}` / `{a.b}` interpolation: no code evaluation, own properties only, unsafe keys
 * (`__proto__`, `constructor`, `prototype`) never resolve. `{{` and `}}` produce literal braces.
 * Primitives are stringified, dates use ISO 8601; objects count as missing.
 * @example
 * template('Hello {user.name}, you have {count} tasks', { user: { name: 'Ann' }, count: 3 }); // => 'Hello Ann, you have 3 tasks'
 */
export function template(str: string, values: object, options: TemplateOptions = {}): string {
  const { missing = 'keep', escape } = options;
  return str.replace(/\{\{|\}\}|\{\s*([\w$]+(?:\.[\w$]+)*)\s*\}/g, (m: string, path: string | undefined) => {
    if (path === undefined) return m.charAt(0);
    let cur: unknown = values;
    for (const seg of path.split('.')) {
      if (isUnsafeKey(seg) || typeof cur !== 'object' || cur === null || !hasOwn(cur, seg)) {
        cur = undefined;
        break;
      }
      cur = (cur as Record<string, unknown>)[seg];
    }
    let text: string | undefined;
    if (typeof cur === 'string') text = cur;
    else if (typeof cur === 'number' || typeof cur === 'bigint' || typeof cur === 'boolean') text = String(cur);
    else if (cur instanceof Date && !Number.isNaN(cur.getTime())) text = cur.toISOString();
    if (text === undefined) {
      if (missing === 'error') throw new ValidationError('HLP_STRING_TEMPLATE_MISSING', 'A template placeholder has no value.', { details: { key: path } });
      return missing === 'empty' ? '' : m;
    }
    return escape ? escape(text) : text;
  });
}

// ---------------------------------------------------------------------------
// Edit distance and fuzzy matching

export interface DistanceOptions {
  /** Stop early and return `maxDistance + 1` once the distance must exceed it. */
  readonly maxDistance?: number;
}

function prepare(a: string, b: string): [number[], number[]] {
  let s = toCodePoints(a);
  let t = toCodePoints(b);
  // Trim common prefix and suffix.
  let start = 0;
  while (start < s.length && start < t.length && s[start] === t[start]) start++;
  let endS = s.length;
  let endT = t.length;
  while (endS > start && endT > start && s[endS - 1] === t[endT - 1]) {
    endS--;
    endT--;
  }
  s = s.slice(start, endS);
  t = t.slice(start, endT);
  return s.length < t.length ? [t, s] : [s, t];
}

/**
 * Levenshtein distance over code points: O(n|m) time, O(min(n, m)) memory, optional early exit.
 * @example
 * levenshtein('kitten', 'sitting'); // => 3
 * levenshtein('kitten', 'sitting', { maxDistance: 1 }); // => 2 // exceeded
 */
export function levenshtein(a: string, b: string, options: DistanceOptions = {}): number {
  const max = options.maxDistance ?? Infinity;
  const [s, t] = prepare(a, b);
  if (s.length - t.length > max) return max + 1;
  if (t.length === 0) return s.length > max ? max + 1 : s.length;
  const row = new Uint32Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) row[j] = j;
  for (let i = 1; i <= s.length; i++) {
    let diag = row[0] ?? 0;
    row[0] = i;
    let rowMin = i;
    const sc = s[i - 1];
    for (let j = 1; j <= t.length; j++) {
      const up = row[j] ?? 0;
      const cost = sc === t[j - 1] ? 0 : 1;
      const v = Math.min(up + 1, (row[j - 1] ?? 0) + 1, diag + cost);
      row[j] = v;
      diag = up;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  const d = row[t.length] ?? 0;
  return d > max ? max + 1 : d;
}

/**
 * Damerau-Levenshtein (optimal string alignment): adjacent transpositions cost 1. O(min(n, m)) memory.
 * @example
 * damerauLevenshtein('ca', 'ac'); // => 1
 */
export function damerauLevenshtein(a: string, b: string, options: DistanceOptions = {}): number {
  const max = options.maxDistance ?? Infinity;
  const [s, t] = prepare(a, b);
  if (s.length - t.length > max) return max + 1;
  if (t.length === 0) return s.length > max ? max + 1 : s.length;
  const n = t.length + 1;
  let prev2 = new Uint32Array(n);
  let prev = new Uint32Array(n);
  let cur = new Uint32Array(n);
  for (let j = 0; j < n; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j < n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) v = Math.min(v, (prev2[j - 2] ?? 0) + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    [prev2, prev, cur] = [prev, cur, prev2];
  }
  const d = prev[n - 1] ?? 0;
  return d > max ? max + 1 : d;
}

/**
 * Normalized similarity 0-1 (1 - Levenshtein / longer length); two empty strings are 1.
 * @example
 * similarity('color', 'colour'); // => ≈ 0.833
 */
export function similarity(a: string, b: string, options: IgnoreCaseOptions & { readonly ignoreCase?: boolean } = {}): number {
  let x = a;
  let y = b;
  if (options.ignoreCase === true || options.ignoreAccents === true) {
    x = fold(x, options.locale, options.ignoreAccents === true);
    y = fold(y, options.locale, options.ignoreAccents === true);
  }
  const len = Math.max(charCount(x, { unit: 'codePoint' }), charCount(y, { unit: 'codePoint' }));
  return len === 0 ? 1 : 1 - levenshtein(x, y) / len;
}

/** Half-open `[start, end)` UTF-16 range in the original text. */
export type TextRange = readonly [start: number, end: number];

export interface FuzzyMatch<T> {
  readonly item: T;
  /** Index of `item` in the input. */
  readonly index: number;
  /** 0-1: exact 1, prefix ~ 0.9, word-start ~ 0.8, substring ~ 0.7, scattered subsequence <= 0.6. */
  readonly score: number;
  /** Index into `keys` of the best-matching key (0 for string candidates). */
  readonly key: number;
  /** The matched text. */
  readonly text: string;
  /** Matched ranges in `text`, for `highlight`. */
  readonly ranges: readonly TextRange[];
}

export type FuzzyKey<T> = ((item: T) => string | null | undefined) | { [K in keyof T]: T[K] extends string | null | undefined ? K : never }[keyof T];

export interface FuzzyOptions<T> extends LocaleOptions {
  /** Maximum results. Default unlimited. */
  readonly limit?: number;
  /** Minimum score (0-1). Default 0 (any match). */
  readonly threshold?: number;
  /** Text accessors for non-string candidates: property names or functions. */
  readonly keys?: readonly FuzzyKey<T>[];
  /** Ignore accents. Default true. */
  readonly ignoreAccents?: boolean;
}

const ALNUM_RE = /[\p{L}\p{N}]/u;
const UPPER_CHAR_RE = /\p{Lu}/u;
const LOWER_CHAR_RE = /\p{Ll}/u;

function isBoundary(text: string, i: number): boolean {
  if (i <= 0) return true;
  const prev = text.charAt(i - 1);
  const ch = text.charAt(i);
  if (!ALNUM_RE.test(prev)) return true;
  return UPPER_CHAR_RE.test(ch) && LOWER_CHAR_RE.test(prev);
}

function toRanges(positions: readonly number[], f: { readonly starts: readonly number[]; readonly ends: readonly number[] }): TextRange[] {
  const out: [number, number][] = [];
  for (const p of positions) {
    const s = f.starts[p] ?? 0;
    const e = f.ends[p] ?? s;
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

const MAX_STARTS = 64;

function scoreText(query: string, text: string, locale: Intl.LocalesArgument, accents: boolean): { score: number; ranges: TextRange[] } | undefined {
  const f = foldWithMap(text, locale, accents);
  const ft = f.text;
  const m = query.length;
  if (m === 0) return { score: 1, ranges: [] };
  const pos = ft.indexOf(query);
  if (pos >= 0) {
    const origStart = f.starts[pos] ?? 0;
    const base = ft === query ? 1 : pos === 0 ? 0.9 : isBoundary(text, origStart) ? 0.8 : 0.7;
    const score = base === 1 ? 1 : base - 0.1 * (1 - m / ft.length);
    return { score, ranges: toRanges(Array.from({ length: m }, (_, i) => pos + i), f) };
  }
  let best: { score: number; positions: number[] } | undefined;
  let starts = 0;
  for (let start = ft.indexOf(query.charAt(0)); start >= 0 && starts < MAX_STARTS; start = ft.indexOf(query.charAt(0), start + 1), starts++) {
    const positions = [start];
    let j = start + 1;
    for (let q = 1; q < m; q++) {
      const found = ft.indexOf(query.charAt(q), j);
      if (found < 0) break;
      positions.push(found);
      j = found + 1;
    }
    if (positions.length < m) break; // later starts cannot match either
    let consecutive = 0;
    let boundaries = 0;
    for (let i = 0; i < m; i++) {
      const p = positions[i] ?? 0;
      if (i > 0 && p === (positions[i - 1] ?? 0) + 1) consecutive++;
      if (isBoundary(text, f.starts[p] ?? 0)) boundaries++;
    }
    const spread = (positions[m - 1] ?? 0) - start + 1;
    const score = 0.1 + 0.25 * (m / spread) + 0.15 * (m > 1 ? consecutive / (m - 1) : 1) + 0.1 * (boundaries / m);
    if (!best || score > best.score) best = { score, positions };
  }
  return best ? { score: best.score, ranges: toRanges(best.positions, f) } : undefined;
}

/**
 * Ranked fuzzy search: case- and accent-insensitive substring and subsequence matching with
 * word-start and contiguity bonuses. Results carry `ranges` for accessible highlighting.
 * Ties keep shorter texts first, then input order. An empty query returns every candidate with score 1.
 * @example
 * const [best] = fuzzyMatch('jsmi', ['John Smith', 'Jane Doe']);
 * best?.item; // => 'John Smith'
 * best?.ranges; // => [[0, 1], [5, 8]]
 * const people = [{ name: 'Joanna Kay', email: 'jkay@x.io' }, { name: 'Ben Ross', email: 'ann.ross@x.io' }, { name: 'Cy Diaz', email: 'cy@x.io' }];
 * fuzzyMatch('ann', people, { keys: ['name', (p) => p.email], limit: 5 }).map((m) => m.item.name); // => ['Ben Ross', 'Joanna Kay']
 */
export function fuzzyMatch<T>(query: string, candidates: readonly T[], options: FuzzyOptions<T> = {}): FuzzyMatch<T>[] {
  const { limit = Infinity, threshold = 0, keys, locale } = options;
  const accents = options.ignoreAccents ?? true;
  const q = fold(query.trim().normalize('NFC'), locale, accents);
  const results: FuzzyMatch<T>[] = [];
  candidates.forEach((item, index) => {
    const texts: (string | undefined)[] = [];
    if (keys?.length) {
      for (const k of keys) {
        const v: unknown = typeof k === 'function' ? k(item) : item[k];
        texts.push(typeof v === 'string' ? v : undefined);
      }
    } else texts.push(typeof item === 'string' ? item : undefined);
    let best: FuzzyMatch<T> | undefined;
    texts.forEach((text, key) => {
      if (text === undefined) return;
      const r = scoreText(q, text, locale, accents);
      if (r && r.score >= threshold && (!best || r.score > best.score)) best = { item, index, score: r.score, key, text, ranges: r.ranges };
    });
    if (best) results.push(best);
  });
  results.sort((a, b) => b.score - a.score || a.text.length - b.text.length || a.index - b.index);
  return Number.isFinite(limit) ? results.slice(0, Math.max(0, limit)) : results;
}

/** A piece of text and whether it matched, for rendering `<mark>` via `textContent` (no HTML). */
export interface HighlightSegment {
  readonly text: string;
  readonly match: boolean;
}

export interface HighlightOptions extends LocaleOptions {
  /** Ignore accents when matching a query. Default true. */
  readonly ignoreAccents?: boolean;
  /** Highlight each whitespace-separated term of the query separately. Default false. */
  readonly words?: boolean;
}

/**
 * Splits `text` into matched and unmatched segments for a query (case/accent-insensitive) or for
 * explicit ranges (from `fuzzyMatch`). Render matches with `<mark>` using `textContent`.
 * @example
 * highlight('Crème brûlée', 'brulee'); // => [{ text: 'Crème ', match: false }, { text: 'brûlée', match: true }]
 */
export function highlight(text: string, query: string | readonly TextRange[], options: HighlightOptions = {}): HighlightSegment[] {
  let ranges: [number, number][];
  if (typeof query === 'string') {
    const accents = options.ignoreAccents ?? true;
    const f = foldWithMap(text, options.locale, accents);
    const terms = (options.words === true ? query.split(/\s+/u) : [query.trim()]).map((t) => fold(t.normalize('NFC'), options.locale, accents)).filter((t) => t !== '');
    ranges = [];
    for (const term of terms) {
      for (let i = f.text.indexOf(term); i >= 0; i = f.text.indexOf(term, i + term.length)) {
        ranges.push([f.starts[i] ?? 0, f.ends[i + term.length - 1] ?? 0]);
      }
    }
  } else {
    ranges = query.map(([s, e]) => [Math.max(0, Math.min(s, text.length)), Math.max(0, Math.min(e, text.length))]);
  }
  ranges = ranges.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const out: HighlightSegment[] = [];
  let at = 0;
  for (const [s, e] of ranges) {
    if (e <= at) continue;
    const from = Math.max(s, at);
    if (from > at) out.push({ text: text.slice(at, from), match: false });
    const prev = out[out.length - 1];
    if (prev?.match === true && from === at) out[out.length - 1] = { text: prev.text + text.slice(from, e), match: true };
    else out.push({ text: text.slice(from, e), match: true });
    at = e;
  }
  if (at < text.length) out.push({ text: text.slice(at), match: false });
  return out;
}

// ---------------------------------------------------------------------------
// Plurals, lists, initials

/** Plural forms keyed by `Intl.PluralRules` category; `other` is required. */
export interface PluralForms {
  readonly zero?: string;
  readonly one?: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

const pluralRules = new Map<string, Intl.PluralRules>();
const numberFormats = new Map<string, Intl.NumberFormat>();

/**
 * Picks the plural form for `count` with `Intl.PluralRules` and replaces `{count}` with the
 * locale-formatted number. An explicit `zero` form wins for 0 in every locale.
 * @example
 * pluralize(1, { one: '{count} file', other: '{count} files' }); // => '1 file'
 * pluralize(3, { one: '{count} plik', few: '{count} pliki', many: '{count} plików', other: '{count} pliku' }, { locale: 'pl' }); // => '3 pliki'
 */
export function pluralize(count: number, forms: PluralForms, options: LocaleOptions & { readonly type?: Intl.PluralRuleType } = {}): string {
  const { locale, type = 'cardinal' } = options;
  const key = `${localeKey(locale)}|${type}`;
  let form: string;
  if (count === 0 && forms.zero !== undefined) form = forms.zero;
  else {
    const cat = cached(pluralRules, key, () => new Intl.PluralRules(locale, { type })).select(count);
    form = forms[cat] ?? forms.other;
  }
  if (!form.includes('{count}')) return form;
  const formatted = cached(numberFormats, localeKey(locale), () => new Intl.NumberFormat(locale)).format(count);
  return form.replaceAll('{count}', formatted);
}

const listFormats = new Map<string, Intl.ListFormat>();

export interface FormatListOptions extends LocaleOptions {
  /** `conjunction` (and, default), `disjunction` (or), or `unit`. */
  readonly type?: Intl.ListFormatType;
  readonly style?: Intl.ListFormatStyle;
}

/**
 * Locale-aware list with `Intl.ListFormat`.
 * @example
 * formatList(['red', 'green', 'blue']); // => 'red, green, and blue' // en
 * formatList(['tea', 'coffee'], { type: 'disjunction' }); // => 'tea or coffee'
 */
export function formatList(items: Iterable<string>, options: FormatListOptions = {}): string {
  const { locale, type = 'conjunction', style = 'long' } = options;
  return cached(listFormats, `${localeKey(locale)}|${type}|${style}`, () => new Intl.ListFormat(locale, { type, style })).format(items);
}

/**
 * Initials from a name (grapheme-safe, locale-aware uppercase). With more words than `max`, keeps
 * the first `max - 1` and the last.
 * @example
 * initials('John Ronald Reuel Tolkien'); // => 'JT'
 * initials('élodie durand'); // => 'ÉD'
 */
export function initials(name: string, options: LocaleOptions & { readonly max?: number } = {}): string {
  const max = Math.max(1, Math.floor(options.max ?? 2));
  const letters: string[] = [];
  for (const word of name.trim().split(/\s+/u)) {
    for (const g of iterGraphemes(word)) {
      if (ALNUM_RE.test(g)) {
        letters.push(upper(g, options.locale));
        break;
      }
    }
  }
  if (letters.length <= max) return letters.join('');
  return [...letters.slice(0, max - 1), letters[letters.length - 1] ?? ''].join('');
}
