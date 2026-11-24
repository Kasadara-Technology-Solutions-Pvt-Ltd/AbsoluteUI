import { parseInstant, parseRecurrenceRule, plainDate, type Instant, type RecurrenceRule } from '@absoluteui/core';
import { Scheduler, type SchedulerOptions } from '@absoluteui/components/scheduler';
import { host, seed } from '../seed.js';

const at = (text: string): Instant => {
  const v = parseInstant(text);
  if (!v) throw new Error(`Bad instant ${text}`);
  return v;
};
const rule = (text: string): RecurrenceRule => {
  const v = parseRecurrenceRule(text);
  if (!v) throw new Error(`Bad rule ${text}`);
  return v;
};

export default seed<SchedulerOptions>({
  options: {
    label: 'Team calendar',
    events: [
      { id: 'standup', title: 'Standup', start: at('2026-11-23T09:00:00Z'), end: at('2026-11-23T09:15:00Z'), timeZone: 'Europe/London', recurrence: rule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'), resourceId: 'room-a' },
      { id: 'review', title: 'Performance review', start: at('2026-11-24T13:00:00Z'), end: at('2026-11-24T14:30:00Z'), location: 'Room Borealis', color: 3, resourceId: 'room-b' },
      { id: 'onboarding', title: 'New hire onboarding', start: at('2026-11-25T10:00:00Z'), end: at('2026-11-25T12:00:00Z'), color: 2, resourceId: 'room-a' },
      { id: 'interview', title: 'Interview: platform engineer', start: at('2026-11-26T14:00:00Z'), end: at('2026-11-26T15:00:00Z'), color: 5, resourceId: 'room-b' },
      { id: 'offsite', title: 'Team offsite', start: plainDate(2026, 11, 27), end: plainDate(2026, 11, 27), color: 4 },
    ],
    resources: [
      { id: 'room-a', label: 'Room Atlas', color: 1 },
      { id: 'room-b', label: 'Room Borealis', color: 3 },
    ],
    view: 'week',
    views: ['day', 'week', 'workWeek', 'month', 'agenda', 'timeline'],
    date: plainDate(2026, 11, 24),
    timezone: 'Europe/London',
    editable: true,
    firstDayOfWeek: 1,
    dayStartHour: 7,
    dayEndHour: 19,
    scrollToHour: 8,
    businessCalendar: { workingDays: [1, 2, 3, 4, 5], holidays: [{ date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true }] },
  },
  call: 'Scheduler.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Scheduler.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
