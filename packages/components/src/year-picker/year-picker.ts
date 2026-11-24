/**
 * Year Picker (SPEC section 18.7). A calendar year (`number`, 1-9999; form value
 * `YYYY`): one four-digit segment plus a popup grid of the ten years of a decade
 * (paged by decade). The current year is computed in the configured timezone
 * (UTC by default), never the host zone.
 */
import { defineComponentConfig, formatPlainDate, getMessage, plainDate, registerMessages } from '@absoluteui/core';
import { PeriodPicker, periodConfigSchema, type PeriodKind, type PeriodPickerConfig, type PeriodPickerOptions } from '../internal/period-picker.js';

export type YearPickerConfig = PeriodPickerConfig;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    yearPicker: YearPickerConfig & { locale: string; timezone: string; direction: 'ltr' | 'rtl' };
  }
}

export const yearPickerConfig = defineComponentConfig<YearPickerConfig, 'locale' | 'timezone' | 'direction'>('yearPicker', periodConfigSchema, ['locale', 'timezone', 'direction']);

registerMessages('yearPicker', 'en', {
  choose: 'Choose year',
  change: 'Change year, {value}',
  previous: 'Previous 10 years',
  next: 'Next 10 years',
  pageRange: '{start} to {end}',
  incomplete: 'Enter the year with 4 digits.',
  invalid: 'Enter a valid year.',
  rangeUnderflow: 'Enter {min} or later.',
  rangeOverflow: 'Enter {max} or earlier.',
  unavailable: 'This year is not available.',
});

export interface YearPickerOptions extends PeriodPickerOptions<number> {
  /** Return true to disable a year (focusable in the popup, not selectable; typed, it is invalid). */
  isYearDisabled?: (year: number) => boolean;
}

const yearText = (year: number, locale: string): string => formatPlainDate(plainDate(year, 1, 1), { year: 'numeric' }, locale);

const YEAR_KIND: PeriodKind<number, YearPickerOptions> = {
  key: 'yearPicker',
  prefix: 'aui-year-picker',
  config: yearPickerConfig,
  expected: 'integer year 1-9999',
  pageSize: 10,
  columns: 5,
  isValue: (v): v is number => Number.isInteger(v) && typeof v === 'number' && v >= 1 && v <= 9999,
  toOrdinal: (v) => v,
  fromOrdinal: (n) => n,
  minOrdinal: 1,
  maxOrdinal: 9999,
  toFormValue: (v) => String(v).padStart(4, '0'),
  periodOf: (d) => d.year,
  layout: () => [{ field: 'year' }],
  toParts: (v) => ({ year: v }),
  fromParts: (p) => p.year,
  format: yearText,
  cellText: yearText,
  cellLabel: yearText,
  pageHeading(first, last, locale) {
    // The page of the decade starting at year 0 shows years 1-9 only.
    return getMessage('yearPicker', 'pageRange', { start: yearText(Math.max(first, 1), locale), end: yearText(last, locale) }, locale);
  },
  isDisabled: (o) => o.isYearDisabled,
  disabledOption: 'isYearDisabled',
};

export class YearPicker extends PeriodPicker<number, YearPickerOptions> {
  /** Render a year picker into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: YearPickerOptions): YearPicker {
    return new YearPicker(host, options);
  }

  private constructor(host: HTMLElement, options: YearPickerOptions) {
    super(host, options, YEAR_KIND);
  }
}
