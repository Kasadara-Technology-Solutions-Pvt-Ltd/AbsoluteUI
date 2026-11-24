/**
 * Multi Select (since 0.9.0; docs/PLAN-R9-ANGULAR.md D15/D33).
 * WAI-ARIA 1.2 editable combobox whose listbox allows several selections
 * (`aria-multiselectable`): focus stays on the input, the active option is conveyed via
 * `aria-activedescendant`, and activating an option toggles it. Selected values are shown
 * as chips before the input; each chip has a remove button. The listbox renders in the
 * top layer (Popover API). Selection is strict: every value is one of the options.
 */
import {
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  getMessage,
  registerMessages,
  releaseNode,
  validators,
  type Disposer,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, autoPosition, getNextIndex, openPopover, type PopoverHandle } from '@absoluteui/utilities';
import { FieldState, markTouched, observePointer, registerControl, renderError, renderLabel, type FormControl } from '../internal/field.js';
import { resolveValidity, VALID, type FieldValidity } from '../internal/validation.js';

export type MultiSelectFilter = 'contains' | 'startsWith' | 'none';

export interface MultiSelectConfig {
  filter: MultiSelectFilter;
  /** Close the list after each toggle. Default false (several choices in a row). */
  closeOnSelect: boolean;
  openOnFocus: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    multiSelect: MultiSelectConfig & { locale: string; direction: 'ltr' | 'rtl' };
  }
}

export const multiSelectConfig = defineComponentConfig<MultiSelectConfig, 'locale' | 'direction'>(
  'multiSelect',
  {
    filter: { default: 'contains', expected: '"contains" | "startsWith" | "none"', validate: validators.oneOf(['contains', 'startsWith', 'none'] as const) },
    closeOnSelect: { default: false, expected: 'boolean', validate: validators.isBoolean },
    openOnFocus: { default: false, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

registerMessages('multiSelect', 'en', {
  showOptions: 'Show options',
  noResults: 'No results',
  resultCount: '{count} results available',
  resultCountOne: '1 result available',
  loading: 'Loading...',
  loadError: 'Could not load options.',
  selectAll: 'Select all',
  remove: 'Remove {label}',
  selectedList: 'Selected',
  added: '{label} selected',
  removed: '{label} removed',
  maxReached: 'You can select up to {max}.',
});

export interface MultiSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly description?: string;
}

export interface MultiSelectRenderContext {
  readonly doc: Document;
}

/** Context of `loadOptions`: aborted when a newer query starts or the list closes. */
export interface MultiSelectLoadContext {
  readonly signal: AbortSignal;
}

export interface MultiSelectIcons {
  expand: IconRef;
  selected: IconRef;
  remove: IconRef;
  error: IconRef;
}

export interface MultiSelectOptions extends Partial<MultiSelectConfig> {
  /** Visible label (required accessible name). */
  label: string;
  options: readonly MultiSelectOption[];
  value?: readonly string[];
  /** Form field name; one hidden input per selected value carries it. */
  name?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  /** Shown and announced when `invalid` is true (text only). */
  errorMessage?: string;
  /** Most values that can be selected (integer >= 1). Further options become unavailable. */
  maxSelected?: number;
  /** Show a "Select all" option that toggles every enabled option shown. */
  selectAll?: boolean;
  locale?: string;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<MultiSelectIcons>;
  /** Custom option content; the label stays the accessible name. Nodes are released with `releaseNode`. */
  renderOption?: (option: MultiSelectOption, context: MultiSelectRenderContext) => Node;
  /**
   * Load the options for the typed text instead of filtering `options`; debounced by
   * `loadDelay`, aborted by a newer query or by closing. Keep selected options in `options`
   * so values set from outside are known before the first load.
   */
  loadOptions?: (query: string, context: MultiSelectLoadContext) => Promise<readonly MultiSelectOption[]>;
  /** Milliseconds between the last keystroke and `loadOptions` (default 250). */
  loadDelay?: number;
}

export interface MultiSelectChangeDetail {
  value: string[];
  /** Values added by this change. */
  added: string[];
  /** Values removed by this change. */
  removed: string[];
}

const MAX_OPTIONS_TESTED = 1000;
type Entry = { readonly kind: 'all' } | { readonly kind: 'option'; readonly option: MultiSelectOption };

function isOptionList(value: unknown): value is readonly MultiSelectOption[] {
  return Array.isArray(value) && value.every((o: unknown) => typeof o === 'object' && o !== null && typeof (o as { value?: unknown }).value === 'string' && typeof (o as { label?: unknown }).label === 'string');
}

function normalize(text: string, locale: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase(locale);
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

export class MultiSelect implements FormControl {
  readonly host: HTMLElement;
  readonly input: HTMLInputElement;
  readonly listbox: HTMLDivElement;
  #options: MultiSelectOptions;
  #value: string[];
  #entries: Entry[] = [];
  #activeIndex = -1;
  #popover: PopoverHandle | null = null;
  #stopPosition: Disposer | null = null;
  #announceTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #doc: Document;
  readonly #label: HTMLLabelElement;
  readonly #control: HTMLDivElement;
  readonly #chips: HTMLUListElement;
  readonly #toggle: HTMLButtonElement;
  readonly #popup: HTMLDivElement;
  readonly #empty: HTMLDivElement;
  readonly #hidden: HTMLSpanElement;
  readonly #descriptionEl: HTMLDivElement;
  readonly #errorEl: HTMLDivElement;
  readonly #ids = new Map<MultiSelectOption, string>();
  readonly #allId: string;
  /** Nodes from `renderOption`, reused per option object (D8). */
  readonly #optionNodes = new Map<MultiSelectOption, Node>();
  #loaded: readonly MultiSelectOption[] | null = null;
  /** Known options of the selected values (they may come from loaded options). */
  readonly #selectedCache = new Map<string, MultiSelectOption>();
  #loadState: 'idle' | 'loading' | 'error' = 'idle';
  #loadTimer: ReturnType<typeof setTimeout> | undefined;
  #loadAbort: AbortController | null = null;
  readonly #group = new DisposableGroup();
  readonly #state = new FieldState();
  #initialValue: string[];
  #validity: FieldValidity = VALID;

  /** Render a multi select into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: MultiSelectOptions): MultiSelect {
    return new MultiSelect(host, options);
  }

  private constructor(host: HTMLElement, options: MultiSelectOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#value = this.#known(options.value ?? []);
    this.#initialValue = [...this.#value];
    const doc = this.#doc;

    const inputId = createId('aui-multi-select-input');
    const listboxId = createId('aui-multi-select-listbox');
    this.#allId = createId('aui-multi-select-all');

    this.#label = doc.createElement('label');
    this.#label.className = 'aui-multi-select__label';
    this.#label.htmlFor = inputId;

    this.#control = doc.createElement('div');
    this.#control.className = 'aui-multi-select__control';

    this.#chips = doc.createElement('ul');
    this.#chips.className = 'aui-multi-select__chips';

    this.input = doc.createElement('input');
    this.input.id = inputId;
    this.input.type = 'text';
    this.input.className = 'aui-multi-select__input';
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('aria-expanded', 'false');
    this.input.setAttribute('aria-controls', listboxId);
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;

    this.#toggle = doc.createElement('button');
    this.#toggle.type = 'button';
    this.#toggle.className = 'aui-multi-select__toggle';
    this.#toggle.tabIndex = -1;
    this.#toggle.setAttribute('aria-controls', listboxId);
    this.#toggle.setAttribute('aria-expanded', 'false');

    this.#control.append(this.#chips, this.input, this.#toggle);

    this.#popup = doc.createElement('div');
    this.#popup.className = 'aui-multi-select__popup';
    this.#popup.popover = 'manual';
    this.listbox = doc.createElement('div');
    this.listbox.id = listboxId;
    this.listbox.className = 'aui-multi-select__listbox';
    this.listbox.setAttribute('role', 'listbox');
    this.listbox.setAttribute('aria-multiselectable', 'true');
    this.#empty = doc.createElement('div');
    this.#empty.className = 'aui-multi-select__empty';
    this.#popup.append(this.listbox, this.#empty);

    this.#hidden = doc.createElement('span');
    this.#hidden.className = 'aui-multi-select__values';
    this.#hidden.hidden = true;

    this.#descriptionEl = doc.createElement('div');
    this.#descriptionEl.className = 'aui-multi-select__description';
    this.#descriptionEl.id = createId('aui-multi-select-desc');
    this.#errorEl = doc.createElement('div');
    this.#errorEl.className = 'aui-multi-select__error';
    this.#errorEl.id = createId('aui-multi-select-error');

    host.classList.add('aui-multi-select');
    host.replaceChildren(this.#label, this.#control, this.#descriptionEl, this.#errorEl, this.#hidden, this.#popup);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(multiSelectConfig.subscribe(() => {
      this.#render();
    }));
  }

  /** Selected values, in selection order (a copy). */
  get value(): string[] {
    return [...this.#value];
  }

  /** Options of the selected values, in selection order. */
  get selectedOptions(): MultiSelectOption[] {
    return this.#value.map((v) => this.#find(v)).filter((o): o is MultiSelectOption => o !== null);
  }

  get isOpen(): boolean {
    return this.#popover !== null;
  }

  get name(): string | null {
    return this.#options.name ?? null;
  }

  get label(): string {
    return this.#options.label;
  }

  get disabled(): boolean {
    return this.#options.disabled ?? false;
  }

  get validity(): FieldValidity {
    return this.#validity;
  }

  get dirty(): boolean {
    return !sameList(this.#value, this.#initialValue);
  }

  get touched(): boolean {
    return this.#state.touched;
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
    this.input.focus();
  }

  /** Restore the initial value and clear touched/submitted state (no `aui-change`). */
  reset(): void {
    this.close();
    this.#state.reset();
    this.#value = this.#known(this.#initialValue);
    this.input.value = '';
    this.#render();
  }

  /** Set the value programmatically (no `aui-change` event). Unknown values are dropped. */
  setValue(value: readonly string[]): void {
    this.#value = this.#known(value);
    this.#render();
  }

  update(options: Partial<MultiSelectOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    this.#value = this.#known('value' in options ? (options.value ?? []) : this.#value);
    this.#render();
  }

  open(): void {
    if (this.#popover || this.#options.disabled || this.#options.readOnly) return;
    const config = this.#config();
    this.#popover = openPopover(this.#popup, {
      inside: [this.#control],
      onDismiss: () => {
        this.close();
      },
    });
    this.#applyFilter(this.input.value);
    this.#stopPosition = autoPosition(this.#control, this.#popup, { placement: 'bottom-start', matchAnchorWidth: true, direction: config.direction });
    this.input.setAttribute('aria-expanded', 'true');
    this.#toggle.setAttribute('aria-expanded', 'true');
    emit(this.host, 'aui-open', null, { bubbles: false });
  }

  close(): void {
    if (!this.#popover) return;
    this.#stopPosition?.();
    this.#stopPosition = null;
    this.#popover.close();
    this.#popover = null;
    this.#setActive(-1);
    this.input.setAttribute('aria-expanded', 'false');
    this.#toggle.setAttribute('aria-expanded', 'false');
    clearTimeout(this.#announceTimer);
    this.#cancelLoad();
    emit(this.host, 'aui-close', null, { bubbles: false });
  }

  destroy(): void {
    this.close();
    this.#group.dispose();
    clearTimeout(this.#announceTimer);
    this.#cancelLoad();
    for (const node of this.#optionNodes.values()) releaseNode(node);
    this.#optionNodes.clear();
    this.host.replaceChildren();
    this.host.classList.remove('aui-multi-select');
  }

  #config(): Readonly<MultiSelectConfig & { locale: string; direction: 'ltr' | 'rtl' }> {
    const o = this.#options;
    return multiSelectConfig.resolve({
      ...(o.filter === undefined ? {} : { filter: o.filter }),
      ...(o.closeOnSelect === undefined ? {} : { closeOnSelect: o.closeOnSelect }),
      ...(o.openOnFocus === undefined ? {} : { openOnFocus: o.openOnFocus }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #assertOptions(options: MultiSelectOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('MULTI_SELECT_OPTIONS', 'Invalid multi select options.', { component: 'multi-select', property: `multiSelect.${property}`, expected });
    };
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (!Array.isArray(options.options)) fail('options', 'array of { value, label }');
    const seen = new Set<string>();
    for (const [i, o] of options.options.entries()) {
      if (typeof o.value !== 'string' || typeof o.label !== 'string') fail(`options[${String(i)}]`, '{ value: string, label: string }');
      if (seen.has(o.value)) fail(`options[${String(i)}].value`, 'unique value');
      seen.add(o.value);
    }
    if (options.value !== undefined && (!Array.isArray(options.value) || !options.value.every((v) => typeof v === 'string'))) fail('value', 'array of strings');
    if (options.maxSelected !== undefined && !(Number.isInteger(options.maxSelected) && options.maxSelected >= 1)) fail('maxSelected', 'integer >= 1');
    if (options.selectAll !== undefined && typeof options.selectAll !== 'boolean') fail('selectAll', 'boolean');
    if (options.renderOption !== undefined && typeof options.renderOption !== 'function') fail('renderOption', 'function (option, { doc }) => Node');
    if (options.loadOptions !== undefined && typeof options.loadOptions !== 'function') fail('loadOptions', 'function (query, { signal }) => Promise<options>');
    if (options.loadDelay !== undefined && !(Number.isInteger(options.loadDelay) && options.loadDelay >= 0 && options.loadDelay <= 5000)) fail('loadDelay', 'integer from 0 to 5000 (ms)');
  }

  /** A known option for a value: from `options`, the last load, or a selected one. */
  #find(value: string): MultiSelectOption | null {
    return this.#options.options.find((o) => o.value === value) ?? this.#loaded?.find((o) => o.value === value) ?? this.#selectedCache.get(value) ?? null;
  }

  /** Values of known options, without duplicates, in order; the cache keeps their options. */
  #known(values: readonly string[]): string[] {
    const out: string[] = [];
    for (const v of values) {
      const option = this.#options.options.find((o) => o.value === v) ?? this.#loaded?.find((o) => o.value === v) ?? this.#selectedCache.get(v);
      if (option && !out.includes(v)) {
        out.push(v);
        this.#selectedCache.set(v, option);
      }
    }
    for (const key of [...this.#selectedCache.keys()]) if (!out.includes(key)) this.#selectedCache.delete(key);
    return out;
  }

  #isFull(): boolean {
    const max = this.#options.maxSelected;
    return max !== undefined && this.#value.length >= max;
  }

  #bindEvents(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.input, 'input', () => {
      emit(this.host, 'aui-input', { query: this.input.value });
      if (this.#popover) this.#applyFilter(this.input.value);
      else this.open();
      this.#setActive(-1);
      this.#scheduleAnnouncement();
    });
    g.listen(this.input, 'keydown', (event) => {
      this.#onKeyDown(event);
    });
    g.listen(this.input, 'focus', () => {
      if (this.#config().openOnFocus) this.open();
    });
    g.listen(this.input, 'click', () => {
      if (this.#config().openOnFocus) this.open();
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && (this.host.contains(next) || this.#popup.contains(next))) return;
      this.close();
      this.input.value = '';
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#renderValidity();
      });
    });
    g.listen(this.#toggle, 'click', () => {
      if (this.#popover) this.close();
      else this.open();
      this.input.focus();
    });
    g.listen(this.#chips, 'click', (event) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-value]') : null;
      const value = button?.dataset.value;
      if (value === undefined || this.#options.disabled || this.#options.readOnly) return;
      this.#commit(this.#value.filter((v) => v !== value), [], [value]);
      this.input.focus();
    });
    // Keep focus on the input while interacting with options.
    g.listen(this.listbox, 'pointerdown', (event) => {
      event.preventDefault();
    });
    g.listen(this.listbox, 'click', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="option"]') : null;
      if (!target) return;
      const index = Number(target.dataset.index);
      this.#setActive(index);
      this.#activate(index);
    });
  }

  #onKeyDown(event: KeyboardEvent): void {
    if (this.#options.disabled) return;
    const open = this.#popover !== null;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (this.#options.readOnly) return;
        event.preventDefault();
        if (!open) {
          this.open();
          if (event.altKey) return;
          this.#setActive(event.key === 'ArrowDown' ? this.#firstEnabled(0, 1) : this.#firstEnabled(this.#entries.length - 1, -1));
          return;
        }
        this.#move(event.key);
        return;
      }
      case 'PageDown':
      case 'PageUp':
      case 'Home':
      case 'End':
        if (!open || ((event.key === 'Home' || event.key === 'End') && !event.ctrlKey)) return;
        event.preventDefault();
        this.#move(event.key);
        return;
      case 'Enter':
        if (!open || this.#activeIndex < 0) return;
        event.preventDefault();
        this.#activate(this.#activeIndex);
        return;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        } else if (this.input.value !== '') {
          event.preventDefault();
          event.stopPropagation();
          this.input.value = '';
        }
        return;
      case 'Backspace':
        // Backspace in an empty input removes the last selected value.
        if (this.input.value === '' && this.#value.length > 0 && !this.#options.readOnly) {
          event.preventDefault();
          const last = this.#value[this.#value.length - 1];
          if (last !== undefined) this.#commit(this.#value.slice(0, -1), [], [last]);
        }
        return;
      case 'Tab':
        if (open) this.close();
        return;
      default:
        return;
    }
  }

  #move(key: string): void {
    const next = getNextIndex(key, this.#activeIndex, this.#entries.length, {
      orientation: 'vertical',
      loop: key === 'ArrowDown' || key === 'ArrowUp',
      isDisabled: (i) => this.#entryDisabled(i),
    });
    if (next !== null) this.#setActive(next);
  }

  #firstEnabled(from: number, step: 1 | -1): number {
    for (let i = from; i >= 0 && i < this.#entries.length; i += step) if (!this.#entryDisabled(i)) return i;
    return -1;
  }

  #entryDisabled(index: number): boolean {
    const entry = this.#entries[index];
    if (!entry) return true;
    if (entry.kind === 'all') return this.#visibleOptions().every((o) => o.disabled === true);
    return this.#optionDisabled(entry.option);
  }

  /** Disabled options and, once the maximum is reached, options that are not selected. */
  #optionDisabled(option: MultiSelectOption): boolean {
    return option.disabled === true || (this.#isFull() && !this.#value.includes(option.value));
  }

  #visibleOptions(): MultiSelectOption[] {
    return this.#entries.flatMap((e) => (e.kind === 'option' ? [e.option] : []));
  }

  #activate(index: number): void {
    const entry = this.#entries[index];
    if (!entry || this.#options.readOnly) return;
    const locale = this.#config().locale;
    if (entry.kind === 'all') {
      const enabled = this.#visibleOptions().filter((o) => o.disabled !== true);
      const allSelected = enabled.length > 0 && enabled.every((o) => this.#value.includes(o.value));
      if (allSelected) {
        const removed = enabled.map((o) => o.value);
        this.#commit(this.#value.filter((v) => !removed.includes(v)), [], removed);
      } else {
        const max = this.#options.maxSelected ?? Number.POSITIVE_INFINITY;
        const missing = enabled.filter((o) => !this.#value.includes(o.value));
        // Up to the maximum, in list order.
        const added = missing.slice(0, Math.max(0, max - this.#value.length));
        for (const o of added) this.#selectedCache.set(o.value, o);
        this.#commit([...this.#value, ...added.map((o) => o.value)], added.map((o) => o.value), []);
        if (added.length < missing.length) announce(getMessage('multiSelect', 'maxReached', { max: String(max) }, locale), 'polite', this.#doc);
      }
      return;
    }
    const { option } = entry;
    if (option.disabled === true) return;
    if (this.#value.includes(option.value)) {
      this.#commit(this.#value.filter((v) => v !== option.value), [], [option.value]);
      announce(getMessage('multiSelect', 'removed', { label: option.label }, locale), 'polite', this.#doc);
    } else if (this.#isFull()) {
      announce(getMessage('multiSelect', 'maxReached', { max: String(this.#options.maxSelected ?? '') }, locale), 'polite', this.#doc);
    } else {
      this.#selectedCache.set(option.value, option);
      this.#commit([...this.#value, option.value], [option.value], []);
      announce(getMessage('multiSelect', 'added', { label: option.label }, locale), 'polite', this.#doc);
    }
    if (this.#config().closeOnSelect) this.close();
  }

  #applyFilter(query: string): void {
    if (this.#options.loadOptions) {
      // Server-side filtering: show what is known now, then the loaded results.
      this.#setEntries(this.#loaded ?? this.#options.options);
      this.#scheduleLoad(query);
      return;
    }
    const { filter, locale } = this.#config();
    const q = normalize(query.trim(), locale);
    const all = this.#options.options;
    this.#setEntries(filter === 'none' || q === '' ? all : all.filter((o) => {
      const label = normalize(o.label, locale);
      return filter === 'startsWith' ? label.startsWith(q) : label.includes(q);
    }));
  }

  #setEntries(options: readonly MultiSelectOption[]): void {
    const all: Entry[] = this.#options.selectAll && options.length > 0 ? [{ kind: 'all' }] : [];
    this.#entries = [...all, ...options.map((option): Entry => ({ kind: 'option', option }))];
    this.#renderOptions();
  }

  #scheduleLoad(query: string): void {
    const load = this.#options.loadOptions;
    if (!load) return;
    this.#cancelLoad();
    this.#loadState = 'loading';
    this.#renderStatus();
    this.#loadTimer = setTimeout(() => {
      const controller = new AbortController();
      this.#loadAbort = controller;
      load(query, { signal: controller.signal }).then(
        (options) => {
          if (controller.signal.aborted || this.#group.disposed) return;
          this.#loadAbort = null;
          if (!isOptionList(options)) {
            this.#loadFailed();
            return;
          }
          this.#loaded = options;
          this.#loadState = 'idle';
          if (this.#popover) {
            this.#setEntries(options);
            this.#scheduleAnnouncement();
          }
        },
        () => {
          if (controller.signal.aborted || this.#group.disposed) return;
          this.#loadAbort = null;
          this.#loadFailed();
        },
      );
    }, this.#options.loadDelay ?? 250);
  }

  #loadFailed(): void {
    this.#loadState = 'error';
    this.#renderStatus();
    if (this.#popover) announce(getMessage('multiSelect', 'loadError', {}, this.#config().locale), 'polite', this.#doc);
  }

  #cancelLoad(): void {
    clearTimeout(this.#loadTimer);
    this.#loadAbort?.abort();
    this.#loadAbort = null;
    if (this.#loadState === 'loading') this.#loadState = 'idle';
  }

  #renderStatus(): void {
    const locale = this.#config().locale;
    const state = this.#loadState;
    this.#empty.textContent = getMessage('multiSelect', state === 'loading' ? 'loading' : state === 'error' ? 'loadError' : 'noResults', {}, locale);
    this.#empty.hidden = state === 'idle' && this.listbox.childElementCount > 0;
    if (state === 'loading') this.listbox.setAttribute('aria-busy', 'true');
    else this.listbox.removeAttribute('aria-busy');
  }

  #scheduleAnnouncement(): void {
    clearTimeout(this.#announceTimer);
    this.#announceTimer = setTimeout(() => {
      if (!this.#popover) return;
      const n = this.#visibleOptions().length;
      const locale = this.#config().locale;
      const text = n === 0 ? getMessage('multiSelect', 'noResults', {}, locale) : n === 1 ? getMessage('multiSelect', 'resultCountOne', {}, locale) : getMessage('multiSelect', 'resultCount', { count: n }, locale);
      announce(text, 'polite', this.#doc);
    }, 400);
  }

  #setActive(index: number): void {
    this.#activeIndex = index;
    const els = this.listbox.children;
    for (let i = 0; i < els.length; i++) els[i]?.classList.toggle('aui-multi-select__option--active', i === index);
    const active = index >= 0 ? (els[index] as HTMLElement | undefined) : undefined;
    if (active) {
      this.input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    } else {
      this.input.removeAttribute('aria-activedescendant');
    }
  }

  #commit(next: string[], added: string[], removed: string[]): void {
    if (sameList(next, this.#value)) return;
    this.#value = this.#known(next);
    // An external error describes the previous value; a new selection clears it.
    this.#state.customError = null;
    this.#renderValue();
    this.#renderOptions();
    this.#renderValidity();
    emit(this.host, 'aui-change', { value: [...this.#value], added, removed } satisfies MultiSelectChangeDetail);
  }

  #render(): void {
    const o = this.#options;
    const locale = this.#config().locale;
    renderLabel(this.#label, o.label, o.required ?? false);
    this.listbox.setAttribute('aria-label', o.label);
    this.input.placeholder = this.#value.length === 0 ? (o.placeholder ?? '') : '';
    this.input.disabled = o.disabled ?? false;
    this.input.readOnly = o.readOnly ?? false;
    if (o.required) this.input.setAttribute('aria-required', 'true');
    else this.input.removeAttribute('aria-required');
    this.#toggle.disabled = (o.disabled ?? false) || (o.readOnly ?? false);
    this.#toggle.setAttribute('aria-label', getMessage('multiSelect', 'showOptions', {}, locale));
    this.#toggle.replaceChildren(renderIcon(o.icons?.expand ?? 'chevron-down', { doc: this.#doc }));
    this.#descriptionEl.textContent = o.description ?? '';
    this.#descriptionEl.hidden = !o.description;
    this.host.classList.toggle('aui-multi-select--disabled', o.disabled ?? false);
    this.#renderValue();
    this.#renderValidity();
    if (this.#popover) this.#applyFilter(this.input.value);
    else this.#renderOptions();
  }

  /** Chips and hidden form inputs for the selected values. */
  #renderValue(): void {
    const o = this.#options;
    const doc = this.#doc;
    const locale = this.#config().locale;
    const editable = !(o.disabled ?? false) && !(o.readOnly ?? false);
    this.#chips.setAttribute('aria-label', `${getMessage('multiSelect', 'selectedList', {}, locale)}: ${o.label}`);
    this.#chips.replaceChildren(
      ...this.selectedOptions.map((option) => {
        const li = doc.createElement('li');
        li.className = 'aui-multi-select__chip';
        const text = doc.createElement('span');
        text.className = 'aui-multi-select__chip-label';
        text.textContent = option.label;
        li.append(text);
        if (editable) {
          const remove = doc.createElement('button');
          remove.type = 'button';
          remove.className = 'aui-multi-select__remove';
          remove.dataset.value = option.value;
          remove.setAttribute('aria-label', getMessage('multiSelect', 'remove', { label: option.label }, locale));
          remove.append(renderIcon(o.icons?.remove ?? 'close', { doc }));
          li.append(remove);
        }
        return li;
      }),
    );
    this.#chips.hidden = this.#value.length === 0;
    this.input.placeholder = this.#value.length === 0 ? (o.placeholder ?? '') : '';
    this.#hidden.replaceChildren(
      ...(o.name
        ? this.#value.map((v) => {
            const input = doc.createElement('input');
            input.type = 'hidden';
            input.name = o.name ?? '';
            input.value = v;
            return input;
          })
        : []),
    );
  }

  #renderValidity(): void {
    const o = this.#options;
    const locale = this.#config().locale;
    const consumerInvalid = o.invalid ?? false;
    const missing = (o.required ?? false) && this.#value.length === 0;
    this.#validity = consumerInvalid
      ? Object.freeze({ valid: false, error: 'custom', message: o.errorMessage ?? '' })
      : resolveValidity({ error: missing ? 'value-missing' : null, params: {} }, { locale, kind: 'choice' }, null, this.#state.customError);
    const show = consumerInvalid || (!this.#validity.valid && this.#state.shouldShow('blur'));
    const message = show ? this.#validity.message : '';
    renderError(this.#errorEl, message, o.icons?.error ?? 'alert-circle');
    this.#errorEl.hidden = message === '';
    const describedBy: string[] = [];
    if (o.description) describedBy.push(this.#descriptionEl.id);
    if (message) describedBy.push(this.#errorEl.id);
    if (describedBy.length) this.input.setAttribute('aria-describedby', describedBy.join(' '));
    else this.input.removeAttribute('aria-describedby');
    if (show) this.input.setAttribute('aria-invalid', 'true');
    else this.input.removeAttribute('aria-invalid');
    this.host.classList.toggle('aui-multi-select--invalid', show);
  }

  #renderOptions(): void {
    const doc = this.#doc;
    if (!this.#popover) {
      const all: Entry[] = this.#options.selectAll && this.#options.options.length > 0 ? [{ kind: 'all' }] : [];
      this.#entries = [...all, ...this.#options.options.map((option): Entry => ({ kind: 'option', option }))];
    }
    const selectedIcon = this.#options.icons?.selected ?? 'check';
    const render = this.#options.renderOption;
    const used = new Set<MultiSelectOption>();
    const locale = this.#config().locale;
    const els = this.#entries.map((entry, index) => {
      const el = doc.createElement('div');
      el.className = 'aui-multi-select__option';
      el.setAttribute('role', 'option');
      el.dataset.index = String(index);
      const check = doc.createElement('span');
      check.className = 'aui-multi-select__check';
      el.append(check);
      if (entry.kind === 'all') {
        const enabled = this.#visibleOptions().filter((o) => o.disabled !== true);
        const allSelected = enabled.length > 0 && enabled.every((o) => this.#value.includes(o.value));
        el.id = this.#allId;
        el.classList.add('aui-multi-select__option--all');
        el.setAttribute('aria-selected', String(allSelected));
        if (this.#entryDisabled(index)) el.setAttribute('aria-disabled', 'true');
        if (allSelected) check.append(renderIcon(selectedIcon, { doc }));
        const text = doc.createElement('span');
        text.className = 'aui-multi-select__option-label';
        text.textContent = getMessage('multiSelect', 'selectAll', {}, locale);
        el.append(text);
        return el;
      }
      const { option } = entry;
      let id = this.#ids.get(option);
      if (!id) {
        id = createId('aui-multi-select-option');
        this.#ids.set(option, id);
      }
      el.id = id;
      const selected = this.#value.includes(option.value);
      el.setAttribute('aria-selected', String(selected));
      if (this.#optionDisabled(option)) el.setAttribute('aria-disabled', 'true');
      if (selected) check.append(renderIcon(selectedIcon, { doc }));
      if (render) {
        let node = this.#optionNodes.get(option);
        if (!node) {
          node = render(option, { doc });
          this.#optionNodes.set(option, node);
        }
        used.add(option);
        el.setAttribute('aria-label', option.label);
        const content = doc.createElement('span');
        content.className = 'aui-multi-select__option-content';
        content.append(node);
        el.append(content);
        return el;
      }
      const text = doc.createElement('span');
      text.className = 'aui-multi-select__option-label';
      text.textContent = option.label;
      el.append(text);
      if (option.description) {
        const d = doc.createElement('span');
        d.className = 'aui-multi-select__option-description';
        d.textContent = option.description;
        el.append(d);
      }
      return el;
    });
    for (const [option, node] of this.#optionNodes) {
      if (used.has(option)) continue;
      releaseNode(node);
      this.#optionNodes.delete(option);
    }
    this.listbox.replaceChildren(...els);
    this.#renderStatus();
    if (this.#activeIndex >= this.#entries.length) this.#activeIndex = -1;
    if (this.#popover) this.#setActive(this.#activeIndex);
  }

  /** Documented tested scale (SPEC section 15.3). */
  static readonly testedOptionCount = MAX_OPTIONS_TESTED;
}
