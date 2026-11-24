import { Dashboard, type DashboardOptions } from '@absoluteui/components/dashboard';
import { registerBuiltInWidgets } from '@absoluteui/components/dashboard/widgets';
import { host, seed } from '../seed.js';

registerBuiltInWidgets();

export default seed<DashboardOptions>({
  options: {
    definition: {
      schemaVersion: 1,
      id: 'workforce',
      title: 'Workforce',
      dataSources: {
        headcount: { kind: 'static', data: { total: 1284, previous: 1240, trend: [1190, 1205, 1222, 1240, 1261, 1284] } },
        hiring: { kind: 'static', data: { done: 68 } },
        departments: {
          kind: 'static',
          data: [
            { department: 'Engineering', people: 512 },
            { department: 'Sales', people: 318 },
            { department: 'Operations', people: 241 },
            { department: 'Finance', people: 126 },
            { department: 'People', people: 87 },
          ],
        },
      },
      widgets: [
        { id: 'headcount', type: 'kpi', title: 'Headcount', source: 'headcount', map: { value: '/total', previous: '/previous', trend: '/trend' }, options: { comparisonLabel: 'vs last quarter' }, layout: { x: 0, y: 0, w: 4, h: 3 } },
        { id: 'hiring', type: 'progress', title: 'Hiring plan', source: 'hiring', map: { value: '/done' }, options: { thresholds: [{ below: 50, tone: 'warning' }] }, layout: { x: 4, y: 0, w: 4, h: 2 } },
        { id: 'top', type: 'list', title: 'Largest departments', source: 'departments', transforms: [{ op: 'sort', field: 'people', direction: 'desc' }], options: { label: 'department', value: 'people' }, layout: { x: 8, y: 0, w: 4, h: 3 } },
        { id: 'by-dept', type: 'bar-chart', title: 'People by department', source: 'departments', options: { category: 'department', series: [{ field: 'people', label: 'People' }] }, actions: { maximizable: true }, layout: { x: 0, y: 3, w: 8, h: 4 } },
      ],
    },
    editable: true,
    headingLevel: 3,
  },
  call: "registerBuiltInWidgets();\nDashboard.create(host, $)",
  note: 'Switch on Edit dashboard in its toolbar to move, resize, or remove widgets.',
  mount(stage, options) {
    const h = host(stage);
    const c = Dashboard.create(h, options);
    return { events: h, destroy: () => { c.destroy(); } };
  },
});
