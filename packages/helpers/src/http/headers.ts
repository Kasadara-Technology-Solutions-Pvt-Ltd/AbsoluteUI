/**
 * HTTP header parsers (RFC 9110, 9111, 8288, 6266, 8187/5987). Hand-written scanners: linear
 * time, bounded input, no regular expressions over unbounded header text.
 */
import { LimitError } from '../error/index.js';
import { isUnsafeKey } from '../internal/keys.js';
import { safeFileName } from '../sanitize/index.js';

const MAX_HEADER = 16_384;

const TCHAR = "!#$%&'*+-.^_`|~";
const isTchar = (c: string): boolean => {
  const n = c.charCodeAt(0);
  return (n >= 48 && n <= 57) || (n >= 65 && n <= 90) || (n >= 97 && n <= 122) || (c.length === 1 && TCHAR.includes(c));
};
const isOws = (c: string): boolean => c === ' ' || c === '\t';

function checkLength(value: string, max: number): void {
  if (value.length > max) throw new LimitError('HLP_HTTP_HEADER_TOO_LONG', 'The header value exceeds the length limit.', { details: { max } });
}

/** Minimal scanner over a header value. */
class Scanner {
  i = 0;
  constructor(readonly s: string) {}
  get done(): boolean {
    return this.i >= this.s.length;
  }
  peek(): string {
    return this.s.charAt(this.i);
  }
  ows(): void {
    while (this.i < this.s.length && isOws(this.s.charAt(this.i))) this.i++;
  }
  eat(c: string): boolean {
    if (this.s.charAt(this.i) === c) {
      this.i++;
      return true;
    }
    return false;
  }
  token(): string {
    const start = this.i;
    while (this.i < this.s.length && isTchar(this.s.charAt(this.i))) this.i++;
    return this.s.slice(start, this.i);
  }
  /** quoted-string with backslash escapes; `undefined` when unterminated. */
  quoted(): string | undefined {
    if (!this.eat('"')) return undefined;
    let out = '';
    while (this.i < this.s.length) {
      const c = this.s.charAt(this.i++);
      if (c === '"') return out;
      if (c === '\\' && this.i < this.s.length) out += this.s.charAt(this.i++);
      else out += c;
    }
    return undefined;
  }
  /** token or quoted-string. */
  value(): string | undefined {
    return this.peek() === '"' ? this.quoted() : this.token();
  }
  /** Skips to just after the next top-level `stop` character (respecting quotes). */
  skipPast(stop: string): void {
    while (this.i < this.s.length) {
      const c = this.s.charAt(this.i);
      if (c === '"') {
        if (this.quoted() === undefined) return;
        continue;
      }
      this.i++;
      if (c === stop) return;
    }
  }
}

/** Parses `*( OWS ";" OWS name [ "=" value ] )` until `,` or the end. Names are lowercased. */
function parseParams(sc: Scanner, stopAtComma: boolean): [string, string][] {
  const out: [string, string][] = [];
  for (;;) {
    sc.ows();
    if (sc.done || (stopAtComma && sc.peek() === ',')) return out;
    if (!sc.eat(';')) {
      // Malformed: skip to the next parameter or element.
      sc.i++;
      continue;
    }
    sc.ows();
    const name = sc.token().toLowerCase();
    sc.ows();
    let value = '';
    if (sc.eat('=')) {
      sc.ows();
      value = sc.value() ?? '';
    }
    if (name !== '') out.push([name, value]);
  }
}

/** Builds a safe record: first occurrence wins, unsafe names dropped. */
function toRecord(pairs: readonly [string, string][]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of pairs) if (!isUnsafeKey(k) && !Object.prototype.hasOwnProperty.call(out, k)) out[k] = v;
  return out;
}

// ---------------------------------------------------------------------------
// RFC 8187 ext-value (charset'lang'pct-encoded)

/**
 * Decodes an RFC 8187 / RFC 5987 `ext-value` such as `UTF-8''na%C3%AFve.txt`. Supports UTF-8
 * and ISO-8859-1; returns `undefined` for other charsets or malformed encoding.
 * @example decodeExtValue("UTF-8''%E2%82%AC%20rates") // => '€ rates'
 */
export function decodeExtValue(value: string): string | undefined {
  const first = value.indexOf("'");
  const second = first < 0 ? -1 : value.indexOf("'", first + 1);
  if (second < 0) return undefined;
  const charset = value.slice(0, first).toLowerCase();
  const encoded = value.slice(second + 1);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    const c = encoded.charAt(i);
    if (c === '%') {
      const hex = encoded.slice(i + 1, i + 3);
      if (!/^[\da-f]{2}$/i.test(hex)) return undefined;
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      const n = c.charCodeAt(0);
      if (n > 0x7e || n <= 0x20) return undefined;
      bytes.push(n);
    }
  }
  if (charset === 'utf-8') {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
    } catch {
      return undefined;
    }
  }
  if (charset === 'iso-8859-1') return String.fromCharCode(...bytes);
  return undefined;
}

// ---------------------------------------------------------------------------
// Content-Type

export interface ContentType {
  /** Lowercased top-level type, e.g. `application`. */
  readonly type: string;
  /** Lowercased subtype, e.g. `problem+json`. */
  readonly subtype: string;
  /** Structured syntax suffix including `+`, e.g. `+json`; `''` when absent. */
  readonly suffix: string;
  /** `type/subtype`. */
  readonly mediaType: string;
  /** Parameters with lowercased names (`charset` value lowercased too). */
  readonly params: Readonly<Record<string, string>>;
}

/**
 * Parses a `Content-Type` value.
 * @example parseContentType('application/json; charset=UTF-8') // => { type: 'application', subtype: 'json', suffix: '', mediaType: 'application/json', params: { charset: 'utf-8' } }
 */
export function parseContentType(value: string | null | undefined): ContentType | undefined {
  if (typeof value !== 'string' || value.length > 1024) return undefined;
  const sc = new Scanner(value.trim());
  const type = sc.token().toLowerCase();
  if (type === '' || !sc.eat('/')) return undefined;
  const subtype = sc.token().toLowerCase();
  if (subtype === '') return undefined;
  const params = toRecord(parseParams(sc, false));
  if (params.charset !== undefined) params.charset = params.charset.toLowerCase();
  const plus = subtype.lastIndexOf('+');
  return { type, subtype, suffix: plus > 0 ? subtype.slice(plus) : '', mediaType: `${type}/${subtype}`, params };
}

/**
 * True for `application/json` and any `+json` media type (`application/problem+json`).
 * @example isJsonContentType('application/vnd.api+json') // => true
 */
export function isJsonContentType(value: string | null | undefined): boolean {
  const ct = parseContentType(value);
  return ct !== undefined && (ct.mediaType === 'application/json' || ct.suffix === '+json');
}

// ---------------------------------------------------------------------------
// Content-Disposition

export interface ContentDisposition {
  /** Lowercased disposition type: `attachment`, `inline`, `form-data`... */
  readonly type: string;
  /** Decoded file name as sent (`filename*` preferred over `filename`); may be unsafe. */
  readonly filename: string | undefined;
  /** File name reduced to a base name and passed through `safeFileName`. */
  readonly safeFilename: string | undefined;
  readonly params: Readonly<Record<string, string>>;
}

/**
 * Parses `Content-Disposition` (RFC 6266), decoding `filename*` (RFC 8187) and producing a
 * sanitized file name candidate for saving.
 * @example parseContentDisposition(`attachment; filename="plain.txt"; filename*=UTF-8''%E2%82%AC.txt`)?.filename // => '€.txt'
 */
export function parseContentDisposition(value: string | null | undefined): ContentDisposition | undefined {
  if (typeof value !== 'string') return undefined;
  checkLength(value, MAX_HEADER);
  const sc = new Scanner(value.trim());
  const type = sc.token().toLowerCase();
  if (type === '') return undefined;
  const params = toRecord(parseParams(sc, false));
  const ext = params['filename*'] === undefined ? undefined : decodeExtValue(params['filename*']);
  const filename = ext ?? params.filename;
  let safe: string | undefined;
  if (filename !== undefined) {
    const base = filename.slice(Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\')) + 1);
    safe = safeFileName(base);
  }
  return { type, filename, safeFilename: safe, params };
}

// ---------------------------------------------------------------------------
// Cache-Control

export interface CacheControl {
  readonly maxAge?: number;
  readonly sMaxAge?: number;
  readonly staleWhileRevalidate?: number;
  readonly staleIfError?: number;
  /** `max-stale` without a value is `Infinity`. */
  readonly maxStale?: number;
  readonly minFresh?: number;
  readonly noCache: boolean;
  readonly noStore: boolean;
  readonly noTransform: boolean;
  readonly mustRevalidate: boolean;
  readonly proxyRevalidate: boolean;
  readonly mustUnderstand: boolean;
  readonly private: boolean;
  readonly public: boolean;
  readonly immutable: boolean;
  readonly onlyIfCached: boolean;
  /** Every directive (lowercased) with its value, or `true` when it has none. */
  readonly directives: Readonly<Record<string, string | true>>;
}

const DELTA_MAX = 2_147_483_648; // RFC 9111 section 1.2.2

const delta = (v: string | true | undefined): number | undefined => {
  if (typeof v !== 'string' || !/^\d{1,19}$/.test(v)) return undefined;
  return Math.min(Number(v), DELTA_MAX);
};

/**
 * Parses `Cache-Control` (RFC 9111). Invalid delta-seconds are ignored; values over 2^31 are capped.
 * @example parseCacheControl('public, max-age=3600, stale-while-revalidate=60').maxAge // => 3600
 */
export function parseCacheControl(value: string | null | undefined): CacheControl {
  const d: Record<string, string | true> = {};
  if (typeof value === 'string') {
    checkLength(value, MAX_HEADER);
    const sc = new Scanner(value);
    while (!sc.done) {
      sc.ows();
      const name = sc.token().toLowerCase();
      sc.ows();
      let v: string | true = true;
      if (sc.eat('=')) {
        sc.ows();
        v = sc.value() ?? '';
      }
      if (name !== '' && !isUnsafeKey(name) && !Object.prototype.hasOwnProperty.call(d, name)) d[name] = v;
      sc.skipPast(',');
    }
  }
  const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(d, k);
  const out: { -readonly [K in keyof CacheControl]: CacheControl[K] } = {
    noCache: has('no-cache'),
    noStore: has('no-store'),
    noTransform: has('no-transform'),
    mustRevalidate: has('must-revalidate'),
    proxyRevalidate: has('proxy-revalidate'),
    mustUnderstand: has('must-understand'),
    private: has('private'),
    public: has('public'),
    immutable: has('immutable'),
    onlyIfCached: has('only-if-cached'),
    directives: d,
  };
  const set = (key: 'maxAge' | 'sMaxAge' | 'staleWhileRevalidate' | 'staleIfError' | 'maxStale' | 'minFresh', name: string): void => {
    const n = delta(d[name]);
    if (n !== undefined) out[key] = n;
  };
  set('maxAge', 'max-age');
  set('sMaxAge', 's-maxage');
  set('staleWhileRevalidate', 'stale-while-revalidate');
  set('staleIfError', 'stale-if-error');
  set('minFresh', 'min-fresh');
  if (d['max-stale'] === true) out.maxStale = Infinity;
  else set('maxStale', 'max-stale');
  return out;
}

// ---------------------------------------------------------------------------
// ETags

export interface ETag {
  readonly weak: boolean;
  /** The opaque tag without quotes. */
  readonly tag: string;
}

const isEtagc = (n: number): boolean => n === 0x21 || (n >= 0x23 && n <= 0x7e) || (n >= 0x80 && n <= 0xff);

/**
 * Parses one entity tag (`"abc"` or `W/"abc"`), RFC 9110 section 8.8.3.
 * @example parseETag('W/"v1"') // => { weak: true, tag: 'v1' }
 */
export function parseETag(value: string | null | undefined): ETag | undefined {
  if (typeof value !== 'string' || value.length > 1024) return undefined;
  const s = value.trim();
  const weak = s.startsWith('W/');
  const body = weak ? s.slice(2) : s;
  if (body.length < 2 || !body.startsWith('"') || !body.endsWith('"')) return undefined;
  const tag = body.slice(1, -1);
  for (let i = 0; i < tag.length; i++) if (!isEtagc(tag.charCodeAt(i))) return undefined;
  return { weak, tag };
}

/**
 * Parses an `If-Match` / `If-None-Match` list: `'*'` or entity tags (invalid members skipped).
 * @example parseETagList('"a", W/"b"') // => [{ weak: false, tag: 'a' }, { weak: true, tag: 'b' }]
 */
export function parseETagList(value: string | null | undefined): '*' | ETag[] {
  if (typeof value !== 'string') return [];
  checkLength(value, MAX_HEADER);
  if (value.trim() === '*') return '*';
  const out: ETag[] = [];
  let i = 0;
  while (i < value.length && out.length < 1000) {
    const q1 = value.indexOf('"', i);
    if (q1 < 0) break;
    const q2 = value.indexOf('"', q1 + 1);
    if (q2 < 0) break;
    const weak = value.slice(Math.max(0, q1 - 2), q1) === 'W/';
    const e = parseETag((weak ? 'W/' : '') + value.slice(q1, q2 + 1));
    if (e) out.push(e);
    i = q2 + 1;
  }
  return out;
}

/**
 * Compares entity tags (RFC 9110 section 8.8.3.2). Weak comparison (default) ignores the `W/` flag;
 * strong comparison requires both to be strong. Unparseable tags never match.
 * @example etagMatches('W/"1"', '"1"') // => true
 * @example etagMatches('W/"1"', '"1"', { weak: false }) // => false
 */
export function etagMatches(a: string | ETag | null | undefined, b: string | ETag | null | undefined, options: { readonly weak?: boolean } = {}): boolean {
  const x = typeof a === 'string' || a === null || a === undefined ? parseETag(a) : a;
  const y = typeof b === 'string' || b === null || b === undefined ? parseETag(b) : b;
  if (!x || x.tag !== y?.tag) return false;
  return options.weak !== false || (!x.weak && !y.weak);
}

/**
 * True when `etag` matches an `If-None-Match` (weak) or `If-Match` (`weak: false`) header.
 * @example etagMatchesAny('"a", "b"', '"b"') // => true
 */
export function etagMatchesAny(header: string | null | undefined, etag: string | ETag | null | undefined, options: { readonly weak?: boolean } = {}): boolean {
  const list = parseETagList(header);
  if (list === '*') return etag !== null && etag !== undefined;
  return list.some((e) => etagMatches(e, etag, options));
}

// ---------------------------------------------------------------------------
// Accept-Language

export interface LanguageRange {
  /** Language range as sent (`en-GB`, `*`). */
  readonly tag: string;
  /** Quality 0.001-1. */
  readonly q: number;
}

/**
 * Parses `Accept-Language`, drops `q=0` and malformed entries, and sorts by quality
 * (stable for ties). At most `max` entries (default 50) are read.
 * @example parseAcceptLanguage('fr-CH, fr;q=0.9, en;q=0.8, *;q=0.5') // => [{ tag: 'fr-CH', q: 1 }, { tag: 'fr', q: 0.9 }, { tag: 'en', q: 0.8 }, { tag: '*', q: 0.5 }]
 */
export function parseAcceptLanguage(value: string | null | undefined, max = 50): LanguageRange[] {
  if (typeof value !== 'string') return [];
  checkLength(value, 4096);
  const out: LanguageRange[] = [];
  for (const part of value.split(',').slice(0, max)) {
    const [rawTag = '', ...params] = part.split(';');
    const tag = rawTag.trim();
    if (!/^(?:\*|[a-z]{1,8}(?:-[\da-z]{1,8})*)$/i.test(tag)) continue;
    let q = 1;
    let valid = true;
    for (const p of params) {
      const [k = '', v = ''] = p.split('=').map((x) => x.trim());
      if (k.toLowerCase() !== 'q') continue;
      if (!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(v)) valid = false;
      else q = Number(v);
    }
    if (valid && q > 0) out.push({ tag, q });
  }
  return out.map((e, i) => ({ e, i })).sort((a, b) => b.e.q - a.e.q || a.i - b.i).map(({ e }) => e);
}

// ---------------------------------------------------------------------------
// Link (RFC 8288)

export interface Link {
  /** Target URI (resolved against `baseUrl` when given). */
  readonly uri: string;
  /** Relation types, lowercased (`rel="next last"` -> `['next', 'last']`). */
  readonly rel: readonly string[];
  /** Other parameters (lowercased names; `title*` decoded into `title*`). */
  readonly params: Readonly<Record<string, string>>;
}

export interface LinkHeaderOptions {
  /** Resolve relative targets against this URL. */
  readonly baseUrl?: string;
  /** Maximum links; more throws `HLP_HTTP_TOO_MANY_LINKS`. Default 100. */
  readonly maxLinks?: number;
  /** Maximum header length; longer throws `HLP_HTTP_HEADER_TOO_LONG`. Default 16 384. */
  readonly maxLength?: number;
}

/**
 * Parses a `Link` header (RFC 8288): multiple links, quoted parameters (commas and semicolons
 * inside quotes), multiple relation types, and RFC 8187 `title*`. Malformed links are skipped.
 * @example parseLinkHeader('<https://api.example.com/items?page=2>; rel="next"')[0]?.rel // => ['next']
 */
export function parseLinkHeader(value: string | null | undefined, options: LinkHeaderOptions = {}): Link[] {
  const { baseUrl, maxLinks = 100, maxLength = MAX_HEADER } = options;
  if (typeof value !== 'string') return [];
  checkLength(value, maxLength);
  const sc = new Scanner(value);
  const out: Link[] = [];
  while (!sc.done) {
    sc.ows();
    if (sc.eat(',')) continue;
    if (!sc.eat('<')) {
      sc.skipPast(',');
      continue;
    }
    const end = value.indexOf('>', sc.i);
    if (end < 0) break;
    let uri = value.slice(sc.i, end).trim();
    sc.i = end + 1;
    const params = parseParams(sc, true);
    const record = toRecord(params);
    const title = record['title*'] === undefined ? undefined : decodeExtValue(record['title*']);
    if (title !== undefined) record['title*'] = title;
    const rel = (record.rel ?? '').toLowerCase().split(/[\t ]+/).filter((r) => r !== '');
    if (baseUrl !== undefined) {
      try {
        uri = new URL(uri, baseUrl).href;
      } catch {
        continue;
      }
    }
    if (out.length >= maxLinks) throw new LimitError('HLP_HTTP_TOO_MANY_LINKS', 'The Link header has too many links.', { details: { maxLinks } });
    out.push({ uri, rel, params: record });
  }
  return out;
}

export interface PaginationLinks {
  readonly next?: string;
  readonly prev?: string;
  readonly first?: string;
  readonly last?: string;
}

/**
 * Extracts `next`, `prev` (or `previous`), `first` and `last` targets from a `Link` header.
 * @example getPaginationLinks('<?page=3>; rel="next", <?page=1>; rel="prev"', 'https://api.example.com/items') // => { next: 'https://api.example.com/items?page=3', prev: 'https://api.example.com/items?page=1' }
 */
export function getPaginationLinks(header: string | readonly Link[] | null | undefined, baseUrl?: string): PaginationLinks {
  const links = typeof header === 'string' || header === null || header === undefined ? parseLinkHeader(header, baseUrl === undefined ? {} : { baseUrl }) : header;
  const out: { -readonly [K in keyof PaginationLinks]: string } = {};
  for (const l of links) {
    for (const r of l.rel) {
      const key = r === 'previous' ? 'prev' : r;
      if ((key === 'next' || key === 'prev' || key === 'first' || key === 'last') && out[key] === undefined) out[key] = l.uri;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dates and Retry-After

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IMF_FIXDATE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;
const RFC850 = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/;
const ASCTIME = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) ([A-Z][a-z]{2}) ([\d ]\d) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/;

function utc(year: number, monthName: string, day: number, h: number, m: number, s: number): number | undefined {
  const month = MONTHS.indexOf(monthName);
  if (month < 0 || h > 23 || m > 59 || s > 60) return undefined;
  const t = Date.UTC(year, month, day, h, m, Math.min(s, 59));
  const d = new Date(t);
  return d.getUTCDate() === day && d.getUTCMonth() === month ? t : undefined;
}

/**
 * Parses an HTTP-date (RFC 9110 section 5.6.7): IMF-fixdate, obsolete RFC 850 and asctime formats.
 * Returns epoch milliseconds or `undefined`.
 * @example parseHttpDate('Sun, 06 Nov 1994 08:49:37 GMT') // => 784111777000
 */
export function parseHttpDate(value: string | null | undefined, now: number | Date = Date.now()): number | undefined {
  if (typeof value !== 'string' || value.length > 64) return undefined;
  const s = value.trim();
  let m = IMF_FIXDATE.exec(s);
  if (m) return utc(Number(m[3]), m[2] ?? '', Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]));
  m = RFC850.exec(s);
  if (m) {
    // Two-digit year: a date more than 50 years in the future means the previous century.
    const nowYear = new Date(now).getUTCFullYear();
    let year = Math.floor(nowYear / 100) * 100 + Number(m[3]);
    if (year > nowYear + 50) year -= 100;
    return utc(year, m[2] ?? '', Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]));
  }
  m = ASCTIME.exec(s);
  if (m) return utc(Number(m[6]), m[1] ?? '', Number((m[2] ?? '').trim()), Number(m[3]), Number(m[4]), Number(m[5]));
  return undefined;
}

/**
 * Converts `Retry-After` (delta-seconds or HTTP-date) to a delay in milliseconds, clamped to
 * `0...maxMs` (default one hour). Returns `undefined` when absent or invalid.
 * @example parseRetryAfter('120') // => 120000
 * @example parseRetryAfter('Wed, 21 Oct 2015 07:28:00 GMT', Date.UTC(2015, 9, 21, 7, 27, 0)) // => 60000
 */
export function parseRetryAfter(value: string | null | undefined, now: number | Date = Date.now(), options: { readonly maxMs?: number } = {}): number | undefined {
  const { maxMs = 3_600_000 } = options;
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  if (/^\d{1,12}$/.test(s)) return Math.min(Number(s) * 1000, maxMs);
  const at = parseHttpDate(s, now);
  if (at === undefined) return undefined;
  const nowMs = typeof now === 'number' ? now : now.getTime();
  return Math.min(Math.max(0, at - nowMs), maxMs);
}
