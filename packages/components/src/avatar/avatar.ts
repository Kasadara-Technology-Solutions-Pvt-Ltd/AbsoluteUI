/**
 * Avatar (R13-9). A person's or entity's picture with fallbacks: the image, then
 * initials from the name, then an optional icon. The host is one image to assistive
 * technology (role=img) named after the person, including the status when one is
 * shown; set `decorative` when the name is already visible next to it. The component
 * never fetches anything itself: only the image element loads `src`.
 */
import { configurationError, defineComponentConfig, getMessage, registerMessages, validators, DisposableGroup } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { subscribeWhileHosted } from '../internal/weak.js';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarShape = 'circle' | 'square';
export type AvatarStatus = 'online' | 'away' | 'busy' | 'offline';

export interface AvatarConfig {
  size: AvatarSize;
  shape: AvatarShape;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    avatar: AvatarConfig & { locale: string };
  }
}

export const avatarConfig = defineComponentConfig<AvatarConfig, 'locale'>(
  'avatar',
  {
    size: { default: 'md', expected: '"xs" | "sm" | "md" | "lg" | "xl"', validate: validators.oneOf(['xs', 'sm', 'md', 'lg', 'xl'] as const) },
    shape: { default: 'circle', expected: '"circle" | "square"', validate: validators.oneOf(['circle', 'square'] as const) },
  },
  ['locale'],
);

registerMessages('avatar', 'en', {
  withStatus: '{name}, {status}',
  online: 'Online',
  away: 'Away',
  busy: 'Busy',
  offline: 'Offline',
});

export interface AvatarOptions extends Partial<AvatarConfig> {
  /** Person or entity name: the accessible name and the source of the initials. */
  name: string;
  /** Image URL: http(s), relative, blob:, or a data: URL of a PNG, JPEG, GIF, WebP, or AVIF image. */
  src?: string | null;
  /** Icon shown when the name yields no initials (for example a team or a bot). */
  icon?: IconRef | null;
  /** Presence dot; its name is part of the accessible name. */
  status?: AvatarStatus | null;
  /** Hide from assistive technology (the name is already shown next to the avatar). */
  decorative?: boolean;
  locale?: string;
}

const SIZES: readonly AvatarSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];
const SHAPES: readonly AvatarShape[] = ['circle', 'square'];
const STATUSES: readonly AvatarStatus[] = ['online', 'away', 'busy', 'offline'];
const MAX_SRC = 8192;
const DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i;

/** Image sources the avatar loads. Script-capable schemes and SVG data URLs are rejected. */
export function isSafeImageSrc(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > MAX_SRC * 64) return false;
  if (/^\s*data:/i.test(value)) return DATA_IMAGE.test(value.trim());
  if (value.length > MAX_SRC) return false;
  let url: URL;
  try {
    url = new URL(value, 'https://absoluteui.invalid/');
  } catch {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'blob:';
}

/** Up to two initials: the first letter of the first and the last word (letters and digits only). */
export function avatarInitials(name: string, locale?: string): string {
  const words = name.split(/[\s\-_.,@]+/u).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const first = (w: string | undefined): string => (w === undefined ? '' : (Array.from(w).find((c) => /[\p{L}\p{N}]/u.test(c)) ?? ''));
  const picked = words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0]);
  return picked.toLocaleUpperCase(locale);
}

export class Avatar {
  readonly host: HTMLElement;
  #options: AvatarOptions;
  readonly #doc: Document;
  readonly #visual: HTMLSpanElement;
  readonly #status: HTMLSpanElement;
  #img: HTMLImageElement | null = null;
  /** The src whose image failed to load; it is not retried until src changes. */
  #failedSrc: string | null = null;
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). A `<span>` host keeps it inline. */
  static create(host: HTMLElement, options: AvatarOptions): Avatar {
    return new Avatar(host, options);
  }

  private constructor(host: HTMLElement, options: AvatarOptions) {
    Avatar.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#visual = this.#doc.createElement('span');
    this.#visual.className = 'aui-avatar__visual';
    this.#visual.setAttribute('aria-hidden', 'true');
    this.#status = this.#doc.createElement('span');
    this.#status.className = 'aui-avatar__status';
    this.#status.setAttribute('aria-hidden', 'true');
    // Render first: invalid options (including config) throw before anything is attached to the host.
    this.#render();
    host.classList.add('aui-avatar');
    host.replaceChildren(this.#visual, this.#status);
    // Weakly held: safe in renderers that discard nodes without destroy() (table cells).
    this.#group.add(subscribeWhileHosted(host, this, (listener) => avatarConfig.subscribe(listener), (avatar) => {
      avatar.#render();
    }));
  }

  get options(): Readonly<AvatarOptions> {
    return this.#options;
  }

  get name(): string {
    return this.#options.name;
  }

  /** What is shown: the image, the initials, or the icon. */
  get shows(): 'image' | 'initials' | 'icon' {
    return this.host.classList.contains('aui-avatar--image') ? 'image' : this.host.classList.contains('aui-avatar--icon') ? 'icon' : 'initials';
  }

  update(options: Partial<AvatarOptions>): void {
    const next = { ...this.#options, ...options };
    Avatar.#assert(next);
    if (next.src !== this.#options.src) this.#failedSrc = null;
    this.#options = next;
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    for (const attribute of ['role', 'aria-label', 'aria-hidden']) this.host.removeAttribute(attribute);
    this.host.classList.remove('aui-avatar', 'aui-avatar--image', 'aui-avatar--initials', 'aui-avatar--icon', ...SIZES.map((s) => `aui-avatar--${s}`), ...SHAPES.map((s) => `aui-avatar--${s}`), ...STATUSES.map((s) => `aui-avatar--status-${s}`));
  }

  static #assert(options: AvatarOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('AVATAR_OPTIONS', 'Invalid avatar options.', { component: 'avatar', property: `avatar.${property}`, expected });
    };
    const name: unknown = options.name;
    if (typeof name !== 'string' || name.trim() === '') fail('name', 'non-empty string');
    if (options.src != null && !isSafeImageSrc(options.src)) fail('src', 'http(s), relative, blob:, or data:image/(png|jpeg|gif|webp|avif);base64 URL');
    if (options.status != null && !STATUSES.includes(options.status)) fail('status', '"online" | "away" | "busy" | "offline" | null');
    if (options.decorative !== undefined && typeof options.decorative !== 'boolean') fail('decorative', 'boolean');
  }

  #render(): void {
    const o = this.#options;
    // Everything that can throw (config, icon resolution, messages) runs before the host is touched.
    const { size, shape, locale } = avatarConfig.resolve({
      ...(o.size === undefined ? {} : { size: o.size }),
      ...(o.shape === undefined ? {} : { shape: o.shape }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
    const initials = avatarInitials(o.name, locale);
    const icon = initials === '' && o.icon != null ? renderIcon(o.icon, { doc: this.#doc }) : null;
    const status = o.status ?? null;
    const label = status === null ? o.name : getMessage('avatar', 'withStatus', { name: o.name, status: getMessage('avatar', status, {}, locale) }, locale);
    const src = o.src ?? null;
    const image = src !== null && src !== this.#failedSrc;
    const shows = image ? 'image' : icon ? 'icon' : 'initials';

    const host = this.host;
    for (const s of SIZES) host.classList.toggle(`aui-avatar--${s}`, s === size);
    for (const s of SHAPES) host.classList.toggle(`aui-avatar--${s}`, s === shape);
    for (const s of STATUSES) host.classList.toggle(`aui-avatar--status-${s}`, s === status);
    for (const k of ['image', 'initials', 'icon']) host.classList.toggle(`aui-avatar--${k}`, k === shows);
    if (o.decorative === true) {
      host.removeAttribute('role');
      host.removeAttribute('aria-label');
      host.setAttribute('aria-hidden', 'true');
    } else {
      host.removeAttribute('aria-hidden');
      host.setAttribute('role', 'img');
      host.setAttribute('aria-label', label);
    }
    this.#status.hidden = status === null;

    if (image) {
      const img = this.#image();
      if (img.getAttribute('src') !== src) img.src = src;
      this.#visual.replaceChildren(img);
    } else if (icon) {
      this.#visual.replaceChildren(icon);
    } else {
      // Initials, or the first character when the name has no letters or digits.
      this.#visual.textContent = initials === '' ? (Array.from(o.name.trim())[0] ?? '') : initials;
    }
  }

  #image(): HTMLImageElement {
    if (this.#img) return this.#img;
    const img = this.#doc.createElement('img');
    img.className = 'aui-avatar__image';
    // The host carries the name; the image itself is decorative.
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    this.#group.listen(img, 'error', () => {
      // Fall back to initials (or the icon) and do not retry the same URL.
      this.#failedSrc = img.getAttribute('src');
      this.#render();
    });
    this.#img = img;
    return img;
  }
}
