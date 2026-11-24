import { ScatterChart, type ScatterChartOptions } from '@absoluteui/components/scatter-chart';
import { host, seed } from '../seed.js';

export default seed<ScatterChartOptions>({
  options: {
    label: 'Accounts by revenue and satisfaction',
    series: [
      {
        id: 'enterprise',
        label: 'Enterprise',
        points: [
          { x: 420, y: 82, size: 250, label: 'Northwind' },
          { x: 380, y: 74, size: 180, label: 'Contoso' },
          { x: 510, y: 91, size: 300, label: 'Fabrikam' },
        ],
      },
      {
        id: 'mid-market',
        label: 'Mid-market',
        points: [
          { x: 140, y: 68, size: 60, label: 'Tailspin' },
          { x: 190, y: 85, size: 90, label: 'Litware' },
          { x: 230, y: 63, size: 75, label: 'Proseware' },
        ],
      },
    ],
    xAxis: { label: 'Annual revenue (k€)' },
    yAxis: { label: 'Satisfaction score', min: 40, max: 100 },
    sizeLabel: 'Seats',
  },
  call: 'ScatterChart.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = ScatterChart.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
