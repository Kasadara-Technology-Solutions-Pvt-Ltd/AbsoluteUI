/**
 * Number Input (SPEC section 18.5). Locale-aware numeric entry on a text <input> with
 * the spinbutton role, not native type=number: native number inputs ignore the
 * locale's separators, digits, and currency/percent literals, and differ across
 * browsers. Typed text is kept while editing and reformatted on commit. A hidden
 * input carries the canonical value (`1234.5`) for native form submission.
 */
import { configurationError, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, createId, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { checkNumber, decimalPlaces, resolveValidity, runValidator, VALID, type FieldValidity } from '../internal/validation.js';
import { NumberCodec, type NumberInputFormat } from './number-codec.js';

export type { NumberInputFormat } from './number-codec.js';

export interface NumberInputConfig {
  validationTiming: ValidationTiming;
  /** Render increase/decrease buttons next to the input. */
  showSteppers: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    numberInput: NumberInputConfig & { locale: string };
  }
}

export const numberInputConfig = defineComponentConfig<NumberInputConfig, 'locale'>(
  'numberInput',
  {
    validationTiming: validationTimingSpec,
    showSteppers: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale'],
);

registerMessages('numberInput', 'en', {
  increase: 'Increase',
  decrease: 'Decrease',
});

export interface NumberInputIcons {
  error: IconRef;
  increment: IconRef;
  decrement: IconRef;
}

export interface NumberInputOptions extends Partial<NumberInputConfig> {
  /** Visible label (required accessible name). */
  label: string;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  value?: number | null;
  name?: string;
  placeholder?: string;
  /** Help text, referenced by aria-describedby (text only). */
  description?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  min?: number;
  max?: number;
  /**
   * Step for keyboard/stepper increments and step validation (base: `min`, else 0).
   * Default 1 (0.01 for `format.style: 'percent'`, one percentage point). `null` allows any value.
   */
  step?: number | null;
  /** Display format (Intl.NumberFormat subset). */
  format?: NumberInputFormat;
  /** Consumer validation; return a message to mark the value invalid. */
  validate?: (value: number | null) => string | null;
  locale?: string;
  icons?: Partial<NumberInputIcons>;
}

export interface NumberInputInputDetail {
  value: number | null;
  /** Raw text as typed. */
  text: string;
  validity: FieldValidity;
}

export interface NumberInputValueDetail {
  value: number | null;
  validity: FieldValidity;
}

const STYLES = ['decimal', 'percent', 'currency', 'unit'] as const;
const isFractionDigits = validators.integerInRange(0, 20);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class NumberInput implements FormControl {
  readonly host: HTMLElement;
  /** The visible text input (role=spinbutton). */
  readonly input: HTMLInputElement;
  /** Hidden input carrying the canonical value and `name` for native form submission. */
  readonly formInput: HTMLInputElement;
  #options: NumberInputOptions;
  #initialValue: number | null;
  #value: number | null;
  #badInput = false;
  /** Last value reported through aui-change (or the initial value). */
  #committed: { value: number | null; bad: boolean };
  #validity: FieldValidity = VALID;
  #codec: NumberCodec;
  #codecKey = '';
  #steppers: { increment: HTMLButtonElement; decrement: HTMLButtonElement; incIcon: IconRef | null; decIcon: IconRef | null } | null = null;
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #control: HTMLDivElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render a number input into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: NumberInputOptions): NumberInput {
    return new NumberInput(host, options);
  }

  private constructor(host: HTMLElement, options: NumberInputOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#initialValue = options.value ?? null;
    this.#value = this.#initialValue;
    this.#committed = { value: this.#value, bad: false };
    // Validates `format` against the locale before anything is rendered.
    this.#codec = this.#resolveCodec();
    const doc = this.#doc;

    this.#chrome = new FieldChrome(doc, 'label', 'aui-number-input');
    this.input = doc.createElement('input');
    this.input.type = 'text';
    this.input.id = createId('aui-number-input');
    this.input.className = 'aui-number-input__input';
    this.input.setAttribute('role', 'spinbutton');
    this.input.setAttribute('autocomplete', 'off');
    this.input.spellcheck = false;
    (this.#chrome.label as HTMLLabelElement).htmlFor = this.input.id;

    this.formInput = doc.createElement('input');
    this.formInput.type = 'hidden';

    this.#control = doc.createElement('div');
    this.#control.className = 'aui-number-input__control';
    this.#control.append(this.input);

    host.classList.add('aui-field', 'aui-number-input');
    host.replaceChildren(this.#chrome.label, this.#control, this.formInput, this.#chrome.description, this.#chrome.error);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render(true);
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(numberInputConfig.subscribe(() => {
      this.#render(this.#doc.activeElement !== this.input);
    }));
  }

  /** Current parsed value; `null` when empty or unparseable. */
  get value(): number | null {
    return this.#value;
  }

  /** Text shown in the input (raw while typing, formatted after commit). */
  get text(): string {
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
    return this.#badInput || !Object.is(this.#value, this.#initialValue);
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<NumberInputOptions> {
    return this.#options;
  }

  getFormValue(): number | null {
    return this.#value;
  }

  /** Set the value programmatically and reformat the display (no events). */
  setValue(value: number | null): void {
    if (value !== null && !isFiniteNumber(value)) this.#fail('value', 'finite number or null');
    this.#setCommitted(value);
    this.#state.customError = null;
    this.#render(true);
  }

  update(options: Partial<NumberInputOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    const previous = this.#options;
    this.#options = next;
    try {
      this.#codec = this.#resolveCodec();
    } catch (error) {
      this.#options = previous;
      throw error;
    }
    if ('value' in options) this.#setCommitted(options.value ?? null);
    this.#render('value' in options || this.#doc.activeElement !== this.input);
  }

  reportValidity(): boolean {
    this.#state.submitted = true;
    this.#render(false);
    return this.#validity.valid;
  }

  setCustomError(message: string | null): void {
    this.#state.customError = message === '' ? null : message;
    this.#render(false);
  }

  focus(): void {
    this.input.focus();
  }

  reset(): void {
    this.#setCommitted(this.#initialValue);
    this.#state.reset();
    this.#render(true);
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-number-input', 'aui-number-input--invalid', 'aui-number-input--disabled');
  }

  #config(): Readonly<NumberInputConfig & { locale: string }> {
    const o = this.#options;
    return numberInputConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.showSteppers === undefined ? {} : { showSteppers: o.showSteppers }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #resolveCodec(): NumberCodec {
    const locale = this.#config().locale;
    const key = `${locale}|${JSON.stringify(this.#options.format ?? {})}`;
    if (key !== this.#codecKey) {
      const codec = NumberCodec.for(locale, this.#options.format);
      this.#codecKey = key;
      return codec;
    }
    return this.#codec;
  }

  #fail(property: string, expected: string): never {
    throw configurationError('NUMBER_INPUT_OPTIONS', 'Invalid number input options.', { component: 'numberInput', property: `numberInput.${property}`, expected });
  }

  #assertOptions(options: NumberInputOptions): void {
    const fail = (property: string, expected: string): never => this.#fail(property, expected);
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (options.value !== undefined && options.value !== null && !isFiniteNumber(options.value)) fail('value', 'finite number or null');
    if (options.min !== undefined && !isFiniteNumber(options.min)) fail('min', 'finite number');
    if (options.max !== undefined && !isFiniteNumber(options.max)) fail('max', 'finite number');
    if (options.min !== undefined && options.max !== undefined && options.min > options.max) fail('min', 'min <= max');
    if (options.step !== undefined && options.step !== null && !(isFiniteNumber(options.step) && options.step > 0)) fail('step', 'number > 0, or null for any');
    const f = options.format;
    if (f !== undefined) {
      if (f.style !== undefined && !STYLES.includes(f.style)) fail('format.style', '"decimal" | "percent" | "currency" | "unit"');
      if (f.style === 'currency' && (typeof f.currency !== 'string' || f.currency === '')) fail('format.currency', 'ISO 4217 code for style "currency"');
      if (f.style === 'unit' && (typeof f.unit !== 'string' || f.unit === '')) fail('format.unit', 'unit identifier for style "unit"');
      if (f.minimumFractionDigits !== undefined && !isFractionDigits(f.minimumFractionDigits)) fail('format.minimumFractionDigits', 'integer 0..20');
      if (f.maximumFractionDigits !== undefined && !isFractionDigits(f.maximumFractionDigits)) fail('format.maximumFractionDigits', 'integer 0..20');
      if (f.minimumFractionDigits !== undefined && f.maximumFractionDigits !== undefined && f.minimumFractionDigits > f.maximumFractionDigits) fail('format.minimumFractionDigits', 'minimumFractionDigits <= maximumFractionDigits');
    }
  }

  /** Effective step: `null` means any value (increments of 1, no grid). */
  #step(): number | null {
    const o = this.#options;
    if (o.step !== undefined) return o.step;
    return o.format?.style === 'percent' ? 0.01 : 1;
  }

  #setCommitted(value: number | null): void {
    this.#value = value;
    this.#badInput = false;
    this.#committed = { value, bad: false };
  }

  #bindEvents(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.input, 'input', () => {
      const parsed = this.#codec.parse(this.input.value);
      this.#value = parsed.value;
      this.#badInput = parsed.bad;
      this.#state.dirty = true;
      // An external error describes the previous value; editing clears it.
      this.#state.customError = null;
      this.#render(false);
      emit(this.host, 'aui-input', { value: this.#value, text: this.input.value, validity: this.#validity } satisfies NumberInputInputDetail);
    });
    g.listen(this.input, 'blur', () => {
      this.#commit();
    });
    g.listen(this.input, 'keydown', (event) => {
      this.#onKeydown(event);
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render(false);
      });
    });
  }

  #onKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const o = this.#options;
    if (event.key === 'Enter') {
      this.#commit();
      return;
    }
    if (o.readOnly || o.disabled) return;
    let next: number | null | undefined;
    switch (event.key) {
      case 'ArrowUp':
        next = this.#stepped(1);
        break;
      case 'ArrowDown':
        next = this.#stepped(-1);
        break;
      case 'PageUp':
        next = this.#stepped(10);
        break;
      case 'PageDown':
        next = this.#stepped(-10);
        break;
      case 'Home':
        if (o.min !== undefined) next = o.min;
        break;
      case 'End':
        if (o.max !== undefined) next = this.#upperBound();
        break;
    }
    // Home/End without bounds keep native caret movement.
    if (next === undefined) return;
    event.preventDefault();
    this.#userSet(next);
  }

  /** A user action that sets the value directly (keyboard or stepper): reformat and commit. */
  #userSet(value: number | null): void {
    this.#value = value;
    this.#badInput = false;
    this.#state.dirty = true;
    this.#state.customError = null;
    this.#render(true);
    // The value changed through the input, like typing: report it as input too, so bindings that
    // follow aui-input (forms layers) see keyboard and stepper changes (M9 finding).
    emit(this.host, 'aui-input', { value: this.#value, text: this.input.value, validity: this.#validity } satisfies NumberInputInputDetail);
    this.#emitChange();
  }

  /** Blur or Enter: round, reformat valid text, and report a changed value. */
  #commit(): void {
    if (!this.#badInput && this.#value !== null) this.#value = this.#codec.round(this.#value);
    this.#render(!this.#badInput);
    this.#emitChange();
  }

  #emitChange(): void {
    const c = this.#committed;
    if (Object.is(c.value, this.#value) && c.bad === this.#badInput) return;
    this.#committed = { value: this.#value, bad: this.#badInput };
    emit(this.host, 'aui-change', { value: this.#value, validity: this.#validity } satisfies NumberInputValueDetail);
  }

  /** Largest allowed value: `max`, snapped down onto the step grid. */
  #upperBound(): number {
    const max = this.#options.max ?? Number.POSITIVE_INFINITY;
    const step = this.#step();
    if (step === null || !Number.isFinite(max)) return max;
    const base = this.#options.min ?? 0;
    const decimals = Math.max(decimalPlaces(step), decimalPlaces(base));
    return fix(base + Math.floor((max - base) / step + 1e-9) * step, decimals);
  }

  /**
   * Value after `steps` increments: from empty, start at `min ?? 0`; off-grid
   * values snap to the grid in the step direction; the result is clamped to
   * [min, max] and rounded to the step's decimal places (no float drift).
   */
  #stepped(steps: number): number {
    const o = this.#options;
    const step = this.#step();
    const inc = step ?? 1;
    const base = o.min ?? 0;
    const current = this.#badInput ? null : this.#value;
    const decimals = Math.max(decimalPlaces(inc), decimalPlaces(base), step === null && current !== null ? decimalPlaces(current) : 0);
    let next: number;
    if (current === null) {
      next = base;
    } else if (step === null) {
      next = current + steps * inc;
    } else {
      const n = (current - base) / inc;
      const r = Math.round(n);
      const onGrid = Math.abs(n - r) < 1e-9 * Math.max(1, Math.abs(n));
      const k = onGrid ? r + steps : steps > 0 ? Math.ceil(n) + steps - 1 : Math.floor(n) + steps + 1;
      next = base + k * inc;
    }
    const upper = this.#upperBound();
    if (next > upper) next = upper;
    if (o.min !== undefined && next < o.min) next = o.min;
    return fix(next, decimals);
  }

  #renderSteppers(o: NumberInputOptions, show: boolean, locale: string): void {
    if (!show) {
      this.#steppers?.increment.remove();
      this.#steppers?.decrement.remove();
      this.#steppers = null;
      return;
    }
    if (!this.#steppers) {
      const make = (kind: 'increment' | 'decrement', steps: number): HTMLButtonElement => {
        const b = this.#doc.createElement('button');
        b.type = 'button';
        b.className = `aui-number-input__stepper aui-number-input__${kind}`;
        // Keyboard users step with the arrow keys; the buttons are a pointer affordance.
        b.tabIndex = -1;
        b.setAttribute('aria-controls', this.input.id);
        b.addEventListener('pointerdown', (event) => {
          // Keep focus (and the caret) in the input.
          event.preventDefault();
        });
        b.addEventListener('click', () => {
          if (this.#options.disabled || this.#options.readOnly) return;
          this.#userSet(this.#stepped(steps));
        });
        return b;
      };
      this.#steppers = { decrement: make('decrement', -1), increment: make('increment', 1), incIcon: null, decIcon: null };
      this.#control.append(this.#steppers.decrement, this.#steppers.increment);
    }
    const s = this.#steppers;
    const incIcon = o.icons?.increment ?? 'plus';
    const decIcon = o.icons?.decrement ?? 'minus';
    if (s.incIcon !== incIcon) {
      s.increment.replaceChildren(renderIcon(incIcon, { doc: this.#doc }));
      s.incIcon = incIcon;
    }
    if (s.decIcon !== decIcon) {
      s.decrement.replaceChildren(renderIcon(decIcon, { doc: this.#doc }));
      s.decIcon = decIcon;
    }
    s.increment.setAttribute('aria-label', getMessage('numberInput', 'increase', {}, locale));
    s.decrement.setAttribute('aria-label', getMessage('numberInput', 'decrease', {}, locale));
    const inactive = (o.disabled ?? false) || (o.readOnly ?? false);
    const v = this.#badInput ? null : this.#value;
    s.increment.disabled = inactive || (v !== null && o.max !== undefined && v >= this.#upperBound());
    s.decrement.disabled = inactive || (v !== null && o.min !== undefined && v <= o.min);
  }

  /** @param reformat Replace the text with the formatted value (commit, programmatic set). */
  #render(reformat: boolean): void {
    const o = this.#options;
    const config = this.#config();
    const input = this.input;
    this.#codec = this.#resolveCodec();
    const codec = this.#codec;

    if (reformat) {
      if (this.#badInput) {
        // Locale or format changed under unparseable text: re-read it in the new locale.
        const parsed = codec.parse(input.value);
        this.#value = parsed.value;
        this.#badInput = parsed.bad;
      }
      if (!this.#badInput) input.value = this.#value === null ? '' : codec.format(this.#value);
    }

    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    this.#renderSteppers(o, config.showSteppers, config.locale);
    input.placeholder = o.placeholder ?? '';
    input.disabled = o.disabled ?? false;
    input.readOnly = o.readOnly ?? false;
    input.required = o.required ?? false;
    input.inputMode = o.format?.maximumFractionDigits === 0 ? 'numeric' : 'decimal';
    const value = this.#badInput ? null : this.#value;
    if (value === null) {
      input.removeAttribute('aria-valuenow');
      input.removeAttribute('aria-valuetext');
    } else {
      input.setAttribute('aria-valuenow', String(value));
      input.setAttribute('aria-valuetext', codec.format(value));
    }
    if (o.min === undefined) input.removeAttribute('aria-valuemin');
    else input.setAttribute('aria-valuemin', String(o.min));
    if (o.max === undefined) input.removeAttribute('aria-valuemax');
    else input.setAttribute('aria-valuemax', String(o.max));

    // Only the hidden input is named, so the form submits the canonical value, not the display text.
    const form = this.formInput;
    if (o.name) form.name = o.name;
    else form.removeAttribute('name');
    form.value = value === null ? '' : String(value);
    form.disabled = o.disabled ?? false;

    const step = this.#step();
    const outcome = checkNumber(value, this.#badInput, {
      ...(o.required === undefined ? {} : { required: o.required }),
      ...(o.min === undefined ? {} : { min: o.min }),
      ...(o.max === undefined ? {} : { max: o.max }),
      step,
      stepBase: o.min ?? 0,
    });
    const custom = outcome.error === null && !this.#badInput ? runValidator(o.validate, value) : null;
    this.#validity = resolveValidity(outcome, { locale: config.locale, formatNumber: (n) => codec.format(n) }, custom, this.#state.customError);

    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    setDescribedBy(input, this.#chrome.describedBy());
    setInvalid(input, show);
    this.host.classList.toggle('aui-number-input--invalid', show);
    this.host.classList.toggle('aui-number-input--disabled', o.disabled ?? false);
  }
}

function fix(x: number, decimals: number): number {
  const n = Number(x.toFixed(Math.min(20, decimals)));
  return Object.is(n, -0) ? 0 : n;
}
