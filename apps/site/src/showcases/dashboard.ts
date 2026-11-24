// Dashboard showcase: a configurable dashboard from one JSON definition, with data from a
// simulated API, a filter, pages, edit mode with drag-and-drop and keyboard moves, the widget
// builder, the JSON editor, undo and redo, and the definition shown live as JSON.
import { Dashboard, type DashboardChangeDetail, type DashboardFetcher } from '@absoluteui/components/dashboard';
import { enableDashboardBuilder } from '@absoluteui/components/dashboard/builder';
import { registerBuiltInWidgets } from '@absoluteui/components/dashboard/widgets';
import { action, annotate, createShowcase, hostIn, section, wait } from './kit.js';

const sc = createShowcase({
  title: 'Configurable dashboard',
  description: 'Switch on Edit dashboard in its toolbar, then move widgets (drag or keyboard), add one with the builder, edit the JSON, and undo. The definition below updates on every change.',
  simulated: true,
});

registerBuiltInWidgets();

const SALES: Record<string, { region: string; amount: number }[]> = {
  all: [{ region: 'Europe', amount: 410 }, { region: 'Asia', amount: 380 }, { region: 'Americas', amount: 520 }],
  eu: [{ region: 'Europe', amount: 410 }],
  asia: [{ region: 'Asia', amount: 380 }],
};
// The simulated API: same-origin URLs answered in the page after a delay.
const fetcher: DashboardFetcher = async (request, signal) => {
  await wait(350, signal);
  const url = new URL(request.url);
  const rows = SALES[url.searchParams.get('region') ?? 'all'] ?? [];
  return { total: rows.reduce((n, r) => n + r.amount, 0), previous: 1180, rows, trend: [210, 240, 260, 250, 300, 320, 330] };
};

// The dashboard renders its grid, widgets, and KPI stat cards.
const host = annotate(hostIn(sc.stage), ['dashboard', 'dashboard-grid', 'dashboard-widget', 'stat-card']);
const dashboard = Dashboard.create(host, {
  fetcher,
  editable: true,
  headingLevel: 2,
  definition: {
    schemaVersion: 1,
    id: 'sales',
    title: 'Sales',
    pages: [{ id: 'overview', title: 'Overview' }, { id: 'notes', title: 'Notes' }],
    variables: [{ id: 'region', kind: 'select', label: 'Region', options: [{ value: 'all', label: 'All regions' }, { value: 'eu', label: 'Europe' }, { value: 'asia', label: 'Asia' }] }],
    dataSources: {
      sales: { url: '/api/sales', params: { region: '{{region}}' }, ttl: 30 },
      // The same endpoint, narrowed to its rows with a JSON Pointer, so transforms work on the array.
      regionRows: { url: '/api/sales', params: { region: '{{region}}' }, select: '/rows', ttl: 30 },
      goal: { kind: 'static', data: { done: 72 } },
    },
    widgets: [
      { id: 'total', type: 'kpi', title: 'Revenue', page: 'overview', source: 'sales', map: { value: '/total', previous: '/previous', trend: '/trend' }, options: { format: { style: 'currency', currency: 'EUR', notation: 'compact' }, comparisonLabel: 'vs last quarter' }, actions: { refreshable: true }, layout: { x: 0, y: 0, w: 4, h: 3 } },
      { id: 'goal', type: 'progress', title: 'Quarter goal', page: 'overview', source: 'goal', map: { value: '/done' }, options: { thresholds: [{ below: 50, tone: 'warning' }] }, layout: { x: 4, y: 0, w: 4, h: 2 } },
      { id: 'regions', type: 'list', title: 'Regions', page: 'overview', source: 'regionRows', transforms: [{ op: 'sort', field: 'amount', direction: 'desc' }], options: { label: 'region', value: 'amount' }, actions: { removable: true }, layout: { x: 8, y: 0, w: 4, h: 3 } },
      { id: 'by-region', type: 'bar-chart', title: 'Revenue by region', page: 'overview', source: 'sales', map: { rows: '/rows' }, options: { category: 'region', series: [{ field: 'amount', label: 'Revenue' }] }, actions: { maximizable: true }, layout: { x: 0, y: 3, w: 8, h: 4 } },
      { id: 'note', type: 'text', title: 'Note', page: 'notes', options: { text: 'Targets are reviewed monthly.\n\nAsk finance for regional breakdowns.' }, layout: { x: 0, y: 0, w: 6, h: 2 } },
    ],
  },
});
enableDashboardBuilder(dashboard, {
  widgetTemplates: [{ id: 'trend', label: 'Revenue trend', description: 'Sparkline of the last seven weeks.', widget: { type: 'sparkline', title: 'Revenue trend', source: 'sales', map: { values: '/trend' } } }],
});

const jsonSection = section(sc, 'Definition (JSON)', ['dashboard']);
const pre = document.createElement('pre');
pre.className = 'sc-json';
pre.tabIndex = 0;
pre.setAttribute('aria-label', 'Dashboard definition');
jsonSection.append(pre);
const show = (): void => {
  pre.textContent = JSON.stringify(dashboard.definition, null, 2);
};
show();
host.addEventListener('aui-dashboard-change', (e) => {
  show();
  sc.log('dashboard change', { reason: (e as CustomEvent<DashboardChangeDetail>).detail.reason });
});
sc.listen(host, ['aui-mode-change', 'aui-variables-change', 'aui-widget-error', 'aui-page-change'], 'dashboard');

action(sc, 'Kiosk mode (rotate pages)', () => {
  dashboard.startKiosk({ rotate: 10 });
}, ['dashboard']);
action(sc, 'Reset to saved', () => {
  dashboard.reset();
}, ['dashboard']);
