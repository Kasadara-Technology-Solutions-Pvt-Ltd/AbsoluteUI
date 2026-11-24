import { plainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { DateRangePicker, type DateRangePickerOptions } from '@absoluteui/components/date-range-picker';
import { host, seed } from '../seed.js';

const businessCalendar = createBusinessCalendar({
  holidays: [
    { date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true },
    { date: plainDate(2027, 1, 1), name: 'New Year holiday', yearly: true },
  ],
});

export default seed<DateRangePickerOptions>({
  options: {
    label: 'Annual leave',
    startLabel: 'First day',
    endLabel: 'Last day',
    description: 'Up to 20 days; weekends and holidays are marked in the calendar.',
    value: { start: plainDate(2026, 12, 21), end: plainDate(2026, 12, 24) },
    min: plainDate(2026, 11, 23),
    maxDays: 20,
    businessCalendar,
    months: 2,
    name: 'leave',
  },
  codeValues: {
    value: '{ start: plainDate(2026, 12, 21), end: plainDate(2026, 12, 24) }',
    min: 'plainDate(2026, 11, 23)',
    businessCalendar: `createBusinessCalendar({
    holidays: [
      { date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true },
      { date: plainDate(2027, 1, 1), name: 'New Year holiday', yearly: true },
    ],
  })`,
  },
  call: 'DateRangePicker.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = DateRangePicker.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
