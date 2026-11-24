import { BulletChart, type BulletChartOptions } from '@absoluteui/components/bullet-chart';
import { host, seed } from '../seed.js';

export default seed<BulletChartOptions>({
  options: {
    label: 'Revenue against target',
    measures: [
      { id: 'emea', label: 'EMEA', value: 410, target: 450, ranges: [300, 400, 500] },
      { id: 'apac', label: 'APAC', value: 380, target: 350, ranges: [250, 350, 450] },
      { id: 'amer', label: 'Americas', value: 520, target: 560, ranges: [400, 500, 600] },
    ],
    rangeLabels: ['Poor', 'Satisfactory', 'Good'],
    valueFormat: { style: 'currency', currency: 'EUR', notation: 'compact' },
  },
  call: 'BulletChart.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = BulletChart.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
