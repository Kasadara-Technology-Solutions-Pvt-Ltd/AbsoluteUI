import { StatCard, type StatCardOptions } from '@absoluteui/components/stat-card';
import { host, seed } from '../seed.js';

export default seed<StatCardOptions>({
  options: {
    label: 'Monthly payroll',
    value: 4825000,
    previous: 4610000,
    comparisonLabel: 'vs last month',
    description: 'All entities, before tax.',
    trend: [4380000, 4420000, 4510000, 4560000, 4610000, 4825000],
    valueFormat: { style: 'currency', currency: 'EUR', notation: 'compact' },
    sentiment: 'neutral',
  },
  call: 'StatCard.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = StatCard.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
