import { LineChart, type LineChartOptions } from '@absoluteui/components/line-chart';
import { host, seed } from '../seed.js';

export default seed<LineChartOptions>({
  options: {
    label: 'Monthly revenue',
    x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    series: [
      { id: 'eu', label: 'Europe', values: [120, 132, 101, 134, 90, 230] },
      { id: 'us', label: 'Americas', values: [220, 182, 191, 234, 290, 330] },
    ],
    yAxis: { label: 'EUR thousand' },
  },
  call: 'LineChart.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = LineChart.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
