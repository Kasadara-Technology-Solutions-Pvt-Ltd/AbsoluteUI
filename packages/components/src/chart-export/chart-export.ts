/**
 * Chart export (SPEC section 18.18 shared infrastructure: export). Serializes a
 * rendered chart (any frame-based chart, Gauge, or Sparkline) to a standalone SVG
 * document with its title and legend, or rasterizes it to PNG. Computed theme
 * colors, fonts, and dash patterns are copied onto the copy as presentation
 * attributes, so the file looks like the page without any stylesheet and without
 * style attributes. A separate subpath: charts that never export do not ship it.
 *
 * Nothing is uploaded or stored: the result is a string or Blob for the caller,
 * and `downloadChart` saves it through a temporary object URL (SPEC section 14.1).
 * PNG rasterizing loads the SVG from a blob: URL, so pages with a CSP need
 * `img-src blob:`.
 */
import { configurationError, runtimeError } from '@absoluteui/core';
import { saveBlob, svgToPng, type ExportErrorContext } from '../internal/export.js';

const EXPORT_CONTEXT: ExportErrorContext = { component: 'chartExport', code: 'CHART_EXPORT', subject: 'chart' };

export type ChartExportFormat = 'svg' | 'png';

export interface ChartExportOptions {
  /** Include the chart title above the plot. Default true. */
  title?: boolean;
  /** Include the legend (visible entries) below the plot. Default true. */
  legend?: boolean;
  /** `surface` (default): the theme surface color; `transparent`: no background. */
  background?: 'surface' | 'transparent';
  /** PNG device-pixel ratio, 1-4. Default 2. */
  scale?: number;
}

export interface ChartDownloadOptions extends ChartExportOptions {
  format: ChartExportFormat;
  /** File name without directories; the extension is added when missing. */
  fileName: string;
}

/** Anything with a host element and a rendered SVG (every AbsoluteUI chart). */
export interface ExportableChart {
  readonly host: HTMLElement;
  readonly element: SVGSVGElement;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Computed properties copied onto the exported copy. */
const PAINT = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'paint-order'] as const;
const TEXT = ['font-family', 'font-size', 'font-weight', 'font-variant-numeric'] as const;

function fail(property: string, expected: string): never {
  throw configurationError('CHART_EXPORT_OPTIONS', 'Invalid chart export options.', { component: 'chartExport', property: `chartExport.${property}`, expected });
}

function assertOptions(o: ChartExportOptions): void {
  if (o.title !== undefined && typeof o.title !== 'boolean') fail('title', 'boolean');
  if (o.legend !== undefined && typeof o.legend !== 'boolean') fail('legend', 'boolean');
  const background: unknown = o.background;
  if (background !== undefined && background !== 'surface' && background !== 'transparent') fail('background', '"surface" | "transparent"');
  if (o.scale !== undefined && !(typeof o.scale === 'number' && o.scale >= 1 && o.scale <= 4)) fail('scale', 'number from 1 to 4');
}

function assertChart(chart: ExportableChart): void {
  if (!(chart.element instanceof SVGSVGElement) || !chart.element.isConnected) fail('chart', 'a rendered, connected chart');
}

/** Copy of `source` with computed paint and text properties as attributes; hidden parts dropped. */
function inlineCopy(source: SVGElement, doc: Document): Element | null {
  const view = doc.defaultView;
  if (!view) return null;
  const style = view.getComputedStyle(source);
  if (style.display === 'none' || source.getAttribute('display') === 'none' || style.visibility === 'hidden') return null;
  const copy = doc.createElementNS(SVG_NS, source.localName);
  for (const attr of source.attributes) {
    // Interaction state and classes mean nothing outside the page.
    if (attr.name === 'class' || attr.name === 'tabindex' || attr.name === 'style' || attr.name === 'focusable') continue;
    copy.setAttribute(attr.name, attr.value);
  }
  for (const p of PAINT) {
    const value = style.getPropertyValue(p);
    if (value !== '' && value !== 'normal') copy.setAttribute(p, value);
  }
  if (source instanceof SVGTextElement || source instanceof SVGSVGElement || source instanceof SVGGElement) {
    for (const p of TEXT) {
      const value = style.getPropertyValue(p);
      if (value !== '') copy.setAttribute(p, value);
    }
  }
  for (const child of source.childNodes) {
    if (child instanceof SVGElement) {
      const c = inlineCopy(child, doc);
      if (c) copy.append(c);
    } else if (child.nodeType === 3) {
      copy.append(doc.createTextNode(child.textContent ?? ''));
    }
  }
  return copy;
}

function text(doc: Document, value: string, x: number, y: number, style: CSSStyleDeclaration, size: number, weight: string): SVGTextElement {
  const t = doc.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  t.setAttribute('font-family', style.fontFamily);
  t.setAttribute('font-size', `${String(size)}px`);
  t.setAttribute('font-weight', weight);
  t.setAttribute('fill', style.color);
  t.setAttribute('dominant-baseline', 'middle');
  t.textContent = value;
  return t;
}

/** Serialize the chart to a standalone SVG document string. */
export function chartToSvg(chart: ExportableChart, options: ChartExportOptions = {}): string {
  assertOptions(options);
  assertChart(chart);
  const svg = chart.element;
  const doc = svg.ownerDocument;
  const view = doc.defaultView;
  if (!view) throw runtimeError('CHART_EXPORT_UNAVAILABLE', 'Chart export needs a window.', { component: 'chartExport' });
  const hostStyle = view.getComputedStyle(chart.host);
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || Number(svg.getAttribute('width')) || 300));
  const plotHeight = Math.max(1, Math.round(rect.height || Number(svg.getAttribute('height')) || 150));
  const fontPx = Number.parseFloat(hostStyle.fontSize) || 14;
  const pad = 12;
  const root = doc.createElementNS(SVG_NS, 'svg');
  root.setAttribute('xmlns', SVG_NS);
  let y = pad;
  const children: Element[] = [];

  const titleText = chart.host.querySelector('.aui-chart__title, .aui-gauge__title')?.textContent ?? svg.getAttribute('aria-label') ?? '';
  if (titleText) {
    const title = doc.createElementNS(SVG_NS, 'title');
    title.textContent = titleText;
    children.push(title);
  }
  const describedBy = svg.getAttribute('aria-describedby')?.split(/\s+/).map((id) => doc.getElementById(id)?.textContent ?? '').join(' ').trim();
  if (describedBy) {
    const desc = doc.createElementNS(SVG_NS, 'desc');
    desc.textContent = describedBy;
    children.push(desc);
  }
  if (options.title !== false && titleText) {
    children.push(text(doc, titleText, pad, y + fontPx * 0.7, hostStyle, Math.round(fontPx * 1.15), '600'));
    y += Math.round(fontPx * 1.8);
  }
  const plot = inlineCopy(svg, doc);
  if (plot) {
    plot.setAttribute('x', String(pad));
    plot.setAttribute('y', String(y));
    plot.setAttribute('width', String(width));
    plot.setAttribute('height', String(plotHeight));
    // The live plot may use a CSS-sized box without a viewBox (sparklines have one).
    if (!plot.hasAttribute('viewBox')) plot.setAttribute('viewBox', `0 0 ${String(width)} ${String(plotHeight)}`);
    for (const a of ['role', 'aria-labelledby', 'aria-describedby', 'aria-roledescription']) plot.removeAttribute(a);
    children.push(plot);
  }
  y += plotHeight + pad;

  if (options.legend !== false) {
    const entries = [...chart.host.querySelectorAll<HTMLElement>('.aui-chart__legend:not([hidden]) .aui-chart__legend-item:not(.aui-chart__legend-item--hidden)')];
    let x = pad;
    const rowHeight = Math.round(fontPx * 1.6);
    for (const entry of entries) {
      const label = entry.querySelector('.aui-chart__legend-label')?.textContent ?? '';
      const swatch = entry.querySelector<SVGSVGElement>('svg.aui-chart__swatch');
      const itemWidth = 30 + label.length * fontPx * 0.6 + 16;
      if (x + itemWidth > width + pad && x > pad) {
        x = pad;
        y += rowHeight;
      }
      const key = swatch ? inlineCopy(swatch, doc) : null;
      if (key) {
        key.setAttribute('x', String(x));
        key.setAttribute('y', String(y));
        key.setAttribute('width', '24');
        key.setAttribute('height', '16');
        children.push(key);
      }
      children.push(text(doc, label, x + 30, y + 8, hostStyle, fontPx, '400'));
      x += itemWidth;
    }
    if (entries.length) y += rowHeight;
  }

  const height = Math.round(y);
  const totalWidth = width + pad * 2;
  root.setAttribute('width', String(totalWidth));
  root.setAttribute('height', String(height));
  root.setAttribute('viewBox', `0 0 ${String(totalWidth)} ${String(height)}`);
  if (options.background !== 'transparent') {
    const bg = doc.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', hostStyle.getPropertyValue('--aui-color-surface').trim() || '#ffffff');
    root.append(bg);
  }
  // Pattern definitions live in the plot's <defs>, so url(#id) references stay valid.
  root.append(...children);
  return new XMLSerializer().serializeToString(root);
}

/** Rasterize the chart to a PNG Blob (needs `img-src blob:` under a CSP). */
export async function chartToPng(chart: ExportableChart, options: ChartExportOptions = {}): Promise<Blob> {
  const markup = chartToSvg(chart, options);
  return svgToPng(markup, chart.element.ownerDocument, options.scale ?? 2, EXPORT_CONTEXT);
}

/** Export and save the chart as a file (`<a download>`). */
export async function downloadChart(chart: ExportableChart, options: ChartDownloadOptions): Promise<void> {
  const format: unknown = options.format;
  if (format !== 'svg' && format !== 'png') fail('format', '"svg" | "png"');
  if (typeof options.fileName !== 'string' || options.fileName.trim() === '' || /[\\/]/.test(options.fileName)) fail('fileName', 'non-empty file name without path separators');
  const blob = options.format === 'svg' ? new Blob([chartToSvg(chart, options)], { type: 'image/svg+xml' }) : await chartToPng(chart, options);
  const name = options.fileName.toLowerCase().endsWith(`.${options.format}`) ? options.fileName : `${options.fileName}.${options.format}`;
  saveBlob(blob, name, chart.element.ownerDocument);
}
