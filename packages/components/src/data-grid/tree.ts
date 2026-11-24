/**
 * Data Grid tree data (docs/PLAN-R11-G5.md, G5c): a tree over the rows from paths, parent ids,
 * or nested children; filler nodes for missing path levels; filtering that keeps the ancestors
 * (or the whole subtree) of matching rows; sibling order from the grid's sort; aggregates of the
 * leaf rows below each node. Cycles and missing parents never loop: such rows become roots.
 */
import type { Item } from '../data-table/model.js';
import { aggregateValues, type AggregateColumn, type DisplayRow, type FlattenOptions, type GroupNode } from './grouping.js';

export interface TreeNode<Row> {
  /** The row id, or `tree:` plus the encoded path for a filler node. */
  readonly id: string;
  /** The data row, or null for a filler node (a path level without a row). */
  readonly item: Item<Row> | null;
  /** The label of a filler node (its path element). */
  readonly key: string;
  readonly parent: TreeNode<Row> | null;
  readonly children: TreeNode<Row>[];
  readonly level: number;
  /** Data rows without children below this node (aggregates use them). */
  readonly leaves: Item<Row>[];
  readonly aggregates: Map<string, unknown>;
}

/** How a row places in the tree. */
export type TreeRelation<Row> = { readonly kind: 'path'; readonly path: (row: Row) => readonly string[] } | { readonly kind: 'parent'; readonly parentId: (row: Row, id: string) => string | null | undefined };

export interface TreeBuild<Row> {
  readonly roots: TreeNode<Row>[];
  /** Rows whose parent was missing or formed a cycle (placed as roots). */
  readonly orphans: string[];
}

interface MutableNode<Row> {
  id: string;
  item: Item<Row> | null;
  key: string;
  parent: MutableNode<Row> | null;
  children: MutableNode<Row>[];
  level: number;
  leaves: Item<Row>[];
  aggregates: Map<string, unknown>;
}

/**
 * Build the tree of every row. `visible` decides which nodes show (matching rows, and the
 * ancestors or subtree the filter mode keeps); `rank` orders siblings (the grid's sort).
 */
export function buildTree<Row>(
  items: readonly Item<Row>[],
  relation: TreeRelation<Row>,
  options: { readonly pass: ReadonlySet<string>; readonly mode: 'ancestors' | 'subtree'; readonly rank: ReadonlyMap<string, number>; readonly compareKeys: (a: string, b: string) => number; readonly aggregates: readonly AggregateColumn<Row>[] },
): TreeBuild<Row> {
  const nodes = new Map<string, MutableNode<Row>>();
  const orphans: string[] = [];
  const node = (id: string, item: Item<Row> | null, key: string): MutableNode<Row> => ({ id, item, key, parent: null, children: [], level: 0, leaves: [], aggregates: new Map() });
  for (const item of items) nodes.set(item.id, node(item.id, item, ''));
  if (relation.kind === 'path') {
    // Path levels without a row become filler nodes.
    const byPath = new Map<string, MutableNode<Row>>();
    const pathOf = new Map<MutableNode<Row>, readonly string[]>();
    for (const item of items) {
      const path = relation.path(item.row);
      const n = nodes.get(item.id);
      if (!n || path.length === 0) continue;
      const k = JSON.stringify(path);
      // A second row with the same path keeps its own node (it becomes a sibling).
      if (!byPath.has(k)) byPath.set(k, n);
      pathOf.set(n, path);
    }
    const ensure = (path: readonly string[]): MutableNode<Row> => {
      const k = JSON.stringify(path);
      let n = byPath.get(k);
      if (!n) {
        n = node(`tree:${encodeURIComponent(k)}`, null, path.at(-1) ?? '');
        byPath.set(k, n);
        nodes.set(n.id, n);
        pathOf.set(n, path);
        if (path.length > 1) link(n, ensure(path.slice(0, -1)));
      }
      return n;
    };
    const link = (child: MutableNode<Row>, parent: MutableNode<Row>): void => {
      child.parent = parent;
      parent.children.push(child);
    };
    for (const item of items) {
      const n = nodes.get(item.id);
      const path = n ? pathOf.get(n) : undefined;
      if (!n || !path || path.length < 2) continue;
      link(n, ensure(path.slice(0, -1)));
    }
  } else {
    for (const item of items) {
      const n = nodes.get(item.id);
      const parentId = relation.parentId(item.row, item.id);
      if (!n || parentId === null || parentId === undefined || parentId === '') continue;
      const parent = nodes.get(parentId);
      // A missing parent, or a parent below this row (a cycle), leaves the row a root.
      let cycle = parent === n;
      for (let p = parent?.parent ?? null; p && !cycle; p = p.parent) if (p === n) cycle = true;
      if (!parent || cycle) {
        orphans.push(item.id);
        continue;
      }
      n.parent = parent;
      parent.children.push(n);
    }
  }
  // Visibility: matching rows, their ancestors, and (subtree mode) the descendants of matching rows.
  const visible = new Set<string>();
  const show = (n: MutableNode<Row>): void => {
    for (let p: MutableNode<Row> | null = n; p && !visible.has(p.id); p = p.parent) visible.add(p.id);
  };
  const showSubtree = (n: MutableNode<Row>): void => {
    visible.add(n.id);
    for (const c of n.children) showSubtree(c);
  };
  for (const n of nodes.values()) {
    if (!n.item || !options.pass.has(n.id)) continue;
    show(n);
    if (options.mode === 'subtree') showSubtree(n);
  }
  const order = (a: MutableNode<Row>, b: MutableNode<Row>): number => {
    const ra = a.item ? options.rank.get(a.id) : undefined;
    const rb = b.item ? options.rank.get(b.id) : undefined;
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (!a.item && !b.item) return options.compareKeys(a.key, b.key);
    // Fillers before rows the sort did not rank; ranked rows keep the sort order.
    return (a.item ? (ra ?? Number.MAX_SAFE_INTEGER) : -1) - (b.item ? (rb ?? Number.MAX_SAFE_INTEGER) : -1);
  };
  const finish = (n: MutableNode<Row>, level: number): TreeNode<Row> => {
    n.level = level;
    n.children = n.children.filter((c) => visible.has(c.id)).sort(order);
    for (const c of n.children) finish(c, level + 1);
    n.leaves = n.children.length === 0 ? (n.item ? [n.item] : []) : n.children.flatMap((c) => c.leaves);
    if (n.children.length > 0) {
      const rows = n.leaves.map((l) => l.row);
      for (const a of options.aggregates) n.aggregates.set(a.column, aggregateValues(a.aggregate, n.leaves.map((l) => a.read(l.row)), { column: a.column, rows }));
    }
    return n;
  };
  const roots = [...nodes.values()].filter((n) => n.parent === null && visible.has(n.id)).sort(order).map((n) => finish(n, 0));
  return { roots, orphans };
}

/** Flatten nested rows (children arrays) into items with their parent ids. */
export function flattenNested<Row>(rows: readonly Row[], children: (row: Row) => readonly Row[] | undefined, rowId: (row: Row) => string): { rows: Row[]; parent: Map<string, string> } {
  const out: Row[] = [];
  const parent = new Map<string, string>();
  const seen = new Set<Row>();
  const walk = (list: readonly Row[], parentId: string | null): void => {
    for (const row of list) {
      // The same object twice would loop: it is listed once.
      if (seen.has(row)) continue;
      seen.add(row);
      out.push(row);
      const id = rowId(row);
      if (parentId !== null) parent.set(id, parentId);
      const kids = children(row);
      if (kids && kids.length > 0) walk(kids, id);
    }
  };
  walk(rows, null);
  return { rows: out, parent };
}

/**
 * The group nodes of a tree (one per node with children; a data parent keeps its row in `item`)
 * and its display rows for the current expansion, siblings in tree order (rows and parents mixed).
 */
export function treeGroups<Row>(roots: readonly TreeNode<Row>[], label: (node: TreeNode<Row>) => string): { groups: GroupNode<Row>[]; byNode: Map<TreeNode<Row>, GroupNode<Row>> } {
  const byNode = new Map<TreeNode<Row>, GroupNode<Row>>();
  const make = (n: TreeNode<Row>, parent: GroupNode<Row> | null): GroupNode<Row> => {
    const g: GroupNode<Row> = { id: n.id, level: n.level, column: '', part: undefined, key: label(n), parent, groups: [], items: [], leaves: n.leaves, aggregates: n.aggregates, ...(n.item ? { item: n.item } : {}) };
    byNode.set(n, g);
    for (const c of n.children) {
      if (c.children.length > 0) g.groups.push(make(c, g));
      else if (c.item) g.items.push(c.item);
    }
    return g;
  };
  const groups = roots.filter((n) => n.children.length > 0).map((n) => make(n, null));
  return { groups, byNode };
}

export function flattenTree<Row>(roots: readonly TreeNode<Row>[], byNode: ReadonlyMap<TreeNode<Row>, GroupNode<Row>>, options: FlattenOptions): DisplayRow<Row>[] {
  const out: DisplayRow<Row>[] = [];
  const walk = (list: readonly TreeNode<Row>[], parent: GroupNode<Row> | null): void => {
    list.forEach((n, i) => {
      const g = byNode.get(n);
      if (g) {
        const expanded = options.expanded(g);
        out.push({ kind: 'group', node: g, expanded, position: i + 1, size: list.length });
        if (!expanded) return;
        walk(n.children, g);
        if (options.groupTotals) out.push({ kind: 'total', node: g, id: `total:${g.id}` });
      } else if (n.item) out.push({ kind: 'data', item: n.item, level: n.level, parent, position: i + 1, size: list.length });
    });
  };
  walk(roots, null);
  return out;
}
