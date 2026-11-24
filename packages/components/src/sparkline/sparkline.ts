/**
 * Sparkline (SPEC section 18.18). A word-sized trend graphic (line or bars) for inline
 * use in text, tables, and cards. It is a static image: `role="img"` with a
 * generated accessible name (label, count, first and last value, minimum and
 * maximum), not focusable, no tooltip. It scales with its box (default 6em x 1.5em)
 * through the SVG viewBox, so creating one needs no layout reads. Missing values
 * are gaps. Deliberately independent of the chart frame so it stays small.
 */
import { configurationError, defineComponentConfig, formatNumber, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { assertTheme, ChartStyler, resolveCorners, type ChartTheme } from '../internal/chart/style.js';
import { fmt, roundedBox, sideRadii, svgElement, valueEnd } from '../internal/chart/svg.js';

export type SparklineVariant = 'line' | 'bar';
export type SparklineColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface SparklineConfig {
  /** Mark the last value with a dot (line) or emphasis (bar). Default true. */
  highlightLast: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    sparkline: SparklineConfig & { locale: string; direction: Direction };
  }
}

export const sparklineConfig = defineComponentConfig<SparklineConfig, 'locale' | 'direction'>(
  'sparkline',
  {
    highlightLast: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

registerMessages('sparkline', 'en', {
  summary: '{label}: {count}, from {first} to {last}, minimum {min}, maximum {max}.',
  single: '{label}: {value}.',
  empty: '{label}: no data.',
  valueCount_one: '{count} value',
  valueCount_other: '{count} values',
});

export interface SparklineOptions extends Partial<SparklineConfig> {
  /** What the values are, for example "Revenue, last 12 months" (start of the accessible name). */
  label: string;
  /** `null`, `NaN`, and infinities are gaps. */
  values: readonly (number | null)[];
  /** Default `line`. */
  variant?: SparklineVariant;
  /** Palette slot 1-8 (`color-chart-<n>`). Default 1. */
  color?: SparklineColor;
  /** Fixed domain minimum (for comparable sparklines). Default: data minimum (bars include zero). */
  min?: number;
  /** Fixed domain maximum. Default: data maximum (bars include zero). */
  max?: number;
  valueFormat?: Intl.NumberFormatOptions;
  formatValue?: (value: number) => string;
  /** Replaces the generated accessible name. */
  valueText?: string;
  locale?: string;
  direction?: Direction;
  /**
   * Shared chart look and feel (R20-15). The sparkline uses `palette` (slot colors), `lineWidth`,
   * `axisColor` (bar baseline), and `animation`; other properties have no visible effect.
   */
  theme?: ChartTheme | undefined;
}

const VARIANTS: readonly SparklineVariant[] = ['line', 'bar'];
const COLORS: readonly unknown[] = [1, 2, 3, 4, 5, 6, 7, 8];
const WIDTH = 100;
const HEIGHT = 24;
const PAD = 2;
const plurals = new Map<string, Intl.PluralRules>();

function fail(property: string, expected: string): never {
  throw configurationError('SPARKLINE_OPTIONS', 'Invalid sparkline options.', { component: 'sparkline', property: `sparkline.${property}`, expected });
}

function finite(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export class Sparkline {
  readonly host: HTMLElement;
  /** The `svg[role="img"]` element. */
  readonly element: SVGSVGElement;
  #options: SparklineOptions;
  readonly #unsubscribe: () => void;
  readonly #styler: ChartStyler;

  /** Render a sparkline into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: SparklineOptions): Sparkline {
    return new Sparkline(host, options);
  }

  private constructor(host: HTMLElement, options: SparklineOptions) {
    Sparkline.#assert(options);
    this.host = host;
    this.#options = { ...options };
    this.#config();
    this.#styler = new ChartStyler(host);
    const svg = svgElement(host.ownerDocument, 'svg', { viewBox: `0 0 ${String(WIDTH)} ${String(HEIGHT)}`, preserveAspectRatio: 'none', width: '100%', height: '100%', focusable: 'false' }, 'aui-sparkline__svg');
    svg.setAttribute('role', 'img');
    this.element = svg;
    this.#render();
    host.replaceChildren(svg);
    this.#unsubscribe = sparklineConfig.subscribe(() => {
      this.#render();
    });
  }

  /** The accessible name (generated or `valueText`). */
  get summary(): string {
    return this.element.getAttribute('aria-label') ?? '';
  }

  update(options: Partial<SparklineOptions>): void {
    const next = { ...this.#options, ...options };
    Sparkline.#assert(next);
    this.#options = next;
    this.#render();
  }

  destroy(): void {
    this.#unsubscribe();
    this.#styler.clear();
    this.host.style.removeProperty('--aui-sparkline-line-width');
    this.host.replaceChildren();
    this.host.classList.remove('aui-sparkline', 'aui-sparkline--line', 'aui-sparkline--bar', ...COLORS.map((c) => `aui-sparkline--c${String(c)}`));
  }

  static #assert(o: SparklineOptions): void {
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string');
    if (!Array.isArray(o.values) || o.values.some((v: unknown) => v !== null && typeof v !== 'number')) fail('values', '(number | null)[]');
    if (o.variant !== undefined && !VARIANTS.includes(o.variant)) fail('variant', '"line" | "bar"');
    if (o.color !== undefined && !COLORS.includes(o.color)) fail('color', 'integer 1-8');
    if (o.min !== undefined && !Number.isFinite(o.min)) fail('min', 'finite number');
    if (o.max !== undefined && !Number.isFinite(o.max)) fail('max', 'finite number');
    if (o.min !== undefined && o.max !== undefined && o.max <= o.min) fail('max', 'number greater than min');
    if (o.formatValue !== undefined && typeof o.formatValue !== 'function') fail('formatValue', '(value: number) => string');
    if (o.valueFormat !== undefined && !validators.isRecord(o.valueFormat)) fail('valueFormat', 'Intl.NumberFormatOptions');
    if (o.valueText !== undefined && typeof o.valueText !== 'string') fail('valueText', 'string');
    assertTheme(o.theme, 'sparkline', 'SPARKLINE_OPTIONS');
  }

  #config(): Readonly<SparklineConfig & { locale: string; direction: Direction }> {
    const o = this.#options;
    return sparklineConfig.resolve({
      ...(o.highlightLast === undefined ? {} : { highlightLast: o.highlightLast }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const { locale } = config;
    const doc = this.host.ownerDocument;
    const svg = this.element;
    const variant = o.variant ?? 'line';
    const host = this.host;
    host.classList.add('aui-sparkline');
    this.#styler.apply(o.theme);
    // The sparkline keeps its thinner default line (1.5px), so `theme.lineWidth` has its own hook.
    if (o.theme?.lineWidth === undefined) host.style.removeProperty('--aui-sparkline-line-width');
    else host.style.setProperty('--aui-sparkline-line-width', `${String(o.theme.lineWidth)}px`);
    host.classList.toggle('aui-sparkline--line', variant === 'line');
    host.classList.toggle('aui-sparkline--bar', variant === 'bar');
    for (const c of COLORS) host.classList.toggle(`aui-sparkline--c${String(c)}`, c === (o.color ?? 1));

    const values = o.values;
    const n = values.length;
    let min = Infinity;
    let max = -Infinity;
    let count = 0;
    let first = 0;
    let last = 0;
    let lastIndex = -1;
    for (let i = 0; i < n; i++) {
      const v = finite(values[i]);
      if (v === null) continue;
      if (count === 0) first = v;
      count++;
      last = v;
      lastIndex = i;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const format = o.formatValue ?? ((v: number) => formatNumber(v, o.valueFormat ?? {}, locale));
    const label = o.label;
    let name: string;
    if (o.valueText !== undefined) name = o.valueText;
    else if (count === 0) name = getMessage('sparkline', 'empty', { label }, locale);
    else if (count === 1) name = getMessage('sparkline', 'single', { label, value: format(first) }, locale);
    else {
      let rules = plurals.get(locale);
      if (!rules) {
        rules = new Intl.PluralRules(locale);
        plurals.set(locale, rules);
      }
      const countText = getMessage('sparkline', rules.select(count) === 'one' ? 'valueCount_one' : 'valueCount_other', { count: formatNumber(count, {}, locale) }, locale);
      name = getMessage('sparkline', 'summary', { label, count: countText, first: format(first), last: format(last), min: format(min), max: format(max) }, locale);
    }
    svg.setAttribute('aria-label', name);

    const children: SVGElement[] = [];
    if (count > 0) {
      let lo = o.min ?? min;
      let hi = o.max ?? max;
      if (variant === 'bar') {
        lo = Math.min(lo, 0);
        hi = Math.max(hi, 0);
      }
      if (lo === hi) {
        lo -= 1;
        hi += 1;
      }
      const rtl = config.direction === 'rtl';
      const clampY = (v: number): number => HEIGHT - PAD - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (HEIGHT - PAD * 2);
      if (variant === 'line') {
        const x = (i: number): number => {
          const t = n === 1 ? 0.5 : i / (n - 1);
          return (rtl ? 1 - t : t) * WIDTH;
        };
        let d = '';
        let run = 0;
        for (let i = 0; i < n; i++) {
          const v = finite(values[i]);
          if (v === null) {
            run = 0;
            continue;
          }
          d += `${run === 0 ? 'M' : 'L'}${fmt(x(i))} ${fmt(clampY(v))}`;
          run++;
          // Isolated points (gaps on both sides) are drawn as dots.
          if (finite(values[i - 1]) === null && finite(values[i + 1]) === null) children.push(svgElement(doc, 'path', { d: `M${fmt(x(i))} ${fmt(clampY(v))}h0` }, 'aui-sparkline__dot'));
        }
        children.unshift(svgElement(doc, 'path', { d }, 'aui-sparkline__line'));
        if (config.highlightLast) children.push(svgElement(doc, 'path', { d: `M${fmt(x(lastIndex))} ${fmt(clampY(last))}h0` }, 'aui-sparkline__last'));
      } else {
        const step = WIDTH / n;
        const zero = clampY(0);
        // R20-22: bars round at the value end (radius in viewBox units: the sparkline stretches to its box).
        const radius = resolveCorners(this.host).bar ?? 0;
        for (let i = 0; i < n; i++) {
          const v = finite(values[i]);
          if (v === null) continue;
          const top = Math.min(zero, clampY(v));
          const height = Math.max(0.5, Math.abs(clampY(v) - zero));
          const slot = rtl ? n - 1 - i : i;
          children.push(roundedBox(doc, { x: slot * step + step * 0.1, y: top, width: step * 0.8, height }, sideRadii(radius, [valueEnd(zero, clampY(v), false)]), i === lastIndex && config.highlightLast ? 'aui-sparkline__bar aui-sparkline__bar--last' : 'aui-sparkline__bar'));
        }
        if (lo < 0 && hi > 0) children.push(svgElement(doc, 'path', { d: `M0 ${fmt(zero)}H${String(WIDTH)}` }, 'aui-sparkline__baseline'));
      }
    }
    svg.replaceChildren(...children);
  }
}
