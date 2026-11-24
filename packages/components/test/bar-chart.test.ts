import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { BarChart, type BarChartOptions, type BarChartSeriesToggleDetail } from '@absoluteui/components/bar-chart';

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

const base: BarChartOptions = {
  label: 'Tickets by team',
  categories: ['North', 'South', 'East'],
  series: [
    { id: 'open', label: 'Open', values: [12, 5, 9] },
    { id: 'closed', label: 'Closed', values: [30, 22, 18] },
  ],
  legend: 'hide',
};

const bars = (chart: BarChart): SVGRectElement[] => [...chart.element.querySelectorAll<SVGRectElement>('rect.aui-chart__mark')];
const num = (el: Element, attr: string): number => Number(el.getAttribute(attr));

describe('BarChart: structure', () => {
  it('renders one labelled, focusable-by-roving bar per value, grouped side by side', () => {
    const chart = BarChart.create(host(), base);
    expect(chart.element.getAttribute('aria-roledescription')).toBe('column chart');
    const b = bars(chart);
    expect(b).toHaveLength(6);
    expect(b.map((x) => x.getAttribute('aria-label'))).toEqual(['North, Open: 12', 'North, Closed: 30', 'South, Open: 5', 'South, Closed: 22', 'East, Open: 9', 'East, Closed: 18']);
    // Grouped: the two bars of a category sit next to each other with the same baseline.
    expect(num(b[1]!, 'x')).toBeGreaterThan(num(b[0]!, 'x'));
    expect(num(b[0]!, 'y') + num(b[0]!, 'height')).toBeCloseTo(num(b[1]!, 'y') + num(b[1]!, 'height'), 1);
    expect(b.filter((x) => x.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(chart.summary).toContain('column chart, 2 series, 3 categories.');
  });

  it('stacked: segments share the band and stack from zero; the table adds a total', async () => {
    const chart = BarChart.create(host(), { ...base, layout: 'stacked' });
    const [open, closed] = bars(chart);
    expect(num(open!, 'x')).toBe(num(closed!, 'x'));
    expect(num(closed!, 'y') + num(closed!, 'height')).toBeCloseTo(num(open!, 'y'), 1);
    await userEvent.click(chart.host.querySelector('.aui-chart__table-toggle')!);
    expect([...chart.host.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual(['Category', 'Open', 'Closed', 'Total']);
    expect([...chart.host.querySelectorAll('tbody tr')][0]!.textContent).toBe('North123042');
  });

  it('negative values: grouped bars grow down from zero; stacked positives and negatives diverge', () => {
    const chart = BarChart.create(host(), { ...base, series: [{ id: 'a', label: 'A', values: [10, -6, 4] }, { id: 'b', label: 'B', values: [-3, 8, -2] }] });
    expect(chart.element.querySelector('.aui-chart__zero-line')).not.toBeNull();
    const zeroY = num(chart.element.querySelector('.aui-chart__zero-line')!, 'y1');
    const [a0, b0] = bars(chart);
    expect(num(a0!, 'y') + num(a0!, 'height')).toBeCloseTo(zeroY, 1);
    expect(num(b0!, 'y')).toBeCloseTo(zeroY, 1);
    const stacked = BarChart.create(host(), { ...base, layout: 'stacked', series: [{ id: 'a', label: 'A', values: [10, -6, 4] }, { id: 'b', label: 'B', values: [-3, 8, -2] }] });
    const [s0, t0] = bars(stacked);
    const z = num(stacked.element.querySelector('.aui-chart__zero-line')!, 'y1');
    expect(num(s0!, 'y') + num(s0!, 'height')).toBeCloseTo(z, 1);
    expect(num(t0!, 'y')).toBeCloseTo(z, 1);
  });

  it('horizontal: bars grow along x; RTL mirrors them to grow leftward', () => {
    const chart = BarChart.create(host(), { ...base, orientation: 'horizontal' });
    expect(chart.element.getAttribute('aria-roledescription')).toBe('bar chart');
    const [first] = bars(chart);
    expect(num(first!, 'width')).toBeGreaterThan(num(first!, 'height') / 2);
    const rtl = BarChart.create(host(), { ...base, orientation: 'horizontal', direction: 'rtl' });
    const [r] = bars(rtl);
    const zero = rtl.element.querySelector<SVGLineElement>('.aui-chart__axis-line')!;
    expect(num(r!, 'x') + num(r!, 'width')).toBeCloseTo(num(zero, 'x1'), 0);
  });

  it('missing values leave a gap (no bar) and read "No value" in the table', () => {
    const chart = BarChart.create(host(), { ...base, dataTable: 'hidden', series: [{ id: 'a', label: 'A', values: [1, null, Number.NaN] }] });
    expect(bars(chart)).toHaveLength(1);
    expect([...chart.host.querySelectorAll('tbody td')].map((c) => c.textContent)).toEqual(['1', 'No value', 'No value']);
  });

  it('patterns: a texture overlay per non-first series; value labels on request', () => {
    const chart = BarChart.create(host(), { ...base, valueLabels: true });
    expect(chart.element.querySelectorAll('rect.aui-chart__pattern')).toHaveLength(3);
    expect(chart.element.querySelectorAll('pattern')).toHaveLength(1);
    expect([...chart.element.querySelectorAll('.aui-chart__value-label')].map((t) => t.textContent)).toContain('30');
  });

  it('very long category labels are truncated on the horizontal axis column', () => {
    const long = 'Customer success and onboarding operations (EMEA)';
    const chart = BarChart.create(host(360), { ...base, orientation: 'horizontal', categories: [long, 'B', 'C'] });
    const text = chart.element.querySelector('.aui-chart__axis--category text')!.textContent;
    expect(text.endsWith('...')).toBe(true);
    expect(bars(chart)[0]!.getAttribute('aria-label')).toBe(`${long}, Open: 12`);
  });
});

describe('BarChart: interaction', () => {
  it('vertical: Left/Right move across categories, Up/Down across series', async () => {
    const chart = BarChart.create(host(), base);
    await userEvent.tab();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('North, Open: 12');
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('South, Open: 5');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('South, Closed: 22');
    const tip = chart.host.querySelector<HTMLElement>('.aui-chart__tooltip')!;
    expect(tip.textContent).toBe('SouthClosed22');
  });

  it('horizontal: Up/Down move across categories, Left/Right across series', async () => {
    BarChart.create(host(), { ...base, orientation: 'horizontal' });
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('South, Open: 5');
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('South, Closed: 22');
  });

  it('hover over a category shows all series and the stacked total', async () => {
    const chart = BarChart.create(host(), { ...base, layout: 'stacked' });
    await userEvent.hover(bars(chart)[2]!);
    const rows = [...chart.host.querySelectorAll('.aui-chart__tooltip-row')].map((r) => r.textContent);
    expect(rows).toEqual(['Open5', 'Closed22', 'Total27']);
  });

  it('legend toggles series and rescales', async () => {
    const chart = BarChart.create(host(), { ...base, legend: 'auto' });
    const events: BarChartSeriesToggleDetail[] = [];
    chart.host.addEventListener('aui-series-toggle', (e) => events.push((e as CustomEvent<BarChartSeriesToggleDetail>).detail));
    const closed = [...chart.host.querySelectorAll('button.aui-chart__legend-item')][1]!;
    await userEvent.click(closed);
    expect(bars(chart)).toHaveLength(3);
    expect(events[0]).toEqual({ id: 'closed', visible: false, hidden: ['closed'] });
    expect(chart.host.querySelectorAll('button.aui-chart__legend-item')[1]!.getAttribute('aria-pressed')).toBe('false');
  });

  it('rejects mismatched values and invalid layout', () => {
    expect(() => BarChart.create(host(), { ...base, series: [{ id: 'a', label: 'A', values: [1] }] })).toThrow(AbsoluteUIError);
    expect(() => BarChart.create(host(), { ...base, layout: 'overlap' as never })).toThrow(/barChart\.layout/);
    expect(() => BarChart.create(host(), { ...base, categories: [1] as never })).toThrow(/barChart\.categories/);
  });

  it('empty categories show "No data"', () => {
    const chart = BarChart.create(host(), { label: 'Empty', categories: [], series: [] });
    expect(chart.host.querySelector('.aui-chart__empty')!.textContent).toBe('No data');
    expect(bars(chart)).toHaveLength(0);
  });
});
