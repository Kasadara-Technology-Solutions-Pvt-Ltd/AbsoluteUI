/**
 * Combobox (SPEC section 18.6, R0 reference component).
 * WAI-ARIA 1.2 editable combobox with list autocomplete (no automatic selection):
 * focus stays on the input; the active option is conveyed via aria-activedescendant.
 * The listbox renders in the top layer (Popover API) and is positioned by the
 * positioning engine. Selection is strict: the value is always one of the options.
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

export type ComboboxFilter = 'contains' | 'startsWith' | 'none';

export interface ComboboxConfig {
  filter: ComboboxFilter;
  openOnFocus: boolean;
  clearOnEscape: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    combobox: ComboboxConfig & { locale: string; direction: 'ltr' | 'rtl' };
  }
}

export const comboboxConfig = defineComponentConfig<ComboboxConfig, 'locale' | 'direction'>(
  'combobox',
  {
    filter: { default: 'contains', expected: '"contains" | "startsWith" | "none"', validate: validators.oneOf(['contains', 'startsWith', 'none'] as const) },
    openOnFocus: { default: false, expected: 'boolean', validate: validators.isBoolean },
    clearOnEscape: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

registerMessages('combobox', 'en', {
  showOptions: 'Show options',
  noResults: 'No results',
  resultCount: '{count} results available',
  resultCountOne: '1 result available',
  loading: 'Loading...',
  loadError: 'Could not load options.',
});

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly description?: string;
}

/** Context of `renderOption` (since 0.9.0). */
export interface ComboboxRenderContext {
  readonly doc: Document;
}

/** Context of `loadOptions` (since 0.9.0): aborted when a newer query starts or the list closes. */
export interface ComboboxLoadContext {
  readonly signal: AbortSignal;
}

export interface ComboboxIcons {
  expand: IconRef;
  selected: IconRef;
  /** Validation message icon (since 0.2.0). */
  error: IconRef;
}

export interface ComboboxOptions extends Partial<ComboboxConfig> {
  /** Visible label (required accessible name). */
  label: string;
  options: readonly ComboboxOption[];
  value?: string | null;
  /** Form field name; a hidden input carries the selected value. */
  name?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  /** Shown and announced when `invalid` is true (text only). */
  errorMessage?: string;
  locale?: string;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<ComboboxIcons>;
  /**
   * Custom option content (since 0.9.0). The option keeps `label` as its accessible name; the
   * node is decorative. Nodes are released with `releaseNode` when dropped.
   */
  renderOption?: (option: ComboboxOption, context: ComboboxRenderContext) => Node;
  /**
   * Load the options for the typed text (since 0.9.0), instead of filtering `options`.
   * Debounced by `loadDelay`; a newer query or closing the list aborts the previous request
   * (`signal`). Loading and errors are shown and announced. Keep the selected option in
   * `options` so a value set from outside is known before the first load.
   */
  loadOptions?: (query: string, context: ComboboxLoadContext) => Promise<readonly ComboboxOption[]>;
  /** Milliseconds between the last keystroke and `loadOptions` (default 250). */
  loadDelay?: number;
}

export interface ComboboxChangeDetail {
  value: string | null;
  option: ComboboxOption | null;
}

const MAX_OPTIONS_TESTED = 1000;

/** Loaded options are untrusted data: an array of `{ value: string, label: string }`. */
function isOptionList(value: unknown): value is readonly ComboboxOption[] {
  return Array.isArray(value) && value.every((o: unknown) => typeof o === 'object' && o !== null && typeof (o as { value?: unknown }).value === 'string' && typeof (o as { label?: unknown }).label === 'string');
}

function normalize(text: string, locale: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase(locale);
}

export class Combobox implements FormControl {
  readonly host: HTMLElement;
  readonly input: HTMLInputElement;
  readonly listbox: HTMLDivElement;
  #options: ComboboxOptions;
  #value: string | null;
  #filtered: ComboboxOption[] = [];
  #activeIndex = -1;
  #popover: PopoverHandle | null = null;
  #stopPosition: Disposer | null = null;
  #announceTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #doc: Document;
  readonly #label: HTMLLabelElement;
  readonly #control: HTMLDivElement;
  readonly #toggle: HTMLButtonElement;
  readonly #popup: HTMLDivElement;
  readonly #empty: HTMLDivElement;
  readonly #hidden: HTMLInputElement;
  readonly #descriptionEl: HTMLDivElement;
  readonly #errorEl: HTMLDivElement;
  readonly #ids = new Map<ComboboxOption, string>();
  /** Nodes from `renderOption`, reused per option object (D8). */
  readonly #optionNodes = new Map<ComboboxOption, Node>();
  /** Options returned by the last completed `loadOptions` call. */
  #loaded: readonly ComboboxOption[] | null = null;
  /** The selected option object (it may come from loaded options). */
  #selectedCache: ComboboxOption | null = null;
  #loadState: 'idle' | 'loading' | 'error' = 'idle';
  #loadTimer: ReturnType<typeof setTimeout> | undefined;
  #loadAbort: AbortController | null = null;
  readonly #group = new DisposableGroup();
  readonly #state = new FieldState();
  #initialValue: string | null;
  #validity: FieldValidity = VALID;

  /** Render a combobox into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: ComboboxOptions): Combobox {
    return new Combobox(host, options);
  }

  private constructor(host: HTMLElement, options: ComboboxOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#value = options.value ?? null;
    this.#initialValue = this.#value;
    const doc = this.#doc;

    const inputId = createId('aui-combobox-input');
    const listboxId = createId('aui-combobox-listbox');

    this.#label = doc.createElement('label');
    this.#label.className = 'aui-combobox__label';
    this.#label.htmlFor = inputId;

    this.#control = doc.createElement('div');
    this.#control.className = 'aui-combobox__control';

    this.input = doc.createElement('input');
    this.input.id = inputId;
    this.input.type = 'text';
    this.input.className = 'aui-combobox__input';
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('aria-expanded', 'false');
    this.input.setAttribute('aria-controls', listboxId);
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;

    this.#toggle = doc.createElement('button');
    this.#toggle.type = 'button';
    this.#toggle.className = 'aui-combobox__toggle';
    this.#toggle.tabIndex = -1;
    this.#toggle.setAttribute('aria-controls', listboxId);
    this.#toggle.setAttribute('aria-expanded', 'false');

    this.#control.append(this.input, this.#toggle);

    this.#popup = doc.createElement('div');
    this.#popup.className = 'aui-combobox__popup';
    // Hidden by the UA stylesheet until shown in the top layer.
    this.#popup.popover = 'manual';
    this.listbox = doc.createElement('div');
    this.listbox.id = listboxId;
    this.listbox.className = 'aui-combobox__listbox';
    this.listbox.setAttribute('role', 'listbox');
    this.#empty = doc.createElement('div');
    this.#empty.className = 'aui-combobox__empty';
    this.#popup.append(this.listbox, this.#empty);

    this.#hidden = doc.createElement('input');
    this.#hidden.type = 'hidden';

    this.#descriptionEl = doc.createElement('div');
    this.#descriptionEl.className = 'aui-combobox__description';
    this.#descriptionEl.id = createId('aui-combobox-desc');
    this.#errorEl = doc.createElement('div');
    this.#errorEl.className = 'aui-combobox__error';
    this.#errorEl.id = createId('aui-combobox-error');

    host.classList.add('aui-combobox');
    host.replaceChildren(this.#label, this.#control, this.#descriptionEl, this.#errorEl, this.#hidden, this.#popup);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#syncInputToValue();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(comboboxConfig.subscribe(() => {
      this.#render();
    }));
  }

  get value(): string | null {
    return this.#value;
  }

  get selectedOption(): ComboboxOption | null {
    return this.#find(this.#value);
  }

  /** A known option for a value: from `options`, the last load, or the selected one. */
  #find(value: string | null): ComboboxOption | null {
    if (value === null) return null;
    return this.#options.options.find((o) => o.value === value) ?? this.#loaded?.find((o) => o.value === value) ?? (this.#selectedCache?.value === value ? this.#selectedCache : null);
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

  /** `{ valid, error, message }`. `invalid`/`errorMessage` options take precedence over built-in checks. */
  get validity(): FieldValidity {
    return this.#validity;
  }

  get dirty(): boolean {
    return this.#value !== this.#initialValue;
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  getFormValue(): string | null {
    return this.#value;
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
    this.#value = this.#initialValue;
    this.#syncInputToValue();
    this.#render();
  }

  /** Set the value programmatically (no `aui-change` event). Unknown values clear the selection. */
  setValue(value: string | null): void {
    const option = this.#find(value);
    this.#value = option ? option.value : null;
    this.#selectedCache = option;
    this.#syncInputToValue();
    this.#renderOptions();
  }

  update(options: Partial<ComboboxOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    if ('value' in options) this.#value = options.value ?? null;
    // A value whose option was removed is cleared (programmatic: no aui-change).
    if (this.#value !== null && !this.#find(this.#value)) this.#value = null;
    this.#selectedCache = this.#find(this.#value);
    this.#render();
    if ('value' in options || 'options' in options) this.#syncInputToValue();
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
    // Filter after the popover is registered so options render in filtered mode.
    this.#applyFilter(this.#currentQueryForFilter());
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
    this.host.classList.remove('aui-combobox');
  }

  #config(): Readonly<ComboboxConfig & { locale: string; direction: 'ltr' | 'rtl' }> {
    const o = this.#options;
    return comboboxConfig.resolve({
      ...(o.filter === undefined ? {} : { filter: o.filter }),
      ...(o.openOnFocus === undefined ? {} : { openOnFocus: o.openOnFocus }),
      ...(o.clearOnEscape === undefined ? {} : { clearOnEscape: o.clearOnEscape }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #assertOptions(options: ComboboxOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('COMBOBOX_OPTIONS', 'Invalid combobox options.', { component: 'combobox', property: `combobox.${property}`, expected });
    };
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (!Array.isArray(options.options)) fail('options', 'array of { value, label }');
    const seen = new Set<string>();
    for (const [i, o] of options.options.entries()) {
      if (typeof o.value !== 'string' || typeof o.label !== 'string') fail(`options[${i}]`, '{ value: string, label: string }');
      if (seen.has(o.value)) fail(`options[${i}].value`, 'unique value');
      seen.add(o.value);
    }
    if (options.renderOption !== undefined && typeof options.renderOption !== 'function') fail('renderOption', 'function (option, { doc }) => Node');
    if (options.loadOptions !== undefined && typeof options.loadOptions !== 'function') fail('loadOptions', 'function (query, { signal }) => Promise<options>');
    if (options.loadDelay !== undefined && !(Number.isInteger(options.loadDelay) && options.loadDelay >= 0 && options.loadDelay <= 5000)) fail('loadDelay', 'integer from 0 to 5000 (ms)');
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
      this.#syncInputToValue();
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#renderValidity();
      });
    });
    g.listen(this.#toggle, 'click', () => {
      if (this.#popover) this.close();
      else {
        this.open();
        this.#setActive(this.#selectedFilteredIndex());
      }
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
      const option = this.#filtered[index];
      if (option && !option.disabled) this.#select(option);
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
          const selected = this.#selectedFilteredIndex();
          const start = selected >= 0 ? selected : event.key === 'ArrowDown' ? this.#firstEnabled(0, 1) : this.#firstEnabled(this.#filtered.length - 1, -1);
          this.#setActive(start);
          return;
        }
        this.#move(event.key);
        return;
      }
      case 'PageDown':
      case 'PageUp':
        if (!open) return;
        event.preventDefault();
        this.#move(event.key);
        return;
      case 'Enter': {
        if (!open) return;
        const option = this.#filtered[this.#activeIndex];
        if (option && !option.disabled) {
          event.preventDefault();
          this.#select(option);
        }
        return;
      }
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        } else if (this.#config().clearOnEscape && (this.input.value !== '' || this.#value !== null)) {
          event.preventDefault();
          event.stopPropagation();
          this.input.value = '';
          this.#commit(null);
        }
        return;
      case 'Tab':
        if (open) this.close();
        this.#syncInputToValue();
        return;
      default:
        return;
    }
  }

  #move(key: string): void {
    const next = getNextIndex(key, this.#activeIndex, this.#filtered.length, {
      orientation: 'vertical',
      loop: key === 'ArrowDown' || key === 'ArrowUp',
      isDisabled: (i) => this.#filtered[i]?.disabled === true,
    });
    if (next !== null) this.#setActive(next);
  }

  #firstEnabled(from: number, step: 1 | -1): number {
    for (let i = from; i >= 0 && i < this.#filtered.length; i += step) if (!this.#filtered[i]?.disabled) return i;
    return -1;
  }

  #selectedFilteredIndex(): number {
    return this.#filtered.findIndex((o) => o.value === this.#value);
  }

  /** While the input shows the selected label, opening lists all options. */
  #currentQueryForFilter(): string {
    const selected = this.selectedOption;
    return this.input.value === selected?.label ? '' : this.input.value;
  }

  #applyFilter(query: string): void {
    if (this.#options.loadOptions) {
      // Server-side filtering: show what is known now, then the loaded results.
      this.#filtered = [...(this.#loaded ?? this.#options.options)];
      this.#renderOptions();
      this.#scheduleLoad(query);
      return;
    }
    const { filter, locale } = this.#config();
    const q = normalize(query.trim(), locale);
    const all = this.#options.options;
    this.#filtered = filter === 'none' || q === '' ? [...all] : all.filter((o) => {
      const label = normalize(o.label, locale);
      return filter === 'startsWith' ? label.startsWith(q) : label.includes(q);
    });
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
            this.#filtered = [...options];
            this.#renderOptions();
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
    if (this.#popover) announce(getMessage('combobox', 'loadError', {}, this.#config().locale), 'polite', this.#doc);
  }

  #cancelLoad(): void {
    clearTimeout(this.#loadTimer);
    this.#loadAbort?.abort();
    this.#loadAbort = null;
    if (this.#loadState === 'loading') this.#loadState = 'idle';
  }

  /** The text under the list: loading, a load error, or no results. */
  #renderStatus(): void {
    const locale = this.#config().locale;
    const state = this.#loadState;
    this.#empty.textContent = getMessage('combobox', state === 'loading' ? 'loading' : state === 'error' ? 'loadError' : 'noResults', {}, locale);
    this.#empty.hidden = state === 'idle' && this.listbox.childElementCount > 0;
    if (state === 'loading') this.listbox.setAttribute('aria-busy', 'true');
    else this.listbox.removeAttribute('aria-busy');
  }

  #scheduleAnnouncement(): void {
    clearTimeout(this.#announceTimer);
    this.#announceTimer = setTimeout(() => {
      if (!this.#popover) return;
      const n = this.#filtered.length;
      const locale = this.#config().locale;
      const text = n === 0 ? getMessage('combobox', 'noResults', {}, locale) : n === 1 ? getMessage('combobox', 'resultCountOne', {}, locale) : getMessage('combobox', 'resultCount', { count: n }, locale);
      announce(text, 'polite', this.#doc);
    }, 400);
  }

  #setActive(index: number): void {
    this.#activeIndex = index;
    const optionEls = this.listbox.children;
    for (let i = 0; i < optionEls.length; i++) optionEls[i]?.classList.toggle('aui-combobox__option--active', i === index);
    const active = index >= 0 ? (optionEls[index] as HTMLElement | undefined) : undefined;
    if (active) {
      this.input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    } else {
      this.input.removeAttribute('aria-activedescendant');
    }
  }

  #select(option: ComboboxOption): void {
    this.#selectedCache = option;
    this.input.value = option.label;
    this.close();
    this.#commit(option.value);
  }

  #commit(value: string | null): void {
    if (value === this.#value) {
      this.#syncInputToValue();
      return;
    }
    this.#value = value;
    this.#hidden.value = value ?? '';
    // An external error describes the previous value; a new selection clears it.
    this.#state.customError = null;
    this.#renderOptions();
    this.#renderValidity();
    emit(this.host, 'aui-change', { value, option: this.selectedOption } satisfies ComboboxChangeDetail);
  }

  #syncInputToValue(): void {
    const selected = this.selectedOption;
    // Strict selection: outside of active filtering, the input always shows the selected label.
    this.input.value = selected?.label ?? (this.#popover ? this.input.value : '');
    this.#hidden.value = selected?.value ?? '';
  }

  #render(): void {
    const o = this.#options;
    const locale = this.#config().locale;
    renderLabel(this.#label, o.label, o.required ?? false);
    this.listbox.setAttribute('aria-label', o.label);
    this.input.placeholder = o.placeholder ?? '';
    this.input.disabled = o.disabled ?? false;
    this.input.readOnly = o.readOnly ?? false;
    this.input.required = o.required ?? false;
    if (o.required) this.input.setAttribute('aria-required', 'true');
    else this.input.removeAttribute('aria-required');
    this.#toggle.disabled = (o.disabled ?? false) || (o.readOnly ?? false);
    this.#toggle.setAttribute('aria-label', getMessage('combobox', 'showOptions', {}, locale));
    this.#toggle.replaceChildren(renderIcon(o.icons?.expand ?? 'chevron-down', { doc: this.#doc }));

    if (o.name) this.#hidden.name = o.name;
    else this.#hidden.removeAttribute('name');

    this.#descriptionEl.textContent = o.description ?? '';
    this.#descriptionEl.hidden = !o.description;
    this.#renderValidity();
    this.host.classList.toggle('aui-combobox--disabled', o.disabled ?? false);

    if (this.#popover) this.#applyFilter(this.#currentQueryForFilter());
    else this.#renderOptions();
  }

  /**
   * Consumer-managed `invalid`/`errorMessage` are shown immediately (R0 behavior).
   * Built-in (required) and external errors follow the blur timing: after the
   * control was touched or `reportValidity()` ran.
   */
  #renderValidity(): void {
    const o = this.#options;
    const locale = this.#config().locale;
    const consumerInvalid = o.invalid ?? false;
    const missing = (o.required ?? false) && this.#value === null;
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
    this.host.classList.toggle('aui-combobox--invalid', show);
  }

  #renderOptions(): void {
    const doc = this.#doc;
    const list = this.#popover ? this.#filtered : this.#options.options;
    if (!this.#popover) this.#filtered = [...list];
    const selectedIcon = this.#options.icons?.selected ?? 'check';
    const render = this.#options.renderOption;
    const used = new Set<ComboboxOption>();
    const els = list.map((option, index) => {
      let id = this.#ids.get(option);
      if (!id) {
        id = createId('aui-combobox-option');
        this.#ids.set(option, id);
      }
      const el = doc.createElement('div');
      el.id = id;
      el.className = 'aui-combobox__option';
      el.setAttribute('role', 'option');
      el.dataset.index = String(index);
      const selected = option.value === this.#value;
      el.setAttribute('aria-selected', String(selected));
      if (option.disabled) el.setAttribute('aria-disabled', 'true');
      if (render) {
        let node = this.#optionNodes.get(option);
        if (!node) {
          node = render(option, { doc });
          this.#optionNodes.set(option, node);
        }
        used.add(option);
        el.setAttribute('aria-label', option.label);
        const content = doc.createElement('span');
        content.className = 'aui-combobox__option-content';
        content.append(node);
        el.append(content);
        if (selected) el.append(renderIcon(selectedIcon, { className: 'aui-combobox__check', doc }));
        return el;
      }
      const text = doc.createElement('span');
      text.className = 'aui-combobox__option-label';
      text.textContent = option.label;
      el.append(text);
      if (option.description) {
        const d = doc.createElement('span');
        d.className = 'aui-combobox__option-description';
        d.textContent = option.description;
        el.append(d);
      }
      if (selected) el.append(renderIcon(selectedIcon, { className: 'aui-combobox__check', doc }));
      return el;
    });
    for (const [option, node] of this.#optionNodes) {
      if (used.has(option)) continue;
      releaseNode(node);
      this.#optionNodes.delete(option);
    }
    this.listbox.replaceChildren(...els);
    this.#renderStatus();
    if (this.#activeIndex >= list.length) this.#activeIndex = -1;
    if (this.#popover) this.#setActive(this.#activeIndex);
  }

  /** Documented tested scale (SPEC section 15.3). */
  static readonly testedOptionCount = MAX_OPTIONS_TESTED;
}

