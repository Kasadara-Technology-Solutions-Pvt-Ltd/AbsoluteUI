// R20 P11 page: Candlestick, Network Graph, Calendar Heatmap (docs/PLAN-R20.md),
// bundled against the built packages.
import { configureAbsoluteUI, plainDate, type PlainDate } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { CalendarHeatmap } from '@absoluteui/components/calendar-heatmap';
import { CandlestickChart, type CandlestickPoint, type CandlestickChartZoomDetail } from '@absoluteui/components/candlestick-chart';
import { Stack } from '@absoluteui/components/layout';
import { NetworkGraph, type NetworkGraphNodePinDetail } from '@absoluteui/components/network-graph';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default' });
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
startThemeRuntime();
const direction = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

const calendar = createBusinessCalendar({ holidays: [{ date: plainDate(2026, 1, 1), name: 'New Year' }, { date: plainDate(2026, 4, 3), name: 'Good Friday' }] });

// A made-up price walk over two months of trading days (deterministic).
const sessions: CandlestickPoint[] = [];
{
  let price = 100;
  let date: PlainDate = plainDate(2026, 3, 2);
  for (let i = 0; i < 60; i++) {
    const open = price;
    const close = Math.round((open + Math.sin(i / 3) * 3 + (i % 5) - 2) * 100) / 100;
    sessions.push({ date, open, high: Math.max(open, close) + 1.5, low: Math.min(open, close) - 1.2, close, volume: 1000 + ((i * 37) % 500) });
    price = close;
    date = calendar.addWorkingDays(date, 1);
  }
}
CandlestickChart.create(byId('candle'), {
  label: 'ACME share price',
  direction,
  data: sessions,
  businessCalendar: calendar,
  movingAverages: [{ period: 5 }, { period: 20 }],
  zoom: true,
  valueFormat: { style: 'currency', currency: 'USD' },
});
byId('candle').addEventListener('aui-zoom', (e) => {
  const d = (e as CustomEvent<CandlestickChartZoomDetail>).detail;
  byId('candle-log').textContent = `zoom: ${d.reason} ${d.x ? 'range' : 'all'}`;
});

NetworkGraph.create(byId('network'), {
  label: 'Team collaboration',
  direction,
  nodes: [
    { id: 'ana', label: 'Ana', group: 'design' },
    { id: 'ben', label: 'Ben', group: 'eng' },
    { id: 'chi', label: 'Chi', group: 'eng' },
    { id: 'dev', label: 'Dev', group: 'product' },
    { id: 'eve', label: 'Eve', group: 'eng' },
    { id: 'fay', label: 'Fay', group: 'design' },
    { id: 'gus', label: 'Gus' },
  ],
  edges: [
    { source: 'ana', target: 'ben', weight: 3 },
    { source: 'ben', target: 'chi', weight: 5 },
    { source: 'chi', target: 'dev' },
    { source: 'dev', target: 'ana' },
    { source: 'eve', target: 'ben' },
    { source: 'fay', target: 'ana', weight: 2 },
  ],
  groups: [
    { id: 'design', label: 'Design' },
    { id: 'eng', label: 'Engineering' },
    { id: 'product', label: 'Product' },
  ],
  animate: false,
});
byId('network').addEventListener('aui-node-pin', (e) => {
  const d = (e as CustomEvent<NetworkGraphNodePinDetail>).detail;
  byId('network-log').textContent = `pin: ${d.id} ${String(d.pinned)}`;
});

CalendarHeatmap.create(byId('calendar'), {
  label: 'Absences in the first quarter',
  direction,
  from: plainDate(2026, 1, 1),
  to: plainDate(2026, 3, 31),
  data: Array.from({ length: 31 }, (_, i) => ({ date: plainDate(2026, 1, i + 1), value: (i * 7) % 6 })),
  businessCalendar: calendar,
  locale: 'en-GB',
});

Object.assign(window, { __auiReady: true, __aui: { CandlestickChart, NetworkGraph, CalendarHeatmap, createBusinessCalendar } });
