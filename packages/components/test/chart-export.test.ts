import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError } from '@absoluteui/core';
import { BarChart } from '@absoluteui/components/bar-chart';
import { Gauge } from '@absoluteui/components/gauge';
import { chartToPng, chartToSvg, downloadChart } from '@absoluteui/components/chart-export';

afterEach(() => {
  document.body.replaceChildren();
});

function host(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.setProperty('width', '500px');
  document.body.append(el);
  return el;
}

const bar = (): BarChart => BarChart.create(host(), {
  label: 'Tickets',
  description: 'Open and closed',
  categories: ['North', 'South'],
  series: [{ id: 'o', label: 'Open', values: [3, 5] }, { id: 'c', label: 'Closed', values: [7, 2] }],
  legend: 'show',
});

describe('chart export', () => {
  it('serializes a standalone SVG with title, description, plot, and legend; no classes, style attributes, or tab stops', () => {
    const chart = bar();
    const markup = chartToSvg(chart);
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const root = doc.documentElement;
    expect(root.localName).toBe('svg');
    expect(root.querySelector('title')?.textContent).toBe('Tickets');
    expect(root.querySelector('desc')?.textContent).toContain('Open and closed');
    expect(root.querySelectorAll('rect[aria-label]')).toHaveLength(4);
    expect(markup).not.toMatch(/class=|style=|tabindex=/);
    // Legend entries follow the plot as text.
    expect([...root.querySelectorAll(':scope > text')].map((t) => t.textContent)).toEqual(['Tickets', 'Open', 'Closed']);
    // Colors are resolved to concrete values (no CSS variables left).
    expect(markup).not.toContain('var(');
  });

  it('options drop the title, legend, and background', () => {
    const markup = chartToSvg(bar(), { title: false, legend: false, background: 'transparent' });
    const root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    expect(root.querySelectorAll(':scope > text')).toHaveLength(0);
    expect(root.firstElementChild?.localName).not.toBe('rect');
  });

  it('rasterizes to a PNG at the requested scale', async () => {
    const chart = bar();
    const blob = await chartToPng(chart, { scale: 1 });
    expect(blob.type).toBe('image/png');
    const bitmap = await createImageBitmap(blob);
    expect(bitmap.width).toBe(Math.round(chart.element.getBoundingClientRect().width) + 24);
  });

  it('exports standalone charts (gauge) and validates options', async () => {
    const gauge = Gauge.create(host(), { label: 'CPU', value: 40 });
    expect(chartToSvg(gauge)).toContain('<title>CPU</title>');
    expect(() => chartToSvg(bar(), { scale: 9 })).toThrow(AbsoluteUIError);
    await expect(downloadChart(bar(), { format: 'svg', fileName: '../x' })).rejects.toThrow(/fileName/);
  });
});
