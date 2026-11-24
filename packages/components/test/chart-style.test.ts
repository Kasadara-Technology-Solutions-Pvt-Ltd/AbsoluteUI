// R20-15: the shared chart look-and-feel layer (theme option, per-series style, annotations,
// custom tooltips, point-click events, synchronized crosshairs, bar zoom, opt-in animation).
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { BarChart, type BarChartOptions } from '@absoluteui/components/bar-chart';
import { ComboChart } from '@absoluteui/components/combo-chart';
import { Gauge } from '@absoluteui/components/gauge';
import { Histogram } from '@absoluteui/components/histogram';
import { LineChart, type ChartPointClickDetail, type ChartTheme, type LineChartOptions } from '@absoluteui/components/line-chart';
import { PieChart } from '@absoluteui/components/pie-chart';
import { RadarChart } from '@absoluteui/components/radar-chart';
import { ScatterChart } from '@absoluteui/components/scatter-chart';
import { Sparkline } from '@absoluteui/components/sparkline';
import { WaterfallChart } from '@absoluteui/components/waterfall-chart';

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

const line: LineChartOptions = {
  label: 'Revenue',
  x: ['Jan', 'Feb', 'Mar', 'Apr'],
  series: [
    { id: 'a', label: 'Actual', values: [10, 14, 12, 18] },
    { id: 'b', label: 'Plan', values: [11, 12, 13, 14] },
  ],
};

const bars: BarChartOptions = {
  label: 'Orders',
  categories: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'],
  series: [{ id: 'o', label: 'Orders', values: [4, 6, 5, 8, 7, 9] }],
};

const marks = (el: Element): SVGElement[] => [...el.querySelectorAll<SVGElement>('.aui-chart__mark')];

describe('chart theme option', () => {
  it('writes custom properties and classes on the host and keeps the default look without it', () => {
    const plain = LineChart.create(host(), line);
    expect(plain.host.getAttribute('style') ?? '').not.toContain('--aui-chart-1');
    expect(plain.host.classList.contains('aui-chart--no-grid')).toBe(false);

    const theme: ChartTheme = {
      palette: ['#7c3aed', 'rgb(1, 2, 3)'],
      fontFamily: 'Georgia, serif',
      fontSize: 13,
      textColor: '#333333',
      gridLines: false,
      gridColor: '#eeeeee',
      gridDash: '4 2',
      axisColor: 'black',
      lineWidth: 3,
      markerSize: 5,
      barRadius: 4,
      areaOpacity: 0.3,
      gradient: true,
      valueLabelColor: '#111111',
      tooltip: { background: '#000000', color: '#ffffff', borderColor: '#444444' },
      legendPosition: 'end',
      animation: { duration: 250 },
    };
    const chart = LineChart.create(host(), { ...line, theme });
    const style = chart.host.style;
    expect(style.getPropertyValue('--aui-chart-1')).toBe('#7c3aed');
    expect(style.getPropertyValue('--aui-chart-2')).toBe('rgb(1, 2, 3)');
    expect(style.getPropertyValue('--aui-chart-font-size')).toBe('13px');
    expect(style.getPropertyValue('--aui-chart-grid-dash')).toBe('4 2');
    expect(style.getPropertyValue('--aui-chart-line-width')).toBe('3px');
    expect(style.getPropertyValue('--aui-chart-area-opacity')).toBe('0.3');
    expect(style.getPropertyValue('--aui-chart-tooltip-bg')).toBe('#000000');
    expect(style.getPropertyValue('--aui-chart-animation-duration')).toBe('250ms');
    for (const c of ['aui-chart--no-grid', 'aui-chart--gradient', 'aui-chart--legend-end', 'aui-chart--animate']) expect(chart.host.classList.contains(c)).toBe(true);
    // Marker radius follows markerSize (path data of a circle marker spans 2r).
    const point = chart.element.querySelector<SVGPathElement>('.aui-line-chart__point');
    expect(point?.getBBox().width ?? 0).toBeCloseTo(10, 0);

    chart.update({ theme: undefined });
    expect(style.getPropertyValue('--aui-chart-1')).toBe('');
    expect(chart.host.classList.contains('aui-chart--legend-end')).toBe(false);
    chart.destroy();
    expect(chart.host.getAttribute('style') ?? '').not.toContain('--aui-chart');
  });

  it('rejects invalid values and leaves the chart unchanged', () => {
    const chart = LineChart.create(host(), { ...line, theme: { palette: ['#ff0000'] } });
    const invalid: unknown[] = [
      { palette: [] },
      { palette: ['not-a-color('] },
      { gridDash: '4px 2px' },
      { gridDash: 'url(x)' },
      { lineWidth: 0 },
      { markerSize: 21 },
      { areaOpacity: 2 },
      { fontFamily: 'a; color: red' },
      { legendPosition: 'left' },
      { animation: { duration: -1 } },
      { tooltip: { background: 'expression(alert(1))' } },
    ];
    for (const theme of invalid) {
      // @ts-expect-error deliberately invalid input
      expect(() => { chart.update({ theme }); }).toThrow(AbsoluteUIError);
    }
    expect(chart.host.style.getPropertyValue('--aui-chart-1')).toBe('#ff0000');
    expect(() => LineChart.create(host(), { ...line, syncGroup: ' ' })).toThrow(AbsoluteUIError);
    // @ts-expect-error deliberately invalid input
    expect(() => LineChart.create(host(), { ...line, renderTooltip: 'html' })).toThrow(AbsoluteUIError);
  });

  it('animation is opt-in and runs on the render after an option change, not on resize', () => {
    const chart = BarChart.create(host(), bars);
    expect(chart.host.classList.contains('aui-chart--animate')).toBe(false);
    expect(chart.host.classList.contains('aui-chart--entering')).toBe(false);
    chart.update({ theme: { animation: true } });
    expect(chart.host.classList.contains('aui-chart--animate')).toBe(true);
    expect(chart.host.classList.contains('aui-chart--entering')).toBe(true);
  });

  it('applies to Sparkline and Gauge', () => {
    const spark = Sparkline.create(host(120), { label: 'Sign-ups', values: [1, 3, 2], theme: { palette: ['#123456'], lineWidth: 2, animation: true } });
    expect(spark.host.style.getPropertyValue('--aui-chart-1')).toBe('#123456');
    expect(spark.host.style.getPropertyValue('--aui-sparkline-line-width')).toBe('2px');
    expect(spark.host.classList.contains('aui-chart--animate')).toBe(true);
    // @ts-expect-error deliberately invalid input
    expect(() => { spark.update({ theme: { lineWidth: 'thick' } }); }).toThrow(AbsoluteUIError);
    spark.destroy();
    expect(spark.host.getAttribute('style') ?? '').not.toContain('--aui-');

    const gauge = Gauge.create(host(), { label: 'CSAT', value: 70, theme: { gridColor: '#dddddd' } });
    expect(gauge.host.style.getPropertyValue('--aui-chart-grid-color')).toBe('#dddddd');
    gauge.destroy();
    expect(gauge.host.style.getPropertyValue('--aui-chart-grid-color')).toBe('');
  });
});

describe('per-series style', () => {
  it('colors, dashes, and markers apply to the series and its legend and tooltip keys', async () => {
    const chart = LineChart.create(host(), {
      ...line,
      legend: 'show',
      series: [
        { id: 'a', label: 'Actual', values: [10, 14, 12, 18], style: { color: '#0a7', lineWidth: 4 } },
        { id: 'b', label: 'Plan', values: [11, 12, 13, 14], style: { dash: 'dashed', marker: 'none', fillOpacity: 0.2 } },
      ],
    });
    const groups = [...chart.element.querySelectorAll<SVGGElement>('.aui-line-chart__series')];
    expect(groups[0]?.style.getPropertyValue('--aui-chart-series-color')).toBe('#0a7');
    expect(groups[0]?.style.getPropertyValue('--aui-chart-series-line-width')).toBe('4px');
    expect(groups[1]?.querySelector<SVGPathElement>('.aui-line-chart__line')?.style.getPropertyValue('stroke-dasharray')).toMatch(/^6,? 3$/);
    expect(chart.element.querySelectorAll('.aui-line-chart__point--unmarked')).toHaveLength(4);
    const swatches = [...chart.host.querySelectorAll<SVGSVGElement>('.aui-chart__legend .aui-chart__swatch')];
    expect(swatches[0]?.style.getPropertyValue('--aui-chart-series-color')).toBe('#0a7');
    expect(swatches[1]?.querySelector('.aui-chart__swatch-marker')).toBeNull();
    marks(chart.element)[0]?.focus();
    const tipSwatch = chart.host.querySelector<SVGSVGElement>('.aui-chart__tooltip .aui-chart__swatch');
    expect(tipSwatch?.style.getPropertyValue('--aui-chart-series-color')).toBe('#0a7');
    await userEvent.keyboard('{Escape}');
  });

  it('validates series styles', () => {
    expect(() => LineChart.create(host(), { ...line, series: [{ id: 'a', label: 'A', values: [1, 2, 3, 4], style: { color: 'nope(' } }] })).toThrow(AbsoluteUIError);
    // @ts-expect-error deliberately invalid input
    expect(() => BarChart.create(host(), { ...bars, series: [{ id: 'o', label: 'O', values: [1, 2, 3, 4, 5, 6], style: { dash: 'wavy' } }] })).toThrow(AbsoluteUIError);
    expect(() => ScatterChart.create(host(), { label: 'S', series: [{ id: 's', label: 'S', points: [{ x: 1, y: 2 }], style: { fillOpacity: 3 } }] })).toThrow(AbsoluteUIError);
  });

  it('applies to Bar, Combo, Scatter, and Radar series', () => {
    const bar = BarChart.create(host(), { ...bars, series: [{ id: 'o', label: 'Orders', values: [4, 6, 5, 8, 7, 9], style: { color: '#c00', fillOpacity: 0.5 } }] });
    expect(bar.element.querySelector<SVGGElement>('.aui-bar-chart__series')?.style.getPropertyValue('--aui-chart-series-fill-opacity')).toBe('0.5');
    const combo = ComboChart.create(host(), { label: 'C', categories: ['A', 'B'], series: [{ id: 'l', label: 'L', type: 'line', values: [1, 2], style: { dash: 'dotted' } }] });
    expect(combo.element.querySelector<SVGPathElement>('.aui-chart__line')?.style.getPropertyValue('stroke-dasharray')).toMatch(/^2,? 3$/);
    const scatter = ScatterChart.create(host(), { label: 'S', series: [{ id: 's', label: 'S', points: [{ x: 1, y: 2 }, { x: 2, y: 3 }], style: { color: '#00f' } }] });
    expect(scatter.element.querySelector<SVGGElement>('.aui-scatter-chart__series')?.style.getPropertyValue('--aui-chart-series-color')).toBe('#00f');
    const radar = RadarChart.create(host(), { label: 'R', axes: ['a', 'b', 'c'], series: [{ id: 'r', label: 'R', values: [1, 2, 3], style: { marker: 'square' } }] });
    expect(radar.element.querySelectorAll('.aui-chart__point--unmarked')).toHaveLength(0);
  });
});

describe('annotations', () => {
  it('draws reference lines and bands under the marks and lists them in the summary', () => {
    const chart = LineChart.create(host(), {
      ...line,
      annotations: [
        { type: 'line', axis: 'y', value: 15, label: 'Target', tone: 'success' },
        { type: 'band', axis: 'x', from: 'Feb', to: 'Mar', label: 'Campaign' },
        { type: 'line', axis: 'x', value: 99 },
      ],
    });
    const group = chart.element.querySelector('.aui-chart__annotations');
    expect(group?.getAttribute('aria-hidden')).toBe('true');
    expect(group?.querySelectorAll('.aui-chart__annotation-line')).toHaveLength(1);
    expect(group?.querySelectorAll('.aui-chart__annotation-band')).toHaveLength(1);
    expect(group?.querySelector('.aui-chart__annotation--success')).not.toBeNull();
    expect([...(group?.querySelectorAll('text') ?? [])].map((t) => t.textContent)).toEqual(['Target', 'Campaign']);
    // Under the marks: the annotation group precedes the series layer.
    const layer = chart.element.querySelector('.aui-chart__layer');
    const children = [...(layer?.children ?? [])];
    expect(children.indexOf(group!)).toBeLessThan(children.findIndex((c) => c.classList.contains('aui-line-chart__series-layer')));
    expect(chart.summary).toContain('Annotations: Target at 15');
    expect(chart.summary).toContain('Campaign from Feb to Mar');
  });

  it('works on the other cartesian charts and validates input', () => {
    const bar = BarChart.create(host(), { ...bars, annotations: [{ type: 'line', axis: 'y', value: 6, label: 'Goal' }] });
    expect(bar.element.querySelectorAll('.aui-chart__annotation-line')).toHaveLength(1);
    const hist = Histogram.create(host(), { label: 'H', values: [1, 2, 2, 3, 3, 3, 4], annotations: [{ type: 'band', axis: 'x', from: 2, to: 3 }] });
    expect(hist.element.querySelectorAll('.aui-chart__annotation-band')).toHaveLength(1);
    const fall = WaterfallChart.create(host(), { label: 'W', steps: [{ id: 'a', label: 'Start', kind: 'total', value: 10 }, { id: 'b', label: 'Down', value: -3 }], annotations: [{ type: 'line', axis: 'x', value: 'Down' }] });
    expect(fall.element.querySelectorAll('.aui-chart__annotation-line')).toHaveLength(1);
    // @ts-expect-error deliberately invalid input
    expect(() => BarChart.create(host(), { ...bars, annotations: [{ type: 'arrow', axis: 'y', value: 1 }] })).toThrow(AbsoluteUIError);
    // @ts-expect-error deliberately invalid input
    expect(() => LineChart.create(host(), { ...line, annotations: [{ type: 'line', axis: 'z', value: 1 }] })).toThrow(AbsoluteUIError);
  });
});

describe('custom tooltip renderer', () => {
  it('renders returned DOM nodes and falls back to the default tooltip for null', async () => {
    const contexts: { title: string; column: number | null; source: string; ids: (string | null)[] }[] = [];
    const chart = LineChart.create(host(), {
      ...line,
      renderTooltip: (context) => {
        contexts.push({ title: context.title, column: context.column, source: context.source, ids: context.rows.map((r) => r.seriesId) });
        if (context.title === 'Feb') return null;
        const strong = document.createElement('strong');
        strong.className = 'my-tip';
        strong.textContent = `${context.title}: ${context.rows.map((r) => r.value).join(' / ')}`;
        return strong;
      },
    });
    const points = marks(chart.element);
    points[0]?.focus();
    const tip = chart.host.querySelector('.aui-chart__tooltip');
    expect(tip?.querySelector('.my-tip')?.textContent).toBe('Jan: 10');
    expect(tip?.classList.contains('aui-chart__tooltip--custom')).toBe(true);
    expect(contexts[0]).toEqual({ title: 'Jan', column: 0, source: 'focus', ids: ['a'] });
    await userEvent.keyboard('{ArrowRight}');
    expect(tip?.querySelector('.my-tip')).toBeNull();
    expect(tip?.querySelector('.aui-chart__tooltip-title')?.textContent).toBe('Feb');
  });
});

describe('aui-point-click', () => {
  it('fires for a pointer click and for Enter or Space on the focused mark', async () => {
    const chart = BarChart.create(host(), bars);
    const details: ChartPointClickDetail[] = [];
    chart.host.addEventListener('aui-point-click', (e) => {
      if (e instanceof CustomEvent) details.push(e.detail as ChartPointClickDetail);
    });
    const bar = marks(chart.element)[1];
    bar?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(details[0]).toEqual({ seriesId: 'o', column: 1, row: 0, label: 'Q2', series: 'Orders', value: '6', source: 'pointer' });
    marks(chart.element)[0]?.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(bar);
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(details.map((d) => d.source)).toEqual(['pointer', 'keyboard', 'keyboard']);
    // Navigation is unchanged.
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement?.getAttribute('aria-label')).toContain('Q3');
  });

  it('describes scatter points by series and point text', () => {
    const chart = ScatterChart.create(host(), { label: 'S', series: [{ id: 's', label: 'Accounts', points: [{ x: 1, y: 2, label: 'Acme' }] }] });
    let detail: ChartPointClickDetail | null = null;
    chart.host.addEventListener('aui-point-click', (e) => {
      if (e instanceof CustomEvent) detail = e.detail as ChartPointClickDetail;
    });
    marks(chart.element)[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(detail).toMatchObject({ seriesId: 's', series: 'Accounts' });
  });

  it('pie slices report their id', () => {
    const chart = PieChart.create(host(), { label: 'P', slices: [{ id: 'x', label: 'X', value: 2 }, { id: 'y', label: 'Y', value: 3 }] });
    let id: string | null = null;
    chart.host.addEventListener('aui-point-click', (e) => {
      if (e instanceof CustomEvent) id = (e.detail as ChartPointClickDetail).seriesId;
    });
    marks(chart.element)[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(id).toBe('y');
  });
});

describe('synchronized crosshair', () => {
  it('shows the same column in every chart of the group and cleans up on destroy', async () => {
    const a = LineChart.create(host(), { ...line, syncGroup: 'sales', crosshair: true });
    const b = BarChart.create(host(), { ...bars, categories: ['Jan', 'Feb', 'Mar', 'Apr'], series: [{ id: 'o', label: 'Orders', values: [1, 2, 3, 4] }], syncGroup: 'sales' });
    const c = LineChart.create(host(), { ...line, syncGroup: 'other' });
    marks(a.element)[0]?.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    const tipB = b.host.querySelector('.aui-chart__tooltip');
    expect(tipB?.hasAttribute('hidden')).toBe(false);
    expect(tipB?.textContent).toContain('Mar');
    expect(c.host.querySelector('.aui-chart__tooltip')?.hasAttribute('hidden')).toBe(true);
    // Focus never moves to the peer.
    expect(a.element.contains(document.activeElement)).toBe(true);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(tipB?.hasAttribute('hidden')).toBe(true);
    a.destroy();
    b.destroy();
    c.destroy();
    // The registry is empty again: a new chart in the group has no peers to follow.
    const d = LineChart.create(host(), { ...line, syncGroup: 'sales' });
    marks(d.element)[0]?.focus();
    expect(d.host.querySelector('.aui-chart__tooltip')?.hasAttribute('hidden')).toBe(false);
    await userEvent.keyboard('{Escape}');
  });
});

describe('bar chart zoom', () => {
  it('zooms columns over categories and pans past the window edge', async () => {
    const chart = BarChart.create(host(), { ...bars, zoom: true, zoomRange: { from: 1, to: 3 } });
    expect(chart.zoomRange).toEqual({ from: 1, to: 3 });
    expect(marks(chart.element)).toHaveLength(3);
    expect(chart.host.querySelector('.aui-chart__toolbar')?.hasAttribute('hidden')).toBe(false);
    const zooms: unknown[] = [];
    chart.host.addEventListener('aui-zoom', (e) => {
      if (e instanceof CustomEvent) zooms.push(e.detail);
    });
    marks(chart.element)[0]?.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(zooms).toHaveLength(0);
    await userEvent.keyboard('{ArrowRight}');
    expect(zooms).toHaveLength(1);
    expect(document.activeElement?.getAttribute('aria-label')).toContain('Q5');
    await userEvent.keyboard('0');
    expect(chart.zoomRange).toBeNull();
    expect(marks(chart.element)).toHaveLength(6);
  });

  it('horizontal bar charts ignore zoom', () => {
    const chart = BarChart.create(host(), { ...bars, orientation: 'horizontal', zoom: true, zoomRange: { from: 1, to: 2 } });
    expect(marks(chart.element)).toHaveLength(6);
    expect(chart.zoomRange).toBeNull();
  });
});
