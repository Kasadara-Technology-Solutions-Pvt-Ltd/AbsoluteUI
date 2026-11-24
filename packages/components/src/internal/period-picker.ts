/**
 * Shared period picker (SPEC section 18.7): the engine behind Month Picker, Year Picker,
 * and Quarter Picker. A labelled group of numeric segments (typed entry) plus a
 * button that opens a non-modal dialog popup with a paged `role="grid"` of periods
 * (roving tabindex, like Calendar). Every period is mapped to an integer ordinal
 * (months: year * 12 + month - 1, quarters: year * 4 + quarter - 1, years: the
 * year), so paging and keyboard movement are plain arithmetic.
 * "Current" periods are computed in the configured timezone (UTC by default, section 8.1).
 * Internal: not a public subpath export.
 */
import {
  configurationError,
  createId,
  DisposableGroup,
  emit,
  getMessage,
  now,
  registerMessages,
  toPlainDateTime,
  validators,
  type ComponentConfigHandle,
  type Disposer,
  type PlainDate,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { autoPosition, openPopover, type PopoverHandle } from '@absoluteui/utilities';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, setText, validationTimingSpec, type FormControl, type ValidationTiming } from './field.js';
import { messageFor, runValidator } from './validation.js';

export interface PeriodPickerConfig {
  validationTiming: ValidationTiming;
  /** Close the popup after a period is picked. */
  closeOnSelect: boolean;
}

export type PeriodResolved = Readonly<PeriodPickerConfig & { locale: string; timezone: string; direction: 'ltr' | 'rtl' }>;
export type PeriodConfigHandle = ComponentConfigHandle<PeriodPickerConfig & { locale: string; timezone: string; direction: 'ltr' | 'rtl' }>;

/** Schema shared by the three period pickers' `defineComponentConfig` calls. */
export const periodConfigSchema = {
  validationTiming: validationTimingSpec,
  closeOnSelect: { default: true, expected: 'boolean', validate: validators.isBoolean },
};

registerMessages('periodPicker', 'en', {
  year: 'Year',
  month: 'Month',
  quarter: 'Quarter',
  placeholderYear: 'yyyy',
  placeholderMonth: 'mm',
  placeholderQuarter: 'q',
  yearIncomplete: 'Enter the year with 4 digits.',
});

export type PeriodPickerError =
  | 'incomplete'
  | 'invalid'
  | 'value-missing'
  | 'range-underflow'
  | 'range-overflow'
  /** Rejected by the component's is...Disabled callback. */
  | 'unavailable'
  /** From the `validate` callback or `setCustomError`. */
  | 'custom';

export interface PeriodPickerValidity {
  readonly valid: boolean;
  readonly error: PeriodPickerError | null;
  /** Localized message for `error`; empty when valid. */
  readonly message: string;
}

export interface PeriodPickerChangeDetail<V> {
  value: V | null;
  validity: PeriodPickerValidity;
}

export interface PeriodPickerIcons {
  /** Button that opens the popup. */
  calendar: IconRef;
  previous: IconRef;
  next: IconRef;
  error: IconRef;
}

/** Options every period picker accepts. */
export interface PeriodPickerOptions<V> extends Partial<PeriodPickerConfig> {
  /** Visible label (required accessible name for the group). */
  label: string;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  value?: V | null;
  /** Inclusive lower bound (validation and popup). */
  min?: V | null;
  /** Inclusive upper bound (validation and popup). */
  max?: V | null;
  /** Form field name; a hidden input carries the ISO form value. */
  name?: string;
  /** Help text, referenced by aria-describedby (text only). */
  description?: string;
  required?: boolean;
  disabled?: boolean;
  /** Focusable and submitted, but not editable; the popup does not open. */
  readOnly?: boolean;
  /** Consumer validation; return a message to mark the value invalid. */
  validate?: (value: V | null) => string | null;
  locale?: string;
  timezone?: string;
  direction?: 'ltr' | 'rtl';
  /**
   * Advanced: fixed "today" instead of the current date in `timezone` (it decides the
   * current period). For tests, server rendering, and demos with a fixed clock.
   */
  today?: PlainDate;
  icons?: Partial<PeriodPickerIcons>;
}

export type PeriodField = 'year' | 'month' | 'quarter';
export type PeriodParts = Partial<Record<PeriodField, number>>;
export type LayoutPart = { readonly field: PeriodField } | { readonly literal: string };

const FIELD_RANGE: Record<PeriodField, readonly [number, number]> = { year: [1, 9999], month: [1, 12], quarter: [1, 4] };
const FIELD_LENGTH: Record<PeriodField, number> = { year: 4, month: 2, quarter: 1 };
const SEPARATORS = ['/', '-', '.', ' ', ',', ':'];

/** Everything that differs between Month, Year, and Quarter Picker. */
export interface PeriodKind<V, O extends PeriodPickerOptions<V>> {
  /** Configuration key and message namespace, e.g. `monthPicker`. */
  readonly key: string;
  /** CSS class prefix, e.g. `aui-month-picker`. */
  readonly prefix: string;
  readonly config: PeriodConfigHandle;
  /** Expected value type, for configuration errors. */
  readonly expected: string;
  /** Periods per popup page and grid columns. */
  readonly pageSize: number;
  readonly columns: number;
  isValue(value: unknown): value is V;
  toOrdinal(value: V): number;
  fromOrdinal(ordinal: number): V;
  /** Ordinal of the first and last supported period (years 1-9999). */
  readonly minOrdinal: number;
  readonly maxOrdinal: number;
  /** ISO form value. */
  toFormValue(value: V): string;
  /** The period containing `date`. */
  periodOf(date: PlainDate): V;
  /** Segment order and literals for a locale. */
  layout(locale: string): readonly LayoutPart[];
  toParts(value: V): PeriodParts;
  /** Build a value from complete, in-range segments. */
  fromParts(parts: Readonly<Record<PeriodField, number>>): V;
  /** Human-readable value (messages, button label). */
  format(value: V, locale: string): string;
  cellText(value: V, locale: string): string;
  /** Optional secondary line in a cell (for example the months of a quarter). */
  cellHint?(value: V, locale: string): string;
  /** Accessible name of a cell. */
  cellLabel(value: V, locale: string): string;
  pageHeading(first: V, last: V, locale: string): string;
  /** The consumer's is...Disabled callback. */
  isDisabled(options: O): ((value: V) => boolean) | undefined;
  /** Name of that option, for configuration errors. */
  readonly disabledOption: string;
}

/** Split a message pattern such as `Q{quarter} {year}` into literals and fields. */
export function patternLayout(pattern: string): LayoutPart[] {
  const parts: LayoutPart[] = [];
  for (const piece of pattern.split(/(\{(?:year|month|quarter)\})/)) {
    if (piece === '') continue;
    const field = /^\{(year|month|quarter)\}$/.exec(piece)?.[1];
    parts.push(field === 'year' || field === 'month' || field === 'quarter' ? { field } : { literal: piece });
  }
  return parts;
}

interface Segment {
  readonly field: PeriodField;
  readonly input: HTMLInputElement;
}

const VALID: PeriodPickerValidity = Object.freeze({ valid: true, error: null, message: '' });

/**
 * @internal Base class of the period pickers. Subclasses only supply a `PeriodKind`
 * and a static `create()`.
 */
export abstract class PeriodPicker<V, O extends PeriodPickerOptions<V>> implements FormControl {
  readonly host: HTMLElement;
  /** The labelled `role="group"` with the segments and the button; also the popup anchor. */
  readonly group: HTMLDivElement;
  /** Opens the popup. */
  readonly button: HTMLButtonElement;
  /** `role="dialog"` popup (Popover API, non-modal). */
  readonly popup: HTMLDivElement;
  /** The `role="grid"` of periods inside the popup. */
  readonly grid: HTMLDivElement;
  #options: O;
  #value: V | null = null;
  #initialValue: V | null;
  #validity: PeriodPickerValidity = VALID;
  #segments: Segment[] = [];
  #layoutKey = '';
  /** Ordinal of the cell holding the roving tab stop. */
  #focused = 0;
  #popover: PopoverHandle | null = null;
  #stopPosition: Disposer | null = null;
  readonly #kind: PeriodKind<V, O>;
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #fields: HTMLDivElement;
  readonly #heading: HTMLDivElement;
  readonly #prev: HTMLButtonElement;
  readonly #next: HTMLButtonElement;
  readonly #cells: HTMLDivElement[] = [];
  readonly #hidden: HTMLInputElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  protected constructor(host: HTMLElement, options: O, kind: PeriodKind<V, O>) {
    this.#kind = kind;
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#initialValue = options.value ?? null;
    const doc = this.#doc;
    const p = kind.prefix;

    // A <label> cannot name a group; it is associated through aria-labelledby (as in Time Picker).
    this.#chrome = new FieldChrome(doc, 'label', p);
    this.group = doc.createElement('div');
    this.group.className = `${p}__group aui-period-picker__group`;
    this.group.setAttribute('role', 'group');
    this.group.setAttribute('aria-labelledby', this.#chrome.label.id);
    this.#fields = doc.createElement('div');
    this.#fields.className = 'aui-period-picker__fields';
    this.button = doc.createElement('button');
    this.button.type = 'button';
    this.button.className = 'aui-period-picker__button';
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');
    this.group.append(this.#fields, this.button);

    this.popup = doc.createElement('div');
    this.popup.id = createId(`${p}-popup`);
    this.popup.className = 'aui-period-picker__popup';
    this.popup.setAttribute('role', 'dialog');
    this.popup.setAttribute('aria-modal', 'false');
    // Hidden by the UA stylesheet until shown in the top layer.
    this.popup.popover = 'manual';
    this.button.setAttribute('aria-controls', this.popup.id);
    const header = doc.createElement('div');
    header.className = 'aui-period-picker__header';
    this.#prev = doc.createElement('button');
    this.#prev.type = 'button';
    this.#prev.className = 'aui-period-picker__nav aui-period-picker__prev';
    this.#next = doc.createElement('button');
    this.#next.type = 'button';
    this.#next.className = 'aui-period-picker__nav aui-period-picker__next';
    this.#heading = doc.createElement('div');
    this.#heading.className = 'aui-period-picker__heading';
    this.#heading.id = createId(`${p}-heading`);
    // Announces the new page when the user navigates.
    this.#heading.setAttribute('aria-live', 'polite');
    header.append(this.#prev, this.#heading, this.#next);
    this.grid = doc.createElement('div');
    this.grid.className = `aui-period-picker__grid ${p}__grid`;
    this.grid.setAttribute('role', 'grid');
    this.grid.setAttribute('aria-labelledby', this.#heading.id);
    for (let r = 0; r < kind.pageSize / kind.columns; r++) {
      const row = doc.createElement('div');
      row.className = 'aui-period-picker__row';
      row.setAttribute('role', 'row');
      for (let c = 0; c < kind.columns; c++) {
        const cell = doc.createElement('div');
        cell.className = 'aui-period-picker__cell';
        cell.setAttribute('role', 'gridcell');
        this.#cells.push(cell);
        row.append(cell);
      }
      this.grid.append(row);
    }
    this.popup.append(header, this.grid);

    this.#hidden = doc.createElement('input');
    this.#hidden.type = 'hidden';

    host.classList.add('aui-field', 'aui-period-picker', p);
    host.replaceChildren(this.#chrome.label, this.group, this.#chrome.description, this.#chrome.error, this.#hidden, this.popup);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#writeValue(this.#initialValue);
    this.#recompute(false);
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(kind.config.subscribe(() => {
      this.#render();
      this.#recompute(false);
      if (this.#popover) this.#renderGrid();
    }));
  }

  get value(): V | null {
    return this.#value;
  }

  get validity(): PeriodPickerValidity {
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

  get options(): Readonly<O> {
    return this.#options;
  }

  /** The period holding the roving tab stop in the popup grid. */
  get focusedValue(): V {
    return this.#kind.fromOrdinal(this.#focused);
  }

  /** The period containing today in the configured timezone (or the `today` option). */
  get current(): V {
    return this.#kind.periodOf(this.#today());
  }

  /** ISO form value, or null when empty or invalid. */
  getFormValue(): string | null {
    return this.#value === null ? null : this.#kind.toFormValue(this.#value);
  }

  /** Set the value programmatically (no events). Clears an external custom error. */
  setValue(value: V | null): void {
    this.#assertValue(value, 'value');
    this.#state.customError = null;
    this.#writeValue(value);
    this.#recompute(false);
    if (this.#popover) this.#renderGrid();
  }

  update(options: Partial<O>): void {
    const next: O = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    // Render first: a locale change rebuilds the segments from the current value.
    this.#render();
    if ('value' in options) this.#writeValue(options.value ?? null);
    this.#recompute(false);
    if (this.#popover) {
      if (next.disabled || next.readOnly) this.close();
      else this.#renderGrid();
    }
  }

  /** Open the popup and move focus to the selected period (or the current one). */
  open(): void {
    const o = this.#options;
    if (this.#popover || o.disabled || o.readOnly) return;
    const config = this.#config();
    this.#focused = this.#clamp(this.#kind.toOrdinal(this.#value ?? this.current));
    this.#renderGrid();
    this.#popover = openPopover(this.popup, {
      inside: [this.button],
      onDismiss: () => {
        this.close();
      },
    });
    this.#stopPosition = autoPosition(this.group, this.popup, { placement: 'bottom-start', direction: config.direction });
    this.button.setAttribute('aria-expanded', 'true');
    this.#focusCell();
    emit(this.host, 'aui-open', null, { bubbles: false });
  }

  /** Close the popup. Focus inside it returns to the button. */
  close(): void {
    const handle = this.#popover;
    if (!handle) return;
    const hadFocus = this.popup.contains(this.#doc.activeElement);
    // Clear state first: hiding the popover can move focus and re-enter close() via focusout.
    this.#popover = null;
    this.#stopPosition?.();
    this.#stopPosition = null;
    // Focus moves before the popup hides, so focus never falls to the body.
    if (hadFocus) this.button.focus();
    handle.close();
    this.button.setAttribute('aria-expanded', 'false');
    emit(this.host, 'aui-close', null, { bubbles: false });
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

  /** Focus the first segment. */
  focus(): void {
    this.#segments[0]?.input.focus();
  }

  /** Close, restore the initial value, and clear dirty/touched/submitted state (no events). */
  reset(): void {
    this.close();
    this.#state.reset();
    this.#writeValue(this.#initialValue);
    this.#recompute(false);
  }

  destroy(): void {
    this.close();
    this.#group.dispose();
    this.host.replaceChildren();
    const p = this.#kind.prefix;
    this.host.classList.remove('aui-field', 'aui-period-picker', p, 'aui-period-picker--invalid', 'aui-period-picker--disabled', 'aui-period-picker--readonly');
  }

  #config(options: O = this.#options): PeriodResolved {
    const o = options;
    return this.#kind.config.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.closeOnSelect === undefined ? {} : { closeOnSelect: o.closeOnSelect }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.timezone === undefined ? {} : { timezone: o.timezone }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #fail(property: string, expected: string): never {
    const { key } = this.#kind;
    const code = key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();
    throw configurationError(`${code}_OPTIONS`, 'Invalid period picker options.', { component: key, property: `${key}.${property}`, expected });
  }

  #assertValue(value: unknown, property: string): void {
    if (value !== null && value !== undefined && !this.#kind.isValue(value)) this.#fail(property, `${this.#kind.expected} or null`);
  }

  #assertOptions(options: O): void {
    if (typeof options.label !== 'string' || options.label.trim() === '') this.#fail('label', 'non-empty string (accessible name)');
    for (const key of ['value', 'min', 'max'] as const) this.#assertValue(options[key], key);
    const { min, max } = options;
    if (min !== undefined && min !== null && max !== undefined && max !== null && this.#kind.toOrdinal(min) > this.#kind.toOrdinal(max)) this.#fail('min', 'min <= max');
    if (options.validate !== undefined && typeof options.validate !== 'function') this.#fail('validate', '(value) => string | null');
    const disabled: unknown = this.#kind.isDisabled(options);
    if (disabled !== undefined && typeof disabled !== 'function') this.#fail(this.#kind.disabledOption, '(value) => boolean');
    const today: unknown = options.today;
    if (today !== undefined && (typeof today !== 'object' || today === null || !('kind' in today) || today.kind !== 'PlainDate')) this.#fail('today', 'PlainDate');
    // Validates config-backed options (validationTiming, closeOnSelect, locale, timezone, direction).
    this.#config(options);
  }

  #today(): PlainDate {
    return this.#options.today ?? toPlainDateTime(now(), this.#config().timezone).date;
  }

  #bounds(): [number, number] {
    const { min, max } = this.#options;
    const k = this.#kind;
    return [min ? k.toOrdinal(min) : k.minOrdinal, max ? k.toOrdinal(max) : k.maxOrdinal];
  }

  #clamp(ordinal: number): number {
    const [lo, hi] = this.#bounds();
    return Math.min(hi, Math.max(lo, ordinal));
  }

  #isDisabledOrdinal(ordinal: number): boolean {
    const [lo, hi] = this.#bounds();
    if (ordinal < lo || ordinal > hi) return true;
    return this.#kind.isDisabled(this.#options)?.(this.#kind.fromOrdinal(ordinal)) === true;
  }

  #pageStart(ordinal: number): number {
    const size = this.#kind.pageSize;
    return Math.floor(ordinal / size) * size;
  }

  // ---- Field -------------------------------------------------------------

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const k = this.#kind;
    if (config.locale !== this.#layoutKey) {
      this.#buildSegments(config.locale);
      this.#layoutKey = config.locale;
    }
    const disabled = o.disabled ?? false;
    const readOnly = o.readOnly ?? false;
    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    for (const s of this.#segments) {
      s.input.disabled = disabled;
      s.input.readOnly = readOnly;
      s.input.required = o.required ?? false;
    }
    this.button.disabled = disabled || readOnly;
    this.button.replaceChildren(renderIcon(o.icons?.calendar ?? 'calendar', { doc: this.#doc }));
    this.#renderButtonLabel(config);
    this.popup.setAttribute('aria-label', getMessage(k.key, 'choose', {}, config.locale));
    this.popup.dir = config.direction;
    this.#prev.setAttribute('aria-label', getMessage(k.key, 'previous', {}, config.locale));
    this.#next.setAttribute('aria-label', getMessage(k.key, 'next', {}, config.locale));
    this.#prev.replaceChildren(renderIcon(o.icons?.previous ?? 'chevron-left', { doc: this.#doc }));
    this.#next.replaceChildren(renderIcon(o.icons?.next ?? 'chevron-right', { doc: this.#doc }));
    if (o.name) this.#hidden.name = o.name;
    else this.#hidden.removeAttribute('name');
    // Like native controls, a disabled picker is not submitted.
    this.#hidden.disabled = disabled;
    this.host.classList.toggle('aui-period-picker--disabled', disabled);
    this.host.classList.toggle('aui-period-picker--readonly', readOnly && !disabled);
  }

  #renderButtonLabel(config: PeriodResolved): void {
    const k = this.#kind;
    const v = this.#value;
    this.button.setAttribute('aria-label', v === null ? getMessage(k.key, 'choose', {}, config.locale) : getMessage(k.key, 'change', { value: k.format(v, config.locale) }, config.locale));
  }

  /** Build segments in locale order, keeping what the user entered. */
  #buildSegments(locale: string): void {
    const doc = this.#doc;
    const previous = new Map(this.#segments.map((s) => [s.field, s.input.value] as const));
    const focused = this.#segments.find((s) => s.input === doc.activeElement)?.field;
    const nodes: Node[] = [];
    this.#segments = [];
    for (const part of this.#kind.layout(locale)) {
      if ('literal' in part) {
        const sep = doc.createElement('span');
        sep.className = 'aui-period-picker__separator';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = part.literal;
        nodes.push(sep);
        continue;
      }
      const { field } = part;
      const input = doc.createElement('input');
      input.type = 'text';
      input.className = `aui-period-picker__segment aui-period-picker__segment--${field}`;
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.maxLength = FIELD_LENGTH[field];
      input.size = FIELD_LENGTH[field];
      input.setAttribute('aria-label', getMessage('periodPicker', field, {}, locale));
      input.placeholder = getMessage('periodPicker', `placeholder${field.charAt(0).toUpperCase()}${field.slice(1)}`, {}, locale);
      input.value = previous.get(field) ?? '';
      this.#segments.push({ field, input });
      nodes.push(input);
    }
    this.#fields.replaceChildren(...nodes);
    if (focused) this.#segments.find((s) => s.field === focused)?.input.focus();
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
      if (this.#popover) this.close();
      else this.open();
    });
    g.listen(this.#prev, 'click', () => {
      this.#page(-1);
    });
    g.listen(this.#next, 'click', () => {
      this.#page(1);
    });
    g.listen(this.grid, 'keydown', (event) => {
      this.#onGridKeyDown(event);
    });
    g.listen(this.grid, 'click', (event) => {
      const cell = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="gridcell"]') : null;
      if (cell?.dataset.ordinal !== undefined) this.#pick(Number(cell.dataset.ordinal));
    });
    // Pointer focus on a cell keeps the roving tab stop in sync.
    g.listen(this.grid, 'focusin', (event) => {
      const ordinal = event.target instanceof HTMLElement ? event.target.dataset.ordinal : undefined;
      if (ordinal === undefined || Number(ordinal) === this.#focused) return;
      this.#focused = Number(ordinal);
      this.#renderTabStops();
    });
    // Focus leaving the popup closes it; the button handles its own click (toggle).
    g.listen(this.popup, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && (this.popup.contains(next) || this.button.contains(next))) return;
      this.close();
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
    const { input, field } = segment;
    const max = FIELD_LENGTH[field];
    const digits = input.value.replace(/\D/g, '').slice(0, max);
    input.value = digits;
    // Complete when full, or when no further digit could form a valid value (month 2-9).
    const complete = digits.length >= max || (field === 'month' && digits.length === 1 && Number(digits) > 1);
    if (complete) {
      if (field === 'month' && digits.length === 1) input.value = digits.padStart(2, '0');
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

  #onSegmentKeyDown(segment: Segment, event: KeyboardEvent): void {
    const o = this.#options;
    const { input, field } = segment;
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
        if (SEPARATORS.includes(event.key) && !o.readOnly) {
          event.preventDefault();
          if (field === 'month' && input.value.length === 1) input.value = input.value.padStart(2, '0');
          this.#focusSibling(segment, 1);
          this.#onUserEdit();
        }
    }
  }

  /** ArrowUp/Down: month and quarter wrap; the year stops at 1 and 9999. */
  #step(segment: Segment, delta: 1 | -1): void {
    const { input, field } = segment;
    const [lo, hi] = FIELD_RANGE[field];
    const current = input.value === '' ? null : Number(input.value);
    let next: number;
    if (current === null) next = field === 'year' ? this.#kind.toParts(this.current).year ?? 1 : delta === 1 ? lo : hi;
    else if (field === 'year') next = Math.min(hi, Math.max(lo, current + delta));
    else next = current + delta > hi ? lo : current + delta < lo ? hi : current + delta;
    input.value = String(next).padStart(FIELD_LENGTH[field], '0');
    input.select();
  }

  #onUserEdit(): void {
    this.#state.dirty = true;
    this.#recompute(true);
  }

  #writeValue(value: V | null): void {
    const parts = value === null ? {} : this.#kind.toParts(value);
    for (const s of this.#segments) {
      const n = parts[s.field];
      s.input.value = n === undefined ? '' : String(n).padStart(FIELD_LENGTH[s.field], '0');
    }
  }

  /** Built-in constraints: the parsed value and the first failing constraint. */
  #check(locale: string): { value: V | null; error: PeriodPickerError | null; message: string } {
    const o = this.#options;
    const k = this.#kind;
    const result = (value: V | null, error: PeriodPickerError | null = null, message = ''): { value: V | null; error: PeriodPickerError | null; message: string } => ({ value, error, message });
    const filled = this.#segments.filter((s) => s.input.value !== '').length;
    if (filled === 0) return o.required ? result(null, 'value-missing', messageFor({ error: 'value-missing', params: {} }, { locale })) : result(null);
    if (filled < this.#segments.length) return result(null, 'incomplete', getMessage(k.key, 'incomplete', {}, locale));
    if (this.#segments.some((s) => s.field === 'year' && s.input.value.length < 4)) return result(null, 'incomplete', getMessage('periodPicker', 'yearIncomplete', {}, locale));
    const parts: Record<PeriodField, number> = { year: 1, month: 1, quarter: 1 };
    for (const s of this.#segments) {
      const n = /^\d+$/.test(s.input.value) ? Number(s.input.value) : NaN;
      const [lo, hi] = FIELD_RANGE[s.field];
      if (!(n >= lo && n <= hi)) return result(null, 'invalid', getMessage(k.key, 'invalid', {}, locale));
      parts[s.field] = n;
    }
    const value = k.fromParts(parts);
    const ordinal = k.toOrdinal(value);
    const { min, max } = o;
    if (min && ordinal < k.toOrdinal(min)) return result(value, 'range-underflow', getMessage(k.key, 'rangeUnderflow', { min: k.format(min, locale) }, locale));
    if (max && ordinal > k.toOrdinal(max)) return result(value, 'range-overflow', getMessage(k.key, 'rangeOverflow', { max: k.format(max, locale) }, locale));
    if (k.isDisabled(o)?.(value) === true) return result(value, 'unavailable', getMessage(k.key, 'unavailable', {}, locale));
    return result(value);
  }

  /** Parse segments into a value and validity; emit when changed by the user. */
  #recompute(fromUser: boolean): void {
    const config = this.#config();
    const k = this.#kind;
    // An external error describes the previous value; user edits clear it.
    if (fromUser) this.#state.customError = null;
    let { value, error, message } = this.#check(config.locale);
    // Precedence: built-in constraint, then `validate`, then an external custom error.
    if (error === null) {
      const custom = runValidator(this.#options.validate, value) ?? this.#state.customError;
      if (custom !== null) {
        error = 'custom';
        message = custom;
      }
    } else value = null;
    const validity: PeriodPickerValidity = error === null ? VALID : Object.freeze({ valid: false, error, message });
    const changed = !this.#same(value, this.#value) || validity.error !== this.#validity.error;
    this.#value = value;
    this.#validity = validity;
    this.#hidden.value = value === null ? '' : k.toFormValue(value);
    this.#renderButtonLabel(config);
    this.#renderMessages();
    if (fromUser && changed) emit(this.host, 'aui-change', { value, validity } satisfies PeriodPickerChangeDetail<V>);
  }

  #same(a: V | null, b: V | null): boolean {
    if (a === null || b === null) return a === b;
    return this.#kind.toOrdinal(a) === this.#kind.toOrdinal(b);
  }

  #renderMessages(): void {
    const config = this.#config();
    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', this.#options.icons?.error ?? 'alert-circle');
    setDescribedBy(this.group, this.#chrome.describedBy());
    for (const s of this.#segments) setInvalid(s.input, show);
    this.host.classList.toggle('aui-period-picker--invalid', show);
  }

  // ---- Popup grid --------------------------------------------------------

  #page(delta: -1 | 1): void {
    const button = delta < 0 ? this.#prev : this.#next;
    if (button.getAttribute('aria-disabled') === 'true') return;
    this.#moveTo(this.#focused + delta * this.#kind.pageSize, false);
  }

  #onGridKeyDown(event: KeyboardEvent): void {
    if (!(event.target instanceof HTMLElement) || event.target.dataset.ordinal === undefined) return;
    const k = this.#kind;
    const base = this.#focused;
    const rtl = this.#config().direction === 'rtl';
    const rowStart = this.#pageStart(base) + Math.floor((base - this.#pageStart(base)) / k.columns) * k.columns;
    let target: number;
    switch (event.key) {
      case 'ArrowRight':
        target = base + (rtl ? -1 : 1);
        break;
      case 'ArrowLeft':
        target = base + (rtl ? 1 : -1);
        break;
      case 'ArrowDown':
        target = base + k.columns;
        break;
      case 'ArrowUp':
        target = base - k.columns;
        break;
      case 'Home':
        target = rowStart;
        break;
      case 'End':
        target = rowStart + k.columns - 1;
        break;
      case 'PageUp':
      case 'PageDown':
        target = base + (event.key === 'PageUp' ? -1 : 1) * k.pageSize * (event.shiftKey ? 10 : 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.#pick(base);
        return;
      default:
        return;
    }
    event.preventDefault();
    this.#moveTo(target, true);
  }

  #moveTo(ordinal: number, focusCell: boolean): void {
    const next = this.#clamp(ordinal);
    const pageChanged = this.#pageStart(next) !== this.#pageStart(this.#focused);
    const hadFocus = this.grid.contains(this.#doc.activeElement);
    this.#focused = next;
    if (pageChanged) this.#renderGrid();
    else this.#renderTabStops();
    if (focusCell || hadFocus) this.#focusCell();
  }

  #focusCell(): void {
    this.#cells.find((c) => c.dataset.ordinal === String(this.#focused))?.focus();
  }

  #pick(ordinal: number): void {
    if (this.#isDisabledOrdinal(ordinal)) return;
    this.#focused = ordinal;
    this.#writeValue(this.#kind.fromOrdinal(ordinal));
    this.#onUserEdit();
    this.#renderGrid();
    if (this.#config().closeOnSelect) this.close();
    else this.#focusCell();
  }

  #renderTabStops(): void {
    for (const cell of this.#cells) {
      if (cell.dataset.ordinal === undefined) cell.removeAttribute('tabindex');
      else cell.tabIndex = cell.dataset.ordinal === String(this.#focused) ? 0 : -1;
    }
  }

  #renderGrid(): void {
    const k = this.#kind;
    const config = this.#config();
    const locale = config.locale;
    const start = this.#pageStart(this.#focused);
    const [lo, hi] = this.#bounds();
    const current = k.toOrdinal(this.current);
    const selected = this.#value === null ? null : k.toOrdinal(this.#value);
    const doc = this.#doc;
    this.grid.dir = config.direction;
    setText(this.#heading, k.pageHeading(k.fromOrdinal(start), k.fromOrdinal(start + k.pageSize - 1), locale));
    // aria-disabled (not disabled) keeps focus on the button when the range ends.
    this.#setDisabled(this.#prev, start <= lo);
    this.#setDisabled(this.#next, start + k.pageSize - 1 >= hi);
    this.#cells.forEach((cell, i) => {
      const ordinal = start + i;
      cell.className = 'aui-period-picker__cell';
      for (const attr of ['aria-selected', 'aria-current', 'aria-disabled', 'aria-label', 'data-ordinal']) cell.removeAttribute(attr);
      // Cells outside the supported years (before year 1 or after 9999) stay empty.
      if (ordinal < k.minOrdinal || ordinal > k.maxOrdinal) {
        cell.classList.add('aui-period-picker__cell--empty');
        cell.replaceChildren();
        return;
      }
      const value = k.fromOrdinal(ordinal);
      cell.dataset.ordinal = String(ordinal);
      cell.setAttribute('aria-label', k.cellLabel(value, locale));
      const text = doc.createElement('span');
      text.className = 'aui-period-picker__cell-text';
      text.textContent = k.cellText(value, locale);
      const hint = k.cellHint?.(value, locale);
      if (hint) {
        const small = doc.createElement('span');
        small.className = 'aui-period-picker__cell-hint';
        small.textContent = hint;
        cell.replaceChildren(text, small);
      } else cell.replaceChildren(text);
      if (ordinal === selected) cell.setAttribute('aria-selected', 'true');
      cell.classList.toggle('aui-period-picker__cell--selected', ordinal === selected);
      if (ordinal === current) {
        cell.setAttribute('aria-current', 'date');
        cell.classList.add('aui-period-picker__cell--current');
      }
      if (this.#isDisabledOrdinal(ordinal)) {
        cell.setAttribute('aria-disabled', 'true');
        cell.classList.add('aui-period-picker__cell--disabled');
      }
    });
    this.#renderTabStops();
  }

  #setDisabled(button: HTMLButtonElement, disabled: boolean): void {
    if (disabled) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  }
}
