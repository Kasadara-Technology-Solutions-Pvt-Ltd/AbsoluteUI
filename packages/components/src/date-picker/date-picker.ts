/**
 * Date Picker (SPEC section 18.7). A Date Input (date granularity) plus a calendar
 * button that opens a Calendar in a non-modal dialog popup (WAI-ARIA APG date
 * picker dialog). Typing and picking produce the same `PlainDate` value (section 8.4).
 * The popup renders in the top layer (Popover API) and is positioned under the
 * field by the positioning engine. The picker, not its inner Date Input, is the
 * form control `Form` discovers.
 */
import {
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  formatPlainDate,
  getMessage,
  plainDatesEqual,
  registerMessages,
  validators,
  type Disposer,
  type PlainDate,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { autoPosition, openPopover, type PopoverHandle } from '@absoluteui/utilities';
import { Calendar, type CalendarChangeDetail, type CalendarOptions, type Weekday } from '../calendar/calendar.js';
import { DateInput, type DateInputOptions, type DateInputValidity } from '../date-input/date-input.js';
import { registerControl, type FormControl } from '../internal/field.js';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';
import { businessCalendarOptions, isUnavailable } from '../internal/business-days.js';

export interface DatePickerConfig {
  /** Close the popup after a day is picked. */
  closeOnSelect: boolean;
}

type Inherited = 'locale' | 'timezone' | 'direction';
type Resolved = Readonly<DatePickerConfig & { locale: string; timezone: string; direction: 'ltr' | 'rtl' }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    datePicker: DatePickerConfig & { locale: string; timezone: string; direction: 'ltr' | 'rtl' };
  }
}

export const datePickerConfig = defineComponentConfig<DatePickerConfig, Inherited>(
  'datePicker',
  { closeOnSelect: { default: true, expected: 'boolean', validate: validators.isBoolean } },
  ['locale', 'timezone', 'direction'],
);

registerMessages('datePicker', 'en', {
  chooseDate: 'Choose date',
  changeDate: 'Change date, {date}',
  dateUnavailable: 'This date is not available.',
});

export interface DatePickerIcons {
  calendar: IconRef;
}

export interface DatePickerOptions extends Partial<DatePickerConfig> {
  /** Visible label (required accessible name for the field). */
  label: string;
  value?: PlainDate | null;
  min?: PlainDate | null;
  max?: PlainDate | null;
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
  direction?: 'ltr' | 'rtl';
  icons?: Partial<DatePickerIcons>;
  /**
   * Advanced, read at creation: set to false when a composite control (such as
   * Schedule Picker) registers itself with `Form` instead of this picker. Default true.
   */
  formControl?: boolean;
}

export interface DatePickerChangeDetail {
  value: PlainDate | null;
  validity: DateInputValidity;
}

export class DatePicker implements FormControl {
  readonly host: HTMLElement;
  /** The inner Date Input (date granularity). Not registered with `Form`. */
  readonly input: DateInput;
  /** The Calendar inside the popup. */
  readonly calendar: Calendar;
  /** The calendar button inside the field boundary. */
  readonly button: HTMLButtonElement;
  /** `role="dialog"` popup (Popover API, non-modal). */
  readonly popup: HTMLDivElement;
  #options: DatePickerOptions;
  #popover: PopoverHandle | null = null;
  #stopPosition: Disposer | null = null;
  /** External error set through `setCustomError`; the inner Date Input also carries the unavailable-day error. */
  #customError: string | null = null;
  /** Common settings last forwarded to the children (config changes only re-apply real changes). */
  #applied = '';
  readonly #doc: Document;
  readonly #group = new DisposableGroup();

  /** Render a date picker into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: DatePickerOptions): DatePicker {
    return new DatePicker(host, options);
  }

  private constructor(host: HTMLElement, options: DatePickerOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#doc;
    const config = this.#config();

    const field = doc.createElement('div');
    field.className = 'aui-date-picker__field';
    const trailing = doc.createElement('div');
    trailing.className = 'aui-date-picker__trailing';
    this.button = doc.createElement('button');
    this.button.type = 'button';
    this.button.className = 'aui-date-picker__button';
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');
    this.popup = doc.createElement('div');
    this.popup.id = createId('aui-date-picker-popup');
    this.popup.className = 'aui-date-picker__popup';
    this.popup.setAttribute('role', 'dialog');
    this.popup.setAttribute('aria-modal', 'false');
    // Hidden by the UA stylesheet until shown in the top layer.
    this.popup.popover = 'manual';
    this.button.setAttribute('aria-controls', this.popup.id);
    const calendarHost = doc.createElement('div');
    this.popup.append(calendarHost);
    // The popup lives inside the field boundary so moving focus into it keeps the field untouched.
    trailing.append(this.button, this.popup);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    // The children attach their own listeners, so a failure tears them down again.
    let input: DateInput | null = null;
    try {
      input = DateInput.create(field, { ...this.#inputOptions(options, config), label: options.label, granularity: 'date', trailing, formControl: false });
      this.input = input;
      this.calendar = Calendar.create(calendarHost, this.#calendarOptions(options, config));
    } catch (error) {
      input?.destroy();
      throw error;
    }
    host.classList.add('aui-date-picker');
    host.replaceChildren(field);
    this.#applyUnavailable();
    this.#render();
    this.#bindEvents(field, calendarHost);
    if (options.formControl !== false) this.#group.add(registerControl(this));
    this.#applied = this.#commonKey(config);
    this.#group.add(datePickerConfig.subscribe(() => {
      // Updating the Date Input re-writes its segments, so skip no-op changes to keep partial input.
      if (this.#commonKey(this.#config()) !== this.#applied) this.#syncChildren({});
      else this.#render();
    }));
  }

  get value(): PlainDate | null {
    const v = this.input.value;
    return v?.kind === 'PlainDate' ? v : null;
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

  get options(): Readonly<DatePickerOptions> {
    return this.#options;
  }

  /** ISO 8601 `YYYY-MM-DD`, or null when empty or invalid. */
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

  /** Focus the first date segment. */
  focus(): void {
    this.input.focus();
  }

  /** Restore the initial value and clear touched/submitted state (no `aui-change`). */
  reset(): void {
    this.close();
    this.#customError = null;
    this.input.reset();
    this.#applyUnavailable();
    this.#render();
  }

  /** Set the value programmatically (no `aui-change` event). */
  setValue(value: PlainDate | null): void {
    this.input.setValue(value);
    this.#applyUnavailable();
    this.calendar.setValue(this.value);
    this.#render();
  }

  update(options: Partial<DatePickerOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    this.#syncChildren(options);
    if (next.disabled || next.readOnly) this.close();
  }

  /** Open the calendar and move focus to the selected day (or today). */
  open(): void {
    if (this.#popover || this.#options.disabled || this.#options.readOnly) return;
    const value = this.value;
    this.calendar.setValue(value);
    this.calendar.goTo(value ?? this.calendar.today);
    this.#popover = openPopover(this.popup, {
      inside: [this.button],
      onDismiss: () => {
        this.close();
      },
    });
    this.#stopPosition = autoPosition(this.input.group, this.popup, { placement: 'bottom-start', direction: this.#config().direction });
    this.button.setAttribute('aria-expanded', 'true');
    this.calendar.focus();
    emit(this.host, 'aui-open', null, { bubbles: false });
  }

  /** Close the calendar. Focus inside the popup returns to the calendar button. */
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
    this.input.destroy();
    this.host.replaceChildren();
    this.host.classList.remove('aui-date-picker');
  }

  #config(options: DatePickerOptions = this.#options): Resolved {
    const o = options;
    return datePickerConfig.resolve({
      ...(o.closeOnSelect === undefined ? {} : { closeOnSelect: o.closeOnSelect }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.timezone === undefined ? {} : { timezone: o.timezone }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #assertOptions(options: DatePickerOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('DATE_PICKER_OPTIONS', 'Invalid date picker options.', { component: 'datePicker', property: `datePicker.${property}`, expected });
    };
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    for (const key of ['value', 'min', 'max'] as const) {
      const v: unknown = options[key];
      if (v !== undefined && v !== null && (typeof v !== 'object' || !('kind' in v) || v.kind !== 'PlainDate')) fail(key, 'PlainDate');
    }
    // Validates timezone, locale, direction, and closeOnSelect.
    this.#config(options);
  }

  /** Options forwarded to the inner Date Input. Resolved common settings keep both children consistent. */
  #inputOptions(o: Partial<DatePickerOptions>, config: Resolved): Partial<DateInputOptions> {
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
      locale: config.locale,
      timezone: config.timezone,
      direction: config.direction,
    };
  }

  #calendarOptions(o: Partial<DatePickerOptions>, config: Resolved): Partial<CalendarOptions> {
    return {
      ...('min' in o ? { min: o.min ?? null } : {}),
      ...('max' in o ? { max: o.max ?? null } : {}),
      ...businessCalendarOptions(o),
      ...(o.firstDayOfWeek === undefined ? {} : { firstDayOfWeek: o.firstDayOfWeek }),
      locale: config.locale,
      timezone: config.timezone,
      direction: config.direction,
    };
  }

  #commonKey(config: Resolved): string {
    return `${config.locale}|${config.timezone}|${config.direction}`;
  }

  #syncChildren(changed: Partial<DatePickerOptions>): void {
    const config = this.#config();
    this.#applied = this.#commonKey(config);
    this.input.update(this.#inputOptions(changed, config));
    this.calendar.update(this.#calendarOptions(changed, config));
    this.#applyUnavailable();
    this.#render();
  }

  #bindEvents(field: HTMLElement, calendarHost: HTMLElement): void {
    const g = this.#group;
    g.listen(this.button, 'click', () => {
      if (this.#popover) this.close();
      else this.open();
    });
    // Alt+ArrowDown on a segment opens the calendar. Capture phase, so the
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
    // Calendar selection: re-emitted from the picker host with the Date Input detail shape.
    const onCustom = (target: HTMLElement, type: string, handler: (event: Event) => void): void => {
      target.addEventListener(type, handler);
      g.add(() => {
        target.removeEventListener(type, handler);
      });
    };
    onCustom(calendarHost, 'aui-change', (event) => {
      event.stopPropagation();
      if (!(event instanceof CustomEvent)) return;
      const { value } = event.detail as CalendarChangeDetail;
      this.#pick(value);
    });
    // Typing: re-emit the Date Input's change from the picker host.
    onCustom(field, 'aui-change', (event) => {
      if (event.target !== field) return;
      event.stopPropagation();
      // An external error describes the previous value; user edits clear it.
      this.#customError = null;
      this.#applyUnavailable();
      if (this.#popover) this.calendar.setValue(this.value);
      this.#render();
      this.#emitChange();
    });
  }

  #pick(date: PlainDate): void {
    const before = this.value;
    const beforeError = this.validity.error;
    this.#customError = null;
    this.input.setValue(date);
    this.#applyUnavailable();
    this.#render();
    if (!plainDatesEqual(before, this.value) || beforeError !== this.validity.error) this.#emitChange();
    if (this.#config().closeOnSelect) this.close();
  }

  #emitChange(): void {
    emit(this.host, 'aui-change', { value: this.value, validity: this.validity } satisfies DatePickerChangeDetail);
  }

  /** Apply the consumer's custom error, or the unavailable-day error for a typed disabled day. */
  #applyUnavailable(): void {
    // The Date Input keeps a parsed value while a custom error is set.
    const value = this.value;
    const unavailable = value !== null && isUnavailable(this.#options, value);
    const message = this.#customError ?? (unavailable ? getMessage('datePicker', 'dateUnavailable', {}, this.#config().locale) : null);
    this.input.setCustomError(message);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const value = this.value;
    this.button.setAttribute(
      'aria-label',
      value ? getMessage('datePicker', 'changeDate', { date: formatPlainDate(value, { dateStyle: 'long' }, config.locale) }, config.locale) : getMessage('datePicker', 'chooseDate', {}, config.locale),
    );
    this.button.disabled = (o.disabled ?? false) || (o.readOnly ?? false);
    this.button.replaceChildren(renderIcon(o.icons?.calendar ?? 'calendar', { doc: this.#doc }));
    this.popup.setAttribute('aria-label', getMessage('datePicker', 'chooseDate', {}, config.locale));
    this.host.classList.toggle('aui-date-picker--disabled', o.disabled ?? false);
  }
}
