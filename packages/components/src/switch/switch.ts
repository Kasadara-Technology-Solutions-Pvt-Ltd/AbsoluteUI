/**
 * Switch (SPEC section 18.5). A native <input type="checkbox" role="switch"> for an
 * on/off setting that takes effect immediately. The input, restyled with
 * `appearance: none`, is the track, focus target, and hit target; the thumb is a
 * decorative sibling whose position (not only its color) shows the state.
 * Switches have no required state: validity is valid unless a custom error is set.
 */
import { configurationError, defineComponentConfig, DisposableGroup, emit, createId } from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { resolveValidity, VALID, type FieldValidity, type Outcome } from '../internal/validation.js';

export interface SwitchConfig {
  validationTiming: ValidationTiming;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    switch: SwitchConfig & { locale: string };
  }
}

export const switchConfig = defineComponentConfig<SwitchConfig, 'locale'>(
  'switch',
  { validationTiming: validationTimingSpec },
  ['locale'],
);

export interface SwitchIcons {
  error: IconRef;
}

export interface SwitchOptions extends Partial<SwitchConfig> {
  /** Visible label (required accessible name). Clicking it toggles the switch. */
  label: string;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  checked?: boolean;
  /** Submitted value when on. Default `on` (native). */
  value?: string;
  name?: string;
  /** Help text, referenced by aria-describedby (text only). */
  description?: string;
  disabled?: boolean;
  locale?: string;
  icons?: Partial<SwitchIcons>;
}

export interface SwitchChangeDetail {
  checked: boolean;
  value: string;
}

const OK: Outcome = Object.freeze({ error: null, params: {} });

export class Switch implements FormControl {
  readonly host: HTMLElement;
  readonly input: HTMLInputElement;
  #options: SwitchOptions;
  #initialChecked: boolean;
  #validity: FieldValidity = VALID;
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render a switch into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: SwitchOptions): Switch {
    return new Switch(host, options);
  }

  private constructor(host: HTMLElement, options: SwitchOptions) {
    Switch.#assertOptions(options);
    this.host = host;
    this.#options = { ...options };
    this.#initialChecked = options.checked ?? false;
    this.#doc = host.ownerDocument;
    const doc = this.#doc;

    this.#chrome = new FieldChrome(doc, 'label', 'aui-switch');
    this.#chrome.label.classList.add('aui-switch__label');
    this.input = doc.createElement('input');
    this.input.type = 'checkbox';
    this.input.setAttribute('role', 'switch');
    this.input.id = createId('aui-switch');
    this.input.className = 'aui-switch__input';
    (this.#chrome.label as HTMLLabelElement).htmlFor = this.input.id;
    this.input.checked = this.#initialChecked;

    const thumb = doc.createElement('span');
    thumb.className = 'aui-switch__thumb';
    thumb.setAttribute('aria-hidden', 'true');
    const control = doc.createElement('span');
    control.className = 'aui-switch__control';
    control.append(this.input, thumb);
    const row = doc.createElement('div');
    row.className = 'aui-switch__row';
    row.append(control, this.#chrome.label);

    host.classList.add('aui-field', 'aui-switch');
    host.replaceChildren(row, this.#chrome.description, this.#chrome.error);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(switchConfig.subscribe(() => {
      this.#render();
    }));
  }

  get checked(): boolean {
    return this.input.checked;
  }

  /** Submitted value when on. */
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
    return this.input.checked !== this.#initialChecked;
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<SwitchOptions> {
    return this.#options;
  }

  /** `value` when on, `null` when off (native form semantics). */
  getFormValue(): string | null {
    return this.input.checked ? this.value : null;
  }

  /** Set the state programmatically (no events). */
  setChecked(checked: boolean): void {
    this.input.checked = checked;
    this.#state.customError = null;
    this.#render();
  }

  update(options: Partial<SwitchOptions>): void {
    const next = { ...this.#options, ...options };
    Switch.#assertOptions(next);
    this.#options = next;
    if ('checked' in options) this.input.checked = options.checked ?? false;
    this.#render();
  }

  reportValidity(): boolean {
    this.#state.submitted = true;
    this.#render();
    return this.#validity.valid;
  }

  /** External error, e.g. the setting could not be saved. Cleared when the user toggles. */
  setCustomError(message: string | null): void {
    this.#state.customError = message === '' ? null : message;
    this.#render();
  }

  focus(): void {
    this.input.focus();
  }

  reset(): void {
    this.input.checked = this.#initialChecked;
    this.#state.reset();
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-switch', 'aui-switch--invalid', 'aui-switch--disabled');
  }

  #config(): Readonly<SwitchConfig & { locale: string }> {
    const o = this.#options;
    return switchConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  static #assertOptions(options: SwitchOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('SWITCH_OPTIONS', 'Invalid switch options.', { component: 'switch', property: `switch.${property}`, expected });
    };
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (options.value !== undefined && typeof options.value !== 'string') fail('value', 'string');
  }

  #bindEvents(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.input, 'change', () => {
      this.#state.dirty = true;
      // An external error describes the previous state; toggling clears it.
      this.#state.customError = null;
      this.#render();
      emit(this.host, 'aui-change', { checked: this.input.checked, value: this.value } satisfies SwitchChangeDetail);
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
    const input = this.input;

    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, description: o.description });
    input.value = this.value;
    input.disabled = o.disabled ?? false;
    if (o.name) input.name = o.name;
    else input.removeAttribute('name');

    this.#validity = resolveValidity(OK, { locale: config.locale }, null, this.#state.customError);
    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    setDescribedBy(input, this.#chrome.describedBy());
    setInvalid(input, show);
    this.host.classList.toggle('aui-switch--invalid', show);
    this.host.classList.toggle('aui-switch--disabled', o.disabled ?? false);
  }
}
