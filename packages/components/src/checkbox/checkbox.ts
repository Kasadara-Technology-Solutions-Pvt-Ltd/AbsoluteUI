/**
 * Checkbox (SPEC section 18.5). A native <input type="checkbox"> restyled with
 * `appearance: none`: the native input stays the focus target, the hit target,
 * and the source of truth for checked and mixed state (the `indeterminate`
 * property exposes aria-checked="mixed" natively). The check and minus marks
 * are icons layered over the input, so checked state never relies on color alone.
 */
import { configurationError, defineComponentConfig, DisposableGroup, emit, createId } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { resolveValidity, runValidator, VALID, type FieldValidity, type Outcome } from '../internal/validation.js';

export interface CheckboxConfig {
  validationTiming: ValidationTiming;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    checkbox: CheckboxConfig & { locale: string };
  }
}

export const checkboxConfig = defineComponentConfig<CheckboxConfig, 'locale'>(
  'checkbox',
  { validationTiming: validationTimingSpec },
  ['locale'],
);

export interface CheckboxIcons {
  checked: IconRef;
  indeterminate: IconRef;
  error: IconRef;
}

export interface CheckboxOptions extends Partial<CheckboxConfig> {
  /** Visible label (required accessible name). Clicking it toggles the checkbox. */
  label: string;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  checked?: boolean;
  /** Mixed state, e.g. a "select all" parent. Cleared natively when the user toggles. */
  indeterminate?: boolean;
  /** Submitted value when checked. Default `on` (native). */
  value?: string;
  name?: string;
  /** Help text, referenced by aria-describedby (text only). */
  description?: string;
  /** The box must be checked (for example, accepting terms). */
  required?: boolean;
  disabled?: boolean;
  /** Consumer validation; return a message to mark the state invalid. */
  validate?: (checked: boolean) => string | null;
  locale?: string;
  icons?: Partial<CheckboxIcons>;
}

export interface CheckboxChangeDetail {
  checked: boolean;
  value: string;
  validity: FieldValidity;
}

const OK: Outcome = Object.freeze({ error: null, params: {} });

export class Checkbox implements FormControl {
  readonly host: HTMLElement;
  readonly input: HTMLInputElement;
  #options: CheckboxOptions;
  #initialChecked: boolean;
  #initialIndeterminate: boolean;
  #validity: FieldValidity = VALID;
  #checkIconRef: IconRef | null = null;
  #mixedIconRef: IconRef | null = null;
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #checkIcon: HTMLSpanElement;
  readonly #mixedIcon: HTMLSpanElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render a checkbox into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: CheckboxOptions): Checkbox {
    return new Checkbox(host, options);
  }

  private constructor(host: HTMLElement, options: CheckboxOptions) {
    Checkbox.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#initialChecked = options.checked ?? false;
    this.#initialIndeterminate = options.indeterminate ?? false;
    const doc = this.#doc;

    this.#chrome = new FieldChrome(doc, 'label', 'aui-checkbox');
    this.#chrome.label.classList.add('aui-checkbox__label');
    this.input = doc.createElement('input');
    this.input.type = 'checkbox';
    this.input.id = createId('aui-checkbox');
    this.input.className = 'aui-checkbox__input';
    (this.#chrome.label as HTMLLabelElement).htmlFor = this.input.id;
    this.input.checked = this.#initialChecked;
    this.input.indeterminate = this.#initialIndeterminate;

    // Marks are decorative siblings layered over the input; CSS shows the one matching the state.
    this.#checkIcon = doc.createElement('span');
    this.#checkIcon.className = 'aui-checkbox__mark aui-checkbox__mark--checked';
    this.#mixedIcon = doc.createElement('span');
    this.#mixedIcon.className = 'aui-checkbox__mark aui-checkbox__mark--indeterminate';
    const box = doc.createElement('span');
    box.className = 'aui-checkbox__box';
    box.append(this.input, this.#checkIcon, this.#mixedIcon);
    const row = doc.createElement('div');
    row.className = 'aui-checkbox__row';
    row.append(box, this.#chrome.label);

    host.classList.add('aui-field', 'aui-checkbox');
    host.replaceChildren(row, this.#chrome.description, this.#chrome.error);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(checkboxConfig.subscribe(() => {
      this.#render();
    }));
  }

  get checked(): boolean {
    return this.input.checked;
  }

  get indeterminate(): boolean {
    return this.input.indeterminate;
  }

  /** Submitted value when checked. */
  get value(): string {
    return this.#options.value ?? 'on';
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
    return this.input.checked !== this.#initialChecked || this.input.indeterminate !== this.#initialIndeterminate;
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<CheckboxOptions> {
    return this.#options;
  }

  /** `value` when checked, `null` otherwise (native form semantics). */
  getFormValue(): string | null {
    return this.input.checked ? this.value : null;
  }

  /** Set the checked state programmatically (no events). Clears the mixed state unless given. */
  setChecked(checked: boolean, indeterminate = false): void {
    this.input.checked = checked;
    this.input.indeterminate = indeterminate;
    this.#state.customError = null;
    this.#render();
  }

  update(options: Partial<CheckboxOptions>): void {
    const next = { ...this.#options, ...options };
    Checkbox.#assertOptions(next);
    this.#options = next;
    if ('checked' in options) this.input.checked = options.checked ?? false;
    if ('indeterminate' in options) this.input.indeterminate = options.indeterminate ?? false;
    this.#render();
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

  reset(): void {
    this.input.checked = this.#initialChecked;
    this.input.indeterminate = this.#initialIndeterminate;
    this.#state.reset();
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-checkbox', 'aui-checkbox--invalid', 'aui-checkbox--disabled');
  }

  #config(): Readonly<CheckboxConfig & { locale: string }> {
    const o = this.#options;
    return checkboxConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  static #assertOptions(options: CheckboxOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('CHECKBOX_OPTIONS', 'Invalid checkbox options.', { component: 'checkbox', property: `checkbox.${property}`, expected });
    };
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (options.value !== undefined && typeof options.value !== 'string') fail('value', 'string');
    if (options.validate !== undefined && typeof options.validate !== 'function') fail('validate', 'function');
  }

  #bindEvents(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.input, 'change', () => {
      this.#state.dirty = true;
      // An external error describes the previous state; toggling clears it.
      this.#state.customError = null;
      this.#render();
      emit(this.host, 'aui-change', { checked: this.input.checked, value: this.value, validity: this.#validity } satisfies CheckboxChangeDetail);
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
  }

  #renderMarks(icons: Partial<CheckboxIcons> | undefined): void {
    const check = icons?.checked ?? 'check';
    const mixed = icons?.indeterminate ?? 'minus';
    if (this.#checkIconRef !== check) {
      this.#checkIcon.replaceChildren(renderIcon(check, { doc: this.#doc }));
      this.#checkIconRef = check;
    }
    if (this.#mixedIconRef !== mixed) {
      this.#mixedIcon.replaceChildren(renderIcon(mixed, { doc: this.#doc }));
      this.#mixedIconRef = mixed;
    }
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const input = this.input;

    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    this.#renderMarks(o.icons);
    input.value = this.value;
    input.disabled = o.disabled ?? false;
    input.required = o.required ?? false;
    if (o.name) input.name = o.name;
    else input.removeAttribute('name');

    const checked = input.checked;
    const outcome: Outcome = o.required && !checked ? { error: 'value-missing', params: {} } : OK;
    const custom = outcome.error === null ? runValidator(o.validate, checked) : null;
    this.#validity = resolveValidity(outcome, { locale: config.locale, kind: 'checkbox' }, custom, this.#state.customError);

    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    setDescribedBy(input, this.#chrome.describedBy());
    setInvalid(input, show);
    this.host.classList.toggle('aui-checkbox--invalid', show);
    this.host.classList.toggle('aui-checkbox--disabled', o.disabled ?? false);
  }
}
