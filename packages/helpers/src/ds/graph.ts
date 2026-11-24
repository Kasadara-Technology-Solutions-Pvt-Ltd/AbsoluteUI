import { HelperError, ValidationError } from '../error/index.js';
import { BinaryHeap } from './heap.js';
import { Queue } from './ring.js';

export interface GraphOptions {
  /** Directed edges (default true). Undirected edges are stored in both directions and counted once. */
  readonly directed?: boolean;
}

/** Result of `shortestPath`. */
export interface ShortestPath<N> {
  readonly path: N[];
  readonly distance: number;
}

/**
 * Directed or undirected weighted graph on adjacency maps. Nodes are compared with `Map` semantics
 * (SameValueZero). Every algorithm is iterative, so deep or long graphs cannot overflow the stack.
 * Complexity (V nodes, E edges): `addNode`, `addEdge`, `removeEdge`, `hasEdge`, `weight` O(1);
 * `removeNode` O(degree); `bfs`, `dfs`, `topologicalSort`, `hasCycle`, `findCycle`, `connectedComponents`,
 * `stronglyConnectedComponents` O(V + E); `shortestPath` O((V + E) log V).
 * @example
 * const g = new Graph<string>();
 * g.addEdge('shirt', 'tie').addEdge('tie', 'jacket').addEdge('trousers', 'jacket');
 * g.topologicalSort(); // => ['shirt', 'trousers', 'tie', 'jacket']
 */
export class Graph<N> implements Iterable<N> {
  readonly directed: boolean;
  readonly #out = new Map<N, Map<N, number>>();
  readonly #in: Map<N, Map<N, number>>;
  #edges = 0;

  constructor(options: GraphOptions = {}) {
    this.directed = options.directed ?? true;
    this.#in = this.directed ? new Map<N, Map<N, number>>() : this.#out;
  }

  /** Number of nodes. O(1). */
  get size(): number {
    return this.#out.size;
  }

  /** Number of edges (undirected edges count once). O(1). */
  get edgeCount(): number {
    return this.#edges;
  }

  /** Adds `node` if absent. O(1). */
  addNode(node: N): this {
    if (!this.#out.has(node)) {
      this.#out.set(node, new Map());
      if (this.directed) this.#in.set(node, new Map());
    }
    return this;
  }

  /** True when `node` exists. O(1). */
  hasNode(node: N): boolean {
    return this.#out.has(node);
  }

  /** Adds or re-weights the edge `from -> to` (both ways when undirected), adding missing nodes. O(1). */
  addEdge(from: N, to: N, weight = 1): this {
    if (Number.isNaN(weight)) throw new ValidationError('HLP_DS_GRAPH_INVALID_WEIGHT', 'Edge weight must be a number.');
    this.addNode(from).addNode(to);
    const out = this.#out.get(from);
    if (!out) return this;
    if (!out.has(to)) this.#edges++;
    out.set(to, weight);
    this.#in.get(to)?.set(from, weight);
    return this;
  }

  /** True when the edge `from -> to` exists. O(1). */
  hasEdge(from: N, to: N): boolean {
    return this.#out.get(from)?.has(to) ?? false;
  }

  /** Weight of `from -> to`, or `undefined`. O(1). */
  weight(from: N, to: N): number | undefined {
    return this.#out.get(from)?.get(to);
  }

  /** Removes the edge `from -> to` (both ways when undirected). O(1). */
  removeEdge(from: N, to: N): boolean {
    const out = this.#out.get(from);
    if (!out?.delete(to)) return false;
    this.#in.get(to)?.delete(from);
    this.#edges--;
    return true;
  }

  /** Removes `node` and its edges. O(degree). */
  removeNode(node: N): boolean {
    const out = this.#out.get(node);
    if (!out) return false;
    if (this.directed) {
      const inc = this.#in.get(node) ?? new Map<N, number>();
      this.#edges -= out.size + inc.size - (out.has(node) ? 1 : 0);
      for (const m of out.keys()) this.#in.get(m)?.delete(node);
      for (const m of inc.keys()) this.#out.get(m)?.delete(node);
      this.#in.delete(node);
    } else {
      this.#edges -= out.size;
      for (const m of out.keys()) if (m !== node) this.#out.get(m)?.delete(node);
    }
    this.#out.delete(node);
    return true;
  }

  /** Out-neighbours of `node` (all neighbours when undirected). O(degree). */
  neighbors(node: N): N[] {
    return [...(this.#out.get(node)?.keys() ?? [])];
  }

  /** In-neighbours of `node` (same as `neighbors` when undirected). O(degree). */
  inNeighbors(node: N): N[] {
    return [...(this.#in.get(node)?.keys() ?? [])];
  }

  /** Every node in insertion order. */
  nodes(): N[] {
    return [...this.#out.keys()];
  }

  /** Every edge as `[from, to, weight]` (undirected edges once). */
  *edges(): Generator<[N, N, number]> {
    const seen = this.directed ? undefined : new Set<N>();
    for (const [from, out] of this.#out) {
      for (const [to, w] of out) if (!seen?.has(to)) yield [from, to, w];
      seen?.add(from);
    }
  }

  /** Removes every node and edge. */
  clear(): void {
    this.#out.clear();
    this.#in.clear();
    this.#edges = 0;
  }

  /** Nodes in insertion order. */
  toArray(): N[] {
    return this.nodes();
  }

  /** Iterates nodes in insertion order. */
  [Symbol.iterator](): Iterator<N> {
    return this.#out.keys();
  }

  /** Breadth-first nodes reachable from `start` (nothing when absent). */
  *bfs(start: N): Generator<N> {
    if (!this.#out.has(start)) return;
    const seen = new Set<N>([start]);
    const q = new Queue<N>([start]);
    while (q.size > 0) {
      const node = q.dequeue() as N;
      yield node;
      for (const m of this.#out.get(node)?.keys() ?? []) {
        if (!seen.has(m)) {
          seen.add(m);
          q.enqueue(m);
        }
      }
    }
  }

  /** Depth-first (pre-order) nodes reachable from `start`, visiting neighbours in insertion order. */
  *dfs(start: N): Generator<N> {
    if (!this.#out.has(start)) return;
    const seen = new Set<N>();
    const stack: N[] = [start];
    while (stack.length > 0) {
      const node = stack.pop() as N;
      if (seen.has(node)) continue;
      seen.add(node);
      yield node;
      const next = this.neighbors(node);
      for (let i = next.length - 1; i >= 0; i--) {
        const m = next[i] as N;
        if (!seen.has(m)) stack.push(m);
      }
    }
  }

  /**
   * Kahn's topological order (ties in insertion order). Directed graphs only.
   * Throws `HLP_DS_GRAPH_CYCLE` with `details.cycle` (node ids) when a cycle exists.
   */
  topologicalSort(): N[] {
    this.#requireDirected();
    const indegree = new Map<N, number>();
    for (const [n, inc] of this.#in) indegree.set(n, inc.size);
    const q = new Queue<N>();
    for (const [n, d] of indegree) if (d === 0) q.enqueue(n);
    const out: N[] = [];
    while (q.size > 0) {
      const n = q.dequeue() as N;
      out.push(n);
      for (const m of this.#out.get(n)?.keys() ?? []) {
        const d = (indegree.get(m) ?? 0) - 1;
        indegree.set(m, d);
        if (d === 0) q.enqueue(m);
      }
    }
    if (out.length < this.#out.size) {
      throw new HelperError('HLP_DS_GRAPH_CYCLE', 'The graph contains a cycle.', { kind: 'conflict', details: { cycle: this.findCycle() ?? [] } });
    }
    return out;
  }

  /** True when the graph has a cycle (self-loops count). O(V + E). */
  hasCycle(): boolean {
    return this.findCycle() !== undefined;
  }

  /**
   * One cycle as its nodes in edge order (`[a, b, c]` means a -> b -> c -> a), or `undefined`.
   * Undirected graphs need at least three distinct nodes (or a self-loop) to form a cycle.
   */
  findCycle(): N[] | undefined {
    return this.directed ? this.#findDirectedCycle() : this.#findUndirectedCycle();
  }

  /**
   * Dijkstra's shortest path from `from` to `to`, or `undefined` when unreachable or absent.
   * Throws `HLP_DS_GRAPH_NEGATIVE_WEIGHT` when it meets a negative edge.
   */
  shortestPath(from: N, to: N): ShortestPath<N> | undefined {
    if (!this.#out.has(from) || !this.#out.has(to)) return undefined;
    const { dist, prev } = this.#dijkstra(from, to);
    const d = dist.get(to);
    if (d === undefined) return undefined;
    const path: N[] = [to];
    for (let n = to; n !== from && prev.has(n); ) {
      n = prev.get(n) as N;
      path.push(n);
    }
    return { path: path.reverse(), distance: d };
  }

  /** Shortest distances from `from` to every reachable node (Dijkstra). */
  distancesFrom(from: N): Map<N, number> {
    if (!this.#out.has(from)) return new Map();
    return this.#dijkstra(from, undefined).dist;
  }

  /** Connected components (weakly connected for directed graphs), each in BFS order. O(V + E). */
  connectedComponents(): N[][] {
    const seen = new Set<N>();
    const out: N[][] = [];
    for (const start of this.#out.keys()) {
      if (seen.has(start)) continue;
      seen.add(start);
      const comp: N[] = [];
      const q = new Queue<N>([start]);
      while (q.size > 0) {
        const n = q.dequeue() as N;
        comp.push(n);
        for (const adj of [this.#out.get(n), this.directed ? this.#in.get(n) : undefined]) {
          for (const m of adj?.keys() ?? []) {
            if (!seen.has(m)) {
              seen.add(m);
              q.enqueue(m);
            }
          }
        }
      }
      out.push(comp);
    }
    return out;
  }

  /** Strongly connected components (iterative Tarjan), in reverse topological order. O(V + E). */
  stronglyConnectedComponents(): N[][] {
    if (!this.directed) return this.connectedComponents();
    let counter = 0;
    const index = new Map<N, number>();
    const low = new Map<N, number>();
    const onStack = new Set<N>();
    const stack: N[] = [];
    const out: N[][] = [];
    for (const root of this.#out.keys()) {
      if (index.has(root)) continue;
      const frames: [N, Iterator<N>][] = [];
      const enter = (v: N): void => {
        index.set(v, counter);
        low.set(v, counter);
        counter++;
        stack.push(v);
        onStack.add(v);
        frames.push([v, (this.#out.get(v) ?? new Map<N, number>()).keys()]);
      };
      enter(root);
      for (let frame = frames.at(-1); frame; frame = frames.at(-1)) {
        const [v, it] = frame;
        const r = it.next();
        if (!r.done) {
          const w = r.value;
          if (!index.has(w)) enter(w);
          else if (onStack.has(w)) low.set(v, Math.min(low.get(v) ?? 0, index.get(w) ?? 0));
          continue;
        }
        frames.pop();
        const parent = frames[frames.length - 1];
        if (parent) low.set(parent[0], Math.min(low.get(parent[0]) ?? 0, low.get(v) ?? 0));
        if (low.get(v) === index.get(v)) {
          const comp: N[] = [];
          for (;;) {
            const w = stack.pop() as N;
            onStack.delete(w);
            comp.push(w);
            if (w === v) break;
          }
          out.push(comp);
        }
      }
    }
    return out;
  }

  #requireDirected(): void {
    if (!this.directed) throw new ValidationError('HLP_DS_GRAPH_UNDIRECTED', 'This operation needs a directed graph.');
  }

  #dijkstra(from: N, target: N | undefined): { dist: Map<N, number>; prev: Map<N, N> } {
    const dist = new Map<N, number>([[from, 0]]);
    const prev = new Map<N, N>();
    const done = new Set<N>();
    const heap = new BinaryHeap<[number, N]>([[0, from]], (a, b) => a[0] - b[0]);
    for (let top = heap.pop(); top; top = heap.pop()) {
      const [d, n] = top;
      if (done.has(n)) continue;
      done.add(n);
      if (target !== undefined && n === target) break;
      for (const [m, w] of this.#out.get(n) ?? []) {
        if (w < 0) throw new ValidationError('HLP_DS_GRAPH_NEGATIVE_WEIGHT', 'Shortest path needs non-negative edge weights.');
        const nd = d + w;
        const cur = dist.get(m);
        if (cur === undefined || nd < cur) {
          dist.set(m, nd);
          prev.set(m, n);
          heap.push([nd, m]);
        }
      }
    }
    // Drop tentative distances that were never settled only when stopping early.
    if (target !== undefined) for (const k of [...dist.keys()]) if (!done.has(k) && k !== target) dist.delete(k);
    return { dist, prev };
  }

  #findDirectedCycle(): N[] | undefined {
    const state = new Map<N, 1 | 2>(); // 1 = on stack, 2 = finished
    const parent = new Map<N, N>();
    for (const root of this.#out.keys()) {
      if (state.has(root)) continue;
      const frames: [N, Iterator<N>][] = [[root, (this.#out.get(root) ?? new Map<N, number>()).keys()]];
      state.set(root, 1);
      for (let frame = frames.at(-1); frame; frame = frames.at(-1)) {
        const [v, it] = frame;
        const r = it.next();
        if (r.done) {
          state.set(v, 2);
          frames.pop();
          continue;
        }
        const w = r.value;
        const s = state.get(w);
        if (s === 1) {
          const cycle: N[] = [v];
          for (let x = v; x !== w; ) {
            x = parent.get(x) as N;
            cycle.push(x);
          }
          return cycle.reverse();
        }
        if (s === undefined) {
          state.set(w, 1);
          parent.set(w, v);
          frames.push([w, (this.#out.get(w) ?? new Map<N, number>()).keys()]);
        }
      }
    }
    return undefined;
  }

  #findUndirectedCycle(): N[] | undefined {
    const visited = new Set<N>();
    const parent = new Map<N, N>();
    for (const root of this.#out.keys()) {
      if (visited.has(root)) continue;
      visited.add(root);
      const frames: [N, Iterator<N>][] = [[root, (this.#out.get(root) ?? new Map<N, number>()).keys()]];
      for (let frame = frames.at(-1); frame; frame = frames.at(-1)) {
        const [v, it] = frame;
        const r = it.next();
        if (r.done) {
          frames.pop();
          continue;
        }
        const w = r.value;
        if (w === v) return [v];
        if (parent.has(v) && parent.get(v) === w) continue;
        if (visited.has(w)) {
          const cycle: N[] = [v];
          for (let x = v; x !== w; ) {
            x = parent.get(x) as N;
            cycle.push(x);
          }
          return cycle.reverse();
        }
        visited.add(w);
        parent.set(w, v);
        frames.push([w, (this.#out.get(w) ?? new Map<N, number>()).keys()]);
      }
    }
    return undefined;
  }
}
