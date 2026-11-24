import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { ScatterChart, type ScatterChartOptions, type ScatterChartZoomDetail } from '@absoluteui/components/scatter-chart';

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

const base: ScatterChartOptions = {
  label: 'Height and weight',
  series: [
    { id: 'a', label: 'Group A', points: [{ x: 160, y: 55 }, { x: 150, y: 50, label: 'Ann' }, { x: 175, y: 70 }] },
    { id: 'b', label: 'Group B', points: [{ x: 180, y: 80 }, { x: 170, y: 65 }] },
  ],
  xAxis: { label: 'Height (cm)' },
  yAxis: { label: 'Weight (kg)' },
};

const points = (chart: ScatterChart): SVGPathElement[] => [...chart.element.querySelectorAll<SVGPathElement>('path.aui-chart__mark')];

describe('ScatterChart', () => {
  it('renders labelled points ordered by x, one tab stop, and a summary per series', () => {
    const chart = ScatterChart.create(host(), base);
    expect(chart.element.getAttribute('aria-roledescription')).toBe('scatter chart');
    const labels = points(chart).map((p) => p.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Ann, Group A: Height (cm) 150, Weight (kg) 50',
      'Group A: Height (cm) 160, Weight (kg) 55',
      'Group A: Height (cm) 175, Weight (kg) 70',
      'Group B: Height (cm) 170, Weight (kg) 65',
      'Group B: Height (cm) 180, Weight (kg) 80',
    ]);
    expect(points(chart).filter((p) => p.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(chart.summary).toContain('scatter chart, 2 series, 5 data points.');
    expect(chart.summary).toContain('Group B: 2 data points, Height (cm) from 170 to 180, Weight (kg) from 65 to 80.');
  });

  it('keyboard: Right moves along x within a series, Down to the nearest point of the next series', async () => {
    const chart = ScatterChart.create(host(), base);
    points(chart)[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Group A: Height (cm) 160, Weight (kg) 55');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Group B/);
  });

  it('bubbles: size maps to area; role and table include the size column', async () => {
    const chart = ScatterChart.create(host(), {
      label: 'Markets',
      series: [{ id: 'm', label: 'Markets', points: [{ x: 1, y: 1, size: 100 }, { x: 2, y: 2, size: 400 }, { x: 3, y: 1, size: 0 }] }],
      sizeLabel: 'Revenue',
      sizeRange: [5, 25],
    });
    expect(chart.element.getAttribute('aria-roledescription')).toBe('bubble chart');
    const [small, large, zero] = points(chart).map((p) => p.getBBox());
    expect(zero!.width).toBeCloseTo(10, 0);
    expect(large!.width).toBeCloseTo(50, 0);
    // √100 is halfway between √0 and √400: radius halfway between 5 and 25.
    expect(small!.width).toBeCloseTo(30, 0);
    await userEvent.click(chart.host.querySelector('.aui-chart__table-toggle')!);
    expect([...chart.host.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual(['Point', 'Series', 'X axis', 'Y axis', 'Revenue']);
  });

  it('hover finds the nearest point and shows x, y in the tooltip; crosshair follows it', async () => {
    const chart = ScatterChart.create(host(), { ...base, crosshair: true });
    const target = points(chart)[2]!;
    await userEvent.hover(target);
    const tip = chart.host.querySelector('.aui-chart__tooltip')!;
    expect(tip.textContent).toContain('Group A');
    expect(tip.textContent).toContain('175');
    const lines = chart.element.querySelectorAll('.aui-chart__crosshair-line');
    expect(lines).toHaveLength(2);
    expect(chart.element.querySelector('.aui-chart__crosshair')?.getAttribute('display')).toBeNull();
  });

  it('xy zoom: = (or +) zooms around the focused point, the event reports both ranges, 0 resets', async () => {
    const chart = ScatterChart.create(host(), { ...base, zoom: 'xy' });
    const events: ScatterChartZoomDetail[] = [];
    chart.host.addEventListener('aui-zoom', (e) => events.push((e as CustomEvent<ScatterChartZoomDetail>).detail));
    points(chart)[0]!.focus();
    await userEvent.keyboard('{ArrowRight}=');
    expect(events).toHaveLength(1);
    expect(events[0]!.x).not.toBeNull();
    expect(events[0]!.y).not.toBeNull();
    expect(chart.zoomRange!.to - chart.zoomRange!.from).toBeLessThan(40);
    expect(chart.host.querySelector('[aria-label="Reset zoom"]')?.getAttribute('aria-disabled')).toBeNull();
    await userEvent.keyboard('0');
    expect(chart.zoomRange).toBeNull();
    expect(events.at(-1)?.reason).toBe('keyboard');
  });

  it('zoomRange option shows only the points inside the window', () => {
    const chart = ScatterChart.create(host(), { ...base, zoom: 'x', zoomRange: { from: 155, to: 172 } });
    expect(points(chart).map((p) => p.getAttribute('aria-label'))).toEqual(['Group A: Height (cm) 160, Weight (kg) 55', 'Group B: Height (cm) 170, Weight (kg) 65']);
  });

  it('dense data: above 600 points marks are virtual (two proxies) and still announce every move', async () => {
    const many = Array.from({ length: 800 }, (_, i) => ({ x: i, y: (i * 37) % 101 }));
    const chart = ScatterChart.create(host(), { label: 'Dense', series: [{ id: 'd', label: 'D', points: many }] });
    expect(chart.element.querySelectorAll('.aui-chart__mark').length).toBeLessThanOrEqual(2);
    const first = chart.element.querySelector<SVGElement>('[tabindex="0"]')!;
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('D: X axis 1, Y axis 37');
  });

  it('validates options and leaves the host untouched', () => {
    const el = host();
    el.textContent = 'keep';
    expect(() => ScatterChart.create(el, { ...base, series: [{ id: 'x', label: 'X', points: [{ x: 1, y: Number.NaN, size: -1 }] }] })).toThrow(AbsoluteUIError);
    expect(() => ScatterChart.create(el, { ...base, zoom: 'y' as 'x' })).toThrow(/zoom/);
    expect(el.textContent).toBe('keep');
  });

  it('legend toggles a series and update() is atomic', () => {
    const chart = ScatterChart.create(host(), base);
    chart.setSeriesVisible('a', false);
    expect(points(chart)).toHaveLength(2);
    expect(() => {
      chart.update({ sizeRange: [10, 2] });
    }).toThrow();
    expect(chart.hiddenSeries).toEqual(['a']);
    chart.destroy();
    expect(chart.host.childElementCount).toBe(0);
  });
});
