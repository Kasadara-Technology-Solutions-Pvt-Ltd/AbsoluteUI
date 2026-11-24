import { YearPicker, type YearPickerOptions } from '@absoluteui/components/year-picker';
import { host, seed } from '../seed.js';

export default seed<YearPickerOptions>({
  options: {
    label: 'Fiscal year',
    description: 'Budgets are planned from 2020 to 2030.',
    value: 2026,
    min: 2020,
    max: 2030,
    name: 'fiscalYear',
  },
  call: 'YearPicker.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = YearPicker.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
