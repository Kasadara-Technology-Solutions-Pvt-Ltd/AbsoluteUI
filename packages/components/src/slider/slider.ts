/**
 * Slider (R13-4). Picks a number, or a range with two thumbs, from a bounded scale:
 * volume, price range, working hours. Each thumb is a WAI-ARIA slider (role=slider,
 * aria-valuenow/min/max/text); range thumbs limit each other (APG multi-thumb).
 * Keyboard: arrows by step, Page Up/Down by a large step, Home/End to the ends;
 * horizontal arrows follow the reading direction. Pointer: press anywhere on the
 * track and drag. A Form control: it validates, serializes, and resets with Form,
 * and native forms receive hidden inputs.
 */
import { configurationError, defineComponentConfig, emit, formatNumber, getCommonConfig, getMessage, registerMessages, validators, DisposableGroup, createId } from '@absoluteui/core';
import { applyVisuallyHidden } from '@absoluteui/utilities';
import { FieldChrome, registerControl, setDescribedBy, type ControlValidity, type FormControl } from '../internal/field.js';

export type SliderValue = number | readonly [number, number];

export interface SliderConfig {
  /** Show the current value as text next to the label. */
  showValue: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    slider: SliderConfig & { locale: string };
  }
}

export const sliderConfig = defineComponentConfig<SliderConfig, 'locale'>(
  'slider',
  { showValue: { default: true, expected: 'boolean', validate: validators.isBoolean } },
  ['locale'],
);

registerMessages('slider', 'en', {
  minimum: 'Minimum',
  maximum: 'Maximum',
  rangeText: '{start} to {end}',
});

export interface SliderMark {
  value: number;
  /** Visible label under the mark (decorative; the thumbs announce values). */
  label?: string;
}

export interface SliderOptions extends Partial<SliderConfig> {
  label: string;
  hideLabel?: boolean;
  description?: string;
  /** Default 0. */
  min?: number;
  /** Default 100. */
  max?: number;
  /** Default 1. Values snap to min + n * step. */
  step?: number;
  /** Page Up/Page Down step. Default: a tenth of the scale, rounded to whole steps. */
  largeStep?: number;
  /** A number, or [start, end] with `range`. Default: min (or [min, max]). */
  value?: SliderValue;
  range?: boolean;
  orientation?: 'horizontal' | 'vertical';
  /** true: a tick per step (up to 100); or explicit marks. */
  marks?: boolean | readonly SliderMark[];
  /** Number format of the value text (Intl.NumberFormat options). */
  format?: Intl.NumberFormatOptions;
  /** Full value text, such as "3 stars"; overrides `format`. */
  valueText?: (value: number) => string;
  disabled?: boolean;
  /** Form field name (hidden inputs; a range submits two values under the name). */
  name?: string;
  locale?: string;
}

/** `aui-input` (while moving) and `aui-change` (on commit) detail. */
export interface SliderValueDetail {
  value: SliderValue;
}

const MAX_TICKS = 100;

/** Narrowing that keeps the tuple type (Array.isArray widens readonly tuples to any[]). */
const isPair = (v: SliderValue | undefined): v is readonly [number, number] => Array.isArray(v);

/** Decimals of a step, so values like 0.1 + 0.2 snap to 0.3. */
function decimals(n: number): number {
  const text = String(n);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

export class Slider implements FormControl {
  readonly host: HTMLElement;
  #options: SliderOptions;
  #value: [number, number];
  #initial: [number, number];
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #output: HTMLSpanElement;
  readonly #control: HTMLDivElement;
  readonly #fill: HTMLDivElement;
  readonly #marks: HTMLDivElement;
  readonly #thumbs: [HTMLDivElement, HTMLDivElement];
  readonly #thumbNames: [HTMLSpanElement, HTMLSpanElement];
  readonly #inputs: [HTMLInputElement, HTMLInputElement];
  #customError: string | null = null;
  #touched = false;
  #drag: { thumb: 0 | 1; start: [number, number]; pointer: number } | null = null;
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: SliderOptions): Slider {
    return new Slider(host, options);
  }

  private constructor(host: HTMLElement, options: SliderOptions) {
    Slider.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#value = this.#normalize(options.value);
    this.#initial = [...this.#value];
    const doc = this.#doc;
    this.#chrome = new FieldChrome(doc, 'label', 'aui-slider');
    this.#output = doc.createElement('span');
    this.#output.className = 'aui-slider__output';
    // The thumbs announce their values; the visible text would be read twice.
    this.#output.setAttribute('aria-hidden', 'true');
    const header = doc.createElement('div');
    header.className = 'aui-slider__header';
    header.append(this.#chrome.label, this.#output);
    this.#control = doc.createElement('div');
    this.#control.className = 'aui-slider__control';
    const track = doc.createElement('div');
    track.className = 'aui-slider__track';
    this.#fill = doc.createElement('div');
    this.#fill.className = 'aui-slider__fill';
    track.append(this.#fill);
    const thumb = (): HTMLDivElement => {
      const el = doc.createElement('div');
      el.className = 'aui-slider__thumb';
      el.setAttribute('role', 'slider');
      el.tabIndex = 0;
      return el;
    };
    const name = (): HTMLSpanElement => {
      const el = doc.createElement('span');
      el.id = createId('aui-slider-thumb');
      applyVisuallyHidden(el);
      return el;
    };
    this.#thumbs = [thumb(), thumb()];
    this.#thumbNames = [name(), name()];
    this.#marks = doc.createElement('div');
    this.#marks.className = 'aui-slider__marks';
    this.#marks.setAttribute('aria-hidden', 'true');
    this.#control.append(track, ...this.#thumbs, ...this.#thumbNames);
    const input = (): HTMLInputElement => {
      const el = doc.createElement('input');
      el.type = 'hidden';
      return el;
    };
    this.#inputs = [input(), input()];

    // Render first: invalid options (including config and messages) throw before the host is touched.
    this.#render();
    host.classList.add('aui-field', 'aui-slider');
    host.replaceChildren(header, this.#chrome.description, this.#control, this.#marks, this.#chrome.error, ...this.#inputs);

    for (const [index, el] of this.#thumbs.entries()) {
      this.#group.listen(el, 'keydown', (event) => {
        this.#onKey(event, index === 0 ? 0 : 1);
      });
      this.#group.listen(el, 'blur', () => {
        this.#touched = true;
      });
    }
    this.#group.listen(this.#control, 'pointerdown', (event) => {
      this.#onPointerDown(event);
    });
    this.#group.listen(this.#control, 'pointermove', (event) => {
      this.#onPointerMove(event);
    });
    this.#group.listen(this.#control, 'pointerup', (event) => {
      this.#onPointerEnd(event, true);
    });
    this.#group.listen(this.#control, 'pointercancel', (event) => {
      this.#onPointerEnd(event, false);
    });
    this.#group.add(sliderConfig.subscribe(() => {
      this.#render();
    }));
    this.#group.add(registerControl(this));
  }

  // FormControl contract.
  get name(): string | null {
    return this.#options.name ?? null;
  }

  get label(): string {
    return this.#options.label;
  }

  get disabled(): boolean {
    return this.#options.disabled === true;
  }

  get validity(): ControlValidity {
    return this.#customError === null ? { valid: true, message: '' } : { valid: false, message: this.#customError };
  }

  get dirty(): boolean {
    return this.#value[0] !== this.#initial[0] || this.#value[1] !== this.#initial[1];
  }

  get touched(): boolean {
    return this.#touched;
  }

  get options(): Readonly<SliderOptions> {
    return this.#options;
  }

  /** A number, or [start, end] with `range`. */
  get value(): SliderValue {
    return this.#options.range === true ? [this.#value[0], this.#value[1]] : this.#value[1];
  }

  getFormValue(): unknown {
    return this.#options.range === true ? [this.#value[0], this.#value[1]] : this.#value[1];
  }

  reportValidity(): boolean {
    this.#touched = true;
    return this.validity.valid;
  }

  setCustomError(message: string | null): void {
    this.#customError = message === '' ? null : message;
    this.#render();
  }

  focus(): void {
    this.#thumbs[this.#options.range === true ? 0 : 1].focus();
  }

  reset(): void {
    this.#value = [...this.#initial];
    this.#customError = null;
    this.#touched = false;
    this.#render();
  }

  /** Set the value (snapped and clamped; no event). */
  setValue(value: SliderValue): void {
    this.update({ value });
  }

  update(options: Partial<SliderOptions>): void {
    const next = { ...this.#options, ...options };
    Slider.#assert(next);
    const previous = { options: this.#options, value: this.#value };
    this.#options = next;
    // New bounds, step, or mode re-snap the current value.
    this.#value = this.#normalize(options.value ?? this.value);
    try {
      this.#render();
    } catch (error) {
      this.#options = previous.options;
      this.#value = previous.value;
      this.#render();
      throw error;
    }
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-slider', 'aui-slider--range', 'aui-slider--vertical', 'aui-slider--disabled', 'aui-slider--invalid');
  }

  static #assert(options: SliderOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('SLIDER_OPTIONS', 'Invalid slider options.', { component: 'slider', property: `slider.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string');
    const finite = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
    const min = options.min ?? 0;
    const max = options.max ?? 100;
    const step = options.step ?? 1;
    if (!finite(min) || !finite(max) || max <= min) fail('min', 'finite numbers with min < max');
    if (!finite(step) || step <= 0 || step > max - min) fail('step', 'a positive number no larger than max - min');
    if (options.largeStep !== undefined && (!finite(options.largeStep) || options.largeStep <= 0)) fail('largeStep', 'a positive number');
    const value: unknown = options.value;
    if (value !== undefined) {
      const ok = options.range === true ? Array.isArray(value) && value.length === 2 && value.every(finite) : finite(value);
      if (!ok) fail('value', options.range === true ? '[start, end] numbers' : 'a finite number');
    }
    const orientation: unknown = options.orientation;
    if (orientation !== undefined && orientation !== 'horizontal' && orientation !== 'vertical') fail('orientation', '"horizontal" | "vertical"');
    const marks: unknown = options.marks;
    if (marks !== undefined && typeof marks !== 'boolean' && !(Array.isArray(marks) && marks.every((m: { value?: unknown }) => finite(m.value)))) fail('marks', 'boolean or { value, label? }[]');
    if (options.valueText !== undefined && typeof options.valueText !== 'function') fail('valueText', '(value: number) => string');
  }

  #bounds(): { min: number; max: number; step: number } {
    return { min: this.#options.min ?? 0, max: this.#options.max ?? 100, step: this.#options.step ?? 1 };
  }

  #snap(raw: number): number {
    const { min, max, step } = this.#bounds();
    const snapped = min + Math.round((raw - min) / step) * step;
    const clamped = Math.min(max, Math.max(min, snapped));
    // Snap to the last whole step below max when max is not on the step grid.
    const lastStep = min + Math.floor((max - min) / step) * step;
    const value = clamped > lastStep && clamped < max ? lastStep : clamped;
    return Number(value.toFixed(Math.max(decimals(step), decimals(min))));
  }

  /** Internal pair: [start, end]; a single value lives in end. */
  #normalize(value: SliderValue | undefined): [number, number] {
    const { min, max } = this.#bounds();
    if (this.#options.range === true) {
      const pair: readonly [number, number] = isPair(value) ? value : [min, typeof value === 'number' ? value : max];
      const a = this.#snap(pair[0]);
      const b = this.#snap(pair[1]);
      return a <= b ? [a, b] : [b, a];
    }
    return [min, this.#snap(typeof value === 'number' ? value : isPair(value) ? value[1] : min)];
  }

  #largeStep(): number {
    const { min, max, step } = this.#bounds();
    return this.#options.largeStep ?? Math.max(step, Math.round((max - min) / 10 / step) * step);
  }

  #text(value: number, locale: string): string {
    return this.#options.valueText?.(value) ?? formatNumber(value, this.#options.format ?? {}, locale);
  }

  #render(): void {
    const o = this.#options;
    // Everything that can throw (config, messages, valueText) runs before the DOM is changed.
    const { showValue, locale } = sliderConfig.resolve({
      ...(o.showValue === undefined ? {} : { showValue: o.showValue }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
    const { min, max, step } = this.#bounds();
    const range = o.range === true;
    const [start, end] = this.#value;
    const texts = [this.#text(start, locale), this.#text(end, locale)] as const;
    const output = range ? getMessage('slider', 'rangeText', { start: texts[0], end: texts[1] }, locale) : texts[1];
    const names = [getMessage('slider', 'minimum', {}, locale), getMessage('slider', 'maximum', {}, locale)] as const;
    const marks = this.#markList(min, max, step);
    const markLabels = marks.map((m) => m.label ?? '');

    const vertical = o.orientation === 'vertical';
    const disabled = o.disabled === true;
    const host = this.host;
    host.classList.toggle('aui-slider--range', range);
    host.classList.toggle('aui-slider--vertical', vertical);
    host.classList.toggle('aui-slider--disabled', disabled);
    host.classList.toggle('aui-slider--invalid', this.#customError !== null);
    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, description: o.description });
    this.#chrome.setError(this.#customError ?? '', 'alert-circle');
    this.#output.textContent = output;
    this.#output.hidden = !showValue;
    const pct = (v: number): string => `${String(((v - min) / (max - min)) * 100)}%`;
    this.#control.style.setProperty('--_aui-slider-start', range ? pct(start) : '0%');
    this.#control.style.setProperty('--_aui-slider-end', pct(end));
    const describedBy = this.#chrome.describedBy();
    for (const [i, thumb] of this.#thumbs.entries()) {
      const isStart = i === 0;
      thumb.hidden = isStart && !range;
      const value = isStart ? start : end;
      thumb.style.setProperty('--_aui-slider-pos', pct(value));
      thumb.setAttribute('aria-valuemin', String(isStart || !range ? min : start));
      thumb.setAttribute('aria-valuemax', String(isStart ? end : max));
      thumb.setAttribute('aria-valuenow', String(value));
      thumb.setAttribute('aria-valuetext', texts[i] ?? '');
      if (vertical) thumb.setAttribute('aria-orientation', 'vertical');
      else thumb.removeAttribute('aria-orientation');
      if (disabled) {
        thumb.setAttribute('aria-disabled', 'true');
        thumb.tabIndex = -1;
      } else {
        thumb.removeAttribute('aria-disabled');
        thumb.tabIndex = 0;
      }
      const thumbName = this.#thumbNames[isStart ? 0 : 1];
      thumbName.textContent = names[isStart ? 0 : 1];
      thumb.setAttribute('aria-labelledby', range ? `${this.#chrome.label.id} ${thumbName.id}` : this.#chrome.label.id);
      setDescribedBy(thumb, describedBy);
      if (this.#customError !== null) thumb.setAttribute('aria-invalid', 'true');
      else thumb.removeAttribute('aria-invalid');
    }
    // Marks: ticks with optional labels.
    this.#marks.hidden = marks.length === 0;
    this.#marks.replaceChildren(
      ...marks.map((m, i) => {
        const tick = this.#doc.createElement('span');
        tick.className = 'aui-slider__mark';
        tick.classList.toggle('aui-slider__mark--active', range ? m.value >= start && m.value <= end : m.value <= end);
        tick.style.setProperty('--_aui-slider-pos', pct(m.value));
        if (markLabels[i]) {
          const text = this.#doc.createElement('span');
          text.className = 'aui-slider__mark-label';
          text.textContent = markLabels[i] ?? '';
          tick.append(text);
        }
        return tick;
      }),
    );
    // Native form submission.
    const name = o.name ?? null;
    for (const [i, input] of this.#inputs.entries()) {
      const used = name !== null && (range || i === 1);
      input.disabled = !used || disabled;
      if (used) input.name = name;
      else input.removeAttribute('name');
      input.value = String(i === 0 ? start : end);
    }
  }

  #markList(min: number, max: number, step: number): SliderMark[] {
    const marks = this.#options.marks;
    if (typeof marks === 'object') return marks.filter((m) => m.value >= min && m.value <= max);
    if (marks !== true) return [];
    const count = Math.floor((max - min) / step);
    if (count > MAX_TICKS) return [{ value: min }, { value: max }];
    return Array.from({ length: count + 1 }, (_, i) => ({ value: Number((min + i * step).toFixed(decimals(step))) }));
  }

  /** Move a thumb; returns whether the value changed. Range thumbs cannot cross. */
  #set(thumb: 0 | 1, raw: number): boolean {
    let v = this.#snap(raw);
    if (this.#options.range === true) v = thumb === 0 ? Math.min(v, this.#value[1]) : Math.max(v, this.#value[0]);
    if (this.#value[thumb] === v) return false;
    this.#value[thumb] = v;
    this.#render();
    emit(this.host, 'aui-input', { value: this.value } satisfies SliderValueDetail);
    return true;
  }

  #onKey(event: KeyboardEvent, thumb: 0 | 1): void {
    if (this.disabled) return;
    const { min, max, step } = this.#bounds();
    const current = this.#value[thumb];
    // Horizontal arrows follow the reading direction: in RTL, ArrowLeft increases.
    const rtl = getCommonConfig().direction === 'rtl' && this.#options.orientation !== 'vertical';
    const delta: Record<string, number> = {
      ArrowUp: step,
      ArrowDown: -step,
      ArrowRight: rtl ? -step : step,
      ArrowLeft: rtl ? step : -step,
      PageUp: this.#largeStep(),
      PageDown: -this.#largeStep(),
    };
    let next: number | null = null;
    if (event.key in delta) next = current + (delta[event.key] ?? 0);
    else if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    if (next === null) return;
    event.preventDefault();
    if (this.#set(thumb, next)) emit(this.host, 'aui-change', { value: this.value } satisfies SliderValueDetail);
  }

  #valueAt(event: PointerEvent): number {
    const rect = this.#control.getBoundingClientRect();
    const { min, max } = this.#bounds();
    let ratio: number;
    if (this.#options.orientation === 'vertical') ratio = (rect.bottom - event.clientY) / rect.height;
    else {
      const rtl = getComputedStyle(this.#control).direction === 'rtl';
      ratio = rtl ? (rect.right - event.clientX) / rect.width : (event.clientX - rect.left) / rect.width;
    }
    return min + Math.min(1, Math.max(0, ratio)) * (max - min);
  }

  #onPointerDown(event: PointerEvent): void {
    if (this.disabled || event.button !== 0) return;
    const raw = this.#valueAt(event);
    let thumb: 0 | 1 = 1;
    if (this.#options.range === true) {
      const [a, b] = this.#value;
      // The nearer thumb; between equal thumbs, the side of the press decides.
      thumb = Math.abs(raw - a) < Math.abs(raw - b) || (a === b && raw < a) ? 0 : 1;
    }
    event.preventDefault();
    this.#drag = { thumb, start: [...this.#value], pointer: event.pointerId };
    this.#control.setPointerCapture(event.pointerId);
    this.#thumbs[thumb].focus();
    this.#set(thumb, raw);
  }

  #onPointerMove(event: PointerEvent): void {
    if (this.#drag?.pointer !== event.pointerId) return;
    this.#set(this.#drag.thumb, this.#valueAt(event));
  }

  #onPointerEnd(event: PointerEvent, commit: boolean): void {
    const drag = this.#drag;
    if (drag?.pointer !== event.pointerId) return;
    this.#drag = null;
    if (this.#control.hasPointerCapture(event.pointerId)) this.#control.releasePointerCapture(event.pointerId);
    if (!commit) {
      this.#value = drag.start;
      this.#render();
      return;
    }
    if (drag.start[0] !== this.#value[0] || drag.start[1] !== this.#value[1]) emit(this.host, 'aui-change', { value: this.value } satisfies SliderValueDetail);
  }
}
