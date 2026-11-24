import { plainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { Calendar, type CalendarOptions } from '@absoluteui/components/calendar';
import { host, seed } from '../seed.js';

const businessCalendar = createBusinessCalendar({
  holidays: [
    { date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true },
    { date: plainDate(2026, 12, 28), name: 'Boxing Day (substitute)' },
  ],
});

export default seed<CalendarOptions>({
  options: {
    label: 'Team availability',
    value: plainDate(2026, 12, 21),
    businessCalendar,
    showWeekNumbers: true,
  },
  codeValues: {
    value: 'plainDate(2026, 12, 21)',
    businessCalendar: `createBusinessCalendar({
    holidays: [
      { date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true },
      { date: plainDate(2026, 12, 28), name: 'Boxing Day (substitute)' },
    ],
  })`,
  },
  call: 'Calendar.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Calendar.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
