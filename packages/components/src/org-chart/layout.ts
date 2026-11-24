/**
 * Organization chart layout (pure): a tidy tree. Subtrees are laid out bottom-up
 * and packed as close as their contours allow (per-depth extents), then each
 * parent is centered over its first and last child. Coordinates are in CSS px for
 * the top-down orientation; the horizontal orientation swaps the axes.
 */

export type OrgChartOrientation = 'vertical' | 'horizontal';

export interface OrgChartLayoutInput {
  readonly id: string;
  /** Visible children in display order (collapsed nodes have none). */
  readonly children: readonly OrgChartLayoutInput[];
}

export interface OrgChartLayoutOptions {
  /** Card size in CSS px. */
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  /** Space between neighboring cards of one level (breadth). */
  readonly siblingGap: number;
  /** Space between levels (depth). */
  readonly levelGap: number;
  readonly orientation: OrgChartOrientation;
  /** Mirror the breadth axis (RTL vertical) or the depth axis (RTL horizontal). */
  readonly mirror?: boolean;
}

export interface OrgChartBox {
  readonly id: string;
  /** Top-left corner (CSS px, from the layout's origin). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export interface OrgChartEdge {
  readonly from: string;
  readonly to: string;
  /** SVG path data of the elbow connector. */
  readonly path: string;
}

export interface OrgChartLayout {
  readonly boxes: ReadonlyMap<string, OrgChartBox>;
  readonly edges: readonly OrgChartEdge[];
  readonly width: number;
  readonly height: number;
}

interface Subtree {
  /** Breadth offsets of each node's center relative to the subtree root. */
  readonly offsets: Map<string, number>;
  /** Leftmost and rightmost extents per depth (relative to the root center). */
  readonly left: number[];
  readonly right: number[];
}

function layoutSubtree(node: OrgChartLayoutInput, breadth: number, gap: number): Subtree {
  const half = breadth / 2;
  if (node.children.length === 0) return { offsets: new Map([[node.id, 0]]), left: [-half], right: [half] };
  const subs = node.children.map((c) => layoutSubtree(c, breadth, gap));
  const shifts: number[] = [0];
  const first = subs[0];
  const left = first ? [...first.left] : [];
  const right = first ? [...first.right] : [];
  for (let i = 1; i < subs.length; i++) {
    const sub = subs[i];
    if (!sub) continue;
    let shift = -Infinity;
    const common = Math.min(right.length, sub.left.length);
    for (let d = 0; d < common; d++) shift = Math.max(shift, (right[d] ?? 0) - (sub.left[d] ?? 0) + gap);
    shifts.push(shift);
    for (let d = 0; d < sub.left.length; d++) {
      const l = (sub.left[d] ?? 0) + shift;
      const r = (sub.right[d] ?? 0) + shift;
      if (d < left.length) {
        left[d] = Math.min(left[d] ?? l, l);
        right[d] = Math.max(right[d] ?? r, r);
      } else {
        left.push(l);
        right.push(r);
      }
    }
  }
  // Center the parent over its first and last child.
  const mid = ((shifts[0] ?? 0) + (shifts[shifts.length - 1] ?? 0)) / 2;
  const offsets = new Map<string, number>([[node.id, 0]]);
  subs.forEach((sub, i) => {
    const s = (shifts[i] ?? 0) - mid;
    for (const [id, o] of sub.offsets) offsets.set(id, o + s);
  });
  return {
    offsets,
    left: [-half, ...left.map((v) => v - mid)],
    right: [half, ...right.map((v) => v - mid)],
  };
}

/** Lay out a forest (roots side by side). */
export function layoutOrgChart(roots: readonly OrgChartLayoutInput[], o: OrgChartLayoutOptions): OrgChartLayout {
  const vertical = o.orientation === 'vertical';
  const breadth = vertical ? o.nodeWidth : o.nodeHeight;
  const depthSize = vertical ? o.nodeHeight : o.nodeWidth;
  // A virtual super-root packs the roots like siblings.
  const forest = layoutSubtree({ id: '\u0000root', children: roots }, breadth, o.siblingGap);
  const depthOf = new Map<string, number>();
  const parentOf = new Map<string, string>();
  const walk = (n: OrgChartLayoutInput, depth: number): void => {
    depthOf.set(n.id, depth);
    for (const c of n.children) {
      parentOf.set(c.id, n.id);
      walk(c, depth + 1);
    }
  };
  for (const r of roots) walk(r, 0);
  let min = Infinity;
  let max = -Infinity;
  let maxDepth = 0;
  for (const [id, off] of forest.offsets) {
    if (!depthOf.has(id)) continue;
    min = Math.min(min, off - breadth / 2);
    max = Math.max(max, off + breadth / 2);
    maxDepth = Math.max(maxDepth, depthOf.get(id) ?? 0);
  }
  if (!Number.isFinite(min)) return { boxes: new Map(), edges: [], width: 0, height: 0 };
  const extentBreadth = max - min;
  const extentDepth = (maxDepth + 1) * depthSize + maxDepth * o.levelGap;
  const boxes = new Map<string, OrgChartBox>();
  for (const [id, off] of forest.offsets) {
    const depth = depthOf.get(id);
    if (depth === undefined) continue;
    let b = off - breadth / 2 - min;
    let d = depth * (depthSize + o.levelGap);
    if (o.mirror === true) {
      if (vertical) b = extentBreadth - breadth - b;
      else d = extentDepth - depthSize - d;
    }
    boxes.set(id, vertical ? { id, x: b, y: d, width: o.nodeWidth, height: o.nodeHeight, depth } : { id, x: d, y: b, width: o.nodeWidth, height: o.nodeHeight, depth });
  }
  const edges: OrgChartEdge[] = [];
  const r = (v: number): string => String(Math.round(v * 10) / 10);
  for (const [child, parent] of parentOf) {
    const p = boxes.get(parent);
    const c = boxes.get(child);
    if (!p || !c) continue;
    let path: string;
    if (vertical) {
      const x1 = p.x + p.width / 2;
      const y1 = p.y + p.height;
      const x2 = c.x + c.width / 2;
      const y2 = c.y;
      const ym = y1 + o.levelGap / 2;
      path = `M${r(x1)} ${r(y1)}V${r(ym)}H${r(x2)}V${r(y2)}`;
    } else {
      const forward = c.x > p.x;
      const x1 = forward ? p.x + p.width : p.x;
      const y1 = p.y + p.height / 2;
      const x2 = forward ? c.x : c.x + c.width;
      const y2 = c.y + c.height / 2;
      const xm = x1 + (forward ? 1 : -1) * (o.levelGap / 2);
      path = `M${r(x1)} ${r(y1)}H${r(xm)}V${r(y2)}H${r(x2)}`;
    }
    edges.push({ from: parent, to: child, path });
  }
  return vertical ? { boxes, edges, width: extentBreadth, height: extentDepth } : { boxes, edges, width: extentDepth, height: extentBreadth };
}
