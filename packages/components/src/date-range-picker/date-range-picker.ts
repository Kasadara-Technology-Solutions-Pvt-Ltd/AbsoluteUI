/**
 * Date Range Picker (SPEC section 18.7). Two Date Inputs (start and end, date
 * granularity) inside one labelled group, plus a calendar button that opens a
 * range-selecting Calendar in a non-modal dialog popup (one or two months). The
 * value is an inclusive `Range<PlainDate>` (section 8.4); it is set only when both dates
 * are valid and the range satisfies every constraint. Typing and picking produce
 * the same value. The picker, not its inner Date Inputs, is the form control
 * `Form` discovers.
 */
import {
  comparePlainDate,
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  fieldsToEpoch,
  formatNumber,
  formatPlainDate,
  getMessage,
  plainDateToString,
  registerMessages,
  validators,
  type Disposer,
  type PlainDate,
  type Range,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { autoPosition, openPopover, type PopoverHandle } from '@absoluteui/utilities';
import { Calendar, type CalendarChangeDetail, type CalendarOptions, type Weekday } from '../calendar/calendar.js';
import { DateInput, type DateInputError, type DateInputOptions } from '../date-input/date-input.js';
import { registerControl, renderLabel, setDescribedBy, type FormControl } from '../internal/field.js';
import { runValidator } from '../internal/validation.js';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';
import { assertBusinessDayOptions, businessCalendarOptions, isUnavailable } from '../internal/business-days.js';

export type DateRangePickerMonths = 'auto' | 1 | 2;

export interface DateRangePickerConfig {
  /** Close the popup after the last day of the range is picked. */
  closeOnSelect: boolean;
  /** Months in the popup. `'auto'`: two when the viewport is at least 40rem wide, else one. */
  months: DateRangePickerMonths;
}

type Inherited = 'locale' | 'timezone' | 'direction';
type Resolved = Readonly<DateRangePickerConfig & { locale: string; timezone: string; direction: 'ltr' | 'rtl' }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    dateRangePicker: DateRangePickerConfig & { locale: string; timezone: string; direction: 'ltr' | 'rtl' };
  }
}

export const dateRangePickerConfig = defineComponentConfig<DateRangePickerConfig, Inherited>(
  'dateRangePicker',
  {
    closeOnSelect: { default: true, expected: 'boolean', validate: validators.isBoolean },
    months: { default: 'auto', expected: '"auto" | 1 | 2', validate: validators.oneOf(['auto', 1, 2] as const) },
  },
  ['locale', 'timezone', 'direction'],
);

registerMessages('dateRangePicker', 'en', {
  startDate: 'Start date',
  endDate: 'End date',
  chooseDates: 'Choose dates',
  changeDates: 'Change dates, {start} to {end}',
  enterStart: 'Enter a start date.',
  enterEnd: 'Enter an end date.',
  reversed: 'Enter an end date on or after the start date.',
  tooShort: 'Choose a range of at least {count} days.',
  tooLong: 'Choose a range of {count} days or fewer.',
  tooLongOne: 'Choose a single day.',
  dateUnavailable: 'This date is not available.',
});

export type DateRangePickerError =
  | DateInputError
  /** One date is set and the other is empty. */
  | 'incomplete-range'
  /** The end date is before the start date (typed). */
  | 'range-reversed'
  | 'range-too-short'
  | 'range-too-long'
  /** A typed date rejected by `isDateDisabled`. */
  | 'date-unavailable';

export interface DateRangePickerValidity {
  readonly valid: boolean;
  readonly error: DateRangePickerError | null;
  /** Localized message for `error`; empty when valid. */
  readonly message: string;
  /** The field that shows the message. */
  readonly field: 'start' | 'end' | null;
}

export interface DateRangePickerChangeDetail {
  value: Range<PlainDate> | null;
  validity: DateRangePickerValidity;
}

export interface DateRangePickerIcons {
  calendar: IconRef;
}

export interface DateRangePickerOptions extends Partial<DateRangePickerConfig> {
  /** Visible label of the group (required accessible name). */
  label: string;
  /** Accessible name of the start field. Default: localized "Start date". */
  startLabel?: string;
  /** Accessible name of the end field. Default: localized "End date". */
  endLabel?: string;
  /** Inclusive range; also the value restored by reset(). */
  value?: Range<PlainDate> | null;
  min?: PlainDate | null;
  max?: PlainDate | null;
  /** Minimum range length in days, counting the start and end day. */
  minDays?: number;
  /** Maximum range length in days, counting the start and end day. */
  maxDays?: number;
  /** Form field name: `Form` and the hidden input carry the ISO 8601 interval `YYYY-MM-DD/YYYY-MM-DD`. */
  name?: string;
  /** Optional field names of the start and end dates' own hidden inputs (native form posts). */
  startName?: string;
  endName?: string;
  description?: string;
  /** Both dates are required. */
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Disable days in the calendar; a typed disabled day is invalid. */
  isDateDisabled?: (date: PlainDate) => boolean;
  /** Business calendar (since 0.9.0): non-working days and holidays are marked and named in the calendar. */
  businessCalendar?: BusinessCalendarEngine | null;
  /** With `businessCalendar`: non-working days cannot be picked or typed as range ends (since 0.9.0). */
  disableNonWorking?: boolean;
  /** Consumer validation of a complete range; return a message to mark it invalid. */
  validate?: (value: Range<PlainDate> | null) => string | null;
  firstDayOfWeek?: Weekday;
  locale?: string;
  timezone?: string;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<DateRangePickerIcons>;
}

const isPlainDate = (v: unknown): v is PlainDate => typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'PlainDate';
const lengthInDays = (r: Range<PlainDate>): number => Math.round((fieldsToEpoch(r.end.year, r.end.month, r.end.day) - fieldsToEpoch(r.start.year, r.start.month, r.start.day)) / 86_400_000) + 1;
const VALID: DateRangePickerValidity = Object.freeze({ valid: true, error: null, message: '', field: null });

export class DateRangePicker implements FormControl {
  readonly host: HTMLElement;
  /** The labelled `role="group"` around both fields. */
  readonly group: HTMLDivElement;
  /** Start date field (date granularity). Not registered with `Form`. */
  readonly startInput: DateInput;
  /** End date field; the calendar button sits inside its boundary. Not registered with `Form`. */
  readonly endInput: DateInput;
  /** The range Calendar inside the popup. */
  readonly calendar: Calendar;
  readonly button: HTMLButtonElement;
  /** `role="dialog"` popup (Popover API, non-modal). */
  readonly popup: HTMLDivElement;
  #options: DateRangePickerOptions;
  #value: Range<PlainDate> | null = null;
  #validity: DateRangePickerValidity = VALID;
  #customError: string | null = null;
  #popover: PopoverHandle | null = null;
  #stopPosition: Disposer | null = null;
  /** Common settings last forwarded to the children (config changes only re-apply real changes). */
  #applied = '';
  readonly #doc: Document;
  readonly #label: HTMLDivElement;
  readonly #fields: HTMLDivElement;
  readonly #description: HTMLDivElement;
  readonly #hidden: HTMLInputElement;
  readonly #group = new DisposableGroup();

  /** Render a date range picker into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: DateRangePickerOptions): DateRangePicker {
    return new DateRangePicker(host, options);
  }

  private constructor(host: HTMLElement, options: DateRangePickerOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#doc;
    const config = this.#config();

    this.#label = doc.createElement('div');
    this.#label.className = 'aui-date-range-picker__label';
    this.#label.id = createId('aui-date-range-picker-label');
    this.group = doc.createElement('div');
    this.group.className = 'aui-date-range-picker__group';
    this.group.setAttribute('role', 'group');
    this.group.setAttribute('aria-labelledby', this.#label.id);
    this.#fields = doc.createElement('div');
    this.#fields.className = 'aui-date-range-picker__fields';
    const startHost = doc.createElement('div');
    startHost.className = 'aui-date-range-picker__start';
    const separator = doc.createElement('span');
    separator.className = 'aui-date-range-picker__separator';
    separator.setAttribute('aria-hidden', 'true');
    separator.textContent = 'to';
    const endHost = doc.createElement('div');
    endHost.className = 'aui-date-range-picker__end';
    this.#fields.append(startHost, separator, endHost);
    this.#description = doc.createElement('div');
    this.#description.className = 'aui-date-range-picker__description';
    this.#description.id = createId('aui-date-range-picker-desc');
    this.#hidden = doc.createElement('input');
    this.#hidden.type = 'hidden';
    this.group.append(this.#label, this.#fields, this.#description, this.#hidden);

    const trailing = doc.createElement('div');
    trailing.className = 'aui-date-range-picker__trailing';
    this.button = doc.createElement('button');
    this.button.type = 'button';
    this.button.className = 'aui-date-range-picker__button';
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');
    this.popup = doc.createElement('div');
    this.popup.id = createId('aui-date-range-picker-popup');
    this.popup.className = 'aui-date-range-picker__popup';
    this.popup.setAttribute('role', 'dialog');
    this.popup.setAttribute('aria-modal', 'false');
    // Hidden by the UA stylesheet until shown in the top layer.
    this.popup.popover = 'manual';
    this.button.setAttribute('aria-controls', this.popup.id);
    const calendarHost = doc.createElement('div');
    this.popup.append(calendarHost);
    // The popup lives inside the end field boundary so moving focus into it keeps the field untouched.
    trailing.append(this.button, this.popup);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    // The children attach their own listeners, so a failure tears them down again.
    const created: { destroy(): void }[] = [];
    try {
      this.startInput = DateInput.create(startHost, { ...this.#inputOptions('start', options, config), label: this.#fieldLabel('start', config), granularity: 'date', formControl: false });
      created.push(this.startInput);
      this.endInput = DateInput.create(endHost, { ...this.#inputOptions('end', options, config), label: this.#fieldLabel('end', config), granularity: 'date', trailing, formControl: false });
      created.push(this.endInput);
      this.calendar = Calendar.create(calendarHost, this.#calendarOptions(options, config));
    } catch (error) {
      for (const c of created) c.destroy();
      throw error;
    }
    host.classList.add('aui-date-range-picker');
    host.replaceChildren(this.group);
    this.#compute();
    this.#render();
    this.#bindEvents(startHost, endHost, calendarHost);
    this.#group.add(registerControl(this));
    this.#applied = this.#commonKey(config);
    this.#group.add(dateRangePickerConfig.subscribe(() => {
      // Updating a Date Input re-writes its segments, so skip no-op changes to keep partial input.
      if (this.#commonKey(this.#config()) !== this.#applied) this.#syncChildren({});
      else this.#render();
    }));
  }

  /** The inclusive range, or null when empty, incomplete, or invalid (a custom error keeps it). */
  get value(): Range<PlainDate> | null {
    return this.#value;
  }

  get validity(): DateRangePickerValidity {
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
    return this.startInput.dirty || this.endInput.dirty;
  }

  get touched(): boolean {
    return this.startInput.touched || this.endInput.touched;
  }

  get options(): Readonly<DateRangePickerOptions> {
    return this.#options;
  }

  /** ISO 8601 interval `YYYY-MM-DD/YYYY-MM-DD`, or null when there is no valid range. */
  getFormValue(): string | null {
    const v = this.#value;
    return v ? `${plainDateToString(v.start)}/${plainDateToString(v.end)}` : null;
  }

  reportValidity(): boolean {
    // Both fields show their messages (a range error is shown on its field).
    this.startInput.reportValidity();
    this.endInput.reportValidity();
    return this.#validity.valid;
  }

  setCustomError(message: string | null): void {
    this.#customError = message === '' ? null : message;
    this.#compute();
    this.#render();
  }

  /** Focus the first segment of the start date. */
  focus(): void {
    this.startInput.focus();
  }

  /** Close, restore the initial value, and clear touched/submitted state (no `aui-change`). */
  reset(): void {
    this.close();
    this.#customError = null;
    this.startInput.reset();
    this.endInput.reset();
    this.#compute();
    this.#render();
  }

  /** Set the value programmatically (no `aui-change` event). Clears an external custom error. */
  setValue(value: Range<PlainDate> | null): void {
    this.#assertRange(value, 'value');
    this.#customError = null;
    this.#write(value);
    if (this.#popover) this.calendar.setRange(this.#value);
  }

  update(options: Partial<DateRangePickerOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    this.#syncChildren(options);
    if (next.disabled || next.readOnly) this.close();
  }

  /** Open the calendar and move focus to the start of the range (or today). */
  open(): void {
    if (this.#popover || this.#options.disabled || this.#options.readOnly) return;
    const config = this.#config();
    const view = this.#doc.defaultView;
    const months = config.months === 'auto' ? (view?.matchMedia('(min-width: 40rem)').matches ? 2 : 1) : config.months;
    this.calendar.update({ visibleMonths: months });
    this.calendar.setRange(this.#value);
    const start = this.startInput.value;
    this.calendar.goTo(this.#value?.start ?? (start?.kind === 'PlainDate' ? start : this.calendar.today));
    this.#popover = openPopover(this.popup, {
      inside: [this.button],
      onDismiss: () => {
        this.close();
      },
    });
    this.#stopPosition = autoPosition(this.#fields, this.popup, { placement: 'bottom-start', direction: config.direction });
    this.button.setAttribute('aria-expanded', 'true');
    this.calendar.focus();
    emit(this.host, 'aui-open', null, { bubbles: false });
  }

  /** Close the calendar; an unfinished range pick is discarded. Focus inside the popup returns to the button. */
  close(): void {
    if (!this.#popover) return;
    const hadFocus = this.popup.contains(this.#doc.activeElement);
    // Clear state first: hiding the popover can move focus and re-enter close() via focusout.
    const handle = this.#popover;
    this.#popover = null;
    this.#stopPosition?.();
    this.#stopPosition = null;
    handle.close();
    this.button.setAttribute('aria-expanded', 'false');
    if (hadFocus) this.button.focus();
    emit(this.host, 'aui-close', null, { bubbles: false });
  }

  destroy(): void {
    this.close();
    this.#group.dispose();
    this.calendar.destroy();
    this.startInput.destroy();
    this.endInput.destroy();
    this.host.replaceChildren();
    this.host.classList.remove('aui-date-range-picker', 'aui-date-range-picker--disabled');
  }

  #config(options: DateRangePickerOptions = this.#options): Resolved {
    const o = options;
    return dateRangePickerConfig.resolve({
      ...(o.closeOnSelect === undefined ? {} : { closeOnSelect: o.closeOnSelect }),
      ...(o.months === undefined ? {} : { months: o.months }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.timezone === undefined ? {} : { timezone: o.timezone }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #fail(property: string, expected: string): never {
    throw configurationError('DATE_RANGE_PICKER_OPTIONS', 'Invalid date range picker options.', { component: 'dateRangePicker', property: `dateRangePicker.${property}`, expected });
  }

  #assertRange(value: unknown, property: string): void {
    if (value === null || value === undefined) return;
    if (typeof value !== 'object' || !('start' in value) || !('end' in value) || !isPlainDate(value.start) || !isPlainDate(value.end)) {
      this.#fail(property, '{ start: PlainDate; end: PlainDate } or null');
    } else if (comparePlainDate(value.start, value.end) > 0) this.#fail(property, 'start <= end');
  }

  #assertOptions(options: DateRangePickerOptions): void {
    if (typeof options.label !== 'string' || options.label.trim() === '') this.#fail('label', 'non-empty string (accessible name)');
    for (const key of ['startLabel', 'endLabel'] as const) {
      const v: unknown = options[key];
      if (v !== undefined && (typeof v !== 'string' || v.trim() === '')) this.#fail(key, 'non-empty string');
    }
    this.#assertRange(options.value, 'value');
    for (const key of ['min', 'max'] as const) {
      const v: unknown = options[key];
      if (v !== undefined && v !== null && !isPlainDate(v)) this.#fail(key, 'PlainDate');
    }
    if (options.min && options.max && comparePlainDate(options.min, options.max) > 0) this.#fail('min', 'min <= max');
    for (const key of ['minDays', 'maxDays'] as const) {
      const v = options[key];
      if (v !== undefined && !validators.integerInRange(1, 100_000)(v)) this.#fail(key, 'positive integer (days)');
    }
    if (options.minDays !== undefined && options.maxDays !== undefined && options.minDays > options.maxDays) this.#fail('minDays', 'minDays <= maxDays');
    if (options.isDateDisabled !== undefined && typeof options.isDateDisabled !== 'function') this.#fail('isDateDisabled', '(date: PlainDate) => boolean');
    assertBusinessDayOptions(options, (property, expected) => this.#fail(property, expected));
    if (options.validate !== undefined && typeof options.validate !== 'function') this.#fail('validate', '(value: Range<PlainDate> | null) => string | null');
    // Validates timezone, locale, direction, closeOnSelect, and months.
    this.#config(options);
  }

  #fieldLabel(which: 'start' | 'end', config: Resolved): string {
    const o = this.#options;
    return (which === 'start' ? o.startLabel : o.endLabel) ?? getMessage('dateRangePicker', which === 'start' ? 'startDate' : 'endDate', {}, config.locale);
  }

  /** Options forwarded to a Date Input. Resolved common settings keep all children consistent. */
  #inputOptions(which: 'start' | 'end', o: Partial<DateRangePickerOptions>, config: Resolved): Partial<DateInputOptions> {
    const name = which === 'start' ? o.startName : o.endName;
    return {
      ...('value' in o ? { value: o.value ? o.value[which] : null } : {}),
      ...('min' in o ? { min: o.min ?? null } : {}),
      ...('max' in o ? { max: o.max ?? null } : {}),
      ...(name === undefined ? {} : { name }),
      ...(o.required === undefined ? {} : { required: o.required }),
      ...(o.disabled === undefined ? {} : { disabled: o.disabled }),
      ...(o.readOnly === undefined ? {} : { readOnly: o.readOnly }),
      locale: config.locale,
      timezone: config.timezone,
      direction: config.direction,
    };
  }

  #calendarOptions(o: Partial<DateRangePickerOptions>, config: Resolved): Partial<CalendarOptions> {
    return {
      selectionMode: 'range',
      ...('min' in o ? { min: o.min ?? null } : {}),
      ...('max' in o ? { max: o.max ?? null } : {}),
      ...businessCalendarOptions(o),
      ...(o.firstDayOfWeek === undefined ? {} : { firstDayOfWeek: o.firstDayOfWeek }),
      ...('minDays' in o ? { minDays: o.minDays } : {}),
      ...('maxDays' in o ? { maxDays: o.maxDays } : {}),
      locale: config.locale,
      timezone: config.timezone,
      direction: config.direction,
    };
  }

  #commonKey(config: Resolved): string {
    return `${config.locale}|${config.timezone}|${config.direction}`;
  }

  #syncChildren(changed: Partial<DateRangePickerOptions>): void {
    const config = this.#config();
    this.#applied = this.#commonKey(config);
    for (const which of ['start', 'end'] as const) {
      const input = which === 'start' ? this.startInput : this.endInput;
      input.update({ ...this.#inputOptions(which, changed, config), label: this.#fieldLabel(which, config) });
    }
    this.calendar.update(this.#calendarOptions(changed, config));
    this.#compute();
    this.#render();
  }

  #bindEvents(startHost: HTMLElement, endHost: HTMLElement, calendarHost: HTMLElement): void {
    const g = this.#group;
    g.listen(this.button, 'click', () => {
      if (this.#popover) this.close();
      else this.open();
    });
    // Alt+ArrowDown on a segment of either field opens the calendar. Capture phase, so the
    // segment's own ArrowDown (decrement) never runs for this chord.
    for (const input of [this.startInput, this.endInput]) {
      g.listen(input.group, 'keydown', (event) => {
        if (event.key !== 'ArrowDown' || !event.altKey || !(event.target instanceof HTMLInputElement)) return;
        event.preventDefault();
        event.stopPropagation();
        this.open();
      }, { capture: true });
    }
    // Tabbing out of the non-modal popup closes it.
    g.listen(this.popup, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && !this.popup.contains(next) && next !== this.button) this.close();
    });
    const onCustom = (target: HTMLElement, type: string, handler: (event: Event) => void): void => {
      target.addEventListener(type, handler);
      g.add(() => {
        target.removeEventListener(type, handler);
      });
    };
    // A completed calendar range writes both fields.
    onCustom(calendarHost, 'aui-change', (event) => {
      event.stopPropagation();
      if (!(event instanceof CustomEvent)) return;
      const { range } = event.detail as CalendarChangeDetail;
      if (range) this.#pick(range);
    });
    // Typing: re-emit from the picker host with the range detail shape.
    for (const fieldHost of [startHost, endHost]) {
      onCustom(fieldHost, 'aui-change', (event) => {
        if (event.target !== fieldHost) return;
        event.stopPropagation();
        // An external error describes the previous value; user edits clear it.
        this.#customError = null;
        this.#commit();
      });
    }
  }

  #pick(range: Range<PlainDate>): void {
    this.#customError = null;
    this.startInput.setValue(range.start);
    this.endInput.setValue(range.end);
    this.#commit();
    if (this.#config().closeOnSelect) this.close();
  }

  /** Recompute after a user change and emit when the value or validity changed. */
  #commit(): void {
    const before = this.#value;
    const beforeError = this.#validity.error;
    this.#compute();
    this.#render();
    if (!this.#sameRange(before, this.#value) || beforeError !== this.#validity.error) {
      emit(this.host, 'aui-change', { value: this.#value, validity: this.#validity } satisfies DateRangePickerChangeDetail);
    }
  }

  #write(value: Range<PlainDate> | null): void {
    this.startInput.setValue(value?.start ?? null);
    this.endInput.setValue(value?.end ?? null);
    this.#compute();
    this.#render();
  }

  #sameRange(a: Range<PlainDate> | null, b: Range<PlainDate> | null): boolean {
    if (a === null || b === null) return a === b;
    return comparePlainDate(a.start, b.start) === 0 && comparePlainDate(a.end, b.end) === 0;
  }

  /**
   * Derive value and validity. Field errors (incomplete, invalid, required, min/max)
   * come from each Date Input; range errors are set on the field they concern, so each
   * message appears under its field with that field's message timing.
   */
  #compute(): void {
    const o = this.#options;
    const locale = this.#config().locale;
    const m = (key: string, params: Record<string, string> = {}): string => getMessage('dateRangePicker', key, params, locale);
    this.startInput.setCustomError(null);
    this.endInput.setCustomError(null);
    const read = (input: DateInput): PlainDate | null => {
      const v = input.value;
      return v?.kind === 'PlainDate' ? v : null;
    };
    const start = read(this.startInput);
    const end = read(this.endInput);
    let validity: DateRangePickerValidity = VALID;
    const fail = (error: DateRangePickerError, field: 'start' | 'end', message: string): void => {
      validity = Object.freeze({ valid: false, error, message, field });
    };
    const sv = this.startInput.validity;
    const ev = this.endInput.validity;
    let own = true;
    if (!sv.valid && sv.error) {
      fail(sv.error, 'start', sv.message);
      own = false;
    } else if (!ev.valid && ev.error) {
      fail(ev.error, 'end', ev.message);
      own = false;
    } else if (start === null && end !== null) fail('incomplete-range', 'start', m('enterStart'));
    else if (start !== null && end === null) fail('incomplete-range', 'end', m('enterEnd'));
    else if (start !== null && end !== null) {
      const range = { start, end };
      if (comparePlainDate(start, end) > 0) fail('range-reversed', 'end', m('reversed'));
      else if (isUnavailable(o, start)) fail('date-unavailable', 'start', m('dateUnavailable'));
      else if (isUnavailable(o, end)) fail('date-unavailable', 'end', m('dateUnavailable'));
      else if (o.minDays !== undefined && lengthInDays(range) < o.minDays) fail('range-too-short', 'end', m('tooShort', { count: formatNumber(o.minDays, {}, locale) }));
      else if (o.maxDays !== undefined && lengthInDays(range) > o.maxDays) fail('range-too-long', 'end', o.maxDays === 1 ? m('tooLongOne') : m('tooLong', { count: formatNumber(o.maxDays, {}, locale) }));
    }
    const value = validity.valid && start !== null && end !== null ? Object.freeze({ start, end }) : null;
    // Precedence: field and range constraints, then `validate`, then an external custom error.
    if (validity.valid) {
      const custom = runValidator(o.validate, value) ?? this.#customError;
      if (custom !== null) fail('custom', 'end', custom);
    }
    if (own && !validity.valid) (validity.field === 'start' ? this.startInput : this.endInput).setCustomError(validity.message);
    // A custom error keeps the parsed range (as in Date Input and Time Picker).
    this.#value = validity.valid || validity.error === 'custom' ? value : null;
    this.#validity = validity;
    this.#hidden.value = this.getFormValue() ?? '';
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const value = this.#value;
    const disabled = o.disabled ?? false;
    renderLabel(this.#label, o.label, o.required ?? false);
    this.#description.textContent = o.description ?? '';
    this.#description.hidden = !o.description;
    setDescribedBy(this.group, o.description ? [this.#description.id] : []);
    const date = (d: PlainDate): string => formatPlainDate(d, { dateStyle: 'long' }, config.locale);
    this.button.setAttribute('aria-label', value ? getMessage('dateRangePicker', 'changeDates', { start: date(value.start), end: date(value.end) }, config.locale) : getMessage('dateRangePicker', 'chooseDates', {}, config.locale));
    this.button.disabled = disabled || (o.readOnly ?? false);
    this.button.replaceChildren(renderIcon(o.icons?.calendar ?? 'calendar', { doc: this.#doc }));
    this.popup.setAttribute('aria-label', getMessage('dateRangePicker', 'chooseDates', {}, config.locale));
    if (o.name) this.#hidden.name = o.name;
    else this.#hidden.removeAttribute('name');
    // Like native controls, a disabled picker is not submitted.
    this.#hidden.disabled = disabled;
    this.host.classList.toggle('aui-date-range-picker--disabled', disabled);
  }
}
