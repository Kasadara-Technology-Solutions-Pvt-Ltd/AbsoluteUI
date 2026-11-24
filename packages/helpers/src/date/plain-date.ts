/**
 * Date-only value type and core arithmetic (docs/PLAN-HELPERS.md section 2, section 4).
 * `PlainDate` is structurally identical to `@absoluteui/core`'s `PlainDate`, so values
 * pass between the packages unchanged. Arithmetic uses epoch days (days since
 * 1970-01-01, proleptic Gregorian) and never a `Date` at local midnight, so no result
 * can shift by a day because of a time zone or DST.
 */
import { ValidationError } from '../error/index.js';

export interface PlainDate {
  readonly kind: 'PlainDate';
  readonly year: number;
  /** 1-12 */
  readonly month: number;
  /** 1-31 */
  readonly day: number;
}

/**
 * ISO weekday: 1 = Monday ... 7 = Sunday.
 * @example const saturday: IsoWeekday = 6;
 */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Anything accepted where a date-only value is expected. Strings must be `YYYY-MM-DD`.
 * @example const d: DateInput = '2026-09-29';
 */
export type DateInput = PlainDate | string;

/**
 * Supported year range (matches `@absoluteui/core`).
 * @example plainDate(MAX_YEAR, 1, 1)
 */
export const MAX_YEAR = 275759;

/**
 * True for Gregorian leap years.
 * @example isLeapYear(2024) // => true
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Days in `month` (1-12) of `year`; 0 for an invalid month.
 * @example daysInMonth(2024, 2) // => 29
 */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return MONTH_DAYS[month - 1] ?? 0;
}

/**
 * 365 or 366.
 * @example daysInYear(2024) // => 366
 */
export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

function assertInt(value: number, min: number, max: number, property: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError('HLP_DATE_OUT_OF_RANGE', 'Date field out of range.', { details: { property, min, max } });
  }
}

/**
 * Creates a validated, frozen date-only value.
 * @example plainDate(2026, 2, 28)
 */
export function plainDate(year: number, month: number, day: number): PlainDate {
  assertInt(year, -MAX_YEAR, MAX_YEAR, 'year');
  assertInt(month, 1, 12, 'month');
  assertInt(day, 1, daysInMonth(year, month), 'day');
  return Object.freeze({ kind: 'PlainDate', year, month, day });
}

/**
 * Type guard for `PlainDate`-shaped values (including core's).
 * @example isPlainDate(plainDate(2026, 1, 1)) // => true
 */
export function isPlainDate(value: unknown): value is PlainDate {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<PlainDate>;
  return v.kind === 'PlainDate' && Number.isInteger(v.year) && Number.isInteger(v.month) && Number.isInteger(v.day) && (v.month ?? 0) >= 1 && (v.month ?? 0) <= 12 && (v.day ?? 0) >= 1 && (v.day ?? 0) <= daysInMonth(v.year ?? 0, v.month ?? 0);
}

// Howard Hinnant's days_from_civil / civil_from_days: exact integer arithmetic.
/**
 * Days since 1970-01-01 for a date.
 * @example toEpochDay(plainDate(1970, 1, 2)) // => 1
 */
export function toEpochDay(date: PlainDate): number {
  const y = date.month <= 2 ? date.year - 1 : date.year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (date.month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + date.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * Date for a count of days since 1970-01-01.
 * @example fromEpochDay(0) // => '1970-01-01'
 */
export function fromEpochDay(epochDay: number): PlainDate {
  if (!Number.isInteger(epochDay)) throw new ValidationError('HLP_DATE_OUT_OF_RANGE', 'Epoch day must be an integer.');
  const z = epochDay + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return plainDate(year, month, day);
}

// Strict: exactly YYYY-MM-DD (or +/-YYYYYY-MM-DD). Bounded quantifiers only (ReDoS-safe).
const ISO_DATE = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses `YYYY-MM-DD` strictly. Returns `undefined` for anything else, including
 * impossible dates (`2026-02-30`) and date-times.
 * @example parsePlainDate('2026-09-29')
 */
export function parsePlainDate(text: string): PlainDate | undefined {
  if (typeof text !== 'string' || text.length > 13) return undefined;
  const m = ISO_DATE.exec(text);
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (m[1] === '-000000') return undefined;
  if (Math.abs(year) > MAX_YEAR || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return undefined;
  return plainDate(year, month, day);
}

const pad = (n: number, len = 2): string => String(Math.abs(n)).padStart(len, '0');

/**
 * ISO 8601 `YYYY-MM-DD` (extended years as `+/-YYYYYY`).
 * @example formatPlainDate(plainDate(2026, 9, 29)) // => '2026-09-29'
 */
export function formatPlainDate(date: PlainDate): string {
  const y = date.year >= 0 && date.year <= 9999 ? pad(date.year, 4) : `${date.year < 0 ? '-' : '+'}${pad(date.year, 6)}`;
  return `${y}-${pad(date.month)}-${pad(date.day)}`;
}

/**
 * Normalizes `PlainDate | 'YYYY-MM-DD'`; throws `HLP_INVALID_DATE` for bad strings.
 * @example toPlainDate('2026-09-29')
 */
export function toPlainDate(input: DateInput): PlainDate {
  if (typeof input === 'string') {
    const d = parsePlainDate(input);
    if (!d) throw new ValidationError('HLP_INVALID_DATE', 'Expected a date in YYYY-MM-DD format.');
    return d;
  }
  if (!isPlainDate(input)) throw new ValidationError('HLP_INVALID_DATE', 'Expected a PlainDate.');
  return input;
}

/**
 * ISO weekday (1 = Monday ... 7 = Sunday).
 * @example isoWeekday('2026-09-29') // => 2 // Tuesday
 */
export function isoWeekday(date: DateInput): IsoWeekday {
  const e = toEpochDay(toPlainDate(date));
  // 1970-01-01 was a Thursday (4).
  return ((((e + 3) % 7) + 7) % 7 + 1) as IsoWeekday;
}

/**
 * Adds (or subtracts) days.
 * @example addDays('2026-12-31', 1) // => '2027-01-01'
 */
export function addDays(date: DateInput, days: number): PlainDate {
  assertInt(days, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 'days');
  return fromEpochDay(toEpochDay(toPlainDate(date)) + days);
}

/**
 * Orders two dates: `-1`, `0`, or `1`.
 * @example ['2026-02-01', '2026-01-01'].sort(comparePlainDates)
 */
export function comparePlainDates(a: DateInput, b: DateInput): -1 | 0 | 1 {
  const x = toEpochDay(toPlainDate(a));
  const y = toEpochDay(toPlainDate(b));
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Calendar days from `a` to `b` (negative when `b` is earlier), endpoints exclusive of `a`.
 * @example daysBetween('2026-01-01', '2026-01-31') // => 30
 */
export function daysBetween(a: DateInput, b: DateInput): number {
  return toEpochDay(toPlainDate(b)) - toEpochDay(toPlainDate(a));
}

/**
 * Today's date in `timeZone` (default: the runtime's zone).
 * @example today('Asia/Kolkata') // e.g. '2026-09-30' (the current date in Kolkata)
 */
export function today(timeZone?: string): PlainDate {
  return plainDateFromInstant(Date.now(), timeZone);
}

const ymdFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * The calendar date of an instant (epoch ms or `Date`) as observed in `timeZone`.
 * Throws `HLP_TZ_INVALID_ZONE` for an unknown zone.
 * @example plainDateFromInstant(Date.UTC(2026, 0, 1, 20), 'Asia/Kolkata') // => '2026-01-02'
 */
export function plainDateFromInstant(instant: number | Date, timeZone?: string): PlainDate {
  const ms = typeof instant === 'number' ? instant : instant.getTime();
  if (!Number.isFinite(ms)) throw new ValidationError('HLP_INVALID_DATE', 'Invalid instant.');
  const key = timeZone ?? '';
  let f = ymdFormatters.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone, era: 'short', year: 'numeric', month: 'numeric', day: 'numeric' });
    } catch (cause) {
      throw new ValidationError('HLP_TZ_INVALID_ZONE', 'Unsupported time zone identifier.', { cause });
    }
    if (ymdFormatters.size >= 256) ymdFormatters.clear();
    ymdFormatters.set(key, f);
  }
  let year = 0;
  let month = 0;
  let day = 0;
  let bc = false;
  for (const p of f.formatToParts(ms)) {
    if (p.type === 'year') year = Number(p.value);
    else if (p.type === 'month') month = Number(p.value);
    else if (p.type === 'day') day = Number(p.value);
    else if (p.type === 'era') bc = p.value === 'BC' || p.value === 'B';
  }
  return plainDate(bc ? 1 - year : year, month, day);
}
