import { plainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { DatePicker, type DatePickerOptions } from '@absoluteui/components/date-picker';
import { host, seed } from '../seed.js';

const businessCalendar = createBusinessCalendar({
  holidays: [
    { date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true },
    { date: plainDate(2027, 1, 1), name: 'New Year holiday', yearly: true },
  ],
});

export default seed<DatePickerOptions>({
  options: {
    label: 'Leave start',
    description: 'Weekends and company holidays cannot be chosen.',
    value: plainDate(2026, 12, 21),
    min: plainDate(2026, 11, 23),
    businessCalendar,
    disableNonWorking: true,
    name: 'leaveStart',
    required: true,
  },
  codeValues: {
    value: 'plainDate(2026, 12, 21)',
    min: 'plainDate(2026, 11, 23)',
    businessCalendar: `createBusinessCalendar({
    holidays: [
      { date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true },
      { date: plainDate(2027, 1, 1), name: 'New Year holiday', yearly: true },
    ],
  })`,
  },
  call: 'DatePicker.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = DatePicker.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
