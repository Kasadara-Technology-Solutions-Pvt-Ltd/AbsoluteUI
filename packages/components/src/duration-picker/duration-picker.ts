/**
 * Duration Picker (SPEC section 18.5/section 18.7). A fixed-length `Duration` (milliseconds,
 * section 8.4) entered in unit segments (days, hours, minutes, seconds; configurable,
 * contiguous) inside a labelled group. Each segment is a spinbutton: ArrowUp and
 * ArrowDown change the total by one unit (the smallest unit moves by `step`) and
 * carry into the neighbouring units. Unit labels and value texts come from
 * `Intl.NumberFormat` unit formatting. Durations have no timezone; a day is
 * exactly 24 hours. The form value is ISO 8601 (`PT1H30M`).
 */
import {
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  duration,
  durationToString,
  emit,
  formatNumber,
  getMessage,
  registerMessages,
  type Duration,
} from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { messageFor, runValidator } from '../internal/validation.js';

export type DurationField = 'days' | 'hours' | 'minutes' | 'seconds';

const ALL_FIELDS: readonly DurationField[] = ['days', 'hours', 'minutes', 'seconds'];
const UNIT_MS: Record<DurationField, number> = { days: 86_400_000, hours: 3_600_000, minutes: 60_000, seconds: 1000 };
/** Intl.NumberFormat unit identifiers. */
const INTL_UNIT: Record<DurationField, string> = { days: 'day', hours: 'hour', minutes: 'minute', seconds: 'second' };
/** Upper bound of a segment that is not the largest unit (hours of a day, minutes of an hour; days are always the largest). */
const WRAP: Record<DurationField, number> = { days: 0, hours: 23, minutes: 59, seconds: 59 };
/** Digits of the largest segment when no `max` is set. */
const DEFAULT_DIGITS: Record<DurationField, number> = { days: 3, hours: 3, minutes: 4, seconds: 5 };

/** Contiguous, ordered, non-empty subset of days, hours, minutes, seconds. */
function isFields(v: unknown): v is readonly DurationField[] {
  if (!Array.isArray(v) || v.length === 0) return false;
  const first = ALL_FIELDS.indexOf(v[0] as DurationField);
  return first >= 0 && v.every((f, i) => ALL_FIELDS[first + i] === f);
}

export interface DurationPickerConfig {
  validationTiming: ValidationTiming;
  /** Unit segments, largest first; contiguous (for example `['hours', 'minutes']`). */
  fields: readonly DurationField[];
}

type Inherited = 'locale' | 'direction';
type Resolved = Readonly<DurationPickerConfig & { locale: string; direction: 'ltr' | 'rtl' }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    durationPicker: DurationPickerConfig & { locale: string; direction: 'ltr' | 'rtl' };
  }
}

export const durationPickerConfig = defineComponentConfig<DurationPickerConfig, Inherited>(
  'durationPicker',
  {
    validationTiming: validationTimingSpec,
    fields: { default: ['hours', 'minutes'], expected: 'contiguous array of "days" | "hours" | "minutes" | "seconds", largest first', validate: isFields },
  },
  ['locale', 'direction'],
);

registerMessages('durationPicker', 'en', {
  days: 'Days',
  hours: 'Hours',
  minutes: 'Minutes',
  seconds: 'Seconds',
  invalid: 'Enter a valid duration.',
  rangeUnderflow: 'Enter a duration of {min} or more.',
  rangeOverflow: 'Enter a duration of {max} or less.',
  stepMismatch: 'Enter a duration in steps of {step}.',
});

export type DurationPickerError =
  /** A segment is out of range (for example 75 minutes). */
  | 'invalid'
  | 'value-missing'
  | 'range-underflow'
  | 'range-overflow'
  | 'step-mismatch'
  /** From the `validate` callback or `setCustomError`. */
  | 'custom';

export interface DurationPickerValidity {
  readonly valid: boolean;
  readonly error: DurationPickerError | null;
  /** Localized message for `error`; empty when valid. */
  readonly message: string;
}

export interface DurationPickerChangeDetail {
  value: Duration | null;
  validity: DurationPickerValidity;
}

export interface DurationPickerIcons {
  error: IconRef;
}

export interface DurationPickerOptions extends Partial<DurationPickerConfig> {
  /** Visible label (required accessible name for the group). */
  label: string;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  /** Non-negative, and a whole number of the smallest unit in `fields`. */
  value?: Duration | null;
  /** Inclusive lower bound (validation and stepping). Default: zero. */
  min?: Duration | null;
  /** Inclusive upper bound (validation, stepping, and the digits of the largest segment). */
  max?: Duration | null;
  /**
   * Increment of the smallest segment and the valid-value grid (from zero). Default: one
   * of the smallest unit. A whole number of the smallest unit.
   */
  step?: Duration;
  /** Form field name; a hidden input carries the ISO 8601 duration. */
  name?: string;
  /** Help text, referenced by aria-describedby (text only). */
  description?: string;
  required?: boolean;
  disabled?: boolean;
  /** Focusable and submitted, but not editable. */
  readOnly?: boolean;
  /** Consumer validation; return a message to mark the value invalid. */
  validate?: (value: Duration | null) => string | null;
  locale?: string;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<DurationPickerIcons>;
}

interface Segment {
  readonly field: DurationField;
  readonly input: HTMLInputElement;
  readonly unit: HTMLSpanElement;
  readonly maxLength: number;
}

interface UnitParts {
  readonly text: string;
  readonly before: boolean;
}

/** Unit texts per locale and unit (Intl formatter construction is the main creation cost). */
const unitPartsCache = new Map<string, UnitParts>();

const VALID: DurationPickerValidity = Object.freeze({ valid: true, error: null, message: '' });
const isDuration = (v: unknown): v is Duration => typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'Duration' && 'milliseconds' in v && typeof v.milliseconds === 'number';

export class DurationPicker implements FormControl {
  readonly host: HTMLElement;
  /** The labelled `role="group"` with one spinbutton segment per unit. */
  readonly group: HTMLDivElement;
  #options: DurationPickerOptions;
  #value: Duration | null = null;
  #initialValue: Duration | null;
  #validity: DurationPickerValidity = VALID;
  #segments: Segment[] = [];
  #structureKey = '';
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #hidden: HTMLInputElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render a duration picker into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: DurationPickerOptions): DurationPicker {
    return new DurationPicker(host, options);
  }

  private constructor(host: HTMLElement, options: DurationPickerOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#initialValue = options.value ?? null;
    const doc = this.#doc;

    // A <label> cannot name a group; it is associated through aria-labelledby.
    this.#chrome = new FieldChrome(doc, 'label', 'aui-duration-picker');
    this.group = doc.createElement('div');
    this.group.className = 'aui-duration-picker__group';
    this.group.setAttribute('role', 'group');
    this.group.setAttribute('aria-labelledby', this.#chrome.label.id);
    this.#hidden = doc.createElement('input');
    this.#hidden.type = 'hidden';

    host.classList.add('aui-field', 'aui-duration-picker');
    host.replaceChildren(this.#chrome.label, this.group, this.#chrome.description, this.#chrome.error, this.#hidden);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#writeValue(this.#initialValue);
    this.#recompute(false);
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(durationPickerConfig.subscribe(() => {
      this.#render();
      this.#recompute(false);
    }));
  }

  get value(): Duration | null {
    return this.#value;
  }

  get validity(): DurationPickerValidity {
    return this.#validity;
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

  get dirty(): boolean {
    return !this.#same(this.#value, this.#initialValue) || (this.#value === null && this.#segments.some((s) => s.input.value !== ''));
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<DurationPickerOptions> {
    return this.#options;
  }

  /** ISO 8601 duration in hours, minutes, and seconds (`PT1H30M`), or null when empty or invalid. */
  getFormValue(): string | null {
    return this.#value === null ? null : durationToString(this.#value);
  }

  /** Set the value programmatically (no events). Clears an external custom error. */
  setValue(value: Duration | null): void {
    this.#assertValue(value, 'value', this.#config().fields);
    this.#state.customError = null;
    this.#writeValue(value);
    this.#recompute(false);
  }

  update(options: Partial<DurationPickerOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    const current = this.#value;
    this.#options = next;
    // Render first: a fields or locale change rebuilds the segments from the current value.
    this.#render();
    if ('value' in options) this.#writeValue(options.value ?? null);
    else if (current !== null) this.#writeValue(current);
    this.#recompute(false);
  }

  reportValidity(): boolean {
    this.#state.submitted = true;
    this.#renderMessages();
    return this.#validity.valid;
  }

  setCustomError(message: string | null): void {
    this.#state.customError = message === '' ? null : message;
    this.#recompute(false);
  }

  /** Focus the first (largest) segment. */
  focus(): void {
    this.#segments[0]?.input.focus();
  }

  /** Restore the initial value and clear dirty/touched/submitted state (no events). */
  reset(): void {
    this.#state.reset();
    this.#writeValue(this.#initialValue);
    this.#recompute(false);
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-duration-picker', 'aui-duration-picker--invalid', 'aui-duration-picker--disabled', 'aui-duration-picker--readonly');
  }

  #config(options: DurationPickerOptions = this.#options): Resolved {
    const o = options;
    return durationPickerConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.fields === undefined ? {} : { fields: o.fields }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #fail(property: string, expected: string): never {
    throw configurationError('DURATION_PICKER_OPTIONS', 'Invalid duration picker options.', { component: 'durationPicker', property: `durationPicker.${property}`, expected });
  }

  /** A non-negative Duration that is a whole number of the smallest unit. */
  #assertValue(value: unknown, property: string, fields: readonly DurationField[]): void {
    if (value === null || value === undefined) return;
    const unit = UNIT_MS[this.#smallest(fields)];
    if (!isDuration(value) || !Number.isSafeInteger(value.milliseconds) || value.milliseconds < 0 || value.milliseconds % unit !== 0) {
      this.#fail(property, `non-negative Duration in whole ${this.#smallest(fields)}, or null`);
    }
  }

  #assertOptions(options: DurationPickerOptions): void {
    if (typeof options.label !== 'string' || options.label.trim() === '') this.#fail('label', 'non-empty string (accessible name)');
    // Validates config-backed options (validationTiming, fields, locale, direction).
    const { fields } = this.#config(options);
    this.#assertValue(options.value, 'value', fields);
    for (const key of ['min', 'max'] as const) {
      const v: unknown = options[key];
      if (v !== undefined && v !== null && (!isDuration(v) || !(v.milliseconds >= 0))) this.#fail(key, 'non-negative Duration or null');
    }
    if (options.min && options.max && options.min.milliseconds > options.max.milliseconds) this.#fail('min', 'min <= max');
    if (options.step !== undefined) {
      const unit = UNIT_MS[this.#smallest(fields)];
      const step: unknown = options.step;
      if (!isDuration(step) || !(step.milliseconds > 0) || step.milliseconds % unit !== 0) this.#fail('step', `positive Duration in whole ${this.#smallest(fields)}`);
    }
    if (options.validate !== undefined && typeof options.validate !== 'function') this.#fail('validate', '(value: Duration | null) => string | null');
  }

  #smallest(fields: readonly DurationField[]): DurationField {
    return fields[fields.length - 1] ?? 'minutes';
  }

  #step(): number {
    return this.#options.step?.milliseconds ?? UNIT_MS[this.#smallest(this.#config().fields)];
  }

  /** Largest enterable number: 23/59 for smaller units, the digit limit for the largest. */
  #limit(segment: Segment): number {
    return segment === this.#segments[0] ? 10 ** segment.maxLength - 1 : WRAP[segment.field];
  }

  /** Spinbutton maximum (aria-valuemax, End): the largest unit is also bounded by `max`. */
  #range(segment: Segment): number {
    const max = this.#options.max;
    if (segment !== this.#segments[0] || !max) return this.#limit(segment);
    return Math.floor(max.milliseconds / UNIT_MS[segment.field]);
  }

  /** Short unit text shown next to a segment, and whether it precedes the number in this locale. */
  #unitParts(field: DurationField, locale: string): UnitParts {
    const key = `${locale}|${field}`;
    const cached = unitPartsCache.get(key);
    if (cached) return cached;
    const parts = new Intl.NumberFormat(locale, { style: 'unit', unit: INTL_UNIT[field], unitDisplay: 'short' }).formatToParts(0);
    const unitIndex = parts.findIndex((p) => p.type === 'unit');
    const numberIndex = parts.findIndex((p) => p.type === 'integer');
    const result: UnitParts = Object.freeze({ text: parts[unitIndex]?.value ?? field, before: unitIndex >= 0 && unitIndex < numberIndex });
    unitPartsCache.set(key, result);
    return result;
  }

  /** Localized duration text, for messages: `1 hr, 30 min`. */
  #format(ms: number, config: Resolved): string {
    const units = [...config.fields];
    if (ms % UNIT_MS[this.#smallest(units)] !== 0 && !units.includes('seconds')) units.push('seconds');
    let rest = ms;
    const parts: string[] = [];
    units.forEach((field, i) => {
      const n = Math.floor(rest / UNIT_MS[field]);
      rest -= n * UNIT_MS[field];
      if (n > 0 || (parts.length === 0 && i === units.length - 1)) parts.push(formatNumber(n, { style: 'unit', unit: INTL_UNIT[field], unitDisplay: 'short' }, config.locale));
    });
    return new Intl.ListFormat(config.locale, { type: 'unit', style: 'short' }).format(parts);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const key = `${config.locale}|${config.fields.join()}|${String(o.max?.milliseconds ?? '')}`;
    if (key !== this.#structureKey) {
      this.#buildSegments(config);
      this.#structureKey = key;
    }
    const disabled = o.disabled ?? false;
    const readOnly = o.readOnly ?? false;
    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    this.group.dir = config.direction;
    for (const s of this.#segments) {
      s.input.disabled = disabled;
      s.input.readOnly = readOnly;
      s.input.required = o.required ?? false;
      s.input.setAttribute('aria-valuemin', '0');
      s.input.setAttribute('aria-valuemax', String(this.#range(s)));
    }
    if (o.name) this.#hidden.name = o.name;
    else this.#hidden.removeAttribute('name');
    // Like native controls, a disabled picker is not submitted.
    this.#hidden.disabled = disabled;
    this.host.classList.toggle('aui-duration-picker--disabled', disabled);
    // The group's disabled state is announced (its segments are disabled inputs, its unit labels text).
    if (disabled) this.group.setAttribute('aria-disabled', 'true');
    else this.group.removeAttribute('aria-disabled');
    this.host.classList.toggle('aui-duration-picker--readonly', readOnly && !disabled);
  }

  #buildSegments(config: Resolved): void {
    const doc = this.#doc;
    const focused = this.#segments.find((s) => s.input === doc.activeElement)?.field;
    const nodes: Node[] = [];
    this.#segments = [];
    config.fields.forEach((field, i) => {
      const wrap = doc.createElement('span');
      wrap.className = `aui-duration-picker__unit aui-duration-picker__unit--${field}`;
      const input = doc.createElement('input');
      input.type = 'text';
      input.className = `aui-duration-picker__segment aui-duration-picker__segment--${field}`;
      input.setAttribute('role', 'spinbutton');
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.id = createId('aui-duration-picker-segment');
      const max = this.#options.max;
      const maxLength = i === 0 ? (max ? Math.max(1, String(Math.floor(max.milliseconds / UNIT_MS[field])).length) : DEFAULT_DIGITS[field]) : 2;
      input.maxLength = maxLength;
      input.size = Math.max(2, maxLength);
      input.placeholder = '0'.repeat(i === 0 ? 1 : 2);
      input.setAttribute('aria-label', getMessage('durationPicker', field, {}, config.locale));
      // Visible unit text; the spinbutton's name and aria-valuetext already carry the unit.
      const unit = doc.createElement('span');
      unit.className = 'aui-duration-picker__unit-label';
      unit.setAttribute('aria-hidden', 'true');
      const { text, before } = this.#unitParts(field, config.locale);
      unit.textContent = text;
      wrap.append(...(before ? [unit, input] : [input, unit]));
      this.#segments.push({ field, input, unit, maxLength });
      nodes.push(wrap);
    });
    this.group.replaceChildren(...nodes);
    // A locale or fields change (also from global configuration) keeps the value (regression).
    if (this.#value !== null) this.#writeValue(this.#value);
    if (focused) this.#segments.find((s) => s.field === focused)?.input.focus();
  }

  #bindEvents(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.group, 'keydown', (event) => {
      const segment = this.#segmentFor(event.target);
      if (segment) this.#onKeyDown(segment, event);
    });
    g.listen(this.group, 'input', (event) => {
      const segment = this.#segmentFor(event.target);
      if (segment) this.#onInput(segment);
    });
    g.listen(this.group, 'focusin', (event) => {
      this.#segmentFor(event.target)?.input.select();
    });
    // A <label> without `for` does not focus a group; do it explicitly.
    g.listen(this.#chrome.label, 'click', () => {
      if (!this.#options.disabled) this.focus();
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      // Leaving the field completes partly filled input (empty units become 0).
      if (this.#value !== null && this.#segments.some((s) => s.input.value === '')) this.#writeValue(this.#value);
      // Deferred while a pointer is pressed, so a message does not shift the pending click target.
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#renderMessages();
      });
    });
  }

  #segmentFor(target: EventTarget | null): Segment | undefined {
    return this.#segments.find((s) => s.input === target);
  }

  #onInput(segment: Segment): void {
    const { input, maxLength } = segment;
    const digits = input.value.replace(/\D/g, '').slice(0, maxLength);
    input.value = digits;
    // Bounded units are complete at two digits, or when no second digit fits (7 minutes).
    const bounded = segment !== this.#segments[0];
    const complete = digits.length >= maxLength || (bounded && digits.length === 1 && Number(digits) * 10 > WRAP[segment.field]);
    if (complete) {
      if (bounded && digits.length === 1) input.value = digits.padStart(2, '0');
      this.#focusSibling(segment, 1);
    }
    this.#onUserEdit();
  }

  #focusSibling(segment: Segment, delta: 1 | -1): void {
    const next = this.#segments[this.#segments.indexOf(segment) + delta];
    if (next) {
      next.input.focus();
      next.input.select();
    }
  }

  #onKeyDown(segment: Segment, event: KeyboardEvent): void {
    const o = this.#options;
    const { input } = segment;
    if (o.disabled) return;
    const rtl = this.#config().direction === 'rtl';
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown':
        if (o.readOnly) return;
        event.preventDefault();
        this.#stepBy(segment, event.key === 'ArrowUp' ? 1 : -1);
        this.#onUserEdit();
        return;
      case 'Home':
      case 'End': {
        if (o.readOnly) return;
        event.preventDefault();
        const max = this.#range(segment);
        input.value = this.#pad(segment, event.key === 'Home' ? 0 : max);
        input.select();
        this.#onUserEdit();
        return;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        // Units follow the reading direction.
        const forward = (event.key === 'ArrowRight') !== rtl;
        const atEdge = forward ? input.selectionEnd === input.value.length : input.selectionStart === 0;
        if (atEdge || input.selectionStart !== input.selectionEnd) {
          event.preventDefault();
          this.#focusSibling(segment, forward ? 1 : -1);
        }
        return;
      }
      case 'Backspace':
        if (input.value === '') {
          event.preventDefault();
          this.#focusSibling(segment, -1);
        }
        return;
      default:
        // Typing a separator advances to the next unit.
        if ([':', '.', ',', ' '].includes(event.key) && !o.readOnly) {
          event.preventDefault();
          if (segment !== this.#segments[0] && input.value.length === 1) input.value = input.value.padStart(2, '0');
          this.#focusSibling(segment, 1);
          this.#onUserEdit();
        }
    }
  }

  /**
   * Change the total by one unit of the segment (the smallest by `step`, snapped to
   * the step grid), carrying into the other units, within [min, max].
   */
  #stepBy(segment: Segment, delta: 1 | -1): void {
    const o = this.#options;
    const smallest = segment === this.#segments[this.#segments.length - 1];
    const amount = smallest ? this.#step() : UNIT_MS[segment.field];
    const current = this.#total() ?? 0;
    let next: number;
    if (smallest) {
      const snapped = delta > 0 ? Math.ceil(current / amount) * amount : Math.floor(current / amount) * amount;
      next = snapped === current ? current + delta * amount : snapped;
    } else next = current + delta * amount;
    const lo = o.min?.milliseconds ?? 0;
    // Without max, the digits of the largest segment are the limit.
    const largest = this.#segments[0];
    const hi = o.max?.milliseconds ?? (largest ? UNIT_MS[largest.field] * 10 ** largest.maxLength - 1 : Infinity);
    next = Math.min(hi, Math.max(lo, next));
    this.#writeValue(duration(next - (next % UNIT_MS[this.#smallest(this.#config().fields)])));
    segment.input.select();
  }

  #pad(segment: Segment, n: number): string {
    return segment === this.#segments[0] ? String(n) : String(n).padStart(2, '0');
  }

  #onUserEdit(): void {
    this.#state.dirty = true;
    this.#recompute(true);
  }

  #writeValue(value: Duration | null): void {
    if (value === null) {
      for (const s of this.#segments) s.input.value = '';
      return;
    }
    let rest = value.milliseconds;
    for (const s of this.#segments) {
      const n = Math.floor(rest / UNIT_MS[s.field]);
      rest -= n * UNIT_MS[s.field];
      s.input.value = this.#pad(s, n);
    }
  }

  /** Total of the segments (empty units count as 0), null when all are empty or one is out of range. */
  #total(): number | null {
    if (this.#segments.every((s) => s.input.value === '')) return null;
    let total = 0;
    for (const s of this.#segments) {
      const n = s.input.value === '' ? 0 : /^\d+$/.test(s.input.value) ? Number(s.input.value) : NaN;
      // The largest unit has no upper bound here: a programmatic value beyond its digits (or max) is a range error.
      if (!(n >= 0 && (s === this.#segments[0] || n <= WRAP[s.field]))) return null;
      total += n * UNIT_MS[s.field];
    }
    return total;
  }

  /** Parse segments into a value and validity; emit when changed by the user. */
  #recompute(fromUser: boolean): void {
    const config = this.#config();
    const o = this.#options;
    const locale = config.locale;
    // An external error describes the previous value; user edits clear it.
    if (fromUser) this.#state.customError = null;
    const empty = this.#segments.every((s) => s.input.value === '');
    const total = this.#total();
    let error: DurationPickerError | null = null;
    let message = '';
    if (empty) {
      if (o.required) {
        error = 'value-missing';
        message = messageFor({ error: 'value-missing', params: {} }, { locale });
      }
    } else if (total === null) {
      error = 'invalid';
      message = getMessage('durationPicker', 'invalid', {}, locale);
    } else if (o.min && total < o.min.milliseconds) {
      error = 'range-underflow';
      message = getMessage('durationPicker', 'rangeUnderflow', { min: this.#format(o.min.milliseconds, config) }, locale);
    } else if (o.max && total > o.max.milliseconds) {
      error = 'range-overflow';
      message = getMessage('durationPicker', 'rangeOverflow', { max: this.#format(o.max.milliseconds, config) }, locale);
    } else if (total % this.#step() !== 0) {
      error = 'step-mismatch';
      message = getMessage('durationPicker', 'stepMismatch', { step: this.#format(this.#step(), config) }, locale);
    }
    const value = error === null && total !== null ? duration(total) : null;
    // Precedence: built-in constraint, then `validate`, then an external custom error.
    if (error === null) {
      const custom = runValidator(o.validate, value) ?? this.#state.customError;
      if (custom !== null) {
        error = 'custom';
        message = custom;
      }
    }
    // A custom error keeps the parsed value (as in Date Input and Time Picker).
    const reported = value;
    const validity: DurationPickerValidity = error === null ? VALID : Object.freeze({ valid: false, error, message });
    const changed = !this.#same(reported, this.#value) || validity.error !== this.#validity.error;
    this.#value = reported;
    this.#validity = validity;
    this.#hidden.value = reported === null ? '' : durationToString(reported);
    this.#renderValueText(config);
    this.#renderMessages();
    if (fromUser && changed) emit(this.host, 'aui-change', { value: reported, validity } satisfies DurationPickerChangeDetail);
  }

  /** Spinbutton value and localized value text ("30 minutes"). */
  #renderValueText(config: Resolved): void {
    for (const s of this.#segments) {
      const n = /^\d+$/.test(s.input.value) ? Number(s.input.value) : null;
      if (n === null) {
        s.input.removeAttribute('aria-valuenow');
        s.input.removeAttribute('aria-valuetext');
        continue;
      }
      s.input.setAttribute('aria-valuenow', String(n));
      s.input.setAttribute('aria-valuetext', formatNumber(n, { style: 'unit', unit: INTL_UNIT[s.field], unitDisplay: 'long' }, config.locale));
    }
  }

  #same(a: Duration | null, b: Duration | null): boolean {
    if (a === null || b === null) return a === b;
    return a.milliseconds === b.milliseconds;
  }

  #renderMessages(): void {
    const config = this.#config();
    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', this.#options.icons?.error ?? 'alert-circle');
    setDescribedBy(this.group, this.#chrome.describedBy());
    for (const s of this.#segments) setInvalid(s.input, show);
    this.host.classList.toggle('aui-duration-picker--invalid', show);
  }
}
