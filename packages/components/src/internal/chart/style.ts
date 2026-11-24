/**
 * Chart look-and-feel layer shared by every chart (R20-15): the typed `theme` option,
 * per-series style, annotations (reference lines and bands), the custom tooltip
 * renderer contract, the point-click event detail, and the synchronized-crosshair
 * registry types.
 *
 * Themes and applications restyle charts in CSS through `--aui-chart-*` custom
 * properties (palette slots, grid, axis, text, tooltip, line width, area opacity,
 * bar radius, marker size, animation); the `theme` option writes the same
 * properties on the chart host through the CSSOM (`style.setProperty`) and toggles
 * classes. Never markup strings or `style` attributes (strict CSP, Trusted Types).
 * Internal: not a public subpath export.
 */
import { formatNumber, getMessage, registerMessages, validators } from '@absoluteui/core';
import { chartFail, listFormat } from './model.js';
import { svgElement } from './svg.js';
import type { MarkerShape } from './svg.js';

export type ChartLegendPosition = 'top' | 'bottom' | 'start' | 'end';
export type ChartLineJoin = 'round' | 'miter' | 'bevel';

/** Elements whose corner radius charts compute when they render (R20-22). */
export type ChartCornerElement = 'bar' | 'cell' | 'slice' | 'box' | 'swatch';

/**
 * Resolved corner radii in px, or null where neither the element's radius nor the overall
 * `cornerRadius` is set (the element keeps its built-in rounding).
 */
export type ChartCorners = Readonly<Record<ChartCornerElement, number | null>>;

export interface ChartTooltipTheme {
  /** Tooltip background (CSS color). */
  background?: string;
  /** Tooltip text (CSS color). */
  color?: string;
  /** Tooltip boundary (CSS color). */
  borderColor?: string;
}

export interface ChartAnimationOptions {
  /** Entry animation length in milliseconds (0 to 5000). Default 400. */
  duration?: number;
}

/**
 * Look and feel of one chart (R20-15). Every property is optional; unset properties keep
 * the theme's values. Applied as `--aui-chart-*` custom properties and classes on the host.
 */
export interface ChartTheme {
  /** Series colors for palette slots 1-8 (CSS colors, 1 to 8 entries). */
  palette?: readonly string[];
  /** Font family of the plot text (tick labels, axis titles, value labels). */
  fontFamily?: string;
  /** Plot text size in CSS px (8 to 32). */
  fontSize?: number;
  /** Tick labels and axis titles (CSS color). */
  textColor?: string;
  /** Show gridlines. Default true. */
  gridLines?: boolean;
  /** Gridline color (CSS color). */
  gridColor?: string;
  /** Gridline dash pattern: numbers separated by spaces (for example "4 2"), or "none". */
  gridDash?: string;
  /** Axis lines and zero lines (CSS color). */
  axisColor?: string;
  /** Line and outline width in CSS px (0.5 to 12). */
  lineWidth?: number;
  /** Marker radius in CSS px (1 to 20). */
  markerSize?: number;
  /**
   * Corner radius in CSS px (0 to 50) for every cornered element (R20-22): bars, cells,
   * tiles, slices, arcs, boxes, legend swatches, the tooltip, and the chart's controls. The per-element radii below win over it. Unset: each element keeps its
   * built-in rounding.
   */
  cornerRadius?: number;
  /** Bars, columns, histogram bins, waterfall steps, volume bars, sparkline bars: px (0 to 50), rounded at the value end. */
  barRadius?: number;
  /** Heatmap and calendar heatmap cells and treemap tiles: px (0 to 50). */
  cellRadius?: number;
  /** Pie and donut slices, gauge arcs, funnel stages: px (0 to 50). */
  sliceRadius?: number;
  /** Box plot boxes, candlestick bodies, bullet ranges and measures: px (0 to 50). */
  boxRadius?: number;
  /** Legend swatches (filled keys): px (0 to 8). */
  swatchRadius?: number;
  /** Tooltip corners: px (0 to 50); writes the `--aui-chart-tooltip-radius` component token. */
  tooltipRadius?: number;
  /** Data-table toggle and container, zoom toolbar buttons, legend buttons: px (0 to 50). */
  controlRadius?: number;
  /** Joins of series lines, areas, and radar outlines. Default "round". */
  lineJoin?: ChartLineJoin;
  /** Area fill opacity (0 to 1). */
  areaOpacity?: number;
  /** Gradient fills for areas and bars (the series color fading toward the baseline). */
  gradient?: boolean;
  /** Value labels printed on bars and slices (CSS color). */
  valueLabelColor?: string;
  tooltip?: ChartTooltipTheme;
  /** Legend placement. Default "top". `start` and `end` follow the writing direction. */
  legendPosition?: ChartLegendPosition;
  /** Opt-in entry animation; never runs with `prefers-reduced-motion: reduce` or `[data-aui-animation='none']`. */
  animation?: boolean | ChartAnimationOptions;
}

export type ChartSeriesDash = 'solid' | 'dashed' | 'dotted';
export type ChartSeriesMarker = 'auto' | 'none' | 'circle' | 'square' | 'diamond' | 'triangle';

/** Per-series look (line, area, bar, combo, scatter, radar). */
export interface ChartSeriesStyle {
  /** Series color (CSS color); overrides the palette slot. Legend and tooltip keys use it too. */
  color?: string;
  /** Line width in CSS px (0.5 to 12). */
  lineWidth?: number;
  dash?: ChartSeriesDash;
  /** Marker shape; `auto` keeps the series' default shape, `none` hides markers. */
  marker?: ChartSeriesMarker;
  /** Area or bar fill opacity (0 to 1). */
  fillOpacity?: number;
}

export type ChartAnnotationTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Reference line at one axis value. */
export interface ChartReferenceLine {
  type: 'line';
  /** `x`: a vertical line at an x value or category; `y`: a horizontal line at a value. */
  axis: 'x' | 'y';
  /** Number (value, x value, or category index), or a category label. */
  value: number | string;
  label?: string;
  tone?: ChartAnnotationTone;
}

/** Shaded band between two axis values. */
export interface ChartBand {
  type: 'band';
  axis: 'x' | 'y';
  from: number | string;
  to: number | string;
  label?: string;
  tone?: ChartAnnotationTone;
}

/** Decorative reference line or band, drawn under the marks and listed in the accessible summary. */
export type ChartAnnotation = ChartReferenceLine | ChartBand;

/** One tooltip row passed to `renderTooltip`. */
export interface ChartTooltipContextRow {
  label: string;
  value: string;
  /** Series (or item) id, or null for summary rows such as a total. */
  seriesId: string | null;
}

/** Argument of `renderTooltip`. */
export interface ChartTooltipContext {
  title: string;
  rows: ChartTooltipContextRow[];
  /** Column (category or x index) of the hovered or focused data, or null. */
  column: number | null;
  /** Row (visible-series position) of the focused mark, or null while hovering a column. */
  row: number | null;
  /** What opened the tooltip. */
  source: 'pointer' | 'focus' | 'sync';
}

/** Custom tooltip content: return DOM nodes (never HTML strings), or null for the default tooltip. */
export type ChartTooltipRenderer = (context: ChartTooltipContext) => Node | null;

/** Detail of `aui-point-click`. */
export interface ChartPointClickDetail {
  /** Series (or item) id, or null when the mark has none. */
  seriesId: string | null;
  /** Category or x index (the mark's column). */
  column: number;
  /** Visible-series position of the mark. */
  row: number;
  /** Category, x value, or item label (the tooltip title). */
  label: string;
  /** Series name, or an empty string. */
  series: string;
  /** Formatted value text as shown in the tooltip. */
  value: string;
  /** `pointer`: click or tap; `keyboard`: Enter or Space on the focused mark. */
  source: 'pointer' | 'keyboard';
}

registerMessages('chart', 'en', {
  annotationLine: '{label} at {value}',
  annotationBand: '{label} from {from} to {to}',
  annotationList: 'Annotations: {list}.',
  referenceLine: 'Reference line',
  band: 'Band',
});

const POSITIONS: readonly ChartLegendPosition[] = ['top', 'bottom', 'start', 'end'];
const JOINS: readonly ChartLineJoin[] = ['round', 'miter', 'bevel'];
/** Upper bound of every corner radius option and custom property (px). */
export const MAX_CORNER_RADIUS = 50;
/** Upper bound of the legend swatch radius (the swatch is 16 x 14 px). */
export const MAX_SWATCH_RADIUS = 8;
const RADIUS_FIELDS = ['cornerRadius', 'barRadius', 'cellRadius', 'sliceRadius', 'boxRadius', 'tooltipRadius', 'controlRadius'] as const;
const CORNER_ELEMENTS: readonly ChartCornerElement[] = ['bar', 'cell', 'slice', 'box', 'swatch'];
const DASHES: readonly ChartSeriesDash[] = ['solid', 'dashed', 'dotted'];
const MARKERS: readonly ChartSeriesMarker[] = ['auto', 'none', 'circle', 'square', 'diamond', 'triangle'];
const TONES: readonly ChartAnnotationTone[] = ['neutral', 'info', 'success', 'warning', 'danger'];
const COLOR_FALLBACK = /^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|var)\([^;{}<>]*\))$/i;
const FONT_FAMILY = /^[\p{L}\p{N}\s,"'._-]+$/u;
const DASH = /^(?:none|\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?)*)$/;

/** A CSS color: `CSS.supports('color', value)` where available, else a conservative syntax check. */
export function isCssColor(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 200) return false;
  const css: { supports?: (property: string, value: string) => boolean } | undefined = typeof CSS === 'undefined' ? undefined : CSS;
  if (css && typeof css.supports === 'function') return css.supports('color', value);
  return COLOR_FALLBACK.test(value.trim());
}

const inRange = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Validate the `theme` option (invalid values throw, leaving the chart unchanged). */
export function assertTheme(theme: unknown, component: string, code: string, key = 'theme'): void {
  if (theme === undefined) return;
  if (!validators.isRecord(theme)) chartFail(code, component, key, 'ChartTheme object');
  const t = theme;
  if (t.palette !== undefined) {
    const p = t.palette;
    if (!Array.isArray(p) || p.length === 0 || p.length > 8 || !p.every((c: unknown) => isCssColor(c))) chartFail(code, component, `${key}.palette`, '1 to 8 CSS colors');
  }
  for (const name of ['textColor', 'gridColor', 'axisColor', 'valueLabelColor'] as const) {
    if (t[name] !== undefined && !isCssColor(t[name])) chartFail(code, component, `${key}.${name}`, 'CSS color');
  }
  if (t.fontFamily !== undefined && !(typeof t.fontFamily === 'string' && t.fontFamily.length <= 200 && FONT_FAMILY.test(t.fontFamily))) chartFail(code, component, `${key}.fontFamily`, 'font family list (letters, digits, spaces, commas, quotes, hyphens)');
  if (t.fontSize !== undefined && !inRange(t.fontSize, 8, 32)) chartFail(code, component, `${key}.fontSize`, 'number from 8 to 32 (CSS px)');
  if (t.gridLines !== undefined && typeof t.gridLines !== 'boolean') chartFail(code, component, `${key}.gridLines`, 'boolean');
  if (t.gridDash !== undefined && !(typeof t.gridDash === 'string' && t.gridDash.length <= 60 && DASH.test(t.gridDash.trim()))) chartFail(code, component, `${key}.gridDash`, '"none" or numbers separated by spaces');
  if (t.lineWidth !== undefined && !inRange(t.lineWidth, 0.5, 12)) chartFail(code, component, `${key}.lineWidth`, 'number from 0.5 to 12 (CSS px)');
  if (t.markerSize !== undefined && !inRange(t.markerSize, 1, 20)) chartFail(code, component, `${key}.markerSize`, 'number from 1 to 20 (CSS px)');
  for (const name of RADIUS_FIELDS) {
    if (t[name] !== undefined && !inRange(t[name], 0, MAX_CORNER_RADIUS)) chartFail(code, component, `${key}.${name}`, 'number from 0 to 50 (CSS px)');
  }
  if (t.swatchRadius !== undefined && !inRange(t.swatchRadius, 0, MAX_SWATCH_RADIUS)) chartFail(code, component, `${key}.swatchRadius`, 'number from 0 to 8 (CSS px)');
  if (t.lineJoin !== undefined && !JOINS.includes(t.lineJoin as ChartLineJoin)) chartFail(code, component, `${key}.lineJoin`, '"round" | "miter" | "bevel"');
  if (t.areaOpacity !== undefined && !inRange(t.areaOpacity, 0, 1)) chartFail(code, component, `${key}.areaOpacity`, 'number from 0 to 1');
  if (t.gradient !== undefined && typeof t.gradient !== 'boolean') chartFail(code, component, `${key}.gradient`, 'boolean');
  if (t.legendPosition !== undefined && !POSITIONS.includes(t.legendPosition as ChartLegendPosition)) chartFail(code, component, `${key}.legendPosition`, '"top" | "bottom" | "start" | "end"');
  if (t.tooltip !== undefined) {
    if (!validators.isRecord(t.tooltip)) chartFail(code, component, `${key}.tooltip`, '{ background?, color?, borderColor? }');
    for (const name of ['background', 'color', 'borderColor'] as const) {
      if (t.tooltip[name] !== undefined && !isCssColor(t.tooltip[name])) chartFail(code, component, `${key}.tooltip.${name}`, 'CSS color');
    }
  }
  const a = t.animation;
  if (a !== undefined && typeof a !== 'boolean') {
    if (!validators.isRecord(a)) chartFail(code, component, `${key}.animation`, 'boolean | { duration?: number }');
    if (a.duration !== undefined && !inRange(a.duration, 0, 5000)) chartFail(code, component, `${key}.animation.duration`, 'number from 0 to 5000 (ms)');
  }
}

/** Validate an optional per-series `style`. */
export function assertSeriesStyle(style: unknown, at: string, component: string, code: string): void {
  if (style === undefined) return;
  if (!validators.isRecord(style)) chartFail(code, component, `${at}.style`, 'ChartSeriesStyle object');
  if (style.color !== undefined && !isCssColor(style.color)) chartFail(code, component, `${at}.style.color`, 'CSS color');
  if (style.lineWidth !== undefined && !inRange(style.lineWidth, 0.5, 12)) chartFail(code, component, `${at}.style.lineWidth`, 'number from 0.5 to 12 (CSS px)');
  if (style.dash !== undefined && !DASHES.includes(style.dash as ChartSeriesDash)) chartFail(code, component, `${at}.style.dash`, '"solid" | "dashed" | "dotted"');
  if (style.marker !== undefined && !MARKERS.includes(style.marker as ChartSeriesMarker)) chartFail(code, component, `${at}.style.marker`, '"auto" | "none" | "circle" | "square" | "diamond" | "triangle"');
  if (style.fillOpacity !== undefined && !inRange(style.fillOpacity, 0, 1)) chartFail(code, component, `${at}.style.fillOpacity`, 'number from 0 to 1');
}

/** Validate per-series styles of a series list (call after `assertSeries`). */
export function assertSeriesStyles(series: readonly { readonly style?: unknown }[], component: string, code: string): void {
  series.forEach((s, i) => {
    assertSeriesStyle(s.style, `series[${String(i)}]`, component, code);
  });
}

const isAxisValue = (v: unknown): v is number | string => (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string';

/** Validate the `annotations` option. */
export function assertAnnotations(value: unknown, component: string, code: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) chartFail(code, component, 'annotations', 'ChartAnnotation[]');
  value.forEach((a: unknown, i) => {
    const at = `annotations[${String(i)}]`;
    if (!validators.isRecord(a)) chartFail(code, component, at, 'ChartAnnotation');
    if (a.type !== 'line' && a.type !== 'band') chartFail(code, component, `${at}.type`, '"line" | "band"');
    if (a.axis !== 'x' && a.axis !== 'y') chartFail(code, component, `${at}.axis`, '"x" | "y"');
    if (a.type === 'line' && !isAxisValue(a.value)) chartFail(code, component, `${at}.value`, 'finite number or category label');
    if (a.type === 'band') {
      if (!isAxisValue(a.from)) chartFail(code, component, `${at}.from`, 'finite number or category label');
      if (!isAxisValue(a.to)) chartFail(code, component, `${at}.to`, 'finite number or category label');
    }
    if (a.label !== undefined && typeof a.label !== 'string') chartFail(code, component, `${at}.label`, 'string');
    if (a.tone !== undefined && !TONES.includes(a.tone as ChartAnnotationTone)) chartFail(code, component, `${at}.tone`, '"neutral" | "info" | "success" | "warning" | "danger"');
  });
}

/** Validate `renderTooltip` and `syncGroup` (shared by every frame chart). */
export function assertInteraction(o: { readonly renderTooltip?: unknown; readonly syncGroup?: unknown }, component: string, code: string): void {
  if (o.renderTooltip !== undefined && typeof o.renderTooltip !== 'function') chartFail(code, component, 'renderTooltip', '(context: ChartTooltipContext) => Node | null');
  if (o.syncGroup !== undefined && !(typeof o.syncGroup === 'string' && o.syncGroup.trim() !== '' && o.syncGroup.length <= 100)) chartFail(code, component, 'syncGroup', 'non-empty string (up to 100 characters)');
}

const DASH_ARRAY: Readonly<Record<ChartSeriesDash, string>> = { solid: 'none', dashed: '6 3', dotted: '2 3' };

/** CSS custom properties and classes the `theme` option sets on a chart host. */
export class ChartStyler {
  readonly #host: HTMLElement;
  #properties: string[] = [];
  #classes: string[] = [];

  constructor(host: HTMLElement) {
    this.#host = host;
  }

  /** Replace the previously applied theme (undefined clears it). */
  apply(theme: ChartTheme | undefined): void {
    this.clear();
    if (!theme) return;
    const set: [string, string][] = [];
    theme.palette?.forEach((color, i) => set.push([`--aui-chart-${String(i + 1)}`, color]));
    const px = (n: number): string => `${String(n)}px`;
    if (theme.fontFamily !== undefined) set.push(['--aui-chart-font-family', theme.fontFamily]);
    if (theme.fontSize !== undefined) set.push(['--aui-chart-font-size', px(theme.fontSize)]);
    if (theme.textColor !== undefined) set.push(['--aui-chart-text-color', theme.textColor]);
    if (theme.gridColor !== undefined) set.push(['--aui-chart-grid-color', theme.gridColor]);
    if (theme.gridDash !== undefined) set.push(['--aui-chart-grid-dash', theme.gridDash.trim()]);
    if (theme.axisColor !== undefined) set.push(['--aui-chart-axis-color', theme.axisColor]);
    if (theme.lineWidth !== undefined) set.push(['--aui-chart-line-width', px(theme.lineWidth)]);
    if (theme.markerSize !== undefined) set.push(['--aui-chart-marker-size', String(theme.markerSize)]);
    if (theme.cornerRadius !== undefined) set.push(['--aui-chart-corner-radius', px(theme.cornerRadius)]);
    for (const element of CORNER_ELEMENTS) {
      const value = theme[`${element}Radius`];
      if (value !== undefined) set.push([`--aui-chart-${element}-radius`, px(value)]);
    }
    if (theme.tooltipRadius !== undefined) set.push(['--aui-chart-tooltip-radius', px(theme.tooltipRadius)]);
    if (theme.controlRadius !== undefined) set.push(['--aui-chart-control-radius', px(theme.controlRadius)]);
    if (theme.lineJoin !== undefined) set.push(['--aui-chart-line-join', theme.lineJoin]);
    if (theme.areaOpacity !== undefined) set.push(['--aui-chart-area-opacity', String(theme.areaOpacity)]);
    if (theme.valueLabelColor !== undefined) set.push(['--aui-chart-label-color', theme.valueLabelColor]);
    if (theme.tooltip?.background !== undefined) set.push(['--aui-chart-tooltip-bg', theme.tooltip.background]);
    if (theme.tooltip?.color !== undefined) set.push(['--aui-chart-tooltip-fg', theme.tooltip.color]);
    if (theme.tooltip?.borderColor !== undefined) set.push(['--aui-chart-tooltip-border-color', theme.tooltip.borderColor]);
    const animation = theme.animation;
    if (typeof animation === 'object' && animation.duration !== undefined) set.push(['--aui-chart-animation-duration', `${String(animation.duration)}ms`]);
    for (const [name, value] of set) this.#host.style.setProperty(name, value);
    this.#properties = set.map(([name]) => name);
    const classes: string[] = [];
    if (theme.gridLines === false) classes.push('aui-chart--no-grid');
    if (theme.gradient === true) classes.push('aui-chart--gradient');
    if (theme.legendPosition !== undefined && theme.legendPosition !== 'top') classes.push(`aui-chart--legend-${theme.legendPosition}`);
    if (animation === true || typeof animation === 'object') classes.push('aui-chart--animate');
    this.#host.classList.add(...classes);
    this.#classes = classes;
  }

  clear(): void {
    for (const name of this.#properties) this.#host.style.removeProperty(name);
    if (this.#classes.length) this.#host.classList.remove(...this.#classes);
    this.#properties = [];
    this.#classes = [];
  }
}

/**
 * Apply a per-series style to the element that carries the series' palette-slot class:
 * color, line width, and fill opacity as custom properties read by the chart styles.
 */
export function applySeriesStyle(element: Element & ElementCSSInlineStyle, style: ChartSeriesStyle | undefined): void {
  if (!style) return;
  if (style.color !== undefined) element.style.setProperty('--aui-chart-series-color', style.color);
  if (style.lineWidth !== undefined) element.style.setProperty('--aui-chart-series-line-width', `${String(style.lineWidth)}px`);
  if (style.fillOpacity !== undefined) element.style.setProperty('--aui-chart-series-fill-opacity', String(style.fillOpacity));
}

/** Apply a per-series dash to a stroked path (inline, so it wins over the `patterns` dashes). */
export function applySeriesDash(element: Element & ElementCSSInlineStyle, style: ChartSeriesStyle | undefined): void {
  if (style?.dash !== undefined) element.style.setProperty('stroke-dasharray', DASH_ARRAY[style.dash]);
}

/** Marker shape for a series: its `style.marker`, else `fallback`; null hides markers. */
export function seriesMarker(style: ChartSeriesStyle | undefined, fallback: MarkerShape): MarkerShape | null {
  const marker = style?.marker;
  if (marker === undefined || marker === 'auto') return fallback;
  return marker === 'none' ? null : marker;
}

/** Marker radius: the `theme.markerSize`, else the `--aui-chart-marker-size` custom property, else `fallback`. */
export function markerRadius(host: HTMLElement, theme: ChartTheme | undefined, fallback: number): number {
  if (theme?.markerSize !== undefined) return theme.markerSize;
  const view = host.ownerDocument.defaultView;
  const raw = (host.style.getPropertyValue('--aui-chart-marker-size') || (view ? view.getComputedStyle(host).getPropertyValue('--aui-chart-marker-size') : '')).trim();
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value >= 1 && value <= 20 ? value : fallback;
}

const RADIUS_VALUE = /^(\d+(?:\.\d+)?|\.\d+)(?:px)?$/;

/** A corner radius custom property value in px ("4px" or "4", 0 to 50), or null when unset or not a px length. */
export function parseRadius(raw: string): number | null {
  const m = RADIUS_VALUE.exec(raw.trim());
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) && value >= 0 && value <= MAX_CORNER_RADIUS ? value : null;
}

/**
 * Corner radii of a chart (R20-22), read once per render from the host's resolved custom
 * properties, so CSS-only theming (`--aui-chart-*-radius` in a stylesheet or a theme) and the
 * `theme` option (written on the host) behave the same. Cascade per element:
 * `--aui-chart-<element>-radius` (`theme.<element>Radius`), else `--aui-chart-corner-radius`
 * (`theme.cornerRadius`; at most 8 px for swatches), else null (the element's built-in
 * rounding). Values must be px lengths from 0 to 50; anything else counts as unset.
 */
export function resolveCorners(host: HTMLElement): ChartCorners {
  const view = host.ownerDocument.defaultView;
  let computed: CSSStyleDeclaration | null = null;
  const read = (name: string): number | null => {
    const inline = host.style.getPropertyValue(name);
    if (inline) return parseRadius(inline);
    computed ??= view ? view.getComputedStyle(host) : null;
    return parseRadius(computed?.getPropertyValue(name) ?? '');
  };
  const overall = read('--aui-chart-corner-radius');
  const out: Record<ChartCornerElement, number | null> = { bar: null, cell: null, slice: null, box: null, swatch: null };
  for (const element of CORNER_ELEMENTS) {
    const own = read(`--aui-chart-${element}-radius`);
    const value = own ?? overall;
    out[element] = element === 'swatch' && value !== null ? Math.min(value, MAX_SWATCH_RADIUS) : value;
  }
  return out;
}

/** The resolved radius of `element`, else its built-in `fallback` (px). */
export function cornerOf(corners: ChartCorners, element: ChartCornerElement, fallback = 0): number {
  return corners[element] ?? fallback;
}

export interface AnnotationScales {
  /** Pixel position of an x value or category (null: not on this chart's x axis). */
  readonly x?: (value: number | string) => number | null;
  /** Pixel position of a y value (null: not on this chart's y axis). */
  readonly y?: (value: number | string) => number | null;
  readonly plot: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
  readonly rtl: boolean;
  readonly fontPx: number;
}

/** Draw annotations (aria-hidden) into `layer`; call after the axes and before the marks. */
export function drawAnnotations(doc: Document, layer: SVGGElement, annotations: readonly ChartAnnotation[] | undefined, s: AnnotationScales): void {
  if (!annotations || annotations.length === 0) return;
  const g = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-chart__annotations');
  const p = s.plot;
  const clampX = (v: number): number => Math.min(p.right, Math.max(p.left, v));
  const clampY = (v: number): number => Math.min(p.bottom, Math.max(p.top, v));
  for (const a of annotations) {
    const map = a.axis === 'x' ? s.x : s.y;
    if (!map) continue;
    const tone = `aui-chart__annotation--${a.tone ?? 'neutral'}`;
    let labelX: number;
    let labelY: number;
    let anchor: 'start' | 'end';
    if (a.type === 'line') {
      const at = map(a.value);
      if (at === null || !Number.isFinite(at)) continue;
      if (a.axis === 'x') {
        if (at < p.left - 0.5 || at > p.right + 0.5) continue;
        const x = Math.round(at) + 0.5;
        g.append(svgElement(doc, 'line', { x1: x, x2: x, y1: p.top, y2: p.bottom }, `aui-chart__annotation-line ${tone}`));
        labelX = s.rtl ? x - 4 : x + 4;
        labelY = p.top + s.fontPx;
        anchor = s.rtl ? 'end' : 'start';
      } else {
        if (at < p.top - 0.5 || at > p.bottom + 0.5) continue;
        const y = Math.round(at) + 0.5;
        g.append(svgElement(doc, 'line', { x1: p.left, x2: p.right, y1: y, y2: y }, `aui-chart__annotation-line ${tone}`));
        labelX = s.rtl ? p.left + 4 : p.right - 4;
        labelY = y - 4;
        anchor = s.rtl ? 'start' : 'end';
      }
    } else {
      const from = map(a.from);
      const to = map(a.to);
      if (from === null || to === null || !Number.isFinite(from) || !Number.isFinite(to)) continue;
      if (a.axis === 'x') {
        const x1 = clampX(Math.min(from, to));
        const x2 = clampX(Math.max(from, to));
        if (x2 - x1 <= 0) continue;
        g.append(svgElement(doc, 'rect', { x: x1, y: p.top, width: x2 - x1, height: p.bottom - p.top }, `aui-chart__annotation-band ${tone}`));
        labelX = s.rtl ? x2 - 4 : x1 + 4;
        labelY = p.top + s.fontPx;
        anchor = s.rtl ? 'end' : 'start';
      } else {
        const y1 = clampY(Math.min(from, to));
        const y2 = clampY(Math.max(from, to));
        if (y2 - y1 <= 0) continue;
        g.append(svgElement(doc, 'rect', { x: p.left, y: y1, width: p.right - p.left, height: y2 - y1 }, `aui-chart__annotation-band ${tone}`));
        labelX = s.rtl ? p.left + 4 : p.right - 4;
        labelY = y1 + s.fontPx;
        anchor = s.rtl ? 'start' : 'end';
      }
    }
    if (a.label) {
      const text = svgElement(doc, 'text', { x: labelX, y: labelY, 'text-anchor': anchor }, `aui-chart__annotation-label ${tone}`);
      text.textContent = a.label;
      g.append(text);
    }
  }
  layer.append(g);
}

/**
 * Sentence listing the annotations for the accessible summary (they are drawn aria-hidden).
 * `formatX` / `formatY` turn axis values into text (category labels, formatted numbers).
 */
export function annotationSentence(annotations: readonly ChartAnnotation[] | undefined, formatX: (v: number | string) => string, formatY: (v: number | string) => string, locale: string): string {
  if (!annotations || annotations.length === 0) return '';
  const items = annotations.map((a) => {
    const format = a.axis === 'x' ? formatX : formatY;
    if (a.type === 'line') return getMessage('chart', 'annotationLine', { label: a.label ?? getMessage('chart', 'referenceLine', {}, locale), value: format(a.value) }, locale);
    return getMessage('chart', 'annotationBand', { label: a.label ?? getMessage('chart', 'band', {}, locale), from: format(a.from), to: format(a.to) }, locale);
  });
  return getMessage('chart', 'annotationList', { list: listFormat(items, locale) }, locale);
}

/** Axis value text for annotation sentences: strings verbatim, numbers through `format` (or Intl). */
export function axisValueText(format: ((v: number) => string) | undefined, locale: string): (v: number | string) => string {
  return (v) => (typeof v === 'string' ? v : format ? format(v) : formatNumber(v, {}, locale));
}

/** Category position for annotations: a label (first match) or an index, via `center(index)`. */
export function categoryPosition(categories: readonly string[], center: (index: number) => number | null): (v: number | string) => number | null {
  return (v) => {
    const index = typeof v === 'string' ? categories.indexOf(v) : v;
    if (index < 0 || index > categories.length - 1) return null;
    return Number.isInteger(index) ? center(index) : null;
  };
}

/** Category label text for annotation sentences (indexes become labels). */
export function categoryText(categories: readonly string[]): (v: number | string) => string {
  return (v) => (typeof v === 'string' ? v : (categories[v] ?? String(v)));
}

/** Numeric axis position for annotations (category strings are not on a numeric axis). */
export function numericPosition(map: (v: number) => number): (v: number | string) => number | null {
  return (v) => (typeof v === 'number' ? map(v) : null);
}
