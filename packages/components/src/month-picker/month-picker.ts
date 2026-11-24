/**
 * Month Picker (SPEC section 18.7). A calendar month without a day (`PlainYearMonth`,
 * ISO 8601 `YYYY-MM`): month and year segments in locale order, plus a popup grid
 * of the twelve months of a year (paged by year). The current month is computed
 * in the configured timezone (UTC by default), never the host zone.
 */
import {
  defineComponentConfig,
  formatPlainDate,
  plainDate,
  plainYearMonth,
  plainYearMonthToString,
  registerMessages,
  type PlainYearMonth,
} from '@absoluteui/core';
import { PeriodPicker, periodConfigSchema, type LayoutPart, type PeriodKind, type PeriodPickerConfig, type PeriodPickerOptions } from '../internal/period-picker.js';

export type MonthPickerConfig = PeriodPickerConfig;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    monthPicker: MonthPickerConfig & { locale: string; timezone: string; direction: 'ltr' | 'rtl' };
  }
}

export const monthPickerConfig = defineComponentConfig<MonthPickerConfig, 'locale' | 'timezone' | 'direction'>('monthPicker', periodConfigSchema, ['locale', 'timezone', 'direction']);

registerMessages('monthPicker', 'en', {
  choose: 'Choose month',
  change: 'Change month, {value}',
  previous: 'Previous year',
  next: 'Next year',
  incomplete: 'Enter a complete month.',
  invalid: 'Enter a valid month.',
  rangeUnderflow: 'Enter {min} or later.',
  rangeOverflow: 'Enter {max} or earlier.',
  unavailable: 'This month is not available.',
});

export interface MonthPickerOptions extends PeriodPickerOptions<PlainYearMonth> {
  /** Return true to disable a month (focusable in the popup, not selectable; typed, it is invalid). */
  isMonthDisabled?: (value: PlainYearMonth) => boolean;
}

/** Segment layout per locale (Intl formatter construction is the main creation cost). */
const layouts = new Map<string, readonly LayoutPart[]>();

const firstDay = (v: PlainYearMonth): ReturnType<typeof plainDate> => plainDate(v.year, v.month, 1);

const MONTH_KIND: PeriodKind<PlainYearMonth, MonthPickerOptions> = {
  key: 'monthPicker',
  prefix: 'aui-month-picker',
  config: monthPickerConfig,
  expected: 'PlainYearMonth (years 1-9999)',
  pageSize: 12,
  columns: 3,
  isValue: (v): v is PlainYearMonth => typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'PlainYearMonth' && 'year' in v && typeof v.year === 'number' && v.year >= 1 && v.year <= 9999,
  toOrdinal: (v) => v.year * 12 + v.month - 1,
  fromOrdinal: (n) => plainYearMonth(Math.floor(n / 12), (n % 12) + 1),
  minOrdinal: 12,
  maxOrdinal: 9999 * 12 + 11,
  toFormValue: plainYearMonthToString,
  periodOf: (d) => plainYearMonth(d.year, d.month),
  layout(locale) {
    const cached = layouts.get(locale);
    if (cached) return cached;
    const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', timeZone: 'UTC' }).formatToParts(Date.UTC(2026, 10, 15));
    const layout = parts.flatMap((p): LayoutPart[] => (p.type === 'literal' ? [{ literal: p.value }] : p.type === 'year' || p.type === 'month' ? [{ field: p.type }] : []));
    layouts.set(locale, layout);
    return layout;
  },
  toParts: (v) => ({ year: v.year, month: v.month }),
  fromParts: (p) => plainYearMonth(p.year, p.month),
  format: (v, locale) => formatPlainDate(firstDay(v), { month: 'long', year: 'numeric' }, locale),
  cellText: (v, locale) => formatPlainDate(firstDay(v), { month: 'short' }, locale),
  cellLabel: (v, locale) => formatPlainDate(firstDay(v), { month: 'long', year: 'numeric' }, locale),
  pageHeading: (first, _last, locale) => formatPlainDate(firstDay(first), { year: 'numeric' }, locale),
  isDisabled: (o) => o.isMonthDisabled,
  disabledOption: 'isMonthDisabled',
};

export class MonthPicker extends PeriodPicker<PlainYearMonth, MonthPickerOptions> {
  /** Render a month picker into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: MonthPickerOptions): MonthPicker {
    return new MonthPicker(host, options);
  }

  private constructor(host: HTMLElement, options: MonthPickerOptions) {
    super(host, options, MONTH_KIND);
  }
}
