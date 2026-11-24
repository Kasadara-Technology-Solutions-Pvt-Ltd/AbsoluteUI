import { BarChart, type BarChartOptions } from '@absoluteui/components/bar-chart';
import { host, seed } from '../seed.js';

export default seed<BarChartOptions>({
  options: {
    label: 'Revenue by quarter',
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { id: 'licenses', label: 'Licenses', values: [310, 340, 365, 420] },
      { id: 'services', label: 'Services', values: [120, 135, 150, 160] },
    ],
    valueFormat: { style: 'currency', currency: 'EUR', notation: 'compact' },
    valueAxis: { label: 'EUR thousand' },
  },
  call: 'BarChart.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = BarChart.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
