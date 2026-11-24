import { Scheduler, type SchedulerEvent } from '@absoluteui/components/scheduler';
import { parseInstant, parseRecurrenceRule, plainDate, plainTime, type Instant } from '@absoluteui/core';
import type { BusinessCalendarDefinition } from '@absoluteui/components/business-calendar';

const at = (text: string): Instant => {
  const value = parseInstant(text);
  if (!value) throw new Error(`Bad instant ${text}`);
  return value;
};

// Working days and hours, and holidays: non-working time is shaded.
const calendar: BusinessCalendarDefinition = {
  workingDays: [1, 2, 3, 4, 5],
  hours: [{ start: plainTime(9, 0), end: plainTime(18, 0) }],
  holidays: [{ date: plainDate(2026, 10, 2), name: 'Gandhi Jayanti', yearly: true }],
};

const events: SchedulerEvent[] = [
  { id: 'standup', title: 'Standup', start: at('2026-10-26T03:30:00Z'), end: at('2026-10-26T04:00:00Z'), recurrence: parseRecurrenceRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') },
  { id: 'review', title: 'Design review', start: at('2026-10-27T08:30:00Z'), end: at('2026-10-27T10:00:00Z'), location: 'Room 4', color: 3 },
  { id: 'planning', title: 'Sprint planning', start: at('2026-10-28T05:30:00Z'), end: at('2026-10-28T07:00:00Z'), color: 2 },
  { id: 'demo', title: 'Customer demo', start: at('2026-10-29T09:30:00Z'), end: at('2026-10-29T10:30:00Z'), color: 5 },
  { id: 'offsite', title: 'Team offsite', start: plainDate(2026, 10, 30), end: plainDate(2026, 10, 31) },
];

const host = document.getElementById('calendar');
if (host) {
  Scheduler.create(host, {
    label: 'Team calendar',
    events,
    editable: true,
    view: 'week',
    timezone: 'Asia/Kolkata',
    businessCalendar: calendar,
    date: plainDate(2026, 10, 27),
    dayStartHour: 8,
  });
}
