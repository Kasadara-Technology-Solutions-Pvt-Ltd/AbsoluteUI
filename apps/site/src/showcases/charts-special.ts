// Advanced visualizations showcase: an illustrative share price as candles on a trading-day axis, team collaboration as a network
// graph, and absences in a calendar heatmap with holidays. All data is small, inline, and
// made up. Style and animation are switchable; events are logged.
import { plainDate, type PlainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { CalendarHeatmap } from '@absoluteui/components/calendar-heatmap';
import { CandlestickChart, type CandlestickPoint } from '@absoluteui/components/candlestick-chart';
import { NetworkGraph } from '@absoluteui/components/network-graph';
import { action, chartControls, chartLook, choice, createShowcase, hostIn, section, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Advanced visualizations',
  description: 'Three special charts on the same chart layer: prices, networks, and calendars. Each one works with the keyboard, has a data table, and follows the theme.',
});

const calendar = createBusinessCalendar({
  holidays: [
    { date: plainDate(2026, 1, 1), name: 'New Year' },
    { date: plainDate(2026, 4, 3), name: 'Good Friday' },
    { date: plainDate(2026, 4, 6), name: 'Easter Monday' },
    { date: plainDate(2026, 5, 1), name: 'Labour Day' },
  ],
});

// 1. Share price on trading days (weekends and the holidays above are skipped).
const s2 = section(sc, 'Share price', ['candlestick-chart']);
const sessions: CandlestickPoint[] = [];
{
  let date: PlainDate = plainDate(2026, 3, 2);
  let price = 48;
  for (let i = 0; i < 90; i++) {
    const open = price;
    const close = Math.round((open * (1 + Math.sin(i / 5) * 0.015 + Math.cos(i / 2) * 0.01 + 0.002)) * 100) / 100;
    const spread = open * 0.012;
    sessions.push({ date, open, close, high: Math.round((Math.max(open, close) + spread) * 100) / 100, low: Math.round((Math.min(open, close) - spread) * 100) / 100, volume: 40000 + ((i * 7919) % 30000) });
    price = close;
    date = calendar.addWorkingDays(date, 1);
  }
}
const candles = CandlestickChart.create(hostIn(s2), {
  label: 'Share price (illustrative)',
  description: 'Trading days only: weekends and public holidays take no space. Zoom with the toolbar, + and -, or Ctrl and the wheel.',
  data: sessions,
  businessCalendar: calendar,
  movingAverages: [{ period: 10 }, { period: 30, style: { dash: 'dashed' } }],
  valueFormat: { style: 'currency', currency: 'EUR' },
  zoom: true,
  zoomRange: { from: 40, to: 89 },
  height: 340,
});

const grid = hostIn(sc.stage);
grid.className = 'sc-grid';
const networkSection = section(sc, 'Team collaboration', ['network-graph']);
const absenceSection = section(sc, 'Absences', ['calendar-heatmap']);
grid.append(networkSection, absenceSection);

// 2. Team collaboration.
const network = NetworkGraph.create(hostIn(networkSection), {
  label: 'Team collaboration',
  description: 'Drag a person to pin them, or press Shift and an arrow key. Arrow keys move to a connected person.',
  nodes: [
    { id: 'ana', label: 'Ana', group: 'design', value: 6 },
    { id: 'ben', label: 'Ben', group: 'eng', value: 9 },
    { id: 'chi', label: 'Chi', group: 'eng', value: 7 },
    { id: 'dev', label: 'Dev', group: 'product', value: 8 },
    { id: 'eli', label: 'Eli', group: 'eng', value: 4 },
    { id: 'fay', label: 'Fay', group: 'design', value: 3 },
    { id: 'gus', label: 'Gus', group: 'data', value: 5 },
    { id: 'hal', label: 'Hal', group: 'data', value: 2 },
    { id: 'ivy', label: 'Ivy', group: 'product', value: 4 },
    { id: 'jon', label: 'Jon' },
  ],
  edges: [
    { source: 'ana', target: 'ben', weight: 4 },
    { source: 'ana', target: 'fay', weight: 3 },
    { source: 'ben', target: 'chi', weight: 6 },
    { source: 'ben', target: 'eli', weight: 2 },
    { source: 'chi', target: 'dev', weight: 3 },
    { source: 'dev', target: 'ana', weight: 2 },
    { source: 'dev', target: 'ivy', weight: 4 },
    { source: 'gus', target: 'chi', weight: 2 },
    { source: 'gus', target: 'hal', weight: 3 },
    { source: 'ivy', target: 'gus' },
  ],
  groups: [
    { id: 'design', label: 'Design' },
    { id: 'eng', label: 'Engineering' },
    { id: 'product', label: 'Product' },
    { id: 'data', label: 'Data' },
  ],
  height: 340,
});

// 3. Absences over the first half of the year.
const absences = CalendarHeatmap.create(hostIn(absenceSection), {
  label: 'Absences, January to June',
  description: 'Dashed squares are weekends; dots are public holidays.',
  from: plainDate(2026, 1, 1),
  to: plainDate(2026, 6, 30),
  data: Array.from({ length: 181 }, (_, i) => {
    const date = calendar.addWorkingDays(plainDate(2025, 12, 31), 1 + Math.floor(i * 0.7));
    return { date, value: (i * 13) % 7 };
  }),
  businessCalendar: calendar,
  colorScale: { color: 4, steps: 4 },
  height: 200,
});

for (const [name, chart] of [
  ['candles', candles],
  ['network', network],
  ['calendar', absences],
] as const) {
  sc.listen(chart.host, ['aui-series-toggle', 'aui-zoom', 'aui-point-click', 'aui-node-pin'], name);
}

chartControls(sc, [candles, network, absences]);
chartLook(sc, [candles, network, absences]);
choice(
  sc,
  'Candles',
  [
    { value: 'candle', label: 'Candles' },
    { value: 'ohlc', label: 'OHLC bars' },
  ],
  'candle',
  (type) => {
    candles.update({ type });
  },
  ['candlestick-chart'],
);
toggle(sc, 'Trading days only', true, (on) => {
  candles.update({ businessCalendar: on ? calendar : null, zoomRange: null });
}, ['candlestick-chart']);
action(sc, 'Re-run network layout', () => {
  network.relayout();
}, ['network-graph']);
