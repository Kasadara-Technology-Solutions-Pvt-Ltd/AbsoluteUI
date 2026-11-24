/**
 * Diagram export: the whole diagram as a standalone SVG document, or rasterized
 * to PNG. Shapes, edges, arrowheads, and labels are redrawn from the same geometry
 * the component uses; colors, fonts, and stroke widths are read from the rendered
 * elements, so the file matches the active theme without a stylesheet or style
 * attributes. `custom` shapes are exported as rounded rectangles. PNG needs
 * `img-src blob:` under a CSP.
 */
import { configurationError, runtimeError } from '@absoluteui/core';
import { saveBlob, svgToPng, type ExportErrorContext } from '../internal/export.js';
import type { Diagram } from './diagram.js';
import { approach, arrowPath, shapeDetail, shapePath } from './geometry.js';

export type DiagramExportFormat = 'svg' | 'png';

export interface DiagramExportOptions {
  /** Include the diagram label above the drawing. Default true. */
  title?: boolean;
  /** `surface` (default): the theme surface color; `transparent`: no background. */
  background?: 'surface' | 'transparent';
  /** PNG device-pixel ratio, 1-4. Default 2. */
  scale?: number;
}

export interface DiagramDownloadOptions extends DiagramExportOptions {
  format: DiagramExportFormat;
  /** File name without directories; the extension is added when missing. */
  fileName: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const CONTEXT: ExportErrorContext = { component: 'diagram', code: 'DIAGRAM_EXPORT', subject: 'diagram' };

function fail(property: string, expected: string): never {
  throw configurationError('DIAGRAM_EXPORT_OPTIONS', 'Invalid diagram export options.', { component: 'diagram', property: `diagramExport.${property}`, expected });
}

function assertOptions(o: DiagramExportOptions): void {
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

const r1 = (v: number): string => String(Math.round(v * 10) / 10);
const solid = (c: string | undefined, fallback: string): string => (c && c !== 'none' && c !== 'rgba(0, 0, 0, 0)' ? c : fallback);

/** Serialize the diagram to a standalone SVG document string. */
export function diagramToSvg(diagram: Diagram, options: DiagramExportOptions = {}): string {
  assertOptions(options);
  if (!diagram.host.isConnected) fail('diagram', 'a rendered, connected diagram');
  const doc = diagram.host.ownerDocument;
  const view = doc.defaultView;
  if (!view) throw runtimeError('DIAGRAM_EXPORT_UNAVAILABLE', 'Diagram export needs a window.', { component: 'diagram' });
  const geo = diagram.geometry;
  const hostStyle = view.getComputedStyle(diagram.host);
  const read = (e: Element | null): CSSStyleDeclaration => view.getComputedStyle(e ?? diagram.host);
  const node = read(geo.samples.node);
  const label = read(geo.samples.label);
  const edge = read(geo.samples.edge);
  const edgeLabel = read(geo.samples.edgeLabel);
  const group = read(geo.samples.group);
  const surface = hostStyle.getPropertyValue('--aui-color-surface').trim() || '#ffffff';
  const text = hostStyle.color || '#000000';
  const fontPx = Number.parseFloat(label.fontSize) || Number.parseFloat(hostStyle.fontSize) || 14;
  const font = label.fontFamily || hostStyle.fontFamily;
  const pad = 16;
  const name = diagram.element.getAttribute('aria-label') ?? '';
  const heading = diagram.host.querySelector('.aui-diagram__viewport')?.getAttribute('aria-label') ?? name;
  const titleHeight = options.title !== false && heading ? Math.round(fontPx * 2) : 0;
  const { bounds } = geo;
  const width = Math.ceil(bounds.width + pad * 2);
  const height = Math.ceil(bounds.height + pad * 2 + titleHeight);
  const root = el(doc, 'svg', { xmlns: SVG_NS, width: String(width), height: String(height), viewBox: `0 0 ${String(width)} ${String(height)}` });
  if (heading) {
    const t = el(doc, 'title', {});
    t.textContent = heading;
    root.append(t);
  }
  if (options.background !== 'transparent') root.append(el(doc, 'rect', { width: '100%', height: '100%', fill: surface }));
  if (titleHeight > 0) {
    const t = el(doc, 'text', { x: String(pad), y: String(pad + fontPx * 0.8), 'font-family': font, 'font-size': `${String(Math.round(fontPx * 1.15))}px`, 'font-weight': '600', fill: text, 'dominant-baseline': 'middle' });
    t.textContent = heading;
    root.append(t);
  }
  const g = el(doc, 'g', { transform: `translate(${r1(pad - bounds.x)} ${r1(pad + titleHeight - bounds.y)})` });
  for (const { group: gr, box } of geo.groups) {
    g.append(el(doc, 'rect', { x: r1(box.x), y: r1(box.y), width: r1(box.width), height: r1(box.height), rx: '8', fill: 'none', stroke: solid(group.stroke, text), 'stroke-width': group.strokeWidth || '1', 'stroke-dasharray': '6 4' }));
    const t = el(doc, 'text', { x: r1(box.x + 10), y: r1(box.y + 16), 'font-family': font, 'font-size': `${String(Math.round(fontPx * 0.86))}px`, 'font-weight': '600', fill: text });
    t.textContent = gr.label;
    g.append(t);
  }
  const stroke = solid(edge.stroke, text);
  const strokeWidth = edge.strokeWidth || '1.5';
  for (const e of geo.edges) {
    const attrs: Record<string, string> = { d: e.route.d, fill: 'none', stroke, 'stroke-width': strokeWidth };
    if (e.edge.dashed === true) attrs['stroke-dasharray'] = '6 4';
    g.append(el(doc, 'path', attrs));
    for (const [kind, atEnd] of [[e.start, false], [e.end, true]] as const) {
      const { tip, from } = approach(e.route, atEnd);
      const d = arrowPath(kind, tip, from);
      if (d) g.append(el(doc, 'path', { d, fill: kind === 'arrow' ? 'none' : stroke, stroke, 'stroke-width': strokeWidth, 'stroke-linejoin': 'round' }));
    }
    if (e.edge.label && e.labelBox) {
      const b = e.labelBox;
      g.append(el(doc, 'rect', { x: r1(b.x), y: r1(b.y), width: r1(b.width), height: r1(b.height), rx: '4', fill: solid(edgeLabel.fill, surface) }));
      const t = el(doc, 'text', { x: r1(b.x + b.width / 2), y: r1(b.y + b.height / 2), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': font, 'font-size': `${String(fontPx)}px`, fill: text });
      t.textContent = e.edge.label;
      g.append(t);
    }
  }
  const fill = solid(node.fill, surface);
  const outline = solid(node.stroke, text);
  const outlineWidth = node.strokeWidth || '1.5';
  const labelColor = solid(label.fill, text);
  for (const n of geo.nodes) {
    const shape = n.shape === 'custom' ? 'rounded' : n.shape;
    const ng = el(doc, 'g', { transform: `translate(${r1(n.box.x)} ${r1(n.box.y)})` });
    ng.append(el(doc, 'path', { d: shapePath(shape, n.box.width, n.box.height), fill, stroke: outline, 'stroke-width': outlineWidth }));
    const detail = shapeDetail(shape, n.box.width, n.box.height);
    if (detail) ng.append(el(doc, 'path', { d: detail, fill: 'none', stroke: outline, 'stroke-width': outlineWidth }));
    const lb = n.labelBox;
    const top = lb.y + lb.height / 2 - ((n.lines.length - 1) * n.lineHeight) / 2;
    const t = el(doc, 'text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': font, 'font-size': `${String(fontPx)}px`, fill: labelColor });
    n.lines.forEach((line, i) => {
      const span = el(doc, 'tspan', { x: r1(lb.x + lb.width / 2), y: r1(top + i * n.lineHeight) });
      span.textContent = line;
      t.append(span);
    });
    ng.append(t);
    g.append(ng);
  }
  root.append(g);
  return new XMLSerializer().serializeToString(root);
}

/** Rasterize the diagram to a PNG Blob (needs `img-src blob:` under a CSP). */
export async function diagramToPng(diagram: Diagram, options: DiagramExportOptions = {}): Promise<Blob> {
  const markup = diagramToSvg(diagram, options);
  return svgToPng(markup, diagram.host.ownerDocument, options.scale ?? 2, CONTEXT);
}

/** Export and save the diagram as a file (`<a download>`). */
export async function downloadDiagram(diagram: Diagram, options: DiagramDownloadOptions): Promise<void> {
  const format: unknown = options.format;
  if (format !== 'svg' && format !== 'png') fail('format', '"svg" | "png"');
  if (typeof options.fileName !== 'string' || options.fileName.trim() === '' || /[\\/]/.test(options.fileName)) fail('fileName', 'non-empty file name without path separators');
  const blob = options.format === 'svg' ? new Blob([diagramToSvg(diagram, options)], { type: 'image/svg+xml' }) : await diagramToPng(diagram, options);
  const name = options.fileName.toLowerCase().endsWith(`.${options.format}`) ? options.fileName : `${options.fileName}.${options.format}`;
  saveBlob(blob, name, diagram.host.ownerDocument);
}
