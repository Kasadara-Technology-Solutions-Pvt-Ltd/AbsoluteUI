/**
 * Data Grid filtering (docs/PLAN-R11-G2.md): JSON filter models per column, validation of
 * untrusted models (state, URLs), and compiled predicates. Text matching is case- and
 * accent-insensitive by default; dates compare calendar days in the configured time zone;
 * relative ranges use the locale's first day of the week; business operators use the column's
 * business calendar. No string expressions are evaluated.
 */
import { addDays, addMonths, comparePlainDate, configurationError, dayOfWeek, instant, parsePlainDate, plainDate, toPlainDateTime, type PlainDate } from '@absoluteui/core';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';
import { isInstantLike, isPlainDate } from '../data-table/model.js';

export type DataGridFilterKind = 'text' | 'number' | 'bigint' | 'date' | 'boolean' | 'set';
export type DataGridFilterJoin = 'and' | 'or';
export type DataGridTextOperator = 'contains' | 'notContains' | 'equals' | 'notEquals' | 'startsWith' | 'endsWith' | 'blank' | 'notBlank';
export type DataGridNumberOperator = 'equals' | 'notEquals' | 'lessThan' | 'lessThanOrEqual' | 'greaterThan' | 'greaterThanOrEqual' | 'between' | 'blank' | 'notBlank';
export type DataGridDateOperator =
  | 'on' | 'notOn' | 'before' | 'after' | 'onOrBefore' | 'onOrAfter' | 'between' | 'blank' | 'notBlank'
  | 'today' | 'yesterday' | 'tomorrow' | 'thisWeek' | 'lastWeek' | 'nextWeek' | 'thisMonth' | 'lastMonth' | 'nextMonth'
  | 'thisQuarter' | 'lastQuarter' | 'nextQuarter' | 'thisYear' | 'lastYear' | 'nextYear' | 'yearToDate' | 'lastDays' | 'nextDays'
  | 'workingDay' | 'nonWorkingDay' | 'holiday' | 'lastBusinessDays' | 'nextBusinessDays';

export interface DataGridTextCondition {
  readonly operator: DataGridTextOperator;
  readonly value?: string;
}
export interface DataGridNumberCondition {
  readonly operator: DataGridNumberOperator;
  readonly value?: number;
  /** Upper bound of `between` (inclusive). */
  readonly to?: number;
}
/** BigInt values as decimal strings (JSON-safe). */
export interface DataGridBigIntCondition {
  readonly operator: DataGridNumberOperator;
  readonly value?: string;
  readonly to?: string;
}
/** Dates as ISO `YYYY-MM-DD`; `count` for lastDays, nextDays, lastBusinessDays, nextBusinessDays. */
export interface DataGridDateCondition {
  readonly operator: DataGridDateOperator;
  readonly value?: string;
  readonly to?: string;
  readonly count?: number;
}

export interface DataGridTextFilter {
  readonly kind: 'text';
  readonly join?: DataGridFilterJoin;
  readonly conditions: readonly DataGridTextCondition[];
}
export interface DataGridNumberFilter {
  readonly kind: 'number';
  readonly join?: DataGridFilterJoin;
  readonly conditions: readonly DataGridNumberCondition[];
}
export interface DataGridBigIntFilter {
  readonly kind: 'bigint';
  readonly join?: DataGridFilterJoin;
  readonly conditions: readonly DataGridBigIntCondition[];
}
export interface DataGridDateFilter {
  readonly kind: 'date';
  readonly join?: DataGridFilterJoin;
  readonly conditions: readonly DataGridDateCondition[];
}
/** `value: null` matches blanks. */
export interface DataGridBooleanFilter {
  readonly kind: 'boolean';
  readonly value: boolean | null;
}
/** Rows whose displayed value is one of `values` (`null` = blanks). */
export interface DataGridSetFilter {
  readonly kind: 'set';
  readonly values: readonly (string | null)[];
}

export type DataGridFilter = DataGridTextFilter | DataGridNumberFilter | DataGridBigIntFilter | DataGridDateFilter | DataGridBooleanFilter | DataGridSetFilter;
/** Active filters by column id. JSON-safe. */
export type DataGridFilters = Readonly<Record<string, DataGridFilter>>;

export const TEXT_OPERATORS: readonly DataGridTextOperator[] = ['contains', 'notContains', 'equals', 'notEquals', 'startsWith', 'endsWith', 'blank', 'notBlank'];
export const NUMBER_OPERATORS: readonly DataGridNumberOperator[] = ['equals', 'notEquals', 'lessThan', 'lessThanOrEqual', 'greaterThan', 'greaterThanOrEqual', 'between', 'blank', 'notBlank'];
export const DATE_OPERATORS: readonly DataGridDateOperator[] = [
  'on', 'notOn', 'before', 'after', 'onOrBefore', 'onOrAfter', 'between', 'blank', 'notBlank',
  'today', 'yesterday', 'tomorrow', 'thisWeek', 'lastWeek', 'nextWeek', 'thisMonth', 'lastMonth', 'nextMonth',
  'thisQuarter', 'lastQuarter', 'nextQuarter', 'thisYear', 'lastYear', 'nextYear', 'yearToDate', 'lastDays', 'nextDays',
  'workingDay', 'nonWorkingDay', 'holiday', 'lastBusinessDays', 'nextBusinessDays',
];
export const BUSINESS_OPERATORS: ReadonlySet<DataGridDateOperator> = new Set(['workingDay', 'nonWorkingDay', 'holiday', 'lastBusinessDays', 'nextBusinessDays']);
const COUNTED: ReadonlySet<string> = new Set(['lastDays', 'nextDays', 'lastBusinessDays', 'nextBusinessDays']);
const NO_VALUE: ReadonlySet<string> = new Set(['blank', 'notBlank', 'today', 'yesterday', 'tomorrow', 'thisWeek', 'lastWeek', 'nextWeek', 'thisMonth', 'lastMonth', 'nextMonth', 'thisQuarter', 'lastQuarter', 'nextQuarter', 'thisYear', 'lastYear', 'nextYear', 'yearToDate', 'workingDay', 'nonWorkingDay', 'holiday']);

/** Whether an operator needs no value input. */
export const operatorNeedsValue = (operator: string): boolean => !NO_VALUE.has(operator) && !COUNTED.has(operator);
/** Whether an operator takes a day count. */
export const operatorNeedsCount = (operator: string): boolean => COUNTED.has(operator);

/** Everything the engine needs to know about a filterable column. */
export interface FilterColumn<Row> {
  readonly id: string;
  readonly kind: DataGridFilterKind;
  /** Displayed text (text, set, and quick filters match it). */
  readonly text: (row: Row) => string;
  /** Raw value (number, bigint, date, boolean filters compare it). */
  readonly value: (row: Row) => unknown;
  readonly caseSensitive: boolean;
  readonly accentSensitive: boolean;
  readonly calendar: BusinessCalendarEngine | undefined;
}

export interface FilterEnvironment {
  readonly locale: string;
  readonly timezone: string;
  /** Today in the configured time zone. */
  readonly today: PlainDate;
  /** ISO weekday the locale's week starts on. */
  readonly firstDayOfWeek: number;
}

// ---- Validation (untrusted input) --------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDecimal = (v: unknown): v is string => typeof v === 'string' && /^-?\d+$/.test(v);
const isIsoDate = (v: unknown): v is string => typeof v === 'string' && parsePlainDate(v) !== null;

function invalid(path: string, expected: string): never {
  throw configurationError('DATA_GRID_FILTER', 'Invalid data grid filter.', { component: 'dataGrid', property: `dataGrid.${path}`, expected });
}

function conditions(value: unknown, path: string, check: (c: Record<string, unknown>, at: string) => void): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) invalid(`${path}.conditions`, 'array of 1 to 10 conditions');
  return (value as unknown[]).map((c, i) => {
    if (!isRecord(c)) invalid(`${path}.conditions[${String(i)}]`, 'condition object');
    check(c, `${path}.conditions[${String(i)}]`);
    return c;
  });
}

/** Validate a filter model for a column of `kind`. Throws DATA_GRID_FILTER; returns a clean copy. */
export function parseFilter(value: unknown, kind: DataGridFilterKind, path: string): DataGridFilter {
  if (!isRecord(value) || value.kind !== kind) invalid(path, `{ kind: "${kind}", ... }`);
  const join: DataGridFilterJoin | undefined = value.join === 'and' ? 'and' : value.join === 'or' ? 'or' : value.join === undefined ? undefined : invalid(`${path}.join`, '"and" | "or"');
  const withJoin = join === undefined ? {} : { join };
  switch (kind) {
    case 'text': {
      const list = conditions(value.conditions, path, (c, at) => {
        if (!TEXT_OPERATORS.includes(c.operator as DataGridTextOperator)) invalid(`${at}.operator`, TEXT_OPERATORS.join(' | '));
        if (c.value !== undefined && typeof c.value !== 'string') invalid(`${at}.value`, 'string');
      });
      return { kind: 'text', ...withJoin, conditions: list.map((c) => ({ operator: c.operator as DataGridTextOperator, ...(typeof c.value === 'string' ? { value: c.value } : {}) })) };
    }
    case 'number': {
      const list = conditions(value.conditions, path, (c, at) => {
        if (!NUMBER_OPERATORS.includes(c.operator as DataGridNumberOperator)) invalid(`${at}.operator`, NUMBER_OPERATORS.join(' | '));
        if (c.value !== undefined && !isFiniteNumber(c.value)) invalid(`${at}.value`, 'finite number');
        if (c.to !== undefined && !isFiniteNumber(c.to)) invalid(`${at}.to`, 'finite number');
      });
      return { kind: 'number', ...withJoin, conditions: list.map((c) => ({ operator: c.operator as DataGridNumberOperator, ...(isFiniteNumber(c.value) ? { value: c.value } : {}), ...(isFiniteNumber(c.to) ? { to: c.to } : {}) })) };
    }
    case 'bigint': {
      const list = conditions(value.conditions, path, (c, at) => {
        if (!NUMBER_OPERATORS.includes(c.operator as DataGridNumberOperator)) invalid(`${at}.operator`, NUMBER_OPERATORS.join(' | '));
        if (c.value !== undefined && !isDecimal(c.value)) invalid(`${at}.value`, 'integer as a decimal string');
        if (c.to !== undefined && !isDecimal(c.to)) invalid(`${at}.to`, 'integer as a decimal string');
      });
      return { kind: 'bigint', ...withJoin, conditions: list.map((c) => ({ operator: c.operator as DataGridNumberOperator, ...(isDecimal(c.value) ? { value: c.value } : {}), ...(isDecimal(c.to) ? { to: c.to } : {}) })) };
    }
    case 'date': {
      const list = conditions(value.conditions, path, (c, at) => {
        if (!DATE_OPERATORS.includes(c.operator as DataGridDateOperator)) invalid(`${at}.operator`, 'a date operator');
        if (c.value !== undefined && !isIsoDate(c.value)) invalid(`${at}.value`, 'ISO date YYYY-MM-DD');
        if (c.to !== undefined && !isIsoDate(c.to)) invalid(`${at}.to`, 'ISO date YYYY-MM-DD');
        if (c.count !== undefined && !(Number.isInteger(c.count) && (c.count as number) >= 1 && (c.count as number) <= 3660)) invalid(`${at}.count`, 'integer from 1 to 3660');
      });
      return {
        kind: 'date',
        ...withJoin,
        conditions: list.map((c) => ({ operator: c.operator as DataGridDateOperator, ...(isIsoDate(c.value) ? { value: c.value } : {}), ...(isIsoDate(c.to) ? { to: c.to } : {}), ...(typeof c.count === 'number' ? { count: c.count } : {}) })),
      };
    }
    case 'boolean':
      if (value.value !== true && value.value !== false && value.value !== null) invalid(`${path}.value`, 'true | false | null');
      return { kind: 'boolean', value: value.value };
    case 'set': {
      if (!Array.isArray(value.values) || value.values.length > 100_000 || !value.values.every((v) => v === null || typeof v === 'string')) invalid(`${path}.values`, 'array of strings or null (blanks)');
      return { kind: 'set', values: [...(value.values as (string | null)[])] };
    }
  }
}

// ---- Matching ----------------------------------------------------------------------------

const NON_ASCII = /[^\t\n\r\x20-\x7E]/;

/** Text normalized for matching: lower-cased in the locale and without diacritics, unless sensitive. */
export function normalizer(locale: string, caseSensitive: boolean, accentSensitive: boolean): (text: string) => string {
  // Locales whose lower-casing of ASCII differs from the default (dotted and dotless i).
  const special = /^(tr|az|lt)\b/i.test(locale);
  return (text) => {
    // Fast path: ASCII text has no diacritics and lower-cases the same in every other locale.
    if (!NON_ASCII.test(text)) return caseSensitive ? text : special ? text.toLocaleLowerCase(locale) : text.toLowerCase();
    let t = accentSensitive ? text : text.normalize('NFD').replace(/\p{M}/gu, '');
    if (!caseSensitive) t = t.toLocaleLowerCase(locale);
    return t;
  };
}

/** Calendar date of a cell value (dates; instants in the configured time zone), or null. */
export function cellDate(value: unknown, timezone: string): PlainDate | null {
  if (isPlainDate(value)) return value;
  if (isInstantLike(value)) return toPlainDateTime(value, timezone).date;
  return null;
}

const toBigInt = (v: unknown): bigint | null => {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v);
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return BigInt(v);
  return null;
};

type Test<Row> = (row: Row) => boolean;

function combine<Row>(tests: readonly Test<Row>[], join: DataGridFilterJoin | undefined): Test<Row> | null {
  if (tests.length === 0) return null;
  const [only] = tests;
  if (tests.length === 1 && only) return only;
  return join === 'or' ? (row) => tests.some((t) => t(row)) : (row) => tests.every((t) => t(row));
}

/** `read` is the row's normalized text, shared by the conditions of one filter. */
function textTest<Row>(c: DataGridTextCondition, norm: (text: string) => string, read: (row: Row) => string): Test<Row> | null {
  const blank = (row: Row): boolean => read(row).trim() === '';
  if (c.operator === 'blank') return blank;
  if (c.operator === 'notBlank') return (row) => !blank(row);
  if (c.value === undefined || c.value === '') return null;
  const needle = norm(c.value);
  switch (c.operator) {
    case 'contains':
      return (row) => read(row).includes(needle);
    case 'notContains':
      return (row) => !read(row).includes(needle);
    case 'equals':
      return (row) => read(row) === needle;
    case 'notEquals':
      return (row) => read(row) !== needle;
    case 'startsWith':
      return (row) => read(row).startsWith(needle);
    case 'endsWith':
      return (row) => read(row).endsWith(needle);
  }
}

function compareTest<Row, V extends number | bigint>(operator: DataGridNumberOperator, read: (row: Row) => V | null, value: V | undefined, to: V | undefined): Test<Row> | null {
  if (operator === 'blank') return (row) => read(row) === null;
  if (operator === 'notBlank') return (row) => read(row) !== null;
  if (value === undefined) return null;
  const v = value;
  const at = (row: Row, test: (x: V) => boolean): boolean => {
    const x = read(row);
    return x !== null && test(x);
  };
  switch (operator) {
    case 'equals':
      return (row) => at(row, (x) => x === v);
    case 'notEquals':
      // Blanks are not equal to any value, so they pass.
      return (row) => !at(row, (x) => x === v);
    case 'lessThan':
      return (row) => at(row, (x) => x < v);
    case 'lessThanOrEqual':
      return (row) => at(row, (x) => x <= v);
    case 'greaterThan':
      return (row) => at(row, (x) => x > v);
    case 'greaterThanOrEqual':
      return (row) => at(row, (x) => x >= v);
    case 'between': {
      if (to === undefined) return null;
      const [lo, hi] = v <= to ? [v, to] : [to, v];
      return (row) => at(row, (x) => x >= lo && x <= hi);
    }
  }
}

/** Inclusive date range [start, end] for a relative operator. */
function relativeRange(operator: DataGridDateOperator, env: FilterEnvironment, count: number): [PlainDate, PlainDate] | null {
  const today = env.today;
  const weekStart = addDays(today, -((dayOfWeek(today) - env.firstDayOfWeek + 7) % 7));
  const monthStart = plainDate(today.year, today.month, 1);
  const quarterStart = plainDate(today.year, Math.floor((today.month - 1) / 3) * 3 + 1, 1);
  const yearStart = plainDate(today.year, 1, 1);
  const span = (start: PlainDate, months: number): [PlainDate, PlainDate] => [start, addDays(addMonths(start, months), -1)];
  switch (operator) {
    case 'today':
      return [today, today];
    case 'yesterday':
      return [addDays(today, -1), addDays(today, -1)];
    case 'tomorrow':
      return [addDays(today, 1), addDays(today, 1)];
    case 'thisWeek':
      return [weekStart, addDays(weekStart, 6)];
    case 'lastWeek':
      return [addDays(weekStart, -7), addDays(weekStart, -1)];
    case 'nextWeek':
      return [addDays(weekStart, 7), addDays(weekStart, 13)];
    case 'thisMonth':
      return span(monthStart, 1);
    case 'lastMonth':
      return span(addMonths(monthStart, -1), 1);
    case 'nextMonth':
      return span(addMonths(monthStart, 1), 1);
    case 'thisQuarter':
      return span(quarterStart, 3);
    case 'lastQuarter':
      return span(addMonths(quarterStart, -3), 3);
    case 'nextQuarter':
      return span(addMonths(quarterStart, 3), 3);
    case 'thisYear':
      return span(yearStart, 12);
    case 'lastYear':
      return span(addMonths(yearStart, -12), 12);
    case 'nextYear':
      return span(addMonths(yearStart, 12), 12);
    case 'yearToDate':
      return [yearStart, today];
    case 'lastDays':
      // The `count` days ending today (today included).
      return [addDays(today, -(count - 1)), today];
    case 'nextDays':
      // Today and the following `count - 1` days.
      return [today, addDays(today, count - 1)];
    default:
      return null;
  }
}

const inRange = (d: PlainDate, [lo, hi]: [PlainDate, PlainDate]): boolean => comparePlainDate(d, lo) >= 0 && comparePlainDate(d, hi) <= 0;

function dateTest<Row>(column: FilterColumn<Row>, c: DataGridDateCondition, env: FilterEnvironment): Test<Row> | null {
  const read = (row: Row): PlainDate | null => cellDate(column.value(row), env.timezone);
  const at = (row: Row, test: (d: PlainDate) => boolean): boolean => {
    const d = read(row);
    return d !== null && test(d);
  };
  const op = c.operator;
  if (op === 'blank') return (row) => read(row) === null;
  if (op === 'notBlank') return (row) => read(row) !== null;
  if (BUSINESS_OPERATORS.has(op)) {
    const cal = column.calendar;
    if (!cal) return null;
    switch (op) {
      case 'workingDay':
        return (row) => at(row, (d) => cal.isWorkingDay(d));
      case 'nonWorkingDay':
        return (row) => at(row, (d) => !cal.isWorkingDay(d));
      case 'holiday':
        return (row) => at(row, (d) => cal.day(d).holiday !== null);
      case 'lastBusinessDays': {
        // The `count` working days ending with the last working day on or before today.
        const end = cal.previousWorkingDay(env.today, true);
        const range: [PlainDate, PlainDate] = [cal.addWorkingDays(end, -((c.count ?? 1) - 1)), end];
        return (row) => at(row, (d) => cal.isWorkingDay(d) && inRange(d, range));
      }
      case 'nextBusinessDays': {
        // The `count` working days starting with the first working day on or after today.
        const start = cal.nextWorkingDay(env.today, true);
        const range: [PlainDate, PlainDate] = [start, cal.addWorkingDays(start, (c.count ?? 1) - 1)];
        return (row) => at(row, (d) => cal.isWorkingDay(d) && inRange(d, range));
      }
      default:
        return null;
    }
  }
  const relative = relativeRange(op, env, c.count ?? 1);
  if (relative) return (row) => at(row, (d) => inRange(d, relative));
  const value = c.value === undefined ? null : parsePlainDate(c.value);
  if (!value) return null;
  switch (op) {
    case 'on':
      return (row) => at(row, (d) => comparePlainDate(d, value) === 0);
    case 'notOn':
      return (row) => !at(row, (d) => comparePlainDate(d, value) === 0);
    case 'before':
      return (row) => at(row, (d) => comparePlainDate(d, value) < 0);
    case 'after':
      return (row) => at(row, (d) => comparePlainDate(d, value) > 0);
    case 'onOrBefore':
      return (row) => at(row, (d) => comparePlainDate(d, value) <= 0);
    case 'onOrAfter':
      return (row) => at(row, (d) => comparePlainDate(d, value) >= 0);
    case 'between': {
      const to = c.to === undefined ? null : parsePlainDate(c.to);
      if (!to) return null;
      const range: [PlainDate, PlainDate] = comparePlainDate(value, to) <= 0 ? [value, to] : [to, value];
      return (row) => at(row, (d) => inRange(d, range));
    }
    default:
      return null;
  }
}

/** A predicate for one column's filter, or null when the filter is incomplete (it then filters nothing). */
export function compileFilter<Row>(column: FilterColumn<Row>, filter: DataGridFilter, env: FilterEnvironment): Test<Row> | null {
  switch (filter.kind) {
    case 'text': {
      const norm = normalizer(env.locale, column.caseSensitive, column.accentSensitive);
      // One normalized text per row, however many conditions read it (rows are tested one at a time).
      let lastRow: { row: Row } | null = null;
      let lastText = '';
      const read = (row: Row): string => {
        if (lastRow?.row !== row) {
          lastRow = { row };
          lastText = norm(column.text(row));
        }
        return lastText;
      };
      return combine(filter.conditions.map((c) => textTest(c, norm, read)).filter((t): t is Test<Row> => t !== null), filter.join);
    }
    case 'number': {
      const read = (row: Row): number | null => {
        const v = column.value(row);
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
      };
      return combine(filter.conditions.map((c) => compareTest(c.operator, read, c.value, c.to)).filter((t): t is Test<Row> => t !== null), filter.join);
    }
    case 'bigint': {
      const read = (row: Row): bigint | null => toBigInt(column.value(row));
      return combine(
        filter.conditions.map((c) => compareTest(c.operator, read, c.value === undefined ? undefined : BigInt(c.value), c.to === undefined ? undefined : BigInt(c.to))).filter((t): t is Test<Row> => t !== null),
        filter.join,
      );
    }
    case 'date':
      return combine(filter.conditions.map((c) => dateTest(column, c, env)).filter((t): t is Test<Row> => t !== null), filter.join);
    case 'boolean': {
      const want = filter.value;
      return (row) => {
        const v = column.value(row);
        return want === null ? typeof v !== 'boolean' : v === want;
      };
    }
    case 'set': {
      const wanted = new Set(filter.values);
      return (row) => {
        const t = column.text(row);
        return wanted.has(t.trim() === '' ? null : t);
      };
    }
  }
}

/** Today in a time zone (relative ranges use it). */
export const todayIn = (timezone: string, nowMs: number): PlainDate => toPlainDateTime(instant(nowMs), timezone).date;
