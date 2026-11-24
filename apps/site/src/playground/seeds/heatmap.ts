import { Heatmap, type HeatmapOptions } from '@absoluteui/components/heatmap';
import { host, seed } from '../seed.js';

export default seed<HeatmapOptions>({
  options: {
    label: 'Support requests by day and hour',
    columns: ['08', '10', '12', '14', '16', '18'],
    rows: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    values: [
      [12, 38, 22, 25, 41, 14],
      [10, 34, 20, 27, 36, 12],
      [11, 31, 24, 23, 39, 15],
      [9, 29, 19, 26, 33, 11],
      [8, 24, 17, 18, 22, 6],
    ],
    cellLabels: 'auto',
  },
  call: 'Heatmap.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Heatmap.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
