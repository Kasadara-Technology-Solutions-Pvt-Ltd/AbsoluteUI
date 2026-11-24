/**
 * `@absoluteui/helpers/date` (docs/PLAN-HELPERS.md section 2): date-only values and calendar math.
 *
 * Conventions
 * - Date-only functions take `DateInput` (`PlainDate | 'YYYY-MM-DD'`) and return frozen
 *   `PlainDate`s. They never create a `Date` at local midnight, so no result shifts by a day
 *   because of the host zone or DST.
 * - Parameters typed `InstantInput` (`number | Date`) are exact instants; functions that
 *   return an instant return epoch milliseconds and end in `Instant`
 *   (`startOfDayInstant`, `endOfDayInstant`, `parseInstant`). `plainDateFromInstant` and
 *   `toPlainDateTime` convert an instant to wall-clock values in a zone.
 * - `differenceInX(later, earlier)` follows date-fns argument order; `daysBetween(a, b)` and
 *   `dateDiff(from, to)` measure from the first argument to the second.
 * - Weeks start on Monday (ISO 8601) unless `firstDayOfWeek` is given; use
 *   `getWeekInfo(locale)` for locale conventions.
 * - Parsers return `undefined`; invalid arguments throw `ValidationError` with `HLP_*` codes.
 */
export * from './plain-date.js';
export { plainTime, plainDateTime, isPlainTime, isPlainDateTime, timeToMilliseconds, timeFromMilliseconds, comparePlainTimes, comparePlainDateTimes, plainDateTimeToEpochMilliseconds, formatPlainTime, formatPlainDateTime, parsePlainTime, parseIsoDateTime, parsePlainDateTime, parseInstant, formatInstant } from './plain-time.js';
export type { PlainTime, PlainDateTime, IsoDateTimeParts } from './plain-time.js';
export * from './calendar.js';
export * from './locale.js';
export * from './intervals.js';
export * from './format.js';
export { toPlainDateTime, startOfDayInstant, endOfDayInstant } from './zone.js';
export type { InstantInput } from './zone.js';
