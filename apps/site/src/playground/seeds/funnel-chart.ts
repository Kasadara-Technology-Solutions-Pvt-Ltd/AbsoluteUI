import { FunnelChart, type FunnelChartOptions } from '@absoluteui/components/funnel-chart';
import { host, seed } from '../seed.js';

export default seed<FunnelChartOptions>({
  options: {
    label: 'Hiring funnel',
    stages: [
      { id: 'applied', label: 'Applied', value: 1240 },
      { id: 'screened', label: 'Screened', value: 610 },
      { id: 'interviewed', label: 'Interviewed', value: 220 },
      { id: 'offer', label: 'Offer', value: 48 },
      { id: 'hired', label: 'Hired', value: 37 },
    ],
    showConversion: true,
  },
  call: 'FunnelChart.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = FunnelChart.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
