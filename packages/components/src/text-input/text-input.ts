/**
 * Text Input (SPEC section 18.5). A native <input> with field chrome: label, required
 * indicator, help text, validation message, optional character counter, text
 * addons, and sensitive-input support (reveal toggle, clipboard policy, section 14.3).
 * Constraint validation runs in the shared validation engine so every browser
 * reports the same localized messages.
 */
import { configurationError, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, createId, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce } from '@absoluteui/utilities';
import { counterText, FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, setText, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { checkText, compilePattern, resolveValidity, runValidator, textLength, VALID, type FieldValidity } from '../internal/validation.js';

export type TextInputType = 'text' | 'email' | 'url' | 'tel' | 'password' | 'search';
export type ClipboardPolicy = 'allow' | 'block-copy' | 'block-all';

export interface TextInputConfig {
  validationTiming: ValidationTiming;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    textInput: TextInputConfig & { locale: string };
  }
}

export const textInputConfig = defineComponentConfig<TextInputConfig, 'locale'>(
  'textInput',
  { validationTiming: validationTimingSpec },
  ['locale'],
);

registerMessages('textInput', 'en', {
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  passwordShown: 'Password shown',
  passwordHidden: 'Password hidden',
});

export interface TextInputIcons {
  error: IconRef;
  reveal: IconRef;
  conceal: IconRef;
}

export interface TextInputOptions extends Partial<TextInputConfig> {
  /** Visible label (required accessible name). */
  label: string;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  type?: TextInputType;
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
  /** HTML pattern attribute semantics: anchored, `v` flag. */
  pattern?: string;
  /** Show a character counter; requires `maxLength`. */
  showCounter?: boolean;
  autocomplete?: string;
  inputMode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
  spellcheck?: boolean;
  /** Text addons rendered inside the control boundary, e.g. a unit or domain. */
  prefix?: string;
  suffix?: string;
  /** Password inputs: show a reveal/hide toggle. Default true for `type: 'password'`. */
  revealable?: boolean;
  /** Clipboard policy for sensitive values (section 14.3). Default `allow`. */
  clipboard?: ClipboardPolicy;
  /** Consumer validation; return a message to mark the value invalid. */
  validate?: (value: string) => string | null;
  locale?: string;
  icons?: Partial<TextInputIcons>;
}

export interface TextInputValueDetail {
  value: string;
  validity: FieldValidity;
}

const TYPES: readonly TextInputType[] = ['text', 'email', 'url', 'tel', 'password', 'search'];

export class TextInput implements FormControl {
  readonly host: HTMLElement;
  readonly input: HTMLInputElement;
  #options: TextInputOptions;
  #initialValue: string;
  #validity: FieldValidity = VALID;
  #pattern: RegExp | null = null;
  #revealed = false;
  #revealButton: HTMLButtonElement | null = null;
  #announceTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #control: HTMLDivElement;
  readonly #prefix: HTMLSpanElement;
  readonly #suffix: HTMLSpanElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render a text input into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: TextInputOptions): TextInput {
    return new TextInput(host, options);
  }

  private constructor(host: HTMLElement, options: TextInputOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#initialValue = options.value ?? '';
    const doc = this.#doc;

    this.#chrome = new FieldChrome(doc, 'label', 'aui-text-input');
    this.input = doc.createElement('input');
    this.input.id = createId('aui-text-input');
    this.input.className = 'aui-text-input__input';
    (this.#chrome.label as HTMLLabelElement).htmlFor = this.input.id;
    this.input.value = this.#initialValue;

    this.#control = doc.createElement('div');
    this.#control.className = 'aui-text-input__control';
    this.#prefix = doc.createElement('span');
    this.#prefix.className = 'aui-text-input__addon aui-text-input__prefix';
    this.#prefix.id = createId('aui-text-input-prefix');
    this.#suffix = doc.createElement('span');
    this.#suffix.className = 'aui-text-input__addon aui-text-input__suffix';
    this.#suffix.id = createId('aui-text-input-suffix');
    this.#control.append(this.#prefix, this.input, this.#suffix);

    host.classList.add('aui-field', 'aui-text-input');
    host.replaceChildren(this.#chrome.label, this.#control, this.#chrome.description, this.#chrome.counter, this.#chrome.error);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(textInputConfig.subscribe(() => {
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

  get options(): Readonly<TextInputOptions> {
    return this.#options;
  }

  getFormValue(): string {
    return this.input.value;
  }

  /** Set the value programmatically (no events). */
  setValue(value: string): void {
    this.input.value = value;
    this.#state.customError = null;
    this.#render();
  }

  update(options: Partial<TextInputOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    if ('value' in options) this.input.value = options.value ?? '';
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
    this.input.value = this.#initialValue;
    this.#state.reset();
    this.#revealed = false;
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    clearTimeout(this.#announceTimer);
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-text-input', 'aui-text-input--invalid', 'aui-text-input--disabled');
  }

  #config(): Readonly<TextInputConfig & { locale: string }> {
    const o = this.#options;
    return textInputConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #assertOptions(options: TextInputOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('TEXT_INPUT_OPTIONS', 'Invalid text input options.', { component: 'textInput', property: `textInput.${property}`, expected });
    };
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (options.type !== undefined && !TYPES.includes(options.type)) fail('type', '"text" | "email" | "url" | "tel" | "password" | "search"');
    const isLength = validators.integerInRange(0, 1_000_000);
    if (options.minLength !== undefined && !isLength(options.minLength)) fail('minLength', 'integer >= 0');
    if (options.maxLength !== undefined && !isLength(options.maxLength)) fail('maxLength', 'integer >= 0');
    if (options.minLength !== undefined && options.maxLength !== undefined && options.minLength > options.maxLength) fail('minLength', 'minLength <= maxLength');
    if (options.showCounter && options.maxLength === undefined) fail('showCounter', 'maxLength to be set');
    if (options.clipboard !== undefined && !['allow', 'block-copy', 'block-all'].includes(options.clipboard)) fail('clipboard', '"allow" | "block-copy" | "block-all"');
    this.#pattern = compilePattern(options.pattern, 'textInput');
  }

  #bindEvents(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.input, 'input', () => {
      this.#state.dirty = true;
      // An external error describes the previous value; editing clears it.
      this.#state.customError = null;
      this.#render();
      this.#scheduleCounterAnnouncement();
      emit(this.host, 'aui-input', { value: this.input.value, validity: this.#validity } satisfies TextInputValueDetail);
    });
    g.listen(this.input, 'change', () => {
      emit(this.host, 'aui-change', { value: this.input.value, validity: this.#validity } satisfies TextInputValueDetail);
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
    const clipboardGuard = (kind: 'copy' | 'cut' | 'paste') => (event: ClipboardEvent): void => {
      const policy = this.#options.clipboard ?? 'allow';
      if (policy === 'block-all' || (policy === 'block-copy' && kind !== 'paste')) event.preventDefault();
    };
    g.listen(this.input, 'copy', clipboardGuard('copy'));
    g.listen(this.input, 'cut', clipboardGuard('cut'));
    g.listen(this.input, 'paste', clipboardGuard('paste'));
  }

  #scheduleCounterAnnouncement(): void {
    const max = this.#options.maxLength;
    if (!this.#options.showCounter || max === undefined) return;
    clearTimeout(this.#announceTimer);
    this.#announceTimer = setTimeout(() => {
      const length = textLength(this.input.value);
      // Announce only near or over the limit, so screen-reader users are not interrupted on every keystroke.
      if (max - length <= Math.max(1, Math.floor(max * 0.1))) announce(counterText(length, max, this.#config().locale).text, 'polite', this.#doc);
    }, 750);
  }

  #renderReveal(o: TextInputOptions, locale: string): void {
    const type = o.type ?? 'text';
    const revealable = type === 'password' && (o.revealable ?? true);
    if (!revealable) {
      // Clear the reference first: removing a focused button fires focusout, which re-renders (regression).
      const button = this.#revealButton;
      this.#revealButton = null;
      this.#revealed = false;
      button?.remove();
      return;
    }
    if (!this.#revealButton) {
      const b = this.#doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-text-input__reveal';
      b.setAttribute('aria-controls', this.input.id);
      b.addEventListener('click', () => {
        this.#revealed = !this.#revealed;
        this.#render();
        announce(getMessage('textInput', this.#revealed ? 'passwordShown' : 'passwordHidden', {}, this.#config().locale), 'polite', this.#doc);
      });
      this.#revealButton = b;
      this.#control.append(b);
    }
    const b = this.#revealButton;
    // A toggle button: the name stays constant, aria-pressed carries the state.
    b.setAttribute('aria-label', getMessage('textInput', 'showPassword', {}, locale));
    b.setAttribute('aria-pressed', String(this.#revealed));
    b.disabled = o.disabled ?? false;
    b.replaceChildren(renderIcon(this.#revealed ? (o.icons?.conceal ?? 'eye-off') : (o.icons?.reveal ?? 'eye'), { doc: this.#doc }));
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const input = this.input;
    const type = o.type ?? 'text';

    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    this.#renderReveal(o, config.locale);
    input.type = type === 'password' && this.#revealed ? 'text' : type;
    input.placeholder = o.placeholder ?? '';
    input.disabled = o.disabled ?? false;
    input.readOnly = o.readOnly ?? false;
    input.required = o.required ?? false;
    if (o.name) input.name = o.name;
    else input.removeAttribute('name');
    // Sensitive values: no autofill suggestions or spellcheck unless the consumer asks.
    const sensitive = type === 'password';
    input.setAttribute('autocomplete', o.autocomplete ?? (sensitive ? 'current-password' : 'on'));
    input.spellcheck = o.spellcheck ?? type === 'text';
    if (o.inputMode) input.inputMode = o.inputMode;
    else input.removeAttribute('inputmode');

    setText(this.#prefix, o.prefix ?? '');
    this.#prefix.hidden = !o.prefix;
    setText(this.#suffix, o.suffix ?? '');
    this.#suffix.hidden = !o.suffix;

    const value = input.value;
    const outcome = checkText(value, {
      type,
      ...(o.required === undefined ? {} : { required: o.required }),
      ...(o.minLength === undefined ? {} : { minLength: o.minLength }),
      ...(o.maxLength === undefined ? {} : { maxLength: o.maxLength }),
      pattern: this.#pattern,
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
    const addons = [...(o.prefix ? [this.#prefix.id] : []), ...(o.suffix ? [this.#suffix.id] : [])];
    setDescribedBy(input, this.#chrome.describedBy(), addons);
    setInvalid(input, show);
    this.host.classList.toggle('aui-text-input--invalid', show);
    this.host.classList.toggle('aui-text-input--disabled', o.disabled ?? false);
  }
}
