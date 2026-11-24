import { Sparkline, type SparklineOptions } from '@absoluteui/components/sparkline';
import { host, seed } from '../seed.js';

export default seed<SparklineOptions>({
  options: {
    label: 'Daily sign-ups',
    values: [12, 18, 15, 22, 30, 28, 35, 33, 41],
    variant: 'line',
    highlightLast: true,
  },
  call: 'Sparkline.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Sparkline.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
