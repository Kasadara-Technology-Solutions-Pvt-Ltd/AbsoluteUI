import { plainDate, type PlainDate } from '@absoluteui/core';
import { CandlestickChart, type CandlestickChartOptions, type CandlestickPoint } from '@absoluteui/components/candlestick-chart';
import { host, seed } from '../seed.js';

// Ten made-up sessions on weekdays in March 2026.
const day = (d: number): PlainDate => plainDate(2026, 3, d);
const data: CandlestickPoint[] = [
  { date: day(2), open: 100, high: 104, low: 99, close: 103, volume: 12000 },
  { date: day(3), open: 103, high: 105, low: 101, close: 102, volume: 9000 },
  { date: day(4), open: 102, high: 103, low: 97, close: 98, volume: 15000 },
  { date: day(5), open: 98, high: 101, low: 97, close: 100, volume: 11000 },
  { date: day(6), open: 100, high: 106, low: 100, close: 105, volume: 17000 },
  { date: day(9), open: 105, high: 107, low: 103, close: 104, volume: 8000 },
  { date: day(10), open: 104, high: 108, low: 104, close: 107, volume: 13000 },
  { date: day(11), open: 107, high: 109, low: 105, close: 106, volume: 10000 },
  { date: day(12), open: 106, high: 106, low: 101, close: 102, volume: 16000 },
  { date: day(13), open: 102, high: 105, low: 101, close: 104, volume: 9500 },
];

export default seed<CandlestickChartOptions>({
  options: {
    label: 'ACME share price',
    data,
    movingAverages: [{ period: 3 }],
    valueFormat: { style: 'currency', currency: 'USD' },
    zoom: true,
  },
  hide: ['businessCalendar'],
  call: 'CandlestickChart.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = CandlestickChart.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
