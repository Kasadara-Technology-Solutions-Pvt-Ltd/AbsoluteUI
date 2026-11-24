/**
 * Time Picker (SPEC section 18.5/section 18.7). A wall-clock time of day (`PlainTime`, section 8.4)
 * entered in locale-ordered segments inside a labelled group, plus a button that
 * opens a listbox of suggested times at a fixed step (APG listbox popup: focus
 * moves into the listbox, the active option is conveyed via aria-activedescendant).
 * The value is not bound to a timezone or a date; combining it with a date and a
 * zone is the job of a date-time picker or consumer code.
 */
import {
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  formatPlainTime,
  getMessage,
  plainTime,
  registerMessages,
  validators,
  type Disposer,
  type PlainTime,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { autoPosition, createTypeahead, getNextIndex, isPrintableKey, openPopover, type PopoverHandle } from '@absoluteui/utilities';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { messageFor, runValidator } from '../internal/validation.js';

export type TimePickerGranularity = 'minute' | 'second';
export type TimePickerHourCycle = 'auto' | 'h12' | 'h23';

export interface TimePickerConfig {
  validationTiming: ValidationTiming;
  granularity: TimePickerGranularity;
  hourCycle: TimePickerHourCycle;
  /** Minutes between suggested times in the listbox. */
  step: number;
}

type Inherited = 'locale' | 'direction';
type Resolved = Readonly<TimePickerConfig & { locale: string; direction: 'ltr' | 'rtl' }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    timePicker: TimePickerConfig & { locale: string; direction: 'ltr' | 'rtl' };
  }
}

export const timePickerConfig = defineComponentConfig<TimePickerConfig, Inherited>(
  'timePicker',
  {
    validationTiming: validationTimingSpec,
    granularity: { default: 'minute', expected: '"minute" | "second"', validate: validators.oneOf(['minute', 'second'] as const), mutability: 'init-only' },
    hourCycle: { default: 'auto', expected: '"auto" | "h12" | "h23"', validate: validators.oneOf(['auto', 'h12', 'h23'] as const) },
    step: { default: 30, expected: 'integer 1..720 (minutes)', validate: validators.integerInRange(1, 720) },
  },
  ['locale', 'direction'],
);

registerMessages('timePicker', 'en', {
  hour: 'Hour',
  minute: 'Minute',
  second: 'Second',
  dayPeriod: 'AM/PM',
  placeholderHour: 'hh',
  placeholderMinute: 'mm',
  placeholderSecond: 'ss',
  placeholderDayPeriod: '--',
  chooseTime: 'Choose time',
  noSuggestions: 'No times available',
  incomplete: 'Enter a complete time.',
  invalidTime: 'Enter a valid time.',
  rangeUnderflow: 'Enter a time of {min} or later.',
  rangeOverflow: 'Enter a time of {max} or earlier.',
});

export type TimePickerError =
  | 'incomplete'
  | 'invalid'
  | 'value-missing'
  | 'range-underflow'
  | 'range-overflow'
  /** From the `validate` callback or `setCustomError` (for example a server-side check). */
  | 'custom';

export interface TimePickerValidity {
  readonly valid: boolean;
  readonly error: TimePickerError | null;
  /** Localized message for `error`; empty when valid. */
  readonly message: string;
}

export interface TimePickerChangeDetail {
  value: PlainTime | null;
  validity: TimePickerValidity;
}

export interface TimePickerIcons {
  time: IconRef;
  error: IconRef;
}

export interface TimePickerOptions extends Partial<TimePickerConfig> {
  /** Visible label (required accessible name for the group). */
  label: string;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  /** Wall-clock time of day. At minute granularity, seconds and milliseconds must be 0. */
  value?: PlainTime | null;
  /** Earliest allowed time (inclusive). Default 00:00. */
  min?: PlainTime | null;
  /** Latest allowed time (inclusive). Default end of day. */
  max?: PlainTime | null;
  /** Form field name; a hidden input carries `HH:MM` (or `HH:MM:SS`). */
  name?: string;
  /** Help text, referenced by aria-describedby (text only). */
  description?: string;
  required?: boolean;
  disabled?: boolean;
  /** Focusable and submitted, but not editable; the listbox does not open. */
  readOnly?: boolean;
  /** Consumer validation; return a message to mark the value invalid. */
  validate?: (value: PlainTime | null) => string | null;
  locale?: string;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<TimePickerIcons>;
}

type SegmentType = 'hour' | 'minute' | 'second' | 'dayPeriod';

interface Segment {
  readonly type: SegmentType;
  readonly input: HTMLInputElement;
  readonly maxLength: number;
}

type DayPeriodMatch = 'am' | 'pm' | 'ambiguous' | null;

const SEGMENT_TYPES: readonly SegmentType[] = ['hour', 'minute', 'second', 'dayPeriod'];
const PLACEHOLDER: Record<SegmentType, string> = { hour: 'placeholderHour', minute: 'placeholderMinute', second: 'placeholderSecond', dayPeriod: 'placeholderDayPeriod' };
const SEPARATORS = [':', '.', ' ', ',', '-', '/'];
const TYPEAHEAD_MS = 500;
const DAY_SECONDS = 86_400;
const VALID: TimePickerValidity = Object.freeze({ valid: true, error: null, message: '' });

function isSegmentType(type: string): type is SegmentType {
  return (SEGMENT_TYPES as readonly string[]).includes(type);
}

function isPlainTime(value: unknown): value is PlainTime {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'PlainTime';
}

/** Seconds since midnight (milliseconds ignored). */
function secondsOf(t: PlainTime): number {
  return t.hour * 3600 + t.minute * 60 + t.second;
}

function fromSeconds(s: number): PlainTime {
  return plainTime(Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60);
}

const pad = (n: number): string => String(n).padStart(2, '0');

export class TimePicker implements FormControl {
  readonly host: HTMLElement;
  /** The labelled `role="group"`; also the control boundary and the popup anchor. */
  readonly group: HTMLDivElement;
  /** Opens the suggestions listbox. */
  readonly button: HTMLButtonElement;
  readonly listbox: HTMLDivElement;
  #options: TimePickerOptions;
  #value: PlainTime | null = null;
  #initialValue: PlainTime | null;
  #validity: TimePickerValidity = VALID;
  #segments: Segment[] = [];
  #structureKey = '';
  #hour12 = false;
  #dayPeriods = { am: 'AM', pm: 'PM' };
  #suggestions: PlainTime[] = [];
  #optionEls: HTMLDivElement[] = [];
  #labels: string[] = [];
  #activeIndex = -1;
  #popover: PopoverHandle | null = null;
  #stopPosition: Disposer | null = null;
  #typingUntil = 0;
  readonly #typeahead = createTypeahead(TYPEAHEAD_MS);
  readonly #granularity: TimePickerGranularity;
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #fields: HTMLDivElement;
  readonly #popup: HTMLDivElement;
  readonly #empty: HTMLDivElement;
  readonly #hidden: HTMLInputElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render a time picker into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: TimePickerOptions): TimePicker {
    return new TimePicker(host, options);
  }

  private constructor(host: HTMLElement, options: TimePickerOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#granularity = this.#config().granularity;
    this.#initialValue = options.value ?? null;
    const doc = this.#doc;

    // A <label> cannot name a group; it is associated through aria-labelledby (as in Date Input).
    this.#chrome = new FieldChrome(doc, 'label', 'aui-time-picker');
    const labelId = this.#chrome.label.id;
    const listboxId = createId('aui-time-picker-listbox');

    this.group = doc.createElement('div');
    this.group.className = 'aui-time-picker__group';
    this.group.setAttribute('role', 'group');
    this.group.setAttribute('aria-labelledby', labelId);
    this.#fields = doc.createElement('div');
    this.#fields.className = 'aui-time-picker__fields';
    this.button = doc.createElement('button');
    this.button.type = 'button';
    this.button.className = 'aui-time-picker__button';
    this.button.setAttribute('aria-haspopup', 'listbox');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-controls', listboxId);
    this.group.append(this.#fields, this.button);

    this.#popup = doc.createElement('div');
    this.#popup.className = 'aui-time-picker__popup';
    // Hidden by the UA stylesheet until shown in the top layer.
    this.#popup.popover = 'manual';
    this.listbox = doc.createElement('div');
    this.listbox.id = listboxId;
    this.listbox.className = 'aui-time-picker__listbox';
    this.listbox.setAttribute('role', 'listbox');
    this.listbox.setAttribute('aria-labelledby', labelId);
    this.listbox.tabIndex = 0;
    this.#empty = doc.createElement('div');
    this.#empty.className = 'aui-time-picker__empty';
    this.#popup.append(this.listbox, this.#empty);

    this.#hidden = doc.createElement('input');
    this.#hidden.type = 'hidden';

    host.classList.add('aui-field', 'aui-time-picker');
    host.replaceChildren(this.#chrome.label, this.group, this.#chrome.description, this.#chrome.error, this.#hidden, this.#popup);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#writeValue(this.#initialValue);
    this.#recompute(false);
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(timePickerConfig.subscribe(() => {
      this.#render();
      this.#recompute(false);
    }));
  }

  get value(): PlainTime | null {
    return this.#value;
  }

  get validity(): TimePickerValidity {
    return this.#validity;
  }

  get isOpen(): boolean {
    return this.#popover !== null;
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

  get options(): Readonly<TimePickerOptions> {
    return this.#options;
  }

  /** `HH:MM` (or `HH:MM:SS` at second granularity), or null when empty or invalid. */
  getFormValue(): string | null {
    return this.#value === null ? null : this.#formValue(this.#value);
  }

  /** Set the value programmatically (no events). Clears an external custom error. */
  setValue(value: PlainTime | null): void {
    this.#assertValue(value, this.#granularity);
    this.#state.customError = null;
    this.#writeValue(value);
    this.#recompute(false);
    if (this.#popover) this.#renderOptions();
  }

  update(options: Partial<TimePickerOptions>): void {
    timePickerConfig.assertUpdatable(this.#options, options);
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    // Render first: a locale or hour-cycle change rebuilds the segments from the current value.
    this.#render();
    if ('value' in options) this.#writeValue(options.value ?? null);
    this.#recompute(false);
    if (this.#popover && 'value' in options) this.#renderOptions();
  }

  /** Show the suggestions listbox and move focus into it; the option nearest the value becomes active. */
  open(): void {
    const o = this.#options;
    if (this.#popover || o.disabled || o.readOnly) return;
    this.#renderOptions();
    this.#popover = openPopover(this.#popup, {
      inside: [this.group],
      onDismiss: (reason) => {
        this.#close(reason === 'escape' ? 'button' : 'none');
      },
    });
    this.#stopPosition = autoPosition(this.group, this.#popup, { placement: 'bottom-start', matchAnchorWidth: true, direction: this.#config().direction });
    this.button.setAttribute('aria-expanded', 'true');
    this.listbox.focus({ preventScroll: true });
    this.#setActive(this.#nearestIndex(), 'center');
    emit(this.host, 'aui-open', null, { bubbles: false });
  }

  /** Hide the listbox without changing the value. Focus inside it returns to the button. */
  close(): void {
    this.#close(this.#popup.contains(this.#doc.activeElement) ? 'button' : 'none');
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

  focus(): void {
    this.#segments[0]?.input.focus();
  }

  /** Close, restore the initial value, and clear dirty/touched/submitted state (no events). */
  reset(): void {
    this.#close('none');
    this.#state.reset();
    this.#writeValue(this.#initialValue);
    this.#recompute(false);
  }

  destroy(): void {
    this.#close('none');
    this.#group.dispose();
    this.#typeahead.reset();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-time-picker', 'aui-time-picker--invalid', 'aui-time-picker--disabled', 'aui-time-picker--readonly');
  }

  #config(options: TimePickerOptions = this.#options): Resolved {
    const o = options;
    return timePickerConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.granularity === undefined ? {} : { granularity: o.granularity }),
      ...(o.hourCycle === undefined ? {} : { hourCycle: o.hourCycle }),
      ...(o.step === undefined ? {} : { step: o.step }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #assertValue(value: PlainTime | null | undefined, granularity: TimePickerGranularity): void {
    if (value === null || value === undefined) return;
    if (!isPlainTime(value) || value.millisecond !== 0 || (granularity === 'minute' && value.second !== 0)) {
      throw configurationError('TIME_PICKER_OPTIONS', 'Invalid time picker options.', {
        component: 'timePicker',
        property: 'timePicker.value',
        expected: granularity === 'minute' ? 'PlainTime with second and millisecond 0, or null' : 'PlainTime with millisecond 0, or null',
      });
    }
  }

  #assertOptions(options: TimePickerOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('TIME_PICKER_OPTIONS', 'Invalid time picker options.', { component: 'timePicker', property: `timePicker.${property}`, expected });
    };
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    // Validates config-backed options (granularity, hourCycle, step, locale, ...).
    const config = this.#config(options);
    this.#assertValue(options.value, config.granularity);
    for (const key of ['min', 'max'] as const) {
      const bound = options[key];
      if (bound !== undefined && bound !== null && !isPlainTime(bound)) fail(key, 'PlainTime or null');
    }
    if (options.min && options.max && secondsOf(options.min) > secondsOf(options.max)) fail('min', 'min <= max (ranges across midnight are not supported)');
    if (options.validate !== undefined && typeof options.validate !== 'function') fail('validate', '(value: PlainTime | null) => string | null');
  }

  #isHour12(config: Resolved): boolean {
    if (config.hourCycle !== 'auto') return config.hourCycle === 'h12';
    const cycle = new Intl.DateTimeFormat(config.locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return cycle === 'h11' || cycle === 'h12';
  }

  /** Conventional clock display: `9:30 AM` for 12-hour cycles, `09:30` for 24-hour cycles. */
  #timeFormat(hour12: boolean, withSeconds: boolean): { hour: 'numeric' | '2-digit'; minute: '2-digit'; second?: '2-digit'; hourCycle: 'h12' | 'h23' } {
    return { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' as const } : {}), hourCycle: hour12 ? 'h12' : 'h23' };
  }

  #formatTime(t: PlainTime, config: Resolved, withSeconds = this.#granularity === 'second'): string {
    return formatPlainTime(t, this.#timeFormat(this.#hour12, withSeconds), config.locale);
  }

  #formValue(t: PlainTime): string {
    return `${pad(t.hour)}:${pad(t.minute)}${this.#granularity === 'second' ? `:${pad(t.second)}` : ''}`;
  }

  /** Build segments in locale order from Intl formatToParts, keeping what the user entered. */
  #buildSegments(config: Resolved, hour12: boolean): void {
    const doc = this.#doc;
    const previous = new Map(this.#segments.map((s) => [s.type, s.input.value] as const));
    const previousHour12 = this.#hour12;
    const previousPm = previous.get('dayPeriod') === this.#dayPeriods.pm;
    const focusedType = this.#segments.find((s) => s.input === doc.activeElement)?.type;
    const withSeconds = this.#granularity === 'second';

    const parts = new Intl.DateTimeFormat(config.locale, {
      hour: '2-digit',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' as const } : {}),
      hourCycle: hour12 ? 'h12' : 'h23',
      timeZone: 'UTC',
    }).formatToParts(Date.UTC(2026, 0, 1, 13, 45, 30));
    const period = (hour: number): string | undefined =>
      new Intl.DateTimeFormat(config.locale, { hour: 'numeric', hourCycle: 'h12', timeZone: 'UTC' }).formatToParts(Date.UTC(2026, 0, 1, hour)).find((p) => p.type === 'dayPeriod')?.value;
    this.#dayPeriods = { am: period(1) ?? 'AM', pm: period(13) ?? 'PM' };
    this.#hour12 = hour12;

    const nodes: Node[] = [];
    this.#segments = [];
    for (const part of parts) {
      if (part.type === 'literal') {
        const sep = doc.createElement('span');
        sep.className = 'aui-time-picker__separator';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = part.value;
        nodes.push(sep);
        continue;
      }
      if (!isSegmentType(part.type) || (part.type === 'dayPeriod' && !hour12)) continue;
      const type = part.type;
      const input = doc.createElement('input');
      input.type = 'text';
      input.className = `aui-time-picker__segment aui-time-picker__segment--${type}`;
      input.inputMode = type === 'dayPeriod' ? 'text' : 'numeric';
      input.autocomplete = 'off';
      input.spellcheck = false;
      const maxLength = type === 'dayPeriod' ? Math.max(this.#dayPeriods.am.length, this.#dayPeriods.pm.length) : 2;
      input.maxLength = maxLength;
      input.size = maxLength;
      this.#segments.push({ type, input, maxLength });
      nodes.push(input);
    }
    this.#fields.replaceChildren(...nodes);

    if (this.#value !== null) {
      this.#writeValue(this.#value);
    } else {
      this.#set('minute', previous.get('minute') ?? '');
      this.#set('second', previous.get('second') ?? '');
      if (previousHour12 === hour12) this.#set('hour', previous.get('hour') ?? '');
      if (previous.get('dayPeriod')) this.#set('dayPeriod', previousPm ? this.#dayPeriods.pm : this.#dayPeriods.am);
    }
    if (focusedType) this.#segments.find((s) => s.type === focusedType)?.input.focus();
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const hour12 = this.#isHour12(config);
    const key = `${config.locale}|${String(hour12)}`;
    if (key !== this.#structureKey) {
      this.#buildSegments(config, hour12);
      this.#structureKey = key;
    }
    const disabled = o.disabled ?? false;
    const readOnly = o.readOnly ?? false;

    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    for (const s of this.#segments) {
      s.input.setAttribute('aria-label', getMessage('timePicker', s.type, {}, config.locale));
      s.input.placeholder = getMessage('timePicker', PLACEHOLDER[s.type], {}, config.locale);
      s.input.disabled = disabled;
      s.input.readOnly = readOnly;
      s.input.required = o.required ?? false;
    }
    this.button.setAttribute('aria-label', getMessage('timePicker', 'chooseTime', {}, config.locale));
    this.button.disabled = disabled || readOnly;
    this.button.replaceChildren(renderIcon(o.icons?.time ?? 'clock', { doc: this.#doc }));
    this.#empty.textContent = getMessage('timePicker', 'noSuggestions', {}, config.locale);

    if (o.name) this.#hidden.name = o.name;
    else this.#hidden.removeAttribute('name');
    // Like native controls, a disabled picker is not submitted.
    this.#hidden.disabled = disabled;
    this.host.classList.toggle('aui-time-picker--disabled', disabled);
    this.host.classList.toggle('aui-time-picker--readonly', readOnly && !disabled);

    if (this.#popover) {
      if (disabled || readOnly) this.#close('none');
      else this.#renderOptions();
    }
  }

  #bindEvents(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.#fields, 'keydown', (event) => {
      const segment = this.#segmentFor(event.target);
      if (segment) this.#onSegmentKeyDown(segment, event);
    });
    g.listen(this.#fields, 'input', (event) => {
      const segment = this.#segmentFor(event.target);
      if (segment) this.#onSegmentInput(segment);
    });
    g.listen(this.#fields, 'focusin', (event) => {
      this.#segmentFor(event.target)?.input.select();
    });
    // A <label> without `for` does not focus a group; do it explicitly.
    g.listen(this.#chrome.label, 'click', () => {
      if (!this.#options.disabled) this.focus();
    });
    g.listen(this.button, 'click', () => {
      if (this.#popover) this.#close('button');
      else this.open();
    });
    g.listen(this.listbox, 'keydown', (event) => {
      this.#onListboxKeyDown(event);
    });
    g.listen(this.listbox, 'click', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="option"]') : null;
      if (target) this.#selectIndex(Number(target.dataset.index));
    });
    // Focus leaving the popup closes it (Tab, Shift+Tab, a click elsewhere). The button
    // handles its own click so that clicking it while open closes instead of reopening.
    g.listen(this.#popup, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && (this.#popup.contains(next) || this.button.contains(next))) return;
      this.#close('none');
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      // Deferred while a pointer is pressed, so a message does not shift the pending click target.
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#renderMessages();
      });
    });
  }

  #segmentFor(target: EventTarget | null): Segment | undefined {
    return this.#segments.find((s) => s.input === target);
  }

  #onSegmentInput(segment: Segment): void {
    const { input } = segment;
    if (segment.type === 'dayPeriod') {
      const raw = input.value.trim();
      const whole = this.#matchDayPeriod(raw);
      // Keep a prefix shared by both periods (for example Korean 오전/오후) until it is unique.
      if (whole !== 'ambiguous') {
        const match = whole ?? this.#matchDayPeriod(raw.slice(-1));
        input.value = match === 'am' ? this.#dayPeriods.am : match === 'pm' ? this.#dayPeriods.pm : '';
        if (input.value) this.#focusSibling(segment, 1);
      }
      this.#onUserEdit();
      return;
    }
    const digits = input.value.replace(/\D/g, '').slice(0, segment.maxLength);
    input.value = digits;
    if (this.#segmentComplete(segment, digits)) {
      if (digits.length === 1) input.value = digits.padStart(2, '0');
      this.#focusSibling(segment, 1);
    }
    this.#onUserEdit();
  }

  #matchDayPeriod(text: string): DayPeriodMatch {
    if (text === '') return null;
    const locale = this.#config().locale;
    const t = text.toLocaleLowerCase(locale);
    const am = this.#dayPeriods.am.toLocaleLowerCase(locale);
    const pm = this.#dayPeriods.pm.toLocaleLowerCase(locale);
    if (t === am) return 'am';
    if (t === pm) return 'pm';
    const a = am.startsWith(t);
    const p = pm.startsWith(t);
    if (a && !p) return 'am';
    if (p && !a) return 'pm';
    if (a && p) return 'ambiguous';
    // Latin fallback for locales with non-Latin day periods.
    if (t === 'a') return 'am';
    if (t === 'p') return 'pm';
    return null;
  }

  /** A segment is complete when full, or when no further digit could form a valid value. */
  #segmentComplete(segment: Segment, digits: string): boolean {
    if (digits.length >= segment.maxLength) return true;
    if (digits.length !== 1) return false;
    const maxFirstDigit = segment.type === 'hour' ? (this.#hour12 ? 1 : 2) : 5;
    return Number(digits) > maxFirstDigit;
  }

  #focusSibling(segment: Segment, delta: 1 | -1): void {
    const next = this.#segments[this.#segments.indexOf(segment) + delta];
    if (next) {
      next.input.focus();
      next.input.select();
    }
  }

  #onSegmentKeyDown(segment: Segment, event: KeyboardEvent): void {
    const o = this.#options;
    const { input, type } = segment;
    if (o.disabled) return;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown':
        if (o.readOnly) return;
        event.preventDefault();
        if (event.altKey) {
          if (event.key === 'ArrowDown') this.open();
          return;
        }
        this.#step(segment, event.key === 'ArrowUp' ? 1 : -1);
        this.#onUserEdit();
        return;
      case 'ArrowLeft':
      case 'ArrowRight': {
        // Segments render as an LTR-isolated run in every direction, so arrows follow that visual order.
        const forward = event.key === 'ArrowRight';
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
        // Typing a separator advances to the next segment.
        if (SEPARATORS.includes(event.key) && type !== 'dayPeriod' && !o.readOnly) {
          event.preventDefault();
          if (input.value.length === 1) input.value = input.value.padStart(2, '0');
          this.#focusSibling(segment, 1);
          this.#onUserEdit();
        }
    }
  }

  #step(segment: Segment, delta: 1 | -1): void {
    const { input, type } = segment;
    if (type === 'dayPeriod') {
      const { am, pm } = this.#dayPeriods;
      input.value = input.value === '' ? (delta === 1 ? am : pm) : input.value === pm ? am : pm;
      input.select();
      return;
    }
    const [min, max] = type === 'hour' ? (this.#hour12 ? [1, 12] : [0, 23]) : [0, 59];
    const current = input.value === '' ? null : Number(input.value);
    const next = current === null ? (delta === 1 ? min : max) : current + delta > max ? min : current + delta < min ? max : current + delta;
    input.value = pad(next);
    input.select();
  }

  #onUserEdit(): void {
    this.#state.dirty = true;
    this.#recompute(true);
  }

  #get(type: SegmentType): string {
    return this.#segments.find((s) => s.type === type)?.input.value ?? '';
  }

  #set(type: SegmentType, value: string): void {
    const s = this.#segments.find((x) => x.type === type);
    if (s) s.input.value = value;
  }

  #writeValue(value: PlainTime | null): void {
    if (value === null) {
      for (const s of this.#segments) s.input.value = '';
      return;
    }
    this.#set('hour', pad(this.#hour12 ? ((value.hour + 11) % 12) + 1 : value.hour));
    this.#set('minute', pad(value.minute));
    this.#set('second', pad(value.second));
    this.#set('dayPeriod', value.hour >= 12 ? this.#dayPeriods.pm : this.#dayPeriods.am);
  }

  /** Parse complete segments; null when a field is out of range. */
  #parseSegments(): PlainTime | null {
    const num = (type: SegmentType): number => (/^\d{1,2}$/.test(this.#get(type)) ? Number(this.#get(type)) : NaN);
    let hour = num('hour');
    const minute = num('minute');
    const second = this.#granularity === 'second' ? num('second') : 0;
    if (this.#hour12) {
      const period = this.#get('dayPeriod');
      if (hour < 1 || hour > 12 || (period !== this.#dayPeriods.am && period !== this.#dayPeriods.pm)) return null;
      hour = (hour % 12) + (period === this.#dayPeriods.pm ? 12 : 0);
    }
    if (!(hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59)) return null;
    return plainTime(hour, minute, second);
  }

  /** Parse segments into a value and validity; emit when changed by the user. */
  #recompute(fromUser: boolean): void {
    const config = this.#config();
    const o = this.#options;
    // An external error describes the previous value; user edits clear it.
    if (fromUser) this.#state.customError = null;
    const filled = this.#segments.filter((s) => s.input.value !== '').length;
    let value: PlainTime | null = null;
    let error: TimePickerError | null = null;
    let message = '';

    if (filled === 0) {
      if (o.required) {
        error = 'value-missing';
        message = messageFor({ error: 'value-missing', params: {} }, { locale: config.locale });
      }
    } else if (filled < this.#segments.length) {
      error = 'incomplete';
      message = getMessage('timePicker', 'incomplete', {}, config.locale);
    } else {
      value = this.#parseSegments();
      if (value === null) {
        error = 'invalid';
        message = getMessage('timePicker', 'invalidTime', {}, config.locale);
      } else if (o.min && secondsOf(value) < secondsOf(o.min)) {
        error = 'range-underflow';
        message = getMessage('timePicker', 'rangeUnderflow', { min: this.#formatBound(o.min, config) }, config.locale);
      } else if (o.max && secondsOf(value) > secondsOf(o.max)) {
        error = 'range-overflow';
        message = getMessage('timePicker', 'rangeOverflow', { max: this.#formatBound(o.max, config) }, config.locale);
      }
    }

    // Precedence: built-in constraint, then `validate`, then an external custom error.
    const reported = error === null ? value : null;
    if (error === null) {
      const custom = runValidator(o.validate, reported) ?? this.#state.customError;
      if (custom !== null) {
        error = 'custom';
        message = custom;
      }
    }
    const validity: TimePickerValidity = error === null ? VALID : Object.freeze({ valid: false, error, message });
    const changed = !this.#same(reported, this.#value) || validity.error !== this.#validity.error;
    this.#value = reported;
    this.#validity = validity;
    this.#hidden.value = reported === null ? '' : this.#formValue(reported);
    this.#renderMessages();
    if (fromUser && changed) emit(this.host, 'aui-change', { value: reported, validity } satisfies TimePickerChangeDetail);
  }

  #formatBound(bound: PlainTime, config: Resolved): string {
    return this.#formatTime(bound, config, this.#granularity === 'second' || bound.second !== 0);
  }

  #same(a: PlainTime | null, b: PlainTime | null): boolean {
    if (a === null || b === null) return a === b;
    return secondsOf(a) === secondsOf(b) && a.millisecond === b.millisecond;
  }

  #renderMessages(): void {
    const config = this.#config();
    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', this.#options.icons?.error ?? 'alert-circle');
    setDescribedBy(this.group, this.#chrome.describedBy());
    for (const s of this.#segments) setInvalid(s.input, show);
    this.host.classList.toggle('aui-time-picker--invalid', show);
  }

  /** Suggested times: `step` minutes apart from `min` (or midnight) through `max` (or end of day). */
  #computeSuggestions(config: Resolved): PlainTime[] {
    const o = this.#options;
    let start = o.min ? secondsOf(o.min) : 0;
    // At minute granularity a suggestion cannot carry seconds; round up so it stays within `min`.
    if (this.#granularity === 'minute') start = Math.ceil(start / 60) * 60;
    const end = o.max ? secondsOf(o.max) : DAY_SECONDS - 1;
    const out: PlainTime[] = [];
    for (let s = start; s <= end && s < DAY_SECONDS; s += config.step * 60) out.push(fromSeconds(s));
    return out;
  }

  #renderOptions(): void {
    const config = this.#config();
    const doc = this.#doc;
    const activeTime = this.#suggestions[this.#activeIndex];
    this.#suggestions = this.#computeSuggestions(config);
    this.#labels = this.#suggestions.map((t) => this.#formatTime(t, config));
    const selected = this.#value;
    this.#optionEls = this.#suggestions.map((t, index) => {
      const el = doc.createElement('div');
      el.id = createId('aui-time-picker-option');
      el.className = 'aui-time-picker__option';
      el.setAttribute('role', 'option');
      el.dataset.index = String(index);
      el.setAttribute('aria-selected', String(selected !== null && secondsOf(selected) === secondsOf(t)));
      el.textContent = this.#labels[index] ?? '';
      return el;
    });
    this.listbox.replaceChildren(...this.#optionEls);
    this.#empty.hidden = this.#optionEls.length > 0;
    if (this.#popover) {
      const keep = activeTime ? this.#suggestions.findIndex((t) => secondsOf(t) === secondsOf(activeTime)) : -1;
      this.#activeIndex = -1;
      this.#setActive(keep >= 0 ? keep : this.#nearestIndex());
    }
  }

  /** The option nearest the current value, or the first option when there is no value. */
  #nearestIndex(): number {
    if (this.#suggestions.length === 0) return -1;
    const v = this.#value;
    if (v === null) return 0;
    const target = secondsOf(v);
    let best = 0;
    for (let i = 1; i < this.#suggestions.length; i++) {
      const s = this.#suggestions[i];
      const b = this.#suggestions[best];
      if (s && b && Math.abs(secondsOf(s) - target) < Math.abs(secondsOf(b) - target)) best = i;
    }
    return best;
  }

  #setActive(index: number, block: ScrollLogicalPosition = 'nearest'): void {
    this.#optionEls[this.#activeIndex]?.classList.remove('aui-time-picker__option--active');
    this.#activeIndex = index;
    const active = this.#optionEls[index];
    if (active && this.#popover) {
      active.classList.add('aui-time-picker__option--active');
      this.listbox.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block });
    } else {
      this.listbox.removeAttribute('aria-activedescendant');
    }
  }

  #onListboxKeyDown(event: KeyboardEvent): void {
    const typing = performance.now() < this.#typingUntil;
    // Space continues a typeahead query ("9 A") instead of selecting.
    if (isPrintableKey(event) && (event.key !== ' ' || typing)) {
      event.preventDefault();
      this.#typingUntil = performance.now() + TYPEAHEAD_MS;
      const match = this.#typeahead.handle(event.key, this.#labels, this.#activeIndex);
      if (match >= 0) this.#setActive(match);
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End':
      case 'PageDown':
      case 'PageUp': {
        event.preventDefault();
        const next = getNextIndex(event.key, this.#activeIndex, this.#optionEls.length, { orientation: 'vertical', loop: false });
        if (next !== null) this.#setActive(next);
        return;
      }
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (this.#activeIndex >= 0) this.#selectIndex(this.#activeIndex);
        return;
      case 'Escape':
        // Normally handled by the overlay stack (document capture); kept for robustness.
        event.preventDefault();
        event.stopPropagation();
        this.#close('button');
        return;
      default:
        return;
    }
  }

  #selectIndex(index: number): void {
    const time = this.#suggestions[index];
    if (!time) return;
    this.#writeValue(time);
    this.#close('segment');
    this.#onUserEdit();
  }

  /** Close the popup. Focus moves before the popup hides, so focus never falls to the body. */
  #close(focus: 'button' | 'segment' | 'none'): void {
    const handle = this.#popover;
    if (!handle) return;
    this.#popover = null;
    this.#stopPosition?.();
    this.#stopPosition = null;
    if (focus === 'button') this.button.focus();
    else if (focus === 'segment') this.focus();
    handle.close();
    this.#setActive(-1);
    this.#typeahead.reset();
    this.#typingUntil = 0;
    this.button.setAttribute('aria-expanded', 'false');
    emit(this.host, 'aui-close', null, { bubbles: false });
  }
}
