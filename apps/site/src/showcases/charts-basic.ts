// Basic charts showcase: a sales report with a line chart (zoom, a dashed plan series, a target
// band), grouped or stacked bars (reference line, zoom), a donut, a bar chart whose crosshair is
// synchronized with the trend, sparklines, and SVG or PNG export. Legend, data table, patterns,
// style, and animation are switchable; point clicks are logged.
import { BarChart } from '@absoluteui/components/bar-chart';
import { downloadChart } from '@absoluteui/components/chart-export';
import { LineChart } from '@absoluteui/components/line-chart';
import { PieChart } from '@absoluteui/components/pie-chart';
import { Sparkline } from '@absoluteui/components/sparkline';
import { action, chartControls, chartLook, choice, createShowcase, hostIn, section, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Sales report',
  description: 'Hover or use the arrow keys on a chart for values (the trend and the orders chart follow each other), click or press Enter on a point, toggle series in the legend, change the style, zoom, and export a chart.',
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const wave = (base: number, amp: number, phase: number): number[] => MONTHS.map((_, i) => Math.round(base + amp * Math.sin(i / 2 + phase) + i * 4));
const eur = { style: 'currency', currency: 'EUR', notation: 'compact' } as const;

const trend = section(sc, 'Monthly revenue', ['line-chart', 'bar-chart']);
const line = LineChart.create(hostIn(trend), {
  label: 'Monthly revenue by region',
  description: 'Thousands of euros, 2026.',
  x: MONTHS,
  series: [
    { id: 'emea', label: 'EMEA', values: wave(120, 18, 0) },
    { id: 'apac', label: 'APAC', values: wave(90, 22, 1) },
    { id: 'amer', label: 'Americas', values: wave(150, 15, 2) },
    { id: 'plan', label: 'Plan (Americas)', values: MONTHS.map((_, i) => 150 + i * 5), style: { dash: 'dashed', marker: 'none', lineWidth: 1.5 } },
  ],
  valueFormat: { ...eur, maximumFractionDigits: 0 },
  annotations: [{ type: 'band', axis: 'x', from: 'Jun', to: 'Aug', label: 'Summer campaign', tone: 'info' }],
  zoom: true,
  crosshair: true,
  syncGroup: 'sales-months',
  height: 280,
});
const orders = BarChart.create(hostIn(trend), {
  label: 'Orders by month',
  description: 'Hover or focus either chart: both show the same month.',
  categories: MONTHS,
  series: [{ id: 'orders', label: 'Orders', values: MONTHS.map((_, i) => 300 + Math.round(60 * Math.sin(i / 2)) + i * 12) }],
  syncGroup: 'sales-months',
  height: 200,
});

const grid = hostIn(sc.stage);
grid.className = 'sc-grid';
const quarter = section(sc, 'Revenue by quarter', ['bar-chart']);
const mix = section(sc, 'Product mix', ['pie-chart']);
grid.append(quarter, mix);
const bars = BarChart.create(hostIn(quarter), {
  label: 'Revenue by quarter',
  categories: ['Q1', 'Q2', 'Q3', 'Q4'],
  series: [
    { id: 'licenses', label: 'Licenses', values: [310, 340, 365, 420] },
    { id: 'services', label: 'Services', values: [120, 135, 150, 160] },
  ],
  valueFormat: { ...eur, maximumFractionDigits: 0 },
  annotations: [{ type: 'line', axis: 'y', value: 400, label: 'Target', tone: 'success' }],
  height: 260,
});
const pie = PieChart.create(hostIn(mix), {
  label: 'Product mix',
  slices: [
    { id: 'core', label: 'Core', value: 48 },
    { id: 'analytics', label: 'Analytics', value: 27 },
    { id: 'support', label: 'Support plans', value: 15 },
    { id: 'training', label: 'Training', value: 10 },
  ],
  donut: true,
  centerLabel: 'Share',
  valueFormat: { style: 'percent', maximumFractionDigits: 0 },
  height: 260,
});

const minis = section(sc, 'Sparklines', ['sparkline']);
const row = hostIn(minis);
row.className = 'sc-row';
const signups = Sparkline.create(hostIn(row), { label: 'Daily sign-ups', values: [12, 18, 15, 22, 30, 28, 35, 33, 41], variant: 'line', color: 1 });
const refunds = Sparkline.create(hostIn(row), { label: 'Daily refunds', values: [4, 3, 6, 2, 5, 3, 2, 1, 2], variant: 'bar', color: 2 });

sc.listen(line.host, ['aui-series-toggle', 'aui-zoom', 'aui-point-click'], 'line');
sc.listen(orders.host, ['aui-point-click'], 'orders');
sc.listen(bars.host, ['aui-series-toggle', 'aui-zoom', 'aui-point-click'], 'bars');
sc.listen(pie.host, ['aui-series-toggle', 'aui-point-click'], 'pie');

chartControls(sc, [line, orders, bars, pie], ['line-chart', 'bar-chart', 'pie-chart']);
chartLook(sc, [line, orders, bars, pie, signups, refunds]);
choice(
  sc,
  'Bars',
  [
    { value: 'grouped', label: 'Grouped' },
    { value: 'stacked', label: 'Stacked' },
  ],
  'grouped',
  (layout) => {
    bars.update({ layout });
  },
  ['bar-chart'],
);
toggle(sc, 'Horizontal bars', false, (horizontal) => {
  bars.update({ orientation: horizontal ? 'horizontal' : 'vertical' });
}, ['bar-chart']);
toggle(sc, 'Zoom the orders chart', false, (zoom) => {
  orders.update({ zoom });
}, ['bar-chart']);
toggle(sc, 'Area under lines', false, (area) => {
  line.update({ area });
}, ['line-chart']);
action(sc, 'Export trend (SVG)', () => {
  void downloadChart(line, { format: 'svg', fileName: 'monthly-revenue.svg' });
}, ['line-chart']);
action(sc, 'Export mix (PNG)', () => {
  void downloadChart(pie, { format: 'png', fileName: 'product-mix.png' });
}, ['pie-chart']);
