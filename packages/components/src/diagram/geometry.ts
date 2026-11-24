/**
 * Diagram geometry (pure): shape outlines, port and boundary anchors, edge routes
 * (straight, orthogonal, curved), arrowheads, label points, and text wrapping.
 * Shared by the component and the SVG export so both draw the same picture.
 */

export type DiagramShape = 'rectangle' | 'rounded' | 'ellipse' | 'diamond' | 'parallelogram' | 'cylinder' | 'document' | 'custom';
export type DiagramPortSide = 'top' | 'right' | 'bottom' | 'left';
export type DiagramRouting = 'straight' | 'orthogonal' | 'curved';
export type DiagramArrow = 'none' | 'arrow' | 'triangle' | 'diamond' | 'circle';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PortSpec {
  readonly id: string;
  readonly side: DiagramPortSide;
  /** 0..1 along the side (left to right, top to bottom). */
  readonly offset: number;
}

export interface Anchor {
  readonly point: Point;
  /** Unit vector pointing out of the node. */
  readonly dir: Point;
}

export interface Route {
  /** SVG path data of the line (already shortened for the arrowheads). */
  readonly d: string;
  /** The route as a polyline (curves sampled), from source to target, not shortened. */
  readonly points: readonly Point[];
  /** Label position (half way along the route). */
  readonly mid: Point;
  readonly start: Anchor;
  readonly end: Anchor;
}

export const SHAPES: readonly DiagramShape[] = ['rectangle', 'rounded', 'ellipse', 'diamond', 'parallelogram', 'cylinder', 'document', 'custom'];
export const SIDES: readonly DiagramPortSide[] = ['top', 'right', 'bottom', 'left'];
export const ROUTINGS: readonly DiagramRouting[] = ['straight', 'orthogonal', 'curved'];
export const ARROWS: readonly DiagramArrow[] = ['none', 'arrow', 'triangle', 'diamond', 'circle'];
export const DEFAULT_PORTS: readonly PortSpec[] = SIDES.map((side) => ({ id: side, side, offset: 0.5 }));

const ARROW_SIZE = 10;
const STUB = 20;

const r1 = (v: number): string => String(Math.round(v * 10) / 10);

/** Path data of a shape outline in local coordinates (0,0)..(w,h). */
export function shapePath(shape: DiagramShape, w: number, h: number): string {
  switch (shape) {
    case 'rounded': {
      const r = Math.min(12, h / 4, w / 4);
      return `M${r1(r)} 0H${r1(w - r)}A${r1(r)} ${r1(r)} 0 0 1 ${r1(w)} ${r1(r)}V${r1(h - r)}A${r1(r)} ${r1(r)} 0 0 1 ${r1(w - r)} ${r1(h)}H${r1(r)}A${r1(r)} ${r1(r)} 0 0 1 0 ${r1(h - r)}V${r1(r)}A${r1(r)} ${r1(r)} 0 0 1 ${r1(r)} 0Z`;
    }
    case 'ellipse':
      return `M0 ${r1(h / 2)}A${r1(w / 2)} ${r1(h / 2)} 0 1 1 ${r1(w)} ${r1(h / 2)}A${r1(w / 2)} ${r1(h / 2)} 0 1 1 0 ${r1(h / 2)}Z`;
    case 'diamond':
      return `M${r1(w / 2)} 0L${r1(w)} ${r1(h / 2)}L${r1(w / 2)} ${r1(h)}L0 ${r1(h / 2)}Z`;
    case 'parallelogram': {
      const s = Math.min(w * 0.2, h * 0.5);
      return `M${r1(s)} 0H${r1(w)}L${r1(w - s)} ${r1(h)}H0Z`;
    }
    case 'cylinder': {
      const ry = Math.min(h * 0.15, 12);
      const rx = w / 2;
      return `M0 ${r1(ry)}A${r1(rx)} ${r1(ry)} 0 0 1 ${r1(w)} ${r1(ry)}V${r1(h - ry)}A${r1(rx)} ${r1(ry)} 0 0 1 0 ${r1(h - ry)}Z`;
    }
    case 'document': {
      const a = Math.min(h * 0.1, 8);
      return `M0 0H${r1(w)}V${r1(h - a)}Q${r1(w * 0.75)} ${r1(h - 3 * a)} ${r1(w * 0.5)} ${r1(h - a)}T0 ${r1(h - a)}Z`;
    }
    default:
      return `M0 0H${r1(w)}V${r1(h)}H0Z`;
  }
}

/** Extra decoration drawn on top of the outline (the cylinder's front rim), or ''. */
export function shapeDetail(shape: DiagramShape, w: number, h: number): string {
  if (shape !== 'cylinder') return '';
  const ry = Math.min(h * 0.15, 12);
  return `M0 ${r1(ry)}A${r1(w / 2)} ${r1(ry)} 0 0 0 ${r1(w)} ${r1(ry)}`;
}

/** The area inside a shape that holds the label (local coordinates). */
export function labelBox(shape: DiagramShape, w: number, h: number): Box {
  const pad = 8;
  switch (shape) {
    case 'diamond':
      return { x: w / 4, y: h / 4, width: w / 2, height: h / 2 };
    case 'ellipse':
      return { x: w * 0.15, y: h * 0.15, width: w * 0.7, height: h * 0.7 };
    case 'parallelogram': {
      const s = Math.min(w * 0.2, h * 0.5);
      return { x: s, y: pad / 2, width: Math.max(0, w - 2 * s), height: h - pad };
    }
    case 'cylinder': {
      const ry = Math.min(h * 0.15, 12);
      return { x: pad, y: ry * 2, width: w - 2 * pad, height: Math.max(0, h - ry * 3) };
    }
    case 'document': {
      const a = Math.min(h * 0.1, 8);
      return { x: pad, y: pad / 2, width: w - 2 * pad, height: Math.max(0, h - pad - 2 * a) };
    }
    default:
      return { x: pad, y: pad / 2, width: Math.max(0, w - 2 * pad), height: Math.max(0, h - pad) };
  }
}

const SIDE_DIR: Readonly<Record<DiagramPortSide, Point>> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

/**
 * A port's point in diagram coordinates. On diamonds and ellipses a port away from the
 * middle of a side is moved inward onto the outline (the corners of the box are empty).
 */
export function portPoint(box: Box, port: PortSpec, shape: DiagramShape = 'rectangle'): Point {
  const t = Math.max(0, Math.min(1, port.offset));
  const inset = (u: number, half: number): number => {
    // u: distance from the side's middle as a fraction (-1..1) of the half side.
    const a = Math.min(1, Math.abs(u));
    if (shape === 'diamond') return half * a;
    if (shape === 'ellipse') return half * (1 - Math.sqrt(1 - a * a));
    return 0;
  };
  const hw = box.width / 2;
  const hh = box.height / 2;
  switch (port.side) {
    case 'top':
      return { x: box.x + box.width * t, y: box.y + inset((t - 0.5) * 2, hh) };
    case 'bottom':
      return { x: box.x + box.width * t, y: box.y + box.height - inset((t - 0.5) * 2, hh) };
    case 'left':
      return { x: box.x + inset((t - 0.5) * 2, hw), y: box.y + box.height * t };
    case 'right':
      return { x: box.x + box.width - inset((t - 0.5) * 2, hw), y: box.y + box.height * t };
  }
}

export function portAnchor(box: Box, port: PortSpec, shape: DiagramShape = 'rectangle'): Anchor {
  return { point: portPoint(box, port, shape), dir: SIDE_DIR[port.side] };
}

const center = (b: Box): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Where the line from the center toward `toward` leaves the shape. */
export function boundaryAnchor(box: Box, shape: DiagramShape, toward: Point): Anchor {
  const c = center(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { point: { x: c.x, y: box.y }, dir: { x: 0, y: -1 } };
  const ux = dx / len;
  const uy = dy / len;
  const hw = box.width / 2;
  const hh = box.height / 2;
  let t: number;
  if (shape === 'ellipse') t = 1 / Math.sqrt((ux * ux) / (hw * hw) + (uy * uy) / (hh * hh));
  else if (shape === 'diamond') t = 1 / (Math.abs(ux) / hw + Math.abs(uy) / hh);
  else t = Math.min(Math.abs(ux) > 1e-9 ? hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? hh / Math.abs(uy) : Infinity);
  return { point: { x: c.x + ux * t, y: c.y + uy * t }, dir: { x: ux, y: uy } };
}

/** The side facing another box (by the dominant axis, scaled by the box's aspect). */
export function facingSide(box: Box, other: Box): DiagramPortSide {
  const a = center(box);
  const b = center(other);
  const dx = (b.x - a.x) / Math.max(1, box.width + other.width);
  const dy = (b.y - a.y) / Math.max(1, box.height + other.height);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'bottom' : 'top';
}

export interface RouteEnd {
  readonly box: Box;
  readonly shape: DiagramShape;
  /** The port, when the edge names one (or the routing picks a side). */
  readonly port: PortSpec | null;
}

function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    const prev = out[out.length - 2];
    if (last && prev && ((Math.abs(prev.x - last.x) < 0.01 && Math.abs(last.x - p.x) < 0.01) || (Math.abs(prev.y - last.y) < 0.01 && Math.abs(last.y - p.y) < 0.01))) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

function orthogonalPoints(a: Anchor, b: Anchor): Point[] {
  const a1 = { x: a.point.x + a.dir.x * STUB, y: a.point.y + a.dir.y * STUB };
  const b1 = { x: b.point.x + b.dir.x * STUB, y: b.point.y + b.dir.y * STUB };
  const aH = Math.abs(a.dir.x) > Math.abs(a.dir.y);
  const bH = Math.abs(b.dir.x) > Math.abs(b.dir.y);
  const mid: Point[] = [];
  if (aH && bH) {
    const mx = (a1.x + b1.x) / 2;
    mid.push({ x: mx, y: a1.y }, { x: mx, y: b1.y });
  } else if (!aH && !bH) {
    const my = (a1.y + b1.y) / 2;
    mid.push({ x: a1.x, y: my }, { x: b1.x, y: my });
  } else if (aH) mid.push({ x: b1.x, y: a1.y });
  else mid.push({ x: a1.x, y: b1.y });
  return simplify([a.point, a1, ...mid, b1, b.point]);
}

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Point half way along a polyline (by length). */
export function midpoint(points: readonly Point[]): Point {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const q = points[i];
    if (p && q) total += Math.hypot(q.x - p.x, q.y - p.y);
  }
  let left = total / 2;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const q = points[i];
    if (!p || !q) continue;
    const seg = Math.hypot(q.x - p.x, q.y - p.y);
    if (seg >= left && seg > 0) return { x: p.x + ((q.x - p.x) * left) / seg, y: p.y + ((q.y - p.y) * left) / seg };
    left -= seg;
  }
  return points[0] ?? { x: 0, y: 0 };
}

/** Polyline shortened by `start` and `end` CSS px at its ends (for hit areas). */
export function trimPolyline(points: readonly Point[], start: number, end: number): Point[] {
  const cut = (list: Point[], amount: number): Point[] => {
    const out = [...list];
    let left = amount;
    while (out.length > 1 && left > 0) {
      const p = out[0];
      const q = out[1];
      if (!p || !q) break;
      const seg = Math.hypot(q.x - p.x, q.y - p.y);
      if (seg > left) {
        out[0] = { x: p.x + ((q.x - p.x) * left) / seg, y: p.y + ((q.y - p.y) * left) / seg };
        break;
      }
      left -= seg;
      out.shift();
    }
    return out;
  };
  return cut(cut([...points], start).reverse(), end).reverse();
}

export const polylineD = (points: readonly Point[]): string => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${r1(p.x)} ${r1(p.y)}`).join('');

function shorten(p: Point, toward: Point, by: number): Point {
  const dx = toward.x - p.x;
  const dy = toward.y - p.y;
  const len = Math.hypot(dx, dy);
  if (len <= by || len === 0) return p;
  return { x: p.x + (dx / len) * by, y: p.y + (dy / len) * by };
}

const arrowInset = (arrow: DiagramArrow): number => (arrow === 'none' ? 0 : arrow === 'circle' ? ARROW_SIZE * 0.7 : arrow === 'diamond' ? ARROW_SIZE * 1.4 : ARROW_SIZE * 0.9);

/** Route an edge between two node ends. */
export function routeEdge(from: RouteEnd, to: RouteEnd, routing: DiagramRouting, arrows: { start: DiagramArrow; end: DiagramArrow }): Route {
  const toCenter = center(to.box);
  const fromCenter = center(from.box);
  let start: Anchor;
  let end: Anchor;
  if (routing === 'straight') {
    start = from.port ? portAnchor(from.box, from.port, from.shape) : boundaryAnchor(from.box, from.shape, to.port ? portPoint(to.box, to.port, to.shape) : toCenter);
    end = to.port ? portAnchor(to.box, to.port, to.shape) : boundaryAnchor(to.box, to.shape, from.port ? portPoint(from.box, from.port, from.shape) : fromCenter);
  } else {
    start = portAnchor(from.box, from.port ?? { id: '', side: facingSide(from.box, to.box), offset: 0.5 }, from.shape);
    end = portAnchor(to.box, to.port ?? { id: '', side: facingSide(to.box, from.box), offset: 0.5 }, to.shape);
  }
  let points: Point[];
  let d: string;
  const sIn = arrowInset(arrows.start);
  const eIn = arrowInset(arrows.end);
  if (routing === 'curved') {
    const dist = Math.hypot(end.point.x - start.point.x, end.point.y - start.point.y);
    const k = Math.max(30, dist / 3);
    const c1 = { x: start.point.x + start.dir.x * k, y: start.point.y + start.dir.y * k };
    const c2 = { x: end.point.x + end.dir.x * k, y: end.point.y + end.dir.y * k };
    points = Array.from({ length: 17 }, (_, i) => cubic(start.point, c1, c2, end.point, i / 16));
    const s = shorten(start.point, c1, sIn);
    const e = shorten(end.point, c2, eIn);
    d = `M${r1(s.x)} ${r1(s.y)}C${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(e.x)} ${r1(e.y)}`;
  } else {
    points = routing === 'orthogonal' ? orthogonalPoints(start, end) : [start.point, end.point];
    const drawn = [...points];
    const p0 = drawn[0];
    const p1 = drawn[1];
    if (p0 && p1) drawn[0] = shorten(p0, p1, sIn);
    const pn = drawn[drawn.length - 1];
    const pm = drawn[drawn.length - 2];
    if (pn && pm) drawn[drawn.length - 1] = shorten(pn, pm, eIn);
    d = polylineD(drawn);
  }
  return { d, points, mid: midpoint(points), start, end };
}

/** Arrowhead path at `tip`, pointing from `from` toward `tip`; '' for none. Closed shapes are filled, `arrow` is an open chevron. */
export function arrowPath(kind: DiagramArrow, tip: Point, from: Point): string {
  if (kind === 'none') return '';
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const s = ARROW_SIZE;
  const at = (along: number, side: number): string => `${r1(tip.x - ux * along + px * side)} ${r1(tip.y - uy * along + py * side)}`;
  switch (kind) {
    case 'arrow':
      return `M${at(s, s * 0.55)}L${at(0, 0)}L${at(s, -s * 0.55)}`;
    case 'triangle':
      return `M${at(0, 0)}L${at(s, s * 0.5)}L${at(s, -s * 0.5)}Z`;
    case 'diamond':
      return `M${at(0, 0)}L${at(s * 0.7, s * 0.4)}L${at(s * 1.4, 0)}L${at(s * 0.7, -s * 0.4)}Z`;
    case 'circle': {
      const r = s * 0.35;
      const c = { x: tip.x - ux * r, y: tip.y - uy * r };
      return `M${r1(c.x - r)} ${r1(c.y)}A${r1(r)} ${r1(r)} 0 1 0 ${r1(c.x + r)} ${r1(c.y)}A${r1(r)} ${r1(r)} 0 1 0 ${r1(c.x - r)} ${r1(c.y)}Z`;
    }
  }
}

/** The point a route's arrowhead at the end is aimed from (the previous control or vertex). */
export function approach(route: Route, atEnd: boolean): { tip: Point; from: Point } {
  const pts = route.points;
  if (atEnd) {
    const tip = pts[pts.length - 1] ?? route.end.point;
    return { tip, from: { x: tip.x + route.end.dir.x * 20, y: tip.y + route.end.dir.y * 20 } };
  }
  const tip = pts[0] ?? route.start.point;
  return { tip, from: { x: tip.x + route.start.dir.x * 20, y: tip.y + route.start.dir.y * 20 } };
}

/**
 * Wrap text into lines that fit `width` (measured by `measure`), at most `maxLines`;
 * the last line ends with an ellipsis when text is left over.
 */
export function wrapText(text: string, width: number, maxLines: number, measure: (s: string) => number): string[] {
  const words = text.trim().split(/\s+/).filter((w) => w !== '');
  const lines: string[] = [];
  let line = '';
  const fitWord = (word: string): string => {
    // A single word longer than the line is cut.
    let w = word;
    while (w.length > 1 && measure(w) > width) w = w.slice(0, -1);
    return w;
  };
  let i = 0;
  for (; i < words.length; i++) {
    const word = words[i] ?? '';
    const next = line === '' ? word : `${line} ${word}`;
    if (measure(next) <= width) {
      line = next;
      continue;
    }
    if (line === '') {
      line = fitWord(word);
      if (line !== word) {
        words[i] = word.slice(line.length);
        i--;
      }
    } else i--;
    lines.push(line);
    line = '';
    if (lines.length === maxLines) break;
  }
  if (line !== '' && lines.length < maxLines) lines.push(line);
  if (i < words.length && lines.length === maxLines && lines.length > 0) {
    let last = lines[lines.length - 1] ?? '';
    while (last.length > 0 && measure(`${last}...`) > width) last = last.slice(0, -1).trimEnd();
    lines[lines.length - 1] = `${last}...`;
  }
  return lines;
}
