import { plainDate, plainDateTime, plainTime, toInstant } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { DateTimePicker, type DateTimePickerOptions } from '@absoluteui/components/date-time-picker';
import { host, seed } from '../seed.js';

const zone = 'Europe/London';
const businessCalendar = createBusinessCalendar({
  holidays: [{ date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true }],
});

export default seed<DateTimePickerOptions>({
  options: {
    label: 'Interview slot',
    description: 'Interviews are held on working days, in UK time.',
    value: toInstant(plainDateTime(plainDate(2026, 11, 24), plainTime(10, 30)), zone),
    min: toInstant(plainDateTime(plainDate(2026, 11, 23), plainTime(9)), zone),
    timezone: zone,
    step: 15,
    hourCycle: 'h23',
    businessCalendar,
    disableNonWorking: true,
    name: 'interviewAt',
  },
  codeValues: {
    value: `toInstant(plainDateTime(plainDate(2026, 11, 24), plainTime(10, 30)), 'Europe/London')`,
    min: `toInstant(plainDateTime(plainDate(2026, 11, 23), plainTime(9)), 'Europe/London')`,
    businessCalendar: `createBusinessCalendar({ holidays: [{ date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true }] })`,
  },
  call: 'DateTimePicker.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = DateTimePicker.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
