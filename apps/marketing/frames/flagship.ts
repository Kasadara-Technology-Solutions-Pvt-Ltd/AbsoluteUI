// Flagship component frames (docs/PLAN-MARKETING-REDESIGN.md section 4.4): Data Grid, Scheduler,
// Gantt, Pivot Grid, and Charts, each with deterministic local data. The body's data-preview
// attribute picks the component.
import { DataGrid } from '@absoluteui/components/data-grid';
import { Gantt, type GanttDependency, type GanttTask } from '@absoluteui/components/gantt';
import { LineChart } from '@absoluteui/components/line-chart';
import { BarChart } from '@absoluteui/components/bar-chart';
import { PivotGrid, type PivotField } from '@absoluteui/components/pivot-grid';
import { Scheduler, type SchedulerEvent } from '@absoluteui/components/scheduler';
import { parseInstant, parseRecurrenceRule, plainDate, type Instant } from '@absoluteui/core';
import './runtime.js';

const host = document.getElementById('preview');
const which = document.body.dataset.preview;

if (host && which === 'grid') {
  interface Trade {
    readonly id: string;
    readonly desk: string;
    readonly symbol: string;
    readonly price: number;
    readonly qty: number;
    readonly value: number;
  }
  const DESKS = ['Equities', 'Rates', 'FX', 'Credit'];
  const SYMBOLS = ['ACME', 'GLBX', 'INIT', 'UMBR', 'WAYN', 'STRK', 'OSCP', 'TYRL'];
  // Deterministic rows (no Math.random): the preview looks the same on every load.
  const rows: Trade[] = Array.from({ length: 2000 }, (_, i) => {
    const price = 20 + ((i * 7919) % 18000) / 100;
    const qty = 10 + ((i * 31) % 490);
    return { id: String(i), desk: DESKS[i % DESKS.length] ?? '', symbol: SYMBOLS[(i * 3) % SYMBOLS.length] ?? '', price, qty, value: Math.round(price * qty * 100) / 100 };
  });
  host.classList.add('grid-host');
  DataGrid.create<Trade>(host, {
    label: 'Trades',
    rows,
    rowId: (r) => r.id,
    multiSort: true,
    floatingFilters: true,
    columns: [
      { id: 'symbol', header: 'Symbol', field: 'symbol', pinned: 'start', width: 120, filter: 'text' },
      { id: 'desk', header: 'Desk', field: 'desk', width: 130, filter: 'text' },
      { id: 'deal', header: 'Deal', children: [
        { id: 'price', header: 'Price', field: 'price', type: 'currency', currency: 'USD', filter: 'number' },
        { id: 'qty', header: 'Quantity', field: 'qty', type: 'number', filter: 'number' },
        { id: 'value', header: 'Value', field: 'value', type: 'currency', currency: 'USD', flex: 1, filter: 'number' },
      ] },
    ],
  });
}

if (host && which === 'sched') {
  const at = (text: string): Instant => {
    const value = parseInstant(text);
    if (!value) throw new Error(`Bad instant ${text}`);
    return value;
  };
  const events: SchedulerEvent[] = [
    { id: 'standup', title: 'Standup', start: at('2026-10-26T03:30:00Z'), end: at('2026-10-26T03:45:00Z'), recurrence: parseRecurrenceRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') },
    { id: 'review', title: 'Design review', start: at('2026-10-27T08:30:00Z'), end: at('2026-10-27T10:00:00Z'), location: 'Room 4', color: 3 },
    { id: 'planning', title: 'Sprint planning', start: at('2026-10-28T05:30:00Z'), end: at('2026-10-28T07:00:00Z'), color: 2 },
    { id: 'demo', title: 'Customer demo', start: at('2026-10-29T09:30:00Z'), end: at('2026-10-29T10:30:00Z'), color: 5 },
    { id: 'offsite', title: 'Team offsite', start: plainDate(2026, 10, 30), end: plainDate(2026, 10, 31) },
  ];
  Scheduler.create(host, { label: 'Team calendar', events, timezone: 'Asia/Kolkata', date: plainDate(2026, 10, 27) });
}

if (host && which === 'gantt') {
  const tasks: GanttTask[] = [
    { id: 'discover', parentId: null, label: 'Discovery', start: plainDate(2026, 10, 26), duration: 4 },
    { id: 'design', parentId: null, label: 'Design', start: plainDate(2026, 10, 26), duration: 6 },
    { id: 'build', parentId: null, label: 'Build', start: plainDate(2026, 10, 26), duration: 10, progress: 25 },
    { id: 'test', parentId: null, label: 'Testing', start: plainDate(2026, 10, 26), duration: 5 },
    { id: 'launch', parentId: null, label: 'Launch', start: plainDate(2026, 10, 26), duration: 0 },
  ];
  const dependencies: GanttDependency[] = [
    { id: 'd1', from: 'discover', to: 'design' },
    { id: 'd2', from: 'design', to: 'build' },
    { id: 'd3', from: 'build', to: 'test' },
    { id: 'd4', from: 'test', to: 'launch', lag: 1 },
  ];
  Gantt.create(host, { label: 'Website relaunch', tasks, dependencies, columns: ['name', 'start', 'end', 'duration', 'progress'] });
}

if (host && which === 'pivot') {
  interface Sale {
    readonly region: string;
    readonly product: string;
    readonly quarter: string;
    readonly amount: number;
  }
  const REGIONS = ['North', 'South', 'East', 'West'];
  const PRODUCTS = ['Licences', 'Services', 'Support'];
  const sales: Sale[] = [];
  REGIONS.forEach((region, r) => {
    PRODUCTS.forEach((product, p) => {
      ['Q1', 'Q2', 'Q3', 'Q4'].forEach((quarter, q) => {
        sales.push({ region, product, quarter, amount: 1000 + ((r + 1) * 1300 + (p + 1) * 700 + q * 450) % 5200 });
      });
    });
  });
  const fields: PivotField<Sale>[] = [
    { id: 'region', label: 'Region' },
    { id: 'product', label: 'Product' },
    { id: 'quarter', label: 'Quarter' },
    { id: 'amount', label: 'Amount', numberFormat: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } },
  ];
  PivotGrid.create(host, { caption: 'Sales 2026', fields, data: sales, layout: { rows: ['region', 'product'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' }] } });
}

if (host && which === 'charts') {
  const line = document.createElement('div');
  const bars = document.createElement('div');
  host.classList.add('chart-pair');
  host.append(line, bars);
  LineChart.create(line, {
    label: 'Revenue and target',
    description: 'Thousands of US dollars per month',
    x: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
    series: [
      { id: 'revenue', label: 'Revenue', values: [31, 35.5, 38.2, 40.1, 44.6, 48.2] },
      { id: 'target', label: 'Target', values: [32, 34, 36, 38, 40, 42] },
    ],
    area: true,
    height: 240,
  });
  BarChart.create(bars, {
    label: 'Tickets by region',
    categories: ['North America', 'Europe', 'Asia Pacific', 'India'],
    series: [
      { id: 'open', label: 'Open', values: [34, 28, 19, 22] },
      { id: 'closed', label: 'Closed', values: [120, 96, 88, 74] },
    ],
    height: 240,
  });
}
