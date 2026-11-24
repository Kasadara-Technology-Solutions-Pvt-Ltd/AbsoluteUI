import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { ComboChart, type ComboChartOptions } from '@absoluteui/components/combo-chart';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function host(width = 640): HTMLDivElement {
  const el = document.createElement('div');
  el.style.setProperty('width', `${String(width)}px`);
  document.body.append(el);
  return el;
}

const base: ComboChartOptions = {
  label: 'Revenue and margin',
  categories: ['Q1', 'Q2', 'Q3', 'Q4'],
  series: [
    { id: 'rev', label: 'Revenue', type: 'bar', values: [120, 150, 170, 160] },
    { id: 'cost', label: 'Cost', type: 'bar', values: [80, 90, 100, 110] },
    { id: 'margin', label: 'Margin', type: 'line', axis: 'secondary', values: [0.33, 0.4, 0.41, 0.31] },
  ],
  primaryAxis: { label: 'USD (thousands)' },
  secondaryAxis: { label: 'Margin', format: { style: 'percent' } },
};

const marks = (chart: ComboChart): SVGElement[] => [...chart.element.querySelectorAll<SVGElement>('.aui-chart__mark')];

describe('ComboChart', () => {
  it('draws grouped bars and a line on the secondary axis with its own format', () => {
    const chart = ComboChart.create(host(), base);
    expect(chart.element.getAttribute('aria-roledescription')).toBe('combo chart');
    expect(chart.element.querySelectorAll('rect.aui-chart__bar')).toHaveLength(8);
    expect(chart.element.querySelectorAll('path.aui-chart__line')).toHaveLength(1);
    const labels = marks(chart).map((m) => m.getAttribute('aria-label'));
    expect(labels).toContain('Q2, Margin: 40%');
    expect(labels).toContain('Q1, Revenue: 120');
    const secondary = chart.element.querySelector('.aui-chart__axis--secondary');
    expect(secondary?.textContent).toMatch(/%/);
    expect(chart.summary).toMatch(/Margin: \d+% to \d+%\./);
  });

  it('stacked bars share the band', () => {
    const chart = ComboChart.create(host(), { ...base, stacked: true });
    const all = [...chart.element.querySelectorAll<SVGRectElement>('rect.aui-chart__bar')];
    const [rev, cost] = [all[0], all[4]];
    expect(rev!.getAttribute('x')).toBe(cost!.getAttribute('x'));
  });

  it('hover lists every series of the category; keyboard moves along and across series', async () => {
    const chart = ComboChart.create(host(), { ...base, crosshair: true });
    // Hover the plot (not a bar): the page may reflow while the tooltip shows and replace the bars.
    const bar = chart.element.querySelectorAll<SVGRectElement>('rect.aui-chart__bar')[1]!.getBBox();
    await userEvent.hover(chart.element, { position: { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 } });
    const tip = chart.host.querySelector('.aui-chart__tooltip')!;
    expect(tip.textContent).toContain('Q2');
    expect(tip.textContent).toContain('Revenue');
    expect(tip.textContent).toContain('Margin');
    marks(chart).find((m) => m.getAttribute('tabindex') === '0')!.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowDown}{ArrowDown}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Q2, Margin: 40%');
  });

  it('zoom: zoomRange limits categories; arrow keys pan past the edge', async () => {
    const chart = ComboChart.create(host(), { ...base, zoom: true, zoomRange: { from: 0, to: 1 } });
    expect(chart.element.querySelectorAll('rect.aui-chart__bar')).toHaveLength(4);
    marks(chart).find((m) => m.getAttribute('tabindex') === '0')!.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Q3, Revenue: 170');
    expect(chart.zoomRange).toEqual({ from: 1, to: 2 });
  });

  it('validates series types and axes', () => {
    const el = host();
    expect(() => ComboChart.create(el, { ...base, series: [{ id: 'x', label: 'X', type: 'pie' as 'bar', values: [1, 2, 3, 4] }] })).toThrow(AbsoluteUIError);
    expect(() => ComboChart.create(el, { ...base, secondaryAxis: { min: 2, max: 1 } })).toThrow(/secondaryAxis.max/);
    expect(el.childElementCount).toBe(0);
  });
});
