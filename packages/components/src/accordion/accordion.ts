/**
 * Accordion (SPEC section 18, WAI-ARIA APG Accordion pattern). Each item is a native
 * heading containing a native <button> (aria-expanded, aria-controls) that
 * shows or hides its panel. Tab, Enter, and Space stay native; ArrowDown,
 * ArrowUp, Home, and End move focus between headers (APG optional keys).
 * Panels are labelled regions only when there are six items or fewer, to avoid
 * landmark proliferation (APG guidance).
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { focusElement, getNextIndex } from '@absoluteui/utilities';

export type AccordionHeadingLevel = 2 | 3 | 4 | 5 | 6;

export interface AccordionConfig {
  /** Allow several panels open at once. When false, expanding one collapses the others. */
  multiple: boolean;
  /** Single mode: the open panel can be collapsed, leaving none open. */
  collapsible: boolean;
  headingLevel: AccordionHeadingLevel;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    accordion: AccordionConfig;
  }
}

export const accordionConfig = defineComponentConfig<AccordionConfig>('accordion', {
  multiple: { default: false, expected: 'boolean', validate: validators.isBoolean },
  collapsible: { default: true, expected: 'boolean', validate: validators.isBoolean },
  headingLevel: { default: 3, expected: '2 | 3 | 4 | 5 | 6', validate: validators.oneOf([2, 3, 4, 5, 6] as const) },
});

export interface AccordionIcons {
  /** Indicator icon; rotated while the item is expanded. */
  expand: IconRef;
}

export interface AccordionItem {
  /** Unique, stable id; used in `value` and events. */
  id: string;
  /** Header text (rendered with textContent). */
  title: string;
  /** Panel content. Strings are rendered as text, never parsed as HTML. */
  content: Node | string;
  /** The header stays focusable (aria-disabled) but cannot be toggled by the user. */
  disabled?: boolean;
}

export interface AccordionOptions extends Partial<AccordionConfig> {
  items: readonly AccordionItem[];
  /** Expanded item ids. */
  value?: readonly string[];
  icons?: Partial<AccordionIcons>;
}

export interface AccordionChangeDetail {
  /** Expanded ids after the change, in item order. */
  value: string[];
  /** The item the user toggled. */
  id: string;
  expanded: boolean;
}

/** Above this many items panels get no region role (APG: avoid landmark proliferation). */
const MAX_REGIONS = 6;

interface ItemParts {
  item: AccordionItem;
  root: HTMLDivElement;
  trigger: HTMLButtonElement;
  panel: HTMLDivElement;
  content: HTMLDivElement;
}

export class Accordion {
  readonly host: HTMLElement;
  #options: AccordionOptions;
  #expanded = new Set<string>();
  #parts: ItemParts[] = [];
  #builtLevel: AccordionHeadingLevel | null = null;
  #builtItems: readonly AccordionItem[] | null = null;
  #builtIcon: IconRef | null = null;
  readonly #doc: Document;
  readonly #group = new DisposableGroup();

  /** Render an accordion into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: AccordionOptions): Accordion {
    return new Accordion(host, options);
  }

  private constructor(host: HTMLElement, options: AccordionOptions) {
    this.#options = { ...options };
    // Validate before touching the host: a failed construction leaves nothing behind.
    this.#assertOptions(this.#options, this.#config());
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#expanded = new Set(options.value ?? []);
    host.classList.add('aui-accordion');
    this.#render();

    this.#group.listen(host, 'click', (event) => {
      const parts = this.#partsFor(event.target);
      if (parts) this.#userToggle(parts);
    });
    this.#group.listen(host, 'keydown', (event) => {
      this.#onKeydown(event);
    });
    this.#group.add(accordionConfig.subscribe(() => {
      this.#render();
    }));
  }

  /** Expanded item ids, in item order. */
  get value(): string[] {
    return this.#options.items.filter((i) => this.#expanded.has(i.id)).map((i) => i.id);
  }

  get options(): Readonly<AccordionOptions> {
    return this.#options;
  }

  /** The content container of an item's panel, or null for an unknown id. */
  panel(id: string): HTMLDivElement | null {
    return this.#parts.find((p) => p.item.id === id)?.content ?? null;
  }

  /** Expand an item programmatically (no events). In single mode the others collapse. */
  expand(id: string): void {
    this.#setExpanded(this.#requireId(id), true);
    this.#sync();
  }

  /** Collapse an item programmatically (no events). Allowed even when not collapsible. */
  collapse(id: string): void {
    this.#setExpanded(this.#requireId(id), false);
    this.#sync();
  }

  toggle(id: string): void {
    if (this.#expanded.has(this.#requireId(id))) this.collapse(id);
    else this.expand(id);
  }

  update(options: Partial<AccordionOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next, this.#config(next));
    this.#options = next;
    if ('value' in options) this.#expanded = new Set(options.value ?? []);
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-accordion', 'aui-accordion--animated');
    this.#parts = [];
  }

  #config(o: AccordionOptions = this.#options): Readonly<AccordionConfig> {
    return accordionConfig.resolve({
      ...(o.multiple === undefined ? {} : { multiple: o.multiple }),
      ...(o.collapsible === undefined ? {} : { collapsible: o.collapsible }),
      ...(o.headingLevel === undefined ? {} : { headingLevel: o.headingLevel }),
    });
  }

  #assertOptions(options: AccordionOptions, config: Readonly<AccordionConfig>): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('ACCORDION_OPTIONS', 'Invalid accordion options.', { component: 'accordion', property: `accordion.${property}`, expected });
    };
    if (!Array.isArray(options.items)) fail('items', 'array of { id, title, content }');
    const ids = new Set<string>();
    for (const item of options.items) {
      if (typeof item.id !== 'string' || item.id === '') fail('items.id', 'non-empty string');
      if (ids.has(item.id)) fail('items.id', `unique ids (duplicate "${item.id}")`);
      ids.add(item.id);
      if (typeof item.title !== 'string' || item.title.trim() === '') fail('items.title', 'non-empty string (accessible name)');
    }
    const value = options.value ?? [];
    for (const id of value) if (!ids.has(id)) fail('value', `ids of existing items (unknown "${id}")`);
    if (!config.multiple && value.length > 1) fail('value', 'at most one id when multiple is false');
  }

  #requireId(id: string): string {
    if (!this.#options.items.some((i) => i.id === id)) {
      throw configurationError('ACCORDION_ITEM', `Unknown accordion item "${id}".`, { component: 'accordion', property: 'accordion.items.id', expected: 'id of an existing item' });
    }
    return id;
  }

  #setExpanded(id: string, expanded: boolean): void {
    // Enables the expand transition from now on (CSS @starting-style).
    this.host.classList.add('aui-accordion--animated');
    if (!expanded) {
      this.#expanded.delete(id);
      return;
    }
    if (!this.#config().multiple) this.#expanded.clear();
    this.#expanded.add(id);
  }

  #partsFor(target: EventTarget | null): ItemParts | undefined {
    if (!(target instanceof Element)) return undefined;
    const trigger = target.closest('button');
    return this.#parts.find((p) => p.trigger === trigger);
  }

  #userToggle(parts: ItemParts): void {
    if (parts.trigger.getAttribute('aria-disabled') === 'true') return;
    const { id } = parts.item;
    const expanded = !this.#expanded.has(id);
    this.#setExpanded(id, expanded);
    this.#sync();
    emit(this.host, 'aui-change', { value: this.value, id, expanded } satisfies AccordionChangeDetail);
  }

  #onKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const current = this.#parts.findIndex((p) => p.trigger === event.target);
    // PageUp/PageDown are not part of the APG accordion key set.
    if (current < 0 || event.key === 'PageDown' || event.key === 'PageUp') return;
    const next = getNextIndex(event.key, current, this.#parts.length, { orientation: 'vertical', loop: true });
    if (next === null) return;
    event.preventDefault();
    focusElement(this.#parts[next]?.trigger ?? null);
  }

  #render(): void {
    const config = this.#config();
    // Global config may switch to single mode: keep only the first expanded item.
    if (!config.multiple && this.#expanded.size > 1) {
      const first = this.value[0];
      this.#expanded = new Set(first === undefined ? [] : [first]);
    }
    const icon = this.#options.icons?.expand ?? 'chevron-down';
    if (this.#builtItems !== this.#options.items || this.#builtLevel !== config.headingLevel || this.#builtIcon !== icon) {
      this.#build(config.headingLevel, icon);
    }
    this.#sync();
  }

  /** (Re)create the item DOM. Keeps focus on the same header when it still exists. */
  #build(level: AccordionHeadingLevel, icon: IconRef): void {
    const doc = this.#doc;
    const focusedId = this.#parts.find((p) => p.trigger === doc.activeElement)?.item.id;
    this.#parts = this.#options.items.map((item) => {
      const root = doc.createElement('div');
      root.className = 'aui-accordion__item';
      const heading = doc.createElement(`h${level}`);
      heading.className = 'aui-accordion__heading';
      const trigger = doc.createElement('button');
      trigger.type = 'button';
      trigger.className = 'aui-accordion__trigger';
      trigger.id = createId('aui-accordion-trigger');
      const title = doc.createElement('span');
      title.className = 'aui-accordion__title';
      title.textContent = item.title;
      trigger.append(title, renderIcon(icon, { className: 'aui-accordion__icon', doc }));
      heading.append(trigger);

      const panel = doc.createElement('div');
      panel.className = 'aui-accordion__panel';
      panel.id = createId('aui-accordion-panel');
      panel.setAttribute('aria-labelledby', trigger.id);
      trigger.setAttribute('aria-controls', panel.id);
      // Grid wrapper animates 0fr -> 1fr; the inner element clips while collapsing.
      const clip = doc.createElement('div');
      clip.className = 'aui-accordion__clip';
      const content = doc.createElement('div');
      content.className = 'aui-accordion__content';
      content.append(typeof item.content === 'string' ? doc.createTextNode(item.content) : item.content);
      clip.append(content);
      panel.append(clip);
      root.append(heading, panel);
      return { item, root, trigger, panel, content };
    });
    this.host.replaceChildren(...this.#parts.map((p) => p.root));
    this.#builtItems = this.#options.items;
    this.#builtLevel = level;
    this.#builtIcon = icon;
    if (focusedId !== undefined) focusElement(this.#parts.find((p) => p.item.id === focusedId)?.trigger ?? null);
  }

  /** Apply expanded/disabled state to the existing DOM. */
  #sync(): void {
    const config = this.#config();
    const regions = this.#parts.length <= MAX_REGIONS;
    for (const { item, root, trigger, panel } of this.#parts) {
      const expanded = this.#expanded.has(item.id);
      // Single, non-collapsible mode: the open header cannot close itself (APG).
      const locked = expanded && !config.multiple && !config.collapsible;
      const disabled = (item.disabled ?? false) || locked;
      trigger.setAttribute('aria-expanded', String(expanded));
      if (disabled) trigger.setAttribute('aria-disabled', 'true');
      else trigger.removeAttribute('aria-disabled');
      root.classList.toggle('aui-accordion__item--expanded', expanded);
      root.classList.toggle('aui-accordion__item--disabled', item.disabled ?? false);
      panel.hidden = !expanded;
      if (regions) panel.setAttribute('role', 'region');
      else panel.removeAttribute('role');
    }
  }
}
