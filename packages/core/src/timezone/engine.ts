/**
 * Timezone engine contract (SPEC section 8.7). The built-in implementation derives
 * offsets from Intl.DateTimeFormat through @absoluteui/helpers/timezone; no IANA
 * database is bundled. Rule accuracy depends on the ICU data shipped with the browser.
 */
import { isValidTimeZone, offsetAt } from '@absoluteui/helpers/timezone';

export interface TimeZoneEngine {
  /** Offset (local - UTC) in milliseconds for the given instant in the given zone. */
  getOffsetMs(epochMilliseconds: number, timeZone: string): number;
  isValidTimeZone(timeZone: string): boolean;
}

/** UTC epoch milliseconds for wall-clock fields, correct for years 0-99 and negative years. */
export function fieldsToEpoch(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, millisecond = 0): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, millisecond);
  return d.getTime();
}

export const intlTimeZoneEngine: TimeZoneEngine = {
  getOffsetMs: (epochMilliseconds, timeZone) => offsetAt(epochMilliseconds, timeZone),
  isValidTimeZone: (timeZone) => isValidTimeZone(timeZone),
};
