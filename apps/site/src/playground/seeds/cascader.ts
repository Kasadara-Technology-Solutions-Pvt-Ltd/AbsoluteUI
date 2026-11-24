import { Cascader, type CascaderOptions } from '@absoluteui/components/cascader';
import { host, seed } from '../seed.js';

export default seed<CascaderOptions>({
  options: {
    label: 'Work location',
    levelLabels: ['Country', 'State', 'City'],
    options: [
      {
        value: 'in',
        label: 'India',
        children: [
          { value: 'ka', label: 'Karnataka', children: [{ value: 'blr', label: 'Bengaluru' }, { value: 'mys', label: 'Mysuru' }] },
          { value: 'mh', label: 'Maharashtra', children: [{ value: 'bom', label: 'Mumbai' }, { value: 'pnq', label: 'Pune' }] },
        ],
      },
      { value: 'de', label: 'Germany', children: [{ value: 'by', label: 'Bavaria', children: [{ value: 'muc', label: 'Munich' }] }] },
      { value: 'us', label: 'United States', children: [{ value: 'ny', label: 'New York', children: [{ value: 'nyc', label: 'New York City' }] }] },
    ],
    value: ['in', 'ka', 'blr'],
  },
  call: 'Cascader.create(host, $)',
  // One path in single mode, a list of paths with `multiple`.
  adjust: (name, value) => (name === 'multiple' ? { value: value === true ? [['in', 'ka', 'blr']] : ['in', 'ka', 'blr'] } : undefined),
  mount(stage, options) {
    const h = host(stage);
    const c = Cascader.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
