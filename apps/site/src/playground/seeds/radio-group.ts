import { RadioGroup, type RadioGroupOptions } from '@absoluteui/components/radio-group';
import { host, seed } from '../seed.js';

export default seed<RadioGroupOptions>({
  options: {
    label: 'Leave type',
    options: [
      { value: 'annual', label: 'Annual leave', description: '14 days remaining' },
      { value: 'sick', label: 'Sick leave' },
      { value: 'parental', label: 'Parental leave' },
      { value: 'unpaid', label: 'Unpaid leave', description: 'Needs HR approval', disabled: true },
    ],
    value: 'annual',
    name: 'leaveType',
    description: 'Public holidays are not deducted from your balance.',
    required: true,
  },
  call: 'RadioGroup.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = RadioGroup.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
