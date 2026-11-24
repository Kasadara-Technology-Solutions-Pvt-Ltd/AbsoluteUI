/**
 * URL helpers: query strings (prototype-safe, bounded), safe path joining, scheme allow-lists,
 * same-origin and open-redirect guards (docs/PLAN-HELPERS.md section 2, section 5).
 * Data URLs live in the `encoding` module.
 */
import { LimitError, ValidationError } from '../error/index.js';
import { hasOwn, isUnsafeKey } from '../internal/keys.js';

/** A single query value. `undefined` is always skipped; `null` becomes an empty value unless `skipNull`. */
export type QueryPrimitive = string | number | boolean | bigint | Date | null | undefined;
/** Values accepted by `buildQuery`: primitives, arrays of primitives, and nested objects (bracket notation). */
export type QueryInputValue = QueryPrimitive | readonly QueryPrimitive[] | QueryInput;
export interface QueryInput {
  readonly [key: string]: QueryInputValue;
}

/** Parsed query value. */
export type QueryValue = string | string[] | QueryObject;
/** Null-prototype object returned by `parseQuery`. */
export interface QueryObject {
  [key: string]: QueryValue;
}

export type ArrayFormat = 'repeat' | 'brackets' | 'comma';

export interface BuildQueryOptions {
  /** `repeat`: `a=1&a=2` (default); `brackets`: `a[]=1&a[]=2`; `comma`: `a=1,2`. */
  readonly arrayFormat?: ArrayFormat;
  /** Skip `null` values instead of emitting `key=`. Default false. */
  readonly skipNull?: boolean;
  /** Sort keys (code-unit order) for stable output. Default false. */
  readonly sort?: boolean;
  /** Prefix the result with `?` when it is not empty. Default false. */
  readonly prefix?: boolean;
}

const enc = encodeURIComponent;
const MAX_BUILD_DEPTH = 32;

function stringifyPrimitive(v: Exclude<QueryPrimitive, null | undefined>): string {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) throw new ValidationError('HLP_URL_INVALID_DATE', 'A query value is an invalid date.');
    return v.toISOString();
  }
  return String(v);
}

const isQueryInput = (v: QueryInputValue): v is QueryInput => typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);

/**
 * Builds a query string (without `?` unless `prefix`). Spaces encode as `%20`.
 * Nested objects use bracket notation. Unsafe keys (`__proto__`, ...) throw `HLP_UNSAFE_KEY`.
 * @example
 * buildQuery({ q: 'a b', tag: ['x', 'y'], page: 2 }); // => 'q=a%20b&tag=x&tag=y&page=2'
 * buildQuery({ tag: ['x', 'y'] }, { arrayFormat: 'comma' }); // => 'tag=x,y'
 */
export function buildQuery(params: QueryInput, options: BuildQueryOptions = {}): string {
  const { arrayFormat = 'repeat', skipNull = false, sort = false } = options;
  const out: string[] = [];
  const walk = (obj: QueryInput, prefix: string, depth: number): void => {
    if (depth > MAX_BUILD_DEPTH) throw new LimitError('HLP_URL_TOO_DEEP', 'Query nesting exceeds the limit.');
    const keys = Object.keys(obj);
    if (sort) keys.sort();
    for (const k of keys) {
      if (isUnsafeKey(k)) throw new ValidationError('HLP_UNSAFE_KEY', 'Refusing to use an unsafe object key.');
      const v = obj[k];
      const key = prefix === '' ? enc(k) : `${prefix}%5B${enc(k)}%5D`;
      if (v === undefined) continue;
      if (v === null) {
        if (!skipNull) out.push(`${key}=`);
        continue;
      }
      if (Array.isArray(v)) {
        const items = (v as readonly QueryPrimitive[]).filter((x): x is Exclude<QueryPrimitive, undefined> => x !== undefined && !(skipNull && x === null));
        if (arrayFormat === 'comma') {
          if (items.length) out.push(`${key}=${items.map((x) => (x === null ? '' : enc(stringifyPrimitive(x)))).join(',')}`);
        } else {
          const k2 = arrayFormat === 'brackets' ? `${key}%5B%5D` : key;
          for (const x of items) out.push(`${k2}=${x === null ? '' : enc(stringifyPrimitive(x))}`);
        }
        continue;
      }
      if (isQueryInput(v)) {
        walk(v, key, depth + 1);
        continue;
      }
      out.push(`${key}=${enc(stringifyPrimitive(v as Exclude<QueryPrimitive, null | undefined>))}`);
    }
  };
  walk(params, '', 0);
  const s = out.join('&');
  return options.prefix === true && s ? `?${s}` : s;
}

export interface ParseQueryOptions {
  /** `comma` additionally splits values on `,`. Repeated keys and `a[]` always produce arrays. Default `repeat`. */
  readonly arrayFormat?: ArrayFormat;
  /** Maximum number of parameters. Default 1000; exceeding throws `HLP_URL_TOO_MANY_PARAMS`. */
  readonly maxParams?: number;
  /** Maximum bracket nesting (`a[b][c]` is 2). Default 5; exceeding throws `HLP_URL_TOO_DEEP`. */
  readonly maxDepth?: number;
  /** Maximum input length in characters. Default 65 536; exceeding throws `HLP_URL_QUERY_TOO_LONG`. */
  readonly maxLength?: number;
}

function decodeComponent(s: string): string {
  const plus = s.includes('+') ? s.replaceAll('+', ' ') : s;
  if (!plus.includes('%')) return plus;
  try {
    return decodeURIComponent(plus);
  } catch {
    return plus;
  }
}

/** Splits `a[b][]` into `['a', 'b', '']`; returns `[key]` when the brackets are malformed. */
function splitKey(key: string): string[] {
  const open = key.indexOf('[');
  if (open <= 0 || !key.endsWith(']')) return [key];
  const parts = [key.slice(0, open)];
  let i = open;
  while (i < key.length) {
    if (key.charCodeAt(i) !== 0x5b) return [key];
    const close = key.indexOf(']', i + 1);
    if (close < 0) return [key];
    const seg = key.slice(i + 1, close);
    if (seg.includes('[')) return [key];
    parts.push(seg);
    i = close + 1;
  }
  return parts;
}

const nullObject = (): QueryObject => Object.create(null) as QueryObject;

/**
 * Parses a query string (leading `?` optional; `+` decodes as a space) into null-prototype objects.
 * Supports repeated keys, `a[]=` arrays and `a[b][c]=` nesting. Parameters with unsafe keys
 * (`__proto__`, `constructor`, `prototype`) are dropped; conflicting shapes keep the first value.
 * @example
 * parseQuery('?q=a+b&tag=x&tag=y&user[name]=Ann'); // => { q: 'a b', tag: ['x', 'y'], user: { name: 'Ann' } }
 */
export function parseQuery(qs: string, options: ParseQueryOptions = {}): QueryObject {
  const { arrayFormat = 'repeat', maxParams = 1000, maxDepth = 5, maxLength = 65_536 } = options;
  if (qs.length > maxLength) throw new LimitError('HLP_URL_QUERY_TOO_LONG', 'The query string exceeds the length limit.');
  const result = nullObject();
  let s = qs.startsWith('?') ? qs.slice(1) : qs;
  const hash = s.indexOf('#');
  if (hash >= 0) s = s.slice(0, hash);
  if (s === '') return result;
  let count = 0;
  for (const pair of s.split('&')) {
    if (pair === '') continue;
    if (++count > maxParams) throw new LimitError('HLP_URL_TOO_MANY_PARAMS', 'The query string has too many parameters.');
    const eq = pair.indexOf('=');
    const rawKey = decodeComponent(eq < 0 ? pair : pair.slice(0, eq));
    const rawVal = eq < 0 ? '' : decodeComponent(pair.slice(eq + 1));
    if (rawKey === '') continue;
    const path = splitKey(rawKey);
    if (path.length - 1 > maxDepth) throw new LimitError('HLP_URL_TOO_DEEP', 'Query nesting exceeds the limit.');
    if (path.some(isUnsafeKey)) continue;
    // `[]` is only valid as the final segment.
    if (path.slice(1, -1).includes('')) continue;
    const isPush = path.length > 1 && path[path.length - 1] === '';
    const keys = isPush ? path.slice(0, -1) : path;
    const values = arrayFormat === 'comma' && eq >= 0 ? pair.slice(eq + 1).split(',').map(decodeComponent) : [rawVal];
    let target: QueryObject = result;
    let ok = true;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i] ?? '';
      const next = hasOwn(target, k) ? target[k] : undefined;
      if (next === undefined) {
        const o = nullObject();
        target[k] = o;
        target = o;
      } else if (typeof next === 'object' && !Array.isArray(next)) {
        target = next;
      } else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const last = keys[keys.length - 1] ?? '';
    const existing = hasOwn(target, last) ? target[last] : undefined;
    const forceArray = isPush || values.length > 1;
    if (existing === undefined) {
      target[last] = forceArray ? values : (values[0] ?? '');
    } else if (typeof existing === 'string') {
      target[last] = [existing, ...values];
    } else if (Array.isArray(existing)) {
      existing.push(...values);
    }
    // existing object: shape conflict, keep the first.
  }
  return result;
}

// ---------------------------------------------------------------------------
// Paths

export interface JoinUrlOptions {
  /**
   * Resolve `.` and `..` in the joined segments and throw `HLP_URL_PATH_TRAVERSAL` if they would
   * climb above the base path. Also treats `\` and encoded dots (`%2e`) as traversal. Default false.
   */
  readonly confine?: boolean;
}

function splitSuffix(url: string): [string, string] {
  const q = url.search(/[?#]/);
  return q < 0 ? [url, ''] : [url.slice(0, q), url.slice(q)];
}

/** Splits `scheme://authority` (or `//authority`) from the path. */
function splitAuthority(url: string): [string, string] {
  const m = /^(?:[a-z][\d+.a-z-]*:)?\/\/[^/]*/i.exec(url);
  if (m) return [m[0], url.slice(m[0].length)];
  const scheme = /^[a-z][\d+.a-z-]*:/i.exec(url);
  if (scheme) return [scheme[0], url.slice(scheme[0].length)];
  return ['', url];
}

/**
 * Joins a base URL and path segments with exactly one `/` between parts. Keeps the base's
 * protocol, authority, query and fragment. Pass `{ confine: true }` last to block `..` escapes.
 * Segments are not encoded: use `encodePathSegment` for untrusted values.
 * @example
 * joinUrl('https://api.example.com/v1/', '/users/', 42); // => 'https://api.example.com/v1/users/42'
 * joinUrl('/files', '../etc', { confine: true }); // => throws HLP_URL_PATH_TRAVERSAL
 */
export function joinUrl(base: string, ...parts: readonly (string | number | JoinUrlOptions)[]): string {
  const last = parts[parts.length - 1];
  const options: JoinUrlOptions = typeof last === 'object' ? last : {};
  const segments = parts.filter((p): p is string | number => typeof p !== 'object');
  const [beforeSuffix, suffix] = splitSuffix(base);
  const [authority, basePath] = splitAuthority(beforeSuffix);
  const confine = options.confine === true;
  const baseSegs = basePath.split('/').filter((s) => s !== '');
  const added: string[] = [];
  let trailing = basePath.endsWith('/');
  for (const seg of segments) {
    let str = String(seg);
    if (confine) str = str.replaceAll('\\', '/');
    const pieces = str.split('/');
    for (const p of pieces) {
      if (p === '') continue;
      if (confine) {
        const decoded = p.toLowerCase().replaceAll('%2e', '.');
        if (decoded === '.') continue;
        if (decoded === '..') {
          if (added.length === 0) throw new ValidationError('HLP_URL_PATH_TRAVERSAL', 'The path escapes the base URL.');
          added.pop();
          continue;
        }
      }
      added.push(p);
    }
    if (str !== '') trailing = str.endsWith('/');
  }
  const path = [...baseSegs, ...added].join('/');
  const leading = authority !== '' || basePath.startsWith('/') ? '/' : '';
  let out = authority + (path === '' ? (leading && authority === '' ? '/' : '') : leading + path);
  if (trailing && out !== '' && !out.endsWith('/')) out += '/';
  return out + suffix;
}

/**
 * Percent-encodes one path segment, including `/`, `?`, `#`; `.` and `..` are encoded so they cannot traverse.
 * @example
 * encodePathSegment('a/b c'); // => 'a%2Fb%20c'
 * encodePathSegment('..'); // => '%2E%2E'
 */
export function encodePathSegment(segment: string | number): string {
  const s = String(segment);
  if (s === '.' || s === '..') return s.replaceAll('.', '%2E');
  return encodeURIComponent(s);
}

// ---------------------------------------------------------------------------
// Query editing

interface SplitUrl {
  readonly head: string;
  readonly query: string;
  readonly hash: string;
}
function splitUrl(url: string): SplitUrl {
  const h = url.indexOf('#');
  const hash = h < 0 ? '' : url.slice(h);
  const noHash = h < 0 ? url : url.slice(0, h);
  const q = noHash.indexOf('?');
  return q < 0 ? { head: noHash, query: '', hash } : { head: noHash.slice(0, q), query: noHash.slice(q + 1), hash };
}

function pairKey(pair: string): string {
  const eq = pair.indexOf('=');
  return decodeComponent(eq < 0 ? pair : pair.slice(0, eq));
}

const matchesKey = (decoded: string, key: string): boolean => decoded === key || decoded.startsWith(`${key}[`);

/**
 * Returns `url` with `params` set: existing keys named in `params` are replaced, others kept;
 * an `undefined` value removes the key. Works with relative URLs and keeps the fragment.
 * @example
 * withQuery('/list?page=1&q=x#top', { page: 2 }); // => '/list?q=x&page=2#top'
 */
export function withQuery(url: string, params: QueryInput, options: BuildQueryOptions = {}): string {
  const { head, query, hash } = splitUrl(url);
  const names = Object.keys(params);
  const kept = query.split('&').filter((p) => p !== '' && !names.some((n) => matchesKey(pairKey(p), n)));
  const added = buildQuery(params, { ...options, prefix: false });
  const q = [...kept, ...(added ? [added] : [])].join('&');
  return head + (q ? `?${q}` : '') + hash;
}

/**
 * Removes the given query keys (or the whole query when `keys` is omitted). Keeps the fragment.
 * @example
 * removeQuery('/a?x=1&y=2', ['x']); // => '/a?y=2'
 * removeQuery('/a?x=1#f'); // => '/a#f'
 */
export function removeQuery(url: string, keys?: readonly string[]): string {
  const { head, query, hash } = splitUrl(url);
  if (keys === undefined) return head + hash;
  const kept = query.split('&').filter((p) => p !== '' && !keys.some((k) => matchesKey(pairKey(p), k)));
  return head + (kept.length ? `?${kept.join('&')}` : '') + hash;
}

/**
 * First value of a query parameter, decoded; `undefined` when absent.
 * @example
 * getQueryParam('https://x.test/?a=1&a=2', 'a'); // => '1'
 */
export function getQueryParam(url: string, key: string): string | undefined {
  const { query } = splitUrl(url);
  for (const pair of query.split('&')) {
    if (pair === '') continue;
    const eq = pair.indexOf('=');
    if (decodeComponent(eq < 0 ? pair : pair.slice(0, eq)) === key) return eq < 0 ? '' : decodeComponent(pair.slice(eq + 1));
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Safety

// C0 controls, DEL, and whitespace that browsers strip or tolerate inside URLs.
// eslint-disable-next-line no-control-regex -- intentional: detect control characters.
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\ufeff]/;
const SCHEME_RE = /^([a-z][\d+.a-z-]*):/i;
const PROBE_BASE = 'https://probe.invalid/';

export interface IsSafeUrlOptions {
  /** Lowercase schemes without `:`. Default `['http', 'https', 'mailto', 'tel']`. */
  readonly allowedSchemes?: readonly string[];
  /** Accept relative URLs (`/a`, `a/b`, `?q`, `#f`, `//host/a`). Default true. */
  readonly allowRelative?: boolean;
  /** Maximum length. Default 8192. */
  readonly maxLength?: number;
}

/**
 * True when `url` is safe to put in `href`/`src`: scheme on the allow-list (rejects `javascript:`,
 * `data:`, `vbscript:`), no control characters (blocks `java\tscript:`), and parseable.
 * @example
 * isSafeUrl('https://example.com'); // => true
 * isSafeUrl(' JaVa\tScRiPt:alert(1)'); // => false
 */
export function isSafeUrl(url: string, options: IsSafeUrlOptions = {}): boolean {
  const { allowedSchemes = ['http', 'https', 'mailto', 'tel'], allowRelative = true, maxLength = 8192 } = options;
  if (url.length > maxLength || CONTROL_RE.test(url)) return false;
  const s = url.trim();
  if (s === '') return false;
  const allowed = allowedSchemes.map((x) => x.toLowerCase());
  const m = SCHEME_RE.exec(s);
  let parsed: URL;
  try {
    parsed = new URL(s, PROBE_BASE);
  } catch {
    return false;
  }
  const protocol = parsed.protocol.slice(0, -1).toLowerCase();
  if (m) return allowed.includes((m[1] ?? '').toLowerCase()) && allowed.includes(protocol);
  if (!allowRelative) return false;
  // Relative input must still resolve to an allowed scheme (the probe base is https).
  return allowed.includes(protocol);
}

/**
 * True for URLs with a scheme (`https:`, `mailto:`); protocol-relative `//host` is not absolute.
 * @example
 * isAbsoluteUrl('https://a.test'); // => true
 * isAbsoluteUrl('/a'); // => false
 */
export function isAbsoluteUrl(url: string): boolean {
  return SCHEME_RE.test(url.trim());
}

/**
 * Parses a URL, returning `undefined` instead of throwing.
 * @example
 * parseUrl('not a url'); // => undefined
 * parseUrl('/a', 'https://x.test')?.href; // => 'https://x.test/a'
 */
export function parseUrl(url: string | URL, base?: string | URL): URL | undefined {
  try {
    return base === undefined ? new URL(url) : new URL(url, base);
  } catch {
    return undefined;
  }
}

/**
 * True when both absolute URLs have the same origin (scheme, host, port). Opaque origins never match.
 * @example
 * isSameOrigin('https://a.test/x', 'https://A.test:443/y'); // => true
 */
export function isSameOrigin(a: string | URL, b: string | URL): boolean {
  const x = parseUrl(a);
  const y = parseUrl(b);
  if (!x || !y || x.origin === 'null' || y.origin === 'null') return false;
  return x.origin === y.origin;
}

export interface SafeRedirectOptions {
  /** Absolute origins that may be redirected to (for example `['https://app.example.com']`). Default none. */
  readonly allowedOrigins?: readonly string[];
  /** Returned when `target` is unsafe. Default `'/'`. */
  readonly fallback?: string;
}

/**
 * Open-redirect guard. Accepts same-site paths starting with a single `/` and absolute
 * http(s) URLs whose origin is allowed; rejects `//evil.com`, `/\evil.com`, schemes, and control characters.
 * @example
 * safeRedirectTarget('/dashboard?tab=1'); // => '/dashboard?tab=1'
 * safeRedirectTarget('//evil.com'); // => '/'
 */
export function safeRedirectTarget(target: string | null | undefined, options: SafeRedirectOptions = {}): string {
  const fallback = options.fallback ?? '/';
  if (typeof target !== 'string' || target.length > 8192 || CONTROL_RE.test(target)) return fallback;
  const s = target.trim();
  if (s === '' || s.includes('\\')) return fallback;
  if (s.startsWith('/')) {
    if (s.startsWith('//')) return fallback;
    const u = parseUrl(s, PROBE_BASE);
    if (u?.origin !== new URL(PROBE_BASE).origin) return fallback;
    return s;
  }
  const u = parseUrl(s);
  if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:') || u.username !== '' || u.password !== '') return fallback;
  const allowed = (options.allowedOrigins ?? []).map((o) => parseUrl(o)?.origin).filter((o): o is string => o !== undefined && o !== 'null');
  return allowed.includes(u.origin) ? u.href : fallback;
}

export interface NormalizeUrlOptions {
  /** Sort query parameters by key (stable). Default false. */
  readonly sortQuery?: boolean;
  /** Drop the `#fragment`. Default false. */
  readonly removeFragment?: boolean;
  /** Drop a trailing `/` from non-root paths. Default false. */
  readonly removeTrailingSlash?: boolean;
}

/**
 * Normalizes an absolute URL: lowercase scheme and host, default port removed, dot segments resolved,
 * plus optional query sort and fragment removal. Returns `undefined` when unparseable.
 * @example
 * normalizeUrl('HTTPS://Example.COM:443/a/../b?z=1&a=2#x', { sortQuery: true, removeFragment: true });
 * // 'https://example.com/b?a=2&z=1'
 */
export function normalizeUrl(url: string, options: NormalizeUrlOptions = {}): string | undefined {
  const u = parseUrl(url.trim());
  if (!u) return undefined;
  if (options.removeFragment === true) u.hash = '';
  if (options.removeTrailingSlash === true) {
    let p = u.pathname;
    while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    u.pathname = p;
  }
  let query = u.search.slice(1);
  if (options.sortQuery === true && query) {
    const pairs = query.split('&').filter((p) => p !== '');
    query = pairs
      .map((p, i) => ({ p, i, k: pairKey(p) }))
      .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i))
      .map((x) => x.p)
      .join('&');
  }
  u.search = query ? `?${query}` : '';
  return u.href;
}

/**
 * Hostname of an absolute URL (lowercase, no port); `undefined` when unparseable.
 * @example
 * getDomain('https://Sub.Example.com:8080/x'); // => 'sub.example.com'
 */
export function getDomain(url: string): string | undefined {
  const u = parseUrl(url.trim());
  return u && u.hostname !== '' ? u.hostname : undefined;
}

/**
 * Last path segment, percent-decoded; `undefined` when the path ends with `/`. Works for relative URLs.
 * @example
 * getFileNameFromUrl('https://x.test/files/report%202026.pdf?v=1'); // => 'report 2026.pdf'
 */
export function getFileNameFromUrl(url: string): string | undefined {
  const u = parseUrl(url.trim(), PROBE_BASE);
  if (!u) return undefined;
  const seg = u.pathname.slice(u.pathname.lastIndexOf('/') + 1);
  if (seg === '') return undefined;
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

/**
 * Lowercase file extension without the dot, from a URL or path; `undefined` when none (dotfiles have none).
 * @example
 * getExtension('/a/photo.JPG?x=1'); // => 'jpg'
 * getExtension('.env'); // => undefined
 */
export function getExtension(urlOrPath: string): string | undefined {
  const name = getFileNameFromUrl(urlOrPath.replaceAll('\\', '/'));
  if (name === undefined) return undefined;
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return undefined;
  return name.slice(dot + 1).toLowerCase();
}
