/**
 * Progress Bar (SPEC section 18.x, R1 status component). A determinate or
 * indeterminate `role="progressbar"` with a visible label, localized value text,
 * optional help text, and tones that never rely on color alone (a labelled icon
 * accompanies non-default tones). The fill width is written through a CSS custom
 * property with the CSSOM (CSP-safe).
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, formatNumber, getMessage, registerMessages, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce } from '@absoluteui/utilities';

export type ProgressBarTone = 'default' | 'success' | 'warning' | 'error';

export interface ProgressBarConfig {
  /** Render the formatted value text next to the label. */
  showValue: boolean;
  /** Announce "{label} complete" once when the value reaches `max`. */
  announceComplete: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    progressBar: ProgressBarConfig & { locale: string };
  }
}

export const progressBarConfig = defineComponentConfig<ProgressBarConfig, 'locale'>(
  'progressBar',
  {
    showValue: { default: true, expected: 'boolean', validate: validators.isBoolean },
    announceComplete: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale'],
);

registerMessages('progressBar', 'en', {
  complete: '{label} complete',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
});

export interface ProgressBarIcons {
  success: IconRef;
  warning: IconRef;
  error: IconRef;
}

export interface ProgressBarOptions extends Partial<ProgressBarConfig> {
  /** Visible label (required accessible name, referenced by aria-labelledby). */
  label: string;
  /** Current value; `null` renders an indeterminate bar (no aria-valuenow). Default `null`. Clamped to [min, max]. */
  value?: number | null;
  /** Default 0. */
  min?: number;
  /** Default 100. */
  max?: number;
  /** Custom value text (aria-valuetext and visible value). Default: localized percentage. */
  valueText?: (value: number, max: number) => string;
  /** Help text, referenced by aria-describedby (text only). */
  description?: string;
  tone?: ProgressBarTone;
  locale?: string;
  icons?: Partial<ProgressBarIcons>;
}

const TONES: readonly ProgressBarTone[] = ['default', 'success', 'warning', 'error'];
const DEFAULT_ICONS: ProgressBarIcons = { success: 'check-circle', warning: 'alert-triangle', error: 'alert-circle' };

function fail(property: string, expected: string): never {
  throw configurationError('PROGRESS_BAR_OPTIONS', 'Invalid progress bar options.', { component: 'progressBar', property: `progressBar.${property}`, expected });
}

export class ProgressBar {
  readonly host: HTMLElement;
  /** The element with role="progressbar". */
  readonly track: HTMLDivElement;
  #options: ProgressBarOptions;
  #complete: boolean;
  readonly #doc: Document;
  readonly #header: HTMLDivElement;
  readonly #label: HTMLSpanElement;
  readonly #value: HTMLSpanElement;
  readonly #fill: HTMLDivElement;
  readonly #description: HTMLDivElement;
  #icon: Element | null = null;
  readonly #group = new DisposableGroup();

  /** Render a progress bar into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: ProgressBarOptions): ProgressBar {
    return new ProgressBar(host, options);
  }

  private constructor(host: HTMLElement, options: ProgressBarOptions) {
    ProgressBar.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#doc;

    this.#header = doc.createElement('div');
    this.#header.className = 'aui-progress-bar__header';
    this.#label = doc.createElement('span');
    this.#label.className = 'aui-progress-bar__label';
    this.#label.id = createId('aui-progress-bar-label');
    // Visible value duplicates aria-valuetext; hidden from AT to avoid double reading.
    this.#value = doc.createElement('span');
    this.#value.className = 'aui-progress-bar__value';
    this.#value.setAttribute('aria-hidden', 'true');
    this.#header.append(this.#label, this.#value);

    this.track = doc.createElement('div');
    this.track.className = 'aui-progress-bar__track';
    this.track.setAttribute('role', 'progressbar');
    this.track.setAttribute('aria-labelledby', this.#label.id);
    this.#fill = doc.createElement('div');
    this.#fill.className = 'aui-progress-bar__fill';
    this.track.append(this.#fill);

    this.#description = doc.createElement('div');
    this.#description.className = 'aui-progress-bar__description';
    this.#description.id = createId('aui-progress-bar-desc');

    // Resolve config before touching the host: invalid config throws with nothing rendered.
    this.#config();
    host.classList.add('aui-progress-bar');
    host.replaceChildren(this.#header, this.track, this.#description);
    this.#complete = this.#isComplete();
    this.#render();
    this.#group.add(progressBarConfig.subscribe(() => {
      this.#render();
    }));
  }

  /** Current (clamped) value, or `null` when indeterminate. */
  get value(): number | null {
    const v = this.#options.value ?? null;
    return v === null ? null : this.#clamp(v);
  }

  get indeterminate(): boolean {
    return this.value === null;
  }

  setValue(value: number | null): void {
    this.update({ value });
  }

  update(options: Partial<ProgressBarOptions>): void {
    const next = { ...this.#options, ...options };
    ProgressBar.#assert(next);
    this.#options = next;
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-progress-bar', 'aui-progress-bar--indeterminate', ...TONES.map((t) => `aui-progress-bar--${t}`));
  }

  static #assert(o: ProgressBarOptions): void {
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string');
    const min = o.min ?? 0;
    const max = o.max ?? 100;
    if (typeof min !== 'number' || !Number.isFinite(min)) fail('min', 'finite number');
    if (typeof max !== 'number' || !Number.isFinite(max) || max <= min) fail('max', 'finite number greater than min');
    if (o.value !== undefined && o.value !== null && (typeof o.value !== 'number' || !Number.isFinite(o.value))) fail('value', 'finite number | null');
    if (o.tone !== undefined && !TONES.includes(o.tone)) fail('tone', '"default" | "success" | "warning" | "error"');
    if (o.valueText !== undefined && typeof o.valueText !== 'function') fail('valueText', '(value: number, max: number) => string');
    if (o.description !== undefined && typeof o.description !== 'string') fail('description', 'string');
  }

  #config(): Readonly<ProgressBarConfig & { locale: string }> {
    const o = this.#options;
    return progressBarConfig.resolve({
      ...(o.showValue === undefined ? {} : { showValue: o.showValue }),
      ...(o.announceComplete === undefined ? {} : { announceComplete: o.announceComplete }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #min(): number {
    return this.#options.min ?? 0;
  }

  #max(): number {
    return this.#options.max ?? 100;
  }

  #clamp(v: number): number {
    return Math.min(this.#max(), Math.max(this.#min(), v));
  }

  #isComplete(): boolean {
    const v = this.value;
    return v !== null && v >= this.#max();
  }

  #valueText(value: number, locale: string): string {
    const custom = this.#options.valueText;
    if (custom) return custom(value, this.#max());
    const ratio = (value - this.#min()) / (this.#max() - this.#min());
    return formatNumber(ratio, { style: 'percent', maximumFractionDigits: 0 }, locale);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const host = this.host;
    const track = this.track;
    const tone = o.tone ?? 'default';
    const value = this.value;

    for (const t of TONES) host.classList.toggle(`aui-progress-bar--${t}`, t === tone);
    host.classList.toggle('aui-progress-bar--indeterminate', value === null);
    this.#label.textContent = o.label;

    // Non-default tones carry a labelled icon so meaning never depends on color alone.
    this.#icon?.remove();
    this.#icon = null;
    if (tone !== 'default') {
      this.#icon = renderIcon(o.icons?.[tone] ?? DEFAULT_ICONS[tone], {
        className: 'aui-progress-bar__icon',
        label: getMessage('progressBar', tone, {}, config.locale),
        doc: this.#doc,
      });
      this.#label.after(this.#icon);
    }

    track.setAttribute('aria-valuemin', String(this.#min()));
    track.setAttribute('aria-valuemax', String(this.#max()));
    if (value === null) {
      track.removeAttribute('aria-valuenow');
      track.removeAttribute('aria-valuetext');
      this.#fill.style.removeProperty('--aui-progress');
      this.#value.textContent = '';
      this.#value.hidden = true;
    } else {
      const text = this.#valueText(value, config.locale);
      const pct = ((value - this.#min()) / (this.#max() - this.#min())) * 100;
      track.setAttribute('aria-valuenow', String(value));
      track.setAttribute('aria-valuetext', text);
      this.#fill.style.setProperty('--aui-progress', `${String(pct)}%`);
      this.#value.textContent = text;
      this.#value.hidden = !config.showValue;
    }

    if (o.description) {
      this.#description.textContent = o.description;
      this.#description.hidden = false;
      track.setAttribute('aria-describedby', this.#description.id);
    } else {
      this.#description.textContent = '';
      this.#description.hidden = true;
      track.removeAttribute('aria-describedby');
    }

    const complete = this.#isComplete();
    if (complete && !this.#complete && config.announceComplete) {
      announce(getMessage('progressBar', 'complete', { label: o.label }, config.locale), 'polite', this.#doc);
    }
    this.#complete = complete;
  }
}
