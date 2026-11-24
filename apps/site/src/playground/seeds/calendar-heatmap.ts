import { addDays, plainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { CalendarHeatmap, type CalendarHeatmapOptions } from '@absoluteui/components/calendar-heatmap';
import { host, seed } from '../seed.js';

const businessCalendar = createBusinessCalendar({
  holidays: [
    { date: plainDate(2026, 1, 1), name: 'New Year', yearly: true },
    { date: plainDate(2026, 4, 3), name: 'Good Friday' },
  ],
});

export default seed<CalendarHeatmapOptions>({
  options: {
    label: 'Absences, first quarter',
    from: plainDate(2026, 1, 1),
    to: plainDate(2026, 3, 31),
    data: Array.from({ length: 90 }, (_, i) => ({ date: addDays(plainDate(2026, 1, 1), i), value: (i * 7) % 6 })),
    businessCalendar,
    colorScale: { color: 4, steps: 4 },
  },
  codeValues: {
    from: 'plainDate(2026, 1, 1)',
    to: 'plainDate(2026, 3, 31)',
    data: 'Array.from({ length: 90 }, (_, i) => ({ date: addDays(plainDate(2026, 1, 1), i), value: (i * 7) % 6 }))',
    businessCalendar: `createBusinessCalendar({
    holidays: [
      { date: plainDate(2026, 1, 1), name: 'New Year', yearly: true },
      { date: plainDate(2026, 4, 3), name: 'Good Friday' },
    ],
  })`,
  },
  call: 'CalendarHeatmap.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = CalendarHeatmap.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
