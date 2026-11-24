import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, plainDate, resetAbsoluteUIConfig } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { CandlestickChart, type CandlestickChartOptions, type CandlestickChartZoomDetail } from '@absoluteui/components/candlestick-chart';

// R20 P11 (docs/PLAN-R20.md): Candlestick Chart. Written with the component; run in P12 (R20-9).
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function host(width = 720): HTMLDivElement {
  const el = document.createElement('div');
  el.style.setProperty('width', `${String(width)}px`);
  document.body.append(el);
  return el;
}

const focused = (): string | null | undefined => document.activeElement?.getAttribute('aria-label');
const candles = (el: SVGSVGElement): SVGPathElement[] => [...el.querySelectorAll<SVGPathElement>('.aui-chart__mark')];

// Thursday 2 April to Tuesday 7 April 2026: a weekend and Good Friday in between.
const base: CandlestickChartOptions = {
  label: 'ACME',
  data: [
    { date: plainDate(2026, 4, 2), open: 100, high: 104, low: 99, close: 103, volume: 1200 },
    { date: plainDate(2026, 4, 3), open: 103, high: 103, low: 101, close: 102, volume: 300 },
    { date: plainDate(2026, 4, 6), open: 102, high: 103, low: 97, close: 98, volume: 1500 },
    { date: plainDate(2026, 4, 7), open: 98, high: 101, low: 97, close: 100, volume: 1100 },
  ],
};

describe('CandlestickChart', () => {
  it('draws hollow rising and filled falling candles with labelled values', () => {
    const chart = CandlestickChart.create(host(), base);
    const all = candles(chart.element);
    expect(all).toHaveLength(4);
    expect(all[0]?.classList.contains('aui-candlestick-chart__candle--up')).toBe(true);
    expect(all[2]?.classList.contains('aui-candlestick-chart__candle--down')).toBe(true);
    expect(all[0]?.getAttribute('aria-label')).toBe('Apr 2, 2026: open 100, high 104, low 99, close 103, up 3%');
    expect(all[2]?.getAttribute('aria-label')).toContain('down 3.92%');
    expect(chart.element.querySelectorAll('.aui-candlestick-chart__volume-bar')).toHaveLength(4);
    expect(chart.summary).toContain('candlestick chart, 4 sessions, Apr 2, 2026 to Apr 7, 2026.');
  });

  it('skips non-trading days with a business calendar', () => {
    const calendar = createBusinessCalendar({ holidays: [{ date: plainDate(2026, 4, 3), name: 'Good Friday' }] });
    const plain = CandlestickChart.create(host(), base);
    const trading = CandlestickChart.create(host(), { ...base, businessCalendar: calendar });
    expect(candles(trading.element)).toHaveLength(3);
    expect(trading.summary).toContain('Not plotted (non-trading days): Apr 3, 2026.');
    // Calendar days leave a weekend gap; trading days are evenly spaced.
    const gaps = (c: CandlestickChart): number[] => {
      const xs = candles(c.element).map((p) => p.getBBox().x + p.getBBox().width / 2);
      return xs.slice(1).map((x, i) => x - (xs[i] ?? 0));
    };
    const [a = 0, b = 0] = gaps(trading);
    expect(Math.abs(a - b)).toBeLessThan(1);
    const [, weekend = 0, next = 0] = gaps(plain);
    expect(weekend).toBeGreaterThan(next * 2);
  });

  it('moving averages appear in the legend, tooltip, and table and can be hidden', async () => {
    const el = host();
    const chart = CandlestickChart.create(el, { ...base, movingAverages: [{ period: 2 }], dataTable: 'visible' });
    expect(chart.host.querySelectorAll('.aui-chart__legend-item')).toHaveLength(1);
    expect(chart.host.querySelector('.aui-chart__table thead')?.textContent).toContain('2-day average');
    const toggles: string[][] = [];
    el.addEventListener('aui-series-toggle', (e) => toggles.push((e as CustomEvent<{ hidden: string[] }>).detail.hidden));
    await userEvent.click(chart.host.querySelector<HTMLButtonElement>('.aui-chart__legend-item')!);
    expect(toggles[0]).toEqual(['ma2']);
    expect(chart.hiddenSeries).toEqual(['ma2']);
  });

  it('navigates sessions, zooms with keys, and pans past the window edge', async () => {
    const el = host();
    const data = Array.from({ length: 30 }, (_, i) => ({ date: plainDate(2026, 1, i + 1), open: 10 + i, high: 12 + i, low: 9 + i, close: 11 + i }));
    const chart = CandlestickChart.create(el, { label: 'Zoomed', data, zoom: true, zoomRange: { from: 0, to: 9 } });
    const zooms: CandlestickChartZoomDetail[] = [];
    el.addEventListener('aui-zoom', (e) => zooms.push((e as CustomEvent<CandlestickChartZoomDetail>).detail));
    expect(candles(chart.element).length).toBeLessThan(15);
    candles(chart.element)[0]?.focus();
    await userEvent.keyboard('{End}');
    expect(focused()).toMatch(/^Jan 10, 2026/);
    await userEvent.keyboard('{ArrowRight}');
    expect(focused()).toMatch(/^Jan 11, 2026/);
    expect(zooms.at(-1)?.reason).toBe('keyboard');
    await userEvent.keyboard('0');
    expect(chart.zoomRange).toBeNull();
  });

  it('validates OHLC consistency, order, and options', () => {
    expect(() => CandlestickChart.create(host(), { label: 'x', data: [{ date: plainDate(2026, 1, 1), open: 5, high: 4, low: 3, close: 4 }] })).toThrow(AbsoluteUIError);
    expect(() => CandlestickChart.create(host(), { label: 'x', data: [...base.data].reverse() })).toThrow(AbsoluteUIError);
    expect(() => CandlestickChart.create(host(), { ...base, movingAverages: [{ period: 1 }] })).toThrow(AbsoluteUIError);
    const chart = CandlestickChart.create(host(), { ...base, type: 'ohlc' });
    expect(chart.element.querySelectorAll('.aui-candlestick-chart__bar')).toHaveLength(4);
    expect(() => { chart.update({ volume: 'yes' as unknown as boolean }); }).toThrow(AbsoluteUIError);
    expect(chart.element.querySelectorAll('.aui-candlestick-chart__bar')).toHaveLength(4);
  });
});
