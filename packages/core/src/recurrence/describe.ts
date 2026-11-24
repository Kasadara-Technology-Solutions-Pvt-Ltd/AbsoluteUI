/**
 * Localized, human-readable text of a recurrence rule ("Every 2 weeks on Monday
 * and Wednesday, until 31 Dec 2026"). Messages are registered under
 * `recurrence`; applications translate them with `registerMessages`.
 */
import { getCommonConfig } from '../config/config.js';
import { getMessage, registerMessages, formatNumber, formatPlainDate, formatPlainDateTime, formatInstant } from '../i18n/i18n.js';
import { dayOfWeek, plainDate, type PlainDate, type PlainDateTime } from '../timezone/types.js';
import type { RecurrenceRule, RecurrenceWeekday } from './rule.js';

registerMessages('recurrence', 'en', {
  daily: 'Every day',
  dailyN: 'Every {n} days',
  weekly: 'Every week',
  weeklyN: 'Every {n} weeks',
  monthly: 'Every month',
  monthlyN: 'Every {n} months',
  yearly: 'Every year',
  yearlyN: 'Every {n} years',
  onDays: '{base} on {days}',
  onMonthDays: '{base} on day {days}',
  inMonths: '{base} in {months}',
  onDate: '{base} on {date}',
  weekdays: 'Every weekday',
  nth1: 'first',
  nth2: 'second',
  nth3: 'third',
  nth4: 'fourth',
  nth5: 'fifth',
  nthLast: 'last',
  nthLast2: 'second to last',
  nthOther: 'number {n}',
  nthOtherLast: 'number {n} from the end',
  nthDay: 'the {nth} {day}',
  lastDay: 'the last day',
  dayFromEnd: 'day {n} from the end',
  setPos: 'the {positions} of them',
  times: '{text}, {count} times',
  once: '{text}, once',
  until: '{text}, until {date}',
});

export interface DescribeRecurrenceOptions {
  locale?: string;
  /** Series start: makes defaults explicit (the start's weekday, day of month, or date). */
  start?: PlainDate | PlainDateTime;
  /** Timezone for an `until` instant. Default: the configured timezone. */
  timeZone?: string;
}

// 2024-01-01 is a Monday (ISO weekday 1).
const weekdayName = (weekday: number, locale: string): string => formatPlainDate(plainDate(2024, 1, weekday), { weekday: 'long' }, locale);
const monthName = (month: number, locale: string): string => formatPlainDate(plainDate(2024, month, 1), { month: 'long' }, locale);

function list(items: readonly string[], locale: string): string {
  return new Intl.ListFormat(locale, { type: 'conjunction', style: 'long' }).format(items);
}

function ordinal(n: number, locale: string): string {
  const key = n > 0 && n <= 5 ? `nth${String(n)}` : n === -1 ? 'nthLast' : n === -2 ? 'nthLast2' : null;
  if (key) return getMessage('recurrence', key, {}, locale);
  return getMessage('recurrence', n > 0 ? 'nthOther' : 'nthOtherLast', { n: formatNumber(Math.abs(n), {}, locale) }, locale);
}

function dayText(d: RecurrenceWeekday, locale: string): string {
  const name = weekdayName(d.weekday, locale);
  return d.nth === undefined ? name : getMessage('recurrence', 'nthDay', { nth: ordinal(d.nth, locale), day: name }, locale);
}

/** Localized description of a rule, for summaries and accessible names. */
export function describeRecurrence(rule: RecurrenceRule, options: DescribeRecurrenceOptions = {}): string {
  const locale = options.locale ?? getCommonConfig().locale;
  const msg = (key: string, params: Readonly<Record<string, string>> = {}): string => getMessage('recurrence', key, params, locale);
  const startDate = options.start ? (options.start.kind === 'PlainDate' ? options.start : options.start.date) : null;
  const n = rule.interval;
  const nText = formatNumber(n, {}, locale);
  let text = n === 1 ? msg(rule.frequency) : msg(`${rule.frequency}N`, { n: nText });

  const plainWeekdays = rule.byDay.every((d) => d.nth === undefined);
  const days = rule.byDay.map((d) => d.weekday).sort((a, b) => a - b);
  const isWorkWeek = (rule.frequency === 'weekly' || rule.frequency === 'daily') && n === 1 && plainWeekdays && days.join() === '1,2,3,4,5' && rule.bySetPos.length === 0;
  if (isWorkWeek && rule.byMonth.length === 0) text = msg('weekdays');
  else if (rule.frequency === 'yearly' && rule.byMonth.length === 1 && rule.byMonthDay.length === 1 && rule.byDay.length === 0 && (rule.byMonthDay[0] ?? 0) > 0) {
    text = msg('onDate', { base: text, date: formatPlainDate(plainDate(2024, rule.byMonth[0] ?? 1, rule.byMonthDay[0] ?? 1), { month: 'long', day: 'numeric' }, locale) });
  } else {
    if (rule.byDay.length > 0) {
      text = msg('onDays', { base: text, days: list(rule.byDay.map((d) => dayText(d, locale)), locale) });
    } else if (rule.byMonthDay.length > 0) {
      const parts = rule.byMonthDay.map((d) => (d > 0 ? formatNumber(d, {}, locale) : d === -1 ? msg('lastDay') : msg('dayFromEnd', { n: formatNumber(-d, {}, locale) })));
      text = rule.byMonthDay.every((d) => d > 0) ? msg('onMonthDays', { base: text, days: list(parts, locale) }) : msg('onDays', { base: text, days: list(parts, locale) });
    } else if (startDate) {
      if (rule.frequency === 'weekly') text = msg('onDays', { base: text, days: weekdayName(dayOfWeek(startDate), locale) });
      else if (rule.frequency === 'monthly') text = msg('onMonthDays', { base: text, days: formatNumber(startDate.day, {}, locale) });
      else if (rule.frequency === 'yearly' && rule.byMonth.length === 0) {
        text = msg('onDate', { base: text, date: formatPlainDate(plainDate(2024, startDate.month, startDate.day), { month: 'long', day: 'numeric' }, locale) });
      }
    }
    if (rule.byMonth.length > 0) {
      text = msg('inMonths', { base: text, months: list(rule.byMonth.map((m) => monthName(m, locale)), locale) });
    }
    if (rule.bySetPos.length > 0) text = `${text} (${msg('setPos', { positions: list(rule.bySetPos.map((p) => ordinal(p, locale)), locale) })})`;
  }

  if (rule.count !== null) text = rule.count === 1 ? msg('once', { text }) : msg('times', { text, count: formatNumber(rule.count, {}, locale) });
  else if (rule.until !== null) {
    const u = rule.until;
    const date = u.kind === 'PlainDate' ? formatPlainDate(u, { dateStyle: 'medium' }, locale) : u.kind === 'PlainDateTime' ? formatPlainDateTime(u, { dateStyle: 'medium', timeStyle: 'short' }, locale) : formatInstant(u, { dateStyle: 'medium', timeStyle: 'short' }, options.timeZone, locale);
    text = msg('until', { text, date });
  }
  return text;
}

