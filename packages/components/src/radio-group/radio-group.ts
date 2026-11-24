/**
 * Radio Group (SPEC section 18.5). A <fieldset role="radiogroup"> + <legend> around
 * native radios that share one name (generated when `name` is absent), so the
 * browser provides single-tab-stop focus and arrow-key selection. Radios are
 * restyled with `appearance: none`; the selected dot is a shape, not only a color.
 */
import { configurationError, defineComponentConfig, DisposableGroup, emit, createId } from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { resolveValidity, runValidator, VALID, type FieldValidity, type Outcome } from '../internal/validation.js';

export type RadioGroupOrientation = 'vertical' | 'horizontal';

export interface RadioGroupConfig {
  validationTiming: ValidationTiming;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    radioGroup: RadioGroupConfig & { locale: string };
  }
}

export const radioGroupConfig = defineComponentConfig<RadioGroupConfig, 'locale'>(
  'radioGroup',
  { validationTiming: validationTimingSpec },
  ['locale'],
);

export interface RadioGroupIcons {
  error: IconRef;
}

export interface RadioGroupOption {
  /** Submitted value; unique within the group. */
  value: string;
  label: string;
  /** Per-option help text, referenced by that radio's aria-describedby. */
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupOptions extends Partial<RadioGroupConfig> {
  /** Legend text (required accessible name of the group). */
  label: string;
  hideLabel?: boolean;
  options: readonly RadioGroupOption[];
  /** Initially selected value; also restored by reset(). */
  value?: string | null;
  /** Native radio name. A unique name is generated when absent. */
  name?: string;
  /** Group help text, referenced by the radiogroup's aria-describedby. */
  description?: string;
  required?: boolean;
  orientation?: RadioGroupOrientation;
  disabled?: boolean;
  /** Consumer validation; return a message to mark the selection invalid. */
  validate?: (value: string | null) => string | null;
  locale?: string;
  icons?: Partial<RadioGroupIcons>;
}

export interface RadioGroupChangeDetail {
  value: string | null;
  validity: FieldValidity;
}

const OK: Outcome = Object.freeze({ error: null, params: {} });

interface OptionParts {
  readonly option: RadioGroupOption;
  readonly row: HTMLDivElement;
  readonly input: HTMLInputElement;
  readonly description: HTMLDivElement | null;
}

export class RadioGroup implements FormControl {
  readonly host: HTMLElement;
  readonly fieldset: HTMLFieldSetElement;
  #options: RadioGroupOptions;
  #initialValue: string | null;
  #validity: FieldValidity = VALID;
  #items: OptionParts[] = [];
  readonly #generatedName = createId('aui-radio-group-name');
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #list: HTMLDivElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render a radio group into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: RadioGroupOptions): RadioGroup {
    return new RadioGroup(host, options);
  }

  private constructor(host: HTMLElement, options: RadioGroupOptions) {
    RadioGroup.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#initialValue = options.value ?? null;
    const doc = this.#doc;

    this.#chrome = new FieldChrome(doc, 'legend', 'aui-radio-group');
    this.fieldset = doc.createElement('fieldset');
    this.fieldset.className = 'aui-radio-group__fieldset';
    // An explicit role replaces the implicit group role; name it from the legend explicitly.
    this.fieldset.setAttribute('role', 'radiogroup');
    this.fieldset.setAttribute('aria-labelledby', this.#chrome.label.id);
    this.#list = doc.createElement('div');
    this.#list.className = 'aui-radio-group__options';
    this.fieldset.append(this.#chrome.label, this.#chrome.description, this.#list, this.#chrome.error);

    host.classList.add('aui-field', 'aui-radio-group');
    host.replaceChildren(this.fieldset);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#buildOptions(this.#initialValue);
    this.#render();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(radioGroupConfig.subscribe(() => {
      this.#render();
    }));
  }

  /** Selected value, or `null` when nothing is selected. */
  get value(): string | null {
    return this.#items.find((i) => i.input.checked)?.option.value ?? null;
  }

  /** The native radios, in option order. */
  get inputs(): HTMLInputElement[] {
    return this.#items.map((i) => i.input);
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
    return this.value !== this.#initialOrNull();
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<RadioGroupOptions> {
    return this.#options;
  }

  getFormValue(): string | null {
    return this.value;
  }

  /** Set the selection programmatically (no events). `null` clears it. */
  setValue(value: string | null): void {
    RadioGroup.#assertValue(this.#options.options, value);
    this.#select(value);
    this.#state.customError = null;
    this.#render();
  }

  update(options: Partial<RadioGroupOptions>): void {
    const next = { ...this.#options, ...options };
    // A new option list drops an initial value that no longer exists, unless a value is given too.
    const list: readonly RadioGroupOption[] = next.options;
    if ('options' in options && !('value' in options) && Array.isArray(next.options)) {
      if (next.value != null && !list.some((opt) => opt.value === next.value)) next.value = null;
    }
    RadioGroup.#assertOptions(next);
    const current = this.value;
    const selected = 'value' in options ? (options.value ?? null) : next.options.some((opt) => opt.value === current) ? current : null;
    this.#options = next;
    if ('options' in options || 'name' in options) this.#buildOptions(selected);
    else this.#select(selected);
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

  /** Focus the selected radio, else the first enabled one (the native tab stop). */
  focus(): void {
    const enabled = this.#items.filter((i) => !i.input.disabled);
    (enabled.find((i) => i.input.checked) ?? enabled[0])?.input.focus();
  }

  reset(): void {
    this.#select(this.#initialOrNull());
    this.#state.reset();
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.#items = [];
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-radio-group', 'aui-radio-group--invalid', 'aui-radio-group--disabled');
  }

  #config(): Readonly<RadioGroupConfig & { locale: string }> {
    const o = this.#options;
    return radioGroupConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  /** The initial value if it is still one of the options. */
  #initialOrNull(): string | null {
    const v = this.#initialValue;
    return v !== null && this.#items.some((i) => i.option.value === v) ? v : null;
  }

  #select(value: string | null): void {
    for (const item of this.#items) item.input.checked = item.option.value === value;
  }

  static #fail(property: string, expected: string): never {
    throw configurationError('RADIO_GROUP_OPTIONS', 'Invalid radio group options.', { component: 'radioGroup', property: `radioGroup.${property}`, expected });
  }

  static #assertValue(list: readonly RadioGroupOption[], value: string | null): void {
    if (value !== null && (typeof value !== 'string' || !list.some((o) => o.value === value))) RadioGroup.#fail('value', 'one of the option values, or null');
  }

  static #assertOptions(options: RadioGroupOptions): void {
    const fail = RadioGroup.#fail;
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (!Array.isArray(options.options) || options.options.length === 0) fail('options', 'non-empty array of { value, label }');
    const seen = new Set<string>();
    for (const opt of options.options) {
      if (typeof opt.value !== 'string') fail('options.value', 'string');
      if (typeof opt.label !== 'string' || opt.label.trim() === '') fail('options.label', 'non-empty string (accessible name)');
      if (seen.has(opt.value)) fail('options.value', 'unique values');
      seen.add(opt.value);
    }
    RadioGroup.#assertValue(options.options, options.value ?? null);
    if (options.name !== undefined && (typeof options.name !== 'string' || options.name === '')) fail('name', 'non-empty string');
    if (options.orientation !== undefined && !['vertical', 'horizontal'].includes(options.orientation)) fail('orientation', '"vertical" | "horizontal"');
  }

  /** (Re)create the option rows; `selected` is the state to keep. */
  #buildOptions(selected: string | null): void {
    const doc = this.#doc;
    const name = this.#options.name ?? this.#generatedName;
    this.#items = this.#options.options.map((option) => {
      const row = doc.createElement('div');
      row.className = 'aui-radio-group__option';
      const input = doc.createElement('input');
      input.type = 'radio';
      input.id = createId('aui-radio-group-option');
      input.className = 'aui-radio-group__input';
      // One shared name makes the radios one native group: one tab stop, arrow keys move and select.
      input.name = name;
      input.value = option.value;
      input.checked = option.value === selected;
      const dot = doc.createElement('span');
      dot.className = 'aui-radio-group__dot';
      dot.setAttribute('aria-hidden', 'true');
      const box = doc.createElement('span');
      box.className = 'aui-radio-group__box';
      box.append(input, dot);
      const label = doc.createElement('label');
      label.className = 'aui-radio-group__label';
      label.htmlFor = input.id;
      label.textContent = option.label;
      const text = doc.createElement('div');
      text.className = 'aui-radio-group__text';
      text.append(label);
      let description: HTMLDivElement | null = null;
      if (option.description) {
        description = doc.createElement('div');
        description.className = 'aui-radio-group__option-description';
        description.id = createId('aui-radio-group-option-desc');
        description.textContent = option.description;
        text.append(description);
      }
      row.append(box, text);
      return { option, row, input, description };
    });
    this.#list.replaceChildren(...this.#items.map((i) => i.row));
  }

  #bindEvents(): void {
    const g = this.#group;
    observePointer(this.#doc);
    // Native change fires for clicks, Space, and arrow-key selection.
    g.listen(this.#list, 'change', () => {
      this.#state.dirty = true;
      // An external error describes the previous selection; changing it clears the error.
      this.#state.customError = null;
      this.#render();
      emit(this.host, 'aui-change', { value: this.value, validity: this.#validity } satisfies RadioGroupChangeDetail);
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const required = o.required ?? false;

    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required, description: o.description });
    this.fieldset.disabled = o.disabled ?? false;
    if (required) this.fieldset.setAttribute('aria-required', 'true');
    else this.fieldset.removeAttribute('aria-required');
    this.#list.classList.toggle('aui-radio-group__options--horizontal', o.orientation === 'horizontal');

    const value = this.value;
    const outcome: Outcome = required && value === null ? { error: 'value-missing', params: {} } : OK;
    const custom = outcome.error === null ? runValidator(o.validate, value) : null;
    this.#validity = resolveValidity(outcome, { locale: config.locale, kind: 'choice' }, custom, this.#state.customError);

    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    setDescribedBy(this.fieldset, this.#chrome.describedBy());
    setInvalid(this.fieldset, show);
    for (const item of this.#items) {
      item.input.disabled = item.option.disabled ?? false;
      item.input.required = required;
      setDescribedBy(item.input, item.description ? [item.description.id] : []);
    }
    this.host.classList.toggle('aui-radio-group--invalid', show);
    this.host.classList.toggle('aui-radio-group--disabled', o.disabled ?? false);
  }
}
