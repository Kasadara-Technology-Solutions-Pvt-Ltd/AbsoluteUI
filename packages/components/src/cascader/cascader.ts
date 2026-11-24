/**
 * Cascader (R20 P9). Hierarchical selection through cascading columns, such as
 * country > state > city or category > subcategory. The trigger is a button with
 * aria-haspopup="dialog" that opens a non-modal popup (top layer) holding an optional
 * search box and one WAI-ARIA listbox per level (aria-label = the level name). Arrow keys
 * move within a level; ArrowRight (ArrowLeft in right-to-left) opens the next level and
 * ArrowLeft goes back; Enter or Space selects a leaf, or any node with `changeOnSelect`.
 * Children can load lazily through `loadChildren` with a loading state, abort, and retry.
 * Search matches the labels of every loaded node and lists matching paths. Single or
 * multiple selection; the trigger shows the selected path. A Form control: native forms
 * receive one hidden input per selected path, carrying its leaf value.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, formatNumber, getMessage, registerMessages, type Disposer } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, applyVisuallyHidden, autoPosition, createTypeahead, getNextIndex, isPrintableKey, openPopover, type PopoverHandle, type Typeahead } from '@absoluteui/utilities';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, setText, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { resolveValidity, runValidator, VALID, type FieldValidity, type Outcome } from '../internal/validation.js';

export interface CascaderConfig {
  validationTiming: ValidationTiming;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    cascader: CascaderConfig & { locale: string; direction: 'ltr' | 'rtl' };
  }
}

export const cascaderConfig = defineComponentConfig<CascaderConfig, 'locale' | 'direction'>(
  'cascader',
  { validationTiming: validationTimingSpec },
  ['locale', 'direction'],
);

registerMessages('cascader', 'en', {
  placeholder: 'Select',
  separator: ' / ',
  search: 'Search',
  level: 'Level {level}',
  hasChildren: 'has more levels',
  loading: 'Loading...',
  loadError: 'Could not load options.',
  retry: 'Retry',
  noOptions: 'No options',
  noResults: 'No results',
  resultCount: '{count} results',
  resultCountOne: '1 result',
  resultsLimited: 'Showing the first {count} results. Type more to narrow the search.',
  remove: 'Remove {path}',
  clear: 'Clear selection',
  selected: '{path} selected',
  removed: '{path} removed',
});

export interface CascaderOption {
  readonly value: string;
  readonly label: string;
  /** Known children. Omit (with `loadChildren`) to load them when the node opens. */
  readonly children?: readonly CascaderOption[];
  /** A leaf that never has children (no load is attempted). */
  readonly isLeaf?: boolean;
  readonly disabled?: boolean;
}

/** A selection: the values from the root to the chosen node. */
export type CascaderPath = readonly string[];

/** Single selection: a path or null. Multiple selection: a list of paths. */
export type CascaderValue = CascaderPath | readonly CascaderPath[] | null;

/** Context of `loadChildren`: aborted when the popup closes or the component is destroyed. */
export interface CascaderLoadContext {
  readonly signal: AbortSignal;
  /** Values from the root to the node being loaded. */
  readonly path: readonly string[];
}

export interface CascaderIcons {
  expand: IconRef;
  next: IconRef;
  remove: IconRef;
  loading: IconRef;
  error: IconRef;
}

export interface CascaderOptions extends Partial<CascaderConfig> {
  /** Visible label (required accessible name). */
  label: string;
  hideLabel?: boolean;
  description?: string;
  options: readonly CascaderOption[];
  /** A path (or null), or a list of paths with `multiple`. */
  value?: CascaderValue;
  multiple?: boolean;
  /** Any node can be selected, not only leaves. */
  changeOnSelect?: boolean;
  /** Loads a node's children when it opens; reject to show an error with a retry button. */
  loadChildren?: (option: CascaderOption, context: CascaderLoadContext) => Promise<readonly CascaderOption[]>;
  /** Show a search box in the popup. Default true. */
  searchable?: boolean;
  /** Maximum search results. Default 50. */
  maxResults?: number;
  /** Accessible names of the levels, such as ['Country', 'State', 'City']. Default "Level n". */
  levelLabels?: readonly string[];
  placeholder?: string;
  /** Show a clear button when something is selected and the field is not required. Default true. */
  clearable?: boolean;
  /** Form field name: one hidden input per selected path, carrying its leaf value. */
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  validate?: (value: CascaderValue) => string | null;
  locale?: string;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<CascaderIcons>;
}

/** `aui-change` detail: the value and the matching label paths. */
export interface CascaderValueDetail {
  value: CascaderValue;
  /** Label path (single) or label paths (multiple); unknown segments show their value. */
  labels: string[] | string[][] | null;
  validity: FieldValidity;
}

type LoadState = { status: 'loading'; controller: AbortController } | { status: 'error' } | { status: 'done'; children: readonly CascaderOption[] };

/** A node's children, or why they are not available yet. */
type ChildState = readonly CascaderOption[] | 'leaf' | 'unloaded' | 'loading' | 'error';

interface Column {
  readonly options: readonly CascaderOption[];
  readonly status: 'ready' | 'loading' | 'error';
  readonly parent: CascaderOption | null;
}

interface Result {
  readonly path: readonly CascaderOption[];
  readonly text: string;
}

/** Path key separator: a control character that values do not contain in practice. */
const SEP = String.fromCharCode(31);

const isPathList = (v: CascaderValue | undefined): v is readonly CascaderPath[] => Array.isArray(v) && v.length > 0 && Array.isArray(v[0]);

export class Cascader implements FormControl {
  readonly host: HTMLElement;
  readonly trigger: HTMLButtonElement;
  #options: CascaderOptions;
  #values: string[][];
  #initial: string[][];
  #validity: FieldValidity = VALID;
  #loads = new WeakMap<CascaderOption, LoadState>();
  #controllers = new Set<AbortController>();
  /** The expanded chain: column k + 1 shows the children of #expanded[k]. */
  #expanded: CascaderOption[] = [];
  #active: number[] = [0];
  #column = 0;
  #query = '';
  #results: Result[] = [];
  #resultActive = -1;
  /** Focus moves into the next column when this node finishes loading. */
  #pendingFocus: CascaderOption | null = null;
  #popover: PopoverHandle | null = null;
  #stopPosition: Disposer | null = null;
  readonly #typeahead: Typeahead = createTypeahead();
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #control: HTMLDivElement;
  readonly #text: HTMLSpanElement;
  readonly #clear: HTMLButtonElement;
  readonly #chips: HTMLUListElement;
  readonly #popup: HTMLDivElement;
  readonly #search: HTMLInputElement;
  readonly #columns: HTMLDivElement;
  readonly #resultsBox: HTMLDivElement;
  readonly #resultsList: HTMLUListElement;
  readonly #resultsStatus: HTMLDivElement;
  readonly #inputs: HTMLDivElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: CascaderOptions): Cascader {
    return new Cascader(host, options);
  }

  private constructor(host: HTMLElement, options: CascaderOptions) {
    Cascader.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#values = this.#normalize(options.value);
    this.#initial = this.#values.map((p) => [...p]);
    const doc = this.#doc;
    this.#chrome = new FieldChrome(doc, 'label', 'aui-cascader');

    this.#control = doc.createElement('div');
    this.#control.className = 'aui-cascader__control';
    this.trigger = doc.createElement('button');
    this.trigger.type = 'button';
    this.trigger.className = 'aui-cascader__trigger';
    this.trigger.id = createId('aui-cascader-trigger');
    // A select-only combobox whose popup is a dialog (APG): it can expose required, read-only, and invalid states.
    this.trigger.setAttribute('role', 'combobox');
    this.trigger.setAttribute('aria-haspopup', 'dialog');
    this.trigger.setAttribute('aria-expanded', 'false');
    (this.#chrome.label as HTMLLabelElement).htmlFor = this.trigger.id;
    this.#text = doc.createElement('span');
    this.#text.className = 'aui-cascader__text';
    this.#text.id = createId('aui-cascader-text');
    const caret = doc.createElement('span');
    caret.className = 'aui-cascader__caret';
    caret.setAttribute('aria-hidden', 'true');
    this.trigger.append(this.#text, caret);
    this.trigger.setAttribute('aria-labelledby', `${this.#chrome.label.id} ${this.#text.id}`);
    this.#clear = doc.createElement('button');
    this.#clear.type = 'button';
    this.#clear.className = 'aui-cascader__clear';
    this.#control.append(this.trigger, this.#clear);
    this.#chips = doc.createElement('ul');
    this.#chips.className = 'aui-cascader__chips';

    this.#popup = doc.createElement('div');
    this.#popup.className = 'aui-cascader__popup';
    this.#popup.id = createId('aui-cascader-popup');
    this.#popup.setAttribute('role', 'dialog');
    // Hidden until opened (top layer, Popover API).
    this.#popup.popover = 'manual';
    this.#popup.setAttribute('aria-labelledby', this.#chrome.label.id);
    this.trigger.setAttribute('aria-controls', this.#popup.id);
    this.#search = doc.createElement('input');
    this.#search.type = 'search';
    this.#search.className = 'aui-cascader__search';
    this.#search.autocomplete = 'off';
    this.#columns = doc.createElement('div');
    this.#columns.className = 'aui-cascader__columns';
    this.#resultsBox = doc.createElement('div');
    this.#resultsBox.className = 'aui-cascader__results';
    this.#resultsBox.hidden = true;
    this.#resultsList = doc.createElement('ul');
    this.#resultsList.className = 'aui-cascader__list aui-cascader__result-list';
    this.#resultsList.id = createId('aui-cascader-results');
    this.#resultsList.setAttribute('role', 'listbox');
    this.#resultsList.tabIndex = 0;
    this.#resultsStatus = doc.createElement('div');
    this.#resultsStatus.className = 'aui-cascader__status';
    this.#resultsStatus.setAttribute('role', 'status');
    this.#resultsBox.append(this.#resultsList, this.#resultsStatus);
    this.#search.setAttribute('aria-controls', this.#resultsList.id);
    this.#popup.append(this.#search, this.#columns, this.#resultsBox);
    this.#inputs = doc.createElement('div');
    this.#inputs.hidden = true;

    // Render first: invalid options throw before the host is touched.
    this.#render();
    host.classList.add('aui-field', 'aui-cascader');
    host.replaceChildren(this.#chrome.label, this.#control, this.#chips, this.#chrome.description, this.#chrome.error, this.#popup, this.#inputs);
    this.#bind();
    this.#group.add(registerControl(this));
    this.#group.add(cascaderConfig.subscribe(() => {
      this.#render();
      if (this.open) this.#renderPopup();
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
    return JSON.stringify(this.#values) !== JSON.stringify(this.#initial);
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<CascaderOptions> {
    return this.#options;
  }

  get open(): boolean {
    return this.#popover?.open === true;
  }

  /** A path or null; with `multiple`, a list of paths. */
  get value(): CascaderValue {
    if (this.#options.multiple === true) return this.#values.map((p) => [...p]);
    const first = this.#values[0];
    return first ? [...first] : null;
  }

  /** Leaf values: a string or null; with `multiple`, a string list. */
  getFormValue(): string | string[] | null {
    const leaves = this.#values.map((p) => p[p.length - 1] ?? '');
    return this.#options.multiple === true ? leaves : (leaves[0] ?? null);
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
    this.trigger.focus();
  }

  reset(): void {
    this.#values = this.#initial.map((p) => [...p]);
    this.#state.reset();
    this.close(false);
    this.#render();
  }

  /** Set the value (no event). */
  setValue(value: CascaderValue): void {
    this.update({ value });
  }

  update(options: Partial<CascaderOptions>): void {
    const next = { ...this.#options, ...options };
    Cascader.#assert(next);
    const previous = { options: this.#options, values: this.#values };
    this.#options = next;
    if ('value' in options || 'multiple' in options) {
      this.#values = this.#normalize('value' in options ? options.value : this.value);
      this.#state.customError = null;
    }
    if (options.options !== undefined || options.loadChildren !== undefined) {
      this.#expanded = [];
      this.#active = [0];
      this.#column = 0;
    }
    try {
      this.#render();
      if (this.open) {
        if (next.disabled === true || next.readOnly === true) this.close(false);
        else this.#renderPopup();
      }
    } catch (error) {
      this.#options = previous.options;
      this.#values = previous.values;
      this.#render();
      throw error;
    }
  }

  /** Opens the popup and focuses the search box (or the first level). */
  show(): void {
    if (this.open || this.disabled || this.#options.readOnly === true) return;
    const { direction } = this.#config();
    this.#query = '';
    this.#search.value = '';
    this.#syncExpandedToValue();
    this.#renderPopup();
    this.#popover = openPopover(this.#popup, {
      inside: [this.#control],
      onDismiss: (reason) => {
        this.close(reason === 'escape');
      },
    });
    this.#stopPosition = autoPosition(this.#control, this.#popup, { placement: 'bottom-start', direction });
    this.trigger.setAttribute('aria-expanded', 'true');
    if (this.#options.searchable === false) this.#focusColumn(this.#column);
    else this.#search.focus();
    emit(this.host, 'aui-open', null, { bubbles: false });
  }

  /** Closes the popup; pending loads are aborted. */
  close(restoreFocus = true): void {
    if (!this.#popover) return;
    const hadFocus = this.#popup.contains(this.#doc.activeElement);
    this.#popover.close();
    this.#popover = null;
    this.#stopPosition?.();
    this.#stopPosition = null;
    this.#abortAll();
    this.#pendingFocus = null;
    this.trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus && hadFocus) this.trigger.focus();
    emit(this.host, 'aui-close', null, { bubbles: false });
  }

  destroy(): void {
    this.close(false);
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-cascader', 'aui-cascader--multiple', 'aui-cascader--disabled', 'aui-cascader--invalid');
  }

  static #assert(options: CascaderOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('CASCADER_OPTIONS', 'Invalid cascader options.', { component: 'cascader', property: `cascader.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string');
    const check = (list: unknown, depth: number): void => {
      if (!Array.isArray(list) || depth > 32) fail('options', 'CascaderOption[] (at most 32 levels)');
      const seen = new Set<string>();
      for (const o of list as readonly { value?: unknown; label?: unknown; children?: unknown }[]) {
        if (typeof o.value !== 'string' || typeof o.label !== 'string') fail('options', '{ value: string, label: string }[]');
        if (seen.has(o.value as string)) fail('options', 'unique values among siblings');
        seen.add(o.value as string);
        if (o.children !== undefined) check(o.children, depth + 1);
      }
    };
    check(options.options, 0);
    const value: unknown = options.value;
    const isPath = (p: unknown): boolean => Array.isArray(p) && p.length > 0 && p.every((s) => typeof s === 'string');
    if (value !== undefined && value !== null) {
      const ok = options.multiple === true ? Array.isArray(value) && value.every(isPath) : isPath(value);
      if (!ok) fail('value', options.multiple === true ? 'string[][]' : 'string[] (a non-empty path) or null');
    }
    if (options.loadChildren !== undefined && typeof options.loadChildren !== 'function') fail('loadChildren', '(option, context) => Promise<CascaderOption[]>');
    if (options.maxResults !== undefined && !(Number.isInteger(options.maxResults) && options.maxResults >= 1 && options.maxResults <= 1000)) fail('maxResults', 'integer from 1 to 1000');
    const levels: unknown = options.levelLabels;
    if (levels !== undefined && !(Array.isArray(levels) && levels.every((l) => typeof l === 'string'))) fail('levelLabels', 'string[]');
    if (options.validate !== undefined && typeof options.validate !== 'function') fail('validate', '(value: CascaderValue) => string | null');
  }

  #normalize(value: CascaderValue | undefined): string[][] {
    if (value === undefined || value === null) return [];
    if (this.#options.multiple === true) {
      const list: readonly CascaderPath[] = isPathList(value) ? value : value.length > 0 && typeof value[0] === 'string' ? [value] : [];
      const out: string[][] = [];
      for (const p of list) if (!out.some((q) => q.join(SEP) === p.join(SEP))) out.push([...p]);
      return out;
    }
    if (isPathList(value)) return value[0] ? [[...value[0]]] : [];
    return value.length > 0 ? [[...value]] : [];
  }

  #config(): Readonly<CascaderConfig & { locale: string; direction: 'ltr' | 'rtl' }> {
    const o = this.#options;
    return cascaderConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  /** Known children of a node, or its load state. */
  #children(option: CascaderOption): ChildState {
    if (option.children !== undefined) return option.children.length === 0 ? 'leaf' : option.children;
    if (option.isLeaf === true || this.#options.loadChildren === undefined) return 'leaf';
    const state = this.#loads.get(option);
    if (!state) return 'unloaded';
    if (state.status === 'done') return state.children.length === 0 ? 'leaf' : state.children;
    return state.status;
  }

  #isLeaf(option: CascaderOption): boolean {
    return this.#children(option) === 'leaf';
  }

  #selectable(option: CascaderOption): boolean {
    return option.disabled !== true && (this.#options.changeOnSelect === true || this.#isLeaf(option));
  }

  /** Labels of a value path; unknown segments (not loaded yet) show their value. */
  #labels(path: readonly string[]): string[] {
    const out: string[] = [];
    let level: readonly CascaderOption[] | null = this.#options.options;
    for (const v of path) {
      const match: CascaderOption | undefined = level?.find((o) => o.value === v);
      out.push(match?.label ?? v);
      const kids: ChildState = match ? this.#children(match) : 'leaf';
      level = Array.isArray(kids) ? kids : null;
    }
    return out;
  }

  #pathText(labels: readonly string[], locale: string): string {
    return labels.join(getMessage('cascader', 'separator', {}, locale));
  }

  #columnsList(): Column[] {
    const columns: Column[] = [{ options: this.#options.options, status: 'ready', parent: null }];
    for (const node of this.#expanded) {
      const kids = this.#children(node);
      if (kids === 'leaf' || kids === 'unloaded') break;
      if (kids === 'loading' || kids === 'error') {
        columns.push({ options: [], status: kids, parent: node });
        break;
      }
      columns.push({ options: kids, status: 'ready', parent: node });
    }
    return columns;
  }

  /** Expands the columns along the (first) selected path when the popup opens. */
  #syncExpandedToValue(): void {
    const path = this.#values[0];
    this.#expanded = [];
    this.#active = [0];
    this.#column = 0;
    if (!path) return;
    let level: readonly CascaderOption[] = this.#options.options;
    for (const [i, v] of path.entries()) {
      const index = level.findIndex((o) => o.value === v);
      const node = level[index];
      if (!node) break;
      this.#active[i] = index;
      this.#column = i;
      const kids = this.#children(node);
      if (!Array.isArray(kids) || i === path.length - 1) break;
      this.#expanded.push(node);
      level = kids;
    }
  }

  #render(): void {
    const o = this.#options;
    const { locale, validationTiming } = this.#config();
    const outcome: Outcome = o.required === true && this.#values.length === 0 ? { error: 'value-missing', params: {} } : { error: null, params: {} };
    const custom = outcome.error === null ? runValidator(o.validate, this.value) : null;
    const validity = resolveValidity(outcome, { locale, kind: 'choice' }, custom, this.#state.customError);
    const paths = this.#values.map((p) => this.#pathText(this.#labels(p), locale));
    const placeholder = o.placeholder ?? getMessage('cascader', 'placeholder', {}, locale);
    // Named from the first render, not only when the popup opens (the field exists before that).
    this.#search.setAttribute('aria-label', getMessage('cascader', 'search', {}, locale));
    const clearLabel = getMessage('cascader', 'clear', {}, locale);
    const removeLabels = paths.map((path) => getMessage('cascader', 'remove', { path }, locale));
    this.#validity = validity;
    const multiple = o.multiple === true;
    const disabled = o.disabled === true;
    const readOnly = o.readOnly === true;
    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    const show = !validity.valid && this.#state.shouldShow(validationTiming);
    this.#chrome.setError(show ? validity.message : '', o.icons?.error ?? 'alert-circle');
    this.host.classList.toggle('aui-cascader--multiple', multiple);
    this.host.classList.toggle('aui-cascader--disabled', disabled);
    this.host.classList.toggle('aui-cascader--invalid', show);

    const t = this.trigger;
    // Multiple selection lists the paths as chips; the trigger then shows the placeholder.
    const text = !multiple && paths[0] !== undefined ? paths[0] : placeholder;
    setText(this.#text, text);
    this.#text.classList.toggle('aui-cascader__text--placeholder', multiple || paths.length === 0);
    t.disabled = disabled;
    if (readOnly) t.setAttribute('aria-readonly', 'true');
    else t.removeAttribute('aria-readonly');
    if (o.required === true) t.setAttribute('aria-required', 'true');
    else t.removeAttribute('aria-required');
    setInvalid(t, show);
    setDescribedBy(t, this.#chrome.describedBy());
    const caret = t.querySelector('.aui-cascader__caret');
    if (caret?.childElementCount === 0) caret.append(renderIcon(o.icons?.expand ?? 'chevron-down', { doc: this.#doc }));

    const clearable = (o.clearable ?? true) && o.required !== true && !multiple && this.#values.length > 0 && !disabled && !readOnly;
    this.#clear.hidden = !clearable;
    this.#clear.setAttribute('aria-label', clearLabel);
    this.#clear.title = clearLabel;
    if (this.#clear.childElementCount === 0) this.#clear.append(renderIcon(o.icons?.remove ?? 'close', { doc: this.#doc }));

    this.#chips.hidden = !multiple || paths.length === 0;
    this.#chips.replaceChildren(...(multiple ? paths.map((path, i) => {
      const li = this.#doc.createElement('li');
      li.className = 'aui-cascader__chip';
      const span = this.#doc.createElement('span');
      span.textContent = path;
      li.append(span);
      if (!disabled && !readOnly) {
        const b = this.#doc.createElement('button');
        b.type = 'button';
        b.className = 'aui-cascader__chip-remove';
        b.dataset.index = String(i);
        b.setAttribute('aria-label', removeLabels[i] ?? '');
        b.append(renderIcon(o.icons?.remove ?? 'close', { doc: this.#doc }));
        li.append(b);
      }
      return li;
    }) : []));

    const name = o.name;
    if (name === undefined || name === '' || disabled) this.#inputs.replaceChildren();
    else {
      this.#inputs.replaceChildren(...this.#values.map((p) => {
        const input = this.#doc.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = p[p.length - 1] ?? '';
        return input;
      }));
    }
  }

  #levelLabel(level: number, locale: string): string {
    return this.#options.levelLabels?.[level] ?? getMessage('cascader', 'level', { level: formatNumber(level + 1, {}, locale) }, locale);
  }

  #isSelected(path: readonly string[]): boolean {
    const key = path.join(SEP);
    return this.#values.some((p) => p.join(SEP) === key);
  }

  #renderPopup(): void {
    const o = this.#options;
    const { locale } = this.#config();
    const searching = this.#query.trim() !== '';
    this.#search.hidden = o.searchable === false;
    this.#search.setAttribute('aria-label', getMessage('cascader', 'search', {}, locale));
    this.#columns.hidden = searching;
    this.#resultsBox.hidden = !searching;
    if (searching) {
      this.#renderResults(locale);
      return;
    }
    const columns = this.#columnsList();
    if (this.#column >= columns.length) this.#column = columns.length - 1;
    const hasChildren = getMessage('cascader', 'hasChildren', {}, locale);
    const nodes = columns.map((col, level) => {
      // Reuse the level's column and listbox so a focused listbox keeps focus across
      // re-renders (replacing it would re-fire focus and make screen readers re-announce it).
      const existing = this.#columns.children[level];
      const reused = existing instanceof HTMLElement ? existing.querySelector<HTMLElement>(':scope > ul.aui-cascader__list') : null;
      const wrap = reused && existing instanceof HTMLElement ? existing : this.#doc.createElement('div');
      const list = reused ?? this.#doc.createElement('ul');
      if (reused) {
        wrap.removeAttribute('aria-busy');
        for (const child of Array.from(wrap.children)) if (child !== list) child.remove();
        list.replaceChildren();
        list.removeAttribute('aria-activedescendant');
        list.removeAttribute('aria-multiselectable');
        list.hidden = false;
      }
      wrap.className = 'aui-cascader__column';
      list.className = 'aui-cascader__list';
      list.id = `${this.#popup.id}-col-${String(level)}`;
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-label', this.#levelLabel(level, locale));
      list.dataset.level = String(level);
      list.tabIndex = level === this.#column ? 0 : -1;
      if (o.multiple === true) list.setAttribute('aria-multiselectable', 'true');
      const prefix = this.#expanded.slice(0, level).map((n) => n.value);
      const active = Math.min(this.#active[level] ?? 0, col.options.length - 1);
      col.options.forEach((opt, i) => {
        const li = this.#doc.createElement('li');
        li.className = 'aui-cascader__option';
        li.id = `${list.id}-${String(i)}`;
        li.setAttribute('role', 'option');
        li.dataset.index = String(i);
        const path = [...prefix, opt.value];
        const selected = o.multiple === true ? this.#isSelected(path) : (this.#values[0]?.slice(0, path.length).join(SEP) === path.join(SEP));
        li.setAttribute('aria-selected', String(selected));
        if (opt.disabled === true) li.setAttribute('aria-disabled', 'true');
        li.classList.toggle('aui-cascader__option--active', i === active);
        li.classList.toggle('aui-cascader__option--expanded', this.#expanded[level] === opt);
        const label = this.#doc.createElement('span');
        label.className = 'aui-cascader__option-label';
        label.textContent = opt.label;
        li.append(label);
        if (!this.#isLeaf(opt)) {
          const hint = this.#doc.createElement('span');
          hint.textContent = `, ${hasChildren}`;
          applyVisuallyHidden(hint);
          const icon = renderIcon(this.#children(opt) === 'loading' ? (o.icons?.loading ?? 'spinner') : (o.icons?.next ?? 'chevron-right'), { className: this.#children(opt) === 'loading' ? 'aui-cascader__next aui-cascader__spinner' : 'aui-cascader__next', doc: this.#doc });
          icon.setAttribute('aria-hidden', 'true');
          li.append(hint, icon);
        }
        list.append(li);
      });
      const current = col.options[active] ? `${list.id}-${String(active)}` : null;
      if (current !== null) list.setAttribute('aria-activedescendant', current);
      if (!reused) wrap.append(list);
      if (col.status !== 'ready' || col.options.length === 0) {
        list.hidden = col.status !== 'ready';
        const status = this.#doc.createElement('div');
        status.className = `aui-cascader__status aui-cascader__status--${col.status}`;
        status.setAttribute('role', 'status');
        if (col.status === 'loading') {
          status.append(renderIcon(o.icons?.loading ?? 'spinner', { className: 'aui-cascader__spinner', doc: this.#doc }));
          wrap.setAttribute('aria-busy', 'true');
        }
        const text = this.#doc.createElement('span');
        text.textContent = getMessage('cascader', col.status === 'loading' ? 'loading' : col.status === 'error' ? 'loadError' : 'noOptions', {}, locale);
        status.append(text);
        if (col.status === 'error' && col.parent) {
          const parent = col.parent;
          const retry = this.#doc.createElement('button');
          retry.type = 'button';
          retry.className = 'aui-cascader__retry';
          retry.textContent = getMessage('cascader', 'retry', {}, locale);
          retry.addEventListener('click', () => {
            this.#loads.delete(parent);
            this.#pendingFocus = parent;
            this.#load(parent, level - 1);
          });
          status.append(retry);
        }
        wrap.append(status);
      }
      return wrap;
    });
    const focusedLevel = this.#focusedLevel();
    // Remove only the levels that are gone and append new ones; reused columns stay in place.
    for (const child of Array.from(this.#columns.children).slice(nodes.length)) child.remove();
    nodes.forEach((node, i) => {
      if (this.#columns.children[i] !== node) this.#columns.append(node);
    });
    if (focusedLevel !== null) this.#focusColumn(Math.min(focusedLevel, nodes.length - 1));
  }

  #renderResults(locale: string): void {
    const max = this.#options.maxResults ?? 50;
    const q = this.#query.trim().toLocaleLowerCase(locale);
    const results: Result[] = [];
    const scan = { truncated: false };
    const walk = (list: readonly CascaderOption[], prefix: readonly CascaderOption[]): void => {
      for (const opt of list) {
        if (scan.truncated) return;
        const path = [...prefix, opt];
        if (this.#selectable(opt) && path.some((n) => n.label.toLocaleLowerCase(locale).includes(q))) {
          if (results.length >= max) {
            scan.truncated = true;
            return;
          }
          results.push({ path, text: this.#pathText(path.map((n) => n.label), locale) });
        }
        if (opt.disabled === true) continue;
        const kids = this.#children(opt);
        if (Array.isArray(kids)) walk(kids, path);
      }
    };
    walk(this.#options.options, []);
    this.#results = results;
    if (this.#resultActive >= results.length) this.#resultActive = results.length - 1;
    const list = this.#resultsList;
    list.setAttribute('aria-label', getMessage('cascader', 'search', {}, locale));
    if (this.#options.multiple === true) list.setAttribute('aria-multiselectable', 'true');
    else list.removeAttribute('aria-multiselectable');
    list.replaceChildren(...results.map((r, i) => {
      const li = this.#doc.createElement('li');
      li.className = 'aui-cascader__option';
      li.id = `${list.id}-${String(i)}`;
      li.setAttribute('role', 'option');
      li.dataset.index = String(i);
      li.setAttribute('aria-selected', String(this.#isSelected(r.path.map((n) => n.value))));
      li.classList.toggle('aui-cascader__option--active', i === this.#resultActive);
      li.textContent = r.text;
      return li;
    }));
    const active = results[this.#resultActive];
    if (active) list.setAttribute('aria-activedescendant', `${list.id}-${String(this.#resultActive)}`);
    else list.removeAttribute('aria-activedescendant');
    list.hidden = results.length === 0;
    const count = formatNumber(results.length, {}, locale);
    setText(this.#resultsStatus, results.length === 0
      ? getMessage('cascader', 'noResults', {}, locale)
      : scan.truncated ? getMessage('cascader', 'resultsLimited', { count }, locale)
      : results.length === 1 ? getMessage('cascader', 'resultCountOne', {}, locale) : getMessage('cascader', 'resultCount', { count }, locale));
  }

  #focusedLevel(): number | null {
    const el = this.#doc.activeElement;
    if (!(el instanceof HTMLElement) || !this.#columns.contains(el)) return null;
    const list = el.closest<HTMLElement>('[role="listbox"]');
    return list?.dataset.level === undefined ? null : Number(list.dataset.level);
  }

  #listAt(level: number): HTMLElement | null {
    return this.#columns.querySelector<HTMLElement>(`[data-level="${String(level)}"]`);
  }

  #focusColumn(level: number): void {
    this.#column = level;
    for (const list of Array.from(this.#columns.querySelectorAll<HTMLElement>('[role="listbox"]'))) list.tabIndex = list.dataset.level === String(level) ? 0 : -1;
    const list = this.#listAt(level);
    if (list && !list.hidden) {
      if (this.#doc.activeElement !== list) list.focus();
      list.querySelector('.aui-cascader__option--active')?.scrollIntoView({ block: 'nearest' });
    }
  }

  #load(option: CascaderOption, level: number): void {
    const loader = this.#options.loadChildren;
    if (!loader) return;
    const controller = new AbortController();
    this.#controllers.add(controller);
    this.#loads.set(option, { status: 'loading', controller });
    const path = [...this.#expanded.slice(0, level).map((n) => n.value), option.value];
    const { locale } = this.#config();
    if (this.open) this.#renderPopup();
    announce(getMessage('cascader', 'loading', {}, locale), 'polite', this.#doc);
    loader(option, { signal: controller.signal, path }).then(
      (children) => {
        this.#controllers.delete(controller);
        if (controller.signal.aborted || this.#group.disposed) return;
        const list: unknown = children;
        if (!Array.isArray(list) || !list.every((c: { value?: unknown; label?: unknown }) => typeof c.value === 'string' && typeof c.label === 'string')) {
          this.#loads.set(option, { status: 'error' });
        } else this.#loads.set(option, { status: 'done', children: list as readonly CascaderOption[] });
        this.#afterLoad(option, level);
      },
      () => {
        this.#controllers.delete(controller);
        if (controller.signal.aborted || this.#group.disposed) return;
        this.#loads.set(option, { status: 'error' });
        announce(getMessage('cascader', 'loadError', {}, this.#config().locale), 'assertive', this.#doc);
        this.#afterLoad(option, level);
      },
    );
  }

  #afterLoad(option: CascaderOption, level: number): void {
    this.#render();
    if (!this.open) return;
    const pending = this.#pendingFocus === option;
    if (pending) this.#pendingFocus = null;
    this.#renderPopup();
    const state = this.#loads.get(option);
    if (!pending || this.#expanded[level] !== option) return;
    if (state?.status === 'done' && state.children.length > 0) {
      this.#active[level + 1] = this.#selectedIndex(level + 1, state.children);
      this.#renderPopup();
      this.#focusColumn(level + 1);
    } else if (state?.status === 'done') {
      // No children after all: the node is a leaf and can be selected.
      this.#renderPopup();
    } else this.#columns.querySelector<HTMLButtonElement>('.aui-cascader__retry')?.focus();
  }

  #abortAll(): void {
    for (const c of this.#controllers) c.abort();
    this.#controllers.clear();
    // Interrupted loads start again the next time their node opens.
    const forget = (list: readonly CascaderOption[]): void => {
      for (const o of list) {
        if (this.#loads.get(o)?.status === 'loading') this.#loads.delete(o);
        const kids = this.#children(o);
        if (Array.isArray(kids)) forget(kids);
      }
    };
    forget(this.#options.options);
  }

  /** Opens the active node of `level` into the next column (loading it when needed). */
  #expand(level: number): void {
    const columns = this.#columnsList();
    const col = columns[level];
    const node = col?.options[this.#active[level] ?? 0];
    if (!node || node.disabled === true) return;
    this.#expanded = [...this.#expanded.slice(0, level), node];
    const kids = this.#children(node);
    if (kids === 'unloaded' || kids === 'error') {
      if (kids === 'error') this.#loads.delete(node);
      this.#pendingFocus = node;
      this.#load(node, level);
      return;
    }
    this.#renderPopup();
    if (Array.isArray(kids)) {
      this.#active[level + 1] = this.#selectedIndex(level + 1, kids);
      this.#renderPopup();
      this.#focusColumn(level + 1);
    } else if (kids === 'loading') this.#pendingFocus = node;
  }

  /** In a newly opened level, the option on the selected path, else the first. */
  #selectedIndex(level: number, kids: readonly CascaderOption[]): number {
    const path = this.#values[0];
    if (!path || this.#expanded.some((n, i) => path[i] !== n.value)) return 0;
    const index = kids.findIndex((k) => k.value === path[level]);
    return index < 0 ? 0 : index;
  }

  /** Selects (single) or toggles (multiple) the path ending in `path`'s last node. */
  #choose(path: readonly CascaderOption[]): void {
    const last = path[path.length - 1];
    if (!last || !this.#selectable(last)) return;
    const values = path.map((n) => n.value);
    const { locale } = this.#config();
    const text = this.#pathText(path.map((n) => n.label), locale);
    if (this.#options.multiple === true) {
      const had = this.#isSelected(values);
      const key = values.join(SEP);
      this.#values = had ? this.#values.filter((p) => p.join(SEP) !== key) : [...this.#values, values];
      announce(getMessage('cascader', had ? 'removed' : 'selected', { path: text }, locale), 'polite', this.#doc);
    } else {
      this.#values = [values];
      announce(getMessage('cascader', 'selected', { path: text }, locale), 'polite', this.#doc);
    }
    this.#changed();
    if (this.#options.multiple === true) this.#renderPopup();
    else this.close();
  }

  #changed(): void {
    this.#state.dirty = true;
    this.#state.customError = null;
    this.#render();
    const labels = this.#values.map((p) => this.#labels(p));
    emit(this.host, 'aui-change', {
      value: this.value,
      labels: this.#options.multiple === true ? labels : (labels[0] ?? null),
      validity: this.#validity,
    } satisfies CascaderValueDetail);
  }

  #bind(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.trigger, 'click', () => {
      if (this.open) this.close();
      else this.show();
    });
    g.listen(this.trigger, 'keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.show();
      }
    });
    g.listen(this.#clear, 'click', () => {
      if (this.#values.length === 0) return;
      this.#values = [];
      this.#changed();
      this.trigger.focus();
    });
    g.listen(this.#chips, 'click', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('.aui-cascader__chip-remove') : null;
      if (!target || this.#locked()) return;
      const index = Number(target.dataset.index);
      const path = this.#values[index];
      if (!path) return;
      const { locale } = this.#config();
      const text = this.#pathText(this.#labels(path), locale);
      this.#values = this.#values.filter((_, i) => i !== index);
      this.#changed();
      announce(getMessage('cascader', 'removed', { path: text }, locale), 'polite', this.#doc);
      // Focus the next chip's button, or the trigger when none is left.
      const buttons = this.#chips.querySelectorAll<HTMLButtonElement>('.aui-cascader__chip-remove');
      (buttons[Math.min(index, buttons.length - 1)] ?? this.trigger).focus();
    });
    g.listen(this.#search, 'input', () => {
      this.#query = this.#search.value;
      this.#resultActive = this.#query.trim() === '' ? -1 : 0;
      this.#renderPopup();
    });
    g.listen(this.#search, 'keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (this.#query.trim() !== '') {
          if (this.#results.length > 0) this.#resultsList.focus();
        } else this.#focusColumn(this.#column);
      } else if (event.key === 'Enter' && this.#query.trim() !== '') {
        event.preventDefault();
        const r = this.#results[this.#resultActive];
        if (r) this.#choose(r.path);
      }
    });
    g.listen(this.#resultsList, 'keydown', (event) => {
      this.#onResultKey(event);
    });
    g.listen(this.#resultsList, 'click', (event) => {
      const index = this.#indexOf(event);
      const r = index === null ? undefined : this.#results[index];
      if (r) {
        this.#resultActive = index ?? -1;
        this.#choose(r.path);
      }
    });
    g.listen(this.#columns, 'keydown', (event) => {
      this.#onColumnKey(event);
    });
    g.listen(this.#columns, 'click', (event) => {
      this.#onColumnClick(event);
    });
    g.listen(this.#popup, 'focusout', (event) => {
      const next = event.relatedTarget;
      // Tabbing out of the popup closes it (focus is already elsewhere).
      if (next instanceof Node && !this.#popup.contains(next) && !this.#control.contains(next)) this.close(false);
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      if (this.open) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
  }

  #locked(): boolean {
    return this.#options.disabled === true || this.#options.readOnly === true;
  }

  #indexOf(event: Event): number | null {
    const li = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="option"]') : null;
    return li?.dataset.index === undefined ? null : Number(li.dataset.index);
  }

  #onResultKey(event: KeyboardEvent): void {
    const n = this.#results.length;
    const next = getNextIndex(event.key, this.#resultActive, n, { orientation: 'vertical', loop: false });
    if (next !== null) {
      event.preventDefault();
      if (event.key === 'ArrowUp' && this.#resultActive === 0) {
        this.#search.focus();
        return;
      }
      this.#resultActive = next;
      this.#renderPopup();
      this.#resultsList.querySelector('.aui-cascader__option--active')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const r = this.#results[this.#resultActive];
      if (r) this.#choose(r.path);
    }
  }

  #pathTo(level: number, index: number): CascaderOption[] | null {
    const col = this.#columnsList()[level];
    const node = col?.options[index];
    return node ? [...this.#expanded.slice(0, level), node] : null;
  }

  #onColumnKey(event: KeyboardEvent): void {
    const level = this.#focusedLevel();
    if (level === null) return;
    const col = this.#columnsList()[level];
    if (!col) return;
    const { direction } = this.#config();
    const rtl = direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    const current = this.#active[level] ?? 0;
    const next = getNextIndex(event.key, current, col.options.length, { orientation: 'vertical', loop: false, isDisabled: (i) => col.options[i]?.disabled === true });
    if (next !== null) {
      event.preventDefault();
      if (next !== current) {
        this.#active[level] = next;
        // Moving within a level closes the deeper levels of the previous node.
        this.#expanded = this.#expanded.slice(0, level);
      }
      this.#renderPopup();
      return;
    }
    if (event.key === forward) {
      event.preventDefault();
      this.#expand(level);
      return;
    }
    if (event.key === back) {
      event.preventDefault();
      if (level > 0) {
        this.#expanded = this.#expanded.slice(0, level);
        this.#focusColumn(level - 1);
        this.#renderPopup();
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const path = this.#pathTo(level, current);
      const node = path?.[path.length - 1];
      if (!path || !node || node.disabled === true) return;
      if (this.#selectable(node) && (this.#isLeaf(node) || event.key === 'Enter')) this.#choose(path);
      else this.#expand(level);
      return;
    }
    if (isPrintableKey(event)) {
      const index = this.#typeahead.handle(event.key, col.options.map((o) => o.label), current, (i) => col.options[i]?.disabled === true);
      if (index >= 0) {
        event.preventDefault();
        this.#active[level] = index;
        this.#expanded = this.#expanded.slice(0, level);
        this.#renderPopup();
      }
    }
  }

  #onColumnClick(event: MouseEvent): void {
    const index = this.#indexOf(event);
    const list = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="listbox"]') : null;
    if (index === null || list?.dataset.level === undefined) return;
    const level = Number(list.dataset.level);
    const path = this.#pathTo(level, index);
    const node = path?.[path.length - 1];
    if (!path || !node || node.disabled === true) return;
    this.#active[level] = index;
    this.#column = level;
    list.focus();
    if (this.#isLeaf(node)) this.#choose(path);
    else {
      // A node opens on click; with changeOnSelect it is selected too.
      if (this.#options.changeOnSelect === true) this.#choose(path);
      if (this.open) this.#expand(level);
    }
  }
}
