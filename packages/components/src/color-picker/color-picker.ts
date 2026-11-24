/**
 * Color Picker (R20 P9). Picks a color through a saturation/brightness area, a hue slider, and
 * an optional opacity slider, or by typing hex, rgb(), or hsl() text. App-supplied preset and
 * recent swatches, a screen eyedropper where the browser has `EyeDropper` (feature-detected),
 * and an optional WCAG contrast hint against a background. Inline, or in a popup opened from a
 * trigger button. The area is one focusable 2D thumb (role=slider; arrows move saturation and
 * brightness, aria-valuetext names both); hue and opacity follow the APG slider pattern.
 * A Form control: it validates, serializes, and resets with Form, and native forms receive a
 * hidden input with the hex value.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, formatNumber, getCommonConfig, getMessage, registerMessages, validators, type Disposer } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, autoPosition, openPopover, type PopoverHandle } from '@absoluteui/utilities';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, setText, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { resolveValidity, runValidator, VALID, type FieldValidity } from '../internal/validation.js';
import { clamp, contrastRatio, formatColor, hsvToRgb, parseColor, rgbToHsv, round, toHex, type ColorFormat, type Hsva } from './color.js';

export type { ColorFormat } from './color.js';

/** A hex color (`#rrggbb`, or `#rrggbbaa` with `alpha`), or null when no color is chosen. */
export type ColorPickerValue = string | null;

export interface ColorPickerConfig {
  validationTiming: ValidationTiming;
  /** Text format of the value field. */
  format: ColorFormat;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    colorPicker: ColorPickerConfig & { locale: string };
  }
}

const FORMATS: readonly ColorFormat[] = ['hex', 'rgb', 'hsl'];

export const colorPickerConfig = defineComponentConfig<ColorPickerConfig, 'locale'>(
  'colorPicker',
  {
    validationTiming: validationTimingSpec,
    format: { default: 'hex', expected: '"hex" | "rgb" | "hsl"', validate: validators.oneOf(FORMATS) },
  },
  ['locale'],
);

registerMessages('colorPicker', 'en', {
  area: 'Saturation and brightness',
  areaText: 'Saturation {saturation}, brightness {brightness}',
  hue: 'Hue',
  hueText: '{hue} degrees',
  alpha: 'Opacity',
  value: 'Color value',
  formats: 'Color format',
  hex: 'HEX',
  rgb: 'RGB',
  hsl: 'HSL',
  presets: 'Preset colors',
  recent: 'Recent colors',
  eyeDropper: 'Pick a color from the screen',
  clear: 'Clear color',
  cleared: 'Color cleared',
  empty: 'No color',
  invalid: 'Enter a color such as {example}.',
  contrast: 'Contrast {ratio}:1 against {background}. {verdict}',
  passAAA: 'Passes AAA.',
  passAA: 'Passes AA.',
  passLarge: 'Passes AA for large text only.',
  fail: 'Fails AA.',
});

/** A swatch: a color text (any supported format) and an optional name for assistive technology. */
export interface ColorSwatch {
  value: string;
  /** Spoken name, such as "Brand blue". Default: the hex value. */
  label?: string;
}

export interface ColorPickerIcons {
  error: IconRef;
  eyeDropper: IconRef;
  clear: IconRef;
}

export interface ColorPickerOptions extends Partial<ColorPickerConfig> {
  /** Visible label (required accessible name). */
  label: string;
  hideLabel?: boolean;
  description?: string;
  /** Initial color: hex, rgb(), or hsl() text, normalized to hex; null for none. */
  value?: ColorPickerValue;
  /** Form field name (a hidden input submits the hex value). */
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Show the opacity slider; the value becomes `#rrggbbaa`. */
  alpha?: boolean;
  /** `inline` renders the panel in place; `popup` (default) opens it from a trigger button. */
  mode?: 'popup' | 'inline';
  /** App-supplied preset swatches. */
  presets?: readonly (string | ColorSwatch)[];
  /** App-supplied recent colors (the app keeps the list). */
  recent?: readonly (string | ColorSwatch)[];
  /** Offer the screen eyedropper where the browser supports it. Default true. */
  eyeDropper?: boolean;
  /** Allow clearing to no color. Default: true unless required. */
  clearable?: boolean;
  /** Background color for the WCAG contrast hint (any supported format). */
  contrastWith?: string;
  /** Consumer validation of the hex value; return a message to mark it invalid. */
  validate?: (value: string) => string | null;
  locale?: string;
  icons?: Partial<ColorPickerIcons>;
}

/** `aui-input` (while moving) and `aui-change` (on commit) detail. */
export interface ColorPickerValueDetail {
  value: ColorPickerValue;
  validity: FieldValidity;
}

type Part = 'area' | 'hue' | 'alpha';

interface EyeDropperResult {
  readonly sRGBHex: string;
}
interface EyeDropperInstance {
  open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult>;
}
type EyeDropperConstructor = new () => EyeDropperInstance;

function eyeDropperOf(doc: Document): EyeDropperConstructor | null {
  const view = doc.defaultView;
  if (!view) return null;
  const ctor: unknown = Reflect.get(view, 'EyeDropper');
  return isConstructor(ctor) ? ctor : null;
}

function isConstructor(value: unknown): value is EyeDropperConstructor {
  return typeof value === 'function';
}

const WHITE: Hsva = { h: 0, s: 0, v: 100, a: 1 };

export class ColorPicker implements FormControl {
  readonly host: HTMLElement;
  /** The value text field. */
  readonly input: HTMLInputElement;
  #options: ColorPickerOptions;
  #hsva: Hsva = { ...WHITE };
  #empty = true;
  #initial: ColorPickerValue;
  #format: ColorFormat | null = null;
  #parseError: string | null = null;
  #editing = false;
  #validity: FieldValidity = VALID;
  #drag: { part: Part; pointer: number; start: ColorPickerValue } | null = null;
  #popover: PopoverHandle | null = null;
  #stopPosition: Disposer | null = null;
  #eyeDropperAbort: AbortController | null = null;
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();
  readonly #trigger: HTMLButtonElement;
  readonly #triggerSwatch: HTMLSpanElement;
  readonly #triggerText: HTMLSpanElement;
  readonly #panel: HTMLDivElement;
  readonly #area: HTMLDivElement;
  readonly #areaThumb: HTMLDivElement;
  readonly #sliders: Record<'hue' | 'alpha', { track: HTMLDivElement; thumb: HTMLDivElement }>;
  readonly #preview: HTMLSpanElement;
  readonly #formats: HTMLDivElement;
  readonly #formatButtons: Map<ColorFormat, HTMLButtonElement>;
  readonly #eyeDropper: HTMLButtonElement;
  readonly #clear: HTMLButtonElement;
  readonly #presets: HTMLDivElement;
  readonly #recent: HTMLDivElement;
  readonly #contrast: HTMLParagraphElement;
  readonly #hidden: HTMLInputElement;

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: ColorPickerOptions): ColorPicker {
    return new ColorPicker(host, options);
  }

  private constructor(host: HTMLElement, options: ColorPickerOptions) {
    ColorPicker.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#setFromValue(options.value ?? null);
    this.#initial = this.value;
    const doc = this.#doc;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] => {
      const node = doc.createElement(tag);
      node.className = className;
      return node;
    };

    this.#chrome = new FieldChrome(doc, 'label', 'aui-color-picker');
    this.#trigger = el('button', 'aui-color-picker__trigger');
    this.#trigger.type = 'button';
    this.#trigger.id = createId('aui-color-picker-trigger');
    this.#trigger.setAttribute('aria-haspopup', 'dialog');
    this.#trigger.setAttribute('aria-expanded', 'false');
    this.#triggerSwatch = el('span', 'aui-color-picker__swatch aui-color-picker__trigger-swatch');
    this.#triggerSwatch.setAttribute('aria-hidden', 'true');
    this.#triggerText = el('span', 'aui-color-picker__trigger-text');
    this.#triggerText.id = createId('aui-color-picker-text');
    this.#trigger.append(this.#triggerSwatch, this.#triggerText);

    this.#panel = el('div', 'aui-color-picker__panel');
    this.#panel.id = createId('aui-color-picker-panel');
    this.#area = el('div', 'aui-color-picker__area');
    this.#areaThumb = el('div', 'aui-color-picker__thumb aui-color-picker__area-thumb');
    this.#areaThumb.setAttribute('role', 'slider');
    this.#areaThumb.setAttribute('aria-valuemin', '0');
    this.#areaThumb.setAttribute('aria-valuemax', '100');
    this.#area.append(this.#areaThumb);
    const slider = (part: 'hue' | 'alpha'): { track: HTMLDivElement; thumb: HTMLDivElement } => {
      const track = el('div', `aui-color-picker__slider aui-color-picker__slider--${part}`);
      const thumb = el('div', 'aui-color-picker__thumb aui-color-picker__slider-thumb');
      thumb.setAttribute('role', 'slider');
      thumb.setAttribute('aria-valuemin', '0');
      thumb.setAttribute('aria-valuemax', part === 'hue' ? '359' : '100');
      track.append(thumb);
      return { track, thumb };
    };
    this.#sliders = { hue: slider('hue'), alpha: slider('alpha') };

    const row = el('div', 'aui-color-picker__row');
    this.#preview = el('span', 'aui-color-picker__swatch aui-color-picker__preview');
    this.#preview.setAttribute('aria-hidden', 'true');
    this.#formats = el('div', 'aui-color-picker__formats');
    this.#formats.setAttribute('role', 'group');
    this.#formatButtons = new Map(FORMATS.map((f) => {
      const b = el('button', 'aui-color-picker__format');
      b.type = 'button';
      b.dataset.format = f;
      return [f, b];
    }));
    this.#formats.append(...this.#formatButtons.values());
    this.input = el('input', 'aui-color-picker__input');
    this.input.type = 'text';
    this.input.id = createId('aui-color-picker-input');
    this.input.spellcheck = false;
    this.input.setAttribute('autocomplete', 'off');
    this.#eyeDropper = el('button', 'aui-color-picker__icon-button aui-color-picker__eyedropper');
    this.#eyeDropper.type = 'button';
    this.#clear = el('button', 'aui-color-picker__icon-button aui-color-picker__clear');
    this.#clear.type = 'button';
    row.append(this.#preview, this.input, this.#eyeDropper, this.#clear);
    this.#presets = el('div', 'aui-color-picker__swatches');
    this.#presets.setAttribute('role', 'group');
    this.#recent = el('div', 'aui-color-picker__swatches');
    this.#recent.setAttribute('role', 'group');
    this.#panel.append(this.#area, this.#sliders.hue.track, this.#sliders.alpha.track, this.#formats, row, this.#presets, this.#recent);

    this.#contrast = el('p', 'aui-color-picker__contrast');
    this.#contrast.id = createId('aui-color-picker-contrast');
    this.#hidden = doc.createElement('input');
    this.#hidden.type = 'hidden';

    // Render first: invalid options (including config and messages) throw before the host is touched.
    this.#render();
    host.classList.add('aui-field', 'aui-color-picker');
    host.replaceChildren(this.#chrome.label, this.#trigger, this.#panel, this.#chrome.description, this.#contrast, this.#chrome.error, this.#hidden);
    this.#bind();
    this.#group.add(registerControl(this));
    this.#group.add(colorPickerConfig.subscribe(() => {
      this.#render();
    }));
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
    return this.value !== this.#initial;
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<ColorPickerOptions> {
    return this.#options;
  }

  /** The hex value, or null. */
  get value(): ColorPickerValue {
    return this.#empty ? null : toHex(hsvToRgb(this.#hsva), this.#options.alpha === true);
  }

  /** Whether the popup is open (always false inline). */
  get open(): boolean {
    return this.#popover?.open === true;
  }

  getFormValue(): ColorPickerValue {
    return this.value;
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
    if (this.#isPopup()) this.#trigger.focus();
    else this.#areaThumb.focus();
  }

  /** Set the value (hex, rgb(), or hsl() text, or null; no event). Invalid text throws. */
  setValue(value: ColorPickerValue): void {
    this.update({ value });
  }

  reset(): void {
    this.#setFromValue(this.#initial);
    this.#state.reset();
    this.#parseError = null;
    this.#editing = false;
    this.#render();
  }

  /** Open the popup (popup mode only). */
  show(): void {
    if (!this.#isPopup() || this.open || this.disabled) return;
    this.#popover = openPopover(this.#panel, {
      inside: [this.#trigger],
      onDismiss: (reason) => {
        this.hide(reason === 'escape');
      },
    });
    this.#stopPosition = autoPosition(this.#trigger, this.#panel, { placement: 'bottom-start', direction: getCommonConfig().direction });
    this.#trigger.setAttribute('aria-expanded', 'true');
    this.#areaThumb.focus();
    emit(this.host, 'aui-open', null, { bubbles: false });
  }

  /** Close the popup; `restoreFocus` moves focus back to the trigger. */
  hide(restoreFocus = true): void {
    if (!this.#popover) return;
    this.#popover.close();
    this.#popover = null;
    this.#stopPosition?.();
    this.#stopPosition = null;
    this.#eyeDropperAbort?.abort();
    this.#trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) this.#trigger.focus();
    emit(this.host, 'aui-close', null, { bubbles: false });
  }

  update(options: Partial<ColorPickerOptions>): void {
    const next = { ...this.#options, ...options };
    ColorPicker.#assert(next);
    const previous = { options: this.#options, hsva: this.#hsva, empty: this.#empty, format: this.#format };
    const wasPopup = this.#isPopup();
    this.#options = next;
    if ('value' in options) {
      this.#setFromValue(options.value ?? null);
      this.#parseError = null;
      this.#editing = false;
    } else if (next.alpha !== true) this.#hsva = { ...this.#hsva, a: 1 };
    if ('format' in options) this.#format = null;
    if (wasPopup && !this.#isPopup()) this.hide(false);
    try {
      this.#render();
    } catch (error) {
      this.#options = previous.options;
      this.#hsva = previous.hsva;
      this.#empty = previous.empty;
      this.#format = previous.format;
      this.#render();
      throw error;
    }
  }

  destroy(): void {
    this.hide(false);
    this.#eyeDropperAbort?.abort();
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-color-picker', 'aui-color-picker--popup', 'aui-color-picker--inline', 'aui-color-picker--disabled', 'aui-color-picker--readonly', 'aui-color-picker--invalid', 'aui-color-picker--empty');
  }

  static #assert(options: ColorPickerOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('COLOR_PICKER_OPTIONS', 'Invalid color picker options.', { component: 'colorPicker', property: `colorPicker.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string (accessible name)');
    const value: unknown = options.value;
    if (value !== undefined && value !== null && (typeof value !== 'string' || (value.trim() !== '' && parseColor(value) === null))) fail('value', 'hex, rgb(), or hsl() color text, or null');
    const mode: unknown = options.mode;
    if (mode !== undefined && mode !== 'popup' && mode !== 'inline') fail('mode', '"popup" | "inline"');
    const swatches = (list: unknown, property: string): void => {
      if (list === undefined) return;
      const ok = Array.isArray(list) && list.every((s: unknown) => {
        const text = typeof s === 'string' ? s : typeof s === 'object' && s !== null ? (s as { value?: unknown }).value : undefined;
        return typeof text === 'string' && parseColor(text) !== null;
      });
      if (!ok) fail(property, 'array of color strings or { value, label? }');
    };
    swatches(options.presets, 'presets');
    swatches(options.recent, 'recent');
    const bg: unknown = options.contrastWith;
    if (bg !== undefined && (typeof bg !== 'string' || parseColor(bg) === null)) fail('contrastWith', 'hex, rgb(), or hsl() color text');
    if (options.validate !== undefined && typeof options.validate !== 'function') fail('validate', '(value: string) => string | null');
  }

  #config(): Readonly<ColorPickerConfig & { locale: string }> {
    const o = this.#options;
    return colorPickerConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.format === undefined ? {} : { format: o.format }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #isPopup(): boolean {
    return (this.#options.mode ?? 'popup') === 'popup';
  }

  #locked(): boolean {
    return this.#options.disabled === true || this.#options.readOnly === true;
  }

  #setFromValue(value: string | null): void {
    const rgba = value === null || value.trim() === '' ? null : parseColor(value);
    if (!rgba) {
      this.#empty = true;
      return;
    }
    const next = rgbToHsv({ ...rgba, a: this.#options.alpha === true ? rgba.a : 1 });
    // Grays and black have no hue or saturation of their own: keep the current ones so the thumbs stay put.
    if (next.s === 0 || next.v === 0) next.h = this.#hsva.h;
    if (next.v === 0) next.s = this.#hsva.s;
    this.#hsva = next;
    this.#empty = false;
  }

  #swatchList(list: readonly (string | ColorSwatch)[] | undefined): { hex: string; label: string }[] {
    const alpha = this.#options.alpha === true;
    return (list ?? []).flatMap((s) => {
      const text = typeof s === 'string' ? s : s.value;
      const rgba = parseColor(text);
      if (!rgba) return [];
      const hex = toHex({ ...rgba, a: alpha ? rgba.a : 1 }, alpha);
      return [{ hex, label: typeof s === 'string' || s.label === undefined || s.label.trim() === '' ? hex : s.label }];
    });
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const locale = config.locale;
    const m = (key: string, params: Record<string, string> = {}): string => getMessage('colorPicker', key, params, locale);
    const format = this.#format ?? config.format;
    const alpha = o.alpha === true;
    const popup = this.#isPopup();
    const disabled = o.disabled === true;
    const readOnly = o.readOnly === true;
    const value = this.value;
    const rgba = hsvToRgb(this.#hsva);
    const opaque = toHex(rgba, false);
    const pct = (n: number): string => formatNumber(n / 100, { style: 'percent', maximumFractionDigits: 0 }, locale);
    const { h, s, v, a } = this.#hsva;

    // Validity.
    const outcome = this.#empty && o.required === true ? { error: 'value-missing' as const, params: {} } : { error: null, params: {} };
    const custom = this.#parseError ?? (value === null ? null : runValidator(o.validate, value));
    this.#validity = resolveValidity(outcome, { locale }, custom, this.#state.customError);
    const show = !this.#validity.valid && (this.#parseError !== null || this.#state.shouldShow(config.validationTiming));

    // Everything that can throw ran above; now the DOM.
    const host = this.host;
    host.classList.toggle('aui-color-picker--popup', popup);
    host.classList.toggle('aui-color-picker--inline', !popup);
    host.classList.toggle('aui-color-picker--disabled', disabled);
    host.classList.toggle('aui-color-picker--readonly', readOnly);
    host.classList.toggle('aui-color-picker--invalid', show);
    host.classList.toggle('aui-color-picker--empty', this.#empty);
    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    (this.#chrome.label as HTMLLabelElement).htmlFor = popup ? this.#trigger.id : this.input.id;

    // Colors and positions (CSSOM only: CSP-safe).
    const style = host.style;
    style.setProperty('--_aui-color-picker-hue', `hsl(${String(round(h, 2))} 100% 50%)`);
    style.setProperty('--_aui-color-picker-opaque', opaque);
    style.setProperty('--_aui-color-picker-color', toHex(rgba, true));
    this.#areaThumb.style.setProperty('--_aui-color-picker-x', `${String(round(s, 3))}%`);
    this.#areaThumb.style.setProperty('--_aui-color-picker-y', `${String(round(100 - v, 3))}%`);
    this.#sliders.hue.thumb.style.setProperty('--_aui-color-picker-pos', `${String(round((h / 360) * 100, 3))}%`);
    this.#sliders.alpha.thumb.style.setProperty('--_aui-color-picker-pos', `${String(round(a * 100, 3))}%`);

    // Trigger.
    this.#trigger.hidden = !popup;
    this.#trigger.disabled = disabled;
    this.#trigger.setAttribute('aria-controls', this.#panel.id);
    this.#trigger.setAttribute('aria-labelledby', `${this.#chrome.label.id} ${this.#triggerText.id}`);
    setText(this.#triggerText, value === null ? m('empty') : formatColor(rgba, format, alpha));

    // Panel: a dialog in the top layer (popup) or a group in place (inline).
    if (popup) {
      this.#panel.setAttribute('role', 'dialog');
      if (this.#panel.popover !== 'manual') this.#panel.popover = 'manual';
    } else {
      this.#panel.setAttribute('role', 'group');
      this.#panel.removeAttribute('popover');
    }
    this.#panel.setAttribute('aria-labelledby', this.#chrome.label.id);

    // Thumbs.
    const thumb = (el: HTMLElement, name: string, now: number, text: string): void => {
      el.setAttribute('aria-label', name);
      el.setAttribute('aria-valuenow', String(Math.round(now)));
      el.setAttribute('aria-valuetext', text);
      el.tabIndex = disabled ? -1 : 0;
      if (disabled) el.setAttribute('aria-disabled', 'true');
      else el.removeAttribute('aria-disabled');
      if (readOnly) el.setAttribute('aria-readonly', 'true');
      else el.removeAttribute('aria-readonly');
    };
    thumb(this.#areaThumb, m('area'), s, m('areaText', { saturation: pct(s), brightness: pct(v) }));
    thumb(this.#sliders.hue.thumb, m('hue'), Math.round(h) % 360, m('hueText', { hue: formatNumber(Math.round(h) % 360, {}, locale) }));
    thumb(this.#sliders.alpha.thumb, m('alpha'), a * 100, pct(a * 100));
    this.#sliders.alpha.track.hidden = !alpha;

    // Formats and the value field.
    this.#formats.setAttribute('aria-label', m('formats'));
    for (const [f, b] of this.#formatButtons) {
      setText(b, m(f));
      b.setAttribute('aria-pressed', String(f === format));
      b.disabled = disabled;
    }
    if (!this.#editing) this.input.value = value === null ? '' : formatColor(rgba, format, alpha);
    this.input.placeholder = formatColor({ r: 37, g: 99, b: 235, a: 1 }, format, alpha);
    if (popup) this.input.setAttribute('aria-label', m('value'));
    else this.input.removeAttribute('aria-label');
    this.input.disabled = disabled;
    this.input.readOnly = readOnly;
    this.input.required = o.required === true;

    // Eyedropper (feature-detected) and clear.
    const canPick = (o.eyeDropper ?? true) && eyeDropperOf(this.#doc) !== null;
    this.#eyeDropper.hidden = !canPick || readOnly;
    this.#eyeDropper.disabled = disabled;
    this.#eyeDropper.setAttribute('aria-label', m('eyeDropper'));
    this.#eyeDropper.replaceChildren(renderIcon(o.icons?.eyeDropper ?? 'locate', { doc: this.#doc }));
    const clearable = o.clearable ?? o.required !== true;
    this.#clear.hidden = !clearable || readOnly || this.#empty;
    this.#clear.disabled = disabled;
    this.#clear.setAttribute('aria-label', m('clear'));
    this.#clear.replaceChildren(renderIcon(o.icons?.clear ?? 'close', { doc: this.#doc }));

    // Swatches.
    this.#renderSwatches(this.#presets, this.#swatchList(o.presets), m('presets'), value);
    this.#renderSwatches(this.#recent, this.#swatchList(o.recent), m('recent'), value);

    // Contrast hint.
    const bg = o.contrastWith === undefined ? null : parseColor(o.contrastWith);
    if (bg && value !== null) {
      const ratio = contrastRatio(rgba, { ...bg, a: 1 });
      const verdict = ratio >= 7 ? 'passAAA' : ratio >= 4.5 ? 'passAA' : ratio >= 3 ? 'passLarge' : 'fail';
      setText(this.#contrast, m('contrast', { ratio: formatNumber(Math.floor(ratio * 100) / 100, { maximumFractionDigits: 2 }, locale), background: toHex({ ...bg, a: 1 }, false), verdict: m(verdict) }));
      this.#contrast.dataset.verdict = verdict;
      this.#contrast.hidden = false;
    } else {
      this.#contrast.hidden = true;
      setText(this.#contrast, '');
    }

    // Descriptions and invalid state on the primary control.
    const describedBy = [...this.#chrome.describedBy(), ...(this.#contrast.hidden ? [] : [this.#contrast.id])];
    const primary = popup ? this.#trigger : this.input;
    setDescribedBy(primary, describedBy);
    setInvalid(primary, show);
    if (popup) {
      setDescribedBy(this.input, this.#chrome.error.hidden ? [] : [this.#chrome.error.id]);
      setInvalid(this.input, show);
    } else {
      setInvalid(this.#trigger, false);
    }

    // Native form submission.
    this.#hidden.value = value ?? '';
    this.#hidden.disabled = o.name === undefined || disabled;
    if (o.name === undefined) this.#hidden.removeAttribute('name');
    else this.#hidden.name = o.name;
  }

  #renderSwatches(group: HTMLDivElement, list: { hex: string; label: string }[], name: string, value: ColorPickerValue): void {
    group.hidden = list.length === 0;
    group.setAttribute('aria-label', name);
    const disabled = this.#options.disabled === true;
    const readOnly = this.#options.readOnly === true;
    group.replaceChildren(...list.map(({ hex, label }) => {
      const b = this.#doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-color-picker__swatch aui-color-picker__swatch-button';
      b.dataset.color = hex;
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', String(hex === value));
      b.style.setProperty('--_aui-color-picker-swatch', hex);
      b.disabled = disabled;
      if (readOnly) b.setAttribute('aria-disabled', 'true');
      return b;
    }));
  }

  #bind(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.#trigger, 'click', () => {
      if (this.open) this.hide();
      else this.show();
    });
    g.listen(this.#areaThumb, 'keydown', (e) => {
      this.#onKey(e, 'area');
    });
    g.listen(this.#sliders.hue.thumb, 'keydown', (e) => {
      this.#onKey(e, 'hue');
    });
    g.listen(this.#sliders.alpha.thumb, 'keydown', (e) => {
      this.#onKey(e, 'alpha');
    });
    const pointer = (target: HTMLElement, part: Part): void => {
      g.listen(target, 'pointerdown', (e) => {
        this.#onPointerDown(e, target, part);
      });
      g.listen(target, 'pointermove', (e) => {
        if (this.#drag?.pointer === e.pointerId && this.#drag.part === part) this.#move(part, e, target);
      });
      g.listen(target, 'pointerup', (e) => {
        this.#onPointerEnd(e, target, true);
      });
      g.listen(target, 'pointercancel', (e) => {
        this.#onPointerEnd(e, target, false);
      });
    };
    pointer(this.#area, 'area');
    pointer(this.#sliders.hue.track, 'hue');
    pointer(this.#sliders.alpha.track, 'alpha');

    g.listen(this.input, 'input', () => {
      this.#editing = true;
    });
    g.listen(this.input, 'change', () => {
      this.#commitText();
    });
    g.listen(this.input, 'blur', () => {
      this.#editing = false;
      this.#render();
    });
    g.listen(this.#formats, 'click', (e) => {
      const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('.aui-color-picker__format') : null;
      const f = FORMATS.find((x) => x === b?.dataset.format);
      if (!f) return;
      this.#format = f;
      this.#editing = false;
      this.#render();
    });
    const swatchClick = (e: MouseEvent): void => {
      const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('.aui-color-picker__swatch-button') : null;
      const color = b?.dataset.color;
      if (color === undefined || this.#locked()) return;
      this.#commit(() => {
        this.#setFromValue(color);
      });
    };
    g.listen(this.#presets, 'click', swatchClick);
    g.listen(this.#recent, 'click', swatchClick);
    g.listen(this.#clear, 'click', () => {
      if (this.#locked()) return;
      this.#commit(() => {
        this.#empty = true;
      });
      announce(getMessage('colorPicker', 'cleared', {}, this.#config().locale), 'polite', this.#doc);
      this.input.focus();
    });
    g.listen(this.#eyeDropper, 'click', () => {
      void this.#pickFromScreen();
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      const inside = next instanceof Node && (this.host.contains(next) || this.#panel.contains(next));
      if (inside) return;
      // Focus left the field and its popup: a non-modal popup closes without taking focus back.
      if (this.open && next instanceof Node) this.hide(false);
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
  }

  /** Apply a change, re-render, and emit `aui-change` when the value changed. */
  #commit(change: () => void): void {
    const before = this.value;
    change();
    this.#parseError = null;
    this.#state.dirty = true;
    this.#state.customError = null;
    this.#editing = false;
    this.#render();
    if (this.value !== before) {
      const detail = { value: this.value, validity: this.#validity } satisfies ColorPickerValueDetail;
      emit(this.host, 'aui-input', detail);
      emit(this.host, 'aui-change', detail);
    }
  }

  #commitText(): void {
    if (this.#locked()) return;
    const text = this.input.value.trim();
    if (text === '') {
      this.#commit(() => {
        this.#empty = true;
      });
      return;
    }
    const rgba = parseColor(text);
    if (!rgba) {
      const config = this.#config();
      const example = formatColor({ r: 37, g: 99, b: 235, a: 1 }, this.#format ?? config.format, this.#options.alpha === true);
      this.#parseError = getMessage('colorPicker', 'invalid', { example }, config.locale);
      this.#state.touched = true;
      this.#render();
      return;
    }
    this.#commit(() => {
      this.#setFromValue(toHex(rgba, true));
    });
  }

  async #pickFromScreen(): Promise<void> {
    const Ctor = eyeDropperOf(this.#doc);
    if (!Ctor || this.#locked()) return;
    this.#eyeDropperAbort?.abort();
    const abort = new AbortController();
    this.#eyeDropperAbort = abort;
    try {
      const result = await new Ctor().open({ signal: abort.signal });
      if (abort.signal.aborted || this.#group.disposed) return;
      const rgba = parseColor(result.sRGBHex);
      if (rgba) {
        this.#commit(() => {
          this.#setFromValue(toHex({ ...rgba, a: this.#hsva.a }, true));
        });
      }
    } catch {
      // The user cancelled (Escape) or the pick was aborted: nothing changes.
    } finally {
      if (this.#eyeDropperAbort === abort) this.#eyeDropperAbort = null;
    }
  }

  /** Set one part from a draft HSVA; returns whether the value changed. Emits `aui-input`. */
  #set(next: Hsva): boolean {
    const before = this.value;
    this.#hsva = { h: clamp(next.h, 0, 359.999), s: clamp(next.s, 0, 100), v: clamp(next.v, 0, 100), a: this.#options.alpha === true ? clamp(next.a, 0, 1) : 1 };
    this.#empty = false;
    this.#parseError = null;
    this.#state.dirty = true;
    this.#state.customError = null;
    this.#editing = false;
    this.#render();
    if (this.value === before) return false;
    emit(this.host, 'aui-input', { value: this.value, validity: this.#validity } satisfies ColorPickerValueDetail);
    return true;
  }

  #rtl(): boolean {
    return getCommonConfig().direction === 'rtl';
  }

  #onKey(event: KeyboardEvent, part: Part): void {
    if (this.#locked()) return;
    const big = event.shiftKey ? 10 : 1;
    const forward = this.#rtl() ? 'ArrowLeft' : 'ArrowRight';
    const back = this.#rtl() ? 'ArrowRight' : 'ArrowLeft';
    const c = { ...this.#hsva };
    const k = event.key;
    let handled = true;
    if (part === 'area') {
      if (k === forward) c.s += big;
      else if (k === back) c.s -= big;
      else if (k === 'ArrowUp') c.v += big;
      else if (k === 'ArrowDown') c.v -= big;
      else if (k === 'PageUp') c.v += 10;
      else if (k === 'PageDown') c.v -= 10;
      else if (k === 'Home') c.s = 0;
      else if (k === 'End') c.s = 100;
      else handled = false;
    } else {
      const key = part === 'hue' ? 'h' : 'a';
      const unit = part === 'hue' ? 1 : 0.01;
      const max = part === 'hue' ? 359 : 1;
      if (k === forward || k === 'ArrowUp') c[key] = Math.round(c[key] / unit) * unit + big * unit;
      else if (k === back || k === 'ArrowDown') c[key] = Math.round(c[key] / unit) * unit - big * unit;
      else if (k === 'PageUp') c[key] += 10 * unit;
      else if (k === 'PageDown') c[key] -= 10 * unit;
      else if (k === 'Home') c[key] = 0;
      else if (k === 'End') c[key] = max;
      else handled = false;
      if (part === 'hue') c.h = clamp(c.h, 0, 359);
    }
    if (!handled) return;
    event.preventDefault();
    if (this.#set(c)) emit(this.host, 'aui-change', { value: this.value, validity: this.#validity } satisfies ColorPickerValueDetail);
  }

  #ratio(event: PointerEvent, target: HTMLElement): { x: number; y: number } {
    const rect = target.getBoundingClientRect();
    const rtl = getComputedStyle(target).direction === 'rtl';
    const x = rect.width === 0 ? 0 : rtl ? (rect.right - event.clientX) / rect.width : (event.clientX - rect.left) / rect.width;
    const y = rect.height === 0 ? 0 : (event.clientY - rect.top) / rect.height;
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }

  #move(part: Part, event: PointerEvent, target: HTMLElement): void {
    const { x, y } = this.#ratio(event, target);
    const c = { ...this.#hsva };
    if (part === 'area') {
      c.s = x * 100;
      c.v = (1 - y) * 100;
    } else if (part === 'hue') c.h = x * 359;
    else c.a = round(x, 2);
    this.#set(c);
  }

  #onPointerDown(event: PointerEvent, target: HTMLElement, part: Part): void {
    if (this.#locked() || event.button !== 0) return;
    event.preventDefault();
    this.#drag = { part, pointer: event.pointerId, start: this.value };
    target.setPointerCapture(event.pointerId);
    (part === 'area' ? this.#areaThumb : this.#sliders[part].thumb).focus();
    this.#move(part, event, target);
  }

  #onPointerEnd(event: PointerEvent, target: HTMLElement, commit: boolean): void {
    const drag = this.#drag;
    if (drag?.pointer !== event.pointerId) return;
    this.#drag = null;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    if (!commit) {
      this.#setFromValue(drag.start);
      this.#render();
      return;
    }
    if (this.value !== drag.start) emit(this.host, 'aui-change', { value: this.value, validity: this.#validity } satisfies ColorPickerValueDetail);
  }
}

