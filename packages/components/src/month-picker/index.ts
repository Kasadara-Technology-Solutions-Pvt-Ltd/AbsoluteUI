import type { PlainYearMonth } from '@absoluteui/core';
import type { PeriodPickerChangeDetail } from '../internal/period-picker.js';

export { MonthPicker, monthPickerConfig } from './month-picker.js';
export type { MonthPickerOptions, MonthPickerConfig } from './month-picker.js';
export type {
  PeriodPickerValidity as MonthPickerValidity,
  PeriodPickerError as MonthPickerError,
  PeriodPickerIcons as MonthPickerIcons,
} from '../internal/period-picker.js';
export type { ValidationTiming } from '../internal/field.js';

export type MonthPickerChangeDetail = PeriodPickerChangeDetail<PlainYearMonth>;
