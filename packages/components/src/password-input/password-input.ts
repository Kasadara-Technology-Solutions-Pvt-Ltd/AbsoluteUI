/**
 * Password Input (SPEC section 18.22, section 14.3): a native password <input> with field
 * chrome, a show/hide toggle button, `autocomplete` for password managers
 * (`current-password` / `new-password`), an optional Caps Lock warning, and a
 * clipboard policy. The value never appears in events, messages, or
 * announcements. AbsoluteUI is not an authentication provider: this is an input,
 * and credential handling stays with the application and its server.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce } from '@absoluteui/utilities';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, setText, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { checkText, compilePattern, resolveValidity, runValidator, VALID, type FieldValidity } from '../internal/validation.js';

export type PasswordAutocomplete = 'current-password' | 'new-password' | 'off';
export type PasswordClipboardPolicy = 'allow' | 'block-copy' | 'block-all';

export interface PasswordInputConfig {
  validationTiming: ValidationTiming;
  /** Show a warning while Caps Lock is on and the field has focus. */
  capsLockWarning: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    passwordInput: PasswordInputConfig & { locale: string };
  }
}

export const passwordInputConfig = defineComponentConfig<PasswordInputConfig, 'locale'>(
  'passwordInput',
  {
    validationTiming: validationTimingSpec,
    capsLockWarning: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale'],
);

registerMessages('passwordInput', 'en', {
  showPassword: 'Show password',
  passwordShown: 'Password shown',
  passwordHidden: 'Password hidden',
  capsLockOn: 'Caps Lock is on.',
});

export interface PasswordInputIcons {
  error: IconRef;
  reveal: IconRef;
  conceal: IconRef;
  capsLock: IconRef;
}

export interface PasswordInputOptions extends Partial<PasswordInputConfig> {
  /** Visible label (required accessible name). */
  label: string;
  hideLabel?: boolean;
  /** Initial value; `reset()` restores it. */
  value?: string;
  name?: string;
  /** Help text, referenced by aria-describedby (text only). */
  description?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  minLength?: number;
  /** Validated (not truncated), so password managers can paste long values. */
  maxLength?: number;
  /** HTML pattern attribute semantics: anchored, `v` flag. */
  pattern?: string;
  /** Default `current-password`. Use `new-password` on sign-up and change-password forms. */
  autocomplete?: PasswordAutocomplete;
  /** Show the show/hide toggle. Default true. */
  revealable?: boolean;
  /** Clipboard policy (section 14.3). Default `allow`: blocking paste breaks password managers. */
  clipboard?: PasswordClipboardPolicy;
  /** Extra element ids appended to aria-describedby, e.g. a Password Strength Meter's `describedById`. */
  describedBy?: readonly string[];
  /** Consumer validation; return a message to mark the value invalid. The message must not contain the value. */
  validate?: (value: string) => string | null;
  locale?: string;
  icons?: Partial<PasswordInputIcons>;
}

/** Event detail. The value is deliberately absent: read `controller.value` when needed. */
export interface PasswordInputValueDetail {
  validity: FieldValidity;
}

export interface PasswordInputCapsLockDetail {
  on: boolean;
}

const AUTOCOMPLETE: readonly PasswordAutocomplete[] = ['current-password', 'new-password', 'off'];
const ID_RE = /^[A-Za-z][\w:.-]*$/;

export class PasswordInput implements FormControl {
  readonly host: HTMLElement;
  readonly input: HTMLInputElement;
  #options: PasswordInputOptions;
  #initialValue: string;
  #validity: FieldValidity = VALID;
  #pattern: RegExp | null = null;
  #revealed = false;
  #capsLock = false;
  #revealButton: HTMLButtonElement | null = null;
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #control: HTMLDivElement;
  readonly #caps: HTMLDivElement;
  readonly #capsText: HTMLSpanElement;
  #capsIcon: IconRef | null = null;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render a password field into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: PasswordInputOptions): PasswordInput {
    return new PasswordInput(host, options);
  }

  private constructor(host: HTMLElement, options: PasswordInputOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#initialValue = options.value ?? '';
    const doc = this.#doc;

    this.#chrome = new FieldChrome(doc, 'label', 'aui-password-input');
    this.input = doc.createElement('input');
    this.input.id = createId('aui-password-input');
    this.input.className = 'aui-password-input__input';
    (this.#chrome.label as HTMLLabelElement).htmlFor = this.input.id;
    this.input.value = this.#initialValue;
    // Passwords are never spell-checked (spellcheck services may send text off-device) or auto-capitalized.
    this.input.spellcheck = false;
    this.input.setAttribute('autocapitalize', 'none');

    this.#control = doc.createElement('div');
    this.#control.className = 'aui-password-input__control';
    this.#control.append(this.input);

    this.#caps = doc.createElement('div');
    this.#caps.className = 'aui-password-input__caps';
    this.#caps.id = createId('aui-password-input-caps');
    this.#caps.hidden = true;
    this.#capsText = doc.createElement('span');
    this.#caps.append(this.#capsText);

    host.classList.add('aui-field', 'aui-password-input');
    host.replaceChildren(this.#chrome.label, this.#control, this.#chrome.description, this.#caps, this.#chrome.error);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(passwordInputConfig.subscribe(() => {
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

  /** Whether the password is currently shown as plain text. */
  get revealed(): boolean {
    return this.#revealed;
  }

  get options(): Readonly<PasswordInputOptions> {
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

  /** Show (true) or mask (false) the password. */
  setRevealed(revealed: boolean): void {
    if (!this.#isRevealable()) return;
    this.#revealed = revealed;
    this.#render();
  }

  update(options: Partial<PasswordInputOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    if ('value' in options) {
      this.#initialValue = options.value ?? '';
      this.input.value = this.#initialValue;
    }
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
    this.#capsLock = false;
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-password-input', 'aui-password-input--invalid', 'aui-password-input--disabled');
  }

  #config(): Readonly<PasswordInputConfig & { locale: string }> {
    const o = this.#options;
    return passwordInputConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.capsLockWarning === undefined ? {} : { capsLockWarning: o.capsLockWarning }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #assertOptions(options: PasswordInputOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('PASSWORD_INPUT_OPTIONS', 'Invalid password input options.', { component: 'passwordInput', property: `passwordInput.${property}`, expected });
    };
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    const isLength = validators.integerInRange(0, 1_000_000);
    if (options.minLength !== undefined && !isLength(options.minLength)) fail('minLength', 'integer >= 0');
    if (options.maxLength !== undefined && !isLength(options.maxLength)) fail('maxLength', 'integer >= 0');
    if (options.minLength !== undefined && options.maxLength !== undefined && options.minLength > options.maxLength) fail('minLength', 'minLength <= maxLength');
    if (options.autocomplete !== undefined && !AUTOCOMPLETE.includes(options.autocomplete)) fail('autocomplete', '"current-password" | "new-password" | "off"');
    if (options.clipboard !== undefined && !['allow', 'block-copy', 'block-all'].includes(options.clipboard)) fail('clipboard', '"allow" | "block-copy" | "block-all"');
    if (options.describedBy !== undefined && (!Array.isArray(options.describedBy) || options.describedBy.some((id) => typeof id !== 'string' || !ID_RE.test(id)))) fail('describedBy', 'array of element ids');
    if (options.validate !== undefined && typeof options.validate !== 'function') fail('validate', '(value: string) => string | null');
    this.#pattern = compilePattern(options.pattern, 'passwordInput');
  }

  #isRevealable(): boolean {
    return this.#options.revealable ?? true;
  }

  #bindEvents(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.input, 'input', () => {
      this.#state.dirty = true;
      // An external error describes the previous value; editing clears it.
      this.#state.customError = null;
      this.#render();
      emit(this.host, 'aui-input', { validity: this.#validity } satisfies PasswordInputValueDetail);
    });
    g.listen(this.input, 'change', () => {
      emit(this.host, 'aui-change', { validity: this.#validity } satisfies PasswordInputValueDetail);
    });
    const caps = (event: KeyboardEvent | MouseEvent): void => {
      // Synthetic events without modifier state (e.g. from scripts) report false.
      const on = typeof event.getModifierState === 'function' && event.getModifierState('CapsLock');
      this.#setCapsLock(on);
    };
    g.listen(this.input, 'keydown', caps);
    g.listen(this.input, 'keyup', caps);
    g.listen(this.input, 'mousedown', caps);
    g.listen(this.input, 'blur', () => {
      this.#setCapsLock(false);
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

  #setCapsLock(on: boolean): void {
    const config = this.#config();
    const next = on && config.capsLockWarning;
    if (next === this.#capsLock) return;
    this.#capsLock = next;
    this.#render();
    if (next) announce(getMessage('passwordInput', 'capsLockOn', {}, config.locale), 'polite', this.#doc);
    emit(this.host, 'aui-caps-lock', { on: next } satisfies PasswordInputCapsLockDetail, { bubbles: false });
  }

  #renderReveal(o: PasswordInputOptions, locale: string): void {
    if (!this.#isRevealable()) {
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
      b.className = 'aui-password-input__reveal';
      b.setAttribute('aria-controls', this.input.id);
      b.addEventListener('click', () => {
        this.#revealed = !this.#revealed;
        this.#render();
        announce(getMessage('passwordInput', this.#revealed ? 'passwordShown' : 'passwordHidden', {}, this.#config().locale), 'polite', this.#doc);
      });
      this.#revealButton = b;
      this.#control.append(b);
    }
    const b = this.#revealButton;
    // A toggle button: the name stays constant ("Show password") and aria-pressed
    // carries the state (a changing name plus aria-pressed would read as a contradiction).
    b.setAttribute('aria-label', getMessage('passwordInput', 'showPassword', {}, locale));
    b.setAttribute('aria-pressed', String(this.#revealed));
    b.disabled = o.disabled ?? false;
    b.replaceChildren(renderIcon(this.#revealed ? (o.icons?.conceal ?? 'eye-off') : (o.icons?.reveal ?? 'eye'), { doc: this.#doc }));
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const input = this.input;

    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    this.#renderReveal(o, config.locale);
    input.type = this.#revealed ? 'text' : 'password';
    input.disabled = o.disabled ?? false;
    input.readOnly = o.readOnly ?? false;
    input.required = o.required ?? false;
    if (o.name) input.name = o.name;
    else input.removeAttribute('name');
    input.setAttribute('autocomplete', o.autocomplete ?? 'current-password');

    const capsIcon = o.icons?.capsLock ?? 'alert-triangle';
    if (this.#capsIcon !== capsIcon) {
      this.#caps.querySelector('.aui-icon')?.remove();
      this.#caps.prepend(renderIcon(capsIcon, { doc: this.#doc }));
      this.#capsIcon = capsIcon;
    }
    setText(this.#capsText, getMessage('passwordInput', 'capsLockOn', {}, config.locale));
    this.#caps.hidden = !this.#capsLock;

    const value = input.value;
    const outcome = checkText(value, {
      type: 'password',
      ...(o.required === undefined ? {} : { required: o.required }),
      ...(o.minLength === undefined ? {} : { minLength: o.minLength }),
      ...(o.maxLength === undefined ? {} : { maxLength: o.maxLength }),
      pattern: this.#pattern,
    });
    const custom = outcome.error === null ? runValidator(o.validate, value) : null;
    this.#validity = resolveValidity(outcome, { locale: config.locale }, custom, this.#state.customError);

    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    setDescribedBy(input, this.#chrome.describedBy(), [...(this.#capsLock ? [this.#caps.id] : []), ...(o.describedBy ?? [])]);
    setInvalid(input, show);
    this.host.classList.toggle('aui-password-input--invalid', show);
    this.host.classList.toggle('aui-password-input--disabled', o.disabled ?? false);
  }
}
