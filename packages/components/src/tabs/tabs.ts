/**
 * Tabs (SPEC section 18.12, WAI-ARIA APG Tabs pattern). A tablist of native buttons
 * with a roving tabindex and one tabpanel per tab. Automatic activation selects
 * on focus; manual activation waits for Enter/Space. Arrow keys follow the
 * orientation (mirrored in RTL); disabled tabs are skipped. A horizontally
 * overflowing tablist scrolls and keeps the selected tab in view.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, validators, type Direction } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { getNextIndex, observeMutations } from '@absoluteui/utilities';

export type TabsActivation = 'automatic' | 'manual';
export type TabsOrientation = 'horizontal' | 'vertical';

export interface TabsConfig {
  activation: TabsActivation;
  orientation: TabsOrientation;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    tabs: TabsConfig & { direction: Direction };
  }
}

export const tabsConfig = defineComponentConfig<TabsConfig, 'direction'>(
  'tabs',
  {
    activation: { default: 'automatic', expected: '"automatic" | "manual"', validate: validators.oneOf(['automatic', 'manual'] as const) },
    orientation: { default: 'horizontal', expected: '"horizontal" | "vertical"', validate: validators.oneOf(['horizontal', 'vertical'] as const) },
  },
  ['direction'],
);

export interface TabItem {
  /** Stable, unique consumer id (not used as a DOM id). */
  id: string;
  label: string;
  /** Decorative icon before the label. */
  icon?: IconRef;
  disabled?: boolean;
  /** Panel content. Strings are rendered as text, never parsed as HTML (section 14.5). */
  content?: Node | string;
}

export interface TabsOptions extends Partial<TabsConfig> {
  /** Accessible name of the tablist (required). */
  label: string;
  tabs: readonly TabItem[];
  /** Selected tab id. Default: the first enabled tab. */
  value?: string;
  direction?: Direction;
}

export interface TabsChangeDetail {
  value: string;
  previous: string;
}

interface TabParts {
  tab: HTMLButtonElement;
  panel: HTMLDivElement;
  /** Last `content` applied, so re-renders keep consumer-filled panels intact. */
  content: Node | string | undefined;
}

// Candidates for "the panel already contains a tab stop" (APG: panels without one get tabindex=0).
const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, audio[controls], video[controls], summary, [contenteditable=""], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** Not a type guard on purpose: narrowing a typed readonly array through Array.isArray yields any[]. */
function isNonEmptyList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/** Replace children only when they differ, so re-renders never move (and blur) a focused tab. */
function setChildren(parent: HTMLElement, children: readonly HTMLElement[]): void {
  const current = parent.children;
  if (current.length === children.length && children.every((child, i) => current[i] === child)) return;
  parent.replaceChildren(...children);
}

export class Tabs {
  readonly host: HTMLElement;
  readonly tablist: HTMLDivElement;
  #options: TabsOptions;
  #value: string;
  readonly #doc: Document;
  readonly #panels: HTMLDivElement;
  readonly #parts = new Map<string, TabParts>();
  readonly #group = new DisposableGroup();

  /** Render tabs into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: TabsOptions): Tabs {
    return new Tabs(host, options);
  }

  private constructor(host: HTMLElement, options: TabsOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#value = this.#resolveValue(options.value, options.tabs);

    this.tablist = this.#doc.createElement('div');
    this.tablist.className = 'aui-tabs__list';
    this.tablist.setAttribute('role', 'tablist');
    this.#panels = this.#doc.createElement('div');
    this.#panels.className = 'aui-tabs__panels';

    host.classList.add('aui-tabs');
    host.replaceChildren(this.tablist, this.#panels);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#bindEvents();
    this.#group.add(observeMutations(this.#panels, () => {
      this.#syncPanelTabStops();
    }));
    this.#group.add(tabsConfig.subscribe(() => {
      this.#render();
    }));
  }

  /** Selected tab id. */
  get value(): string {
    return this.#value;
  }

  get options(): Readonly<TabsOptions> {
    return this.#options;
  }

  /** The panel element for a tab id, for consumers to fill; `null` for unknown ids. */
  panel(id: string): HTMLDivElement | null {
    return this.#parts.get(id)?.panel ?? null;
  }

  /** Select a tab programmatically (no events). */
  select(id: string): void {
    if (!this.#parts.has(id)) this.#fail('value', 'id of an existing tab');
    this.#value = id;
    this.#render();
  }

  update(options: Partial<TabsOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    if ('value' in options) this.#value = this.#resolveValue(next.value, next.tabs);
    else if (!next.tabs.some((t) => t.id === this.#value)) this.#value = this.#resolveValue(undefined, next.tabs);
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.#parts.clear();
    this.host.replaceChildren();
    this.host.classList.remove('aui-tabs', 'aui-tabs--horizontal', 'aui-tabs--vertical');
  }

  #config(options: TabsOptions = this.#options): Readonly<TabsConfig & { direction: Direction }> {
    return tabsConfig.resolve({
      ...(options.activation === undefined ? {} : { activation: options.activation }),
      ...(options.orientation === undefined ? {} : { orientation: options.orientation }),
      ...(options.direction === undefined ? {} : { direction: options.direction }),
    });
  }

  #fail(property: string, expected: string): never {
    throw configurationError('TABS_OPTIONS', 'Invalid tabs options.', { component: 'tabs', property: `tabs.${property}`, expected });
  }

  #assertOptions(options: TabsOptions): void {
    if (typeof options.label !== 'string' || options.label.trim() === '') this.#fail('label', 'non-empty string (accessible name)');
    if (!isNonEmptyList(options.tabs)) this.#fail('tabs', 'non-empty array of tabs');
    const ids = new Set<string>();
    for (const tab of options.tabs) {
      if (typeof tab.id !== 'string' || tab.id === '') this.#fail('tabs.id', 'non-empty string');
      if (ids.has(tab.id)) this.#fail('tabs.id', 'unique ids');
      ids.add(tab.id);
      if (typeof tab.label !== 'string' || tab.label.trim() === '') this.#fail('tabs.label', 'non-empty string');
    }
    if (options.value !== undefined && !ids.has(options.value)) this.#fail('value', 'id of an existing tab');
    // Resolving validates activation, orientation, and direction.
    this.#config(options);
  }

  #resolveValue(value: string | undefined, tabs: readonly TabItem[]): string {
    if (value !== undefined) return value;
    const first = tabs.find((t) => !t.disabled) ?? tabs[0];
    return first?.id ?? '';
  }

  #bindEvents(): void {
    const g = this.#group;
    g.listen(this.tablist, 'click', (event) => {
      const id = this.#idOf(event.target);
      if (id !== null) this.#userSelect(id);
    });
    g.listen(this.tablist, 'keydown', (event) => {
      this.#onKeyDown(event);
    });
    // Leaving the tablist returns the tab stop to the selected tab (manual activation can move it).
    g.listen(this.tablist, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.tablist.contains(next)) return;
      this.#syncTabStop();
    });
  }

  #idOf(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const tab = target.closest('[role="tab"]');
    for (const [id, parts] of this.#parts) if (parts.tab === tab) return parts.tab.disabled ? null : id;
    return null;
  }

  #onKeyDown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const tabs = this.#options.tabs;
    const buttons = tabs.map((t) => this.#parts.get(t.id)?.tab);
    const current = buttons.findIndex((b) => b !== undefined && b === event.target);
    if (current < 0) return;
    const config = this.#config();
    const next = getNextIndex(event.key, current, tabs.length, {
      orientation: config.orientation,
      loop: true,
      direction: this.#direction(config.direction),
      isDisabled: (i) => tabs[i]?.disabled === true,
    });
    if (next === null) return;
    event.preventDefault();
    const tab = tabs[next];
    const button = buttons[next];
    if (!tab || !button || tab.disabled) return;
    for (const b of buttons) if (b) b.tabIndex = b === button ? 0 : -1;
    button.focus();
    if (config.activation === 'automatic') this.#userSelect(tab.id);
  }

  /** Effective direction: explicit configuration, or the host's inherited `dir`. */
  #direction(configured: Direction): Direction {
    return configured === 'rtl' || this.host.matches(':dir(rtl)') ? 'rtl' : 'ltr';
  }

  #userSelect(id: string): void {
    const previous = this.#value;
    if (id === previous) return;
    this.#value = id;
    this.#render();
    emit(this.host, 'aui-change', { value: id, previous } satisfies TabsChangeDetail);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const doc = this.#doc;
    const vertical = config.orientation === 'vertical';
    this.host.classList.toggle('aui-tabs--horizontal', !vertical);
    this.host.classList.toggle('aui-tabs--vertical', vertical);
    this.tablist.setAttribute('aria-label', o.label);
    this.tablist.setAttribute('aria-orientation', config.orientation);

    const keep = new Set(o.tabs.map((t) => t.id));
    for (const [id, parts] of this.#parts) {
      if (keep.has(id)) continue;
      parts.tab.remove();
      parts.panel.remove();
      this.#parts.delete(id);
    }

    const tabs: HTMLButtonElement[] = [];
    const panels: HTMLDivElement[] = [];
    for (const item of o.tabs) {
      let parts = this.#parts.get(item.id);
      if (!parts) {
        const tab = doc.createElement('button');
        tab.type = 'button';
        tab.className = 'aui-tabs__tab';
        tab.id = createId('aui-tab');
        tab.setAttribute('role', 'tab');
        const panel = doc.createElement('div');
        panel.className = 'aui-tabs__panel';
        panel.id = createId('aui-tabpanel');
        panel.setAttribute('role', 'tabpanel');
        tab.setAttribute('aria-controls', panel.id);
        panel.setAttribute('aria-labelledby', tab.id);
        parts = { tab, panel, content: undefined };
        this.#parts.set(item.id, parts);
      }
      const selected = item.id === this.#value;
      const label = doc.createElement('span');
      label.className = 'aui-tabs__label';
      label.textContent = item.label;
      parts.tab.replaceChildren(...(item.icon === undefined ? [] : [renderIcon(item.icon, { doc })]), label);
      parts.tab.setAttribute('aria-selected', String(selected));
      parts.tab.disabled = item.disabled ?? false;
      parts.panel.hidden = !selected;
      if (item.content !== undefined && item.content !== parts.content) {
        parts.panel.replaceChildren(typeof item.content === 'string' ? doc.createTextNode(item.content) : item.content);
      }
      parts.content = item.content;
      tabs.push(parts.tab);
      panels.push(parts.panel);
    }
    setChildren(this.tablist, tabs);
    setChildren(this.#panels, panels);
    this.#syncTabStop();
    this.#syncPanelTabStops();
    this.#scrollSelectedIntoView();
  }

  /** One tab stop: the selected tab when enabled, otherwise the first enabled tab. */
  #syncTabStop(): void {
    const o = this.#options;
    const stop = o.tabs.find((t) => t.id === this.#value && !t.disabled) ?? o.tabs.find((t) => !t.disabled);
    for (const item of o.tabs) {
      const parts = this.#parts.get(item.id);
      if (parts) parts.tab.tabIndex = item === stop ? 0 : -1;
    }
  }

  #syncPanelTabStops(): void {
    for (const { panel } of this.#parts.values()) {
      const hasTabStop = panel.querySelector(FOCUSABLE) !== null;
      if (hasTabStop) panel.removeAttribute('tabindex');
      else panel.tabIndex = 0;
    }
  }

  /** Scroll only the tablist (never the page) so the selected tab is fully visible. */
  #scrollSelectedIntoView(): void {
    const tab = this.#parts.get(this.#value)?.tab;
    const list = this.tablist;
    if (!tab || list.scrollWidth <= list.clientWidth) return;
    const t = tab.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    if (t.left < l.left) list.scrollLeft -= l.left - t.left;
    else if (t.right > l.right) list.scrollLeft += t.right - l.right;
  }
}
