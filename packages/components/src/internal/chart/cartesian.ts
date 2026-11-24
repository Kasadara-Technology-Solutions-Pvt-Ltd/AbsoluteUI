/**
 * Cartesian layout helpers shared by the R3 charts (Scatter, Combo, Waterfall,
 * Histogram, Box Plot): value-axis ticks from a domain and axis options, plot
 * rectangle from the axis label widths, and a linear x axis with gridlines.
 * Pure layout math plus aria-hidden axis drawing. Internal.
 */
import { validators } from '@absoluteui/core';
import { drawCategoryLabels, textWidth, type PlotRect } from './axis.js';
import { chartFail } from './model.js';
import { linearTicks, type LinearScale, type LinearTicks } from './scale.js';
import { svgElement } from './svg.js';

export interface ValueAxisInput {
  readonly label?: string;
  readonly min?: number;
  readonly max?: number;
  readonly tickCount?: number;
  /** Include zero in the domain. */
  readonly includeZero?: boolean;
}

/** Ticks for a data range [lo, hi] honoring fixed `min`/`max` and `tickCount`; `length` is the axis length in px. */
export function valueTicks(lo: number, hi: number, length: number, axis: ValueAxisInput | undefined, spacing = 48): LinearTicks {
  const min = axis?.min ?? lo;
  const max = axis?.max ?? hi;
  const count = axis?.tickCount ?? Math.max(2, Math.min(10, Math.floor(length / spacing)));
  return linearTicks(min, max, count, axis?.min === undefined && axis?.max === undefined);
}

/** Width reserved for a vertical value axis: widest tick label, padding, and an optional rotated title. */
export function valueAxisWidth(labels: readonly string[], px: number, titled: boolean): number {
  return Math.ceil(Math.max(px, ...labels.map((t) => textWidth(t, px)))) + 10 + (titled ? Math.ceil(px * 1.8) : 0);
}

/** Plot top and bottom for a chart with x tick labels (and an optional x title) below the plot. */
export function plotVertical(height: number, px: number, xTitled: boolean): { top: number; bottom: number } {
  return { top: Math.ceil(px), bottom: height - Math.ceil(px * 2 + 6) - (xTitled ? Math.ceil(px * 1.6) : 0) };
}

/**
 * Plot rectangle: the primary value axis sits at the start side (left in LTR, right
 * in RTL), an optional secondary axis at the end side.
 */
export function plotRect(width: number, vertical: { top: number; bottom: number }, px: number, rtl: boolean, startAxis: number, endAxis = 0): PlotRect {
  const edge = Math.ceil(px);
  const start = startAxis;
  const end = Math.max(edge, endAxis);
  return rtl
    ? { left: end, right: width - start, top: vertical.top, bottom: vertical.bottom }
    : { left: start, right: width - end, top: vertical.top, bottom: vertical.bottom };
}

/** Linear x axis below the plot: vertical gridlines and thinned tick labels. */
export function drawLinearXAxis(doc: Document, layer: SVGGElement, o: { readonly ticks: readonly number[]; readonly scale: LinearScale; readonly format: (v: number) => string; readonly plot: PlotRect; readonly side: 'left' | 'right'; readonly fontPx: number; readonly width: number; readonly grid: boolean }): void {
  const positions = o.ticks.map((t) => o.scale.map(t));
  if (o.grid) {
    const grid = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-chart__grid');
    for (const p of positions) grid.append(svgElement(doc, 'line', { x1: p, x2: p, y1: o.plot.top, y2: o.plot.bottom }, 'aui-chart__gridline'));
    layer.append(grid);
  }
  const spacing = positions.length > 1 ? Math.abs((positions[1] ?? 0) - (positions[0] ?? 0)) : o.plot.right - o.plot.left;
  drawCategoryLabels(doc, layer, { axis: 'x', labels: o.ticks.map(o.format), positions, spacing, plot: o.plot, side: o.side, fontPx: o.fontPx, maxWidth: 0, width: o.width });
}

/** Inverse of a linear scale (pixel to data). */
export function invert(scale: LinearScale, px: number): number {
  const [d0, d1] = scale.domain;
  const [r0, r1] = scale.range;
  return r1 === r0 ? d0 : d0 + ((px - r0) / (r1 - r0)) * (d1 - d0);
}

/** Index of the first element of ascending `values` that is >= `target` (values.length when none). */
export function lowerBound(values: readonly number[], target: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((values[mid] ?? 0) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Validate value-axis options (`label`, `min`, `max`, `tickCount`, `includeZero`). */
export function assertValueAxis(axis: unknown, key: string, component: string, code: string): void {
  if (axis === undefined) return;
  if (!validators.isRecord(axis)) chartFail(code, component, key, 'axis options object');
  const { label, min, max, tickCount, includeZero } = axis;
  if (label !== undefined && typeof label !== 'string') chartFail(code, component, `${key}.label`, 'string');
  if (min !== undefined && !(typeof min === 'number' && Number.isFinite(min))) chartFail(code, component, `${key}.min`, 'finite number');
  if (max !== undefined && !(typeof max === 'number' && Number.isFinite(max))) chartFail(code, component, `${key}.max`, 'finite number');
  if (typeof min === 'number' && typeof max === 'number' && max <= min) chartFail(code, component, `${key}.max`, `number greater than ${key}.min`);
  if (tickCount !== undefined && !(typeof tickCount === 'number' && Number.isInteger(tickCount) && tickCount >= 2 && tickCount <= 20)) chartFail(code, component, `${key}.tickCount`, 'integer from 2 to 20');
  if (includeZero !== undefined && typeof includeZero !== 'boolean') chartFail(code, component, `${key}.includeZero`, 'boolean');
}

/** Validate an optional zoom range option (`{ from, to }` or null). */
export function assertZoomRange(value: unknown, key: string, component: string, code: string): void {
  if (value === undefined || value === null) return;
  if (!(validators.isRecord(value) && typeof value.from === 'number' && Number.isFinite(value.from) && typeof value.to === 'number' && Number.isFinite(value.to))) chartFail(code, component, key, '{ from: number; to: number } | null');
}

