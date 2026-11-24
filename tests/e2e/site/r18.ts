// R18 page: configurable dashboard (docs/PLAN-R18-DASHBOARD.md), bundled against the built packages.
// The data API is simulated by a host fetcher, so the harness needs no server routes.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Dashboard, type DashboardFetcher } from '@absoluteui/components/dashboard';
import { enableDashboardBuilder } from '@absoluteui/components/dashboard/builder';
import { registerBuiltInWidgets } from '@absoluteui/components/dashboard/widgets';

declare global {
  interface Window {
    __auiReady?: boolean;
    __dashboard?: { definition: { widgets: readonly { id: string; layout: { x: number; y: number } }[] }; mode: string };
    __requests?: string[];
  }
}

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default' });
startThemeRuntime();
registerBuiltInWidgets();

const requests: string[] = [];
window.__requests = requests;
const SALES: Record<string, { region: string; amount: number }[]> = {
  all: [{ region: 'Europe', amount: 70 }, { region: 'Americas', amount: 55 }, { region: 'Asia', amount: 40 }],
  eu: [{ region: 'Europe', amount: 70 }],
};
const fetcher: DashboardFetcher = (request) => {
  requests.push(request.url);
  const url = new URL(request.url);
  const region = url.searchParams.get('region') ?? 'all';
  const rows = SALES[region] ?? [];
  return Promise.resolve({ total: rows.reduce((n, r) => n + r.amount, 0), rows });
};

const host = document.getElementById('dashboard');
if (!host) throw new Error('missing #dashboard');
const dashboard = Dashboard.create(host, {
  fetcher,
  editable: true,
  lazy: false,
  mode: params.get('mode') === 'edit' ? 'edit' : 'view',
  headingLevel: 2,
  definition: {
    schemaVersion: 1,
    id: 'sales',
    title: 'Sales',
    pages: [{ id: 'overview', title: 'Overview' }, { id: 'notes', title: 'Notes' }],
    variables: [{ id: 'region', kind: 'select', label: 'Region', options: [{ value: 'all', label: 'All regions' }, { value: 'eu', label: 'Europe' }] }],
    dataSources: {
      sales: { url: '/api/sales', params: { region: '{{region}}' } },
      goal: { kind: 'static', data: { done: 64 } },
    },
    widgets: [
      { id: 'total', type: 'kpi', title: 'Revenue', page: 'overview', source: 'sales', map: { value: '/total' }, options: { format: { style: 'currency', currency: 'EUR' } }, layout: { x: 0, y: 0, w: 4, h: 2 } },
      { id: 'goal', type: 'progress', title: 'Quarter goal', page: 'overview', source: 'goal', map: { value: '/done' }, layout: { x: 4, y: 0, w: 4, h: 2 } },
      { id: 'regions', type: 'list', title: 'Regions', page: 'overview', source: 'sales', map: { rows: '/rows' }, options: { label: 'region', value: 'amount' }, actions: { removable: true }, layout: { x: 8, y: 0, w: 4, h: 3 } },
      { id: 'by-region', type: 'bar-chart', title: 'Revenue by region', page: 'overview', source: 'sales', map: { rows: '/rows' }, options: { category: 'region', series: [{ field: 'amount', label: 'Revenue' }] }, layout: { x: 0, y: 2, w: 8, h: 4 } },
      { id: 'note', type: 'text', title: 'Note', page: 'notes', options: { text: 'Targets are reviewed monthly.' }, layout: { x: 0, y: 0, w: 6, h: 2 } },
    ],
  },
});
enableDashboardBuilder(dashboard);
window.__dashboard = dashboard;
window.__auiReady = true;
