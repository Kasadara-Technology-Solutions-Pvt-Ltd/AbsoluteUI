import { ComboChart, type ComboChartOptions } from '@absoluteui/components/combo-chart';
import { host, seed } from '../seed.js';

export default seed<ComboChartOptions>({
  options: {
    label: 'Orders and conversion',
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    series: [
      { id: 'orders', label: 'Orders', type: 'bar', values: [420, 460, 510, 480, 560, 610] },
      { id: 'conversion', label: 'Conversion rate', type: 'line', axis: 'secondary', values: [0.021, 0.023, 0.026, 0.024, 0.028, 0.031] },
    ],
    primaryAxis: { label: 'Orders' },
    secondaryAxis: { label: 'Conversion', format: { style: 'percent', maximumFractionDigits: 1 } },
  },
  call: 'ComboChart.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = ComboChart.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
