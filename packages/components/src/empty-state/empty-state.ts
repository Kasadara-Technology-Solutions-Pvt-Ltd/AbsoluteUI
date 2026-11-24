/**
 * Empty State (R20 P3). Explains why a table, list, search, or page has nothing to show and
 * offers the next step: an icon or illustration, a title (a real heading at a chosen level,
 * or plain text inside tables and lists), a description, and up to two actions rendered as
 * AbsoluteUI buttons (or links). With `live`, the empty state is a polite status, so a
 * search that matches nothing is announced.
 */
import { configurationError, defineComponentConfig, emit, releaseNode, validators, DisposableGroup } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { Button } from '../button/button.js';
import { isSafeHref } from '../internal/href.js';

export type EmptyStateSize = 'sm' | 'md' | 'lg';
export type EmptyStateHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface EmptyStateConfig {
  size: EmptyStateSize;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    emptyState: EmptyStateConfig;
  }
}

const SIZES: readonly EmptyStateSize[] = ['sm', 'md', 'lg'];
const LEVELS: readonly EmptyStateHeadingLevel[] = [1, 2, 3, 4, 5, 6];

export const emptyStateConfig = defineComponentConfig<EmptyStateConfig>('emptyState', {
  size: { default: 'md', expected: '"sm" | "md" | "lg"', validate: validators.oneOf(SIZES) },
});

export interface EmptyStateAction {
  label: string;
  icon?: IconRef;
  /** Render as a link to this http(s) or relative URL instead of a button. */
  href?: string;
}

export interface EmptyStateOptions extends Partial<EmptyStateConfig> {
  /** Short statement of the state, such as "No employees match your filters". */
  title: string;
  /** What to do next or why the area is empty. Rendered as text. */
  description?: string;
  /** Decorative icon above the title. */
  icon?: IconRef | null;
  /** Decorative illustration (an image or SVG Node) instead of the icon. */
  illustration?: Node | null;
  /** Heading level of the title, or null for plain text (inside tables and lists). Default 3. */
  headingLevel?: EmptyStateHeadingLevel | null;
  primaryAction?: EmptyStateAction | null;
  secondaryAction?: EmptyStateAction | null;
  /** Announce the empty state when it appears (role="status"). Default false. */
  live?: boolean;
}

/** `aui-action` detail: which action the user chose. */
export interface EmptyStateActionDetail {
  action: 'primary' | 'secondary';
}

export class EmptyState {
  readonly host: HTMLElement;
  #options: EmptyStateOptions;
  readonly #doc: Document;
  readonly #media: HTMLDivElement;
  #title: HTMLElement;
  readonly #description: HTMLParagraphElement;
  readonly #actions: HTMLDivElement;
  #buttons: Button<HTMLButtonElement | HTMLAnchorElement>[] = [];
  #builtActions: readonly (EmptyStateAction | null | undefined)[] = [];
  #actionGroup = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: EmptyStateOptions): EmptyState {
    return new EmptyState(host, options);
  }

  private constructor(host: HTMLElement, options: EmptyStateOptions) {
    EmptyState.#assert(options, host.ownerDocument.baseURI);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#doc;
    this.#media = doc.createElement('div');
    this.#media.className = 'aui-empty-state__media';
    this.#title = doc.createElement('p');
    this.#description = doc.createElement('p');
    this.#description.className = 'aui-empty-state__description';
    this.#actions = doc.createElement('div');
    this.#actions.className = 'aui-empty-state__actions';
    this.#render();
    host.classList.add('aui-empty-state');
    host.replaceChildren(this.#media, this.#title, this.#description, this.#actions);
  }

  get options(): Readonly<EmptyStateOptions> {
    return this.#options;
  }

  update(options: Partial<EmptyStateOptions>): void {
    const next = { ...this.#options, ...options };
    EmptyState.#assert(next, this.#doc.baseURI);
    const previous = this.#options;
    this.#options = next;
    try {
      this.#render();
    } catch (error) {
      this.#options = previous;
      this.#render();
      throw error;
    }
  }

  destroy(): void {
    this.#actionGroup.dispose();
    for (const b of this.#buttons) b.destroy();
    releaseNode(this.#media.firstChild);
    this.host.replaceChildren();
    this.host.removeAttribute('role');
    this.host.classList.remove('aui-empty-state', ...SIZES.map((s) => `aui-empty-state--${s}`));
  }

  static #assert(o: EmptyStateOptions, baseURI: string): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('EMPTY_STATE_OPTIONS', 'Invalid empty state options.', { component: 'empty-state', property: `emptyState.${property}`, expected });
    };
    const title: unknown = o.title;
    if (typeof title !== 'string' || title.trim() === '') fail('title', 'non-empty string');
    const description: unknown = o.description;
    if (description !== undefined && typeof description !== 'string') fail('description', 'string');
    const illustration: unknown = o.illustration;
    if (illustration != null && !(illustration instanceof Node)) fail('illustration', 'Node or null');
    if (o.headingLevel != null && !LEVELS.includes(o.headingLevel)) fail('headingLevel', '1 | 2 | 3 | 4 | 5 | 6 | null');
    for (const name of ['primaryAction', 'secondaryAction'] as const) {
      const a = o[name];
      if (a == null) continue;
      const label: unknown = a.label;
      if (typeof label !== 'string' || label.trim() === '') fail(`${name}.label`, 'non-empty string');
      const href: unknown = a.href;
      if (href !== undefined && (typeof href !== 'string' || !isSafeHref(href, baseURI))) fail(`${name}.href`, 'http(s) or relative URL');
    }
    const live: unknown = o.live;
    if (live !== undefined && typeof live !== 'boolean') fail('live', 'boolean');
  }

  #render(): void {
    const o = this.#options;
    // Everything that can throw (config, icons) runs before the DOM changes.
    const { size } = emptyStateConfig.resolve(o.size === undefined ? {} : { size: o.size });
    const media = o.illustration ?? (o.icon == null ? null : renderIcon(o.icon, { doc: this.#doc }));
    const host = this.host;
    for (const s of SIZES) host.classList.toggle(`aui-empty-state--${s}`, s === size);
    if (o.live === true) host.setAttribute('role', 'status');
    else host.removeAttribute('role');

    if (media) {
      // Decorative: the title and description carry the meaning.
      if (media instanceof Element && media !== o.illustration) media.setAttribute('aria-hidden', 'true');
      this.#media.setAttribute('aria-hidden', 'true');
      if (this.#media.firstChild !== media) this.#replaceMedia(media);
    } else this.#replaceMedia(null);
    this.#media.hidden = media === null;

    const level = o.headingLevel === undefined ? 3 : o.headingLevel;
    const tag = level === null ? 'p' : `h${String(level)}`;
    if (this.#title.localName !== tag) {
      const title = this.#doc.createElement(tag);
      this.#title.replaceWith(title);
      this.#title = title;
    }
    this.#title.className = 'aui-empty-state__title';
    this.#title.textContent = o.title;
    this.#description.textContent = o.description ?? '';
    this.#description.hidden = (o.description ?? '') === '';
    this.#renderActions();
  }

  /** Swap the media; a dropped illustration is released (render-slot contract). */
  #replaceMedia(media: Node | null): void {
    const old = this.#media.firstChild;
    if (media) this.#media.replaceChildren(media);
    else this.#media.replaceChildren();
    if (old !== media) releaseNode(old);
  }

  #renderActions(): void {
    const o = this.#options;
    const specs = [o.primaryAction, o.secondaryAction];
    if (specs[0] === this.#builtActions[0] && specs[1] === this.#builtActions[1]) return;
    this.#builtActions = specs;
    this.#actionGroup.dispose();
    this.#actionGroup = new DisposableGroup();
    for (const b of this.#buttons) b.destroy();
    const doc = this.#doc;
    const buttons: Button<HTMLButtonElement | HTMLAnchorElement>[] = [];
    for (const [i, spec] of specs.entries()) {
      if (spec == null) continue;
      const action: EmptyStateActionDetail['action'] = i === 0 ? 'primary' : 'secondary';
      const variant = i === 0 ? 'primary' : 'secondary';
      let el: HTMLButtonElement | HTMLAnchorElement;
      if (spec.href === undefined) {
        const b = doc.createElement('button');
        b.type = 'button';
        el = b;
      } else {
        const a = doc.createElement('a');
        a.href = spec.href;
        el = a;
      }
      el.textContent = spec.label;
      el.classList.add(`aui-empty-state__${action}`);
      this.#actionGroup.listen(el, 'click', () => {
        emit(this.host, 'aui-action', { action } satisfies EmptyStateActionDetail);
      });
      buttons.push(Button.enhance<HTMLButtonElement | HTMLAnchorElement>(el, { variant, ...(spec.icon === undefined ? {} : { icon: spec.icon }) }));
    }
    this.#buttons = buttons;
    this.#actions.replaceChildren(...buttons.map((b) => b.element));
    this.#actions.hidden = buttons.length === 0;
  }
}
