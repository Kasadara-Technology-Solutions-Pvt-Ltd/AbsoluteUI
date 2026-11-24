/**
 * Tree View (R20 P4). The WAI-ARIA APG tree pattern over hierarchical data: expand and
 * collapse, single or multiple selection, checkboxes with tri-state (mixed) parents, lazy
 * children loaded through an async hook (loading and error states on the parent node),
 * type-ahead, Home/End, `*` to expand siblings, drag-and-drop reordering and reparenting
 * with a keyboard alternative (cut and paste, Alt+Up/Down), inline rename (a text input,
 * never HTML), icons per node, and a filter that keeps the paths to matches visible.
 *
 * The visible nodes are rendered as a flat, virtualized list (the shared windowing engine in
 * `internal/windowing.ts`): every treeitem carries aria-level, aria-posinset, and aria-setsize,
 * so 10,000+ visible nodes cost only the rendered window. The focused node always stays
 * rendered. Rows are positioned through CSS custom properties (CSP-safe).
 */
import { configurationError, createId, defineComponentConfig, emit, formatNumber, getMessage, registerMessages, validators, DisposableGroup, type Density } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, createTypeahead, isPrintableKey, observeResize, trackPointerDrag, type PointerDrag } from '@absoluteui/utilities';
import { findSubstring, foldText, highlightText, type MatchRange } from '../internal/highlight.js';
import { Windowing, type WindowRange } from '../internal/windowing.js';

export type TreeViewSelection = 'none' | 'single' | 'multiple';
export type TreeViewDropPosition = 'before' | 'inside' | 'after';

export interface TreeViewConfig {
  /** Rows rendered beyond each edge of the visible area. */
  overscan: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    treeView: TreeViewConfig & { locale: string; density: Density };
  }
}

export const treeViewConfig = defineComponentConfig<TreeViewConfig, 'locale' | 'density'>(
  'treeView',
  { overscan: { default: 8, expected: 'integer 0 to 100', validate: validators.integerInRange(0, 100) } },
  ['locale', 'density'],
);

registerMessages('treeView', 'en', {
  empty: 'No items',
  noMatches: 'No matching items',
  matches: '{count} matching items',
  matchesOne: '1 matching item',
  loading: 'Loading {label}',
  loaded: '{label} loaded',
  loadFailed: 'Could not load. Press Enter to retry.',
  loadFailedAnnounce: 'Could not load the items of {label}.',
  renameLabel: 'Rename {label}',
  renamed: 'Renamed to {label}',
  cut: '{label} cut. Move to a node and press Ctrl+V to paste inside it, or Ctrl+Shift+V to paste after it. Escape cancels.',
  cutCancelled: 'Move cancelled',
  moved: '{label} moved into {target}',
  movedRoot: '{label} moved to the top level',
  moveDenied: '{label} cannot be moved there',
  position: '{label}, position {position} of {total}',
});

export interface TreeNode {
  /** Unique, stable id (used by selection, checked, expanded, and events). */
  readonly id: string;
  /** Text label (rendered as text, never as HTML). */
  readonly label: string;
  /** Icon before the label. */
  readonly icon?: IconRef;
  /** Icon while expanded (for example an open folder). Default: `icon`. */
  readonly expandedIcon?: IconRef;
  /** Child nodes. Leave out and set `hasChildren` to load them lazily. */
  readonly children?: readonly TreeNode[];
  /** The node has children that `loadChildren` loads on first expansion. */
  readonly hasChildren?: boolean;
  /** Not selectable, checkable, draggable, or renamable; still focusable and expandable. */
  readonly disabled?: boolean;
}

/** Context of `loadChildren`: aborted when the tree is destroyed or the node is reloaded. */
export interface TreeViewLoadContext {
  readonly signal: AbortSignal;
}

export interface TreeViewIcons {
  /** Twisty of a collapsed parent (points to the inline end; mirrored in RTL). */
  expand: IconRef;
  loading: IconRef;
  error: IconRef;
}

export interface TreeViewOptions extends Partial<TreeViewConfig> {
  /** Accessible name of the tree, such as "Documents". */
  label: string;
  nodes: readonly TreeNode[];
  /** `none` (default), `single`, or `multiple`. */
  selection?: TreeViewSelection;
  /** Ids of the selected nodes. */
  selected?: readonly string[];
  /** Show a checkbox per node. Space toggles it. */
  checkboxes?: boolean;
  /** Ids of the checked nodes. */
  checked?: readonly string[];
  /** Checking a parent checks its descendants, and parents show the mixed state. Default true. */
  cascade?: boolean;
  /** Ids of the expanded nodes. */
  expanded?: readonly string[];
  /** Load the children of a node with `hasChildren` on its first expansion. */
  loadChildren?: ((node: TreeNode, context: TreeViewLoadContext) => Promise<readonly TreeNode[]>) | null;
  /** Nodes can be moved by dragging and with the keyboard (Ctrl+X / Ctrl+V, Alt+Up / Alt+Down). Default false. */
  draggable?: boolean;
  /** Which nodes may be moved (with `draggable`). Default: every enabled node. */
  canDrag?: (node: TreeNode) => boolean;
  /** Whether `source` may be dropped at `position` relative to `target` (`null` target: the top level). */
  canDrop?: (source: TreeNode, target: TreeNode | null, position: TreeViewDropPosition) => boolean;
  /** Nodes can be renamed with F2 or a double click: `true` for every enabled node, or a predicate. */
  renamable?: boolean | ((node: TreeNode) => boolean);
  /** Show only nodes whose label contains this text, plus the paths to them (case and accent insensitive). */
  filter?: string;
  /** Custom filter match (replaces the label match). */
  filterBy?: (node: TreeNode, query: string) => boolean;
  /** Row height in CSS pixels. Default by density: 32, 40, or 48. */
  itemHeight?: number;
  /** Block size of the scroll area as a CSS length, or `null` to fill the host. Default `'20rem'`. */
  height?: string | null;
  /** Text shown when there are no nodes. */
  empty?: string;
  direction?: 'ltr' | 'rtl';
  locale?: string;
  density?: Density;
  icons?: Partial<TreeViewIcons>;
}

/** `aui-select` detail: the selected ids after the user's change, and the node that changed. */
export interface TreeViewSelectDetail {
  selected: string[];
  id: string;
}

/** `aui-change` detail: the checked and mixed ids after the user toggled a checkbox. */
export interface TreeViewChangeDetail {
  checked: string[];
  indeterminate: string[];
  id: string;
}

/** `aui-expand` detail: the node, whether it is now open, and every expanded id. */
export interface TreeViewExpandDetail {
  id: string;
  open: boolean;
  expanded: string[];
}

/** `aui-move` detail (cancelable): where the node goes; `parentId` null is the top level. */
export interface TreeViewMoveDetail {
  id: string;
  parentId: string | null;
  index: number;
  previousParentId: string | null;
  previousIndex: number;
  /** How the user moved it. */
  source: 'pointer' | 'keyboard';
}

/** `aui-rename` detail (cancelable): the new and previous label. */
export interface TreeViewRenameDetail {
  id: string;
  label: string;
  previousLabel: string;
}

/** `aui-activate` detail: the node activated with Enter or a double click. */
export interface TreeViewActivateDetail {
  id: string;
  node: TreeNode;
}

/** `aui-load-error` detail. */
export interface TreeViewLoadErrorDetail {
  id: string;
  error: unknown;
}

interface Item {
  readonly id: string;
  label: string;
  source: TreeNode;
  parent: Item | null;
  /** Loaded children; null when none are known (a leaf, or lazy children not loaded yet). */
  children: Item[] | null;
  lazy: boolean;
  load: 'idle' | 'loading' | 'error';
  abort: AbortController | null;
}

interface Flat {
  readonly item: Item;
  readonly level: number;
  readonly pos: number;
  readonly size: number;
}

interface Row {
  readonly el: HTMLDivElement;
  index: number;
}

interface Drop {
  target: Item | null;
  position: TreeViewDropPosition;
}

const HEIGHT_BY_DENSITY: Readonly<Record<Density, number>> = { compact: 32, comfortable: 40, spacious: 48 };
const SELECTIONS: readonly TreeViewSelection[] = ['none', 'single', 'multiple'];
const MAX_NODES = 500_000;
const MAX_LABEL = 255;
const CSS_LENGTH = /^(?:0|\d+(?:\.\d+)?(?:px|rem|em|vh|svh|dvh|lvh|%|ch|lh|cqh))$/;
const EDGE = 32;

export class TreeView {
  readonly host: HTMLElement;
  #options: TreeViewOptions;
  readonly #doc: Document;
  readonly #id = createId('aui-tree');
  readonly #viewport: HTMLDivElement;
  readonly #canvas: HTMLDivElement;
  readonly #indicator: HTMLDivElement;
  readonly #empty: HTMLDivElement;
  readonly #win: Windowing;
  readonly #rows = new Map<number, Row>();
  readonly #pool: HTMLDivElement[] = [];
  readonly #group = new DisposableGroup();
  readonly #typeahead = createTypeahead();
  readonly #items = new Map<string, Item>();
  #roots: Item[] = [];
  #flat: Flat[] = [];
  readonly #flatIndex = new Map<Item, number>();
  #expanded = new Set<string>();
  #selected = new Set<string>();
  #checked = new Set<string>();
  #mixed = new Set<string>();
  #matches: Set<Item> | null = null;
  #paths: Set<Item> | null = null;
  #active: Item | null = null;
  #anchor: Item | null = null;
  #cut: Item | null = null;
  #editing: { item: Item; input: HTMLInputElement } | null = null;
  #drag: PointerDrag | null = null;
  #dragging: Item | null = null;
  #drop: Drop | null = null;
  #dragY = 0;
  /** Target of the last pointerdown: pointer capture during a drag retargets the click to the viewport. */
  #pressTarget: EventTarget | null = null;
  #announceTimer: ReturnType<typeof setTimeout> | undefined;
  #scrollFrame = 0;
  #frame = 0;
  #range: WindowRange = { start: 0, end: 0 };
  #resolved: Readonly<TreeViewConfig & { locale: string; density: Density }>;
  #estimate: number;

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: TreeViewOptions): TreeView {
    return new TreeView(host, options);
  }

  private constructor(host: HTMLElement, options: TreeViewOptions) {
    TreeView.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#resolved = this.#resolve();
    this.#estimate = this.#itemHeight();
    this.#build(options.nodes);
    this.#expanded = new Set(options.expanded ?? []);
    this.#selected = new Set(options.selected ?? []);
    this.#checked = new Set(options.checked ?? []);
    if (this.#cascade()) this.#pushDown();
    this.#normalizeChecks();
    this.#win = new Windowing(0, this.#estimate);
    const doc = this.#doc;
    this.#viewport = doc.createElement('div');
    this.#viewport.className = 'aui-tree-view__viewport';
    this.#viewport.id = `${this.#id}-tree`;
    this.#viewport.setAttribute('role', 'tree');
    this.#canvas = doc.createElement('div');
    this.#canvas.className = 'aui-tree-view__canvas';
    this.#canvas.setAttribute('role', 'none');
    this.#indicator = doc.createElement('div');
    this.#indicator.className = 'aui-tree-view__drop';
    this.#indicator.setAttribute('aria-hidden', 'true');
    this.#indicator.hidden = true;
    this.#viewport.append(this.#canvas);
    this.#empty = doc.createElement('div');
    this.#empty.className = 'aui-tree-view__empty';
    this.#empty.setAttribute('role', 'status');

    this.#flatten();
    this.#win.reset(this.#flat.length, this.#estimate);
    this.#render();
    host.classList.add('aui-tree-view');
    host.replaceChildren(this.#viewport, this.#empty);
    this.#paint();

    const vp = this.#viewport;
    const g = this.#group;
    g.listen(vp, 'pointerdown', (event) => {
      this.#pressTarget = event.target;
    }, { capture: true });
    g.listen(vp, 'scroll', () => {
      this.#schedule();
    }, { passive: true });
    g.listen(vp, 'keydown', (event) => {
      this.#onKey(event);
    });
    g.listen(vp, 'click', (event) => {
      this.#onClick(event);
    });
    g.listen(vp, 'dblclick', (event) => {
      this.#onDoubleClick(event);
    });
    g.listen(vp, 'focusin', (event) => {
      const index = this.#indexOf(event.target);
      const item = this.#flat[index]?.item;
      if (item && item !== this.#active) {
        this.#active = item;
        this.#syncRows();
      }
    });
    g.add(observeResize(vp, () => {
      this.#schedule();
    }));
    g.add(treeViewConfig.subscribe(() => {
      this.#resolved = this.#resolve();
      this.#relayout();
    }));
    this.#setupDrag();
    g.add(() => {
      const view = this.#doc.defaultView;
      if (this.#frame) view?.cancelAnimationFrame(this.#frame);
      if (this.#scrollFrame) view?.cancelAnimationFrame(this.#scrollFrame);
      this.#typeahead.reset();
      clearTimeout(this.#announceTimer);
      this.#drag?.dispose();
      for (const item of this.#items.values()) item.abort?.abort();
    });
  }

  get options(): Readonly<TreeViewOptions> {
    return this.#options;
  }

  /** The current tree, including loaded children, moves, and renames. */
  get nodes(): TreeNode[] {
    return this.#roots.map((item) => this.#toNode(item));
  }

  get selected(): string[] {
    return [...this.#selected];
  }

  get checked(): string[] {
    return [...this.#checked];
  }

  /** Ids of parents shown in the mixed checkbox state. */
  get indeterminate(): string[] {
    return [...this.#mixed];
  }

  get expanded(): string[] {
    return [...this.#expanded];
  }

  /** Ids of the nodes matching `filter`, in visible order (empty without a filter). */
  get matches(): string[] {
    const matches = this.#matches;
    return matches ? this.#flat.filter((f) => matches.has(f.item)).map((f) => f.item.id) : [];
  }

  /** Number of visible (rendered or scrollable) nodes. */
  get visibleCount(): number {
    return this.#flat.length;
  }

  /** Id of the focusable node, or null. */
  get activeId(): string | null {
    return this.#active?.id ?? null;
  }

  /** The visible rows `[start, end)`. */
  get range(): WindowRange {
    return this.#range;
  }

  /** A node of the current tree, or null when it is unknown (or not loaded yet). */
  getNode(id: string): TreeNode | null {
    const item = this.#items.get(id);
    return item ? this.#toNode(item) : null;
  }

  /** The id of a node's parent (null for top-level and unknown nodes). */
  getParentId(id: string): string | null {
    return this.#items.get(id)?.parent?.id ?? null;
  }

  /** The rendered treeitem of a node, or null when it is not rendered. */
  getItemElement(id: string): HTMLElement | null {
    const item = this.#items.get(id);
    if (!item) return null;
    const index = this.#flatIndex.get(item);
    return index === undefined ? null : (this.#rows.get(index)?.el ?? null);
  }

  /** Expand a node (loading lazy children) and its ancestors. Resolves when loaded. */
  async expand(id: string): Promise<void> {
    const item = this.#items.get(id);
    if (!item) return;
    for (let p = item.parent; p; p = p.parent) this.#expanded.add(p.id);
    await this.#open(item, false);
  }

  collapse(id: string): void {
    const item = this.#items.get(id);
    if (item) this.#close(item, false);
  }

  /** Expand every loaded parent (lazy nodes are not loaded). */
  expandAll(): void {
    for (const item of this.#items.values()) if (this.#isParent(item) && item.children) this.#expanded.add(item.id);
    this.#refreshFlat();
  }

  collapseAll(): void {
    this.#expanded.clear();
    this.#refreshFlat();
  }

  /** Select by ids (no event). */
  setSelected(ids: readonly string[]): void {
    this.update({ selected: ids });
  }

  /** Check by ids (no event). */
  setChecked(ids: readonly string[]): void {
    this.update({ checked: ids });
  }

  /** Focus a node, expanding its ancestors and scrolling it into view. */
  focusNode(id: string): void {
    const item = this.#items.get(id);
    if (!item) return;
    this.#reveal(item);
    this.#setActive(item, true);
  }

  /** Scroll a node into view, expanding its ancestors. */
  scrollToNode(id: string, align: 'auto' | 'start' | 'center' | 'end' = 'auto'): void {
    const item = this.#items.get(id);
    if (!item) return;
    this.#reveal(item);
    const index = this.#flatIndex.get(item);
    if (index === undefined) return;
    const vp = this.#viewport;
    vp.scrollTop = this.#win.scrollFor(index, vp.scrollTop, vp.clientHeight, align);
    this.#paint();
  }

  /** Load a lazy node's children again (after an error or a server change). */
  async reload(id: string): Promise<void> {
    const item = this.#items.get(id);
    if (!item || !(item.lazy || item.source.hasChildren === true)) return;
    item.abort?.abort();
    this.#dropChildren(item);
    item.children = null;
    item.lazy = true;
    item.load = 'idle';
    await this.#open(item, false);
  }

  /** Start renaming a node (when it is renamable). */
  rename(id: string): void {
    const item = this.#items.get(id);
    if (!item) return;
    this.#reveal(item);
    this.#startRename(item);
  }

  update(options: Partial<TreeViewOptions>): void {
    const next = { ...this.#options, ...options };
    TreeView.#assert(next);
    const previous = this.#options;
    this.#options = next;
    this.#resolved = this.#resolve();
    if (options.nodes !== undefined && options.nodes !== previous.nodes) {
      this.#cancelRename();
      for (const item of this.#items.values()) item.abort?.abort();
      const activeId = this.#active?.id;
      this.#build(options.nodes);
      this.#active = activeId === undefined ? null : (this.#items.get(activeId) ?? null);
      this.#anchor = null;
      this.#cut = null;
    }
    if (options.expanded !== undefined) this.#expanded = new Set(options.expanded);
    if (options.selected !== undefined) this.#selected = new Set(options.selected);
    if (options.checked !== undefined) {
      this.#checked = new Set(options.checked);
      if (this.#cascade()) this.#pushDown();
    }
    this.#normalizeChecks();
    if ((next.selection ?? 'none') === 'none') this.#selected.clear();
    if (next.selection === 'single' && this.#selected.size > 1) this.#selected = new Set([...this.#selected].slice(0, 1));
    const sizing = options.itemHeight !== undefined || options.density !== undefined;
    if (sizing) this.#relayout();
    else this.#refreshFlat(true);
    if (options.filter !== undefined && options.filter !== previous.filter) this.#announceMatches();
  }

  /** Announce the number of matches shortly after the filter stops changing. */
  #announceMatches(): void {
    clearTimeout(this.#announceTimer);
    this.#announceTimer = setTimeout(() => {
      const matches = this.#matches;
      if (!matches || this.#group.disposed) return;
      const n = matches.size;
      const text = n === 0 ? this.#m('noMatches') : n === 1 ? this.#m('matchesOne') : this.#m('matches', { count: formatNumber(n, {}, this.#resolved.locale) });
      announce(text, 'polite', this.#doc);
    }, 400);
  }

  destroy(): void {
    this.#cancelRename();
    this.#group.dispose();
    this.#rows.clear();
    this.#pool.length = 0;
    this.host.replaceChildren();
    this.host.classList.remove('aui-tree-view', 'aui-tree-view--fill', 'aui-tree-view--empty', 'aui-tree-view--checkboxes', 'aui-tree-view--dragging');
    for (const p of ['--_aui-tree-view-height', '--_aui-tree-view-item']) this.host.style.removeProperty(p);
  }

  static #assert(o: TreeViewOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('TREE_VIEW_OPTIONS', 'Invalid tree view options.', { component: 'tree-view', property: `treeView.${property}`, expected });
    };
    const label: unknown = o.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string');
    const nodes: unknown = o.nodes;
    if (!Array.isArray(nodes)) fail('nodes', 'array of { id, label, children? }');
    const seen = new Set<string>();
    const stack: { list: readonly unknown[]; path: string }[] = [{ list: o.nodes, path: 'nodes' }];
    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) break;
      for (const [i, n] of frame.list.entries()) {
        const path = `${frame.path}[${String(i)}]`;
        if (typeof n !== 'object' || n === null) fail(path, '{ id: string, label: string }');
        const node = n as { id?: unknown; label?: unknown; children?: unknown; hasChildren?: unknown };
        if (typeof node.id !== 'string' || node.id === '') fail(`${path}.id`, 'non-empty string');
        if (typeof node.label !== 'string') fail(`${path}.label`, 'string');
        const id = node.id as string;
        if (seen.has(id)) fail(`${path}.id`, `unique id (duplicate "${id}")`);
        seen.add(id);
        if (seen.size > MAX_NODES) fail('nodes', `at most ${String(MAX_NODES)} nodes`);
        if (node.children !== undefined) {
          if (!Array.isArray(node.children)) fail(`${path}.children`, 'array of nodes');
          stack.push({ list: node.children as unknown[], path: `${path}.children` });
        }
        if (node.hasChildren !== undefined && typeof node.hasChildren !== 'boolean') fail(`${path}.hasChildren`, 'boolean');
      }
    }
    if (o.selection !== undefined && !SELECTIONS.includes(o.selection)) fail('selection', '"none" | "single" | "multiple"');
    for (const name of ['selected', 'checked', 'expanded'] as const) {
      const v: unknown = o[name];
      if (v !== undefined && (!Array.isArray(v) || !v.every((x) => typeof x === 'string'))) fail(name, 'array of node ids (strings)');
    }
    if (o.selection === 'single' && (o.selected?.length ?? 0) > 1) fail('selected', 'at most one id with single selection');
    const fns: [string, unknown][] = [['canDrag', o.canDrag], ['canDrop', o.canDrop], ['filterBy', o.filterBy]];
    for (const [name, fn] of fns) if (fn !== undefined && typeof fn !== 'function') fail(name, 'function');
    const load: unknown = o.loadChildren;
    if (load != null && typeof load !== 'function') fail('loadChildren', 'function (node, { signal }) => Promise<nodes> or null');
    const renamable: unknown = o.renamable;
    if (renamable !== undefined && typeof renamable !== 'boolean' && typeof renamable !== 'function') fail('renamable', 'boolean or function (node) => boolean');
    for (const name of ['checkboxes', 'cascade', 'draggable'] as const) {
      const v: unknown = o[name];
      if (v !== undefined && typeof v !== 'boolean') fail(name, 'boolean');
    }
    const filter: unknown = o.filter;
    if (filter !== undefined && typeof filter !== 'string') fail('filter', 'string');
    const h: unknown = o.itemHeight;
    if (h !== undefined && (typeof h !== 'number' || !Number.isFinite(h) || h < 24 || h > 200)) fail('itemHeight', 'number of pixels from 24 to 200');
    const height: unknown = o.height;
    if (height !== undefined && height !== null && (typeof height !== 'string' || !CSS_LENGTH.test(height.trim()))) fail('height', "CSS length such as '20rem' or '400px', or null");
    const dir: unknown = o.direction;
    if (dir !== undefined && dir !== 'ltr' && dir !== 'rtl') fail('direction', '"ltr" | "rtl"');
    const empty: unknown = o.empty;
    if (empty !== undefined && typeof empty !== 'string') fail('empty', 'string');
  }

  #resolve(): Readonly<TreeViewConfig & { locale: string; density: Density }> {
    const o = this.#options;
    return treeViewConfig.resolve({
      ...(o.overscan === undefined ? {} : { overscan: o.overscan }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.density === undefined ? {} : { density: o.density }),
    });
  }

  #m(id: string, params: Record<string, string> = {}): string {
    return getMessage('treeView', id, params, this.#resolved.locale);
  }

  #itemHeight(): number {
    return this.#options.itemHeight ?? HEIGHT_BY_DENSITY[this.#resolved.density];
  }

  #cascade(): boolean {
    return this.#options.cascade !== false;
  }

  #rtl(): boolean {
    const dir = this.#options.direction ?? this.#doc.defaultView?.getComputedStyle(this.host).direction;
    return dir === 'rtl';
  }

  // ---- model -------------------------------------------------------------------------------

  #build(nodes: readonly TreeNode[]): void {
    this.#items.clear();
    this.#roots = this.#makeItems(nodes, null);
  }

  #makeItems(nodes: readonly TreeNode[], parent: Item | null): Item[] {
    return nodes.map((node) => {
      const item: Item = { id: node.id, label: node.label, source: node, parent, children: null, lazy: false, load: 'idle', abort: null };
      this.#items.set(node.id, item);
      if (node.children) item.children = this.#makeItems(node.children, item);
      else if (node.hasChildren === true) item.lazy = true;
      return item;
    });
  }

  #dropChildren(item: Item): void {
    for (const child of item.children ?? []) {
      this.#dropChildren(child);
      child.abort?.abort();
      this.#items.delete(child.id);
    }
  }

  #toNode(item: Item): TreeNode {
    // Keep application properties of the node; children and hasChildren reflect the current state.
    const node: { -readonly [K in keyof TreeNode]: TreeNode[K] } = { ...item.source, label: item.label };
    delete node.children;
    delete node.hasChildren;
    if (item.children) return { ...node, children: item.children.map((c) => this.#toNode(c)) };
    return item.lazy ? { ...node, hasChildren: true } : node;
  }

  #isParent(item: Item): boolean {
    return item.lazy || (item.children?.length ?? 0) > 0;
  }

  #disabled(item: Item): boolean {
    return item.source.disabled === true;
  }

  #siblings(item: Item): Item[] {
    return item.parent ? (item.parent.children ?? []) : this.#roots;
  }

  #isAncestor(ancestor: Item, item: Item | null): boolean {
    for (let p = item; p; p = p.parent) if (p === ancestor) return true;
    return false;
  }

  /** Check the enabled descendants of checked nodes (cascade). */
  #pushDown(): void {
    const visit = (item: Item, on: boolean): void => {
      const here = on || this.#checked.has(item.id);
      if (here && !this.#disabled(item)) this.#checked.add(item.id);
      for (const child of item.children ?? []) visit(child, here);
    };
    for (const root of this.#roots) visit(root, false);
  }

  /** Cascade: parents are checked when all enabled children are, and mixed when some are. */
  #normalizeChecks(): void {
    this.#mixed = new Set();
    if (!this.#cascade()) return;
    const state = (item: Item): 'all' | 'none' | 'some' => {
      const children = (item.children ?? []).filter((c) => !this.#disabled(c));
      if (children.length === 0) return this.#checked.has(item.id) ? 'all' : 'none';
      let all = true;
      let none = true;
      for (const child of children) {
        const s = state(child);
        if (s !== 'all') all = false;
        if (s !== 'none') none = false;
      }
      if (all) {
        if (!this.#disabled(item)) this.#checked.add(item.id);
        return 'all';
      }
      this.#checked.delete(item.id);
      if (!none) {
        this.#mixed.add(item.id);
        return 'some';
      }
      return 'none';
    };
    for (const root of this.#roots) state(root);
  }

  // ---- flattening and filter -----------------------------------------------------------------

  #computeFilter(): void {
    const o = this.#options;
    const query = (o.filter ?? '').trim();
    if (query === '') {
      this.#matches = null;
      this.#paths = null;
      return;
    }
    const locale = this.#resolved.locale;
    const q = foldText(query, locale);
    const matches = new Set<Item>();
    const paths = new Set<Item>();
    for (const item of this.#items.values()) {
      const hit = o.filterBy ? o.filterBy(this.#toNodeShallow(item), query) : foldText(item.label, locale).includes(q);
      if (!hit) continue;
      matches.add(item);
      for (let p: Item | null = item; p && !paths.has(p); p = p.parent) paths.add(p);
    }
    this.#matches = matches;
    this.#paths = paths;
  }

  /** A node without its children (for predicates; cheap). */
  #toNodeShallow(item: Item): TreeNode {
    return item.label === item.source.label ? item.source : { ...item.source, label: item.label };
  }

  #flatten(): void {
    this.#computeFilter();
    const flat: Flat[] = [];
    const paths = this.#paths;
    const walk = (list: readonly Item[], level: number): void => {
      const shown = paths ? list.filter((i) => paths.has(i)) : list;
      const size = shown.length;
      for (const [i, item] of shown.entries()) {
        flat.push({ item, level, pos: i + 1, size });
        if (!item.children) continue;
        // Filtering opens the paths to matches; a match shows its children only when expanded.
        const forced = paths !== null && item.children.some((c) => paths.has(c)) && !this.#matches?.has(item);
        if (forced || this.#expanded.has(item.id)) walk(item.children, level + 1);
      }
    };
    walk(this.#roots, 1);
    this.#flat = flat;
    this.#flatIndex.clear();
    for (const [i, f] of flat.entries()) this.#flatIndex.set(f.item, i);
    if (this.#active && !this.#flatIndex.has(this.#active)) {
      // The focused node was hidden (collapsed parent or filter): focus moves to its nearest visible ancestor.
      let p = this.#active.parent;
      while (p && !this.#flatIndex.has(p)) p = p.parent;
      this.#active = p;
    }
    if (!this.#active && flat.length > 0) this.#active = flat[0]?.item ?? null;
  }

  #isOpen(item: Item): boolean {
    if (!item.children) return false;
    if (this.#paths && item.children.some((c) => this.#paths?.has(c) === true) && !this.#matches?.has(item)) return true;
    return this.#expanded.has(item.id);
  }

  /** Expand the ancestors of a node so it is visible (and clear a filter that hides it). */
  #reveal(item: Item): void {
    let changed = false;
    for (let p = item.parent; p; p = p.parent) {
      if (!this.#expanded.has(p.id)) {
        this.#expanded.add(p.id);
        changed = true;
      }
    }
    if (changed || !this.#flatIndex.has(item)) this.#refreshFlat();
  }

  /** Flatten again and repaint (structure, expansion, or filter changed). */
  #refreshFlat(content = false): void {
    // Rows are keyed by index: when nodes above the focused one appear or go (a lazy load that
    // finishes later), its row element is refilled with another node. Focus follows the node.
    const focused = this.#doc.activeElement;
    const hadFocus = focused instanceof HTMLElement && focused.classList.contains('aui-tree-view__item') && this.#canvas.contains(focused);
    this.#flatten();
    this.#win.reset(this.#flat.length, this.#estimate);
    if (content) for (const row of [...this.#rows.values()]) this.#recycle(row);
    else for (const row of [...this.#rows.values()]) if (row.index >= this.#flat.length) this.#recycle(row);
    this.#render();
    this.#paint(true);
    if (hadFocus && this.#active) {
      const el = this.getItemElement(this.#active.id);
      if (el && el !== this.#doc.activeElement) el.focus({ preventScroll: true });
    }
  }

  // ---- rendering -----------------------------------------------------------------------------

  #render(): void {
    const o = this.#options;
    const host = this.host;
    const vp = this.#viewport;
    const count = this.#flat.length;
    const height = o.height === undefined ? '20rem' : o.height;
    host.classList.toggle('aui-tree-view--fill', height === null);
    if (height === null) host.style.removeProperty('--_aui-tree-view-height');
    else host.style.setProperty('--_aui-tree-view-height', height.trim());
    host.style.setProperty('--_aui-tree-view-item', `${String(this.#estimate)}px`);
    host.classList.toggle('aui-tree-view--checkboxes', o.checkboxes === true);
    host.classList.toggle('aui-tree-view--draggable', o.draggable === true);
    host.classList.toggle('aui-tree-view--empty', count === 0);
    vp.setAttribute('aria-label', o.label);
    if (o.selection === 'multiple') vp.setAttribute('aria-multiselectable', 'true');
    else vp.removeAttribute('aria-multiselectable');
    vp.hidden = count === 0;
    this.#empty.hidden = count !== 0;
    const filtering = this.#matches !== null;
    const text = filtering ? this.#m('noMatches') : (o.empty ?? this.#m('empty'));
    const want = count === 0 ? text : '';
    if (this.#empty.textContent !== want) this.#empty.textContent = want;
  }

  #relayout(): void {
    this.#estimate = this.#itemHeight();
    this.#refreshFlat(true);
  }

  #schedule(): void {
    const view = this.#doc.defaultView;
    if (!view || this.#frame) return;
    this.#frame = view.requestAnimationFrame(() => {
      this.#frame = 0;
      this.#paint();
    });
  }

  #recycle(row: Row): void {
    if (this.#editing && row.el.contains(this.#editing.input)) return;
    row.el.remove();
    row.el.replaceChildren();
    this.#rows.delete(row.index);
    this.#pool.push(row.el);
  }

  #paint(force = false): void {
    const count = this.#flat.length;
    const vp = this.#viewport;
    const view = vp.clientHeight > 0 ? vp.clientHeight : this.#estimate * 12;
    const rendered = this.#win.rendered(vp.scrollTop, view, this.#resolved.overscan);
    const wanted = new Set<number>();
    for (let i = rendered.start; i < rendered.end; i++) wanted.add(i);
    const activeIndex = this.#active ? this.#flatIndex.get(this.#active) : undefined;
    if (activeIndex !== undefined) wanted.add(activeIndex);
    const editIndex = this.#editing ? this.#flatIndex.get(this.#editing.item) : undefined;
    if (editIndex !== undefined) wanted.add(editIndex);
    // Rows are keyed by index; a structural change (force) re-fills every rendered row.
    for (const row of [...this.#rows.values()]) if (!wanted.has(row.index)) this.#recycle(row);
    const added: Row[] = [];
    for (const index of wanted) {
      const existing = this.#rows.get(index);
      if (existing) {
        if (force && existing.index < count) this.#fill(existing);
        continue;
      }
      const el = this.#pool.pop() ?? this.#doc.createElement('div');
      el.className = 'aui-tree-view__item';
      const row: Row = { el, index };
      this.#fill(row);
      this.#rows.set(index, row);
      added.push(row);
    }
    if (added.length > 0 || force) {
      const order = [...this.#rows.values()].sort((a, b) => a.index - b.index);
      let cursor = this.#canvas.firstElementChild;
      for (const row of order) {
        if (row.el === cursor) cursor = cursor.nextElementSibling;
        else this.#canvas.insertBefore(row.el, cursor);
      }
    }
    this.#syncRows();
    this.#position();
    const visible = this.#win.visible(vp.scrollTop, view);
    if (visible.start !== this.#range.start || visible.end !== this.#range.end) {
      this.#range = visible;
      emit(this.host, 'aui-range-change', { start: visible.start, end: visible.end }, { bubbles: false });
    }
  }

  #position(): void {
    this.#viewport.style.setProperty('--_aui-tree-view-total', `${String(this.#win.total)}px`);
    for (const row of this.#rows.values()) row.el.style.setProperty('--_aui-tree-view-y', `${String(this.#win.offsetOf(row.index))}px`);
  }

  /** Build the content of a row from its flat entry. */
  #fill(row: Row): void {
    const flat = this.#flat[row.index];
    if (!flat) return;
    if (this.#editing && this.#editing.item === flat.item && row.el.contains(this.#editing.input)) return;
    const { item, level } = flat;
    const doc = this.#doc;
    const o = this.#options;
    const icons = o.icons ?? {};
    const el = row.el;
    el.style.setProperty('--_aui-tree-view-level', String(level - 1));
    const twisty = doc.createElement('span');
    twisty.className = 'aui-tree-view__twisty';
    twisty.setAttribute('aria-hidden', 'true');
    if (item.load === 'loading') twisty.append(renderIcon(icons.loading ?? 'spinner', { doc, className: 'aui-tree-view__spinner' }));
    else if (item.load === 'error') twisty.append(renderIcon(icons.error ?? 'alert-circle', { doc }));
    else if (this.#isParent(item)) twisty.append(renderIcon(icons.expand ?? 'chevron-right', { doc }));
    const parts: Node[] = [twisty];
    if (o.checkboxes === true) {
      const box = doc.createElement('span');
      box.className = 'aui-tree-view__check';
      box.setAttribute('aria-hidden', 'true');
      parts.push(box);
    }
    const iconRef = this.#isOpen(item) ? (item.source.expandedIcon ?? item.source.icon) : item.source.icon;
    if (iconRef !== undefined) {
      const icon = doc.createElement('span');
      icon.className = 'aui-tree-view__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.append(renderIcon(iconRef, { doc }));
      parts.push(icon);
    }
    const label = doc.createElement('span');
    label.className = 'aui-tree-view__label';
    const ranges = this.#matchRanges(item);
    if (ranges.length > 0) label.append(highlightText(doc, item.label, ranges, 'aui-tree-view__match'));
    else label.textContent = item.label;
    parts.push(label);
    if (item.load === 'error') {
      const error = doc.createElement('span');
      error.className = 'aui-tree-view__error';
      error.textContent = this.#m('loadFailed');
      parts.push(error);
    }
    el.replaceChildren(...parts);
  }

  #matchRanges(item: Item): MatchRange[] {
    if (!this.#matches?.has(item) || this.#options.filterBy) return [];
    const range = findSubstring(item.label, (this.#options.filter ?? '').trim(), this.#resolved.locale);
    return range ? [range] : [];
  }

  /** ARIA state, roving tabindex, and classes of the rendered rows. */
  #syncRows(): void {
    const o = this.#options;
    const selectable = (o.selection ?? 'none') !== 'none';
    const checkboxes = o.checkboxes === true;
    for (const row of this.#rows.values()) {
      const flat = this.#flat[row.index];
      if (!flat) continue;
      const { el } = row;
      const { item } = flat;
      el.setAttribute('role', 'treeitem');
      el.id = `${this.#id}-${String(row.index)}`;
      el.dataset.index = String(row.index);
      el.dataset.id = item.id;
      el.setAttribute('aria-level', String(flat.level));
      el.setAttribute('aria-posinset', String(flat.pos));
      el.setAttribute('aria-setsize', String(flat.size));
      if (this.#isParent(item)) el.setAttribute('aria-expanded', String(this.#isOpen(item)));
      else el.removeAttribute('aria-expanded');
      const selected = this.#selected.has(item.id);
      if (selectable) el.setAttribute('aria-selected', String(selected));
      else el.removeAttribute('aria-selected');
      el.classList.toggle('aui-tree-view__item--selected', selectable && selected);
      if (checkboxes) {
        const state = this.#mixed.has(item.id) ? 'mixed' : String(this.#checked.has(item.id));
        el.setAttribute('aria-checked', state);
        el.classList.toggle('aui-tree-view__item--checked', state === 'true');
        el.classList.toggle('aui-tree-view__item--mixed', state === 'mixed');
      } else {
        el.removeAttribute('aria-checked');
        el.classList.remove('aui-tree-view__item--checked', 'aui-tree-view__item--mixed');
      }
      if (this.#disabled(item)) el.setAttribute('aria-disabled', 'true');
      else el.removeAttribute('aria-disabled');
      if (item.load === 'loading') el.setAttribute('aria-busy', 'true');
      else el.removeAttribute('aria-busy');
      el.classList.toggle('aui-tree-view__item--open', this.#isOpen(item));
      el.classList.toggle('aui-tree-view__item--error', item.load === 'error');
      el.classList.toggle('aui-tree-view__item--cut', this.#cut === item);
      el.classList.toggle('aui-tree-view__item--dragging', this.#dragging === item);
      el.classList.toggle('aui-tree-view__item--drop-inside', this.#drop?.position === 'inside' && this.#drop.target === item);
      const active = item === this.#active;
      el.tabIndex = active ? 0 : -1;
      el.classList.toggle('aui-tree-view__item--active', active);
    }
  }

  // ---- expansion and lazy loading ------------------------------------------------------------

  async #open(item: Item, user: boolean): Promise<void> {
    if (!this.#isParent(item) && !item.lazy) return;
    if (item.lazy && !item.children) {
      if (item.load === 'loading') return;
      const loaded = await this.#load(item);
      if (!loaded) return;
    }
    if (this.#expanded.has(item.id) && this.#flatIndex.has(item) && this.#isOpen(item)) {
      this.#refreshFlat();
      return;
    }
    this.#expanded.add(item.id);
    this.#refreshFlat();
    if (user) this.#emitExpand(item, true);
  }

  #close(item: Item, user: boolean): void {
    if (!this.#expanded.has(item.id)) return;
    this.#expanded.delete(item.id);
    this.#refreshFlat();
    if (user) this.#emitExpand(item, false);
  }

  #emitExpand(item: Item, open: boolean): void {
    emit(this.host, 'aui-expand', { id: item.id, open, expanded: [...this.#expanded] } satisfies TreeViewExpandDetail);
  }

  /** Load lazy children. Returns true when they are available. */
  async #load(item: Item): Promise<boolean> {
    const load = this.#options.loadChildren;
    if (!load) {
      // No loader: the node has no children after all.
      item.lazy = false;
      item.children = [];
      this.#refreshFlat();
      return false;
    }
    const controller = new AbortController();
    item.abort = controller;
    item.load = 'loading';
    this.#syncRow(item);
    announce(this.#m('loading', { label: item.label }), 'polite', this.#doc);
    let nodes: readonly TreeNode[];
    try {
      nodes = await load(this.#toNode(item), { signal: controller.signal });
      if (!Array.isArray(nodes)) throw new TypeError('loadChildren must resolve to an array of nodes');
      TreeView.#assert({ label: 'x', nodes });
      for (const n of this.#allIds(nodes)) if (this.#items.has(n)) throw new TypeError(`duplicate node id "${n}"`);
    } catch (error) {
      if (controller.signal.aborted || this.#group.disposed) return false;
      item.abort = null;
      item.load = 'error';
      this.#syncRow(item);
      announce(this.#m('loadFailedAnnounce', { label: item.label }), 'assertive', this.#doc);
      emit(this.host, 'aui-load-error', { id: item.id, error } satisfies TreeViewLoadErrorDetail);
      return false;
    }
    if (controller.signal.aborted || this.#group.disposed) return false;
    item.abort = null;
    item.load = 'idle';
    item.lazy = false;
    item.children = this.#makeItems(nodes, item);
    // Children of a checked parent are checked too (cascade).
    if (this.#cascade() && this.#checked.has(item.id)) this.#pushDown();
    this.#normalizeChecks();
    announce(this.#m('loaded', { label: item.label }), 'polite', this.#doc);
    return true;
  }

  #allIds(nodes: readonly TreeNode[]): string[] {
    const out: string[] = [];
    const walk = (list: readonly TreeNode[]): void => {
      for (const n of list) {
        out.push(n.id);
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return out;
  }

  /** Re-render the row of one item, when it is rendered. */
  #syncRow(item: Item): void {
    const index = this.#flatIndex.get(item);
    const row = index === undefined ? undefined : this.#rows.get(index);
    if (row) this.#fill(row);
    this.#syncRows();
  }

  // ---- selection and checking ----------------------------------------------------------------

  #select(item: Item, mode: 'replace' | 'toggle' | 'range'): void {
    const selection = this.#options.selection ?? 'none';
    if (selection === 'none' || this.#disabled(item)) return;
    const before = new Set(this.#selected);
    if (selection === 'single' || mode === 'replace') {
      this.#selected = new Set([item.id]);
      this.#anchor = item;
    } else if (mode === 'toggle') {
      if (this.#selected.has(item.id)) this.#selected.delete(item.id);
      else this.#selected.add(item.id);
      this.#anchor = item;
    } else {
      const from = this.#anchor ? (this.#flatIndex.get(this.#anchor) ?? 0) : 0;
      const to = this.#flatIndex.get(item) ?? 0;
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      for (let i = lo; i <= hi; i++) {
        const it = this.#flat[i]?.item;
        if (it && !this.#disabled(it)) this.#selected.add(it.id);
      }
    }
    this.#syncRows();
    if (before.size !== this.#selected.size || [...before].some((k) => !this.#selected.has(k))) {
      emit(this.host, 'aui-select', { selected: [...this.#selected], id: item.id } satisfies TreeViewSelectDetail);
    }
  }

  #toggleCheck(item: Item): void {
    if (this.#options.checkboxes !== true || this.#disabled(item)) return;
    const on = !this.#checked.has(item.id) || this.#mixed.has(item.id);
    const apply = (it: Item): void => {
      if (this.#disabled(it)) return;
      if (on) this.#checked.add(it.id);
      else this.#checked.delete(it.id);
      if (this.#cascade()) for (const c of it.children ?? []) apply(c);
    };
    apply(item);
    this.#normalizeChecks();
    this.#syncRows();
    emit(this.host, 'aui-change', { checked: [...this.#checked], indeterminate: [...this.#mixed], id: item.id } satisfies TreeViewChangeDetail);
  }

  #selectAll(): void {
    if (this.#options.selection !== 'multiple') return;
    const enabled = this.#flat.filter((f) => !this.#disabled(f.item)).map((f) => f.item.id);
    const all = enabled.every((id) => this.#selected.has(id));
    this.#selected = all ? new Set() : new Set(enabled);
    this.#syncRows();
    emit(this.host, 'aui-select', { selected: [...this.#selected], id: this.#active?.id ?? '' } satisfies TreeViewSelectDetail);
  }

  #activate(item: Item): void {
    if (this.#disabled(item)) return;
    emit(this.host, 'aui-activate', { id: item.id, node: this.#toNode(item) } satisfies TreeViewActivateDetail);
  }

  // ---- focus and keyboard --------------------------------------------------------------------

  #indexOf(target: EventTarget | null): number {
    if (!(target instanceof Element)) return -1;
    const el = target.closest<HTMLElement>('.aui-tree-view__item');
    if (!el || !this.#canvas.contains(el)) return -1;
    const index = Number(el.dataset.index);
    return Number.isInteger(index) ? index : -1;
  }

  #setActive(item: Item, focus: boolean): void {
    this.#active = item;
    const index = this.#flatIndex.get(item);
    if (index !== undefined) {
      const vp = this.#viewport;
      vp.scrollTop = this.#win.scrollFor(index, vp.scrollTop, vp.clientHeight, 'auto');
    }
    this.#paint();
    if (focus) this.getItemElement(item.id)?.focus({ preventScroll: true });
  }

  #onKey(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const target = event.target;
    // Keys typed into the rename input belong to it.
    if (target instanceof HTMLInputElement) return;
    const count = this.#flat.length;
    if (count === 0) return;
    const current = this.#active ?? this.#flat[0]?.item;
    if (!current) return;
    const index = this.#flatIndex.get(current) ?? 0;
    const o = this.#options;
    const multiple = o.selection === 'multiple';
    const mod = event.ctrlKey || event.metaKey;
    const rtl = this.#rtl();
    const key = event.key;
    const go = (to: number): Item | null => this.#flat[Math.min(count - 1, Math.max(0, to))]?.item ?? null;
    const moveTo = (next: Item | null): void => {
      if (!next) return;
      event.preventDefault();
      this.#setActive(next, true);
      if (multiple && event.shiftKey) this.#select(next, 'range');
      else if (!event.shiftKey) this.#anchor = next;
    };
    if (o.draggable === true && mod && !event.altKey) {
      const k = key.toLowerCase();
      if (k === 'x') {
        event.preventDefault();
        this.#startCut(current);
        return;
      }
      if (k === 'v' && this.#cut) {
        event.preventDefault();
        void this.#paste(current, event.shiftKey ? 'after' : 'inside');
        return;
      }
    }
    if (o.draggable === true && event.altKey && !mod && (key === 'ArrowUp' || key === 'ArrowDown')) {
      event.preventDefault();
      this.#nudge(current, key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (multiple && mod && key.toLowerCase() === 'a') {
      event.preventDefault();
      this.#selectAll();
      return;
    }
    switch (key) {
      case 'ArrowDown':
        moveTo(go(index + 1));
        return;
      case 'ArrowUp':
        moveTo(go(index - 1));
        return;
      case 'Home':
        moveTo(go(0));
        return;
      case 'End':
        moveTo(go(count - 1));
        return;
      case 'PageDown':
      case 'PageUp': {
        const page = Math.max(1, this.#range.end - this.#range.start - 1);
        moveTo(go(index + (key === 'PageDown' ? page : -page)));
        return;
      }
      case 'ArrowRight':
      case 'ArrowLeft': {
        event.preventDefault();
        const forward = (key === 'ArrowRight') !== rtl;
        if (forward) {
          if (current.load === 'error') void this.reload(current.id);
          else if (this.#isParent(current) && !this.#isOpen(current)) void this.#open(current, true);
          else if (this.#isOpen(current)) {
            const first = this.#flat[index + 1]?.item;
            if (first?.parent === current) this.#setActive(first, true);
          }
        } else if (this.#isOpen(current)) this.#close(current, true);
        else if (current.parent && this.#flatIndex.has(current.parent)) this.#setActive(current.parent, true);
        return;
      }
      case 'Enter':
        event.preventDefault();
        if (current.load === 'error') {
          void this.reload(current.id);
          return;
        }
        if (o.selection === 'single') this.#select(current, 'replace');
        this.#activate(current);
        return;
      case ' ':
        event.preventDefault();
        if (o.checkboxes === true) this.#toggleCheck(current);
        else if (multiple) this.#select(current, event.shiftKey ? 'range' : 'toggle');
        else this.#select(current, 'replace');
        return;
      case '*':
        event.preventDefault();
        void this.#expandSiblings(current);
        return;
      case 'F2':
        event.preventDefault();
        this.#startRename(current);
        return;
      case 'Escape':
        if (this.#cut) {
          event.preventDefault();
          this.#cut = null;
          this.#syncRows();
          announce(this.#m('cutCancelled'), 'polite', this.#doc);
        }
        return;
      default:
        break;
    }
    if (!mod && !event.altKey && isPrintableKey(event)) {
      const labels = this.#flat.map((f) => f.item.label);
      const found = this.#typeahead.handle(key, labels, index, () => false);
      const next = found >= 0 ? this.#flat[found]?.item : undefined;
      if (next) {
        event.preventDefault();
        this.#setActive(next, true);
        this.#anchor = next;
      }
    }
  }

  async #expandSiblings(item: Item): Promise<void> {
    const parents = this.#siblings(item).filter((s) => this.#isParent(s) && (!this.#paths || this.#paths.has(s)));
    const lazy = parents.filter((s) => s.lazy && !s.children);
    for (const s of parents) if (s.children) this.#expanded.add(s.id);
    this.#refreshFlat();
    for (const s of parents) if (s.children) this.#emitExpand(s, true);
    await Promise.all(lazy.map((s) => this.#open(s, true)));
  }

  #eventTarget(event: MouseEvent): EventTarget | null {
    return event.target === this.#viewport && this.#pressTarget instanceof Node && this.#viewport.contains(this.#pressTarget) ? this.#pressTarget : event.target;
  }

  #onClick(event: MouseEvent): void {
    const target = this.#eventTarget(event);
    const index = this.#indexOf(target);
    const item = this.#flat[index]?.item;
    if (!item || !(target instanceof Element)) return;
    if (target instanceof HTMLInputElement) return;
    this.#setActive(item, true);
    if (target.closest('.aui-tree-view__twisty')) {
      if (item.load === 'error') void this.reload(item.id);
      else if (this.#isOpen(item)) this.#close(item, true);
      else void this.#open(item, true);
      return;
    }
    if (this.#options.checkboxes === true && (target.closest('.aui-tree-view__check') || (this.#options.selection ?? 'none') === 'none')) {
      this.#toggleCheck(item);
      return;
    }
    const multiple = this.#options.selection === 'multiple';
    if (multiple) this.#select(item, event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'replace');
    else this.#select(item, 'replace');
  }

  #onDoubleClick(event: MouseEvent): void {
    const target = this.#eventTarget(event);
    const index = this.#indexOf(target);
    const item = this.#flat[index]?.item;
    if (!item || target instanceof HTMLInputElement) return;
    if (target instanceof Element && target.closest('.aui-tree-view__twisty, .aui-tree-view__check')) return;
    if (this.#canRename(item) && target instanceof Element && target.closest('.aui-tree-view__label')) {
      this.#startRename(item);
      return;
    }
    if (this.#isParent(item)) {
      if (this.#isOpen(item)) this.#close(item, true);
      else void this.#open(item, true);
    }
    this.#activate(item);
  }

  // ---- rename --------------------------------------------------------------------------------

  #canRename(item: Item): boolean {
    const r = this.#options.renamable;
    if (r === undefined || r === false || this.#disabled(item)) return false;
    return r === true ? true : r(this.#toNodeShallow(item));
  }

  #startRename(item: Item): void {
    if (!this.#canRename(item) || this.#editing) return;
    this.#setActive(item, false);
    const el = this.getItemElement(item.id);
    const label = el?.querySelector('.aui-tree-view__label');
    if (!el || !label) return;
    const input = this.#doc.createElement('input');
    input.type = 'text';
    input.className = 'aui-tree-view__input';
    input.value = item.label;
    input.maxLength = MAX_LABEL;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', this.#m('renameLabel', { label: item.label }));
    label.replaceWith(input);
    this.#editing = { item, input };
    let done = false;
    const finish = (commit: boolean): void => {
      if (done) return;
      done = true;
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('blur', onBlur);
      const value = input.value.trim();
      this.#editing = null;
      const focusBack = this.#doc.activeElement === input || this.#viewport.contains(this.#doc.activeElement);
      if (commit && value !== '' && value !== item.label) {
        const proceed = emit(this.host, 'aui-rename', { id: item.id, label: value, previousLabel: item.label } satisfies TreeViewRenameDetail, { cancelable: true });
        if (proceed) {
          item.label = value;
          announce(this.#m('renamed', { label: value }), 'polite', this.#doc);
        }
      }
      if (this.#group.disposed) return;
      this.#refreshFlat(true);
      if (focusBack) this.getItemElement(item.id)?.focus({ preventScroll: true });
    };
    const onKey = (event: KeyboardEvent): void => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    };
    const onBlur = (): void => {
      finish(true);
    };
    input.addEventListener('keydown', onKey);
    input.addEventListener('blur', onBlur);
    this.#cancelEdit = () => {
      finish(false);
    };
    input.focus();
    input.select();
  }

  #cancelEdit: (() => void) | null = null;

  #cancelRename(): void {
    const cancel = this.#cancelEdit;
    this.#cancelEdit = null;
    if (this.#editing) cancel?.();
  }

  // ---- moving --------------------------------------------------------------------------------

  #canDragItem(item: Item): boolean {
    if (this.#options.draggable !== true || this.#disabled(item)) return false;
    return this.#options.canDrag ? this.#options.canDrag(this.#toNodeShallow(item)) : true;
  }

  /** Whether `source` may go to `position` of `target`; resolves the new parent and index. */
  #placement(source: Item, target: Item | null, position: TreeViewDropPosition): { parent: Item | null; index: number } | null {
    if (target === source) return null;
    if (target && this.#isAncestor(source, target)) return null;
    if (position === 'inside' && target && this.#disabled(target)) return null;
    const allowed = this.#options.canDrop ? this.#options.canDrop(this.#toNodeShallow(source), target ? this.#toNodeShallow(target) : null, position) : true;
    if (!allowed) return null;
    if (position === 'inside') return { parent: target, index: target?.children?.length ?? (target ? 0 : this.#roots.length) };
    if (!target) return null;
    const parent = target.parent;
    const list = this.#siblings(target).filter((s) => s !== source);
    const at = list.indexOf(target);
    return { parent, index: position === 'before' ? at : at + 1 };
  }

  async #moveTo(source: Item, target: Item | null, position: TreeViewDropPosition, how: 'pointer' | 'keyboard'): Promise<boolean> {
    const place = this.#placement(source, target, position);
    if (!place) {
      announce(this.#m('moveDenied', { label: source.label }), 'assertive', this.#doc);
      return false;
    }
    const { parent } = place;
    // A lazy target loads its children first, so the moved node joins the real list.
    if (parent && parent.lazy && !parent.children) {
      const ok = await this.#load(parent);
      if (!ok) return false;
    }
    const fresh = this.#placement(source, target, position);
    if (!fresh) return false;
    const oldList = this.#siblings(source);
    const previousIndex = oldList.indexOf(source);
    const detail: TreeViewMoveDetail = { id: source.id, parentId: fresh.parent?.id ?? null, index: fresh.index, previousParentId: source.parent?.id ?? null, previousIndex, source: how };
    if (detail.parentId === detail.previousParentId && detail.index === previousIndex) return false;
    if (!emit(this.host, 'aui-move', detail, { cancelable: true })) return false;
    oldList.splice(previousIndex, 1);
    if (source.parent && source.parent.children?.length === 0) this.#expanded.delete(source.parent.id);
    const newList = fresh.parent ? (fresh.parent.children ??= []) : this.#roots;
    newList.splice(Math.min(fresh.index, newList.length), 0, source);
    source.parent = fresh.parent;
    if (fresh.parent) {
      fresh.parent.lazy = false;
      this.#expanded.add(fresh.parent.id);
    }
    this.#normalizeChecks();
    this.#refreshFlat(true);
    this.#setActive(source, this.#viewport.contains(this.#doc.activeElement) || how === 'keyboard');
    announce(fresh.parent ? this.#m('moved', { label: source.label, target: fresh.parent.label }) : this.#m('movedRoot', { label: source.label }), 'polite', this.#doc);
    return true;
  }

  #startCut(item: Item): void {
    if (!this.#canDragItem(item)) {
      announce(this.#m('moveDenied', { label: item.label }), 'assertive', this.#doc);
      return;
    }
    this.#cut = item;
    this.#syncRows();
    announce(this.#m('cut', { label: item.label }), 'assertive', this.#doc);
  }

  async #paste(target: Item, position: 'inside' | 'after'): Promise<void> {
    const source = this.#cut;
    if (!source) return;
    const moved = await this.#moveTo(source, target, position, 'keyboard');
    if (moved) this.#cut = null;
    this.#syncRows();
  }

  /** Alt+Up / Alt+Down: move a node one place among its siblings. */
  #nudge(item: Item, step: -1 | 1): void {
    if (!this.#canDragItem(item)) return;
    const list = this.#siblings(item);
    const at = list.indexOf(item);
    const neighbour = list[at + step];
    if (!neighbour) return;
    void this.#moveTo(item, neighbour, step < 0 ? 'before' : 'after', 'keyboard').then((ok) => {
      if (ok) {
        const siblings = this.#siblings(item);
        announce(this.#m('position', { label: item.label, position: formatNumber(siblings.indexOf(item) + 1, {}, this.#resolved.locale), total: formatNumber(siblings.length, {}, this.#resolved.locale) }), 'polite', this.#doc);
      }
    });
  }

  #setupDrag(): void {
    const vp = this.#viewport;
    this.#drag = trackPointerDrag(vp, {
      canStart: (event) => {
        if (this.#options.draggable !== true || event.button !== 0 || this.#editing) return false;
        // A leaf's twisty is an empty spacer, not a control: dragging from it drags the node.
        if (event.target instanceof Element && event.target.closest('.aui-tree-view__twisty:not(:empty), .aui-tree-view__check, input')) return false;
        const item = this.#flat[this.#indexOf(event.target)]?.item;
        // Touch scrolls the tree; touch drags start on the node icon (touch-action: none).
        if (event.pointerType === 'touch' && !(event.target instanceof Element && event.target.closest('.aui-tree-view__icon'))) return false;
        return item !== undefined && this.#canDragItem(item);
      },
      onStart: (move) => {
        const index = this.#indexAtClientY(move.start.y);
        const item = this.#flat[index]?.item ?? null;
        if (!item) {
          this.#drag?.cancel();
          return;
        }
        this.#dragging = item;
        this.host.classList.add('aui-tree-view--dragging');
        this.#canvas.append(this.#indicator);
        this.#dragY = move.point.y;
        this.#syncRows();
        this.#autoScroll();
      },
      onMove: (move) => {
        this.#dragY = move.point.y;
        this.#updateDrop();
      },
      onEnd: () => {
        const source = this.#dragging;
        const drop = this.#drop;
        this.#endDrag();
        if (source && drop) void this.#moveTo(source, drop.target, drop.position, 'pointer');
      },
      onCancel: () => {
        this.#endDrag();
      },
    });
  }

  #indexAtClientY(y: number): number {
    const rect = this.#viewport.getBoundingClientRect();
    const offset = y - rect.top + this.#viewport.scrollTop;
    if (offset < 0 || offset >= this.#win.total) return -1;
    return this.#win.indexAt(offset);
  }

  #updateDrop(): void {
    const source = this.#dragging;
    if (!source) return;
    const rect = this.#viewport.getBoundingClientRect();
    const offset = this.#dragY - rect.top + this.#viewport.scrollTop;
    let drop: Drop | null = null;
    if (offset >= this.#win.total) {
      const last = this.#roots[this.#roots.length - 1];
      if (last && last !== source) drop = { target: last, position: 'after' };
    } else if (offset >= 0) {
      const index = this.#win.indexAt(offset);
      const item = this.#flat[index]?.item;
      if (item) {
        const ratio = (offset - this.#win.offsetOf(index)) / this.#win.sizeOf(index);
        const position: TreeViewDropPosition = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside';
        drop = { target: item, position };
      }
    }
    if (drop && !this.#placement(source, drop.target, drop.position)) drop = null;
    this.#drop = drop;
    this.#showIndicator();
    this.#syncRows();
  }

  #showIndicator(): void {
    const drop = this.#drop;
    const ind = this.#indicator;
    if (!drop?.target || drop.position === 'inside') {
      ind.hidden = true;
      return;
    }
    const index = this.#flatIndex.get(drop.target);
    const flat = index === undefined ? undefined : this.#flat[index];
    if (index === undefined || !flat) {
      ind.hidden = true;
      return;
    }
    const y = drop.position === 'before' ? this.#win.offsetOf(index) : this.#win.offsetOf(index) + this.#win.sizeOf(index);
    ind.style.setProperty('--_aui-tree-view-y', `${String(y)}px`);
    ind.style.setProperty('--_aui-tree-view-level', String(flat.level - 1));
    ind.hidden = false;
  }

  #autoScroll(): void {
    const view = this.#doc.defaultView;
    if (!view || !this.#dragging) return;
    const step = (): void => {
      this.#scrollFrame = 0;
      if (!this.#dragging) return;
      const rect = this.#viewport.getBoundingClientRect();
      const y = this.#dragY;
      let delta = 0;
      if (y < rect.top + EDGE) delta = -Math.ceil((rect.top + EDGE - y) / 4);
      else if (y > rect.bottom - EDGE) delta = Math.ceil((y - (rect.bottom - EDGE)) / 4);
      if (delta !== 0) {
        this.#viewport.scrollTop += delta;
        this.#paint();
        this.#updateDrop();
      }
      this.#scrollFrame = view.requestAnimationFrame(step);
    };
    this.#scrollFrame = view.requestAnimationFrame(step);
  }

  #endDrag(): void {
    this.#dragging = null;
    this.#drop = null;
    this.#indicator.hidden = true;
    this.#indicator.remove();
    this.host.classList.remove('aui-tree-view--dragging');
    const view = this.#doc.defaultView;
    if (this.#scrollFrame) view?.cancelAnimationFrame(this.#scrollFrame);
    this.#scrollFrame = 0;
    this.#syncRows();
  }

  /** Documented tested scale (SPEC section 15.3). */
  static readonly testedNodeCount = 100_000;
}
