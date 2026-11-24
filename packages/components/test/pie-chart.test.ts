import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { PieChart, type PieChartOptions } from '@absoluteui/components/pie-chart';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function host(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.setProperty('width', '480px');
  document.body.append(el);
  return el;
}

const base: PieChartOptions = {
  label: 'Traffic sources',
  slices: [
    { id: 'search', label: 'Search', value: 50 },
    { id: 'direct', label: 'Direct', value: 30 },
    { id: 'social', label: 'Social', value: 20 },
  ],
};

const slices = (chart: PieChart): SVGPathElement[] => [...chart.element.querySelectorAll<SVGPathElement>('path.aui-chart__mark')];

describe('PieChart', () => {
  it('labels slices with value and percentage; the legend lists every slice with its share', () => {
    const chart = PieChart.create(host(), base);
    expect(chart.element.getAttribute('aria-roledescription')).toBe('pie chart');
    expect(slices(chart).map((s) => s.getAttribute('aria-label'))).toEqual(['Search: 50 (50%)', 'Direct: 30 (30%)', 'Social: 20 (20%)']);
    expect([...chart.host.querySelectorAll('.aui-chart__legend-item')].map((b) => b.textContent)).toEqual(['Search50%', 'Direct30%', 'Social20%']);
    expect(chart.summary).toBe('pie chart, 3 slices. Total: 100. Search: 50 (50%); Direct: 30 (30%); Social: 20 (20%).');
    expect([...chart.element.querySelectorAll('.aui-chart__value-label')].map((t) => t.textContent)).toEqual(['50%', '30%', '20%']);
  });

  it('donut: ring slices, center total, and role description', () => {
    const chart = PieChart.create(host(), { ...base, donut: true });
    expect(chart.element.getAttribute('aria-roledescription')).toBe('donut chart');
    expect(chart.element.querySelector('.aui-pie-chart__center')!.textContent).toBe('100');
    const custom = PieChart.create(host(), { ...base, donut: true, centerLabel: '' });
    expect(custom.element.querySelector('.aui-pie-chart__center')).toBeNull();
  });

  it('a single slice draws a full circle (two arcs)', () => {
    const chart = PieChart.create(host(), { label: 'All', slices: [{ id: 'a', label: 'A', value: 5 }] });
    const d = slices(chart)[0]!.getAttribute('d')!;
    expect(d.match(/A/g)).toHaveLength(2);
    expect(slices(chart)[0]!.getAttribute('aria-label')).toBe('A: 5 (100%)');
  });

  it('negative and missing values are not plotted but listed in the summary and table', () => {
    const chart = PieChart.create(host(), { ...base, dataTable: 'hidden', slices: [...base.slices, { id: 'neg', label: 'Refunds', value: -5 }, { id: 'none', label: 'Unknown', value: null }] });
    expect(slices(chart)).toHaveLength(3);
    expect(chart.summary).toContain('Not plotted (negative or missing): Refunds and Unknown.');
    const rows = [...chart.host.querySelectorAll<HTMLTableRowElement>('tbody tr')].map((tr) => [...tr.cells].map((c) => c.textContent));
    expect(rows[3]).toEqual(['Refunds', '-5 (not plotted)', '-']);
    expect(rows[4]).toEqual(['Unknown', 'No value', '-']);
    expect([...chart.host.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual(['Category', 'Value', 'Percent']);
  });

  it('all-zero or empty data shows "No data"', () => {
    expect(PieChart.create(host(), { label: 'Z', slices: [{ id: 'a', label: 'A', value: 0 }] }).host.querySelector('.aui-chart__empty')!.textContent).toBe('No data');
    expect(PieChart.create(host(), { label: 'E', slices: [] }).host.querySelector<HTMLElement>('.aui-chart__empty')!.hidden).toBe(false);
  });

  it('arrow keys move between slices; the tooltip shows value and share', async () => {
    const chart = PieChart.create(host(), { ...base, legend: 'hide' });
    await userEvent.tab();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Search: 50 (50%)');
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Direct: 30 (30%)');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Social: 20 (20%)');
    await userEvent.keyboard('{ArrowUp}{Home}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Search: 50 (50%)');
    expect(chart.host.querySelector('.aui-chart__tooltip')!.textContent).toBe('Search5050%');
  });

  it('hover hit-tests by angle', async () => {
    const chart = PieChart.create(host(), base);
    const svg = chart.element.getBoundingClientRect();
    // Right of the center: the first slice (0 to 180 degrees clockwise from 12 o'clock).
    await userEvent.hover(chart.element, { position: { x: svg.width / 2 + 40, y: svg.height / 2 } });
    expect(chart.host.querySelector('.aui-chart__tooltip-title')!.textContent).toBe('Search');
  });

  it('hiding a slice from the legend recomputes shares', async () => {
    const chart = PieChart.create(host(), base);
    await userEvent.click(chart.host.querySelector('button.aui-chart__legend-item')!);
    expect(slices(chart).map((s) => s.getAttribute('aria-label'))).toEqual(['Direct: 30 (60%)', 'Social: 20 (40%)']);
    expect(chart.hiddenSeries).toEqual(['search']);
  });

  it('validates slices', () => {
    expect(() => PieChart.create(host(), { label: 'x', slices: [{ id: '', label: 'A', value: 1 }] })).toThrow(/pieChart\.slices\[0\]\.id/);
    expect(() => PieChart.create(host(), { label: 'x', slices: [{ id: 'a', label: 'A', value: '1' as never }] })).toThrow(AbsoluteUIError);
    expect(() => PieChart.create(host(), { ...base, sliceLabels: 'names' as never })).toThrow(/pieChart\.sliceLabels/);
  });
});
