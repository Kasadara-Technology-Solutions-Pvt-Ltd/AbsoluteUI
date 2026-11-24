/**
 * Schedule Picker (SPEC section 18.7). One labelled fieldset for when something
 * happens: start and end (DateTime Pickers, or Date Pickers for all-day
 * schedules), an all-day checkbox, an optional timezone select, and an optional
 * Recurrence Picker. Timed schedules are exact instants whose wall-clock times
 * are read in the selected timezone (UTC unless configured, section 8.1) with the DST
 * policy (section 8.5); all-day schedules are dates. Changing the start keeps the
 * duration; changing the timezone keeps the wall-clock times.
 *
 * Ranges follow core conventions: instants are half-open (the end is the moment
 * it ends), dates are inclusive (the end is the last day). The form value is
 * iCalendar text (DTSTART, DTEND, RRULE, EXDATE lines), where an all-day DTEND is
 * exclusive as RFC 5545 requires.
 */
import {
  addDays,
  comparePlainDate,
  configurationError,
  defineComponentConfig,
  DisposableGroup,
  emit,
  formatNumber,
  formatTimeZoneName,
  getMessage,
  instant,
  isRecurrenceRule,
  parsePlainDate,
  parseRecurrenceRule,
  plainDateTime,
  plainTime,
  recurrenceRuleToString,
  registerMessages,
  toInstant,
  toPlainDateTime,
  validators,
  type Disambiguation,
  type Instant,
  type IsoWeekday,
  type PlainDate,
  type PlainDateTime,
  type RecurrenceRule,
} from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import { DatePicker } from '../date-picker/date-picker.js';
import { DateTimePicker } from '../date-time-picker/date-time-picker.js';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { messageFor, runValidator } from '../internal/validation.js';
import { RecurrencePicker } from '../recurrence-picker/recurrence-picker.js';

export interface SchedulePickerConfig {
  validationTiming: ValidationTiming;
  /** Minutes of a new timed schedule (after switching off all-day). */
  defaultDuration: number;
}

type Inherited = 'locale' | 'timezone' | 'disambiguation' | 'direction';
type Resolved = Readonly<SchedulePickerConfig & { locale: string; timezone: string; disambiguation: Disambiguation; direction: 'ltr' | 'rtl' }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    schedulePicker: SchedulePickerConfig & { locale: string; timezone: string; disambiguation: Disambiguation; direction: 'ltr' | 'rtl' };
  }
}

export const schedulePickerConfig = defineComponentConfig<SchedulePickerConfig, Inherited>(
  'schedulePicker',
  {
    validationTiming: validationTimingSpec,
    defaultDuration: { default: 60, expected: 'integer from 1 to 10080 (minutes)', validate: validators.integerInRange(1, 10_080) },
  },
  ['locale', 'timezone', 'disambiguation', 'direction'],
);

registerMessages('schedulePicker', 'en', {
  start: 'Starts',
  end: 'Ends',
  startDate: 'Start date',
  endDate: 'End date',
  allDay: 'All day',
  timeZone: 'Time zone',
  repeat: 'Repeat',
  duration: 'Duration: {duration}',
  days: '{count} days',
  oneDay: '1 day',
  incomplete: 'Enter a start and an end.',
  endBeforeStart: 'Enter an end after the start.',
  endBeforeStartDay: 'Enter an end date on or after the start date.',
});

/** A timed schedule (instants, end exclusive) or an all-day schedule (dates, end inclusive). */
export type ScheduleValue =
  | {
      readonly allDay: false;
      readonly start: Instant;
      /** The moment it ends (exclusive), after `start`. */
      readonly end: Instant;
      readonly timeZone: string;
      readonly recurrence: RecurrenceRule | null;
    }
  | {
      readonly allDay: true;
      readonly start: PlainDate;
      /** The last day (inclusive), on or after `start`. */
      readonly end: PlainDate;
      readonly timeZone: string;
      readonly recurrence: RecurrenceRule | null;
    };

export type SchedulePickerError = 'value-missing' | 'incomplete' | 'invalid-start' | 'invalid-end' | 'end-before-start' | 'recurrence' | 'custom';

export interface SchedulePickerValidity {
  readonly valid: boolean;
  readonly error: SchedulePickerError | null;
  readonly message: string;
}

export interface SchedulePickerChangeDetail {
  value: ScheduleValue | null;
  validity: SchedulePickerValidity;
}

export interface SchedulePickerIcons {
  error: IconRef;
}

export interface SchedulePickerOptions extends Partial<SchedulePickerConfig> {
  /** Legend of the fieldset (required accessible name). */
  label: string;
  hideLabel?: boolean;
  value?: ScheduleValue | null;
  /** Offer the all-day checkbox. Default true. */
  allowAllDay?: boolean;
  /** Timezones offered in a select (IANA ids). Omitted: no select; `timezone` is used. */
  timeZones?: readonly string[];
  /** Show the Recurrence Picker. Default false. */
  recurrence?: boolean;
  name?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  firstDayOfWeek?: IsoWeekday;
  validate?: (value: ScheduleValue | null) => string | null;
  locale?: string;
  /** Timezone of the wall-clock times (overridden by `value.timeZone` and the select). */
  timezone?: string;
  disambiguation?: Disambiguation;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<SchedulePickerIcons>;
}

const VALID: SchedulePickerValidity = Object.freeze({ valid: true, error: null, message: '' });
const MINUTE = 60_000;
const kind = (v: unknown): unknown => (typeof v === 'object' && v !== null ? (v as { kind?: unknown }).kind : undefined);

function isSchedule(v: unknown): v is ScheduleValue {
  if (!validators.isRecord(v) || typeof v.allDay !== 'boolean' || typeof v.timeZone !== 'string') return false;
  if (!(v.recurrence === null || isRecurrenceRule(v.recurrence))) return false;
  const k = v.allDay ? 'PlainDate' : 'Instant';
  return kind(v.start) === k && kind(v.end) === k;
}

const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
const basicDate = (d: PlainDate): string => `${pad(d.year, 4)}${pad(d.month)}${pad(d.day)}`;
const basicLocal = (d: PlainDateTime): string => `${basicDate(d.date)}T${pad(d.time.hour)}${pad(d.time.minute)}${pad(d.time.second)}`;

/**
 * iCalendar text of a schedule: `DTSTART;TZID=...:local` and `DTEND` (timed), or
 * `DTSTART;VALUE=DATE` with an exclusive `DTEND;VALUE=DATE` (all-day), then the
 * recurrence lines.
 */
export function scheduleToString(value: ScheduleValue): string {
  const lines: string[] = [];
  if (value.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${basicDate(value.start)}`, `DTEND;VALUE=DATE:${basicDate(addDays(value.end, 1))}`);
  } else {
    const zone = value.timeZone;
    lines.push(`DTSTART;TZID=${zone}:${basicLocal(toPlainDateTime(value.start, zone))}`, `DTEND;TZID=${zone}:${basicLocal(toPlainDateTime(value.end, zone))}`);
  }
  if (value.recurrence) lines.push(recurrenceRuleToString(value.recurrence));
  return lines.join('\n');
}

/** Parse `scheduleToString` output (and equivalent iCalendar lines). Returns null when invalid. */
export function parseSchedule(text: string, disambiguation?: Disambiguation): ScheduleValue | null {
  if (typeof text !== 'string') return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  interface Part {
    date: PlainDate;
    local: PlainDateTime | null;
    zone: string | null;
  }
  let start: Part | null = null;
  let end: Part | null = null;
  const rest: string[] = [];
  const parseLine = (params: string, value: string): Part | null => {
    const dateOnly = /^;VALUE=DATE$/i.test(params);
    const tz = /^;TZID=([^;:]+)$/i.exec(params);
    const utc = params === '' && value.endsWith('Z');
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(value);
    if (!m) return null;
    const date = parsePlainDate(`${m[1] ?? ''}-${m[2] ?? ''}-${m[3] ?? ''}`);
    if (!date) return null;
    if (dateOnly) return m[4] === undefined ? { date, local: null, zone: null } : null;
    if (m[4] === undefined || !(tz || utc)) return null;
    try {
      return { date, local: plainDateTime(date, plainTime(Number(m[4]), Number(m[5]), Number(m[6]))), zone: tz ? (tz[1] ?? null) : 'UTC' };
    } catch {
      return null;
    }
  };
  for (const line of lines) {
    const m = /^(DTSTART|DTEND)((?:;[^:]*)?):(.+)$/i.exec(line);
    if (!m) {
      rest.push(line);
      continue;
    }
    const parsed = parseLine(m[2] ?? '', m[3] ?? '');
    if (!parsed) return null;
    if ((m[1] ?? '').toUpperCase() === 'DTSTART') start = parsed;
    else end = parsed;
  }
  if (!start || !end) return null;
  const recurrence = rest.length ? parseRecurrenceRule(rest.join('\n')) : null;
  if (rest.length && !recurrence) return null;
  try {
    if (!start.local && !end.local) {
      const last = addDays(end.date, -1);
      if (comparePlainDate(last, start.date) < 0) return null;
      return Object.freeze({ allDay: true, start: start.date, end: last, timeZone: 'UTC', recurrence });
    }
    if (!start.local || !end.local || !start.zone || !end.zone) return null;
    const s = toInstant(start.local, start.zone, disambiguation);
    const e = toInstant(end.local, end.zone, disambiguation);
    if (e.epochMilliseconds <= s.epochMilliseconds) return null;
    return Object.freeze({ allDay: false, start: s, end: e, timeZone: start.zone, recurrence });
  } catch {
    return null;
  }
}

export class SchedulePicker implements FormControl {
  readonly host: HTMLElement;
  readonly fieldset: HTMLFieldSetElement;
  /** Timed start and end pickers (hidden while all-day). Not registered with `Form`. */
  readonly startPicker: DateTimePicker;
  readonly endPicker: DateTimePicker;
  /** All-day start and end pickers (hidden while timed). */
  readonly startDatePicker: DatePicker;
  readonly endDatePicker: DatePicker;
  /** The embedded Recurrence Picker, or null when `recurrence` is off. */
  readonly recurrencePicker: RecurrencePicker | null;
  readonly #doc: Document;
  readonly #group = new DisposableGroup();
  readonly #chrome: FieldChrome;
  readonly #state = new FieldState();
  readonly #hidden: HTMLInputElement;
  readonly #allDay: HTMLInputElement;
  readonly #allDayRow: HTMLDivElement;
  readonly #allDayText: HTMLSpanElement;
  readonly #zoneRow: HTMLDivElement;
  readonly #zoneLabel: HTMLLabelElement;
  readonly #zone: HTMLSelectElement;
  readonly #duration: HTMLParagraphElement;
  readonly #hosts: { start: HTMLDivElement; end: HTMLDivElement; startDate: HTMLDivElement; endDate: HTMLDivElement };
  #options: SchedulePickerOptions;
  #value: ScheduleValue | null;
  #initial: ScheduleValue | null;
  #validity: SchedulePickerValidity = VALID;
  #isAllDay: boolean;
  #timeZone: string;
  /** Duration of the timed schedule, kept when the start moves. */
  #span = 60 * MINUTE;

  static create(host: HTMLElement, options: SchedulePickerOptions): SchedulePicker {
    return new SchedulePicker(host, options);
  }

  private constructor(host: HTMLElement, options: SchedulePickerOptions) {
    SchedulePicker.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#value = options.value ?? null;
    this.#initial = this.#value;
    const c = this.#config();
    this.#isAllDay = this.#value?.allDay ?? false;
    this.#timeZone = this.#value?.timeZone ?? c.timezone;
    this.#span = this.#value && !this.#value.allDay ? this.#value.end.epochMilliseconds - this.#value.start.epochMilliseconds : c.defaultDuration * MINUTE;
    const doc = this.#doc;
    this.#chrome = new FieldChrome(doc, 'legend', 'aui-schedule-picker');
    this.fieldset = doc.createElement('fieldset');
    this.fieldset.className = 'aui-schedule-picker__fieldset';
    const range = doc.createElement('div');
    range.className = 'aui-schedule-picker__range';
    const make = (name: string): HTMLDivElement => {
      const el = doc.createElement('div');
      el.className = `aui-schedule-picker__part aui-schedule-picker__part--${name}`;
      return el;
    };
    this.#hosts = { start: make('start'), end: make('end'), startDate: make('start-date'), endDate: make('end-date') };
    range.append(this.#hosts.start, this.#hosts.startDate, this.#hosts.end, this.#hosts.endDate);
    this.#duration = doc.createElement('p');
    this.#duration.className = 'aui-schedule-picker__duration';
    this.#allDayRow = doc.createElement('div');
    this.#allDayRow.className = 'aui-schedule-picker__row';
    const allDayLabel = doc.createElement('label');
    allDayLabel.className = 'aui-schedule-picker__check';
    this.#allDay = doc.createElement('input');
    this.#allDay.type = 'checkbox';
    this.#allDay.className = 'aui-schedule-picker__checkbox';
    this.#allDayText = doc.createElement('span');
    allDayLabel.append(this.#allDay, this.#allDayText);
    this.#allDayRow.append(allDayLabel);
    this.#zoneRow = doc.createElement('div');
    this.#zoneRow.className = 'aui-schedule-picker__row aui-schedule-picker__row--zone';
    this.#zone = doc.createElement('select');
    this.#zone.className = 'aui-schedule-picker__select';
    this.#zone.id = `${this.#chrome.label.id}-zone`;
    this.#zoneLabel = doc.createElement('label');
    this.#zoneLabel.className = 'aui-schedule-picker__label';
    this.#zoneLabel.htmlFor = this.#zone.id;
    this.#zoneRow.append(this.#zoneLabel, this.#zone);
    const recurrenceHost = doc.createElement('div');
    recurrenceHost.className = 'aui-schedule-picker__recurrence';
    this.fieldset.append(this.#chrome.label, range, this.#duration, this.#allDayRow, this.#zoneRow, recurrenceHost);
    this.#hidden = doc.createElement('input');
    this.#hidden.type = 'hidden';
    host.classList.add('aui-field', 'aui-schedule-picker');
    host.replaceChildren(this.fieldset, this.#chrome.description, this.#chrome.error, this.#hidden);

    const common = { formControl: false, locale: c.locale, direction: c.direction, ...(options.firstDayOfWeek === undefined ? {} : { firstDayOfWeek: options.firstDayOfWeek }) } as const;
    const v = this.#value;
    this.startPicker = DateTimePicker.create(this.#hosts.start, { ...common, label: this.#msg('start'), timezone: this.#timeZone, disambiguation: c.disambiguation, value: v && !v.allDay ? v.start : null });
    this.endPicker = DateTimePicker.create(this.#hosts.end, { ...common, label: this.#msg('end'), timezone: this.#timeZone, disambiguation: c.disambiguation, value: v && !v.allDay ? v.end : null });
    this.startDatePicker = DatePicker.create(this.#hosts.startDate, { ...common, label: this.#msg('startDate'), timezone: this.#timeZone, value: v?.allDay ? v.start : null });
    this.endDatePicker = DatePicker.create(this.#hosts.endDate, { ...common, label: this.#msg('endDate'), timezone: this.#timeZone, value: v?.allDay ? v.end : null });
    this.recurrencePicker = options.recurrence === true
      ? RecurrencePicker.create(recurrenceHost, { ...common, label: this.#msg('repeat'), timezone: this.#timeZone, disambiguation: c.disambiguation, value: v?.recurrence ?? null, start: this.#seriesStart() })
      : null;
    recurrenceHost.hidden = this.recurrencePicker === null;
    this.#render();
    this.#recompute(false);
    this.#bind();
    observePointer(doc);
    this.#group.add(registerControl(this));
    this.#group.add(schedulePickerConfig.subscribe(() => {
      this.#render();
      this.#recompute(false);
    }));
  }

  get value(): ScheduleValue | null {
    return this.#value;
  }

  get validity(): SchedulePickerValidity {
    return this.#validity;
  }

  get name(): string | null {
    return this.#options.name ?? null;
  }

  get label(): string {
    return this.#options.label;
  }

  get disabled(): boolean {
    return this.#options.disabled === true;
  }

  get dirty(): boolean {
    const text = (v: ScheduleValue | null): string => (v ? scheduleToString(v) : '');
    return text(this.#value) !== text(this.#initial);
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<SchedulePickerOptions> {
    return this.#options;
  }

  /** The timezone the wall-clock times are read in. */
  get timeZone(): string {
    return this.#timeZone;
  }

  getFormValue(): string | null {
    return this.#value ? scheduleToString(this.#value) : null;
  }

  setValue(value: ScheduleValue | null): void {
    if (value !== null && !isSchedule(value)) this.#fail('value', 'ScheduleValue | null');
    this.#state.customError = null;
    this.#load(value);
    this.#recompute(false);
  }

  update(options: Partial<SchedulePickerOptions>): void {
    const next = { ...this.#options, ...options };
    SchedulePicker.#assert(next);
    if (options.recurrence !== undefined && options.recurrence !== (this.#options.recurrence === true)) this.#fail('recurrence', 'unchanged after creation (init-only)');
    this.#options = next;
    const c = this.#config();
    if (options.timezone !== undefined && !this.#options.timeZones) this.#setZone(c.timezone);
    const common = { locale: c.locale, direction: c.direction, disabled: this.disabled, ...(next.firstDayOfWeek === undefined ? {} : { firstDayOfWeek: next.firstDayOfWeek }) };
    this.startPicker.update({ ...common, label: this.#msg('start'), disambiguation: c.disambiguation });
    this.endPicker.update({ ...common, label: this.#msg('end'), disambiguation: c.disambiguation });
    this.startDatePicker.update({ ...common, label: this.#msg('startDate') });
    this.endDatePicker.update({ ...common, label: this.#msg('endDate') });
    this.recurrencePicker?.update({ ...common, label: this.#msg('repeat'), disambiguation: c.disambiguation });
    if ('value' in options) this.#load(options.value ?? null);
    else this.#render();
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

  focus(): void {
    (this.#isAllDay ? this.startDatePicker : this.startPicker).focus();
  }

  reset(): void {
    this.#state.reset();
    this.#load(this.#initial);
    this.#recompute(false);
  }

  destroy(): void {
    this.#group.dispose();
    this.startPicker.destroy();
    this.endPicker.destroy();
    this.startDatePicker.destroy();
    this.endDatePicker.destroy();
    this.recurrencePicker?.destroy();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-schedule-picker', 'aui-schedule-picker--invalid', 'aui-schedule-picker--disabled', 'aui-schedule-picker--all-day');
  }

  // ---- options -----------------------------------------------------------------

  static #assert(o: SchedulePickerOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('SCHEDULE_PICKER_OPTIONS', 'Invalid schedule picker options.', { component: 'schedulePicker', property: `schedulePicker.${property}`, expected });
    };
    if (!validators.isRecord(o)) fail('options', 'SchedulePickerOptions');
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (o.value !== undefined && o.value !== null) {
      if (!isSchedule(o.value)) fail('value', 'ScheduleValue | null');
      const v = o.value;
      if (v.allDay ? comparePlainDate(v.end, v.start) < 0 : v.end.epochMilliseconds <= v.start.epochMilliseconds) fail('value.end', 'after start (timed) or on or after start (all-day)');
      if (!validators.isTimeZone(v.timeZone)) fail('value.timeZone', 'IANA timezone identifier');
    }
    const zones: unknown = o.timeZones;
    if (zones !== undefined && !(Array.isArray(zones) && zones.length > 0 && zones.every((z) => validators.isTimeZone(z)))) fail('timeZones', 'non-empty array of IANA timezone identifiers');
    for (const key of ['allowAllDay', 'recurrence', 'hideLabel', 'required', 'disabled'] as const) if (o[key] !== undefined && typeof o[key] !== 'boolean') fail(key, 'boolean');
    if (o.firstDayOfWeek !== undefined && !validators.integerInRange(1, 7)(o.firstDayOfWeek)) fail('firstDayOfWeek', 'integer 1 (Monday) to 7 (Sunday)');
    if (o.validate !== undefined && typeof o.validate !== 'function') fail('validate', '(value: ScheduleValue | null) => string | null');
    schedulePickerConfig.resolve(SchedulePicker.#configInput(o));
  }

  static #configInput(o: SchedulePickerOptions): Partial<Resolved> {
    const input: Record<string, unknown> = {};
    for (const key of ['validationTiming', 'defaultDuration', 'locale', 'timezone', 'disambiguation', 'direction'] as const) if (o[key] !== undefined) input[key] = o[key];
    return input;
  }

  #config(): Resolved {
    return schedulePickerConfig.resolve(SchedulePicker.#configInput(this.#options));
  }

  #fail(property: string, expected: string): never {
    throw configurationError('SCHEDULE_PICKER_OPTIONS', 'Invalid schedule picker options.', { component: 'schedulePicker', property: `schedulePicker.${property}`, expected });
  }

  #msg(key: string, params: Readonly<Record<string, string>> = {}): string {
    return getMessage('schedulePicker', key, params, this.#config().locale);
  }

  // ---- state ---------------------------------------------------------------------

  /** Start of the series for the Recurrence Picker: a date (all-day) or the wall-clock start. */
  #seriesStart(): PlainDate | PlainDateTime | null {
    if (this.#isAllDay) return this.startDatePicker.value;
    const s = this.startPicker.value;
    return s ? toPlainDateTime(s, this.#timeZone) : null;
  }

  #load(value: ScheduleValue | null): void {
    this.#value = value;
    this.#isAllDay = value?.allDay ?? false;
    if (value) this.#setZone(value.timeZone, false);
    this.startPicker.setValue(value && !value.allDay ? value.start : null);
    this.endPicker.setValue(value && !value.allDay ? value.end : null);
    this.startDatePicker.setValue(value?.allDay ? value.start : null);
    this.endDatePicker.setValue(value?.allDay ? value.end : null);
    if (value && !value.allDay) this.#span = value.end.epochMilliseconds - value.start.epochMilliseconds;
    this.recurrencePicker?.update({ start: this.#seriesStart(), timezone: this.#timeZone });
    this.recurrencePicker?.setValue(value?.recurrence ?? null);
    this.#render();
  }

  /** Change the timezone; `keepWallClock` re-reads the entered wall-clock times in the new zone. */
  #setZone(zone: string, keepWallClock = true): void {
    if (zone === this.#timeZone) return;
    const locals = keepWallClock ? [this.startPicker.value, this.endPicker.value].map((i) => (i ? toPlainDateTime(i, this.#timeZone) : null)) : null;
    this.#timeZone = zone;
    for (const p of [this.startPicker, this.endPicker]) p.update({ timezone: zone });
    for (const p of [this.startDatePicker, this.endDatePicker]) p.update({ timezone: zone });
    if (locals) {
      const c = this.#config();
      const [s, e] = locals;
      if (s) this.startPicker.setValue(toInstant(s, zone, c.disambiguation));
      if (e) this.endPicker.setValue(toInstant(e, zone, c.disambiguation));
    }
    this.recurrencePicker?.update({ timezone: zone, start: this.#seriesStart() });
  }

  // ---- rendering -------------------------------------------------------------------

  #render(): void {
    const o = this.#options;
    const c = this.#config();
    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    this.fieldset.dir = c.direction;
    const allDay = this.#isAllDay;
    this.#hosts.start.hidden = allDay;
    this.#hosts.end.hidden = allDay;
    this.#hosts.startDate.hidden = !allDay;
    this.#hosts.endDate.hidden = !allDay;
    this.host.classList.toggle('aui-schedule-picker--all-day', allDay);
    this.#allDayRow.hidden = o.allowAllDay === false;
    this.#allDay.checked = allDay;
    this.#allDay.disabled = this.disabled;
    this.#allDayText.textContent = this.#msg('allDay');
    const zones = o.timeZones;
    this.#zoneRow.hidden = zones === undefined || allDay;
    this.#zoneLabel.textContent = this.#msg('timeZone');
    this.#zone.disabled = this.disabled;
    if (zones) {
      const list = zones.includes(this.#timeZone) ? zones : [this.#timeZone, ...zones];
      const key = `${c.locale}|${list.join()}`;
      if (this.#zone.dataset.auiKey !== key) {
        this.#zone.dataset.auiKey = key;
        this.#zone.replaceChildren(...list.map((z) => {
          const opt = this.#doc.createElement('option');
          opt.value = z;
          opt.text = `${formatTimeZoneName(z, 'long', undefined, c.locale)} (${formatTimeZoneName(z, 'shortOffset', undefined, c.locale)})`;
          return opt;
        }));
      }
      this.#zone.value = this.#timeZone;
    }
    for (const p of [this.startPicker, this.endPicker, this.startDatePicker, this.endDatePicker]) if (p.disabled !== this.disabled) p.update({ disabled: this.disabled });
    if (o.name) this.#hidden.name = o.name;
    else this.#hidden.removeAttribute('name');
    this.#hidden.disabled = this.disabled;
    this.host.classList.toggle('aui-schedule-picker--disabled', this.disabled);
  }

  #renderDuration(): void {
    const v = this.#value;
    const locale = this.#config().locale;
    if (!v) {
      this.#duration.hidden = true;
      return;
    }
    this.#duration.hidden = false;
    let text: string;
    if (v.allDay) {
      const days = Math.round((Date.UTC(v.end.year, v.end.month - 1, v.end.day) - Date.UTC(v.start.year, v.start.month - 1, v.start.day)) / 86_400_000) + 1;
      text = days === 1 ? this.#msg('oneDay') : this.#msg('days', { count: formatNumber(days, {}, locale) });
    } else {
      const minutes = Math.round((v.end.epochMilliseconds - v.start.epochMilliseconds) / MINUTE);
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      const parts: string[] = [];
      if (h) parts.push(formatNumber(h, { style: 'unit', unit: 'hour', unitDisplay: 'short' }, locale));
      if (m || !h) parts.push(formatNumber(m, { style: 'unit', unit: 'minute', unitDisplay: 'short' }, locale));
      text = new Intl.ListFormat(locale, { type: 'unit', style: 'short' }).format(parts);
    }
    this.#duration.textContent = this.#msg('duration', { duration: text });
  }

  // ---- events ----------------------------------------------------------------------

  #bind(): void {
    const g = this.#group;
    // Inner pickers' changes are folded into this control's own aui-change.
    const inner = (el: HTMLElement, handler: () => void): void => {
      const listener = (e: Event): void => {
        if (e.target !== el) return;
        e.stopPropagation();
        handler();
      };
      el.addEventListener('aui-change', listener);
      g.add(() => {
        el.removeEventListener('aui-change', listener);
      });
    };
    inner(this.#hosts.start, () => {
      // The end follows the start (the duration is kept).
      const s = this.startPicker.value;
      if (s) this.endPicker.setValue(instant(s.epochMilliseconds + this.#span));
      this.#edit();
    });
    inner(this.#hosts.end, () => {
      const s = this.startPicker.value;
      const e = this.endPicker.value;
      if (s && e && e.epochMilliseconds > s.epochMilliseconds) this.#span = e.epochMilliseconds - s.epochMilliseconds;
      this.#edit();
    });
    inner(this.#hosts.startDate, () => {
      const s = this.startDatePicker.value;
      const e = this.endDatePicker.value;
      const prev = this.#value?.allDay ? this.#value : null;
      if (s && prev) this.endDatePicker.setValue(addDays(s, Math.round((Date.UTC(prev.end.year, prev.end.month - 1, prev.end.day) - Date.UTC(prev.start.year, prev.start.month - 1, prev.start.day)) / 86_400_000)));
      else if (s && !e) this.endDatePicker.setValue(s);
      this.#edit();
    });
    inner(this.#hosts.endDate, () => {
      this.#edit();
    });
    if (this.recurrencePicker) {
      inner(this.recurrencePicker.host, () => {
        this.#edit();
      });
    }
    g.listen(this.#allDay, 'change', () => {
      this.#toggleAllDay(this.#allDay.checked);
      this.#edit();
    });
    g.listen(this.#zone, 'change', () => {
      this.#setZone(this.#zone.value);
      this.#edit();
    });
    g.listen(this.host, 'focusout', (e) => {
      const next = e.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#renderMessages();
      });
    });
  }

  #toggleAllDay(allDay: boolean): void {
    if (allDay === this.#isAllDay) return;
    const c = this.#config();
    const zone = this.#timeZone;
    if (allDay) {
      const s = this.startPicker.value;
      const e = this.endPicker.value;
      const sd = s ? toPlainDateTime(s, zone).date : null;
      // The last day is the day of the last moment (an end at midnight belongs to the previous day).
      const ed = e ? toPlainDateTime(instant(e.epochMilliseconds - 1), zone).date : sd;
      this.startDatePicker.setValue(sd);
      this.endDatePicker.setValue(sd && ed && comparePlainDate(ed, sd) >= 0 ? ed : sd);
    } else {
      const sd = this.startDatePicker.value;
      const previous = this.startPicker.value;
      const time = previous ? toPlainDateTime(previous, zone).time : plainTime(9);
      const s = sd ? toInstant(plainDateTime(sd, time), zone, c.disambiguation) : null;
      this.startPicker.setValue(s);
      this.endPicker.setValue(s ? instant(s.epochMilliseconds + this.#span) : null);
    }
    this.#isAllDay = allDay;
    this.#render();
  }

  #edit(): void {
    this.#state.dirty = true;
    this.recurrencePicker?.update({ start: this.#seriesStart(), timezone: this.#timeZone });
    this.#render();
    this.#recompute(true);
  }

  // ---- value -----------------------------------------------------------------------

  #build(): { value: ScheduleValue | null; error: SchedulePickerError | null; message: string; empty: boolean } {
    const allDay = this.#isAllDay;
    const [sp, ep] = allDay ? [this.startDatePicker, this.endDatePicker] : [this.startPicker, this.endPicker];
    const sv = sp.validity;
    const ev = ep.validity;
    const sEmpty = sp.value === null && (sv.valid || sv.error === 'value-missing');
    const eEmpty = ep.value === null && (ev.valid || ev.error === 'value-missing');
    if (sEmpty && eEmpty) return { value: null, error: null, message: '', empty: true };
    if (!sv.valid && sv.error !== 'value-missing') return { value: null, error: 'invalid-start', message: sv.message, empty: false };
    if (!ev.valid && ev.error !== 'value-missing') return { value: null, error: 'invalid-end', message: ev.message, empty: false };
    if (sEmpty || eEmpty) return { value: null, error: 'incomplete', message: this.#msg('incomplete'), empty: false };
    const rp = this.recurrencePicker;
    if (rp && !rp.validity.valid) return { value: null, error: 'recurrence', message: rp.validity.message, empty: false };
    const recurrence = rp?.value ?? (this.recurrencePicker ? null : (this.#value?.recurrence ?? this.#initial?.recurrence ?? null));
    const zone = this.#timeZone;
    if (allDay) {
      const s = this.startDatePicker.value;
      const e = this.endDatePicker.value;
      if (!s || !e) return { value: null, error: 'incomplete', message: this.#msg('incomplete'), empty: false };
      if (comparePlainDate(e, s) < 0) return { value: null, error: 'end-before-start', message: this.#msg('endBeforeStartDay'), empty: false };
      return { value: Object.freeze({ allDay: true, start: s, end: e, timeZone: zone, recurrence }), error: null, message: '', empty: false };
    }
    const s = this.startPicker.value;
    const e = this.endPicker.value;
    if (!s || !e) return { value: null, error: 'incomplete', message: this.#msg('incomplete'), empty: false };
    if (e.epochMilliseconds <= s.epochMilliseconds) return { value: null, error: 'end-before-start', message: this.#msg('endBeforeStart'), empty: false };
    return { value: Object.freeze({ allDay: false, start: s, end: e, timeZone: zone, recurrence }), error: null, message: '', empty: false };
  }

  #recompute(fromUser: boolean): void {
    if (fromUser) this.#state.customError = null;
    const o = this.#options;
    const c = this.#config();
    const built = this.#build();
    let { error, message } = built;
    const value = built.value;
    if (error === null && built.empty && o.required === true) {
      error = 'value-missing';
      message = messageFor({ error: 'value-missing', params: {} }, { locale: c.locale });
    }
    if (error === null) {
      const custom = runValidator(o.validate, value) ?? this.#state.customError;
      if (custom !== null) {
        error = 'custom';
        message = custom;
      }
    }
    const validity: SchedulePickerValidity = error === null ? VALID : Object.freeze({ valid: false, error, message });
    const text = value ? scheduleToString(value) : '';
    const changed = text !== (this.#value ? scheduleToString(this.#value) : '') || validity.error !== this.#validity.error;
    this.#value = value;
    this.#validity = validity;
    this.#hidden.value = text;
    this.#renderDuration();
    this.#renderMessages();
    if (fromUser && changed) emit(this.host, 'aui-change', { value, validity } satisfies SchedulePickerChangeDetail);
  }

  #renderMessages(): void {
    const c = this.#config();
    const show = !this.#validity.valid && this.#state.shouldShow(c.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', this.#options.icons?.error ?? 'alert-circle');
    setDescribedBy(this.fieldset, this.#chrome.describedBy(), this.#duration.hidden ? [] : [this.#durationId()]);
    this.host.classList.toggle('aui-schedule-picker--invalid', show);
  }

  #durationId(): string {
    if (!this.#duration.id) this.#duration.id = `${this.#chrome.label.id}-duration`;
    return this.#duration.id;
  }
}

