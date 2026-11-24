/**
 * Business calendar definition, validation, and the cached per-year engine. A calendar is an
 * immutable frozen value; its caches live in a `WeakMap` keyed by the calendar, so they never
 * leak and never make the value mutable.
 *
 * Precedence for a date (compatible with the components business-calendar engine):
 * exception, then a full holiday, then a half-day holiday (only on a working weekday), then
 * the weekday pattern.
 */
import { MAX_YEAR, fromEpochDay, getWeekInfo, toEpochDay, type DateInput, type IsoWeekday, type PlainDate } from '../date/index.js';
import { isValidTimeZone } from '../timezone/index.js';
import { epochOf, firstHalf, invalid, isArray, isRecord, limit, lowerBound, normalizeRanges, optionalText, rangesToText, requiredName, upperBound, weekdayOfEpoch, type MinuteRange, type TimeRange } from './internal.js';
import { normalizeRule, normalizeTags, type HolidayProvider, type HolidayRule, type NormalizedRule, type ObservedPolicy, type ResolvedHoliday } from './rules.js';

/**
 * Overrides the weekday pattern and holidays for one date (a compensatory working Saturday, a
 * stocktaking closure). At most one exception per date.
 * @example
 * const ex: BusinessDayException = { date: '2026-10-24', working: true, reason: 'Compensatory working day' };
 * const cal = createBusinessCalendar({ exceptions: [ex] });
 * isBusinessDay('2026-10-24', cal); // => true // a Saturday made working
 * isWeekend('2026-10-24', cal); // => true // the weekday pattern is unchanged
 * getBusinessDay('2026-10-24', cal).reason; // => 'Compensatory working day'
 */
export interface BusinessDayException {
  readonly date: DateInput;
  readonly working: boolean;
  /** Hours of a working exception; default the weekday's hours (or half-day hours with `halfDay`). */
  readonly hours?: readonly TimeRange[];
  /** A working half day. */
  readonly halfDay?: boolean;
  /** Plain-text reason, used as the accessible description. */
  readonly reason?: string;
}

/**
 * Working hours: `default` for every working day plus per-ISO-weekday overrides (`5` = Friday).
 * An empty list means a working day without scheduled hours.
 * @example
 * const hours: WorkingHoursDefinition = { default: [['09:00', '13:00'], ['14:00', '18:00']], 5: [['09:00', '13:00']] };
 * const cal = createBusinessCalendar({ workingHours: hours });
 * cal.workingHours['1']; // => [['09:00', '13:00'], ['14:00', '18:00']]
 * cal.workingHours['5']; // => [['09:00', '13:00']]
 */
export type WorkingHoursDefinition = Readonly<Partial<Record<'default' | `${IsoWeekday}`, readonly TimeRange[]>>>;

/**
 * Restricts holidays to rules carrying one of `tags`; untagged rules apply unless
 * `includeUntagged: false`.
 * @example
 * const scope: TagScope = { tags: ['IN-KA'] };
 * const cal = createBusinessCalendar({
 *   tagScope: scope,
 *   holidays: [fixedHoliday('Maharashtra Day', 5, 1, { tags: ['IN-MH'] }), fixedHoliday('Kannada Rajyotsava', 11, 1, { tags: ['IN-KA'] })],
 * });
 * isBusinessDay('2026-05-01', cal); // => true // IN-MH is out of scope
 * isHoliday('2026-11-01', cal)?.name; // => 'Kannada Rajyotsava'
 */
export interface TagScope {
  readonly tags: readonly string[];
  readonly includeUntagged?: boolean;
}

/**
 * Input for `createBusinessCalendar`. Every field is optional.
 * @example
 * const def: BusinessCalendarDefinition = { weekend: [5, 6], timeZone: 'Asia/Riyadh' };
 * const cal = createBusinessCalendar(def);
 * cal.workingWeekdays; // => [1, 2, 3, 4, 7]
 * isBusinessDay('2026-10-04', cal); // => true // Sunday
 */
export interface BusinessCalendarDefinition {
  readonly name?: string;
  /** Derives `weekend` and `firstDayOfWeek` when those are omitted (`Intl.Locale#getWeekInfo`). */
  readonly locale?: string;
  /** Weekend ISO weekdays; default `[6, 7]` (or the locale's). `[]` = no weekend. */
  readonly weekend?: readonly IsoWeekday[];
  readonly firstDayOfWeek?: IsoWeekday;
  readonly holidays?: readonly HolidayRule[];
  /** Rules that mark working half days (same as holiday rules with `halfDay: true`). */
  readonly halfDays?: readonly HolidayRule[];
  /** Business-day value of a half day, 0..1; default 0.5 (B2). */
  readonly halfDayValue?: number;
  /** Default hours of a half day; default the first half of the weekday's hours. */
  readonly halfDayHours?: readonly TimeRange[];
  readonly exceptions?: readonly BusinessDayException[];
  /** Default `{ default: [['09:00', '17:00']] }`. */
  readonly workingHours?: WorkingHoursDefinition;
  /** IANA zone used for instants (working time, `businessDayAt`); default `'UTC'`. */
  readonly timeZone?: string;
  /** Fiscal year start month 1-12 (B5); default 1. */
  readonly fiscalYearStartMonth?: number;
  /** A fiscal year is named by the calendar year it ends in (default) or starts in. */
  readonly fiscalYearNaming?: 'end' | 'start';
  readonly providers?: readonly HolidayProvider[];
  readonly tagScope?: TagScope | undefined;
}

/**
 * Immutable, validated business calendar. Create with `createBusinessCalendar`.
 * @example
 * const cal: BusinessCalendar = createBusinessCalendar({ timeZone: 'Asia/Kolkata' });
 * cal.weekend; // => [6, 7]
 * cal.timeZone; // => 'Asia/Kolkata'
 */
export interface BusinessCalendar {
  readonly kind: 'BusinessCalendar';
  readonly name: string;
  readonly weekend: readonly IsoWeekday[];
  readonly workingWeekdays: readonly IsoWeekday[];
  readonly firstDayOfWeek: IsoWeekday;
  readonly timeZone: string;
  readonly fiscalYearStartMonth: number;
  readonly fiscalYearNaming: 'end' | 'start';
  readonly halfDayValue: number;
  /** Resolved hours per ISO weekday (keys `'1'`..`'7'`). */
  readonly workingHours: Readonly<Record<`${IsoWeekday}`, readonly TimeRange[]>>;
  readonly holidays: readonly HolidayRule[];
  readonly halfDays: readonly HolidayRule[];
  readonly exceptions: readonly BusinessDayException[];
  readonly providers: readonly HolidayProvider[];
  readonly tagScope: TagScope | undefined;
  /** Normalized definition; `createBusinessCalendar(cal.definition)` recreates the calendar. */
  readonly definition: BusinessCalendarDefinition;
}

/**
 * Why a day is special. The UI localizes `'weekend'`; the others come with `reason` text.
 * @example const code: BusinessDayReasonCode = 'holiday';
 */
export type BusinessDayReasonCode = 'weekend' | 'holiday' | 'exception' | 'half-day';

/**
 * Everything about one date in a calendar.
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25)], halfDays: [fixedHoliday('Christmas Eve', 12, 24)] });
 * getBusinessDay('2026-12-25', cal).reasonCode; // => 'holiday'
 * getBusinessDay('2026-12-26', cal).reasonCode; // => 'weekend'
 * const eve = getBusinessDay('2026-12-24', cal);
 * [eve.working, eve.halfDay, eve.businessDayValue, eve.hours]; // => [true, true, 0.5, [['09:00', '13:00']]]
 */
export interface BusinessDayInfo {
  readonly date: PlainDate;
  readonly weekday: IsoWeekday;
  /** A business day (half days included). */
  readonly working: boolean;
  /** The weekday pattern alone makes the day non-working. */
  readonly weekend: boolean;
  /** Every holiday entry on the date, including shifted originals (`movedTo`) and half days. */
  readonly holidays: readonly ResolvedHoliday[];
  /** The exception deciding the day, or null. */
  readonly exception: BusinessDayException | null;
  readonly halfDay: boolean;
  /** Working hours; empty on a non-working day. */
  readonly hours: readonly TimeRange[];
  /** Null for an ordinary working day. */
  readonly reasonCode: BusinessDayReasonCode | null;
  /** Holiday name or exception reason (plain text), or null. */
  readonly reason: string | null;
  /** 1, the half-day value, or 0. */
  readonly businessDayValue: number;
}

// ---------------------------------------------------------------------------
// Engine (internal)

interface NormEx {
  readonly e: number;
  readonly ex: BusinessDayException;
  readonly hours: readonly MinuteRange[] | undefined;
  readonly halfDay: boolean;
}

/** Special (non-pattern) day. Internal. */
export interface DayRecord {
  readonly holidays: readonly ResolvedHoliday[];
  readonly exception: NormEx | undefined;
  readonly pattern: boolean;
  /** 0 non-working, 1 full working day, 2 working half day. */
  readonly status: 0 | 1 | 2;
  readonly anyFull: boolean;
  readonly halfHours: readonly MinuteRange[] | undefined;
}

interface YearData {
  readonly days: readonly number[];
  readonly records: ReadonlyMap<number, DayRecord>;
  /** Prefix sums, K per slot, (days.length + 1) slots. */
  readonly cum: Float64Array;
}

/** Fields of the special-day prefix sums. */
export const S_PATTERN = 0;
export const S_FULL = 1;
export const S_HALF = 2;
export const S_HOL_WEEKDAY = 3;
export const S_HOL_WEEKEND = 4;
export const S_NONWORKING_WEEKDAY = 5;
export const S_WORKING_WEEKEND = 6;
const K = 7;

/** Internal engine of a calendar. */
export interface Engine {
  readonly cal: BusinessCalendar;
  readonly working: readonly boolean[];
  readonly workingCount: number;
  readonly pre: readonly number[];
  readonly hours: readonly (readonly MinuteRange[])[];
  readonly halfHours: readonly (readonly MinuteRange[])[];
  readonly zone: string;
  readonly rules: readonly NormalizedRule[];
  readonly providers: readonly HolidayProvider[];
  readonly scope: TagScope | undefined;
  readonly exceptions: ReadonlyMap<number, NormEx>;
  readonly exceptionDays: readonly number[];
  readonly workingExceptionDays: readonly number[];
  readonly years: Map<number, YearData>;
  readonly provided: Map<number, readonly NormalizedRule[]>;
  readonly occurrences: Map<string, readonly number[]>;
}

const engines = new WeakMap<BusinessCalendar, Engine>();
const MAX_CACHED_YEARS = 200;
const MAX_OCCURRENCE_CACHE = 5000;
const MAX_RULES = 5000;
const MAX_EXCEPTIONS = 100_000;
const MAX_PROVIDERS = 32;
const MAX_PROVIDED = 10_000;
/** Days around a year scanned for holidays whose observed date moves into it. */
const WINDOW = 45;
/** Year span limit for one counting query. */
const MAX_YEAR_SPAN = 20_000;
/** Extra days searched beyond the estimate before giving up on finding business days. */
const SEARCH_SLACK_DAYS = 366 * 100;

/** Engine of a calendar; throws `HLP_BIZCAL_INVALID_CALENDAR` for anything else. */
export function engineOf(calendar: BusinessCalendar): Engine {
  const value: unknown = calendar;
  const eng = typeof value === 'object' && value !== null ? engines.get(value as BusinessCalendar) : undefined;
  if (!eng) throw invalid('HLP_BIZCAL_INVALID_CALENDAR', 'Expected a calendar created by createBusinessCalendar.');
  return eng;
}

/** Error for calendars without any business day in reach. */
export function noWorkingDays(): never {
  throw invalid('HLP_BIZCAL_NO_WORKING_DAYS', 'The calendar has no business day within the search limit.');
}

const yearOf = (e: number): number => fromEpochDay(e).year;

function inScope(scope: TagScope | undefined, tags: readonly string[]): boolean {
  if (!scope) return true;
  if (tags.length === 0) return scope.includeUntagged ?? true;
  return tags.some((t) => scope.tags.includes(t));
}

function touch<V>(map: Map<number, V>, key: number): V | undefined {
  const hit = map.get(key);
  if (hit !== undefined) {
    map.delete(key);
    map.set(key, hit);
  }
  return hit;
}

function remember<V>(map: Map<number, V>, key: number, value: V): V {
  if (map.size >= MAX_CACHED_YEARS) {
    const oldest = map.keys().next();
    if (oldest.done !== true) map.delete(oldest.value);
  }
  map.set(key, value);
  return value;
}

function providedRules(eng: Engine, year: number): readonly NormalizedRule[] {
  if (eng.providers.length === 0 || Math.abs(year) > MAX_YEAR) return [];
  const hit = touch(eng.provided, year);
  if (hit) return hit;
  const out: NormalizedRule[] = [];
  eng.providers.forEach((p, pi) => {
    const items: unknown = p.holidaysFor(year);
    if (!isArray(items)) throw invalid('HLP_BIZCAL_INVALID_PROVIDER', 'A holiday provider must return an array.', `providers[${String(pi)}]`);
    if (items.length > MAX_PROVIDED) throw limit('HLP_BIZCAL_PROVIDER_LIMIT', 'A holiday provider returned too many holidays for one year.', MAX_PROVIDED);
    items.forEach((item, i) => out.push(normalizeRule(item, `providers[${String(pi)}][${String(i)}]`, { allowProvided: true })));
  });
  return remember(eng.provided, year, Object.freeze(out));
}

function occurrencesOf(eng: Engine, r: NormalizedRule, index: number, year: number): readonly number[] {
  const fn = r.occurrences;
  if (!fn) return [];
  if (index < 0) return fn(year);
  const key = `${String(index)}:${String(year)}`;
  const hit = eng.occurrences.get(key);
  if (hit) return hit;
  const value = fn(year);
  if (eng.occurrences.size >= MAX_OCCURRENCE_CACHE) eng.occurrences.clear();
  eng.occurrences.set(key, value);
  return value;
}

/** Observed date for a holiday on epoch day `e`, or undefined when it stays. */
function observedTarget(eng: Engine, e: number, policy: ObservedPolicy, occupied: ReadonlySet<number>): number | undefined {
  if (policy === 'none') return undefined;
  const wd = weekdayOfEpoch(e);
  const isWorking = (x: number): boolean => eng.working[weekdayOfEpoch(x)] === true;
  let dir: 1 | -1;
  let target: number;
  if (typeof policy === 'string') {
    if (isWorking(e) || eng.workingCount === 0) return undefined;
    if (policy === 'next-weekday') dir = 1;
    else if (policy === 'previous-weekday') dir = -1;
    else {
      let k = 1;
      while (!isWorking(e + k) && !isWorking(e - k)) k++;
      dir = isWorking(e + k) ? 1 : -1;
    }
    target = e + dir;
  } else {
    const offset = policy[wd];
    if (offset === undefined || offset === 0) return undefined;
    dir = offset > 0 ? 1 : -1;
    target = e + offset;
  }
  for (let i = 0; i < 366; i++) {
    if (isWorking(target) && !occupied.has(target)) return target;
    target += dir;
  }
  return undefined;
}

function makeHoliday(e: number, r: NormalizedRule, observed: boolean, originalDate?: number, movedTo?: number): ResolvedHoliday {
  return Object.freeze({
    date: fromEpochDay(e),
    name: r.name,
    kind: r.kind,
    ...(r.id === undefined ? {} : { id: r.id }),
    tags: r.tags,
    halfDay: r.halfDay,
    observed,
    ...(originalDate === undefined ? {} : { originalDate: fromEpochDay(originalDate) }),
    ...(movedTo === undefined ? {} : { movedTo: fromEpochDay(movedTo) }),
  });
}

interface Raw {
  readonly e: number;
  readonly r: NormalizedRule;
  readonly order: number;
}

function resolveYear(eng: Engine, year: number): YearData {
  const yStart = epochOf(year, 1, 1);
  const yEnd = epochOf(year + 1, 1, 1) - 1;
  const wStart = yStart - WINDOW;
  const wEnd = yEnd + WINDOW;
  const raw: Raw[] = [];
  let order = 0;
  const push = (r: NormalizedRule, index: number, years: readonly number[]): void => {
    order++;
    if (!inScope(eng.scope, r.tags)) return;
    if (r.span) {
      const hi = Math.min(r.span[1], wEnd);
      for (let e = Math.max(r.span[0], wStart); e <= hi; e++) raw.push({ e, r, order });
      return;
    }
    for (const ry of years) {
      if (ry < r.fromYear || ry > r.toYear || Math.abs(ry) >= MAX_YEAR) continue;
      for (const e of occurrencesOf(eng, r, index, ry)) if (e >= wStart && e <= wEnd) raw.push({ e, r, order });
    }
  };
  const around = [year - 1, year, year + 1];
  eng.rules.forEach((r, i) => { push(r, i, around); });
  for (const y of around) for (const r of providedRules(eng, y)) push(r, -1, [y]);
  raw.sort((a, b) => a.e - b.e || a.order - b.order);

  const occupied = new Set<number>();
  for (const x of raw) if (!x.r.halfDay) occupied.add(x.e);
  const byDay = new Map<number, { h: ResolvedHoliday; r: NormalizedRule }[]>();
  const seen = new Set<string>();
  const add = (e: number, r: NormalizedRule, observed: boolean, originalDate?: number, movedTo?: number): void => {
    if (e < yStart || e > yEnd) return;
    const key = `${String(e)}|${String(observed)}|${String(r.halfDay)}|${r.kind}|${r.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    let list = byDay.get(e);
    if (!list) {
      list = [];
      byDay.set(e, list);
    }
    list.push({ h: makeHoliday(e, r, observed, originalDate, movedTo), r });
  };
  for (const x of raw) {
    const target = observedTarget(eng, x.e, x.r.observed, occupied);
    if (target === undefined) {
      add(x.e, x.r, false);
    } else {
      add(x.e, x.r, false, undefined, target);
      add(target, x.r, true, x.e);
      if (!x.r.halfDay) occupied.add(target);
    }
  }

  const exStart = lowerBound(eng.exceptionDays, yStart);
  const exEnd = upperBound(eng.exceptionDays, yEnd);
  const keys = new Set<number>(byDay.keys());
  for (let i = exStart; i < exEnd; i++) keys.add(eng.exceptionDays[i] ?? 0);
  const days = [...keys].sort((a, b) => a - b);
  const records = new Map<number, DayRecord>();
  const cum = new Float64Array((days.length + 1) * K);
  days.forEach((e, i) => {
    const list = byDay.get(e) ?? [];
    const ex = eng.exceptions.get(e);
    const pattern = eng.working[weekdayOfEpoch(e)] === true;
    const effectiveFull = list.some(({ h }) => !h.halfDay && h.movedTo === undefined);
    const anyFull = list.some(({ h }) => !h.halfDay);
    const half = list.find(({ h }) => h.halfDay && h.movedTo === undefined);
    let status: 0 | 1 | 2;
    if (ex) status = ex.ex.working ? (ex.halfDay ? 2 : 1) : 0;
    else if (effectiveFull) status = 0;
    else if (half && pattern) status = 2;
    else status = pattern ? 1 : 0;
    records.set(e, Object.freeze({ holidays: Object.freeze(list.map((x) => x.h)), exception: ex, pattern, status, anyFull, halfHours: half?.r.halfHours }));
    const base = i * K;
    const next = base + K;
    const flags = [pattern, status === 1, status === 2, pattern && effectiveFull, !pattern && anyFull, pattern && status === 0, !pattern && status > 0];
    flags.forEach((f, j) => { cum[next + j] = (cum[base + j] ?? 0) + (f ? 1 : 0); });
  });
  return Object.freeze({ days, records, cum });
}

function yearData(eng: Engine, year: number): YearData {
  return touch(eng.years, year) ?? remember(eng.years, year, resolveYear(eng, year));
}

/** Special-day record of an epoch day, if any. */
export function recordAt(eng: Engine, e: number): DayRecord | undefined {
  return yearData(eng, yearOf(e)).records.get(e);
}

/** Working days of the weekday pattern in [lo, hi] (arithmetic, O(1)). */
export function patternCount(eng: Engine, lo: number, hi: number): number {
  if (hi < lo) return 0;
  const p = (x: number): number => Math.floor(x / 7) * eng.workingCount + (eng.pre[((x % 7) + 7) % 7] ?? 0);
  return p(hi + 1) - p(lo);
}

/** Sums of the special-day fields over [lo, hi]: per-year prefix sums + binary search. */
export function specialCounts(eng: Engine, lo: number, hi: number): Float64Array {
  const out = new Float64Array(K);
  if (hi < lo) return out;
  const y1 = yearOf(lo);
  const y2 = yearOf(hi);
  if (y2 - y1 > MAX_YEAR_SPAN) throw limit('HLP_BIZCAL_RANGE_LIMIT', 'The date range spans too many years.', MAX_YEAR_SPAN);
  for (let y = y1; y <= y2; y++) {
    const yd = yearData(eng, y);
    const i = y === y1 ? lowerBound(yd.days, lo) : 0;
    const j = y === y2 ? upperBound(yd.days, hi) : yd.days.length;
    if (j <= i) continue;
    for (let f = 0; f < K; f++) out[f] = (out[f] ?? 0) + (yd.cum[j * K + f] ?? 0) - (yd.cum[i * K + f] ?? 0);
  }
  return out;
}

/** Calls `fn` for every special-day record in [lo, hi], ascending. */
export function recordsIn(eng: Engine, lo: number, hi: number, fn: (e: number, rec: DayRecord) => void): void {
  if (hi < lo) return;
  const y1 = yearOf(lo);
  const y2 = yearOf(hi);
  if (y2 - y1 > MAX_YEAR_SPAN) throw limit('HLP_BIZCAL_RANGE_LIMIT', 'The date range spans too many years.', MAX_YEAR_SPAN);
  for (let y = y1; y <= y2; y++) {
    const yd = yearData(eng, y);
    const j = y === y2 ? upperBound(yd.days, hi) : yd.days.length;
    for (let i = y === y1 ? lowerBound(yd.days, lo) : 0; i < j; i++) {
      const e = yd.days[i] ?? 0;
      const rec = yd.records.get(e);
      if (rec) fn(e, rec);
    }
  }
}

/** Business-day value over [lo, hi], half days weighted by `halfValue`. */
export function businessValue(eng: Engine, lo: number, hi: number, halfValue: number): number {
  if (hi < lo) return 0;
  const s = specialCounts(eng, lo, hi);
  return patternCount(eng, lo, hi) - (s[S_PATTERN] ?? 0) + (s[S_FULL] ?? 0) + halfValue * (s[S_HALF] ?? 0);
}

/** Business days (half days count 1) over [lo, hi]. */
export const businessCount = (eng: Engine, lo: number, hi: number): number => businessValue(eng, lo, hi, 1);

/** Status of an epoch day: 0 non-working, 1 working, 2 half day. O(1) after the year is cached. */
export function statusAt(eng: Engine, e: number): 0 | 1 | 2 {
  const rec = recordAt(eng, e);
  if (rec) return rec.status;
  return eng.working[weekdayOfEpoch(e)] === true ? 1 : 0;
}

/** The `n`-th (n >= 1) business day after `e0`. */
export function stepForward(eng: Engine, e0: number, n: number): number {
  if (eng.workingCount === 0) return eng.workingExceptionDays[upperBound(eng.workingExceptionDays, e0) + n - 1] ?? noWorkingDays();
  const estimate = Math.ceil(n / eng.workingCount) * 7 + 7;
  const cap = estimate + SEARCH_SLACK_DAYS;
  let span = estimate;
  while (businessCount(eng, e0 + 1, e0 + span) < n) {
    if (span >= cap) noWorkingDays();
    span = Math.min(span * 2, cap);
  }
  let lo = 1;
  let hi = span;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (businessCount(eng, e0 + 1, e0 + mid) >= n) hi = mid;
    else lo = mid + 1;
  }
  return e0 + lo;
}

/** The `n`-th (n >= 1) business day before `e0`. */
export function stepBackward(eng: Engine, e0: number, n: number): number {
  if (eng.workingCount === 0) return eng.workingExceptionDays[lowerBound(eng.workingExceptionDays, e0) - n] ?? noWorkingDays();
  const estimate = Math.ceil(n / eng.workingCount) * 7 + 7;
  const cap = estimate + SEARCH_SLACK_DAYS;
  let span = estimate;
  while (businessCount(eng, e0 - span, e0 - 1) < n) {
    if (span >= cap) noWorkingDays();
    span = Math.min(span * 2, cap);
  }
  let lo = 1;
  let hi = span;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (businessCount(eng, e0 - mid, e0 - 1) >= n) hi = mid;
    else lo = mid + 1;
  }
  return e0 - lo;
}

/** Working hours (minutes) of an epoch day, respecting exceptions and half days. */
export function rangesAt(eng: Engine, e: number, rec: DayRecord | undefined = recordAt(eng, e)): readonly MinuteRange[] {
  const wd = weekdayOfEpoch(e);
  const status = rec ? rec.status : eng.working[wd] === true ? 1 : 0;
  if (status === 0) return [];
  const ex = rec?.exception;
  if (ex) return ex.hours ?? (ex.halfDay ? (eng.halfHours[wd] ?? []) : (eng.hours[wd] ?? []));
  if (status === 2) return rec?.halfHours ?? eng.halfHours[wd] ?? [];
  return eng.hours[wd] ?? [];
}

/** Public info for an epoch day. */
export function infoAt(eng: Engine, e: number): BusinessDayInfo {
  const rec = recordAt(eng, e);
  const weekday = weekdayOfEpoch(e);
  const pattern = eng.working[weekday] === true;
  const status = rec ? rec.status : pattern ? 1 : 0;
  const holidays = rec?.holidays ?? [];
  const ex = rec?.exception;
  let reasonCode: BusinessDayReasonCode | null = null;
  let reason: string | null = null;
  if (ex) {
    reasonCode = 'exception';
    reason = ex.ex.reason ?? null;
  } else if (status === 0) {
    const full = holidays.find((h) => !h.halfDay && h.movedTo === undefined) ?? holidays.find((h) => !h.halfDay);
    if (full) {
      reasonCode = 'holiday';
      reason = full.name;
    } else {
      reasonCode = 'weekend';
    }
  } else if (status === 2) {
    reasonCode = 'half-day';
    reason = holidays.find((h) => h.halfDay && h.movedTo === undefined)?.name ?? null;
  }
  return Object.freeze({
    date: fromEpochDay(e),
    weekday,
    working: status !== 0,
    weekend: !pattern,
    holidays,
    exception: ex?.ex ?? null,
    halfDay: status === 2,
    hours: rangesToText(rangesAt(eng, e, rec)),
    reasonCode,
    reason,
    businessDayValue: status === 0 ? 0 : status === 2 ? eng.cal.halfDayValue : 1,
  });
}

// ---------------------------------------------------------------------------
// Creation

const DEFAULT_HOURS: readonly TimeRange[] = Object.freeze([Object.freeze(['09:00', '17:00'] as const)]);
const HOUR_KEYS = new Set(['default', '1', '2', '3', '4', '5', '6', '7']);

function weekdayIn(value: unknown, property: string): IsoWeekday {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 7) throw invalid('HLP_BIZCAL_INVALID_WEEKDAY', 'Expected an ISO weekday 1 (Monday) to 7 (Sunday).', property);
  return value as IsoWeekday;
}

function normalizeWeekend(value: unknown): readonly IsoWeekday[] {
  if (!isArray(value) || value.length > 7) throw invalid('HLP_BIZCAL_INVALID_WEEKEND', 'Weekend must be an array of distinct ISO weekdays.', 'weekend');
  const days = value.map((d) => weekdayIn(d, 'weekend'));
  if (new Set(days).size !== days.length) throw invalid('HLP_BIZCAL_INVALID_WEEKEND', 'Weekend must be an array of distinct ISO weekdays.', 'weekend');
  return Object.freeze([...days].sort((a, b) => a - b));
}

function normalizeHours(value: unknown): { readonly text: WorkingHoursDefinition; readonly byDay: readonly (readonly MinuteRange[])[] } {
  if (value === undefined) value = { default: DEFAULT_HOURS };
  if (!isRecord(value)) throw invalid('HLP_BIZCAL_INVALID_HOURS', 'workingHours must be an object.', 'workingHours');
  const text: Partial<Record<'default' | `${IsoWeekday}`, readonly TimeRange[]>> = {};
  const parsed = new Map<string, readonly MinuteRange[]>();
  for (const key of Object.keys(value)) {
    if (!HOUR_KEYS.has(key)) throw invalid('HLP_BIZCAL_INVALID_HOURS', 'workingHours keys must be "default" or ISO weekdays 1-7.', 'workingHours');
    const ranges = normalizeRanges(value[key], `workingHours.${key}`);
    parsed.set(key, ranges);
    text[key as 'default'] = rangesToText(ranges);
  }
  if (!parsed.has('default')) {
    parsed.set('default', normalizeRanges(DEFAULT_HOURS, 'workingHours.default'));
    text.default = DEFAULT_HOURS;
  }
  const fallback = parsed.get('default') ?? [];
  const byDay: (readonly MinuteRange[])[] = [[]];
  for (let d = 1; d <= 7; d++) byDay.push(parsed.get(String(d)) ?? fallback);
  return { text: Object.freeze(text), byDay: Object.freeze(byDay) };
}

function normalizeException(value: unknown, property: string): NormEx {
  if (!isRecord(value)) throw invalid('HLP_BIZCAL_INVALID_EXCEPTION', 'An exception must be an object.', property);
  const d = normalizeRule({ kind: 'date', name: 'exception', date: value.date }, property).rule as { readonly date: PlainDate };
  if (typeof value.working !== 'boolean') throw invalid('HLP_BIZCAL_INVALID_EXCEPTION', 'Exception working must be a boolean.', `${property}.working`);
  if (value.halfDay !== undefined && typeof value.halfDay !== 'boolean') throw invalid('HLP_BIZCAL_INVALID_EXCEPTION', 'Exception halfDay must be a boolean.', `${property}.halfDay`);
  const halfDay = value.halfDay === true;
  if (!value.working && (halfDay || value.hours !== undefined)) throw invalid('HLP_BIZCAL_INVALID_EXCEPTION', 'Only working exceptions may set hours or halfDay.', property);
  const hours = value.hours === undefined ? undefined : normalizeRanges(value.hours, `${property}.hours`);
  const reason = optionalText(value.reason, `${property}.reason`);
  const ex: BusinessDayException = Object.freeze({
    date: d.date,
    working: value.working,
    ...(hours === undefined ? {} : { hours: rangesToText(hours) }),
    ...(halfDay ? { halfDay } : {}),
    ...(reason === undefined ? {} : { reason }),
  });
  return Object.freeze({ e: toEpochDay(d.date), ex, hours, halfDay });
}

function listOf(value: unknown, property: string, max: number): readonly unknown[] {
  if (value === undefined) return [];
  if (!isArray(value)) throw invalid('HLP_BIZCAL_INVALID_DEFINITION', 'Expected an array.', property);
  if (value.length > max) throw limit('HLP_BIZCAL_TOO_MANY_ITEMS', 'Too many items in a calendar definition list.', max);
  return value;
}

function normalizeScope(value: unknown): TagScope | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw invalid('HLP_BIZCAL_INVALID_TAGS', 'tagScope must be an object.', 'tagScope');
  const tags = normalizeTags(value.tags, 'tagScope.tags');
  if (value.includeUntagged !== undefined && typeof value.includeUntagged !== 'boolean') throw invalid('HLP_BIZCAL_INVALID_TAGS', 'includeUntagged must be a boolean.', 'tagScope.includeUntagged');
  return Object.freeze({ tags, ...(value.includeUntagged === undefined ? {} : { includeUntagged: value.includeUntagged }) });
}

/**
 * Creates an immutable, validated business calendar. Invalid definitions throw
 * `ValidationError` (`HLP_BIZCAL_*`; details name the property path, never the value); list
 * sizes are bounded (`LimitError`). Holidays are expanded lazily per year and cached (200
 * years, LRU) on the instance.
 * @example
 * const cal = createBusinessCalendar({
 *   weekend: [6, 7],
 *   holidays: [fixedHoliday('New Year', 1, 1, { observed: 'nearest-weekday' }), easterHoliday('Good Friday', -2)],
 *   workingHours: { default: [['09:00', '13:00'], ['14:00', '18:00']], 5: [['09:00', '13:00']] },
 *   timeZone: 'Asia/Kolkata',
 * });
 * isHoliday('2027-03-26', cal)?.name; // => 'Good Friday'
 * isBusinessDay('2027-12-31', cal); // => false // New Year 2028 falls on a Saturday
 * getBusinessDay('2026-10-02', cal).hours; // => [['09:00', '13:00']] // Friday hours
 * @example
 * createBusinessCalendar({ fiscalYearStartMonth: 13 }); // => throws HLP_BIZCAL_INVALID_FISCAL
 */
export function createBusinessCalendar(definition: BusinessCalendarDefinition = {}): BusinessCalendar {
  if (!isRecord(definition)) throw invalid('HLP_BIZCAL_INVALID_DEFINITION', 'A business calendar definition must be an object.');
  const def: Readonly<Record<string, unknown>> = definition;
  const name = def.name === undefined ? 'Business calendar' : requiredName(def.name, 'name');
  const locale = optionalText(def.locale, 'locale', 128);
  const week = locale === undefined ? undefined : getWeekInfo(locale);
  const weekend = normalizeWeekend(def.weekend ?? week?.weekend ?? [6, 7]);
  const firstDayOfWeek = def.firstDayOfWeek === undefined ? (week?.firstDay ?? 1) : weekdayIn(def.firstDayOfWeek, 'firstDayOfWeek');
  const timeZone = def.timeZone ?? 'UTC';
  if (typeof timeZone !== 'string' || !isValidTimeZone(timeZone)) throw invalid('HLP_BIZCAL_INVALID_TIME_ZONE', 'Unsupported time zone identifier.', 'timeZone');
  const fiscalYearStartMonth = def.fiscalYearStartMonth ?? 1;
  if (typeof fiscalYearStartMonth !== 'number' || !Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) throw invalid('HLP_BIZCAL_INVALID_FISCAL', 'fiscalYearStartMonth must be 1-12.', 'fiscalYearStartMonth');
  const fiscalYearNaming = def.fiscalYearNaming ?? 'end';
  if (fiscalYearNaming !== 'end' && fiscalYearNaming !== 'start') throw invalid('HLP_BIZCAL_INVALID_FISCAL', 'fiscalYearNaming must be end or start.', 'fiscalYearNaming');
  const halfDayValue = def.halfDayValue ?? 0.5;
  if (typeof halfDayValue !== 'number' || !Number.isFinite(halfDayValue) || halfDayValue < 0 || halfDayValue > 1) throw invalid('HLP_BIZCAL_INVALID_HALF_DAY', 'halfDayValue must be between 0 and 1.', 'halfDayValue');
  const halfDayHours = def.halfDayHours === undefined ? undefined : normalizeRanges(def.halfDayHours, 'halfDayHours');
  const hours = normalizeHours(def.workingHours);
  const holidayRules = listOf(def.holidays, 'holidays', MAX_RULES).map((r, i) => normalizeRule(r, `holidays[${String(i)}]`));
  const halfRules = listOf(def.halfDays, 'halfDays', MAX_RULES).map((r, i) => normalizeRule(r, `halfDays[${String(i)}]`, { forceHalf: true }));
  const exList = listOf(def.exceptions, 'exceptions', MAX_EXCEPTIONS).map((x, i) => normalizeException(x, `exceptions[${String(i)}]`));
  const exceptions = new Map<number, NormEx>();
  exList.forEach((x, i) => {
    if (exceptions.has(x.e)) throw invalid('HLP_BIZCAL_DUPLICATE_EXCEPTION', 'Only one exception per date is allowed.', `exceptions[${String(i)}].date`);
    exceptions.set(x.e, x);
  });
  const providers = listOf(def.providers, 'providers', MAX_PROVIDERS).map((p, i) => {
    if (!isRecord(p) || typeof p.holidaysFor !== 'function') throw invalid('HLP_BIZCAL_INVALID_PROVIDER', 'A holiday provider needs a holidaysFor(year) function.', `providers[${String(i)}]`);
    return p as unknown as HolidayProvider;
  });
  const tagScope = normalizeScope(def.tagScope);

  const weekendSet = new Set<number>(weekend);
  const working: boolean[] = [false];
  for (let d = 1; d <= 7; d++) working.push(!weekendSet.has(d));
  const workingWeekdays = Object.freeze(([1, 2, 3, 4, 5, 6, 7] as const).filter((d) => working[d] === true));
  const pre = [0];
  for (let r = 0; r < 7; r++) pre.push((pre[r] ?? 0) + (working[weekdayOfEpoch(r)] === true ? 1 : 0));
  const halfHours: (readonly MinuteRange[])[] = hours.byDay.map((h) => halfDayHours ?? firstHalf(h));
  const exceptionDays = [...exceptions.keys()].sort((a, b) => a - b);
  const workingExceptionDays = exceptionDays.filter((e) => exceptions.get(e)?.ex.working === true);
  const holidays = Object.freeze(holidayRules.map((r) => r.rule as HolidayRule));
  const halfDays = Object.freeze(halfRules.map((r) => r.rule as HolidayRule));
  const exceptionValues = Object.freeze(exList.map((x) => x.ex));
  const providerList = Object.freeze([...providers]);

  const normalized: BusinessCalendarDefinition = Object.freeze({
    name,
    weekend,
    firstDayOfWeek,
    holidays,
    halfDays,
    halfDayValue,
    ...(halfDayHours === undefined ? {} : { halfDayHours: rangesToText(halfDayHours) }),
    exceptions: exceptionValues,
    workingHours: hours.text,
    timeZone,
    fiscalYearStartMonth,
    fiscalYearNaming,
    providers: providerList,
    ...(tagScope === undefined ? {} : { tagScope }),
  });
  const resolvedHours: Partial<Record<`${IsoWeekday}`, readonly TimeRange[]>> = {};
  for (let d = 1; d <= 7; d++) resolvedHours[String(d) as `${IsoWeekday}`] = rangesToText(hours.byDay[d] ?? []);
  const cal: BusinessCalendar = Object.freeze({
    kind: 'BusinessCalendar',
    name,
    weekend,
    workingWeekdays,
    firstDayOfWeek,
    timeZone,
    fiscalYearStartMonth,
    fiscalYearNaming,
    halfDayValue,
    workingHours: Object.freeze(resolvedHours as Record<`${IsoWeekday}`, readonly TimeRange[]>),
    holidays,
    halfDays,
    exceptions: exceptionValues,
    providers: providerList,
    tagScope,
    definition: normalized,
  });
  engines.set(cal, {
    cal,
    working: Object.freeze(working),
    workingCount: workingWeekdays.length,
    pre: Object.freeze(pre),
    hours: hours.byDay,
    halfHours: Object.freeze(halfHours),
    zone: timeZone,
    rules: Object.freeze([...holidayRules, ...halfRules]),
    providers: providerList,
    scope: tagScope,
    exceptions,
    exceptionDays,
    workingExceptionDays,
    years: new Map(),
    provided: new Map(),
    occurrences: new Map(),
  });
  return cal;
}

/**
 * True for values created by `createBusinessCalendar`.
 * @example
 * isBusinessCalendar(createBusinessCalendar()); // => true
 * isBusinessCalendar({ kind: 'BusinessCalendar', weekend: [6, 7] }); // => false // not created by createBusinessCalendar
 */
export function isBusinessCalendar(value: unknown): value is BusinessCalendar {
  return typeof value === 'object' && value !== null && engines.has(value as BusinessCalendar);
}

let defaultCalendar: BusinessCalendar | undefined;

/**
 * The shared default calendar: Saturday/Sunday weekend, no holidays, 09:00-17:00, UTC. Used
 * when a function's `calendar` argument is omitted.
 * @example
 * isBusinessDay('2026-09-26', defaultBusinessCalendar()); // => false // Saturday
 * isBusinessDay('2026-12-25', defaultBusinessCalendar()); // => true // no holidays by default
 * defaultBusinessCalendar().timeZone; // => 'UTC'
 */
export function defaultBusinessCalendar(): BusinessCalendar {
  defaultCalendar ??= createBusinessCalendar({ name: 'Default' });
  return defaultCalendar;
}

/**
 * Weekend days of a locale (CLDR via `Intl.Locale#getWeekInfo`, with an embedded fallback).
 * @example weekendForLocale('ar-SA') // => [5, 6]
 * @example weekendForLocale('en-IN') // => [7]
 */
export function weekendForLocale(locale?: string): readonly IsoWeekday[] {
  return getWeekInfo(locale).weekend;
}

function tagsOf(item: unknown): readonly string[] {
  if (!isRecord(item) || !isArray(item.tags)) return [];
  return item.tags.filter((t): t is string => typeof t === 'string');
}

function scopedProvider(provider: HolidayProvider, scope: TagScope): HolidayProvider {
  return Object.freeze({ holidaysFor: (year: number) => provider.holidaysFor(year).filter((item) => inScope(scope, tagsOf(item))) });
}

/**
 * Combines calendars: the union of holidays, half days, providers, and exceptions (the first
 * calendar wins when two define an exception for the same date). Weekend, hours, time zone,
 * fiscal settings, and half-day settings come from the first calendar unless `overrides` sets
 * them. Each input's tag scope is applied to its own holidays before merging.
 * @example
 * const company = createBusinessCalendar({ name: 'Company', holidays: [fixedHoliday('Founders Day', 3, 16)] });
 * const regional = createBusinessCalendar({ name: 'Karnataka', holidays: [fixedHoliday('Kannada Rajyotsava', 11, 1, { observed: 'next-weekday' })] });
 * const team = mergeCalendars([company, regional], { name: 'Bengaluru team' });
 * team.name; // => 'Bengaluru team'
 * isBusinessDay('2026-03-16', team); // => false // Founders Day, a Monday
 * isHoliday('2026-11-02', team)?.name; // => 'Kannada Rajyotsava' // Sunday 1st observed on Monday
 */
export function mergeCalendars(calendars: readonly BusinessCalendar[], overrides: BusinessCalendarDefinition = {}): BusinessCalendar {
  if (!isArray(calendars) || calendars.length === 0) throw invalid('HLP_BIZCAL_INVALID_CALENDAR', 'mergeCalendars needs at least one calendar.', 'calendars');
  const engs = calendars.map((c) => engineOf(c));
  const [head] = engs;
  if (!head) throw invalid('HLP_BIZCAL_INVALID_CALENDAR', 'mergeCalendars needs at least one calendar.', 'calendars');
  const first = head.cal;
  const holidays: HolidayRule[] = [];
  const halfDays: HolidayRule[] = [];
  const providers: HolidayProvider[] = [];
  const exceptions: BusinessDayException[] = [];
  const seen = new Set<number>();
  for (const eng of engs) {
    const { cal, scope } = eng;
    const keep = (r: HolidayRule): boolean => inScope(scope, r.tags ?? []);
    holidays.push(...cal.holidays.filter(keep));
    halfDays.push(...cal.halfDays.filter(keep));
    for (const p of cal.providers) providers.push(scope ? scopedProvider(p, scope) : p);
    for (const ex of cal.exceptions) {
      const e = toEpochDay(ex.date as PlainDate);
      if (seen.has(e)) continue;
      seen.add(e);
      exceptions.push(ex);
    }
  }
  return createBusinessCalendar({
    ...first.definition,
    tagScope: undefined,
    name: calendars.map((c) => c.name).join(' + '),
    holidays,
    halfDays,
    providers,
    exceptions,
    ...overrides,
  });
}

/**
 * A copy of the calendar whose holidays are limited to rules tagged with one of `tags`
 * (untagged rules stay unless `includeUntagged: false`). Replaces any previous scope.
 * @example
 * const india = createBusinessCalendar({
 *   weekend: [7],
 *   holidays: [
 *     fixedHoliday('Republic Day', 1, 26),
 *     fixedHoliday('Maharashtra Day', 5, 1, { tags: ['IN-MH'] }),
 *     fixedHoliday('Kannada Rajyotsava', 11, 1, { tags: ['IN-KA'] }),
 *   ],
 * });
 * const karnataka = withTags(india, ['IN-KA']);
 * listHolidays('2026-01-01', '2026-12-31', karnataka).map((h) => h.name); // => ['Republic Day', 'Kannada Rajyotsava']
 * isBusinessDay('2026-05-01', karnataka); // => true // Maharashtra Day does not apply
 * listHolidays('2026-01-01', '2026-12-31', withTags(india, ['IN-MH'], { includeUntagged: false })).map((h) => h.name); // => ['Maharashtra Day']
 */
export function withTags(calendar: BusinessCalendar, tags: readonly string[], options: { readonly includeUntagged?: boolean } = {}): BusinessCalendar {
  const { cal } = engineOf(calendar);
  return createBusinessCalendar({ ...cal.definition, tagScope: { tags, ...(options.includeUntagged === undefined ? {} : { includeUntagged: options.includeUntagged }) } });
}
