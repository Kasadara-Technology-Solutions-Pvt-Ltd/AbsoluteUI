import { DashboardGrid, type DashboardGridOptions } from '@absoluteui/components/dashboard-grid';
import { StatCard } from '@absoluteui/components/stat-card';
import { host, seed } from '../seed.js';

const CARDS = [
  { id: 'headcount', label: 'Headcount', value: 1284, previous: 1240 },
  { id: 'hires', label: 'New hires', value: 46, previous: 39 },
  { id: 'attrition', label: 'Attrition', value: 3.1, previous: 3.6 },
  { id: 'open', label: 'Open roles', value: 27, previous: 31 },
];

export default seed<DashboardGridOptions>({
  options: {
    label: 'Workforce overview',
    items: [
      { id: 'headcount', x: 0, y: 0, w: 6, h: 2, label: 'Headcount' },
      { id: 'hires', x: 6, y: 0, w: 6, h: 2, label: 'New hires' },
      { id: 'attrition', x: 0, y: 2, w: 4, h: 2, label: 'Attrition' },
      { id: 'open', x: 4, y: 2, w: 8, h: 2, label: 'Open roles', locked: true },
    ],
    editable: true,
    rowHeight: 80,
  },
  call: 'DashboardGrid.create(host, $)',
  note: 'Drag a move handle, or press it and use the arrow keys (Shift+arrows resize). Each child of the host carries data-aui-item with its item id.',
  mount(stage, options) {
    const h = host(stage);
    const cards = CARDS.map((card) => {
      const item = host(h, 'section');
      item.dataset.auiItem = card.id;
      return StatCard.create(host(item), { label: card.label, value: card.value, previous: card.previous, comparisonLabel: 'vs last quarter', sentiment: card.id === 'attrition' ? 'lower-is-better' : 'higher-is-better' });
    });
    const c = DashboardGrid.create(h, options);
    return {
      events: h,
      update: (p) => { c.update(p); },
      destroy: () => {
        c.destroy();
        for (const card of cards) card.destroy();
        h.remove();
      },
    };
  },
});
