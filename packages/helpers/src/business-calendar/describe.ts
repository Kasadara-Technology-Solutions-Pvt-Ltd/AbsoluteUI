/**
 * Accessible descriptions of business days (WCAG 1.3.1): the reason a picker day is disabled
 * or special, for `aria-description`. Labels come from the caller's catalog; English defaults.
 */
import { listFormat } from '../date/intl-cache.js';
import type { BusinessDayInfo } from './engine.js';

/**
 * Label catalog. `{name}` is replaced with the holiday names (joined with `Intl.ListFormat`)
 * or the exception reason.
 * @example const de: Partial<BusinessDayLabels> = { weekend: 'Wochenende', holiday: 'Feiertag: {name}' };
 */
export interface BusinessDayLabels {
  readonly weekend: string;
  readonly holiday: string;
  readonly halfDay: string;
  readonly halfDayUnnamed: string;
  readonly nonWorking: string;
  readonly nonWorkingUnnamed: string;
  readonly working: string;
  readonly workingUnnamed: string;
}

/**
 * English default labels.
 * @example DEFAULT_BUSINESS_DAY_LABELS.weekend // => 'Weekend'
 */
export const DEFAULT_BUSINESS_DAY_LABELS: BusinessDayLabels = Object.freeze({
  weekend: 'Weekend',
  holiday: 'Holiday: {name}',
  halfDay: 'Half day: {name}',
  halfDayUnnamed: 'Half day',
  nonWorking: 'Non-working day: {name}',
  nonWorkingUnnamed: 'Non-working day',
  working: 'Working day: {name}',
  workingUnnamed: 'Working day',
});

/** Options for `describeBusinessDay`. */
export interface DescribeBusinessDayOptions {
  /** Locale for joining several holiday names. */
  readonly locale?: string;
  readonly labels?: Partial<BusinessDayLabels>;
}

const fill = (template: string, name: string): string => template.split('{name}').join(name);

/**
 * Plain-text description of why a day is special: "Weekend", "Holiday: Diwali",
 * "Half day: Christmas Eve", "Working day: Compensatory Saturday"; `''` for an ordinary
 * working day.
 * @example
 * const cal = createBusinessCalendar({
 *   holidays: [fixedHoliday('Christmas Day', 12, 25)],
 *   halfDays: [fixedHoliday('Christmas Eve', 12, 24)],
 *   exceptions: [{ date: '2026-12-19', working: true, reason: 'Year-end close' }],
 * });
 * describeBusinessDay(getBusinessDay('2026-12-25', cal)); // => 'Holiday: Christmas Day'
 * describeBusinessDay(getBusinessDay('2026-12-24', cal)); // => 'Half day: Christmas Eve'
 * describeBusinessDay(getBusinessDay('2026-12-26', cal)); // => 'Weekend'
 * describeBusinessDay(getBusinessDay('2026-12-19', cal)); // => 'Working day: Year-end close'
 * describeBusinessDay(getBusinessDay('2026-12-21', cal)); // => '' // ordinary working day
 * describeBusinessDay(getBusinessDay('2026-12-25', cal), { labels: { holiday: 'Feiertag: {name}' } }); // => 'Feiertag: Christmas Day'
 */
export function describeBusinessDay(info: BusinessDayInfo, options: DescribeBusinessDayOptions = {}): string {
  const labels: BusinessDayLabels = { ...DEFAULT_BUSINESS_DAY_LABELS, ...options.labels };
  switch (info.reasonCode) {
    case 'weekend':
      return labels.weekend;
    case 'holiday': {
      const effective = info.holidays.filter((h) => !h.halfDay && h.movedTo === undefined);
      const names = [...new Set((effective.length > 0 ? effective : info.holidays.filter((h) => !h.halfDay)).map((h) => h.name))];
      let joined: string;
      try {
        joined = listFormat(options.locale, { type: 'conjunction', style: 'long' }).format(names);
      } catch {
        joined = names.join(', ');
      }
      return fill(labels.holiday, joined);
    }
    case 'half-day':
      return info.reason === null ? labels.halfDayUnnamed : fill(labels.halfDay, info.reason);
    case 'exception':
      if (info.working) {
        if (info.halfDay) return info.reason === null ? labels.halfDayUnnamed : fill(labels.halfDay, info.reason);
        return info.reason === null ? labels.workingUnnamed : fill(labels.working, info.reason);
      }
      return info.reason === null ? labels.nonWorkingUnnamed : fill(labels.nonWorking, info.reason);
    default:
      return '';
  }
}
