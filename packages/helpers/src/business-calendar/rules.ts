/**
 * Holiday rule types, builders, validation, Easter computus, and per-year occurrence
 * expansion. Rules are data; the calendar resolves them per year and caches the result.
 */
import { MAX_YEAR, daysInMonth, fromEpochDay, isPlainDate, plainDate, toEpochDay, toPlainDate, type DateInput, type IsoWeekday, type PlainDate } from '../date/index.js';
import { hasOwn } from '../internal/keys.js';
import { epochOf, invalid, isArray, isRecord, limit, normalizeRanges, optionalText, rangesToText, requiredName, weekdayOfEpoch, type MinuteRange, type TimeRange } from './internal.js';

/**
 * Shift of a holiday that falls on a weekend day (per the calendar's weekend):
 * `'nearest-weekday'` (Sat -> Fri, Sun -> Mon for a Sat/Sun weekend; ties go forward),
 * `'next-weekday'`, `'previous-weekday'`, or a map from ISO weekday to a day offset
 * (`{ 7: 1 }`: Sunday -> Monday), which applies on those weekdays whatever the weekend is.
 * When the target already has a holiday (or is a weekend day) the search continues in the
 * same direction, so a substitute day never lands on another holiday.
 * @example
 * const policy: ObservedPolicy = 'nearest-weekday';
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25, { observed: policy })] });
 * isHoliday('2027-12-24', cal)?.name; // => 'Christmas Day' // Saturday 25th is observed on Friday 24th
 * isBusinessDay('2027-12-24', cal); // => false
 * isBusinessDay('2027-12-27', cal); // => true // Monday stays a business day
 */
export type ObservedPolicy = 'none' | 'nearest-weekday' | 'next-weekday' | 'previous-weekday' | ObservedShiftMap;

/**
 * Day offsets by ISO weekday for custom observed shifts (-7..7).
 * @example
 * const map: ObservedShiftMap = { 6: -1, 7: 1 }; // Saturday → Friday, Sunday → Monday
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Independence Day', 8, 15, { observed: map })] });
 * isHoliday('2027-08-16', cal)?.observed; // => true // Sunday 15th observed on Monday 16th
 */
export type ObservedShiftMap = Readonly<Partial<Record<IsoWeekday, number>>>;

/** Fields shared by every holiday rule. */
export interface HolidayRuleBase {
  /** Plain-text name; also the accessible reason for a non-working day. */
  readonly name: string;
  readonly id?: string;
  /** Scope tags (region, department); see `withTags`. Untagged rules apply everywhere. */
  readonly tags?: readonly string[];
  /** Default `'none'`. */
  readonly observed?: ObservedPolicy;
  /** The day is a working half day instead of a day off. */
  readonly halfDay?: boolean;
  /** Hours of the half day; default the calendar's `halfDayHours`, else the first half of the day. */
  readonly halfDayHours?: readonly TimeRange[];
}

/** Year bounds for recurring rules (inclusive). */
export interface HolidayYearBounds {
  readonly fromYear?: number;
  readonly toYear?: number;
}

/** Same month and day every year (Feb 29 only in leap years). */
export interface FixedHolidayRule extends HolidayRuleBase, HolidayYearBounds {
  readonly kind: 'fixed';
  readonly month: number;
  readonly day: number;
}

/** `n`-th weekday of a month: `n` 1..5, or -1..-5 counting from the end (-1 = last). */
export interface NthWeekdayHolidayRule extends HolidayRuleBase, HolidayYearBounds {
  readonly kind: 'nth-weekday';
  readonly month: number;
  readonly weekday: IsoWeekday;
  readonly n: number;
}

/** Days relative to Easter Sunday (Good Friday = -2, Easter Monday = 1). */
export interface EasterHolidayRule extends HolidayRuleBase, HolidayYearBounds {
  readonly kind: 'easter';
  /** -366..366, default 0. */
  readonly offsetDays?: number;
  /** Default `'western'` (Gregorian computus); `'orthodox'` uses the Julian computus. */
  readonly method?: 'western' | 'orthodox';
}

/** A single date. */
export interface OneOffHolidayRule extends HolidayRuleBase {
  readonly kind: 'date';
  readonly date: DateInput;
}

/** Every date from `start` to `end`, inclusive (at most 3660 days). */
export interface RangeHolidayRule extends HolidayRuleBase {
  readonly kind: 'range';
  readonly start: DateInput;
  readonly end: DateInput;
}

/**
 * Dates computed by the application per year (lunar and regional calendars). Must be pure
 * and synchronous; results are cached per year. At most 400 dates per year.
 */
export interface CustomHolidayRule extends HolidayRuleBase, HolidayYearBounds {
  readonly kind: 'custom';
  readonly dates: (year: number) => readonly DateInput[];
}

/**
 * A holiday rule (discriminated by `kind`).
 * @example const rule: HolidayRule = { kind: 'fixed', name: 'New Year', month: 1, day: 1 };
 */
export type HolidayRule = FixedHolidayRule | NthWeekdayHolidayRule | EasterHolidayRule | OneOffHolidayRule | RangeHolidayRule | CustomHolidayRule;

/**
 * Rule kinds.
 * @example const k: HolidayKind = 'easter';
 */
export type HolidayKind = HolidayRule['kind'];

/**
 * An already-resolved holiday returned by a `HolidayProvider` (no observed shift is applied).
 * A `ResolvedHoliday` is accepted too.
 * @example const h: ProvidedHoliday = { date: '2026-11-08', name: 'Diwali' };
 */
export interface ProvidedHoliday {
  readonly date: DateInput;
  readonly name: string;
  readonly id?: string;
  readonly tags?: readonly string[];
  readonly halfDay?: boolean;
  readonly halfDayHours?: readonly TimeRange[];
}

/**
 * Loads holiday data per year (no country data ships with the package, B4). Must be pure and
 * synchronous; results are cached per calendar and year. Recurring rules returned for a year
 * are expanded for that year only.
 * @example
 * const table: Readonly<Record<number, readonly ProvidedHoliday[]>> = { 2026: [{ date: '2026-11-10', name: 'Foundation Day' }] };
 * const provider: HolidayProvider = { holidaysFor: (year) => table[year] ?? [] };
 * const cal = createBusinessCalendar({ providers: [provider] });
 * isHoliday('2026-11-10', cal)?.name; // => 'Foundation Day'
 * isBusinessDay('2026-11-10', cal); // => false // Tuesday
 */
export interface HolidayProvider {
  holidaysFor(year: number): readonly (HolidayRule | ProvidedHoliday)[];
}

/**
 * A holiday on a specific date. A shifted holiday produces two entries: the original date
 * (`movedTo` set; informational, does not change whether that day is worked) and the observed
 * date (`observed: true`, `originalDate` set).
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25, { observed: 'nearest-weekday' })] });
 * isHoliday('2027-12-24', cal); // => { date: '2027-12-24', name: 'Christmas Day', kind: 'fixed', tags: [], halfDay: false, observed: true, originalDate: '2027-12-25' }
 * holidaysOn('2027-12-25', cal)[0]?.movedTo; // => '2027-12-24' // the Saturday original
 */
export interface ResolvedHoliday {
  readonly date: PlainDate;
  readonly name: string;
  readonly kind: HolidayKind | 'provided';
  readonly id?: string;
  readonly tags: readonly string[];
  readonly halfDay: boolean;
  readonly observed: boolean;
  readonly originalDate?: PlainDate;
  readonly movedTo?: PlainDate;
}

/** Validated rule plus what the engine needs to expand it. Internal. */
export interface NormalizedRule {
  readonly rule: HolidayRule | ProvidedHoliday;
  readonly kind: HolidayKind | 'provided';
  readonly name: string;
  readonly id: string | undefined;
  readonly tags: readonly string[];
  readonly observed: ObservedPolicy;
  readonly halfDay: boolean;
  readonly halfHours: readonly MinuteRange[] | undefined;
  /** Recurring rules: epoch days for a rule year. */
  readonly occurrences: ((year: number) => readonly number[]) | undefined;
  /** One-off, range, and provided holidays: inclusive epoch-day span. */
  readonly span: readonly [number, number] | undefined;
  readonly fromYear: number;
  readonly toYear: number;
}

const MAX_TAGS = 32;
const MAX_RANGE_DAYS = 3660;
const MAX_CUSTOM_DATES = 400;
const OBSERVED = new Set(['none', 'nearest-weekday', 'next-weekday', 'previous-weekday']);
const WEEKDAY_KEY = /^[1-7]$/;

function intIn(value: unknown, min: number, max: number, property: string, code = 'HLP_BIZCAL_INVALID_RULE'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw invalid(code, 'Holiday rule field is out of range.', property);
  return value;
}

/** Validates a tag list (1-64 characters each, at most 32). */
export function normalizeTags(value: unknown, property: string): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  if (!isArray(value)) throw invalid('HLP_BIZCAL_INVALID_TAGS', 'Tags must be an array of strings.', property);
  if (value.length > MAX_TAGS) throw limit('HLP_BIZCAL_TOO_MANY_TAGS', 'Too many tags.', MAX_TAGS);
  const tags = value.map((t) => {
    if (typeof t !== 'string' || t.length === 0 || t.length > 64) throw invalid('HLP_BIZCAL_INVALID_TAGS', 'Tags must be strings of 1 to 64 characters.', property);
    return t;
  });
  return Object.freeze([...new Set(tags)]);
}

function normalizeObserved(value: unknown, property: string): ObservedPolicy {
  if (value === undefined) return 'none';
  if (typeof value === 'string') {
    if (!OBSERVED.has(value)) throw invalid('HLP_BIZCAL_INVALID_OBSERVED', 'Unknown observed policy.', property);
    return value as ObservedPolicy;
  }
  if (!isRecord(value)) throw invalid('HLP_BIZCAL_INVALID_OBSERVED', 'Observed policy must be a name or a weekday map.', property);
  const out: Partial<Record<IsoWeekday, number>> = {};
  for (const key of Object.keys(value)) {
    if (!WEEKDAY_KEY.test(key)) throw invalid('HLP_BIZCAL_INVALID_OBSERVED', 'Observed map keys must be ISO weekdays 1-7.', property);
    out[Number(key) as IsoWeekday] = intIn(value[key], -7, 7, property, 'HLP_BIZCAL_INVALID_OBSERVED');
  }
  return Object.freeze(out);
}

function toDate(value: unknown, property: string): PlainDate {
  if (typeof value !== 'string' && !isPlainDate(value)) throw invalid('HLP_BIZCAL_INVALID_RULE', 'Expected a PlainDate or YYYY-MM-DD.', property);
  try {
    return toPlainDate(value);
  } catch {
    throw invalid('HLP_BIZCAL_INVALID_RULE', 'Expected a PlainDate or YYYY-MM-DD.', property);
  }
}

// ---------------------------------------------------------------------------
// Easter

const floorMod = (a: number, n: number): number => ((a % n) + n) % n;

/**
 * Easter Sunday for a year (1..275759). `'western'` uses the anonymous Gregorian algorithm
 * (Meeus/Jones/Butcher); `'orthodox'` uses the Julian computus (Meeus) converted to the
 * Gregorian calendar. Both are proleptic before their historical adoption.
 * @example easterSunday(2026) // => '2026-04-05'
 * @example easterSunday(2026, 'orthodox') // => '2026-04-12'
 */
export function easterSunday(year: number, method: 'western' | 'orthodox' = 'western'): PlainDate {
  intIn(year, 1, MAX_YEAR - 1, 'year', 'HLP_BIZCAL_INVALID_YEAR');
  if (method === 'orthodox') {
    const a = year % 4;
    const b = year % 7;
    const c = year % 19;
    const d = (19 * c + 15) % 30;
    const e = floorMod(2 * a + 4 * b - d + 34, 7);
    const month = Math.floor((d + e + 114) / 31);
    const day = ((d + e + 114) % 31) + 1;
    // Julian -> Gregorian: the gap grows at Julian Feb 29 of century years, always before Easter.
    const gap = Math.floor(year / 100) - Math.floor(year / 400) - 2;
    return fromEpochDay(epochOf(year, month, day) + gap);
  }
  const methodName: string = method;
  if (methodName !== 'western') throw invalid('HLP_BIZCAL_INVALID_RULE', 'Easter method must be western or orthodox.', 'method');
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = floorMod(32 + 2 * e + 2 * i - h - k, 7);
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return plainDate(year, month, day);
}

// ---------------------------------------------------------------------------
// Normalization

function nthWeekdayEpoch(year: number, month: number, weekday: number, n: number): number | undefined {
  const dim = daysInMonth(year, month);
  if (n > 0) {
    const first = epochOf(year, month, 1);
    const day = 1 + ((weekday - weekdayOfEpoch(first) + 7) % 7) + (n - 1) * 7;
    return day <= dim ? first + day - 1 : undefined;
  }
  const last = epochOf(year, month, dim);
  const day = dim - ((weekdayOfEpoch(last) - weekday + 7) % 7) - (-n - 1) * 7;
  return day >= 1 ? last - (dim - day) : undefined;
}

/**
 * Validates a rule (or, with `allowProvided`, a provider's resolved holiday) and returns the
 * engine form. `forceHalf` marks entries of the calendar's `halfDays` list.
 */
export function normalizeRule(value: unknown, property: string, options: { readonly forceHalf?: boolean; readonly allowProvided?: boolean } = {}): NormalizedRule {
  if (!isRecord(value)) throw invalid('HLP_BIZCAL_INVALID_RULE', 'A holiday rule must be an object.', property);
  const name = requiredName(value.name, `${property}.name`);
  const id = optionalText(value.id, `${property}.id`);
  const tags = normalizeTags(value.tags, `${property}.tags`);
  const kind = value.kind;
  // A provider's resolved entry (a `ResolvedHoliday` has a boolean `observed`; it is not shifted again).
  const provided = options.allowProvided === true && kind !== 'range' && kind !== 'date' && hasOwn(value, 'date');
  const observed = provided ? 'none' : normalizeObserved(value.observed, `${property}.observed`);
  if (value.halfDay !== undefined && typeof value.halfDay !== 'boolean') throw invalid('HLP_BIZCAL_INVALID_RULE', 'halfDay must be a boolean.', `${property}.halfDay`);
  const halfDay = options.forceHalf === true || value.halfDay === true;
  const halfHours = value.halfDayHours === undefined ? undefined : normalizeRanges(value.halfDayHours, `${property}.halfDayHours`);
  const fromYear = value.fromYear === undefined ? -MAX_YEAR : intIn(value.fromYear, -MAX_YEAR, MAX_YEAR, `${property}.fromYear`);
  const toYear = value.toYear === undefined ? MAX_YEAR : intIn(value.toYear, -MAX_YEAR, MAX_YEAR, `${property}.toYear`);
  if (fromYear > toYear) throw invalid('HLP_BIZCAL_INVALID_RULE', 'fromYear must not be after toYear.', `${property}.fromYear`);
  const common = {
    name, id, tags, observed, halfDay, halfHours, fromYear, toYear,
  };
  const extra = {
    ...(id === undefined ? {} : { id }),
    ...(value.tags === undefined ? {} : { tags }),
    ...(value.observed === undefined || provided ? {} : { observed }),
    ...(halfDay ? { halfDay } : {}),
    ...(halfHours === undefined ? {} : { halfDayHours: rangesToText(halfHours) }),
    ...(value.fromYear === undefined ? {} : { fromYear }),
    ...(value.toYear === undefined ? {} : { toYear }),
  };
  if (provided) {
    const date = toDate(value.date, `${property}.date`);
    const e = toEpochDay(date);
    const rule: ProvidedHoliday = Object.freeze({ date, name, ...extra });
    return Object.freeze({ ...common, rule, kind: 'provided', observed: 'none', occurrences: undefined, span: Object.freeze([e, e] as const) });
  }
  switch (kind) {
    case 'fixed': {
      const month = intIn(value.month, 1, 12, `${property}.month`);
      const day = intIn(value.day, 1, daysInMonth(2024, month), `${property}.day`);
      const rule: FixedHolidayRule = Object.freeze({ kind, name, month, day, ...extra });
      const occurrences = (year: number): readonly number[] => (day <= daysInMonth(year, month) ? [epochOf(year, month, day)] : []);
      return Object.freeze({ ...common, rule, kind, occurrences, span: undefined });
    }
    case 'nth-weekday': {
      const month = intIn(value.month, 1, 12, `${property}.month`);
      const weekday = intIn(value.weekday, 1, 7, `${property}.weekday`) as IsoWeekday;
      const n = intIn(value.n, -5, 5, `${property}.n`);
      if (n === 0) throw invalid('HLP_BIZCAL_INVALID_RULE', 'n must be 1..5 or -1..-5.', `${property}.n`);
      const rule: NthWeekdayHolidayRule = Object.freeze({ kind, name, month, weekday, n, ...extra });
      const occurrences = (year: number): readonly number[] => {
        const e = nthWeekdayEpoch(year, month, weekday, n);
        return e === undefined ? [] : [e];
      };
      return Object.freeze({ ...common, rule, kind, occurrences, span: undefined });
    }
    case 'easter': {
      const offsetDays = value.offsetDays === undefined ? 0 : intIn(value.offsetDays, -366, 366, `${property}.offsetDays`);
      const method = value.method ?? 'western';
      if (method !== 'western' && method !== 'orthodox') throw invalid('HLP_BIZCAL_INVALID_RULE', 'Easter method must be western or orthodox.', `${property}.method`);
      const rule: EasterHolidayRule = Object.freeze({ kind, name, offsetDays, method, ...extra });
      const occurrences = (year: number): readonly number[] => (year >= 1 && year < MAX_YEAR ? [toEpochDay(easterSunday(year, method)) + offsetDays] : []);
      return Object.freeze({ ...common, rule, kind, occurrences, span: undefined });
    }
    case 'date': {
      const date = toDate(value.date, `${property}.date`);
      const e = toEpochDay(date);
      const rule: OneOffHolidayRule = Object.freeze({ kind, name, date, ...extra });
      return Object.freeze({ ...common, rule, kind, occurrences: undefined, span: Object.freeze([e, e] as const) });
    }
    case 'range': {
      const start = toDate(value.start, `${property}.start`);
      const end = toDate(value.end, `${property}.end`);
      const lo = toEpochDay(start);
      const hi = toEpochDay(end);
      if (hi < lo) throw invalid('HLP_BIZCAL_INVALID_RULE', 'A holiday range must not end before it starts.', `${property}.end`);
      if (hi - lo + 1 > MAX_RANGE_DAYS) throw limit('HLP_BIZCAL_RANGE_TOO_LONG', 'A holiday range may cover at most 3660 days.', MAX_RANGE_DAYS);
      const rule: RangeHolidayRule = Object.freeze({ kind, name, start, end, ...extra });
      return Object.freeze({ ...common, rule, kind, occurrences: undefined, span: Object.freeze([lo, hi] as const) });
    }
    case 'custom': {
      const fn = value.dates;
      if (typeof fn !== 'function') throw invalid('HLP_BIZCAL_INVALID_RULE', 'A custom rule needs a dates(year) function.', `${property}.dates`);
      const dates = fn as (year: number) => unknown;
      const rule: CustomHolidayRule = Object.freeze({ kind, name, dates: dates as (year: number) => readonly DateInput[], ...extra });
      const occurrences = (year: number): readonly number[] => {
        const out: unknown = dates(year);
        if (!isArray(out)) throw invalid('HLP_BIZCAL_INVALID_RULE', 'A custom rule must return an array of dates.', `${property}.dates`);
        if (out.length > MAX_CUSTOM_DATES) throw limit('HLP_BIZCAL_TOO_MANY_DATES', 'A custom rule returned too many dates for one year.', MAX_CUSTOM_DATES);
        return out.map((d) => toEpochDay(toDate(d, `${property}.dates`)));
      };
      return Object.freeze({ ...common, rule, kind, occurrences, span: undefined });
    }
    default:
      throw invalid('HLP_BIZCAL_INVALID_RULE', 'Unknown holiday rule kind.', `${property}.kind`);
  }
}

// ---------------------------------------------------------------------------
// Builders

/**
 * Options shared by the rule builders.
 * @example
 * const options: HolidayRuleOptions = { observed: 'nearest-weekday', tags: ['US'], fromYear: 2020 };
 * fixedHoliday('Independence Day', 7, 4, options).tags; // => ['US']
 */
export type HolidayRuleOptions = Omit<HolidayRuleBase, 'name'> & HolidayYearBounds;

function build<T extends HolidayRule>(rule: T): T {
  return normalizeRule(rule, 'rule').rule as T;
}

/**
 * Same month and day every year.
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('New Year', 1, 1, { observed: 'nearest-weekday' })] });
 * isBusinessDay('2027-01-01', cal); // => false // Friday
 * isHoliday('2027-12-31', cal)?.name; // => 'New Year' // 1 January 2028 is a Saturday
 */
export function fixedHoliday(name: string, month: number, day: number, options: HolidayRuleOptions = {}): FixedHolidayRule {
  return build<FixedHolidayRule>({ ...options, kind: 'fixed', name, month, day });
}

/**
 * `n`-th weekday of a month (`n` 1..5, or negative from the end).
 * @example
 * const cal = createBusinessCalendar({ holidays: [nthWeekdayHoliday('Thanksgiving', 11, 4, 4)] }); // 4th Thursday of November
 * isHoliday('2026-11-26', cal)?.name; // => 'Thanksgiving'
 * isHoliday('2027-11-25', cal)?.name; // => 'Thanksgiving'
 */
export function nthWeekdayHoliday(name: string, month: number, weekday: IsoWeekday, n: number, options: HolidayRuleOptions = {}): NthWeekdayHolidayRule {
  return build<NthWeekdayHolidayRule>({ ...options, kind: 'nth-weekday', name, month, weekday, n });
}

/**
 * Last given weekday of a month.
 * @example
 * const cal = createBusinessCalendar({ holidays: [lastWeekdayHoliday('Memorial Day', 5, 1)] }); // last Monday of May
 * isHoliday('2026-05-25', cal)?.name; // => 'Memorial Day'
 * nextBusinessDay('2026-05-22', cal); // => '2026-05-26' // Friday → Tuesday
 */
export function lastWeekdayHoliday(name: string, month: number, weekday: IsoWeekday, options: HolidayRuleOptions = {}): NthWeekdayHolidayRule {
  return nthWeekdayHoliday(name, month, weekday, -1, options);
}

/**
 * Days relative to Easter Sunday.
 * @example
 * const cal = createBusinessCalendar({ holidays: [easterHoliday('Good Friday', -2), easterHoliday('Easter Monday', 1)] });
 * listHolidays('2026-04-01', '2026-04-30', cal).map((h) => h.date); // => ['2026-04-03', '2026-04-06'] // Easter Sunday is 5 April
 * @example
 * const cal = createBusinessCalendar({ holidays: [easterHoliday('Orthodox Easter Monday', 1, { method: 'orthodox' })] });
 * isHoliday('2026-04-13', cal)?.name; // => 'Orthodox Easter Monday'
 */
export function easterHoliday(name: string, offsetDays = 0, options: HolidayRuleOptions & { readonly method?: 'western' | 'orthodox' } = {}): EasterHolidayRule {
  return build<EasterHolidayRule>({ ...options, kind: 'easter', name, offsetDays });
}

/**
 * A single date.
 * @example
 * const cal = createBusinessCalendar({ holidays: [oneOffHoliday('Office move', '2026-06-19')] });
 * isBusinessDay('2026-06-19', cal); // => false // Friday
 * isBusinessDay('2027-06-18', cal); // => true // does not recur
 */
export function oneOffHoliday(name: string, date: DateInput, options: Omit<HolidayRuleOptions, 'fromYear' | 'toYear'> = {}): OneOffHolidayRule {
  return build<OneOffHolidayRule>({ ...options, kind: 'date', name, date });
}

/**
 * Every date from `start` to `end`, inclusive.
 * @example
 * const cal = createBusinessCalendar({ holidays: [holidayRange('Winter shutdown', '2026-12-24', '2027-01-01')] });
 * diffDays('2026-12-24', '2027-01-01', { mode: 'calendar', inclusive: 'both', calendar: cal }); // => 9
 * diffDays('2026-12-24', '2027-01-01', { mode: 'weekdays', inclusive: 'both', calendar: cal }); // => 7
 * diffDays('2026-12-24', '2027-01-01', { mode: 'business', inclusive: 'both', calendar: cal }); // => 0
 * nextBusinessDay('2026-12-23', cal); // => '2027-01-04'
 */
export function holidayRange(name: string, start: DateInput, end: DateInput, options: Omit<HolidayRuleOptions, 'fromYear' | 'toYear'> = {}): RangeHolidayRule {
  return build<RangeHolidayRule>({ ...options, kind: 'range', name, start, end });
}

/**
 * Dates computed per year by the application (lunar or regional calendars).
 * @example
 * // Dates from the application's own lunar table or server.
 * const festival: Readonly<Record<number, readonly string[]>> = { 2026: ['2026-10-20'], 2027: ['2027-11-09'] };
 * const cal = createBusinessCalendar({ weekend: [7], holidays: [customHoliday('Harvest festival', (year) => festival[year] ?? [])] });
 * isHoliday('2026-10-20', cal)?.name; // => 'Harvest festival'
 * isBusinessDay('2027-11-09', cal); // => false
 */
export function customHoliday(name: string, dates: (year: number) => readonly DateInput[], options: HolidayRuleOptions = {}): CustomHolidayRule {
  return build<CustomHolidayRule>({ ...options, kind: 'custom', name, dates });
}

/**
 * Validates a list of rules up front and returns it frozen (errors name the index).
 * @example
 * const US = defineHolidays([fixedHoliday('New Year', 1, 1), nthWeekdayHoliday('Labor Day', 9, 1, 1)]);
 * isHoliday('2026-09-07', createBusinessCalendar({ holidays: US }))?.name; // => 'Labor Day'
 * @example
 * defineHolidays([{ kind: 'fixed', name: 'Typo', month: 13, day: 1 }]); // => throws HLP_BIZCAL_INVALID_RULE
 */
export function defineHolidays(rules: readonly HolidayRule[]): readonly HolidayRule[] {
  if (!isArray(rules)) throw invalid('HLP_BIZCAL_INVALID_RULE', 'Expected an array of holiday rules.', 'rules');
  return Object.freeze(rules.map((r, i) => normalizeRule(r, `rules[${String(i)}]`).rule as HolidayRule));
}
