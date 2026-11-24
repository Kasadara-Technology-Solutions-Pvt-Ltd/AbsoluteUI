/**
 * Diagram model types, validation, and copies. The model is plain JSON: nodes,
 * edges, and optional groups. Validation runs before anything is rendered.
 */
import { configurationError, validators } from '@absoluteui/core';
import { ARROWS, ROUTINGS, SHAPES, SIDES, type DiagramArrow, type DiagramPortSide, type DiagramRouting, type DiagramShape } from './geometry.js';

/** Application data carried by nodes and edges (JSON primitives only). */
export type DiagramData = Readonly<Record<string, string | number | boolean | null>>;

export interface DiagramPort {
  /** Unique within the node. */
  id: string;
  side: DiagramPortSide;
  /** 0..1 along the side (left to right, top to bottom). Default 0.5. */
  offset?: number;
}

export interface DiagramNode {
  /** Unique node id. */
  id: string;
  /** Visible text (plain text) and accessible name. */
  label: string;
  /** Default `rounded`. `custom` draws what `renderShape` returns. */
  shape?: DiagramShape;
  /** Top-left corner in diagram px. Missing positions are filled by auto-layout. */
  x?: number;
  y?: number;
  /** Size in diagram px (16..2000). Defaults: `nodeWidth`, `nodeHeight`. */
  width?: number;
  height?: number;
  /** Connection points. Default: one in the middle of each side (ids top, right, bottom, left). */
  ports?: DiagramPort[];
  /** Group id. */
  group?: string;
  /** Auto-layout with `keepPositions` keeps this node where it is. */
  pinned?: boolean;
  /** Edit mode: the node cannot be moved, relabelled, or deleted. */
  locked?: boolean;
  data?: DiagramData;
}

export interface DiagramEdge {
  /** Unique edge id. */
  id: string;
  /** Source node id. */
  from: string;
  /** Target node id. */
  to: string;
  /** Port ids; without one the routing picks the side facing the other node. */
  fromPort?: string;
  toPort?: string;
  /** Plain-text label drawn at the middle of the edge. */
  label?: string;
  /** Default: the `routing` option. */
  routing?: DiagramRouting;
  /** Default `none` at the start, `arrow` at the end. */
  arrowStart?: DiagramArrow;
  arrowEnd?: DiagramArrow;
  dashed?: boolean;
  data?: DiagramData;
}

export interface DiagramGroup {
  id: string;
  /** Visible group title. */
  label: string;
}

export interface DiagramModel {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups?: DiagramGroup[];
}

export function fail(property: string, expected: string): never {
  throw configurationError('DIAGRAM_OPTIONS', 'Invalid diagram options.', { component: 'diagram', property: `diagram.${property}`, expected });
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function assertData(v: unknown, at: string): void {
  if (v === undefined) return;
  if (!validators.isRecord(v)) fail(at, 'object of string, number, boolean, or null values');
  for (const [k, value] of Object.entries(v)) {
    if (!(value === null || typeof value === 'string' || typeof value === 'boolean' || finite(value))) fail(`${at}.${k}`, 'string, finite number, boolean, or null');
  }
}

/** Ports of a node (its own or the default four). */
export function portIds(node: Readonly<DiagramNode>): string[] {
  return node.ports ? node.ports.map((p) => p.id) : [...SIDES];
}

/** Validate a whole model (unique ids, known references, value ranges). */
export function assertModel(model: unknown, at = 'model'): asserts model is DiagramModel {
  if (!validators.isRecord(model)) fail(at, 'DiagramModel { nodes, edges, groups? }');
  const { nodes, edges, groups } = model;
  if (!Array.isArray(nodes)) fail(`${at}.nodes`, 'DiagramNode[]');
  if (!Array.isArray(edges)) fail(`${at}.edges`, 'DiagramEdge[]');
  const groupIds = new Set<string>();
  if (groups !== undefined) {
    if (!Array.isArray(groups)) fail(`${at}.groups`, 'DiagramGroup[]');
    (groups as unknown[]).forEach((g, i) => {
      const p = `${at}.groups[${String(i)}]`;
      if (!validators.isRecord(g)) fail(p, 'DiagramGroup');
      if (typeof g.id !== 'string' || g.id === '' || groupIds.has(g.id)) fail(`${p}.id`, 'unique non-empty string');
      groupIds.add(g.id);
      if (typeof g.label !== 'string') fail(`${p}.label`, 'string');
    });
  }
  const nodeMap = new Map<string, DiagramNode>();
  (nodes as unknown[]).forEach((n, i) => {
    const p = `${at}.nodes[${String(i)}]`;
    if (!validators.isRecord(n)) fail(p, 'DiagramNode');
    if (typeof n.id !== 'string' || n.id === '' || nodeMap.has(n.id)) fail(`${p}.id`, 'unique non-empty string');
    if (typeof n.label !== 'string') fail(`${p}.label`, 'string');
    if (n.shape !== undefined && !(SHAPES as readonly unknown[]).includes(n.shape)) fail(`${p}.shape`, SHAPES.map((s) => `"${s}"`).join(' | '));
    for (const key of ['x', 'y'] as const) if (n[key] !== undefined && !finite(n[key])) fail(`${p}.${key}`, 'finite number');
    for (const key of ['width', 'height'] as const) {
      const v = n[key];
      if (v !== undefined && !(finite(v) && v >= 16 && v <= 2000)) fail(`${p}.${key}`, 'number from 16 to 2000');
    }
    if ((n.x === undefined) !== (n.y === undefined)) fail(`${p}.x`, 'x and y together');
    if (n.ports !== undefined) {
      if (!Array.isArray(n.ports) || n.ports.length === 0) fail(`${p}.ports`, 'non-empty DiagramPort[]');
      const seen = new Set<string>();
      (n.ports as unknown[]).forEach((port, j) => {
        const pp = `${p}.ports[${String(j)}]`;
        if (!validators.isRecord(port)) fail(pp, 'DiagramPort');
        if (typeof port.id !== 'string' || port.id === '' || seen.has(port.id)) fail(`${pp}.id`, 'unique non-empty string');
        seen.add(port.id);
        if (!(SIDES as readonly unknown[]).includes(port.side)) fail(`${pp}.side`, '"top" | "right" | "bottom" | "left"');
        if (port.offset !== undefined && !(finite(port.offset) && port.offset >= 0 && port.offset <= 1)) fail(`${pp}.offset`, 'number from 0 to 1');
      });
    }
    if (n.group !== undefined && !(typeof n.group === 'string' && groupIds.has(n.group))) fail(`${p}.group`, 'the id of a group');
    for (const key of ['pinned', 'locked'] as const) if (n[key] !== undefined && typeof n[key] !== 'boolean') fail(`${p}.${key}`, 'boolean');
    assertData(n.data, `${p}.data`);
    nodeMap.set(n.id, n as unknown as DiagramNode);
  });
  const edgeIds = new Set<string>();
  (edges as unknown[]).forEach((e, i) => {
    const p = `${at}.edges[${String(i)}]`;
    if (!validators.isRecord(e)) fail(p, 'DiagramEdge');
    if (typeof e.id !== 'string' || e.id === '' || edgeIds.has(e.id)) fail(`${p}.id`, 'unique non-empty string');
    edgeIds.add(e.id);
    for (const [end, portKey] of [['from', 'fromPort'], ['to', 'toPort']] as const) {
      const id = e[end];
      const node = typeof id === 'string' ? nodeMap.get(id) : undefined;
      if (!node) fail(`${p}.${end}`, 'the id of a node');
      const port = e[portKey];
      if (port !== undefined && !(typeof port === 'string' && portIds(node).includes(port))) fail(`${p}.${portKey}`, `a port of node "${node.id}"`);
    }
    if (e.label !== undefined && typeof e.label !== 'string') fail(`${p}.label`, 'string');
    if (e.routing !== undefined && !(ROUTINGS as readonly unknown[]).includes(e.routing)) fail(`${p}.routing`, '"straight" | "orthogonal" | "curved"');
    for (const key of ['arrowStart', 'arrowEnd'] as const) if (e[key] !== undefined && !(ARROWS as readonly unknown[]).includes(e[key])) fail(`${p}.${key}`, ARROWS.map((s) => `"${s}"`).join(' | '));
    if (e.dashed !== undefined && typeof e.dashed !== 'boolean') fail(`${p}.dashed`, 'boolean');
    assertData(e.data, `${p}.data`);
  });
}

export function copyNode(n: Readonly<DiagramNode>): DiagramNode {
  const out: DiagramNode = { id: n.id, label: n.label };
  if (n.shape !== undefined) out.shape = n.shape;
  if (n.x !== undefined) out.x = n.x;
  if (n.y !== undefined) out.y = n.y;
  if (n.width !== undefined) out.width = n.width;
  if (n.height !== undefined) out.height = n.height;
  if (n.ports !== undefined) out.ports = n.ports.map((p) => (p.offset === undefined ? { id: p.id, side: p.side } : { id: p.id, side: p.side, offset: p.offset }));
  if (n.group !== undefined) out.group = n.group;
  if (n.pinned !== undefined) out.pinned = n.pinned;
  if (n.locked !== undefined) out.locked = n.locked;
  if (n.data !== undefined) out.data = { ...n.data };
  return out;
}

export function copyEdge(e: Readonly<DiagramEdge>): DiagramEdge {
  const out: DiagramEdge = { id: e.id, from: e.from, to: e.to };
  if (e.fromPort !== undefined) out.fromPort = e.fromPort;
  if (e.toPort !== undefined) out.toPort = e.toPort;
  if (e.label !== undefined) out.label = e.label;
  if (e.routing !== undefined) out.routing = e.routing;
  if (e.arrowStart !== undefined) out.arrowStart = e.arrowStart;
  if (e.arrowEnd !== undefined) out.arrowEnd = e.arrowEnd;
  if (e.dashed !== undefined) out.dashed = e.dashed;
  if (e.data !== undefined) out.data = { ...e.data };
  return out;
}

export const copyGroup = (g: Readonly<DiagramGroup>): DiagramGroup => ({ id: g.id, label: g.label });
