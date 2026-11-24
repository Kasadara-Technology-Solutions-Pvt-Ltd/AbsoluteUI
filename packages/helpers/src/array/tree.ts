/**
 * Flat list <-> tree conversion with cycle and orphan detection. Iterative, so depth never overflows the stack.
 */
import { ValidationError } from '../error/index.js';

/** A tree node wrapping the original item. */
export interface TreeNode<T> {
  readonly item: T;
  readonly children: TreeNode<T>[];
}

/** Field name or selector. */
type KeySpec<T> = keyof T | ((item: T) => unknown);

export interface BuildTreeOptions<T> {
  /** Id field or selector. Default `'id'`. */
  readonly id?: KeySpec<T>;
  /** Parent-id field or selector; nullish means root. Default `'parentId'`. */
  readonly parentId?: KeySpec<T>;
  /** Items whose parent is missing: `'root'` (default) promotes them to roots, `'omit'` leaves them out. */
  readonly orphans?: 'root' | 'omit';
}

export interface BuildTreeResult<T> {
  readonly roots: TreeNode<T>[];
  /** Items whose parent id matched no item. */
  readonly orphans: T[];
  /** Items unreachable from any root because their ancestry loops (including their descendants). */
  readonly cycles: T[];
}

function reader<T>(spec: KeySpec<T>): (item: T) => unknown {
  return typeof spec === 'function' ? spec : (item: T) => (item as Record<PropertyKey, unknown>)[spec];
}

/**
 * Builds a tree from `id`/`parentId` records in input order. Throws `HLP_ARRAY_DUPLICATE_ID` on repeated ids.
 * @example
 * const { roots } = buildTree([{ id: 1, parentId: null }, { id: 2, parentId: 1 }]);
 * roots[0]?.children[0]?.item.id; // => 2
 */
export function buildTree<T extends object>(items: readonly T[], options: BuildTreeOptions<T> = {}): BuildTreeResult<T> {
  const getId = reader<T>(options.id ?? ('id' as keyof T));
  const getParent = reader<T>(options.parentId ?? ('parentId' as keyof T));
  const nodes = new Map<unknown, TreeNode<T>>();
  const list = items.map((item) => {
    const node: TreeNode<T> = { item, children: [] };
    const id = getId(item);
    if (nodes.has(id)) throw new ValidationError('HLP_ARRAY_DUPLICATE_ID', 'Tree items must have unique ids.');
    nodes.set(id, node);
    return node;
  });
  const roots: TreeNode<T>[] = [];
  const starts: TreeNode<T>[] = [];
  const orphans: T[] = [];
  for (const node of list) {
    const pid = getParent(node.item);
    if (pid === null || pid === undefined) {
      roots.push(node);
      starts.push(node);
      continue;
    }
    const parent = nodes.get(pid);
    if (parent) parent.children.push(node);
    else {
      orphans.push(node.item);
      starts.push(node);
      if (options.orphans !== 'omit') roots.push(node);
    }
  }
  const reached = new Set<TreeNode<T>>();
  const stack = [...starts];
  for (let n = stack.pop(); n; n = stack.pop()) {
    reached.add(n);
    for (const c of n.children) stack.push(c);
  }
  const cycles = list.filter((n) => !reached.has(n)).map((n) => n.item);
  return { roots, orphans, cycles };
}

export interface FlattenTreeOptions<N> {
  /** Child accessor. Default reads a `children` array property. */
  readonly children?: (node: N) => Iterable<N> | null | undefined;
  /** `'depth'` (pre-order, default) or `'breadth'`. */
  readonly order?: 'depth' | 'breadth';
}

export interface FlatTreeEntry<N> {
  readonly node: N;
  readonly depth: number;
  readonly parent: N | undefined;
}

function defaultChildren<N>(node: N): Iterable<N> | undefined {
  const c = typeof node === 'object' && node !== null ? (node as { children?: unknown }).children : undefined;
  return Array.isArray(c) ? (c as N[]) : undefined;
}

/**
 * Flattens a tree into entries with depth and parent. Throws `HLP_ARRAY_TREE_CYCLE` when a node is reached twice.
 * @example
 * const rows = [{ id: 1, parentId: null, name: 'CEO' }, { id: 2, parentId: 1, name: 'CTO' }, { id: 3, parentId: 1, name: 'CFO' }];
 * flattenTree(buildTree(rows).roots).map((e) => `${'  '.repeat(e.depth)}${e.node.item.name}`); // => ['CEO', '  CTO', '  CFO']
 */
export function flattenTree<N>(roots: Iterable<N>, options: FlattenTreeOptions<N> = {}): FlatTreeEntry<N>[] {
  const getChildren = options.children ?? defaultChildren;
  const out: FlatTreeEntry<N>[] = [];
  const seen = new Set<N>();
  const visit = (e: FlatTreeEntry<N>): N[] => {
    if (seen.has(e.node)) throw new ValidationError('HLP_ARRAY_TREE_CYCLE', 'The tree contains a cycle or a shared node.');
    seen.add(e.node);
    out.push(e);
    return [...(getChildren(e.node) ?? [])];
  };
  const initial = [...roots].map((node): FlatTreeEntry<N> => ({ node, depth: 0, parent: undefined }));
  if (options.order === 'breadth') {
    // The queue grows while it is iterated; array iterators observe the new length.
    for (const e of initial) {
      for (const c of visit(e)) initial.push({ node: c, depth: e.depth + 1, parent: e.node });
    }
    return out;
  }
  const stack = initial.reverse();
  for (let e = stack.pop(); e; e = stack.pop()) {
    const kids = visit(e);
    for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i] as N, depth: e.depth + 1, parent: e.node });
  }
  return out;
}
