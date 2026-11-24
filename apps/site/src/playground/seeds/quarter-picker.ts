import { plainYearQuarter } from '@absoluteui/core';
import { QuarterPicker, type QuarterPickerOptions } from '@absoluteui/components/quarter-picker';
import { host, seed } from '../seed.js';

export default seed<QuarterPickerOptions>({
  options: {
    label: 'Review quarter',
    description: 'Performance reviews close at the end of each quarter.',
    value: plainYearQuarter(2026, 4),
    min: plainYearQuarter(2025, 1),
    max: plainYearQuarter(2027, 4),
    name: 'reviewQuarter',
  },
  codeValues: {
    value: 'plainYearQuarter(2026, 4)',
    min: 'plainYearQuarter(2025, 1)',
    max: 'plainYearQuarter(2027, 4)',
  },
  call: 'QuarterPicker.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = QuarterPicker.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
