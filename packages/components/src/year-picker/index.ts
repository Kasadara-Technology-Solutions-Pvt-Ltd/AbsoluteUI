import type { PeriodPickerChangeDetail } from '../internal/period-picker.js';

export { YearPicker, yearPickerConfig } from './year-picker.js';
export type { YearPickerOptions, YearPickerConfig } from './year-picker.js';
export type {
  PeriodPickerValidity as YearPickerValidity,
  PeriodPickerError as YearPickerError,
  PeriodPickerIcons as YearPickerIcons,
} from '../internal/period-picker.js';
export type { ValidationTiming } from '../internal/field.js';

export type YearPickerChangeDetail = PeriodPickerChangeDetail<number>;
