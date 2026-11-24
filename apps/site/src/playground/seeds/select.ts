import { Select, type SelectOptions } from '@absoluteui/components/select';
import { host, seed } from '../seed.js';

export default seed<SelectOptions>({
  options: {
    label: 'Department',
    options: [
      { value: 'eng', label: 'Engineering' },
      { value: 'fin', label: 'Finance', description: 'Accounting and payroll' },
      { value: 'hr', label: 'People' },
      { value: 'ops', label: 'Operations', disabled: true },
    ],
    placeholder: 'Choose a department',
  },
  call: 'Select.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Select.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
