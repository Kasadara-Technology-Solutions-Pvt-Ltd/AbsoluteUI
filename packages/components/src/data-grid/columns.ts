/**
 * Column layout (pure): resolves the column tree and the user's column state into the
 * visible leaf columns of the three sections (pinned start, center, pinned end), their
 * pixel widths and offsets, and the header rows with group spans.
 */
import { isArray, isFunction, isObjectLike } from '../data-table/model.js';
import { fail, isGroup, type DataGridColumn, type DataGridColumnDef, type DataGridColumnGroup, type DataGridPinned } from './model.js';

// Validation helpers take `unknown`: option values come from untrusted callers despite their declared types.
const isText = (v: unknown): boolean => typeof v === 'string';
const isNonEmptyText = (v: unknown): boolean => typeof v === 'string' && v !== '';
const oneOf = (v: unknown, values: readonly unknown[]): boolean => values.includes(v);

export const DEFAULT_WIDTH = 160;
export const DEFAULT_MIN_WIDTH = 48;
export const DEFAULT_MAX_WIDTH = 2000;

export type Section = 'start' | 'center' | 'end';

export interface Leaf<Row> {
  readonly def: DataGridColumn<Row>;
  readonly id: string;
  /** Ancestor groups, outermost first. */
  readonly path: readonly DataGridColumnGroup<Row>[];
  /** Position in definition order. */
  readonly index: number;
}

export interface PlacedColumn<Row> {
  readonly leaf: Leaf<Row>;
  readonly section: Section;
  readonly width: number;
  /** Offset from the start of its section. */
  readonly x: number;
  /** 1-based position among all visible columns (aria-colindex). */
  readonly colIndex: number;
}

export type HeaderCell<Row> =
  | { readonly kind: 'group'; readonly group: DataGridColumnGroup<Row>; readonly columns: readonly PlacedColumn<Row>[]; readonly x: number; readonly width: number }
  | { readonly kind: 'leaf'; readonly column: PlacedColumn<Row>; readonly rowSpan: number }
  | { readonly kind: 'filler'; readonly column: PlacedColumn<Row> };

export interface ColumnState {
  /** Leaf ids in display order (unknown ids ignored; missing leaves keep definition order). */
  readonly order?: readonly string[];
  readonly widths?: Readonly<Record<string, number>>;
  readonly pinned?: Readonly<Record<string, DataGridPinned | null>>;
  readonly hidden?: Readonly<Record<string, boolean>>;
  /** Collapsible groups by id. */
  readonly collapsed?: Readonly<Record<string, boolean>>;
}

export interface ColumnLayout<Row> {
  readonly leaves: readonly Leaf<Row>[];
  readonly groups: ReadonlyMap<string, DataGridColumnGroup<Row>>;
  readonly start: readonly PlacedColumn<Row>[];
  readonly center: readonly PlacedColumn<Row>[];
  readonly end: readonly PlacedColumn<Row>[];
  /** Every visible column in display order (start, center, end). */
  readonly visible: readonly PlacedColumn<Row>[];
  readonly startWidth: number;
  readonly centerWidth: number;
  readonly endWidth: number;
  /** Number of header rows (the deepest column path plus one). */
  readonly levels: number;
  /** Header cells per level (0 = top) and section. */
  readonly header: readonly Readonly<Record<Section, readonly HeaderCell<Row>[]>>[];
}

/** Flatten and validate the column tree. */
export function resolveColumns<Row>(defs: readonly DataGridColumnDef<Row>[]): { leaves: Leaf<Row>[]; groups: Map<string, DataGridColumnGroup<Row>> } {
  const leaves: Leaf<Row>[] = [];
  const groups = new Map<string, DataGridColumnGroup<Row>>();
  const ids = new Set<string>();
  const walk = (list: readonly DataGridColumnDef<Row>[], path: DataGridColumnGroup<Row>[], prop: string): void => {
    if (!isArray(list)) fail(prop, 'array of columns and column groups');
    list.forEach((def, i) => {
      const at = `${prop}[${String(i)}]`;
      if (!isObjectLike(def)) fail(at, 'column or column group object');
      if (!isNonEmptyText(def.id)) fail(`${at}.id`, 'non-empty string');
      if (ids.has(def.id)) fail(`${at}.id`, 'id unique among columns and column groups');
      ids.add(def.id);
      if (!isText(def.header)) fail(`${at}.header`, 'string');
      if (isGroup(def)) {
        groups.set(def.id, def);
        walk(def.children, [...path, def], `${at}.children`);
      } else {
        validateColumn(def, at);
        leaves.push({ def, id: def.id, path, index: leaves.length });
      }
    });
  };
  walk(defs, [], 'columns');
  if (leaves.length === 0) fail('columns', 'at least one column');
  return { leaves, groups };
}

const TYPES = new Set(['text', 'number', 'currency', 'date', 'datetime', 'boolean']);
const positive = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v > 0;

function validateColumn<Row>(c: DataGridColumn<Row>, at: string): void {
  if (c.accessor !== undefined && !isFunction(c.accessor)) fail(`${at}.accessor`, 'function');
  if (c.field !== undefined && !isText(c.field)) fail(`${at}.field`, 'string');
  if (c.type !== undefined && !TYPES.has(c.type)) fail(`${at}.type`, '"text" | "number" | "currency" | "date" | "datetime" | "boolean"');
  if (c.type === 'currency' && (typeof c.currency !== 'string' || !/^[A-Z]{3}$/.test(c.currency))) fail(`${at}.currency`, 'ISO 4217 code such as "EUR"');
  for (const key of ['width', 'minWidth', 'maxWidth', 'flex'] as const) if (c[key] !== undefined && !positive(c[key])) fail(`${at}.${key}`, 'positive number');
  if (c.pinned !== undefined && !oneOf(c.pinned, ['start', 'end', null])) fail(`${at}.pinned`, '"start" | "end" | null');
  if (c.lockPosition !== undefined && !oneOf(c.lockPosition, ['start', 'end'])) fail(`${at}.lockPosition`, '"start" | "end"');
  if (c.visibleWhen !== undefined && !oneOf(c.visibleWhen, ['expanded', 'collapsed'])) fail(`${at}.visibleWhen`, '"expanded" | "collapsed"');
  for (const key of ['format', 'render', 'compare', 'cellClass'] as const) if (c[key] !== undefined && !isFunction(c[key])) fail(`${at}.${key}`, 'function');
  if (c.flashOnChange !== undefined && typeof c.flashOnChange !== 'boolean') fail(`${at}.flashOnChange`, 'boolean');
  if (c.spanRows !== undefined && typeof c.spanRows !== 'boolean' && !isFunction(c.spanRows)) fail(`${at}.spanRows`, 'boolean or function (a, b) => boolean');
  if (c.colSpan !== undefined && !isFunction(c.colSpan)) fail(`${at}.colSpan`, 'function (row) => number');
  if (c.rowDrag !== undefined && typeof c.rowDrag !== 'boolean') fail(`${at}.rowDrag`, 'boolean');
  if (c.exportable !== undefined && typeof c.exportable !== 'boolean') fail(`${at}.exportable`, 'boolean');
  if (c.formula !== undefined && (typeof c.formula !== 'string' || c.formula.trim() === '' || c.formula.length > 8192)) fail(`${at}.formula`, 'formula text (1 to 8192 characters)');
  if (c.formulas !== undefined && typeof c.formulas !== 'boolean') fail(`${at}.formulas`, 'boolean');
  if (c.formulas === true && c.formula !== undefined) fail(`${at}.formulas`, 'not with formula (a calculated column)');
  if (c.excel !== undefined) {
    const x: unknown = c.excel;
    const e = isObjectLike(x) ? (x as Partial<Record<keyof NonNullable<DataGridColumn<Row>['excel']>, unknown>>) : null;
    const fns = e ? [e.cellStyle, e.formula, e.link, e.image].every((v) => v === undefined || isFunction(v)) : false;
    const texts = e ? [e.style, e.numberFormat].every((v) => v === undefined || (typeof v === 'string' && v.length <= 255)) : false;
    if (!e || !fns || !texts || (e.width !== undefined && !(typeof e.width === 'number' && e.width > 0 && e.width <= 255))) fail(`${at}.excel`, '{ style?, cellStyle?, numberFormat?, formula?, link?, image?, width? (1 to 255) }');
  }
  if (c.tooltip !== undefined && c.tooltip !== true && typeof c.tooltip !== 'string' && !isFunction(c.tooltip)) fail(`${at}.tooltip`, 'true, a string, or a function (value, row) => string');
  if (c.filter !== undefined && !oneOf(c.filter, ['text', 'number', 'bigint', 'date', 'boolean', 'set'])) fail(`${at}.filter`, '"text" | "number" | "bigint" | "date" | "boolean" | "set"');
  if (c.filterValue !== undefined && !isFunction(c.filterValue)) fail(`${at}.filterValue`, 'function');
  for (const key of ['filterCaseSensitive', 'filterAccentSensitive', 'searchable'] as const) if (c[key] !== undefined && typeof c[key] !== 'boolean') fail(`${at}.${key}`, 'boolean');
  if (c.filterValues !== undefined && !(isArray(c.filterValues) && c.filterValues.every((v) => typeof v === 'string'))) fail(`${at}.filterValues`, 'array of strings');
  if (c.businessCalendar !== undefined && !(isObjectLike(c.businessCalendar) && 'isWorkingDay' in c.businessCalendar)) fail(`${at}.businessCalendar`, 'business calendar (createBusinessCalendar)');
  if (c.cellClassRules !== undefined && !(isObjectLike(c.cellClassRules) && Object.entries(c.cellClassRules).every(([k, v]) => /^[A-Za-z_-][\w-]*$/.test(k) && isFunction(v)))) fail(`${at}.cellClassRules`, 'object of class name to predicate');
}

export function widthBounds<Row>(def: DataGridColumn<Row>): { min: number; max: number } {
  const min = def.minWidth ?? DEFAULT_MIN_WIDTH;
  return { min, max: Math.max(min, def.maxWidth ?? DEFAULT_MAX_WIDTH) };
}

export const clampWidth = <Row>(def: DataGridColumn<Row>, px: number): number => {
  const { min, max } = widthBounds(def);
  return Math.round(Math.min(max, Math.max(min, px)));
};

/** Display order: user order where given, groups kept contiguous (a group sits where its first member sits). */
function orderLeaves<Row>(leaves: readonly Leaf<Row>[], order: readonly string[] | undefined): Leaf<Row>[] {
  if (!order || order.length === 0) return [...leaves];
  const rank = new Map<string, number>();
  order.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i);
  });
  // Leaves not in the order keep their definition position, after ranked ones of the same container.
  const key = (leaf: Leaf<Row>): number => rank.get(leaf.id) ?? order.length + leaf.index;
  interface Node {
    readonly id: string;
    readonly leaf?: Leaf<Row>;
    readonly children: Node[];
    min: number;
  }
  const root: Node = { id: '', children: [], min: 0 };
  const nodes = new Map<string, Node>();
  for (const leaf of leaves) {
    let parent = root;
    for (const g of leaf.path) {
      let n = nodes.get(g.id);
      if (!n) {
        n = { id: g.id, children: [], min: Number.POSITIVE_INFINITY };
        nodes.set(g.id, n);
        parent.children.push(n);
      }
      parent = n;
    }
    parent.children.push({ id: leaf.id, leaf, children: [], min: key(leaf) });
  }
  const settle = (n: Node): number => {
    if (n.leaf) return n.min;
    n.min = Math.min(...n.children.map(settle));
    n.children.sort((a, b) => a.min - b.min);
    return n.min;
  };
  settle(root);
  const out: Leaf<Row>[] = [];
  const emit = (n: Node): void => {
    if (n.leaf) out.push(n.leaf);
    else n.children.forEach(emit);
  };
  emit(root);
  return out;
}

function isVisible<Row>(leaf: Leaf<Row>, state: ColumnState): boolean {
  if (state.hidden?.[leaf.id] ?? leaf.def.hidden ?? false) return false;
  const when = leaf.def.visibleWhen;
  if (!when) return true;
  // The innermost collapsible ancestor decides.
  for (let i = leaf.path.length - 1; i >= 0; i--) {
    const g = leaf.path[i];
    if (g?.collapsible) {
      const collapsed = state.collapsed?.[g.id] ?? g.collapsed ?? false;
      return when === 'collapsed' ? collapsed : !collapsed;
    }
  }
  return true;
}

/** Distribute `available` pixels over flex columns, honouring min/max. */
function flexWidths<Row>(flexLeaves: readonly Leaf<Row>[], available: number): Map<string, number> {
  const out = new Map<string, number>();
  let pool = [...flexLeaves];
  let space = available;
  for (let guard = 0; pool.length > 0 && guard < flexLeaves.length + 1; guard++) {
    const total = pool.reduce((s, l) => s + (l.def.flex ?? 0), 0);
    let clamped = false;
    for (const leaf of pool) {
      const raw = (space * (leaf.def.flex ?? 0)) / total;
      const { min, max } = widthBounds(leaf.def);
      if (raw < min || raw > max) {
        const w = raw < min ? min : max;
        out.set(leaf.id, w);
        space -= w;
        clamped = true;
      }
    }
    if (!clamped) {
      for (const leaf of pool) out.set(leaf.id, Math.max(widthBounds(leaf.def).min, Math.floor((space * (leaf.def.flex ?? 0)) / total)));
      break;
    }
    pool = pool.filter((l) => !out.has(l.id));
  }
  return out;
}

/** Lay out columns for a viewport `viewportWidth` pixels wide (0 when unknown). */
export function layoutColumns<Row>(leaves: readonly Leaf<Row>[], groups: ReadonlyMap<string, DataGridColumnGroup<Row>>, state: ColumnState, viewportWidth: number): ColumnLayout<Row> {
  const ordered = orderLeaves(leaves, state.order).filter((l) => isVisible(l, state));
  const pinnedOf = (l: Leaf<Row>): Section => {
    const p = state.pinned && l.id in state.pinned ? state.pinned[l.id] : l.def.pinned;
    return p === 'start' ? 'start' : p === 'end' ? 'end' : 'center';
  };
  const sections: Record<Section, Leaf<Row>[]> = { start: [], center: [], end: [] };
  for (const l of ordered) sections[pinnedOf(l)].push(l);
  for (const s of ['start', 'center', 'end'] as const) {
    // lockPosition keeps a column first or last in its section (stable for the rest).
    const list = sections[s];
    sections[s] = [...list.filter((l) => l.def.lockPosition === 'start'), ...list.filter((l) => !l.def.lockPosition), ...list.filter((l) => l.def.lockPosition === 'end')];
  }
  // Widths: user width, then defined width, then flex share, then the default.
  const fixed = new Map<string, number>();
  const flexing: Leaf<Row>[] = [];
  for (const l of ordered) {
    const user = state.widths?.[l.id];
    if (user !== undefined) fixed.set(l.id, clampWidth(l.def, user));
    else if (l.def.flex !== undefined && viewportWidth > 0) flexing.push(l);
    else fixed.set(l.id, clampWidth(l.def, l.def.width ?? DEFAULT_WIDTH));
  }
  const used = [...fixed.values()].reduce((s, w) => s + w, 0);
  const flexed = flexWidths(flexing, Math.max(0, viewportWidth - used));
  const widthOf = (l: Leaf<Row>): number => fixed.get(l.id) ?? flexed.get(l.id) ?? DEFAULT_WIDTH;
  let colIndex = 0;
  const place = (section: Section): PlacedColumn<Row>[] => {
    let x = 0;
    return sections[section].map((leaf) => {
      const width = widthOf(leaf);
      const placed: PlacedColumn<Row> = { leaf, section, width, x, colIndex: ++colIndex };
      x += width;
      return placed;
    });
  };
  const start = place('start');
  const center = place('center');
  const end = place('end');
  const sum = (list: readonly PlacedColumn<Row>[]): number => list.reduce((s, c) => s + c.width, 0);
  const levels = Math.max(1, ...leaves.map((l) => l.path.length + 1));
  const header: Record<Section, HeaderCell<Row>[]>[] = [];
  for (let level = 0; level < levels; level++) {
    const row: Record<Section, HeaderCell<Row>[]> = { start: [], center: [], end: [] };
    for (const [section, list] of [['start', start], ['center', center], ['end', end]] as const) {
      let i = 0;
      while (i < list.length) {
        const col = list[i];
        if (!col) break;
        const depth = col.leaf.path.length;
        if (level === depth) {
          row[section].push({ kind: 'leaf', column: col, rowSpan: levels - depth });
          i++;
        } else if (level > depth) {
          // Under the leaf header that spans down from its own depth: keeps the row's widths aligned.
          row[section].push({ kind: 'filler', column: col });
          i++;
        } else {
          const group = col.leaf.path[level];
          if (!group) {
            i++;
            continue;
          }
          // Contiguous columns of the same group in this section form one group cell (a group split by pinning gets one cell per section).
          let j = i;
          while (j < list.length && list[j]?.leaf.path[level]?.id === group.id) j++;
          const columns = list.slice(i, j);
          row[section].push({ kind: 'group', group, columns, x: col.x, width: sum(columns) });
          i = j;
        }
      }
    }
    header.push(row);
  }
  return { leaves, groups, start, center, end, visible: [...start, ...center, ...end], startWidth: sum(start), centerWidth: sum(center), endWidth: sum(end), levels, header };
}

/** Index range [first, last] of center columns that intersect [left, right) (inclusive indexes; empty when last < first). */
export function centerWindow<Row>(center: readonly PlacedColumn<Row>[], left: number, right: number): { first: number; last: number } {
  if (center.length === 0 || right <= left) return { first: 0, last: -1 };
  let lo = 0;
  let hi = center.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const c = center[mid];
    if (c && c.x + c.width <= left) lo = mid + 1;
    else hi = mid;
  }
  let last = lo;
  while (last + 1 < center.length && (center[last + 1]?.x ?? Infinity) < right) last++;
  return { first: lo, last };
}

/** All leaf ids in display order (hidden ones included), from the user order. */
export function displayOrder<Row>(leaves: readonly Leaf<Row>[], order: readonly string[] | undefined): string[] {
  return orderLeaves(leaves, order).map((l) => l.id);
}

/**
 * The movable unit containing `leafId` at the level of `parentId`: the leaf itself, or the
 * group under `parentId` that contains it. `parentId` null is the top level.
 */
export function unitAt<Row>(leaf: Leaf<Row>, parentId: string | null): string {
  if (parentId === null) return leaf.path[0]?.id ?? leaf.id;
  const i = leaf.path.findIndex((g) => g.id === parentId);
  return leaf.path[i + 1]?.id ?? leaf.id;
}

/** Parent group id of a unit (a leaf or group), or null at the top level. */
export function parentOf<Row>(leaves: readonly Leaf<Row>[], unitId: string): string | null | undefined {
  for (const leaf of leaves) {
    if (leaf.id === unitId) return leaf.path.at(-1)?.id ?? null;
    const i = leaf.path.findIndex((g) => g.id === unitId);
    if (i >= 0) return leaf.path[i - 1]?.id ?? null;
  }
  return undefined;
}

/**
 * Move a unit (leaf or group) before or after another unit with the same parent. Returns the
 * new full order, or null when the move is not allowed (different parents, or the same unit).
 */
export function moveUnit<Row>(leaves: readonly Leaf<Row>[], order: readonly string[], unitId: string, targetId: string, after: boolean): string[] | null {
  if (unitId === targetId) return null;
  const parent = parentOf(leaves, unitId);
  if (parent === undefined || parentOf(leaves, targetId) !== parent) return null;
  const byId = new Map(leaves.map((l) => [l.id, l]));
  const current = displayOrder(leaves, order);
  const inUnit = (id: string, unit: string): boolean => {
    const leaf = byId.get(id);
    return leaf !== undefined && unitAt(leaf, parent) === unit;
  };
  const moving = current.filter((id) => inUnit(id, unitId));
  const rest = current.filter((id) => !inUnit(id, unitId));
  const targetLeaves = rest.filter((id) => inUnit(id, targetId));
  const anchor = after ? targetLeaves.at(-1) : targetLeaves[0];
  if (anchor === undefined) return null;
  const at = rest.indexOf(anchor) + (after ? 1 : 0);
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

/** Sanitize a pinned value from untrusted state. */
export const pinnedValue = (v: unknown): DataGridPinned | null | undefined => (v === 'start' || v === 'end' ? v : v === null ? null : undefined);
