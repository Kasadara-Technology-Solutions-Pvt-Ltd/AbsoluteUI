/**
 * Treemap (SPEC section 18.18: Treemap). Hierarchical part-to-whole data as nested
 * rectangles laid out with the squarified algorithm (area proportional to value).
 * One level is shown at a time; tiles with children open with a click or
 * Enter/Space (drill-down), and a breadcrumb in the chart toolbar (plus Backspace)
 * goes back up. Tiles are keyboard-reachable in size order and print their label
 * and value when they fit. The data table lists the whole hierarchy. No animation.
 */
import { defineComponentConfig, emit, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { announce } from '@absoluteui/utilities';
import { fontSize, textWidth, truncateText } from '../internal/chart/axis.js';
import { FrameChart, type ChartModelBase } from '../internal/chart/base.js';
import { ChartFrame, type FrameMark, type HoverResult, type TableData, type TooltipContent } from '../internal/chart/frame.js';
import {
  assertCommon,
  chartBaseSchema,
  chartFail,
  chartPlural,
  finite,
  isChartColor,
  listFormat,
  pickDefined,
  valueFormatter,
  type ChartBaseConfig,
  type ChartColor,
  type ChartCommonOptions,
} from '../internal/chart/model.js';
import { roundedRect, svgElement } from '../internal/chart/svg.js';
import type { ChartPointClickDetail } from '../internal/chart/style.js';

export interface TreemapConfig extends ChartBaseConfig {
  /** Print label and value inside tiles that are large enough. Default true. */
  tileLabels: boolean;
}

type Resolved = Readonly<TreemapConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    treemap: TreemapConfig & { locale: string; direction: Direction };
  }
}

export const treemapConfig = defineComponentConfig<TreemapConfig, 'locale' | 'direction'>(
  'treemap',
  {
    ...chartBaseSchema,
    tileLabels: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

export interface TreemapNode {
  /** Unique across the whole tree. */
  id: string;
  label: string;
  /** Leaf value (groups default to the sum of their children). Zero, negative, and missing values are not plotted. */
  value?: number | null;
  children?: readonly TreemapNode[];
  /** Palette slot. Default: position within the shown level. */
  color?: ChartColor;
}

export interface TreemapOptions extends ChartCommonOptions, Partial<TreemapConfig> {
  /** Top-level nodes. */
  data: readonly TreemapNode[];
  /** Id of the group to show (drill-down state); null shows the top level. */
  root?: string | null;
  /** Allow opening groups. Default true. */
  drillDown?: boolean;
  /** Name of the top level in the breadcrumb. Default "All". */
  rootLabel?: string;
}

/** Detail of `aui-drill`. */
export interface TreemapDrillDetail {
  /** Id of the shown group, or null for the top level. */
  id: string | null;
  /** Ids from the top level to the shown group. */
  path: string[];
}

registerMessages('chart', 'en', {
  roleTreemap: 'treemap',
  treemapTile: '{label}: {value} ({percent})',
  treemapGroup: '{label}: {value} ({percent}), {items}',
  itemCount_one: '{count} item',
  itemCount_other: '{count} items',
  treemapIntro: '{type}, {items}, total {total}.',
  treemapLargest: 'Largest: {list}.',
  treemapShowing: 'Showing {path}.',
  treemapPath: 'Treemap path',
  treemapAll: 'All',
  treemapShare: 'Share of parent',
  treemapName: 'Name',
  pathSeparator: ' / ',
});

const COMPONENT = 'treemap';
const CODE = 'TREEMAP_OPTIONS';

interface TreeEntry {
  readonly node: TreemapNode;
  readonly value: number;
  readonly children: readonly TreeEntry[];
  readonly parent: TreeEntry | null;
  readonly depth: number;
}

interface Tile {
  readonly entry: TreeEntry;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly slot: number;
  readonly element: SVGRectElement;
}

interface Model extends ChartModelBase {
  readonly config: Resolved;
  readonly roots: readonly TreeEntry[];
  readonly byId: ReadonlyMap<string, TreeEntry>;
  readonly format: (value: number) => string;
  readonly percent: (ratio: number) => string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap layout (Bruls, Huizing, van Wijk): `values` must be positive
 * and sorted descending. Returns one rectangle per value, in input order.
 */
export function squarify(values: readonly number[], box: Readonly<Box>): Box[] {
  const total = values.reduce((s, v) => s + v, 0);
  const out: Box[] = [];
  if (total <= 0 || box.w <= 0 || box.h <= 0) return values.map(() => ({ x: box.x, y: box.y, w: 0, h: 0 }));
  const scale = (box.w * box.h) / total;
  const areas = values.map((v) => v * scale);
  const rect: Box = { ...box };
  const worst = (row: readonly number[], side: number): number => {
    const s = row.reduce((a, b) => a + b, 0);
    const max = Math.max(...row);
    const min = Math.min(...row);
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  const layout = (row: readonly number[]): void => {
    const s = row.reduce((a, b) => a + b, 0);
    if (rect.w >= rect.h) {
      const w = s / rect.h;
      let y = rect.y;
      for (const a of row) {
        const h = a / w;
        out.push({ x: rect.x, y, w, h });
        y += h;
      }
      rect.x += w;
      rect.w -= w;
    } else {
      const h = s / rect.w;
      let x = rect.x;
      for (const a of row) {
        const w = a / h;
        out.push({ x, y: rect.y, w, h });
        x += w;
      }
      rect.y += h;
      rect.h -= h;
    }
  };
  let row: number[] = [];
  let i = 0;
  while (i < areas.length) {
    const area = areas[i] ?? 0;
    const side = Math.min(rect.w, rect.h);
    if (row.length === 0 || worst([...row, area], side) <= worst(row, side)) {
      row.push(area);
      i++;
    } else {
      layout(row);
      row = [];
    }
  }
  if (row.length) layout(row);
  return out;
}

export class Treemap extends FrameChart<TreemapOptions, Model> {
  #current: string | null = null;
  #tiles: Tile[] = [];

  /** Render a treemap into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: TreemapOptions): Treemap {
    return new Treemap(host, options);
  }

  private constructor(host: HTMLElement, options: TreemapOptions) {
    super(host, options, 'aui-treemap');
    this.start((listener) => treemapConfig.subscribe(listener));
  }

  /** Id of the shown group (null: top level). */
  get root(): string | null {
    return this.#current;
  }

  /** Ids from the top level to the shown group. */
  get path(): string[] {
    const ids: string[] = [];
    let entry = this.#current === null ? null : (this.model.byId.get(this.#current) ?? null);
    while (entry) {
      ids.unshift(entry.node.id);
      entry = entry.parent;
    }
    return ids;
  }

  /** Show the group `id` (null: top level). Emits `aui-drill`; focus moves into the tiles when it was in the chart. */
  drillTo(id: string | null): void {
    if (id !== null && !this.model.byId.get(id)?.children.length) return;
    if (id === this.#current) return;
    const previous = this.#current;
    const hadFocus = this.host.contains(this.host.ownerDocument.activeElement);
    this.#current = id;
    this.apply();
    // Going up focuses the group we came from; going down focuses the largest tile.
    const target = this.#tiles.find((t) => t.entry.node.id === previous) ?? this.#tiles[0];
    if (hadFocus && target) target.element.focus();
    announce(this.message('treemapShowing', { path: this.#pathText() }));
    const detail: TreemapDrillDetail = { id, path: this.path };
    emit(this.host, 'aui-drill', detail);
  }

  protected override mounted(): void {
    this.#syncRoot(this.options);
  }

  protected override optionsChanged(changed: Partial<TreemapOptions>): void {
    this.#syncRoot(changed);
  }

  #syncRoot(o: Partial<TreemapOptions>): void {
    if (o.root !== undefined) this.#current = o.root;
    // A group that disappeared (or became a leaf) falls back to the top level.
    if (this.#current !== null && !this.model.byId.get(this.#current)?.children.length) this.#current = null;
  }

  protected seriesIds(): readonly string[] {
    return [];
  }

  protected assert(o: TreemapOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.data)) chartFail(CODE, COMPONENT, 'data', 'TreemapNode[]');
    const ids = new Set<string>();
    const walk = (nodes: readonly unknown[], at: string, depth: number): void => {
      if (depth > 32) chartFail(CODE, COMPONENT, at, 'at most 32 levels');
      nodes.forEach((n, i) => {
        const p = `${at}[${String(i)}]`;
        if (!validators.isRecord(n)) chartFail(CODE, COMPONENT, p, 'TreemapNode');
        if (typeof n.id !== 'string' || n.id === '' || ids.has(n.id)) chartFail(CODE, COMPONENT, `${p}.id`, 'unique non-empty string');
        ids.add(n.id);
        if (typeof n.label !== 'string') chartFail(CODE, COMPONENT, `${p}.label`, 'string');
        if (n.value !== undefined && n.value !== null && typeof n.value !== 'number') chartFail(CODE, COMPONENT, `${p}.value`, 'number | null');
        if (!isChartColor(n.color)) chartFail(CODE, COMPONENT, `${p}.color`, 'integer 1-8');
        if (n.children !== undefined) {
          if (!Array.isArray(n.children)) chartFail(CODE, COMPONENT, `${p}.children`, 'TreemapNode[]');
          walk(n.children as unknown[], `${p}.children`, depth + 1);
        }
      });
    };
    walk(o.data, 'data', 0);
    if (o.root !== undefined && o.root !== null && typeof o.root !== 'string') chartFail(CODE, COMPONENT, 'root', 'string | null');
    if (o.drillDown !== undefined && typeof o.drillDown !== 'boolean') chartFail(CODE, COMPONENT, 'drillDown', 'boolean');
    if (o.rootLabel !== undefined && typeof o.rootLabel !== 'string') chartFail(CODE, COMPONENT, 'rootLabel', 'string');
  }

  protected prepare(): Model {
    const o = this.options;
    const config: Resolved = treemapConfig.resolve(pickDefined(o, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'tileLabels', 'locale', 'direction']));
    const byId = new Map<string, TreeEntry>();
    const resolve = (node: TreemapNode, parent: TreeEntry | null, depth: number): TreeEntry => {
      const entry: { node: TreemapNode; value: number; children: TreeEntry[]; parent: TreeEntry | null; depth: number } = { node, value: 0, children: [], parent, depth };
      for (const child of node.children ?? []) {
        const c = resolve(child, entry, depth + 1);
        if (c.value > 0) entry.children.push(c);
      }
      entry.children.sort((a, b) => b.value - a.value);
      const own = finite(node.value);
      entry.value = own !== null && own > 0 ? own : node.children ? entry.children.reduce((s, c) => s + c.value, 0) : 0;
      byId.set(node.id, entry);
      return entry;
    };
    const roots = o.data.map((n) => resolve(n, null, 0)).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
    const pf = new Intl.NumberFormat(config.locale, { style: 'percent', maximumFractionDigits: 1 });
    return {
      config,
      roots,
      byId,
      format: valueFormatter(o, config.locale),
      percent: (r) => pf.format(r),
      empty: roots.length === 0 ? getMessage('chart', 'noData', {}, config.locale) : null,
    };
  }

  #level(): { items: readonly TreeEntry[]; total: number } {
    const m = this.model;
    const current = this.#current === null ? null : m.byId.get(this.#current);
    const items = current ? current.children : m.roots;
    return { items, total: items.reduce((s, c) => s + c.value, 0) };
  }

  #pathText(): string {
    const m = this.model;
    const names = [this.options.rootLabel ?? this.message('treemapAll'), ...this.path.map((id) => m.byId.get(id)?.node.label ?? '')];
    return names.join(this.message('pathSeparator'));
  }

  #label(entry: TreeEntry, total: number): string {
    const m = this.model;
    const percent = m.percent(total > 0 ? entry.value / total : 0);
    return entry.children.length
      ? this.message('treemapGroup', { label: entry.node.label, value: m.format(entry.value), percent, items: chartPlural('itemCount', entry.children.length, m.config.locale) })
      : this.message('treemapTile', { label: entry.node.label, value: m.format(entry.value), percent });
  }

  protected apply(): void {
    const o = this.options;
    const m = this.model;
    this.configureFrame('roleTreemap');
    this.frame.setText(o.label, o.hideLabel === true, o.description, o.summary ?? this.#summaryText());
    this.frame.setLegend([], false, false);
    this.frame.setToolbar(this.#breadcrumb());
    this.frame.setTable(m.config.dataTable, () => this.#tableData());
    this.frame.setEmpty(m.empty);
    this.frame.render();
  }

  #breadcrumb(): Node[] {
    if (this.#current === null || this.options.drillDown === false) return [];
    const doc = this.frame.doc;
    const nav = doc.createElement('nav');
    nav.className = 'aui-treemap__path';
    nav.setAttribute('aria-label', this.message('treemapPath'));
    const list = doc.createElement('ol');
    list.className = 'aui-treemap__path-list';
    const ids: (string | null)[] = [null, ...this.path];
    ids.forEach((id, i) => {
      const li = doc.createElement('li');
      li.className = 'aui-treemap__path-item';
      const name = id === null ? (this.options.rootLabel ?? this.message('treemapAll')) : (this.model.byId.get(id)?.node.label ?? '');
      if (i === ids.length - 1) {
        const current = doc.createElement('span');
        current.setAttribute('aria-current', 'location');
        current.textContent = name;
        li.append(current);
      } else {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'aui-treemap__path-button';
        button.textContent = name;
        button.addEventListener('click', () => {
          this.drillTo(id);
        });
        li.append(button);
      }
      list.append(li);
    });
    nav.append(list);
    return [nav];
  }

  #summaryText(): string {
    const m = this.model;
    const locale = m.config.locale;
    const { items, total } = this.#level();
    const parts: string[] = [];
    if (this.#current !== null) parts.push(this.message('treemapShowing', { path: this.#pathText() }));
    parts.push(this.message('treemapIntro', { type: this.message('roleTreemap'), items: chartPlural('itemCount', items.length, locale), total: m.format(total) }));
    const top = items.slice(0, 3).map((e) => `${e.node.label} (${m.percent(total > 0 ? e.value / total : 0)})`);
    if (top.length) parts.push(this.message('treemapLargest', { list: listFormat(top, locale) }));
    return parts.join(' ');
  }

  #tableData(): TableData {
    const m = this.model;
    const rows: string[][] = [];
    const sep = this.message('pathSeparator');
    const walk = (entries: readonly TreeEntry[], prefix: string, total: number): void => {
      for (const e of entries) {
        const name = prefix ? `${prefix}${sep}${e.node.label}` : e.node.label;
        rows.push([name, m.format(e.value), m.percent(total > 0 ? e.value / total : 0)]);
        walk(e.children, name, e.value);
      }
    };
    walk(m.roots, '', m.roots.reduce((s, r) => s + r.value, 0));
    return { caption: this.options.label, columns: [this.message('treemapName'), this.message('value'), this.message('treemapShare')], numeric: [false, true, true], rows };
  }

  protected draw(width: number, height: number): void {
    const m = this.model;
    const frame = this.frame;
    const doc = frame.doc;
    this.#tiles = [];
    if (m.empty !== null) return;
    const rtl = m.config.direction === 'rtl';
    const px = fontSize(frame.svg);
    const { items, total } = this.#level();
    const boxes = squarify(items.map((e) => e.value), { x: 0, y: 0, w: width, h: height });
    frame.setPlot({ left: 0, right: width, top: 0, bottom: height });
    const tiles = svgElement(doc, 'g', {}, 'aui-treemap__tiles');
    const labels = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-treemap__labels');
    const marks: FrameMark[] = [];
    items.forEach((entry, i) => {
      const b = boxes[i];
      if (!b) return;
      const x = rtl ? width - b.x - b.w : b.x;
      const slot = entry.node.color ?? (i % 8) + 1;
      const group = entry.children.length > 0 && this.options.drillDown !== false;
      const g = svgElement(doc, 'g', {}, `aui-treemap__tile-group aui-chart__series--c${String(slot)}`);
      const box = { x, y: b.y, width: Math.max(0, b.w), height: Math.max(0, b.h) };
      const rect = roundedRect(doc, box, frame.corners.cell ?? 0, group ? 'aui-treemap__tile aui-treemap__tile--group' : 'aui-treemap__tile');
      ChartFrame.markElement(rect, this.#label(entry, total));
      g.append(rect);
      const pattern = frame.pattern(i + 1);
      if (pattern) g.append(roundedRect(doc, box, frame.corners.cell ?? 0, 'aui-chart__pattern', { fill: `url(#${pattern})`, 'aria-hidden': 'true' }));
      if (group) {
        rect.addEventListener('click', () => {
          this.drillTo(entry.node.id);
        });
      }
      tiles.append(g);
      this.#tiles.push({ entry, x, y: b.y, w: b.w, h: b.h, slot, element: rect });
      marks.push({ element: rect, row: 0, column: i, key: entry.node.id, x: x + b.w / 2, y: b.y + Math.min(b.h / 2, px * 2) });
      if (m.config.tileLabels && b.w >= px * 4 && b.h >= px * 2) {
        // Text sits on a surface-colored chip, so it stays readable over any fill or texture.
        const inset = 4;
        const pad = 4;
        const nameText = truncateText(group ? `${entry.node.label} >` : entry.node.label, b.w - (inset + pad) * 2, px);
        const value = m.format(entry.value);
        const showValue = b.h >= px * 3.6 && textWidth(value, px) <= b.w - (inset + pad) * 2;
        const chipW = Math.min(b.w - inset * 2, Math.max(textWidth(nameText, px), showValue ? textWidth(value, px) : 0) + pad * 2);
        const chipH = px * (showValue ? 2.7 : 1.5);
        const chipX = rtl ? x + b.w - inset - chipW : x + inset;
        labels.append(svgElement(doc, 'rect', { x: chipX, y: b.y + inset, width: chipW, height: chipH, rx: 3 }, 'aui-treemap__chip'));
        const anchorX = rtl ? chipX + chipW - pad : chipX + pad;
        const anchor = rtl ? 'end' : 'start';
        const name = svgElement(doc, 'text', { x: anchorX, y: b.y + inset + px * 0.78, 'text-anchor': anchor, 'dominant-baseline': 'middle' }, 'aui-treemap__label');
        name.textContent = nameText;
        labels.append(name);
        if (showValue) {
          const v = svgElement(doc, 'text', { x: anchorX, y: b.y + inset + px * 1.95, 'text-anchor': anchor, 'dominant-baseline': 'middle' }, 'aui-treemap__value');
          v.textContent = value;
          labels.append(v);
        }
      }
    });
    frame.layer.append(tiles, labels);
    frame.setMarks(marks);
  }

  protected hover(x: number, y: number): HoverResult | null {
    const tile = this.#tiles.find((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
    const mark = tile ? this.frame.marks.find((mk) => mk.key === tile.entry.node.id) : undefined;
    if (!tile || !mark) return null;
    return { content: this.tooltip(mark), x: mark.x, y: tile.y, highlight: [tile.element] };
  }

  protected tooltip(mark: FrameMark): TooltipContent {
    const tile = this.#tiles.find((t) => t.entry.node.id === mark.key);
    if (!tile) return { title: '', rows: [] };
    const { total } = this.#level();
    const m = this.model;
    const rows: TooltipContent['rows'][number][] = [{ slot: tile.slot, shapeSlot: mark.column + 1, swatch: 'fill', label: m.format(tile.entry.value), value: m.percent(total > 0 ? tile.entry.value / total : 0) }];
    return { title: tile.entry.node.label, rows };
  }

  protected override key(event: KeyboardEvent, mark: FrameMark): boolean {
    if (this.options.drillDown === false) return false;
    if (event.key === 'Enter' || event.key === ' ') {
      const entry = this.model.byId.get(mark.key);
      if (!entry?.children.length) return false;
      this.drillTo(mark.key);
      return true;
    }
    if (event.key === 'Backspace' && this.#current !== null) {
      this.drillTo(this.model.byId.get(this.#current)?.parent?.node.id ?? null);
      return true;
    }
    return false;
  }
}

/** Detail of `aui-point-click`. */
export type TreemapPointClickDetail = ChartPointClickDetail;
