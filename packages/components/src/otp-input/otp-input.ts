/**
 * OTP Input (SPEC section 18.22): one-time passcodes, PINs, MFA codes, and recovery
 * codes. One native <input> holds the whole code and N visual cells mirror it.
 *
 * Why one input rather than N single-character inputs: `autocomplete="one-time-code"`
 * (SMS/authenticator autofill) and password managers fill a single field; paste,
 * undo, selection, Backspace, and arrow keys keep their native behavior; screen
 * readers announce one labelled field ("Verification code, 6 digits") instead of
 * N unlabelled boxes; and there is no focus juggling that can drop characters
 * while typing fast. The cells are aria-hidden presentation above the input and
 * let pointer events through to it.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, formatNumber, getMessage, registerMessages, validators } from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, setText, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { VALID, type FieldValidity } from '../internal/validation.js';

export type OtpInputType = 'numeric' | 'alphanumeric';

export interface OtpInputConfig {
  validationTiming: ValidationTiming;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    otpInput: OtpInputConfig & { locale: string };
  }
}

export const otpInputConfig = defineComponentConfig<OtpInputConfig, 'locale'>('otpInput', { validationTiming: validationTimingSpec }, ['locale']);

registerMessages('otpInput', 'en', {
  hintNumeric: '{length} digits',
  hintAlphanumeric: '{length} letters or digits',
  valueMissing: 'Enter the code.',
  incompleteNumeric: 'Enter all {length} digits.',
  incompleteAlphanumeric: 'Enter all {length} characters.',
});

export interface OtpInputIcons {
  error: IconRef;
}

export interface OtpInputOptions extends Partial<OtpInputConfig> {
  /** Visible label (required accessible name), e.g. "Verification code". */
  label: string;
  hideLabel?: boolean;
  /** Number of characters. Default 6. */
  length?: number;
  /** Default `numeric` (digits 0-9). `alphanumeric` allows A-Z, a-z, and 0-9. */
  type?: OtpInputType;
  /** Show dots instead of characters (for PINs). The input becomes a password input. Default false. */
  mask?: boolean;
  /** Alphanumeric only: convert letters to upper case as they are entered. Default false. */
  uppercase?: boolean;
  /** Visually separate cells into groups of this size (e.g. 4 for recovery codes). Separators are presentation only. */
  groupSize?: number;
  /** Initial value (normalized: disallowed characters are dropped); `reset()` restores it. */
  value?: string;
  name?: string;
  /** Help text, referenced by aria-describedby (text only). */
  description?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Default `one-time-code`; use `off` for recovery codes that must not be autofilled. */
  autocomplete?: 'one-time-code' | 'off';
  /** Consumer validation of a complete code; return a message to mark it invalid. */
  validate?: (value: string) => string | null;
  locale?: string;
  icons?: Partial<OtpInputIcons>;
}

/** Event detail. The code is deliberately absent: read `controller.value` when needed. */
export interface OtpInputValueDetail {
  validity: FieldValidity;
  /** Whether all cells are filled. */
  complete: boolean;
}

export interface OtpInputCompleteDetail {
  validity: FieldValidity;
}

const TYPES: readonly OtpInputType[] = ['numeric', 'alphanumeric'];
const AUTOCOMPLETE: readonly string[] = ['one-time-code', 'off'];
const NUMERIC = /[0-9]/u;
const ALPHANUMERIC = /[A-Za-z0-9]/u;
const MASK = '\u2022';

export class OtpInput implements FormControl {
  readonly host: HTMLElement;
  readonly input: HTMLInputElement;
  #options: OtpInputOptions;
  #initialValue: string;
  #validity: FieldValidity = VALID;
  #complete = false;
  #cellEls: HTMLSpanElement[] = [];
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #control: HTMLDivElement;
  readonly #cells: HTMLDivElement;
  readonly #hint: HTMLSpanElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render an OTP input into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: OtpInputOptions): OtpInput {
    return new OtpInput(host, options);
  }

  private constructor(host: HTMLElement, options: OtpInputOptions) {
    OtpInput.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#initialValue = this.#normalize(options.value ?? '');
    const doc = this.#doc;

    this.#chrome = new FieldChrome(doc, 'label', 'aui-otp-input');
    this.input = doc.createElement('input');
    this.input.id = createId('aui-otp-input');
    this.input.className = 'aui-otp-input__input';
    (this.#chrome.label as HTMLLabelElement).htmlFor = this.input.id;
    this.input.value = this.#initialValue;
    this.input.spellcheck = false;
    // Codes are left-to-right in every locale.
    this.input.dir = 'ltr';

    this.#cells = doc.createElement('div');
    this.#cells.className = 'aui-otp-input__cells';
    this.#cells.setAttribute('aria-hidden', 'true');
    this.#control = doc.createElement('div');
    this.#control.className = 'aui-otp-input__control';
    this.#control.dir = 'ltr';
    this.#control.append(this.input, this.#cells);

    this.#hint = doc.createElement('span');
    this.#hint.className = 'aui-visually-hidden';
    this.#hint.id = createId('aui-otp-input-hint');

    host.classList.add('aui-field', 'aui-otp-input');
    host.replaceChildren(this.#chrome.label, this.#chrome.description, this.#control, this.#hint, this.#chrome.error);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#complete = this.#isComplete();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(otpInputConfig.subscribe(() => {
      this.#render();
    }));
  }

  get value(): string {
    return this.input.value;
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
    return this.input.value !== this.#initialValue;
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  /** Whether every cell is filled. */
  get complete(): boolean {
    return this.#isComplete();
  }

  get options(): Readonly<OtpInputOptions> {
    return this.#options;
  }

  getFormValue(): string {
    return this.input.value;
  }

  /** Set the value programmatically (normalized; no events). */
  setValue(value: string): void {
    this.input.value = this.#normalize(value);
    this.#complete = this.#isComplete();
    this.#state.customError = null;
    this.#render();
  }

  update(options: Partial<OtpInputOptions>): void {
    const next = { ...this.#options, ...options };
    OtpInput.#assert(next);
    this.#options = next;
    if ('value' in options) this.#initialValue = this.#normalize(options.value ?? '');
    // Re-normalize: the length or character set may have changed.
    this.input.value = this.#normalize('value' in options ? this.#initialValue : this.input.value);
    this.#complete = this.#isComplete();
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

  /** Clear the value (for example after a rejected code) and focus the field. No events. */
  clear(): void {
    this.setValue('');
    this.input.focus();
  }

  reset(): void {
    this.input.value = this.#initialValue;
    this.#complete = this.#isComplete();
    this.#state.reset();
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-otp-input', 'aui-otp-input--invalid', 'aui-otp-input--disabled', 'aui-otp-input--focused');
  }

  static #assert(o: OtpInputOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('OTP_INPUT_OPTIONS', 'Invalid OTP input options.', { component: 'otpInput', property: `otpInput.${property}`, expected });
    };
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (o.length !== undefined && !validators.integerInRange(1, 32)(o.length)) fail('length', 'integer 1..32');
    if (o.type !== undefined && !TYPES.includes(o.type)) fail('type', '"numeric" | "alphanumeric"');
    if (o.groupSize !== undefined && (!validators.integerInRange(1, 32)(o.groupSize) || o.groupSize >= (o.length ?? 6))) fail('groupSize', 'integer >= 1 and < length');
    if (o.uppercase && o.type !== 'alphanumeric') fail('uppercase', 'type: "alphanumeric"');
    if (o.autocomplete !== undefined && !AUTOCOMPLETE.includes(o.autocomplete)) fail('autocomplete', '"one-time-code" | "off"');
    if (o.validate !== undefined && typeof o.validate !== 'function') fail('validate', '(value: string) => string | null');
  }

  #config(): Readonly<OtpInputConfig & { locale: string }> {
    const o = this.#options;
    return otpInputConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #length(): number {
    return this.#options.length ?? 6;
  }

  #isComplete(): boolean {
    return this.input.value.length === this.#length();
  }

  /** Keep only allowed characters (after NFKC, so full-width digits count), then truncate. */
  #filter(raw: string): string {
    const allowed = this.#options.type === 'alphanumeric' ? ALPHANUMERIC : NUMERIC;
    let out = '';
    for (const ch of raw.normalize('NFKC')) if (allowed.test(ch)) out += this.#options.uppercase ? ch.toUpperCase() : ch;
    return out;
  }

  #normalize(raw: string): string {
    return this.#filter(raw).slice(0, this.#length());
  }

  #bindEvents(): void {
    const g = this.#group;
    const input = this.input;
    observePointer(this.#doc);
    g.listen(input, 'paste', (event) => {
      const text = event.clipboardData?.getData('text') ?? '';
      const code = this.#filter(text);
      // A pasted full code (often with spaces or dashes) replaces the value wherever the caret is.
      if (code.length < this.#length()) return;
      event.preventDefault();
      input.value = code.slice(0, this.#length());
      input.setSelectionRange(input.value.length, input.value.length);
      this.#afterUserInput();
    });
    g.listen(input, 'input', (event) => {
      const raw = input.value;
      const caret = input.selectionStart ?? raw.length;
      let before = this.#filter(raw.slice(0, caret));
      let after = this.#filter(raw.slice(caret));
      const max = this.#length();
      // Typing into a full code overwrites the next character (the usual OTP behavior).
      if (before.length + after.length > max && event instanceof InputEvent && event.inputType === 'insertText') after = after.slice(before.length + after.length - max);
      if (before.length > max) before = before.slice(0, max);
      const value = (before + after).slice(0, max);
      if (value !== raw) {
        input.value = value;
        const pos = Math.min(before.length, value.length);
        input.setSelectionRange(pos, pos);
      }
      this.#afterUserInput();
    });
    g.listen(input, 'change', () => {
      emit(this.host, 'aui-change', { validity: this.#validity, complete: this.#isComplete() } satisfies OtpInputValueDetail);
    });
    const sync = (): void => {
      this.#renderCells();
    };
    g.listen(input, 'keyup', sync);
    g.listen(input, 'select', sync);
    g.listen(input, 'focus', () => {
      this.host.classList.add('aui-otp-input--focused');
      this.#renderCells();
    });
    g.listen(input, 'blur', () => {
      this.host.classList.remove('aui-otp-input--focused');
      this.#renderCells();
    });
    // The text is invisible, so a click places the caret at the cell under the pointer.
    g.listen(input, 'click', (event) => {
      const index = this.#cellEls.findIndex((cell) => {
        const r = cell.getBoundingClientRect();
        return event.clientX >= r.left && event.clientX <= r.right;
      });
      if (index === -1) return;
      const pos = Math.min(index, input.value.length);
      input.setSelectionRange(pos, index < input.value.length ? pos + 1 : pos);
      this.#renderCells();
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
  }

  #afterUserInput(): void {
    this.#state.dirty = true;
    this.#state.customError = null;
    this.#render();
    const complete = this.#isComplete();
    emit(this.host, 'aui-input', { validity: this.#validity, complete } satisfies OtpInputValueDetail);
    if (complete && !this.#complete) emit(this.host, 'aui-complete', { validity: this.#validity } satisfies OtpInputCompleteDetail);
    this.#complete = complete;
  }

  #renderCells(): void {
    const length = this.#length();
    const group = this.#options.groupSize;
    const doc = this.#doc;
    if (this.#cellEls.length !== length || this.#cells.dataset.group !== String(group ?? '')) {
      this.#cellEls = Array.from({ length }, () => {
        const cell = doc.createElement('span');
        cell.className = 'aui-otp-input__cell';
        return cell;
      });
      const nodes: HTMLSpanElement[] = [];
      this.#cellEls.forEach((cell, i) => {
        if (group !== undefined && i > 0 && i % group === 0) {
          const sep = doc.createElement('span');
          sep.className = 'aui-otp-input__separator';
          sep.textContent = '-';
          nodes.push(sep);
        }
        nodes.push(cell);
      });
      this.#cells.replaceChildren(...nodes);
      this.#cells.dataset.group = String(group ?? '');
    }
    const value = this.input.value;
    const focused = this.#doc.activeElement === this.input;
    const start = Math.min(this.input.selectionStart ?? value.length, length - 1);
    const end = this.input.selectionEnd ?? start;
    this.#cellEls.forEach((cell, i) => {
      const ch = value[i] ?? '';
      setText(cell, ch === '' ? '' : this.#options.mask ? MASK : ch);
      cell.classList.toggle('aui-otp-input__cell--filled', ch !== '');
      const active = focused && (end > start ? i >= start && i < end : i === start);
      cell.classList.toggle('aui-otp-input__cell--active', active);
    });
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const locale = config.locale;
    const input = this.input;
    const length = this.#length();
    const numeric = o.type !== 'alphanumeric';

    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    input.type = o.mask ? 'password' : 'text';
    input.inputMode = numeric ? 'numeric' : 'text';
    input.setAttribute('autocomplete', o.autocomplete ?? 'one-time-code');
    input.setAttribute('autocapitalize', o.uppercase ? 'characters' : 'none');
    input.disabled = o.disabled ?? false;
    input.readOnly = o.readOnly ?? false;
    input.required = o.required ?? false;
    if (o.name) input.name = o.name;
    else input.removeAttribute('name');
    this.#control.style.setProperty('--aui-otp-length', String(length));
    const count = formatNumber(length, {}, locale);
    setText(this.#hint, getMessage('otpInput', numeric ? 'hintNumeric' : 'hintAlphanumeric', { length: count }, locale));

    const value = input.value;
    let validity: FieldValidity = VALID;
    if (value === '') {
      if (o.required) validity = Object.freeze({ valid: false, error: 'value-missing', message: getMessage('otpInput', 'valueMissing', {}, locale) });
    } else if (value.length < length) {
      validity = Object.freeze({ valid: false, error: 'too-short', message: getMessage('otpInput', numeric ? 'incompleteNumeric' : 'incompleteAlphanumeric', { length: count }, locale) });
    }
    if (validity.valid) {
      const custom = value !== '' && o.validate ? o.validate(value) : null;
      const message = (typeof custom === 'string' && custom !== '' ? custom : null) ?? this.#state.customError;
      if (message) validity = Object.freeze({ valid: false, error: 'custom', message });
    }
    this.#validity = validity;

    const show = !validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? validity.message : '', o.icons?.error ?? 'alert-circle');
    const ids = this.#chrome.describedBy();
    // Reading order: help text, then the character hint, then the error.
    const describedBy = this.#chrome.description.hidden ? [this.#hint.id, ...ids] : [ids[0] ?? '', this.#hint.id, ...ids.slice(1)];
    setDescribedBy(input, describedBy.filter(Boolean));
    setInvalid(input, show);
    this.host.classList.toggle('aui-otp-input--invalid', show);
    this.host.classList.toggle('aui-otp-input--disabled', o.disabled ?? false);
    this.#renderCells();
  }
}
