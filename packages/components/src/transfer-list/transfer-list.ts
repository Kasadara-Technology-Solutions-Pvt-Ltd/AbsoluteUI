/**
 * Transfer List (R20 P9). Moves items between two lists, "Available" and "Selected":
 * team assignment, permissions, report columns. Each list is a WAI-ARIA multi-select
 * listbox (APG Listbox, recommended selection model) with focus kept on the listbox and
 * the active option conveyed through aria-activedescendant. Each list has a search box and
 * an item count; four buttons move the checked or all (visible) items; Enter and
 * double-click move too, and pointer drag between the lists is optional (`draggable`).
 * Long lists are windowed: only the visible rows (plus overscan) are in the DOM, so lists
 * of 10,000 items stay fast. A Form control: it validates, serializes, and resets with
 * Form, and native forms receive one hidden input per selected value.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, formatNumber, getMessage, registerMessages } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, createTypeahead, getNextIndex, isPrintableKey, type Typeahead } from '@absoluteui/utilities';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, setText, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { resolveValidity, runValidator, VALID, type FieldValidity, type Outcome } from '../internal/validation.js';

export interface TransferListConfig {
  validationTiming: ValidationTiming;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    transferList: TransferListConfig & { locale: string };
  }
}

export const transferListConfig = defineComponentConfig<TransferListConfig, 'locale'>(
  'transferList',
  { validationTiming: validationTimingSpec },
  ['locale'],
);

registerMessages('transferList', 'en', {
  available: 'Available',
  selected: 'Selected',
  search: 'Search {list}',
  count: '{shown} of {total}',
  countAll: '{total} items',
  countOne: '1 item',
  checked: '{count} checked',
  moveChecked: 'Move checked items to {list}',
  moveAll: 'Move all items to {list}',
  movedOne: '1 item moved to {list}',
  movedMany: '{count} items moved to {list}',
  empty: 'No items',
  noMatches: 'No matches',
  limitReached: 'You can select up to {max} items.',
});

export type TransferListValue = string[];

/** Which list. */
export type TransferListSide = 'available' | 'selected';

export interface TransferListItem {
  readonly value: string;
  readonly label: string;
  /** Secondary text on the same row (part of the option's name). */
  readonly description?: string;
  /** Shown but cannot be checked or moved. */
  readonly disabled?: boolean;
}

export interface TransferListIcons {
  error: IconRef;
  /** Move checked items toward Selected (mirrored in right-to-left). */
  moveChecked: IconRef;
  moveAll: IconRef;
  /** Move checked items back to Available (mirrored in right-to-left). */
  removeChecked: IconRef;
  removeAll: IconRef;
}

export interface TransferListOptions extends Partial<TransferListConfig> {
  /** Visible label of the whole control (required accessible name). */
  label: string;
  hideLabel?: boolean;
  description?: string;
  items: readonly TransferListItem[];
  /** Selected values, in the order they appear in the Selected list. Unknown values are dropped. */
  value?: readonly string[];
  /** Form field name: one hidden input per selected value. */
  name?: string;
  required?: boolean;
  /** At least this many items must be selected (when any are, or when required). */
  minSelected?: number;
  /** Hard limit: moves beyond it are refused and announced. */
  maxSelected?: number;
  disabled?: boolean;
  /** Lists can be browsed and searched, but nothing moves. */
  readOnly?: boolean;
  /** Show a search box above each list. Default true. */
  searchable?: boolean;
  /** Drag items between the lists with a pointer (the buttons are the keyboard alternative). Default false. */
  draggable?: boolean;
  /** List titles; default "Available" and "Selected". */
  titles?: { readonly available?: string; readonly selected?: string };
  /** Rows visible in each list before it scrolls. Default 8. */
  visibleRows?: number;
  validate?: (value: readonly string[]) => string | null;
  locale?: string;
  icons?: Partial<TransferListIcons>;
}

/** `aui-change` detail: the new value and which values moved where. */
export interface TransferListValueDetail {
  value: TransferListValue;
  validity: FieldValidity;
  moved: string[];
  to: TransferListSide;
}

const OVERSCAN = 6;
const DEFAULT_ROW = 32;

interface Panel {
  readonly side: TransferListSide;
  readonly root: HTMLDivElement;
  readonly title: HTMLSpanElement;
  readonly count: HTMLSpanElement;
  readonly search: HTMLInputElement;
  readonly listbox: HTMLUListElement;
  readonly empty: HTMLDivElement;
  query: string;
  readonly checked: Set<string>;
  active: number;
  anchor: number;
  rows: TransferListItem[];
  frame: number;
  readonly typeahead: Typeahead;
}

export class TransferList implements FormControl {
  readonly host: HTMLElement;
  #options: TransferListOptions;
  #value: string[];
  #initial: string[];
  #byValue = new Map<string, { item: TransferListItem; index: number }>();
  #validity: FieldValidity = VALID;
  #rowHeight = DEFAULT_ROW;
  #drag: { from: TransferListSide; values: string[]; pointer: number; x: number; y: number; started: boolean } | null = null;
  #suppressClick = false;
  readonly #buttonIcons = new WeakMap<HTMLButtonElement, IconRef>();
  /** The item each rendered option shows, so a re-render keeps option nodes whose item is unchanged. */
  readonly #optionItems = new WeakMap<HTMLLIElement, TransferListItem>();
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #body: HTMLDivElement;
  readonly #panels: Record<TransferListSide, Panel>;
  readonly #buttons: { moveChecked: HTMLButtonElement; moveAll: HTMLButtonElement; removeChecked: HTMLButtonElement; removeAll: HTMLButtonElement };
  readonly #inputs: HTMLDivElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: TransferListOptions): TransferList {
    return new TransferList(host, options);
  }

  private constructor(host: HTMLElement, options: TransferListOptions) {
    TransferList.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#index(options.items);
    this.#value = this.#normalize(options.value ?? []);
    this.#initial = [...this.#value];
    const doc = this.#doc;
    this.#chrome = new FieldChrome(doc, 'label', 'aui-transfer-list');
    this.#body = doc.createElement('div');
    this.#body.className = 'aui-transfer-list__body';
    this.#body.setAttribute('role', 'group');
    this.#body.setAttribute('aria-labelledby', this.#chrome.label.id);
    this.#panels = { available: this.#panel('available'), selected: this.#panel('selected') };
    const button = (cls: string): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = `aui-transfer-list__move ${cls}`;
      return b;
    };
    this.#buttons = {
      moveChecked: button('aui-transfer-list__move--checked'),
      moveAll: button('aui-transfer-list__move--all'),
      removeChecked: button('aui-transfer-list__remove--checked'),
      removeAll: button('aui-transfer-list__remove--all'),
    };
    const actions = doc.createElement('div');
    actions.className = 'aui-transfer-list__actions';
    actions.append(this.#buttons.moveChecked, this.#buttons.moveAll, this.#buttons.removeChecked, this.#buttons.removeAll);
    this.#body.append(this.#panels.available.root, actions, this.#panels.selected.root);
    this.#inputs = doc.createElement('div');
    this.#inputs.hidden = true;

    // Render first: invalid options (config, messages) throw before the host is touched.
    this.#render();
    host.classList.add('aui-field', 'aui-transfer-list');
    host.replaceChildren(this.#chrome.label, this.#chrome.description, this.#body, this.#chrome.error, this.#inputs);
    this.#measure();
    this.#bind();
    this.#group.add(registerControl(this));
    this.#group.add(transferListConfig.subscribe(() => {
      this.#render();
    }));
  }

  // FormControl contract.
  get name(): string | null {
    return this.#options.name ?? null;
  }

  get label(): string {
    return this.#options.label;
  }

  get disabled(): boolean {
    return this.#options.disabled === true;
  }

  get validity(): FieldValidity {
    return this.#validity;
  }

  get dirty(): boolean {
    return this.#value.length !== this.#initial.length || this.#value.some((v, i) => v !== this.#initial[i]);
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<TransferListOptions> {
    return this.#options;
  }

  /** Selected values in Selected-list order. */
  get value(): TransferListValue {
    return [...this.#value];
  }

  getFormValue(): string[] {
    return [...this.#value];
  }

  reportValidity(): boolean {
    this.#state.submitted = true;
    this.#render();
    return this.#validity.valid;
  }

  setCustomError(message: string | null): void {
    this.#state.customError = message === '' ? null : message;
    this.#render();
  }

  focus(): void {
    this.#panels.available.listbox.focus();
  }

  reset(): void {
    this.#value = [...this.#initial];
    this.#state.reset();
    for (const p of Object.values(this.#panels)) {
      p.checked.clear();
      p.query = '';
      p.search.value = '';
      p.active = -1;
      p.anchor = -1;
    }
    this.#render();
  }

  /** Set the selected values (no event). Unknown values are dropped. */
  setValue(value: readonly string[]): void {
    this.update({ value });
  }

  update(options: Partial<TransferListOptions>): void {
    const next = { ...this.#options, ...options };
    TransferList.#assert(next);
    const previous = { options: this.#options, value: this.#value, map: this.#byValue };
    this.#options = next;
    if (options.items !== undefined) this.#index(next.items);
    this.#value = this.#normalize(options.value ?? this.#value);
    if ('value' in options) this.#state.customError = null;
    try {
      this.#render();
    } catch (error) {
      this.#options = previous.options;
      this.#value = previous.value;
      this.#byValue = previous.map;
      this.#render();
      throw error;
    }
  }

  destroy(): void {
    this.#group.dispose();
    for (const p of Object.values(this.#panels)) cancelAnimationFrame(p.frame);
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-transfer-list', 'aui-transfer-list--disabled', 'aui-transfer-list--invalid', 'aui-transfer-list--dragging');
  }

  static #assert(options: TransferListOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('TRANSFER_LIST_OPTIONS', 'Invalid transfer list options.', { component: 'transferList', property: `transferList.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string');
    const items: unknown = options.items;
    if (!Array.isArray(items)) fail('items', 'TransferListItem[]');
    const seen = new Set<string>();
    for (const item of options.items as readonly { value?: unknown; label?: unknown }[]) {
      if (typeof item.value !== 'string' || typeof item.label !== 'string') fail('items', '{ value: string, label: string }[]');
      if (seen.has(item.value as string)) fail('items', 'unique values');
      seen.add(item.value as string);
    }
    const value: unknown = options.value;
    if (value !== undefined && !(Array.isArray(value) && value.every((v) => typeof v === 'string'))) fail('value', 'string[]');
    const count = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v >= 0;
    if (options.minSelected !== undefined && !count(options.minSelected)) fail('minSelected', 'integer >= 0');
    if (options.maxSelected !== undefined && !(count(options.maxSelected) && options.maxSelected > 0)) fail('maxSelected', 'integer >= 1');
    if (options.minSelected !== undefined && options.maxSelected !== undefined && options.minSelected > options.maxSelected) fail('minSelected', 'minSelected <= maxSelected');
    if (options.visibleRows !== undefined && !(count(options.visibleRows) && options.visibleRows >= 3 && options.visibleRows <= 50)) fail('visibleRows', 'integer from 3 to 50');
    if (options.validate !== undefined && typeof options.validate !== 'function') fail('validate', '(value: readonly string[]) => string | null');
  }

  #index(items: readonly TransferListItem[]): void {
    this.#byValue = new Map(items.map((item, index) => [item.value, { item, index }]));
  }

  #normalize(value: readonly string[]): string[] {
    const out: string[] = [];
    for (const v of value) if (this.#byValue.has(v) && !out.includes(v)) out.push(v);
    return out;
  }

  #config(): Readonly<TransferListConfig & { locale: string }> {
    const o = this.#options;
    return transferListConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #panel(side: TransferListSide): Panel {
    const doc = this.#doc;
    const root = doc.createElement('div');
    root.className = `aui-transfer-list__panel aui-transfer-list__panel--${side}`;
    const head = doc.createElement('div');
    head.className = 'aui-transfer-list__head';
    const title = doc.createElement('span');
    title.className = 'aui-transfer-list__title';
    title.id = createId(`aui-transfer-list-${side}`);
    const count = doc.createElement('span');
    count.className = 'aui-transfer-list__count';
    count.id = createId('aui-transfer-list-count');
    // Counts change with filtering and moves; polite status keeps screen-reader users informed.
    count.setAttribute('role', 'status');
    head.append(title, count);
    const search = doc.createElement('input');
    search.type = 'search';
    search.className = 'aui-transfer-list__search';
    search.autocomplete = 'off';
    const listbox = doc.createElement('ul');
    listbox.className = 'aui-transfer-list__list';
    listbox.id = createId(`aui-transfer-list-${side}-list`);
    listbox.setAttribute('role', 'listbox');
    listbox.setAttribute('aria-multiselectable', 'true');
    listbox.setAttribute('aria-labelledby', title.id);
    listbox.setAttribute('aria-describedby', count.id);
    search.setAttribute('aria-controls', listbox.id);
    const empty = doc.createElement('div');
    empty.className = 'aui-transfer-list__empty';
    empty.setAttribute('aria-hidden', 'true');
    root.append(head, search, listbox, empty);
    return { side, root, title, count, search, listbox, empty, query: '', checked: new Set(), active: -1, anchor: -1, rows: [], frame: 0, typeahead: createTypeahead() };
  }

  #title(side: TransferListSide, locale: string): string {
    return this.#options.titles?.[side] ?? getMessage('transferList', side, {}, locale);
  }

  /** Items of a side, filtered by its query. */
  #rowsOf(side: TransferListSide, query: string, locale: string): { rows: TransferListItem[]; total: number } {
    const all = side === 'selected'
      ? this.#value.map((v) => this.#byValue.get(v)?.item).filter((i): i is TransferListItem => i !== undefined)
      : this.#options.items.filter((i) => !this.#value.includes(i.value));
    const q = query.trim().toLocaleLowerCase(locale);
    const rows = q === '' ? all : all.filter((i) => `${i.label} ${i.description ?? ''}`.toLocaleLowerCase(locale).includes(q));
    return { rows, total: all.length };
  }

  #render(): void {
    const o = this.#options;
    const { locale, validationTiming } = this.#config();
    const titles = { available: this.#title('available', locale), selected: this.#title('selected', locale) };
    // Everything that can throw (messages, validate) runs before the DOM changes.
    const outcome = this.#outcome();
    const custom = outcome.error === null ? runValidator(o.validate, this.#value) : null;
    const validity = resolveValidity(outcome, { locale, kind: 'choice', formatNumber: (n) => formatNumber(n, {}, locale) }, custom, this.#state.customError);
    const labels = {
      moveChecked: getMessage('transferList', 'moveChecked', { list: titles.selected }, locale),
      moveAll: getMessage('transferList', 'moveAll', { list: titles.selected }, locale),
      removeChecked: getMessage('transferList', 'moveChecked', { list: titles.available }, locale),
      removeAll: getMessage('transferList', 'moveAll', { list: titles.available }, locale),
    };
    this.#validity = validity;
    const disabled = o.disabled === true;
    const readOnly = o.readOnly === true;
    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    const show = !validity.valid && this.#state.shouldShow(validationTiming);
    this.#chrome.setError(show ? validity.message : '', o.icons?.error ?? 'alert-circle');
    setDescribedBy(this.#body, this.#chrome.describedBy());
    this.host.classList.toggle('aui-transfer-list--disabled', disabled);
    this.host.classList.toggle('aui-transfer-list--invalid', show);
    this.#body.style.setProperty('--_aui-transfer-list-rows', String(o.visibleRows ?? 8));

    for (const p of Object.values(this.#panels)) {
      const { rows, total } = this.#rowsOf(p.side, p.query, locale);
      p.rows = rows;
      // Checked items that left the side (moved or removed) are forgotten.
      const sideValues = new Set(p.side === 'selected' ? this.#value : o.items.filter((i) => !this.#value.includes(i.value)).map((i) => i.value));
      for (const v of [...p.checked]) if (!sideValues.has(v) || this.#byValue.get(v)?.item.disabled === true) p.checked.delete(v);
      if (p.active >= rows.length) p.active = rows.length - 1;
      setText(p.title, titles[p.side]);
      const shown = formatNumber(rows.length, {}, locale);
      const count = rows.length !== total
        ? getMessage('transferList', 'count', { shown, total: formatNumber(total, {}, locale) }, locale)
        : total === 1 ? getMessage('transferList', 'countOne', {}, locale) : getMessage('transferList', 'countAll', { total: shown }, locale);
      const checked = p.checked.size > 0 ? `, ${getMessage('transferList', 'checked', { count: formatNumber(p.checked.size, {}, locale) }, locale)}` : '';
      setText(p.count, `${count}${checked}`);
      p.search.hidden = o.searchable === false;
      p.search.disabled = disabled;
      p.search.setAttribute('aria-label', getMessage('transferList', 'search', { list: titles[p.side] }, locale));
      setText(p.empty, total === 0 ? getMessage('transferList', 'empty', {}, locale) : getMessage('transferList', 'noMatches', {}, locale));
      p.empty.hidden = rows.length > 0;
      const lb = p.listbox;
      lb.tabIndex = disabled ? -1 : 0;
      if (disabled) lb.setAttribute('aria-disabled', 'true');
      else lb.removeAttribute('aria-disabled');
      if (readOnly) lb.setAttribute('aria-readonly', 'true');
      else lb.removeAttribute('aria-readonly');
      if (p.side === 'selected') {
        if (o.required === true) lb.setAttribute('aria-required', 'true');
        else lb.removeAttribute('aria-required');
        setInvalid(lb, show);
      }
      this.#renderWindow(p);
    }

    const locked = disabled || readOnly;
    const enabled = (rows: readonly TransferListItem[]): TransferListItem[] => rows.filter((i) => i.disabled !== true);
    const room = o.maxSelected === undefined ? Infinity : o.maxSelected - this.#value.length;
    const avail = this.#panels.available;
    const sel = this.#panels.selected;
    const set = (b: HTMLButtonElement, label: string, icon: IconRef, off: boolean): void => {
      b.setAttribute('aria-label', label);
      b.title = label;
      b.disabled = off;
      if (this.#buttonIcons.get(b) !== icon) {
        b.replaceChildren(renderIcon(icon, { doc: this.#doc }));
        this.#buttonIcons.set(b, icon);
      }
    };
    set(this.#buttons.moveChecked, labels.moveChecked, o.icons?.moveChecked ?? 'chevron-right', locked || avail.checked.size === 0 || avail.checked.size > room);
    set(this.#buttons.moveAll, labels.moveAll, o.icons?.moveAll ?? 'chevrons-right', locked || enabled(avail.rows).length === 0 || enabled(avail.rows).length > room);
    set(this.#buttons.removeChecked, labels.removeChecked, o.icons?.removeChecked ?? 'chevron-left', locked || sel.checked.size === 0);
    set(this.#buttons.removeAll, labels.removeAll, o.icons?.removeAll ?? 'chevrons-left', locked || enabled(sel.rows).length === 0);

    // Native form submission: one hidden input per value.
    const name = o.name;
    if (name === undefined || name === '' || disabled) this.#inputs.replaceChildren();
    else {
      this.#inputs.replaceChildren(...this.#value.map((v) => {
        const input = this.#doc.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = v;
        return input;
      }));
    }
  }

  #outcome(): Outcome {
    const n = this.#value.length;
    const o = this.#options;
    if (n === 0 && o.required === true) return { error: 'value-missing', params: {} };
    if (o.minSelected !== undefined && n < o.minSelected && (n > 0 || o.required === true)) return { error: 'too-few-selected', params: { min: o.minSelected } };
    if (o.maxSelected !== undefined && n > o.maxSelected) return { error: 'too-many-selected', params: { max: o.maxSelected } };
    return { error: null, params: {} };
  }

  /** Renders the visible rows of a list (windowing): padding stands in for the rows outside. */
  #renderWindow(p: Panel): void {
    const lb = p.listbox;
    const n = p.rows.length;
    const rows = this.#options.visibleRows ?? 8;
    const h = this.#rowHeight;
    const viewport = lb.clientHeight > 0 ? lb.clientHeight : rows * h;
    const top = lb.scrollTop;
    const start = Math.max(0, Math.floor(top / h) - OVERSCAN);
    const end = Math.min(n, Math.ceil((top + viewport) / h) + OVERSCAN);
    lb.style.setProperty('--_aui-transfer-list-before', `${String(start * h)}px`);
    lb.style.setProperty('--_aui-transfer-list-after', `${String(Math.max(0, n - end) * h)}px`);
    const disabled = this.#options.disabled === true;
    // Option nodes are reused (keyed by id) instead of recreated: replacing the node under the
    // pointer between mousedown and mouseup (focus re-renders) or between the two clicks of a
    // double-click (click re-renders) would make the browser drop the click or dblclick.
    const existing = new Map<string, HTMLLIElement>();
    for (const child of Array.from(lb.children)) if (child instanceof HTMLLIElement) existing.set(child.id, child);
    const nodes: HTMLLIElement[] = [];
    for (let i = start; i < end; i++) {
      const item = p.rows[i];
      if (!item) continue;
      const id = this.#optionId(p, item);
      const reused = existing.get(id);
      if (reused && this.#optionItems.get(reused) === item) {
        this.#updateOption(reused, p, item, i, n, disabled);
        nodes.push(reused);
        continue;
      }
      const li = this.#doc.createElement('li');
      li.className = 'aui-transfer-list__option';
      li.id = id;
      li.setAttribute('role', 'option');
      this.#updateOption(li, p, item, i, n, disabled);
      this.#optionItems.set(li, item);
      const check = this.#doc.createElement('span');
      check.className = 'aui-transfer-list__check';
      check.setAttribute('aria-hidden', 'true');
      check.append(renderIcon('check', { doc: this.#doc }));
      const label = this.#doc.createElement('span');
      label.className = 'aui-transfer-list__label';
      label.textContent = item.label;
      li.append(check, label);
      if (item.description !== undefined && item.description !== '') {
        const d = this.#doc.createElement('span');
        d.className = 'aui-transfer-list__desc';
        d.textContent = item.description;
        li.append(d);
      }
      nodes.push(li);
    }
    // Reconcile in place: remove options outside the window, then put the rest in order
    // without detaching nodes that are already where they belong.
    const keep = new Set<Node>(nodes);
    for (const child of Array.from(lb.childNodes)) if (!keep.has(child)) child.remove();
    nodes.forEach((node, i) => {
      const at = lb.childNodes[i];
      if (at !== node) lb.insertBefore(node, at ?? null);
    });
    // While rows are swapped the content is briefly shorter, and WebKit clamps the scroll
    // position then (End landed 14 rows short of the last option); keep the offset this window is for.
    if (lb.scrollTop !== top) lb.scrollTop = top;
    const active = p.rows[p.active];
    // The active option must exist in the DOM; when it is scrolled out of the window, no option is active.
    if (active && p.active >= start && p.active < end) lb.setAttribute('aria-activedescendant', this.#optionId(p, active));
    else lb.removeAttribute('aria-activedescendant');
  }

  /** State that changes between renders of the same item: checked, position, active, disabled, draggable. */
  #updateOption(li: HTMLLIElement, p: Panel, item: TransferListItem, i: number, n: number, disabled: boolean): void {
    li.setAttribute('aria-selected', String(p.checked.has(item.value)));
    li.setAttribute('aria-setsize', String(n));
    li.setAttribute('aria-posinset', String(i + 1));
    li.dataset.index = String(i);
    if (item.disabled === true || disabled) li.setAttribute('aria-disabled', 'true');
    else li.removeAttribute('aria-disabled');
    li.classList.toggle('aui-transfer-list__option--active', i === p.active);
    li.classList.toggle('aui-transfer-list__option--draggable', this.#options.draggable === true && !disabled && this.#options.readOnly !== true && item.disabled !== true);
  }

  #optionId(p: Panel, item: TransferListItem): string {
    return `${p.listbox.id}-${String(this.#byValue.get(item.value)?.index ?? 0)}`;
  }

  /** Row height from a rendered option (density and font size can change it). */
  #measure(): void {
    const row = this.host.querySelector<HTMLElement>('.aui-transfer-list__option');
    const h = row?.getBoundingClientRect().height ?? 0;
    if (h > 0 && Math.abs(h - this.#rowHeight) > 0.5) {
      this.#rowHeight = h;
      for (const p of Object.values(this.#panels)) this.#renderWindow(p);
    }
  }

  #scrollToActive(p: Panel): void {
    const lb = p.listbox;
    const h = this.#rowHeight;
    const top = p.active * h;
    const viewport = lb.clientHeight > 0 ? lb.clientHeight : (this.#options.visibleRows ?? 8) * h;
    if (top < lb.scrollTop) lb.scrollTop = top;
    else if (top + h > lb.scrollTop + viewport) lb.scrollTop = top + h - viewport;
    this.#renderWindow(p);
  }

  #other(side: TransferListSide): TransferListSide {
    return side === 'available' ? 'selected' : 'available';
  }

  #bind(): void {
    const g = this.#group;
    observePointer(this.#doc);
    for (const p of Object.values(this.#panels)) {
      g.listen(p.search, 'input', () => {
        p.query = p.search.value;
        p.active = p.rows.length > 0 ? 0 : -1;
        p.listbox.scrollTop = 0;
        this.#render();
      });
      g.listen(p.search, 'keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          p.listbox.focus();
        }
      });
      g.listen(p.listbox, 'scroll', () => {
        cancelAnimationFrame(p.frame);
        p.frame = requestAnimationFrame(() => {
          this.#renderWindow(p);
        });
      }, { passive: true });
      g.listen(p.listbox, 'focus', () => {
        if (p.active < 0 && p.rows.length > 0) {
          p.active = 0;
          this.#scrollToActive(p);
        } else this.#renderWindow(p);
        this.#measure();
      });
      g.listen(p.listbox, 'keydown', (event) => {
        this.#onKey(p, event);
      });
      g.listen(p.listbox, 'click', (event) => {
        this.#onClick(p, event);
      });
      g.listen(p.listbox, 'dblclick', (event) => {
        const index = this.#indexAt(event);
        const item = index === null ? undefined : p.rows[index];
        if (item && item.disabled !== true) this.#move(p.side, [item.value]);
      });
      g.listen(p.listbox, 'pointerdown', (event) => {
        this.#onPointerDown(p, event);
      });
      g.listen(p.listbox, 'pointermove', (event) => {
        this.#onPointerMove(event);
      });
      g.listen(p.listbox, 'pointerup', (event) => {
        this.#onPointerEnd(event, true);
      });
      g.listen(p.listbox, 'pointercancel', (event) => {
        this.#onPointerEnd(event, false);
      });
    }
    const after = (b: HTMLButtonElement, from: TransferListSide): void => {
      // A button that became disabled loses focus; keep it in the source list instead.
      if (b.disabled && this.#doc.activeElement !== b) this.#panels[from].listbox.focus();
    };
    g.listen(this.#buttons.moveChecked, 'click', () => {
      this.#move('available', [...this.#panels.available.checked]);
      after(this.#buttons.moveChecked, 'available');
    });
    g.listen(this.#buttons.moveAll, 'click', () => {
      this.#move('available', this.#panels.available.rows.map((i) => i.value));
      after(this.#buttons.moveAll, 'available');
    });
    g.listen(this.#buttons.removeChecked, 'click', () => {
      this.#move('selected', [...this.#panels.selected.checked]);
      after(this.#buttons.removeChecked, 'selected');
    });
    g.listen(this.#buttons.removeAll, 'click', () => {
      this.#move('selected', this.#panels.selected.rows.map((i) => i.value));
      after(this.#buttons.removeAll, 'selected');
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
  }

  #locked(): boolean {
    return this.#options.disabled === true || this.#options.readOnly === true;
  }

  #checkable(p: Panel, index: number): boolean {
    const item = p.rows[index];
    return item !== undefined && item.disabled !== true;
  }

  #checkRange(p: Panel, from: number, to: number): void {
    p.checked.clear();
    const [a, b] = from <= to ? [from, to] : [to, from];
    for (let i = Math.max(0, a); i <= b; i++) {
      const item = p.rows[i];
      if (item && this.#checkable(p, i)) p.checked.add(item.value);
    }
  }

  #toggle(p: Panel, index: number): void {
    const item = p.rows[index];
    if (!item || !this.#checkable(p, index)) return;
    if (p.checked.has(item.value)) p.checked.delete(item.value);
    else p.checked.add(item.value);
    p.anchor = index;
  }

  #onKey(p: Panel, event: KeyboardEvent): void {
    if (this.#options.disabled === true) return;
    const n = p.rows.length;
    const locked = this.#locked();
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      if (locked) return;
      const enabled = p.rows.filter((i) => i.disabled !== true);
      const all = enabled.length > 0 && enabled.every((i) => p.checked.has(i.value));
      p.checked.clear();
      if (!all) for (const i of enabled) p.checked.add(i.value);
      this.#render();
      return;
    }
    const next = getNextIndex(event.key, p.active, n, { orientation: 'vertical', loop: false, pageSize: (this.#options.visibleRows ?? 8) - 1 });
    if (next !== null) {
      event.preventDefault();
      if (p.anchor < 0) p.anchor = Math.max(0, p.active);
      p.active = next;
      if (event.shiftKey && !locked) this.#checkRange(p, p.anchor, next);
      else if (!event.shiftKey) p.anchor = next;
      this.#render();
      this.#scrollToActive(p);
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      if (locked || p.active < 0) return;
      if (event.shiftKey && p.anchor >= 0) this.#checkRange(p, p.anchor, p.active);
      else this.#toggle(p, p.active);
      this.#render();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (locked) return;
      const active = p.rows[p.active];
      const values = p.checked.size > 0 ? [...p.checked] : active && active.disabled !== true ? [active.value] : [];
      this.#move(p.side, values);
      return;
    }
    if (isPrintableKey(event) && n > 0) {
      const index = p.typeahead.handle(event.key, p.rows.map((i) => i.label), p.active);
      if (index >= 0) {
        event.preventDefault();
        p.active = index;
        p.anchor = index;
        this.#render();
        this.#scrollToActive(p);
      }
    }
  }

  #indexAt(event: Event): number | null {
    const target = event.target;
    const li = target instanceof Element ? target.closest<HTMLElement>('.aui-transfer-list__option') : null;
    const index = li?.dataset.index;
    return index === undefined ? null : Number(index);
  }

  #onClick(p: Panel, event: MouseEvent): void {
    if (this.#suppressClick) {
      this.#suppressClick = false;
      return;
    }
    const index = this.#indexAt(event);
    if (index === null || this.#options.disabled === true) return;
    p.active = index;
    if (!this.#locked()) {
      if (event.shiftKey && p.anchor >= 0) this.#checkRange(p, p.anchor, index);
      else this.#toggle(p, index);
    }
    p.listbox.focus();
    this.#render();
  }

  /** Moves `values` from `from` to the other list; returns whether anything moved. */
  #move(from: TransferListSide, values: readonly string[]): boolean {
    if (this.#locked()) return false;
    const { locale } = this.#config();
    const movable = values.filter((v) => {
      const entry = this.#byValue.get(v);
      return entry !== undefined && entry.item.disabled !== true && (from === 'selected') === this.#value.includes(v);
    });
    if (movable.length === 0) return false;
    const to = this.#other(from);
    if (to === 'selected') {
      const max = this.#options.maxSelected;
      if (max !== undefined && this.#value.length + movable.length > max) {
        announce(getMessage('transferList', 'limitReached', { max: formatNumber(max, {}, locale) }, locale), 'assertive', this.#doc);
        return false;
      }
      // Items keep their source order (the order of `items`).
      const ordered = [...movable].sort((a, b) => (this.#byValue.get(a)?.index ?? 0) - (this.#byValue.get(b)?.index ?? 0));
      this.#value = [...this.#value, ...ordered];
    } else {
      const out = new Set(movable);
      this.#value = this.#value.filter((v) => !out.has(v));
    }
    const source = this.#panels[from];
    for (const v of movable) source.checked.delete(v);
    source.anchor = -1;
    this.#state.dirty = true;
    this.#state.customError = null;
    this.#render();
    if (source.active >= source.rows.length) source.active = source.rows.length - 1;
    this.#renderWindow(source);
    const list = this.#title(to, locale);
    announce(movable.length === 1 ? getMessage('transferList', 'movedOne', { list }, locale) : getMessage('transferList', 'movedMany', { count: formatNumber(movable.length, {}, locale), list }, locale), 'polite', this.#doc);
    emit(this.host, 'aui-change', { value: this.value, validity: this.#validity, moved: [...movable], to } satisfies TransferListValueDetail);
    return true;
  }

  #onPointerDown(p: Panel, event: PointerEvent): void {
    if (this.#options.draggable !== true || this.#locked() || event.button !== 0) return;
    const index = this.#indexAt(event);
    const item = index === null ? undefined : p.rows[index];
    if (!item || item.disabled === true) return;
    // Dragging a checked item drags every checked item of the list.
    const values = p.checked.has(item.value) ? [...p.checked] : [item.value];
    this.#drag = { from: p.side, values, pointer: event.pointerId, x: event.clientX, y: event.clientY, started: false };
    p.listbox.setPointerCapture(event.pointerId);
  }

  #targetAt(event: PointerEvent): TransferListSide | null {
    const el = this.#doc.elementFromPoint(event.clientX, event.clientY);
    if (!el) return null;
    for (const p of Object.values(this.#panels)) if (p.root.contains(el)) return p.side;
    return null;
  }

  #onPointerMove(event: PointerEvent): void {
    const drag = this.#drag;
    if (drag?.pointer !== event.pointerId) return;
    if (!drag.started && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
    drag.started = true;
    this.host.classList.add('aui-transfer-list--dragging');
    const target = this.#targetAt(event);
    for (const p of Object.values(this.#panels)) p.root.classList.toggle('aui-transfer-list__panel--drop', target === p.side && p.side !== drag.from);
  }

  #onPointerEnd(event: PointerEvent, commit: boolean): void {
    const drag = this.#drag;
    if (drag?.pointer !== event.pointerId) return;
    this.#drag = null;
    const source = this.#panels[drag.from].listbox;
    if (source.hasPointerCapture(event.pointerId)) source.releasePointerCapture(event.pointerId);
    this.host.classList.remove('aui-transfer-list--dragging');
    for (const p of Object.values(this.#panels)) p.root.classList.remove('aui-transfer-list__panel--drop');
    if (!drag.started) return;
    // The click that follows the release must not toggle the item under the pointer.
    this.#suppressClick = true;
    setTimeout(() => {
      this.#suppressClick = false;
    }, 0);
    if (commit && this.#targetAt(event) === this.#other(drag.from)) this.#move(drag.from, drag.values);
  }
}
