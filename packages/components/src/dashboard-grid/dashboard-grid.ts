/**
 * Dashboard Grid (SPEC section 18.17: Dashboard Grid, Resizable Widget, Draggable
 * Widget). Enhances a host whose children carry `data-aui-item="<id>"` into a
 * responsive column grid (CSS grid placement through the CSSOM, CSP-safe). In edit
 * mode every item gets a move handle: drag it (pointer, touch) or press it and use
 * the arrow keys (Shift + arrows resize), Enter or Space drops, Escape cancels; a
 * corner grip resizes by pointer. Other items move out of the way and float up
 * (vertical compaction); locked items never move. Layouts are per breakpoint,
 * serializable, and undoable (moves and resizes). The DOM order follows the visual
 * reading order after every change, so focus order matches what users see.
 *
 * Children stay owned by the page or framework: the grid only positions them and
 * adds its handles in edit mode. Removing a child from the DOM removes its item.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { renderIcon } from '@absoluteui/icons';
import { announce, matchesHotkey, observeMutations, observeResize, trackPointerDrag, type DragMove, type PointerDrag } from '@absoluteui/utilities';
import { AutoScroller } from './auto-scroll.js';
import { adaptLayout, clampItem, compactLayout, findFreeSpot, layoutRows, resolveLayout, sortLayout, type DashboardCompaction, type DashboardItem } from './layout.js';

export interface DashboardGridConfig {
  /** Row height in CSS px. Default 80. */
  rowHeight: number;
  /** Gap between items in CSS px. Default 16. */
  gap: number;
  /** `vertical` (default): items float up into free space; `none`: items stay where they are put. */
  compaction: DashboardCompaction;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    dashboardGrid: DashboardGridConfig & { locale: string; direction: Direction };
  }
}

export const dashboardGridConfig = defineComponentConfig<DashboardGridConfig, 'locale' | 'direction'>(
  'dashboardGrid',
  {
    rowHeight: { default: 80, expected: 'integer from 24 to 600 (CSS px)', validate: validators.integerInRange(24, 600) },
    gap: { default: 16, expected: 'integer from 0 to 64 (CSS px)', validate: validators.integerInRange(0, 64) },
    compaction: { default: 'vertical', expected: '"vertical" | "none"', validate: validators.oneOf(['vertical', 'none'] as const) },
  },
  ['locale', 'direction'],
);

export interface DashboardBreakpoint {
  /** Layout key, for example "lg". */
  name: string;
  /** Applies from this host width (CSS px) up to the next breakpoint. */
  minWidth: number;
  columns: number;
}

export interface DashboardGridOptions extends Partial<DashboardGridConfig> {
  /** Accessible name of the dashboard region. */
  label: string;
  /** Layout for the widest breakpoint. Narrower breakpoints derive from it unless `layouts` has one. */
  items: readonly DashboardItem[];
  /** Saved layouts per breakpoint name (from `layouts` / `aui-layout-change`). */
  layouts?: Readonly<Record<string, readonly DashboardItem[]>>;
  /** Default: lg (1024 px, 12 columns), md (640 px, 6), sm (0, 1). */
  breakpoints?: readonly DashboardBreakpoint[];
  /** Edit mode: move handles, resize grips, keyboard moving, undo. Default false. */
  editable?: boolean;
  /** Undo depth. Default 50. */
  historyLimit?: number;
  /** Keep the DOM in visual reading order. Default true. */
  reorderDom?: boolean;
  locale?: string;
  direction?: Direction;
}

export type DashboardLayoutReason = 'move' | 'resize' | 'add' | 'remove' | 'undo' | 'redo' | 'set';

/** Detail of `aui-layout-change`. */
export interface DashboardGridLayoutChangeDetail {
  reason: DashboardLayoutReason;
  /** Active breakpoint name. */
  breakpoint: string;
  /** Items of the active breakpoint. */
  items: DashboardItem[];
  /** Every stored layout (the widest breakpoint always included), for saving. */
  layouts: Record<string, DashboardItem[]>;
  /** The moved, resized, added, or removed item, if any. */
  id: string | null;
}

/** Detail of `aui-breakpoint-change`. */
export interface DashboardGridBreakpointChangeDetail {
  breakpoint: string;
  columns: number;
}

registerMessages('dashboardGrid', 'en', {
  handle: 'Move {label}',
  grabbed: '{label} grabbed. Column {column}, row {row}, {width} by {height}. Arrow keys move, Shift and arrow keys resize, Enter drops, Escape cancels.',
  moved: 'Column {column}, row {row}.',
  resized: '{width} columns by {height} rows.',
  dropped: '{label} dropped at column {column}, row {row}.',
  cancelled: 'Move cancelled. {label} is back at column {column}, row {row}.',
  added: '{label} added at column {column}, row {row}.',
  removed: '{label} removed.',
  undone: 'Layout change undone.',
  redone: 'Layout change redone.',
  locked: '{label} is locked.',
});

const DEFAULT_BREAKPOINTS: readonly DashboardBreakpoint[] = [
  { name: 'lg', minWidth: 1024, columns: 12 },
  { name: 'md', minWidth: 640, columns: 6 },
  { name: 'sm', minWidth: 0, columns: 1 },
];

function fail(property: string, expected: string): never {
  throw configurationError('DASHBOARD_GRID_OPTIONS', 'Invalid dashboard grid options.', { component: 'dashboardGrid', property: `dashboardGrid.${property}`, expected });
}

function assertItems(items: unknown, at: string): void {
  if (!Array.isArray(items)) fail(at, 'DashboardItem[]');
  const ids = new Set<string>();
  items.forEach((item: unknown, i) => {
    const p = `${at}[${String(i)}]`;
    if (!validators.isRecord(item)) fail(p, 'DashboardItem');
    if (typeof item.id !== 'string' || item.id === '' || ids.has(item.id)) fail(`${p}.id`, 'unique non-empty string');
    ids.add(item.id);
    for (const key of ['x', 'y'] as const) if (!(typeof item[key] === 'number' && Number.isInteger(item[key]) && item[key] >= 0)) fail(`${p}.${key}`, 'non-negative integer');
    for (const key of ['w', 'h'] as const) if (!(typeof item[key] === 'number' && Number.isInteger(item[key]) && item[key] >= 1)) fail(`${p}.${key}`, 'positive integer');
    for (const key of ['minW', 'minH', 'maxW', 'maxH'] as const) {
      const v = item[key];
      if (v !== undefined && !(typeof v === 'number' && Number.isInteger(v) && v >= 1)) fail(`${p}.${key}`, 'positive integer');
    }
    if (item.locked !== undefined && typeof item.locked !== 'boolean') fail(`${p}.locked`, 'boolean');
    if (item.label !== undefined && typeof item.label !== 'string') fail(`${p}.label`, 'string');
  });
}

const copy = (items: readonly DashboardItem[]): DashboardItem[] => items.map((i) => ({ ...i }));

interface Snapshot {
  readonly layouts: ReadonlyMap<string, readonly DashboardItem[]>;
}

interface Grab {
  readonly id: string;
  readonly start: readonly DashboardItem[];
  /** Layout while moving (anchored compaction). */
  current: DashboardItem[];
  readonly mode: 'keyboard' | 'pointer';
}

export class DashboardGrid {
  readonly host: HTMLElement;
  #options: DashboardGridOptions;
  readonly #group = new DisposableGroup();
  readonly #layouts = new Map<string, DashboardItem[]>();
  #breakpoint: DashboardBreakpoint;
  #width = 0;
  #elements = new Map<string, HTMLElement>();
  readonly #chrome = new Map<string, { handle: HTMLButtonElement; grip: HTMLElement; drags: PointerDrag[] }>();
  #history: Snapshot[] = [];
  #future: Snapshot[] = [];
  #grab: Grab | null = null;
  readonly #autoScroll = new AutoScroller(() => this.host);
  #lastMove: (() => void) | null = null;
  #placeholder: HTMLDivElement | null = null;
  #preview: { x: number; y: number } | null = null;

  /** Enhance `host` into a dashboard grid. */
  static create(host: HTMLElement, options: DashboardGridOptions): DashboardGrid {
    return new DashboardGrid(host, options);
  }

  private constructor(host: HTMLElement, options: DashboardGridOptions) {
    DashboardGrid.#assert(options);
    this.host = host;
    this.#options = { ...options };
    this.#config();
    const breakpoints = this.#breakpoints();
    this.#width = host.clientWidth;
    this.#breakpoint = this.#pick(this.#width, breakpoints);
    this.#layouts.set(this.#widest().name, copy(options.items).map((i) => clampItem(i, this.#widest().columns)));
    for (const [name, items] of Object.entries(options.layouts ?? {})) {
      const bp = breakpoints.find((b) => b.name === name);
      if (bp) this.#layouts.set(name, copy(items).map((i) => clampItem(i, bp.columns)));
    }
    host.classList.add('aui-dashboard');
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', options.label);
    this.#scan();
    this.#applyStyles();
    this.#render();
    this.#syncChrome();
    const g = this.#group;
    g.add(observeResize(host, (entry) => {
      const width = Math.floor(entry.contentRect.width);
      if (width === this.#width) return;
      this.#width = width;
      const next = this.#pick(width, this.#breakpoints());
      if (next.name !== this.#breakpoint.name) {
        this.#cancelGrab(false);
        this.#breakpoint = next;
        this.#render();
        const detail: DashboardGridBreakpointChangeDetail = { breakpoint: next.name, columns: next.columns };
        emit(host, 'aui-breakpoint-change', detail);
      }
    }));
    g.add(observeMutations(host, (records) => {
      this.#onMutations(records);
    }, { childList: true }));
    g.listen(host, 'keydown', (e) => {
      this.#onHostKey(e);
    });
    g.add(dashboardGridConfig.subscribe(() => {
      this.#applyStyles();
      this.#render();
    }));
  }

  /** Active breakpoint. */
  get breakpoint(): DashboardBreakpoint {
    return { ...this.#breakpoint };
  }

  /** Items of the active breakpoint (copies). */
  get items(): DashboardItem[] {
    return copy(this.#current());
  }

  /** Every stored layout by breakpoint name (copies). */
  get layouts(): Record<string, DashboardItem[]> {
    const out: Record<string, DashboardItem[]> = {};
    for (const [name, items] of this.#layouts) out[name] = copy(items);
    return out;
  }

  get editable(): boolean {
    return this.#options.editable === true;
  }

  get canUndo(): boolean {
    return this.#history.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  update(options: Partial<DashboardGridOptions>): void {
    const next = { ...this.#options, ...options };
    DashboardGrid.#assert(next);
    this.#cancelGrab(false);
    this.#options = next;
    if (options.label !== undefined) this.host.setAttribute('aria-label', options.label);
    if (options.items !== undefined || options.layouts !== undefined || options.breakpoints !== undefined) {
      this.#layouts.clear();
      this.#layouts.set(this.#widest().name, copy(next.items).map((i) => clampItem(i, this.#widest().columns)));
      for (const [name, items] of Object.entries(next.layouts ?? {})) {
        const bp = this.#breakpoints().find((b) => b.name === name);
        if (bp) this.#layouts.set(name, copy(items).map((i) => clampItem(i, bp.columns)));
      }
      this.#breakpoint = this.#pick(this.#width, this.#breakpoints());
    }
    this.#applyStyles();
    this.#render();
    this.#syncChrome();
  }

  /** Enter or leave edit mode. */
  setEditable(editable: boolean): void {
    this.update({ editable });
  }

  /**
   * Add an item. Without a position (or with a colliding one) it goes to the first free
   * spot. `element` is inserted when given; otherwise the child with the matching
   * `data-aui-item` is used when it appears (frameworks render it).
   */
  addItem(item: Omit<DashboardItem, 'x' | 'y'> & Partial<Pick<DashboardItem, 'x' | 'y'>>, element?: HTMLElement): DashboardItem {
    const bp = this.#breakpoint;
    const current = this.#current();
    const probe = { ...item, x: item.x ?? 0, y: item.y ?? 0 };
    assertItems([probe], 'addItem');
    if (this.#all().has(item.id)) fail('addItem.id', 'id not already in the layout');
    const placed = item.x === undefined || item.y === undefined
      ? { ...clampItem(probe, bp.columns), ...findFreeSpot(current, Math.min(bp.columns, item.w), item.h, bp.columns) }
      : clampItem(probe, bp.columns);
    this.#pushHistory();
    // The active breakpoint gets the requested position; every other stored layout a free spot.
    for (const [name, items] of this.#layouts) {
      if (name === bp.name) continue;
      const cols = this.#breakpoints().find((b) => b.name === name)?.columns ?? bp.columns;
      const spot = findFreeSpot(items, Math.min(cols, placed.w), placed.h, cols);
      items.push(clampItem({ ...placed, ...spot }, cols));
    }
    this.#setCurrent(resolveLayout(current, placed, bp.columns, this.#compaction()));
    if (this.#compaction() === 'vertical') this.#setCurrent(compactLayout(this.#current()));
    if (element) {
      element.dataset.auiItem = item.id;
      this.host.append(element);
    }
    this.#scan();
    this.#render();
    this.#syncChrome();
    const added = this.#current().find((i) => i.id === item.id) ?? placed;
    announce(this.#msg('added', { label: this.#label(item.id), column: String(added.x + 1), row: String(added.y + 1) }));
    this.#emit('add', item.id);
    return { ...added };
  }

  /** Remove an item from every layout; its element is removed when the grid inserted it or `removeElement` is true. */
  removeItem(id: string, removeElement = true): void {
    if (!this.#all().has(id)) return;
    const label = this.#label(id);
    this.#removeFromLayouts(id);
    const el = this.#elements.get(id);
    if (el && removeElement) {
      el.remove();
    }
    this.#forget(id);
    this.#render();
    announce(this.#msg('removed', { label }));
    this.#emit('remove', id);
  }

  /** Replace the active breakpoint's layout (validated, clamped, compacted). */
  setLayout(items: readonly DashboardItem[]): void {
    assertItems(items, 'setLayout');
    this.#pushHistory();
    const cols = this.#breakpoint.columns;
    const clamped = copy(items).map((i) => clampItem(i, cols));
    this.#setCurrent(this.#compaction() === 'vertical' ? compactLayout(clamped) : clamped);
    this.#render();
    this.#emit('set', null);
  }

  undo(): boolean {
    const snapshot = this.#history.pop();
    if (!snapshot) return false;
    this.#future.push(this.#snapshot());
    this.#restore(snapshot);
    announce(this.#msg('undone'));
    this.#emit('undo', null);
    return true;
  }

  redo(): boolean {
    const snapshot = this.#future.pop();
    if (!snapshot) return false;
    this.#history.push(this.#snapshot());
    this.#restore(snapshot);
    announce(this.#msg('redone'));
    this.#emit('redo', null);
    return true;
  }

  /**
   * Show a drop preview for an external drag (the catalog) at client coordinates;
   * returns the cell or null outside the grid. `clearPreview()` removes it.
   */
  previewAt(clientX: number, clientY: number, w: number, h: number): { x: number; y: number } | null {
    const rect = this.host.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom + this.#config().rowHeight) {
      this.clearPreview();
      return null;
    }
    const cols = this.#breakpoint.columns;
    const width = Math.min(cols, w);
    const cell = this.#cellAt(clientX, clientY);
    const x = Math.max(0, Math.min(cols - width, cell.x - Math.floor(width / 2)));
    const y = Math.max(0, cell.y);
    this.#preview = { x, y };
    this.#showPlaceholder({ id: '\u0000preview', x, y, w: width, h });
    return { x, y };
  }

  clearPreview(): void {
    this.#preview = null;
    this.#hidePlaceholder();
  }

  /** The move handle of an item (edit mode), for focusing after an add. */
  handleFor(id: string): HTMLButtonElement | null {
    return this.#chrome.get(id)?.handle ?? null;
  }

  destroy(): void {
    this.#autoScroll.stop();
    this.#cancelGrab(false);
    this.#group.dispose();
    for (const id of [...this.#chrome.keys()]) this.#removeChrome(id);
    this.#hidePlaceholder();
    for (const el of this.#elements.values()) {
      el.classList.remove('aui-dashboard__item', 'aui-dashboard__item--locked', 'aui-dashboard__item--dragging');
      el.style.removeProperty('grid-column');
      el.style.removeProperty('grid-row');
      el.style.removeProperty('translate');
    }
    this.host.classList.remove('aui-dashboard', 'aui-dashboard--editing');
    this.host.removeAttribute('role');
    this.host.removeAttribute('aria-label');
    for (const p of ['--aui-dashboard-columns', '--aui-dashboard-row-height', '--aui-dashboard-gap', '--aui-dashboard-rows']) this.host.style.removeProperty(p);
  }

  static #assert(o: DashboardGridOptions): void {
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string');
    assertItems(o.items, 'items');
    const breakpoints: unknown = o.breakpoints;
    if (breakpoints !== undefined) {
      if (!Array.isArray(breakpoints) || breakpoints.length === 0) fail('breakpoints', 'non-empty DashboardBreakpoint[]');
      const names = new Set<string>();
      breakpoints.forEach((b: unknown, i) => {
        const p = `breakpoints[${String(i)}]`;
        if (!validators.isRecord(b) || typeof b.name !== 'string' || b.name === '' || names.has(b.name)) fail(`${p}.name`, 'unique non-empty string');
        names.add(b.name);
        if (!(typeof b.minWidth === 'number' && Number.isFinite(b.minWidth) && b.minWidth >= 0)) fail(`${p}.minWidth`, 'non-negative number');
        if (!(typeof b.columns === 'number' && Number.isInteger(b.columns) && b.columns >= 1 && b.columns <= 48)) fail(`${p}.columns`, 'integer from 1 to 48');
      });
      if (!breakpoints.some((b: { minWidth: number }) => b.minWidth === 0)) fail('breakpoints', 'one breakpoint with minWidth 0');
    }
    const layouts: unknown = o.layouts;
    if (layouts !== undefined) {
      if (!validators.isRecord(layouts)) fail('layouts', 'Record<string, DashboardItem[]>');
      for (const [name, items] of Object.entries(layouts)) assertItems(items, `layouts.${name}`);
    }
    if (o.editable !== undefined && typeof o.editable !== 'boolean') fail('editable', 'boolean');
    if (o.reorderDom !== undefined && typeof o.reorderDom !== 'boolean') fail('reorderDom', 'boolean');
    if (o.historyLimit !== undefined && !(Number.isInteger(o.historyLimit) && o.historyLimit >= 0 && o.historyLimit <= 500)) fail('historyLimit', 'integer from 0 to 500');
  }

  #config(): Readonly<DashboardGridConfig & { locale: string; direction: Direction }> {
    const o = this.#options;
    const input: Partial<DashboardGridConfig & { locale: string; direction: Direction }> = {};
    if (o.rowHeight !== undefined) input.rowHeight = o.rowHeight;
    if (o.gap !== undefined) input.gap = o.gap;
    if (o.compaction !== undefined) input.compaction = o.compaction;
    if (o.locale !== undefined) input.locale = o.locale;
    if (o.direction !== undefined) input.direction = o.direction;
    return dashboardGridConfig.resolve(input);
  }

  #compaction(): DashboardCompaction {
    return this.#config().compaction;
  }

  #msg(key: string, params: Readonly<Record<string, string>> = {}): string {
    return getMessage('dashboardGrid', key, params, this.#config().locale);
  }

  #breakpoints(): readonly DashboardBreakpoint[] {
    return [...(this.#options.breakpoints ?? DEFAULT_BREAKPOINTS)].sort((a, b) => b.minWidth - a.minWidth);
  }

  #widest(): DashboardBreakpoint {
    return this.#breakpoints()[0] ?? { name: 'lg', minWidth: 0, columns: 12 };
  }

  #pick(width: number, breakpoints: readonly DashboardBreakpoint[]): DashboardBreakpoint {
    return breakpoints.find((b) => width >= b.minWidth) ?? breakpoints[breakpoints.length - 1] ?? { name: 'lg', minWidth: 0, columns: 12 };
  }

  /** Layout of the active breakpoint: stored, or derived from the widest. */
  #current(): DashboardItem[] {
    const bp = this.#breakpoint;
    const stored = this.#layouts.get(bp.name);
    if (stored) return stored;
    const widest = this.#widest();
    return adaptLayout(this.#layouts.get(widest.name) ?? [], widest.columns, bp.columns);
  }

  #setCurrent(items: DashboardItem[]): void {
    this.#layouts.set(this.#breakpoint.name, items);
  }

  /** Ids in any layout. */
  #all(): Set<string> {
    const ids = new Set<string>();
    for (const items of this.#layouts.values()) for (const i of items) ids.add(i.id);
    return ids;
  }

  #removeFromLayouts(id: string): void {
    for (const [name, items] of this.#layouts) {
      const rest = items.filter((i) => i.id !== id);
      this.#layouts.set(name, this.#compaction() === 'vertical' ? compactLayout(rest) : rest);
    }
  }

  #snapshot(): Snapshot {
    return { layouts: new Map([...this.#layouts].map(([k, v]) => [k, copy(v)])) };
  }

  #pushHistory(): void {
    // A derived layout becomes stored, so undo can restore it.
    this.#setCurrent(copy(this.#current()));
    const limit = this.#options.historyLimit ?? 50;
    if (limit === 0) return;
    this.#history.push(this.#snapshot());
    if (this.#history.length > limit) this.#history.shift();
    this.#future = [];
  }

  /** Restore geometry; items added or removed since the snapshot keep their state. */
  #restore(snapshot: Snapshot): void {
    const ids = this.#all();
    for (const [name, items] of snapshot.layouts) {
      const current = this.#layouts.get(name) ?? [];
      const saved = new Map(items.map((i) => [i.id, i]));
      const merged = current.filter((i) => ids.has(i.id)).map((i) => ({ ...(saved.get(i.id) ?? i) }));
      this.#layouts.set(name, this.#compaction() === 'vertical' ? compactLayout(merged) : merged);
    }
    this.#render();
  }

  #emit(reason: DashboardLayoutReason, id: string | null): void {
    const detail: DashboardGridLayoutChangeDetail = { reason, breakpoint: this.#breakpoint.name, items: this.items, layouts: this.layouts, id };
    emit(this.host, 'aui-layout-change', detail);
  }

  #label(id: string): string {
    const item = this.#current().find((i) => i.id === id) ?? [...this.#layouts.values()].flat().find((i) => i.id === id);
    if (item?.label) return item.label;
    const heading = this.#elements.get(id)?.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
    const text = heading?.textContent.trim() ?? '';
    return text === '' ? id : text;
  }

  /** Register children with `data-aui-item`. */
  #scan(): void {
    const next = new Map<string, HTMLElement>();
    for (const child of this.host.children) {
      if (!(child instanceof HTMLElement)) continue;
      const id = child.dataset.auiItem;
      if (id && !next.has(id)) next.set(id, child);
    }
    for (const [id, el] of this.#elements) if (next.get(id) !== el) this.#forget(id, el);
    this.#elements = next;
    for (const el of next.values()) el.classList.add('aui-dashboard__item');
  }

  #forget(id: string, el = this.#elements.get(id)): void {
    this.#removeChrome(id);
    if (el) {
      el.classList.remove('aui-dashboard__item', 'aui-dashboard__item--locked', 'aui-dashboard__item--dragging');
      el.style.removeProperty('grid-column');
      el.style.removeProperty('grid-row');
    }
    this.#elements.delete(id);
  }

  #onMutations(records: readonly MutationRecord[]): void {
    // Records arrive asynchronously; reordering (remove + insert) leaves the node in the
    // host, and the grid's own placeholder is not an item.
    let changed = false;
    for (const r of records) {
      for (const node of r.removedNodes) {
        if (!(node instanceof HTMLElement) || node.parentElement === this.host) continue;
        const id = node.dataset.auiItem;
        if (id && this.#elements.get(id) === node) {
          // The application removed the element: drop the item too.
          const label = this.#label(id);
          this.#removeFromLayouts(id);
          this.#forget(id, node);
          announce(this.#msg('removed', { label }));
          this.#emit('remove', id);
          changed = true;
        }
      }
      for (const node of r.addedNodes) if (node instanceof HTMLElement && node !== this.#placeholder && node.dataset.auiItem && !this.#elements.has(node.dataset.auiItem)) changed = true;
    }
    if (!changed) return;
    this.#scan();
    this.#render();
    this.#syncChrome();
  }

  #applyStyles(): void {
    const c = this.#config();
    const s = this.host.style;
    s.setProperty('--aui-dashboard-row-height', `${String(c.rowHeight)}px`);
    s.setProperty('--aui-dashboard-gap', `${String(c.gap)}px`);
  }

  /** Position every element; reorder the DOM to reading order. */
  #render(items: readonly DashboardItem[] = this.#grab?.current ?? this.#current()): void {
    const s = this.host.style;
    s.setProperty('--aui-dashboard-columns', String(this.#breakpoint.columns));
    s.setProperty('--aui-dashboard-rows', String(Math.max(1, layoutRows(items))));
    this.host.classList.toggle('aui-dashboard--editing', this.editable);
    for (const item of items) {
      const el = this.#elements.get(item.id);
      if (!el) continue;
      el.style.setProperty('grid-column', `${String(item.x + 1)} / span ${String(item.w)}`);
      el.style.setProperty('grid-row', `${String(item.y + 1)} / span ${String(item.h)}`);
      el.classList.toggle('aui-dashboard__item--locked', item.locked === true);
      el.hidden = false;
    }
    // Elements whose item is not in this breakpoint's layout stay out of view.
    const placed = new Set(items.map((i) => i.id));
    for (const [id, el] of this.#elements) if (!placed.has(id)) el.hidden = true;
    if (!this.#grab) this.#reorder(items);
  }

  #reorder(items: readonly DashboardItem[]): void {
    if (this.#options.reorderDom === false) return;
    const order = sortLayout(items).map((i) => this.#elements.get(i.id)).filter((el): el is HTMLElement => el !== undefined);
    const current = [...this.host.children].filter((c): c is HTMLElement => c instanceof HTMLElement && order.includes(c));
    if (order.every((el, i) => current[i] === el)) return;
    const doc = this.host.ownerDocument;
    const focused = doc.activeElement;
    // Keep unmanaged children (and the placeholder) where they are; move items into reading order.
    const anchor = current[0] ?? null;
    let before: Element | null = anchor;
    for (const el of order) {
      if (el === before) {
        before = el.nextElementSibling;
        continue;
      }
      this.host.insertBefore(el, before);
    }
    if (focused instanceof HTMLElement && focused !== doc.activeElement && focused.isConnected) focused.focus({ preventScroll: true });
  }

  #syncChrome(): void {
    const editable = this.editable;
    for (const [id, el] of this.#elements) {
      const has = this.#chrome.has(id);
      if (editable && !has) this.#addChrome(id, el);
      else if (!editable && has) this.#removeChrome(id);
      else if (has) this.#chrome.get(id)?.handle.setAttribute('aria-label', this.#msg('handle', { label: this.#label(id) }));
    }
  }

  #addChrome(id: string, el: HTMLElement): void {
    const doc = el.ownerDocument;
    const handle = doc.createElement('button');
    handle.type = 'button';
    handle.className = 'aui-dashboard__handle';
    handle.setAttribute('aria-pressed', 'false');
    handle.setAttribute('aria-label', this.#msg('handle', { label: this.#label(id) }));
    handle.title = this.#msg('handle', { label: this.#label(id) });
    handle.id = createId('aui-dashboard-handle');
    handle.append(renderIcon('grip', { doc }));
    const grip = doc.createElement('div');
    grip.className = 'aui-dashboard__resize';
    // Pointer-only: Shift + arrow keys on the handle resize from the keyboard.
    grip.setAttribute('aria-hidden', 'true');
    handle.addEventListener('click', () => {
      if (this.#grab?.id === id) this.#drop();
      else this.#startGrab(id, 'keyboard');
    });
    handle.addEventListener('keydown', (e) => {
      this.#onHandleKey(e, id);
    });
    handle.addEventListener('blur', () => {
      if (this.#grab?.id === id && this.#grab.mode === 'keyboard') this.#drop();
    });
    const drags = [this.#pointerMove(id, handle), this.#pointerResize(id, grip)];
    el.prepend(handle);
    el.append(grip);
    this.#chrome.set(id, { handle, grip, drags });
  }

  #removeChrome(id: string): void {
    const chrome = this.#chrome.get(id);
    if (!chrome) return;
    for (const d of chrome.drags) d.dispose();
    chrome.handle.remove();
    chrome.grip.remove();
    this.#chrome.delete(id);
  }

  #item(id: string, items: readonly DashboardItem[] = this.#grab?.current ?? this.#current()): DashboardItem | undefined {
    return items.find((i) => i.id === id);
  }

  #startGrab(id: string, mode: Grab['mode']): boolean {
    const item = this.#item(id);
    if (!item) return false;
    if (item.locked) {
      announce(this.#msg('locked', { label: this.#label(id) }));
      return false;
    }
    this.#cancelGrab(true);
    const start = copy(this.#current());
    this.#grab = { id, start, current: copy(start), mode };
    this.#chrome.get(id)?.handle.setAttribute('aria-pressed', 'true');
    this.#elements.get(id)?.classList.add('aui-dashboard__item--dragging');
    this.#showPlaceholder(item);
    if (mode === 'keyboard') announce(this.#msg('grabbed', { label: this.#label(id), column: String(item.x + 1), row: String(item.y + 1), width: String(item.w), height: String(item.h) }), 'assertive');
    return true;
  }

  /** Move or resize the grabbed item to `target` (anchored resolution, live). */
  #moveGrab(target: DashboardItem): void {
    const grab = this.#grab;
    if (!grab) return;
    const cols = this.#breakpoint.columns;
    grab.current = resolveLayout(grab.start, clampItem(target, cols), cols, this.#compaction());
    this.#render(grab.current);
    const moved = this.#item(grab.id, grab.current);
    if (moved) this.#showPlaceholder(moved);
  }

  #drop(): void {
    const grab = this.#grab;
    if (!grab) return;
    const before = this.#item(grab.id, grab.start);
    const final = this.#compaction() === 'vertical' ? compactLayout(grab.current) : grab.current;
    const after = final.find((i) => i.id === grab.id);
    this.#endGrab();
    const changed = JSON.stringify(sortLayout(final)) !== JSON.stringify(sortLayout(grab.start));
    if (changed) {
      this.#pushHistory();
      this.#setCurrent(final);
    }
    this.#render();
    this.#chrome.get(grab.id)?.handle.focus({ preventScroll: true });
    // Keyboard drops are always announced; pointer drops when they changed the layout (R18-15).
    if (after && (grab.mode === 'keyboard' || changed)) announce(this.#msg('dropped', { label: this.#label(grab.id), column: String(after.x + 1), row: String(after.y + 1) }), grab.mode === 'keyboard' ? 'assertive' : 'polite');
    if (changed && before && after) this.#emit(before.w !== after.w || before.h !== after.h ? 'resize' : 'move', grab.id);
  }

  #cancelGrab(announceIt: boolean): void {
    const grab = this.#grab;
    if (!grab) return;
    this.#endGrab();
    this.#render();
    const item = this.#item(grab.id);
    if (announceIt && item) announce(this.#msg('cancelled', { label: this.#label(grab.id), column: String(item.x + 1), row: String(item.y + 1) }), 'assertive');
  }

  #endGrab(): void {
    const grab = this.#grab;
    if (!grab) return;
    this.#grab = null;
    this.#chrome.get(grab.id)?.handle.setAttribute('aria-pressed', 'false');
    const el = this.#elements.get(grab.id);
    el?.classList.remove('aui-dashboard__item--dragging');
    el?.style.removeProperty('translate');
    this.#hidePlaceholder();
  }

  #onHandleKey(e: KeyboardEvent, id: string): void {
    if (this.#grab?.id !== id) return;
    const item = this.#item(id);
    if (!item) return;
    const rtl = this.#config().direction === 'rtl';
    const dx = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
    const dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.#cancelGrab(true);
      return;
    }
    if (e.key === 'Tab') {
      this.#drop();
      return;
    }
    if (dx === 0 && dy === 0) return;
    e.preventDefault();
    if (e.shiftKey) {
      // Shift + arrows resize from the inline-end / block-end edge (Right always widens visually).
      const grow = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      const target = clampItem({ ...item, w: item.w + (rtl ? grow : grow), h: item.h + dy }, this.#breakpoint.columns);
      if (target.w === item.w && target.h === item.h) return;
      this.#moveGrab(target);
      const now = this.#item(id);
      if (now) announce(this.#msg('resized', { width: String(now.w), height: String(now.h) }), 'assertive');
      return;
    }
    const target = clampItem({ ...item, x: item.x + dx, y: item.y + dy }, this.#breakpoint.columns);
    if (target.x === item.x && target.y === item.y) return;
    this.#moveGrab(target);
    const now = this.#item(id);
    if (now) announce(this.#msg('moved', { column: String(now.x + 1), row: String(now.y + 1) }), 'assertive');
  }

  #onHostKey(e: KeyboardEvent): void {
    if (!this.editable || this.#grab) return;
    if (matchesHotkey(e, 'mod+z')) {
      e.preventDefault();
      this.undo();
    } else if (matchesHotkey(e, 'mod+shift+z') || matchesHotkey(e, 'mod+y')) {
      e.preventDefault();
      this.redo();
    }
  }

  /** Cell (column, row) under a client point. */
  #cellAt(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.host.getBoundingClientRect();
    const c = this.#config();
    const cols = this.#breakpoint.columns;
    const colWidth = (rect.width - c.gap * (cols - 1)) / cols;
    const rtl = this.#config().direction === 'rtl';
    const px = rtl ? rect.right - clientX : clientX - rect.left;
    return {
      x: Math.max(0, Math.min(cols - 1, Math.floor(px / (colWidth + c.gap)))),
      y: Math.max(0, Math.floor((clientY - rect.top) / (c.rowHeight + c.gap))),
    };
  }

  #pointerMove(id: string, handle: HTMLButtonElement): PointerDrag {
    let origin: { dx: number; dy: number } | null = null;
    return trackPointerDrag(handle, {
      canStart: () => this.editable && this.#item(id)?.locked !== true,
      onStart: (move) => {
        const el = this.#elements.get(id);
        if (!el || !this.#startGrab(id, 'pointer')) return;
        const r = el.getBoundingClientRect();
        // Pointer offset inside the item: the item's top-start corner follows the pointer.
        origin = { dx: move.start.x - (this.#config().direction === 'rtl' ? r.right : r.left), dy: move.start.y - r.top };
      },
      onMove: (move) => {
        this.#autoScroll.track(move.point.y, () => {
          this.#lastMove?.();
        });
        this.#lastMove = () => {
          this.#pointerMoveStep(id, move, origin);
        };
        this.#pointerMoveStep(id, move, origin);
      },
      onEnd: () => {
        this.#autoScroll.stop();
        this.#lastMove = null;
        origin = null;
        this.#drop();
      },
      onCancel: () => {
        this.#autoScroll.stop();
        this.#lastMove = null;
        origin = null;
        this.#cancelGrab(false);
      },
    });
  }

  #pointerMoveStep(id: string, move: DragMove, origin: { dx: number; dy: number } | null): void {
    const grab = this.#grab;
    const el = this.#elements.get(id);
    if (!grab || !origin || !el) return;
    el.style.setProperty('translate', `${String(Math.round(move.dx))}px ${String(Math.round(move.dy))}px`);
    const item = this.#item(id, grab.start);
    if (!item) return;
    const cell = this.#cellAt(move.point.x - origin.dx + (this.#config().direction === 'rtl' ? -1 : 1) * this.#colWidth() / 2, move.point.y - origin.dy + this.#config().rowHeight / 2);
    const current = this.#item(id);
    if (current && (current.x !== cell.x || current.y !== cell.y)) this.#moveGrab({ ...item, x: cell.x, y: cell.y });
    // The live translate is relative to the element's current grid cell.
    this.#retranslate(id, move.point.x - origin.dx, move.point.y - origin.dy);
  }

  #colWidth(): number {
    const c = this.#config();
    const cols = this.#breakpoint.columns;
    return (this.host.getBoundingClientRect().width - c.gap * (cols - 1)) / cols;
  }

  /** Translate the dragged element so its top-start corner sits at the client point. */
  #retranslate(id: string, clientX: number, clientY: number): void {
    const el = this.#elements.get(id);
    if (!el) return;
    el.style.removeProperty('translate');
    const r = el.getBoundingClientRect();
    const start = this.#config().direction === 'rtl' ? r.right : r.left;
    el.style.setProperty('translate', `${String(Math.round(clientX - start))}px ${String(Math.round(clientY - r.top))}px`);
  }

  #pointerResize(id: string, grip: HTMLElement): PointerDrag {
    return trackPointerDrag(grip, {
      canStart: () => this.editable && this.#item(id)?.locked !== true,
      onStart: () => {
        this.#startGrab(id, 'pointer');
      },
      onMove: (move) => {
        this.#autoScroll.track(move.point.y, null);
        const grab = this.#grab;
        const el = this.#elements.get(id);
        if (!grab || !el) return;
        const item = this.#item(id, grab.start);
        if (!item) return;
        const c = this.#config();
        const rtl = c.direction === 'rtl';
        const cw = this.#colWidth();
        const w = Math.max(1, Math.round((item.w * (cw + c.gap) - c.gap + (rtl ? -move.dx : move.dx) + c.gap) / (cw + c.gap)));
        const h = Math.max(1, Math.round((item.h * (c.rowHeight + c.gap) - c.gap + move.dy + c.gap) / (c.rowHeight + c.gap)));
        const current = this.#item(id);
        if (current && (current.w !== w || current.h !== h)) this.#moveGrab({ ...item, w, h });
      },
      onEnd: () => {
        this.#autoScroll.stop();
        this.#drop();
      },
      onCancel: () => {
        this.#autoScroll.stop();
        this.#cancelGrab(false);
      },
    });
  }

  #showPlaceholder(item: DashboardItem): void {
    if (!this.#placeholder) {
      const p = this.host.ownerDocument.createElement('div');
      p.className = 'aui-dashboard__placeholder';
      p.setAttribute('aria-hidden', 'true');
      this.#placeholder = p;
      this.host.append(p);
    }
    this.#placeholder.style.setProperty('grid-column', `${String(item.x + 1)} / span ${String(item.w)}`);
    this.#placeholder.style.setProperty('grid-row', `${String(item.y + 1)} / span ${String(item.h)}`);
  }

  #hidePlaceholder(): void {
    if (!this.#placeholder) return;
    this.#placeholder.remove();
    this.#placeholder = null;
  }

  /** Last previewed drop cell (external drags). */
  get previewCell(): { x: number; y: number } | null {
    return this.#preview ? { ...this.#preview } : null;
  }
}
