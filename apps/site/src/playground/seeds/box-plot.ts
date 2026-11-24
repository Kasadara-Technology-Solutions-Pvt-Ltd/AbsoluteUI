import { BoxPlot, type BoxPlotOptions } from '@absoluteui/components/box-plot';
import { host, seed } from '../seed.js';

export default seed<BoxPlotOptions>({
  options: {
    label: 'Salaries by grade',
    categories: ['G1', 'G2', 'G3', 'G4'],
    series: [
      {
        id: 'eu',
        label: 'Europe',
        data: [
          { min: 31, q1: 36, median: 39, q3: 43, max: 49, outliers: [58] },
          { min: 45, q1: 51, median: 55, q3: 59, max: 66 },
          { min: 60, q1: 66, median: 70, q3: 75, max: 83, outliers: [96] },
          { min: 76, q1: 82, median: 87, q3: 92, max: 101 },
        ],
      },
      {
        id: 'in',
        label: 'India',
        data: [
          { min: 12, q1: 15, median: 17, q3: 19, max: 22 },
          { min: 20, q1: 23, median: 25, q3: 28, max: 31 },
          { min: 28, q1: 31, median: 34, q3: 36, max: 40, outliers: [47] },
          { min: 36, q1: 40, median: 42, q3: 45, max: 50 },
        ],
      },
    ],
    valueAxis: { label: 'Salary (k€)' },
  },
  call: 'BoxPlot.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = BoxPlot.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
