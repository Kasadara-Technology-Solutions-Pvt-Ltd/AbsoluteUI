import { CheckboxGroup, type CheckboxGroupOptions } from '@absoluteui/components/checkbox-group';
import { host, seed } from '../seed.js';

export default seed<CheckboxGroupOptions>({
  options: {
    label: 'Benefits',
    options: [
      { value: 'health', label: 'Health insurance', description: 'Employee and dependants' },
      { value: 'pension', label: 'Pension plan' },
      { value: 'transit', label: 'Public transport pass' },
      { value: 'gym', label: 'Gym membership' },
      { value: 'car', label: 'Company car', description: 'Managers only', disabled: true },
    ],
    value: ['health', 'pension'],
    name: 'benefits',
    description: 'Choose between one and three benefits.',
    minSelected: 1,
    maxSelected: 3,
  },
  call: 'CheckboxGroup.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = CheckboxGroup.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
