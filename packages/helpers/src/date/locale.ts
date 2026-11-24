/**
 * Locale week conventions and localized weekday/month names via `Intl`.
 */
import { ValidationError } from '../error/index.js';
import { assertIsoWeekday } from './calendar.js';
import { dateTimeFormat } from './intl-cache.js';
import type { IsoWeekday } from './plain-date.js';

/** Locale week conventions (CLDR weekData). */
export interface WeekInfo {
  /** First day of the week, ISO numbering (1 = Monday ... 7 = Sunday). */
  readonly firstDay: IsoWeekday;
  /** Weekend days, ISO numbering, ascending. */
  readonly weekend: readonly IsoWeekday[];
  /** Days of the new year the first week of the year must contain (1-7). */
  readonly minimalDays: number;
}

// Fallback tables: CLDR supplemental weekData as shipped in Chromium 153's ICU (the regions
// where `Intl.Locale#getWeekInfo()` differs from the world default of Monday / Sat-Sun),
// plus CLDR `minDays` (ICU no longer exposes it through `getWeekInfo`). Deprecated region
// codes are omitted. Only used when the engine lacks `getWeekInfo`/`weekInfo`.
function table<T>(regions: string, value: T): Record<string, T> {
  return Object.fromEntries(regions.split(' ').map((r) => [r, value]));
}
const FRI_SAT: readonly IsoWeekday[] = Object.freeze([5, 6]);
const SUN_ONLY: readonly IsoWeekday[] = Object.freeze([7]);
const FIRST_DAY: Readonly<Record<string, IsoWeekday>> = Object.freeze({
  ...table<IsoWeekday>('AG AS BD BR BS BT BW BZ CA CO DM DO ET GT GU HK HN ID IL IN IS JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW', 7),
  ...table<IsoWeekday>('AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY', 6),
  MV: 5,
});
const WEEKEND: Readonly<Record<string, readonly IsoWeekday[]>> = Object.freeze({
  ...table('BH DZ EG IL IQ JO KW LY OM QA SA SD SY YE', FRI_SAT),
  AF: Object.freeze<IsoWeekday[]>([4, 5]),
  IR: Object.freeze<IsoWeekday[]>([5]),
  IN: SUN_ONLY,
  UG: SUN_ONLY,
});

const MIN_DAYS_4 = new Set('AD AN AT AX BE BG CH CZ DE DK EE ES FI FJ FO FR GB GF GG GI GP GR HU IE IM IS IT JE LI LT LU MC MQ NL NO PL RE RU SE SJ SK SM VA'.split(' '));
const DEFAULT_WEEKEND: readonly IsoWeekday[] = Object.freeze([6, 7]);

interface NativeWeekInfo {
  readonly firstDay?: unknown;
  readonly weekend?: unknown;
  readonly minimalDays?: unknown;
}
interface LocaleWithWeekInfo {
  getWeekInfo?: () => NativeWeekInfo;
  readonly weekInfo?: NativeWeekInfo;
}

const isWeekday = (v: unknown): v is IsoWeekday => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 7;

function toLocale(locale: string | undefined): Intl.Locale {
  const tag = locale ?? new Intl.DateTimeFormat().resolvedOptions().locale;
  if (typeof tag !== 'string' || tag.length > 128) throw new ValidationError('HLP_INVALID_LOCALE', 'Invalid locale.');
  try {
    return new Intl.Locale(tag);
  } catch (cause) {
    throw new ValidationError('HLP_INVALID_LOCALE', 'Invalid locale.', { cause });
  }
}

const weekInfoCache = new Map<string, WeekInfo>();

export interface GetWeekInfoOptions {
  /** Use the engine's `getWeekInfo()`/`weekInfo` when present. Default true; false forces the embedded table. */
  readonly useNative?: boolean;
}

/**
 * Week conventions for a locale (default: the runtime locale): first day, weekend days, and
 * minimal days of week 1. Uses `Intl.Locale#getWeekInfo()` (or the older `weekInfo` accessor)
 * when present, otherwise an embedded CLDR table. Locales without a region are maximized
 * (`ar` -> `ar-EG`).
 * @example getWeekInfo('ar-SA') // => { firstDay: 7, weekend: [5, 6], minimalDays: 1 }
 */
export function getWeekInfo(locale?: string, options: GetWeekInfoOptions = {}): WeekInfo {
  const loc = toLocale(locale);
  const useNative = options.useNative ?? true;
  const key = `${loc.toString()}|${String(useNative)}`;
  const hit = weekInfoCache.get(key);
  if (hit) return hit;
  const region = loc.region ?? loc.maximize().region ?? '001';
  let firstDay: IsoWeekday = FIRST_DAY[region] ?? 1;
  let weekend: readonly IsoWeekday[] = WEEKEND[region] ?? DEFAULT_WEEKEND;
  let minimalDays = MIN_DAYS_4.has(region) ? 4 : 1;
  if (useNative) {
    const l = loc as Intl.Locale & LocaleWithWeekInfo;
    let native: NativeWeekInfo | undefined;
    try {
      native = typeof l.getWeekInfo === 'function' ? l.getWeekInfo() : l.weekInfo;
    } catch {
      native = undefined;
    }
    if (native) {
      if (isWeekday(native.firstDay)) firstDay = native.firstDay;
      if (Array.isArray(native.weekend) && native.weekend.every(isWeekday)) weekend = Object.freeze([...native.weekend].sort((a, b) => a - b));
      if (typeof native.minimalDays === 'number' && Number.isInteger(native.minimalDays) && native.minimalDays >= 1 && native.minimalDays <= 7) minimalDays = native.minimalDays;
    }
  }
  const info: WeekInfo = Object.freeze({ firstDay, weekend, minimalDays });
  if (weekInfoCache.size >= 256) weekInfoCache.clear();
  weekInfoCache.set(key, info);
  return info;
}

/** Width of a localized name. */
export type NameStyle = 'long' | 'short' | 'narrow';

export interface NameOptions {
  /** BCP 47 locale; default the runtime locale. */
  readonly locale?: string;
  /** Default `'long'`. */
  readonly style?: NameStyle;
}

// 2024-01-01 was a Monday: day-of-month n (1-7) has ISO weekday n.
const weekdayInstant = (weekday: IsoWeekday): number => Date.UTC(2024, 0, weekday, 12);

/**
 * Localized weekday name.
 * @example weekdayName(1, { locale: 'fr', style: 'long' }) // => 'lundi'
 */
export function weekdayName(weekday: IsoWeekday, options: NameOptions = {}): string {
  assertIsoWeekday(weekday, 'weekday');
  return dateTimeFormat(options.locale, { weekday: options.style ?? 'long', timeZone: 'UTC' }).format(weekdayInstant(weekday));
}

/**
 * Seven localized weekday names starting at `firstDay` (default 1, Monday).
 * @example weekdayNames('en-US', 7, 'short') // => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
 */
export function weekdayNames(locale?: string, firstDay: IsoWeekday = 1, style: NameStyle = 'long'): string[] {
  assertIsoWeekday(firstDay);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(weekdayName((((firstDay - 1 + i) % 7) + 1) as IsoWeekday, locale === undefined ? { style } : { locale, style }));
  return out;
}

export interface MonthNameOptions extends NameOptions {
  /**
   * `'standalone'` (default, for headers and lists) or `'format'` (the form used next to a day
   * number, which differs in, for example, Russian and Polish: "сентября" vs "сентябрь").
   */
  readonly context?: 'standalone' | 'format';
}

/**
 * Localized month name for month 1-12.
 * @example monthName(9, { locale: 'ru', context: 'format' }) // => 'сентября'
 */
export function monthName(month: number, options: MonthNameOptions = {}): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new ValidationError('HLP_DATE_INVALID_MONTH', 'Month must be an integer 1 to 12.');
  const style = options.style ?? 'long';
  const at = Date.UTC(2024, month - 1, 15, 12);
  if (options.context === 'format') {
    const parts = dateTimeFormat(options.locale, { month: style, day: 'numeric', timeZone: 'UTC' }).formatToParts(at);
    const part = parts.find((p) => p.type === 'month');
    if (part) return part.value;
  }
  return dateTimeFormat(options.locale, { month: style, timeZone: 'UTC' }).format(at);
}

/**
 * Twelve localized month names (January first).
 * @example monthNames('de', 'short').slice(0, 3) // => ['Jan', 'Feb', 'Mär']
 * @example monthNames('en').length // => 12
 */
export function monthNames(locale?: string, style: NameStyle = 'long', context: 'standalone' | 'format' = 'standalone'): string[] {
  const out: string[] = [];
  for (let m = 1; m <= 12; m++) out.push(monthName(m, locale === undefined ? { style, context } : { locale, style, context }));
  return out;
}
