/**
 * Framework-neutral i18n foundation (SPEC section 17): messages, direction,
 * week info, and Intl-based formatting with cached formatters.
 */
import { getWeekInfo } from '@absoluteui/helpers/date';
import { getCommonConfig, type Direction } from '../config/config.js';
import { configurationError } from '../errors.js';
import type { PlainDate, PlainDateTime, PlainTime, Instant, ZonedDateTime } from '../timezone/types.js';
import { fieldsToEpoch } from '../timezone/engine.js';

export type MessageCatalog = Readonly<Record<string, string>>;

/** component -> locale -> messages */
const catalogs = new Map<string, Map<string, MessageCatalog>>();

/**
 * Register translated messages for a component and locale. Components register
 * their English defaults under "en"; applications add or override other locales.
 */
export function registerMessages(component: string, locale: string, messages: MessageCatalog): void {
  let byLocale = catalogs.get(component);
  if (!byLocale) {
    byLocale = new Map();
    catalogs.set(component, byLocale);
  }
  const canonical = Intl.getCanonicalLocales(locale)[0] ?? locale;
  byLocale.set(canonical, Object.freeze({ ...(byLocale.get(canonical) ?? {}), ...messages }));
}

/** Locale fallback chain, e.g. "pt-BR" -> ["pt-BR", "pt", "en"]. */
export function localeFallbacks(locale: string): string[] {
  const chain: string[] = [];
  const parts = (Intl.getCanonicalLocales(locale)[0] ?? locale).split('-');
  while (parts.length) {
    chain.push(parts.join('-'));
    parts.pop();
  }
  if (!chain.includes('en')) chain.push('en');
  return chain;
}

/**
 * Resolve a message. Placeholders use `{name}` and are replaced with the
 * string form of `params[name]`. Missing keys raise a configuration error
 * instead of silently rendering an unrelated fallback (section 6.4).
 */
export function getMessage(component: string, key: string, params: Readonly<Record<string, string | number>> = {}, locale = getCommonConfig().locale): string {
  const byLocale = catalogs.get(component);
  let template: string | undefined;
  for (const candidate of localeFallbacks(locale)) {
    template = byLocale?.get(candidate)?.[key];
    if (template !== undefined) break;
  }
  if (template === undefined) {
    throw configurationError('I18N_MISSING_MESSAGE', 'Missing localized message.', { component, property: `${component}.${key}` });
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

const RTL_LANGUAGES = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'iw', 'ks', 'ku', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi']);

/** Script direction for a locale. */
export function getLocaleDirection(locale: string): Direction {
  const loc = new Intl.Locale(locale);
  const script = loc.maximize().script;
  if (script && ['Arab', 'Hebr', 'Thaa', 'Syrc', 'Nkoo', 'Adlm', 'Rohg'].includes(script)) return 'rtl';
  return RTL_LANGUAGES.has(loc.language) ? 'rtl' : 'ltr';
}

/** Effective direction: explicit configuration wins over locale inference. */
export function getDirection(): Direction {
  return getCommonConfig().direction;
}

/** First day of week, ISO numbering (1 = Monday ... 7 = Sunday). */
export function getFirstDayOfWeek(locale = getCommonConfig().locale): number {
  // Intl week info with an embedded CLDR fallback, implemented in @absoluteui/helpers (R5 H7).
  return getWeekInfo(locale).firstDay;
}

const formatterCache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();

function cached<T extends Intl.DateTimeFormat | Intl.NumberFormat>(key: string, create: () => T): T {
  let f = formatterCache.get(key) as T | undefined;
  if (!f) {
    f = create();
    formatterCache.set(key, f);
  }
  return f;
}

export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}, locale = getCommonConfig().locale): string {
  return cached(`n|${locale}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(locale, options)).format(value);
}

export function formatCurrency(value: number, currency: string, options: Intl.NumberFormatOptions = {}, locale = getCommonConfig().locale): string {
  return formatNumber(value, { ...options, style: 'currency', currency }, locale);
}

type DateOptions = Omit<Intl.DateTimeFormatOptions, 'timeZone'>;

/** Format a date-only value. Rendered in UTC so the calendar date never shifts. */
export function formatPlainDate(value: PlainDate, options: DateOptions = { dateStyle: 'medium' }, locale = getCommonConfig().locale): string {
  const epoch = fieldsToEpoch(value.year, value.month, value.day, 12);
  return cached(`d|${locale}|UTC|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })).format(epoch);
}

export function formatPlainTime(value: PlainTime, options: DateOptions = { timeStyle: 'short' }, locale = getCommonConfig().locale): string {
  const epoch = fieldsToEpoch(1970, 1, 1, value.hour, value.minute, value.second, value.millisecond);
  return cached(`d|${locale}|UTC|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })).format(epoch);
}

export function formatPlainDateTime(value: PlainDateTime, options: DateOptions = { dateStyle: 'medium', timeStyle: 'short' }, locale = getCommonConfig().locale): string {
  const { date, time } = value;
  const epoch = fieldsToEpoch(date.year, date.month, date.day, time.hour, time.minute, time.second, time.millisecond);
  return cached(`d|${locale}|UTC|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })).format(epoch);
}

/**
 * Format an exact instant in an explicit timezone. Defaults to the configured
 * timezone (UTC unless configured, section 8.1) - never the host machine's zone.
 */
export function formatInstant(value: Instant | ZonedDateTime, options: DateOptions = { dateStyle: 'medium', timeStyle: 'long' }, timeZone?: string, locale = getCommonConfig().locale): string {
  const zone = timeZone ?? (value.kind === 'ZonedDateTime' ? value.timeZone : getCommonConfig().timezone);
  return cached(`d|${locale}|${zone}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(locale, { ...options, timeZone: zone })).format(value.epochMilliseconds);
}

/** Localized timezone display name, e.g. "India Standard Time". */
export function formatTimeZoneName(timeZone: string, style: 'long' | 'short' | 'longOffset' | 'shortOffset' = 'long', at = Date.now(), locale = getCommonConfig().locale): string {
  const parts = cached(`tz|${locale}|${timeZone}|${style}`, () => new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: style })).formatToParts(at);
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
}
