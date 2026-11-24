/**
 * Textarea (SPEC section 18.5). A native <textarea> with the same field chrome and
 * constraint set as Text Input: label, required indicator, help text, validation
 * message, and optional character counter. `resize: 'auto'` grows the control
 * with its content, natively through `field-sizing: content` where supported,
 * otherwise through a CSP-safe CSSOM fallback bounded by `maxRows`.
 */
import { configurationError, defineComponentConfig, DisposableGroup, emit, createId, validators } from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import { announce } from '@absoluteui/utilities';
import { counterText, FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { checkText, resolveValidity, runValidator, textLength, VALID, type FieldValidity } from '../internal/validation.js';

export type TextareaResize = 'none' | 'vertical' | 'auto';

export interface TextareaConfig {
  validationTiming: ValidationTiming;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    textarea: TextareaConfig & { locale: string };
  }
}

export const textareaConfig = defineComponentConfig<TextareaConfig, 'locale'>(
  'textarea',
  { validationTiming: validationTimingSpec },
  ['locale'],
);

export interface TextareaIcons {
  error: IconRef;
}

export interface TextareaOptions extends Partial<TextareaConfig> {
  /** Visible label (required accessible name). */
  label: string;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  value?: string;
  name?: string;
  placeholder?: string;
  /** Help text, referenced by aria-describedby (text only). */
  description?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  minLength?: number;
  /** Validated (not truncated): users can paste and then correct over-long text. */
  maxLength?: number;
  /** Show a character counter; requires `maxLength`. */
  showCounter?: boolean;
  /** Visible text rows (the minimum height for `resize: 'auto'`). Default 3. */
  rows?: number;
  /** `'vertical'` (default) shows the native resize handle; `'auto'` grows with content. */
  resize?: TextareaResize;
  /** Upper bound in rows for `resize: 'auto'`; the content scrolls beyond it. */
  maxRows?: number;
  autocomplete?: string;
  spellcheck?: boolean;
  /** Consumer validation; return a message to mark the value invalid. */
  validate?: (value: string) => string | null;
  locale?: string;
  icons?: Partial<TextareaIcons>;
}

export interface TextareaValueDetail {
  value: string;
  validity: FieldValidity;
}

const RESIZE: readonly TextareaResize[] = ['none', 'vertical', 'auto'];

/** Whether the engine sizes form controls to their content natively. */
function supportsFieldSizing(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('field-sizing', 'content');
}

export class Textarea implements FormControl {
  readonly host: HTMLElement;
  readonly textarea: HTMLTextAreaElement;
  #options: TextareaOptions;
  #initialValue: string;
  #validity: FieldValidity = VALID;
  #announceTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render a textarea into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: TextareaOptions): Textarea {
    return new Textarea(host, options);
  }

  private constructor(host: HTMLElement, options: TextareaOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#initialValue = options.value ?? '';
    const doc = this.#doc;

    this.#chrome = new FieldChrome(doc, 'label', 'aui-textarea');
    this.textarea = doc.createElement('textarea');
    this.textarea.id = createId('aui-textarea');
    this.textarea.className = 'aui-textarea__input';
    (this.#chrome.label as HTMLLabelElement).htmlFor = this.textarea.id;
    this.textarea.value = this.#initialValue;

    host.classList.add('aui-field', 'aui-textarea');
    host.replaceChildren(this.#chrome.label, this.textarea, this.#chrome.description, this.#chrome.counter, this.#chrome.error);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(textareaConfig.subscribe(() => {
      this.#render();
    }));
  }

  get value(): string {
    return this.textarea.value;
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
    return this.textarea.value !== this.#initialValue;
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<TextareaOptions> {
    return this.#options;
  }

  getFormValue(): string {
    return this.textarea.value;
  }

  /** Set the value programmatically (no events). */
  setValue(value: string): void {
    this.textarea.value = value;
    this.#state.customError = null;
    this.#render();
  }

  update(options: Partial<TextareaOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    if ('value' in options) this.textarea.value = options.value ?? '';
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
    this.textarea.focus();
  }

  reset(): void {
    this.textarea.value = this.#initialValue;
    this.#state.reset();
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    clearTimeout(this.#announceTimer);
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-textarea', 'aui-textarea--invalid', 'aui-textarea--disabled', 'aui-textarea--resize-none', 'aui-textarea--auto', 'aui-textarea--auto-native');
  }

  #config(): Readonly<TextareaConfig & { locale: string }> {
    const o = this.#options;
    return textareaConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #assertOptions(options: TextareaOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('TEXTAREA_OPTIONS', 'Invalid textarea options.', { component: 'textarea', property: `textarea.${property}`, expected });
    };
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    const isLength = validators.integerInRange(0, 1_000_000);
    if (options.minLength !== undefined && !isLength(options.minLength)) fail('minLength', 'integer >= 0');
    if (options.maxLength !== undefined && !isLength(options.maxLength)) fail('maxLength', 'integer >= 0');
    if (options.minLength !== undefined && options.maxLength !== undefined && options.minLength > options.maxLength) fail('minLength', 'minLength <= maxLength');
    if (options.showCounter && options.maxLength === undefined) fail('showCounter', 'maxLength to be set');
    const isRows = validators.integerInRange(1, 100);
    if (options.rows !== undefined && !isRows(options.rows)) fail('rows', 'integer 1..100');
    if (options.resize !== undefined && !RESIZE.includes(options.resize)) fail('resize', '"none" | "vertical" | "auto"');
    if (options.maxRows !== undefined) {
      if (!isRows(options.maxRows)) fail('maxRows', 'integer 1..100');
      if (options.resize !== 'auto') fail('maxRows', 'resize: "auto"');
      if (options.maxRows < (options.rows ?? 3)) fail('maxRows', 'maxRows >= rows');
    }
  }

  #bindEvents(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.textarea, 'input', () => {
      this.#state.dirty = true;
      // An external error describes the previous value; editing clears it.
      this.#state.customError = null;
      this.#render();
      this.#scheduleCounterAnnouncement();
      emit(this.host, 'aui-input', { value: this.textarea.value, validity: this.#validity } satisfies TextareaValueDetail);
    });
    g.listen(this.textarea, 'change', () => {
      emit(this.host, 'aui-change', { value: this.textarea.value, validity: this.#validity } satisfies TextareaValueDetail);
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
  }

  #scheduleCounterAnnouncement(): void {
    const max = this.#options.maxLength;
    if (!this.#options.showCounter || max === undefined) return;
    clearTimeout(this.#announceTimer);
    this.#announceTimer = setTimeout(() => {
      const length = textLength(this.textarea.value);
      // Announce only near or over the limit, so screen-reader users are not interrupted on every keystroke.
      if (max - length <= Math.max(1, Math.floor(max * 0.1))) announce(counterText(length, max, this.#config().locale).text, 'polite', this.#doc);
    }, 750);
  }

  /**
   * Sizing. Rows and the auto-grow bounds are custom properties consumed by the
   * stylesheet (`lh` units), so CSS clamps both the native and the fallback path.
   * The fallback writes only `block-size`, through the CSSOM (CSP-safe).
   */
  #renderSize(o: TextareaOptions): void {
    const ta = this.textarea;
    const resize = o.resize ?? 'vertical';
    const rows = o.rows ?? 3;
    ta.rows = rows;
    ta.style.setProperty('--aui-textarea-rows', String(rows));
    if (o.maxRows === undefined) ta.style.removeProperty('--aui-textarea-max-rows');
    else ta.style.setProperty('--aui-textarea-max-rows', String(o.maxRows));
    const auto = resize === 'auto';
    const native = auto && supportsFieldSizing();
    this.host.classList.toggle('aui-textarea--resize-none', resize === 'none');
    this.host.classList.toggle('aui-textarea--auto', auto);
    this.host.classList.toggle('aui-textarea--auto-native', native);
    if (!auto || native) {
      ta.style.removeProperty('block-size');
      return;
    }
    this.#fitContent();
  }

  #fitContent(): void {
    const ta = this.textarea;
    // Detached or hidden: nothing to measure; the next input event sizes it.
    if (!ta.isConnected) return;
    ta.style.setProperty('block-size', 'auto');
    const scroll = ta.scrollHeight;
    if (scroll === 0) {
      ta.style.removeProperty('block-size');
      return;
    }
    const cs = getComputedStyle(ta);
    const borders = (Number.parseFloat(cs.borderBlockStartWidth) || 0) + (Number.parseFloat(cs.borderBlockEndWidth) || 0);
    ta.style.setProperty('block-size', `${scroll + borders}px`);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const ta = this.textarea;

    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    ta.placeholder = o.placeholder ?? '';
    ta.disabled = o.disabled ?? false;
    ta.readOnly = o.readOnly ?? false;
    ta.required = o.required ?? false;
    if (o.name) ta.name = o.name;
    else ta.removeAttribute('name');
    if (o.autocomplete) ta.setAttribute('autocomplete', o.autocomplete);
    else ta.removeAttribute('autocomplete');
    ta.spellcheck = o.spellcheck ?? true;
    this.#renderSize(o);

    const value = ta.value;
    const outcome = checkText(value, {
      ...(o.required === undefined ? {} : { required: o.required }),
      ...(o.minLength === undefined ? {} : { minLength: o.minLength }),
      ...(o.maxLength === undefined ? {} : { maxLength: o.maxLength }),
    });
    const custom = outcome.error === null ? runValidator(o.validate, value) : null;
    this.#validity = resolveValidity(outcome, { locale: config.locale }, custom, this.#state.customError);

    if (o.showCounter && o.maxLength !== undefined) {
      const c = counterText(textLength(value), o.maxLength, config.locale);
      this.#chrome.setCounter(c.text, c.over);
    } else {
      this.#chrome.setCounter(null, false);
    }

    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    setDescribedBy(ta, this.#chrome.describedBy());
    setInvalid(ta, show);
    this.host.classList.toggle('aui-textarea--invalid', show);
    this.host.classList.toggle('aui-textarea--disabled', o.disabled ?? false);
  }
}
