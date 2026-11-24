import { Histogram, type HistogramOptions } from '@absoluteui/components/histogram';
import { host, seed } from '../seed.js';

export default seed<HistogramOptions>({
  options: {
    label: 'Ticket resolution times',
    values: [1.5, 2.2, 3.1, 3.8, 4.0, 4.4, 5.2, 5.5, 5.9, 6.1, 6.3, 6.8, 7.0, 7.2, 7.4, 7.9, 8.1, 8.3, 8.6, 8.8, 9.0, 9.4, 9.7, 10.2, 10.5, 11.1, 11.8, 12.4, 13.0, 14.2, 15.6, 17.9],
    bins: 'auto',
    xAxis: { label: 'Hours' },
    yAxis: { label: 'Tickets' },
  },
  call: 'Histogram.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Histogram.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
