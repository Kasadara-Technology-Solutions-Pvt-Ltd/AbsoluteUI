/**
 * Cartesian axis rendering shared by Line and Bar charts: gridlines, value and
 * category axes, tick labels with thinning and truncation, and axis titles.
 * Axes are aria-hidden: every value is available through the focusable marks,
 * the summary, and the data table. Text is set with textContent only.
 */
import { svgElement } from './svg.js';

export interface PlotRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Wide (CJK, fullwidth, emoji) characters take about 1em; others about 0.6em. */
export function textWidth(text: string, fontPx: number): number {
  let em = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    em += code >= 0x1100 && (code <= 0x115f || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6) || code >= 0x1f300) ? 1 : 0.6;
  }
  return em * fontPx;
}

let segmenter: Intl.Segmenter | undefined;

/** Shorten `text` with an ellipsis so it fits `maxWidth` (estimated). */
export function truncateText(text: string, maxWidth: number, fontPx: number): string {
  if (textWidth(text, fontPx) <= maxWidth) return text;
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let out = '';
  for (const { segment: ch } of segmenter.segment(text)) {
    if (textWidth(`${out}${ch}...`, fontPx) > maxWidth) break;
    out += ch;
  }
  return out === '' ? '' : `${out.trimEnd()}...`;
}

function text(doc: Document, value: string, x: number, y: number, anchor: 'start' | 'middle' | 'end', className: string, baseline = 'middle'): SVGTextElement {
  const el = svgElement(doc, 'text', { x, y, 'text-anchor': anchor, 'dominant-baseline': baseline }, className);
  el.textContent = value;
  return el;
}

export interface ValueAxisOptions {
  /** `y`: vertical value axis with horizontal gridlines; `x`: horizontal value axis. */
  readonly axis: 'x' | 'y';
  readonly ticks: readonly number[];
  readonly map: (value: number) => number;
  readonly plot: PlotRect;
  /** Where tick labels go: for `y`, the left or right of the plot; `x` always below. */
  readonly side: 'left' | 'right';
  readonly format: (value: number) => string;
  readonly fontPx: number;
  /** Value of the emphasized zero line when the domain crosses zero. */
  readonly zero: number | null;
}

/** Gridlines, tick labels, and a zero line for the value axis. */
export function drawValueAxis(doc: Document, layer: SVGGElement, o: ValueAxisOptions): void {
  const grid = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-chart__grid');
  const labels = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-chart__axis aui-chart__axis--value');
  const { plot } = o;
  for (const tick of o.ticks) {
    const p = o.map(tick);
    if (o.axis === 'y') {
      grid.append(svgElement(doc, 'line', { x1: plot.left, x2: plot.right, y1: p, y2: p }, 'aui-chart__gridline'));
      const x = o.side === 'left' ? plot.left - 6 : plot.right + 6;
      labels.append(text(doc, o.format(tick), x, p, o.side === 'left' ? 'end' : 'start', 'aui-chart__tick-label'));
    } else {
      grid.append(svgElement(doc, 'line', { x1: p, x2: p, y1: plot.top, y2: plot.bottom }, 'aui-chart__gridline'));
      labels.append(text(doc, o.format(tick), p, plot.bottom + 6 + o.fontPx / 2, 'middle', 'aui-chart__tick-label'));
    }
  }
  if (o.zero !== null) {
    const p = o.map(o.zero);
    grid.append(o.axis === 'y'
      ? svgElement(doc, 'line', { x1: plot.left, x2: plot.right, y1: p, y2: p }, 'aui-chart__zero-line')
      : svgElement(doc, 'line', { x1: p, x2: p, y1: plot.top, y2: plot.bottom }, 'aui-chart__zero-line'));
  }
  layer.append(grid, labels);
}

/** Axis line along the category (or x) edge of the plot. */
export function drawBaseline(doc: Document, layer: SVGGElement, axis: 'x' | 'y', plot: PlotRect, side: 'left' | 'right'): void {
  const line = axis === 'x'
    ? svgElement(doc, 'line', { x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom }, 'aui-chart__axis-line')
    : svgElement(doc, 'line', { x1: side === 'left' ? plot.left : plot.right, x2: side === 'left' ? plot.left : plot.right, y1: plot.top, y2: plot.bottom }, 'aui-chart__axis-line');
  line.setAttribute('aria-hidden', 'true');
  layer.append(line);
}

export interface CategoryLabelsOptions {
  readonly axis: 'x' | 'y';
  readonly labels: readonly string[];
  /** Center position of each label along the axis. */
  readonly positions: readonly number[];
  /** Space available per label along the axis (px). */
  readonly spacing: number;
  readonly plot: PlotRect;
  readonly side: 'left' | 'right';
  readonly fontPx: number;
  /** For `y` labels: maximum label width (px). */
  readonly maxWidth: number;
  /** Width of the whole chart, to keep edge labels inside. */
  readonly width: number;
}

/**
 * Category or x tick labels. Horizontal labels are thinned (every k-th label) and
 * truncated so they never overlap; vertical (horizontal-bar) labels are truncated
 * to `maxWidth` and thinned when rows are shorter than the font.
 */
export function drawCategoryLabels(doc: Document, layer: SVGGElement, o: CategoryLabelsOptions): void {
  const group = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-chart__axis aui-chart__axis--category');
  const n = o.labels.length;
  if (n === 0) {
    layer.append(group);
    return;
  }
  if (o.axis === 'x') {
    const widest = o.labels.reduce((max, l) => Math.max(max, textWidth(l, o.fontPx)), 0);
    const room = Math.max(1, o.spacing * 0.9);
    // Prefer truncating to about six characters over dropping labels; thin out below that.
    const minRoom = o.fontPx * 0.6 * 6;
    const every = widest <= room ? 1 : Math.max(1, Math.ceil(Math.min(widest, minRoom) / room));
    const available = Math.max(o.fontPx * 2, Math.min(room * every, o.plot.right - o.plot.left));
    const y = o.plot.bottom + 6 + o.fontPx / 2;
    for (let i = 0; i < n; i += every) {
      const position = o.positions[i] ?? 0;
      const label = truncateText(o.labels[i] ?? '', available, o.fontPx);
      const half = textWidth(label, o.fontPx) / 2;
      // Edge labels are anchored to the chart edge instead of overflowing it.
      const anchor = position - half < 0 ? 'start' : position + half > o.width ? 'end' : 'middle';
      group.append(text(doc, label, anchor === 'start' ? 0 : anchor === 'end' ? o.width : position, y, anchor, 'aui-chart__tick-label'));
    }
  } else {
    const every = Math.max(1, Math.ceil((o.fontPx * 1.2) / Math.max(1, o.spacing)));
    const x = o.side === 'left' ? o.plot.left - 8 : o.plot.right + 8;
    for (let i = 0; i < n; i += every) {
      group.append(text(doc, truncateText(o.labels[i] ?? '', o.maxWidth, o.fontPx), x, o.positions[i] ?? 0, o.side === 'left' ? 'end' : 'start', 'aui-chart__tick-label'));
    }
  }
  layer.append(group);
}

/** Axis title: below the plot for `x`, rotated beside it for `y`. */
export function drawAxisTitle(doc: Document, layer: SVGGElement, axis: 'x' | 'y', title: string, plot: PlotRect, width: number, height: number, side: 'left' | 'right', fontPx: number): void {
  if (axis === 'x') {
    const label = text(doc, truncateText(title, plot.right - plot.left, fontPx), (plot.left + plot.right) / 2, height - fontPx * 0.6, 'middle', 'aui-chart__axis-title');
    label.setAttribute('aria-hidden', 'true');
    layer.append(label);
    return;
  }
  const x = side === 'left' ? fontPx * 0.8 : width - fontPx * 0.8;
  const y = (plot.top + plot.bottom) / 2;
  const label = text(doc, truncateText(title, plot.bottom - plot.top, fontPx), x, y, 'middle', 'aui-chart__axis-title');
  label.setAttribute('transform', `rotate(${side === 'left' ? -90 : 90} ${String(Math.round(x))} ${String(Math.round(y))})`);
  label.setAttribute('aria-hidden', 'true');
  layer.append(label);
}

/** Computed font size of the chart's SVG text in px (one style read per render). */
export function fontSize(el: Element): number {
  const view = el.ownerDocument.defaultView;
  const px = view ? Number.parseFloat(view.getComputedStyle(el).fontSize) : Number.NaN;
  return Number.isFinite(px) && px > 0 ? px : 12;
}
