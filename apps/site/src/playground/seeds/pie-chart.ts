import { PieChart, type PieChartOptions } from '@absoluteui/components/pie-chart';
import { host, seed } from '../seed.js';

export default seed<PieChartOptions>({
  options: {
    label: 'Headcount by department',
    slices: [
      { id: 'eng', label: 'Engineering', value: 48 },
      { id: 'sales', label: 'Sales', value: 27 },
      { id: 'support', label: 'Support', value: 15 },
      { id: 'hr', label: 'People and HR', value: 10 },
    ],
    donut: true,
    centerLabel: 'Employees',
  },
  call: 'PieChart.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = PieChart.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
