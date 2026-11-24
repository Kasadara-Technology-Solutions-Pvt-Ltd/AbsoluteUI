import { Switch, type SwitchOptions } from '@absoluteui/components/switch';
import { host, seed } from '../seed.js';

export default seed<SwitchOptions>({
  options: {
    label: 'Email me when a leave request needs approval',
    checked: true,
    name: 'approvalEmails',
    description: 'Takes effect immediately.',
  },
  call: 'Switch.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Switch.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
