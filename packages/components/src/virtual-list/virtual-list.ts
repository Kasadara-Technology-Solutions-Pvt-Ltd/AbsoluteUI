/**
 * Virtual List (R20 P3). Renders only the items in view (plus an overscan) of a very large
 * list, with fixed or measured variable item heights. Selectable lists follow the WAI-ARIA
 * APG listbox pattern (single or multiple selection, type-ahead, roving focus); otherwise
 * the list is a plain `role="list"`. The focused item always stays rendered, so focus is
 * never lost while scrolling. Items are positioned through CSS custom properties (CSP-safe).
 * The windowing math lives in `internal/windowing.ts`, shared with the components built on
 * this list.
 */
import { configurationError, createId, defineComponentConfig, emit, formatNumber, getMessage, registerMessages, releaseNode, validators, DisposableGroup, type Density, type Disposer } from '@absoluteui/core';
import { createTypeahead, getNextIndex, isPrintableKey, observeResize } from '@absoluteui/utilities';
import { Windowing, type WindowRange } from '../internal/windowing.js';

export type VirtualListSelection = 'none' | 'single' | 'multiple';
export type VirtualListAlign = 'auto' | 'start' | 'center' | 'end';

export interface VirtualListConfig {
  /** Items rendered beyond each edge of the visible area. */
  overscan: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    virtualList: VirtualListConfig & { locale: string; density: Density };
  }
}

export const virtualListConfig = defineComponentConfig<VirtualListConfig, 'locale' | 'density'>(
  'virtualList',
  { overscan: { default: 5, expected: 'integer 0 to 100', validate: validators.integerInRange(0, 100) } },
  ['locale', 'density'],
);

registerMessages('virtualList', 'en', {
  empty: 'No items',
  loading: 'Loading more items',
  loaded: '{count} items loaded',
  loadFailed: 'Could not load more items. Scroll to try again.',
});

export interface VirtualListOptions<Item = unknown> extends Partial<VirtualListConfig> {
  /** Accessible name of the list, such as "Employees". */
  label: string;
  items: readonly Item[];
  /** Content of one item. Called again whenever the item is rendered; return a new Node each time. */
  renderItem: (item: Item, index: number) => Node;
  /** Stable key of an item, used for selection (`value`). Default: the index as a string. */
  itemKey?: (item: Item, index: number) => string;
  /** Text used for type-ahead. Default: the item itself for strings and numbers, or its `label` property. */
  itemText?: (item: Item, index: number) => string;
  /** Item height in CSS pixels; with `variableHeight`, the estimate before an item is measured. Default by density: 32, 40, or 48. */
  itemHeight?: number;
  /** Measure every rendered item instead of using a fixed height. Default false. */
  variableHeight?: boolean;
  /** Block size of the scroll area as a CSS length, or `null` to fill the host (the host must have a height). Default `'20rem'`. */
  height?: string | null;
  /** `none` (a plain list, default), `single`, or `multiple` (a listbox). */
  selection?: VirtualListSelection;
  /** Keys of the selected items. */
  value?: readonly string[];
  /** Single selection: moving focus with the keyboard also selects. Default false. */
  selectionFollowsFocus?: boolean;
  /** Items that cannot be selected or focused. */
  isDisabled?: (item: Item, index: number) => boolean;
  /** Shown instead of the list when there are no items (text or a Node, such as an Empty State host). */
  empty?: Node | string;
  /** Called when the user nears the end of the list; resolve after appending items with `update({ items })`. */
  loadMore?: (() => Promise<void> | void) | null;
  /** More items can be loaded. Default true while `loadMore` is set. */
  hasMore?: boolean;
  /** Start loading when the last visible item is this close to the end. Default 10. */
  loadMoreThreshold?: number;
  locale?: string;
  density?: Density;
}

/** `aui-change` detail: the selected keys after the user's change, and the item that changed. */
export interface VirtualListChangeDetail {
  value: string[];
  index: number;
}

/** `aui-range-change` detail: the visible items `[start, end)` and the rendered ones (with overscan). */
export interface VirtualListRangeChangeDetail {
  start: number;
  end: number;
  renderedStart: number;
  renderedEnd: number;
}

const HEIGHT_BY_DENSITY: Readonly<Record<Density, number>> = { compact: 32, comfortable: 40, spacious: 48 };
const SELECTIONS: readonly VirtualListSelection[] = ['none', 'single', 'multiple'];
/** Browsers cap element heights (about 17.9 million px in Firefox), which bounds useful item counts. */
const MAX_ITEMS = 1_000_000;
const TYPEAHEAD_MS = 500;
const CSS_LENGTH = /^(?:0|\d+(?:\.\d+)?(?:px|rem|em|vh|svh|dvh|lvh|%|ch|lh|cqh))$/;

interface Row {
  readonly el: HTMLDivElement;
  index: number;
  stop: Disposer | null;
}

export class VirtualList<Item = unknown> {
  readonly host: HTMLElement;
  #options: VirtualListOptions<Item>;
  readonly #doc: Document;
  readonly #id = createId('aui-vl');
  readonly #viewport: HTMLDivElement;
  readonly #canvas: HTMLDivElement;
  readonly #empty: HTMLDivElement;
  readonly #status: HTMLDivElement;
  readonly #win: Windowing;
  readonly #rows = new Map<number, Row>();
  readonly #pool: HTMLDivElement[] = [];
  readonly #group = new DisposableGroup();
  readonly #typeahead = createTypeahead(TYPEAHEAD_MS);
  #typingUntil = 0;
  #value = new Set<string>();
  #active = -1;
  #anchor = -1;
  #range: WindowRange = { start: 0, end: 0 };
  #labels: readonly string[] | null = null;
  #frame = 0;
  #loading = false;
  /** Count when the last load started; another load needs more items or a new scroll. */
  #loadCount = -1;
  #scrolledSinceLoad = true;
  #resolved: Readonly<VirtualListConfig & { locale: string; density: Density }>;
  #estimate: number;

  /** Render into `host` (the host's children are replaced). */
  static create<Item>(host: HTMLElement, options: VirtualListOptions<Item>): VirtualList<Item> {
    return new VirtualList(host, options);
  }

  private constructor(host: HTMLElement, options: VirtualListOptions<Item>) {
    VirtualList.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#resolved = this.#resolve();
    this.#estimate = this.#itemHeight();
    this.#win = new Windowing(options.items.length, this.#estimate);
    this.#value = new Set(options.value ?? []);
    const doc = this.#doc;
    this.#viewport = doc.createElement('div');
    this.#viewport.className = 'aui-virtual-list__viewport';
    this.#viewport.id = `${this.#id}-list`;
    this.#canvas = doc.createElement('div');
    this.#canvas.className = 'aui-virtual-list__canvas';
    this.#canvas.setAttribute('role', 'none');
    this.#viewport.append(this.#canvas);
    this.#empty = doc.createElement('div');
    this.#empty.className = 'aui-virtual-list__empty';
    this.#status = doc.createElement('div');
    this.#status.className = 'aui-virtual-list__status';
    this.#status.setAttribute('role', 'status');

    this.#render();
    host.classList.add('aui-virtual-list');
    host.replaceChildren(this.#viewport, this.#empty, this.#status);
    this.#paint();

    const vp = this.#viewport;
    this.#group.listen(vp, 'scroll', () => {
      this.#scrolledSinceLoad = true;
      this.#schedule();
    }, { passive: true });
    this.#group.listen(vp, 'keydown', (event) => {
      this.#onKey(event);
    });
    this.#group.listen(vp, 'click', (event) => {
      this.#onClick(event);
    });
    this.#group.listen(vp, 'focusin', (event) => {
      const index = this.#indexOf(event.target);
      if (index >= 0 && index !== this.#active && this.#selectable()) {
        this.#active = index;
        this.#syncRows();
      }
    });
    this.#group.add(observeResize(vp, () => {
      this.#schedule();
    }));
    this.#group.add(virtualListConfig.subscribe(() => {
      this.#resolved = this.#resolve();
      this.#relayout();
    }));
    this.#group.add(() => {
      if (this.#frame) this.#doc.defaultView?.cancelAnimationFrame(this.#frame);
      this.#typeahead.reset();
      this.#typingUntil = 0;
    });
  }

  get options(): Readonly<VirtualListOptions<Item>> {
    return this.#options;
  }

  /** Keys of the selected items. */
  get value(): readonly string[] {
    return [...this.#value];
  }

  /** The visible items `[start, end)`. */
  get range(): WindowRange {
    return this.#range;
  }

  /** Index of the focusable (active) item, or -1. */
  get activeIndex(): number {
    return this.#active;
  }

  /** The rendered element of an item, or null when it is not rendered. */
  getItemElement(index: number): HTMLElement | null {
    return this.#rows.get(index)?.el ?? null;
  }

  /** Select by keys (no event). */
  setValue(value: readonly string[]): void {
    this.update({ value });
  }

  /** Scroll so the item is visible (`auto`: only as far as needed). */
  scrollToIndex(index: number, align: VirtualListAlign = 'auto'): void {
    const count = this.#win.count;
    if (count === 0 || !Number.isInteger(index)) return;
    const target = Math.min(count - 1, Math.max(0, index));
    const vp = this.#viewport;
    const view = vp.clientHeight;
    vp.scrollTop = this.#win.scrollFor(target, vp.scrollTop, view, align);
    this.#paint();
    // Variable heights: the first pass measured the items around the target; settle on the real offset.
    if (this.#options.variableHeight === true) {
      const again = this.#win.scrollFor(target, vp.scrollTop, view, align);
      if (Math.abs(again - vp.scrollTop) > 1) {
        vp.scrollTop = again;
        this.#paint();
      }
    }
  }

  /** Move focus to an item (selectable lists), scrolling it into view. */
  focusItem(index: number): void {
    if (!this.#selectable() || this.#win.count === 0) return;
    this.#setActive(Math.min(this.#win.count - 1, Math.max(0, index)), true);
  }

  /** Render the visible items again (after the application changed item objects in place). */
  refresh(): void {
    this.#labels = null;
    for (const row of this.#rows.values()) this.#fill(row);
    this.#paint();
  }

  update(options: Partial<VirtualListOptions<Item>>): void {
    const next = { ...this.#options, ...options };
    VirtualList.#assert(next);
    const previous = { options: this.#options, value: this.#value, resolved: this.#resolved };
    this.#options = next;
    try {
      this.#resolved = this.#resolve();
      if (options.value !== undefined) this.#value = new Set(options.value);
      this.#render();
    } catch (error) {
      this.#options = previous.options;
      this.#value = previous.value;
      this.#resolved = previous.resolved;
      this.#render();
      throw error;
    }
    const itemsChanged = options.items !== undefined && options.items !== previous.options.items;
    const contentChanged = itemsChanged || (options.renderItem !== undefined && options.renderItem !== previous.options.renderItem);
    if (itemsChanged) this.#labels = null;
    if (options.itemText !== undefined) this.#labels = null;
    const sizing = options.itemHeight !== undefined || options.variableHeight !== undefined || options.density !== undefined;
    if (sizing || itemsChanged) this.#relayout(contentChanged);
    else {
      if (contentChanged) for (const row of this.#rows.values()) this.#fill(row);
      this.#paint();
    }
  }

  destroy(): void {
    this.#group.dispose();
    for (const row of this.#rows.values()) {
      row.stop?.();
      releaseNode(row.el.firstChild);
    }
    this.#rows.clear();
    this.#pool.length = 0;
    this.host.replaceChildren();
    this.host.classList.remove('aui-virtual-list', 'aui-virtual-list--selectable', 'aui-virtual-list--variable', 'aui-virtual-list--fill', 'aui-virtual-list--empty');
    for (const p of ['--_aui-virtual-list-height', '--_aui-virtual-list-item']) this.host.style.removeProperty(p);
  }

  static #assert<I>(o: VirtualListOptions<I>): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('VIRTUAL_LIST_OPTIONS', 'Invalid virtual list options.', { component: 'virtual-list', property: `virtualList.${property}`, expected });
    };
    const label: unknown = o.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string');
    const items: unknown = o.items;
    if (!Array.isArray(items) || items.length > MAX_ITEMS) fail('items', `array of at most ${String(MAX_ITEMS)} items`);
    const fns: [string, unknown, boolean][] = [['renderItem', o.renderItem, true], ['itemKey', o.itemKey, false], ['itemText', o.itemText, false], ['isDisabled', o.isDisabled, false]];
    for (const [name, fn, required] of fns) if ((required || fn !== undefined) && typeof fn !== 'function') fail(name, 'function');
    const loadMore: unknown = o.loadMore;
    if (loadMore != null && typeof loadMore !== 'function') fail('loadMore', 'function or null');
    const h: unknown = o.itemHeight;
    if (h !== undefined && (typeof h !== 'number' || !Number.isFinite(h) || h < 8 || h > 2000)) fail('itemHeight', 'number of pixels from 8 to 2000');
    const height: unknown = o.height;
    if (height !== undefined && height !== null && (typeof height !== 'string' || !CSS_LENGTH.test(height.trim()))) fail('height', "CSS length such as '20rem' or '400px', or null");
    if (o.selection !== undefined && !SELECTIONS.includes(o.selection)) fail('selection', '"none" | "single" | "multiple"');
    const value: unknown = o.value;
    if (value !== undefined && (!Array.isArray(value) || !value.every((v) => typeof v === 'string'))) fail('value', 'array of item keys (strings)');
    if (o.selection === 'single' && (o.value?.length ?? 0) > 1) fail('value', 'at most one key with single selection');
    const threshold: unknown = o.loadMoreThreshold;
    if (threshold !== undefined && (typeof threshold !== 'number' || !Number.isInteger(threshold) || threshold < 0)) fail('loadMoreThreshold', 'integer >= 0');
    const empty: unknown = o.empty;
    if (empty !== undefined && typeof empty !== 'string' && !(empty instanceof Node)) fail('empty', 'Node or string');
    for (const name of ['variableHeight', 'selectionFollowsFocus', 'hasMore'] as const) {
      const v: unknown = o[name];
      if (v !== undefined && typeof v !== 'boolean') fail(name, 'boolean');
    }
  }

  #resolve(): Readonly<VirtualListConfig & { locale: string; density: Density }> {
    const o = this.#options;
    return virtualListConfig.resolve({
      ...(o.overscan === undefined ? {} : { overscan: o.overscan }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.density === undefined ? {} : { density: o.density }),
    });
  }

  #itemHeight(): number {
    return this.#options.itemHeight ?? HEIGHT_BY_DENSITY[this.#resolved.density];
  }

  #selectable(): boolean {
    return (this.#options.selection ?? 'none') !== 'none';
  }

  #key(index: number): string {
    return this.#options.itemKey ? this.#options.itemKey(this.#item(index), index) : String(index);
  }

  #disabled(index: number): boolean {
    const fn = this.#options.isDisabled;
    return fn ? fn(this.#item(index), index) : false;
  }

  #text(index: number): string {
    const item: unknown = this.#options.items[index];
    if (this.#options.itemText) return this.#options.itemText(this.#item(index), index);
    if (typeof item === 'string') return item;
    if (typeof item === 'number') return String(item);
    if (typeof item === 'object' && item !== null && 'label' in item) {
      const label: unknown = item.label;
      if (typeof label === 'string') return label;
    }
    return '';
  }

  /** Host-level attributes and the empty and status areas (no item rendering). */
  #render(): void {
    const o = this.#options;
    const { locale } = this.#resolved;
    const m = (id: string, params: Record<string, string> = {}): string => getMessage('virtualList', id, params, locale);
    const emptyText = m('empty');
    const host = this.host;
    const vp = this.#viewport;
    const selection = o.selection ?? 'none';
    const selectable = selection !== 'none';
    const count = o.items.length;
    host.classList.toggle('aui-virtual-list--selectable', selectable);
    host.classList.toggle('aui-virtual-list--variable', o.variableHeight === true);
    const height = o.height === undefined ? '20rem' : o.height;
    host.classList.toggle('aui-virtual-list--fill', height === null);
    if (height === null) host.style.removeProperty('--_aui-virtual-list-height');
    else host.style.setProperty('--_aui-virtual-list-height', height.trim());
    host.style.setProperty('--_aui-virtual-list-item', `${String(this.#itemHeight())}px`);
    host.classList.toggle('aui-virtual-list--empty', count === 0);
    vp.hidden = count === 0;
    if (count === 0) {
      // An empty listbox is not allowed; the empty content replaces it.
      vp.removeAttribute('role');
      vp.removeAttribute('tabindex');
    } else {
      vp.setAttribute('role', selectable ? 'listbox' : 'list');
      // A plain list scrolls with the keyboard from its container; a listbox focuses its items.
      vp.tabIndex = selectable ? -1 : 0;
    }
    vp.setAttribute('aria-label', o.label);
    if (selection === 'multiple') vp.setAttribute('aria-multiselectable', 'true');
    else vp.removeAttribute('aria-multiselectable');
    this.#empty.hidden = count !== 0;
    const empty = o.empty ?? emptyText;
    if (this.#empty.firstChild !== empty) {
      const old = this.#empty.firstChild;
      this.#empty.replaceChildren(typeof empty === 'string' ? this.#doc.createTextNode(empty) : empty);
      releaseNode(old);
    }
    if (this.#value.size > 0 && !selectable) this.#value = new Set();
  }

  /** Item count, height, or density changed: reset the offsets and render again. */
  #relayout(contentChanged = true): void {
    this.#estimate = this.#itemHeight();
    this.host.style.setProperty('--_aui-virtual-list-item', `${String(this.#estimate)}px`);
    const count = this.#options.items.length;
    // A different item count (new page, new filter) may need loading again.
    if (count !== this.#win.count) {
      this.#loadCount = -1;
      this.#scrolledSinceLoad = true;
    }
    this.#win.reset(count, this.#estimate);
    if (this.#active >= count) this.#active = count - 1;
    if (this.#anchor >= count) this.#anchor = -1;
    for (const [index, row] of this.#rows) {
      if (index >= count) this.#recycle(row);
      else if (contentChanged) this.#fill(row);
    }
    this.#render();
    this.#paint();
  }

  #schedule(): void {
    const view = this.#doc.defaultView;
    if (!view || this.#frame) return;
    this.#frame = view.requestAnimationFrame(() => {
      this.#frame = 0;
      this.#paint();
    });
  }

  #createRow(): HTMLDivElement {
    const el = this.#pool.pop() ?? this.#doc.createElement('div');
    el.className = 'aui-virtual-list__item';
    return el;
  }

  /** The item at an index known to be in range (the list may hold `undefined` items itself). */
  #item(index: number): Item {
    return this.#options.items[index] as Item;
  }

  #fill(row: Row): void {
    const old = row.el.firstChild;
    row.el.replaceChildren(this.#options.renderItem(this.#item(row.index), row.index));
    // Render-slot contract: framework integrations dispose of nodes the list no longer shows.
    releaseNode(old);
  }

  #recycle(row: Row): void {
    row.stop?.();
    row.el.remove();
    const old = row.el.firstChild;
    row.el.replaceChildren();
    releaseNode(old);
    this.#rows.delete(row.index);
    this.#pool.push(row.el);
  }

  /** Render the items in the window (plus the active item), measure, and position them. */
  #paint(): void {
    const count = this.#win.count;
    const vp = this.#viewport;
    const view = vp.clientHeight > 0 ? vp.clientHeight : this.#estimate * 10;
    const overscan = this.#resolved.overscan;
    const rendered = this.#win.rendered(vp.scrollTop, view, overscan);
    const wanted = new Set<number>();
    for (let i = rendered.start; i < rendered.end; i++) wanted.add(i);
    if (this.#active >= 0 && this.#active < count) wanted.add(this.#active);
    for (const row of [...this.#rows.values()]) if (!wanted.has(row.index)) this.#recycle(row);
    const added: Row[] = [];
    for (const index of wanted) {
      if (this.#rows.has(index)) continue;
      const row: Row = { el: this.#createRow(), index, stop: null };
      this.#fill(row);
      this.#rows.set(index, row);
      added.push(row);
    }
    // Keep DOM order equal to item order (reading order), without moving existing rows (focus stays).
    if (added.length > 0) {
      const order = [...this.#rows.values()].sort((a, b) => a.index - b.index);
      let cursor = this.#canvas.firstElementChild;
      for (const row of order) {
        if (row.el === cursor) cursor = cursor.nextElementSibling;
        else this.#canvas.insertBefore(row.el, cursor);
      }
    }
    this.#syncRows();
    if (this.#options.variableHeight === true) this.#measure(added);
    this.#position();
    const visible = this.#win.visible(vp.scrollTop, view);
    if (visible.start !== this.#range.start || visible.end !== this.#range.end) {
      this.#range = visible;
      emit(this.host, 'aui-range-change', { start: visible.start, end: visible.end, renderedStart: rendered.start, renderedEnd: rendered.end } satisfies VirtualListRangeChangeDetail);
    }
    this.#maybeLoad();
  }

  /** Measure newly rendered rows (variable heights) and keep the visible content anchored. */
  #measure(added: readonly Row[]): void {
    const vp = this.#viewport;
    const first = this.#win.indexAt(vp.scrollTop);
    let shift = 0;
    for (const row of added) {
      const delta = this.#win.setSize(row.index, row.el.getBoundingClientRect().height);
      if (row.index < first) shift += delta;
      row.stop = observeResize(row.el, (entry) => {
        const size = entry.borderBoxSize[0]?.blockSize ?? row.el.getBoundingClientRect().height;
        const d = this.#win.setSize(row.index, size);
        if (d === 0) return;
        if (row.index < this.#win.indexAt(vp.scrollTop)) vp.scrollTop += d;
        this.#position();
      });
    }
    if (shift !== 0) vp.scrollTop += shift;
  }

  #position(): void {
    this.#canvas.style.setProperty('--_aui-virtual-list-total', `${String(this.#win.total)}px`);
    for (const row of this.#rows.values()) row.el.style.setProperty('--_aui-virtual-list-y', `${String(this.#win.offsetOf(row.index))}px`);
  }

  /** Roles, positions, selection, and the roving tabindex of the rendered rows. */
  #syncRows(): void {
    const selectable = this.#selectable();
    const count = this.#win.count;
    const hasMore = this.#hasMore();
    if (selectable && (this.#active < 0 || this.#active >= count) && count > 0) this.#active = this.#firstEnabled();
    for (const row of this.#rows.values()) {
      const { el, index } = row;
      el.dataset.index = String(index);
      el.setAttribute('aria-posinset', String(index + 1));
      el.setAttribute('aria-setsize', hasMore ? '-1' : String(count));
      if (selectable) {
        el.setAttribute('role', 'option');
        el.id = `${this.#id}-${String(index)}`;
        const selected = this.#value.has(this.#key(index));
        el.setAttribute('aria-selected', String(selected));
        el.classList.toggle('aui-virtual-list__item--selected', selected);
        const disabled = this.#disabled(index);
        if (disabled) el.setAttribute('aria-disabled', 'true');
        else el.removeAttribute('aria-disabled');
        el.tabIndex = index === this.#active ? 0 : -1;
        el.classList.toggle('aui-virtual-list__item--active', index === this.#active);
      } else {
        el.setAttribute('role', 'listitem');
        el.removeAttribute('id');
        el.removeAttribute('aria-selected');
        el.removeAttribute('aria-disabled');
        el.removeAttribute('tabindex');
        el.classList.remove('aui-virtual-list__item--selected', 'aui-virtual-list__item--active');
      }
    }
  }

  #firstEnabled(): number {
    const count = this.#win.count;
    for (let i = 0; i < count && i < 1000; i++) if (!this.#disabled(i)) return i;
    return 0;
  }

  #hasMore(): boolean {
    return this.#options.loadMore != null && this.#options.hasMore !== false;
  }

  #maybeLoad(): void {
    const loadMore = this.#options.loadMore;
    if (!loadMore || !this.#hasMore() || this.#loading) return;
    const count = this.#win.count;
    const threshold = this.#options.loadMoreThreshold ?? 10;
    if (this.#range.end < count - threshold) return;
    if (count === this.#loadCount && !this.#scrolledSinceLoad) return;
    this.#loading = true;
    this.#loadCount = count;
    this.#scrolledSinceLoad = false;
    const locale = this.#resolved.locale;
    const say = (id: string, params: Record<string, string> = {}): void => {
      this.#status.textContent = getMessage('virtualList', id, params, locale);
    };
    this.#viewport.setAttribute('aria-busy', 'true');
    this.#status.classList.add('aui-virtual-list__status--visible');
    this.#status.classList.remove('aui-virtual-list__status--error');
    say('loading');
    const finish = (ok: boolean): void => {
      if (this.#group.disposed) return;
      this.#loading = false;
      this.#viewport.removeAttribute('aria-busy');
      this.#status.classList.toggle('aui-virtual-list__status--visible', !ok);
      this.#status.classList.toggle('aui-virtual-list__status--error', !ok);
      if (ok) say('loaded', { count: formatNumber(this.#options.items.length, {}, locale) });
      else say('loadFailed');
      this.#syncRows();
      // A short list may still end inside the viewport: keep filling it while items arrive.
      if (ok) this.#maybeLoad();
    };
    try {
      Promise.resolve(loadMore()).then(() => {
        finish(true);
      }, () => {
        finish(false);
      });
    } catch {
      finish(false);
    }
  }

  #indexOf(target: EventTarget | null): number {
    if (!(target instanceof Element)) return -1;
    const el = target.closest<HTMLElement>('.aui-virtual-list__item');
    if (!el || !this.#canvas.contains(el)) return -1;
    const index = Number(el.dataset.index);
    return Number.isInteger(index) ? index : -1;
  }

  #setActive(index: number, focus: boolean): void {
    this.#active = index;
    this.scrollToIndex(index);
    this.#syncRows();
    if (focus) this.#rows.get(index)?.el.focus({ preventScroll: true });
  }

  #emit(index: number): void {
    emit(this.host, 'aui-change', { value: [...this.#value], index } satisfies VirtualListChangeDetail);
  }

  #select(index: number, mode: 'replace' | 'toggle' | 'range'): void {
    if (this.#disabled(index)) return;
    const selection = this.#options.selection ?? 'none';
    if (selection === 'none') return;
    const before = new Set(this.#value);
    if (selection === 'single' || mode === 'replace') {
      this.#value = new Set([this.#key(index)]);
      this.#anchor = index;
    } else if (mode === 'toggle') {
      const key = this.#key(index);
      if (this.#value.has(key)) this.#value.delete(key);
      else this.#value.add(key);
      this.#anchor = index;
    } else {
      const from = this.#anchor < 0 ? index : this.#anchor;
      const [lo, hi] = from <= index ? [from, index] : [index, from];
      for (let i = lo; i <= hi; i++) if (!this.#disabled(i)) this.#value.add(this.#key(i));
    }
    this.#syncRows();
    if (before.size !== this.#value.size || [...before].some((k) => !this.#value.has(k))) this.#emit(index);
  }

  #toggleAll(): void {
    const count = this.#win.count;
    const enabled: string[] = [];
    for (let i = 0; i < count; i++) if (!this.#disabled(i)) enabled.push(this.#key(i));
    const all = enabled.every((k) => this.#value.has(k));
    this.#value = all ? new Set() : new Set(enabled);
    this.#syncRows();
    this.#emit(this.#active);
  }

  #onClick(event: MouseEvent): void {
    if (!this.#selectable()) return;
    const index = this.#indexOf(event.target);
    if (index < 0 || this.#disabled(index)) return;
    this.#setActive(index, true);
    const multiple = this.#options.selection === 'multiple';
    this.#select(index, multiple ? (event.shiftKey ? 'range' : 'toggle') : 'replace');
  }

  #onKey(event: KeyboardEvent): void {
    if (!this.#selectable() || event.defaultPrevented) return;
    const count = this.#win.count;
    if (count === 0) return;
    // Keys typed into interactive content inside an item belong to that content.
    const target = event.target;
    if (target instanceof HTMLElement && target !== this.#viewport && !target.classList.contains('aui-virtual-list__item')) return;
    const multiple = this.#options.selection === 'multiple';
    const current = this.#active < 0 ? this.#firstEnabled() : this.#active;
    if (multiple && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.#toggleAll();
      return;
    }
    // Space continues a type-ahead query ("Person 4") instead of selecting.
    const typing = event.key === ' ' && performance.now() < this.#typingUntil;
    if ((event.key === ' ' && !typing) || event.key === 'Enter') {
      event.preventDefault();
      this.#setActive(current, true);
      this.#select(current, multiple ? (event.shiftKey ? 'range' : 'toggle') : 'replace');
      return;
    }
    const page = Math.max(1, this.#range.end - this.#range.start - 1);
    let next = getNextIndex(event.key, current, count, { orientation: 'vertical', loop: false, pageSize: page, isDisabled: (i) => this.#disabled(i) });
    if (next === null && isPrintableKey(event)) {
      this.#typingUntil = performance.now() + TYPEAHEAD_MS;
      this.#labels ??= Array.from({ length: count }, (_, i) => this.#text(i));
      const found = this.#typeahead.handle(event.key, this.#labels, current, (i) => this.#disabled(i));
      next = found >= 0 ? found : null;
      if (next === null) return;
    }
    if (next === null) return;
    event.preventDefault();
    this.#setActive(next, true);
    if (multiple && event.shiftKey) this.#select(next, 'range');
    else if (!multiple && this.#options.selectionFollowsFocus === true) this.#select(next, 'replace');
    else if (!multiple || !event.shiftKey) this.#anchor = next;
  }
}
