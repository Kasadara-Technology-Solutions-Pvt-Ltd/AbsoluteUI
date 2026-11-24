import type { PlainYearQuarter } from '@absoluteui/core';
import type { PeriodPickerChangeDetail } from '../internal/period-picker.js';

export { QuarterPicker, quarterPickerConfig } from './quarter-picker.js';
export type { QuarterPickerOptions, QuarterPickerConfig } from './quarter-picker.js';
export type {
  PeriodPickerValidity as QuarterPickerValidity,
  PeriodPickerError as QuarterPickerError,
  PeriodPickerIcons as QuarterPickerIcons,
} from '../internal/period-picker.js';
export type { ValidationTiming } from '../internal/field.js';

export type QuarterPickerChangeDetail = PeriodPickerChangeDetail<PlainYearQuarter>;
