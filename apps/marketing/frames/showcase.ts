// Theme showcase (MR-3): a small application whose accent and mode are set by the page's swatches
// through same-origin postMessage. The frame re-derives the theme with the Theme Designer engine.
import { DataTable, type DataTableColumn } from '@absoluteui/components/data-table';
import { LineChart } from '@absoluteui/components/line-chart';
import { Sidebar } from '@absoluteui/components/sidebar';
import { StatCard } from '@absoluteui/components/stat-card';
import { Button } from '@absoluteui/components/button';
import { ACCENTS, applyAccent } from './runtime.js';

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
};

Sidebar.create(byId('nav'), {
  label: 'Workspace',
  value: 'overview',
  items: [
    { id: 'overview', label: 'Overview', href: '#overview', icon: 'menu' },
    { id: 'accounts', label: 'Accounts', href: '#accounts', icon: 'search' },
    { id: 'schedule', label: 'Schedule', href: '#schedule', icon: 'calendar' },
    { id: 'reports', label: 'Reports', href: '#reports', icon: 'file' },
  ],
});

const usd = { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } as const;
StatCard.create(byId('stat-revenue'), { label: 'Revenue', value: 48200, previous: 40100, valueFormat: usd, comparisonLabel: 'vs last month', trend: [31000, 35500, 38200, 40100, 48200] });
StatCard.create(byId('stat-accounts'), { label: 'Active accounts', value: 1284, previous: 1203, comparisonLabel: 'vs last month', trend: [1090, 1122, 1160, 1203, 1284] });
StatCard.create(byId('stat-tickets'), { label: 'Open tickets', value: 37, previous: 52, sentiment: 'lower-is-better', comparisonLabel: 'vs last month', trend: [61, 58, 55, 52, 37] });

LineChart.create(byId('chart'), {
  label: 'Revenue and target',
  description: 'Thousands of US dollars per month',
  x: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
  series: [
    { id: 'revenue', label: 'Revenue', values: [31, 35.5, 38.2, 40.1, 44.6, 48.2] },
    { id: 'target', label: 'Target', values: [32, 34, 36, 38, 40, 42] },
  ],
  area: true,
  height: 180,
  yAxis: { tickCount: 4 },
});

interface Account {
  readonly id: string;
  readonly name: string;
  readonly mrr: number;
  readonly active: boolean;
}
const accounts: Account[] = [
  { id: 'a1', name: 'Northwind Traders', mrr: 12400, active: true },
  { id: 'a2', name: 'Contoso Health', mrr: 9800, active: true },
  { id: 'a3', name: 'Tailspin Logistics', mrr: 7350, active: false },
];
const columns: DataTableColumn<Account>[] = [
  { id: 'name', header: 'Account', accessor: (a) => a.name, rowHeader: true },
  { id: 'mrr', header: 'Monthly revenue', accessor: (a) => a.mrr, type: 'currency', currency: 'USD' },
  { id: 'active', header: 'Active', accessor: (a) => a.active, type: 'boolean', sortable: false },
];
DataTable.create<Account>(byId('table'), { caption: 'Top accounts', columns, rows: accounts, rowId: (a) => a.id, pageSize: null, selection: 'single', selected: ['a1'] });
byId('actions').append(Button.create({ text: 'Create invoice', variant: 'primary' }).element, Button.create({ text: 'Export', variant: 'secondary' }).element);

interface AccentMessage {
  readonly type: 'aui-accent';
  readonly accent: string;
  readonly dark: boolean;
}
const isAccentMessage = (data: unknown): data is AccentMessage => {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return d.type === 'aui-accent' && typeof d.accent === 'string' && typeof d.dark === 'boolean' && ACCENTS.some((a) => a.id === d.accent);
};
addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.origin !== location.origin || !isAccentMessage(event.data)) return;
  document.documentElement.classList.toggle('is-dark', event.data.dark);
  applyAccent(event.data.accent, event.data.dark);
});
