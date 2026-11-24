/**
 * Loaded pivot data (cells and the member tree of both axes) and the pure axis
 * builders: which rows and columns are visible for a given expansion and sort.
 */
import { compareKeys } from './engine.js';
import { cellKey, pathKey, startsWith, type PivotCell, type PivotKey, type PivotPath, type PivotSort } from './model.js';

export type PivotAxis = 'rows' | 'columns';

/** A visible row, or a visible column before it is split by value fields. */
export interface PivotAxisEntry {
  readonly path: PivotKey[];
  /** `member`: a member of the path's field; `subtotal`: a column group's total (columns only); `total`: the grand total (`[]`). */
  readonly kind: 'member' | 'subtotal' | 'total';
  /** The member can be expanded (it is not on the innermost field). */
  readonly expandable: boolean;
  readonly expanded: boolean;
}

/** Column header tree node (for `thead` spans). */
export interface PivotColumnNode {
  readonly path: PivotKey[];
  readonly kind: 'member' | 'subtotal' | 'total';
  readonly expandable: boolean;
  readonly expanded: boolean;
  /** Children in display order (empty unless expanded). */
  readonly children: PivotColumnNode[];
  /** Visible leaf columns under this node (1 for a leaf), before splitting by values. */
  readonly span: number;
}

export class PivotStore {
  readonly #cells = new Map<string, readonly (number | null)[]>();
  readonly #children: Record<PivotAxis, Map<string, PivotKey[][]>> = { rows: new Map(), columns: new Map() };

  clear(): void {
    this.#cells.clear();
    this.#children.rows.clear();
    this.#children.columns.clear();
  }

  /** Merge a query answer; the children of every requested parent become known. */
  ingest(cells: readonly PivotCell[], rowParents: readonly PivotPath[], columnParents: readonly PivotPath[]): void {
    for (const c of cells) this.#cells.set(cellKey(c.row, c.column), c.values);
    this.#learn('rows', rowParents, cells.map((c) => c.row));
    this.#learn('columns', columnParents, cells.map((c) => c.column));
  }

  #learn(axis: PivotAxis, parents: readonly PivotPath[], paths: readonly PivotPath[]): void {
    for (const parent of parents) {
      const seen = new Map<string, PivotKey[]>();
      for (const p of paths) {
        if (p.length === parent.length + 1 && startsWith(p, parent)) seen.set(pathKey(p), [...p]);
      }
      this.#children[axis].set(pathKey(parent), [...seen.values()]);
    }
  }

  /** Loaded children of a path, or undefined when not loaded yet. */
  children(axis: PivotAxis, path: PivotPath): readonly PivotKey[][] | undefined {
    return this.#children[axis].get(pathKey(path));
  }

  loaded(axis: PivotAxis, path: PivotPath): boolean {
    return this.#children[axis].has(pathKey(path));
  }

  /** Paths whose children are loaded. */
  parents(axis: PivotAxis): PivotKey[][] {
    return [...this.#children[axis].keys()].map((k) => JSON.parse(k) as PivotKey[]);
  }

  value(row: PivotPath, column: PivotPath, index: number): number | null {
    return this.#cells.get(cellKey(row, column))?.[index] ?? null;
  }

  has(row: PivotPath, column: PivotPath): boolean {
    return this.#cells.has(cellKey(row, column));
  }
}

export interface AxisContext {
  readonly axis: PivotAxis;
  readonly store: PivotStore;
  /** Number of fields on this axis. */
  readonly depth: number;
  readonly expanded: ReadonlySet<string>;
  readonly sort: PivotSort | null;
  readonly locale: string;
}

/** Children of `path` in display order. */
export function sortedChildren(ctx: AxisContext, path: PivotPath): PivotKey[][] {
  const axis = ctx.axis;
  const children = [...(ctx.store.children(axis, path) ?? [])];
  const sort = ctx.sort;
  const last = (p: PivotPath): PivotKey => p[p.length - 1] ?? null;
  const byLabel = (a: PivotPath, b: PivotPath): number => compareKeys(last(a), last(b), ctx.locale);
  if (!sort || sort.by === 'label') {
    const sign = sort?.direction === 'descending' ? -1 : 1;
    return children.sort((a, b) => {
      // Blank members stay last in both directions.
      if (last(a) === null || last(b) === null) return byLabel(a, b);
      return sign * byLabel(a, b);
    });
  }
  const sign = sort.direction === 'descending' ? -1 : 1;
  const value = (p: PivotPath): number | null => (axis === 'rows' ? ctx.store.value(p, sort.column ?? [], sort.value) : ctx.store.value([], p, sort.value));
  return children.sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) return va === vb ? byLabel(a, b) : va === null ? 1 : -1;
    return sign * (va - vb) || byLabel(a, b);
  });
}

const isExpanded = (ctx: AxisContext, path: PivotPath): boolean => path.length < ctx.depth && ctx.expanded.has(pathKey(path));

/** Visible rows (compact form: a group row carries its subtotal; the grand total last). */
export function rowEntries(ctx: AxisContext, grandTotal: boolean): PivotAxisEntry[] {
  const out: PivotAxisEntry[] = [];
  if (ctx.depth === 0) return [{ path: [], kind: 'total', expandable: false, expanded: false }];
  const visit = (parent: PivotPath): void => {
    for (const path of sortedChildren(ctx, parent)) {
      const expandable = path.length < ctx.depth;
      const expanded = expandable && isExpanded(ctx, path);
      out.push({ path, kind: 'member', expandable, expanded });
      if (expanded && ctx.store.loaded('rows', path)) visit(path);
    }
  };
  visit([]);
  if (grandTotal) out.push({ path: [], kind: 'total', expandable: false, expanded: false });
  return out;
}

/** Column header tree and its visible leaves (subtotal after an expanded group's children). */
export function columnTree(ctx: AxisContext, subtotals: boolean, grandTotal: boolean): { nodes: PivotColumnNode[]; leaves: PivotAxisEntry[] } {
  const leaves: PivotAxisEntry[] = [];
  if (ctx.depth === 0) {
    const total: PivotColumnNode = { path: [], kind: 'total', expandable: false, expanded: false, children: [], span: 1 };
    leaves.push({ path: [], kind: 'total', expandable: false, expanded: false });
    return { nodes: [total], leaves };
  }
  const visit = (parent: PivotPath): PivotColumnNode[] => {
    const nodes: PivotColumnNode[] = [];
    for (const path of sortedChildren(ctx, parent)) {
      const expandable = path.length < ctx.depth;
      const expanded = expandable && isExpanded(ctx, path) && ctx.store.loaded('columns', path) && (ctx.store.children('columns', path)?.length ?? 0) > 0;
      if (expanded) {
        const children = visit(path);
        const span = children.reduce((n, c) => n + c.span, 0);
        nodes.push({ path, kind: 'member', expandable, expanded: true, children, span });
        if (subtotals) {
          nodes.push({ path, kind: 'subtotal', expandable: false, expanded: false, children: [], span: 1 });
          leaves.push({ path, kind: 'subtotal', expandable: false, expanded: false });
        }
      } else {
        nodes.push({ path, kind: 'member', expandable, expanded: false, children: [], span: 1 });
        leaves.push({ path, kind: 'member', expandable, expanded: false });
      }
    }
    return nodes;
  };
  const nodes = visit([]);
  if (grandTotal) {
    nodes.push({ path: [], kind: 'total', expandable: false, expanded: false, children: [], span: 1 });
    leaves.push({ path: [], kind: 'total', expandable: false, expanded: false });
  }
  return { nodes, leaves };
}

/**
 * Parents to load next for an axis: expanded paths (or, without explicit
 * expansion, every member above `expandDepth`) whose parent is loaded and visible
 * but whose own children are not loaded yet.
 */
export function pendingParents(ctx: AxisContext, autoDepth: number | null): PivotKey[][] {
  const out: PivotKey[][] = [];
  const visit = (parent: PivotPath): void => {
    for (const path of ctx.store.children(ctx.axis, parent) ?? []) {
      if (path.length >= ctx.depth) continue;
      const wanted = autoDepth === null ? ctx.expanded.has(pathKey(path)) : path.length <= autoDepth;
      if (!wanted) continue;
      if (ctx.store.loaded(ctx.axis, path)) visit(path);
      else out.push(path);
    }
  };
  if (ctx.store.loaded(ctx.axis, [])) visit([]);
  return out;
}
