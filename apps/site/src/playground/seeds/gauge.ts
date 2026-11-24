import { Gauge, type GaugeOptions } from '@absoluteui/components/gauge';
import { host, seed } from '../seed.js';

export default seed<GaugeOptions>({
  options: {
    label: 'Customer satisfaction',
    value: 78,
    min: 0,
    max: 100,
    target: 85,
    bands: [
      { to: 60, label: 'Poor', color: 2 },
      { to: 80, label: 'Fair', color: 4 },
      { to: 100, label: 'Good', color: 3 },
    ],
  },
  call: 'Gauge.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Gauge.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
