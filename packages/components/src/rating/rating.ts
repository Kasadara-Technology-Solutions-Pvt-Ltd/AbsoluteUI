/**
 * Rating (R20 P9). Picks a score on a short scale of stars (or a custom icon): performance
 * reviews, feedback, product quality. Optional half steps; clearable. Pattern: WAI-ARIA APG
 * Slider (one focusable role=slider with aria-valuetext such as "3.5 of 5"), chosen over the
 * radio group pattern because half steps and clearing map onto a single value with
 * min/max, and a slider is one tab stop with arrow, Page, Home/End, and digit keys.
 * `display: true` renders a non-interactive role=img with the same text, for read-only
 * listings. A Form control: validates, serializes, resets with Form; native forms
 * receive a hidden input.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, formatNumber, getCommonConfig, getMessage, registerMessages, validators } from '@absoluteui/core';
import { isVectorIcon, renderIcon, resolveIcon, type IconRef } from '@absoluteui/icons';
import { starIcon } from '@absoluteui/icons/set/star';
import { announce } from '@absoluteui/utilities';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { resolveValidity, runValidator, VALID, type FieldValidity, type Outcome } from '../internal/validation.js';

export type RatingSize = 'sm' | 'md' | 'lg';

export interface RatingConfig {
  validationTiming: ValidationTiming;
  size: RatingSize;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    rating: RatingConfig & { locale: string };
  }
}

export const ratingConfig = defineComponentConfig<RatingConfig, 'locale'>(
  'rating',
  {
    validationTiming: validationTimingSpec,
    size: { default: 'md', expected: '"sm" | "md" | "lg"', validate: validators.oneOf(['sm', 'md', 'lg'] as const) },
  },
  ['locale'],
);

registerMessages('rating', 'en', {
  valueText: '{value} of {max}',
  noRating: 'No rating',
  displayLabel: '{label}: {text}',
  cleared: 'Rating cleared',
});

/** A score, or null for no rating. */
export type RatingValue = number | null;

export interface RatingIcons {
  /** The scale symbol (default: the icon set's star). Rendered outlined (empty) and solid (filled). */
  item: IconRef;
  error: IconRef;
}

export interface RatingOptions extends Partial<RatingConfig> {
  /** Visible label (required accessible name). */
  label: string;
  hideLabel?: boolean;
  description?: string;
  /** Number of symbols, 1 to 10. Default 5. */
  max?: number;
  value?: RatingValue;
  /** Allow half steps (3.5). Default false. */
  allowHalf?: boolean;
  /** Choosing the current value again, Delete, Backspace, or 0 clears the rating. Default true. */
  clearable?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** Focusable and announced, but not changeable. */
  readOnly?: boolean;
  /** Non-interactive display (role=img with the value text), for listings and cards. */
  display?: boolean;
  /** Full value text, such as "Exceeds expectations"; default "{value} of {max}". */
  valueText?: (value: number, max: number) => string;
  /** Visible word under the scale for the current (or hovered) value, such as "Good". */
  labels?: readonly string[];
  name?: string;
  validate?: (value: RatingValue) => string | null;
  locale?: string;
  icons?: Partial<RatingIcons>;
}

/** `aui-change` detail. */
export interface RatingValueDetail {
  value: RatingValue;
  validity: FieldValidity;
}

/** `aui-hover` detail: the previewed value under the pointer, or null when it leaves. */
export interface RatingHoverDetail {
  value: RatingValue;
}

const MAX_ITEMS = 10;

export class Rating implements FormControl {
  readonly host: HTMLElement;
  #options: RatingOptions;
  #value: RatingValue;
  #initial: RatingValue;
  #preview: RatingValue = null;
  #validity: FieldValidity = VALID;
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #control: HTMLDivElement;
  readonly #caption: HTMLDivElement;
  readonly #input: HTMLInputElement;
  #items: HTMLSpanElement[] = [];
  #itemKey: { max: number; icon: IconRef } | null = null;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: RatingOptions): Rating {
    return new Rating(host, options);
  }

  private constructor(host: HTMLElement, options: RatingOptions) {
    Rating.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#value = this.#normalize(options.value ?? null);
    this.#initial = this.#value;
    const doc = this.#doc;
    this.#chrome = new FieldChrome(doc, 'label', 'aui-rating');
    this.#control = doc.createElement('div');
    this.#control.className = 'aui-rating__control';
    this.#control.id = createId('aui-rating');
    this.#caption = doc.createElement('div');
    this.#caption.className = 'aui-rating__caption';
    // The control announces the value; the caption repeats it visually.
    this.#caption.setAttribute('aria-hidden', 'true');
    this.#input = doc.createElement('input');
    this.#input.type = 'hidden';

    // Render first: invalid options (config, messages, valueText) throw before the host is touched.
    this.#render();
    host.classList.add('aui-field', 'aui-rating');
    host.replaceChildren(this.#chrome.label, this.#chrome.description, this.#control, this.#caption, this.#chrome.error, this.#input);
    this.#bind();
    this.#group.add(ratingConfig.subscribe(() => {
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

  get validity(): FieldValidity {
    return this.#validity;
  }

  get dirty(): boolean {
    return this.#value !== this.#initial;
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<RatingOptions> {
    return this.#options;
  }

  get value(): RatingValue {
    return this.#value;
  }

  getFormValue(): RatingValue {
    return this.#value;
  }

  reportValidity(): boolean {
    this.#state.submitted = true;
    this.#render();
    return this.#validity.valid;
  }

  setCustomError(message: string | null): void {
    this.#state.customError = message === '' ? null : message;
    this.#render();
  }

  focus(): void {
    this.#control.focus();
  }

  reset(): void {
    this.#value = this.#initial;
    this.#preview = null;
    this.#state.reset();
    this.#render();
  }

  /** Set the value (rounded to the step and clamped; no event). */
  setValue(value: RatingValue): void {
    this.update({ value });
  }

  update(options: Partial<RatingOptions>): void {
    const next = { ...this.#options, ...options };
    Rating.#assert(next);
    const previous = { options: this.#options, value: this.#value };
    this.#options = next;
    this.#value = this.#normalize('value' in options ? (options.value ?? null) : this.#value);
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
    this.host.classList.remove('aui-field', 'aui-rating', 'aui-rating--sm', 'aui-rating--md', 'aui-rating--lg', 'aui-rating--display', 'aui-rating--disabled', 'aui-rating--readonly', 'aui-rating--invalid');
  }

  static #assert(options: RatingOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('RATING_OPTIONS', 'Invalid rating options.', { component: 'rating', property: `rating.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string (accessible name)');
    const max: unknown = options.max;
    if (max !== undefined && !(typeof max === 'number' && Number.isInteger(max) && max >= 1 && max <= MAX_ITEMS)) fail('max', `integer from 1 to ${String(MAX_ITEMS)}`);
    const value: unknown = options.value;
    if (value !== undefined && value !== null && !(typeof value === 'number' && Number.isFinite(value))) fail('value', 'a finite number or null');
    if (options.valueText !== undefined && typeof options.valueText !== 'function') fail('valueText', '(value: number, max: number) => string');
    const labels: unknown = options.labels;
    if (labels !== undefined && !(Array.isArray(labels) && labels.every((l) => typeof l === 'string'))) fail('labels', 'string[]');
    if (options.validate !== undefined && typeof options.validate !== 'function') fail('validate', '(value: RatingValue) => string | null');
  }

  #max(): number {
    return this.#options.max ?? 5;
  }

  #step(): number {
    return this.#options.allowHalf === true ? 0.5 : 1;
  }

  #clearable(): boolean {
    return this.#options.clearable ?? true;
  }

  /** Round to the step and clamp; 0 and below mean "no rating". */
  #normalize(value: RatingValue): RatingValue {
    if (value === null) return null;
    const step = this.#step();
    const v = Math.min(this.#max(), Math.round(value / step) * step);
    return v <= 0 ? null : v;
  }

  #config(): Readonly<RatingConfig & { locale: string }> {
    const o = this.#options;
    return ratingConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.size === undefined ? {} : { size: o.size }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #text(value: RatingValue, locale: string): string {
    if (value === null) return getMessage('rating', 'noRating', {}, locale);
    const max = this.#max();
    return this.#options.valueText?.(value, max) ?? getMessage('rating', 'valueText', { value: formatNumber(value, { maximumFractionDigits: 1 }, locale), max: formatNumber(max, {}, locale) }, locale);
  }

  #renderItems(icon: IconRef): void {
    const max = this.#max();
    if (this.#itemKey?.max === max && this.#itemKey.icon === icon) return;
    this.#itemKey = { max, icon };
    const doc = this.#doc;
    this.#items = Array.from({ length: max }, () => {
      const item = doc.createElement('span');
      item.className = 'aui-rating__item';
      const empty = renderIcon(icon, { doc, className: 'aui-rating__empty' });
      const fill = doc.createElement('span');
      fill.className = 'aui-rating__fill';
      // The icon's solid variant when it has one; otherwise the outline, filled by the stylesheet.
      const def = resolveIcon(icon);
      const solid = isVectorIcon(def) && def.variants.solid !== undefined;
      fill.classList.toggle('aui-rating__fill--outline', !solid);
      fill.append(renderIcon(icon, solid ? { doc, variant: 'solid' } : { doc }));
      item.append(empty, fill);
      return item;
    });
    this.#control.replaceChildren(...this.#items);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const locale = config.locale;
    const max = this.#max();
    const value = this.#value;
    const text = this.#text(value, locale);
    const shown = this.#preview ?? value;
    const caption = shown === null ? '' : (o.labels?.[Math.ceil(shown) - 1] ?? '');
    const display = o.display === true;
    const disabled = o.disabled === true;
    const readOnly = o.readOnly === true;

    // Validation (required means a rating other than "none").
    const outcome: Outcome = o.required === true && value === null ? { error: 'value-missing', params: {} } : { error: null, params: {} };
    const custom = outcome.error === null ? runValidator(o.validate, value) : null;
    this.#validity = resolveValidity(outcome, { locale, kind: 'choice' }, custom, this.#state.customError);
    const show = !display && !this.#validity.valid && this.#state.shouldShow(config.validationTiming);

    const host = this.host;
    for (const size of ['sm', 'md', 'lg'] as const) host.classList.toggle(`aui-rating--${size}`, config.size === size);
    host.classList.toggle('aui-rating--display', display);
    host.classList.toggle('aui-rating--disabled', disabled);
    host.classList.toggle('aui-rating--readonly', readOnly);
    host.classList.toggle('aui-rating--invalid', show);
    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required && !display, description: o.description });
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    this.#renderItems(o.icons?.item ?? starIcon);
    for (const [i, item] of this.#items.entries()) {
      const fill = shown === null ? 0 : Math.max(0, Math.min(1, shown - i));
      item.style.setProperty('--_aui-rating-fill', `${String(fill * 100)}%`);
      item.classList.toggle('aui-rating__item--preview', this.#preview !== null);
    }
    this.#caption.textContent = caption;
    this.#caption.hidden = caption === '';

    const c = this.#control;
    const label = this.#chrome.label;
    if (display) {
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', getMessage('rating', 'displayLabel', { label: o.label, text }, locale));
      c.removeAttribute('tabindex');
      for (const a of ['aria-labelledby', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext', 'aria-readonly', 'aria-disabled', 'aria-required', 'aria-invalid']) c.removeAttribute(a);
      // The image carries the label; the visible label is not announced twice.
      label.setAttribute('aria-hidden', 'true');
      setDescribedBy(c, this.#chrome.describedBy());
    } else {
      label.removeAttribute('aria-hidden');
      c.setAttribute('role', 'slider');
      c.removeAttribute('aria-label');
      c.setAttribute('aria-labelledby', label.id);
      c.setAttribute('aria-valuemin', String(this.#clearable() ? 0 : this.#step()));
      c.setAttribute('aria-valuemax', String(max));
      c.setAttribute('aria-valuenow', String(value ?? (this.#clearable() ? 0 : this.#step())));
      c.setAttribute('aria-valuetext', text);
      if (readOnly) c.setAttribute('aria-readonly', 'true');
      else c.removeAttribute('aria-readonly');
      if (o.required === true) c.setAttribute('aria-required', 'true');
      else c.removeAttribute('aria-required');
      if (disabled) {
        c.setAttribute('aria-disabled', 'true');
        c.tabIndex = -1;
      } else {
        c.removeAttribute('aria-disabled');
        c.tabIndex = 0;
      }
      setDescribedBy(c, this.#chrome.describedBy());
      setInvalid(c, show);
    }

    const name = o.name ?? null;
    const input = this.#input;
    input.disabled = name === null || disabled || display;
    if (name !== null) input.name = name;
    else input.removeAttribute('name');
    input.value = value === null ? '' : String(value);
  }

  #interactive(): boolean {
    const o = this.#options;
    return o.display !== true && o.disabled !== true && o.readOnly !== true;
  }

  /** Commit a user choice: emits `aui-change` when the value changed. */
  #commit(raw: RatingValue): void {
    const next = this.#normalize(raw);
    if (next === this.#value) return;
    this.#value = next;
    this.#state.dirty = true;
    this.#state.customError = null;
    this.#render();
    if (next === null) announce(getMessage('rating', 'cleared', {}, this.#config().locale), 'polite', this.#doc);
    emit(this.host, 'aui-change', { value: next, validity: this.#validity } satisfies RatingValueDetail);
  }

  /** The value under a pointer position (half steps by the half of the symbol, reading-direction aware). */
  #valueAt(event: MouseEvent): RatingValue {
    const rtl = getComputedStyle(this.#control).direction === 'rtl';
    for (const [i, item] of this.#items.entries()) {
      const r = item.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right) continue;
      const ratio = rtl ? (r.right - event.clientX) / r.width : (event.clientX - r.left) / r.width;
      return this.#options.allowHalf === true && ratio < 0.5 ? i + 0.5 : i + 1;
    }
    return null;
  }

  #setPreview(value: RatingValue): void {
    if (value === this.#preview) return;
    this.#preview = value;
    this.#render();
    emit(this.host, 'aui-hover', { value } satisfies RatingHoverDetail, { bubbles: false });
  }

  #bind(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.#control, 'keydown', (event) => {
      this.#onKey(event);
    });
    g.listen(this.#control, 'pointermove', (event) => {
      if (!this.#interactive() || event.pointerType === 'touch') return;
      this.#setPreview(this.#valueAt(event));
    });
    g.listen(this.#control, 'pointerleave', () => {
      this.#setPreview(null);
    });
    g.listen(this.#control, 'click', (event) => {
      if (!this.#interactive()) return;
      const v = this.#valueAt(event);
      if (v === null) return;
      this.#control.focus();
      this.#commit(v === this.#value && this.#clearable() ? null : v);
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
  }

  #onKey(event: KeyboardEvent): void {
    if (!this.#interactive() || event.altKey || event.ctrlKey || event.metaKey) return;
    const step = this.#step();
    const max = this.#max();
    const current = this.#value ?? 0;
    const rtl = getCommonConfig().direction === 'rtl';
    const min = this.#clearable() ? 0 : step;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowUp':
        next = current + step;
        break;
      case 'ArrowDown':
        next = current - step;
        break;
      case 'ArrowRight':
        next = current + (rtl ? -step : step);
        break;
      case 'ArrowLeft':
        next = current + (rtl ? step : -step);
        break;
      case 'PageUp':
        next = current + 1;
        break;
      case 'PageDown':
        next = current - 1;
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      case 'Delete':
      case 'Backspace':
        if (this.#clearable()) next = 0;
        break;
      default:
        if (/^[0-9]$/.test(event.key)) {
          const digit = Number(event.key);
          if (digit <= max && (digit > 0 || this.#clearable())) next = digit;
        }
    }
    if (next === null) return;
    event.preventDefault();
    this.#commit(Math.max(min, Math.min(max, next)));
  }
}
