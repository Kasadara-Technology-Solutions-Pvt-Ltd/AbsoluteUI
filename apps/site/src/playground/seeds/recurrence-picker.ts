import { plainDate, recurrenceRule } from '@absoluteui/core';
import { RecurrencePicker, type RecurrencePickerOptions } from '@absoluteui/components/recurrence-picker';
import { host, seed } from '../seed.js';

export default seed<RecurrencePickerOptions>({
  options: {
    label: 'Team check-in',
    description: 'Twice a week for the review cycle.',
    value: recurrenceRule({ frequency: 'weekly', byDay: [{ weekday: 1 }, { weekday: 4 }], count: 12 }),
    start: plainDate(2026, 11, 23),
    previewCount: 5,
    name: 'checkIn',
  },
  codeValues: {
    value: `recurrenceRule({ frequency: 'weekly', byDay: [{ weekday: 1 }, { weekday: 4 }], count: 12 })`,
    start: 'plainDate(2026, 11, 23)',
  },
  call: 'RecurrencePicker.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = RecurrencePicker.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
