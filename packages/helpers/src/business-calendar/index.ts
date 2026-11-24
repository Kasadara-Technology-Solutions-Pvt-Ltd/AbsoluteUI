/**
 * `@absoluteui/helpers/business-calendar` (docs/PLAN-HELPERS.md section 4): weekends, holidays,
 * business days, business hours, and day differences on an immutable calendar.
 *
 * Conventions
 * - Dates are `DateInput` (`PlainDate | 'YYYY-MM-DD'`) and all day logic is date-only; instants
 *   (`number | Date`) are converted in the calendar's `timeZone` (default `'UTC'`).
 * - The calendar argument comes after the dates and is optional: the shared default is a
 *   Saturday/Sunday weekend without holidays, 09:00-17:00, UTC (`defaultBusinessCalendar()`).
 * - Precedence for a date: exception, then full holiday, then half-day holiday (working
 *   weekdays only), then the weekday pattern.
 * - Half days are business days for navigation (`addBusinessDays`) and count `halfDayValue`
 *   (default 0.5, B2) in business-day totals.
 * - Differences are signed; `inclusive` defaults to `'start'` ([earlier, later)), so calendar
 *   mode equals `daysBetween`; pass `inclusive: 'both'` for leave requests (see `Inclusivity`).
 *   Week, month, quarter, and year differences stay calendar-based (B1): use the date module.
 * - No holiday data ships (B4): supply rules or a `HolidayProvider`.
 */
export { createBusinessCalendar, defaultBusinessCalendar, isBusinessCalendar, mergeCalendars, weekendForLocale, withTags } from './engine.js';
export type { BusinessCalendar, BusinessCalendarDefinition, BusinessDayException, BusinessDayInfo, BusinessDayReasonCode, TagScope, WorkingHoursDefinition } from './engine.js';
export { customHoliday, defineHolidays, easterHoliday, easterSunday, fixedHoliday, holidayRange, lastWeekdayHoliday, nthWeekdayHoliday, oneOffHoliday } from './rules.js';
export type {
  CustomHolidayRule, EasterHolidayRule, FixedHolidayRule, HolidayKind, HolidayProvider, HolidayRule, HolidayRuleBase, HolidayRuleOptions, HolidayYearBounds,
  NthWeekdayHolidayRule, ObservedPolicy, ObservedShiftMap, OneOffHolidayRule, ProvidedHoliday, RangeHolidayRule, ResolvedHoliday,
} from './rules.js';
export type { TimeRange } from './internal.js';
export {
  addBusinessDays, adjustBusinessDay, businessDayAt, businessDayOfMonth, businessDaysIn, countBusinessDays, countHolidays, countWeekdays, countWeekends,
  diffBreakdown, diffDays, firstBusinessDayOfMonth, getBusinessDay, holidaysOn, isBusinessDay, isHalfDay, isHoliday, isWeekday, isWeekend,
  lastBusinessDayOfMonth, listBusinessDays, listHolidays, nextBusinessDay, nthBusinessDayOfMonth, periodRange, previousBusinessDay,
} from './days.js';
export type { AddBusinessDaysOptions, BusinessDayConvention, BusinessPeriod, CountOptions, DiffBreakdown, DiffDaysOptions, DiffMode, HolidayCount, Inclusivity, ListBusinessDaysOptions, NextBusinessDayOptions } from './days.js';
export { addBusinessHours, diffBusinessHours, isWorkingTime, nextWorkingTime, slaDeadline, workingIntervals } from './hours.js';
export type { DiffBusinessHoursOptions, InstantInterval, SlaTarget } from './hours.js';
export { DEFAULT_BUSINESS_DAY_LABELS, describeBusinessDay } from './describe.js';
export type { BusinessDayLabels, DescribeBusinessDayOptions } from './describe.js';
