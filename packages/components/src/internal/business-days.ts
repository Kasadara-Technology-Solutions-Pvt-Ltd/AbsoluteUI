/**
 * Business calendar in the date pickers (docs/PLAN-R9-ANGULAR.md D17): shared option
 * shape, validation, and "is this day unavailable" for Calendar and the pickers.
 */
import type { PlainDate } from '@absoluteui/core';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';

export interface BusinessDayOptions {
  /** Disable days in the calendar; a typed disabled day is reported as invalid. */
  isDateDisabled?: (date: PlainDate) => boolean;
  /**
   * Business calendar (since 0.9.0): non-working days and holidays are marked and named
   * in the calendar (`createBusinessCalendar` from `@absoluteui/components/business-calendar`).
   */
  businessCalendar?: BusinessCalendarEngine | null;
  /** With `businessCalendar`: non-working days cannot be picked or typed (since 0.9.0). */
  disableNonWorking?: boolean;
}

/** A business calendar engine, as far as the pickers use it. */
export function isBusinessCalendar(value: unknown): value is BusinessCalendarEngine {
  return typeof value === 'object' && value !== null && typeof (value as { day?: unknown }).day === 'function' && typeof (value as { isWorkingDay?: unknown }).isWorkingDay === 'function';
}

/** Checks the business options; `fail` throws the component's configuration error. */
export function assertBusinessDayOptions(o: BusinessDayOptions, fail: (property: string, expected: string) => never): void {
  if (o.businessCalendar !== undefined && o.businessCalendar !== null && !isBusinessCalendar(o.businessCalendar)) fail('businessCalendar', 'BusinessCalendarEngine (createBusinessCalendar) or null');
  if (o.disableNonWorking !== undefined && typeof o.disableNonWorking !== 'boolean') fail('disableNonWorking', 'boolean');
}

/** The day cannot be picked: `isDateDisabled`, or a non-working day with `disableNonWorking`. */
export function isUnavailable(o: BusinessDayOptions, date: PlainDate): boolean {
  if (o.isDateDisabled?.(date) === true) return true;
  return o.disableNonWorking === true && o.businessCalendar ? !o.businessCalendar.isWorkingDay(date) : false;
}

/** Calendar options forwarded by a picker (partial updates keep absent keys absent). */
export function businessCalendarOptions(o: BusinessDayOptions): BusinessDayOptions {
  return {
    ...(o.isDateDisabled === undefined ? {} : { isDateDisabled: o.isDateDisabled }),
    ...('businessCalendar' in o ? { businessCalendar: o.businessCalendar ?? null } : {}),
    ...(o.disableNonWorking === undefined ? {} : { disableNonWorking: o.disableNonWorking }),
  };
}
