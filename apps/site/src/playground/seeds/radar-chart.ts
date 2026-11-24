import { RadarChart, type RadarChartOptions } from '@absoluteui/components/radar-chart';
import { host, seed } from '../seed.js';

export default seed<RadarChartOptions>({
  options: {
    label: 'Team skills',
    axes: ['Delivery', 'Quality', 'Collaboration', 'Innovation', 'Customer focus'],
    series: [
      { id: 'platform', label: 'Platform', values: [8, 9, 7, 6, 7] },
      { id: 'web', label: 'Web', values: [9, 7, 8, 8, 9] },
    ],
    valueAxis: { min: 0, max: 10 },
    fill: true,
  },
  call: 'RadarChart.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = RadarChart.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
