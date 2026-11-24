import { Alert, type AlertOptions } from '@absoluteui/components/alert';
import { host, seed } from '../seed.js';

export default seed<AlertOptions>({
  options: {
    tone: 'warning',
    title: 'Payroll closes on Friday',
    message: '3 timesheets in your team are still waiting for approval.',
    actions: [
      { label: 'Review timesheets', value: 'review', variant: 'primary' },
      { label: 'Remind later', value: 'later', variant: 'secondary' },
    ],
    dismissible: true,
  },
  call: 'Alert.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Alert.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
