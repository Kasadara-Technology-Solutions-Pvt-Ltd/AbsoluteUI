// R3 phase 3a scheduling page (SPEC section 18.7, section 18.19), bundled against the built packages.
// ?view=week|month|agenda|timeline|day|workWeek; ?edit=1 edit mode; ?dir=rtl; ?theme=…;
// ?load=1 loads events through loadEvents (50 ms); ?fail=1 makes loading fail.
import { configureAbsoluteUI, parseInstant, parseRecurrenceRule, plainDate, plainDateTime, plainTime, plainYearMonth, type Instant } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { BusinessCalendar, createBusinessCalendar, type BusinessCalendarDefinition } from '@absoluteui/components/business-calendar';
import { RecurrencePicker } from '@absoluteui/components/recurrence-picker';
import { SchedulePicker } from '@absoluteui/components/schedule-picker';
import { Scheduler, expandEvents, type SchedulerEvent, type SchedulerView } from '@absoluteui/components/scheduler';

const params = new URLSearchParams(location.search);
const direction = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', locale: 'en-GB', timezone: 'Europe/London', direction });
document.documentElement.dir = direction;
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}
const at = (text: string): Instant => {
  const i = parseInstant(text);
  if (!i) throw new Error(text);
  return i;
};
const last = byId('last-event');
const log = (text: string): void => {
  last.textContent = text;
};

// A fixed clock keeps the page deterministic (visual baselines, "today", the current-time line).
const NOW = at('2026-09-29T10:20:00Z');
const business: BusinessCalendarDefinition = {
  holidays: [{ date: plainDate(2026, 10, 2), name: 'Founders day' }, { date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true }],
  exceptions: [{ date: plainDate(2026, 10, 3), working: true, name: 'Release weekend' }],
};
const events: SchedulerEvent[] = [
  { id: 'standup', title: 'Standup', start: at('2026-09-28T08:00:00Z'), end: at('2026-09-28T08:15:00Z'), timeZone: 'Europe/London', recurrence: parseRecurrenceRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'), resourceId: 'r1' },
  { id: 'review', title: 'Design review', start: at('2026-09-29T09:00:00Z'), end: at('2026-09-29T10:30:00Z'), location: 'Room 4', color: 3, resourceId: 'r2' },
  { id: 'lunch', title: 'Team lunch', start: at('2026-09-29T11:30:00Z'), end: at('2026-09-29T12:30:00Z'), color: 2, resourceId: 'r1' },
  { id: 'interview', title: 'Interview', start: at('2026-09-29T09:30:00Z'), end: at('2026-09-29T10:00:00Z'), color: 5, resourceId: 'r3' },
  { id: 'offsite', title: 'Offsite', start: plainDate(2026, 9, 30), end: plainDate(2026, 10, 1), color: 4 },
  { id: 'deploy', title: 'Deploy (locked)', start: at('2026-10-01T13:00:00Z'), end: at('2026-10-01T14:00:00Z'), readOnly: true, color: 6, resourceId: 'r2' },
  { id: 'late', title: 'On call', start: at('2026-10-01T20:00:00Z'), end: at('2026-10-02T06:00:00Z'), color: 7, resourceId: 'r3' },
];
const resources = [{ id: 'r1', label: 'Ada Lovelace' }, { id: 'r2', label: 'Room 4', color: 3 }, { id: 'r3', label: 'Grace Hopper', color: 5 }];
const viewParam = params.get('view');
const view = (['day', 'week', 'workWeek', 'month', 'agenda', 'timeline'].includes(viewParam ?? '') ? viewParam : 'week') as SchedulerView;
const fail = params.get('fail') === '1';

const host = byId('scheduler');
const scheduler = Scheduler.create(host, {
  label: 'Team calendar',
  view,
  date: plainDate(2026, 9, 29),
  now: NOW,
  resources,
  editable: params.get('edit') === '1',
  businessCalendar: business,
  firstDayOfWeek: 1,
  dayStartHour: 7,
  dayEndHour: 20,
  ...(params.get('load') === '1' || fail
    ? {
        loadEvents: (_range, signal) => new Promise<readonly SchedulerEvent[]>((resolve, reject) => {
          const t = setTimeout(() => {
            if (fail) reject(new Error('Calendar service unavailable'));
            else resolve(events);
          }, 50);
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
          }, { once: true });
        }),
      }
    : { events }),
});
for (const type of ['aui-navigate', 'aui-slot-activate', 'aui-event-activate', 'aui-event-change', 'aui-event-delete', 'aui-load-error']) {
  host.addEventListener(type, (e) => {
    const d = (e as CustomEvent<Record<string, unknown>>).detail;
    const key = typeof d.occurrence === 'object' && d.occurrence !== null ? (d.occurrence as { key: string }).key : '';
    log(`${type.replace('aui-', '')} ${typeof d.reason === 'string' ? d.reason : ''} ${typeof d.scope === 'string' ? d.scope : ''} ${key}`.replace(/\s+/g, ' ').trim());
  });
}

const schedule = SchedulePicker.create(byId('schedule'), {
  label: 'When',
  name: 'when',
  recurrence: true,
  timeZones: ['Europe/London', 'America/New_York', 'Asia/Kolkata', 'Australia/Lord_Howe'],
  value: { allDay: false, start: at('2026-09-29T08:00:00Z'), end: at('2026-09-29T09:30:00Z'), timeZone: 'Europe/London', recurrence: parseRecurrenceRule('FREQ=WEEKLY;BYDAY=TU') },
  firstDayOfWeek: 1,
});
const recurrence = RecurrencePicker.create(byId('recurrence'), {
  label: 'Report cycle',
  name: 'cycle',
  start: plainDateTime(plainDate(2026, 9, 30), plainTime(17)),
  value: parseRecurrenceRule('FREQ=MONTHLY;BYDAY=-1WE;COUNT=6'),
  firstDayOfWeek: 1,
});
const calendar = BusinessCalendar.create(byId('business'), {
  label: 'Office days',
  definition: business,
  month: plainYearMonth(2026, 9),
  months: 2,
  editable: params.get('edit') === '1',
  today: plainDate(2026, 9, 29),
  firstDayOfWeek: 1,
});

Object.assign(window, { __auiReady: true, __aui: { Scheduler, BusinessCalendar, RecurrencePicker, SchedulePicker, createBusinessCalendar, expandEvents, parseRecurrenceRule, scheduler, schedule, recurrence, calendar, events } });
