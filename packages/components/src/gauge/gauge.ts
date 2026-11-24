/**
 * Gauge (SPEC section 18.18: Gauge, Radial Gauge). A radial meter showing one value
 * within a known range on a 240 deg arc, with optional qualitative bands (for example
 * poor / fair / good), a target marker, and the formatted value in the center.
 * The SVG is `role="meter"` with `aria-valuenow`/`min`/`max` and a value text that
 * names the band and the target, so the meaning never depends on color. Not
 * focusable (a static reading). Deliberately independent of the chart frame so it
 * stays small. No animation.
 */
import { configurationError, createId, defineComponentConfig, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { assertTheme, ChartStyler, resolveCorners, type ChartTheme } from '../internal/chart/style.js';
import { fmt, sectorPath, svgElement } from '../internal/chart/svg.js';

export type GaugeColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface GaugeConfig {
  /** Print the range ends under the arc. Default true. */
  showRange: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    gauge: GaugeConfig & { locale: string; direction: Direction };
  }
}

export const gaugeConfig = defineComponentConfig<GaugeConfig, 'locale' | 'direction'>(
  'gauge',
  {
    showRange: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

export interface GaugeBand {
  /** Upper end of the band (the first band starts at `min`). */
  to: number;
  /** Band name, part of the value text (for example "Good"). */
  label: string;
  /** Palette slot. Default: band position. */
  color?: GaugeColor;
}

export interface GaugeOptions extends Partial<GaugeConfig> {
  /** What is measured; visible title and the accessible name. */
  label: string;
  /** Visually hide the title (it stays the accessible name). */
  hideLabel?: boolean;
  /** Visible text below the gauge (text only). */
  description?: string;
  /** Current value; null shows "No value". */
  value: number | null;
  /** Default 0. */
  min?: number;
  /** Default 100. */
  max?: number;
  /** Qualitative bands in ascending `to` order. */
  bands?: readonly GaugeBand[];
  /** Target value marked on the arc. */
  target?: number;
  /** Palette slot of the value arc. Default: the current band's color, else 1. */
  color?: GaugeColor;
  valueFormat?: Intl.NumberFormatOptions;
  formatValue?: (value: number) => string;
  /** Replaces the generated value text (aria-valuetext). */
  valueText?: string;
  locale?: string;
  direction?: Direction;
  /**
   * Shared chart look and feel (R20-15). The gauge uses `palette` (slot colors), `gridColor`
   * (track), `fontFamily`, `textColor` (range and band labels), and `animation`.
   */
  theme?: ChartTheme | undefined;
}

registerMessages('gauge', 'en', {
  valueText: '{value} ({range})',
  range: '{min} to {max}',
  band: '{band}',
  target: 'target {target}',
  noValue: 'No value',
  withBand: '{text}, {band}',
  withTarget: '{text}, {target}',
});

const COLORS: readonly unknown[] = [1, 2, 3, 4, 5, 6, 7, 8];
const SWEEP = (240 * Math.PI) / 180;
const START = -SWEEP / 2;
const CX = 100;
const CY = 100;
const R = 78;
const THICKNESS = 16;
const BAND_R = R + THICKNESS / 2 + 6;
/** Stroke width of the band arcs (matches `.aui-gauge__band` in the stylesheet). */
const BAND_THICKNESS = 5;

function fail(property: string, expected: string): never {
  throw configurationError('GAUGE_OPTIONS', 'Invalid gauge options.', { component: 'gauge', property: `gauge.${property}`, expected });
}

function point(angle: number, radius: number): string {
  return `${fmt(CX + Math.sin(angle) * radius)} ${fmt(CY - Math.cos(angle) * radius)}`;
}

/** Arc band between two angles (radians, 0 = up, clockwise) as a stroked path. */
function arc(a0: number, a1: number, radius: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${point(a0, radius)}A${fmt(radius)} ${fmt(radius)} 0 ${String(large)} 1 ${point(a1, radius)}`;
}

export class Gauge {
  readonly host: HTMLElement;
  /** The `svg[role="meter"]`. */
  readonly element: SVGSVGElement;
  #options: GaugeOptions;
  readonly #title: HTMLDivElement;
  readonly #description: HTMLParagraphElement;
  readonly #unsubscribe: () => void;
  readonly #styler: ChartStyler;

  /** Render a gauge into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: GaugeOptions): Gauge {
    return new Gauge(host, options);
  }

  private constructor(host: HTMLElement, options: GaugeOptions) {
    Gauge.#assert(options);
    this.host = host;
    this.#options = { ...options };
    gaugeConfig.resolve(this.#configInput());
    this.#styler = new ChartStyler(host);
    const doc = host.ownerDocument;
    this.#title = doc.createElement('div');
    this.#title.className = 'aui-gauge__title';
    this.#title.id = createId('aui-gauge-title');
    this.element = svgElement(doc, 'svg', { viewBox: '0 0 200 150', focusable: 'false' }, 'aui-gauge__svg');
    this.element.setAttribute('role', 'meter');
    this.element.setAttribute('aria-labelledby', this.#title.id);
    this.#description = doc.createElement('p');
    this.#description.className = 'aui-gauge__description';
    this.#render();
    host.classList.add('aui-gauge');
    host.replaceChildren(this.#title, this.element, this.#description);
    this.#unsubscribe = gaugeConfig.subscribe(() => {
      this.#render();
    });
  }

  /** The accessible value text. */
  get valueText(): string {
    return this.element.getAttribute('aria-valuetext') ?? '';
  }

  update(options: Partial<GaugeOptions>): void {
    const next = { ...this.#options, ...options };
    Gauge.#assert(next);
    this.#options = next;
    this.#render();
  }

  destroy(): void {
    this.#unsubscribe();
    this.#styler.clear();
    this.host.replaceChildren();
    this.host.classList.remove('aui-gauge', ...COLORS.map((c) => `aui-gauge--c${String(c)}`));
  }

  static #assert(o: GaugeOptions): void {
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string');
    if (o.value !== null && typeof o.value !== 'number') fail('value', 'number | null');
    const min = o.min ?? 0;
    const max = o.max ?? 100;
    if (!Number.isFinite(min)) fail('min', 'finite number');
    if (!Number.isFinite(max) || max <= min) fail('max', 'finite number greater than min');
    if (o.bands !== undefined) {
      if (!Array.isArray(o.bands)) fail('bands', 'GaugeBand[]');
      let previous = min;
      o.bands.forEach((b: unknown, i) => {
        if (!validators.isRecord(b) || typeof b.to !== 'number' || !Number.isFinite(b.to) || b.to <= previous || typeof b.label !== 'string') fail(`bands[${String(i)}]`, '{ to: ascending number within (min, max], label: string }');
        if (b.color !== undefined && !COLORS.includes(b.color)) fail(`bands[${String(i)}].color`, 'integer 1-8');
        previous = b.to;
      });
    }
    if (o.target !== undefined && !Number.isFinite(o.target)) fail('target', 'finite number');
    if (o.color !== undefined && !COLORS.includes(o.color)) fail('color', 'integer 1-8');
    for (const key of ['description', 'valueText'] as const) if (o[key] !== undefined && typeof o[key] !== 'string') fail(key, 'string');
    if (o.hideLabel !== undefined && typeof o.hideLabel !== 'boolean') fail('hideLabel', 'boolean');
    if (o.valueFormat !== undefined && !validators.isRecord(o.valueFormat)) fail('valueFormat', 'Intl.NumberFormatOptions');
    if (o.formatValue !== undefined && typeof o.formatValue !== 'function') fail('formatValue', '(value: number) => string');
    assertTheme(o.theme, 'gauge', 'GAUGE_OPTIONS');
  }

  #configInput(): Partial<GaugeConfig & { locale: string; direction: Direction }> {
    const o = this.#options;
    const input: Partial<GaugeConfig & { locale: string; direction: Direction }> = {};
    if (o.showRange !== undefined) input.showRange = o.showRange;
    if (o.locale !== undefined) input.locale = o.locale;
    if (o.direction !== undefined) input.direction = o.direction;
    return input;
  }

  #render(): void {
    const o = this.#options;
    this.#styler.apply(o.theme);
    const config = gaugeConfig.resolve(this.#configInput());
    const locale = config.locale;
    const doc = this.host.ownerDocument;
    const min = o.min ?? 0;
    const max = o.max ?? 100;
    const nf = new Intl.NumberFormat(locale, o.valueFormat ?? {});
    const custom = o.formatValue;
    const format = (v: number): string => (custom ? custom(v) : nf.format(v));
    const msg = (key: string, params: Readonly<Record<string, string>> = {}): string => getMessage('gauge', key, params, locale);
    const angleOf = (v: number): number => START + (Math.min(max, Math.max(min, v)) - min) / (max - min) * SWEEP;
    const value = typeof o.value === 'number' && Number.isFinite(o.value) ? o.value : null;
    const bands = o.bands ?? [];
    const band = value === null ? undefined : bands.find((b) => value <= b.to) ?? (value > max ? bands[bands.length - 1] : undefined);
    const bandIndex = band ? bands.indexOf(band) : -1;
    const slot = o.color ?? (band ? (band.color ?? bandIndex + 1) : 1);

    this.#title.textContent = o.label;
    this.#title.classList.toggle('aui-gauge__title--hidden', o.hideLabel === true);
    this.#description.textContent = o.description ?? '';
    this.#description.hidden = !o.description;
    for (const c of COLORS) this.host.classList.toggle(`aui-gauge--c${String(c)}`, c === slot);

    const svg = this.element;
    svg.setAttribute('aria-valuemin', String(min));
    svg.setAttribute('aria-valuemax', String(max));
    if (value === null) svg.removeAttribute('aria-valuenow');
    else svg.setAttribute('aria-valuenow', String(Math.min(max, Math.max(min, value))));
    let text = value === null ? msg('noValue') : msg('valueText', { value: format(value), range: msg('range', { min: format(min), max: format(max) }) });
    if (band) text = msg('withBand', { text, band: band.label });
    if (o.target !== undefined) text = msg('withTarget', { text, target: msg('target', { target: format(o.target) }) });
    svg.setAttribute('aria-valuetext', o.valueText ?? text);

    // R20-22: with `sliceRadius` / `cornerRadius` the arcs are drawn as filled ring sectors with
    // rounded corners (the shared sector math); without, as stroked arcs (unchanged).
    const corner = resolveCorners(this.host).slice ?? 0;
    const ring = (a0: number, a1: number, radius: number, thickness: number, cls: string): SVGPathElement =>
      corner > 0
        ? svgElement(doc, 'path', { d: sectorPath(CX, CY, radius + thickness / 2, radius - thickness / 2, a0, a1, corner) }, `${cls} aui-gauge__arc--filled`)
        : svgElement(doc, 'path', { d: arc(a0, a1, radius) }, cls);
    const nodes: SVGElement[] = [ring(START, START + SWEEP, R, THICKNESS, 'aui-gauge__track')];
    let from = min;
    bands.forEach((b, i) => {
      const cls = `aui-gauge__band aui-gauge__band--c${String(b.color ?? i + 1)}`;
      nodes.push(ring(angleOf(from), angleOf(b.to), BAND_R, BAND_THICKNESS, cls));
      from = b.to;
    });
    if (value !== null && value > min) nodes.push(ring(START, angleOf(value), R, THICKNESS, 'aui-gauge__value'));
    if (o.target !== undefined) {
      const a = angleOf(o.target);
      nodes.push(svgElement(doc, 'path', { d: `M${point(a, R - THICKNESS / 2 - 4)}L${point(a, BAND_R + 4)}` }, 'aui-gauge__target'));
    }
    const center = svgElement(doc, 'text', { x: CX, y: CY + 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, 'aui-gauge__reading');
    center.textContent = value === null ? '-' : format(value);
    nodes.push(center);
    if (band) {
      const name = svgElement(doc, 'text', { x: CX, y: CY + 26, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, 'aui-gauge__band-label');
      name.textContent = band.label;
      nodes.push(name);
    }
    if (config.showRange) {
      const ends: [number, number][] = [[min, START], [max, START + SWEEP]];
      for (const [v, a] of ends) {
        const [x, y] = point(a, R).split(' ').map(Number);
        const t = svgElement(doc, 'text', { x: x ?? 0, y: (y ?? 0) + THICKNESS + 4, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, 'aui-gauge__range');
        t.textContent = format(v);
        nodes.push(t);
      }
    }
    // Decorative children: the meter's value text carries the meaning.
    for (const n of nodes) n.setAttribute('aria-hidden', 'true');
    svg.replaceChildren(...nodes);
  }
}
