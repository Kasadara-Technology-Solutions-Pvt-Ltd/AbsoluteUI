import { DashboardWidget, type DashboardWidgetOptions } from '@absoluteui/components/dashboard-widget';
import { StatCard } from '@absoluteui/components/stat-card';
import { host, seed } from '../seed.js';

export default seed<DashboardWidgetOptions>({
  options: {
    title: 'Headcount',
    subtitle: 'All entities, end of month',
    actions: [
      { id: 'refresh', label: 'Refresh headcount', icon: 'refresh' },
      { id: 'download', label: 'Download headcount', icon: 'download' },
    ],
    removable: true,
  },
  call: 'DashboardWidget.create(host, $)',
  note: 'The host keeps its own children as the widget body; here, a Stat Card.',
  mount(stage, options) {
    const h = host(stage, 'section');
    const card = StatCard.create(host(h), { label: 'Employees', value: 1284, previous: 1240, comparisonLabel: 'vs last quarter', trend: [1190, 1205, 1222, 1240, 1261, 1284] });
    const c = DashboardWidget.create(h, options);
    return {
      events: h,
      update: (p) => { c.update(p); },
      destroy: () => {
        c.destroy();
        card.destroy();
        h.remove();
      },
    };
  },
});
