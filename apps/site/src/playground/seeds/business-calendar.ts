import { plainDate, plainTime, plainYearMonth } from '@absoluteui/core';
import { BusinessCalendar, type BusinessCalendarOptions } from '@absoluteui/components/business-calendar';
import { host, seed } from '../seed.js';

export default seed<BusinessCalendarOptions>({
  options: {
    label: 'Company calendar',
    definition: {
      workingDays: [1, 2, 3, 4, 5],
      hours: [{ start: plainTime(9), end: plainTime(17, 30) }],
      weekdayHours: { '5': [{ start: plainTime(9), end: plainTime(15) }] },
      holidays: [
        { date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true },
        { date: plainDate(2027, 1, 1), name: 'New Year holiday', yearly: true },
      ],
      exceptions: [
        { date: plainDate(2026, 11, 28), working: true, name: 'Stocktaking' },
        { date: plainDate(2026, 12, 31), working: false, name: 'Year-end shutdown' },
      ],
    },
    month: plainYearMonth(2026, 11),
    months: 2,
    editable: true,
  },
  codeValues: {
    definition: `{
    workingDays: [1, 2, 3, 4, 5],
    hours: [{ start: plainTime(9), end: plainTime(17, 30) }],
    weekdayHours: { '5': [{ start: plainTime(9), end: plainTime(15) }] },
    holidays: [
      { date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true },
      { date: plainDate(2027, 1, 1), name: 'New Year holiday', yearly: true },
    ],
    exceptions: [
      { date: plainDate(2026, 11, 28), working: true, name: 'Stocktaking' },
      { date: plainDate(2026, 12, 31), working: false, name: 'Year-end shutdown' },
    ],
  }`,
    month: 'plainYearMonth(2026, 11)',
  },
  call: 'BusinessCalendar.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = BusinessCalendar.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
