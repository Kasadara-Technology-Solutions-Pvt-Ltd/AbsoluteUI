// R2 charts page (SPEC section 18.18), bundled against the built packages.
import { configureAbsoluteUI, plainDate, plainDateTime, toInstant } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { LineChart } from '@absoluteui/components/line-chart';
import { BarChart } from '@absoluteui/components/bar-chart';
import { PieChart } from '@absoluteui/components/pie-chart';
import { Sparkline } from '@absoluteui/components/sparkline';

const params = new URLSearchParams(location.search);
const direction = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', timezone: 'America/New_York', locale: params.get('locale') ?? 'en-US', direction });
document.documentElement.dir = direction;
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

const last = byId('last-event');
document.addEventListener('aui-series-toggle', (e) => {
  const detail = (e as CustomEvent<{ id: string; visible: boolean }>).detail;
  last.textContent = `${detail.id} ${detail.visible ? 'shown' : 'hidden'}`;
});

// Fixed instants (midnight on the first of each month in New York) keep screenshots stable.
const months = Array.from({ length: 12 }, (_, i) => toInstant(plainDateTime(plainDate(2026, i + 1, 1)), 'America/New_York'));
LineChart.create(byId('line'), {
  label: 'Monthly active users',
  description: 'Thousands of users, 2026',
  x: months,
  series: [
    { id: 'web', label: 'Web', values: [42, 45, 44, 51, 55, null, 61, 64, 60, 68, 72, 75] },
    { id: 'mobile', label: 'Mobile', values: [30, 33, 38, 41, 47, 52, 55, 59, 66, 70, 74, 81] },
    { id: 'api', label: 'API', values: [12, 11, 14, 13, 15, 18, 17, 19, 22, 21, 24, 26] },
  ],
  yAxis: { label: 'Users (thousands)' },
});
LineChart.create(byId('area'), {
  label: 'Net cash flow',
  x: ['Q1', 'Q2', 'Q3', 'Q4'],
  series: [{ id: 'cash', label: 'Cash flow', values: [-120, 40, 180, 95] }],
  area: true,
  height: 220,
  valueFormat: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 },
});
BarChart.create(byId('bar'), {
  label: 'Support tickets by region',
  categories: ['North America', 'Europe', 'Asia Pacific', 'Latin America'],
  series: [
    { id: 'open', label: 'Open', values: [34, 28, 19, 12] },
    { id: 'closed', label: 'Closed', values: [120, 96, 88, 40] },
  ],
  valueAxis: { label: 'Tickets' },
  valueLabels: true,
});
BarChart.create(byId('bar-stacked'), {
  label: 'Budget variance by department',
  categories: ['Engineering', 'Customer success and onboarding operations', 'Marketing', 'Finance'],
  series: [
    { id: 'capex', label: 'Capital', values: [40, -15, 22, 8] },
    { id: 'opex', label: 'Operating', values: [25, 30, -18, 12] },
  ],
  orientation: 'horizontal',
  layout: 'stacked',
  height: 260,
});
PieChart.create(byId('pie'), {
  label: 'Traffic sources',
  slices: [
    { id: 'search', label: 'Search', value: 46 },
    { id: 'direct', label: 'Direct', value: 25 },
    { id: 'social', label: 'Social', value: 17 },
    { id: 'email', label: 'Email', value: 12 },
  ],
  height: 240,
});
PieChart.create(byId('donut'), {
  label: 'Storage by type',
  slices: [
    { id: 'docs', label: 'Documents', value: 120 },
    { id: 'media', label: 'Media', value: 310 },
    { id: 'backups', label: 'Backups', value: 90 },
  ],
  donut: true,
  centerLabel: '520 GB',
  height: 240,
  valueFormat: { style: 'unit', unit: 'gigabyte' },
});
Sparkline.create(byId('spark-line'), { label: 'Weekly sign-ups', values: [120, 132, 128, 150, 149, 170, 181, 176, 195, 210, 205, 230] });
Sparkline.create(byId('spark-bar'), { label: 'Net change', values: [4, -2, 6, 3, -5, 8, 2], variant: 'bar', color: 3 });

Object.assign(window, { __auiReady: true, __aui: { LineChart, BarChart, PieChart, Sparkline } });
