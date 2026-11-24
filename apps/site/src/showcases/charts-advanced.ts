// Advanced charts showcase: an analysis page with a bubble chart (zoom, crosshair, a target
// line), a combo chart on two axes with a custom tooltip, a profit bridge (waterfall), a
// histogram with a reference band, a heatmap, and box plots. Style and animation
// are switchable; point clicks are logged.
import { BoxPlot } from '@absoluteui/components/box-plot';
import { ComboChart } from '@absoluteui/components/combo-chart';
import { Heatmap } from '@absoluteui/components/heatmap';
import { Histogram } from '@absoluteui/components/histogram';
import { ScatterChart } from '@absoluteui/components/scatter-chart';
import { WaterfallChart } from '@absoluteui/components/waterfall-chart';
import type { ChartTooltipContext } from '@absoluteui/components/combo-chart';
import { chartControls, chartLook, choice, createShowcase, hostIn, section, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Analysis',
  description: 'Six analytical charts on one page. Every chart works with the keyboard, has a data table, and can use patterns instead of color alone.',
});

const seeded = (seed: number): (() => number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};
const rnd = seeded(42);

const s1 = section(sc, 'Accounts: revenue against satisfaction', ['scatter-chart']);
const scatter = ScatterChart.create(hostIn(s1), {
  label: 'Accounts by revenue and satisfaction',
  description: 'Bubble size is the number of seats.',
  series: ['Enterprise', 'Mid-market', 'Small business'].map((label, k) => ({
    id: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    points: Array.from({ length: 12 }, (_, i) => ({ x: Math.round((k + 1) * 40 + rnd() * 120), y: Math.round(50 + rnd() * 50), size: Math.round(10 + rnd() * 300), label: `${label} ${String(i + 1)}` })),
  })),
  xAxis: { label: 'Annual revenue (k€)' },
  yAxis: { label: 'Satisfaction score', min: 40, max: 100 },
  sizeLabel: 'Seats',
  zoom: 'xy',
  crosshair: true,
  annotations: [{ type: 'line', axis: 'y', value: 75, label: 'Satisfaction target', tone: 'success' }],
  height: 300,
});

/** Custom tooltip (DOM nodes, never HTML strings): the category and each series on its own line. */
const comboTooltip = (context: ChartTooltipContext): Node => {
  const box = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = context.title;
  box.append(title);
  for (const r of context.rows) {
    const line = document.createElement('div');
    line.textContent = `${r.label}: ${r.value}`;
    box.append(line);
  }
  return box;
};

const grid = hostIn(sc.stage);
grid.className = 'sc-grid';
const comboSection = section(sc, 'Orders and conversion', ['combo-chart']);
const bridgeSection = section(sc, 'Profit bridge', ['waterfall-chart']);
const histSection = section(sc, 'Resolution times', ['histogram']);
const heatSection = section(sc, 'Requests by day and hour', ['heatmap']);
grid.append(comboSection, bridgeSection, histSection, heatSection);
const combo = ComboChart.create(hostIn(comboSection), {
  label: 'Orders and conversion',
  categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  series: [
    { id: 'orders', label: 'Orders', type: 'bar', values: [420, 460, 510, 480, 560, 610] },
    { id: 'conversion', label: 'Conversion rate', type: 'line', axis: 'secondary', values: [0.021, 0.023, 0.026, 0.024, 0.028, 0.031] },
  ],
  primaryAxis: { label: 'Orders' },
  secondaryAxis: { label: 'Conversion', format: { style: 'percent', maximumFractionDigits: 1 } },
  crosshair: true,
  annotations: [{ type: 'line', axis: 'y', value: 500, label: 'Order goal' }],
  height: 260,
});
const bridge = WaterfallChart.create(hostIn(bridgeSection), {
  label: 'Profit bridge',
  steps: [
    { id: 'start', label: 'Revenue', kind: 'total', value: 1200 },
    { id: 'cogs', label: 'Cost of sales', value: -480 },
    { id: 'opex', label: 'Operating costs', value: -310 },
    { id: 'other', label: 'Other income', value: 45 },
    { id: 'tax', label: 'Tax', value: -110 },
    { id: 'net', label: 'Net profit', kind: 'total' },
  ],
  valueFormat: { style: 'currency', currency: 'EUR', notation: 'compact' },
  valueLabels: true,
  connectors: true,
  height: 260,
});
const hist = Histogram.create(hostIn(histSection), {
  label: 'Ticket resolution times',
  values: Array.from({ length: 400 }, () => Math.round(Math.abs(8 + (rnd() + rnd() + rnd() - 1.5) * 10) * 10) / 10),
  bins: 'auto',
  xAxis: { label: 'Hours' },
  yAxis: { label: 'Tickets' },
  annotations: [{ type: 'band', axis: 'x', from: 0, to: 4, label: 'Within SLA', tone: 'success' }],
  height: 260,
});
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = ['08', '10', '12', '14', '16', '18', '20'];
const heat = Heatmap.create(hostIn(heatSection), {
  label: 'Support requests by day and hour',
  columns: HOURS,
  rows: DAYS,
  values: DAYS.map((_, d) => HOURS.map((__, h) => (d > 4 ? Math.round(rnd() * 8) : Math.round(10 + rnd() * 30 + (h === 1 || h === 4 ? 15 : 0))))),
  cellLabels: 'auto',
  height: 260,
});
const box = BoxPlot.create(hostIn(section(sc, 'Salaries by grade', ['box-plot'])), {
  label: 'Salaries by grade',
  categories: ['G1', 'G2', 'G3', 'G4'],
  series: [
    { id: 'eu', label: 'Europe', data: [0, 1, 2, 3].map((g) => Array.from({ length: 30 }, () => 30 + g * 15 + rnd() * 20)) },
    { id: 'in', label: 'India', data: [0, 1, 2, 3].map((g) => Array.from({ length: 30 }, () => 12 + g * 8 + rnd() * 10)) },
  ],
  valueAxis: { label: 'Salary (k€)' },
  annotations: [{ type: 'line', axis: 'y', value: 50, label: 'Median market salary', tone: 'info' }],
  height: 280,
});

for (const [name, chart] of [
  ['scatter', scatter],
  ['combo', combo],
  ['waterfall', bridge],
  ['histogram', hist],
  ['heatmap', heat],
  ['box plot', box],
] as const) {
  sc.listen(chart.host, ['aui-series-toggle', 'aui-zoom', 'aui-point-click'], name);
}

chartControls(sc, [scatter, combo, bridge, hist, heat, box]);
chartLook(sc, [scatter, combo, bridge, hist, heat, box]);
toggle(sc, 'Custom combo tooltip', false, (custom) => {
  combo.update({ renderTooltip: custom ? comboTooltip : undefined });
}, ['combo-chart']);
choice(
  sc,
  'Whiskers',
  [
    { value: 'tukey', label: '1.5 × IQR (outliers shown)' },
    { value: 'minmax', label: 'Minimum to maximum' },
  ],
  'tukey',
  (whiskers) => {
    box.update({ whiskers });
  },
  ['box-plot'],
);
toggle(sc, 'Stack combo bars', false, (stacked) => {
  combo.update({ stacked });
}, ['combo-chart']);
