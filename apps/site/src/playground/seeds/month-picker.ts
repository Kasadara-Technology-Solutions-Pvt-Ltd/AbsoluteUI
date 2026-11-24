import { plainYearMonth } from '@absoluteui/core';
import { MonthPicker, type MonthPickerOptions } from '@absoluteui/components/month-picker';
import { host, seed } from '../seed.js';

export default seed<MonthPickerOptions>({
  options: {
    label: 'Payroll month',
    description: 'Payroll months before 2026 are closed.',
    value: plainYearMonth(2026, 11),
    min: plainYearMonth(2026, 1),
    max: plainYearMonth(2027, 12),
    name: 'payrollMonth',
    required: true,
  },
  codeValues: {
    value: 'plainYearMonth(2026, 11)',
    min: 'plainYearMonth(2026, 1)',
    max: 'plainYearMonth(2027, 12)',
  },
  call: 'MonthPicker.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = MonthPicker.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
