/**
 * Badge (R13-3). A short, static label such as "Active", "Beta", or "3 new" that
 * classifies the content next to it. The label text carries the meaning; tone
 * colors, the optional dot, and the optional icon are decorative. Never interactive:
 * removable or selectable tags are Tag Group.
 */
import { configurationError, defineComponentConfig, validators, DisposableGroup } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { subscribeWhileHosted } from '../internal/weak.js';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';
export type BadgeVariant = 'subtle' | 'outline';
export type BadgeSize = 'sm' | 'md';

export interface BadgeConfig {
  variant: BadgeVariant;
  size: BadgeSize;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    badge: BadgeConfig;
  }
}

export const badgeConfig = defineComponentConfig<BadgeConfig>('badge', {
  variant: { default: 'subtle', expected: '"subtle" | "outline"', validate: validators.oneOf(['subtle', 'outline'] as const) },
  size: { default: 'md', expected: '"sm" | "md"', validate: validators.oneOf(['sm', 'md'] as const) },
});

export interface BadgeOptions extends Partial<BadgeConfig> {
  /** Visible text (never parsed as HTML). It carries the badge's meaning. */
  label: string;
  /** Default `neutral`. Decorative: the label must make sense without the color. */
  tone?: BadgeTone;
  /** Decorative icon before the label. */
  icon?: IconRef | null;
  /** Decorative status dot before the label (not combined with `icon`). */
  dot?: boolean;
}

const TONES: readonly BadgeTone[] = ['neutral', 'info', 'success', 'warning', 'error'];
const VARIANTS: readonly BadgeVariant[] = ['subtle', 'outline'];
const SIZES: readonly BadgeSize[] = ['sm', 'md'];

export class Badge {
  readonly host: HTMLElement;
  #options: BadgeOptions;
  readonly #doc: Document;
  readonly #mark: HTMLSpanElement;
  readonly #label: HTMLSpanElement;
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). A `<span>` host keeps the badge inline. */
  static create(host: HTMLElement, options: BadgeOptions): Badge {
    return new Badge(host, options);
  }

  private constructor(host: HTMLElement, options: BadgeOptions) {
    Badge.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#mark = this.#doc.createElement('span');
    this.#mark.setAttribute('aria-hidden', 'true');
    this.#label = this.#doc.createElement('span');
    this.#label.className = 'aui-badge__label';
    // Render first: invalid options (including config) throw before anything is attached to the host.
    this.#render();
    host.classList.add('aui-badge');
    host.replaceChildren(this.#mark, this.#label);
    // Weakly held: safe in renderers that discard nodes without destroy() (table cells).
    this.#group.add(subscribeWhileHosted(host, this, (listener) => badgeConfig.subscribe(listener), (badge) => {
      badge.#render();
    }));
  }

  get options(): Readonly<BadgeOptions> {
    return this.#options;
  }

  get label(): string {
    return this.#options.label;
  }

  update(options: Partial<BadgeOptions>): void {
    const next = { ...this.#options, ...options };
    Badge.#assert(next);
    this.#options = next;
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-badge', ...TONES.map((t) => `aui-badge--${t}`), ...VARIANTS.map((v) => `aui-badge--${v}`), ...SIZES.map((s) => `aui-badge--${s}`));
  }

  static #assert(options: BadgeOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('BADGE_OPTIONS', 'Invalid badge options.', { component: 'badge', property: `badge.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string');
    if (options.tone !== undefined && !TONES.includes(options.tone)) fail('tone', '"neutral" | "info" | "success" | "warning" | "error"');
    if (options.dot !== undefined && typeof options.dot !== 'boolean') fail('dot', 'boolean');
    if (options.dot === true && options.icon != null) fail('dot', 'false when icon is set');
  }

  #render(): void {
    const o = this.#options;
    // Everything that can throw (config, icon resolution) runs before the host is touched.
    const { variant, size } = badgeConfig.resolve({ ...(o.variant === undefined ? {} : { variant: o.variant }), ...(o.size === undefined ? {} : { size: o.size }) });
    const icon = o.icon == null ? null : renderIcon(o.icon, { doc: this.#doc });
    const tone = o.tone ?? 'neutral';
    const host = this.host;
    for (const t of TONES) host.classList.toggle(`aui-badge--${t}`, t === tone);
    for (const v of VARIANTS) host.classList.toggle(`aui-badge--${v}`, v === variant);
    for (const s of SIZES) host.classList.toggle(`aui-badge--${s}`, s === size);
    this.#mark.className = icon ? 'aui-badge__icon' : 'aui-badge__dot';
    this.#mark.hidden = !icon && o.dot !== true;
    this.#mark.replaceChildren(...(icon ? [icon] : []));
    this.#label.textContent = o.label;
  }
}
