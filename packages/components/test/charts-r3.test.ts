import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Heatmap } from '@absoluteui/components/heatmap';
import { Gauge } from '@absoluteui/components/gauge';
import { RadarChart } from '@absoluteui/components/radar-chart';
import { squarify, Treemap, type TreemapDrillDetail } from '@absoluteui/components/treemap';
import { FunnelChart } from '@absoluteui/components/funnel-chart';
import { BoxPlot, boxStats, quantile } from '@absoluteui/components/box-plot';
import { BulletChart } from '@absoluteui/components/bullet-chart';

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
const focused = (): string | null | undefined => document.activeElement?.getAttribute('aria-label');

describe('Heatmap', () => {
  const base = {
    label: 'Tickets by weekday and hour',
    columns: ['9', '12', '15'],
    rows: ['Mon', 'Tue'],
    values: [[1, 5, 9], [null, 4, 2]],
  };

  it('labels every cell, buckets fills into steps, and navigates in two dimensions', async () => {
    const chart = Heatmap.create(host(), base);
    expect(marks(chart.element).map((m) => m.getAttribute('aria-label'))).toEqual(['9, Mon: 1', '12, Mon: 5', '15, Mon: 9', '9, Tue: No value', '12, Tue: 4', '15, Tue: 2']);
    const cells = marks(chart.element);
    const level = (el: Element): number => Number(/aui-heatmap__level--(\d+)/.exec(el.getAttribute('class') ?? '')?.[1] ?? 0);
    expect(level(cells[2]!)).toBeGreaterThan(level(cells[0]!));
    expect(cells[3]!.classList.contains('aui-heatmap__cell--empty')).toBe(true);
    expect(chart.summary).toBe('heatmap, 2 rows by 3 columns. Lowest 1 at 9, Mon; highest 9 at 15, Mon.');
    cells[0]!.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowDown}');
    expect(focused()).toBe('12, Tue: 4');
    expect(chart.host.querySelectorAll('.aui-chart__legend-entry').length).toBe(5);
  });

  it('diverging scale uses two slots around the midpoint; invalid matrices throw', () => {
    const chart = Heatmap.create(host(), { ...base, values: [[-4, 0, 4], [2, -2, 1]], colorScale: { type: 'diverging', negative: 2, positive: 3, steps: 3 } });
    const cells = marks(chart.element);
    expect(cells[0]!.classList.contains('aui-chart__series--c2')).toBe(true);
    expect(cells[2]!.classList.contains('aui-chart__series--c3')).toBe(true);
    expect(() => Heatmap.create(host(), { ...base, values: [[1, 2]] })).toThrow(AbsoluteUIError);
  });
});

describe('Gauge', () => {
  it('is a meter with value text naming the band and target', () => {
    const g = Gauge.create(host(), { label: 'CPU', value: 72, bands: [{ to: 50, label: 'Low' }, { to: 80, label: 'Busy' }, { to: 100, label: 'Critical' }], target: 60, valueFormat: { style: 'unit', unit: 'percent' } });
    expect(g.element.getAttribute('role')).toBe('meter');
    expect(g.element.getAttribute('aria-valuenow')).toBe('72');
    expect(g.valueText).toBe('72% (0% to 100%), Busy, target 60%');
    expect(g.element.querySelectorAll('.aui-gauge__band')).toHaveLength(3);
    expect(g.host.classList.contains('aui-gauge--c2')).toBe(true);
    g.update({ value: null });
    expect(g.element.hasAttribute('aria-valuenow')).toBe(false);
    expect(g.valueText).toBe('No value, target 60%');
    expect(() => {
      g.update({ max: -1 });
    }).toThrow(/max/);
    g.destroy();
    expect(g.host.childElementCount).toBe(0);
  });
});

describe('RadarChart', () => {
  it('draws one polygon per series with a focusable vertex per axis', async () => {
    const chart = RadarChart.create(host(), {
      label: 'Skills',
      axes: ['Speed', 'Power', 'Range', 'Armor'],
      series: [{ id: 'a', label: 'Alpha', values: [3, 5, 2, 4] }, { id: 'b', label: 'Beta', values: [4, 2, 5, 1] }],
    });
    expect(chart.element.getAttribute('aria-roledescription')).toBe('radar chart');
    expect(marks(chart.element)).toHaveLength(8);
    expect(chart.summary).toContain('4 axes: Speed, Power, Range, and Armor.');
    expect(chart.summary).toContain('Alpha: highest 5 on Power, lowest 2 on Range.');
    marks(chart.element)[0]!.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowDown}');
    expect(focused()).toBe('Power, Beta: 2');
    expect(() => RadarChart.create(host(), { label: 'x', axes: ['a', 'b'], series: [] })).toThrow(/axes/);
  });
});

describe('Treemap', () => {
  const data = [
    { id: 'eng', label: 'Engineering', children: [{ id: 'web', label: 'Web', value: 30 }, { id: 'api', label: 'API', value: 20 }] },
    { id: 'ops', label: 'Operations', value: 25 },
    { id: 'hr', label: 'People', value: 25 },
    { id: 'none', label: 'Unfunded', value: 0 },
  ];

  it('squarify keeps areas proportional and fills the box', () => {
    const boxes = squarify([6, 6, 4, 3, 2, 2, 1], { x: 0, y: 0, w: 600, h: 400 });
    const area = boxes.reduce((s, b) => s + b.w * b.h, 0);
    expect(area).toBeCloseTo(240000, 0);
    expect(boxes[0]!.w * boxes[0]!.h).toBeCloseTo((6 / 24) * 240000, 0);
  });

  it('shows the top level largest first; groups open with Enter and close with Backspace', async () => {
    const chart = Treemap.create(host(), { label: 'Budget', data });
    const drills: TreemapDrillDetail[] = [];
    chart.host.addEventListener('aui-drill', (e) => drills.push((e as CustomEvent<TreemapDrillDetail>).detail));
    expect(marks(chart.element).map((m) => m.getAttribute('aria-label'))).toEqual(['Engineering: 50 (50%), 2 items', 'Operations: 25 (25%)', 'People: 25 (25%)']);
    marks(chart.element)[0]!.focus();
    await userEvent.keyboard('{Enter}');
    expect(chart.root).toBe('eng');
    expect(drills).toEqual([{ id: 'eng', path: ['eng'] }]);
    expect(focused()).toBe('Web: 30 (60%)');
    expect(chart.host.querySelector('.aui-treemap__path [aria-current="location"]')?.textContent).toBe('Engineering');
    expect(chart.summary).toMatch(/^Showing All \/ Engineering\./);
    await userEvent.keyboard('{Backspace}');
    expect(chart.root).toBeNull();
    expect(focused()).toBe('Engineering: 50 (50%), 2 items');
  });

  it('table lists the whole hierarchy; duplicate ids throw', () => {
    const chart = Treemap.create(host(), { label: 'Budget', data, dataTable: 'visible' });
    expect([...chart.host.querySelectorAll('tbody tr')].map((r) => r.firstElementChild?.textContent)).toEqual(['Engineering', 'Engineering / Web', 'Engineering / API', 'Operations', 'People']);
    expect(() => Treemap.create(host(), { label: 'x', data: [{ id: 'a', label: 'A', value: 1 }, { id: 'a', label: 'B', value: 1 }] })).toThrow(/id/);
  });
});

describe('FunnelChart', () => {
  it('labels stages with conversion from the first and previous stage', () => {
    const chart = FunnelChart.create(host(), { label: 'Checkout', stages: [{ id: 'v', label: 'Visits', value: 1000 }, { id: 'c', label: 'Cart', value: 400 }, { id: 'p', label: 'Paid', value: 100 }] });
    expect(marks(chart.element).map((m) => m.getAttribute('aria-label'))).toEqual(['Visits: 1,000', 'Cart: 400, 40% of Visits, 40% of previous stage', 'Paid: 100, 10% of Visits, 25% of previous stage']);
    expect(chart.summary).toBe('funnel chart, 3 stages, from Visits (1,000) to Paid (100), 10% overall. Largest drop: Cart to Paid (25% kept).');
    const bars = marks(chart.element).map((m) => Number(m.getAttribute('width')));
    expect(bars[0]! / bars[1]!).toBeCloseTo(2.5, 1);
    expect(() => FunnelChart.create(host(), { label: 'x', stages: [{ id: 'a', label: 'A', value: -1 }] })).toThrow(/value/);
  });
});

describe('BoxPlot', () => {
  it('quantile and boxStats follow type-7 quantiles and Tukey fences', () => {
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
    const s = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 100])!;
    expect(s.median).toBe(5);
    expect(s.outliers).toEqual([100]);
    expect(s.max).toBe(8);
    expect(boxStats([1, 100], 'minmax')!.outliers).toEqual([]);
  });

  it('renders one labelled box per category and series from raw values or statistics', async () => {
    const chart = BoxPlot.create(host(), {
      label: 'Latency',
      categories: ['EU', 'US'],
      series: [{ id: 'p', label: 'Prod', data: [[10, 12, 14, 16, 90], { min: 8, q1: 10, median: 11, q3: 13, max: 15 }] }],
    });
    const labels = marks(chart.element).map((m) => m.getAttribute('aria-label'));
    expect(labels[0]).toBe('EU, Prod: median 14, quartiles 12 to 16, whiskers 10 to 16, 1 outlier');
    expect(labels[1]).toBe('US, Prod: median 11, quartiles 10 to 13, whiskers 8 to 15');
    expect(chart.element.querySelectorAll('.aui-box-plot__outlier')).toHaveLength(1);
    await userEvent.click(chart.host.querySelector('.aui-chart__table-toggle')!);
    expect([...chart.host.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual(['Category', 'Minimum', 'Lower quartile', 'Median', 'Upper quartile', 'Maximum', 'Outliers']);
    expect(() => BoxPlot.create(host(), { label: 'x', categories: ['a'], series: [{ id: 's', label: 'S', data: [{ min: 5, q1: 1, median: 2, q3: 3, max: 4 }] }] })).toThrow(/min <= q1/);
  });
});

describe('BulletChart', () => {
  it('names value, target, and qualitative range; rows navigate with Up/Down', async () => {
    const chart = BulletChart.create(host(), {
      label: 'Quarterly goals',
      measures: [
        { id: 'rev', label: 'Revenue', value: 270, target: 250, ranges: [150, 225, 300] },
        { id: 'profit', label: 'Profit', value: 22, target: 26, ranges: [20, 25, 30] },
      ],
      rangeLabels: ['Poor', 'Satisfactory', 'Good'],
    });
    expect(marks(chart.element).map((m) => m.getAttribute('aria-label'))).toEqual(['Revenue: 270, target 250, Good', 'Profit: 22, target 26, Satisfactory']);
    expect(chart.summary).toContain('1 of 2 at or above target.');
    expect(chart.element.querySelectorAll('.aui-bullet-chart__target')).toHaveLength(2);
    marks(chart.element)[0]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toBe('Profit: 22, target 26, Satisfactory');
  });
});
