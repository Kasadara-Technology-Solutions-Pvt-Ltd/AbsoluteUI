/**
 * Network Graph (R20 P11). Nodes and edges laid out by a deterministic force-directed
 * simulation (seeded; it settles, then stops). The settling is animated only when
 * animation is allowed and the user has not asked for reduced motion; otherwise the
 * final layout is computed before the first paint. Node groups get palette colors and
 * marker shapes (never color alone). Dragging a node, or Shift+Arrow on a focused
 * node, pins it; zoom and pan use the shared chart zoom. Keyboard: one tab stop; the
 * arrow keys move to the connected node in that direction, PageUp/PageDown step
 * through all nodes in data order (isolated ones too); the focused or hovered node's
 * neighbors and edges are highlighted. The data table is an adjacency list.
 */
import { defineComponentConfig, emit, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { announce, shouldAnimate, trackPointerDrag } from '@absoluteui/utilities';
import { fontSize, truncateText, type PlotRect } from '../internal/chart/axis.js';
import { FrameChart, type ChartModelBase, type ChartSeriesToggleDetail } from '../internal/chart/base.js';
import { ChartFrame, type FrameMark, type HoverResult, type LegendItem, type TableData, type TooltipContent } from '../internal/chart/frame.js';
import { assertCommon, chartBaseSchema, chartFail, chartPlural, colorSlot, isChartColor, listFormat, pickDefined, type ChartBaseConfig, type ChartColor, type ChartCommonOptions } from '../internal/chart/model.js';
import { applySeriesStyle, isCssColor, type ChartPointClickDetail } from '../internal/chart/style.js';
import { fmt, MARKER_SHAPES, markerPath, svgElement, type MarkerShape } from '../internal/chart/svg.js';
import { ChartZoom, type ChartZoomDetail } from '../internal/chart/zoom.js';
import { ForceLayout } from './layout.js';

export type NetworkGraphNodeLabels = 'auto' | 'always' | 'none';

export interface NetworkGraphConfig extends ChartBaseConfig {
  /** Node labels: `auto` (graphs up to 50 visible nodes), `always`, `none`. Default `auto`. */
  nodeLabels: NetworkGraphNodeLabels;
  /** Animate the layout settling (never with reduced motion or `animation: 'none'`). Default true. */
  animate: boolean;
}

type Resolved = Readonly<NetworkGraphConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    networkGraph: NetworkGraphConfig & { locale: string; direction: Direction };
  }
}

export const networkGraphConfig = defineComponentConfig<NetworkGraphConfig, 'locale' | 'direction'>(
  'networkGraph',
  {
    ...chartBaseSchema,
    height: { default: 400, expected: 'integer from 120 to 2000 (CSS px)', validate: validators.integerInRange(120, 2000) },
    nodeLabels: { default: 'auto', expected: '"auto" | "always" | "none"', validate: validators.oneOf(['auto', 'always', 'none'] as const) },
    animate: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

export interface NetworkNode {
  /** Unique, non-empty id referenced by edges. */
  id: string;
  label: string;
  /** Group id (color, marker shape, legend). Nodes without a group share one. */
  group?: string;
  /** Size value: node radius grows with its square root. */
  value?: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  /** Edge weight (positive): line thickness and the adjacency table. Default 1. */
  weight?: number;
}

export interface NetworkGroup {
  id: string;
  label: string;
  /** Palette slot 1-8. Default: group position (cycling). */
  color?: ChartColor;
  /** CSS color; overrides the palette slot. */
  colorValue?: string;
}

/** A pinned node position in layout units (the coordinate space of `positions`). */
export interface NetworkPin {
  id: string;
  x: number;
  y: number;
}

export interface NetworkGraphOptions extends ChartCommonOptions, Partial<NetworkGraphConfig> {
  nodes: readonly NetworkNode[];
  edges: readonly NetworkEdge[];
  /** Group labels, colors, and legend order. Default: groups in order of first appearance, labelled by id. */
  groups?: readonly NetworkGroup[];
  /** Draw arrowheads at edge targets. Default false. */
  directed?: boolean;
  /** Layout seed (integer): the same data and seed always give the same layout. Default 1. */
  seed?: number;
  /** Preferred edge length in layout units (10-400). Default 60. */
  linkDistance?: number;
  /** Node repulsion (1-2000). Default 120. */
  charge?: number;
  /** Nodes fixed at a position (also set by dragging or Shift+Arrow). */
  pinned?: readonly NetworkPin[];
  /** Zoom and pan (toolbar, + / - / 0 keys, Ctrl+wheel, drag on the background). Default true. */
  zoom?: boolean;
}

/** Detail of `aui-node-pin`. */
export interface NetworkGraphNodePinDetail {
  id: string;
  pinned: boolean;
  /** Position in layout units. */
  x: number;
  y: number;
  /** Every pinned node after the change. */
  pins: NetworkPin[];
  source: 'pointer' | 'keyboard' | 'api';
}

export type NetworkGraphSeriesToggleDetail = ChartSeriesToggleDetail;
export type NetworkGraphZoomDetail = ChartZoomDetail;
/** Detail of `aui-point-click` (`seriesId` is the node id). */
export type NetworkGraphPointClickDetail = ChartPointClickDetail;

registerMessages('chart', 'en', {
  roleNetwork: 'network graph',
  netNode: '{label}, {group}, {connections}',
  netNodeNeighbors: '{label}, {group}, {connections}: {neighbors}',
  netIntro: '{type}, {nodes}, {edges}, {groups}.',
  netHub: 'Most connected: {label} ({connections}).',
  netIsolated: 'Not connected: {list}.',
  netUngrouped: 'Other',
  netGroup: 'Group',
  netConnections: 'Connections',
  netNeighbors: 'Connected to',
  netNodeColumn: 'Node',
  netMore: '{list}, and {count} more',
  netWeight: '{label} (weight {weight})',
  netPinned: '{label} pinned.',
  netUnpinned: '{label} unpinned.',
  nodeCount_one: '{count} node',
  nodeCount_other: '{count} nodes',
  connectionCount_one: '{count} connection',
  connectionCount_other: '{count} connections',
  edgeCount_one: '{count} edge',
  edgeCount_other: '{count} edges',
  groupCount_one: '{count} group',
  groupCount_other: '{count} groups',
});

const COMPONENT = 'networkGraph';
const CODE = 'NETWORK_GRAPH_OPTIONS';
const MAX_NODES = 1000;
const MAX_EDGES = 5000;
const UNGROUPED = '';

interface GroupInfo {
  readonly id: string;
  readonly label: string;
  readonly slot: number;
  readonly position: number;
  readonly shape: MarkerShape;
  readonly colorValue: string | undefined;
}

interface NodeInfo {
  readonly node: NetworkNode;
  readonly index: number;
  readonly group: GroupInfo;
  readonly neighbors: readonly number[];
  readonly edges: readonly number[];
  readonly radius: number;
}

interface Model extends ChartModelBase {
  readonly config: Resolved;
  readonly nodes: readonly NodeInfo[];
  readonly byId: ReadonlyMap<string, NodeInfo>;
  readonly groups: readonly GroupInfo[];
  readonly pairs: readonly (readonly [number, number])[];
}

interface View {
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
}

export class NetworkGraph extends FrameChart<NetworkGraphOptions, Model> {
  readonly #zoom: ChartZoom;
  #x: Float64Array = new Float64Array(0);
  #y: Float64Array = new Float64Array(0);
  #ids: string[] = [];
  #pins = new Map<string, { x: number; y: number }>();
  #bbox = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  #view: View = { scale: 1, tx: 0, ty: 0 };
  #plot: PlotRect = { left: 0, right: 0, top: 0, bottom: 0 };
  #nodeEls = new Map<number, SVGPathElement>();
  #labelEls = new Map<number, SVGTextElement>();
  #edgeEls = new Map<number, SVGElement[]>();
  #frameRequest = 0;
  #focusLit: readonly SVGElement[] = [];
  #lit: readonly SVGElement[] = [];
  #dragging: number | null = null;

  /** Render a network graph into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: NetworkGraphOptions): NetworkGraph {
    return new NetworkGraph(host, options);
  }

  private constructor(host: HTMLElement, options: NetworkGraphOptions) {
    super(host, options, 'aui-network-graph');
    this.#zoom = new ChartZoom({
      frame: this.frame,
      locale: () => this.model.config.locale,
      rtl: () => false,
      extent: () => ({ x: { from: 0, to: 1 }, y: { from: 0, to: 1 } }),
      minSpan: () => ({ x: 0.05, y: 0.05 }),
      plot: () => this.#plot,
      invertX: (px) => this.#normX(px),
      invertY: (py) => this.#normY(py),
      formatX: (v) => `${String(Math.round(v * 100))}%`,
      formatY: (v) => `${String(Math.round(v * 100))}%`,
      changed: () => {
        this.frame.render();
      },
    });
    this.start((listener) => networkGraphConfig.subscribe(listener));
  }

  /** Current node positions in layout units, by node id. */
  get positions(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    this.#ids.forEach((id, i) => {
      out[id] = { x: this.#x[i] ?? 0, y: this.#y[i] ?? 0 };
    });
    return out;
  }

  /** Pinned nodes. */
  get pins(): NetworkPin[] {
    return [...this.#pins].map(([id, p]) => ({ id, x: p.x, y: p.y }));
  }

  /** Re-run the layout (pinned nodes keep their positions). */
  relayout(): void {
    this.#layout(false);
    this.frame.render();
  }

  /** Remove every pin (no event); call `relayout()` to let the nodes move again. */
  unpinAll(): void {
    this.#pins.clear();
    this.frame.render();
  }

  protected override mounted(): void {
    const body = this.frame.body;
    // Registered before the zoom drag, so a press on a node pins it instead of panning.
    const drag = trackPointerDrag(body, {
      canStart: (e) => {
        const index = this.#nodeAt(e.target);
        if (index === null) return false;
        e.stopImmediatePropagation();
        this.#dragging = index;
        return true;
      },
      onMove: (move) => {
        const i = this.#dragging;
        if (i === null) return;
        const rect = this.frame.svg.getBoundingClientRect();
        const v = this.#view;
        this.#moveNode(i, (move.point.x - rect.left - v.tx) / v.scale, (move.point.y - rect.top - v.ty) / v.scale);
      },
      onEnd: () => {
        const i = this.#dragging;
        this.#dragging = null;
        if (i !== null) this.#pinned(i, 'pointer');
      },
      onCancel: () => {
        this.#dragging = null;
        this.frame.render();
      },
    });
    this.group.add(() => {
      drag.dispose();
    });
    this.group.listen(body, 'focusin', (e) => {
      const index = this.#nodeAt(e.target);
      this.#focusLit = index === null ? [] : this.#neighborhood(index);
      this.#light(this.#focusLit);
    });
    this.group.listen(body, 'focusout', (e) => {
      if (this.#nodeAt(e.relatedTarget) !== null) return;
      this.#focusLit = [];
      this.#light([]);
    });
    this.group.listen(body, 'pointerleave', () => {
      this.#light(this.#focusLit);
    });
    this.group.add(() => {
      this.#cancelFrame();
    });
    this.#syncZoom();
    this.#layout(true);
  }

  protected override optionsChanged(changed: Partial<NetworkGraphOptions>): void {
    this.#syncZoom();
    if (changed.pinned !== undefined) this.#pins = new Map(changed.pinned.map((p) => [p.id, { x: p.x, y: p.y }]));
    if (changed.nodes !== undefined || changed.edges !== undefined || changed.seed !== undefined || changed.linkDistance !== undefined || changed.charge !== undefined || changed.pinned !== undefined) this.#layout(true);
  }

  #syncZoom(): void {
    this.#zoom.setMode(this.options.zoom === false ? 'none' : 'xy');
  }

  protected override cleanup(): void {
    this.#cancelFrame();
    this.#zoom.destroy();
    this.host.classList.remove('aui-network-graph--lit');
  }

  protected seriesIds(): readonly string[] {
    return this.model.groups.map((g) => g.id);
  }

  protected assert(o: NetworkGraphOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.nodes) || o.nodes.length > MAX_NODES) chartFail(CODE, COMPONENT, 'nodes', `NetworkNode[] (at most ${String(MAX_NODES)})`);
    const ids = new Set<string>();
    o.nodes.forEach((n: unknown, i) => {
      const at = `nodes[${String(i)}]`;
      if (!validators.isRecord(n)) chartFail(CODE, COMPONENT, at, 'NetworkNode');
      if (typeof n.id !== 'string' || n.id === '' || ids.has(n.id)) chartFail(CODE, COMPONENT, `${at}.id`, 'unique non-empty string');
      ids.add(n.id);
      if (typeof n.label !== 'string') chartFail(CODE, COMPONENT, `${at}.label`, 'string');
      if (n.group !== undefined && (typeof n.group !== 'string' || n.group === '')) chartFail(CODE, COMPONENT, `${at}.group`, 'non-empty string');
      if (n.value !== undefined && !(typeof n.value === 'number' && Number.isFinite(n.value) && n.value >= 0)) chartFail(CODE, COMPONENT, `${at}.value`, 'finite number >= 0');
    });
    if (!Array.isArray(o.edges) || o.edges.length > MAX_EDGES) chartFail(CODE, COMPONENT, 'edges', `NetworkEdge[] (at most ${String(MAX_EDGES)})`);
    o.edges.forEach((e: unknown, i) => {
      const at = `edges[${String(i)}]`;
      if (!validators.isRecord(e)) chartFail(CODE, COMPONENT, at, 'NetworkEdge');
      if (typeof e.source !== 'string' || !ids.has(e.source)) chartFail(CODE, COMPONENT, `${at}.source`, 'id of a node');
      if (typeof e.target !== 'string' || !ids.has(e.target)) chartFail(CODE, COMPONENT, `${at}.target`, 'id of a node');
      if (e.source === e.target) chartFail(CODE, COMPONENT, `${at}.target`, 'a node other than the source');
      if (e.weight !== undefined && !(typeof e.weight === 'number' && Number.isFinite(e.weight) && e.weight > 0)) chartFail(CODE, COMPONENT, `${at}.weight`, 'positive finite number');
    });
    if (o.groups !== undefined) {
      if (!Array.isArray(o.groups) || o.groups.length > 64) chartFail(CODE, COMPONENT, 'groups', 'NetworkGroup[] (at most 64)');
      const groupIds = new Set<string>();
      o.groups.forEach((g: unknown, i) => {
        const at = `groups[${String(i)}]`;
        if (!validators.isRecord(g) || typeof g.id !== 'string' || g.id === '' || groupIds.has(g.id)) chartFail(CODE, COMPONENT, `${at}.id`, 'unique non-empty string');
        groupIds.add(g.id);
        if (typeof g.label !== 'string') chartFail(CODE, COMPONENT, `${at}.label`, 'string');
        if (!isChartColor(g.color)) chartFail(CODE, COMPONENT, `${at}.color`, 'integer 1-8');
        if (g.colorValue !== undefined && !isCssColor(g.colorValue)) chartFail(CODE, COMPONENT, `${at}.colorValue`, 'CSS color');
      });
    }
    if (o.directed !== undefined && typeof o.directed !== 'boolean') chartFail(CODE, COMPONENT, 'directed', 'boolean');
    if (o.seed !== undefined && !(Number.isInteger(o.seed) && o.seed >= 0 && o.seed <= 4294967295)) chartFail(CODE, COMPONENT, 'seed', 'integer from 0 to 4294967295');
    if (o.linkDistance !== undefined && !(typeof o.linkDistance === 'number' && o.linkDistance >= 10 && o.linkDistance <= 400)) chartFail(CODE, COMPONENT, 'linkDistance', 'number from 10 to 400');
    if (o.charge !== undefined && !(typeof o.charge === 'number' && o.charge >= 1 && o.charge <= 2000)) chartFail(CODE, COMPONENT, 'charge', 'number from 1 to 2000');
    if (o.pinned !== undefined) {
      if (!Array.isArray(o.pinned)) chartFail(CODE, COMPONENT, 'pinned', 'NetworkPin[]');
      o.pinned.forEach((p: unknown, i) => {
        if (!validators.isRecord(p) || typeof p.id !== 'string' || !ids.has(p.id) || !(typeof p.x === 'number' && Number.isFinite(p.x)) || !(typeof p.y === 'number' && Number.isFinite(p.y))) chartFail(CODE, COMPONENT, `pinned[${String(i)}]`, '{ id: node id; x: number; y: number }');
      });
    }
    if (o.zoom !== undefined && typeof o.zoom !== 'boolean') chartFail(CODE, COMPONENT, 'zoom', 'boolean');
  }

  protected prepare(): Model {
    const o = this.options;
    const config: Resolved = networkGraphConfig.resolve(pickDefined(o, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'nodeLabels', 'animate', 'locale', 'direction']));
    const declared = o.groups ?? [];
    const order: string[] = declared.map((g) => g.id);
    for (const n of o.nodes) {
      const g = n.group ?? UNGROUPED;
      if (!order.includes(g)) order.push(g);
    }
    const groups: GroupInfo[] = order.map((id, position) => {
      const d = declared.find((g) => g.id === id);
      return { id, label: d?.label ?? (id === UNGROUPED ? getMessage('chart', 'netUngrouped', {}, config.locale) : id), slot: colorSlot(d?.color, position), position, shape: MARKER_SHAPES[position % MARKER_SHAPES.length] ?? 'circle', colorValue: d?.colorValue };
    });
    const groupById = new Map(groups.map((g) => [g.id, g]));
    const index = new Map<string, number>();
    o.nodes.forEach((n, i) => index.set(n.id, i));
    const neighbors: Set<number>[] = o.nodes.map(() => new Set());
    const incident: number[][] = o.nodes.map(() => []);
    const pairs: [number, number][] = [];
    o.edges.forEach((e, k) => {
      const s = index.get(e.source) ?? 0;
      const t = index.get(e.target) ?? 0;
      pairs.push([s, t]);
      neighbors[s]?.add(t);
      neighbors[t]?.add(s);
      incident[s]?.push(k);
      incident[t]?.push(k);
    });
    const maxValue = Math.max(0, ...o.nodes.map((n) => n.value ?? 0));
    const nodes: NodeInfo[] = o.nodes.map((node, i) => ({
      node,
      index: i,
      group: groupById.get(node.group ?? UNGROUPED) ?? groups[0] ?? { id: UNGROUPED, label: '', slot: 1, position: 0, shape: 'circle', colorValue: undefined },
      neighbors: [...(neighbors[i] ?? [])],
      edges: incident[i] ?? [],
      radius: maxValue > 0 && node.value !== undefined ? 4 + 10 * Math.sqrt(node.value / maxValue) : 6,
    }));
    const empty = o.nodes.length === 0 ? getMessage('chart', 'noData', {}, config.locale) : null;
    return { config, nodes, byId: new Map(nodes.map((n) => [n.node.id, n])), groups, pairs, empty };
  }

  /** Run the simulation; animated when allowed, else synchronous. */
  #layout(initial: boolean): void {
    this.#cancelFrame();
    const o = this.options;
    const m = this.model;
    if (initial && o.pinned !== undefined && this.#pins.size === 0) this.#pins = new Map(o.pinned.map((p) => [p.id, { x: p.x, y: p.y }]));
    const previous = new Map<number, { x: number; y: number }>();
    this.#ids.forEach((id, i) => {
      const n = m.byId.get(id);
      if (n) previous.set(n.index, { x: this.#x[i] ?? 0, y: this.#y[i] ?? 0 });
    });
    const pinned = new Map<number, { x: number; y: number }>();
    for (const [id, p] of this.#pins) {
      const n = m.byId.get(id);
      if (n) pinned.set(n.index, p);
    }
    const sim = new ForceLayout({ count: m.nodes.length, edges: m.pairs, distance: o.linkDistance ?? 60, charge: o.charge ?? 120, seed: o.seed ?? 1, initial: previous, pinned });
    this.#ids = m.nodes.map((n) => n.node.id);
    this.#x = sim.x;
    this.#y = sim.y;
    const view = this.host.ownerDocument.defaultView;
    if (!m.config.animate || !shouldAnimate() || !view) {
      sim.settle();
      this.#fit();
      return;
    }
    const tick = (): void => {
      const done = sim.step(4);
      this.#fit();
      this.#reposition();
      if (done) {
        this.#frameRequest = 0;
        this.frame.render();
      } else {
        this.#frameRequest = view.requestAnimationFrame(tick);
      }
    };
    this.#fit();
    this.#frameRequest = view.requestAnimationFrame(tick);
  }

  #cancelFrame(): void {
    if (this.#frameRequest !== 0) this.host.ownerDocument.defaultView?.cancelAnimationFrame(this.#frameRequest);
    this.#frameRequest = 0;
  }

  /** Bounding box of the layout (fit to bounds). */
  #fit(): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < this.#x.length; i++) {
      minX = Math.min(minX, this.#x[i] ?? 0);
      maxX = Math.max(maxX, this.#x[i] ?? 0);
      minY = Math.min(minY, this.#y[i] ?? 0);
      maxY = Math.max(maxY, this.#y[i] ?? 0);
    }
    if (!Number.isFinite(minX)) {
      minX = -1;
      maxX = 1;
      minY = -1;
      maxY = 1;
    }
    const pad = Math.max(1, (maxX - minX) * 0.02, (maxY - minY) * 0.02);
    this.#bbox = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  /** Layout-to-screen transform for the plot and zoom window. */
  #computeView(): View {
    const p = this.#plot;
    const b = this.#bbox;
    const bw = Math.max(1e-6, b.maxX - b.minX);
    const bh = Math.max(1e-6, b.maxY - b.minY);
    const wx = this.#zoom.x ?? { from: 0, to: 1 };
    const wy = this.#zoom.y ?? { from: 0, to: 1 };
    const x0 = b.minX + wx.from * bw;
    const x1 = b.minX + wx.to * bw;
    // Zoom ranges run bottom-up (cartesian); layout y runs top-down.
    const y0 = b.minY + (1 - wy.to) * bh;
    const y1 = b.minY + (1 - wy.from) * bh;
    const scale = Math.min((p.right - p.left) / Math.max(1e-6, x1 - x0), (p.bottom - p.top) / Math.max(1e-6, y1 - y0));
    const tx = (p.left + p.right) / 2 - ((x0 + x1) / 2) * scale;
    const ty = (p.top + p.bottom) / 2 - ((y0 + y1) / 2) * scale;
    return { scale, tx, ty };
  }

  #normX(px: number): number {
    const b = this.#bbox;
    return ((px - this.#view.tx) / this.#view.scale - b.minX) / Math.max(1e-6, b.maxX - b.minX);
  }

  #normY(py: number): number {
    const b = this.#bbox;
    return 1 - ((py - this.#view.ty) / this.#view.scale - b.minY) / Math.max(1e-6, b.maxY - b.minY);
  }

  #screen(i: number): { x: number; y: number } {
    const v = this.#view;
    return { x: (this.#x[i] ?? 0) * v.scale + v.tx, y: (this.#y[i] ?? 0) * v.scale + v.ty };
  }

  #nodeAt(target: EventTarget | null): number | null {
    if (!(target instanceof Element)) return null;
    for (const [i, el] of this.#nodeEls) if (el === target) return i;
    return null;
  }

  #visible(n: NodeInfo): boolean {
    return !this.hidden.has(n.group.id);
  }

  #connections(n: NodeInfo): number {
    return n.neighbors.filter((k) => {
      const other = this.model.nodes[k];
      return other ? this.#visible(other) : false;
    }).length;
  }

  #neighborText(n: NodeInfo, limit: number): string {
    const m = this.model;
    const labels = n.neighbors.map((k) => m.nodes[k]).filter((x): x is NodeInfo => x !== undefined && this.#visible(x)).map((x) => x.node.label);
    if (labels.length <= limit) return listFormat(labels, m.config.locale);
    return this.message('netMore', { list: labels.slice(0, limit).join(', '), count: String(labels.length - limit) });
  }

  #label(n: NodeInfo): string {
    const count = this.#connections(n);
    const params = { label: n.node.label, group: n.group.label, connections: chartPlural('connectionCount', count, this.model.config.locale) };
    return count > 0 ? this.message('netNodeNeighbors', { ...params, neighbors: this.#neighborText(n, 5) }) : this.message('netNode', params);
  }

  protected apply(): void {
    const o = this.options;
    const m = this.model;
    this.configureFrame('roleNetwork', 'columns-horizontal', false);
    this.frame.setText(o.label, o.hideLabel === true, o.description, o.summary ?? this.#summaryText());
    const items: LegendItem[] = m.groups.map((g) => ({ id: g.id, label: g.label, slot: g.slot, shapeSlot: g.position + 1, swatch: 'line', visible: !this.hidden.has(g.id), seriesStyle: { marker: shapeMarker(g.shape), ...(g.colorValue === undefined ? {} : { color: g.colorValue }) } }));
    this.frame.setLegend(items, m.config.legend === 'show' || (m.config.legend === 'auto' && items.length > 1), true);
    this.frame.setTable(m.config.dataTable, () => this.#tableData());
    this.frame.setEmpty(m.empty);
    this.frame.render();
  }

  #summaryText(): string {
    const o = this.options;
    const m = this.model;
    const locale = m.config.locale;
    const parts = [this.message('netIntro', { type: this.message('roleNetwork'), nodes: chartPlural('nodeCount', o.nodes.length, locale), edges: chartPlural('edgeCount', o.edges.length, locale), groups: chartPlural('groupCount', m.groups.length, locale) })];
    let hub: NodeInfo | undefined;
    for (const n of m.nodes) if (!hub || n.neighbors.length > hub.neighbors.length) hub = n;
    if (hub && hub.neighbors.length > 0) parts.push(this.message('netHub', { label: hub.node.label, connections: chartPlural('connectionCount', hub.neighbors.length, locale) }));
    const isolated = m.nodes.filter((n) => n.neighbors.length === 0).map((n) => n.node.label);
    if (isolated.length) parts.push(this.message('netIsolated', { list: listFormat(isolated.slice(0, 10), locale) }));
    const hidden = m.groups.filter((g) => this.hidden.has(g.id)).map((g) => g.label);
    if (hidden.length) parts.push(this.message('hidden', { list: listFormat(hidden, locale) }));
    return parts.join(' ');
  }

  #tableData(): TableData {
    const o = this.options;
    const m = this.model;
    const nf = new Intl.NumberFormat(m.config.locale);
    return {
      caption: o.label,
      columns: [this.message('netNodeColumn'), this.message('netGroup'), this.message('netConnections'), this.message('netNeighbors')],
      numeric: [false, false, true, false],
      rows: m.nodes.filter((n) => this.#visible(n)).map((n) => {
        const weights = new Map<number, number>();
        for (const k of n.edges) {
          const e = o.edges[k];
          const pair = m.pairs[k];
          if (!e || !pair) continue;
          const other = pair[0] === n.index ? pair[1] : pair[0];
          weights.set(other, (weights.get(other) ?? 0) + (e.weight ?? 1));
        }
        const list = [...weights].filter(([k]) => {
          const x = m.nodes[k];
          return x ? this.#visible(x) : false;
        }).map(([k, w]) => {
          const label = m.nodes[k]?.node.label ?? '';
          return w === 1 ? label : this.message('netWeight', { label, weight: nf.format(w) });
        });
        return [n.node.label, n.group.label, nf.format(this.#connections(n)), listFormat(list, m.config.locale)];
      }),
    };
  }

  protected draw(width: number, height: number): void {
    const o = this.options;
    const m = this.model;
    const frame = this.frame;
    const doc = frame.doc;
    const layer = frame.layer;
    this.#nodeEls = new Map();
    this.#labelEls = new Map();
    this.#edgeEls = new Map();
    this.#lit = [];
    if (m.empty !== null) return;
    const px = fontSize(frame.svg);
    const edge = 16;
    this.#plot = { left: edge, right: width - edge, top: edge, bottom: height - edge };
    frame.setPlot(this.#plot);
    this.#view = this.#computeView();
    const edges = svgElement(doc, 'g', {}, 'aui-network-graph__edges');
    edges.setAttribute('aria-hidden', 'true');
    const maxWeight = Math.max(1, ...o.edges.map((e) => e.weight ?? 1));
    o.edges.forEach((e, k) => {
      const [s, t] = m.pairs[k] ?? [0, 0];
      const sn = m.nodes[s];
      const tn = m.nodes[t];
      if (!sn || !tn || !this.#visible(sn) || !this.#visible(tn)) return;
      const line = svgElement(doc, 'line', {}, 'aui-network-graph__edge');
      line.style.setProperty('stroke-width', `${fmt(1 + 2.5 * ((e.weight ?? 1) / maxWeight))}px`);
      const parts: SVGElement[] = [line];
      if (o.directed) parts.push(svgElement(doc, 'path', {}, 'aui-network-graph__arrow'));
      edges.append(...parts);
      this.#edgeEls.set(k, parts);
    });
    const nodes = svgElement(doc, 'g', {}, 'aui-network-graph__nodes');
    const labels = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-network-graph__labels');
    const visibleCount = m.nodes.filter((n) => this.#visible(n)).length;
    const showLabels = m.config.nodeLabels === 'always' || (m.config.nodeLabels === 'auto' && visibleCount <= 50);
    const marks: FrameMark[] = [];
    for (const n of m.nodes) {
      if (!this.#visible(n)) continue;
      const g = svgElement(doc, 'g', {}, `aui-network-graph__node-group aui-chart__series--c${String(n.group.slot)}`);
      if (n.group.colorValue !== undefined) applySeriesStyle(g, { color: n.group.colorValue });
      const pinnedClass = this.#pins.has(n.node.id) ? ' aui-network-graph__node--pinned' : '';
      const path = svgElement(doc, 'path', {}, `aui-network-graph__node${pinnedClass}`);
      ChartFrame.markElement(path, this.#label(n));
      g.append(path);
      nodes.append(g);
      this.#nodeEls.set(n.index, path);
      if (showLabels) {
        const label = svgElement(doc, 'text', { 'dominant-baseline': 'middle' }, 'aui-network-graph__label');
        label.textContent = truncateText(n.node.label, 140, px);
        labels.append(label);
        this.#labelEls.set(n.index, label);
      }
      const at = this.#screen(n.index);
      marks.push({ element: path, row: 0, column: n.index, key: n.node.id, x: at.x, y: at.y - n.radius });
    }
    layer.append(edges, nodes, labels);
    this.#reposition();
    frame.setMarks(marks);
  }

  /** Write positions into the existing elements (animation frames and drags). */
  #reposition(): void {
    const o = this.options;
    const m = this.model;
    this.#view = this.#computeView();
    const rtl = m.config.direction === 'rtl';
    for (const [i, el] of this.#nodeEls) {
      const n = m.nodes[i];
      if (!n) continue;
      const p = this.#screen(i);
      el.setAttribute('d', markerPath(n.group.shape, p.x, p.y, n.radius));
      const label = this.#labelEls.get(i);
      if (label) {
        label.setAttribute('x', fmt(rtl ? p.x - n.radius - 4 : p.x + n.radius + 4));
        label.setAttribute('y', fmt(p.y));
        label.setAttribute('text-anchor', rtl ? 'end' : 'start');
      }
    }
    for (const [k, parts] of this.#edgeEls) {
      const [s, t] = m.pairs[k] ?? [0, 0];
      const a = this.#screen(s);
      const b = this.#screen(t);
      const [line, arrow] = parts;
      line?.setAttribute('x1', fmt(a.x));
      line?.setAttribute('y1', fmt(a.y));
      line?.setAttribute('x2', fmt(b.x));
      line?.setAttribute('y2', fmt(b.y));
      if (arrow && o.directed) {
        const r = (m.nodes[t]?.radius ?? 6) + 2;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const tipX = b.x - ux * r;
        const tipY = b.y - uy * r;
        const size = 7;
        arrow.setAttribute('d', `M${fmt(tipX)} ${fmt(tipY)}L${fmt(tipX - ux * size - uy * size * 0.5)} ${fmt(tipY - uy * size + ux * size * 0.5)}L${fmt(tipX - ux * size + uy * size * 0.5)} ${fmt(tipY - uy * size - ux * size * 0.5)}Z`);
      }
    }
  }

  #moveNode(i: number, x: number, y: number): void {
    this.#x[i] = x;
    this.#y[i] = y;
    const id = this.#ids[i];
    if (id !== undefined) this.#pins.set(id, { x, y });
    this.#reposition();
  }

  #pinned(i: number, source: NetworkGraphNodePinDetail['source']): void {
    const id = this.#ids[i];
    const n = id === undefined ? undefined : this.model.byId.get(id);
    if (id === undefined || !n) return;
    this.frame.render();
    announce(this.message('netPinned', { label: n.node.label }));
    const detail: NetworkGraphNodePinDetail = { id, pinned: true, x: this.#x[i] ?? 0, y: this.#y[i] ?? 0, pins: this.pins, source };
    emit(this.host, 'aui-node-pin', detail);
  }

  #neighborhood(i: number): SVGElement[] {
    const n = this.model.nodes[i];
    if (!n) return [];
    const out: SVGElement[] = [];
    const self = this.#nodeEls.get(i);
    if (self) out.push(self);
    for (const k of n.neighbors) {
      const el = this.#nodeEls.get(k);
      if (el) out.push(el);
    }
    for (const k of n.edges) out.push(...(this.#edgeEls.get(k) ?? []));
    return out;
  }

  #light(elements: readonly SVGElement[]): void {
    for (const el of this.#lit) el.classList.remove('aui-network-graph__lit');
    for (const el of elements) el.classList.add('aui-network-graph__lit');
    this.#lit = elements;
    this.host.classList.toggle('aui-network-graph--lit', elements.length > 0);
  }

  protected hover(x: number, y: number): HoverResult | null {
    const m = this.model;
    let best: number | null = null;
    let distance = Infinity;
    for (const [i] of this.#nodeEls) {
      const n = m.nodes[i];
      if (!n) continue;
      const p = this.#screen(i);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= n.radius + 4 && d < distance) {
        distance = d;
        best = i;
      }
    }
    const mark = best === null ? undefined : this.frame.marks.find((mk) => mk.column === best);
    if (best === null || !mark) {
      this.#light(this.#focusLit);
      return null;
    }
    this.#light(this.#neighborhood(best));
    const p = this.#screen(best);
    const el = this.#nodeEls.get(best);
    return { content: this.tooltip(mark), x: p.x, y: p.y - (m.nodes[best]?.radius ?? 6), highlight: el ? [el] : [] };
  }

  protected tooltip(mark: FrameMark): TooltipContent {
    const n = this.model.nodes[mark.column];
    if (!n) return { title: '', rows: [] };
    const locale = this.model.config.locale;
    const style = { marker: shapeMarker(n.group.shape), ...(n.group.colorValue === undefined ? {} : { color: n.group.colorValue }) };
    const count = this.#connections(n);
    return {
      title: n.node.label,
      rows: [
        { slot: n.group.slot, shapeSlot: n.group.position + 1, swatch: 'line', label: this.message('netGroup'), value: n.group.label, seriesId: n.node.id, seriesStyle: style },
        { slot: 1, shapeSlot: 1, swatch: 'none', label: this.message('netConnections'), value: new Intl.NumberFormat(locale).format(count) },
        ...(count > 0 ? [{ slot: 1, shapeSlot: 1, swatch: 'none' as const, label: this.message('netNeighbors'), value: this.#neighborText(n, 4) }] : []),
      ],
    };
  }

  protected override pointDetail(mark: FrameMark): Pick<ChartPointClickDetail, 'seriesId' | 'series' | 'value'> | null {
    const n = this.model.nodes[mark.column];
    return n ? { seriesId: n.node.id, series: n.group.label, value: String(this.#connections(n)) } : null;
  }

  /** Neighbor navigation, data-order stepping, pinning, and zoom keys. */
  protected override key(event: KeyboardEvent, mark: FrameMark): boolean {
    const m = this.model;
    const n = m.nodes[mark.column];
    if (!n) return false;
    const p = this.#screen(n.index);
    if (this.#zoom.key(event, { x: this.#normX(p.x), y: this.#normY(p.y) })) return true;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const arrows: Readonly<Record<string, readonly [number, number]>> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    const dir = arrows[event.key];
    if (dir && event.shiftKey) {
      // Move and pin (the keyboard alternative to dragging, WCAG 2.5.7).
      const step = 10 / this.#view.scale;
      this.#moveNode(n.index, (this.#x[n.index] ?? 0) + dir[0] * step, (this.#y[n.index] ?? 0) + dir[1] * step);
      this.#pinned(n.index, 'keyboard');
      return true;
    }
    if (event.key === 'u' || event.key === 'U') {
      if (!this.#pins.delete(n.node.id)) return true;
      this.frame.render();
      announce(this.message('netUnpinned', { label: n.node.label }));
      const detail: NetworkGraphNodePinDetail = { id: n.node.id, pinned: false, x: this.#x[n.index] ?? 0, y: this.#y[n.index] ?? 0, pins: this.pins, source: 'keyboard' };
      emit(this.host, 'aui-node-pin', detail);
      return true;
    }
    const order = m.nodes.filter((x) => this.#visible(x)).map((x) => x.index);
    const at = order.indexOf(n.index);
    let target: number | undefined;
    if (dir) {
      // The connected node closest to the arrow's direction (within 60 degrees).
      let best = Infinity;
      for (const k of n.neighbors) {
        const other = m.nodes[k];
        if (!other || !this.#visible(other)) continue;
        const q = this.#screen(k);
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1e-6;
        const cos = (dx * dir[0] + dy * dir[1]) / len;
        if (cos < 0.5) continue;
        const score = len * (2 - cos);
        if (score < best) {
          best = score;
          target = k;
        }
      }
    } else {
      switch (event.key) {
        case 'PageDown': target = order[at + 1]; break;
        case 'PageUp': target = order[at - 1]; break;
        case 'Home': target = order[0]; break;
        case 'End': target = order.at(-1); break;
        default: return false;
      }
    }
    if (target !== undefined) this.frame.focusMark(this.#nodeEls.get(target));
    return true;
  }
}

function shapeMarker(shape: MarkerShape): 'circle' | 'square' | 'diamond' | 'triangle' | 'auto' {
  return shape === 'circle' || shape === 'square' || shape === 'diamond' || shape === 'triangle' ? shape : 'auto';
}
