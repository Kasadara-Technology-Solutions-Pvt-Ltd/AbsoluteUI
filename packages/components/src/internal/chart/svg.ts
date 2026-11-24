/**
 * SVG construction helpers for charts. Elements are created with createElementNS
 * and text is always set with textContent (SPEC section 14.5, section 14.6.1): no markup
 * strings, no style attributes. Colors come from CSS classes.
 */
export const SVG_NS = 'http://www.w3.org/2000/svg';

export type SvgAttributes = Readonly<Record<string, string | number>>;

export function svgElement<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K, attributes: SvgAttributes = {}, className?: string): SVGElementTagNameMap[K] {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, typeof value === 'number' ? fmt(value) : value);
  if (className) el.setAttribute('class', className);
  return el;
}

/** Compact, finite coordinate text (2 decimals) for SVG attributes and path data. */
export function fmt(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 100) / 100);
}

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'triangle-down' | 'cross' | 'star' | 'bar';

/** One marker shape per series slot, so series are distinguishable without color (WCAG 1.4.1). */
export const MARKER_SHAPES: readonly MarkerShape[] = ['circle', 'square', 'triangle', 'diamond', 'triangle-down', 'cross', 'star', 'bar'];

/** Path data for a marker of radius `r` centered on (x, y). */
export function markerPath(shape: MarkerShape, x: number, y: number, r: number): string {
  const p = (dx: number, dy: number): string => `${fmt(x + dx)} ${fmt(y + dy)}`;
  switch (shape) {
    case 'square':
      return `M${p(-r * 0.85, -r * 0.85)}H${fmt(x + r * 0.85)}V${fmt(y + r * 0.85)}H${fmt(x - r * 0.85)}Z`;
    case 'triangle':
      return `M${p(0, -r * 1.1)}L${p(r, r * 0.8)}L${p(-r, r * 0.8)}Z`;
    case 'triangle-down':
      return `M${p(0, r * 1.1)}L${p(r, -r * 0.8)}L${p(-r, -r * 0.8)}Z`;
    case 'diamond':
      return `M${p(0, -r * 1.15)}L${p(r * 1.15, 0)}L${p(0, r * 1.15)}L${p(-r * 1.15, 0)}Z`;
    case 'cross': {
      const a = r * 0.4;
      return `M${p(-a, -r)}H${fmt(x + a)}V${fmt(y - a)}H${fmt(x + r)}V${fmt(y + a)}H${fmt(x + a)}V${fmt(y + r)}H${fmt(x - a)}V${fmt(y + a)}H${fmt(x - r)}V${fmt(y - a)}H${fmt(x - a)}Z`;
    }
    case 'star': {
      let d = '';
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? r * 1.2 : r * 0.5;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        d += `${i === 0 ? 'M' : 'L'}${p(Math.cos(angle) * radius, Math.sin(angle) * radius)}`;
      }
      return `${d}Z`;
    }
    case 'bar':
      return `M${p(-r * 1.1, -r * 0.45)}H${fmt(x + r * 1.1)}V${fmt(y + r * 0.45)}H${fmt(x - r * 1.1)}Z`;
    default:
      return `M${p(-r, 0)}A${fmt(r)} ${fmt(r)} 0 1 0 ${p(r, 0)}A${fmt(r)} ${fmt(r)} 0 1 0 ${p(-r, 0)}Z`;
  }
}

/** Pattern slots (index 0 is solid): texture fills that separate series without color. */
export const PATTERN_COUNT = 8;

/** Path data for one tile (8 x 8 user units) of pattern `slot` (1-7). */
export function patternTile(slot: number): string {
  switch (slot % PATTERN_COUNT) {
    case 1:
      return 'M-2 2L2 -2M0 8L8 0M6 10L10 6';
    case 2:
      return 'M2 2h1.5v1.5h-1.5zM6 6h1.5v1.5h-1.5z';
    case 3:
      return 'M0 2H8M0 6H8';
    case 4:
      return 'M0 0L8 8M8 0L0 8';
    case 5:
      return 'M2 0V8M6 0V8';
    case 6:
      return 'M-2 6L2 10M0 0L8 8M6 -2L10 2';
    case 7:
      return 'M0 4H8M4 0V8';
    default:
      return '';
  }
}

/** An axis-aligned box in SVG user units. */
export interface ChartBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Corner radii of a box (top-left, top-right, bottom-right, bottom-left), in physical (not logical) corners. */
export interface CornerRadii {
  readonly tl: number;
  readonly tr: number;
  readonly br: number;
  readonly bl: number;
}

export type BoxSide = 'top' | 'right' | 'bottom' | 'left';

/**
 * A corner radius clamped to [0, min(width, height) / 2] (R20-22), so rounding never
 * exceeds half the element's width or height and tiny marks stay valid shapes.
 */
export function clampRadius(radius: number, width: number, height: number): number {
  if (!Number.isFinite(radius) || radius <= 0) return 0;
  const limit = Math.min(Math.abs(width), Math.abs(height)) / 2;
  return Number.isFinite(limit) && limit > 0 ? Math.min(radius, limit) : 0;
}

/** Radii that round only the corners touching `sides` (all four corners when `sides` is omitted). */
export function sideRadii(radius: number, sides?: readonly BoxSide[]): CornerRadii {
  if (!sides) return { tl: radius, tr: radius, br: radius, bl: radius };
  const has = (side: BoxSide): boolean => sides.includes(side);
  return {
    tl: has('top') || has('left') ? radius : 0,
    tr: has('top') || has('right') ? radius : 0,
    br: has('bottom') || has('right') ? radius : 0,
    bl: has('bottom') || has('left') ? radius : 0,
  };
}

/**
 * The value end of a bar drawn from pixel `from` (the baseline or the stack base) to
 * pixel `to` (the value): the side the bar grows toward. Works for negative values,
 * horizontal bars, and reversed (RTL) axes because it compares pixel positions.
 */
export function valueEnd(from: number, to: number, horizontal: boolean): BoxSide {
  if (horizontal) return to >= from ? 'right' : 'left';
  return to <= from ? 'top' : 'bottom';
}

/** Path data of a box with per-corner radii (each clamped to half the width and height). */
export function roundedRectPath(box: ChartBox, radii: CornerRadii): string {
  const { x, y } = box;
  const w = Math.max(0, box.width);
  const h = Math.max(0, box.height);
  const c = (r: number): number => clampRadius(r, w, h);
  const tl = c(radii.tl);
  const tr = c(radii.tr);
  const br = c(radii.br);
  const bl = c(radii.bl);
  const arc = (r: number, ex: number, ey: number): string => (r > 0 ? `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(ex)} ${fmt(ey)}` : '');
  return (
    `M${fmt(x + tl)} ${fmt(y)}H${fmt(x + w - tr)}${arc(tr, x + w, y + tr)}` +
    `V${fmt(y + h - br)}${arc(br, x + w - br, y + h)}` +
    `H${fmt(x + bl)}${arc(bl, x, y + h - bl)}` +
    `V${fmt(y + tl)}${arc(tl, x + tl, y)}Z`
  );
}

/**
 * A box mark with rounded corners (R20-22). No rounding: a plain `<rect>` (unchanged
 * markup). Equal corners: a `<rect>` with clamped `rx`/`ry` geometry attributes. Mixed
 * corners (a bar rounded only at its value end): a `<path>` with the same class. Corner
 * rounding is written as SVG geometry, never the CSS `rx` property, so it renders in
 * every supported browser and survives SVG/PNG export.
 */
export function roundedBox(doc: Document, box: ChartBox, radii: CornerRadii | number, className: string, attributes: SvgAttributes = {}): SVGRectElement | SVGPathElement {
  const w = Math.max(0, box.width);
  const h = Math.max(0, box.height);
  const r = typeof radii === 'number' ? sideRadii(radii) : radii;
  const tl = clampRadius(r.tl, w, h);
  const tr = clampRadius(r.tr, w, h);
  const br = clampRadius(r.br, w, h);
  const bl = clampRadius(r.bl, w, h);
  if (tl === tr && tr === br && br === bl) return roundedRect(doc, box, tl, className, attributes);
  return svgElement(doc, 'path', { d: roundedRectPath(box, { tl, tr, br, bl }), ...attributes }, className);
}

/** A `<rect>` with all four corners rounded by `radius`, clamped to half its width and height (no `rx` when 0). */
export function roundedRect(doc: Document, box: ChartBox, radius: number, className: string, attributes: SvgAttributes = {}): SVGRectElement {
  const r = clampRadius(radius, box.width, box.height);
  const geometry = { x: box.x, y: box.y, width: box.width, height: box.height };
  return svgElement(doc, 'rect', r > 0 ? { ...geometry, rx: r, ry: r, ...attributes } : { ...geometry, ...attributes }, className);
}

/**
 * Path data of an annular sector (a pie or donut slice, a gauge arc) between angles
 * `start` and `end` (radians, 0 = up, clockwise), with `corner` rounding on its four
 * corners like common chart libraries' arc corner radius (R20-22). `inner` 0 draws a pie
 * slice whose inner vertex (the center) stays sharp. The corner radius is clamped to half
 * the ring thickness and to what the sweep can hold, so thin slices stay valid.
 * `corner` 0 returns the plain sector path.
 */
export function sectorPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number, corner = 0): string {
  const point = (angle: number, radius: number): string => `${fmt(cx + Math.sin(angle) * radius)} ${fmt(cy - Math.cos(angle) * radius)}`;
  const sweep = end - start;
  const large = (a: number): string => (a > Math.PI ? '1' : '0');
  let rc = Number.isFinite(corner) && corner > 0 ? corner : 0;
  if (rc > 0) {
    const half = Math.sin(Math.min(sweep, Math.PI) / 2);
    rc = Math.min(rc, (outer - inner) / 2, (outer * half) / (1 + half));
    if (inner > 0 && half < 1) rc = Math.min(rc, (inner * half) / (1 - half));
    if (!(rc > 0.01)) rc = 0;
  }
  if (rc === 0) {
    let d = `M${point(start, outer)}A${fmt(outer)} ${fmt(outer)} 0 ${large(sweep)} 1 ${point(end, outer)}`;
    d += inner > 0 ? `L${point(end, inner)}A${fmt(inner)} ${fmt(inner)} 0 ${large(sweep)} 0 ${point(start, inner)}Z` : `L${fmt(cx)} ${fmt(cy)}Z`;
    return d;
  }
  const c = fmt(rc);
  // Outer corners: the corner circle (radius rc) touches the outer arc and the radial edge.
  const dOuter = Math.asin(rc / (outer - rc));
  const edgeOuter = (outer - rc) * Math.cos(dOuter);
  let d = `M${point(start, edgeOuter)}A${c} ${c} 0 0 1 ${point(start + dOuter, outer)}`;
  d += `A${fmt(outer)} ${fmt(outer)} 0 ${large(sweep - 2 * dOuter)} 1 ${point(end - dOuter, outer)}`;
  d += `A${c} ${c} 0 0 1 ${point(end, edgeOuter)}`;
  if (inner > 0) {
    const dInner = Math.asin(rc / (inner + rc));
    const edgeInner = (inner + rc) * Math.cos(dInner);
    d += `L${point(end, edgeInner)}A${c} ${c} 0 0 1 ${point(end - dInner, inner)}`;
    d += `A${fmt(inner)} ${fmt(inner)} 0 ${large(sweep - 2 * dInner)} 0 ${point(start + dInner, inner)}`;
    d += `A${c} ${c} 0 0 1 ${point(start, edgeInner)}Z`;
  } else {
    d += `L${fmt(cx)} ${fmt(cy)}Z`;
  }
  return d;
}
