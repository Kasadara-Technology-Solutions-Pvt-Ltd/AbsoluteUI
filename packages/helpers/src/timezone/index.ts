/**
 * `@absoluteui/helpers/timezone` (docs/PLAN-HELPERS.md section 2): wall-clock time <-> instant in IANA
 * zones via `Intl`, offsets, explicit DST disambiguation, transitions, zone lists and names.
 * Instants are epoch milliseconds (`InstantInput` also accepts a `Date`). The optional
 * `timeZone` parameter defaults to the runtime zone. No IANA data is bundled: accuracy follows
 * the runtime's ICU. The engine lives in `date/zone.ts` so the date module can use it without
 * an import cycle; this module is its public face.
 */
import { ValidationError } from '../error/index.js';
import { formatPlainDateTime, plainDate, toEpochDay, type InstantInput, type PlainDateTime } from '../date/index.js';
import { dateTimeFormat } from '../date/intl-cache.js';
import { parseOffsetText } from '../date/plain-time.js';
import { instantToZoned, isValidTimeZone, offsetAtMs, resolveTimeZone, toEpochMs, zonedToInstant, type ZonedToInstantOptions } from '../date/zone.js';

export { getLocalTimeZone, isValidTimeZone, offsetAt, instantToZoned, getPossibleInstants, getWallTimeStatus, zonedToInstant, nextTransition, previousTransition } from '../date/zone.js';
export type { Disambiguation, ZonedToInstantOptions, TransitionSearchOptions } from '../date/zone.js';

/**
 * Formats an offset in milliseconds as `+/-HH:MM` (with `:SS` when seconds are non-zero, as for
 * historic local mean time). Rounds to whole seconds; zero is `+00:00`.
 * @example formatOffset(19_800_000) // => '+05:30'
 */
export function formatOffset(offsetMs: number): string {
  if (!Number.isFinite(offsetMs)) throw new ValidationError('HLP_TZ_INVALID_OFFSET', 'Offset must be a finite number.');
  const total = Math.round(offsetMs / 1000);
  const abs = Math.abs(total);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${total < 0 ? '-' : '+'}${p(h)}:${p(m)}${s ? `:${p(s)}` : ''}`;
}

/**
 * Parses `Z` or `+/-HH:MM[:SS]` to milliseconds; `undefined` when invalid.
 * @example parseOffset('-04:00') // => -14400000
 */
export function parseOffset(text: string): number | undefined {
  return parseOffsetText(text);
}

/**
 * Converts a wall-clock time in one zone to the wall-clock time in another.
 * @example
 * import { plainDateTime, plainTime } from '@absoluteui/helpers/date';
 * convertWallTime(plainDateTime('2026-09-29', plainTime(9, 0)), 'Asia/Kolkata', 'America/New_York'); // => '2026-09-28T23:30:00'
 */
export function convertWallTime(dateTime: PlainDateTime, fromTimeZone: string, toTimeZone: string, options: ZonedToInstantOptions = {}): PlainDateTime {
  return instantToZoned(zonedToInstant(dateTime, fromTimeZone, options), toTimeZone);
}

// Used only when `Intl.supportedValuesOf` is missing (engines before 2022).
const FALLBACK_ZONES: readonly string[] = Object.freeze([
  'UTC', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi', 'America/Anchorage', 'America/Bogota', 'America/Chicago',
  'America/Denver', 'America/Halifax', 'America/Los_Angeles', 'America/Mexico_City', 'America/New_York', 'America/Phoenix', 'America/Santiago',
  'America/Sao_Paulo', 'America/St_Johns', 'America/Toronto', 'Asia/Bangkok', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta',
  'Asia/Jerusalem', 'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Riyadh', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore',
  'Asia/Tehran', 'Asia/Tokyo', 'Atlantic/Reykjavik', 'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Lord_Howe', 'Australia/Perth',
  'Australia/Sydney', 'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Istanbul', 'Europe/London', 'Europe/Madrid', 'Europe/Moscow', 'Europe/Paris',
  'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Honolulu',
]);

// ICU (and so `Intl.supportedValuesOf`) still reports some pre-2014 CLDR identifiers; IANA's
// current names are what users expect to see and search for.
const MODERN_NAMES: Readonly<Record<string, string>> = Object.freeze({
  'Africa/Asmera': 'Africa/Asmara', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires', 'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Coral_Harbour': 'America/Atikokan', 'America/Cordoba': 'America/Argentina/Cordoba', 'America/Godthab': 'America/Nuuk',
  'America/Indianapolis': 'America/Indiana/Indianapolis', 'America/Jujuy': 'America/Argentina/Jujuy', 'America/Louisville': 'America/Kentucky/Louisville',
  'America/Mendoza': 'America/Argentina/Mendoza', 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Atlantic/Faeroe': 'Atlantic/Faroe', 'Europe/Kiev': 'Europe/Kyiv', 'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Ponape': 'Pacific/Pohnpei', 'Pacific/Truk': 'Pacific/Chuuk',
});

/**
 * Zone identifiers the runtime supports (`Intl.supportedValuesOf('timeZone')`), otherwise a
 * small fallback list of common zones. Legacy ICU names are replaced by current IANA names
 * (`Asia/Calcutta` -> `Asia/Kolkata`) when the runtime accepts them, unless `modernNames: false`.
 * Always includes `UTC`. Sorted, without duplicates.
 * @example listTimeZones().includes('Asia/Kolkata') // => true
 */
export function listTimeZones(options: { readonly modernNames?: boolean } = {}): string[] {
  const intl = Intl as { supportedValuesOf?: (key: 'timeZone') => string[] };
  let zones: string[];
  try {
    zones = typeof intl.supportedValuesOf === 'function' ? intl.supportedValuesOf('timeZone') : [...FALLBACK_ZONES];
  } catch {
    zones = [...FALLBACK_ZONES];
  }
  if (options.modernNames ?? true) {
    zones = zones.map((z) => {
      const modern = Object.prototype.hasOwnProperty.call(MODERN_NAMES, z) ? MODERN_NAMES[z] : undefined;
      return modern !== undefined && isValidTimeZone(modern) ? modern : z;
    });
  }
  zones.push('UTC');
  return [...new Set(zones)].sort();
}

export interface TimeZoneNameOptions {
  readonly locale?: string;
  /** Default `'long'` ("India Standard Time"); `'longGeneric'` omits standard/daylight ("Pacific Time"). */
  readonly style?: 'long' | 'short' | 'shortOffset' | 'longOffset' | 'shortGeneric' | 'longGeneric';
  /** Instant whose standard/daylight name to use. Default now. */
  readonly at?: InstantInput;
}

/**
 * Localized display name of a zone.
 * @example timeZoneName('Asia/Kolkata', { locale: 'en' }) // => 'India Standard Time'
 * @example
 * timeZoneName('America/New_York', { locale: 'en', at: Date.UTC(2026, 6, 1) }); // => 'Eastern Daylight Time'
 * timeZoneName('America/New_York', { locale: 'en', style: 'longGeneric', at: Date.UTC(2026, 0, 1) }); // => 'Eastern Time'
 */
export function timeZoneName(timeZone: string, options: TimeZoneNameOptions = {}): string {
  const zone = resolveTimeZone(timeZone);
  const at = options.at === undefined ? Date.now() : toEpochMs(options.at);
  const parts = dateTimeFormat(options.locale, { timeZone: zone, timeZoneName: options.style ?? 'long' }).formatToParts(at);
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone;
}

/**
 * Standard (non-DST) offset of a zone in a year: the smaller of the January 1 and July 1 offsets.
 * @example standardOffset(2026, 'America/New_York') // => -18000000
 */
export function standardOffset(year: number, timeZone?: string): number {
  const zone = resolveTimeZone(timeZone);
  const jan = offsetAtMs(toEpochDay(plainDate(year, 1, 1)) * 86_400_000, zone);
  const jul = offsetAtMs(toEpochDay(plainDate(year, 7, 1)) * 86_400_000, zone);
  return Math.min(jan, jul);
}

/**
 * True when the zone observes daylight saving time at the instant: its offset is larger than
 * `standardOffset` for that year. (Zones with "negative DST" such as Europe/Dublin report summer
 * as DST, matching common usage; Africa/Casablanca reports its Ramadan offset as non-DST.)
 * @example isDstAt(Date.UTC(2026, 6, 1), 'Europe/London') // => true
 */
export function isDstAt(instant: InstantInput, timeZone?: string): boolean {
  const ms = toEpochMs(instant);
  const zone = resolveTimeZone(timeZone);
  const year = instantToZoned(ms, zone).date.year;
  return offsetAtMs(ms, zone) > standardOffset(year, zone);
}

/** `Intl.DateTimeFormat` options plus the zone and locale. */
export type ZonedFormatOptions = Omit<Intl.DateTimeFormatOptions, 'timeZone'> & { readonly timeZone?: string; readonly locale?: string };

/**
 * Formats an instant in a zone with a cached `Intl.DateTimeFormat`. Default
 * `{ dateStyle: 'medium', timeStyle: 'short' }`.
 * @example formatInZone(Date.UTC(2026, 0, 1), { timeZone: 'Asia/Tokyo', locale: 'en', timeStyle: 'short' }) // => '9:00 AM'
 */
export function formatInZone(instant: InstantInput, options: ZonedFormatOptions = {}): string {
  const ms = toEpochMs(instant);
  const zone = resolveTimeZone(options.timeZone);
  const { locale } = options;
  const hasField = Object.keys(options).some((k) => k !== 'locale' && k !== 'timeZone' && k !== 'calendar' && k !== 'numberingSystem' && k !== 'hour12' && k !== 'hourCycle');
  return dateTimeFormat(locale, { ...options, ...(hasField ? {} : { dateStyle: 'medium', timeStyle: 'short' }), timeZone: zone }).format(ms);
}

/**
 * RFC 3339 / ISO 8601 string of an instant as wall time in a zone with its offset,
 * for example `2026-03-08T03:00:00-04:00`.
 * @example formatZonedIso(Date.UTC(2026, 2, 8, 7), 'America/New_York') // => '2026-03-08T03:00:00-04:00'
 */
export function formatZonedIso(instant: InstantInput, timeZone?: string): string {
  const ms = toEpochMs(instant);
  const zone = resolveTimeZone(timeZone);
  return `${formatPlainDateTime(instantToZoned(ms, zone))}${formatOffset(offsetAtMs(ms, zone))}`;
}
