/**
 * Business calendar engine (SPEC section 18.7): working weekdays, working hours,
 * holidays, and per-date exceptions, with working-day arithmetic. Pure and
 * DOM-free; used by the Business Calendar component and the Scheduler (and,
 * later, Gantt). Dates are `PlainDate` (no timezone); working hours become
 * instants only through `workingIntervals` with an explicit timezone.
 *
 * Precedence for a date: exception, then holiday, then the weekday pattern.
 *
 * Working-day navigation and counting delegate to @absoluteui/helpers/business-calendar
 * (R5 H7): counts no longer iterate day by day and are exact for any range.
 */
import {
  addBusinessDays,
  createBusinessCalendar as createHelperCalendar,
  diffDays,
  fixedHoliday,
  nextBusinessDay,
  oneOffHoliday,
  previousBusinessDay,
  type BusinessCalendar as HelperCalendar,
  type HolidayRule,
} from '@absoluteui/helpers/business-calendar';
import { isHelperError } from '@absoluteui/helpers/error';
import {
  addDays,
  configurationError,
  dayOfWeek,
  plainDateTime,
  plainDateToString,
  plainTime,
  runtimeError,
  toInstant,
  toPlainDateTime,
  validators,
  type Disambiguation,
  type Instant,
  type IsoWeekday,
  type PlainDate,
  type PlainTime,
  type Range,
} from '@absoluteui/core';

/** Working time within a day: `start` inclusive, `end` exclusive; `end` 00:00 means midnight at the end of the day. */
export interface WorkingHours {
  readonly start: PlainTime;
  readonly end: PlainTime;
}

export interface BusinessHoliday {
  readonly date: PlainDate;
  /** Name shown in the calendar and announced (text only). */
  readonly name: string;
  /** Repeats on the same month and day every year. Default false. */
  readonly yearly?: boolean;
}

/** Overrides the pattern and holidays for one date. */
export interface BusinessDayException {
  readonly date: PlainDate;
  readonly working: boolean;
  /** Hours of a working exception. Default: the weekday's hours, else `hours`. */
  readonly hours?: readonly WorkingHours[];
  /** Optional reason (for example "Stocktaking"). */
  readonly name?: string;
}

export interface BusinessCalendarDefinition {
  /** Working weekdays (ISO, 1 = Monday). Default Monday to Friday. */
  readonly workingDays?: readonly IsoWeekday[];
  /** Hours of every working day. Default 09:00 to 17:00. */
  readonly hours?: readonly WorkingHours[];
  /** Hours per weekday (keys "1".."7"), overriding `hours`. */
  readonly weekdayHours?: Readonly<Partial<Record<`${IsoWeekday}`, readonly WorkingHours[]>>>;
  readonly holidays?: readonly BusinessHoliday[];
  readonly exceptions?: readonly BusinessDayException[];
}

export interface BusinessDay {
  readonly date: PlainDate;
  readonly working: boolean;
  /** Working hours; empty on a non-working day. */
  readonly hours: readonly WorkingHours[];
  /** Holiday name, or null. */
  readonly holiday: string | null;
  /** An exception decides the day. */
  readonly exception: boolean;
  /** Exception reason, or null. */
  readonly reason: string | null;
  /** The weekday pattern alone makes the day non-working (a weekend). */
  readonly weekend: boolean;
}

export interface BusinessCalendarEngine {
  /** The validated definition (defaults applied). */
  readonly definition: Required<Pick<BusinessCalendarDefinition, 'workingDays' | 'hours' | 'holidays' | 'exceptions'>> & Pick<BusinessCalendarDefinition, 'weekdayHours'>;
  day(date: PlainDate): BusinessDay;
  isWorkingDay(date: PlainDate): boolean;
  /** `date` moved by `days` working days (negative moves back); 0 returns `date`. */
  addWorkingDays(date: PlainDate, days: number): PlainDate;
  /** Working days in [start, end) (negative when end is before start). */
  workingDaysBetween(start: PlainDate, end: PlainDate): number;
  /** The first working day on or after (`includeSelf`, default) or after `date`. */
  nextWorkingDay(date: PlainDate, includeSelf?: boolean): PlainDate;
  previousWorkingDay(date: PlainDate, includeSelf?: boolean): PlainDate;
  /** Working hours of a date as instants in a timezone. */
  workingIntervals(date: PlainDate, timeZone: string, disambiguation?: Disambiguation): Range<Instant>[];
  /** Whether an instant falls into working hours in a timezone. */
  isWorkingTime(value: Instant, timeZone: string): boolean;
}

const DEFAULT_DAYS: readonly IsoWeekday[] = Object.freeze([1, 2, 3, 4, 5]);
const ALL_DAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

function fail(property: string, expected: string): never {
  throw configurationError('BUSINESS_CALENDAR_DEFINITION', 'Invalid business calendar definition.', { component: 'businessCalendar', property: `definition.${property}`, expected });
}

const kind = (v: unknown): unknown => (typeof v === 'object' && v !== null ? (v as { kind?: unknown }).kind : undefined);
const minutes = (t: PlainTime): number => t.hour * 60 + t.minute + t.second / 60;
const endMinutes = (t: PlainTime): number => (minutes(t) === 0 ? 1440 : minutes(t));

function assertHours(value: unknown, property: string): readonly WorkingHours[] {
  if (!Array.isArray(value)) fail(property, 'WorkingHours[]');
  let previousEnd = -1;
  const list = [...(value as WorkingHours[])].sort((a, b) => minutes(a.start) - minutes(b.start));
  list.forEach((h, i) => {
    if (!validators.isRecord(h) || kind(h.start) !== 'PlainTime' || kind(h.end) !== 'PlainTime') fail(`${property}[${String(i)}]`, '{ start: PlainTime; end: PlainTime }');
    if (endMinutes(h.end) <= minutes(h.start)) fail(`${property}[${String(i)}].end`, 'after start (00:00 means midnight)');
    if (minutes(h.start) < previousEnd) fail(`${property}[${String(i)}]`, 'non-overlapping ranges');
    previousEnd = endMinutes(h.end);
  });
  return Object.freeze(list);
}

function assertDate(value: unknown, property: string): void {
  if (kind(value) !== 'PlainDate') fail(property, 'PlainDate');
}

/** Validate a definition and apply defaults. Throws `BUSINESS_CALENDAR_DEFINITION`. */
export function normalizeBusinessCalendar(def: BusinessCalendarDefinition = {}): BusinessCalendarEngine['definition'] {
  if (!validators.isRecord(def)) fail('', 'BusinessCalendarDefinition');
  const days: unknown = def.workingDays ?? DEFAULT_DAYS;
  if (!Array.isArray(days) || !days.every((d) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7)) fail('workingDays', 'ISO weekdays 1..7');
  const workingDays = Object.freeze([...new Set(days as IsoWeekday[])].sort((a, b) => a - b));
  const hours = def.hours === undefined ? Object.freeze([Object.freeze({ start: plainTime(9), end: plainTime(17) })]) : assertHours(def.hours, 'hours');
  let weekdayHours: BusinessCalendarDefinition['weekdayHours'];
  if (def.weekdayHours !== undefined) {
    if (!validators.isRecord(def.weekdayHours)) fail('weekdayHours', 'record of "1".."7" to WorkingHours[]');
    const out: Partial<Record<`${IsoWeekday}`, readonly WorkingHours[]>> = {};
    for (const [key, value] of Object.entries(def.weekdayHours)) {
      if (!/^[1-7]$/.test(key)) fail(`weekdayHours.${key}`, 'key "1".."7"');
      out[key as `${IsoWeekday}`] = assertHours(value, `weekdayHours.${key}`);
    }
    weekdayHours = Object.freeze(out);
  }
  const holidays: unknown = def.holidays ?? [];
  if (!Array.isArray(holidays)) fail('holidays', 'BusinessHoliday[]');
  (holidays as unknown[]).forEach((h, i) => {
    if (!validators.isRecord(h)) fail(`holidays[${String(i)}]`, 'BusinessHoliday');
    assertDate(h.date, `holidays[${String(i)}].date`);
    if (typeof h.name !== 'string' || h.name.trim() === '') fail(`holidays[${String(i)}].name`, 'non-empty string');
    if (h.yearly !== undefined && typeof h.yearly !== 'boolean') fail(`holidays[${String(i)}].yearly`, 'boolean');
  });
  const exceptions: unknown = def.exceptions ?? [];
  if (!Array.isArray(exceptions)) fail('exceptions', 'BusinessDayException[]');
  const seen = new Set<string>();
  (exceptions as unknown[]).forEach((e, i) => {
    if (!validators.isRecord(e)) fail(`exceptions[${String(i)}]`, 'BusinessDayException');
    assertDate(e.date, `exceptions[${String(i)}].date`);
    const key = plainDateToString(e.date as PlainDate);
    if (seen.has(key)) fail(`exceptions[${String(i)}].date`, 'one exception per date');
    seen.add(key);
    if (typeof e.working !== 'boolean') fail(`exceptions[${String(i)}].working`, 'boolean');
    if (e.hours !== undefined) assertHours(e.hours, `exceptions[${String(i)}].hours`);
    if (e.name !== undefined && typeof e.name !== 'string') fail(`exceptions[${String(i)}].name`, 'string');
  });
  return Object.freeze({
    workingDays,
    hours,
    ...(weekdayHours === undefined ? {} : { weekdayHours }),
    holidays: Object.freeze([...(holidays as BusinessHoliday[])]),
    exceptions: Object.freeze([...(exceptions as BusinessDayException[])]),
  });
}

const md = (d: PlainDate): string => plainDateToString(d).slice(-5);

/** Create an engine for a definition (validated; throws `BUSINESS_CALENDAR_DEFINITION`). */
export function createBusinessCalendar(definition: BusinessCalendarDefinition = {}): BusinessCalendarEngine {
  const def = normalizeBusinessCalendar(definition);
  const working = new Set<number>(def.workingDays);
  const exact = new Map<string, string>();
  const yearly = new Map<string, string>();
  for (const h of def.holidays) {
    if (h.yearly === true) yearly.set(md(h.date), h.name);
    else exact.set(plainDateToString(h.date), h.name);
  }
  const exceptions = new Map(def.exceptions.map((e) => [plainDateToString(e.date), e]));
  const hoursOf = (weekday: number): readonly WorkingHours[] => def.weekdayHours?.[String(weekday) as `${IsoWeekday}`] ?? def.hours;
  const cache = new Map<string, BusinessDay>();

  const day = (date: PlainDate): BusinessDay => {
    const key = plainDateToString(date);
    const hit = cache.get(key);
    if (hit) return hit;
    const weekday = dayOfWeek(date);
    const pattern = working.has(weekday);
    const holiday = exact.get(key) ?? (yearly.get(md(date)) ?? null);
    const ex = exceptions.get(key);
    const isWorking = ex ? ex.working : pattern && holiday === null;
    const result: BusinessDay = Object.freeze({
      date,
      working: isWorking,
      hours: isWorking ? (ex?.hours ?? hoursOf(weekday)) : Object.freeze([]),
      holiday,
      exception: ex !== undefined,
      reason: ex?.name ?? null,
      weekend: !pattern,
    });
    if (cache.size > 4000) cache.clear();
    cache.set(key, result);
    return result;
  };

  // Same working/non-working decision as `day()`: weekend pattern, holidays, exceptions.
  const helper: HelperCalendar = createHelperCalendar({
    weekend: ALL_DAYS.filter((d) => !working.has(d)),
    holidays: def.holidays.map((h): HolidayRule => (h.yearly === true ? fixedHoliday(h.name, h.date.month, h.date.day) : oneOffHoliday(h.name, h.date))),
    exceptions: def.exceptions.map((e) => ({ date: e.date, working: e.working, ...(e.name === undefined ? {} : { reason: e.name }) })),
  });
  const navigate = <T>(run: () => T): T => {
    try {
      return run();
    } catch (e) {
      if (isHelperError(e, 'HLP_BIZCAL_NO_WORKING_DAYS')) {
        throw runtimeError('BUSINESS_CALENDAR_NO_WORKING_DAYS', 'No working day found.', { component: 'businessCalendar', remediation: 'Define at least one working weekday or working exception.' });
      }
      throw e;
    }
  };

  return {
    definition: def,
    day,
    isWorkingDay: (date) => day(date).working,
    addWorkingDays(date, days) {
      if (!Number.isInteger(days)) fail('addWorkingDays.days', 'integer');
      return days === 0 ? date : navigate(() => addBusinessDays(date, days, helper));
    },
    workingDaysBetween: (start, end) => navigate(() => diffDays(start, end, { mode: 'business', inclusive: 'start', calendar: helper })),
    nextWorkingDay: (date, includeSelf = true) => navigate(() => nextBusinessDay(date, helper, { includeSelf })),
    previousWorkingDay: (date, includeSelf = true) => navigate(() => previousBusinessDay(date, helper, { includeSelf })),
    workingIntervals(date, timeZone, disambiguation) {
      return day(date).hours.map((h) => {
        const start = toInstant(plainDateTime(date, h.start), timeZone, disambiguation);
        const endDate = minutes(h.end) === 0 ? addDays(date, 1) : date;
        const end = toInstant(plainDateTime(endDate, h.end), timeZone, disambiguation);
        return { start, end };
      });
    },
    isWorkingTime(value, timeZone) {
      const local = toPlainDateTime(value, timeZone);
      const m = minutes(local.time);
      return day(local.date).hours.some((h) => m >= minutes(h.start) && m < endMinutes(h.end));
    },
  };
}
