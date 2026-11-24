import { Tabs, type TabsOptions } from '@absoluteui/components/tabs';
import { host, seed } from '../seed.js';

export default seed<TabsOptions>({
  options: {
    label: 'Employee profile',
    value: 'job',
    tabs: [
      { id: 'personal', label: 'Personal', content: 'Ada Lovelace, born 10 December 1815, London.' },
      { id: 'job', label: 'Job', content: 'Principal engineer, Analytical Engines team, since March 2021.' },
      { id: 'pay', label: 'Compensation', content: 'Paid monthly; last review on 1 April.' },
      { id: 'docs', label: 'Documents', disabled: true, content: 'No documents yet.' },
    ],
  },
  call: 'Tabs.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Tabs.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
