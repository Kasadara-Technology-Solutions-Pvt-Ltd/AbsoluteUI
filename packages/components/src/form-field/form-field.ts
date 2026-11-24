/**
 * Form Field (SPEC section 18.8). Gives a consumer-owned native <input>, <textarea>,
 * or <select> the AbsoluteUI field chrome and validation: label, required
 * indicator, help text, localized constraint messages (from the browser's own
 * ValidityState), and Form integration. The control element stays the
 * consumer's; only its ARIA wiring and the surrounding chrome are managed.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, formatNumber } from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { checkStep, resolveValidity, runValidator, type FieldValidity, type Outcome } from '../internal/validation.js';

export interface FormFieldConfig {
  validationTiming: ValidationTiming;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    formField: FormFieldConfig & { locale: string };
  }
}

export const formFieldConfig = defineComponentConfig<FormFieldConfig, 'locale'>('formField', { validationTiming: validationTimingSpec }, ['locale']);

export type FormFieldControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
export type FormFieldValue = string | string[];

export interface FormFieldIcons {
  error: IconRef;
}

export interface FormFieldOptions extends Partial<FormFieldConfig> {
  /** Visible label (required accessible name). */
  label: string;
  /** The native control to wrap. It is moved into the host if it is not already inside it. */
  control: FormFieldControl;
  hideLabel?: boolean;
  description?: string;
  /** Sets the native `required` attribute and the required indicator. */
  required?: boolean;
  /** Consumer validation, after native constraints. */
  validate?: (value: FormFieldValue) => string | null;
  locale?: string;
  icons?: Partial<FormFieldIcons>;
}

export interface FormFieldChangeDetail {
  value: FormFieldValue;
  validity: FieldValidity;
}

// Choice, file, and date/time types have dedicated components with localized parsing and messages.
const UNSUPPORTED_TYPES = new Set(['checkbox', 'radio', 'file', 'hidden', 'button', 'submit', 'reset', 'image', 'date', 'time', 'datetime-local', 'month', 'week', 'range', 'color']);

function readValue(control: FormFieldControl): FormFieldValue {
  if (control instanceof HTMLSelectElement && control.multiple) return Array.from(control.selectedOptions, (o) => o.value);
  return control.value;
}

function numberAttr(control: FormFieldControl, name: 'min' | 'max' | 'step'): number | null {
  const raw = control.getAttribute(name);
  if (raw === null || raw === '' || raw === 'any') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Map the browser's ValidityState to an engine outcome, so messages are AbsoluteUI's localized ones. */
function nativeOutcome(control: FormFieldControl): Outcome {
  const v = control.validity;
  const type = control instanceof HTMLInputElement ? control.type : '';
  // A consumer's setCustomValidity() message is honoured as a custom error.
  if (v.customError) return { error: 'custom', params: { message: control.validationMessage } };
  if (v.badInput) return { error: 'bad-input', params: {} };
  if (v.valueMissing) return { error: 'value-missing', params: {} };
  if (v.typeMismatch) return { error: 'type-mismatch', params: { type: type === 'url' ? 'url' : 'email' } };
  if (v.tooShort && !(control instanceof HTMLSelectElement)) return { error: 'too-short', params: { minLength: control.minLength } };
  if (v.tooLong && !(control instanceof HTMLSelectElement)) return { error: 'too-long', params: { maxLength: control.maxLength } };
  if (v.patternMismatch) return { error: 'pattern-mismatch', params: {} };
  const min = numberAttr(control, 'min');
  const max = numberAttr(control, 'max');
  if (v.rangeUnderflow && min !== null) return { error: 'range-underflow', params: { min } };
  if (v.rangeOverflow && max !== null) return { error: 'range-overflow', params: { max } };
  if (v.stepMismatch) {
    const step = numberAttr(control, 'step') ?? 1;
    // HTML step base: min, else the value attribute, else 0.
    const valueAttr = control.getAttribute('value');
    const base = min ?? (valueAttr !== null && Number.isFinite(Number(valueAttr)) ? Number(valueAttr) : 0);
    const near = checkStep(Number(control.value), step, base);
    if (near) return { error: 'step-mismatch', params: near };
  }
  // Native minlength/maxlength only apply after user edits; enforce them for programmatic values too.
  if (!(control instanceof HTMLSelectElement) && control.value !== '') {
    const length = Array.from(control.value).length;
    if (control.minLength > 0 && length < control.minLength) return { error: 'too-short', params: { minLength: control.minLength } };
    if (control.maxLength >= 0 && length > control.maxLength) return { error: 'too-long', params: { maxLength: control.maxLength } };
  }
  return { error: null, params: {} };
}

export class FormField implements FormControl {
  readonly host: HTMLElement;
  readonly control: FormFieldControl;
  #options: FormFieldOptions;
  #validity: FieldValidity;
  #initial: FormFieldValue;
  readonly #chrome: FieldChrome;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();
  readonly #ownDescribedBy: readonly string[];

  static create(host: HTMLElement, options: FormFieldOptions): FormField {
    return new FormField(host, options);
  }

  private constructor(host: HTMLElement, options: FormFieldOptions) {
    FormField.#assert(options);
    this.host = host;
    this.control = options.control;
    this.#options = { ...options };
    this.#initial = readValue(this.control);
    // Keep ids the consumer already referenced (for example an external hint).
    this.#ownDescribedBy = (this.control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    this.#chrome = new FieldChrome(host.ownerDocument, 'label', 'aui-form-field');
    if (!this.control.id) this.control.id = createId('aui-form-field-control');
    (this.#chrome.label as HTMLLabelElement).htmlFor = this.control.id;
    this.control.classList.add('aui-form-field__control');
    host.classList.add('aui-field', 'aui-form-field');
    host.replaceChildren(this.#chrome.label, this.control, this.#chrome.description, this.#chrome.error);
    this.#validity = { valid: true, error: null, message: '' };
    this.#render();

    const g = this.#group;
    g.listen(this.control, 'input', () => {
      this.#state.dirty = true;
      this.#state.customError = null;
      this.#render();
      emit(host, 'aui-input', { value: readValue(this.control), validity: this.#validity } satisfies FormFieldChangeDetail);
    });
    g.listen(this.control, 'change', () => {
      this.#state.dirty = true;
      this.#render();
      emit(host, 'aui-change', { value: readValue(this.control), validity: this.#validity } satisfies FormFieldChangeDetail);
    });
    observePointer(host.ownerDocument);
    g.listen(this.control, 'blur', () => {
      markTouched(this.#state, host.ownerDocument, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
    // Suppress native validation bubbles; AbsoluteUI renders the message instead.
    g.listen(this.control, 'invalid', (event) => {
      event.preventDefault();
    });
    g.add(registerControl(this));
    g.add(formFieldConfig.subscribe(() => {
      this.#render();
    }));
  }

  get name(): string | null {
    return this.control.name || null;
  }

  get label(): string {
    return this.#options.label;
  }

  get disabled(): boolean {
    return this.control.disabled;
  }

  get value(): FormFieldValue {
    return readValue(this.control);
  }

  get validity(): FieldValidity {
    return this.#validity;
  }

  get dirty(): boolean {
    return JSON.stringify(readValue(this.control)) !== JSON.stringify(this.#initial);
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  getFormValue(): FormFieldValue {
    return readValue(this.control);
  }

  /** Re-read native constraints after changing control attributes or value programmatically. */
  refresh(): void {
    this.#render();
  }

  update(options: Partial<Omit<FormFieldOptions, 'control'>>): void {
    const next = { ...this.#options, ...options };
    FormField.#assert(next);
    this.#options = next;
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
    this.control.focus();
  }

  reset(): void {
    const c = this.control;
    const initial = this.#initial;
    if (c instanceof HTMLSelectElement) {
      const selected = new Set(Array.isArray(initial) ? initial : [initial]);
      for (const o of Array.from(c.options)) o.selected = selected.has(o.value);
    } else {
      c.value = typeof initial === 'string' ? initial : '';
    }
    this.#state.reset();
    this.#render();
  }

  /** Remove the chrome and wiring. The native control is left in the host. */
  destroy(): void {
    this.#group.dispose();
    this.#chrome.label.remove();
    this.#chrome.description.remove();
    this.#chrome.error.remove();
    this.control.classList.remove('aui-form-field__control');
    setDescribedBy(this.control, this.#ownDescribedBy);
    setInvalid(this.control, false);
    this.host.classList.remove('aui-field', 'aui-form-field', 'aui-form-field--invalid');
  }

  static #assert(options: FormFieldOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('FORM_FIELD_OPTIONS', 'Invalid form field options.', { component: 'formField', property: `formField.${property}`, expected });
    };
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    const c = options.control;
    if (!(c instanceof HTMLInputElement || c instanceof HTMLTextAreaElement || c instanceof HTMLSelectElement)) fail('control', 'HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement');
    if (c instanceof HTMLInputElement && UNSUPPORTED_TYPES.has(c.type)) fail('control', 'text-like input (use Checkbox, Radio Group, Switch, Date Input, Date Picker, or Time Picker)');
  }

  #config(): Readonly<FormFieldConfig & { locale: string }> {
    const o = this.#options;
    return formFieldConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const c = this.control;
    if (o.required !== undefined) c.required = o.required;
    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: c.required, description: o.description });
    const outcome = nativeOutcome(c);
    const value = readValue(c);
    const custom = outcome.error === null ? runValidator(o.validate, value) : null;
    const kind = c instanceof HTMLSelectElement ? 'choice' : 'text';
    this.#validity = resolveValidity(outcome, { locale: config.locale, kind, formatNumber: (n) => formatNumber(n, {}, config.locale) }, custom, this.#state.customError);
    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    setDescribedBy(c, this.#chrome.describedBy(), this.#ownDescribedBy);
    setInvalid(c, show);
    this.host.classList.toggle('aui-form-field--invalid', show);
  }
}
