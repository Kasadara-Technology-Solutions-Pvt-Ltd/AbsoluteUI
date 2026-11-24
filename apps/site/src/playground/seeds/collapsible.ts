import { Collapsible, type CollapsibleOptions } from '@absoluteui/components/collapsible';
import { host, seed } from '../seed.js';

export default seed<CollapsibleOptions>({
  options: {
    label: 'Advanced payroll settings',
    content: 'Overtime is paid at 1.5 times the hourly rate after 40 hours a week. Bank holidays count as worked days.',
    variant: 'bordered',
    headingLevel: 3,
  },
  call: 'Collapsible.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Collapsible.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
