import { Checkbox, type CheckboxOptions } from '@absoluteui/components/checkbox';
import { host, seed } from '../seed.js';

export default seed<CheckboxOptions>({
  options: {
    label: 'I confirm the timesheet for this week is accurate',
    name: 'timesheetConfirmed',
    value: 'yes',
    description: 'Required before the timesheet goes to your manager.',
    required: true,
  },
  call: 'Checkbox.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Checkbox.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
