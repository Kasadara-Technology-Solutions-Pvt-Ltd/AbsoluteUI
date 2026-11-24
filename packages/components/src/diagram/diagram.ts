/**
 * Diagram (R20 P8): a flowchart and diagram editor and viewer rendered in SVG.
 *
 * The model is JSON (nodes with shapes, sizes, positions, and ports; edges with
 * routing, arrowheads, labels, and dashes; optional groups). Auto-layout is
 * layered (Sugiyama style) or tree, top-down or left-to-right, and can keep
 * manual positions. Nodes form a multi-select listbox with one roving tab stop:
 * arrow keys move focus to the nearest node in that direction; connections form a
 * second listbox. In edit mode nodes are added from a palette (click or drag),
 * moved by pointer (grid snap, alignment guides), by keyboard (move mode, `M`), or
 * by a single pointer (Move selection here); connected by dragging from a port,
 * by keyboard (`C` on the source, then `C` or Enter on the target), or with the
 * toolbar Connect button; labels are edited inline (plain text input); selections
 * are copied, pasted, and deleted; every edit is undoable. A text alternative
 * lists nodes and their connections. Pan by dragging the background (the Pan tool
 * in edit mode) or with arrow keys on the canvas; zoom with Ctrl/Cmd + wheel,
 * `+`/`-`, and fit with `0` or the toolbar.
 */
import {
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  formatNumber,
  getMessage,
  registerMessages,
  releaseNode,
  validators,
  type Direction,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, matchesHotkey, observeResize, trackPointerDrag, type DragMove, type PointerDrag } from '@absoluteui/utilities';
import {
  approach,
  arrowPath,
  DEFAULT_PORTS,
  facingSide,
  labelBox,
  polylineD,
  portPoint,
  routeEdge,
  shapeDetail,
  shapePath,
  trimPolyline,
  wrapText,
  type Box,
  type DiagramArrow,
  type DiagramRouting,
  type DiagramShape,
  type Point,
  type PortSpec,
  type Route,
} from './geometry.js';
import { layoutDiagram, type DiagramLayoutOptions } from './layout.js';
import { assertModel, copyEdge, copyGroup, copyNode, fail, type DiagramEdge, type DiagramGroup, type DiagramModel, type DiagramNode } from './model.js';

export type DiagramTextAlternative = 'toggle' | 'visible' | 'hidden' | 'none';

export interface DiagramConfig {
  /** Default node size in diagram px. */
  nodeWidth: number;
  nodeHeight: number;
  /** Grid spacing in diagram px (snap, keyboard moves, dotted grid). */
  gridSize: number;
  snapToGrid: boolean;
  /** Default edge routing. */
  routing: DiagramRouting;
  /** Auto-layout spacing. */
  nodeGap: number;
  rankGap: number;
  minZoom: number;
  maxZoom: number;
  /** Text alternative (nodes and connections table). */
  textAlternative: DiagramTextAlternative;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    diagram: DiagramConfig & { locale: string; direction: Direction };
  }
}

export const diagramConfig = defineComponentConfig<DiagramConfig, 'locale' | 'direction'>(
  'diagram',
  {
    nodeWidth: { default: 160, expected: 'integer from 40 to 800 (diagram px)', validate: validators.integerInRange(40, 800) },
    nodeHeight: { default: 64, expected: 'integer from 24 to 600 (diagram px)', validate: validators.integerInRange(24, 600) },
    gridSize: { default: 16, expected: 'integer from 4 to 200 (diagram px)', validate: validators.integerInRange(4, 200) },
    snapToGrid: { default: true, expected: 'boolean', validate: validators.isBoolean },
    routing: { default: 'orthogonal', expected: '"straight" | "orthogonal" | "curved"', validate: validators.oneOf(['straight', 'orthogonal', 'curved'] as const) },
    nodeGap: { default: 40, expected: 'integer from 8 to 400 (diagram px)', validate: validators.integerInRange(8, 400) },
    rankGap: { default: 64, expected: 'integer from 16 to 600 (diagram px)', validate: validators.integerInRange(16, 600) },
    minZoom: { default: 0.2, expected: 'number from 0.05 to 1', validate: validators.numberInRange(0.05, 1) },
    maxZoom: { default: 3, expected: 'number from 1 to 8', validate: validators.numberInRange(1, 8) },
    textAlternative: { default: 'toggle', expected: '"toggle" | "visible" | "hidden" | "none"', validate: validators.oneOf(['toggle', 'visible', 'hidden', 'none'] as const) },
  },
  ['locale', 'direction'],
);

registerMessages('diagram', 'en', {
  toolbar: '{label} controls',
  palette: 'Add shapes',
  canvas: '{label}',
  canvasRole: 'canvas',
  nodes: '{label}: nodes',
  links: '{label}: connections',
  nodeRole: 'node',
  linkRole: 'connection',
  untitled: 'Untitled',
  nodeName: '{label}, {shape}',
  leadsTo: 'leads to {list}',
  comesFrom: 'comes from {list}',
  notConnected: 'not connected',
  groupName: 'in {group}',
  locked: 'locked',
  linkName: '{from} to {to}',
  linkNameLabel: '{from} to {to}, {label}',
  listSeparator: ', ',
  shape_rectangle: 'rectangle',
  shape_rounded: 'rounded rectangle',
  shape_ellipse: 'ellipse',
  shape_diamond: 'decision',
  shape_parallelogram: 'input or output',
  shape_cylinder: 'database',
  shape_document: 'document',
  shape_custom: 'shape',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit to screen',
  pan: 'Pan tool',
  connect: 'Connect',
  place: 'Move selection',
  undo: 'Undo',
  redo: 'Redo',
  delete: 'Delete selection',
  zoomed: 'Zoom {percent}',
  added: '{label} added.',
  deleted: '{count} deleted.',
  moved: '{label} moved.',
  movedMany: '{count} nodes moved.',
  moveMode: 'Move mode for {label}. Arrow keys move it, Shift for larger steps. Enter finishes, Escape cancels.',
  moveCancelled: 'Move cancelled.',
  connectStart: 'Connecting from {label}. Go to the target node and press C or Enter. Escape cancels.',
  connectPointer: 'Connecting from {label}. Select the target node.',
  connected: '{from} connected to {to}.',
  reconnected: 'Connection now {from} to {to}.',
  connectRefused: '{from} cannot connect to {to}.',
  connectCancelled: 'Connect cancelled.',
  noSource: 'Select or focus a node first.',
  placeStart: 'Select the place on the canvas where the selection should go. Escape cancels.',
  lockedNode: '{label} is locked.',
  labelChanged: 'Label changed to {label}.',
  editLabel: 'Label of {label}',
  copied: '{count} copied.',
  pasted: '{count} pasted.',
  undone: 'Undone.',
  redone: 'Redone.',
  layoutDone: 'Layout applied.',
  showText: 'Show text description',
  hideText: 'Hide text description',
  textCaption: '{label}: nodes and connections',
  colNode: 'Node',
  colShape: 'Shape',
  colTo: 'Leads to',
  colFrom: 'Comes from',
  none: 'None',
});

export interface DiagramAutoLayout extends DiagramLayoutOptions {
  /** Keep nodes that are pinned or were moved by hand; place only the others. Default false. */
  keepPositions?: boolean;
}

export interface DiagramPaletteItem {
  shape: DiagramShape;
  /** Button text and the new node's label. */
  label: string;
  width?: number;
  height?: number;
}

export interface DiagramShapeContext {
  readonly width: number;
  readonly height: number;
  readonly selected: boolean;
  readonly doc: Document;
}

export interface DiagramOptions extends Partial<DiagramConfig> {
  /** Accessible name of the diagram. */
  label: string;
  model: DiagramModel;
  /** Edit mode. Default false. */
  editable?: boolean;
  /**
   * Auto-layout settings: used when nodes have no position, and as defaults of
   * layout(). When given on create, the layout runs once. Null: no automatic layout.
   */
  layout?: DiagramAutoLayout | null;
  /** Shapes offered in edit mode. Default: one of each built-in shape. */
  palette?: readonly DiagramPaletteItem[];
  /** Draws `custom` nodes: return SVG content in local coordinates (0,0)..(width,height). */
  renderShape?: (node: Readonly<DiagramNode>, context: DiagramShapeContext) => SVGElement;
  /** Veto a new or changed connection (edit mode and addEdge). Self connections are always refused. */
  canConnect?: (from: Readonly<DiagramNode>, to: Readonly<DiagramNode>) => boolean;
  /** Undo depth, 0..500. Default 100. */
  historyLimit?: number;
  /** Dotted grid in edit mode. Default true. */
  showGrid?: boolean;
  locale?: string;
  direction?: Direction;
}

export type DiagramChangeReason = 'add' | 'move' | 'connect' | 'reconnect' | 'label' | 'delete' | 'paste' | 'layout' | 'update' | 'undo' | 'redo';

export interface DiagramChangeDetail {
  reason: DiagramChangeReason;
  /** The whole model after the change (a copy, for saving). */
  model: DiagramModel;
  /** Ids of the nodes and edges the change touched. */
  ids: string[];
}

export interface DiagramSelectDetail {
  nodes: string[];
  edges: string[];
}

export interface DiagramNodeActivateDetail {
  id: string;
  node: DiagramNode;
}

export interface DiagramZoomDetail {
  scale: number;
}

/** Drawn geometry (for export). */
export interface DiagramGeometry {
  readonly nodes: readonly { readonly node: Readonly<DiagramNode>; readonly box: Box; readonly shape: DiagramShape; readonly lines: readonly string[]; readonly lineHeight: number; readonly labelBox: Box }[];
  readonly edges: readonly { readonly edge: Readonly<DiagramEdge>; readonly route: Route; readonly start: DiagramArrow; readonly end: DiagramArrow; readonly labelBox: Box | null }[];
  readonly groups: readonly { readonly group: Readonly<DiagramGroup>; readonly box: Box }[];
  /** Bounds of everything drawn (diagram px). */
  readonly bounds: Box;
  /** Rendered elements to read computed colors from (null when none is rendered). */
  readonly samples: { readonly node: Element | null; readonly label: Element | null; readonly edge: Element | null; readonly edgeLabel: Element | null; readonly group: Element | null };
}

type Resolved = DiagramNode & { x: number; y: number; width: number; height: number; placed?: boolean };

interface Snapshot {
  readonly nodes: DiagramNode[];
  readonly edges: DiagramEdge[];
  readonly groups: DiagramGroup[];
  readonly manual: string[];
}

interface NodeEl {
  readonly g: SVGGElement;
  readonly body: SVGGElement;
  readonly text: SVGTextElement;
  readonly ports: SVGGElement;
  readonly focus: SVGRectElement;
  sig: string;
  content: Node | null;
  lines: string[];
  lineHeight: number;
  labelBox: Box;
}

interface EdgeEl {
  readonly visual: SVGGElement;
  readonly line: SVGPathElement;
  readonly arrowStart: SVGPathElement;
  readonly arrowEnd: SVGPathElement;
  readonly link: SVGGElement;
  readonly hit: SVGPathElement;
  readonly ring: SVGPathElement;
  readonly core: SVGPathElement;
  readonly labelG: SVGGElement;
  readonly labelBg: SVGRectElement;
  readonly labelText: SVGTextElement;
  readonly handles: SVGGElement;
  route: Route | null;
  labelBox: Box | null;
}

type Gesture =
  | { kind: 'move'; primary: string; ids: string[]; start: Map<string, Point>; before: Snapshot; moved: boolean }
  | { kind: 'connect'; from: string; port: string | null; target: { id: string; port: string | null } | null }
  | { kind: 'reconnect'; edge: string; end: 'from' | 'to'; target: { id: string; port: string | null } | null }
  | { kind: 'marquee'; origin: Point; additive: boolean; base: Set<string> }
  | { kind: 'pan'; x: number; y: number };

const SVG_NS = 'http://www.w3.org/2000/svg';
const ZOOM_STEP = 1.2;
const MARGIN = 24;
const PAN_STEP = 48;
const GUIDE_SNAP = 6;
const DEFAULT_PALETTE: readonly DiagramPaletteItem[] = [
  { shape: 'rounded', label: 'Step' },
  { shape: 'diamond', label: 'Decision', width: 160, height: 96 },
  { shape: 'ellipse', label: 'Start or end', width: 144, height: 56 },
  { shape: 'rectangle', label: 'Process' },
  { shape: 'parallelogram', label: 'Input or output' },
  { shape: 'document', label: 'Document' },
  { shape: 'cylinder', label: 'Database', width: 128, height: 80 },
];
const SHAPE_ICON_PATHS: Readonly<Record<DiagramShape, string>> = {
  rectangle: shapePath('rectangle', 20, 14),
  rounded: shapePath('rounded', 20, 14),
  ellipse: shapePath('ellipse', 20, 14),
  diamond: shapePath('diamond', 20, 14),
  parallelogram: shapePath('parallelogram', 20, 14),
  cylinder: shapePath('cylinder', 20, 14),
  document: shapePath('document', 20, 14),
  custom: shapePath('rounded', 20, 14),
};

function svg<K extends keyof SVGElementTagNameMap>(doc: Document, name: K, attrs: Readonly<Record<string, string>> = {}, className?: string): SVGElementTagNameMap[K] {
  const e = doc.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (className) e.setAttribute('class', className);
  return e;
}

const intersects = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const r1 = (v: number): string => String(Math.round(v * 10) / 10);

export class Diagram {
  readonly host: HTMLElement;
  /** The nodes listbox (role=listbox). */
  readonly element: SVGGElement;
  readonly #doc: Document;
  readonly #group = new DisposableGroup();
  readonly #toolbar: HTMLDivElement;
  readonly #palette: HTMLDivElement;
  readonly #viewport: HTMLDivElement;
  readonly #svg: SVGSVGElement;
  readonly #scene: SVGGElement;
  readonly #gridRect: SVGRectElement;
  readonly #gridPattern: SVGPatternElement;
  readonly #groupsLayer: SVGGElement;
  readonly #edgesLayer: SVGGElement;
  readonly #links: SVGGElement;
  readonly #overlay: SVGGElement;
  readonly #editor: HTMLInputElement;
  readonly #text: HTMLDivElement;
  readonly #buttons = new Map<string, HTMLButtonElement>();
  readonly #paletteDrags: PointerDrag[] = [];
  #options: DiagramOptions;
  #nodes = new Map<string, Resolved>();
  #order: string[] = [];
  #edges = new Map<string, DiagramEdge>();
  #edgeOrder: string[] = [];
  #groups: DiagramGroup[] = [];
  #incident = new Map<string, Set<string>>();
  /** Spread positions of edge ends without a port that share a node side. */
  #autoPorts = new Map<string, { from: PortSpec | null; to: PortSpec | null }>();
  #manual = new Set<string>();
  #nodeEls = new Map<string, NodeEl>();
  #edgeEls = new Map<string, EdgeEl>();
  #selNodes = new Set<string>();
  #selEdges = new Set<string>();
  #focusNode: string | null = null;
  #focusEdge: string | null = null;
  #history: Snapshot[] = [];
  #future: Snapshot[] = [];
  #view = { x: 0, y: 0, scale: 1 };
  #viewSet = false;
  #gesture: Gesture | null = null;
  #drag: PointerDrag | null = null;
  #down: { id: string; wasSelected: boolean; modifier: boolean } | null = null;
  #connectFrom: string | null = null;
  #placing = false;
  #hand = false;
  #space = false;
  #moveMode: { ids: string[]; start: Map<string, Point>; before: Snapshot } | null = null;
  #editing: { kind: 'node' | 'edge'; id: string } | null = null;
  #clipboard: { nodes: DiagramNode[]; edges: DiagramEdge[] } | null = null;
  #pasteCount = 0;
  #textOpen = false;
  #measure: ((s: string) => number) | null = null;
  #font = { px: 14, family: 'sans-serif' };

  static create(host: HTMLElement, options: DiagramOptions): Diagram {
    return new Diagram(host, options);
  }

  private constructor(host: HTMLElement, options: DiagramOptions) {
    Diagram.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#doc;
    this.#setModel(options.model);
    const auto = options.layout;
    const unplaced = [...this.#nodes.values()].some((n) => n.placed === false);
    if (auto !== undefined && auto !== null) this.#runLayout(auto, auto.keepPositions === true ? 'fill' : 'all');
    else if (unplaced) this.#runLayout({}, 'fill');

    this.#toolbar = doc.createElement('div');
    this.#toolbar.className = 'aui-diagram__toolbar';
    this.#toolbar.setAttribute('role', 'group');
    this.#palette = doc.createElement('div');
    this.#palette.className = 'aui-diagram__palette';
    this.#palette.setAttribute('role', 'group');
    this.#viewport = doc.createElement('div');
    this.#viewport.className = 'aui-diagram__viewport';
    this.#viewport.tabIndex = 0;
    this.#viewport.setAttribute('role', 'group');
    this.#svg = svg(doc, 'svg', { focusable: 'false' }, 'aui-diagram__svg');
    const defs = svg(doc, 'defs');
    const gridId = createId('aui-diagram-grid');
    this.#gridPattern = svg(doc, 'pattern', { id: gridId, patternUnits: 'userSpaceOnUse', width: '16', height: '16' });
    this.#gridPattern.append(svg(doc, 'circle', { cx: '1', cy: '1', r: '1' }, 'aui-diagram__grid-dot'));
    defs.append(this.#gridPattern);
    this.#scene = svg(doc, 'g', {}, 'aui-diagram__scene');
    this.#gridRect = svg(doc, 'rect', { fill: `url(#${gridId})`, 'aria-hidden': 'true' }, 'aui-diagram__grid');
    this.#groupsLayer = svg(doc, 'g', { 'aria-hidden': 'true' }, 'aui-diagram__groups');
    this.#edgesLayer = svg(doc, 'g', { 'aria-hidden': 'true' }, 'aui-diagram__edges');
    this.element = svg(doc, 'g', { role: 'listbox', 'aria-multiselectable': 'true' }, 'aui-diagram__nodes');
    this.#links = svg(doc, 'g', { role: 'listbox', 'aria-multiselectable': 'true' }, 'aui-diagram__links');
    this.#overlay = svg(doc, 'g', { 'aria-hidden': 'true' }, 'aui-diagram__overlay');
    this.#scene.append(this.#gridRect, this.#groupsLayer, this.#edgesLayer, this.element, this.#links, this.#overlay);
    this.#svg.append(defs, this.#scene);
    this.#editor = doc.createElement('input');
    this.#editor.type = 'text';
    this.#editor.className = 'aui-diagram__editor';
    this.#editor.hidden = true;
    this.#editor.autocomplete = 'off';
    this.#editor.spellcheck = true;
    this.#viewport.append(this.#svg, this.#editor);
    this.#text = doc.createElement('div');
    this.#text.className = 'aui-diagram__text';
    this.#buildToolbar();
    this.#buildPalette();
    host.classList.add('aui-diagram');
    host.append(this.#toolbar, this.#palette, this.#viewport, this.#text);
    this.#applyLabels();
    const width = this.#viewport.clientWidth;
    this.#render();
    this.#resetView(width);
    this.#listen();
  }

  // ---- public API ----------------------------------------------------------------

  /** The current model (copies, for saving). */
  get model(): DiagramModel {
    const out: DiagramModel = { nodes: this.#order.map((id) => this.#publicNode(id)), edges: this.#edgeOrder.map((id) => copyEdge(this.#edge(id))) };
    if (this.#groups.length > 0 || this.#options.model.groups !== undefined) out.groups = this.#groups.map(copyGroup);
    return out;
  }

  get selection(): DiagramSelectDetail {
    return { nodes: this.#order.filter((id) => this.#selNodes.has(id)), edges: this.#edgeOrder.filter((id) => this.#selEdges.has(id)) };
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

  /** Drawn geometry (used by the export functions). */
  get geometry(): DiagramGeometry {
    const nodes = this.#order.map((id) => {
      const n = this.#node(id);
      const el = this.#nodeEls.get(id);
      const shape = n.shape ?? 'rounded';
      return { node: this.#publicNode(id), box: this.#box(n), shape, lines: el?.lines ?? [n.label], lineHeight: el?.lineHeight ?? this.#font.px * 1.25, labelBox: el?.labelBox ?? labelBox(shape, n.width, n.height) };
    });
    const edges = this.#edgeOrder.flatMap((id) => {
      const e = this.#edge(id);
      const el = this.#edgeEls.get(id);
      const route = el?.route ?? this.#route(e);
      return route ? [{ edge: copyEdge(e), route, start: e.arrowStart ?? 'none', end: e.arrowEnd ?? 'arrow', labelBox: el?.labelBox ?? null }] : [];
    });
    const groups = this.#groupBoxes();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const grow = (b: Box): void => {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    };
    nodes.forEach((n) => {
      grow(n.box);
    });
    groups.forEach((g) => {
      grow(g.box);
    });
    edges.forEach((e) => {
      for (const p of e.route.points) grow({ x: p.x, y: p.y, width: 0, height: 0 });
      if (e.labelBox) grow(e.labelBox);
    });
    const bounds = Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : { x: 0, y: 0, width: 0, height: 0 };
    const q = (s: string): Element | null => this.#svg.querySelector(s);
    return { nodes, edges, groups, bounds, samples: { node: q('.aui-diagram__node:not([aria-selected="true"]) .aui-diagram__shape'), label: q('.aui-diagram__node:not([aria-selected="true"]) .aui-diagram__label'), edge: q('.aui-diagram__edge:not(.aui-diagram__edge--selected) .aui-diagram__line'), edgeLabel: q('.aui-diagram__edge-label-bg'), group: q('.aui-diagram__group-box') } };
  }

  update(options: Partial<DiagramOptions>): void {
    const next = { ...this.#options, ...options };
    Diagram.#assert(next);
    this.#cancelInteractions();
    this.#options = next;
    if (options.model !== undefined) {
      this.#setModel(next.model);
      this.#history = [];
      this.#future = [];
      this.#manual.clear();
      if ([...this.#nodes.values()].some((n) => n.placed === false)) this.#runLayout(next.layout ?? {}, 'fill');
      for (const el of this.#nodeEls.values()) el.sig = '';
    }
    if (options.renderShape !== undefined || options.nodeWidth !== undefined || options.nodeHeight !== undefined) for (const el of this.#nodeEls.values()) el.sig = '';
    if (options.palette !== undefined) this.#buildPalette();
    this.#applyLabels();
    this.#render();
  }

  /** Select nodes and edges by id (replaces the selection; no event). */
  select(ids: readonly string[]): void {
    this.#selNodes = new Set(ids.filter((id) => this.#nodes.has(id)));
    this.#selEdges = new Set(ids.filter((id) => this.#edges.has(id) && !this.#nodes.has(id)));
    this.#paintSelection();
  }

  /** Focus a node (pans it into view). */
  focusNode(id: string): void {
    if (!this.#nodes.has(id)) fail('focusNode.id', 'a node id');
    this.#focusOn(id);
  }

  /** Add a node (edit mode or not). Missing id, position, and size are filled in. Returns the id. */
  addNode(node: Partial<DiagramNode> & { label: string }): string {
    const id = node.id ?? this.#uniqueId('node');
    const draft: DiagramNode = { ...copyNode({ ...node, id }), id };
    const c = this.#config();
    const width = draft.width ?? c.nodeWidth;
    const height = draft.height ?? c.nodeHeight;
    if (draft.x === undefined || draft.y === undefined) {
      const center = this.#viewCenter();
      const free = this.#freeSpot({ x: this.#snap(center.x - width / 2), y: this.#snap(center.y - height / 2), width, height });
      draft.x = free.x;
      draft.y = free.y;
    }
    this.#validateWith({ nodes: [...this.model.nodes, draft] });
    this.#checkpoint();
    this.#insertNode(draft);
    this.#render();
    announce(this.#msg('added', { label: this.#name(id) }));
    this.#emitChange('add', [id]);
    return id;
  }

  /** Connect two nodes. Returns the new edge id, or null when refused (self, duplicate, canConnect). */
  addEdge(edge: Partial<DiagramEdge> & { from: string; to: string }): string | null {
    if (!this.#nodes.has(edge.from)) fail('addEdge.from', 'a node id');
    if (!this.#nodes.has(edge.to)) fail('addEdge.to', 'a node id');
    return this.#connect(edge.from, edge.fromPort ?? null, edge.to, edge.toPort ?? null, edge);
  }

  /** Change a node (validated). Undoable; emits aui-change with reason 'update'. */
  updateNode(id: string, patch: Partial<Omit<DiagramNode, 'id'>>): void {
    if (!this.#nodes.has(id)) fail('updateNode.id', 'a node id');
    const merged = { ...this.#publicNode(id), ...patch, id };
    this.#validateWith({ nodes: this.model.nodes.map((n) => (n.id === id ? merged : n)) });
    this.#checkpoint();
    this.#nodes.set(id, this.#resolve(merged, true));
    if (patch.x !== undefined || patch.y !== undefined) this.#manual.add(id);
    this.#render();
    this.#emitChange('update', [id]);
  }

  /** Change an edge (validated). Undoable; emits aui-change with reason 'update'. */
  updateEdge(id: string, patch: Partial<Omit<DiagramEdge, 'id'>>): void {
    if (!this.#edges.has(id)) fail('updateEdge.id', 'an edge id');
    const merged = { ...this.#edge(id), ...patch, id };
    this.#validateWith({ edges: this.model.edges.map((e) => (e.id === id ? merged : e)) });
    this.#checkpoint();
    this.#edges.set(id, copyEdge(merged));
    this.#reindex();
    this.#render();
    this.#emitChange('update', [id]);
  }

  /** Move a node to a position (diagram px; snapped when snapToGrid). Undoable. */
  moveNode(id: string, x: number, y: number): void {
    const n = this.#nodes.get(id);
    if (!n) fail('moveNode.id', 'a node id');
    if (!(Number.isFinite(x) && Number.isFinite(y))) fail('moveNode.x', 'finite numbers');
    this.#checkpoint();
    n.x = this.#snap(x);
    n.y = this.#snap(y);
    this.#manual.add(id);
    this.#render();
    this.#emitChange('move', [id]);
  }

  /** Remove nodes (with their edges) and edges by id. Undoable. */
  remove(ids: readonly string[]): void {
    const nodes = ids.filter((id) => this.#nodes.has(id));
    const edges = new Set(ids.filter((id) => this.#edges.has(id)));
    for (const n of nodes) for (const e of this.#incident.get(n) ?? []) edges.add(e);
    if (nodes.length === 0 && edges.size === 0) return;
    this.#checkpoint();
    this.#deleteItems(nodes, [...edges]);
    this.#render();
    this.#emitChange('delete', [...nodes, ...edges]);
  }

  /** Run auto-layout (defaults from the `layout` option). Undoable; emits aui-change with reason 'layout'. */
  layout(options: DiagramAutoLayout = {}): void {
    const merged: DiagramAutoLayout = { ...(this.#options.layout ?? {}), ...options };
    const algorithm: unknown = merged.algorithm;
    const direction: unknown = merged.direction;
    if (algorithm !== undefined && algorithm !== 'layered' && algorithm !== 'tree') fail('layout.algorithm', '"layered" | "tree"');
    if (direction !== undefined && !(typeof direction === 'string' && ['TB', 'BT', 'LR', 'RL'].includes(direction))) fail('layout.direction', '"TB" | "BT" | "LR" | "RL"');
    this.#checkpoint();
    this.#runLayout(merged, merged.keepPositions === true ? 'keep' : 'all');
    this.#render();
    this.fit();
    announce(this.#msg('layoutDone'));
    this.#emitChange('layout', [...this.#order]);
  }

  undo(): boolean {
    const s = this.#history.pop();
    if (!s) return false;
    this.#cancelInteractions();
    this.#future.push(this.#snapshot());
    this.#restore(s);
    announce(this.#msg('undone'));
    this.#emitChange('undo', []);
    return true;
  }

  redo(): boolean {
    const s = this.#future.pop();
    if (!s) return false;
    this.#cancelInteractions();
    this.#history.push(this.#snapshot());
    this.#restore(s);
    announce(this.#msg('redone'));
    this.#emitChange('redo', []);
    return true;
  }

  /** Copy the selected nodes and the edges between them (kept inside this diagram). */
  copy(): number {
    const ids = this.#order.filter((id) => this.#selNodes.has(id));
    if (ids.length === 0) return 0;
    const set = new Set(ids);
    this.#clipboard = { nodes: ids.map((id) => this.#publicNode(id)), edges: this.#edgeOrder.map((id) => this.#edge(id)).filter((e) => set.has(e.from) && set.has(e.to)).map(copyEdge) };
    this.#pasteCount = 0;
    announce(this.#msg('copied', { count: formatNumber(ids.length, {}, this.#config().locale) }));
    return ids.length;
  }

  /** Paste copied nodes, offset from the originals; they become the selection. Returns the new node ids. */
  paste(): string[] {
    const clip = this.#clipboard;
    if (!clip || clip.nodes.length === 0) return [];
    this.#pasteCount++;
    const offset = this.#config().gridSize * 2 * this.#pasteCount;
    const map = new Map<string, string>();
    const nodes = clip.nodes.map((n) => {
      const id = this.#uniqueId(n.id, map);
      map.set(n.id, id);
      const copy = copyNode(n);
      copy.id = id;
      copy.x = (n.x ?? 0) + offset;
      copy.y = (n.y ?? 0) + offset;
      delete copy.locked;
      return copy;
    });
    const edges = clip.edges.map((e) => {
      const copy = copyEdge(e);
      copy.id = this.#uniqueId(e.id, map);
      map.set(e.id, copy.id);
      copy.from = map.get(e.from) ?? e.from;
      copy.to = map.get(e.to) ?? e.to;
      return copy;
    });
    this.#checkpoint();
    for (const n of nodes) this.#insertNode(n);
    for (const e of edges) this.#insertEdge(e);
    this.#selNodes = new Set(nodes.map((n) => n.id));
    this.#selEdges = new Set();
    this.#render();
    const first = nodes[0];
    if (first) this.#focusOn(first.id);
    announce(this.#msg('pasted', { count: formatNumber(nodes.length, {}, this.#config().locale) }));
    this.#emitChange('paste', [...nodes.map((n) => n.id), ...edges.map((e) => e.id)]);
    this.#emitSelect();
    return nodes.map((n) => n.id);
  }

  /** Start inline label editing of a node or an edge (edit mode). */
  editLabel(id: string): void {
    if (!this.editable) return;
    if (this.#nodes.has(id)) this.#startEdit('node', id);
    else if (this.#edges.has(id)) this.#startEdit('edge', id);
    else fail('editLabel.id', 'a node or edge id');
  }

  /** Scale (at most 100 %) and center everything in the viewport. */
  fit(): void {
    const { bounds } = this.geometry;
    const vw = this.#viewport.clientWidth;
    const vh = this.#viewport.clientHeight;
    if (vw === 0 || vh === 0) return;
    const c = this.#config();
    const scale = bounds.width === 0 ? 1 : Math.max(c.minZoom, Math.min(1, c.maxZoom, (vw - 2 * MARGIN) / Math.max(1, bounds.width), (vh - 2 * MARGIN) / Math.max(1, bounds.height)));
    this.#viewSet = true;
    this.#setView({ x: (vw - bounds.width * scale) / 2 - bounds.x * scale, y: (vh - bounds.height * scale) / 2 - bounds.y * scale, scale });
    this.#announceZoom();
  }

  /** Zoom around the viewport center, clamped to minZoom..maxZoom. */
  zoomTo(scale: number): void {
    if (!(typeof scale === 'number' && Number.isFinite(scale) && scale > 0)) fail('zoomTo.scale', 'positive number');
    this.#zoomAt(scale, this.#viewport.clientWidth / 2, this.#viewport.clientHeight / 2);
  }

  /** Center the view on a node (keeps the zoom). */
  centerOn(id: string): void {
    const n = this.#nodes.get(id);
    if (!n) fail('centerOn.id', 'a node id');
    const s = this.#view.scale;
    this.#viewSet = true;
    this.#setView({ x: this.#viewport.clientWidth / 2 - (n.x + n.width / 2) * s, y: this.#viewport.clientHeight / 2 - (n.y + n.height / 2) * s, scale: s });
  }

  /** Plain-text description: every node with its shape and connections, one per line. */
  describe(): string {
    return this.#order.map((id) => this.#nodeName(id)).join('\n');
  }

  destroy(): void {
    this.#group.dispose();
    this.#drag?.dispose();
    for (const d of this.#paletteDrags) d.dispose();
    for (const el of this.#nodeEls.values()) releaseNode(el.content);
    this.#toolbar.remove();
    this.#palette.remove();
    this.#viewport.remove();
    this.#text.remove();
    this.host.classList.remove('aui-diagram', 'aui-diagram--editing', 'aui-diagram--hand', 'aui-diagram--placing', 'aui-diagram--connecting');
  }

  // ---- options and model ------------------------------------------------------------

  static #assert(o: DiagramOptions): void {
    if (!validators.isRecord(o)) fail('options', 'DiagramOptions');
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string');
    assertModel(o.model);
    if (o.editable !== undefined && typeof o.editable !== 'boolean') fail('editable', 'boolean');
    if (o.showGrid !== undefined && typeof o.showGrid !== 'boolean') fail('showGrid', 'boolean');
    for (const key of ['renderShape', 'canConnect'] as const) if (o[key] !== undefined && typeof o[key] !== 'function') fail(key, 'function');
    if (o.historyLimit !== undefined && !(Number.isInteger(o.historyLimit) && o.historyLimit >= 0 && o.historyLimit <= 500)) fail('historyLimit', 'integer from 0 to 500');
    const layout: unknown = o.layout;
    if (layout !== undefined && layout !== null) {
      if (!validators.isRecord(layout)) fail('layout', 'DiagramAutoLayout | null');
      if (layout.algorithm !== undefined && layout.algorithm !== 'layered' && layout.algorithm !== 'tree') fail('layout.algorithm', '"layered" | "tree"');
      if (layout.direction !== undefined && !(typeof layout.direction === 'string' && ['TB', 'BT', 'LR', 'RL'].includes(layout.direction))) fail('layout.direction', '"TB" | "BT" | "LR" | "RL"');
      for (const key of ['nodeGap', 'rankGap'] as const) {
        const v = layout[key];
        if (v !== undefined && !(typeof v === 'number' && v >= 0 && v <= 1000)) fail(`layout.${key}`, 'number from 0 to 1000');
      }
      if (layout.keepPositions !== undefined && typeof layout.keepPositions !== 'boolean') fail('layout.keepPositions', 'boolean');
    }
    const palette: unknown = o.palette;
    if (palette !== undefined) {
      if (!Array.isArray(palette)) fail('palette', 'DiagramPaletteItem[]');
      (palette as unknown[]).forEach((p, i) => {
        if (!validators.isRecord(p) || typeof p.label !== 'string' || p.label.trim() === '') fail(`palette[${String(i)}].label`, 'non-empty string');
        if (!['rectangle', 'rounded', 'ellipse', 'diamond', 'parallelogram', 'cylinder', 'document', 'custom'].includes(String(p.shape))) fail(`palette[${String(i)}].shape`, 'a diagram shape');
        for (const key of ['width', 'height'] as const) {
          const v = p[key];
          if (v !== undefined && !(typeof v === 'number' && v >= 16 && v <= 2000)) fail(`palette[${String(i)}].${key}`, 'number from 16 to 2000');
        }
      });
    }
  }

  #config(): Readonly<DiagramConfig & { locale: string; direction: Direction }> {
    const o = this.#options;
    const input: Partial<DiagramConfig & { locale: string; direction: Direction }> = {};
    for (const key of ['nodeWidth', 'nodeHeight', 'gridSize', 'snapToGrid', 'routing', 'nodeGap', 'rankGap', 'minZoom', 'maxZoom', 'textAlternative', 'locale', 'direction'] as const) {
      const v = o[key];
      if (v !== undefined) (input as Record<string, unknown>)[key] = v;
    }
    return diagramConfig.resolve(input);
  }

  #msg(key: string, params: Readonly<Record<string, string>> = {}): string {
    return getMessage('diagram', key, params, this.#config().locale);
  }

  #validateWith(part: Partial<DiagramModel>): void {
    const m = this.model;
    assertModel({ nodes: part.nodes ?? m.nodes, edges: part.edges ?? m.edges, groups: part.groups ?? m.groups ?? [] });
  }

  #node(id: string): Resolved {
    const n = this.#nodes.get(id);
    if (!n) fail('node', `a node id (${id})`);
    return n;
  }

  #edge(id: string): DiagramEdge {
    const e = this.#edges.get(id);
    if (!e) fail('edge', `an edge id (${id})`);
    return e;
  }

  #publicNode(id: string): DiagramNode {
    const n = copyNode(this.#node(id));
    return n;
  }

  #resolve(n: Readonly<DiagramNode>, placed: boolean): Resolved {
    const c = this.#config();
    const r: Resolved = { ...copyNode(n), x: n.x ?? 0, y: n.y ?? 0, width: n.width ?? c.nodeWidth, height: n.height ?? c.nodeHeight };
    if (!placed && (n.x === undefined || n.y === undefined)) r.placed = false;
    return r;
  }

  #setModel(model: DiagramModel): void {
    this.#nodes = new Map();
    this.#order = [];
    this.#edges = new Map();
    this.#edgeOrder = [];
    this.#groups = (model.groups ?? []).map(copyGroup);
    for (const n of model.nodes) this.#insertNode(n, false);
    for (const e of model.edges) this.#insertEdge(e);
    this.#prune();
  }

  #insertNode(n: Readonly<DiagramNode>, placed = true): void {
    this.#nodes.set(n.id, this.#resolve(n, placed));
    this.#order.push(n.id);
    this.#incident.set(n.id, new Set());
  }

  #insertEdge(e: Readonly<DiagramEdge>): void {
    this.#edges.set(e.id, copyEdge(e));
    this.#edgeOrder.push(e.id);
    this.#incident.get(e.from)?.add(e.id);
    this.#incident.get(e.to)?.add(e.id);
  }

  #reindex(): void {
    this.#incident = new Map(this.#order.map((id) => [id, new Set<string>()]));
    for (const id of this.#edgeOrder) {
      const e = this.#edge(id);
      this.#incident.get(e.from)?.add(id);
      this.#incident.get(e.to)?.add(id);
    }
  }

  #deleteItems(nodes: readonly string[], edges: readonly string[]): void {
    const nodeSet = new Set(nodes);
    const edgeSet = new Set(edges);
    for (const id of nodes) this.#nodes.delete(id);
    for (const id of edges) this.#edges.delete(id);
    this.#order = this.#order.filter((id) => !nodeSet.has(id));
    this.#edgeOrder = this.#edgeOrder.filter((id) => !edgeSet.has(id));
    this.#reindex();
    this.#prune();
  }

  /** Drop selection, focus, and modes that refer to removed items. */
  #prune(): void {
    for (const id of [...this.#selNodes]) if (!this.#nodes.has(id)) this.#selNodes.delete(id);
    for (const id of [...this.#selEdges]) if (!this.#edges.has(id)) this.#selEdges.delete(id);
    for (const id of [...this.#manual]) if (!this.#nodes.has(id)) this.#manual.delete(id);
    if (this.#focusNode !== null && !this.#nodes.has(this.#focusNode)) this.#focusNode = null;
    if (this.#focusEdge !== null && !this.#edges.has(this.#focusEdge)) this.#focusEdge = null;
    if (this.#connectFrom !== null && !this.#nodes.has(this.#connectFrom)) this.#connectFrom = null;
  }

  #uniqueId(base: string, taken: ReadonlyMap<string, string> = new Map()): string {
    const used = (id: string): boolean => this.#nodes.has(id) || this.#edges.has(id) || [...taken.values()].includes(id);
    const stem = base.replace(/-\d+$/, '');
    let i = 1;
    let id = `${stem}-${String(i)}`;
    while (used(id)) id = `${stem}-${String(++i)}`;
    return id;
  }

  #snapshot(): Snapshot {
    return { nodes: this.#order.map((id) => this.#publicNode(id)), edges: this.#edgeOrder.map((id) => copyEdge(this.#edge(id))), groups: this.#groups.map(copyGroup), manual: [...this.#manual] };
  }

  #checkpoint(before: Snapshot = this.#snapshot()): void {
    const limit = this.#options.historyLimit ?? 100;
    this.#future = [];
    if (limit === 0) return;
    this.#history.push(before);
    if (this.#history.length > limit) this.#history.shift();
  }

  #restore(s: Snapshot): void {
    this.#nodes = new Map();
    this.#order = [];
    this.#edges = new Map();
    this.#edgeOrder = [];
    this.#incident = new Map();
    this.#groups = s.groups.map(copyGroup);
    for (const n of s.nodes) this.#insertNode(n);
    for (const e of s.edges) this.#insertEdge(e);
    this.#manual = new Set(s.manual);
    this.#prune();
    this.#render();
  }

  #emitChange(reason: DiagramChangeReason, ids: string[]): void {
    const detail: DiagramChangeDetail = { reason, model: this.model, ids };
    emit(this.host, 'aui-change', detail);
  }

  #emitSelect(): void {
    const detail: DiagramSelectDetail = this.selection;
    emit(this.host, 'aui-select', detail);
  }

  // ---- layout ---------------------------------------------------------------------

  /** all: place every node; keep: keep pinned and hand-moved nodes; fill: keep every node that has a position. */
  #runLayout(options: DiagramAutoLayout, mode: 'all' | 'keep' | 'fill'): void {
    const c = this.#config();
    const rtl = c.direction === 'rtl';
    let direction = options.direction ?? 'TB';
    if (rtl && direction === 'LR') direction = 'RL';
    else if (rtl && direction === 'RL') direction = 'LR';
    const list = this.#order.map((id) => this.#node(id));
    const result = layoutDiagram(list, this.#edgeOrder.map((id) => this.#edge(id)), {
      algorithm: options.algorithm ?? 'layered',
      direction,
      nodeGap: options.nodeGap ?? c.nodeGap,
      rankGap: options.rankGap ?? c.rankGap,
      ...(options.sweeps === undefined ? {} : { sweeps: options.sweeps }),
    });
    const vertical = direction === 'TB' || direction === 'BT';
    const target = (n: Resolved): Point => {
      const p = result.positions.get(n.id) ?? { x: 0, y: 0 };
      return rtl && vertical ? { x: result.width - p.x - n.width, y: p.y } : p;
    };
    const kept = new Set(mode === 'all' ? [] : list.filter((n) => n.placed !== false && (mode === 'fill' || n.pinned === true || this.#manual.has(n.id))).map((n) => n.id));
    if (kept.size === list.length) return;
    if (kept.size === 0) {
      for (const n of list) {
        const p = target(n);
        n.x = p.x;
        n.y = p.y;
        delete n.placed;
      }
      this.#manual.clear();
      return;
    }
    // Incremental: place each new node relative to a kept neighbor, else below the kept nodes.
    const keptNodes = list.filter((n) => kept.has(n.id));
    const maxY = Math.max(...keptNodes.map((n) => n.y + n.height));
    const minX = Math.min(...keptNodes.map((n) => n.x));
    const placed: Resolved[] = [...keptNodes];
    const sorted = list.filter((n) => !kept.has(n.id)).sort((a, b) => (result.ranks.get(a.id) ?? 0) - (result.ranks.get(b.id) ?? 0));
    for (const n of sorted) {
      const mine = target(n);
      let anchor: Resolved | null = null;
      for (const eid of this.#incident.get(n.id) ?? []) {
        const e = this.#edge(eid);
        const other = e.from === n.id ? e.to : e.from;
        const o = placed.find((p) => p.id === other);
        if (o) {
          anchor = o;
          if (e.to === n.id) break;
        }
      }
      let x: number;
      let y: number;
      if (anchor) {
        const theirs = target(anchor);
        x = anchor.x + (mine.x - theirs.x);
        y = anchor.y + (mine.y - theirs.y);
      } else {
        x = minX + mine.x;
        y = maxY + c.rankGap + mine.y;
      }
      const spot = this.#freeSpot({ x: Math.round(x), y: Math.round(y), width: n.width, height: n.height }, placed, vertical);
      n.x = spot.x;
      n.y = spot.y;
      delete n.placed;
      placed.push(n);
    }
  }

  /** The nearest position to `box` that overlaps no node (searching across the rank direction). */
  #freeSpot(box: Box, among: readonly Resolved[] = [...this.#nodes.values()], vertical = true): Point {
    const gap = this.#config().nodeGap / 2;
    const hit = (b: Box): boolean => among.some((n) => intersects({ x: b.x - gap, y: b.y - gap, width: b.width + 2 * gap, height: b.height + 2 * gap }, n));
    if (!hit(box)) return { x: box.x, y: box.y };
    const step = (vertical ? box.width : box.height) + gap * 2;
    for (let i = 1; i < 200; i++) {
      for (const sign of [1, -1]) {
        const b = vertical ? { ...box, x: box.x + sign * i * step } : { ...box, y: box.y + sign * i * step };
        if (!hit(b)) return { x: b.x, y: b.y };
      }
    }
    return { x: box.x, y: box.y };
  }

  #snap(v: number): number {
    const c = this.#config();
    return c.snapToGrid ? Math.round(v / c.gridSize) * c.gridSize : Math.round(v);
  }

  // ---- DOM structure --------------------------------------------------------------

  #applyLabels(): void {
    const o = this.#options;
    const c = this.#config();
    this.#toolbar.setAttribute('aria-label', this.#msg('toolbar', { label: o.label }));
    this.#palette.setAttribute('aria-label', this.#msg('palette'));
    this.#palette.hidden = !this.editable;
    this.#viewport.setAttribute('aria-label', this.#msg('canvas', { label: o.label }));
    this.#viewport.setAttribute('aria-roledescription', this.#msg('canvasRole'));
    this.element.setAttribute('aria-label', this.#msg('nodes', { label: o.label }));
    this.#links.setAttribute('aria-label', this.#msg('links', { label: o.label }));
    this.host.classList.toggle('aui-diagram--editing', this.editable);
    this.host.setAttribute('dir', c.direction);
    const labels: Record<string, string> = { zoomOut: this.#msg('zoomOut'), zoomIn: this.#msg('zoomIn'), fit: this.#msg('fit'), pan: this.#msg('pan'), connect: this.#msg('connect'), place: this.#msg('place'), undo: this.#msg('undo'), redo: this.#msg('redo'), delete: this.#msg('delete') };
    for (const [action, b] of this.#buttons) {
      const text = labels[action] ?? action;
      b.setAttribute('aria-label', text);
      b.title = text;
      if (['pan', 'connect', 'place', 'undo', 'redo', 'delete'].includes(action)) b.hidden = !this.editable;
    }
    this.#gridPattern.setAttribute('width', String(c.gridSize));
    this.#gridPattern.setAttribute('height', String(c.gridSize));
    this.#gridRect.setAttribute('display', this.editable && this.#options.showGrid !== false ? 'inline' : 'none');
    if (!this.editable) {
      this.#hand = false;
      this.#cancelInteractions();
    }
  }

  #buildToolbar(): void {
    const doc = this.#doc;
    const icons: [string, IconRef][] = [['zoomOut', 'zoom-out'], ['zoomIn', 'zoom-in'], ['fit', 'maximize'], ['pan', 'grip'], ['connect', 'link'], ['place', 'locate'], ['undo', 'undo'], ['redo', 'redo'], ['delete', 'trash']];
    for (const [action, icon] of icons) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-diagram__tool';
      b.dataset.auiAction = action;
      b.append(renderIcon(icon, { doc }));
      this.#toolbar.append(b);
      this.#buttons.set(action, b);
    }
  }

  #buildPalette(): void {
    const doc = this.#doc;
    for (const d of this.#paletteDrags) d.dispose();
    this.#paletteDrags.length = 0;
    const items = this.#options.palette ?? DEFAULT_PALETTE;
    const buttons = items.map((item, i) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-diagram__palette-item';
      b.dataset.auiPalette = String(i);
      const icon = svg(doc, 'svg', { viewBox: '-1 -1 22 16', 'aria-hidden': 'true', focusable: 'false' }, 'aui-diagram__palette-shape');
      icon.append(svg(doc, 'path', { d: SHAPE_ICON_PATHS[item.shape] }));
      const text = doc.createElement('span');
      text.textContent = item.label;
      b.append(icon, text);
      this.#paletteDrags.push(this.#paletteDrag(b, item));
      return b;
    });
    this.#palette.replaceChildren(...buttons);
  }

  #paletteDrag(button: HTMLButtonElement, item: DiagramPaletteItem): PointerDrag {
    let ghost: SVGRectElement | null = null;
    const size = (): { w: number; h: number } => ({ w: item.width ?? this.#config().nodeWidth, h: item.height ?? this.#config().nodeHeight });
    const inside = (move: DragMove): boolean => {
      const r = this.#viewport.getBoundingClientRect();
      return move.point.x >= r.left && move.point.x <= r.right && move.point.y >= r.top && move.point.y <= r.bottom;
    };
    return trackPointerDrag(button, {
      canStart: () => this.editable,
      onMove: (move) => {
        const { w, h } = size();
        if (!inside(move)) {
          ghost?.remove();
          ghost = null;
          return;
        }
        const p = this.#toDiagram(move.point);
        ghost ??= svg(this.#doc, 'rect', { rx: '6' }, 'aui-diagram__ghost');
        if (!ghost.isConnected) this.#overlay.append(ghost);
        ghost.setAttribute('x', String(this.#snap(p.x - w / 2)));
        ghost.setAttribute('y', String(this.#snap(p.y - h / 2)));
        ghost.setAttribute('width', String(w));
        ghost.setAttribute('height', String(h));
      },
      onEnd: (move) => {
        ghost?.remove();
        ghost = null;
        if (!inside(move)) return;
        const { w, h } = size();
        const p = this.#toDiagram(move.point);
        const id = this.addNode({ label: item.label, shape: item.shape, width: w, height: h, x: this.#snap(p.x - w / 2), y: this.#snap(p.y - h / 2) });
        this.#selectOnly([id], []);
        this.#focusOn(id);
      },
      onCancel: () => {
        ghost?.remove();
        ghost = null;
      },
    });
  }

  #listen(): void {
    const g = this.#group;
    g.listen(this.#toolbar, 'click', (e) => {
      const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button') : null;
      if (b?.dataset.auiAction) this.#action(b.dataset.auiAction);
    });
    g.listen(this.#palette, 'click', (e) => {
      const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button') : null;
      const item = (this.#options.palette ?? DEFAULT_PALETTE)[Number(b?.dataset.auiPalette ?? -1)];
      if (!item || !this.editable) return;
      const id = this.addNode({ label: item.label, shape: item.shape, ...(item.width === undefined ? {} : { width: item.width }), ...(item.height === undefined ? {} : { height: item.height }) });
      this.#selectOnly([id], []);
      this.#emitSelect();
      this.#focusOn(id);
    });
    g.listen(this.#viewport, 'keydown', (e) => {
      this.#onKey(e);
    });
    g.listen(this.#viewport, 'keyup', (e) => {
      if (e.key === ' ') this.#space = false;
    });
    g.listen(this.#viewport, 'pointerdown', (e) => {
      this.#onPointerDown(e);
    });
    g.listen(this.#viewport, 'click', (e) => {
      this.#onClick(e);
    });
    g.listen(this.#viewport, 'dblclick', (e) => {
      const id = this.#nodeAt(e.target);
      const edge = this.#edgeAt(e.target);
      if (id !== null) {
        if (this.editable && this.#node(id).locked !== true) this.#startEdit('node', id);
        else this.#activate(id);
      } else if (edge !== null && this.editable) this.#startEdit('edge', edge);
    });
    g.listen(this.#viewport, 'focusin', (e) => {
      const node = this.#nodeAt(e.target);
      const edge = this.#edgeAt(e.target);
      if (node !== null && node !== this.#focusNode) {
        this.#focusNode = node;
        this.#syncTabindex();
      }
      if (edge !== null && edge !== this.#focusEdge) {
        this.#focusEdge = edge;
        this.#syncTabindex();
      }
      if (node !== null) this.#reveal(this.#box(this.#node(node)));
    });
    g.listen(this.#viewport, 'wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = this.#viewport.getBoundingClientRect();
      this.#zoomAt(this.#view.scale * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });
    g.listen(this.#editor, 'keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        this.#commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.#endEdit(false);
      }
    });
    g.listen(this.#editor, 'blur', () => {
      if (this.#editing) this.#commitEdit();
    });
    this.#drag = trackPointerDrag(this.#viewport, {
      canStart: (e) => this.#canStartGesture(e),
      onStart: () => {
        if (this.#gesture?.kind === 'pan') this.#viewport.classList.add('aui-diagram__viewport--panning');
      },
      onMove: (move) => {
        this.#onGestureMove(move);
      },
      onEnd: (move) => {
        this.#onGestureEnd(move);
      },
      onCancel: () => {
        this.#onGestureCancel();
      },
    });
    g.add(observeResize(this.#viewport, () => {
      if (!this.#viewSet) this.#resetView();
      else this.#syncGrid();
    }));
    g.add(diagramConfig.subscribe(() => {
      for (const el of this.#nodeEls.values()) el.sig = '';
      this.#applyLabels();
      this.#render();
    }));
  }

  // ---- rendering ------------------------------------------------------------------

  #box(n: Resolved): Box {
    return { x: n.x, y: n.y, width: n.width, height: n.height };
  }

  #ports(n: Readonly<DiagramNode>): PortSpec[] {
    return n.ports ? n.ports.map((p) => ({ id: p.id, side: p.side, offset: p.offset ?? 0.5 })) : [...DEFAULT_PORTS];
  }

  #route(e: Readonly<DiagramEdge>): Route | null {
    const a = this.#nodes.get(e.from);
    const b = this.#nodes.get(e.to);
    if (!a || !b) return null;
    const auto = this.#autoPorts.get(e.id);
    const fromPort = e.fromPort === undefined ? (auto?.from ?? null) : (this.#ports(a).find((p) => p.id === e.fromPort) ?? null);
    const toPort = e.toPort === undefined ? (auto?.to ?? null) : (this.#ports(b).find((p) => p.id === e.toPort) ?? null);
    return routeEdge({ box: this.#box(a), shape: a.shape ?? 'rounded', port: fromPort }, { box: this.#box(b), shape: b.shape ?? 'rounded', port: toPort }, e.routing ?? this.#config().routing, { start: e.arrowStart ?? 'none', end: e.arrowEnd ?? 'arrow' });
  }

  #measurer(): (s: string) => number {
    if (this.#measure) return this.#measure;
    const view = this.#doc.defaultView;
    const style = view && this.host.isConnected ? view.getComputedStyle(this.#svg) : null;
    const px = style ? Number.parseFloat(style.fontSize) || 14 : 14;
    const family = style?.fontFamily ?? 'sans-serif';
    this.#font = { px, family };
    let ctx: CanvasRenderingContext2D | null;
    try {
      ctx = this.#doc.createElement('canvas').getContext('2d');
    } catch {
      ctx = null;
    }
    if (ctx) {
      ctx.font = `${String(px)}px ${family}`;
      const c = ctx;
      const cache = new Map<string, number>();
      this.#measure = (s: string): number => {
        let w = cache.get(s);
        if (w === undefined) {
          w = c.measureText(s).width;
          if (cache.size > 5000) cache.clear();
          cache.set(s, w);
        }
        return w;
      };
    } else this.#measure = (s: string): number => s.length * px * 0.56;
    return this.#measure;
  }

  /**
   * Edge ends without a port (orthogonal and curved routing) attach to the side facing
   * the other node; several ends on one side are spread along it, ordered by where the
   * other node is, so they do not overlap.
   */
  #spreadPorts(): void {
    const groups = new Map<string, { edge: string; end: 'from' | 'to'; key: number }[]>();
    const sides = new Map<string, { from: PortSpec['side'] | null; to: PortSpec['side'] | null }>();
    const routing = this.#config().routing;
    for (const id of this.#edgeOrder) {
      const e = this.#edge(id);
      const a = this.#nodes.get(e.from);
      const b = this.#nodes.get(e.to);
      if (!a || !b || (e.routing ?? routing) === 'straight') continue;
      const entry: { from: PortSpec['side'] | null; to: PortSpec['side'] | null } = { from: null, to: null };
      for (const end of ['from', 'to'] as const) {
        if ((end === 'from' ? e.fromPort : e.toPort) !== undefined) continue;
        const self = end === 'from' ? a : b;
        const other = end === 'from' ? b : a;
        const side = facingSide(this.#box(self), this.#box(other));
        entry[end] = side;
        const key = side === 'top' || side === 'bottom' ? other.x + other.width / 2 : other.y + other.height / 2;
        const gk = `${side}:${self.id}`;
        const list = groups.get(gk);
        if (list) list.push({ edge: id, end, key });
        else groups.set(gk, [{ edge: id, end, key }]);
      }
      sides.set(id, entry);
    }
    const offsets = new Map<string, number>();
    for (const list of groups.values()) {
      list.sort((p, q) => p.key - q.key);
      list.forEach((item, i) => offsets.set(`${item.edge}|${item.end}`, list.length === 1 ? 0.5 : (i + 1) / (list.length + 1)));
    }
    this.#autoPorts = new Map();
    for (const [id, entry] of sides) {
      const port = (end: 'from' | 'to'): PortSpec | null => {
        const side = entry[end];
        return side === null ? null : { id: '', side, offset: offsets.get(`${id}|${end}`) ?? 0.5 };
      };
      this.#autoPorts.set(id, { from: port('from'), to: port('to') });
    }
  }

  /** Reading order: top to bottom, then by inline position. */
  #readingOrder(): string[] {
    const rtl = this.#config().direction === 'rtl';
    return [...this.#order].sort((a, b) => {
      const p = this.#node(a);
      const q = this.#node(b);
      const dy = p.y + p.height / 2 - (q.y + q.height / 2);
      if (Math.abs(dy) > Math.min(p.height, q.height) / 2) return dy;
      return rtl ? q.x + q.width - (p.x + p.width) : p.x - q.x;
    });
  }

  #render(): void {
    this.#measure = null;
    this.#spreadPorts();
    const doc = this.#doc;
    const reading = this.#readingOrder();
    if (this.#focusNode === null || !this.#nodes.has(this.#focusNode)) this.#focusNode = reading[0] ?? null;
    if (this.#focusEdge === null || !this.#edges.has(this.#focusEdge)) this.#focusEdge = this.#edgeOrder[0] ?? null;

    // Groups.
    const groupEls = this.#groupBoxes().map(({ group, box }) => {
      const gEl = svg(doc, 'g', {}, 'aui-diagram__group');
      gEl.append(svg(doc, 'rect', { x: r1(box.x), y: r1(box.y), width: r1(box.width), height: r1(box.height), rx: '8' }, 'aui-diagram__group-box'));
      const t = svg(doc, 'text', { x: r1(box.x + 10), y: r1(box.y + 16) }, 'aui-diagram__group-label');
      t.textContent = group.label;
      gEl.append(t);
      return gEl;
    });
    this.#groupsLayer.replaceChildren(...groupEls);

    // Nodes (DOM in reading order).
    const keep = new Set(this.#order);
    for (const [id, el] of this.#nodeEls) {
      if (keep.has(id)) continue;
      el.g.remove();
      releaseNode(el.content);
      this.#nodeEls.delete(id);
    }
    const focused = doc.activeElement;
    let before: Element | null = this.element.firstElementChild;
    for (const id of reading) {
      const el = this.#nodeEls.get(id) ?? this.#createNodeEl(id);
      this.#paintNode(id, el);
      if (el.g !== before) this.element.insertBefore(el.g, before);
      before = el.g.nextElementSibling;
    }

    // Edges.
    const keepEdges = new Set(this.#edgeOrder);
    for (const [id, el] of this.#edgeEls) {
      if (keepEdges.has(id)) continue;
      el.visual.remove();
      el.link.remove();
      this.#edgeEls.delete(id);
    }
    for (const id of this.#edgeOrder) {
      const el = this.#edgeEls.get(id) ?? this.#createEdgeEl(id);
      if (!el.visual.isConnected) this.#edgesLayer.append(el.visual);
      if (!el.link.isConnected) this.#links.append(el.link);
      this.#paintEdge(id, el);
    }
    this.#links.setAttribute('display', this.#edgeOrder.length === 0 ? 'none' : 'inline');
    if (focused instanceof Element && focused !== doc.activeElement && focused.isConnected && (focused instanceof HTMLElement || focused instanceof SVGElement)) focused.focus({ preventScroll: true });
    this.#syncTabindex();
    this.#syncToolbar();
    this.#renderText();
  }

  #groupBoxes(): { group: DiagramGroup; box: Box }[] {
    const pad = 16;
    return this.#groups.flatMap((group) => {
      const members = this.#order.map((id) => this.#node(id)).filter((n) => n.group === group.id);
      if (members.length === 0) return [];
      const x = Math.min(...members.map((n) => n.x)) - pad;
      const y = Math.min(...members.map((n) => n.y)) - pad - 20;
      const right = Math.max(...members.map((n) => n.x + n.width)) + pad;
      const bottom = Math.max(...members.map((n) => n.y + n.height)) + pad;
      return [{ group, box: { x, y, width: right - x, height: bottom - y } }];
    });
  }

  #createNodeEl(id: string): NodeEl {
    const doc = this.#doc;
    const g = svg(doc, 'g', { role: 'option', tabindex: '-1', 'data-aui-node': id }, 'aui-diagram__node');
    const focus = svg(doc, 'rect', { rx: '6' }, 'aui-diagram__focus');
    const body = svg(doc, 'g', {}, 'aui-diagram__body');
    const text = svg(doc, 'text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }, 'aui-diagram__label');
    const ports = svg(doc, 'g', {}, 'aui-diagram__ports');
    g.append(focus, body, text, ports);
    const el: NodeEl = { g, body, text, ports, focus, sig: '', content: null, lines: [], lineHeight: 0, labelBox: { x: 0, y: 0, width: 0, height: 0 } };
    this.#nodeEls.set(id, el);
    return el;
  }

  #paintNode(id: string, el: NodeEl): void {
    const n = this.#node(id);
    const doc = this.#doc;
    const shape = n.shape ?? 'rounded';
    const selected = this.#selNodes.has(id);
    el.g.setAttribute('transform', `translate(${r1(n.x)} ${r1(n.y)})`);
    el.g.setAttribute('aria-selected', String(selected));
    el.g.setAttribute('aria-roledescription', this.#msg('nodeRole'));
    el.g.setAttribute('aria-label', this.#nodeName(id));
    el.g.classList.toggle('aui-diagram__node--locked', n.locked === true);
    el.g.classList.toggle('aui-diagram__node--source', this.#connectFrom === id);
    el.g.classList.toggle('aui-diagram__node--moving', this.#moveMode?.ids.includes(id) === true);
    const ports = this.#ports(n);
    const sig = `${shape}|${String(n.width)}|${String(n.height)}|${n.label}|${JSON.stringify(ports)}|${String(this.editable)}|${shape === 'custom' ? String(selected) : ''}`;
    if (sig === el.sig) return;
    el.sig = sig;
    el.focus.setAttribute('x', '-5');
    el.focus.setAttribute('y', '-5');
    el.focus.setAttribute('width', String(n.width + 10));
    el.focus.setAttribute('height', String(n.height + 10));
    releaseNode(el.content);
    el.content = null;
    const render = this.#options.renderShape;
    if (shape === 'custom' && render) {
      const content = render(copyNode(n), { width: n.width, height: n.height, selected, doc });
      const SvgCtor = doc.defaultView?.SVGElement;
      if (SvgCtor && !(content instanceof SvgCtor)) fail('renderShape()', 'an SVGElement');
      el.content = content;
      const hitBox = svg(doc, 'rect', { width: String(n.width), height: String(n.height) }, 'aui-diagram__shape aui-diagram__shape--custom');
      el.body.replaceChildren(hitBox, content);
    } else {
      const outline = svg(doc, 'path', { d: shapePath(shape, n.width, n.height) }, 'aui-diagram__shape');
      const detail = shapeDetail(shape, n.width, n.height);
      el.body.replaceChildren(outline, ...(detail ? [svg(doc, 'path', { d: detail }, 'aui-diagram__shape-detail')] : []));
    }
    const measure = this.#measurer();
    const lb = labelBox(shape, n.width, n.height);
    const lh = this.#font.px * 1.25;
    const lines = wrapText(n.label, lb.width, Math.max(1, Math.floor(lb.height / lh)), measure);
    el.lines = lines;
    el.lineHeight = lh;
    el.labelBox = lb;
    const cx = lb.x + lb.width / 2;
    const top = lb.y + lb.height / 2 - ((lines.length - 1) * lh) / 2;
    el.text.replaceChildren(...lines.map((line, i) => {
      const t = svg(doc, 'tspan', { x: r1(cx), y: r1(top + i * lh) });
      t.textContent = line;
      return t;
    }));
    el.text.setAttribute('aria-hidden', 'true');
    el.ports.replaceChildren(...(this.editable ? ports.map((p) => {
      const pt = portPoint({ x: 0, y: 0, width: n.width, height: n.height }, p, shape);
      const pg = svg(doc, 'g', { 'data-aui-port': p.id }, 'aui-diagram__port');
      pg.append(svg(doc, 'circle', { cx: r1(pt.x), cy: r1(pt.y), r: '10' }, 'aui-diagram__port-hit'), svg(doc, 'circle', { cx: r1(pt.x), cy: r1(pt.y), r: '4' }, 'aui-diagram__port-dot'));
      return pg;
    }) : []));
  }

  #shapeName(shape: DiagramShape): string {
    return this.#msg(`shape_${shape}`);
  }

  #name(id: string): string {
    const n = this.#nodes.get(id);
    if (!n) return id;
    return n.label.trim() === '' ? this.#msg('untitled') : n.label;
  }

  /** Accessible name of a node: label, shape, connections, group, locked. */
  #nodeName(id: string): string {
    const n = this.#node(id);
    const sep = this.#msg('listSeparator');
    const out: string[] = [];
    const inc: string[] = [];
    for (const eid of this.#incident.get(id) ?? []) {
      const e = this.#edge(eid);
      if (e.from === id) out.push(this.#name(e.to) + (e.label ? ` (${e.label})` : ''));
      if (e.to === id) inc.push(this.#name(e.from));
    }
    const parts = [this.#msg('nodeName', { label: this.#name(id), shape: this.#shapeName(n.shape ?? 'rounded') })];
    if (out.length > 0) parts.push(this.#msg('leadsTo', { list: out.join(sep) }));
    if (inc.length > 0) parts.push(this.#msg('comesFrom', { list: inc.join(sep) }));
    if (out.length === 0 && inc.length === 0) parts.push(this.#msg('notConnected'));
    const group = n.group === undefined ? undefined : this.#groups.find((gr) => gr.id === n.group);
    if (group) parts.push(this.#msg('groupName', { group: group.label }));
    if (n.locked === true && this.editable) parts.push(this.#msg('locked'));
    return parts.join(sep);
  }

  #linkName(id: string): string {
    const e = this.#edge(id);
    const from = this.#name(e.from);
    const to = this.#name(e.to);
    return e.label ? this.#msg('linkNameLabel', { from, to, label: e.label }) : this.#msg('linkName', { from, to });
  }

  #createEdgeEl(id: string): EdgeEl {
    const doc = this.#doc;
    const visual = svg(doc, 'g', { 'data-aui-edge': id }, 'aui-diagram__edge');
    const line = svg(doc, 'path', {}, 'aui-diagram__line');
    const arrowStart = svg(doc, 'path', {}, 'aui-diagram__arrow');
    const arrowEnd = svg(doc, 'path', {}, 'aui-diagram__arrow');
    visual.append(line, arrowStart, arrowEnd);
    const link = svg(doc, 'g', { role: 'option', tabindex: '-1', 'data-aui-edge': id }, 'aui-diagram__link');
    const ring = svg(doc, 'path', {}, 'aui-diagram__link-ring');
    const core = svg(doc, 'path', {}, 'aui-diagram__link-core');
    const hit = svg(doc, 'path', {}, 'aui-diagram__link-hit');
    const labelG = svg(doc, 'g', { 'aria-hidden': 'true' }, 'aui-diagram__edge-label');
    const labelBg = svg(doc, 'rect', { rx: '4' }, 'aui-diagram__edge-label-bg');
    const labelText = svg(doc, 'text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }, 'aui-diagram__edge-label-text');
    labelG.append(labelBg, labelText);
    const handles = svg(doc, 'g', {}, 'aui-diagram__handles');
    link.append(ring, core, hit, labelG, handles);
    const el: EdgeEl = { visual, line, arrowStart, arrowEnd, link, hit, ring, core, labelG, labelBg, labelText, handles, route: null, labelBox: null };
    this.#edgeEls.set(id, el);
    return el;
  }

  #paintEdge(id: string, el: EdgeEl): void {
    const e = this.#edge(id);
    const route = this.#route(e);
    el.route = route;
    if (!route) return;
    const selected = this.#selEdges.has(id);
    el.visual.classList.toggle('aui-diagram__edge--dashed', e.dashed === true);
    el.visual.classList.toggle('aui-diagram__edge--selected', selected);
    el.line.setAttribute('d', route.d);
    const start = e.arrowStart ?? 'none';
    const end = e.arrowEnd ?? 'arrow';
    const s = approach(route, false);
    const t = approach(route, true);
    el.arrowStart.setAttribute('d', arrowPath(start, s.tip, s.from));
    el.arrowEnd.setAttribute('d', arrowPath(end, t.tip, t.from));
    el.arrowStart.classList.toggle('aui-diagram__arrow--open', start === 'arrow');
    el.arrowEnd.classList.toggle('aui-diagram__arrow--open', end === 'arrow');
    const trimmed = trimPolyline(route.points, 10, 10);
    el.hit.setAttribute('d', polylineD(trimmed.length > 1 ? trimmed : route.points));
    el.ring.setAttribute('d', route.d);
    el.core.setAttribute('d', route.d);
    el.link.setAttribute('aria-roledescription', this.#msg('linkRole'));
    el.link.setAttribute('aria-label', this.#linkName(id));
    el.link.setAttribute('aria-selected', String(selected));
    if (e.label) {
      const w = this.#measurer()(e.label) + 12;
      const h = this.#font.px * 1.25 + 4;
      const box = { x: route.mid.x - w / 2, y: route.mid.y - h / 2, width: w, height: h };
      el.labelBox = box;
      el.labelBg.setAttribute('x', r1(box.x));
      el.labelBg.setAttribute('y', r1(box.y));
      el.labelBg.setAttribute('width', r1(w));
      el.labelBg.setAttribute('height', r1(h));
      el.labelText.setAttribute('x', r1(route.mid.x));
      el.labelText.setAttribute('y', r1(route.mid.y));
      el.labelText.textContent = e.label;
      el.labelG.setAttribute('display', 'inline');
    } else {
      el.labelBox = null;
      el.labelG.setAttribute('display', 'none');
    }
    const doc = this.#doc;
    el.handles.replaceChildren(...(this.editable && selected ? (['from', 'to'] as const).map((end2) => {
      const p = end2 === 'from' ? route.start.point : route.end.point;
      return svg(doc, 'circle', { cx: r1(p.x), cy: r1(p.y), r: '6', 'data-aui-end': end2 }, 'aui-diagram__handle');
    }) : []));
  }

  /** Update only moved nodes and their edges (drags). */
  #paintMoved(ids: readonly string[]): void {
    this.#spreadPorts();
    const edges = new Set<string>();
    for (const id of ids) {
      const n = this.#node(id);
      this.#nodeEls.get(id)?.g.setAttribute('transform', `translate(${r1(n.x)} ${r1(n.y)})`);
      for (const e of this.#incident.get(id) ?? []) edges.add(e);
    }
    for (const id of edges) {
      const el = this.#edgeEls.get(id);
      if (el) this.#paintEdge(id, el);
    }
    if (this.#groups.length > 0) {
      const groupEls = this.#groupBoxes();
      const existing = [...this.#groupsLayer.children];
      groupEls.forEach(({ box }, i) => {
        const rect = existing[i]?.firstElementChild;
        const label = existing[i]?.lastElementChild;
        rect?.setAttribute('x', r1(box.x));
        rect?.setAttribute('y', r1(box.y));
        rect?.setAttribute('width', r1(box.width));
        rect?.setAttribute('height', r1(box.height));
        label?.setAttribute('x', r1(box.x + 10));
        label?.setAttribute('y', r1(box.y + 16));
      });
    }
  }

  #paintSelection(): void {
    for (const [id, el] of this.#nodeEls) el.g.setAttribute('aria-selected', String(this.#selNodes.has(id)));
    for (const [id, el] of this.#edgeEls) this.#paintEdge(id, el);
    this.#syncToolbar();
  }

  #syncTabindex(): void {
    for (const [id, el] of this.#nodeEls) el.g.setAttribute('tabindex', id === this.#focusNode ? '0' : '-1');
    for (const [id, el] of this.#edgeEls) el.link.setAttribute('tabindex', id === this.#focusEdge ? '0' : '-1');
  }

  #syncToolbar(): void {
    const c = this.#config();
    const set = (action: string, disabled: boolean): void => {
      this.#buttons.get(action)?.setAttribute('aria-disabled', String(disabled));
    };
    set('zoomIn', this.#view.scale >= c.maxZoom - 1e-9);
    set('zoomOut', this.#view.scale <= c.minZoom + 1e-9);
    set('undo', !this.canUndo);
    set('redo', !this.canRedo);
    const deletable = [...this.#selNodes].some((id) => this.#nodes.get(id)?.locked !== true) || this.#selEdges.size > 0;
    set('delete', !deletable);
    set('place', [...this.#selNodes].every((id) => this.#nodes.get(id)?.locked === true));
    set('connect', this.#connectFrom === null && this.#selNodes.size === 0 && this.#focusNode === null);
    this.#buttons.get('pan')?.setAttribute('aria-pressed', String(this.#hand));
    this.#buttons.get('connect')?.setAttribute('aria-pressed', String(this.#connectFrom !== null));
    this.#buttons.get('place')?.setAttribute('aria-pressed', String(this.#placing));
    this.host.classList.toggle('aui-diagram--hand', this.#hand);
    this.host.classList.toggle('aui-diagram--placing', this.#placing);
    this.host.classList.toggle('aui-diagram--connecting', this.#connectFrom !== null);
  }

  #renderText(): void {
    const mode = this.#config().textAlternative;
    const doc = this.#doc;
    this.#text.hidden = mode === 'none';
    this.#text.classList.toggle('aui-diagram__text--hidden', mode === 'hidden');
    if (mode === 'none') {
      this.#text.replaceChildren();
      return;
    }
    const open = mode !== 'toggle' || this.#textOpen;
    const hadFocus = doc.activeElement?.classList.contains('aui-diagram__text-toggle') === true && this.#text.contains(doc.activeElement);
    const children: HTMLElement[] = [];
    const region = doc.createElement('div');
    region.className = 'aui-diagram__table-scroll';
    region.id = createId('aui-diagram-text');
    if (mode === 'toggle') {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-diagram__text-toggle';
      b.textContent = this.#msg(open ? 'hideText' : 'showText');
      b.setAttribute('aria-expanded', String(open));
      b.setAttribute('aria-controls', region.id);
      b.addEventListener('click', () => {
        this.#textOpen = !this.#textOpen;
        this.#renderText();
      });
      children.push(b);
    }
    region.hidden = !open;
    if (open) {
      const table = doc.createElement('table');
      table.className = 'aui-diagram__table';
      const caption = table.createCaption();
      caption.id = createId('aui-diagram-caption');
      caption.textContent = this.#msg('textCaption', { label: this.#options.label });
      const head = table.createTHead().insertRow();
      for (const key of ['colNode', 'colShape', 'colTo', 'colFrom']) {
        const th = doc.createElement('th');
        th.scope = 'col';
        th.textContent = this.#msg(key);
        head.append(th);
      }
      const body = table.createTBody();
      const sep = this.#msg('listSeparator');
      for (const id of this.#readingOrder()) {
        const n = this.#node(id);
        const row = body.insertRow();
        const th = doc.createElement('th');
        th.scope = 'row';
        th.textContent = this.#name(id);
        row.append(th);
        const to: string[] = [];
        const from: string[] = [];
        for (const eid of this.#incident.get(id) ?? []) {
          const e = this.#edge(eid);
          if (e.from === id) to.push(this.#name(e.to) + (e.label ? ` (${e.label})` : ''));
          if (e.to === id) from.push(this.#name(e.from));
        }
        for (const v of [this.#shapeName(n.shape ?? 'rounded'), to.join(sep) || this.#msg('none'), from.join(sep) || this.#msg('none')]) row.insertCell().textContent = v;
      }
      region.append(table);
      if (mode !== 'hidden') {
        region.tabIndex = 0;
        region.setAttribute('role', 'region');
        region.setAttribute('aria-labelledby', caption.id);
      }
    }
    children.push(region);
    this.#text.replaceChildren(...children);
    if (hadFocus) this.#text.querySelector<HTMLButtonElement>('.aui-diagram__text-toggle')?.focus();
  }

  // ---- view -----------------------------------------------------------------------

  #setView(v: { x: number; y: number; scale: number }): void {
    this.#view = v;
    this.#scene.setAttribute('transform', `translate(${r1(v.x)} ${r1(v.y)}) scale(${String(Math.round(v.scale * 1000) / 1000)})`);
    this.#syncGrid();
    this.#syncToolbar();
  }

  #syncGrid(): void {
    const v = this.#view;
    const vw = this.#viewport.clientWidth;
    const vh = this.#viewport.clientHeight;
    this.#gridRect.setAttribute('x', r1(-v.x / v.scale));
    this.#gridRect.setAttribute('y', r1(-v.y / v.scale));
    this.#gridRect.setAttribute('width', r1(Math.max(0, vw) / v.scale));
    this.#gridRect.setAttribute('height', r1(Math.max(0, vh) / v.scale));
  }

  #zoomAt(scale: number, cx: number, cy: number): void {
    const c = this.#config();
    const next = Math.max(c.minZoom, Math.min(c.maxZoom, scale));
    const v = this.#view;
    if (Math.abs(next - v.scale) < 1e-9) return;
    const px = (cx - v.x) / v.scale;
    const py = (cy - v.y) / v.scale;
    this.#viewSet = true;
    this.#setView({ x: cx - px * next, y: cy - py * next, scale: next });
    this.#announceZoom();
    const detail: DiagramZoomDetail = { scale: next };
    emit(this.host, 'aui-zoom', detail);
  }

  #announceZoom(): void {
    announce(this.#msg('zoomed', { percent: formatNumber(this.#view.scale, { style: 'percent', maximumFractionDigits: 0 }, this.#config().locale) }));
  }

  #resetView(vw = this.#viewport.clientWidth): void {
    if (vw === 0 || this.#viewport.clientHeight === 0) {
      this.#setView({ x: MARGIN, y: MARGIN, scale: 1 });
      return;
    }
    const { bounds } = this.geometry;
    const vh = this.#viewport.clientHeight;
    const c = this.#config();
    const scale = bounds.width === 0 ? 1 : Math.max(c.minZoom, Math.min(1, (vw - 2 * MARGIN) / Math.max(1, bounds.width), (vh - 2 * MARGIN) / Math.max(1, bounds.height)));
    this.#setView({ x: (vw - bounds.width * scale) / 2 - bounds.x * scale, y: Math.max(MARGIN, (vh - bounds.height * scale) / 2) - bounds.y * scale, scale });
  }

  #reveal(box: Box): void {
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

  #toDiagram(client: Point): Point {
    const r = this.#viewport.getBoundingClientRect();
    const v = this.#view;
    return { x: (client.x - r.left - v.x) / v.scale, y: (client.y - r.top - v.y) / v.scale };
  }

  #viewCenter(): Point {
    const v = this.#view;
    const vw = this.#viewport.clientWidth || 600;
    const vh = this.#viewport.clientHeight || 400;
    return { x: (vw / 2 - v.x) / v.scale, y: (vh / 2 - v.y) / v.scale };
  }

  // ---- selection and focus --------------------------------------------------------

  #selectOnly(nodes: readonly string[], edges: readonly string[]): void {
    this.#selNodes = new Set(nodes);
    this.#selEdges = new Set(edges);
    this.#paintSelection();
  }

  #focusOn(id: string): void {
    this.#focusNode = id;
    this.#syncTabindex();
    const n = this.#nodes.get(id);
    if (n) this.#reveal(this.#box(n));
    this.#nodeEls.get(id)?.g.focus({ preventScroll: true });
    this.#syncToolbar();
  }

  #focusLink(id: string): void {
    this.#focusEdge = id;
    this.#syncTabindex();
    const route = this.#edgeEls.get(id)?.route;
    if (route) this.#reveal({ x: route.mid.x - 20, y: route.mid.y - 20, width: 40, height: 40 });
    this.#edgeEls.get(id)?.link.focus({ preventScroll: true });
  }

  #activate(id: string): void {
    const detail: DiagramNodeActivateDetail = { id, node: this.#publicNode(id) };
    emit(this.host, 'aui-node-activate', detail);
  }

  /** The nearest node in an arrow direction (by center distance, favoring alignment). */
  #nearest(id: string, key: string): string | null {
    const n = this.#node(id);
    const cx = n.x + n.width / 2;
    const cy = n.y + n.height / 2;
    let best: string | null = null;
    let bestScore = Infinity;
    for (const other of this.#order) {
      if (other === id) continue;
      const o = this.#node(other);
      const dx = o.x + o.width / 2 - cx;
      const dy = o.y + o.height / 2 - cy;
      const along = key === 'ArrowRight' ? dx : key === 'ArrowLeft' ? -dx : key === 'ArrowDown' ? dy : -dy;
      const across = key === 'ArrowRight' || key === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 1) continue;
      const score = along + across * 2;
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    }
    return best;
  }

  // ---- toolbar actions -------------------------------------------------------------

  #action(action: string): void {
    if (this.#buttons.get(action)?.getAttribute('aria-disabled') === 'true') return;
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
      case 'pan':
        this.#hand = !this.#hand;
        this.#syncToolbar();
        break;
      case 'connect': {
        if (this.#connectFrom !== null) {
          this.#cancelConnect();
          break;
        }
        const source = [...this.#selNodes][0] ?? this.#focusNode;
        if (source === null) {
          announce(this.#msg('noSource'));
          break;
        }
        this.#startConnect(source, 'connectPointer');
        break;
      }
      case 'place':
        this.#placing = !this.#placing;
        this.#syncToolbar();
        if (this.#placing) announce(this.#msg('placeStart'), 'assertive');
        break;
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'delete':
        this.#deleteSelection();
        break;
    }
  }

  #deleteSelection(): void {
    const nodes = [...this.#selNodes].filter((id) => this.#nodes.get(id)?.locked !== true);
    const edges = new Set([...this.#selEdges]);
    for (const n of nodes) for (const e of this.#incident.get(n) ?? []) edges.add(e);
    if (nodes.length === 0 && edges.size === 0) {
      const locked = [...this.#selNodes][0];
      if (locked !== undefined) announce(this.#msg('lockedNode', { label: this.#name(locked) }), 'assertive');
      return;
    }
    const reading = this.#readingOrder();
    const nextFocus = reading.find((id) => !nodes.includes(id)) ?? null;
    this.#checkpoint();
    this.#deleteItems(nodes, [...edges]);
    this.#selNodes.clear();
    this.#selEdges.clear();
    this.#render();
    announce(this.#msg('deleted', { count: formatNumber(nodes.length + edges.size, {}, this.#config().locale) }));
    this.#emitChange('delete', [...nodes, ...edges]);
    this.#emitSelect();
    if (nextFocus !== null && this.#nodes.has(nextFocus)) this.#focusOn(nextFocus);
    else this.#viewport.focus({ preventScroll: true });
  }

  #startConnect(source: string, message: 'connectStart' | 'connectPointer'): void {
    this.#connectFrom = source;
    this.#placing = false;
    this.#render();
    announce(this.#msg(message, { label: this.#name(source) }), 'assertive');
  }

  #cancelConnect(): void {
    if (this.#connectFrom === null) return;
    this.#connectFrom = null;
    this.#render();
    announce(this.#msg('connectCancelled'));
  }

  #connect(from: string, fromPort: string | null, to: string, toPort: string | null, extra: Partial<DiagramEdge> = {}): string | null {
    const a = this.#node(from);
    const b = this.#node(to);
    const duplicate = this.#edgeOrder.some((id) => {
      const e = this.#edge(id);
      return e.from === from && e.to === to && (e.fromPort ?? null) === fromPort && (e.toPort ?? null) === toPort;
    });
    if (from === to || duplicate || (this.#options.canConnect && !this.#options.canConnect(copyNode(a), copyNode(b)))) {
      announce(this.#msg('connectRefused', { from: this.#name(from), to: this.#name(to) }), 'assertive');
      return null;
    }
    const edge: DiagramEdge = { ...copyEdge({ ...extra, id: extra.id ?? this.#uniqueId('edge'), from, to }) };
    if (fromPort !== null) edge.fromPort = fromPort;
    else delete edge.fromPort;
    if (toPort !== null) edge.toPort = toPort;
    else delete edge.toPort;
    this.#validateWith({ edges: [...this.model.edges, edge] });
    this.#checkpoint();
    this.#insertEdge(edge);
    this.#render();
    announce(this.#msg('connected', { from: this.#name(from), to: this.#name(to) }));
    this.#emitChange('connect', [edge.id]);
    return edge.id;
  }

  #reconnect(id: string, end: 'from' | 'to', node: string, port: string | null): void {
    const e = this.#edge(id);
    const from = end === 'from' ? node : e.from;
    const to = end === 'to' ? node : e.to;
    const a = this.#node(from);
    const b = this.#node(to);
    if (from === to || (this.#options.canConnect && !this.#options.canConnect(copyNode(a), copyNode(b)))) {
      announce(this.#msg('connectRefused', { from: this.#name(from), to: this.#name(to) }), 'assertive');
      this.#render();
      return;
    }
    this.#checkpoint();
    const next = copyEdge(e);
    next.from = from;
    next.to = to;
    if (end === 'from') {
      if (port === null) delete next.fromPort;
      else next.fromPort = port;
    } else if (port === null) delete next.toPort;
    else next.toPort = port;
    this.#edges.set(id, next);
    this.#reindex();
    this.#render();
    announce(this.#msg('reconnected', { from: this.#name(from), to: this.#name(to) }));
    this.#emitChange('reconnect', [id]);
  }

  #cancelInteractions(): void {
    this.#drag?.cancel();
    if (this.#moveMode) this.#endMoveMode(false);
    if (this.#editing) this.#endEdit(false);
    this.#connectFrom = null;
    this.#placing = false;
  }

  // ---- keyboard -------------------------------------------------------------------

  #onKey(e: KeyboardEvent): void {
    if (e.target === this.#editor) return;
    const node = this.#nodeAt(e.target);
    const edge = node === null ? this.#edgeAt(e.target) : null;
    const editable = this.editable;
    if (this.#moveMode && node !== null) {
      this.#moveModeKey(e);
      return;
    }
    // Commands shared by the canvas, nodes, and connections.
    if (editable) {
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
      if (matchesHotkey(e, 'mod+v')) {
        e.preventDefault();
        this.paste();
        return;
      }
    }
    if (matchesHotkey(e, 'mod+a')) {
      e.preventDefault();
      this.#selectOnly(this.#order, []);
      this.#emitSelect();
      return;
    }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.zoomTo(this.#view.scale * ZOOM_STEP);
      return;
    }
    if (e.key === '-') {
      e.preventDefault();
      this.zoomTo(this.#view.scale / ZOOM_STEP);
      return;
    }
    if (e.key === '0' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.fit();
      return;
    }
    if (e.key === 'Escape') {
      if (this.#connectFrom !== null) this.#cancelConnect();
      else if (this.#placing) {
        this.#placing = false;
        this.#syncToolbar();
      } else if (this.#selNodes.size > 0 || this.#selEdges.size > 0) {
        this.#selectOnly([], []);
        this.#emitSelect();
      } else return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (node !== null) this.#nodeKey(e, node);
    else if (edge !== null) this.#linkKey(e, edge);
    else if (e.target === this.#viewport) this.#canvasKey(e);
  }

  #canvasKey(e: KeyboardEvent): void {
    if (e.key === ' ' && this.editable) {
      this.#space = true;
      e.preventDefault();
      return;
    }
    const step = e.shiftKey ? PAN_STEP * 4 : PAN_STEP;
    const d: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const delta = d[e.key];
    if (delta) {
      e.preventDefault();
      this.#viewSet = true;
      this.#setView({ x: this.#view.x + delta[0], y: this.#view.y + delta[1], scale: this.#view.scale });
    }
  }

  #nodeKey(e: KeyboardEvent, id: string): void {
    const editable = this.editable;
    const n = this.#node(id);
    if (editable && (matchesHotkey(e, 'mod+c') || matchesHotkey(e, 'mod+x'))) {
      e.preventDefault();
      if (!this.#selNodes.has(id)) this.#selectOnly([id], []);
      this.copy();
      if (e.key.toLowerCase() === 'x') this.#deleteSelection();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (e.key === ' ') {
        e.preventDefault();
        this.#toggle(id);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        const next = this.#nearest(id, e.key);
        if (next !== null) {
          this.#focusOn(next);
          if (e.shiftKey) {
            this.#selNodes.add(next);
            this.#paintSelection();
            this.#emitSelect();
          }
        }
        return;
      }
      case 'Home':
      case 'End': {
        e.preventDefault();
        const reading = this.#readingOrder();
        const target = e.key === 'Home' ? reading[0] : reading[reading.length - 1];
        if (target !== undefined) this.#focusOn(target);
        return;
      }
      case ' ':
        e.preventDefault();
        if (e.shiftKey) this.#toggle(id);
        else {
          this.#selectOnly([id], []);
          this.#emitSelect();
        }
        return;
      case 'Enter':
      case 'F2':
        e.preventDefault();
        if (this.#connectFrom !== null && e.key === 'Enter') {
          this.#finishConnect(id);
          return;
        }
        if (editable && n.locked !== true) this.#startEdit('node', id);
        else if (editable && n.locked === true) announce(this.#msg('lockedNode', { label: this.#name(id) }), 'assertive');
        else if (e.key === 'Enter') this.#activate(id);
        return;
      case 'Delete':
      case 'Backspace':
        if (!editable) return;
        e.preventDefault();
        if (!this.#selNodes.has(id)) this.#selectOnly([id], []);
        this.#deleteSelection();
        return;
    }
    if (!editable) return;
    const key = e.key.toLowerCase();
    if (key === 'c') {
      e.preventDefault();
      if (this.#connectFrom === null) this.#startConnect(id, 'connectStart');
      else this.#finishConnect(id);
    } else if (key === 'm') {
      e.preventDefault();
      this.#startMoveMode(id);
    }
  }

  #toggle(id: string): void {
    if (this.#selNodes.has(id)) this.#selNodes.delete(id);
    else this.#selNodes.add(id);
    this.#paintSelection();
    this.#emitSelect();
  }

  #finishConnect(target: string): void {
    const from = this.#connectFrom;
    if (from === null) return;
    this.#connectFrom = null;
    if (from === target) {
      this.#render();
      announce(this.#msg('connectCancelled'));
      return;
    }
    if (this.#connect(from, null, target, null) === null) this.#render();
    this.#focusOn(target);
  }

  #linkKey(e: KeyboardEvent, id: string): void {
    const index = this.#edgeOrder.indexOf(id);
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight': {
        e.preventDefault();
        const next = this.#edgeOrder[index + 1];
        if (next !== undefined) this.#focusLink(next);
        return;
      }
      case 'ArrowUp':
      case 'ArrowLeft': {
        e.preventDefault();
        const prev = this.#edgeOrder[index - 1];
        if (prev !== undefined) this.#focusLink(prev);
        return;
      }
      case 'Home':
      case 'End': {
        e.preventDefault();
        const target = e.key === 'Home' ? this.#edgeOrder[0] : this.#edgeOrder[this.#edgeOrder.length - 1];
        if (target !== undefined) this.#focusLink(target);
        return;
      }
      case ' ':
        e.preventDefault();
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (this.#selEdges.has(id)) this.#selEdges.delete(id);
          else this.#selEdges.add(id);
          this.#paintSelection();
        } else this.#selectOnly([], [id]);
        this.#emitSelect();
        return;
      case 'Enter':
      case 'F2':
        e.preventDefault();
        if (this.editable) this.#startEdit('edge', id);
        return;
      case 'Delete':
      case 'Backspace':
        if (!this.editable) return;
        e.preventDefault();
        {
          const next = this.#edgeOrder[index + 1] ?? this.#edgeOrder[index - 1] ?? null;
          this.#checkpoint();
          const removed = this.#selEdges.has(id) ? [...this.#selEdges] : [id];
          this.#deleteItems([], removed);
          this.#selEdges.clear();
          this.#render();
          announce(this.#msg('deleted', { count: formatNumber(removed.length, {}, this.#config().locale) }));
          this.#emitChange('delete', removed);
          if (next !== null && this.#edges.has(next)) this.#focusLink(next);
          else if (this.#focusNode !== null) this.#focusOn(this.#focusNode);
        }
        return;
    }
  }

  #startMoveMode(id: string): void {
    const n = this.#node(id);
    if (n.locked === true) {
      announce(this.#msg('lockedNode', { label: this.#name(id) }), 'assertive');
      return;
    }
    const ids = (this.#selNodes.has(id) ? [...this.#selNodes] : [id]).filter((x) => this.#nodes.get(x)?.locked !== true);
    this.#moveMode = { ids, start: new Map(ids.map((x) => [x, { x: this.#node(x).x, y: this.#node(x).y }])), before: this.#snapshot() };
    this.#render();
    announce(this.#msg('moveMode', { label: this.#name(id) }), 'assertive');
  }

  #moveModeKey(e: KeyboardEvent): void {
    const mode = this.#moveMode;
    if (!mode) return;
    const c = this.#config();
    const step = (c.snapToGrid ? c.gridSize : 1) * (e.shiftKey ? 5 : 1);
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = d[e.key];
    e.preventDefault();
    e.stopPropagation();
    if (delta) {
      for (const id of mode.ids) {
        const n = this.#node(id);
        n.x += delta[0];
        n.y += delta[1];
      }
      this.#paintMoved(mode.ids);
      const focus = this.#focusNode;
      if (focus !== null) this.#reveal(this.#box(this.#node(focus)));
      return;
    }
    if (e.key === 'Enter' || e.key.toLowerCase() === 'm') this.#endMoveMode(true);
    else if (e.key === 'Escape') this.#endMoveMode(false);
  }

  #endMoveMode(commit: boolean): void {
    const mode = this.#moveMode;
    if (!mode) return;
    this.#moveMode = null;
    const moved = mode.ids.some((id) => {
      const s = mode.start.get(id);
      const n = this.#nodes.get(id);
      return s !== undefined && n !== undefined && (s.x !== n.x || s.y !== n.y);
    });
    if (!commit || !moved) {
      for (const [id, p] of mode.start) {
        const n = this.#nodes.get(id);
        if (n) {
          n.x = p.x;
          n.y = p.y;
        }
      }
      this.#render();
      if (!commit) announce(this.#msg('moveCancelled'));
      return;
    }
    this.#checkpoint(mode.before);
    for (const id of mode.ids) this.#manual.add(id);
    this.#render();
    const first = mode.ids[0];
    announce(mode.ids.length === 1 && first !== undefined ? this.#msg('moved', { label: this.#name(first) }) : this.#msg('movedMany', { count: String(mode.ids.length) }));
    this.#emitChange('move', mode.ids);
  }

  // ---- inline label editing ---------------------------------------------------------

  #startEdit(kind: 'node' | 'edge', id: string): void {
    this.#endEdit(false);
    const v = this.#view;
    let box: Box;
    let value: string;
    let name: string;
    if (kind === 'node') {
      const n = this.#node(id);
      if (n.locked === true) return;
      box = this.#box(n);
      value = n.label;
      name = this.#name(id);
    } else {
      const e = this.#edge(id);
      const route = this.#edgeEls.get(id)?.route ?? this.#route(e);
      if (!route) return;
      box = { x: route.mid.x - 80, y: route.mid.y - 16, width: 160, height: 32 };
      value = e.label ?? '';
      name = this.#linkName(id);
    }
    this.#editing = { kind, id };
    const s = this.#editor.style;
    const height = Math.max(32, Math.min(box.height, 48) * v.scale);
    s.setProperty('left', `${r1(box.x * v.scale + v.x)}px`);
    s.setProperty('top', `${r1((box.y + box.height / 2) * v.scale + v.y - height / 2)}px`);
    s.setProperty('width', `${r1(Math.max(120, box.width * v.scale))}px`);
    s.setProperty('height', `${r1(height)}px`);
    this.#editor.value = value;
    this.#editor.setAttribute('aria-label', this.#msg('editLabel', { label: name }));
    this.#editor.hidden = false;
    this.#editor.focus({ preventScroll: true });
    this.#editor.select();
  }

  #commitEdit(): void {
    const editing = this.#editing;
    if (!editing) return;
    const value = this.#editor.value.trim();
    if (editing.kind === 'node') {
      const n = this.#nodes.get(editing.id);
      if (n && value !== '' && value !== n.label) {
        this.#checkpoint();
        n.label = value;
        this.#endEdit(true);
        this.#render();
        announce(this.#msg('labelChanged', { label: value }));
        this.#emitChange('label', [editing.id]);
        return;
      }
    } else {
      const e = this.#edges.get(editing.id);
      if (e && value !== (e.label ?? '')) {
        this.#checkpoint();
        if (value === '') delete e.label;
        else e.label = value;
        this.#endEdit(true);
        this.#render();
        announce(this.#msg('labelChanged', { label: value === '' ? this.#msg('none') : value }));
        this.#emitChange('label', [editing.id]);
        return;
      }
    }
    this.#endEdit(true);
  }

  #endEdit(refocus: boolean): void {
    const editing = this.#editing;
    if (!editing) return;
    this.#editing = null;
    this.#editor.hidden = true;
    if (!refocus) return;
    if (editing.kind === 'node' && this.#nodes.has(editing.id)) this.#focusOn(editing.id);
    else if (editing.kind === 'edge' && this.#edges.has(editing.id)) this.#focusLink(editing.id);
  }

  // ---- pointer --------------------------------------------------------------------

  #nodeAt(target: EventTarget | null): string | null {
    const el = target instanceof Element ? target.closest('[data-aui-node]') : null;
    return el?.getAttribute('data-aui-node') ?? null;
  }

  #edgeAt(target: EventTarget | null): string | null {
    const el = target instanceof Element ? target.closest('.aui-diagram__link') : null;
    return el?.getAttribute('data-aui-edge') ?? null;
  }

  /** Node and port under a client point (ignores the dragged elements). */
  #targetAt(point: Point, exclude: string | null): { id: string; port: string | null } | null {
    for (const el of this.#doc.elementsFromPoint(point.x, point.y)) {
      const id = this.#nodeAt(el);
      if (id === null || id === exclude) continue;
      const port = el.closest('[data-aui-port]')?.getAttribute('data-aui-port') ?? null;
      return { id, port };
    }
    return null;
  }

  #onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const id = this.#nodeAt(e.target);
    const edge = this.#edgeAt(e.target);
    this.#down = null;
    if (e.target instanceof Element && e.target.closest('[data-aui-port], [data-aui-end]')) return;
    if (id !== null) {
      if (this.#connectFrom !== null || this.#placing) return;
      const modifier = e.shiftKey || e.ctrlKey || e.metaKey;
      const wasSelected = this.#selNodes.has(id);
      this.#down = { id, wasSelected, modifier };
      if (modifier) this.#toggle(id);
      else if (!wasSelected) {
        this.#selectOnly([id], []);
        this.#emitSelect();
      }
    } else if (edge !== null) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        if (this.#selEdges.has(edge)) this.#selEdges.delete(edge);
        else this.#selEdges.add(edge);
        this.#paintSelection();
      } else this.#selectOnly([], [edge]);
      this.#emitSelect();
    }
  }

  #onClick(e: MouseEvent): void {
    const id = this.#nodeAt(e.target);
    if (id !== null) {
      if (this.#connectFrom !== null) {
        this.#finishConnect(id);
        return;
      }
      const down = this.#down;
      if (down?.id === id && !down.modifier && down.wasSelected && this.#selNodes.size > 1) {
        this.#selectOnly([id], []);
        this.#emitSelect();
      }
      this.#focusOn(id);
      return;
    }
    if (this.#edgeAt(e.target) !== null) return;
    if (this.#placing && this.editable) {
      this.#placeAt(this.#toDiagram({ x: e.clientX, y: e.clientY }));
      return;
    }
    if (e.target instanceof Element && (e.target === this.#svg || e.target.closest('.aui-diagram__grid, .aui-diagram__groups'))) {
      if (this.#selNodes.size > 0 || this.#selEdges.size > 0) {
        this.#selectOnly([], []);
        this.#emitSelect();
      }
    }
  }

  /** Single-pointer move: the selection's bounding box is centered on the point. */
  #placeAt(p: Point): void {
    const ids = [...this.#selNodes].filter((id) => this.#nodes.get(id)?.locked !== true);
    this.#placing = false;
    if (ids.length === 0) {
      this.#syncToolbar();
      return;
    }
    const nodes = ids.map((id) => this.#node(id));
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const w = Math.max(...nodes.map((n) => n.x + n.width)) - minX;
    const h = Math.max(...nodes.map((n) => n.y + n.height)) - minY;
    const dx = this.#snap(p.x - w / 2) - minX;
    const dy = this.#snap(p.y - h / 2) - minY;
    this.#checkpoint();
    for (const n of nodes) {
      n.x += dx;
      n.y += dy;
      this.#manual.add(n.id);
    }
    this.#render();
    const first = ids[0];
    announce(ids.length === 1 && first !== undefined ? this.#msg('moved', { label: this.#name(first) }) : this.#msg('movedMany', { count: String(ids.length) }));
    this.#emitChange('move', ids);
  }

  #canStartGesture(e: PointerEvent): boolean {
    if (this.#editing || this.#moveMode) return false;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t === this.#editor) return false;
    const editable = this.editable;
    const port = t.closest('[data-aui-port]');
    const handle = t.closest('[data-aui-end]');
    const node = this.#nodeAt(t);
    const edge = this.#edgeAt(t);
    if (editable && port && node !== null) {
      this.#gesture = { kind: 'connect', from: node, port: port.getAttribute('data-aui-port'), target: null };
      return true;
    }
    if (editable && handle && edge !== null) {
      const end = handle.getAttribute('data-aui-end') === 'from' ? 'from' : 'to';
      this.#gesture = { kind: 'reconnect', edge, end, target: null };
      return true;
    }
    if (node !== null) {
      if (!editable || this.#connectFrom !== null || this.#placing || this.#hand || this.#space) {
        if (this.#hand || this.#space) {
          this.#gesture = { kind: 'pan', x: this.#view.x, y: this.#view.y };
          return true;
        }
        return false;
      }
      if (e.shiftKey || e.ctrlKey || e.metaKey) return false;
      const ids = (this.#selNodes.has(node) ? [...this.#selNodes] : [node]).filter((id) => this.#nodes.get(id)?.locked !== true);
      if (!ids.includes(node)) return false;
      this.#gesture = { kind: 'move', primary: node, ids, start: new Map(ids.map((id) => [id, { x: this.#node(id).x, y: this.#node(id).y }])), before: this.#snapshot(), moved: false };
      return true;
    }
    if (edge !== null) return false;
    if (editable && !this.#hand && !this.#space && !this.#placing) {
      this.#gesture = { kind: 'marquee', origin: this.#toDiagram({ x: e.clientX, y: e.clientY }), additive: e.shiftKey || e.ctrlKey || e.metaKey, base: new Set(this.#selNodes) };
      return true;
    }
    if (this.#placing) return false;
    this.#gesture = { kind: 'pan', x: this.#view.x, y: this.#view.y };
    return true;
  }

  #onGestureMove(move: DragMove): void {
    const g = this.#gesture;
    if (!g) return;
    const doc = this.#doc;
    switch (g.kind) {
      case 'pan':
        this.#viewSet = true;
        this.#setView({ x: g.x + move.dx, y: g.y + move.dy, scale: this.#view.scale });
        return;
      case 'move': {
        const s = this.#view.scale;
        const primary = g.start.get(g.primary);
        const pn = this.#node(g.primary);
        if (!primary) return;
        let nx = this.#snap(primary.x + move.dx / s);
        let ny = this.#snap(primary.y + move.dy / s);
        // Alignment guides against the other nodes (left, center, right; top, middle, bottom).
        const moving = new Set(g.ids);
        const guides: string[] = [];
        let bestX = GUIDE_SNAP / s;
        let bestY = GUIDE_SNAP / s;
        let gx: number | null = null;
        let gy: number | null = null;
        for (const id of this.#order) {
          if (moving.has(id)) continue;
          const o = this.#node(id);
          for (const [mine, theirs] of [[0, o.x], [pn.width / 2, o.x + o.width / 2], [pn.width, o.x + o.width]] as const) {
            const d = Math.abs(nx + mine - theirs);
            if (d < bestX) {
              bestX = d;
              gx = theirs;
              nx = theirs - mine;
            }
          }
          for (const [mine, theirs] of [[0, o.y], [pn.height / 2, o.y + o.height / 2], [pn.height, o.y + o.height]] as const) {
            const d = Math.abs(ny + mine - theirs);
            if (d < bestY) {
              bestY = d;
              gy = theirs;
              ny = theirs - mine;
            }
          }
        }
        if (gx !== null) guides.push(`M${r1(gx)} -100000V100000`);
        if (gy !== null) guides.push(`M-100000 ${r1(gy)}H100000`);
        const dx = nx - primary.x;
        const dy = ny - primary.y;
        for (const id of g.ids) {
          const st = g.start.get(id);
          const n = this.#nodes.get(id);
          if (st && n) {
            n.x = st.x + dx;
            n.y = st.y + dy;
          }
        }
        g.moved = dx !== 0 || dy !== 0;
        this.#paintMoved(g.ids);
        this.#overlay.replaceChildren(...(guides.length > 0 ? [svg(doc, 'path', { d: guides.join('') }, 'aui-diagram__guide')] : []));
        return;
      }
      case 'connect':
      case 'reconnect': {
        const p = this.#toDiagram(move.point);
        let origin: Point;
        if (g.kind === 'connect') {
          const n = this.#node(g.from);
          const port = this.#ports(n).find((x) => x.id === g.port);
          origin = port ? portPoint(this.#box(n), port, n.shape ?? 'rounded') : { x: n.x + n.width / 2, y: n.y + n.height / 2 };
        } else {
          const route = this.#edgeEls.get(g.edge)?.route;
          origin = (g.end === 'from' ? route?.end.point : route?.start.point) ?? p;
        }
        const exclude = g.kind === 'connect' ? g.from : null;
        const target = this.#targetAt(move.point, exclude);
        if (target?.id !== g.target?.id) {
          if (g.target) this.#nodeEls.get(g.target.id)?.g.classList.remove('aui-diagram__node--target');
          if (target) this.#nodeEls.get(target.id)?.g.classList.add('aui-diagram__node--target');
        }
        g.target = target;
        this.#overlay.replaceChildren(svg(doc, 'path', { d: `M${r1(origin.x)} ${r1(origin.y)}L${r1(p.x)} ${r1(p.y)}` }, 'aui-diagram__preview'));
        return;
      }
      case 'marquee': {
        const p = this.#toDiagram(move.point);
        const box = { x: Math.min(p.x, g.origin.x), y: Math.min(p.y, g.origin.y), width: Math.abs(p.x - g.origin.x), height: Math.abs(p.y - g.origin.y) };
        this.#overlay.replaceChildren(svg(doc, 'rect', { x: r1(box.x), y: r1(box.y), width: r1(box.width), height: r1(box.height) }, 'aui-diagram__marquee'));
        const hit = this.#order.filter((id) => intersects(box, this.#node(id)));
        this.#selNodes = new Set(g.additive ? [...g.base, ...hit] : hit);
        for (const [id, el] of this.#nodeEls) el.g.setAttribute('aria-selected', String(this.#selNodes.has(id)));
        return;
      }
    }
  }

  #onGestureEnd(move: DragMove): void {
    const g = this.#gesture;
    this.#gesture = null;
    this.#overlay.replaceChildren();
    this.#viewport.classList.remove('aui-diagram__viewport--panning');
    if (!g) return;
    switch (g.kind) {
      case 'move':
        if (!g.moved) return;
        this.#checkpoint(g.before);
        for (const id of g.ids) this.#manual.add(id);
        this.#render();
        this.#emitChange('move', g.ids);
        return;
      case 'connect': {
        if (g.target) this.#nodeEls.get(g.target.id)?.g.classList.remove('aui-diagram__node--target');
        const target = g.target ?? this.#targetAt(move.point, g.from);
        if (target) this.#connect(g.from, g.port, target.id, target.port);
        return;
      }
      case 'reconnect': {
        if (g.target) this.#nodeEls.get(g.target.id)?.g.classList.remove('aui-diagram__node--target');
        if (g.target) this.#reconnect(g.edge, g.end, g.target.id, g.target.port);
        return;
      }
      case 'marquee':
        this.#paintSelection();
        this.#emitSelect();
        return;
      case 'pan':
        return;
    }
  }

  #onGestureCancel(): void {
    const g = this.#gesture;
    this.#gesture = null;
    this.#overlay.replaceChildren();
    this.#viewport.classList.remove('aui-diagram__viewport--panning');
    if (!g) return;
    if (g.kind === 'move') {
      for (const [id, p] of g.start) {
        const n = this.#nodes.get(id);
        if (n) {
          n.x = p.x;
          n.y = p.y;
        }
      }
      this.#render();
    } else if ((g.kind === 'connect' || g.kind === 'reconnect') && g.target) this.#nodeEls.get(g.target.id)?.g.classList.remove('aui-diagram__node--target');
    else if (g.kind === 'marquee') {
      this.#selNodes = g.base;
      this.#paintSelection();
    }
  }
}

