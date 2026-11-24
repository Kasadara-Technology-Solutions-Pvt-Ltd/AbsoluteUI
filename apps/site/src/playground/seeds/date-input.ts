import { plainDate } from '@absoluteui/core';
import { DateInput, type DateInputOptions } from '@absoluteui/components/date-input';
import { host, seed } from '../seed.js';

export default seed<DateInputOptions>({
  options: {
    label: 'Contract end date',
    description: 'Day, month, and year; type or use the arrow keys.',
    value: plainDate(2027, 3, 31),
    min: plainDate(2026, 11, 23),
    max: plainDate(2028, 12, 31),
    name: 'contractEnd',
    required: true,
  },
  codeValues: {
    value: 'plainDate(2027, 3, 31)',
    min: 'plainDate(2026, 11, 23)',
    max: 'plainDate(2028, 12, 31)',
  },
  call: 'DateInput.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = DateInput.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
