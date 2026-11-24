/**
 * DateTime Picker (SPEC section 18.7). A Date Input (minute granularity) plus a button
 * that opens a non-modal dialog popup (WAI-ARIA APG date picker dialog) holding a
 * Calendar and a listbox of suggested times. The value is an `Instant` (section 8.4):
 * typed and picked wall-clock times are resolved by the inner Date Input in the
 * configured timezone (UTC by default, section 8.1) with the DST disambiguation policy
 * (section 8.5), so both paths produce the same value, hints, and errors. The picker, not
 * its inner Date Input, is the form control `Form` discovers.
 */
import {
  AbsoluteUIError,
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  formatInstant,
  formatPlainTime,
  getMessage,
  plainDateTime,
  plainTime,
  registerMessages,
  toInstant,
  toPlainDateTime,
  validators,
  type Disambiguation,
  type Disposer,
  type Instant,
  type PlainDate,
  type PlainDateTime,
  type PlainTime,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { autoPosition, createTypeahead, getNextIndex, isPrintableKey, openPopover, type PopoverHandle } from '@absoluteui/utilities';
import { Calendar, type CalendarChangeDetail, type CalendarOptions, type Weekday } from '../calendar/calendar.js';
import { DateInput, type DateInputOptions, type DateInputValidity, type HourCycle } from '../date-input/date-input.js';
import { registerControl, type FormControl } from '../internal/field.js';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';
import { assertBusinessDayOptions, businessCalendarOptions, isUnavailable } from '../internal/business-days.js';

export interface DateTimePickerConfig {
  /** Close the popup after a time is picked (picking a day keeps it open). */
  closeOnSelect: boolean;
  /** Minutes between suggested times in the listbox. */
  step: number;
  /** Clock used by the segments and the suggested times. */
  hourCycle: HourCycle;
}

type Inherited = 'locale' | 'timezone' | 'disambiguation' | 'direction';
type Resolved = Readonly<DateTimePickerConfig & { locale: string; timezone: string; disambiguation: Disambiguation; direction: 'ltr' | 'rtl' }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    dateTimePicker: DateTimePickerConfig & { locale: string; timezone: string; disambiguation: Disambiguation; direction: 'ltr' | 'rtl' };
  }
}

export const dateTimePickerConfig = defineComponentConfig<DateTimePickerConfig, Inherited>(
  'dateTimePicker',
  {
    closeOnSelect: { default: true, expected: 'boolean', validate: validators.isBoolean },
    step: { default: 30, expected: 'integer 1..720 (minutes)', validate: validators.integerInRange(1, 720) },
    hourCycle: { default: 'auto', expected: '"auto" | "h12" | "h23"', validate: validators.oneOf(['auto', 'h12', 'h23'] as const) },
  },
  ['locale', 'timezone', 'disambiguation', 'direction'],
);

registerMessages('dateTimePicker', 'en', {
  chooseDateTime: 'Choose date and time',
  changeDateTime: 'Change date and time, {dateTime}',
  time: 'Time',
  done: 'Done',
  dateUnavailable: 'This date is not available.',
});

export interface DateTimePickerIcons {
  calendar: IconRef;
}

export interface DateTimePickerOptions extends Partial<DateTimePickerConfig> {
  /** Visible label (required accessible name for the field). */
  label: string;
  value?: Instant | null;
  /** Earliest allowed instant (inclusive); also bounds the calendar and the suggested times. */
  min?: Instant | null;
  /** Latest allowed instant (inclusive). */
  max?: Instant | null;
  /** Form field name; the hidden input carries the ISO 8601 instant (`Z`). */
  name?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Disable days in the calendar; a typed disabled day is reported as invalid. */
  isDateDisabled?: (date: PlainDate) => boolean;
  /** Business calendar (since 0.9.0): non-working days and holidays are marked and named in the calendar. */
  businessCalendar?: BusinessCalendarEngine | null;
  /** With `businessCalendar`: non-working days cannot be picked or typed (since 0.9.0). */
  disableNonWorking?: boolean;
  /** First column of the calendar. Default: the locale's first day of week. */
  firstDayOfWeek?: Weekday;
  locale?: string;
  timezone?: string;
  disambiguation?: Disambiguation;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<DateTimePickerIcons>;
  /**
   * Advanced, read at creation: set to false when a composite control (such as
   * Schedule Picker) registers itself with `Form` instead of this picker. Default true.
   */
  formControl?: boolean;
}

export interface DateTimePickerChangeDetail {
  value: Instant | null;
  validity: DateInputValidity;
}

const TYPEAHEAD_MS = 500;
const DAY_MINUTES = 1440;
/** Time of day used when a day is picked while the field is empty. */
const DEFAULT_MINUTES = 9 * 60;

const minutesOf = (t: PlainTime): number => t.hour * 60 + t.minute;

function isInstant(value: unknown): value is Instant {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'Instant';
}

export class DateTimePicker implements FormControl {
  readonly host: HTMLElement;
  /** The inner Date Input (minute granularity). Not registered with `Form`. */
  readonly input: DateInput;
  /** The Calendar inside the popup. */
  readonly calendar: Calendar;
  /** The trigger button inside the field boundary. */
  readonly button: HTMLButtonElement;
  /** `role="dialog"` popup (Popover API, non-modal). */
  readonly popup: HTMLDivElement;
  /** `role="listbox"` of suggested times inside the popup. */
  readonly listbox: HTMLDivElement;
  /** "Done" button that closes the popup. */
  readonly doneButton: HTMLButtonElement;
  #options: DateTimePickerOptions;
  #popover: PopoverHandle | null = null;
  #stopPosition: Disposer | null = null;
  /** External error set through `setCustomError`; the inner Date Input also carries the unavailable-day error. */
  #customError: string | null = null;
  /** Common settings last forwarded to the children (config changes only re-apply real changes). */
  #applied = '';
  #optionsKey = '';
  #suggestions: PlainTime[] = [];
  #optionEls: HTMLDivElement[] = [];
  #labels: string[] = [];
  #activeIndex = -1;
  #typingUntil = 0;
  readonly #typeahead = createTypeahead(TYPEAHEAD_MS);
  readonly #timeLabel: HTMLDivElement;
  readonly #doc: Document;
  readonly #group = new DisposableGroup();

  /** Render a date-time picker into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: DateTimePickerOptions): DateTimePicker {
    return new DateTimePicker(host, options);
  }

  private constructor(host: HTMLElement, options: DateTimePickerOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#doc;
    const config = this.#config();

    const field = doc.createElement('div');
    field.className = 'aui-date-time-picker__field';
    const trailing = doc.createElement('div');
    trailing.className = 'aui-date-time-picker__trailing';
    this.button = doc.createElement('button');
    this.button.type = 'button';
    this.button.className = 'aui-date-time-picker__button';
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');
    this.popup = doc.createElement('div');
    this.popup.id = createId('aui-date-time-picker-popup');
    this.popup.className = 'aui-date-time-picker__popup';
    this.popup.setAttribute('role', 'dialog');
    this.popup.setAttribute('aria-modal', 'false');
    // Hidden by the UA stylesheet until shown in the top layer.
    this.popup.popover = 'manual';
    this.button.setAttribute('aria-controls', this.popup.id);

    const body = doc.createElement('div');
    body.className = 'aui-date-time-picker__body';
    const calendarHost = doc.createElement('div');
    calendarHost.className = 'aui-date-time-picker__calendar';
    const time = doc.createElement('div');
    time.className = 'aui-date-time-picker__time';
    this.#timeLabel = doc.createElement('div');
    this.#timeLabel.className = 'aui-date-time-picker__time-label';
    this.#timeLabel.id = createId('aui-date-time-picker-time');
    this.listbox = doc.createElement('div');
    this.listbox.id = createId('aui-date-time-picker-listbox');
    this.listbox.className = 'aui-date-time-picker__listbox';
    this.listbox.setAttribute('role', 'listbox');
    this.listbox.setAttribute('aria-labelledby', this.#timeLabel.id);
    this.listbox.tabIndex = 0;
    time.append(this.#timeLabel, this.listbox);
    body.append(calendarHost, time);
    const footer = doc.createElement('div');
    footer.className = 'aui-date-time-picker__footer';
    this.doneButton = doc.createElement('button');
    this.doneButton.type = 'button';
    this.doneButton.className = 'aui-date-time-picker__done';
    footer.append(this.doneButton);
    this.popup.append(body, footer);
    // The popup lives inside the field boundary so moving focus into it keeps the field untouched.
    trailing.append(this.button, this.popup);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    // The children attach their own listeners, so a failure tears them down again.
    let input: DateInput | null = null;
    try {
      input = DateInput.create(field, { ...this.#inputOptions(options, config), label: options.label, granularity: 'minute', trailing, formControl: false });
      this.input = input;
      this.calendar = Calendar.create(calendarHost, this.#calendarOptions(config));
    } catch (error) {
      input?.destroy();
      throw error;
    }
    host.classList.add('aui-date-time-picker');
    host.replaceChildren(field);
    this.#applyUnavailable();
    this.#render();
    this.#bindEvents(field, calendarHost);
    if (options.formControl !== false) this.#group.add(registerControl(this));
    this.#applied = this.#commonKey(config);
    this.#group.add(dateTimePickerConfig.subscribe(() => {
      // Updating the Date Input re-writes its segments, so skip no-op changes to keep partial input.
      if (this.#commonKey(this.#config()) !== this.#applied) this.#syncChildren({});
      else this.#render();
    }));
  }

  get value(): Instant | null {
    const v = this.input.value;
    return v?.kind === 'Instant' ? v : null;
  }

  get validity(): DateInputValidity {
    return this.input.validity;
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
    return this.input.dirty;
  }

  get touched(): boolean {
    return this.input.touched;
  }

  get options(): Readonly<DateTimePickerOptions> {
    return this.#options;
  }

  /** ISO 8601 instant with `Z`, or null when empty or invalid. */
  getFormValue(): string | null {
    return this.input.getFormValue();
  }

  reportValidity(): boolean {
    return this.input.reportValidity();
  }

  setCustomError(message: string | null): void {
    this.#customError = message === '' ? null : message;
    this.#applyUnavailable();
  }

  /** Focus the first segment. */
  focus(): void {
    this.input.focus();
  }

  /** Close, restore the initial value, and clear touched/submitted state (no `aui-change`). */
  reset(): void {
    this.close();
    this.#customError = null;
    this.input.reset();
    this.#applyUnavailable();
    this.#render();
  }

  /** Set the value programmatically (no `aui-change` event). */
  setValue(value: Instant | null): void {
    if (value !== null && !isInstant(value)) this.#fail('value', 'Instant or null');
    this.input.setValue(value);
    this.#applyUnavailable();
    this.#afterValueChange();
  }

  update(options: Partial<DateTimePickerOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    this.#syncChildren(options);
    if (next.disabled || next.readOnly) this.close();
  }

  /** Open the popup and move focus to the selected day (or today). */
  open(): void {
    if (this.#popover || this.#options.disabled || this.#options.readOnly) return;
    const date = this.#local()?.date ?? null;
    this.calendar.setValue(date);
    this.calendar.goTo(date ?? this.calendar.today);
    this.#popover = openPopover(this.popup, {
      inside: [this.button],
      onDismiss: () => {
        this.close();
      },
    });
    this.#stopPosition = autoPosition(this.input.group, this.popup, { placement: 'bottom-start', direction: this.#config().direction });
    this.button.setAttribute('aria-expanded', 'true');
    this.#refreshOptions();
    this.#setActive(this.#nearestIndex(), 'center');
    this.calendar.focus();
    emit(this.host, 'aui-open', null, { bubbles: false });
  }

  /** Close the popup. Focus inside the popup returns to the trigger button. */
  close(): void {
    if (!this.#popover) return;
    const hadFocus = this.popup.contains(this.#doc.activeElement);
    // Clear state first: hiding the popover can move focus and re-enter close() via focusout.
    const handle = this.#popover;
    this.#popover = null;
    this.#stopPosition?.();
    this.#stopPosition = null;
    // Focus moves before the popup hides, so focus never falls to the body.
    if (hadFocus) this.button.focus();
    handle.close();
    this.#setActive(-1);
    this.#typeahead.reset();
    this.#typingUntil = 0;
    this.button.setAttribute('aria-expanded', 'false');
    emit(this.host, 'aui-close', null, { bubbles: false });
  }

  destroy(): void {
    this.close();
    this.#group.dispose();
    this.#typeahead.reset();
    this.calendar.destroy();
    this.input.destroy();
    this.host.replaceChildren();
    this.host.classList.remove('aui-date-time-picker', 'aui-date-time-picker--disabled');
  }

  #config(options: DateTimePickerOptions = this.#options): Resolved {
    const o = options;
    return dateTimePickerConfig.resolve({
      ...(o.closeOnSelect === undefined ? {} : { closeOnSelect: o.closeOnSelect }),
      ...(o.step === undefined ? {} : { step: o.step }),
      ...(o.hourCycle === undefined ? {} : { hourCycle: o.hourCycle }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.timezone === undefined ? {} : { timezone: o.timezone }),
      ...(o.disambiguation === undefined ? {} : { disambiguation: o.disambiguation }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #fail(property: string, expected: string): never {
    throw configurationError('DATE_TIME_PICKER_OPTIONS', 'Invalid date-time picker options.', { component: 'dateTimePicker', property: `dateTimePicker.${property}`, expected });
  }

  #assertOptions(options: DateTimePickerOptions): void {
    if (typeof options.label !== 'string' || options.label.trim() === '') this.#fail('label', 'non-empty string (accessible name)');
    for (const key of ['value', 'min', 'max'] as const) {
      const v: unknown = options[key];
      if (v !== undefined && v !== null && !isInstant(v)) this.#fail(key, 'Instant or null');
    }
    if (options.min && options.max && options.min.epochMilliseconds > options.max.epochMilliseconds) this.#fail('min', 'min <= max');
    if (options.isDateDisabled !== undefined && typeof options.isDateDisabled !== 'function') this.#fail('isDateDisabled', '(date: PlainDate) => boolean');
    assertBusinessDayOptions(options, (property, expected) => this.#fail(property, expected));
    // Validates timezone, locale, disambiguation, direction, step, hourCycle, and closeOnSelect.
    this.#config(options);
  }

  /** Options forwarded to the inner Date Input. Resolved common settings keep the field and the popup consistent. */
  #inputOptions(o: Partial<DateTimePickerOptions>, config: Resolved): Partial<DateInputOptions> {
    return {
      ...(o.label === undefined ? {} : { label: o.label }),
      ...('value' in o ? { value: o.value ?? null } : {}),
      ...('min' in o ? { min: o.min ?? null } : {}),
      ...('max' in o ? { max: o.max ?? null } : {}),
      ...(o.name === undefined ? {} : { name: o.name }),
      ...(o.description === undefined ? {} : { description: o.description }),
      ...(o.required === undefined ? {} : { required: o.required }),
      ...(o.disabled === undefined ? {} : { disabled: o.disabled }),
      ...(o.readOnly === undefined ? {} : { readOnly: o.readOnly }),
      hourCycle: config.hourCycle,
      locale: config.locale,
      timezone: config.timezone,
      disambiguation: config.disambiguation,
      direction: config.direction,
    };
  }

  /** Calendar bounds are the local dates of `min`/`max` in the configured timezone, so they follow timezone changes. */
  #calendarOptions(config: Resolved): Partial<CalendarOptions> {
    const o = this.#options;
    const day = (bound: Instant | null | undefined): PlainDate | null => (bound ? toPlainDateTime(bound, config.timezone).date : null);
    return {
      min: day(o.min),
      max: day(o.max),
      ...businessCalendarOptions(o),
      ...(o.firstDayOfWeek === undefined ? {} : { firstDayOfWeek: o.firstDayOfWeek }),
      locale: config.locale,
      timezone: config.timezone,
      direction: config.direction,
    };
  }

  #commonKey(config: Resolved): string {
    return `${config.locale}|${config.timezone}|${config.disambiguation}|${config.direction}|${config.hourCycle}`;
  }

  #syncChildren(changed: Partial<DateTimePickerOptions>): void {
    const config = this.#config();
    this.#applied = this.#commonKey(config);
    this.input.update(this.#inputOptions(changed, config));
    this.calendar.update(this.#calendarOptions(config));
    this.#applyUnavailable();
    this.#afterValueChange();
  }

  /** The complete wall-clock date and time in the field (even one the timezone rejects), else null. */
  #local(): PlainDateTime | null {
    return this.input.localValue;
  }

  #bindEvents(field: HTMLElement, calendarHost: HTMLElement): void {
    const g = this.#group;
    g.listen(this.button, 'click', () => {
      if (this.#popover) this.close();
      else this.open();
    });
    // Alt+ArrowDown on a segment opens the popup. Capture phase, so the
    // segment's own ArrowDown (decrement) never runs for this chord.
    g.listen(this.input.group, 'keydown', (event) => {
      if (event.key !== 'ArrowDown' || !event.altKey || !(event.target instanceof HTMLInputElement)) return;
      event.preventDefault();
      event.stopPropagation();
      this.open();
    }, { capture: true });
    // Tabbing out of the non-modal popup closes it.
    g.listen(this.popup, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && !this.popup.contains(next) && next !== this.button) this.close();
    });
    g.listen(this.doneButton, 'click', () => {
      this.close();
    });
    g.listen(this.listbox, 'keydown', (event) => {
      this.#onListboxKeyDown(event);
    });
    g.listen(this.listbox, 'click', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="option"]') : null;
      if (target) this.#pickTime(Number(target.dataset.index));
    });
    // Without a value, the suggested times follow the calendar's focused day.
    g.listen(this.listbox, 'focus', () => {
      this.#refreshOptions();
    });
    const onCustom = (target: HTMLElement, type: string, handler: (event: Event) => void): void => {
      target.addEventListener(type, handler);
      g.add(() => {
        target.removeEventListener(type, handler);
      });
    };
    // Calendar selection: re-emitted from the picker host with the Date Input detail shape.
    onCustom(calendarHost, 'aui-change', (event) => {
      event.stopPropagation();
      if (!(event instanceof CustomEvent)) return;
      const { value } = event.detail as CalendarChangeDetail;
      this.#pickDate(value);
    });
    // Typing: re-emit the Date Input's change from the picker host.
    onCustom(field, 'aui-change', (event) => {
      if (event.target !== field) return;
      event.stopPropagation();
      // An external error describes the previous value; user edits clear it.
      this.#customError = null;
      this.#applyUnavailable();
      this.#afterValueChange();
      this.#emitChange();
    });
  }

  /** Choosing a day keeps the time of day in the field, else the first available suggestion from 09:00. */
  #pickDate(date: PlainDate): void {
    const time = this.#local()?.time ?? this.#defaultTime(date);
    this.#commit(plainDateTime(date, plainTime(time.hour, time.minute)));
  }

  /** Choosing a time keeps the date in the field, else the calendar's focused day. */
  #pickTime(index: number): void {
    const time = this.#suggestions[index];
    if (!time || this.#optionEls[index]?.getAttribute('aria-disabled') === 'true') return;
    const date = this.#local()?.date ?? this.calendar.focusedDate;
    this.#commit(plainDateTime(date, time));
    this.#setActive(index);
    if (this.#config().closeOnSelect) this.close();
  }

  /**
   * Write a wall-clock date-time through the Date Input, which resolves it with the
   * configured timezone and disambiguation (DST hint or error) exactly as if typed.
   */
  #commit(local: PlainDateTime): void {
    const before = this.value;
    const beforeValidity = this.validity;
    this.#customError = null;
    this.input.setLocalValue(local);
    this.#applyUnavailable();
    this.#afterValueChange();
    const after = this.value;
    const changed = (before?.epochMilliseconds ?? null) !== (after?.epochMilliseconds ?? null)
      || beforeValidity.error !== this.validity.error
      || beforeValidity.localTimeStatus !== this.validity.localTimeStatus;
    if (changed) this.#emitChange();
  }

  #defaultTime(date: PlainDate): PlainTime {
    const config = this.#config();
    const enabled = this.#suggestions.filter((t) => !this.#timeDisabled(date, t, config));
    return enabled.find((t) => minutesOf(t) >= DEFAULT_MINUTES) ?? enabled[0] ?? plainTime(9);
  }

  /** Sync the calendar, the listbox, and the button label with the field value. */
  #afterValueChange(): void {
    if (this.#popover) this.calendar.setValue(this.#local()?.date ?? null);
    this.#render();
    this.#refreshOptions();
  }

  #emitChange(): void {
    emit(this.host, 'aui-change', { value: this.value, validity: this.validity } satisfies DateTimePickerChangeDetail);
  }

  /** Apply the consumer's custom error, or the unavailable-day error for a typed disabled day. */
  #applyUnavailable(): void {
    const date = this.#local()?.date;
    const unavailable = date !== undefined && isUnavailable(this.#options, date);
    const message = this.#customError ?? (unavailable ? getMessage('dateTimePicker', 'dateUnavailable', {}, this.#config().locale) : null);
    this.input.setCustomError(message);
  }

  #isHour12(config: Resolved): boolean {
    if (config.hourCycle !== 'auto') return config.hourCycle === 'h12';
    const cycle = new Intl.DateTimeFormat(config.locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return cycle === 'h11' || cycle === 'h12';
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const value = this.value;
    const hour12 = this.#isHour12(config);
    const locale = config.locale;
    this.button.setAttribute(
      'aria-label',
      value
        ? getMessage('dateTimePicker', 'changeDateTime', { dateTime: formatInstant(value, { dateStyle: 'long', timeStyle: 'short', hourCycle: hour12 ? 'h12' : 'h23' }, config.timezone, locale) }, locale)
        : getMessage('dateTimePicker', 'chooseDateTime', {}, locale),
    );
    this.button.disabled = (o.disabled ?? false) || (o.readOnly ?? false);
    this.button.replaceChildren(renderIcon(o.icons?.calendar ?? 'calendar', { doc: this.#doc }));
    this.popup.setAttribute('aria-label', getMessage('dateTimePicker', 'chooseDateTime', {}, locale));
    this.#timeLabel.textContent = getMessage('dateTimePicker', 'time', {}, locale);
    this.doneButton.textContent = getMessage('dateTimePicker', 'done', {}, locale);
    this.host.classList.toggle('aui-date-time-picker--disabled', o.disabled ?? false);
    const key = `${locale}|${String(hour12)}|${String(config.step)}`;
    if (key !== this.#optionsKey) {
      this.#optionsKey = key;
      this.#buildOptions(config, hour12);
    }
  }

  /** Suggested times: every `step` minutes from midnight. Rebuilt only when locale, clock, or step change. */
  #buildOptions(config: Resolved, hour12: boolean): void {
    const doc = this.#doc;
    const active = this.#suggestions[this.#activeIndex];
    this.#suggestions = [];
    for (let m = 0; m < DAY_MINUTES; m += config.step) this.#suggestions.push(plainTime(Math.floor(m / 60), m % 60));
    const format = { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hourCycle: hour12 ? 'h12' : 'h23' } as const;
    this.#labels = this.#suggestions.map((t) => formatPlainTime(t, format, config.locale));
    this.#optionEls = this.#suggestions.map((_, index) => {
      const el = doc.createElement('div');
      el.id = createId('aui-date-time-picker-option');
      el.className = 'aui-date-time-picker__option';
      el.setAttribute('role', 'option');
      el.dataset.index = String(index);
      el.textContent = this.#labels[index] ?? '';
      return el;
    });
    this.listbox.replaceChildren(...this.#optionEls);
    this.#activeIndex = -1;
    if (this.#popover) {
      const keep = active ? this.#suggestions.findIndex((t) => minutesOf(t) === minutesOf(active)) : -1;
      this.#setActive(keep >= 0 ? keep : this.#nearestIndex());
    }
  }

  /** A suggestion is unavailable when, on `date`, it resolves outside `min`/`max`. */
  #timeDisabled(date: PlainDate, time: PlainTime, config: Resolved): boolean {
    const { min, max } = this.#options;
    if (!min && !max) return false;
    let at: Instant;
    try {
      at = toInstant(plainDateTime(date, time), config.timezone, config.disambiguation);
    } catch (e) {
      // A rejected DST time stays pickable so the user sees why it is invalid.
      if (e instanceof AbsoluteUIError) return false;
      throw e;
    }
    return (min !== null && min !== undefined && at.epochMilliseconds < min.epochMilliseconds) || (max !== null && max !== undefined && at.epochMilliseconds > max.epochMilliseconds);
  }

  /** Update selected and unavailable options in place (elements are kept, so pointer clicks are not lost). */
  #refreshOptions(): void {
    const config = this.#config();
    const local = this.#local();
    const date = local?.date ?? this.calendar.focusedDate;
    const selected = local ? minutesOf(local.time) : -1;
    this.#suggestions.forEach((t, index) => {
      const el = this.#optionEls[index];
      if (!el) return;
      el.setAttribute('aria-selected', String(minutesOf(t) === selected));
      const disabled = this.#timeDisabled(date, t, config);
      if (disabled) el.setAttribute('aria-disabled', 'true');
      else el.removeAttribute('aria-disabled');
    });
  }

  /** The option nearest the field's time of day, else the one nearest 09:00. */
  #nearestIndex(): number {
    if (this.#suggestions.length === 0) return -1;
    const local = this.#local();
    const target = local ? minutesOf(local.time) : DEFAULT_MINUTES;
    let best = 0;
    this.#suggestions.forEach((t, i) => {
      const b = this.#suggestions[best];
      if (b && Math.abs(minutesOf(t) - target) < Math.abs(minutesOf(b) - target)) best = i;
    });
    return best;
  }

  #setActive(index: number, block: ScrollLogicalPosition = 'nearest'): void {
    this.#optionEls[this.#activeIndex]?.classList.remove('aui-date-time-picker__option--active');
    this.#activeIndex = index;
    const active = this.#optionEls[index];
    if (active && this.#popover) {
      active.classList.add('aui-date-time-picker__option--active');
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
        if (this.#activeIndex >= 0) this.#pickTime(this.#activeIndex);
        return;
      default:
        // Escape is handled by the overlay stack (document capture).
        return;
    }
  }
}
