/**
 * Stat Card (SPEC section 18.17: KPI Card, Metric Card, Statistic Tile). A headline
 * number with its label, an optional change against a previous value (arrow,
 * signed text, and a spelled-out "increase"/"decrease" with whether that is
 * favorable, so the meaning never depends on color), a comparison caption, an
 * optional trend Sparkline, and supporting text. A `role="group"` named by its
 * label; not interactive unless `href` makes the whole card a link.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { Sparkline, type SparklineColor } from '../sparkline/sparkline.js';
import { isSafeHref } from '../internal/href.js';

export type StatCardSentiment = 'higher-is-better' | 'lower-is-better' | 'neutral';
export type StatCardDeltaFormat = 'percent' | 'absolute';

export interface StatCardConfig {
  /** How the change reads (and is colored). Default `higher-is-better`. */
  sentiment: StatCardSentiment;
  /** `percent` (default): relative change; `absolute`: the difference in value units. */
  deltaFormat: StatCardDeltaFormat;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    statCard: StatCardConfig & { locale: string; direction: Direction };
  }
}

export const statCardConfig = defineComponentConfig<StatCardConfig, 'locale' | 'direction'>(
  'statCard',
  {
    sentiment: { default: 'higher-is-better', expected: '"higher-is-better" | "lower-is-better" | "neutral"', validate: validators.oneOf(['higher-is-better', 'lower-is-better', 'neutral'] as const) },
    deltaFormat: { default: 'percent', expected: '"percent" | "absolute"', validate: validators.oneOf(['percent', 'absolute'] as const) },
  },
  ['locale', 'direction'],
);

export interface StatCardOptions extends Partial<StatCardConfig> {
  label: string;
  /** Number (formatted with `valueFormat`), preformatted text, or null ("No value"). */
  value: number | string | null;
  /** Previous value: the change is computed from it. */
  previous?: number | null;
  /** Explicit change (ratio for `percent`, units for `absolute`); wins over `previous`. */
  delta?: number | null;
  /** Caption after the change, for example "vs last month". */
  comparisonLabel?: string;
  /** Supporting text below. */
  description?: string;
  /** Trend values for a Sparkline. */
  trend?: readonly (number | null)[];
  /** Sparkline accessible label. Default: the card label. */
  trendLabel?: string;
  trendColor?: SparklineColor;
  valueFormat?: Intl.NumberFormatOptions;
  formatValue?: (value: number) => string;
  icon?: IconRef;
  /** Make the whole card a link (http(s) or relative URLs only). */
  href?: string;
  /** Show a busy placeholder instead of the value. */
  busy?: boolean;
  locale?: string;
  direction?: Direction;
}

registerMessages('statCard', 'en', {
  noValue: 'No value',
  loading: 'Loading',
  increase: 'increase',
  decrease: 'decrease',
  noChange: 'no change',
  favorable: 'favorable',
  unfavorable: 'unfavorable',
  change: '{direction} of {amount}',
  changeWithTone: '{direction} of {amount}, {tone}',
});

function fail(property: string, expected: string): never {
  throw configurationError('STAT_CARD_OPTIONS', 'Invalid stat card options.', { component: 'statCard', property: `statCard.${property}`, expected });
}

export class StatCard {
  readonly host: HTMLElement;
  #options: StatCardOptions;
  readonly #group = new DisposableGroup();
  readonly #root: HTMLElement;
  #sparkline: Sparkline | null = null;
  readonly #sparkHost: HTMLSpanElement;
  readonly #labelId = createId('aui-stat-card-label');

  /** Render a stat card into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: StatCardOptions): StatCard {
    return new StatCard(host, options);
  }

  private constructor(host: HTMLElement, options: StatCardOptions) {
    StatCard.#assert(options, host.ownerDocument.baseURI);
    this.host = host;
    this.#options = { ...options };
    this.#config();
    const doc = host.ownerDocument;
    this.#root = doc.createElement(options.href ? 'a' : 'div');
    this.#sparkHost = doc.createElement('span');
    this.#sparkHost.className = 'aui-stat-card__trend';
    this.#render();
    host.classList.add('aui-stat-card');
    host.replaceChildren(this.#root);
    this.#group.add(statCardConfig.subscribe(() => {
      this.#render();
    }));
  }

  /** Change as displayed (ratio or units), or null. */
  get delta(): number | null {
    return this.#delta();
  }

  update(options: Partial<StatCardOptions>): void {
    const next = { ...this.#options, ...options };
    StatCard.#assert(next, this.host.ownerDocument.baseURI);
    if (Boolean(next.href) !== Boolean(this.#options.href)) fail('href', 'set or unset at create time (recreate the card)');
    this.#options = next;
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.#sparkline?.destroy();
    this.host.replaceChildren();
    this.host.classList.remove('aui-stat-card');
  }

  static #assert(o: StatCardOptions, base: string): void {
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string');
    if (o.value !== null && typeof o.value !== 'number' && typeof o.value !== 'string') fail('value', 'number | string | null');
    for (const key of ['previous', 'delta'] as const) {
      const v = o[key];
      if (v !== undefined && v !== null && !Number.isFinite(v)) fail(key, 'finite number | null');
    }
    for (const key of ['comparisonLabel', 'description', 'trendLabel'] as const) if (o[key] !== undefined && typeof o[key] !== 'string') fail(key, 'string');
    if (o.trend !== undefined && (!Array.isArray(o.trend) || o.trend.some((v) => v !== null && typeof v !== 'number'))) fail('trend', '(number | null)[]');
    if (o.href !== undefined && (typeof o.href !== 'string' || !isSafeHref(o.href, base))) fail('href', 'http(s) or relative URL');
    if (o.busy !== undefined && typeof o.busy !== 'boolean') fail('busy', 'boolean');
    if (o.valueFormat !== undefined && !validators.isRecord(o.valueFormat)) fail('valueFormat', 'Intl.NumberFormatOptions');
    if (o.formatValue !== undefined && typeof o.formatValue !== 'function') fail('formatValue', '(value: number) => string');
  }

  #config(): Readonly<StatCardConfig & { locale: string; direction: Direction }> {
    const o = this.#options;
    const input: Partial<StatCardConfig & { locale: string; direction: Direction }> = {};
    if (o.sentiment !== undefined) input.sentiment = o.sentiment;
    if (o.deltaFormat !== undefined) input.deltaFormat = o.deltaFormat;
    if (o.locale !== undefined) input.locale = o.locale;
    if (o.direction !== undefined) input.direction = o.direction;
    return statCardConfig.resolve(input);
  }

  #delta(): number | null {
    const o = this.#options;
    if (o.delta !== undefined && o.delta !== null) return o.delta;
    const previous = o.previous;
    if (typeof o.value !== 'number' || previous === undefined || previous === null) return null;
    if (this.#config().deltaFormat === 'absolute') return o.value - previous;
    return previous === 0 ? null : (o.value - previous) / Math.abs(previous);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const locale = config.locale;
    const doc = this.host.ownerDocument;
    const msg = (key: string, params: Readonly<Record<string, string>> = {}): string => getMessage('statCard', key, params, locale);
    const nf = new Intl.NumberFormat(locale, o.valueFormat ?? {});
    const format = (v: number): string => (o.formatValue ? o.formatValue(v) : nf.format(v));
    const root = this.#root;
    root.className = o.href ? 'aui-stat-card__body aui-stat-card__link' : 'aui-stat-card__body';
    if (root instanceof HTMLAnchorElement && o.href) root.href = o.href;
    const label = doc.createElement('span');
    label.className = 'aui-stat-card__label';
    label.textContent = o.label;
    const top = doc.createElement('span');
    top.className = 'aui-stat-card__top';
    if (o.icon) {
      const icon = renderIcon(o.icon, { doc });
      icon.classList.add('aui-stat-card__icon');
      top.append(icon);
    }
    top.append(label);
    const value = doc.createElement('span');
    value.className = 'aui-stat-card__value';
    value.textContent = o.busy ? msg('loading') : o.value === null ? msg('noValue') : typeof o.value === 'number' ? format(o.value) : o.value;
    const parts: Node[] = [top, value];
    const delta = o.busy ? null : this.#delta();
    if (delta !== null) {
      const dir = delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'noChange';
      const good = config.sentiment === 'neutral' || delta === 0 ? null : (delta > 0) === (config.sentiment === 'higher-is-better');
      const amountFormat = config.deltaFormat === 'percent'
        ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' })
        : new Intl.NumberFormat(locale, { ...(o.valueFormat ?? {}), signDisplay: 'exceptZero' });
      const amount = config.deltaFormat === 'absolute' && o.formatValue ? `${delta > 0 ? '+' : ''}${o.formatValue(delta)}` : amountFormat.format(delta);
      // Spoken without a sign: the direction word carries it ("decrease of 33.3%", not "decrease of minus 33.3%").
      const magnitude = Math.abs(delta);
      const spokenAmount = config.deltaFormat === 'absolute' && o.formatValue
        ? o.formatValue(magnitude)
        : new Intl.NumberFormat(locale, { ...amountFormat.resolvedOptions(), signDisplay: 'never' }).format(magnitude);
      const change = doc.createElement('span');
      change.className = `aui-stat-card__delta aui-stat-card__delta--${good === null ? 'neutral' : good ? 'good' : 'bad'}`;
      if (dir !== 'noChange') {
        const arrow = renderIcon(dir === 'increase' ? 'arrow-up' : 'arrow-down', { doc });
        arrow.classList.add('aui-stat-card__arrow');
        change.append(arrow);
      }
      const visible = doc.createElement('span');
      visible.textContent = amount;
      visible.setAttribute('aria-hidden', 'true');
      // Spelled out for assistive technology: direction, amount, and whether it is good.
      const spoken = doc.createElement('span');
      spoken.className = 'aui-stat-card__sr';
      spoken.textContent = good === null
        ? msg('change', { direction: msg(dir), amount: spokenAmount })
        : msg('changeWithTone', { direction: msg(dir), amount: spokenAmount, tone: msg(good ? 'favorable' : 'unfavorable') });
      change.append(visible, spoken);
      const row = doc.createElement('span');
      row.className = 'aui-stat-card__change';
      row.append(change);
      if (o.comparisonLabel) {
        const c = doc.createElement('span');
        c.className = 'aui-stat-card__comparison';
        c.textContent = ` ${o.comparisonLabel}`;
        row.append(c);
      }
      parts.push(row);
    }
    if (o.trend && o.trend.length > 0) {
      const spark = { label: o.trendLabel ?? o.label, values: o.trend, color: o.trendColor ?? 1, locale, direction: config.direction };
      if (this.#sparkline) this.#sparkline.update(spark);
      else this.#sparkline = Sparkline.create(this.#sparkHost, spark);
      parts.push(this.#sparkHost);
    } else if (this.#sparkline) {
      this.#sparkline.destroy();
      this.#sparkline = null;
    }
    if (o.description) {
      const d = doc.createElement('span');
      d.className = 'aui-stat-card__description';
      d.textContent = o.description;
      parts.push(d);
    }
    label.id = this.#labelId;
    // A link is named by its whole content; a plain card is a group named by its label.
    if (!o.href) {
      root.setAttribute('role', 'group');
      root.setAttribute('aria-labelledby', this.#labelId);
    }
    if (o.busy) root.setAttribute('aria-busy', 'true');
    else root.removeAttribute('aria-busy');
    root.replaceChildren(...parts);
  }
}
