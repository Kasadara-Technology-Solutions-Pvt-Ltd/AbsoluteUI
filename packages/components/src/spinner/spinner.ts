/**
 * Spinner (SPEC section 18.x, R1 status component). An indeterminate loading
 * indicator: a `role="status"` region holding a decorative spinner icon and a
 * localized label. The region exists from creation; its content is inserted
 * after the optional `delay`, so fast operations never flash a spinner and the
 * label is announced politely when it appears. Rotation stops under reduced
 * motion (CSS).
 */
import { configurationError, defineComponentConfig, DisposableGroup, getMessage, registerMessages, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerConfig {
  size: SpinnerSize;
  /** Milliseconds to wait before showing the spinner (avoids flicker for fast operations). */
  delay: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    spinner: SpinnerConfig & { locale: string };
  }
}

export const spinnerConfig = defineComponentConfig<SpinnerConfig, 'locale'>(
  'spinner',
  {
    size: { default: 'md', expected: '"sm" | "md" | "lg"', validate: validators.oneOf(['sm', 'md', 'lg'] as const) },
    delay: { default: 0, expected: 'integer 0..60000 (ms)', validate: validators.integerInRange(0, 60000), mutability: 'init-only' },
  },
  ['locale'],
);

registerMessages('spinner', 'en', { loading: 'Loading' });

export interface SpinnerIcons {
  spinner: IconRef;
}

export interface SpinnerOptions extends Partial<SpinnerConfig> {
  /** Label announced and (optionally) shown. Default: localized "Loading". */
  label?: string;
  /** Show the label visibly. Default false (visually hidden, still announced). */
  showLabel?: boolean;
  locale?: string;
  icons?: Partial<SpinnerIcons>;
}

const SIZES: readonly SpinnerSize[] = ['sm', 'md', 'lg'];

export class Spinner {
  readonly host: HTMLElement;
  #options: SpinnerOptions;
  #visible = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #doc: Document;
  readonly #label: HTMLSpanElement;
  #icon: Element;
  readonly #group = new DisposableGroup();

  /** Render a spinner into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: SpinnerOptions = {}): Spinner {
    return new Spinner(host, options);
  }

  private constructor(host: HTMLElement, options: SpinnerOptions) {
    Spinner.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const config = this.#config();
    this.#label = this.#doc.createElement('span');
    this.#label.className = 'aui-spinner__label';
    this.#icon = this.#renderIcon();

    host.classList.add('aui-spinner');
    host.setAttribute('role', 'status');
    host.replaceChildren();
    this.#render();

    if (config.delay === 0) {
      this.#show();
    } else {
      host.classList.add('aui-spinner--pending');
      this.#timer = setTimeout(() => {
        this.#timer = undefined;
        this.#show();
      }, config.delay);
      this.#group.add(() => {
        clearTimeout(this.#timer);
      });
    }
    this.#group.add(spinnerConfig.subscribe(() => {
      this.#render();
    }));
  }

  /** Whether the delay has elapsed and the spinner content is rendered. */
  get visible(): boolean {
    return this.#visible;
  }

  update(options: Partial<SpinnerOptions>): void {
    const next = { ...this.#options, ...options };
    Spinner.#assert(next);
    spinnerConfig.assertUpdatable(this.#options, next);
    const iconChanged = options.icons !== undefined;
    this.#options = next;
    if (iconChanged) {
      const icon = this.#renderIcon();
      this.#icon.replaceWith(icon);
      this.#icon = icon;
    }
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.removeAttribute('role');
    this.host.classList.remove('aui-spinner', 'aui-spinner--pending', ...SIZES.map((s) => `aui-spinner--${s}`));
  }

  static #assert(o: SpinnerOptions): void {
    if (o.label !== undefined && (typeof o.label !== 'string' || o.label.trim() === '')) {
      throw configurationError('SPINNER_OPTIONS', 'Invalid spinner options.', { component: 'spinner', property: 'spinner.label', expected: 'non-empty string' });
    }
  }

  #config(): Readonly<SpinnerConfig & { locale: string }> {
    const o = this.#options;
    return spinnerConfig.resolve({
      ...(o.size === undefined ? {} : { size: o.size }),
      ...(o.delay === undefined ? {} : { delay: o.delay }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #renderIcon(): Element {
    return renderIcon(this.#options.icons?.spinner ?? 'spinner', { className: 'aui-spinner__icon', doc: this.#doc });
  }

  #show(): void {
    this.#visible = true;
    this.host.classList.remove('aui-spinner--pending');
    // Content is inserted into the existing status region, so it is announced.
    this.host.replaceChildren(this.#icon, this.#label);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    for (const s of SIZES) this.host.classList.toggle(`aui-spinner--${s}`, s === config.size);
    this.#label.textContent = o.label ?? getMessage('spinner', 'loading', {}, config.locale);
    this.#label.classList.toggle('aui-spinner__label--hidden', o.showLabel !== true);
  }
}
