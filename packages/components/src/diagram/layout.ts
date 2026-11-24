/**
 * Diagram auto-layout (pure, no DOM). Two algorithms, written for this library:
 *
 * - `layered` (Sugiyama style, for flowcharts): cycles are broken by reversing the
 *   back edges of a depth-first search; nodes get ranks by longest path from the
 *   sources (sources are then pulled down next to their successors); edges that
 *   span several ranks get dummy nodes; the order inside each rank is improved by
 *   barycenter sweeps, keeping the order with the fewest crossings (counted with a
 *   Fenwick tree); coordinates across the ranks are the least-squares placement
 *   nearest to the neighbors' centers under the minimum gaps (pool adjacent
 *   violators), refined over a few up and down passes.
 * - `tree`: a spanning tree from breadth-first search (first discoverer is the
 *   parent); each parent is centered over its subtree; other edges are drawn as
 *   they are.
 *
 * Node sizes may differ. Coordinates are top-left corners in CSS px from (0, 0).
 */

export type DiagramLayoutAlgorithm = 'layered' | 'tree';
/** Rank direction: top to bottom, bottom to top, left to right, right to left. */
export type DiagramLayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface DiagramLayoutNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface DiagramLayoutEdge {
  readonly from: string;
  readonly to: string;
}

export interface DiagramLayoutOptions {
  /** Default `layered`. */
  readonly algorithm?: DiagramLayoutAlgorithm;
  /** Default `TB`. */
  readonly direction?: DiagramLayoutDirection;
  /** Space between neighbors of one rank, CSS px. Default 40. */
  readonly nodeGap?: number;
  /** Space between ranks, CSS px. Default 64. */
  readonly rankGap?: number;
  /** Ordering sweeps of the layered algorithm (0..64). Default 12. */
  readonly sweeps?: number;
}

export interface DiagramLayoutPoint {
  readonly x: number;
  readonly y: number;
}

export interface DiagramLayoutResult {
  /** Top-left corner of every node. */
  readonly positions: ReadonlyMap<string, DiagramLayoutPoint>;
  /** Rank (layer, or tree depth) of every node. */
  readonly ranks: ReadonlyMap<string, number>;
  readonly width: number;
  readonly height: number;
}

interface LNode {
  readonly id: string;
  /** Size across the ranks (width for TB) and along them (height for TB). */
  readonly across: number;
  readonly along: number;
  readonly dummy: boolean;
  rank: number;
  order: number;
  pos: number;
  readonly up: number[];
  readonly down: number[];
}

const DUMMY_SIZE = 2;

/** Lay out nodes and edges. Edges to unknown nodes and self loops are ignored. */
export function layoutDiagram(nodes: readonly DiagramLayoutNode[], edges: readonly DiagramLayoutEdge[], options: DiagramLayoutOptions = {}): DiagramLayoutResult {
  const direction = options.direction ?? 'TB';
  const horizontal = direction === 'LR' || direction === 'RL';
  const nodeGap = options.nodeGap ?? 40;
  const rankGap = options.rankGap ?? 64;
  const index = new Map<string, number>();
  const list: LNode[] = [];
  for (const n of nodes) {
    if (index.has(n.id)) continue;
    index.set(n.id, list.length);
    list.push({ id: n.id, across: horizontal ? n.height : n.width, along: horizontal ? n.width : n.height, dummy: false, rank: 0, order: 0, pos: 0, up: [], down: [] });
  }
  const seen = new Set<string>();
  const pairs: [number, number][] = [];
  for (const e of edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    const key = `${String(a)}>${String(b)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([a, b]);
  }
  if (options.algorithm === 'tree') tree(list, pairs, nodeGap);
  else layered(list, pairs, nodeGap, Math.max(0, Math.min(64, options.sweeps ?? 12)));

  // Rank offsets along the rank axis (largest node of each rank).
  const rankSize: number[] = [];
  for (const n of list) rankSize[n.rank] = Math.max(rankSize[n.rank] ?? 0, n.along);
  const rankStart: number[] = [];
  let cursor = 0;
  for (let r = 0; r < rankSize.length; r++) {
    rankStart[r] = cursor;
    cursor += (rankSize[r] ?? 0) + rankGap;
  }
  const alongTotal = Math.max(0, cursor - rankGap);
  let minAcross = Infinity;
  let maxAcross = -Infinity;
  for (const n of list) {
    if (n.dummy) continue;
    minAcross = Math.min(minAcross, n.pos - n.across / 2);
    maxAcross = Math.max(maxAcross, n.pos + n.across / 2);
  }
  if (!Number.isFinite(minAcross)) {
    minAcross = 0;
    maxAcross = 0;
  }
  const acrossTotal = maxAcross - minAcross;
  const positions = new Map<string, DiagramLayoutPoint>();
  const ranks = new Map<string, number>();
  for (const n of list) {
    if (n.dummy) continue;
    const a = Math.round(n.pos - n.across / 2 - minAcross);
    // Nodes are centered within their rank band.
    let b = Math.round((rankStart[n.rank] ?? 0) + ((rankSize[n.rank] ?? 0) - n.along) / 2);
    if (direction === 'BT' || direction === 'RL') b = Math.round(alongTotal - b - n.along);
    positions.set(n.id, horizontal ? { x: b, y: a } : { x: a, y: b });
    ranks.set(n.id, n.rank);
  }
  return { positions, ranks, width: Math.round(horizontal ? alongTotal : acrossTotal), height: Math.round(horizontal ? acrossTotal : alongTotal) };
}

// ---- layered ------------------------------------------------------------------

function layered(list: LNode[], pairs: readonly [number, number][], gap: number, sweeps: number): void {
  const n = list.length;
  if (n === 0) return;
  const out: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of pairs) out[a]?.push(b);

  // 1. Break cycles: reverse edges that reach a node on the DFS stack. Sources first.
  const state = new Uint8Array(n); // 0 new, 1 on stack, 2 done
  const reversed = new Set<string>();
  const indeg = new Array<number>(n).fill(0);
  for (const [, b] of pairs) indeg[b] = (indeg[b] ?? 0) + 1;
  const starts = [...list.keys()].sort((a, b) => Number((indeg[a] ?? 0) > 0) - Number((indeg[b] ?? 0) > 0));
  for (const s of starts) {
    if (state[s] !== 0) continue;
    // Iterative DFS (deep flowcharts must not overflow the call stack).
    const stack: [number, number][] = [[s, 0]];
    state[s] = 1;
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (!top) break;
      const [v, i] = top;
      const next = out[v]?.[i];
      if (next === undefined) {
        state[v] = 2;
        stack.pop();
        continue;
      }
      top[1] = i + 1;
      if (state[next] === 1) reversed.add(`${String(v)}>${String(next)}`);
      else if (state[next] === 0) {
        state[next] = 1;
        stack.push([next, 0]);
      }
    }
  }
  const dag: [number, number][] = pairs.map(([a, b]) => (reversed.has(`${String(a)}>${String(b)}`) ? [b, a] : [a, b]));
  const dedupe = new Set<string>();
  const edges = dag.filter(([a, b]) => {
    const k = `${String(a)}>${String(b)}`;
    if (dedupe.has(k)) return false;
    dedupe.add(k);
    return true;
  });

  // 2. Ranks: longest path from the sources (Kahn order), then pull sources down.
  const succ: number[][] = Array.from({ length: n }, () => []);
  const pred: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    succ[a]?.push(b);
    pred[b]?.push(a);
  }
  const deg = pred.map((p) => p.length);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (deg[i] === 0) queue.push(i);
  const topo: number[] = [];
  // The queue grows while it is read (for...of sees appended items).
  for (const v of queue) {
    topo.push(v);
    for (const w of succ[v] ?? []) {
      deg[w] = (deg[w] ?? 0) - 1;
      if (deg[w] === 0) queue.push(w);
    }
  }
  for (const v of topo) {
    const node = list[v];
    if (!node) continue;
    for (const p of pred[v] ?? []) node.rank = Math.max(node.rank, (list[p]?.rank ?? 0) + 1);
  }
  for (let i = topo.length - 1; i >= 0; i--) {
    const v = topo[i] ?? 0;
    const node = list[v];
    const s = succ[v] ?? [];
    if (!node || (pred[v]?.length ?? 0) > 0 || s.length === 0) continue;
    node.rank = Math.max(node.rank, Math.min(...s.map((w) => list[w]?.rank ?? 0)) - 1);
  }

  // 3. Dummy nodes for edges spanning several ranks.
  for (const [a, b] of edges) {
    const from = list[a];
    const to = list[b];
    if (!from || !to) continue;
    let prev = a;
    for (let r = from.rank + 1; r < to.rank; r++) {
      const d: LNode = { id: '', across: DUMMY_SIZE, along: 0, dummy: true, rank: r, order: 0, pos: 0, up: [prev], down: [] };
      list.push(d);
      list[prev]?.down.push(list.length - 1);
      prev = list.length - 1;
    }
    list[prev]?.down.push(b);
    to.up.push(prev);
  }

  // 4. Order within ranks: initial order by DFS from the sources, then barycenter sweeps.
  const layers: number[][] = [];
  const placed = new Uint8Array(list.length);
  const visit = (start: number): void => {
    const stack = [start];
    while (stack.length > 0) {
      const v = stack.pop() ?? 0;
      if (placed[v]) continue;
      placed[v] = 1;
      const node = list[v];
      if (!node) continue;
      (layers[node.rank] ??= []).push(v);
      for (let i = node.down.length - 1; i >= 0; i--) stack.push(node.down[i] ?? 0);
    }
  };
  for (let i = 0; i < n; i++) if ((list[i]?.up.length ?? 0) === 0) visit(i);
  for (let i = 0; i < list.length; i++) visit(i);
  for (let r = 0; r < layers.length; r++) layers[r] ??= [];
  const setOrder = (): void => {
    for (const layer of layers) layer.forEach((v, i) => {
      const node = list[v];
      if (node) node.order = i;
    });
  };
  setOrder();
  let best = layers.map((l) => [...l]);
  let bestCrossings = crossings(list, layers);
  for (let s = 0; s < sweeps && bestCrossings > 0; s++) {
    const down = s % 2 === 0;
    const range = down ? [...layers.keys()].slice(1) : [...layers.keys()].reverse().slice(1);
    for (const r of range) {
      const layer = layers[r];
      if (!layer) continue;
      const bary = new Map<number, number>();
      for (const v of layer) {
        const node = list[v];
        const nb = node ? (down ? node.up : node.down) : [];
        bary.set(v, nb.length === 0 ? (node?.order ?? 0) : nb.reduce((sum, w) => sum + (list[w]?.order ?? 0), 0) / nb.length);
      }
      layer.sort((a, b) => (bary.get(a) ?? 0) - (bary.get(b) ?? 0) || (list[a]?.order ?? 0) - (list[b]?.order ?? 0));
      layer.forEach((v, i) => {
        const node = list[v];
        if (node) node.order = i;
      });
    }
    const c = crossings(list, layers);
    if (c < bestCrossings) {
      bestCrossings = c;
      best = layers.map((l) => [...l]);
    }
  }
  layers.splice(0, layers.length, ...best);
  setOrder();

  // 5. Coordinates across the ranks: pack, then pull toward the neighbors' centers.
  for (const layer of layers) {
    let x = 0;
    layer.forEach((v, i) => {
      const node = list[v];
      if (!node) return;
      if (i > 0) x += gap;
      node.pos = x + node.across / 2;
      x += node.across;
    });
  }
  const passes: ('up' | 'down' | 'both')[] = ['down', 'up', 'down', 'up', 'both'];
  for (const pass of passes) {
    const order = pass === 'up' ? [...layers.keys()].reverse() : [...layers.keys()];
    for (const r of order) {
      const layer = layers[r];
      if (!layer || layer.length === 0) continue;
      const desired = layer.map((v) => {
        const node = list[v];
        if (!node) return 0;
        const nb = pass === 'down' ? node.up : pass === 'up' ? node.down : [...node.up, ...node.down];
        if (nb.length === 0) return node.pos;
        return nb.reduce((sum, w) => sum + (list[w]?.pos ?? 0), 0) / nb.length;
      });
      const sizes = layer.map((v) => list[v]?.across ?? 0);
      const pos = placeWithGaps(desired, sizes, gap);
      layer.forEach((v, i) => {
        const node = list[v];
        if (node) node.pos = pos[i] ?? node.pos;
      });
    }
  }
}

/** Edge crossings between adjacent ranks (Barth, Juenger, Mutzel accumulation with a Fenwick tree). */
function crossings(list: readonly LNode[], layers: readonly (readonly number[])[]): number {
  let total = 0;
  for (let r = 0; r + 1 < layers.length; r++) {
    const upper = layers[r] ?? [];
    const lowerSize = layers[r + 1]?.length ?? 0;
    const targets: number[] = [];
    for (const v of upper) {
      const node = list[v];
      if (!node) continue;
      const orders = node.down.map((w) => list[w]?.order ?? 0).sort((a, b) => a - b);
      targets.push(...orders);
    }
    const tree = new Array<number>(lowerSize + 1).fill(0);
    for (let i = 0; i < targets.length; i++) {
      const t = (targets[i] ?? 0) + 1;
      // Count earlier targets greater than t.
      let le = 0;
      for (let k = t; k > 0; k -= k & -k) le += tree[k] ?? 0;
      total += i - le;
      for (let k = t; k <= lowerSize; k += k & -k) tree[k] = (tree[k] ?? 0) + 1;
    }
  }
  return total;
}

/**
 * Centers closest (least squares) to `desired`, in the given order, with at least
 * `gap` between neighbors: isotonic regression by pool adjacent violators.
 */
export function placeWithGaps(desired: readonly number[], sizes: readonly number[], gap: number): number[] {
  const n = desired.length;
  const offset: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) acc += ((sizes[i - 1] ?? 0) + (sizes[i] ?? 0)) / 2 + gap;
    offset.push(acc);
  }
  // Blocks of [sum, count, start].
  const blocks: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    blocks.push([(desired[i] ?? 0) - (offset[i] ?? 0), 1, i]);
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1];
      const prev = blocks[blocks.length - 2];
      if (!last || !prev || prev[0] / prev[1] <= last[0] / last[1]) break;
      prev[0] += last[0];
      prev[1] += last[1];
      blocks.pop();
    }
  }
  const out = new Array<number>(n).fill(0);
  for (const [sum, count, start] of blocks) {
    const value = sum / count;
    for (let i = start; i < start + count; i++) out[i] = value + (offset[i] ?? 0);
  }
  return out;
}

// ---- tree -----------------------------------------------------------------------

function tree(list: LNode[], pairs: readonly [number, number][], gap: number): void {
  const n = list.length;
  if (n === 0) return;
  const out: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array<number>(n).fill(0);
  for (const [a, b] of pairs) {
    out[a]?.push(b);
    indeg[b] = (indeg[b] ?? 0) + 1;
  }
  const children: number[][] = Array.from({ length: n }, () => []);
  const visited = new Uint8Array(n);
  const roots: number[] = [];
  const bfs = (root: number): void => {
    visited[root] = 1;
    roots.push(root);
    const queue = [root];
    for (const v of queue) {
      for (const w of out[v] ?? []) {
        if (visited[w]) continue;
        visited[w] = 1;
        children[v]?.push(w);
        const child = list[w];
        if (child) child.rank = (list[v]?.rank ?? 0) + 1;
        queue.push(w);
      }
    }
  };
  for (let i = 0; i < n; i++) if (indeg[i] === 0 && !visited[i]) bfs(i);
  for (let i = 0; i < n; i++) if (!visited[i]) bfs(i);
  // Subtree extents (iterative post-order), then placement.
  const extent = new Array<number>(n).fill(0);
  const post: number[] = [];
  const stack = [...roots].reverse();
  while (stack.length > 0) {
    const v = stack.pop() ?? 0;
    post.push(v);
    for (const c of children[v] ?? []) stack.push(c);
  }
  for (let i = post.length - 1; i >= 0; i--) {
    const v = post[i] ?? 0;
    const kids = children[v] ?? [];
    const sum = kids.reduce((s, c) => s + (extent[c] ?? 0), 0) + gap * Math.max(0, kids.length - 1);
    extent[v] = Math.max(list[v]?.across ?? 0, sum);
  }
  const place = (root: number, left: number): void => {
    const work: [number, number][] = [[root, left]];
    while (work.length > 0) {
      const [v, start] = work.pop() ?? [0, 0];
      const node = list[v];
      if (!node) continue;
      node.pos = start + (extent[v] ?? 0) / 2;
      const kids = children[v] ?? [];
      const sum = kids.reduce((s, c) => s + (extent[c] ?? 0), 0) + gap * Math.max(0, kids.length - 1);
      let x = start + ((extent[v] ?? 0) - sum) / 2;
      for (const c of kids) {
        work.push([c, x]);
        x += (extent[c] ?? 0) + gap;
      }
    }
  };
  let x = 0;
  for (const r of roots) {
    place(r, x);
    x += (extent[r] ?? 0) + gap;
  }
}
