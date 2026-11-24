/**
 * Quarter Picker (SPEC section 18.7). A calendar quarter (`PlainYearQuarter`, form value
 * `YYYY-Qn`; Q1 is January to March): quarter and year segments, plus a popup grid
 * of the four quarters of a year (paged by year), each showing its months. The
 * current quarter is computed in the configured timezone (UTC by default), never
 * the host zone.
 */
import {
  defineComponentConfig,
  formatNumber,
  formatPlainDate,
  getMessage,
  plainDate,
  plainYearQuarter,
  plainYearQuarterToString,
  registerMessages,
  type PlainYearQuarter,
} from '@absoluteui/core';
import { PeriodPicker, patternLayout, periodConfigSchema, type PeriodKind, type PeriodPickerConfig, type PeriodPickerOptions } from '../internal/period-picker.js';

export type QuarterPickerConfig = PeriodPickerConfig;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    quarterPicker: QuarterPickerConfig & { locale: string; timezone: string; direction: 'ltr' | 'rtl' };
  }
}

export const quarterPickerConfig = defineComponentConfig<QuarterPickerConfig, 'locale' | 'timezone' | 'direction'>('quarterPicker', periodConfigSchema, ['locale', 'timezone', 'direction']);

registerMessages('quarterPicker', 'en', {
  choose: 'Choose quarter',
  change: 'Change quarter, {value}',
  previous: 'Previous year',
  next: 'Next year',
  /** Segment order and literals; `{quarter}` and `{year}` become segments. */
  pattern: 'Q{quarter} {year}',
  value: 'Q{quarter} {year}',
  short: 'Q{quarter}',
  months: '{start} to {end}',
  cellLabel: 'Q{quarter} {year}, {start} to {end}',
  incomplete: 'Enter a complete quarter.',
  invalid: 'Enter a valid quarter (1 to 4).',
  rangeUnderflow: 'Enter {min} or later.',
  rangeOverflow: 'Enter {max} or earlier.',
  unavailable: 'This quarter is not available.',
});

export interface QuarterPickerOptions extends PeriodPickerOptions<PlainYearQuarter> {
  /** Return true to disable a quarter (focusable in the popup, not selectable; typed, it is invalid). */
  isQuarterDisabled?: (value: PlainYearQuarter) => boolean;
}

const year = (v: PlainYearQuarter, locale: string): string => formatPlainDate(plainDate(v.year, 1, 1), { year: 'numeric' }, locale);
const monthName = (v: PlainYearQuarter, offset: number, style: 'short' | 'long', locale: string): string => formatPlainDate(plainDate(v.year, (v.quarter - 1) * 3 + 1 + offset, 1), { month: style }, locale);

const QUARTER_KIND: PeriodKind<PlainYearQuarter, QuarterPickerOptions> = {
  key: 'quarterPicker',
  prefix: 'aui-quarter-picker',
  config: quarterPickerConfig,
  expected: 'PlainYearQuarter (years 1-9999)',
  pageSize: 4,
  columns: 4,
  isValue: (v): v is PlainYearQuarter => typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'PlainYearQuarter' && 'year' in v && typeof v.year === 'number' && v.year >= 1 && v.year <= 9999,
  toOrdinal: (v) => v.year * 4 + v.quarter - 1,
  fromOrdinal: (n) => plainYearQuarter(Math.floor(n / 4), (n % 4) + 1),
  minOrdinal: 4,
  maxOrdinal: 9999 * 4 + 3,
  toFormValue: plainYearQuarterToString,
  periodOf: (d) => plainYearQuarter(d.year, Math.ceil(d.month / 3)),
  layout: (locale) => patternLayout(getMessage('quarterPicker', 'pattern', {}, locale)),
  toParts: (v) => ({ year: v.year, quarter: v.quarter }),
  fromParts: (p) => plainYearQuarter(p.year, p.quarter),
  format: (v, locale) => getMessage('quarterPicker', 'value', { quarter: formatNumber(v.quarter, {}, locale), year: year(v, locale) }, locale),
  cellText: (v, locale) => getMessage('quarterPicker', 'short', { quarter: formatNumber(v.quarter, {}, locale) }, locale),
  cellHint: (v, locale) => getMessage('quarterPicker', 'months', { start: monthName(v, 0, 'short', locale), end: monthName(v, 2, 'short', locale) }, locale),
  cellLabel: (v, locale) =>
    getMessage('quarterPicker', 'cellLabel', { quarter: formatNumber(v.quarter, {}, locale), year: year(v, locale), start: monthName(v, 0, 'long', locale), end: monthName(v, 2, 'long', locale) }, locale),
  pageHeading: (first, _last, locale) => year(first, locale),
  isDisabled: (o) => o.isQuarterDisabled,
  disabledOption: 'isQuarterDisabled',
};

export class QuarterPicker extends PeriodPicker<PlainYearQuarter, QuarterPickerOptions> {
  /** Render a quarter picker into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: QuarterPickerOptions): QuarterPicker {
    return new QuarterPicker(host, options);
  }

  private constructor(host: HTMLElement, options: QuarterPickerOptions) {
    super(host, options, QUARTER_KIND);
  }
}
