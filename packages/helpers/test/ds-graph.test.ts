import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DisjointSet, Graph } from '@absoluteui/helpers/ds';
import { ValidationError, isHelperError, type HelperError } from '@absoluteui/helpers/error';

describe('Graph basics', () => {
  it('adds, removes, and counts nodes and edges (directed)', () => {
    const g = new Graph<string>();
    g.addEdge('a', 'b', 2).addEdge('b', 'c').addEdge('c', 'a').addEdge('a', 'a');
    expect(g.size).toBe(3);
    expect(g.edgeCount).toBe(4);
    expect(g.hasEdge('a', 'b')).toBe(true);
    expect(g.hasEdge('b', 'a')).toBe(false);
    expect(g.weight('a', 'b')).toBe(2);
    expect(g.neighbors('a')).toEqual(['b', 'a']);
    expect(g.inNeighbors('a')).toEqual(['c', 'a']);
    expect(g.removeNode('a')).toBe(true);
    expect(g.edgeCount).toBe(1);
    expect(g.inNeighbors('b')).toEqual([]);
    expect(g.removeEdge('b', 'c')).toBe(true);
    expect(g.removeEdge('b', 'c')).toBe(false);
    expect(g.edgeCount).toBe(0);
    expect(g.removeNode('zzz')).toBe(false);
    expect(g.toArray()).toEqual(['b', 'c']);
    expect([...g]).toEqual(['b', 'c']);
    g.clear();
    expect(g.size + g.edgeCount).toBe(0);
    expect(() => g.addEdge('x', 'y', Number.NaN)).toThrow(ValidationError);
  });

  it('undirected edges count once and are symmetric', () => {
    const g = new Graph<number>({ directed: false });
    g.addEdge(1, 2).addEdge(2, 3).addEdge(3, 3);
    expect(g.edgeCount).toBe(3);
    expect(g.hasEdge(2, 1)).toBe(true);
    expect([...g.edges()]).toEqual([[1, 2, 1], [2, 3, 1], [3, 3, 1]]);
    g.removeEdge(2, 1);
    expect(g.hasEdge(1, 2)).toBe(false);
    g.removeNode(3);
    expect(g.edgeCount).toBe(0);
    expect(() => g.topologicalSort()).toThrow(ValidationError);
  });

  it('bfs and dfs visit reachable nodes', () => {
    const g = new Graph<string>();
    g.addEdge('a', 'b').addEdge('a', 'c').addEdge('b', 'd').addEdge('c', 'd').addNode('z');
    expect([...g.bfs('a')]).toEqual(['a', 'b', 'c', 'd']);
    expect([...g.dfs('a')]).toEqual(['a', 'b', 'd', 'c']);
    expect([...g.bfs('missing')]).toEqual([]);
    expect([...g.dfs('missing')]).toEqual([]);
  });
});

describe('Graph algorithms', () => {
  it('topologicalSort orders dependencies and reports cycles in details only', () => {
    const g = new Graph<string>();
    g.addEdge('shirt', 'tie').addEdge('tie', 'jacket').addEdge('trousers', 'jacket');
    expect(g.topologicalSort()).toEqual(['shirt', 'trousers', 'tie', 'jacket']);
    g.addEdge('jacket', 'shirt');
    try {
      g.topologicalSort();
      expect.unreachable();
    } catch (e) {
      expect(isHelperError(e, 'HLP_DS_GRAPH_CYCLE')).toBe(true);
      const he = e as HelperError;
      expect(he.message).not.toMatch(/shirt|tie|jacket/);
      expect(new Set(he.details.cycle as string[])).toEqual(new Set(['shirt', 'tie', 'jacket']));
    }
  });

  it('topological order respects every edge on random DAGs (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 80 }), (n, pairs) => {
        const g = new Graph<number>();
        for (let i = 0; i < n; i++) g.addNode(i);
        for (const [a, b] of pairs) {
          const [x, y] = [a % n, b % n];
          if (x < y) g.addEdge(x, y);
        }
        const order = g.topologicalSort();
        const pos = new Map(order.map((v, i) => [v, i]));
        for (const [from, to] of g.edges()) expect(pos.get(from)!).toBeLessThan(pos.get(to)!);
        expect(g.hasCycle()).toBe(false);
      }),
    );
  });

  it('findCycle returns a real cycle (directed and undirected)', () => {
    const g = new Graph<number>();
    g.addEdge(1, 2).addEdge(2, 3).addEdge(3, 4).addEdge(4, 2);
    const c = g.findCycle()!;
    for (let i = 0; i < c.length; i++) expect(g.hasEdge(c[i]!, c[(i + 1) % c.length]!)).toBe(true);
    const self = new Graph<string>();
    self.addEdge('x', 'x');
    expect(self.findCycle()).toEqual(['x']);
    const u = new Graph<number>({ directed: false });
    u.addEdge(1, 2).addEdge(2, 3);
    expect(u.hasCycle()).toBe(false);
    u.addEdge(3, 1);
    const uc = u.findCycle()!;
    expect(new Set(uc)).toEqual(new Set([1, 2, 3]));
    const uSelf = new Graph<number>({ directed: false });
    uSelf.addEdge(1, 1);
    expect(uSelf.findCycle()).toEqual([1]);
  });

  it('shortestPath uses Dijkstra and rejects negative weights', () => {
    const g = new Graph<string>();
    g.addEdge('a', 'b', 4).addEdge('a', 'c', 1).addEdge('c', 'b', 2).addEdge('b', 'd', 1).addNode('island');
    expect(g.shortestPath('a', 'd')).toEqual({ path: ['a', 'c', 'b', 'd'], distance: 4 });
    expect(g.shortestPath('a', 'a')).toEqual({ path: ['a'], distance: 0 });
    expect(g.shortestPath('a', 'island')).toBeUndefined();
    expect(g.shortestPath('a', 'nowhere')).toBeUndefined();
    expect(Object.fromEntries(g.distancesFrom('a'))).toEqual({ a: 0, b: 3, c: 1, d: 4 });
    expect(g.distancesFrom('nowhere').size).toBe(0);
    g.addEdge('d', 'e', -1);
    expect(() => g.distancesFrom('a')).toThrow(ValidationError);
  });

  it('shortestPath matches Bellman-Ford on random graphs (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), fc.array(fc.tuple(fc.nat(), fc.nat(), fc.integer({ min: 0, max: 20 })), { maxLength: 40 }), (n, edges) => {
        const g = new Graph<number>();
        for (let i = 0; i < n; i++) g.addNode(i);
        for (const [a, b, w] of edges) g.addEdge(a % n, b % n, w);
        const dist = new Array<number>(n).fill(Infinity);
        dist[0] = 0;
        for (let i = 0; i < n; i++) for (const [a, b, w] of g.edges()) if (dist[a]! + w < dist[b]!) dist[b] = dist[a]! + w;
        for (let t = 0; t < n; t++) {
          const sp = g.shortestPath(0, t);
          if (dist[t] === Infinity) expect(sp).toBeUndefined();
          else {
            expect(sp?.distance).toBe(dist[t]);
            let sum = 0;
            for (let i = 1; i < sp!.path.length; i++) sum += g.weight(sp!.path[i - 1]!, sp!.path[i]!)!;
            expect(sum).toBe(dist[t]);
          }
        }
      }),
    );
  });

  it('connected and strongly connected components', () => {
    const g = new Graph<string>();
    g.addEdge('a', 'b').addEdge('b', 'a').addEdge('b', 'c').addEdge('c', 'd').addEdge('d', 'c').addNode('e');
    const scc = g.stronglyConnectedComponents().map((c) => c.sort().join(''));
    expect(scc.sort()).toEqual(['ab', 'cd', 'e']);
    expect(g.connectedComponents().map((c) => c.sort().join('')).sort()).toEqual(['abcd', 'e']);
    const u = new Graph<number>({ directed: false });
    u.addEdge(1, 2).addEdge(3, 4).addNode(5);
    expect(u.stronglyConnectedComponents()).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('SCC agrees with reachability on random graphs (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 30 }), (n, edges) => {
        const g = new Graph<number>();
        for (let i = 0; i < n; i++) g.addNode(i);
        for (const [a, b] of edges) g.addEdge(a % n, b % n);
        const reach = (s: number): Set<number> => new Set(g.bfs(s));
        const comp = new Map<number, number>();
        g.stronglyConnectedComponents().forEach((c, i) => { for (const v of c) comp.set(v, i); });
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
          const mutual = reach(a).has(b) && reach(b).has(a);
          expect(comp.get(a) === comp.get(b)).toBe(mutual);
        }
      }),
    );
  });

  it('handles a 100k-node path without stack overflow', () => {
    const g = new Graph<number>();
    const N = 100_000;
    for (let i = 0; i < N - 1; i++) g.addEdge(i, i + 1);
    expect(g.topologicalSort()).toHaveLength(N);
    expect(g.hasCycle()).toBe(false);
    expect([...g.dfs(0)]).toHaveLength(N);
    expect(g.stronglyConnectedComponents()).toHaveLength(N);
    g.addEdge(N - 1, 0);
    expect(g.findCycle()).toHaveLength(N);
    expect(g.stronglyConnectedComponents()).toHaveLength(1);
    expect(g.shortestPath(0, N - 1)?.distance).toBe(N - 1);
  });
});

describe('DisjointSet', () => {
  it('unions, finds, and counts sets', () => {
    const ds = new DisjointSet(['a', 'b', 'c', 'd']);
    expect(ds.union('a', 'b')).toBe(true);
    expect(ds.union('b', 'a')).toBe(false);
    ds.union('c', 'd');
    expect(ds.setCount).toBe(2);
    expect(ds.connected('a', 'b')).toBe(true);
    expect(ds.connected('a', 'c')).toBe(false);
    expect(ds.connected('a', 'zzz')).toBe(false);
    ds.union('b', 'd');
    expect(ds.sizeOf('a')).toBe(4);
    expect(ds.sizeOf('zzz')).toBe(0);
    expect(ds.find('zzz')).toBeUndefined();
    expect(ds.sets()).toEqual([['a', 'b', 'c', 'd']]);
    ds.union('x', 'y');
    expect(ds.size).toBe(6);
    expect(ds.has('x')).toBe(true);
    expect(ds.toArray()).toEqual(['a', 'b', 'c', 'd', 'x', 'y']);
    expect([...ds]).toHaveLength(6);
    ds.clear();
    expect(ds.setCount).toBe(0);
  });

  it('agrees with graph components (property) and survives long chains', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 40 }), (n, pairs) => {
        const ds = new DisjointSet<number>();
        const g = new Graph<number>({ directed: false });
        for (let i = 0; i < n; i++) { ds.add(i); g.addNode(i); }
        for (const [a, b] of pairs) { ds.union(a % n, b % n); g.addEdge(a % n, b % n); }
        expect(ds.setCount).toBe(g.connectedComponents().length);
      }),
    );
    const ds = new DisjointSet<number>();
    for (let i = 1; i < 200_000; i++) ds.union(i - 1, i);
    expect(ds.sizeOf(0)).toBe(200_000);
  });
});
