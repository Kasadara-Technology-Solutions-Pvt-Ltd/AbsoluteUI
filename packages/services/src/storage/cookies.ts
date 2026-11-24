/**
 * Cookie helpers with secure defaults. JavaScript cannot set or read `HttpOnly` cookies: keep session
 * and auth cookies HttpOnly and set them from the server; use these helpers only for non-sensitive values
 * (preferences, consent state).
 */
import { LimitError, ValidationError } from '@absoluteui/helpers/error';

/** Options for {@link setCookie}. */
export interface CookieOptions {
  /** Lifetime in seconds (integer). Takes precedence over `expires` in browsers. */
  readonly maxAge?: number;
  /** Absolute expiry. Without `maxAge`/`expires` the cookie lasts for the browser session. */
  readonly expires?: Date;
  /** Default `'/'`. */
  readonly path?: string;
  /** Omit (default) for a host-only cookie, which is the safest choice. */
  readonly domain?: string;
  /** Default true. `false` is honoured only on non-HTTPS pages (local development). */
  readonly secure?: boolean;
  /** Default `'Lax'`. `'None'` forces `Secure`. */
  readonly sameSite?: 'Strict' | 'Lax' | 'None';
  /** CHIPS partitioned cookie (forces `Secure`). */
  readonly partitioned?: boolean;
}

/** Browsers cap one cookie (name + value) at about 4096 bytes. */
export const MAX_COOKIE_BYTES = 4096;
const SAME_SITE: readonly string[] = ['Strict', 'Lax', 'None'];
// RFC 6265 token characters.
const NAME_RE = /^[\w!#$%&'*+\-.^`|~]{1,256}$/;

/** Path/domain: 1-1024 chars, no ';', ',' or control characters. */
function validAttr(s: string): boolean {
  if (typeof s !== 'string' || s.length === 0 || s.length > 1024) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f || c === 0x3b || c === 0x2c) return false;
  }
  return true;
}

interface CookieDocument {
  cookie: string;
}
const doc = (): CookieDocument | undefined => {
  const d = (globalThis as { document?: CookieDocument }).document;
  return d && typeof d.cookie === 'string' ? d : undefined;
};

function assertName(name: string): void {
  if (typeof name !== 'string' || !NAME_RE.test(name)) throw new ValidationError('SVC_COOKIE_INVALID_NAME', 'Cookie name contains invalid characters.');
}

function decode(s: string): string | undefined {
  try {
    return decodeURIComponent(s);
  } catch {
    return undefined;
  }
}

/**
 * All readable (non-HttpOnly) cookies as a null-prototype record; `{}` without a document (SSR).
 * The first occurrence of a duplicate name wins (the most specific path, per browsers' ordering).
 * @example getCookies().theme
 */
export function getCookies(): Record<string, string> {
  const out = Object.create(null) as Record<string, string>;
  const d = doc();
  if (!d || d.cookie.length === 0) return out;
  for (const part of d.cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!NAME_RE.test(name) || name in out) continue;
    const value = decode(part.slice(eq + 1).trim());
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/**
 * One cookie's decoded value, or `undefined`.
 * @example const consent = getCookie('consent');
 */
export function getCookie(name: string): string | undefined {
  assertName(name);
  return getCookies()[name];
}

function isHttps(): boolean {
  return (globalThis as { location?: { protocol?: string } }).location?.protocol === 'https:';
}

/**
 * Writes a cookie (value is URI-encoded). Defaults: `Path=/`, `Secure`, `SameSite=Lax`. `__Host-` and
 * `__Secure-` prefixes are validated. `HttpOnly` cannot be set from JavaScript. Returns false without a document (SSR).
 * @example setCookie('theme', 'dark', { maxAge: 60 * 60 * 24 * 365 });
 */
export function setCookie(name: string, value: string, options: CookieOptions = {}): boolean {
  assertName(name);
  if (typeof value !== 'string') throw new ValidationError('SVC_COOKIE_INVALID_VALUE', 'Cookie value must be a string.');
  const { maxAge, expires, path = '/', domain, sameSite = 'Lax', partitioned = false } = options;
  const secure = options.secure !== false || isHttps() || sameSite === 'None' || partitioned || name.startsWith('__Secure-') || name.startsWith('__Host-');
  if (!validAttr(path)) throw new ValidationError('SVC_COOKIE_INVALID_PATH', 'Cookie path contains invalid characters.');
  if (domain !== undefined && !validAttr(domain)) throw new ValidationError('SVC_COOKIE_INVALID_DOMAIN', 'Cookie domain contains invalid characters.');
  if (!SAME_SITE.includes(sameSite)) throw new ValidationError('SVC_COOKIE_INVALID_SAMESITE', 'SameSite must be Strict, Lax or None.');
  if (name.startsWith('__Host-') && (path !== '/' || domain !== undefined)) throw new ValidationError('SVC_COOKIE_HOST_PREFIX', '__Host- cookies require Path=/ and no Domain.');
  if (maxAge !== undefined && !Number.isInteger(maxAge)) throw new ValidationError('SVC_COOKIE_INVALID_MAX_AGE', 'maxAge must be an integer number of seconds.');
  if (expires !== undefined && !(expires instanceof Date && Number.isFinite(expires.getTime()))) throw new ValidationError('SVC_COOKIE_INVALID_EXPIRES', 'expires must be a valid Date.');
  const encoded = encodeURIComponent(value);
  if (name.length + encoded.length + 1 > MAX_COOKIE_BYTES) throw new LimitError('SVC_COOKIE_TOO_LARGE', 'Cookie exceeds the size limit.', { details: { max: MAX_COOKIE_BYTES } });
  const d = doc();
  if (!d) return false;
  let s = `${name}=${encoded}; Path=${path}`;
  if (domain !== undefined) s += `; Domain=${domain}`;
  if (maxAge !== undefined) s += `; Max-Age=${maxAge}`;
  if (expires !== undefined) s += `; Expires=${expires.toUTCString()}`;
  s += `; SameSite=${sameSite}`;
  if (secure) s += '; Secure';
  if (partitioned) s += '; Partitioned';
  d.cookie = s;
  return true;
}

/**
 * Deletes a cookie. `path` and `domain` must match the values it was set with.
 * @example removeCookie('theme');
 */
export function removeCookie(name: string, options: Pick<CookieOptions, 'path' | 'domain' | 'secure' | 'sameSite' | 'partitioned'> = {}): boolean {
  return setCookie(name, '', { ...options, maxAge: 0, expires: new Date(0) });
}
