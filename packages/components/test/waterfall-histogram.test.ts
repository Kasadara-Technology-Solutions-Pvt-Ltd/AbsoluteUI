import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { WaterfallChart } from '@absoluteui/components/waterfall-chart';
import { computeBins, Histogram } from '@absoluteui/components/histogram';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function host(width = 600): HTMLDivElement {
  const el = document.createElement('div');
  el.style.setProperty('width', `${String(width)}px`);
  document.body.append(el);
  return el;
}

const marks = (el: SVGSVGElement): SVGElement[] => [...el.querySelectorAll<SVGElement>('.aui-chart__mark')];
const num = (el: Element, a: string): number => Number(el.getAttribute(a));

describe('WaterfallChart', () => {
  const steps = [
    { id: 'open', label: 'Opening', value: 100, kind: 'total' as const },
    { id: 'sales', label: 'Sales', value: 40 },
    { id: 'refunds', label: 'Refunds', value: -15 },
    { id: 'misc', label: 'Other', value: null },
    { id: 'close', label: 'Closing', kind: 'total' as const },
  ];

  it('floats deltas from the running total and drops totals to zero', () => {
    const chart = WaterfallChart.create(host(), { label: 'Cash', steps });
    const [open, sales, refunds, gap, close] = marks(chart.element);
    expect(marks(chart.element).map((m) => m.getAttribute('aria-label'))).toEqual([
      'Opening: total 100',
      'Sales: +40 (Increase), running total 140',
      'Refunds: -15 (Decrease), running total 125',
      'Other: no value, running total 125',
      'Closing: total 125',
    ]);
    // Sales starts where Opening ends; Refunds hangs from the Sales top.
    expect(num(sales!, 'y') + num(sales!, 'height')).toBeCloseTo(num(open!, 'y'), 0);
    expect(num(refunds!, 'y')).toBeCloseTo(num(sales!, 'y'), 0);
    expect(num(close!, 'y') + num(close!, 'height')).toBeCloseTo(num(open!, 'y') + num(open!, 'height'), 0);
    expect(gap!.classList.contains('aui-waterfall-chart__gap')).toBe(true);
    expect(chart.element.querySelectorAll('.aui-chart__connector').length).toBe(3);
    expect(chart.summary).toBe('waterfall chart, 5 steps. Starts at 100, ends at 125. Largest increase: Sales (+40). Largest decrease: Refunds (-15).');
  });

  it('legend lists the step kinds (not toggleable); value labels are signed', () => {
    const chart = WaterfallChart.create(host(), { label: 'Cash', steps });
    expect([...chart.host.querySelectorAll('.aui-chart__legend-label')].map((l) => l.textContent)).toEqual(['Increase', 'Decrease', 'Total']);
    expect(chart.host.querySelector('button.aui-chart__legend-item')).toBeNull();
    expect([...chart.element.querySelectorAll('.aui-chart__value-label')].map((l) => l.textContent)).toEqual(['100', '+40', '-15', '125']);
  });

  it('table lists change, running total, and kind; keyboard reaches every step', async () => {
    const chart = WaterfallChart.create(host(), { label: 'Cash', steps, dataTable: 'visible' });
    expect([...chart.host.querySelectorAll('tbody tr')].map((r) => r.textContent)).toEqual(['Opening-100Total', 'Sales+40140Increase', 'Refunds-15125Decrease', 'OtherNo value125No change', 'Closing-125Total']);
    marks(chart.element)[0]!.focus();
    await userEvent.keyboard('{End}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Closing: total 125');
  });

  it('rejects invalid steps', () => {
    expect(() => WaterfallChart.create(host(), { label: 'x', steps: [{ id: 'a', label: 'A', kind: 'sum' as 'total' }] })).toThrow(AbsoluteUIError);
  });
});

describe('Histogram', () => {
  it('computeBins: nice boundaries, lower-inclusive bins, last bin inclusive, missing and outside counts', () => {
    const r = computeBins([0, 1, 9.99, 10, 19, 20, null, Number.NaN], { bins: [0, 10, 20] });
    expect(r.bins).toEqual([{ from: 0, to: 10, count: 3 }, { from: 10, to: 20, count: 3 }]);
    expect(r.missing).toBe(2);
    const auto = computeBins(Array.from({ length: 100 }, (_, i) => i));
    expect(auto.bins[0]!.from).toBe(0);
    expect(auto.bins.at(-1)!.to).toBeGreaterThanOrEqual(99);
    expect(auto.bins.reduce((s, b) => s + b.count, 0)).toBe(100);
    const fixed = computeBins([1, 5, 12], { bins: 2, min: 0, max: 10 });
    expect(fixed.outside).toBe(1);
    expect(fixed.bins[0]!.from).toBe(0);
    expect(fixed.bins.at(-1)!.to).toBe(10);
  });

  it('draws adjacent bars with labelled bins and a summary naming the mode', () => {
    const chart = Histogram.create(host(), { label: 'Response times', values: [1, 2, 2, 3, 3, 3, 4, 8], bins: [0, 2, 4, 6, 8], valueFormat: { style: 'unit', unit: 'second' } });
    const bars = marks(chart.element);
    expect(bars.map((b) => b.getAttribute('aria-label'))).toEqual(['0 sec to 2 sec: 1 value', '2 sec to 4 sec: 5 values', '4 sec to 6 sec: 1 value', '6 sec to 8 sec: 1 value']);
    expect(num(bars[0]!, 'x') + num(bars[0]!, 'width')).toBeCloseTo(num(bars[1]!, 'x'), 1);
    expect(chart.summary).toBe('histogram, 8 values in 4 bins, from 0 sec to 8 sec. Most values: 2 sec to 4 sec (5 values).');
    expect(chart.bins).toHaveLength(4);
  });

  it('empty data shows the empty state; invalid bins throw', () => {
    const chart = Histogram.create(host(), { label: 'Empty', values: [] });
    expect(chart.host.querySelector('.aui-chart__empty')?.textContent).toBe('No data');
    expect(() => Histogram.create(host(), { label: 'x', values: [1], bins: [3, 1] })).toThrow(/bins/);
  });
});
