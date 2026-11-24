/**
 * Select (SPEC section 18.5). WAI-ARIA APG select-only combobox: a focusable
 * `role="combobox"` element shows the selected label and controls a listbox in
 * the top layer (Popover API), positioned by the positioning engine. DOM focus
 * never leaves the combobox; the active option is conveyed via
 * aria-activedescendant. A hidden input carries the value for native forms.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, releaseNode, type Disposer } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { applyVisuallyHidden, autoPosition, createTypeahead, getNextIndex, isPrintableKey, openPopover, type PopoverHandle } from '@absoluteui/utilities';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { resolveValidity, runValidator, VALID, type FieldValidity, type Outcome } from '../internal/validation.js';

export interface SelectConfig {
  validationTiming: ValidationTiming;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    select: SelectConfig & { locale: string; direction: 'ltr' | 'rtl' };
  }
}

export const selectConfig = defineComponentConfig<SelectConfig, 'locale' | 'direction'>(
  'select',
  { validationTiming: validationTimingSpec },
  ['locale', 'direction'],
);

registerMessages('select', 'en', {
  placeholder: 'Select an option',
});

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
  /** Secondary text shown under the label (text only). */
  readonly description?: string;
}

/** Context of `renderOption` and `renderValue` (since 0.9.0). */
export interface SelectRenderContext {
  readonly doc: Document;
}

export interface SelectIcons {
  expand: IconRef;
  selected: IconRef;
  error: IconRef;
}

export interface SelectOptions extends Partial<SelectConfig> {
  /** Visible label (required accessible name). */
  label: string;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  /** Flat list of options with unique values. */
  options: readonly SelectOption[];
  /** Selected value; unknown values select nothing. */
  value?: string | null;
  /** Form field name; a hidden input carries the selected value. */
  name?: string;
  /** Shown while nothing is selected. Default: localized "Select an option". */
  placeholder?: string;
  /** Help text, referenced by aria-describedby (text only). */
  description?: string;
  required?: boolean;
  disabled?: boolean;
  /** Focusable and submitted, but the listbox does not open. */
  readOnly?: boolean;
  /** Consumer validation; return a message to mark the value invalid. */
  validate?: (value: string | null) => string | null;
  locale?: string;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<SelectIcons>;
  /**
   * Custom option content (since 0.9.0). The option keeps `label` as its accessible name and
   * typeahead text; the node is decorative. Nodes are released with `releaseNode` when dropped.
   */
  renderOption?: (option: SelectOption, context: SelectRenderContext) => Node;
  /** Custom content for the selected value (since 0.9.0); the label stays the announced value. */
  renderValue?: (option: SelectOption, context: SelectRenderContext) => Node;
}

export interface SelectChangeDetail {
  value: string | null;
  option: SelectOption | null;
  validity: FieldValidity;
}

const MAX_OPTIONS_TESTED = 1000;
const TYPEAHEAD_MS = 500;
const OK: Outcome = { error: null, params: {} };

export class Select implements FormControl {
  readonly host: HTMLElement;
  /** The focusable `role="combobox"` element. */
  readonly combobox: HTMLDivElement;
  readonly listbox: HTMLDivElement;
  #options: SelectOptions;
  #value: string | null;
  #initialValue: string | null;
  #validity: FieldValidity = VALID;
  #activeIndex = -1;
  #optionEls: HTMLDivElement[] = [];
  #labels: string[] = [];
  #check: Element | null = null;
  #popover: PopoverHandle | null = null;
  #stopPosition: Disposer | null = null;
  #typingUntil = 0;
  readonly #typeahead = createTypeahead(TYPEAHEAD_MS);
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #valueEl: HTMLSpanElement;
  readonly #chevron: HTMLSpanElement;
  readonly #popup: HTMLDivElement;
  readonly #hidden: HTMLInputElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();
  /** Nodes from `renderOption`, reused per option object (D8). */
  readonly #optionNodes = new Map<SelectOption, Node>();
  #valueNode: { option: SelectOption; node: Node } | null = null;

  /** Render a select into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: SelectOptions): Select {
    return new Select(host, options);
  }

  private constructor(host: HTMLElement, options: SelectOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#value = this.#known(options.value ?? null);
    this.#initialValue = this.#value;
    const doc = this.#doc;

    const listboxId = createId('aui-select-listbox');
    // A <label> cannot name a div; it is associated through aria-labelledby instead.
    this.#chrome = new FieldChrome(doc, 'label', 'aui-select');
    const labelId = this.#chrome.label.id;

    this.combobox = doc.createElement('div');
    this.combobox.id = createId('aui-select-combobox');
    this.combobox.className = 'aui-select__combobox';
    this.combobox.setAttribute('role', 'combobox');
    this.combobox.setAttribute('aria-haspopup', 'listbox');
    this.combobox.setAttribute('aria-expanded', 'false');
    this.combobox.setAttribute('aria-controls', listboxId);
    // Label first, then the combobox's own content (the selected label), per the APG example.
    this.combobox.setAttribute('aria-labelledby', `${labelId} ${this.combobox.id}`);
    this.#valueEl = doc.createElement('span');
    this.#valueEl.className = 'aui-select__value';
    this.#chevron = doc.createElement('span');
    this.#chevron.className = 'aui-select__chevron';
    this.combobox.append(this.#valueEl, this.#chevron);

    this.#popup = doc.createElement('div');
    this.#popup.className = 'aui-select__popup';
    // Hidden by the UA stylesheet until shown in the top layer.
    this.#popup.popover = 'manual';
    this.listbox = doc.createElement('div');
    this.listbox.id = listboxId;
    this.listbox.className = 'aui-select__listbox';
    this.listbox.setAttribute('role', 'listbox');
    this.listbox.setAttribute('aria-labelledby', labelId);
    this.#popup.append(this.listbox);

    this.#hidden = doc.createElement('input');
    this.#hidden.type = 'hidden';

    host.classList.add('aui-field', 'aui-select');
    host.replaceChildren(this.#chrome.label, this.combobox, this.#chrome.description, this.#chrome.error, this.#hidden, this.#popup);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#renderOptions();
    this.#render();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(selectConfig.subscribe(() => {
      this.#render();
    }));
  }

  get value(): string | null {
    return this.#value;
  }

  get selectedOption(): SelectOption | null {
    return this.#options.options.find((o) => o.value === this.#value) ?? null;
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
    return this.#value !== this.#initialValue;
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<SelectOptions> {
    return this.#options;
  }

  getFormValue(): string | null {
    return this.#value;
  }

  /** Set the value programmatically (no events). Unknown values clear the selection. */
  setValue(value: string | null): void {
    this.#value = this.#known(value);
    this.#state.customError = null;
    this.#render();
  }

  update(options: Partial<SelectOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    if ('options' in options) {
      this.#activeIndex = -1;
      this.#renderOptions();
    }
    if ('value' in options) this.#value = options.value ?? null;
    // A value whose option was removed is cleared (programmatic: no aui-change).
    this.#value = this.#known(this.#value);
    if (this.#popover && (next.disabled || next.readOnly)) this.close();
    this.#render();
  }

  /** Show the listbox; the selected option (or the first enabled one) becomes active. */
  open(): void {
    if (this.#popover || this.#options.disabled || this.#options.readOnly) return;
    this.#popover = openPopover(this.#popup, {
      inside: [this.combobox],
      onDismiss: () => {
        this.close();
      },
    });
    this.#stopPosition = autoPosition(this.combobox, this.#popup, { placement: 'bottom-start', matchAnchorWidth: true, direction: this.#config().direction });
    this.combobox.setAttribute('aria-expanded', 'true');
    const selected = this.#selectedIndex();
    this.#setActive(selected >= 0 ? selected : this.#firstEnabled(0, 1));
    emit(this.host, 'aui-open', null, { bubbles: false });
  }

  close(): void {
    if (!this.#popover) return;
    this.#stopPosition?.();
    this.#stopPosition = null;
    this.#popover.close();
    this.#popover = null;
    this.#setActive(-1);
    this.#typeahead.reset();
    this.combobox.setAttribute('aria-expanded', 'false');
    emit(this.host, 'aui-close', null, { bubbles: false });
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
    this.combobox.focus();
  }

  reset(): void {
    this.close();
    this.#value = this.#initialValue;
    this.#state.reset();
    this.#render();
  }

  destroy(): void {
    this.close();
    this.#group.dispose();
    this.#typeahead.reset();
    for (const node of this.#optionNodes.values()) releaseNode(node);
    this.#optionNodes.clear();
    releaseNode(this.#valueNode?.node);
    this.#valueNode = null;
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-select', 'aui-select--invalid', 'aui-select--disabled');
  }

  #config(): Readonly<SelectConfig & { locale: string; direction: 'ltr' | 'rtl' }> {
    const o = this.#options;
    return selectConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #assertOptions(options: SelectOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('SELECT_OPTIONS', 'Invalid select options.', { component: 'select', property: `select.${property}`, expected });
    };
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (!Array.isArray(options.options)) fail('options', 'array of { value, label }');
    const seen = new Set<string>();
    for (const [i, o] of options.options.entries()) {
      if (typeof o.value !== 'string' || typeof o.label !== 'string') fail(`options[${i}]`, '{ value: string, label: string }');
      if (seen.has(o.value)) fail(`options[${i}].value`, 'unique value');
      seen.add(o.value);
    }
    if (options.value !== undefined && options.value !== null && typeof options.value !== 'string') fail('value', 'string | null');
    if (options.renderOption !== undefined && typeof options.renderOption !== 'function') fail('renderOption', 'function (option, { doc }) => Node');
    if (options.renderValue !== undefined && typeof options.renderValue !== 'function') fail('renderValue', 'function (option, { doc }) => Node');
  }

  #known(value: string | null): string | null {
    return value !== null && this.#options.options.some((o) => o.value === value) ? value : null;
  }

  #bindEvents(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.combobox, 'keydown', (event) => {
      this.#onKeyDown(event);
    });
    // A disabled combobox must not take focus from a pointer either.
    g.listen(this.combobox, 'pointerdown', (event) => {
      if (this.#options.disabled) event.preventDefault();
    });
    g.listen(this.combobox, 'click', () => {
      if (this.#popover) this.close();
      else this.open();
    });
    // A <label> without `for` does not focus a div; do it explicitly.
    g.listen(this.#chrome.label, 'click', () => {
      if (!this.#options.disabled) this.combobox.focus();
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      this.close();
      // Deferred while a pointer is pressed, so a message does not shift the pending click target.
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
    // Keep focus on the combobox while interacting with the popup (including its scrollbar).
    g.listen(this.#popup, 'pointerdown', (event) => {
      event.preventDefault();
    });
    g.listen(this.listbox, 'click', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="option"]') : null;
      if (!target) return;
      const index = Number(target.dataset.index);
      const option = this.#options.options[index];
      if (option && !option.disabled) this.#selectIndex(index);
      this.combobox.focus();
    });
  }

  #onKeyDown(event: KeyboardEvent): void {
    const o = this.#options;
    if (o.disabled || o.readOnly) return;
    const open = this.#popover !== null;
    const typing = performance.now() < this.#typingUntil;
    // Space continues a typeahead query ("New York") instead of selecting.
    if (isPrintableKey(event) && (event.key !== ' ' || typing)) {
      event.preventDefault();
      this.#onType(event.key);
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!open) {
          this.open();
          if (this.#selectedIndex() < 0 && event.key === 'ArrowUp' && !event.altKey) this.#setActive(this.#firstEnabled(this.#optionEls.length - 1, -1));
          return;
        }
        if (event.altKey) {
          if (event.key === 'ArrowUp') this.#selectActiveAndClose();
          return;
        }
        if (this.#activeIndex < 0) {
          this.#setActive(event.key === 'ArrowDown' ? this.#firstEnabled(0, 1) : this.#firstEnabled(this.#optionEls.length - 1, -1));
          return;
        }
        this.#move(event.key);
        return;
      }
      case 'Home':
      case 'End':
        event.preventDefault();
        this.open();
        this.#setActive(event.key === 'Home' ? this.#firstEnabled(0, 1) : this.#firstEnabled(this.#optionEls.length - 1, -1));
        return;
      case 'PageDown':
      case 'PageUp':
        if (!open) return;
        event.preventDefault();
        this.#move(event.key);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) this.#selectActiveAndClose();
        else this.open();
        return;
      case 'Escape':
        // Normally handled by the overlay stack (document capture); kept for robustness.
        if (!open) return;
        event.preventDefault();
        event.stopPropagation();
        this.close();
        return;
      case 'Tab':
        // APG: Tab commits the active option, closes, and lets focus move (no preventDefault).
        if (open) this.#selectActiveAndClose();
        return;
      default:
        return;
    }
  }

  #onType(char: string): void {
    this.#typingUntil = performance.now() + TYPEAHEAD_MS;
    const current = this.#popover ? this.#activeIndex : this.#selectedIndex();
    const match = this.#typeahead.handle(char, this.#labels, current, (i) => this.#options.options[i]?.disabled === true);
    // APG: typing on a closed select opens it and activates the match.
    this.open();
    if (match >= 0) this.#setActive(match);
  }

  #move(key: string): void {
    const next = getNextIndex(key, this.#activeIndex, this.#optionEls.length, {
      orientation: 'vertical',
      loop: false,
      isDisabled: (i) => this.#options.options[i]?.disabled === true,
    });
    if (next !== null) this.#setActive(next);
  }

  #firstEnabled(from: number, step: 1 | -1): number {
    const all = this.#options.options;
    for (let i = from; i >= 0 && i < all.length; i += step) if (!all[i]?.disabled) return i;
    return -1;
  }

  #selectedIndex(): number {
    return this.#options.options.findIndex((o) => o.value === this.#value);
  }

  #setActive(index: number): void {
    const previous = this.#optionEls[this.#activeIndex];
    previous?.classList.remove('aui-select__option--active');
    this.#activeIndex = index;
    const active = this.#optionEls[index];
    if (active && this.#popover) {
      active.classList.add('aui-select__option--active');
      this.combobox.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    } else {
      this.combobox.removeAttribute('aria-activedescendant');
    }
  }

  #selectActiveAndClose(): void {
    const index = this.#activeIndex;
    const option = this.#options.options[index];
    if (option && !option.disabled) this.#selectIndex(index);
    else this.close();
  }

  #selectIndex(index: number): void {
    const option = this.#options.options[index];
    this.close();
    if (!option || option.value === this.#value) return;
    this.#value = option.value;
    this.#state.dirty = true;
    // An external error describes the previous value; a new selection clears it.
    this.#state.customError = null;
    this.#render();
    emit(this.host, 'aui-change', { value: this.#value, option, validity: this.#validity } satisfies SelectChangeDetail);
  }

  #renderOptions(): void {
    const doc = this.#doc;
    const all = this.#options.options;
    const render = this.#options.renderOption;
    const used = new Set<SelectOption>();
    this.#check = null;
    this.#labels = all.map((o) => o.label);
    this.#optionEls = all.map((option, index) => {
      const el = doc.createElement('div');
      el.id = createId('aui-select-option');
      el.className = 'aui-select__option';
      el.setAttribute('role', 'option');
      el.dataset.index = String(index);
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
        content.className = 'aui-select__option-content';
        content.append(node);
        el.append(content);
        return el;
      }
      const text = doc.createElement('span');
      text.className = 'aui-select__option-label';
      text.textContent = option.label;
      el.append(text);
      if (option.description) {
        const d = doc.createElement('span');
        d.className = 'aui-select__option-description';
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
    this.listbox.replaceChildren(...this.#optionEls);
  }

  /** The selected label, or custom content with the label kept as visually hidden text. */
  #renderValue(option: SelectOption | undefined, placeholder: string): void {
    const render = this.#options.renderValue;
    if (!option || !render) {
      releaseNode(this.#valueNode?.node);
      this.#valueNode = null;
      this.#valueEl.textContent = option?.label ?? placeholder;
      return;
    }
    if (this.#valueNode?.option !== option) {
      releaseNode(this.#valueNode?.node);
      this.#valueNode = { option, node: render(option, { doc: this.#doc }) };
    }
    const text = this.#doc.createElement('span');
    text.textContent = option.label;
    applyVisuallyHidden(text);
    const content = this.#doc.createElement('span');
    content.className = 'aui-select__value-content';
    content.setAttribute('aria-hidden', 'true');
    content.append(this.#valueNode.node);
    this.#valueEl.replaceChildren(text, content);
  }

  #syncSelection(selected: number): void {
    for (const [i, el] of this.#optionEls.entries()) el.setAttribute('aria-selected', String(i === selected));
    this.#check?.remove();
    this.#check = null;
    const el = this.#optionEls[selected];
    if (el) {
      this.#check = renderIcon(this.#options.icons?.selected ?? 'check', { className: 'aui-select__check', doc: this.#doc });
      el.append(this.#check);
    }
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const cb = this.combobox;
    const disabled = o.disabled ?? false;
    const readOnly = o.readOnly ?? false;

    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    const selected = this.#selectedIndex();
    const option = o.options[selected];
    this.#renderValue(option, o.placeholder ?? getMessage('select', 'placeholder', {}, config.locale));
    this.#valueEl.classList.toggle('aui-select__value--placeholder', !option);
    this.#chevron.replaceChildren(renderIcon(o.icons?.expand ?? 'chevron-down', { doc: this.#doc }));
    this.#syncSelection(selected);

    // APG: a disabled combobox leaves the tab order and exposes aria-disabled.
    cb.tabIndex = disabled ? -1 : 0;
    if (disabled) cb.setAttribute('aria-disabled', 'true');
    else cb.removeAttribute('aria-disabled');
    if (readOnly) cb.setAttribute('aria-readonly', 'true');
    else cb.removeAttribute('aria-readonly');
    if (o.required) cb.setAttribute('aria-required', 'true');
    else cb.removeAttribute('aria-required');

    if (o.name) this.#hidden.name = o.name;
    else this.#hidden.removeAttribute('name');
    this.#hidden.value = this.#value ?? '';
    // Like native controls, a disabled select is not submitted.
    this.#hidden.disabled = disabled;

    const outcome: Outcome = o.required && this.#value === null ? { error: 'value-missing', params: {} } : OK;
    const custom = outcome.error === null ? runValidator(o.validate, this.#value) : null;
    this.#validity = resolveValidity(outcome, { locale: config.locale, kind: 'choice' }, custom, this.#state.customError);

    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    setDescribedBy(cb, this.#chrome.describedBy());
    setInvalid(cb, show);
    this.host.classList.toggle('aui-select--invalid', show);
    this.host.classList.toggle('aui-select--disabled', disabled);
  }

  /** Documented tested scale (SPEC section 15.3). */
  static readonly testedOptionCount = MAX_OPTIONS_TESTED;
}
