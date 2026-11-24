/**
 * Internal bounded caches for `Intl` formatters, shared by the date, timezone, and duration
 * modules. Construction errors (bad locale or options) become `HLP_INTL_INVALID_OPTIONS`.
 */
import { ValidationError } from '../error/index.js';

const MAX_ENTRIES = 128;
const caches = new Map<string, Map<string, unknown>>();

/** Returns a cached instance for `kind|locale|options`, creating it with `create` on a miss. */
export function cachedIntl<T>(kind: string, locale: string | undefined, options: object, create: () => T): T {
  let cache = caches.get(kind);
  if (!cache) {
    cache = new Map();
    caches.set(kind, cache);
  }
  const key = `${locale ?? ''}|${JSON.stringify(options)}`;
  const hit = cache.get(key) as T | undefined;
  if (hit !== undefined) return hit;
  let created: T;
  try {
    created = create();
  } catch (cause) {
    throw new ValidationError('HLP_INTL_INVALID_OPTIONS', 'Invalid locale or formatting options.', { cause });
  }
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, created);
  return created;
}

/** Cached `Intl.DateTimeFormat`. */
export function dateTimeFormat(locale: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return cachedIntl('dtf', locale, options, () => new Intl.DateTimeFormat(locale, options));
}

/** Cached `Intl.NumberFormat`. */
export function numberFormat(locale: string | undefined, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  return cachedIntl('nf', locale, options, () => new Intl.NumberFormat(locale, options));
}

/** Cached `Intl.ListFormat`. */
export function listFormat(locale: string | undefined, options: Intl.ListFormatOptions): Intl.ListFormat {
  return cachedIntl('lf', locale, options, () => new Intl.ListFormat(locale, options));
}

/** Cached `Intl.RelativeTimeFormat`. */
export function relativeTimeFormat(locale: string | undefined, options: Intl.RelativeTimeFormatOptions): Intl.RelativeTimeFormat {
  return cachedIntl('rtf', locale, options, () => new Intl.RelativeTimeFormat(locale, options));
}
