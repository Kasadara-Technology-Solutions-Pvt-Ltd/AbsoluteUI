// R20-22: configurable corner rounding for charts (one overall radius plus per-element
// radii, clamping, value-end rounding of bars and stacks, rounded slices and arcs, CSS-only
// theming through custom properties, validation, and export).
import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { BarChart, type BarChartOptions } from '@absoluteui/components/bar-chart';
import { chartToSvg } from '@absoluteui/components/chart-export';
import { Gauge } from '@absoluteui/components/gauge';
import { Heatmap } from '@absoluteui/components/heatmap';
import { OrgChart } from '@absoluteui/components/org-chart';
import { PieChart } from '@absoluteui/components/pie-chart';
import { parseRadius, resolveCorners } from '../src/internal/chart/style.js';
import { clampRadius, roundedBox, roundedRectPath, sectorPath, sideRadii, valueEnd } from '../src/internal/chart/svg.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
  document.head.querySelectorAll('style[data-test="corners"]').forEach((s) => {
    s.remove();
  });
});

function host(width = 640): HTMLDivElement {
  const el = document.createElement('div');
  el.style.setProperty('width', `${String(width)}px`);
  document.body.append(el);
  return el;
}

function css(text: string): void {
  const style = document.createElement('style');
  style.dataset.test = 'corners';
  style.textContent = text;
  document.head.append(style);
}

const bars: BarChartOptions = {
  label: 'Balance',
  categories: ['Q1', 'Q2', 'Q3'],
  series: [
    { id: 'a', label: 'A', values: [10, -6, 4] },
    { id: 'b', label: 'B', values: [5, -3, 0] },
  ],
};

const marks = (chart: { element: SVGSVGElement }): SVGElement[] => [...chart.element.querySelectorAll<SVGElement>('.aui-chart__mark')];
const arcCount = (d: string): number => (d.match(/A/g) ?? []).length;

describe('geometry helpers', () => {
  it('clamps a radius to half the width and height and rejects non-finite or negative values', () => {
    expect(clampRadius(4, 20, 30)).toBe(4);
    expect(clampRadius(40, 20, 30)).toBe(10);
    expect(clampRadius(5, 3, 30)).toBe(1.5);
    expect(clampRadius(5, 0, 30)).toBe(0);
    expect(clampRadius(-2, 20, 20)).toBe(0);
    expect(clampRadius(Number.NaN, 20, 20)).toBe(0);
    expect(clampRadius(Number.POSITIVE_INFINITY, 20, 20)).toBe(0);
  });

  it('rounds only the corners of the requested sides', () => {
    expect(sideRadii(4)).toEqual({ tl: 4, tr: 4, br: 4, bl: 4 });
    expect(sideRadii(4, ['top'])).toEqual({ tl: 4, tr: 4, br: 0, bl: 0 });
    expect(sideRadii(4, ['bottom'])).toEqual({ tl: 0, tr: 0, br: 4, bl: 4 });
    expect(sideRadii(4, ['right'])).toEqual({ tl: 0, tr: 4, br: 4, bl: 0 });
    expect(sideRadii(4, ['left', 'right'])).toEqual({ tl: 4, tr: 4, br: 4, bl: 4 });
    expect(sideRadii(4, [])).toEqual({ tl: 0, tr: 0, br: 0, bl: 0 });
  });

  it('finds the value end from pixel positions (negative values, horizontal bars, reversed axes)', () => {
    expect(valueEnd(100, 20, false)).toBe('top');
    expect(valueEnd(100, 180, false)).toBe('bottom');
    expect(valueEnd(50, 300, true)).toBe('right');
    // RTL horizontal bars: the value axis runs right to left.
    expect(valueEnd(300, 50, true)).toBe('left');
  });

  it('draws plain rects without rounding, rects with rx/ry for equal corners, and paths for mixed corners', () => {
    const box = { x: 0, y: 0, width: 10, height: 40 };
    const plain = roundedBox(document, box, 0, 'm');
    expect(plain.localName).toBe('rect');
    expect(plain.hasAttribute('rx')).toBe(false);
    const all = roundedBox(document, box, 20, 'm');
    expect(all.localName).toBe('rect');
    expect(all.getAttribute('rx')).toBe('5');
    expect(all.getAttribute('ry')).toBe('5');
    const top = roundedBox(document, box, sideRadii(3, ['top']), 'm');
    expect(top.localName).toBe('path');
    expect(top.getAttribute('d')).toBe('M3 0H7A3 3 0 0 1 10 3V40H0V3A3 3 0 0 1 3 0Z');
  });

  it('clamps per-corner radii in path data', () => {
    const d = roundedRectPath({ x: 0, y: 0, width: 4, height: 100 }, { tl: 50, tr: 50, br: 0, bl: 0 });
    expect(d).toBe('M2 0H2A2 2 0 0 1 4 2V100H0V2A2 2 0 0 1 2 0Z');
  });

  it('draws sectors: unchanged without a corner radius, rounded and clamped with one', () => {
    const plain = sectorPath(100, 100, 80, 48, 0, Math.PI / 2);
    expect(plain).toBe('M100 20A80 80 0 0 1 180 100L148 100A48 48 0 0 0 100 52Z');
    const rounded = sectorPath(100, 100, 80, 48, 0, Math.PI / 2, 6);
    expect(arcCount(rounded)).toBe(6);
    expect(rounded).not.toContain('NaN');
    // Pie slice: the center stays sharp, so only the two outer corners are rounded.
    expect(arcCount(sectorPath(100, 100, 80, 0, 0, Math.PI / 2, 6))).toBe(3);
    // A huge radius on a thin slice is clamped instead of producing an invalid shape.
    const thin = sectorPath(100, 100, 80, 48, 0, 0.05, 50);
    expect(thin).not.toContain('NaN');
    expect(thin).not.toContain('Infinity');
  });
});

describe('corner radius resolution', () => {
  it('parses px lengths from 0 to 50 and ignores everything else', () => {
    expect(parseRadius('4px')).toBe(4);
    expect(parseRadius(' 2.5 ')).toBe(2.5);
    expect(parseRadius('0')).toBe(0);
    expect(parseRadius('')).toBeNull();
    expect(parseRadius('1em')).toBeNull();
    expect(parseRadius('-2px')).toBeNull();
    expect(parseRadius('51px')).toBeNull();
    expect(parseRadius('calc(2px + 2px)')).toBeNull();
  });

  it('cascades element radius over the overall radius over the built-in default (null)', () => {
    const el = host();
    expect(resolveCorners(el)).toEqual({ bar: null, cell: null, slice: null, box: null, swatch: null });
    el.style.setProperty('--aui-chart-corner-radius', '6px');
    el.style.setProperty('--aui-chart-cell-radius', '0px');
    expect(resolveCorners(el)).toEqual({ bar: 6, cell: 0, slice: 6, box: 6, swatch: 6 });
    el.style.setProperty('--aui-chart-corner-radius', '20px');
    // Swatches are 16 x 14 px: the overall radius is capped at 8 for them.
    expect(resolveCorners(el).swatch).toBe(8);
  });

  it('reads stylesheet values (CSS-only theming)', () => {
    css('.corners-host { --aui-chart-corner-radius: 3px; --aui-chart-bar-radius: 7px; }');
    const el = host();
    el.classList.add('corners-host');
    const corners = resolveCorners(el);
    expect(corners.bar).toBe(7);
    expect(corners.slice).toBe(3);
  });
});

describe('bar rounding', () => {
  it('keeps plain rects by default', () => {
    const chart = BarChart.create(host(), bars);
    for (const m of marks(chart)) {
      expect(m.localName).toBe('rect');
      expect(m.hasAttribute('rx')).toBe(false);
    }
  });

  it('rounds grouped bars at the value end: top for positive, bottom for negative', () => {
    const chart = BarChart.create(host(), { ...bars, theme: { barRadius: 4 } });
    const [a0, b0, a1] = marks(chart);
    expect(a0?.localName).toBe('path');
    const d0 = a0?.getAttribute('d') ?? '';
    // Top corners rounded: the path starts after the top-left arc and ends with it.
    expect(arcCount(d0)).toBe(2);
    expect(d0.startsWith('M')).toBe(true);
    expect(b0?.localName).toBe('path');
    const d1 = a1?.getAttribute('d') ?? '';
    expect(arcCount(d1)).toBe(2);
    // Negative bar: the first segment along the top is straight (no arc before the first V).
    expect(d1.split('V')[0]).not.toContain('A');
  });

  it('rounds only the outermost segment of each direction in a stack', () => {
    const chart = BarChart.create(host(), { ...bars, layout: 'stacked', theme: { barRadius: 4 } });
    const m = marks(chart);
    // Q1: A (inner, positive) is square, B (outer) is rounded.
    expect(m[0]?.localName).toBe('rect');
    expect(m[1]?.localName).toBe('path');
    // Q2 (negative stack): A is inner, B is outer at the bottom.
    expect(m[2]?.localName).toBe('rect');
    expect(m[3]?.localName).toBe('path');
    // Q3: B is 0, so A is the outer positive segment.
    expect(m[4]?.localName).toBe('path');
  });

  it('rounds horizontal bars at the right end (left in RTL)', () => {
    const ltr = BarChart.create(host(), { ...bars, orientation: 'horizontal', theme: { barRadius: 4 } });
    const d = marks(ltr)[0]?.getAttribute('d') ?? '';
    expect(d.split('V')[0]).toContain('A');
    const rtl = BarChart.create(host(), { ...bars, orientation: 'horizontal', direction: 'rtl', theme: { barRadius: 4 } });
    const r = marks(rtl)[0]?.getAttribute('d') ?? '';
    // The rounded end is on the left: the top edge ends without an arc toward the right.
    expect(r.split('V')[0]).not.toMatch(/H[\d.]+A/);
  });

  it('clamps a large radius on tiny bars', () => {
    const chart = BarChart.create(host(160), { label: 'Tiny', categories: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], series: [{ id: 's', label: 'S', values: [1, 100, 1, 100, 1, 100, 1, 100] }], theme: { barRadius: 50 } });
    for (const m of marks(chart)) {
      const radii = [...(m.getAttribute('d') ?? '').matchAll(/A([\d.]+) /g)].map((x) => Number(x[1]));
      const box = (m as SVGGraphicsElement).getBBox();
      for (const r of radii) expect(r).toBeLessThanOrEqual(Math.min(box.width, box.height) / 2 + 0.01);
    }
  });

  it('applies a stylesheet radius without the theme option and keeps it in the SVG export', () => {
    css('.corners-host { --aui-chart-corner-radius: 5px; }');
    const el = host();
    el.classList.add('corners-host');
    const chart = BarChart.create(el, bars);
    expect(marks(chart)[0]?.localName).toBe('path');
    const markup = chartToSvg(chart);
    expect(markup).toMatch(/<path[^>]*d="M[^"]*A5 5 /);
  });
});

describe('cells, slices, arcs, and nodes', () => {
  it('heatmap cells keep 2 px by default and follow cellRadius', () => {
    const base = { label: 'Load', columns: ['9', '12'], rows: ['Mon', 'Tue'], values: [[1, 2], [3, 4]] };
    const plain = Heatmap.create(host(), base);
    expect(marks(plain)[0]?.getAttribute('rx')).toBe('2');
    const square = Heatmap.create(host(), { ...base, theme: { cellRadius: 0 } });
    expect(marks(square)[0]?.hasAttribute('rx')).toBe(false);
    const overall = Heatmap.create(host(), { ...base, theme: { cornerRadius: 6, cellRadius: 3 } });
    expect(marks(overall)[0]?.getAttribute('rx')).toBe('3');
  });

  it('rounds donut slices with sliceRadius and keeps the plain path by default', () => {
    const base = { label: 'Traffic', donut: true, slices: [{ id: 'a', label: 'A', value: 60 }, { id: 'b', label: 'B', value: 40 }] };
    const plain = PieChart.create(host(), base);
    expect(arcCount(marks(plain)[0]?.getAttribute('d') ?? '')).toBe(2);
    const rounded = PieChart.create(host(), { ...base, theme: { sliceRadius: 6 } });
    expect(arcCount(marks(rounded)[0]?.getAttribute('d') ?? '')).toBe(6);
  });

  it('draws gauge arcs as filled rounded sectors with a slice radius', () => {
    const plain = Gauge.create(host(), { label: 'CPU', value: 40 });
    expect(plain.element.querySelector('.aui-gauge__arc--filled')).toBeNull();
    const rounded = Gauge.create(host(), { label: 'CPU', value: 40, theme: { cornerRadius: 4 } });
    const value = rounded.element.querySelector('.aui-gauge__value');
    expect(value?.classList.contains('aui-gauge__arc--filled')).toBe(true);
    expect(arcCount(value?.getAttribute('d') ?? '')).toBe(6);
  });

  it('org chart nodeRadius writes the node radius and validates', () => {
    const el = host(900);
    const chart = OrgChart.create(el, { label: 'Company', nodes: [{ id: 'ceo', label: 'CEO', parentId: null }], nodeRadius: 12 });
    expect(el.querySelector<HTMLElement>('.aui-org-chart__canvas')?.style.getPropertyValue('--aui-chart-node-radius')).toBe('12px');
    expect(() => { chart.update({ nodeRadius: 51 }); }).toThrow(AbsoluteUIError);
    chart.update({ nodeRadius: undefined });
    expect(el.querySelector<HTMLElement>('.aui-org-chart__canvas')?.style.getPropertyValue('--aui-chart-node-radius')).toBe('');
  });
});

describe('theme validation and custom properties', () => {
  it('writes every radius and the line join as custom properties', () => {
    const chart = BarChart.create(host(), { ...bars, theme: { cornerRadius: 4, barRadius: 2, cellRadius: 3, sliceRadius: 5, boxRadius: 6, swatchRadius: 1, tooltipRadius: 8, controlRadius: 9, lineJoin: 'miter' } });
    const s = chart.host.style;
    expect(s.getPropertyValue('--aui-chart-corner-radius')).toBe('4px');
    expect(s.getPropertyValue('--aui-chart-bar-radius')).toBe('2px');
    expect(s.getPropertyValue('--aui-chart-cell-radius')).toBe('3px');
    expect(s.getPropertyValue('--aui-chart-slice-radius')).toBe('5px');
    expect(s.getPropertyValue('--aui-chart-box-radius')).toBe('6px');
    expect(s.getPropertyValue('--aui-chart-swatch-radius')).toBe('1px');
    expect(s.getPropertyValue('--aui-chart-tooltip-radius')).toBe('8px');
    expect(s.getPropertyValue('--aui-chart-control-radius')).toBe('9px');
    expect(s.getPropertyValue('--aui-chart-line-join')).toBe('miter');
    chart.update({ theme: undefined });
    expect(s.getPropertyValue('--aui-chart-corner-radius')).toBe('');
  });

  it('rejects invalid radii and joins and leaves the chart unchanged', () => {
    const chart = BarChart.create(host(), { ...bars, theme: { barRadius: 4 } });
    const invalid: unknown[] = [{ cornerRadius: -1 }, { cornerRadius: 51 }, { barRadius: Number.NaN }, { cellRadius: '4px' }, { sliceRadius: Number.POSITIVE_INFINITY }, { swatchRadius: 9 }, { tooltipRadius: -0.5 }, { lineJoin: 'square' }];
    for (const theme of invalid) {
      // @ts-expect-error deliberately invalid input
      expect(() => { chart.update({ theme }); }).toThrow(AbsoluteUIError);
    }
    expect(chart.host.style.getPropertyValue('--aui-chart-bar-radius')).toBe('4px');
    expect(marks(chart)[0]?.localName).toBe('path');
  });
});
