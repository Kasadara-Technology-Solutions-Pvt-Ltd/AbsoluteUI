/**
 * Checkbox Group (SPEC section 18.5). A <fieldset> + <legend> grouping native
 * checkboxes that share one field name, with group-level help text, required
 * and min/max selection validation, and one validation message. The legend names
 * the group; aria-invalid is set on each checkbox, because the group role does
 * not support it.
 */
import { configurationError, defineComponentConfig, DisposableGroup, emit, createId, formatNumber, getMessage, registerMessages, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { resolveValidity, runValidator, VALID, type FieldValidity, type Outcome } from '../internal/validation.js';

export type CheckboxGroupOrientation = 'vertical' | 'horizontal';

export interface CheckboxGroupConfig {
  validationTiming: ValidationTiming;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    checkboxGroup: CheckboxGroupConfig & { locale: string };
  }
}

export const checkboxGroupConfig = defineComponentConfig<CheckboxGroupConfig, 'locale'>(
  'checkboxGroup',
  { validationTiming: validationTimingSpec },
  ['locale'],
);

registerMessages('checkboxGroup', 'en', {
  // Checkboxes and the group role cannot carry aria-required, so required state is spoken with the legend.
  required: '(required)',
});

export interface CheckboxGroupIcons {
  checked: IconRef;
  error: IconRef;
}

export interface CheckboxGroupOption {
  /** Submitted value; unique within the group. */
  value: string;
  label: string;
  /** Per-option help text, referenced by that checkbox's aria-describedby. */
  description?: string;
  disabled?: boolean;
}

export interface CheckboxGroupOptions extends Partial<CheckboxGroupConfig> {
  /** Legend text (required accessible name of the group). */
  label: string;
  hideLabel?: boolean;
  options: readonly CheckboxGroupOption[];
  /** Initially selected values; also restored by reset(). */
  value?: readonly string[];
  name?: string;
  /** Group help text, referenced by the fieldset's aria-describedby. */
  description?: string;
  /** At least one option must be selected. */
  required?: boolean;
  /** Minimum selections when any option is selected (or when required). */
  minSelected?: number;
  maxSelected?: number;
  orientation?: CheckboxGroupOrientation;
  disabled?: boolean;
  /** Consumer validation; return a message to mark the selection invalid. */
  validate?: (value: string[]) => string | null;
  locale?: string;
  icons?: Partial<CheckboxGroupIcons>;
}

export interface CheckboxGroupChangeDetail {
  value: string[];
  validity: FieldValidity;
}

const OK: Outcome = Object.freeze({ error: null, params: {} });

interface OptionParts {
  readonly option: CheckboxGroupOption;
  readonly row: HTMLDivElement;
  readonly input: HTMLInputElement;
  readonly description: HTMLDivElement | null;
}

export class CheckboxGroup implements FormControl {
  readonly host: HTMLElement;
  readonly fieldset: HTMLFieldSetElement;
  #options: CheckboxGroupOptions;
  #initialValue: string[];
  #validity: FieldValidity = VALID;
  #items: OptionParts[] = [];
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #requiredText: HTMLSpanElement;
  readonly #list: HTMLDivElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render a checkbox group into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: CheckboxGroupOptions): CheckboxGroup {
    return new CheckboxGroup(host, options);
  }

  private constructor(host: HTMLElement, options: CheckboxGroupOptions) {
    CheckboxGroup.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#initialValue = [...(options.value ?? [])];
    const doc = this.#doc;

    this.#chrome = new FieldChrome(doc, 'legend', 'aui-checkbox-group');
    this.#requiredText = doc.createElement('span');
    this.#requiredText.className = 'aui-visually-hidden';
    this.#chrome.label.append(this.#requiredText);
    this.fieldset = doc.createElement('fieldset');
    this.fieldset.className = 'aui-checkbox-group__fieldset';
    this.#list = doc.createElement('div');
    this.#list.className = 'aui-checkbox-group__options';
    this.fieldset.append(this.#chrome.label, this.#chrome.description, this.#list, this.#chrome.error);

    host.classList.add('aui-field', 'aui-checkbox-group');
    host.replaceChildren(this.fieldset);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#buildOptions(this.#initialValue);
    this.#render();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(checkboxGroupConfig.subscribe(() => {
      this.#render();
    }));
  }

  /** Selected values, in option order. */
  get value(): string[] {
    return this.#items.filter((i) => i.input.checked).map((i) => i.option.value);
  }

  /** The native checkboxes, in option order. */
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
    const now = this.value;
    const initial = this.#items.filter((i) => this.#initialValue.includes(i.option.value)).map((i) => i.option.value);
    return now.length !== initial.length || now.some((v, i) => v !== initial[i]);
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<CheckboxGroupOptions> {
    return this.#options;
  }

  getFormValue(): string[] {
    return this.value;
  }

  /** Set the selection programmatically (no events). Unknown values are a configuration error. */
  setValue(value: readonly string[]): void {
    CheckboxGroup.#assertValue(this.#options.options, value);
    for (const item of this.#items) item.input.checked = value.includes(item.option.value);
    this.#state.customError = null;
    this.#render();
  }

  update(options: Partial<CheckboxGroupOptions>): void {
    const next = { ...this.#options, ...options };
    // New option lists drop initial values that no longer exist, unless a value is given too.
    const list: readonly CheckboxGroupOption[] = next.options;
    if ('options' in options && !('value' in options) && next.value !== undefined && Array.isArray(next.options)) {
      next.value = next.value.filter((v) => list.some((opt) => opt.value === v));
    }
    CheckboxGroup.#assertOptions(next);
    const selected = 'value' in options ? [...(options.value ?? [])] : this.value.filter((v) => next.options.some((o) => o.value === v));
    this.#options = next;
    if ('options' in options || 'name' in options || 'icons' in options) this.#buildOptions(selected);
    else for (const item of this.#items) item.input.checked = selected.includes(item.option.value);
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

  /** Focus the first enabled checkbox. */
  focus(): void {
    this.#items.find((i) => !i.input.disabled)?.input.focus();
  }

  reset(): void {
    for (const item of this.#items) item.input.checked = this.#initialValue.includes(item.option.value);
    this.#state.reset();
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.#items = [];
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-checkbox-group', 'aui-checkbox-group--invalid', 'aui-checkbox-group--disabled');
  }

  #config(): Readonly<CheckboxGroupConfig & { locale: string }> {
    const o = this.#options;
    return checkboxGroupConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  static #fail(property: string, expected: string): never {
    throw configurationError('CHECKBOX_GROUP_OPTIONS', 'Invalid checkbox group options.', { component: 'checkboxGroup', property: `checkboxGroup.${property}`, expected });
  }

  static #assertValue(list: readonly CheckboxGroupOption[], value: readonly string[]): void {
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !list.some((o) => o.value === v))) CheckboxGroup.#fail('value', 'array of option values');
  }

  static #assertOptions(options: CheckboxGroupOptions): void {
    const fail = CheckboxGroup.#fail;
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (!Array.isArray(options.options) || options.options.length === 0) fail('options', 'non-empty array of { value, label }');
    const seen = new Set<string>();
    for (const opt of options.options) {
      if (typeof opt.value !== 'string') fail('options.value', 'string');
      if (typeof opt.label !== 'string' || opt.label.trim() === '') fail('options.label', 'non-empty string (accessible name)');
      if (seen.has(opt.value)) fail('options.value', 'unique values');
      seen.add(opt.value);
    }
    if (options.value !== undefined) CheckboxGroup.#assertValue(options.options, options.value);
    const isCount = validators.integerInRange(1, options.options.length);
    if (options.minSelected !== undefined && !isCount(options.minSelected)) fail('minSelected', `integer 1..${options.options.length}`);
    if (options.maxSelected !== undefined && !isCount(options.maxSelected)) fail('maxSelected', `integer 1..${options.options.length}`);
    if (options.minSelected !== undefined && options.maxSelected !== undefined && options.minSelected > options.maxSelected) fail('minSelected', 'minSelected <= maxSelected');
    if (options.orientation !== undefined && !['vertical', 'horizontal'].includes(options.orientation)) fail('orientation', '"vertical" | "horizontal"');
  }

  /** (Re)create the option rows; `selected` is the state to keep. */
  #buildOptions(selected: readonly string[]): void {
    const doc = this.#doc;
    const o = this.#options;
    this.#items = o.options.map((option) => {
      const row = doc.createElement('div');
      row.className = 'aui-checkbox-group__option';
      const input = doc.createElement('input');
      input.type = 'checkbox';
      input.id = createId('aui-checkbox-group-option');
      input.className = 'aui-checkbox-group__input';
      input.value = option.value;
      input.checked = selected.includes(option.value);
      if (o.name) input.name = o.name;
      const mark = doc.createElement('span');
      mark.className = 'aui-checkbox-group__mark';
      mark.append(renderIcon(o.icons?.checked ?? 'check', { doc }));
      const box = doc.createElement('span');
      box.className = 'aui-checkbox-group__box';
      box.append(input, mark);
      const label = doc.createElement('label');
      label.className = 'aui-checkbox-group__label';
      label.htmlFor = input.id;
      label.textContent = option.label;
      const text = doc.createElement('div');
      text.className = 'aui-checkbox-group__text';
      text.append(label);
      let description: HTMLDivElement | null = null;
      if (option.description) {
        description = doc.createElement('div');
        description.className = 'aui-checkbox-group__option-description';
        description.id = createId('aui-checkbox-group-option-desc');
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
    g.listen(this.#list, 'change', () => {
      this.#state.dirty = true;
      // An external error describes the previous selection; changing it clears the error.
      this.#state.customError = null;
      this.#render();
      emit(this.host, 'aui-change', { value: this.value, validity: this.#validity } satisfies CheckboxGroupChangeDetail);
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
  }

  #check(value: string[]): Outcome {
    const o = this.#options;
    const count = value.length;
    if (count === 0) return o.required ? { error: 'value-missing', params: {} } : OK;
    if (o.minSelected !== undefined && count < o.minSelected) return { error: 'too-few-selected', params: { min: o.minSelected } };
    if (o.maxSelected !== undefined && count > o.maxSelected) return { error: 'too-many-selected', params: { max: o.maxSelected } };
    return OK;
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const locale = config.locale;

    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    this.#requiredText.textContent = o.required ? ` ${getMessage('checkboxGroup', 'required', {}, locale)}` : '';
    this.fieldset.disabled = o.disabled ?? false;
    this.#list.classList.toggle('aui-checkbox-group__options--horizontal', o.orientation === 'horizontal');

    const value = this.value;
    const outcome = this.#check(value);
    const custom = outcome.error === null ? runValidator(o.validate, value) : null;
    this.#validity = resolveValidity(outcome, { locale, kind: 'choice', formatNumber: (n) => formatNumber(n, {}, locale) }, custom, this.#state.customError);

    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    setDescribedBy(this.fieldset, this.#chrome.describedBy());
    for (const item of this.#items) {
      item.input.disabled = item.option.disabled ?? false;
      setDescribedBy(item.input, item.description ? [item.description.id] : []);
      setInvalid(item.input, show);
    }
    this.host.classList.toggle('aui-checkbox-group--invalid', show);
    this.host.classList.toggle('aui-checkbox-group--disabled', o.disabled ?? false);
  }
}
