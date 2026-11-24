// R3 advanced charts page (SPEC section 18.18), bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { LineChart } from '@absoluteui/components/line-chart';
import { ScatterChart } from '@absoluteui/components/scatter-chart';
import { ComboChart } from '@absoluteui/components/combo-chart';
import { WaterfallChart } from '@absoluteui/components/waterfall-chart';
import { Histogram } from '@absoluteui/components/histogram';
import { Heatmap } from '@absoluteui/components/heatmap';
import { Gauge } from '@absoluteui/components/gauge';
import { RadarChart } from '@absoluteui/components/radar-chart';
import { Treemap } from '@absoluteui/components/treemap';
import { FunnelChart } from '@absoluteui/components/funnel-chart';
import { BoxPlot } from '@absoluteui/components/box-plot';
import { BulletChart } from '@absoluteui/components/bullet-chart';
import { chartToPng, chartToSvg } from '@absoluteui/components/chart-export';

const params = new URLSearchParams(location.search);
const direction = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', timezone: 'UTC', locale: params.get('locale') ?? 'en-US', direction });
document.documentElement.dir = direction;
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

const last = byId('last-event');
for (const type of ['aui-series-toggle', 'aui-zoom', 'aui-drill']) {
  document.addEventListener(type, (e) => {
    const detail = (e as CustomEvent<Record<string, unknown>>).detail;
    last.textContent = `${type}: ${JSON.stringify(detail)}`;
  });
}

// Deterministic data: no randomness, so screenshots are stable.
const days = Array.from({ length: 60 }, (_, i) => i + 1);
const line = LineChart.create(byId('line-zoom'), {
  label: 'Daily orders',
  x: days,
  xAxis: { label: 'Day' },
  series: [
    { id: 'web', label: 'Web', values: days.map((d) => Math.round(120 + 40 * Math.sin(d / 5) + d)) },
    { id: 'store', label: 'Store', values: days.map((d) => Math.round(80 + 25 * Math.cos(d / 7))) },
  ],
  zoom: true,
  crosshair: true,
  height: 260,
});

const exportResult = byId('export-result');
byId('export-svg').addEventListener('click', () => {
  const svg = chartToSvg(line);
  exportResult.textContent = `svg ${String(svg.length)} characters`;
});
byId('export-png').addEventListener('click', () => {
  void chartToPng(line, { scale: 1 }).then((blob) => {
    exportResult.textContent = `png ${blob.type}`;
  });
});

ScatterChart.create(byId('scatter'), {
  label: 'Height and weight',
  xAxis: { label: 'Height (cm)' },
  yAxis: { label: 'Weight (kg)' },
  series: [
    { id: 'a', label: 'Group A', points: [150, 155, 160, 165, 170, 175, 180].map((x, i) => ({ x, y: 48 + i * 4 + (i % 2) * 3 })) },
    { id: 'b', label: 'Group B', points: [158, 163, 168, 173, 178, 183, 188].map((x, i) => ({ x, y: 55 + i * 5 - (i % 3) })) },
  ],
  zoom: 'xy',
  crosshair: true,
  height: 260,
});

ScatterChart.create(byId('bubble'), {
  label: 'Markets by growth and margin',
  xAxis: { label: 'Growth (%)' },
  yAxis: { label: 'Margin (%)' },
  sizeLabel: 'Revenue ($M)',
  series: [
    { id: 'emea', label: 'EMEA', points: [{ x: 4, y: 12, size: 120, label: 'Germany' }, { x: 7, y: 9, size: 60, label: 'Spain' }, { x: 2, y: 15, size: 90, label: 'France' }] },
    { id: 'apac', label: 'APAC', points: [{ x: 12, y: 8, size: 200, label: 'India' }, { x: 9, y: 14, size: 140, label: 'Japan' }] },
  ],
  height: 260,
});

RadarChart.create(byId('radar'), {
  label: 'Vendor comparison',
  axes: ['Price', 'Support', 'Security', 'Features', 'Uptime'],
  series: [
    { id: 'v1', label: 'Vendor 1', values: [4, 3, 5, 4, 5] },
    { id: 'v2', label: 'Vendor 2', values: [5, 4, 3, 3, 4] },
  ],
  valueAxis: { min: 0, max: 5 },
  height: 280,
});

ComboChart.create(byId('combo'), {
  label: 'Revenue and margin',
  categories: ['Q1', 'Q2', 'Q3', 'Q4'],
  series: [
    { id: 'rev', label: 'Revenue', type: 'bar', values: [120, 150, 170, 160] },
    { id: 'cost', label: 'Cost', type: 'bar', values: [80, 90, 100, 110] },
    { id: 'margin', label: 'Margin', type: 'line', axis: 'secondary', values: [0.33, 0.4, 0.41, 0.31] },
  ],
  primaryAxis: { label: 'USD (thousands)' },
  secondaryAxis: { label: 'Margin', format: { style: 'percent' } },
  crosshair: true,
  height: 260,
});

WaterfallChart.create(byId('waterfall'), {
  label: 'Cash bridge',
  steps: [
    { id: 'open', label: 'Opening', value: 400, kind: 'total' },
    { id: 'sales', label: 'Sales', value: 220 },
    { id: 'services', label: 'Services', value: 80 },
    { id: 'payroll', label: 'Payroll', value: -260 },
    { id: 'tax', label: 'Tax', value: -60 },
    { id: 'close', label: 'Closing', kind: 'total' },
  ],
  valueFormat: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 },
  height: 260,
});

BulletChart.create(byId('bullet'), {
  label: 'Quarterly goals',
  measures: [
    { id: 'rev', label: 'Revenue', value: 270, target: 250, ranges: [150, 225, 300] },
    { id: 'profit', label: 'Profit', value: 22, target: 26, ranges: [20, 25, 30] },
    { id: 'nps', label: 'NPS', value: 48, target: 50, ranges: [30, 45, 60] },
  ],
  rangeLabels: ['Poor', 'Satisfactory', 'Good'],
  height: 200,
});

const latencies = Array.from({ length: 200 }, (_, i) => 80 + ((i * 37) % 120) + (i % 17 === 0 ? 180 : 0));
Histogram.create(byId('histogram'), {
  label: 'Response times',
  values: latencies,
  xAxis: { label: 'Milliseconds' },
  height: 240,
});

BoxPlot.create(byId('box'), {
  label: 'Latency by region',
  categories: ['EU', 'US', 'APAC'],
  series: [
    { id: 'prod', label: 'Production', data: [latencies.slice(0, 60), latencies.slice(60, 130), latencies.slice(130)] },
    { id: 'stage', label: 'Staging', data: [latencies.slice(10, 50).map((v) => v * 0.9), { min: 70, q1: 90, median: 110, q3: 140, max: 190, outliers: [260] }, null] },
  ],
  valueAxis: { label: 'Milliseconds' },
  height: 260,
});

const hours = ['8', '10', '12', '14', '16', '18'];
Heatmap.create(byId('heatmap'), {
  label: 'Tickets by weekday and hour',
  columns: hours,
  rows: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  values: [0, 1, 2, 3, 4].map((r) => hours.map((_, c) => ((r + 1) * (c + 2) * 3) % 29)),
  xAxis: { label: 'Hour' },
  height: 240,
});

Treemap.create(byId('treemap'), {
  label: 'Cloud spend',
  data: [
    { id: 'compute', label: 'Compute', children: [{ id: 'vm', label: 'Virtual machines', value: 420 }, { id: 'k8s', label: 'Kubernetes', value: 260 }, { id: 'fn', label: 'Functions', value: 60 }] },
    { id: 'storage', label: 'Storage', children: [{ id: 'blob', label: 'Object storage', value: 180 }, { id: 'disk', label: 'Disks', value: 90 }] },
    { id: 'network', label: 'Network', value: 140 },
    { id: 'db', label: 'Databases', value: 230 },
  ],
  valueFormat: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 },
  height: 280,
});

FunnelChart.create(byId('funnel'), {
  label: 'Checkout funnel',
  stages: [
    { id: 'visit', label: 'Visited', value: 12000 },
    { id: 'cart', label: 'Added to cart', value: 4200 },
    { id: 'checkout', label: 'Checkout', value: 1900 },
    { id: 'paid', label: 'Paid', value: 1350 },
  ],
  height: 240,
});

Gauge.create(byId('gauge-cpu'), { label: 'CPU', value: 72, bands: [{ to: 50, label: 'Normal', color: 3 }, { to: 85, label: 'Busy', color: 7 }, { to: 100, label: 'Critical', color: 2 }], target: 60, valueFormat: { style: 'unit', unit: 'percent' } });
Gauge.create(byId('gauge-sla'), { label: 'SLA', value: 99.2, min: 95, max: 100, target: 99.5, valueFormat: { maximumFractionDigits: 1 } });

Object.assign(window, { __auiReady: true, __aui: { LineChart, ScatterChart, ComboChart, WaterfallChart, Histogram, Heatmap, Gauge, RadarChart, Treemap, FunnelChart, BoxPlot, BulletChart, chartToSvg } });
