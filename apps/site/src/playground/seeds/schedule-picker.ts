import { plainDate, plainDateTime, plainTime, recurrenceRule, toInstant } from '@absoluteui/core';
import { SchedulePicker, type SchedulePickerOptions } from '@absoluteui/components/schedule-picker';
import { host, seed } from '../seed.js';

const zone = 'Europe/Berlin';

export default seed<SchedulePickerOptions>({
  options: {
    label: 'Onboarding session',
    description: 'New starters join on the first Tuesday of each month.',
    value: {
      allDay: false,
      start: toInstant(plainDateTime(plainDate(2026, 12, 1), plainTime(10)), zone),
      end: toInstant(plainDateTime(plainDate(2026, 12, 1), plainTime(11, 30)), zone),
      timeZone: zone,
      recurrence: recurrenceRule({ frequency: 'monthly', byDay: [{ weekday: 2, nth: 1 }], count: 6 }),
    },
    timeZones: ['Europe/Berlin', 'Europe/London', 'America/New_York', 'Asia/Kolkata'],
    recurrence: true,
    timezone: zone,
    name: 'onboarding',
  },
  codeValues: {
    value: `{
    allDay: false,
    start: toInstant(plainDateTime(plainDate(2026, 12, 1), plainTime(10)), 'Europe/Berlin'),
    end: toInstant(plainDateTime(plainDate(2026, 12, 1), plainTime(11, 30)), 'Europe/Berlin'),
    timeZone: 'Europe/Berlin',
    recurrence: recurrenceRule({ frequency: 'monthly', byDay: [{ weekday: 2, nth: 1 }], count: 6 }),
  }`,
  },
  call: 'SchedulePicker.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = SchedulePicker.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
