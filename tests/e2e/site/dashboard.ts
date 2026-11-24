// R3 dashboard page (SPEC section 18.17), bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { DashboardCatalog, DashboardGrid, type DashboardItem } from '@absoluteui/components/dashboard-grid';
import { DashboardWidget } from '@absoluteui/components/dashboard-widget';
import { StatCard } from '@absoluteui/components/stat-card';
import { BarChart } from '@absoluteui/components/bar-chart';

const params = new URLSearchParams(location.search);
const direction = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', locale: 'en-US', direction });
document.documentElement.dir = direction;
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

const last = byId('last-event');
const log = (text: string): void => {
  last.textContent = text;
};

const widgets = new Map<string, DashboardWidget>();
function widget(el: HTMLElement, title: string): void {
  const w = DashboardWidget.create(el, { title, removable: true, actions: [{ id: 'refresh', label: `Refresh ${title}`, icon: 'refresh' }] });
  widgets.set(el.dataset.auiItem ?? title, w);
}

const items: DashboardItem[] = [
  { id: 'revenue', x: 0, y: 0, w: 3, h: 3, minW: 2 },
  { id: 'users', x: 3, y: 0, w: 3, h: 3, minW: 2 },
  { id: 'tickets', x: 6, y: 0, w: 6, h: 5, minW: 3, minH: 3 },
  { id: 'notes', x: 0, y: 3, w: 6, h: 2 },
];

const titles: Record<string, string> = { revenue: 'Revenue', users: 'Active users', tickets: 'Tickets', notes: 'Notes' };
for (const el of byId('grid').querySelectorAll<HTMLElement>('[data-aui-item]')) widget(el, titles[el.dataset.auiItem ?? ''] ?? 'Widget');

StatCard.create(byId('kpi-revenue'), { label: 'Revenue', value: 128_400, previous: 112_000, comparisonLabel: 'vs last month', trend: [90, 96, 101, 99, 108, 112, 128], valueFormat: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } });
StatCard.create(byId('kpi-users'), { label: 'Active users', value: 8_940, previous: 9_200, comparisonLabel: 'vs last week', trend: [9.4, 9.3, 9.2, 9.1, 9.0, 8.9], trendColor: 2 });
BarChart.create(byId('tickets-chart'), {
  label: 'Open tickets by region',
  hideLabel: true,
  categories: ['NA', 'EU', 'APAC', 'LATAM'],
  series: [{ id: 'open', label: 'Open', values: [34, 28, 19, 12] }],
  height: 180,
  dataTable: 'none',
});

const grid = DashboardGrid.create(byId('grid'), { label: 'Operations overview', items, rowHeight: 72 });

const counts = new Map<string, number>();
DashboardCatalog.create(byId('catalog'), {
  grid,
  label: 'Add widgets',
  templates: [
    { id: 'kpi', label: 'KPI', description: 'One number with its trend', w: 3, h: 2, icon: 'plus' },
    { id: 'note', label: 'Note', description: 'Free text', w: 4, h: 2, icon: 'file' },
  ],
  create: (template, item) => {
    const n = (counts.get(template.id) ?? 0) + 1;
    counts.set(template.id, n);
    const el = document.createElement('article');
    el.dataset.auiItem = item.id;
    const body = document.createElement('div');
    el.append(body);
    widget(el, `${template.label} ${String(n)}`);
    if (template.id === 'kpi') StatCard.create(body, { label: `KPI ${String(n)}`, value: 100 * n });
    else body.textContent = 'New note';
    return el;
  },
});

byId('grid').addEventListener('aui-remove', (e) => {
  const target = e.target instanceof HTMLElement ? e.target : null;
  const id = target?.dataset.auiItem;
  if (!id) return;
  widgets.get(id)?.destroy();
  widgets.delete(id);
  grid.removeItem(id);
});
byId('grid').addEventListener('aui-action', (e) => {
  log(`action ${(e as CustomEvent<{ id: string }>).detail.id}`);
});
byId('grid').addEventListener('aui-layout-change', (e) => {
  const d = (e as CustomEvent<{ reason: string; id: string | null }>).detail;
  log(`layout ${d.reason} ${d.id ?? ''}`.trim());
});

const toggle = byId('toggle-edit');
toggle.addEventListener('click', () => {
  const next = !grid.editable;
  grid.setEditable(next);
  toggle.setAttribute('aria-pressed', String(next));
});
byId('undo').addEventListener('click', () => {
  grid.undo();
});
byId('redo').addEventListener('click', () => {
  grid.redo();
});
if (params.get('edit') === '1') {
  grid.setEditable(true);
  toggle.setAttribute('aria-pressed', 'true');
}

Object.assign(window, { __auiReady: true, __aui: { DashboardGrid, DashboardWidget, StatCard, grid } });
