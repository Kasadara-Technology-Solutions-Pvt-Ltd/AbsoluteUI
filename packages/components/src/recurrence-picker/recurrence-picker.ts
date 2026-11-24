/**
 * Recurrence Picker (SPEC section 18.7). Edits a `RecurrenceRule` (RFC 5545 RRULE
 * subset, section 8.3) in a labelled fieldset of native controls: frequency ("Does not
 * repeat", daily, weekly, monthly, yearly), interval, weekday toggle buttons,
 * day-of-month or nth-weekday choices, and the end (never, on a date through a
 * Date Picker, or after a number of occurrences). A live summary describes the
 * rule; with a `start`, the next occurrences are previewed in the timezone.
 * The form value is iCalendar text (`RRULE:FREQ=WEEKLY;BYDAY=MO,WE`).
 *
 * Rules the controls cannot represent (several month days, BYSETPOS, several
 * months) are kept unchanged and shown as "Custom" until the user picks another
 * frequency. EXDATE/RDATE lists and WKST of the value are preserved.
 */
import {
  addDays,
  comparePlainDate,
  configurationError,
  createId,
  dayOfWeek,
  daysInMonth,
  defineComponentConfig,
  describeRecurrence,
  DisposableGroup,
  emit,
  expandRecurrence,
  formatInstant,
  formatNumber,
  formatPlainDate,
  getFirstDayOfWeek,
  getMessage,
  instant,
  isRecurrenceRule,
  plainDate,
  plainDateTime,
  plainTime,
  recurrenceRule,
  recurrenceRuleToString,
  registerMessages,
  toInstant,
  toPlainDateTime,
  validators,
  type Disambiguation,
  type IsoWeekday,
  type PlainDate,
  type PlainDateTime,
  type RecurrenceFrequency,
  type RecurrenceRule,
  type RecurrenceRuleInit,
} from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import { DatePicker } from '../date-picker/date-picker.js';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { messageFor, runValidator } from '../internal/validation.js';

export interface RecurrencePickerConfig {
  validationTiming: ValidationTiming;
  /** Next occurrences listed under the summary (needs `start`); 0 hides the preview. */
  previewCount: number;
}

type Inherited = 'locale' | 'timezone' | 'disambiguation' | 'direction';
type Resolved = Readonly<RecurrencePickerConfig & { locale: string; timezone: string; disambiguation: Disambiguation; direction: 'ltr' | 'rtl' }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    recurrencePicker: RecurrencePickerConfig & { locale: string; timezone: string; disambiguation: Disambiguation; direction: 'ltr' | 'rtl' };
  }
}

export const recurrencePickerConfig = defineComponentConfig<RecurrencePickerConfig, Inherited>(
  'recurrencePicker',
  {
    validationTiming: validationTimingSpec,
    previewCount: { default: 5, expected: 'integer from 0 to 20', validate: validators.integerInRange(0, 20) },
  },
  ['locale', 'timezone', 'disambiguation', 'direction'],
);

registerMessages('recurrencePicker', 'en', {
  frequency: 'Repeats',
  none: 'Does not repeat',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  custom: 'Custom',
  every: 'Every',
  unitDays: 'days',
  unitWeeks: 'weeks',
  unitMonths: 'months',
  unitYears: 'years',
  interval: 'Interval',
  repeatOn: 'Repeat on',
  monthlyOn: 'Repeat on',
  onDay: 'On day',
  onThe: 'On the',
  dayOfMonth: 'Day of month',
  lastDay: 'Last day',
  ordinal: 'Week of the month',
  weekday: 'Weekday',
  month: 'Month',
  ends: 'Ends',
  never: 'Never',
  onDate: 'On a date',
  after: 'After',
  endDate: 'End date',
  occurrences: 'occurrences',
  occurrenceCount: 'Number of occurrences',
  nth1: 'first',
  nth2: 'second',
  nth3: 'third',
  nth4: 'fourth',
  nth5: 'fifth',
  nthLast: 'last',
  summary: 'Summary',
  preview: 'Next occurrences',
  noOccurrences: 'No occurrences.',
  badInterval: 'Enter an interval from 1 to {max}.',
  noWeekday: 'Choose at least one day.',
  badCount: 'Enter a number of occurrences from 1 to {max}.',
  noUntil: 'Enter an end date.',
  untilBeforeStart: 'Enter an end date on or after {start}.',
  invalidUntil: 'Enter a valid end date.',
});

export type RecurrencePickerError = 'value-missing' | 'bad-interval' | 'no-weekday' | 'bad-count' | 'no-until' | 'bad-until' | 'custom';

export interface RecurrencePickerValidity {
  readonly valid: boolean;
  readonly error: RecurrencePickerError | null;
  readonly message: string;
}

export interface RecurrencePickerChangeDetail {
  value: RecurrenceRule | null;
  validity: RecurrencePickerValidity;
}

export interface RecurrencePickerIcons {
  error: IconRef;
}

export interface RecurrencePickerOptions extends Partial<RecurrencePickerConfig> {
  /** Legend of the fieldset (required accessible name). */
  label: string;
  hideLabel?: boolean;
  /** The rule; null means "Does not repeat". */
  value?: RecurrenceRule | null;
  /**
   * Series start: defaults for new rules (its weekday, day, month), the minimum end
   * date, and the preview. A date for all-day series, a wall-clock time in `timezone` otherwise.
   */
  start?: PlainDate | PlainDateTime | null;
  /** Frequencies offered. Default all four. */
  frequencies?: readonly RecurrenceFrequency[];
  /** Largest interval. Default 99. */
  maxInterval?: number;
  /** Largest occurrence count. Default 999. */
  maxCount?: number;
  /** Form field name; a hidden input carries the iCalendar text (empty when not repeating). */
  name?: string;
  description?: string;
  /** A repeating rule is required ("Does not repeat" is invalid). */
  required?: boolean;
  disabled?: boolean;
  /** First weekday toggle. Default: the locale's first day of week. */
  firstDayOfWeek?: IsoWeekday;
  validate?: (value: RecurrenceRule | null) => string | null;
  /**
   * Advanced, read at creation: false when a composite control (Schedule Picker)
   * registers itself with `Form` instead. Default true.
   */
  formControl?: boolean;
  locale?: string;
  timezone?: string;
  disambiguation?: Disambiguation;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<RecurrencePickerIcons>;
}

type Mode = 'none' | RecurrenceFrequency | 'custom';

interface State {
  mode: Mode;
  weekdays: Set<IsoWeekday>;
  /** Monthly/yearly: day of month (1..31 or -1) or nth weekday. */
  byWeekday: boolean;
  monthDay: number;
  nth: number;
  weekday: IsoWeekday;
  month: number;
  end: 'never' | 'until' | 'count';
}

const ALL: readonly RecurrenceFrequency[] = ['daily', 'weekly', 'monthly', 'yearly'];
const UNIT_KEYS: Record<RecurrenceFrequency, string> = { daily: 'unitDays', weekly: 'unitWeeks', monthly: 'unitMonths', yearly: 'unitYears' };
const VALID: RecurrencePickerValidity = Object.freeze({ valid: true, error: null, message: '' });
const kind = (v: unknown): unknown => (typeof v === 'object' && v !== null ? (v as { kind?: unknown }).kind : undefined);
const dateOf = (s: PlainDate | PlainDateTime): PlainDate => (s.kind === 'PlainDate' ? s : s.date);

/** Whether the controls can show a rule (otherwise it is kept as "Custom"). */
function representable(r: RecurrenceRule): boolean {
  if (r.bySetPos.length > 0 || r.byMonth.length > 1 || r.byMonthDay.length > 1) return false;
  switch (r.frequency) {
    case 'daily':
      return r.byDay.length === 0 && r.byMonthDay.length === 0 && r.byMonth.length === 0;
    case 'weekly':
      return r.byDay.every((d) => d.nth === undefined) && r.byMonth.length === 0;
    case 'monthly':
      return r.byMonth.length === 0 && (r.byDay.length === 0 || (r.byDay.length === 1 && r.byMonthDay.length === 0 && r.byDay[0]?.nth !== undefined && (r.byDay[0].nth === -1 || r.byDay[0].nth > 0)));
    case 'yearly':
      return r.byMonth.length <= 1 && (r.byDay.length === 0 || (r.byDay.length === 1 && r.byMonthDay.length === 0 && r.byMonth.length === 1 && r.byDay[0]?.nth !== undefined && (r.byDay[0].nth === -1 || (r.byDay[0].nth > 0 && r.byDay[0].nth <= 5))));
  }
}

export class RecurrencePicker implements FormControl {
  readonly host: HTMLElement;
  /** The labelled fieldset holding every control. */
  readonly fieldset: HTMLFieldSetElement;
  /** Date Picker of the end date (not registered with `Form`). */
  readonly untilPicker: DatePicker;
  readonly #doc: Document;
  readonly #group = new DisposableGroup();
  readonly #chrome: FieldChrome;
  readonly #state = new FieldState();
  readonly #hidden: HTMLInputElement;
  readonly #frequency: HTMLSelectElement;
  readonly #intervalRow: HTMLDivElement;
  readonly #interval: HTMLInputElement;
  readonly #unit: HTMLSpanElement;
  readonly #weekRow: HTMLDivElement;
  readonly #weekButtons = new Map<IsoWeekday, HTMLButtonElement>();
  readonly #monthRow: HTMLFieldSetElement;
  readonly #monthLegend: HTMLLegendElement;
  readonly #byDayRadio: HTMLInputElement;
  readonly #byWeekdayRadio: HTMLInputElement;
  readonly #monthDay: HTMLSelectElement;
  readonly #nth: HTMLSelectElement;
  readonly #weekday: HTMLSelectElement;
  readonly #monthOfDay: HTMLSelectElement;
  readonly #monthOfWeekday: HTMLSelectElement;
  readonly #endRow: HTMLFieldSetElement;
  readonly #endRadios: Record<State['end'], HTMLInputElement>;
  readonly #count: HTMLInputElement;
  readonly #summary: HTMLParagraphElement;
  readonly #preview: HTMLDivElement;
  readonly #labels: HTMLElement[] = [];
  #options: RecurrencePickerOptions;
  #value: RecurrenceRule | null;
  #initial: RecurrenceRule | null;
  /** The last value the controls cannot represent (kept while "Custom" is selected). */
  #custom: RecurrenceRule | null = null;
  #validity: RecurrencePickerValidity = VALID;
  #ui: State;
  /** The value comes from user edits of the controls (else it is a programmatic value, kept as is). */
  #fromControls = false;

  static create(host: HTMLElement, options: RecurrencePickerOptions): RecurrencePicker {
    return new RecurrencePicker(host, options);
  }

  private constructor(host: HTMLElement, options: RecurrencePickerOptions) {
    RecurrencePicker.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#value = options.value ?? null;
    this.#initial = this.#value;
    this.#ui = this.#stateFrom(this.#value);
    const doc = this.#doc;
    const id = createId('aui-recurrence-picker');
    this.#chrome = new FieldChrome(doc, 'legend', 'aui-recurrence-picker');
    this.fieldset = doc.createElement('fieldset');
    this.fieldset.className = 'aui-recurrence-picker__fieldset';

    // Frequency.
    const freqRow = this.#row('frequency');
    this.#frequency = doc.createElement('select');
    this.#frequency.className = 'aui-recurrence-picker__select aui-recurrence-picker__frequency';
    this.#frequency.id = `${id}-frequency`;
    freqRow.append(this.#label(this.#frequency, 'frequency'), this.#frequency);

    // Interval.
    this.#intervalRow = this.#row('interval');
    this.#interval = doc.createElement('input');
    this.#interval.type = 'number';
    this.#interval.min = '1';
    this.#interval.step = '1';
    this.#interval.inputMode = 'numeric';
    this.#interval.className = 'aui-recurrence-picker__number';
    this.#interval.id = `${id}-interval`;
    this.#unit = doc.createElement('span');
    this.#unit.className = 'aui-recurrence-picker__unit';
    this.#unit.id = `${id}-unit`;
    this.#interval.setAttribute('aria-describedby', this.#unit.id);
    this.#intervalRow.append(this.#label(this.#interval, 'every'), this.#interval, this.#unit);

    // Weekdays.
    this.#weekRow = this.#row('weekdays');
    this.#weekRow.setAttribute('role', 'group');
    for (let w = 1; w <= 7; w++) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-recurrence-picker__weekday';
      b.dataset.auiWeekday = String(w);
      this.#weekButtons.set(w as IsoWeekday, b);
    }

    // Monthly and yearly.
    this.#monthRow = doc.createElement('fieldset');
    this.#monthRow.className = 'aui-recurrence-picker__row aui-recurrence-picker__row--month';
    this.#monthLegend = doc.createElement('legend');
    this.#monthLegend.className = 'aui-recurrence-picker__legend';
    const radioName = `${id}-mode`;
    this.#byDayRadio = this.#radio(radioName, 'day');
    this.#byWeekdayRadio = this.#radio(radioName, 'weekday');
    this.#monthDay = this.#select('month-day');
    this.#nth = this.#select('nth');
    this.#weekday = this.#select('weekday');
    this.#monthOfDay = this.#select('month');
    this.#monthOfWeekday = this.#select('month');
    const dayLine = doc.createElement('div');
    dayLine.className = 'aui-recurrence-picker__choice';
    dayLine.append(this.#radioLabel(this.#byDayRadio, 'onDay'), this.#monthOfDay, this.#monthDay);
    const weekdayLine = doc.createElement('div');
    weekdayLine.className = 'aui-recurrence-picker__choice';
    weekdayLine.append(this.#radioLabel(this.#byWeekdayRadio, 'onThe'), this.#nth, this.#weekday, this.#monthOfWeekday);
    this.#monthRow.append(this.#monthLegend, dayLine, weekdayLine);

    // End.
    this.#endRow = doc.createElement('fieldset');
    this.#endRow.className = 'aui-recurrence-picker__row aui-recurrence-picker__row--end';
    const endLegend = doc.createElement('legend');
    endLegend.className = 'aui-recurrence-picker__legend';
    endLegend.dataset.auiMsg = 'ends';
    this.#labels.push(endLegend);
    const endName = `${id}-end`;
    this.#endRadios = { never: this.#radio(endName, 'never'), until: this.#radio(endName, 'until'), count: this.#radio(endName, 'count') };
    const neverLine = doc.createElement('div');
    neverLine.className = 'aui-recurrence-picker__choice';
    neverLine.append(this.#radioLabel(this.#endRadios.never, 'never'));
    const untilLine = doc.createElement('div');
    untilLine.className = 'aui-recurrence-picker__choice aui-recurrence-picker__choice--until';
    const untilHost = doc.createElement('div');
    untilHost.className = 'aui-recurrence-picker__until';
    untilLine.append(this.#radioLabel(this.#endRadios.until, 'onDate'), untilHost);
    const countLine = doc.createElement('div');
    countLine.className = 'aui-recurrence-picker__choice';
    this.#count = doc.createElement('input');
    this.#count.type = 'number';
    this.#count.min = '1';
    this.#count.step = '1';
    this.#count.inputMode = 'numeric';
    this.#count.className = 'aui-recurrence-picker__number';
    this.#count.dataset.auiLabel = 'occurrenceCount';
    const countUnit = doc.createElement('span');
    countUnit.className = 'aui-recurrence-picker__unit';
    countUnit.dataset.auiMsg = 'occurrences';
    countUnit.setAttribute('aria-hidden', 'true');
    this.#labels.push(countUnit);
    countLine.append(this.#radioLabel(this.#endRadios.count, 'after'), this.#count, countUnit);
    this.#endRow.append(endLegend, neverLine, untilLine, countLine);

    // Summary and preview.
    this.#summary = doc.createElement('p');
    this.#summary.className = 'aui-recurrence-picker__summary';
    this.#summary.id = `${id}-summary`;
    this.#summary.setAttribute('aria-live', 'polite');
    this.#preview = doc.createElement('div');
    this.#preview.className = 'aui-recurrence-picker__preview';

    this.fieldset.append(this.#chrome.label, freqRow, this.#intervalRow, this.#weekRow, this.#monthRow, this.#endRow, this.#summary, this.#preview);
    this.#hidden = doc.createElement('input');
    this.#hidden.type = 'hidden';
    host.classList.add('aui-field', 'aui-recurrence-picker');
    host.replaceChildren(this.fieldset, this.#chrome.description, this.#chrome.error, this.#hidden);

    const c = this.#config();
    this.untilPicker = DatePicker.create(untilHost, {
      label: this.#msg('endDate'),
      value: this.#untilDate(this.#value),
      formControl: false,
      locale: c.locale,
      timezone: c.timezone,
      direction: c.direction,
      ...(options.firstDayOfWeek === undefined ? {} : { firstDayOfWeek: options.firstDayOfWeek }),
    });
    this.#count.value = String(this.#value?.count ?? 10);
    this.#interval.value = String(this.#value?.interval ?? 1);
    this.#render();
    this.#recompute(false);
    this.#bind();
    observePointer(this.#doc);
    if (options.formControl !== false) this.#group.add(registerControl(this));
    this.#group.add(recurrencePickerConfig.subscribe(() => {
      this.#render();
      this.#recompute(false);
    }));
  }

  get value(): RecurrenceRule | null {
    return this.#value;
  }

  get validity(): RecurrencePickerValidity {
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
    const a = this.#value;
    const b = this.#initial;
    return (a === null ? '' : recurrenceRuleToString(a)) !== (b === null ? '' : recurrenceRuleToString(b));
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<RecurrencePickerOptions> {
    return this.#options;
  }

  /** iCalendar text, or null when not repeating or invalid. */
  getFormValue(): string | null {
    return this.#value === null ? null : recurrenceRuleToString(this.#value);
  }

  /** Human-readable text of the current rule (empty when not repeating). */
  get summary(): string {
    return this.#value ? this.#describe(this.#value) : '';
  }

  setValue(value: RecurrenceRule | null): void {
    if (value !== null && !isRecurrenceRule(value)) this.#fail('value', 'RecurrenceRule | null');
    this.#state.customError = null;
    this.#load(value);
    this.#recompute(false);
  }

  update(options: Partial<RecurrencePickerOptions>): void {
    const next = { ...this.#options, ...options };
    RecurrencePicker.#assert(next);
    this.#options = next;
    const c = this.#config();
    this.untilPicker.update({ label: this.#msg('endDate'), locale: c.locale, timezone: c.timezone, direction: c.direction, disabled: this.disabled, ...(next.firstDayOfWeek === undefined ? {} : { firstDayOfWeek: next.firstDayOfWeek }) });
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
    this.#frequency.focus();
  }

  reset(): void {
    this.#state.reset();
    this.#load(this.#initial);
    this.#recompute(false);
  }

  destroy(): void {
    this.#group.dispose();
    this.untilPicker.destroy();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-recurrence-picker', 'aui-recurrence-picker--invalid', 'aui-recurrence-picker--disabled');
  }

  // ---- options ---------------------------------------------------------------

  static #assert(o: RecurrencePickerOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('RECURRENCE_PICKER_OPTIONS', 'Invalid recurrence picker options.', { component: 'recurrencePicker', property: `recurrencePicker.${property}`, expected });
    };
    if (!validators.isRecord(o)) fail('options', 'RecurrencePickerOptions');
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (o.value !== undefined && o.value !== null && !isRecurrenceRule(o.value)) fail('value', 'RecurrenceRule | null');
    if (o.start !== undefined && o.start !== null && kind(o.start) !== 'PlainDate' && kind(o.start) !== 'PlainDateTime') fail('start', 'PlainDate | PlainDateTime | null');
    const freqs: unknown = o.frequencies;
    if (freqs !== undefined && !(Array.isArray(freqs) && freqs.length > 0 && freqs.every((f) => ALL.includes(f as RecurrenceFrequency)))) fail('frequencies', 'non-empty array of "daily" | "weekly" | "monthly" | "yearly"');
    for (const [key, max] of [['maxInterval', 999], ['maxCount', 100_000]] as const) {
      const v = o[key];
      if (v !== undefined && !validators.integerInRange(1, max)(v)) fail(key, `integer from 1 to ${String(max)}`);
    }
    if (o.firstDayOfWeek !== undefined && !validators.integerInRange(1, 7)(o.firstDayOfWeek)) fail('firstDayOfWeek', 'integer 1 (Monday) to 7 (Sunday)');
    if (o.validate !== undefined && typeof o.validate !== 'function') fail('validate', '(value: RecurrenceRule | null) => string | null');
    recurrencePickerConfig.resolve(RecurrencePicker.#configInput(o));
  }

  static #configInput(o: RecurrencePickerOptions): Partial<Resolved> {
    const input: Record<string, unknown> = {};
    for (const key of ['validationTiming', 'previewCount', 'locale', 'timezone', 'disambiguation', 'direction'] as const) if (o[key] !== undefined) input[key] = o[key];
    return input;
  }

  #config(): Resolved {
    return recurrencePickerConfig.resolve(RecurrencePicker.#configInput(this.#options));
  }

  #fail(property: string, expected: string): never {
    throw configurationError('RECURRENCE_PICKER_OPTIONS', 'Invalid recurrence picker options.', { component: 'recurrencePicker', property: `recurrencePicker.${property}`, expected });
  }

  #msg(key: string, params: Readonly<Record<string, string>> = {}): string {
    return getMessage('recurrencePicker', key, params, this.#config().locale);
  }

  #startDate(): PlainDate | null {
    const s = this.#options.start;
    return s ? dateOf(s) : null;
  }

  #maxInterval(): number {
    return this.#options.maxInterval ?? 99;
  }

  #maxCount(): number {
    return this.#options.maxCount ?? 999;
  }

  // ---- DOM helpers -------------------------------------------------------------

  #row(name: string): HTMLDivElement {
    const row = this.#doc.createElement('div');
    row.className = `aui-recurrence-picker__row aui-recurrence-picker__row--${name}`;
    return row;
  }

  #label(control: HTMLElement, key: string): HTMLLabelElement {
    const label = this.#doc.createElement('label');
    label.className = 'aui-recurrence-picker__label';
    label.htmlFor = control.id;
    label.dataset.auiMsg = key;
    this.#labels.push(label);
    return label;
  }

  #radio(name: string, value: string): HTMLInputElement {
    const r = this.#doc.createElement('input');
    r.type = 'radio';
    r.name = name;
    r.value = value;
    // Grouped by name but owned by no form: only the hidden input is submitted.
    r.setAttribute('form', `${name}-none`);
    r.className = 'aui-recurrence-picker__radio';
    return r;
  }

  #radioLabel(radio: HTMLInputElement, key: string): HTMLLabelElement {
    const label = this.#doc.createElement('label');
    label.className = 'aui-recurrence-picker__radio-label';
    const text = this.#doc.createElement('span');
    text.dataset.auiMsg = key;
    this.#labels.push(text);
    label.append(radio, text);
    return label;
  }

  #select(kindName: string): HTMLSelectElement {
    const s = this.#doc.createElement('select');
    s.className = `aui-recurrence-picker__select aui-recurrence-picker__select--${kindName}`;
    return s;
  }

  #fillSelect(select: HTMLSelectElement, items: readonly [string, string][]): void {
    const current = select.value;
    const same = select.options.length === items.length && items.every(([v, t], i) => select.options[i]?.value === v && select.options[i].text === t);
    if (!same) {
      select.replaceChildren(...items.map(([value, text]) => {
        const o = this.#doc.createElement('option');
        o.value = value;
        o.text = text;
        return o;
      }));
      if (items.some(([v]) => v === current)) select.value = current;
    }
  }

  // ---- state -------------------------------------------------------------------

  #stateFrom(rule: RecurrenceRule | null): State {
    const start = this.#startDate();
    const weekday = (start ? dayOfWeek(start) : 1) as IsoWeekday;
    const base: State = {
      mode: 'none',
      weekdays: new Set([weekday]),
      byWeekday: false,
      monthDay: start?.day ?? 1,
      nth: start ? Math.min(5, Math.ceil(start.day / 7)) : 1,
      weekday,
      month: start?.month ?? 1,
      end: 'never',
    };
    if (!rule) return base;
    base.end = rule.count !== null ? 'count' : rule.until !== null ? 'until' : 'never';
    if (!representable(rule)) {
      this.#custom = rule;
      base.mode = 'custom';
      return base;
    }
    base.mode = rule.frequency;
    if (rule.frequency === 'weekly' && rule.byDay.length > 0) base.weekdays = new Set(rule.byDay.map((d) => d.weekday));
    const [day] = rule.byDay;
    if (day?.nth !== undefined) {
      base.byWeekday = true;
      base.nth = day.nth;
      base.weekday = day.weekday;
    }
    const [md] = rule.byMonthDay;
    if (md !== undefined) base.monthDay = md;
    const [m] = rule.byMonth;
    if (m !== undefined) base.month = m;
    return base;
  }

  #load(rule: RecurrenceRule | null): void {
    this.#custom = null;
    this.#fromControls = false;
    this.#ui = this.#stateFrom(rule);
    this.#interval.value = String(rule?.interval ?? 1);
    this.#count.value = String(rule?.count ?? 10);
    this.untilPicker.setValue(this.#untilDate(rule));
    this.#value = rule;
    this.#render();
  }

  /** The end date shown for a rule's `until` (a date, or the local date of a time or instant). */
  #untilDate(rule: RecurrenceRule | null): PlainDate | null {
    const u = rule?.until ?? null;
    if (!u) return null;
    if (u.kind === 'PlainDate') return u;
    if (u.kind === 'PlainDateTime') return u.date;
    return toPlainDateTime(u, this.#config().timezone).date;
  }

  // ---- rendering ---------------------------------------------------------------

  #render(): void {
    const c = this.#config();
    const o = this.#options;
    const locale = c.locale;
    const ui = this.#ui;
    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    for (const el of this.#labels) {
      const key = el.dataset.auiMsg;
      if (key) el.textContent = this.#msg(key);
    }
    this.#count.setAttribute('aria-label', this.#msg('occurrenceCount'));
    this.#count.max = String(this.#maxCount());
    this.#interval.max = String(this.#maxInterval());
    this.fieldset.dir = c.direction;
    const freqs = o.frequencies ?? ALL;
    const items: [string, string][] = [['none', this.#msg('none')], ...freqs.map((f): [string, string] => [f, this.#msg(f)])];
    if (ui.mode === 'custom') items.push(['custom', this.#msg('custom')]);
    if (ui.mode !== 'none' && ui.mode !== 'custom' && !freqs.includes(ui.mode)) items.push([ui.mode, this.#msg(ui.mode)]);
    this.#fillSelect(this.#frequency, items);
    this.#frequency.value = ui.mode;

    const repeating = ui.mode !== 'none' && ui.mode !== 'custom';
    this.#intervalRow.hidden = !repeating;
    if (ui.mode !== 'none' && ui.mode !== 'custom') this.#unit.textContent = this.#msg(UNIT_KEYS[ui.mode]);

    // Weekday toggles in the locale's week order.
    this.#weekRow.hidden = ui.mode !== 'weekly';
    this.#weekRow.setAttribute('aria-label', this.#msg('repeatOn'));
    const first = o.firstDayOfWeek ?? getFirstDayOfWeek(locale);
    const ordered: HTMLButtonElement[] = [];
    for (let i = 0; i < 7; i++) {
      const w = (((first - 1 + i) % 7) + 1) as IsoWeekday;
      const b = this.#weekButtons.get(w);
      if (!b) continue;
      const sample = plainDate(2024, 1, w);
      b.textContent = formatPlainDate(sample, { weekday: 'narrow' }, locale);
      b.setAttribute('aria-label', formatPlainDate(sample, { weekday: 'long' }, locale));
      b.setAttribute('aria-pressed', String(ui.weekdays.has(w)));
      ordered.push(b);
    }
    if (ordered.some((b, i) => this.#weekRow.children[i] !== b)) this.#weekRow.replaceChildren(...ordered);

    // Monthly / yearly choices.
    const yearly = ui.mode === 'yearly';
    this.#monthRow.hidden = ui.mode !== 'monthly' && !yearly;
    this.#monthLegend.textContent = this.#msg('monthlyOn');
    this.#byDayRadio.checked = !ui.byWeekday;
    this.#byWeekdayRadio.checked = ui.byWeekday;
    const dayItems: [string, string][] = [];
    const maxDay = yearly ? daysInMonth(2024, ui.month) : 31;
    for (let d = 1; d <= maxDay; d++) dayItems.push([String(d), formatNumber(d, {}, locale)]);
    if (!yearly) dayItems.push(['-1', this.#msg('lastDay')]);
    this.#fillSelect(this.#monthDay, dayItems);
    this.#monthDay.value = String(yearly ? Math.min(Math.max(ui.monthDay, 1), maxDay) : ui.monthDay);
    this.#monthDay.setAttribute('aria-label', this.#msg('dayOfMonth'));
    this.#fillSelect(this.#nth, [1, 2, 3, 4, 5, -1].map((n): [string, string] => [String(n), this.#msg(n === -1 ? 'nthLast' : `nth${String(n)}`)]));
    this.#nth.value = String(ui.nth);
    this.#nth.setAttribute('aria-label', this.#msg('ordinal'));
    this.#fillSelect(this.#weekday, [1, 2, 3, 4, 5, 6, 7].map((w): [string, string] => [String(w), formatPlainDate(plainDate(2024, 1, w), { weekday: 'long' }, locale)]));
    this.#weekday.value = String(ui.weekday);
    this.#weekday.setAttribute('aria-label', this.#msg('weekday'));
    const months = Array.from({ length: 12 }, (_, i): [string, string] => [String(i + 1), formatPlainDate(plainDate(2024, i + 1, 1), { month: 'long' }, locale)]);
    for (const sel of [this.#monthOfDay, this.#monthOfWeekday]) {
      this.#fillSelect(sel, months);
      sel.value = String(ui.month);
      sel.hidden = !yearly;
      sel.setAttribute('aria-label', this.#msg('month'));
    }
    this.#monthDay.disabled = this.disabled || ui.byWeekday;
    this.#monthOfDay.disabled = this.disabled || ui.byWeekday;
    for (const sel of [this.#nth, this.#weekday, this.#monthOfWeekday]) sel.disabled = this.disabled || !ui.byWeekday;

    // End.
    this.#endRow.hidden = ui.mode === 'none';
    for (const [key, radio] of Object.entries(this.#endRadios)) {
      radio.checked = key === ui.end;
      radio.disabled = this.disabled || ui.mode === 'custom';
    }
    this.#count.disabled = this.disabled || ui.end !== 'count' || ui.mode === 'custom';
    this.untilPicker.update({ disabled: this.disabled || ui.end !== 'until' || ui.mode === 'custom' });

    const disabled = this.disabled;
    this.#frequency.disabled = disabled;
    this.#interval.disabled = disabled;
    this.#byDayRadio.disabled = disabled;
    this.#byWeekdayRadio.disabled = disabled;
    for (const b of this.#weekButtons.values()) b.disabled = disabled;
    if (o.name) this.#hidden.name = o.name;
    else this.#hidden.removeAttribute('name');
    this.#hidden.disabled = disabled;
    this.host.classList.toggle('aui-recurrence-picker--disabled', disabled);
  }

  #describe(rule: RecurrenceRule): string {
    const start = this.#options.start ?? undefined;
    const c = this.#config();
    return describeRecurrence(rule, { locale: c.locale, timeZone: c.timezone, ...(start ? { start } : {}) });
  }

  #renderSummary(): void {
    const c = this.#config();
    const v = this.#value;
    this.#summary.textContent = v ? this.#describe(v) : this.#ui.mode === 'none' ? this.#msg('none') : '';
    const start = this.#options.start;
    const count = c.previewCount;
    const doc = this.#doc;
    if (!v || !start || count === 0) {
      this.#preview.hidden = true;
      this.#preview.replaceChildren();
      return;
    }
    this.#preview.hidden = false;
    const heading = doc.createElement('p');
    heading.className = 'aui-recurrence-picker__preview-heading';
    heading.id = createId('aui-recurrence-picker-preview');
    heading.textContent = this.#msg('preview');
    const occ = expandRecurrence(v, start, { timeZone: c.timezone, disambiguation: c.disambiguation, limit: count });
    if (occ.length === 0) {
      const p = doc.createElement('p');
      p.textContent = this.#msg('noOccurrences');
      this.#preview.replaceChildren(heading, p);
      return;
    }
    const list = doc.createElement('ul');
    list.className = 'aui-recurrence-picker__preview-list';
    list.setAttribute('aria-labelledby', heading.id);
    for (const o of occ) {
      const li = doc.createElement('li');
      li.textContent = o.instant ? formatInstant(o.instant, { dateStyle: 'full', timeStyle: 'short' }, c.timezone, c.locale) : formatPlainDate(o.start as PlainDate, { dateStyle: 'full' }, c.locale);
      list.append(li);
    }
    this.#preview.replaceChildren(heading, list);
  }

  // ---- events ------------------------------------------------------------------

  #bind(): void {
    const g = this.#group;
    g.listen(this.#frequency, 'change', () => {
      const mode = this.#frequency.value as Mode;
      if (mode === 'custom') return;
      this.#ui.mode = mode;
      this.#custom = null;
      this.#edit();
    });
    g.listen(this.#interval, 'input', () => {
      this.#edit();
    });
    g.listen(this.#weekRow, 'click', (e) => {
      const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button[data-aui-weekday]') : null;
      if (!b) return;
      const w = Number(b.dataset.auiWeekday) as IsoWeekday;
      if (this.#ui.weekdays.has(w)) this.#ui.weekdays.delete(w);
      else this.#ui.weekdays.add(w);
      this.#edit();
    });
    const onMonth = (): void => {
      this.#ui.byWeekday = this.#byWeekdayRadio.checked;
      this.#ui.monthDay = Number(this.#monthDay.value);
      this.#ui.nth = Number(this.#nth.value);
      this.#ui.weekday = Number(this.#weekday.value) as IsoWeekday;
      this.#edit();
    };
    for (const el of [this.#byDayRadio, this.#byWeekdayRadio, this.#monthDay, this.#nth, this.#weekday]) g.listen(el, 'change', onMonth);
    for (const sel of [this.#monthOfDay, this.#monthOfWeekday]) {
      g.listen(sel, 'change', () => {
        this.#ui.month = Number(sel.value);
        onMonth();
      });
    }
    for (const [key, radio] of Object.entries(this.#endRadios) as [State['end'], HTMLInputElement][]) {
      g.listen(radio, 'change', () => {
        if (!radio.checked) return;
        this.#ui.end = key;
        this.#edit();
      });
    }
    g.listen(this.#count, 'input', () => {
      this.#edit();
    });
    const untilHost = this.untilPicker.host;
    // The inner picker's change is folded into this control's own aui-change.
    const onUntil = (e: Event): void => {
      if (e.target !== untilHost) return;
      e.stopPropagation();
      this.#edit();
    };
    untilHost.addEventListener('aui-change', onUntil);
    g.add(() => {
      untilHost.removeEventListener('aui-change', onUntil);
    });
    g.listen(this.host, 'focusout', (e) => {
      const next = e.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#renderMessages();
      });
    });
  }

  #edit(): void {
    this.#state.dirty = true;
    this.#render();
    this.#recompute(true);
  }

  // ---- value -------------------------------------------------------------------

  /** Build the rule from the controls, or an error. */
  #build(): { rule: RecurrenceRule | null; error: RecurrencePickerError | null; message: string } {
    const ui = this.#ui;
    const c = this.#config();
    const none = { rule: null, error: null, message: '' };
    if (ui.mode === 'none') return none;
    if (ui.mode === 'custom') return { rule: this.#custom, error: null, message: '' };
    const interval = Number(this.#interval.value);
    if (!(Number.isInteger(interval) && interval >= 1 && interval <= this.#maxInterval())) {
      return { rule: null, error: 'bad-interval', message: this.#msg('badInterval', { max: formatNumber(this.#maxInterval(), {}, c.locale) }) };
    }
    const init: RecurrenceRuleInit = { frequency: ui.mode, interval };
    const previous = this.#value ?? this.#initial;
    if (previous) {
      init.weekStart = previous.weekStart;
      init.exclusions = previous.exclusions;
      init.inclusions = previous.inclusions;
    }
    if (ui.mode === 'weekly') {
      if (ui.weekdays.size === 0) return { rule: null, error: 'no-weekday', message: this.#msg('noWeekday') };
      init.byDay = [...ui.weekdays].sort((a, b) => a - b).map((weekday) => ({ weekday }));
    }
    if (ui.mode === 'monthly' || ui.mode === 'yearly') {
      if (ui.mode === 'yearly') init.byMonth = [ui.month];
      if (ui.byWeekday) init.byDay = [{ weekday: ui.weekday, nth: ui.nth }];
      else init.byMonthDay = [ui.mode === 'yearly' ? Math.min(ui.monthDay < 1 ? 1 : ui.monthDay, daysInMonth(2024, ui.month)) : ui.monthDay];
    }
    if (ui.end === 'count') {
      const count = Number(this.#count.value);
      if (!(Number.isInteger(count) && count >= 1 && count <= this.#maxCount())) {
        return { rule: null, error: 'bad-count', message: this.#msg('badCount', { max: formatNumber(this.#maxCount(), {}, c.locale) }) };
      }
      init.count = count;
    } else if (ui.end === 'until') {
      const picker = this.untilPicker;
      if (!picker.validity.valid && picker.validity.error !== 'value-missing') return { rule: null, error: 'bad-until', message: this.#msg('invalidUntil') };
      const date = picker.value;
      if (!date) return { rule: null, error: 'no-until', message: this.#msg('noUntil') };
      const start = this.#startDate();
      if (start && comparePlainDate(date, start) < 0) return { rule: null, error: 'bad-until', message: this.#msg('untilBeforeStart', { start: formatPlainDate(start, { dateStyle: 'medium' }, c.locale) }) };
      const s = this.#options.start;
      // RFC 5545: with a timed start, UNTIL is UTC: the last second of the chosen day in the timezone.
      init.until = s?.kind === 'PlainDateTime' ? instant(toInstant(plainDateTime(addDays(date, 1), plainTime(0)), c.timezone, c.disambiguation).epochMilliseconds - 1000) : date;
    }
    return { rule: recurrenceRule(init), error: null, message: '' };
  }

  #recompute(fromUser: boolean): void {
    if (fromUser) this.#state.customError = null;
    const o = this.#options;
    const c = this.#config();
    if (fromUser) this.#fromControls = true;
    // Programmatic values are kept exactly (the controls only show them); edits rebuild the rule.
    const built = this.#fromControls ? this.#build() : { rule: this.#value, error: null, message: '' };
    const rule = built.rule;
    let error: RecurrencePickerError | null = built.error;
    let message = built.message;
    if (error === null && rule === null && o.required === true) {
      error = 'value-missing';
      message = messageFor({ error: 'value-missing', params: {} }, { locale: c.locale });
    }
    if (error === null) {
      const custom = runValidator(o.validate, rule) ?? this.#state.customError;
      if (custom !== null) {
        error = 'custom';
        message = custom;
      }
    }
    const value = error !== null && error !== 'custom' ? null : rule;
    const validity: RecurrencePickerValidity = error === null ? VALID : Object.freeze({ valid: false, error, message });
    const before = this.#value === null ? '' : recurrenceRuleToString(this.#value);
    const after = value === null ? '' : recurrenceRuleToString(value);
    const changed = before !== after || validity.error !== this.#validity.error;
    this.#value = value;
    this.#validity = validity;
    this.#hidden.value = after;
    this.#renderSummary();
    this.#renderMessages();
    if (fromUser && changed) emit(this.host, 'aui-change', { value, validity } satisfies RecurrencePickerChangeDetail);
  }

  #renderMessages(): void {
    const c = this.#config();
    const show = !this.#validity.valid && this.#state.shouldShow(c.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', this.#options.icons?.error ?? 'alert-circle');
    setDescribedBy(this.fieldset, this.#chrome.describedBy(), [this.#summary.id]);
    this.host.classList.toggle('aui-recurrence-picker--invalid', show);
    const target = this.#validity.error === 'bad-interval' ? this.#interval : this.#validity.error === 'bad-count' ? this.#count : null;
    for (const el of [this.#interval, this.#count]) {
      if (show && el === target) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
    }
  }
}
