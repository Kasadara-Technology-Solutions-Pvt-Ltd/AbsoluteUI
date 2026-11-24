import { Treemap, type TreemapOptions } from '@absoluteui/components/treemap';
import { host, seed } from '../seed.js';

export default seed<TreemapOptions>({
  options: {
    label: 'Spending by department',
    data: [
      { id: 'eng', label: 'Engineering', children: [{ id: 'cloud', label: 'Cloud', value: 420 }, { id: 'tools', label: 'Tools', value: 120 }, { id: 'hw', label: 'Hardware', value: 90 }] },
      { id: 'sales', label: 'Sales', children: [{ id: 'events', label: 'Events', value: 160 }, { id: 'travel', label: 'Travel', value: 110 }] },
      { id: 'ops', label: 'Operations', children: [{ id: 'rent', label: 'Rent', value: 300 }, { id: 'utilities', label: 'Utilities', value: 60 }] },
    ],
    drillDown: true,
    rootLabel: 'All departments',
    valueFormat: { style: 'currency', currency: 'EUR', notation: 'compact' },
  },
  call: 'Treemap.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Treemap.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
