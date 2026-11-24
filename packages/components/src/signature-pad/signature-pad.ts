/**
 * Signature Pad (R20 P9). Captures a handwritten signature with a pointer (mouse, pen,
 * touch) on a high-DPI canvas: smoothed, pressure- and speed-aware strokes, undo, clear,
 * and export as PNG or SVG data URLs. Drawing cannot be done with a keyboard or a screen
 * reader, so a typed-name alternative is always offered (WCAG 2.1.1, 2.5.7): a "Type"
 * mode with a native text field whose name is rendered on the pad. Points are stored
 * relative to the pad size, so the signature survives resizes. A Form control: validates,
 * serializes (a PNG or SVG data URL), and resets with Form.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, observeResize } from '@absoluteui/utilities';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { resolveValidity, runValidator, VALID, type FieldValidity, type Outcome } from '../internal/validation.js';

export type SignatureFormat = 'png' | 'svg';

export interface SignaturePadConfig {
  validationTiming: ValidationTiming;
  /** Base stroke width in CSS pixels. */
  penWidth: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    signaturePad: SignaturePadConfig & { locale: string };
  }
}

export const signaturePadConfig = defineComponentConfig<SignaturePadConfig, 'locale'>(
  'signaturePad',
  {
    validationTiming: validationTimingSpec,
    penWidth: { default: 2.5, expected: 'number from 0.5 to 20', validate: (v: unknown): v is number => typeof v === 'number' && v >= 0.5 && v <= 20 },
  },
  ['locale'],
);

registerMessages('signaturePad', 'en', {
  modes: 'Signature method',
  draw: 'Draw',
  type: 'Type',
  typedLabel: 'Type your full name',
  placeholder: 'Sign here',
  undo: 'Undo last stroke',
  clear: 'Clear signature',
  empty: 'Signature pad, empty',
  drawn: 'Signature pad, signature drawn with {count} strokes',
  drawnOne: 'Signature pad, signature drawn with 1 stroke',
  typed: 'Signature pad, typed signature: {text}',
  undone: 'Last stroke removed',
  cleared: 'Signature cleared',
});

/** One captured point, relative to the pad (0..1 on each axis). */
export interface SignaturePoint {
  readonly x: number;
  readonly y: number;
  /** Pointer pressure 0..1 (0.5 for devices without pressure). */
  readonly pressure: number;
  /** Milliseconds since the stroke started. */
  readonly t: number;
}

export interface SignatureStroke {
  readonly points: readonly SignaturePoint[];
  /** Pen color of this stroke; omitted when the theme's ink color is used. */
  readonly color?: string;
}

/** A drawn signature (strokes) or a typed name; null when empty. */
export type SignaturePadValue = { readonly mode: 'draw'; readonly strokes: readonly SignatureStroke[] } | { readonly mode: 'type'; readonly text: string } | null;

export interface SignaturePadIcons {
  undo: IconRef;
  clear: IconRef;
  error: IconRef;
}

export interface SignaturePadOptions extends Partial<SignaturePadConfig> {
  /** Visible label (required accessible name). */
  label: string;
  hideLabel?: boolean;
  description?: string;
  value?: SignaturePadValue;
  /** Pen color (any CSS color). Default: the signature-pad ink component token, which follows the theme. */
  penColor?: string;
  /** Pad height (CSS length). Default '10rem'. */
  height?: string;
  /** Font for typed signatures (CSS font-family). Default a cursive family. */
  typedFont?: string;
  /** Initial mode. Default 'draw'. */
  mode?: 'draw' | 'type';
  /** Hidden input format for native forms. Default 'png'. */
  submit?: SignatureFormat;
  required?: boolean;
  disabled?: boolean;
  /** Shows the signature; no drawing, typing, undo, or clear. */
  readOnly?: boolean;
  name?: string;
  validate?: (value: SignaturePadValue) => string | null;
  locale?: string;
  icons?: Partial<SignaturePadIcons>;
}

/** `aui-change` detail: after a stroke, typing, undo, or clear. */
export interface SignaturePadValueDetail {
  value: SignaturePadValue;
  validity: FieldValidity;
}

const DEFAULT_FONT = "'Segoe Script', 'Brush Script MT', 'Snell Roundhand', cursive";
const MAX_POINTS = 20_000;

interface Segment {
  readonly x0: number;
  readonly y0: number;
  readonly cx: number;
  readonly cy: number;
  readonly x1: number;
  readonly y1: number;
  readonly width: number;
}

/**
 * Smoothed, variable-width segments of a stroke in pad pixels: quadratic curves through the
 * midpoints of consecutive points; width from pressure (pens) or speed (mouse, touch).
 */
export function strokeSegments(points: readonly SignaturePoint[], w: number, h: number, penWidth: number): Segment[] {
  const pts = points.map((p) => ({ x: p.x * w, y: p.y * h, pressure: p.pressure, t: p.t }));
  const first = pts[0];
  if (!first) return [];
  if (pts.length === 1) return [{ x0: first.x, y0: first.y, cx: first.x, cy: first.y, x1: first.x + 0.01, y1: first.y, width: penWidth }];
  const widths: number[] = [];
  let smooth = penWidth;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[i - 1];
    if (!p) continue;
    let target: number;
    if (p.pressure !== 0.5 && p.pressure > 0) target = penWidth * (0.4 + p.pressure * 1.2);
    else if (prev) {
      const dt = Math.max(1, p.t - prev.t);
      const speed = Math.hypot(p.x - prev.x, p.y - prev.y) / dt;
      target = penWidth * Math.max(0.45, Math.min(1.4, 1.4 - speed * 0.35));
    } else target = penWidth;
    smooth = smooth * 0.7 + target * 0.3;
    widths.push(smooth);
  }
  const out: Segment[] = [];
  let sx = first.x;
  let sy = first.y;
  for (let i = 1; i < pts.length; i++) {
    const c = pts[i - 1];
    const n = pts[i];
    if (!c || !n) continue;
    const last = i === pts.length - 1;
    const ex = last ? n.x : (c.x + n.x) / 2;
    const ey = last ? n.y : (c.y + n.y) / 2;
    out.push({ x0: sx, y0: sy, cx: c.x, cy: c.y, x1: ex, y1: ey, width: widths[i] ?? penWidth });
    sx = ex;
    sy = ey;
  }
  return out;
}

const round = (n: number): string => String(Math.round(n * 100) / 100);

export class SignaturePad implements FormControl {
  readonly host: HTMLElement;
  #options: SignaturePadOptions;
  #mode: 'draw' | 'type';
  #strokes: SignatureStroke[];
  #text: string;
  #initial: SignaturePadValue;
  #validity: FieldValidity = VALID;
  #drawing: { pointer: number; start: number; points: SignaturePoint[] } | null = null;
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #group = new DisposableGroup();
  readonly #state = new FieldState();
  readonly #box: HTMLDivElement;
  readonly #modes: HTMLDivElement;
  readonly #drawButton: HTMLButtonElement;
  readonly #typeButton: HTMLButtonElement;
  readonly #pad: HTMLDivElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #placeholder: HTMLSpanElement;
  readonly #typedWrap: HTMLDivElement;
  readonly #typedLabel: HTMLLabelElement;
  readonly #typed: HTMLInputElement;
  readonly #undo: HTMLButtonElement;
  readonly #clear: HTMLButtonElement;
  readonly #input: HTMLInputElement;
  #iconKey: { undo: IconRef; clear: IconRef } | null = null;

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: SignaturePadOptions): SignaturePad {
    return new SignaturePad(host, options);
  }

  private constructor(host: HTMLElement, options: SignaturePadOptions) {
    SignaturePad.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const v = options.value ?? null;
    this.#mode = v?.mode ?? options.mode ?? 'draw';
    this.#strokes = v?.mode === 'draw' ? [...v.strokes] : [];
    this.#text = v?.mode === 'type' ? v.text : '';
    this.#initial = this.value;
    const doc = this.#doc;
    this.#chrome = new FieldChrome(doc, 'label', 'aui-signature-pad');
    const button = (cls: string): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = cls;
      return b;
    };
    this.#box = doc.createElement('div');
    this.#box.className = 'aui-signature-pad__box';
    this.#box.setAttribute('role', 'group');
    this.#box.setAttribute('aria-labelledby', this.#chrome.label.id);
    this.#modes = doc.createElement('div');
    this.#modes.className = 'aui-signature-pad__modes';
    this.#modes.setAttribute('role', 'group');
    this.#drawButton = button('aui-signature-pad__mode');
    this.#typeButton = button('aui-signature-pad__mode');
    this.#modes.append(this.#drawButton, this.#typeButton);
    this.#pad = doc.createElement('div');
    this.#pad.className = 'aui-signature-pad__pad';
    this.#canvas = doc.createElement('canvas');
    this.#canvas.className = 'aui-signature-pad__canvas';
    this.#canvas.setAttribute('role', 'img');
    this.#placeholder = doc.createElement('span');
    this.#placeholder.className = 'aui-signature-pad__placeholder';
    this.#placeholder.setAttribute('aria-hidden', 'true');
    const baseline = doc.createElement('span');
    baseline.className = 'aui-signature-pad__baseline';
    baseline.setAttribute('aria-hidden', 'true');
    this.#pad.append(this.#canvas, baseline, this.#placeholder);
    this.#typedWrap = doc.createElement('div');
    this.#typedWrap.className = 'aui-signature-pad__typed';
    this.#typedLabel = doc.createElement('label');
    this.#typedLabel.className = 'aui-signature-pad__typed-label';
    this.#typed = doc.createElement('input');
    this.#typed.type = 'text';
    this.#typed.id = createId('aui-signature-pad-typed');
    this.#typed.className = 'aui-signature-pad__typed-input';
    this.#typed.autocomplete = 'name';
    this.#typed.spellcheck = false;
    this.#typed.value = this.#text;
    this.#typedLabel.htmlFor = this.#typed.id;
    this.#typedWrap.append(this.#typedLabel, this.#typed);
    const actions = doc.createElement('div');
    actions.className = 'aui-signature-pad__actions';
    this.#undo = button('aui-signature-pad__action');
    this.#clear = button('aui-signature-pad__action');
    actions.append(this.#undo, this.#clear);
    const toolbar = doc.createElement('div');
    toolbar.className = 'aui-signature-pad__toolbar';
    toolbar.append(this.#modes, actions);
    this.#box.append(toolbar, this.#pad, this.#typedWrap);
    this.#input = doc.createElement('input');
    this.#input.type = 'hidden';

    // Render first: invalid options (config, messages) throw before the host is touched.
    this.#render();
    host.classList.add('aui-field', 'aui-signature-pad');
    host.replaceChildren(this.#chrome.label, this.#chrome.description, this.#box, this.#chrome.error, this.#input);
    this.#bind();
    this.#group.add(signaturePadConfig.subscribe(() => {
      this.#render();
    }));
    this.#group.add(registerControl(this));
    this.#paint();
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
    return JSON.stringify(this.value) !== JSON.stringify(this.#initial);
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<SignaturePadOptions> {
    return this.#options;
  }

  /** True when nothing is drawn (draw mode) or typed (type mode). */
  get isEmpty(): boolean {
    return this.#mode === 'draw' ? this.#strokes.length === 0 : this.#text.trim() === '';
  }

  get mode(): 'draw' | 'type' {
    return this.#mode;
  }

  get value(): SignaturePadValue {
    if (this.isEmpty) return null;
    return this.#mode === 'draw' ? { mode: 'draw', strokes: [...this.#strokes] } : { mode: 'type', text: this.#text.trim() };
  }

  /** The submitted value: a data URL in the `submit` format, or null when empty. */
  getFormValue(): string | null {
    return this.isEmpty ? null : this.toDataURL(this.#options.submit ?? 'png');
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
    if (this.#mode === 'type') this.#typed.focus();
    else (this.#drawButton.disabled ? this.#canvas : this.#drawButton).focus();
  }

  reset(): void {
    const v = this.#initial;
    this.#mode = v?.mode ?? this.#options.mode ?? 'draw';
    this.#strokes = v?.mode === 'draw' ? [...v.strokes] : [];
    this.#text = v?.mode === 'type' ? v.text : '';
    this.#typed.value = this.#text;
    this.#drawing = null;
    this.#state.reset();
    this.#render();
    this.#paint();
  }

  /** Set the value (no event). */
  setValue(value: SignaturePadValue): void {
    this.update({ value });
  }

  update(options: Partial<SignaturePadOptions>): void {
    const next = { ...this.#options, ...options };
    SignaturePad.#assert(next);
    const previous = { options: this.#options, mode: this.#mode, strokes: this.#strokes, text: this.#text };
    this.#options = next;
    if ('value' in options) {
      const v = options.value ?? null;
      this.#mode = v?.mode ?? this.#mode;
      this.#strokes = v?.mode === 'draw' ? [...v.strokes] : [];
      this.#text = v?.mode === 'type' ? v.text : '';
      this.#typed.value = this.#text;
    } else if (options.mode !== undefined) this.#mode = options.mode;
    try {
      this.#render();
    } catch (error) {
      this.#options = previous.options;
      this.#mode = previous.mode;
      this.#strokes = previous.strokes;
      this.#text = previous.text;
      this.#typed.value = this.#text;
      this.#render();
      throw error;
    }
    this.#paint();
  }

  /** Remove the last stroke (draw mode). */
  undo(): void {
    if (this.#mode !== 'draw' || this.#strokes.length === 0) return;
    this.#strokes = this.#strokes.slice(0, -1);
    this.#changed('undone');
  }

  /** Remove the signature (both modes). */
  clear(): void {
    if (this.isEmpty) return;
    this.#strokes = [];
    this.#text = '';
    this.#typed.value = '';
    this.#changed('cleared');
  }

  /**
   * The signature as a data URL: PNG (rendered at the device pixel ratio, transparent
   * background) or SVG (vector paths or text). Empty pads give an empty image.
   */
  toDataURL(format: SignatureFormat = 'png'): string {
    if (format === 'svg') return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(this.toSVG())}`;
    return this.#canvas.toDataURL('image/png');
  }

  /** The signature as SVG markup (paths for drawn strokes, a text element for typed names). */
  toSVG(): string {
    const { w, h } = this.#size();
    const ink = this.#ink();
    const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const body: string[] = [];
    if (this.#mode === 'draw') {
      for (const stroke of this.#strokes) {
        const color = esc(stroke.color ?? ink);
        for (const s of strokeSegments(stroke.points, w, h, this.#penWidth())) {
          body.push(`<path d="M${round(s.x0)} ${round(s.y0)}Q${round(s.cx)} ${round(s.cy)} ${round(s.x1)} ${round(s.y1)}" stroke="${color}" stroke-width="${round(s.width)}"/>`);
        }
      }
    } else if (this.#text.trim() !== '') {
      body.push(`<text x="${round(w / 2)}" y="${round(h * 0.62)}" text-anchor="middle" font-family="${esc(this.#options.typedFont ?? DEFAULT_FONT)}" font-size="${round(this.#typedSize(h))}" fill="${esc(ink)}">${esc(this.#text.trim())}</text>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${round(w)}" height="${round(h)}" viewBox="0 0 ${round(w)} ${round(h)}" fill="none" stroke-linecap="round" stroke-linejoin="round">${body.join('')}</svg>`;
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-signature-pad', 'aui-signature-pad--type', 'aui-signature-pad--disabled', 'aui-signature-pad--readonly', 'aui-signature-pad--invalid');
  }

  static #assert(options: SignaturePadOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('SIGNATURE_PAD_OPTIONS', 'Invalid signature pad options.', { component: 'signaturePad', property: `signaturePad.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string (accessible name)');
    const mode: unknown = options.mode;
    if (mode !== undefined && mode !== 'draw' && mode !== 'type') fail('mode', '"draw" | "type"');
    const submit: unknown = options.submit;
    if (submit !== undefined && submit !== 'png' && submit !== 'svg') fail('submit', '"png" | "svg"');
    const color: unknown = options.penColor;
    if (color !== undefined && (typeof color !== 'string' || (typeof CSS !== 'undefined' && !CSS.supports('color', color)))) fail('penColor', 'a CSS color');
    const height: unknown = options.height;
    if (height !== undefined && (typeof height !== 'string' || (typeof CSS !== 'undefined' && !CSS.supports('height', height)))) fail('height', 'a CSS length');
    const font: unknown = options.typedFont;
    if (font !== undefined && (typeof font !== 'string' || /[<>{};]/.test(font))) fail('typedFont', 'a CSS font-family list');
    const value: unknown = options.value;
    if (value !== undefined && value !== null && !SignaturePad.#validValue(value)) fail('value', '{ mode: "draw", strokes } | { mode: "type", text } | null');
    if (options.validate !== undefined && typeof options.validate !== 'function') fail('validate', '(value: SignaturePadValue) => string | null');
  }

  static #validValue(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as { mode?: unknown; text?: unknown; strokes?: unknown };
    if (v.mode === 'type') return typeof v.text === 'string';
    if (v.mode !== 'draw' || !Array.isArray(v.strokes)) return false;
    let count = 0;
    const finite = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n);
    for (const s of v.strokes as unknown[]) {
      const points = (s as { points?: unknown } | null)?.points;
      if (!Array.isArray(points)) return false;
      count += points.length;
      if (count > MAX_POINTS) return false;
      for (const p of points as unknown[]) {
        const q = p as { x?: unknown; y?: unknown; pressure?: unknown; t?: unknown } | null;
        if (!q || !finite(q.x) || !finite(q.y) || !finite(q.pressure) || !finite(q.t)) return false;
      }
    }
    return true;
  }

  #config(): Readonly<SignaturePadConfig & { locale: string }> {
    const o = this.#options;
    return signaturePadConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.penWidth === undefined ? {} : { penWidth: o.penWidth }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #penWidth(): number {
    return this.#config().penWidth;
  }

  /** Current ink: the option, else the themed token through the canvas `color`. */
  #ink(): string {
    return this.#options.penColor ?? (getComputedStyle(this.#canvas).color || 'black');
  }

  #size(): { w: number; h: number } {
    const r = this.#pad.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  }

  #typedSize(h: number): number {
    return Math.max(16, Math.min(56, h * 0.4));
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const locale = config.locale;
    const m = (key: string, params: Record<string, string | number> = {}): string => getMessage('signaturePad', key, params, locale);
    const disabled = o.disabled === true;
    const readOnly = o.readOnly === true;
    const typeMode = this.#mode === 'type';
    const value = this.value;

    const outcome: Outcome = o.required === true && value === null ? { error: 'value-missing', params: {} } : { error: null, params: {} };
    const custom = outcome.error === null ? runValidator(o.validate, value) : null;
    this.#validity = resolveValidity(outcome, { locale }, custom, this.#state.customError);
    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);

    const host = this.host;
    host.classList.toggle('aui-signature-pad--type', typeMode);
    host.classList.toggle('aui-signature-pad--disabled', disabled);
    host.classList.toggle('aui-signature-pad--readonly', readOnly);
    host.classList.toggle('aui-signature-pad--invalid', show);
    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    this.#pad.style.setProperty('--_aui-signature-pad-height', o.height ?? '10rem');
    this.#pad.style.setProperty('--_aui-signature-pad-font', o.typedFont ?? DEFAULT_FONT);

    this.#modes.setAttribute('aria-label', m('modes'));
    this.#drawButton.textContent = m('draw');
    this.#typeButton.textContent = m('type');
    this.#drawButton.setAttribute('aria-pressed', String(!typeMode));
    this.#typeButton.setAttribute('aria-pressed', String(typeMode));
    this.#modes.hidden = readOnly;
    this.#drawButton.disabled = disabled;
    this.#typeButton.disabled = disabled;

    const undoIcon = o.icons?.undo ?? 'undo';
    const clearIcon = o.icons?.clear ?? 'trash';
    if (this.#iconKey?.undo !== undoIcon || this.#iconKey.clear !== clearIcon) {
      this.#iconKey = { undo: undoIcon, clear: clearIcon };
      this.#undo.replaceChildren(renderIcon(undoIcon, { doc: this.#doc }));
      this.#clear.replaceChildren(renderIcon(clearIcon, { doc: this.#doc }));
    }
    this.#undo.setAttribute('aria-label', m('undo'));
    this.#clear.setAttribute('aria-label', m('clear'));
    this.#undo.hidden = readOnly || typeMode;
    this.#clear.hidden = readOnly;
    this.#undo.disabled = disabled || this.#strokes.length === 0;
    this.#clear.disabled = disabled || this.isEmpty;

    this.#typedLabel.textContent = m('typedLabel');
    this.#typedWrap.hidden = !typeMode || readOnly;
    this.#typed.disabled = disabled;
    this.#typed.required = o.required === true;
    this.#placeholder.textContent = m('placeholder');
    this.#placeholder.hidden = !this.isEmpty || typeMode || readOnly;

    const count = this.#strokes.length;
    const name = value === null ? m('empty') : value.mode === 'type' ? m('typed', { text: value.text }) : count === 1 ? m('drawnOne') : m('drawn', { count });
    this.#canvas.setAttribute('aria-label', name);
    const described = this.#chrome.describedBy();
    setDescribedBy(this.#box, described);
    setDescribedBy(this.#typed, described);
    setInvalid(this.#typed, show && typeMode);
    this.#pad.classList.toggle('aui-signature-pad__pad--drawable', !typeMode && !disabled && !readOnly);

    const fieldName = o.name ?? null;
    this.#input.disabled = fieldName === null || disabled;
    if (fieldName !== null) this.#input.name = fieldName;
    else this.#input.removeAttribute('name');
  }

  /** Redraw the canvas at the current size and device pixel ratio, and refresh the hidden input. */
  #paint(): void {
    const { w, h } = this.#size();
    const dpr = this.#doc.defaultView?.devicePixelRatio ?? 1;
    const canvas = this.#canvas;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    // Server DOMs (Angular SSR) have no canvas: render the markup and paint in the browser.
    let ctx: CanvasRenderingContext2D | null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const ink = this.#ink();
      if (this.#mode === 'draw') {
        const strokes = this.#drawing ? [...this.#strokes, { points: this.#drawing.points }] : this.#strokes;
        for (const stroke of strokes) this.#drawStroke(ctx, stroke.points, stroke.color ?? ink, w, h);
      } else if (this.#text.trim() !== '') {
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `${String(this.#typedSize(h))}px ${this.#options.typedFont ?? DEFAULT_FONT}`;
        ctx.fillText(this.#text.trim(), w / 2, h * 0.62, w - 16);
      }
    }
    const name = this.#options.name ?? null;
    this.#input.value = name === null || this.isEmpty || (ctx === null && this.#options.submit !== 'svg') ? '' : this.toDataURL(this.#options.submit ?? 'png');
  }

  #drawStroke(ctx: CanvasRenderingContext2D, points: readonly SignaturePoint[], color: string, w: number, h: number): void {
    ctx.strokeStyle = color;
    for (const s of strokeSegments(points, w, h, this.#penWidth())) {
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.quadraticCurveTo(s.cx, s.cy, s.x1, s.y1);
      ctx.stroke();
    }
  }

  #changed(announcement?: 'undone' | 'cleared'): void {
    this.#state.dirty = true;
    this.#state.customError = null;
    this.#render();
    this.#paint();
    const locale = this.#config().locale;
    if (announcement) announce(getMessage('signaturePad', announcement, {}, locale), 'polite', this.#doc);
    emit(this.host, 'aui-change', { value: this.value, validity: this.#validity } satisfies SignaturePadValueDetail);
  }

  #setMode(mode: 'draw' | 'type'): void {
    if (mode === this.#mode) return;
    const before = JSON.stringify(this.value);
    this.#mode = mode;
    this.#render();
    this.#paint();
    if (mode === 'type') this.#typed.focus();
    if (JSON.stringify(this.value) !== before) emit(this.host, 'aui-change', { value: this.value, validity: this.#validity } satisfies SignaturePadValueDetail);
  }

  #drawable(): boolean {
    const o = this.#options;
    return this.#mode === 'draw' && o.disabled !== true && o.readOnly !== true;
  }

  #point(event: PointerEvent, start: number): SignaturePoint {
    const r = this.#pad.getBoundingClientRect();
    const clamp = (n: number): number => Math.min(1, Math.max(0, n));
    // Mouse reports 0.5 while pressed; pens and some touch screens report real pressure.
    const pressure = event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.5;
    return { x: clamp((event.clientX - r.left) / Math.max(1, r.width)), y: clamp((event.clientY - r.top) / Math.max(1, r.height)), pressure, t: Math.max(0, Math.round(event.timeStamp - start)) };
  }

  #bind(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.#drawButton, 'click', () => {
      this.#setMode('draw');
    });
    g.listen(this.#typeButton, 'click', () => {
      this.#setMode('type');
    });
    g.listen(this.#undo, 'click', () => {
      this.undo();
    });
    g.listen(this.#clear, 'click', () => {
      this.clear();
    });
    g.listen(this.#typed, 'input', () => {
      this.#text = this.#typed.value;
      this.#state.dirty = true;
      this.#state.customError = null;
      this.#render();
      this.#paint();
    });
    g.listen(this.#typed, 'change', () => {
      emit(this.host, 'aui-change', { value: this.value, validity: this.#validity } satisfies SignaturePadValueDetail);
    });
    g.listen(this.#pad, 'pointerdown', (event) => {
      if (!this.#drawable() || event.button !== 0 || this.#drawing) return;
      event.preventDefault();
      this.#pad.setPointerCapture(event.pointerId);
      this.#drawing = { pointer: event.pointerId, start: event.timeStamp, points: [] };
      this.#drawing.points.push(this.#point(event, event.timeStamp));
      this.#placeholder.hidden = true;
      this.#paint();
    });
    g.listen(this.#pad, 'pointermove', (event) => {
      const d = this.#drawing;
      if (d?.pointer !== event.pointerId) return;
      // Coalesced events keep fast strokes smooth on high-frequency pointers.
      const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
      for (const e of events.length > 0 ? events : [event]) {
        if (d.points.length >= MAX_POINTS) break;
        d.points.push(this.#point(e, d.start));
      }
      this.#paint();
    });
    const end = (event: PointerEvent, commit: boolean): void => {
      const d = this.#drawing;
      if (d?.pointer !== event.pointerId) return;
      this.#drawing = null;
      if (this.#pad.hasPointerCapture(event.pointerId)) this.#pad.releasePointerCapture(event.pointerId);
      if (!commit || d.points.length === 0) {
        this.#render();
        this.#paint();
        return;
      }
      const color = this.#options.penColor;
      this.#strokes = [...this.#strokes, color === undefined ? { points: d.points } : { points: d.points, color }];
      this.#changed();
    };
    g.listen(this.#pad, 'pointerup', (event) => {
      end(event, true);
    });
    g.listen(this.#pad, 'pointercancel', (event) => {
      end(event, false);
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
    g.add(observeResize(this.#pad, () => {
      if (!this.#group.disposed) this.#paint();
    }));
  }
}
