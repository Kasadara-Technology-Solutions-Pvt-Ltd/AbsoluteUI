/**
 * Organization chart export: the visible (expanded) chart as a standalone SVG
 * document, or rasterized to PNG. Cards are redrawn as rectangles with the node's
 * label and title (custom `renderNode` content is not exported); colors, fonts,
 * and radii are read from the rendered cards and connectors, so the file matches
 * the active theme without a stylesheet or style attributes. A separate subpath:
 * charts that never export do not ship it. PNG needs `img-src blob:` under a CSP.
 */
import { configurationError, runtimeError } from '@absoluteui/core';
import type { OrgChart } from '../org-chart/org-chart.js';
import { saveBlob, svgToPng, type ExportErrorContext } from '../internal/export.js';

export type OrgChartExportFormat = 'svg' | 'png';

export interface OrgChartExportOptions {
  /** Include the chart label above the tree. Default true. */
  title?: boolean;
  /** `surface` (default): the theme surface color; `transparent`: no background. */
  background?: 'surface' | 'transparent';
  /** PNG device-pixel ratio, 1-4. Default 2. */
  scale?: number;
}

export interface OrgChartDownloadOptions extends OrgChartExportOptions {
  format: OrgChartExportFormat;
  /** File name without directories; the extension is added when missing. */
  fileName: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const CONTEXT: ExportErrorContext = { component: 'orgChartExport', code: 'ORG_CHART_EXPORT', subject: 'organization chart' };

function fail(property: string, expected: string): never {
  throw configurationError('ORG_CHART_EXPORT_OPTIONS', 'Invalid organization chart export options.', { component: 'orgChartExport', property: `orgChartExport.${property}`, expected });
}

function assertOptions(o: OrgChartExportOptions): void {
  if (o.title !== undefined && typeof o.title !== 'boolean') fail('title', 'boolean');
  const background: unknown = o.background;
  if (background !== undefined && background !== 'surface' && background !== 'transparent') fail('background', '"surface" | "transparent"');
  if (o.scale !== undefined && !(typeof o.scale === 'number' && o.scale >= 1 && o.scale <= 4)) fail('scale', 'number from 1 to 4');
}

function el(doc: Document, name: string, attrs: Readonly<Record<string, string>>): SVGElement {
  const e = doc.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** Text shortened with an ellipsis to about `max` CSS px (average glyph width estimate). */
function fit(value: string, max: number, fontPx: number): string {
  const chars = Math.max(1, Math.floor(max / (fontPx * 0.56)));
  return value.length <= chars ? value : `${value.slice(0, Math.max(1, chars - 1)).trimEnd()}...`;
}

/** Serialize the visible organization chart to a standalone SVG document string. */
export function orgChartToSvg(chart: OrgChart, options: OrgChartExportOptions = {}): string {
  assertOptions(options);
  if (!chart.host.isConnected) fail('chart', 'a rendered, connected organization chart');
  const doc = chart.host.ownerDocument;
  const view = doc.defaultView;
  if (!view) throw runtimeError('ORG_CHART_EXPORT_UNAVAILABLE', 'Organization chart export needs a window.', { component: 'orgChartExport' });
  const { layout, nodes, sample, highlighted } = chart.geometry;
  const hostStyle = view.getComputedStyle(chart.host);
  const card = sample ? view.getComputedStyle(sample) : hostStyle;
  const linkEl = chart.host.querySelector('.aui-org-chart__link');
  const link = linkEl ? view.getComputedStyle(linkEl) : hostStyle;
  const fontPx = Number.parseFloat(hostStyle.fontSize) || 14;
  const pad = 16;
  const label = chart.element.getAttribute('aria-label') ?? '';
  const titleHeight = options.title !== false && label ? Math.round(fontPx * 2) : 0;
  const width = Math.ceil(layout.width + pad * 2);
  const height = Math.ceil(layout.height + pad * 2 + titleHeight);
  const root = el(doc, 'svg', { xmlns: SVG_NS, width: String(width), height: String(height), viewBox: `0 0 ${String(width)} ${String(height)}` });
  if (label) {
    const t = el(doc, 'title', {});
    t.textContent = label;
    root.append(t);
  }
  if (options.background !== 'transparent') root.append(el(doc, 'rect', { width: '100%', height: '100%', fill: hostStyle.getPropertyValue('--aui-color-surface').trim() || '#ffffff' }));
  const font = hostStyle.fontFamily;
  if (titleHeight > 0) {
    const t = el(doc, 'text', { x: String(pad), y: String(pad + fontPx * 0.8), 'font-family': font, 'font-size': `${String(Math.round(fontPx * 1.15))}px`, 'font-weight': '600', fill: hostStyle.color, 'dominant-baseline': 'middle' });
    t.textContent = label;
    root.append(t);
  }
  const g = el(doc, 'g', { transform: `translate(${String(pad)} ${String(pad + titleHeight)})` });
  const accent = hostStyle.getPropertyValue('--aui-color-focus-ring').trim() || link.stroke;
  for (const e of layout.edges) {
    const on = highlighted.has(e.from) && highlighted.has(e.to);
    g.append(el(doc, 'path', { d: e.path, fill: 'none', stroke: on ? accent : link.stroke, 'stroke-width': on ? String((Number.parseFloat(link.strokeWidth) || 1) * 2) : link.strokeWidth || '1' }));
  }
  const radius = String(Number.parseFloat(card.borderTopLeftRadius) || 0);
  const fill = card.backgroundColor && card.backgroundColor !== 'rgba(0, 0, 0, 0)' ? card.backgroundColor : hostStyle.getPropertyValue('--aui-color-surface').trim() || '#ffffff';
  const stroke = card.borderTopColor || hostStyle.color;
  const muted = hostStyle.getPropertyValue('--aui-color-text-muted').trim() || card.color;
  for (const box of layout.boxes.values()) {
    const node = nodes.get(box.id);
    if (!node) continue;
    const on = highlighted.has(box.id);
    g.append(el(doc, 'rect', { x: String(box.x), y: String(box.y), width: String(box.width), height: String(box.height), rx: radius, fill, stroke: on ? accent : stroke, 'stroke-width': on ? '2' : card.borderTopWidth || '1' }));
    const inner = box.width - 16;
    const lines: [string, string, string][] = [[node.label, '600', card.color]];
    if (node.title) lines.push([node.title, '400', muted]);
    const lineHeight = fontPx * 1.35;
    const top = box.y + box.height / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach(([value, weight, color], i) => {
      const t = el(doc, 'text', { x: String(box.x + box.width / 2), y: String(Math.round((top + i * lineHeight) * 10) / 10), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-family': font, 'font-size': `${String(i === 0 ? fontPx : Math.round(fontPx * 0.86))}px`, 'font-weight': weight, fill: color });
      t.textContent = fit(value, inner, fontPx);
      g.append(t);
    });
  }
  root.append(g);
  return new XMLSerializer().serializeToString(root);
}

/** Rasterize the visible organization chart to a PNG Blob (needs `img-src blob:` under a CSP). */
export async function orgChartToPng(chart: OrgChart, options: OrgChartExportOptions = {}): Promise<Blob> {
  const markup = orgChartToSvg(chart, options);
  return svgToPng(markup, chart.host.ownerDocument, options.scale ?? 2, CONTEXT);
}

/** Export and save the organization chart as a file (`<a download>`). */
export async function downloadOrgChart(chart: OrgChart, options: OrgChartDownloadOptions): Promise<void> {
  const format: unknown = options.format;
  if (format !== 'svg' && format !== 'png') fail('format', '"svg" | "png"');
  if (typeof options.fileName !== 'string' || options.fileName.trim() === '' || /[\\/]/.test(options.fileName)) fail('fileName', 'non-empty file name without path separators');
  const blob = options.format === 'svg' ? new Blob([orgChartToSvg(chart, options)], { type: 'image/svg+xml' }) : await orgChartToPng(chart, options);
  const name = options.fileName.toLowerCase().endsWith(`.${options.format}`) ? options.fileName : `${options.fileName}.${options.format}`;
  saveBlob(blob, name, chart.host.ownerDocument);
}
