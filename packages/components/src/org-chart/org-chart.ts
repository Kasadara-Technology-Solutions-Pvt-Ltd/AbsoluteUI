/**
 * Organization Chart (SPEC section 18.19). Renders a hierarchy from flat nodes
 * (`id`, `parentId`) as a tidy tree, top-down or left-to-right, with elbow
 * connectors. The nodes form an ARIA tree (`role="tree"`, flat `treeitem`s with
 * `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded`) in reading order
 * with one roving tab stop: arrow keys follow the tree (Down/Up next/previous,
 * Right/Left expand, first child, collapse, parent), Home/End, `*`, typeahead;
 * Enter or Space selects. Focus movement pans the chart so the node stays visible.
 *
 * Pan by dragging the background; zoom with the toolbar, `+`/`-`/`0` on a node, or
 * Ctrl/Cmd + wheel (a plain wheel keeps scrolling the page). Children load lazily
 * through `loadChildren`. In edit mode nodes are re-parented by pointer drag, by
 * Ctrl/Cmd+X then Ctrl/Cmd+V on the new manager, or with the toolbar Move / Move
 * here buttons (single pointer); moves are undoable.
 */
import {
  configurationError,
  defineComponentConfig,
  DisposableGroup,
  emit,
  formatNumber,
  getMessage,
  registerMessages,
  validators,
  type Direction,
  releaseNode,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, createTypeahead, isPrintableKey, matchesHotkey, observeResize, trackPointerDrag, type PointerDrag } from '@absoluteui/utilities';
import { layoutOrgChart, type OrgChartBox, type OrgChartLayout, type OrgChartLayoutInput, type OrgChartOrientation } from './layout.js';

export interface OrgChartConfig {
  orientation: OrgChartOrientation;
  /** Card size in CSS px. */
  nodeWidth: number;
  nodeHeight: number;
  siblingGap: number;
  levelGap: number;
  /** Levels expanded initially (0 = roots only). Default 2. */
  expandDepth: number;
  minZoom: number;
  maxZoom: number;
  /** `loadChildren` timeout in milliseconds. */
  requestTimeoutMs: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    orgChart: OrgChartConfig & { locale: string; direction: Direction };
  }
}

export const orgChartConfig = defineComponentConfig<OrgChartConfig, 'locale' | 'direction'>(
  'orgChart',
  {
    orientation: { default: 'vertical', expected: '"vertical" | "horizontal"', validate: validators.oneOf(['vertical', 'horizontal'] as const) },
    nodeWidth: { default: 200, expected: 'integer from 80 to 600 (CSS px)', validate: validators.integerInRange(80, 600) },
    nodeHeight: { default: 72, expected: 'integer from 32 to 400 (CSS px)', validate: validators.integerInRange(32, 400) },
    siblingGap: { default: 24, expected: 'integer from 4 to 400 (CSS px)', validate: validators.integerInRange(4, 400) },
    levelGap: { default: 48, expected: 'integer from 16 to 400 (CSS px)', validate: validators.integerInRange(16, 400) },
    expandDepth: { default: 2, expected: 'integer from 0 to 64', validate: validators.integerInRange(0, 64) },
    minZoom: { default: 0.2, expected: 'number from 0.05 to 1', validate: validators.numberInRange(0.05, 1) },
    maxZoom: { default: 2, expected: 'number from 1 to 8', validate: validators.numberInRange(1, 8) },
    requestTimeoutMs: { default: 30_000, expected: 'integer from 100 to 600000 (ms)', validate: validators.integerInRange(100, 600_000) },
  },
  ['locale', 'direction'],
);

registerMessages('orgChart', 'en', {
  toolbar: '{label} controls',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit to view',
  zoomed: 'Zoom {percent}',
  cut: 'Move',
  paste: 'Move here',
  undo: 'Undo move',
  redo: 'Redo move',
  reports: '{count} direct reports',
  loading: 'Loading',
  loadFailed: 'The team of {label} could not be loaded.',
  cutDone: '{label} ready to move. Go to the new manager and press Control V, or Escape to cancel.',
  cutCancelled: 'Move cancelled.',
  moved: '{label} now reports to {parent}.',
  movedRoot: '{label} is now a top-level node.',
  notAllowed: '{label} cannot report to {parent}.',
  locked: '{label} cannot be moved.',
  undone: 'Move undone.',
  redone: 'Move redone.',
  path: 'Path: {path}.',
  pathSeparator: ', ',
});

export interface OrgChartNode {
  /** Unique id. */
  id: string;
  /** Manager id; null for a top-level node. */
  parentId: string | null;
  /** Name (visible text and treeitem name). */
  label: string;
  /** Role or job title. */
  title?: string;
  /** Secondary line (department, location). */
  description?: string;
  /** Children exist but are not loaded yet (they load through `loadChildren` on expand). */
  hasChildren?: boolean;
  /** Edit mode: the node cannot be moved (it can still receive reports). */
  locked?: boolean;
}

export interface OrgChartRenderContext {
  readonly depth: number;
  readonly expanded: boolean;
  /** Direct reports (loaded). */
  readonly childCount: number;
  readonly doc: Document;
}

export interface OrgChartOptions extends Partial<OrgChartConfig> {
  /** Accessible name of the tree. */
  label: string;
  nodes: readonly OrgChartNode[];
  /** Explicitly expanded ids (overrides `expandDepth`). */
  expanded?: readonly string[];
  selected?: string | null;
  /**
   * Card content. Return non-interactive content (the treeitem is the control);
   * the default shows initials, label, title, and description.
   */
  renderNode?: (node: Readonly<OrgChartNode>, context: OrgChartRenderContext) => Node;
  /** Lazy children of a node with `hasChildren` (honour `signal`). */
  loadChildren?: (node: Readonly<OrgChartNode>, signal: AbortSignal) => Promise<readonly OrgChartNode[]>;
  /** Edit mode: re-parent nodes. Default false. */
  editable?: boolean;
  /** Veto a move (edit mode). Cycles and locked nodes are always refused. */
  canMove?: (node: Readonly<OrgChartNode>, parent: Readonly<OrgChartNode> | null) => boolean;
  /** Undo depth, 0..500. Default 50. */
  historyLimit?: number;
  /**
   * Card corner radius in CSS px (0 to 50; R20-22). Unset: `--aui-chart-node-radius`, else
   * `--aui-chart-corner-radius`, else the theme's `radius-md`. The SVG export keeps it.
   */
  nodeRadius?: number | undefined;
  locale?: string;
  direction?: Direction;
}

export interface OrgChartNodeSelectDetail {
  id: string;
  node: OrgChartNode;
}

export interface OrgChartExpandChangeDetail {
  id: string;
  expanded: boolean;
}

export type OrgChartNodeMoveReason = 'move' | 'undo' | 'redo';

/** Detail of `aui-node-move`. */
export interface OrgChartNodeMoveDetail {
  reason: OrgChartNodeMoveReason;
  id: string;
  parentId: string | null;
  previousParentId: string | null;
  /** Position among the new siblings. */
  index: number;
  /** Every node (updated), for saving. */
  nodes: OrgChartNode[];
}

export interface OrgChartZoomDetail {
  scale: number;
}

export interface OrgChartLoadErrorDetail {
  id: string;
  error: unknown;
}

/** The visible chart geometry (for export). */
export interface OrgChartGeometry {
  readonly layout: OrgChartLayout;
  readonly nodes: ReadonlyMap<string, Readonly<OrgChartNode>>;
  /** A rendered card element (for computed colors), or null when nothing is rendered. */
  readonly sample: HTMLElement | null;
  readonly highlighted: ReadonlySet<string>;
}

interface Move {
  readonly id: string;
  readonly from: string | null;
  readonly fromIndex: number;
  readonly to: string | null;
  readonly toIndex: number;
}

interface NodeEl {
  readonly el: HTMLDivElement;
  readonly card: HTMLDivElement;
  readonly toggle: HTMLSpanElement;
  drag: PointerDrag | null;
  data: OrgChartNode | null;
  /** Node returned by `renderNode` (released when replaced or dropped, D8). */
  content: Node | null;
}

const ROOT = '\u0000';
const ZOOM_STEP = 1.25;
const MARGIN = 16;

function fail(property: string, expected: string): never {
  throw configurationError('ORG_CHART_OPTIONS', 'Invalid organization chart options.', { component: 'orgChart', property: `orgChart.${property}`, expected });
}

function assertNodes(nodes: unknown, at: string, known: ReadonlySet<string> = new Set()): void {
  if (!Array.isArray(nodes)) fail(at, 'OrgChartNode[]');
  const ids = new Set<string>();
  (nodes as unknown[]).forEach((n, i) => {
    const p = `${at}[${String(i)}]`;
    if (!validators.isRecord(n)) fail(p, 'OrgChartNode');
    if (typeof n.id !== 'string' || n.id === '' || ids.has(n.id) || known.has(n.id)) fail(`${p}.id`, 'unique non-empty string');
    ids.add(n.id);
    if (!(n.parentId === null || typeof n.parentId === 'string')) fail(`${p}.parentId`, 'string | null');
    if (typeof n.label !== 'string' || n.label.trim() === '') fail(`${p}.label`, 'non-empty string');
    for (const key of ['title', 'description'] as const) if (n[key] !== undefined && typeof n[key] !== 'string') fail(`${p}.${key}`, 'string');
    for (const key of ['hasChildren', 'locked'] as const) if (n[key] !== undefined && typeof n[key] !== 'boolean') fail(`${p}.${key}`, 'boolean');
  });
  const all = new Set([...known, ...ids]);
  const byId = new Map((nodes as OrgChartNode[]).map((n) => [n.id, n]));
  (nodes as OrgChartNode[]).forEach((n, i) => {
    if (n.parentId !== null && !all.has(n.parentId)) fail(`${at}[${String(i)}].parentId`, 'null or the id of another node');
    // Cycle check (within this list; known nodes are already acyclic).
    let cursor: string | null = n.parentId;
    let steps = 0;
    while (cursor !== null && byId.has(cursor)) {
      if (cursor === n.id || ++steps > byId.size) fail(`${at}[${String(i)}].parentId`, 'no cycles');
      cursor = byId.get(cursor)?.parentId ?? null;
    }
  });
}

const copyNode = (n: Readonly<OrgChartNode>): OrgChartNode => {
  const out: OrgChartNode = { id: n.id, parentId: n.parentId, label: n.label };
  if (n.title !== undefined) out.title = n.title;
  if (n.description !== undefined) out.description = n.description;
  if (n.hasChildren !== undefined) out.hasChildren = n.hasChildren;
  if (n.locked !== undefined) out.locked = n.locked;
  return out;
};

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter((p) => p !== '');
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toLocaleUpperCase();
}

export class OrgChart {
  readonly host: HTMLElement;
  /** The tree element (role=tree). */
  readonly element: HTMLDivElement;
  readonly #doc: Document;
  readonly #group = new DisposableGroup();
  readonly #toolbar: HTMLDivElement;
  readonly #viewport: HTMLDivElement;
  readonly #canvas: HTMLDivElement;
  readonly #links: SVGSVGElement;
  readonly #buttons = new Map<string, HTMLButtonElement>();
  readonly #typeahead = createTypeahead();
  #options: OrgChartOptions;
  #nodes = new Map<string, OrgChartNode>();
  /** Children ids per parent id (ROOT for top level), in display order. */
  #children = new Map<string, string[]>();
  #expanded = new Set<string>();
  #loaded = new Set<string>();
  #loading = new Map<string, AbortController>();
  #els = new Map<string, NodeEl>();
  #layout: OrgChartLayout = { boxes: new Map(), edges: [], width: 0, height: 0 };
  #visible: string[] = [];
  #focusId: string | null = null;
  #selected: string | null = null;
  #path = new Set<string>();
  #view = { x: 0, y: 0, scale: 1 };
  #viewSet = false;
  #cut: string | null = null;
  #history: Move[] = [];
  #future: Move[] = [];
  #panDrag: PointerDrag | null = null;
  #dragging: { id: string; target: string | null } | null = null;
  #panStart: { x: number; y: number } | null = null;

  static create(host: HTMLElement, options: OrgChartOptions): OrgChart {
    return new OrgChart(host, options);
  }

  private constructor(host: HTMLElement, options: OrgChartOptions) {
    OrgChart.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#setNodes(options.nodes);
    this.#initExpansion();
    this.#selected = options.selected ?? null;
    const doc = this.#doc;
    this.#toolbar = doc.createElement('div');
    this.#toolbar.className = 'aui-org-chart__toolbar';
    this.#toolbar.setAttribute('role', 'group');
    this.#viewport = doc.createElement('div');
    this.#viewport.className = 'aui-org-chart__viewport';
    this.#canvas = doc.createElement('div');
    this.#canvas.className = 'aui-org-chart__canvas';
    this.#links = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.#links.classList.add('aui-org-chart__links');
    this.#links.setAttribute('aria-hidden', 'true');
    this.#links.setAttribute('focusable', 'false');
    this.element = doc.createElement('div');
    this.element.className = 'aui-org-chart__tree';
    this.element.setAttribute('role', 'tree');
    this.#canvas.append(this.#links, this.element);
    this.#viewport.append(this.#canvas);
    this.#buildToolbar();
    host.classList.add('aui-org-chart');
    this.#applyLabels();
    host.append(this.#toolbar, this.#viewport);
    // Measured before the nodes exist, so creating a large chart forces no layout of them.
    const width = this.#viewport.clientWidth;
    this.#render();
    this.#resetView(width);

    const g = this.#group;
    g.listen(this.element, 'keydown', (e) => {
      this.#onKey(e);
    });
    g.listen(this.element, 'click', (e) => {
      this.#onClick(e);
    });
    g.listen(this.element, 'focusin', (e) => {
      const item = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[role="treeitem"]') : null;
      const id = item?.dataset.auiNode;
      if (id !== undefined && id !== this.#focusId) {
        this.#focusId = id;
        this.#syncTabindex();
      }
      if (id !== undefined) this.#reveal(id);
    });
    g.listen(this.#toolbar, 'click', (e) => {
      const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button') : null;
      if (b?.dataset.auiAction) this.#action(b.dataset.auiAction);
    });
    g.listen(this.#viewport, 'wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = this.#viewport.getBoundingClientRect();
      this.#zoomAt(this.#view.scale * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });
    this.#panDrag = trackPointerDrag(this.#viewport, {
      // Pans start on the background only: the drag captures the pointer at pointerdown,
      // which would retarget clicks on nodes (and nodes are dragged in edit mode).
      canStart: (e) => !(e.target instanceof Element && e.target.closest('[role="treeitem"], .aui-org-chart__toolbar')),
      onStart: () => {
        this.#viewport.classList.add('aui-org-chart__viewport--panning');
      },
      onMove: (move) => {
        const start = this.#panStart ?? { x: this.#view.x, y: this.#view.y };
        this.#panStart = start;
        this.#setView({ x: start.x + move.dx, y: start.y + move.dy, scale: this.#view.scale });
      },
      onEnd: () => {
        this.#panStart = null;
        this.#viewport.classList.remove('aui-org-chart__viewport--panning');
      },
      onCancel: () => {
        this.#panStart = null;
        this.#viewport.classList.remove('aui-org-chart__viewport--panning');
      },
    });
    g.add(() => this.#panDrag?.dispose());
    g.add(observeResize(this.#viewport, () => {
      if (!this.#viewSet) this.#resetView();
    }));
    g.add(orgChartConfig.subscribe(() => {
      this.#applyLabels();
      this.#render();
    }));
    g.add(() => {
      for (const c of this.#loading.values()) c.abort(new DOMException('The organization chart was destroyed.', 'AbortError'));
    });
  }

  /** Every node with its current manager, in tree order (copies, for saving). */
  get nodes(): OrgChartNode[] {
    const out: OrgChartNode[] = [];
    const walk = (parent: string): void => {
      for (const id of this.#children.get(parent) ?? []) {
        const n = this.#nodes.get(id);
        if (!n) continue;
        out.push(copyNode(n));
        walk(id);
      }
    };
    walk(ROOT);
    return out;
  }

  get expanded(): string[] {
    return [...this.#expanded];
  }

  get selected(): string | null {
    return this.#selected;
  }

  get editable(): boolean {
    return this.#options.editable === true;
  }

  get scale(): number {
    return this.#view.scale;
  }

  get canUndo(): boolean {
    return this.#history.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  /** Visible geometry and nodes (used by `org-chart-export`). */
  get geometry(): OrgChartGeometry {
    const first = this.#visible[0];
    return { layout: this.#layout, nodes: this.#nodes, sample: first ? (this.#els.get(first)?.card ?? null) : null, highlighted: new Set(this.#path) };
  }

  update(options: Partial<OrgChartOptions>): void {
    const next = { ...this.#options, ...options };
    OrgChart.#assert(next);
    this.#options = next;
    if (options.nodes !== undefined) {
      this.#setNodes(next.nodes);
      this.#history = [];
      this.#future = [];
      this.#cut = null;
      for (const id of [...this.#expanded]) if (!this.#nodes.has(id)) this.#expanded.delete(id);
      for (const e of this.#els.values()) e.data = null;
    }
    if (options.expanded !== undefined || options.expandDepth !== undefined) this.#initExpansion();
    if (options.selected !== undefined) this.#selected = options.selected;
    if (options.renderNode !== undefined) for (const e of this.#els.values()) e.data = null;
    this.#applyLabels();
    this.#render();
  }

  /** Expand or collapse a node (lazy children load first). */
  async setExpanded(id: string, expanded: boolean): Promise<void> {
    const node = this.#nodes.get(id);
    if (!node || expanded === this.#expanded.has(id)) return;
    if (!expanded) {
      this.#expanded.delete(id);
      this.#render();
      this.#emitExpand(id, false);
      return;
    }
    if (!this.#hasChildren(id)) return;
    if ((this.#children.get(id)?.length ?? 0) === 0 && node.hasChildren === true && !this.#loaded.has(id)) {
      if (!(await this.#load(node))) return;
    }
    this.#expanded.add(id);
    this.#render();
    this.#emitExpand(id, true);
  }

  expandAll(): void {
    for (const [id] of this.#nodes) if ((this.#children.get(id)?.length ?? 0) > 0) this.#expanded.add(id);
    this.#render();
  }

  collapseAll(): void {
    this.#expanded.clear();
    this.#render();
  }

  /** Ids whose label, title, or description contains `query` (case-insensitive), in tree order. */
  search(query: string): string[] {
    const locale = this.#config().locale;
    const q = query.trim().toLocaleLowerCase(locale);
    if (q === '') return [];
    return this.nodes.filter((n) => [n.label, n.title ?? '', n.description ?? ''].some((t) => t.toLocaleLowerCase(locale).includes(q))).map((n) => n.id);
  }

  /** Ancestors of a node, top-level first, ending with the node. */
  pathTo(id: string): string[] {
    const out: string[] = [];
    let cursor: string | null = id;
    while (cursor !== null) {
      const n = this.#nodes.get(cursor);
      if (!n) break;
      out.unshift(n.id);
      cursor = n.parentId;
    }
    return out;
  }

  /**
   * Expand the ancestors of a node, center it, highlight its path, and optionally
   * focus and select it. Announces the path.
   */
  reveal(id: string, options: { focus?: boolean; select?: boolean; highlight?: boolean } = {}): void {
    if (!this.#nodes.has(id)) fail('reveal.id', 'a node id');
    const path = this.pathTo(id);
    for (const p of path.slice(0, -1)) this.#expanded.add(p);
    this.#path = options.highlight === false ? new Set() : new Set(path);
    if (options.select === true) this.#select(id, false);
    this.#focusId = id;
    this.#render();
    this.centerOn(id);
    if (options.focus !== false) this.#els.get(id)?.el.focus({ preventScroll: true });
    const labels = path.map((p) => this.#nodes.get(p)?.label ?? p);
    announce(this.#msg('path', { path: labels.join(this.#msg('pathSeparator')) }));
  }

  /** Remove the path highlight. */
  clearHighlight(): void {
    this.#path = new Set();
    this.#render();
  }

  select(id: string | null): void {
    if (id !== null && !this.#nodes.has(id)) fail('select.id', 'a node id or null');
    this.#select(id, false);
    this.#render();
  }

  /** Center the view on a visible node. */
  centerOn(id: string): void {
    const box = this.#layout.boxes.get(id);
    if (!box) return;
    const vw = this.#viewport.clientWidth;
    const vh = this.#viewport.clientHeight;
    const s = this.#view.scale;
    this.#viewSet = true;
    this.#setView({ x: vw / 2 - (box.x + box.width / 2) * s, y: vh / 2 - (box.y + box.height / 2) * s, scale: s });
  }

  /** Scale and center the whole visible chart into the viewport (at most 100 %). */
  fit(): void {
    const { width, height } = this.#layout;
    const vw = this.#viewport.clientWidth;
    const vh = this.#viewport.clientHeight;
    if (width === 0 || vw === 0 || vh === 0) return;
    const c = this.#config();
    const scale = Math.max(c.minZoom, Math.min(1, c.maxZoom, (vw - 2 * MARGIN) / width, (vh - 2 * MARGIN) / height));
    this.#viewSet = true;
    this.#setView({ x: (vw - width * scale) / 2, y: (vh - height * scale) / 2, scale });
    this.#announceZoom();
  }

  /** Set the zoom level around the viewport center (clamped to minZoom..maxZoom). */
  zoomTo(scale: number): void {
    if (!(typeof scale === 'number' && Number.isFinite(scale) && scale > 0)) fail('zoomTo.scale', 'positive number');
    this.#zoomAt(scale, this.#viewport.clientWidth / 2, this.#viewport.clientHeight / 2);
  }

  /**
   * Re-parent a node (edit mode or not). `parentId` null makes it top level; `index`
   * is the position among the new siblings (default last). Returns false when the move
   * is refused (cycle, locked, `canMove`).
   */
  moveNode(id: string, parentId: string | null, index?: number): boolean {
    return this.#move(id, parentId, index, 'move');
  }

  undo(): boolean {
    const m = this.#history.pop();
    if (!m) return false;
    this.#apply({ id: m.id, from: m.to, fromIndex: m.toIndex, to: m.from, toIndex: m.fromIndex });
    this.#future.push(m);
    this.#render();
    announce(this.#msg('undone'));
    this.#emitMove('undo', m.id, m.from, m.to, m.fromIndex);
    return true;
  }

  redo(): boolean {
    const m = this.#future.pop();
    if (!m) return false;
    this.#apply(m);
    this.#history.push(m);
    this.#render();
    announce(this.#msg('redone'));
    this.#emitMove('redo', m.id, m.to, m.from, m.toIndex);
    return true;
  }

  destroy(): void {
    this.#group.dispose();
    for (const e of this.#els.values()) {
      e.drag?.dispose();
      releaseNode(e.content);
    }
    this.#toolbar.remove();
    this.#viewport.remove();
    this.host.classList.remove('aui-org-chart', 'aui-org-chart--editing', 'aui-org-chart--horizontal');
  }

  static #assert(o: OrgChartOptions): void {
    if (!validators.isRecord(o)) fail('options', 'OrgChartOptions');
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string');
    assertNodes(o.nodes, 'nodes');
    const ids = new Set(o.nodes.map((n) => n.id));
    const expanded: unknown = o.expanded;
    if (expanded !== undefined && !(Array.isArray(expanded) && expanded.every((id) => typeof id === 'string'))) fail('expanded', 'string[]');
    if (o.selected !== undefined && o.selected !== null && !ids.has(o.selected)) fail('selected', 'a node id or null');
    for (const key of ['renderNode', 'loadChildren', 'canMove'] as const) if (o[key] !== undefined && typeof o[key] !== 'function') fail(key, 'function');
    if (o.editable !== undefined && typeof o.editable !== 'boolean') fail('editable', 'boolean');
    if (o.historyLimit !== undefined && !(Number.isInteger(o.historyLimit) && o.historyLimit >= 0 && o.historyLimit <= 500)) fail('historyLimit', 'integer from 0 to 500');
    if (o.nodeRadius !== undefined && !(typeof o.nodeRadius === 'number' && Number.isFinite(o.nodeRadius) && o.nodeRadius >= 0 && o.nodeRadius <= 50)) fail('nodeRadius', 'number from 0 to 50 (CSS px)');
  }

  #config(): Readonly<OrgChartConfig & { locale: string; direction: Direction }> {
    const o = this.#options;
    const input: Partial<OrgChartConfig & { locale: string; direction: Direction }> = {};
    for (const key of ['orientation', 'nodeWidth', 'nodeHeight', 'siblingGap', 'levelGap', 'expandDepth', 'minZoom', 'maxZoom', 'requestTimeoutMs', 'locale', 'direction'] as const) {
      const v = o[key];
      if (v !== undefined) (input as Record<string, unknown>)[key] = v;
    }
    return orgChartConfig.resolve(input);
  }

  #msg(key: string, params: Readonly<Record<string, string>> = {}): string {
    return getMessage('orgChart', key, params, this.#config().locale);
  }

  #setNodes(nodes: readonly OrgChartNode[]): void {
    this.#nodes = new Map(nodes.map((n) => [n.id, copyNode(n)]));
    this.#children = new Map();
    for (const n of nodes) {
      const key = n.parentId ?? ROOT;
      const list = this.#children.get(key);
      if (list) list.push(n.id);
      else this.#children.set(key, [n.id]);
    }
    this.#loaded = new Set([...this.#loaded].filter((id) => this.#nodes.has(id)));
    if (this.#focusId !== null && !this.#nodes.has(this.#focusId)) this.#focusId = null;
    if (this.#selected !== null && !this.#nodes.has(this.#selected)) this.#selected = null;
  }

  #initExpansion(): void {
    const explicit = this.#options.expanded;
    if (explicit) {
      this.#expanded = new Set(explicit.filter((id) => this.#nodes.has(id)));
      return;
    }
    const depth = this.#config().expandDepth;
    this.#expanded = new Set();
    const walk = (parent: string, level: number): void => {
      if (level >= depth) return;
      for (const id of this.#children.get(parent) ?? []) {
        if ((this.#children.get(id)?.length ?? 0) > 0) this.#expanded.add(id);
        walk(id, level + 1);
      }
    };
    walk(ROOT, 0);
  }

  #hasChildren(id: string): boolean {
    return (this.#children.get(id)?.length ?? 0) > 0 || (this.#nodes.get(id)?.hasChildren === true && !this.#loaded.has(id));
  }

  async #load(node: OrgChartNode): Promise<boolean> {
    const load = this.#options.loadChildren;
    if (!load || this.#loading.has(node.id)) return false;
    const controller = new AbortController();
    this.#loading.set(node.id, controller);
    this.#render();
    const view = this.#doc.defaultView ?? window;
    const timer = view.setTimeout(() => {
      controller.abort(new DOMException('Loading the team timed out.', 'TimeoutError'));
    }, this.#config().requestTimeoutMs);
    try {
      const children = await Promise.race([
        load(copyNode(node), controller.signal),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(controller.signal.reason instanceof Error ? controller.signal.reason : new Error('aborted'));
          }, { once: true });
        }),
      ]);
      assertNodes(children, 'loadChildren()', new Set(this.#nodes.keys()));
      for (const c of children) {
        this.#nodes.set(c.id, copyNode(c));
        const key = c.parentId ?? ROOT;
        const list = this.#children.get(key);
        if (list) list.push(c.id);
        else this.#children.set(key, [c.id]);
      }
      this.#loaded.add(node.id);
      return true;
    } catch (error) {
      if (this.#group.disposed) return false;
      announce(this.#msg('loadFailed', { label: node.label }), 'assertive');
      const detail: OrgChartLoadErrorDetail = { id: node.id, error };
      emit(this.host, 'aui-load-error', detail);
      return false;
    } finally {
      view.clearTimeout(timer);
      this.#loading.delete(node.id);
      if (!this.#group.disposed) this.#render();
    }
  }

  #applyLabels(): void {
    const o = this.#options;
    this.element.setAttribute('aria-label', o.label);
    this.#toolbar.setAttribute('aria-label', this.#msg('toolbar', { label: o.label }));
    const c = this.#config();
    this.host.classList.toggle('aui-org-chart--editing', this.editable);
    this.host.classList.toggle('aui-org-chart--horizontal', c.orientation === 'horizontal');
    const labels: Record<string, string> = { zoomOut: this.#msg('zoomOut'), zoomIn: this.#msg('zoomIn'), fit: this.#msg('fit'), cut: this.#msg('cut'), paste: this.#msg('paste'), undo: this.#msg('undo'), redo: this.#msg('redo') };
    for (const [action, b] of this.#buttons) {
      const text = labels[action] ?? action;
      b.setAttribute('aria-label', text);
      b.title = text;
      if (['cut', 'paste', 'undo', 'redo'].includes(action)) b.hidden = !this.editable;
    }
  }

  #buildToolbar(): void {
    const doc = this.#doc;
    const icons: [string, IconRef][] = [['zoomOut', 'zoom-out'], ['zoomIn', 'zoom-in'], ['fit', 'maximize'], ['cut', 'grip'], ['paste', 'check'], ['undo', 'undo'], ['redo', 'redo']];
    for (const [action, icon] of icons) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-org-chart__tool';
      b.dataset.auiAction = action;
      b.append(renderIcon(icon, { doc }));
      this.#toolbar.append(b);
      this.#buttons.set(action, b);
    }
  }

  #syncToolbar(): void {
    const set = (action: string, disabled: boolean): void => {
      const b = this.#buttons.get(action);
      // aria-disabled keeps the buttons focusable and discoverable.
      if (b) b.setAttribute('aria-disabled', String(disabled));
    };
    const c = this.#config();
    set('zoomIn', this.#view.scale >= c.maxZoom - 1e-9);
    set('zoomOut', this.#view.scale <= c.minZoom + 1e-9);
    const focus = this.#focusId ?? this.#selected;
    set('cut', focus === null || this.#nodes.get(focus)?.locked === true);
    set('paste', this.#cut === null || focus === null || !this.#canMoveTo(this.#cut, focus));
    set('undo', !this.canUndo);
    set('redo', !this.canRedo);
    this.#buttons.get('cut')?.setAttribute('aria-pressed', String(this.#cut !== null));
  }

  #action(action: string): void {
    if (this.#buttons.get(action)?.getAttribute('aria-disabled') === 'true') return;
    const target = this.#focusId ?? this.#selected;
    switch (action) {
      case 'zoomIn':
        this.zoomTo(this.#view.scale * ZOOM_STEP);
        break;
      case 'zoomOut':
        this.zoomTo(this.#view.scale / ZOOM_STEP);
        break;
      case 'fit':
        this.fit();
        break;
      case 'cut':
        if (this.#cut !== null) this.#cancelCut();
        else if (target !== null) this.#cutNode(target);
        break;
      case 'paste':
        if (target !== null) this.#paste(target);
        break;
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
    }
  }

  // ---- view ------------------------------------------------------------------

  #setView(v: { x: number; y: number; scale: number }): void {
    this.#view = v;
    const s = this.#canvas.style;
    s.setProperty('transform', `translate(${String(Math.round(v.x * 10) / 10)}px, ${String(Math.round(v.y * 10) / 10)}px) scale(${String(v.scale)})`);
    this.#syncToolbar();
  }

  #zoomAt(scale: number, cx: number, cy: number): void {
    const c = this.#config();
    const next = Math.max(c.minZoom, Math.min(c.maxZoom, scale));
    const v = this.#view;
    if (Math.abs(next - v.scale) < 1e-9) return;
    // Keep the content point under (cx, cy) in place.
    const px = (cx - v.x) / v.scale;
    const py = (cy - v.y) / v.scale;
    this.#viewSet = true;
    this.#setView({ x: cx - px * next, y: cy - py * next, scale: next });
    this.#announceZoom();
    const detail: OrgChartZoomDetail = { scale: next };
    emit(this.host, 'aui-zoom', detail);
  }

  #announceZoom(): void {
    announce(this.#msg('zoomed', { percent: formatNumber(this.#view.scale, { style: 'percent', maximumFractionDigits: 0 }, this.#config().locale) }));
  }

  /** Initial view: 100 %, the chart centered when it fits, else the first root centered at the top. */
  #resetView(vw = this.#viewport.clientWidth): void {
    const { width } = this.#layout;
    const c = this.#config();
    const first = this.#visible[0];
    const box = first ? this.#layout.boxes.get(first) : undefined;
    if (vw === 0) {
      this.#setView({ x: MARGIN, y: MARGIN, scale: 1 });
      return;
    }
    if (width + 2 * MARGIN <= vw || !box) this.#setView({ x: (vw - width) / 2, y: MARGIN, scale: 1 });
    else if (c.orientation === 'vertical') this.#setView({ x: vw / 2 - (box.x + box.width / 2), y: MARGIN, scale: 1 });
    else this.#setView({ x: c.direction === 'rtl' ? vw - MARGIN - (box.x + box.width) : MARGIN - box.x, y: MARGIN, scale: 1 });
  }

  /** Pan the smallest amount that brings a node fully into view. */
  #reveal(id: string): void {
    const box = this.#layout.boxes.get(id);
    if (!box) return;
    const vw = this.#viewport.clientWidth;
    const vh = this.#viewport.clientHeight;
    if (vw === 0 || vh === 0) return;
    const v = this.#view;
    const left = box.x * v.scale + v.x;
    const top = box.y * v.scale + v.y;
    const right = left + box.width * v.scale;
    const bottom = top + box.height * v.scale;
    let dx = 0;
    let dy = 0;
    if (left < MARGIN) dx = MARGIN - left;
    else if (right > vw - MARGIN) dx = Math.max(MARGIN - left, vw - MARGIN - right);
    if (top < MARGIN) dy = MARGIN - top;
    else if (bottom > vh - MARGIN) dy = Math.max(MARGIN - top, vh - MARGIN - bottom);
    if (dx !== 0 || dy !== 0) {
      this.#viewSet = true;
      this.#setView({ x: v.x + dx, y: v.y + dy, scale: v.scale });
    }
  }

  // ---- rendering ---------------------------------------------------------------

  #tree(): OrgChartLayoutInput[] {
    const build = (id: string): OrgChartLayoutInput => ({
      id,
      children: this.#expanded.has(id) ? (this.#children.get(id) ?? []).map(build) : [],
    });
    return (this.#children.get(ROOT) ?? []).map(build);
  }

  #render(): void {
    const c = this.#config();
    const roots = this.#tree();
    this.#layout = layoutOrgChart(roots, {
      nodeWidth: c.nodeWidth,
      nodeHeight: c.nodeHeight,
      siblingGap: c.siblingGap,
      levelGap: c.levelGap,
      orientation: c.orientation,
      mirror: c.direction === 'rtl',
    });
    const visible: string[] = [];
    const walk = (n: OrgChartLayoutInput): void => {
      visible.push(n.id);
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    this.#visible = visible;
    if (this.#focusId === null || !this.#layout.boxes.has(this.#focusId)) {
      // Focus moves to the nearest visible ancestor (a collapsed manager).
      const path = this.#focusId === null ? [] : this.pathTo(this.#focusId);
      this.#focusId = [...path].reverse().find((id) => this.#layout.boxes.has(id)) ?? visible[0] ?? null;
    }
    const doc = this.#doc;
    const s = this.#canvas.style;
    s.setProperty('inline-size', `${String(this.#layout.width)}px`);
    s.setProperty('block-size', `${String(this.#layout.height)}px`);
    s.setProperty('--aui-org-chart-node-width', `${String(c.nodeWidth)}px`);
    s.setProperty('--aui-org-chart-node-height', `${String(c.nodeHeight)}px`);
    const radius = this.#options.nodeRadius;
    if (radius === undefined) s.removeProperty('--aui-chart-node-radius');
    else s.setProperty('--aui-chart-node-radius', `${String(radius)}px`);
    this.#links.setAttribute('width', String(this.#layout.width));
    this.#links.setAttribute('height', String(this.#layout.height));
    this.#links.setAttribute('viewBox', `0 0 ${String(this.#layout.width)} ${String(this.#layout.height)}`);
    const paths = this.#layout.edges.map((e) => {
      const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', e.path);
      p.classList.add('aui-org-chart__link');
      if (this.#path.has(e.from) && this.#path.has(e.to)) p.classList.add('aui-org-chart__link--path');
      return p;
    });
    this.#links.replaceChildren(...paths);

    const keep = new Set(visible);
    for (const [id, e] of this.#els) {
      if (keep.has(id)) continue;
      e.drag?.dispose();
      e.el.remove();
      releaseNode(e.content);
      this.#els.delete(id);
    }
    const focused = doc.activeElement;
    let before: Element | null = this.element.firstElementChild;
    for (const id of visible) {
      const node = this.#nodes.get(id);
      const box = this.#layout.boxes.get(id);
      if (!node || !box) continue;
      const entry = this.#els.get(id) ?? this.#createEl(id);
      this.#paint(entry, node, box);
      // Keep the DOM in tree (reading) order; move only what is out of place.
      if (entry.el !== before) this.element.insertBefore(entry.el, before);
      before = entry.el.nextElementSibling;
    }
    if (focused instanceof HTMLElement && focused !== doc.activeElement && focused.isConnected) focused.focus({ preventScroll: true });
    this.#syncTabindex();
    this.#syncToolbar();
  }

  #createEl(id: string): NodeEl {
    const doc = this.#doc;
    const el = doc.createElement('div');
    el.className = 'aui-org-chart__node';
    el.setAttribute('role', 'treeitem');
    el.dataset.auiNode = id;
    el.tabIndex = -1;
    const card = doc.createElement('div');
    card.className = 'aui-org-chart__card';
    const toggle = doc.createElement('span');
    toggle.className = 'aui-org-chart__toggle';
    toggle.setAttribute('aria-hidden', 'true');
    el.append(card, toggle);
    const entry: NodeEl = { el, card, toggle, drag: null, data: null, content: null };
    this.#els.set(id, entry);
    return entry;
  }

  #paint(entry: NodeEl, node: OrgChartNode, box: OrgChartBox): void {
    const { el, card, toggle } = entry;
    const doc = this.#doc;
    const s = el.style;
    s.setProperty('left', `${String(box.x)}px`);
    s.setProperty('top', `${String(box.y)}px`);
    const siblings = this.#children.get(node.parentId ?? ROOT) ?? [];
    el.setAttribute('aria-level', String(box.depth + 1));
    el.setAttribute('aria-setsize', String(siblings.length));
    el.setAttribute('aria-posinset', String(siblings.indexOf(node.id) + 1));
    const hasChildren = this.#hasChildren(node.id);
    const expanded = this.#expanded.has(node.id);
    if (hasChildren) el.setAttribute('aria-expanded', String(expanded));
    else el.removeAttribute('aria-expanded');
    el.setAttribute('aria-selected', String(this.#selected === node.id));
    if (this.#loading.has(node.id)) el.setAttribute('aria-busy', 'true');
    else el.removeAttribute('aria-busy');
    el.classList.toggle('aui-org-chart__node--path', this.#path.has(node.id));
    el.classList.toggle('aui-org-chart__node--cut', this.#cut === node.id);
    el.classList.toggle('aui-org-chart__node--locked', node.locked === true);
    const count = this.#children.get(node.id)?.length ?? 0;
    if (entry.data !== node || entry.data.label !== node.label || entry.data.title !== node.title || entry.data.description !== node.description) {
      const context: OrgChartRenderContext = { depth: box.depth, expanded, childCount: count, doc };
      releaseNode(entry.content);
      entry.content = this.#options.renderNode ? this.#options.renderNode(copyNode(node), context) : null;
      card.replaceChildren(entry.content ?? this.#defaultCard(node));
      entry.data = node;
    }
    toggle.hidden = !hasChildren;
    if (hasChildren) {
      const rtl = this.#config().direction === 'rtl';
      const horizontal = this.#config().orientation === 'horizontal';
      const icon: IconRef = expanded ? (horizontal ? (rtl ? 'chevron-right' : 'chevron-left') : 'chevron-up') : horizontal ? (rtl ? 'chevron-left' : 'chevron-right') : 'chevron-down';
      const text = doc.createElement('span');
      text.textContent = count > 0 ? formatNumber(count, {}, this.#config().locale) : '';
      toggle.replaceChildren(text, renderIcon(icon, { doc }));
      toggle.title = this.#msg('reports', { count: String(count) });
    }
    if (this.editable && node.locked !== true) {
      entry.drag ??= this.#nodeDrag(node.id, el);
    } else if (entry.drag) {
      entry.drag.dispose();
      entry.drag = null;
    }
  }

  #defaultCard(node: OrgChartNode): DocumentFragment {
    const doc = this.#doc;
    const frag = doc.createDocumentFragment();
    const avatar = doc.createElement('span');
    avatar.className = 'aui-org-chart__avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initials(node.label);
    const text = doc.createElement('span');
    text.className = 'aui-org-chart__text';
    const name = doc.createElement('span');
    name.className = 'aui-org-chart__name';
    name.textContent = node.label;
    text.append(name);
    for (const [key, value] of [['title', node.title], ['description', node.description]] as const) {
      if (value === undefined || value === '') continue;
      const line = doc.createElement('span');
      line.className = `aui-org-chart__${key}`;
      // Separator for the accessible name (name from content): "Ada Lovelace, CTO".
      const sep = doc.createElement('span');
      sep.className = 'aui-org-chart__sep';
      sep.textContent = ', ';
      line.append(sep, value);
      text.append(line);
    }
    frag.append(avatar, text);
    return frag;
  }

  #syncTabindex(): void {
    for (const [id, e] of this.#els) e.el.tabIndex = id === this.#focusId ? 0 : -1;
  }

  #focus(id: string): void {
    this.#focusId = id;
    this.#syncTabindex();
    this.#reveal(id);
    this.#els.get(id)?.el.focus({ preventScroll: true });
    this.#syncToolbar();
  }

  #emitExpand(id: string, expanded: boolean): void {
    const detail: OrgChartExpandChangeDetail = { id, expanded };
    emit(this.host, 'aui-expand-change', detail);
  }

  #select(id: string | null, emitIt: boolean): void {
    this.#selected = id;
    if (emitIt && id !== null) {
      const node = this.#nodes.get(id);
      if (node) {
        const detail: OrgChartNodeSelectDetail = { id, node: copyNode(node) };
        emit(this.host, 'aui-node-select', detail);
      }
    }
  }

  // ---- keyboard and pointer ------------------------------------------------------

  #onKey(e: KeyboardEvent): void {
    const id = this.#focusId;
    if (id === null) return;
    const rtl = this.#config().direction === 'rtl';
    const index = this.#visible.indexOf(id);
    const node = this.#nodes.get(id);
    if (!node) return;
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (this.editable) {
      if (matchesHotkey(e, 'mod+x')) {
        e.preventDefault();
        this.#cutNode(id);
        return;
      }
      if (matchesHotkey(e, 'mod+v')) {
        e.preventDefault();
        this.#paste(id);
        return;
      }
      if (matchesHotkey(e, 'mod+z')) {
        e.preventDefault();
        this.undo();
        return;
      }
      if (matchesHotkey(e, 'mod+shift+z') || matchesHotkey(e, 'mod+y')) {
        e.preventDefault();
        this.redo();
        return;
      }
      if (e.key === 'Escape' && this.#cut !== null) {
        e.preventDefault();
        e.stopPropagation();
        this.#cancelCut();
        return;
      }
    }
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = this.#visible[index + 1];
        if (next) this.#focus(next);
        return;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev = this.#visible[index - 1];
        if (prev) this.#focus(prev);
        return;
      }
      case 'Home': {
        e.preventDefault();
        const first = this.#visible[0];
        if (first) this.#focus(first);
        return;
      }
      case 'End': {
        e.preventDefault();
        const last = this.#visible[this.#visible.length - 1];
        if (last) this.#focus(last);
        return;
      }
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.#select(id, true);
        this.#render();
        return;
      case '*': {
        e.preventDefault();
        for (const sib of this.#children.get(node.parentId ?? ROOT) ?? []) void this.setExpanded(sib, true);
        return;
      }
      case '+':
      case '=':
        e.preventDefault();
        this.zoomTo(this.#view.scale * ZOOM_STEP);
        return;
      case '-':
        e.preventDefault();
        this.zoomTo(this.#view.scale / ZOOM_STEP);
        return;
      case '0':
        e.preventDefault();
        this.fit();
        return;
    }
    if (e.key === forward) {
      e.preventDefault();
      if (!this.#hasChildren(id)) return;
      if (!this.#expanded.has(id)) void this.setExpanded(id, true);
      else {
        const child = this.#children.get(id)?.[0];
        if (child) this.#focus(child);
      }
      return;
    }
    if (e.key === back) {
      e.preventDefault();
      if (this.#expanded.has(id) && this.#hasChildren(id)) void this.setExpanded(id, false);
      else if (node.parentId !== null) this.#focus(node.parentId);
      return;
    }
    if (isPrintableKey(e) && e.key !== ' ') {
      const labels = this.#visible.map((v) => this.#nodes.get(v)?.label ?? '');
      const found = this.#typeahead.handle(e.key, labels, index);
      const target = this.#visible[found];
      if (found !== -1 && target) {
        e.preventDefault();
        this.#focus(target);
      }
    }
  }

  #onClick(e: MouseEvent): void {
    const t = e.target instanceof Element ? e.target : null;
    const item = t?.closest<HTMLElement>('[role="treeitem"]');
    const id = item?.dataset.auiNode;
    if (id === undefined) return;
    if (t?.closest('.aui-org-chart__toggle')) {
      void this.setExpanded(id, !this.#expanded.has(id));
      this.#focus(id);
      return;
    }
    this.#select(id, true);
    this.#focusId = id;
    this.#render();
    this.#els.get(id)?.el.focus({ preventScroll: true });
  }

  #nodeDrag(id: string, el: HTMLElement): PointerDrag {
    return trackPointerDrag(el, {
      canStart: (e) => this.editable && this.#nodes.get(id)?.locked !== true && !(e.target instanceof Element && e.target.closest('.aui-org-chart__toggle')),
      onStart: () => {
        this.#dragging = { id, target: null };
        el.classList.add('aui-org-chart__node--dragging');
      },
      onMove: (move) => {
        const drag = this.#dragging;
        if (!drag) return;
        const s = this.#view.scale;
        el.style.setProperty('translate', `${String(Math.round(move.dx / s))}px ${String(Math.round(move.dy / s))}px`);
        const under = this.#doc.elementsFromPoint(move.point.x, move.point.y).map((n) => n.closest<HTMLElement>('[role="treeitem"]')).find((n) => n !== null && n !== el);
        const target = under?.dataset.auiNode ?? null;
        if (target !== drag.target) {
          if (drag.target !== null) this.#els.get(drag.target)?.el.classList.remove('aui-org-chart__node--drop', 'aui-org-chart__node--no-drop');
          drag.target = target;
          if (target !== null) this.#els.get(target)?.el.classList.add(this.#canMoveTo(id, target) ? 'aui-org-chart__node--drop' : 'aui-org-chart__node--no-drop');
        }
      },
      onEnd: () => {
        const drag = this.#dragging;
        this.#endDrag(el);
        if (drag?.target != null) this.#move(id, drag.target, undefined, 'move');
      },
      onCancel: () => {
        this.#endDrag(el);
      },
    });
  }

  #endDrag(el: HTMLElement): void {
    const drag = this.#dragging;
    this.#dragging = null;
    el.classList.remove('aui-org-chart__node--dragging');
    el.style.removeProperty('translate');
    if (drag?.target != null) this.#els.get(drag.target)?.el.classList.remove('aui-org-chart__node--drop', 'aui-org-chart__node--no-drop');
  }

  // ---- editing ---------------------------------------------------------------

  #isAncestor(ancestor: string, id: string): boolean {
    let cursor: string | null = id;
    while (cursor !== null) {
      if (cursor === ancestor) return true;
      cursor = this.#nodes.get(cursor)?.parentId ?? null;
    }
    return false;
  }

  #canMoveTo(id: string, parentId: string | null): boolean {
    const node = this.#nodes.get(id);
    if (!node || node.locked === true) return false;
    if (parentId !== null && (!this.#nodes.has(parentId) || this.#isAncestor(id, parentId))) return false;
    const parent = parentId === null ? null : (this.#nodes.get(parentId) ?? null);
    return this.#options.canMove ? this.#options.canMove(copyNode(node), parent ? copyNode(parent) : null) : true;
  }

  #cutNode(id: string): void {
    const node = this.#nodes.get(id);
    if (!node) return;
    if (node.locked === true) {
      announce(this.#msg('locked', { label: node.label }), 'assertive');
      return;
    }
    this.#cut = id;
    this.#render();
    announce(this.#msg('cutDone', { label: node.label }), 'assertive');
  }

  #cancelCut(): void {
    this.#cut = null;
    this.#render();
    announce(this.#msg('cutCancelled'));
  }

  #paste(parentId: string): void {
    const id = this.#cut;
    if (id === null) return;
    if (this.#move(id, parentId, undefined, 'move')) {
      this.#cut = null;
      this.#render();
      this.#focus(id);
    }
  }

  #move(id: string, parentId: string | null, index: number | undefined, reason: OrgChartNodeMoveReason): boolean {
    const node = this.#nodes.get(id);
    if (!node) fail('moveNode.id', 'a node id');
    if (parentId !== null && !this.#nodes.has(parentId)) fail('moveNode.parentId', 'a node id or null');
    const parent = parentId === null ? null : (this.#nodes.get(parentId) ?? null);
    if (!this.#canMoveTo(id, parentId)) {
      announce(node.locked === true ? this.#msg('locked', { label: node.label }) : this.#msg('notAllowed', { label: node.label, parent: parent?.label ?? '' }), 'assertive');
      return false;
    }
    const from = node.parentId;
    const fromList = this.#children.get(from ?? ROOT) ?? [];
    const fromIndex = fromList.indexOf(id);
    const targetList = (this.#children.get(parentId ?? ROOT) ?? []).filter((c) => c !== id);
    const toIndex = Math.max(0, Math.min(index ?? targetList.length, targetList.length));
    if (from === parentId && fromIndex === toIndex) return true;
    const m: Move = { id, from, fromIndex, to: parentId, toIndex };
    this.#apply(m);
    const limit = this.#options.historyLimit ?? 50;
    if (limit > 0) {
      this.#history.push(m);
      if (this.#history.length > limit) this.#history.shift();
    }
    this.#future = [];
    if (parentId !== null) this.#expanded.add(parentId);
    this.#render();
    announce(parent ? this.#msg('moved', { label: node.label, parent: parent.label }) : this.#msg('movedRoot', { label: node.label }));
    this.#emitMove(reason, id, parentId, from, toIndex);
    return true;
  }

  #apply(m: Move): void {
    const node = this.#nodes.get(m.id);
    if (!node) return;
    const fromKey = m.from ?? ROOT;
    this.#children.set(fromKey, (this.#children.get(fromKey) ?? []).filter((c) => c !== m.id));
    const toKey = m.to ?? ROOT;
    const list = [...(this.#children.get(toKey) ?? [])].filter((c) => c !== m.id);
    list.splice(Math.max(0, Math.min(m.toIndex, list.length)), 0, m.id);
    this.#children.set(toKey, list);
    node.parentId = m.to;
    if (m.to !== null) {
      this.#expanded.add(m.to);
      const parent = this.#nodes.get(m.to);
      if (parent?.hasChildren === true) this.#loaded.add(m.to);
    }
    if ((this.#children.get(fromKey)?.length ?? 0) === 0 && m.from !== null && this.#nodes.get(m.from)?.hasChildren !== true) this.#expanded.delete(m.from);
  }

  #emitMove(reason: OrgChartNodeMoveReason, id: string, parentId: string | null, previousParentId: string | null, index: number): void {
    const detail: OrgChartNodeMoveDetail = { reason, id, parentId, previousParentId, index, nodes: this.nodes };
    emit(this.host, 'aui-node-move', detail);
  }
}
