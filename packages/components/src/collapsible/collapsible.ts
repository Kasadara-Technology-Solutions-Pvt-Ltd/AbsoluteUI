/**
 * Collapsible (R13-8). A single disclosure: a native <button> (aria-expanded,
 * aria-controls), optionally inside a heading, that shows and hides one content
 * region, such as "Show more details" or an advanced-settings section. Accordion is
 * for several related sections; this component is for one.
 */
import { configurationError, createId, defineComponentConfig, emit, validators, DisposableGroup } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';

export type CollapsibleVariant = 'plain' | 'bordered';
export type CollapsibleHeadingLevel = 2 | 3 | 4 | 5 | 6;

export interface CollapsibleConfig {
  variant: CollapsibleVariant;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    collapsible: CollapsibleConfig;
  }
}

export const collapsibleConfig = defineComponentConfig<CollapsibleConfig>('collapsible', {
  variant: { default: 'plain', expected: '"plain" | "bordered"', validate: validators.oneOf(['plain', 'bordered'] as const) },
});

export interface CollapsibleIcons {
  expand: IconRef;
}

export interface CollapsibleOptions extends Partial<CollapsibleConfig> {
  /** Trigger text (never parsed as HTML). */
  label: string;
  /** Region content. Strings are rendered as text, never parsed as HTML. */
  content: Node | string;
  /** Initial state on create; with update(), sets the state. Default false. */
  open?: boolean;
  disabled?: boolean;
  /** Wrap the trigger in a heading of this level (for sections in a document outline). */
  headingLevel?: CollapsibleHeadingLevel | null;
  icons?: Partial<CollapsibleIcons>;
}

/** `aui-change` detail: the state after a user toggle. */
export interface CollapsibleChangeDetail {
  open: boolean;
}

const LEVELS: readonly CollapsibleHeadingLevel[] = [2, 3, 4, 5, 6];
const VARIANTS: readonly CollapsibleVariant[] = ['plain', 'bordered'];

export class Collapsible {
  readonly host: HTMLElement;
  #options: CollapsibleOptions;
  readonly #doc: Document;
  readonly #trigger: HTMLButtonElement;
  readonly #label: HTMLSpanElement;
  readonly #panel: HTMLDivElement;
  readonly #content: HTMLDivElement;
  #heading: HTMLElement | null = null;
  #icon: Element | null = null;
  #iconRef: IconRef | null = null;
  #open: boolean;
  #builtContent: Node | string | null = null;
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: CollapsibleOptions): Collapsible {
    return new Collapsible(host, options);
  }

  private constructor(host: HTMLElement, options: CollapsibleOptions) {
    Collapsible.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#open = options.open ?? false;
    const doc = this.#doc;
    this.#trigger = doc.createElement('button');
    this.#trigger.type = 'button';
    this.#trigger.className = 'aui-collapsible__trigger';
    this.#trigger.id = createId('aui-collapsible-trigger');
    this.#label = doc.createElement('span');
    this.#label.className = 'aui-collapsible__label';
    this.#panel = doc.createElement('div');
    this.#panel.className = 'aui-collapsible__panel';
    this.#panel.id = createId('aui-collapsible-panel');
    this.#trigger.setAttribute('aria-controls', this.#panel.id);
    // Grid wrapper animates 0fr -> 1fr; the inner element clips while collapsing.
    const clip = doc.createElement('div');
    clip.className = 'aui-collapsible__clip';
    this.#content = doc.createElement('div');
    this.#content.className = 'aui-collapsible__content';
    clip.append(this.#content);
    this.#panel.append(clip);
    // Render first: invalid options (including config and icons) throw before the host is touched.
    this.#render();
    host.classList.add('aui-collapsible');
    host.replaceChildren(this.#heading ?? this.#trigger, this.#panel);
    this.#group.listen(this.#trigger, 'click', () => {
      if (this.#options.disabled === true) return;
      this.host.classList.add('aui-collapsible--animated');
      this.#set(!this.#open, true);
    });
    this.#group.add(collapsibleConfig.subscribe(() => {
      this.#render();
    }));
  }

  get options(): Readonly<CollapsibleOptions> {
    return this.#options;
  }

  get open(): boolean {
    return this.#open;
  }

  /** The trigger button (for focus management). */
  get trigger(): HTMLButtonElement {
    return this.#trigger;
  }

  /** The content container. */
  get content(): HTMLDivElement {
    return this.#content;
  }

  /** Show the content (no event: programmatic changes do not emit). */
  show(): void {
    this.#set(true, false);
  }

  hide(): void {
    this.#set(false, false);
  }

  toggle(): void {
    this.#set(!this.#open, false);
  }

  update(options: Partial<CollapsibleOptions>): void {
    const next = { ...this.#options, ...options };
    Collapsible.#assert(next);
    const previous = this.#options;
    this.#options = next;
    try {
      this.#render();
    } catch (error) {
      this.#options = previous;
      this.#render();
      throw error;
    }
    if (options.open !== undefined) this.#set(options.open, false);
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-collapsible', 'aui-collapsible--open', 'aui-collapsible--disabled', 'aui-collapsible--animated', ...VARIANTS.map((v) => `aui-collapsible--${v}`));
  }

  static #assert(options: CollapsibleOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('COLLAPSIBLE_OPTIONS', 'Invalid collapsible options.', { component: 'collapsible', property: `collapsible.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string');
    const content: unknown = options.content;
    if (typeof content !== 'string' && !(content instanceof Node)) fail('content', 'Node | string');
    for (const flag of ['open', 'disabled'] as const) {
      if (options[flag] !== undefined && typeof options[flag] !== 'boolean') fail(flag, 'boolean');
    }
    if (options.headingLevel != null && !LEVELS.includes(options.headingLevel)) fail('headingLevel', '2 | 3 | 4 | 5 | 6 | null');
  }

  #set(open: boolean, user: boolean): void {
    if (open === this.#open) return;
    this.#open = open;
    this.#sync();
    if (user) emit(this.host, 'aui-change', { open } satisfies CollapsibleChangeDetail);
  }

  #render(): void {
    const o = this.#options;
    // Everything that can throw (config, icon resolution) runs before the DOM is changed.
    const { variant } = collapsibleConfig.resolve(o.variant === undefined ? {} : { variant: o.variant });
    const iconRef = o.icons?.expand ?? 'chevron-down';
    const icon = iconRef === this.#iconRef && this.#icon ? this.#icon : renderIcon(iconRef, { className: 'aui-collapsible__icon', doc: this.#doc });

    for (const v of VARIANTS) this.host.classList.toggle(`aui-collapsible--${v}`, v === variant);
    this.#label.textContent = o.label;
    if (icon !== this.#icon) {
      this.#icon = icon;
      this.#iconRef = iconRef;
    }
    this.#trigger.replaceChildren(this.#label, icon);
    const level = o.headingLevel ?? null;
    const tag = level === null ? null : `h${String(level)}`;
    if (tag !== (this.#heading?.localName ?? null)) {
      const previous = this.#heading ?? this.#trigger;
      if (tag === null) this.#heading = null;
      else {
        this.#heading = this.#doc.createElement(tag);
        this.#heading.className = 'aui-collapsible__heading';
      }
      this.#heading?.append(this.#trigger);
      if (previous.parentNode === this.host) this.host.replaceChild(this.#heading ?? this.#trigger, previous);
    }
    if (this.#builtContent !== o.content) {
      this.#content.replaceChildren(typeof o.content === 'string' ? this.#doc.createTextNode(o.content) : o.content);
      this.#builtContent = o.content;
    }
    this.#sync();
  }

  #sync(): void {
    const disabled = this.#options.disabled ?? false;
    this.#trigger.setAttribute('aria-expanded', String(this.#open));
    // aria-disabled keeps the trigger focusable and discoverable (APG disclosure).
    if (disabled) this.#trigger.setAttribute('aria-disabled', 'true');
    else this.#trigger.removeAttribute('aria-disabled');
    this.#panel.hidden = !this.#open;
    this.host.classList.toggle('aui-collapsible--open', this.#open);
    this.host.classList.toggle('aui-collapsible--disabled', disabled);
  }
}
