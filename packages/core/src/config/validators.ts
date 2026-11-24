/** Reusable option validators. Each returns a type guard and never inspects values beyond type/range checks. */

export type Guard<T> = (value: unknown) => value is T;

export const isBoolean: Guard<boolean> = (v): v is boolean => typeof v === 'boolean';

export const isString: Guard<string> = (v): v is string => typeof v === 'string';

export const isNonEmptyString: Guard<string> = (v): v is string => typeof v === 'string' && v.trim().length > 0;

export function oneOf<const T extends readonly (string | number | boolean)[]>(values: T): Guard<T[number]> {
  return (v): v is T[number] => values.includes(v as T[number]);
}

export function integerInRange(min: number, max: number): Guard<number> {
  return (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

export function numberInRange(min: number, max: number): Guard<number> {
  return (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

export function nullable<T>(guard: Guard<T>): Guard<T | null> {
  return (v): v is T | null => v === null || guard(v);
}

/** Valid, canonicalizable BCP 47 locale tag. */
export const isLocale: Guard<string> = (v): v is string => {
  if (typeof v !== 'string' || v.length === 0) return false;
  try {
    return Intl.getCanonicalLocales(v).length === 1;
  } catch {
    return false;
  }
};

const timeZoneCache = new Map<string, boolean>();

/** IANA timezone identifier (or "UTC") supported by the host Intl implementation. */
export const isTimeZone: Guard<string> = (v): v is string => {
  if (typeof v !== 'string' || v.length === 0 || v.length > 64) return false;
  const cached = timeZoneCache.get(v);
  if (cached !== undefined) return cached;
  let ok: boolean;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v });
    ok = true;
  } catch {
    ok = false;
  }
  timeZoneCache.set(v, ok);
  return ok;
};

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
