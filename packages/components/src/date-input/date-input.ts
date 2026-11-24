/**
 * Date Input (SPEC section 18.5/section 18.7, R0 reference component).
 * Locale-ordered numeric segments inside a labelled group. Values are explicit
 * types (section 8.4): `PlainDate` for date granularity, `Instant` for minute granularity.
 * Minute granularity resolves wall-clock input in the configured timezone (UTC by
 * default, section 8.1) using the documented DST disambiguation policy (section 8.5) and tells
 * the user when a daylight-saving rule adjusted or rejected their input.
 */
import {
  AbsoluteUIError,
  comparePlainDate,
  configurationError,
  createId,
  daysInMonth,
  defineComponentConfig,
  DisposableGroup,
  emit,
  formatInstant,
  formatPlainDate,
  formatTimeZoneName,
  getLocalTimeStatus,
  getMessage,
  instantToString,
  plainDate,
  plainDateTime,
  plainDateToString,
  plainTime,
  registerMessages,
  toInstant,
  toPlainDateTime,
  validators,
  type Disambiguation,
  type Instant,
  type LocalTimeStatus,
  type PlainDate,
  type PlainDateTime,
} from '@absoluteui/core';
import { FieldState, markTouched, observePointer, registerControl, renderError, renderLabel, type FormControl } from '../internal/field.js';

/** Replace aria-describedby with exactly the given ids (removed when empty). */
function setDescribedBy(el: Element, ids: readonly string[]): void {
  if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
  else el.removeAttribute('aria-describedby');
}

export type DateInputGranularity = 'date' | 'minute';
export type HourCycle = 'auto' | 'h12' | 'h23';

export interface DateInputConfig {
  granularity: DateInputGranularity;
  hourCycle: HourCycle;
}

type Inherited = 'locale' | 'timezone' | 'disambiguation' | 'direction';

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    dateInput: DateInputConfig & { locale: string; timezone: string; disambiguation: Disambiguation; direction: 'ltr' | 'rtl' };
  }
}

export const dateInputConfig = defineComponentConfig<DateInputConfig, Inherited>(
  'dateInput',
  {
    granularity: { default: 'date', expected: '"date" | "minute"', validate: validators.oneOf(['date', 'minute'] as const), mutability: 'init-only' },
    hourCycle: { default: 'auto', expected: '"auto" | "h12" | "h23"', validate: validators.oneOf(['auto', 'h12', 'h23'] as const) },
  },
  ['locale', 'timezone', 'disambiguation', 'direction'],
);

registerMessages('dateInput', 'en', {
  year: 'Year',
  month: 'Month',
  day: 'Day',
  hour: 'Hour',
  minute: 'Minute',
  dayPeriod: 'AM/PM',
  placeholderYear: 'yyyy',
  placeholderMonth: 'mm',
  placeholderDay: 'dd',
  placeholderHour: 'hh',
  placeholderMinute: 'mm',
  placeholderDayPeriod: '--',
  timeZoneHint: 'Time zone: {timeZone}',
  incomplete: 'Enter a complete date.',
  invalidDate: 'Enter a valid date.',
  valueMissing: 'This field is required.',
  rangeUnderflow: 'Enter a value on or after {min}.',
  rangeOverflow: 'Enter a value on or before {max}.',
  nonexistentTime: 'This time does not exist in {timeZone} because of a daylight-saving change.',
  ambiguousTime: 'This time occurs twice in {timeZone} because of a daylight-saving change. Choose a different time.',
  adjustedTime: 'Adjusted to {time} because of a daylight-saving change.',
  ambiguousResolved: 'This time occurs twice; the {which} occurrence ({offset}) is used.',
  earlier: 'earlier',
  later: 'later',
});

export type DateInputValue = PlainDate | Instant;

export type DateInputError =
  | 'incomplete'
  | 'invalid-date'
  | 'value-missing'
  | 'range-underflow'
  | 'range-overflow'
  | 'nonexistent-time'
  | 'ambiguous-time'
  /** External error set through `setCustomError` (for example by a form rule or the server). */
  | 'custom';

export interface DateInputValidity {
  readonly valid: boolean;
  readonly error: DateInputError | null;
  /** Localized message for `error`; empty when valid. */
  readonly message: string;
  /** DST status of the entered wall-clock time (minute granularity only). */
  readonly localTimeStatus: LocalTimeStatus | null;
}

export interface DateInputChangeDetail {
  value: DateInputValue | null;
  validity: DateInputValidity;
}

export interface DateInputOptions extends Partial<DateInputConfig> {
  /** Visible label (required accessible name for the group). */
  label: string;
  value?: DateInputValue | null;
  min?: DateInputValue | null;
  max?: DateInputValue | null;
  name?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  locale?: string;
  timezone?: string;
  disambiguation?: Disambiguation;
  direction?: 'ltr' | 'rtl';
  /**
   * Advanced: element appended inside the group boundary after the segments, for
   * example a calendar button. Focus moving into it does not mark the field touched.
   */
  trailing?: HTMLElement;
  /**
   * Advanced, read at creation: set to false when a composite control (such as
   * Date Picker) registers itself with `Form` instead of this Date Input. Default true.
   */
  formControl?: boolean;
}

type SegmentType = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'dayPeriod';

interface Segment {
  readonly type: SegmentType;
  readonly input: HTMLInputElement;
  readonly maxLength: number;
}

const SEGMENT_MESSAGE: Record<SegmentType, string> = { year: 'year', month: 'month', day: 'day', hour: 'hour', minute: 'minute', dayPeriod: 'dayPeriod' };
const PLACEHOLDER_MESSAGE: Record<SegmentType, string> = {
  year: 'placeholderYear',
  month: 'placeholderMonth',
  day: 'placeholderDay',
  hour: 'placeholderHour',
  minute: 'placeholderMinute',
  dayPeriod: 'placeholderDayPeriod',
};

type Resolved = Readonly<DateInputConfig & { locale: string; timezone: string; disambiguation: Disambiguation; direction: 'ltr' | 'rtl' }>;

export class DateInput implements FormControl {
  readonly host: HTMLElement;
  readonly group: HTMLDivElement;
  #options: DateInputOptions;
  #segments: Segment[] = [];
  #value: DateInputValue | null = null;
  #validity: DateInputValidity = { valid: true, error: null, message: '', localTimeStatus: null };
  #initialValue: DateInputValue | null = null;
  readonly #state = new FieldState();
  #dayPeriods: { am: string; pm: string } = { am: 'AM', pm: 'PM' };
  readonly #granularity: DateInputGranularity;
  readonly #doc: Document;
  readonly #label: HTMLDivElement;
  readonly #fields: HTMLDivElement;
  readonly #descriptionEl: HTMLDivElement;
  readonly #hintEl: HTMLDivElement;
  readonly #errorEl: HTMLDivElement;
  readonly #hidden: HTMLInputElement;
  #trailing: HTMLElement | null = null;
  readonly #group = new DisposableGroup();

  static create(host: HTMLElement, options: DateInputOptions): DateInput {
    return new DateInput(host, options);
  }

  private constructor(host: HTMLElement, options: DateInputOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#granularity = this.#config().granularity;
    const doc = this.#doc;

    this.#label = doc.createElement('div');
    this.#label.className = 'aui-date-input__label';
    this.#label.id = createId('aui-date-input-label');

    this.group = doc.createElement('div');
    this.group.className = 'aui-date-input__group';
    this.group.setAttribute('role', 'group');
    this.group.setAttribute('aria-labelledby', this.#label.id);

    this.#fields = doc.createElement('div');
    this.#fields.className = 'aui-date-input__fields';
    this.group.append(this.#fields);
    this.#setTrailing(options.trailing ?? null);

    this.#descriptionEl = doc.createElement('div');
    this.#descriptionEl.className = 'aui-date-input__description';
    this.#descriptionEl.id = createId('aui-date-input-desc');
    this.#hintEl = doc.createElement('div');
    this.#hintEl.className = 'aui-date-input__hint';
    this.#hintEl.id = createId('aui-date-input-hint');
    this.#errorEl = doc.createElement('div');
    this.#errorEl.className = 'aui-date-input__error';
    this.#errorEl.id = createId('aui-date-input-error');
    this.#hidden = doc.createElement('input');
    this.#hidden.type = 'hidden';

    host.classList.add('aui-date-input');
    host.replaceChildren(this.#label, this.group, this.#descriptionEl, this.#hintEl, this.#errorEl, this.#hidden);

    // Build first: invalid options throw before listeners/subscriptions are attached.
    this.#build();
    this.#writeValue(options.value ?? null);
    this.#initialValue = options.value ?? null;
    this.#group.listen(this.group, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.group.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#renderMessages();
      });
    });
    observePointer(this.#doc);
    if (options.formControl !== false) this.#group.add(registerControl(this));
    this.#group.add(dateInputConfig.subscribe(() => {
      this.#build();
    }));
    this.#recompute(false);
  }

  get value(): DateInputValue | null {
    return this.#value;
  }

  get validity(): DateInputValidity {
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
    return !this.#sameValue(this.#value, this.#initialValue) || (this.#value === null && this.#segments.some((s) => s.input.value !== ''));
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  /** ISO 8601 string (`YYYY-MM-DD` or an instant with `Z`), or null when empty or invalid. */
  getFormValue(): string | null {
    const v = this.#value;
    if (v === null) return null;
    return v.kind === 'PlainDate' ? plainDateToString(v) : instantToString(v);
  }

  setCustomError(message: string | null): void {
    this.#state.customError = message === '' ? null : message;
    this.#recompute(false);
  }

  focus(): void {
    this.#segments[0]?.input.focus();
  }

  /** Restore the initial value and clear touched/submitted state (no `aui-change`). */
  reset(): void {
    this.#state.reset();
    this.#writeValue(this.#initialValue);
    this.#recompute(false);
  }

  /** Set the value programmatically (no `aui-change` event). */
  setValue(value: DateInputValue | null): void {
    this.#assertValueKind(value, 'value');
    this.#writeValue(value);
    this.#recompute(false);
  }

  /**
   * Minute granularity: the complete wall-clock date and time shown in the segments,
   * even when the timezone rejects it (for example a time in a DST gap); else null.
   */
  get localValue(): PlainDateTime | null {
    if (this.#granularity !== 'minute' || this.#segments.some((s) => s.input.value === '')) return null;
    try {
      let hour = Number(this.#get('hour'));
      if (this.#segments.some((s) => s.type === 'dayPeriod')) hour = (hour % 12) + (this.#get('dayPeriod') === this.#dayPeriods.pm ? 12 : 0);
      return plainDateTime(plainDate(Number(this.#get('year')), Number(this.#get('month')), Number(this.#get('day'))), plainTime(hour, Number(this.#get('minute'))));
    } catch (e) {
      if (e instanceof AbsoluteUIError) return null;
      throw e;
    }
  }

  /**
   * Minute granularity: write a wall-clock date and time (no `aui-change` event). It is
   * resolved exactly as if typed: in the configured timezone with the `disambiguation`
   * policy, including the DST hint or the nonexistent/ambiguous-time error.
   */
  setLocalValue(value: PlainDateTime | null): void {
    // Runtime check for untyped callers.
    const kind: unknown = value === null ? null : value.kind;
    if (this.#granularity !== 'minute' || (kind !== null && kind !== 'PlainDateTime')) {
      throw configurationError('DATE_INPUT_VALUE_KIND', 'Value type does not match granularity.', { component: 'dateInput', property: 'dateInput.localValue', expected: 'PlainDateTime (minute granularity)' });
    }
    if (value === null) this.#writeValue(null);
    else this.#writeLocal(value);
    this.#recompute(false);
  }

  update(options: Partial<DateInputOptions>): void {
    dateInputConfig.assertUpdatable(this.#options, options);
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    const current = this.#value;
    this.#options = next;
    if ('trailing' in options) this.#setTrailing(options.trailing ?? null);
    this.#build();
    this.#writeValue('value' in options ? (options.value ?? null) : current);
    this.#recompute(false);
  }

  /** Show validation messages immediately (e.g. on form submit). Returns validity. */
  reportValidity(): boolean {
    this.#state.submitted = true;
    this.#renderMessages();
    return this.#validity.valid;
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-date-input');
  }

  #config(): Resolved {
    const o = this.#options;
    return dateInputConfig.resolve({
      ...(o.granularity === undefined ? {} : { granularity: o.granularity }),
      ...(o.hourCycle === undefined ? {} : { hourCycle: o.hourCycle }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.timezone === undefined ? {} : { timezone: o.timezone }),
      ...(o.disambiguation === undefined ? {} : { disambiguation: o.disambiguation }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #assertValueKind(value: DateInputValue | null | undefined, property: string, options: DateInputOptions = this.#options): void {
    if (value === null || value === undefined) return;
    const granularity = options.granularity ?? dateInputConfig.resolve().granularity;
    const expected = granularity === 'date' ? 'PlainDate' : 'Instant';
    if (value.kind !== expected) {
      throw configurationError('DATE_INPUT_VALUE_KIND', 'Value type does not match granularity.', { component: 'dateInput', property: `dateInput.${property}`, expected });
    }
  }

  #assertOptions(options: DateInputOptions): void {
    if (typeof options.label !== 'string' || options.label.trim() === '') {
      throw configurationError('DATE_INPUT_LABEL', 'Date input requires a non-empty label.', { component: 'dateInput', property: 'dateInput.label', expected: 'non-empty string' });
    }
    if (options.trailing !== undefined && !(options.trailing instanceof HTMLElement)) {
      throw configurationError('DATE_INPUT_TRAILING', 'Trailing content must be an element.', { component: 'dateInput', property: 'dateInput.trailing', expected: 'HTMLElement' });
    }
    this.#assertValueKind(options.value, 'value', options);
    this.#assertValueKind(options.min, 'min', options);
    this.#assertValueKind(options.max, 'max', options);
  }

  #setTrailing(el: HTMLElement | null): void {
    if (el === this.#trailing) return;
    this.#trailing?.remove();
    this.#trailing = el;
    if (el) this.group.append(el);
  }

  #hour12(config: Resolved): boolean {
    if (config.hourCycle !== 'auto') return config.hourCycle === 'h12';
    const cycle = new Intl.DateTimeFormat(config.locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return cycle === 'h11' || cycle === 'h12';
  }

  /** Build segments in locale order from Intl formatToParts. */
  #build(): void {
    const config = this.#config();
    const doc = this.#doc;
    const o = this.#options;
    const hour12 = this.#hour12(config);
    const previous = new Map(this.#segments.map((s) => [s.type, s.input.value] as const));

    const fmt = new Intl.DateTimeFormat(config.locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(this.#granularity === 'minute' ? { hour: '2-digit', minute: '2-digit', hourCycle: hour12 ? 'h12' : 'h23' } : {}),
      timeZone: 'UTC',
    });
    const parts = fmt.formatToParts(Date.UTC(2026, 10, 23, 13, 45));
    const am = new Intl.DateTimeFormat(config.locale, { hour: 'numeric', hourCycle: 'h12', timeZone: 'UTC' }).formatToParts(Date.UTC(2026, 0, 1, 1)).find((p) => p.type === 'dayPeriod')?.value;
    const pm = new Intl.DateTimeFormat(config.locale, { hour: 'numeric', hourCycle: 'h12', timeZone: 'UTC' }).formatToParts(Date.UTC(2026, 0, 1, 13)).find((p) => p.type === 'dayPeriod')?.value;
    this.#dayPeriods = { am: am ?? 'AM', pm: pm ?? 'PM' };

    const nodes: Node[] = [];
    this.#segments = [];
    for (const part of parts) {
      if (part.type === 'literal') {
        const sep = doc.createElement('span');
        sep.className = 'aui-date-input__separator';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = part.value;
        nodes.push(sep);
        continue;
      }
      const type = part.type as SegmentType;
      if (!['year', 'month', 'day', 'hour', 'minute', 'dayPeriod'].includes(type)) continue;
      const input = doc.createElement('input');
      input.type = 'text';
      input.className = `aui-date-input__segment aui-date-input__segment--${type}`;
      input.inputMode = type === 'dayPeriod' ? 'text' : 'numeric';
      input.autocomplete = 'off';
      input.spellcheck = false;
      const maxLength = type === 'year' ? 4 : type === 'dayPeriod' ? Math.max(this.#dayPeriods.am.length, this.#dayPeriods.pm.length) : 2;
      input.maxLength = maxLength;
      input.size = maxLength;
      input.setAttribute('aria-label', getMessage('dateInput', SEGMENT_MESSAGE[type], {}, config.locale));
      input.placeholder = getMessage('dateInput', PLACEHOLDER_MESSAGE[type], {}, config.locale);
      input.disabled = o.disabled ?? false;
      input.readOnly = o.readOnly ?? false;
      input.required = o.required ?? false;
      input.value = previous.get(type) ?? '';
      const segment: Segment = { type, input, maxLength };
      this.#bindSegment(segment);
      this.#segments.push(segment);
      nodes.push(input);
    }
    this.#fields.replaceChildren(...nodes);

    renderLabel(this.#label, o.label, o.required ?? false);
    this.#descriptionEl.textContent = o.description ?? '';
    this.#descriptionEl.hidden = !o.description;
    if (o.name) this.#hidden.name = o.name;
    else this.#hidden.removeAttribute('name');
    this.host.classList.toggle('aui-date-input--disabled', o.disabled ?? false);
  }

  #bindSegment(segment: Segment): void {
    const { input, type } = segment;
    input.addEventListener('keydown', (event) => {
      this.#onSegmentKeyDown(segment, event);
    });
    input.addEventListener('input', () => {
      if (type === 'dayPeriod') {
        const v = input.value.trim().toLowerCase();
        if (v) input.value = v.startsWith(this.#dayPeriods.pm.charAt(0).toLowerCase()) ? this.#dayPeriods.pm : this.#dayPeriods.am;
        if (input.value) this.#focusSibling(segment, 1);
        this.#recompute(true);
        return;
      }
      const digits = input.value.replace(/\D/g, '').slice(0, segment.maxLength);
      input.value = digits;
      if (this.#segmentComplete(segment, digits)) {
        if (digits.length < segment.maxLength && type !== 'year') input.value = digits.padStart(2, '0');
        this.#focusSibling(segment, 1);
      }
      this.#recompute(true);
    });
    input.addEventListener('focus', () => {
      input.select();
    });
  }

  /** A segment is complete when full, or when no further digit could form a valid value. */
  #segmentComplete(segment: Segment, digits: string): boolean {
    if (digits.length >= segment.maxLength) return true;
    if (digits.length !== 1 || segment.type === 'year') return false;
    const d = Number(digits);
    const hour12 = this.#segments.some((s) => s.type === 'dayPeriod');
    const maxFirstDigit: Record<Exclude<SegmentType, 'year' | 'dayPeriod'>, number> = { month: 1, day: 3, hour: hour12 ? 1 : 2, minute: 5 };
    return d > maxFirstDigit[segment.type as Exclude<SegmentType, 'year' | 'dayPeriod'>];
  }

  #focusSibling(segment: Segment, delta: 1 | -1): void {
    const i = this.#segments.indexOf(segment);
    const next = this.#segments[i + delta];
    if (next) {
      next.input.focus();
      next.input.select();
    }
  }

  #onSegmentKeyDown(segment: Segment, event: KeyboardEvent): void {
    const { input, type } = segment;
    if (this.#options.readOnly || this.#options.disabled) return;
    const rtl = this.#config().direction === 'rtl';
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown':
        event.preventDefault();
        this.#step(segment, event.key === 'ArrowUp' ? 1 : -1);
        this.#recompute(true);
        return;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const forward = (event.key === 'ArrowRight') !== rtl;
        const atEdge = forward ? input.selectionStart === input.value.length || input.selectionEnd === input.value.length : input.selectionStart === 0;
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
        // Typing a separator advances to the next segment.
        if (['/', '-', '.', ':', ' ', ','].includes(event.key) && type !== 'dayPeriod') {
          event.preventDefault();
          if (input.value.length === 1 && type !== 'year') input.value = input.value.padStart(2, '0');
          this.#focusSibling(segment, 1);
          this.#recompute(true);
        }
    }
  }

  #range(type: SegmentType): [number, number] {
    const hour12 = this.#segments.some((s) => s.type === 'dayPeriod');
    switch (type) {
      case 'year':
        return [1, 9999];
      case 'month':
        return [1, 12];
      case 'day': {
        const y = Number(this.#get('year'));
        const m = Number(this.#get('month'));
        return [1, y >= 1 && m >= 1 && m <= 12 ? daysInMonth(y, m) : 31];
      }
      case 'hour':
        return hour12 ? [1, 12] : [0, 23];
      case 'minute':
        return [0, 59];
      case 'dayPeriod':
        return [0, 1];
    }
  }

  #step(segment: Segment, delta: 1 | -1): void {
    const { input, type } = segment;
    if (type === 'dayPeriod') {
      input.value = input.value === this.#dayPeriods.pm ? this.#dayPeriods.am : this.#dayPeriods.pm;
      return;
    }
    const [min, max] = this.#range(type);
    const current = input.value === '' ? null : Number(input.value);
    let next: number;
    if (current === null) next = delta === 1 ? min : max;
    else if (type === 'year') next = Math.min(max, Math.max(min, current + delta));
    else next = current + delta > max ? min : current + delta < min ? max : current + delta;
    input.value = type === 'year' ? String(next).padStart(4, '0') : String(next).padStart(2, '0');
    input.select();
  }

  #get(type: SegmentType): string {
    return this.#segments.find((s) => s.type === type)?.input.value ?? '';
  }

  #set(type: SegmentType, value: string): void {
    const s = this.#segments.find((x) => x.type === type);
    if (s) s.input.value = value;
  }

  #writeValue(value: DateInputValue | null): void {
    if (value === null) {
      for (const s of this.#segments) s.input.value = '';
      return;
    }
    const config = this.#config();
    this.#writeLocal(value.kind === 'PlainDate' ? plainDateTime(value) : toPlainDateTime(value, config.timezone));
  }

  #writeLocal(local: PlainDateTime): void {
    const { date, time } = local;
    this.#set('year', String(date.year).padStart(4, '0'));
    this.#set('month', String(date.month).padStart(2, '0'));
    this.#set('day', String(date.day).padStart(2, '0'));
    if (this.#granularity === 'minute') {
      const hour12 = this.#segments.some((s) => s.type === 'dayPeriod');
      const h = hour12 ? ((time.hour + 11) % 12) + 1 : time.hour;
      this.#set('hour', String(h).padStart(2, '0'));
      this.#set('minute', String(time.minute).padStart(2, '0'));
      this.#set('dayPeriod', time.hour >= 12 ? this.#dayPeriods.pm : this.#dayPeriods.am);
    }
  }

  /** Parse segments into a value and validity; emit when changed by user input. */
  #recompute(fromUser: boolean): void {
    const config = this.#config();
    const o = this.#options;
    // An external error describes the previous value; user edits clear it.
    if (fromUser) this.#state.customError = null;
    const filled = this.#segments.filter((s) => s.input.value !== '').length;
    let value: DateInputValue | null = null;
    let error: DateInputError | null = null;
    let status: LocalTimeStatus | null = null;
    let hint: string | null = null;

    if (filled === 0) {
      error = o.required ? 'value-missing' : null;
    } else if (filled < this.#segments.length) {
      error = 'incomplete';
    } else {
      const y = Number(this.#get('year'));
      const m = Number(this.#get('month'));
      const d = Number(this.#get('day'));
      try {
        const date = plainDate(y, m, d);
        if (this.#granularity === 'date') {
          value = date;
        } else {
          let hour = Number(this.#get('hour'));
          if (this.#segments.some((s) => s.type === 'dayPeriod')) {
            const pm = this.#get('dayPeriod') === this.#dayPeriods.pm;
            hour = (hour % 12) + (pm ? 12 : 0);
          }
          const local = plainDateTime(date, plainTime(hour, Number(this.#get('minute'))));
          status = getLocalTimeStatus(local, config.timezone);
          value = toInstant(local, config.timezone, config.disambiguation);
          if (status === 'nonexistent') {
            hint = getMessage('dateInput', 'adjustedTime', { time: formatInstant(value, { timeStyle: 'short' }, config.timezone, config.locale) }, config.locale);
          } else if (status === 'ambiguous') {
            const which = config.disambiguation === 'later' ? 'later' : 'earlier';
            const offset = formatTimeZoneName(config.timezone, 'shortOffset', value.epochMilliseconds, config.locale);
            hint = getMessage('dateInput', 'ambiguousResolved', { which: getMessage('dateInput', which, {}, config.locale), offset }, config.locale);
          }
        }
      } catch (e) {
        if (!(e instanceof AbsoluteUIError)) throw e;
        value = null;
        error = e.code === 'TZ_NONEXISTENT_TIME' ? 'nonexistent-time' : e.code === 'TZ_AMBIGUOUS_TIME' ? 'ambiguous-time' : 'invalid-date';
      }
      if (value && !error) {
        if (o.min && this.#compare(value, o.min) < 0) error = 'range-underflow';
        else if (o.max && this.#compare(value, o.max) > 0) error = 'range-overflow';
      }
    }

    // A custom error does not discard a parseable value (for example a server-side check).
    const reportedValue = error === null ? value : null;
    if (error === null && this.#state.customError !== null) error = 'custom';
    const validity: DateInputValidity = Object.freeze({ valid: error === null, error, message: this.#messageFor(error, config), localTimeStatus: status });
    const changed = !this.#sameValue(reportedValue, this.#value) || validity.error !== this.#validity.error || validity.localTimeStatus !== this.#validity.localTimeStatus;
    this.#value = reportedValue;
    this.#validity = validity;
    this.#hidden.value = reportedValue === null ? '' : reportedValue.kind === 'PlainDate' ? plainDateToString(reportedValue) : instantToString(reportedValue);
    this.#renderMessages(hint);
    if (fromUser && changed) emit(this.host, 'aui-change', { value: reportedValue, validity } satisfies DateInputChangeDetail);
  }

  #compare(a: DateInputValue, b: DateInputValue): number {
    if (a.kind === 'PlainDate' && b.kind === 'PlainDate') return comparePlainDate(a, b);
    if (a.kind === 'Instant' && b.kind === 'Instant') return Math.sign(a.epochMilliseconds - b.epochMilliseconds);
    return 0;
  }

  #sameValue(a: DateInputValue | null, b: DateInputValue | null): boolean {
    if (a === null || b === null) return a === b;
    return this.#compare(a, b) === 0 && a.kind === b.kind;
  }

  #formatBound(v: DateInputValue, config: Resolved): string {
    return v.kind === 'PlainDate' ? formatPlainDate(v, { dateStyle: 'medium' }, config.locale) : formatInstant(v, { dateStyle: 'medium', timeStyle: 'short' }, config.timezone, config.locale);
  }

  #hintText: string | null = null;

  #messageFor(error: DateInputError | null, config: Resolved): string {
    const o = this.#options;
    const tz = (): string => formatTimeZoneName(config.timezone, 'long', Date.now(), config.locale);
    switch (error) {
      case null:
        return '';
      case 'incomplete':
        return getMessage('dateInput', 'incomplete', {}, config.locale);
      case 'invalid-date':
        return getMessage('dateInput', 'invalidDate', {}, config.locale);
      case 'value-missing':
        return getMessage('dateInput', 'valueMissing', {}, config.locale);
      case 'range-underflow':
        return o.min ? getMessage('dateInput', 'rangeUnderflow', { min: this.#formatBound(o.min, config) }, config.locale) : '';
      case 'range-overflow':
        return o.max ? getMessage('dateInput', 'rangeOverflow', { max: this.#formatBound(o.max, config) }, config.locale) : '';
      case 'nonexistent-time':
        return getMessage('dateInput', 'nonexistentTime', { timeZone: tz() }, config.locale);
      case 'ambiguous-time':
        return getMessage('dateInput', 'ambiguousTime', { timeZone: tz() }, config.locale);
      case 'custom':
        return this.#state.customError ?? '';
    }
  }

  #renderMessages(hint: string | null = this.#hintText): void {
    this.#hintText = hint;
    const config = this.#config();
    const o = this.#options;
    const describedBy: string[] = [];
    if (o.description) describedBy.push(this.#descriptionEl.id);

    const hints: string[] = [];
    if (this.#granularity === 'minute') {
      const at = this.#value?.kind === 'Instant' ? this.#value.epochMilliseconds : Date.now();
      const zone = `${formatTimeZoneName(config.timezone, 'long', at, config.locale)} (${formatTimeZoneName(config.timezone, 'longOffset', at, config.locale)})`;
      hints.push(getMessage('dateInput', 'timeZoneHint', { timeZone: zone }, config.locale));
    }
    if (hint) hints.push(hint);
    this.#hintEl.textContent = hints.join(' ');
    this.#hintEl.hidden = hints.length === 0;
    if (hints.length) describedBy.push(this.#hintEl.id);

    const error = this.#validity.error;
    const early = error !== 'incomplete' && error !== 'value-missing' && error !== 'custom';
    const show = error !== null && (this.#state.touched || this.#state.submitted || early);
    const message = show ? this.#validity.message : '';
    renderError(this.#errorEl, message, 'alert-circle');
    this.#errorEl.hidden = message === '';
    if (message) describedBy.push(this.#errorEl.id);

    setDescribedBy(this.group, describedBy);
    for (const s of this.#segments) {
      if (message) s.input.setAttribute('aria-invalid', 'true');
      else s.input.removeAttribute('aria-invalid');
    }
    this.host.classList.toggle('aui-date-input--invalid', message !== '');
  }
}
