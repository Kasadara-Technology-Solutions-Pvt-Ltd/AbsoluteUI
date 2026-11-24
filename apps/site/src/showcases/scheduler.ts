// Scheduler showcase: a team calendar with day, week, work week, month, agenda, and resource
// timeline views, a recurring standup, a business calendar, editing by drag or keyboard with
// undo, and events loaded per range from a simulated server.
import { parseInstant, parseRecurrenceRule, plainDate, type Instant } from '@absoluteui/core';
import { Scheduler, type SchedulerEvent } from '@absoluteui/components/scheduler';
import { action, choice, createShowcase, hostIn, toggle, wait } from './kit.js';

const sc = createShowcase({
  title: 'Team calendar',
  description: 'Switch views, move or resize events (drag, or the keyboard), create one from an empty slot, and undo. Events load from a simulated server.',
  simulated: true,
});

const at = (text: string): Instant => {
  const v = parseInstant(text);
  if (!v) throw new Error(`Bad instant ${text}`);
  return v;
};
const RESOURCES = [
  { id: 'room-a', label: 'Room Atlas', color: 1 },
  { id: 'room-b', label: 'Room Borealis', color: 3 },
  { id: 'van', label: 'Delivery van', color: 5 },
];
let events: SchedulerEvent[] = [
  { id: 'standup', title: 'Standup', start: at('2026-11-23T09:00:00Z'), end: at('2026-11-23T09:15:00Z'), timeZone: 'Europe/London', recurrence: parseRecurrenceRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'), resourceId: 'room-a' },
  { id: 'review', title: 'Design review', start: at('2026-11-24T13:00:00Z'), end: at('2026-11-24T14:30:00Z'), location: 'Room Borealis', color: 3, resourceId: 'room-b' },
  { id: 'planning', title: 'Quarter planning', start: at('2026-11-25T10:00:00Z'), end: at('2026-11-25T12:00:00Z'), color: 2, resourceId: 'room-a' },
  { id: 'delivery', title: 'Hardware delivery', start: at('2026-11-26T07:30:00Z'), end: at('2026-11-26T09:00:00Z'), resourceId: 'van', color: 5 },
  { id: 'offsite', title: 'Team offsite', start: plainDate(2026, 11, 27), end: plainDate(2026, 11, 28), color: 4 },
];

const host = hostIn(sc.stage);
const scheduler = Scheduler.create(host, {
  label: 'Team calendar',
  resources: RESOURCES,
  view: 'week',
  views: ['day', 'week', 'workWeek', 'month', 'agenda', 'timeline'],
  date: plainDate(2026, 11, 24),
  timezone: 'Europe/London',
  editable: true,
  firstDayOfWeek: 1,
  slotDuration: 30,
  snapDuration: 15,
  dayStartHour: 7,
  dayEndHour: 20,
  scrollToHour: 8,
  businessCalendar: { workingDays: [1, 2, 3, 4, 5], holidays: [{ date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true }] },
  createId: () => `e-${String(Date.now())}`,
  // The simulated server answers each visible range after a short delay.
  loadEvents: async (_range, signal) => {
    await wait(300, signal);
    return events;
  },
});
host.addEventListener('aui-event-change', (e) => {
  const detail = (e as CustomEvent<{ events?: readonly SchedulerEvent[] }>).detail;
  if (detail.events) events = [...detail.events];
});
sc.listen(host, ['aui-navigate', 'aui-slot-activate', 'aui-event-activate', 'aui-event-change', 'aui-event-delete', 'aui-load-error'], 'scheduler');

choice(
  sc,
  'View',
  [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'workWeek', label: 'Work week' },
    { value: 'month', label: 'Month' },
    { value: 'agenda', label: 'Agenda' },
    { value: 'timeline', label: 'Resource timeline' },
  ],
  'week',
  (view) => {
    scheduler.setView(view);
  },
);
choice(
  sc,
  'Time zone',
  [
    { value: 'Europe/London', label: 'London' },
    { value: 'America/New_York', label: 'New York' },
    { value: 'Asia/Kolkata', label: 'Kolkata' },
  ],
  'Europe/London',
  (timezone) => {
    scheduler.update({ timezone });
  },
);
toggle(sc, 'Editable', true, (editable) => {
  scheduler.update({ editable });
});
action(sc, 'Today', () => {
  scheduler.today();
});
action(sc, 'Undo', () => {
  scheduler.undo();
});
