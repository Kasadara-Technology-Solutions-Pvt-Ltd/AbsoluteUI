/**
 * Card and Surface (SPEC section 18.2). `.aui-surface` is a bordered, token-colored
 * panel; `.aui-card` adds header, media, body, and footer sections. Both work as
 * CSS-only APIs. `Card.create` renders the structure with correct semantics: an
 * `<article>` named by its title when there is one, otherwise a plain `<div>`.
 * Interactive cards use the block-link pattern: the title is the only link, and
 * its `::after` pseudo-element stretches over the card, so the whole card is
 * clickable while there is exactly one tab stop and the announced name is just
 * the title.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, validators } from '@absoluteui/core';
import { AppliedStyles } from '../layout/applied.js';
import { isSafeHref } from '../typography/href.js';

export type CardHeadingLevel = 2 | 3 | 4 | 5 | 6;
export type SurfaceVariant = 'flat' | 'raised' | 'sunken';

export interface CardConfig {
  /** Heading level of the card title; match it to the surrounding document outline. */
  headingLevel: CardHeadingLevel;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    card: CardConfig;
  }
}

export const cardConfig = defineComponentConfig<CardConfig>('card', {
  headingLevel: { default: 3, expected: 'integer 2..6', validate: validators.oneOf([2, 3, 4, 5, 6] as const) },
});

export interface CardInteractive {
  /** http(s) URL or relative reference; other schemes are rejected. */
  href: string;
}

export interface CardOptions extends Partial<CardConfig> {
  /** Card heading; also the accessible name of the `<article>`. Required for interactive cards. */
  title?: string | undefined;
  /** Supporting line under the title (text only). */
  subtitle?: string | undefined;
  /** Body content; strings render as text. Omit to fill `card.body` yourself. */
  content?: Node | string | undefined;
  /** Footer content, typically actions or metadata. */
  footer?: Node | undefined;
  /** Image or illustration; shown above the header (the header stays first in source order). */
  media?: Node | undefined;
  /** Make the whole card a link to `href` (block-link pattern). */
  interactive?: CardInteractive | undefined;
  /** Surface treatment. Default `flat`. */
  variant?: SurfaceVariant | undefined;
}

export interface SurfaceOptions {
  variant?: SurfaceVariant;
  /** Inset padding (`space-inset`, density-aware). */
  padded?: boolean;
}

export interface SurfaceHandle {
  readonly element: HTMLElement;
  readonly options: Readonly<SurfaceOptions>;
  update(options: Partial<SurfaceOptions>): void;
  /** Remove the classes this helper added. */
  destroy(): void;
}

const HEADING_TAGS = { 2: 'h2', 3: 'h3', 4: 'h4', 5: 'h5', 6: 'h6' } as const satisfies Record<CardHeadingLevel, keyof HTMLElementTagNameMap>;
const VARIANTS: readonly SurfaceVariant[] = ['flat', 'raised', 'sunken'];
const VARIANT_CLASSES = ['aui-surface--raised', 'aui-surface--sunken'];
const variantClass = (variant: SurfaceVariant | undefined): string | null => (variant === undefined || variant === 'flat' ? null : `aui-surface--${variant}`);

function checkVariant(component: 'card' | 'surface', variant: unknown): void {
  if (variant !== undefined && !(VARIANTS as readonly unknown[]).includes(variant)) {
    throw configurationError(component === 'card' ? 'CARD_OPTIONS' : 'SURFACE_OPTIONS', `Invalid ${component} options.`, {
      component: 'card',
      property: `${component}.variant`,
      expected: '"flat" | "raised" | "sunken"',
    });
  }
}

const surfaced = new WeakSet<HTMLElement>();

export const Surface = Object.freeze({
  /** Apply surface classes to a consumer-owned element. */
  apply(el: HTMLElement, options: SurfaceOptions = {}): SurfaceHandle {
    const validate = (o: SurfaceOptions): void => {
      checkVariant('surface', o.variant);
      if (o.padded !== undefined && typeof o.padded !== 'boolean') {
        throw configurationError('SURFACE_OPTIONS', 'Invalid surface options.', { component: 'card', property: 'surface.padded', expected: 'boolean' });
      }
    };
    validate(options);
    if (surfaced.has(el)) {
      throw configurationError('SURFACE_ALREADY_APPLIED', 'Surface is already applied to this element.', {
        component: 'card',
        property: 'surface',
        remediation: 'Call destroy() on the existing handle, or update() it instead of applying again.',
      });
    }
    const styles = new AppliedStyles(el);
    let current: SurfaceOptions = { ...options };
    let destroyed = false;
    const render = (): void => {
      styles.setClass(['aui-surface'], 'aui-surface');
      styles.setClass(VARIANT_CLASSES, variantClass(current.variant));
      styles.setClass(['aui-surface--padded'], current.padded ? 'aui-surface--padded' : null);
    };
    render();
    surfaced.add(el);
    return {
      element: el,
      get options(): Readonly<SurfaceOptions> {
        return current;
      },
      update(next: Partial<SurfaceOptions>): void {
        const merged = { ...current, ...next };
        validate(merged);
        current = merged;
        render();
      },
      destroy(): void {
        if (destroyed) return;
        destroyed = true;
        styles.restore();
        surfaced.delete(el);
      },
    };
  },
});

export class Card {
  readonly host: HTMLElement;
  /** Consumer content area. */
  readonly body: HTMLDivElement;
  /** Footer area; hidden while empty. */
  readonly footer: HTMLDivElement;
  /** Media area; hidden while empty. */
  readonly media: HTMLDivElement;
  #element: HTMLElement;
  #options: CardOptions;
  #heading: HTMLHeadingElement | null = null;
  readonly #doc: Document;
  readonly #header: HTMLDivElement;
  readonly #subtitle: HTMLParagraphElement;
  readonly #titleId: string;
  readonly #group = new DisposableGroup();

  /** Render a card into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: CardOptions = {}): Card {
    return new Card(host, options);
  }

  private constructor(host: HTMLElement, options: CardOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#doc;
    this.#titleId = createId('aui-card-title');

    this.#header = doc.createElement('div');
    this.#header.className = 'aui-card__header';
    this.#subtitle = doc.createElement('p');
    this.#subtitle.className = 'aui-card__subtitle';
    this.media = doc.createElement('div');
    this.media.className = 'aui-card__media';
    this.body = doc.createElement('div');
    this.body.className = 'aui-card__body';
    this.footer = doc.createElement('div');
    this.footer.className = 'aui-card__footer';
    this.#element = this.#createRoot();
    this.#setAreas(options);

    // Render first: invalid options throw before the host is touched or the subscription exists.
    this.#render();
    host.replaceChildren(this.#element);
    this.#group.add(cardConfig.subscribe(() => {
      this.#render();
    }));
  }

  /** The card root: `<article>` when titled, otherwise `<div>`. Replaced when the title is added or removed. */
  get element(): HTMLElement {
    return this.#element;
  }

  get options(): Readonly<CardOptions> {
    return this.#options;
  }

  update(options: Partial<CardOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    this.#setAreas(options);
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.#element.remove();
  }

  #config(o: CardOptions): Readonly<CardConfig> {
    return cardConfig.resolve(o.headingLevel === undefined ? {} : { headingLevel: o.headingLevel });
  }

  #assertOptions(options: CardOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('CARD_OPTIONS', 'Invalid card options.', { component: 'card', property: `card.${property}`, expected });
    };
    if (options.title !== undefined && (typeof options.title !== 'string' || options.title.trim() === '')) fail('title', 'non-empty string');
    if (options.subtitle !== undefined && typeof options.subtitle !== 'string') fail('subtitle', 'string');
    if (options.content !== undefined && typeof options.content !== 'string' && !(options.content instanceof Node)) fail('content', 'Node | string');
    if (options.footer !== undefined && !(options.footer instanceof Node)) fail('footer', 'Node');
    if (options.media !== undefined && !(options.media instanceof Node)) fail('media', 'Node');
    checkVariant('card', options.variant);
    if (options.interactive !== undefined) {
      if (options.title === undefined) fail('interactive', 'a title (the title is the link text)');
      if (!isSafeHref(options.interactive.href)) fail('interactive.href', 'http(s) URL or relative reference (javascript:, data:, and other schemes are rejected)');
    }
    // Resolving validates headingLevel (CFG_INVALID_VALUE) before anything renders.
    this.#config(options);
  }

  #createRoot(): HTMLElement {
    const root = this.#doc.createElement(this.#options.title === undefined ? 'div' : 'article');
    root.append(this.#header, this.media, this.body, this.footer);
    return root;
  }

  /** Content areas are replaced only when their option is passed, so consumer-filled areas survive updates. */
  #setAreas(options: Partial<CardOptions>): void {
    if ('content' in options) {
      if (typeof options.content === 'string') this.body.textContent = options.content;
      else this.body.replaceChildren(...(options.content ? [options.content] : []));
    }
    if ('footer' in options) this.footer.replaceChildren(...(options.footer ? [options.footer] : []));
    if ('media' in options) this.media.replaceChildren(...(options.media ? [options.media] : []));
  }

  #render(): void {
    const o = this.#options;
    const level = this.#config(o).headingLevel;
    const wantTag = o.title === undefined ? 'DIV' : 'ARTICLE';
    if (this.#element.tagName !== wantTag) {
      const previous = this.#element;
      this.#element = this.#createRoot();
      previous.replaceWith(this.#element);
    }
    const root = this.#element;
    root.classList.add('aui-surface', 'aui-card');
    root.classList.remove(...VARIANT_CLASSES);
    const variant = variantClass(o.variant);
    if (variant) root.classList.add(variant);
    root.classList.toggle('aui-card--interactive', o.interactive !== undefined);

    if (o.title === undefined) {
      this.#heading?.remove();
      this.#heading = null;
      root.removeAttribute('aria-labelledby');
    } else {
      let heading = this.#heading;
      if (heading?.tagName !== HEADING_TAGS[level].toUpperCase()) {
        const next = this.#doc.createElement(HEADING_TAGS[level]);
        next.className = 'aui-card__title';
        next.id = this.#titleId;
        if (heading) heading.replaceWith(next);
        else this.#header.prepend(next);
        heading = next;
        this.#heading = next;
      }
      if (o.interactive) {
        const link = this.#doc.createElement('a');
        link.className = 'aui-card__link';
        link.href = o.interactive.href;
        link.textContent = o.title;
        heading.replaceChildren(link);
      } else {
        heading.textContent = o.title;
      }
      root.setAttribute('aria-labelledby', this.#titleId);
    }

    this.#subtitle.textContent = o.subtitle ?? '';
    if (o.subtitle) this.#header.append(this.#subtitle);
    else this.#subtitle.remove();
    this.#header.hidden = o.title === undefined && !o.subtitle;
  }
}
