import { WaterfallChart, type WaterfallChartOptions } from '@absoluteui/components/waterfall-chart';
import { host, seed } from '../seed.js';

export default seed<WaterfallChartOptions>({
  options: {
    label: 'Profit bridge',
    steps: [
      { id: 'start', label: 'Revenue', kind: 'total', value: 1200 },
      { id: 'cogs', label: 'Cost of sales', value: -480 },
      { id: 'opex', label: 'Operating costs', value: -310 },
      { id: 'other', label: 'Other income', value: 45 },
      { id: 'tax', label: 'Tax', value: -110 },
      { id: 'net', label: 'Net profit', kind: 'total' },
    ],
    valueFormat: { style: 'currency', currency: 'EUR', notation: 'compact' },
    valueLabels: true,
  },
  call: 'WaterfallChart.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = WaterfallChart.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
