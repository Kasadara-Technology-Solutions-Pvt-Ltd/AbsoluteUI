/**
 * Sidebar (SPEC section 18.12). Application side navigation: a labelled <nav> with a list
 * of links (or buttons for items without an href) and nested groups that expand as
 * disclosures (WAI-ARIA APG Disclosure Navigation). The active item carries
 * `aria-current="page"`. The sidebar can collapse to an icon rail (labels stay the
 * accessible names and are shown as tooltips), and below a breakpoint it becomes a
 * modal Drawer that the application opens from its own menu button. Collapsed,
 * expanded-group, and mode state are reported through events; nothing is persisted.
 */
import {
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  getMessage,
  registerMessages,
  validators,
  type Direction,
  type Disposer,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { observeMediaQuery } from '@absoluteui/utilities';
import { Drawer } from '../drawer/drawer.js';
import { Tooltip } from '../tooltip/tooltip.js';
import { isPlainClick, isSafeHref } from '../internal/href.js';

export interface SidebarConfig {
  /** Render the collapse (rail) toggle. */
  collapsible: boolean;
  /** Viewport width in CSS px below which the sidebar becomes a modal drawer; 0 never. */
  breakpoint: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    sidebar: SidebarConfig & { direction: Direction };
  }
}

export const sidebarConfig = defineComponentConfig<SidebarConfig, 'direction'>(
  'sidebar',
  {
    collapsible: { default: true, expected: 'boolean', validate: validators.isBoolean },
    breakpoint: { default: 768, expected: 'integer 0..4096 (CSS px)', validate: validators.integerInRange(0, 4096) },
  },
  ['direction'],
);

registerMessages('sidebar', 'en', {
  collapse: 'Collapse sidebar',
  expand: 'Expand sidebar',
});

export interface SidebarLink {
  type?: 'item';
  /** Unique across the whole tree; used in `value` and events. */
  id: string;
  label: string;
  /** http(s), relative, path-absolute, or fragment URL. Without it the item is a button. */
  href?: string;
  icon?: IconRef;
  disabled?: boolean;
}

export interface SidebarGroup {
  type: 'group';
  id: string;
  label: string;
  icon?: IconRef;
  items: readonly SidebarItem[];
}

export type SidebarItem = SidebarLink | SidebarGroup;

export type SidebarMode = 'inline' | 'drawer';

export interface SidebarIcons {
  /** Group disclosure indicator (rotated while expanded). */
  group: IconRef;
  /** Collapse toggle while expanded (mirrored in RTL). */
  collapse: IconRef;
  /** Collapse toggle while collapsed (mirrored in RTL). */
  expand: IconRef;
}

export interface SidebarOptions extends Partial<SidebarConfig> {
  /** Accessible name of the <nav> and the drawer title (required), e.g. "Main". */
  label: string;
  items: readonly SidebarItem[];
  /** Active (current page) item id. */
  value?: string;
  /** Icon rail: labels are visually hidden and shown as tooltips. Ignored in drawer mode. */
  collapsed?: boolean;
  /** Expanded group ids. Default: the groups containing the active item. */
  expanded?: readonly string[];
  direction?: Direction;
  icons?: Partial<SidebarIcons>;
}

export interface SidebarNavigateDetail {
  id: string;
  item: SidebarLink;
}

export interface SidebarChangeDetail {
  value: string;
  previous: string | null;
}

export interface SidebarExpandedChangeDetail {
  /** The group the user toggled. */
  id: string;
  expanded: boolean;
  /** All expanded group ids after the change, in tree order. */
  value: string[];
}

export interface SidebarCollapsedChangeDetail {
  collapsed: boolean;
}

export interface SidebarModeChangeDetail {
  mode: SidebarMode;
}

interface Node {
  readonly item: SidebarItem;
  readonly control: HTMLElement;
  readonly parent: Node | null;
  /** Nested list (groups only). */
  readonly list: HTMLUListElement | null;
}

/** Not a type guard on purpose: narrowing a typed readonly array through Array.isArray yields any[]. */
function isNonEmptyList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function isGroup(item: SidebarItem): item is SidebarGroup {
  return item.type === 'group';
}

export class Sidebar {
  readonly host: HTMLElement;
  readonly nav: HTMLElement;
  #options: SidebarOptions;
  #value: string | null;
  #collapsed: boolean;
  #expanded = new Set<string>();
  #mode: SidebarMode = 'inline';
  readonly #doc: Document;
  readonly #list: HTMLUListElement;
  readonly #footer: HTMLDivElement;
  readonly #toggle: HTMLButtonElement;
  #nodes = new Map<string, Node>();
  #tooltips: Tooltip[] = [];
  #drawer: Drawer | null = null;
  #stopMedia: Disposer | null = null;
  #breakpoint = -1;
  #ready = false;
  readonly #group = new DisposableGroup();

  /** Render a sidebar into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: SidebarOptions): Sidebar {
    return new Sidebar(host, options);
  }

  private constructor(host: HTMLElement, options: SidebarOptions) {
    this.#doc = host.ownerDocument;
    this.#assertOptions(options);
    this.host = host;
    this.#options = { ...options };
    this.#value = options.value ?? null;
    this.#collapsed = options.collapsed ?? false;
    this.#expanded = new Set(options.expanded ?? this.#ancestorsOf(this.#value, options.items));

    const doc = this.#doc;
    this.nav = doc.createElement('nav');
    this.nav.className = 'aui-sidebar__nav';
    this.nav.id = createId('aui-sidebar');
    this.#list = doc.createElement('ul');
    this.#list.className = 'aui-sidebar__list';
    this.nav.append(this.#list);
    this.#footer = doc.createElement('div');
    this.#footer.className = 'aui-sidebar__footer';
    this.#toggle = doc.createElement('button');
    this.#toggle.type = 'button';
    this.#toggle.className = 'aui-sidebar__toggle';
    this.#toggle.setAttribute('aria-controls', this.nav.id);
    this.#footer.append(this.#toggle);
    host.classList.add('aui-sidebar');
    host.replaceChildren(this.nav, this.#footer);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    const g = this.#group;
    g.listen(this.nav, 'click', (event) => {
      this.#onClick(event);
    });
    g.listen(this.#toggle, 'click', () => {
      this.#setCollapsed(!this.#collapsed, true);
    });
    g.add(sidebarConfig.subscribe(() => {
      this.#render();
    }));
    this.#ready = true;
  }

  /** Active item id. */
  get value(): string | null {
    return this.#value;
  }

  get collapsed(): boolean {
    return this.#collapsed;
  }

  /** Expanded group ids, in tree order. */
  get expanded(): string[] {
    return this.#groupIds(this.#options.items).filter((id) => this.#expanded.has(id));
  }

  /** `drawer` below the breakpoint, otherwise `inline`. */
  get mode(): SidebarMode {
    return this.#mode;
  }

  /** Whether the drawer is open (always false in inline mode). */
  get isOpen(): boolean {
    return this.#drawer?.isOpen ?? false;
  }

  get options(): Readonly<SidebarOptions> {
    return this.#options;
  }

  /** Open the drawer (drawer mode only; no-op inline). Focus moves into the drawer. */
  open(): void {
    if (this.#mode === 'drawer') this.#drawer?.open();
  }

  close(): void {
    this.#drawer?.close();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Mark an item active programmatically (no events); its groups expand. */
  select(id: string): void {
    const node = this.#nodes.get(id);
    if (!node || isGroup(node.item)) this.#fail('value', 'id of an existing non-group item');
    this.#setValue(id);
  }

  update(options: Partial<SidebarOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    if ('value' in options) this.#value = next.value ?? null;
    else if (this.#value !== null && !this.#hasItem(this.#value, next.items)) this.#value = null;
    if (options.collapsed !== undefined) this.#collapsed = options.collapsed;
    if (options.expanded !== undefined) this.#expanded = new Set(options.expanded);
    else if ('items' in options) {
      const groups = new Set(this.#groupIds(next.items));
      this.#expanded = new Set([...this.#expanded].filter((id) => groups.has(id)));
    }
    else if ('value' in options) for (const id of this.#ancestorsOf(this.#value, next.items)) this.#expanded.add(id);
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.#stopMedia?.();
    this.#stopMedia = null;
    this.#destroyTooltips();
    this.#drawer?.destroy();
    this.#drawer = null;
    this.#nodes.clear();
    this.host.replaceChildren();
    this.host.classList.remove('aui-sidebar', 'aui-sidebar--collapsed', 'aui-sidebar--drawer');
  }

  #config(options: SidebarOptions = this.#options): Readonly<SidebarConfig & { direction: Direction }> {
    return sidebarConfig.resolve({
      ...(options.collapsible === undefined ? {} : { collapsible: options.collapsible }),
      ...(options.breakpoint === undefined ? {} : { breakpoint: options.breakpoint }),
      ...(options.direction === undefined ? {} : { direction: options.direction }),
    });
  }

  #fail(property: string, expected: string): never {
    throw configurationError('SIDEBAR_OPTIONS', 'Invalid sidebar options.', { component: 'sidebar', property: `sidebar.${property}`, expected });
  }

  #assertOptions(options: SidebarOptions): void {
    if (typeof options.label !== 'string' || options.label.trim() === '') this.#fail('label', 'non-empty string (accessible name)');
    if (!isNonEmptyList(options.items)) this.#fail('items', 'non-empty array of items');
    const ids = new Set<string>();
    const links = new Set<string>();
    const groups = new Set<string>();
    const walk = (items: readonly SidebarItem[], path: string): void => {
      items.forEach((item, i) => {
        const p = `${path}[${i}]`;
        const raw: unknown = item;
        if (typeof raw !== 'object' || raw === null) this.#fail(p, 'sidebar item object');
        if (typeof item.id !== 'string' || item.id === '') this.#fail(`${p}.id`, 'non-empty string');
        if (ids.has(item.id)) this.#fail(`${p}.id`, 'id unique across the whole tree');
        ids.add(item.id);
        if (typeof item.label !== 'string' || item.label.trim() === '') this.#fail(`${p}.label`, 'non-empty string');
        if (isGroup(item)) {
          if (!isNonEmptyList(item.items)) this.#fail(`${p}.items`, 'non-empty array of items');
          groups.add(item.id);
          walk(item.items, `${p}.items`);
          return;
        }
        const type: unknown = item.type;
        if (type !== undefined && type !== 'item') this.#fail(`${p}.type`, '"item" | "group"');
        if ('items' in item) this.#fail(`${p}.type`, '"group" for an item with nested items');
        links.add(item.id);
        // The href value itself is never echoed into the error (it may carry user data).
        if (item.href !== undefined && (typeof item.href !== 'string' || !isSafeHref(item.href, this.#doc.baseURI))) this.#fail(`${p}.href`, 'http(s), relative, path-absolute, or fragment URL');
      });
    };
    walk(options.items, 'items');
    if (options.value !== undefined && !links.has(options.value)) this.#fail('value', 'id of an existing non-group item');
    const collapsed: unknown = options.collapsed;
    if (collapsed !== undefined && typeof collapsed !== 'boolean') this.#fail('collapsed', 'boolean');
    const expanded: unknown = options.expanded;
    if (expanded !== undefined && (!Array.isArray(expanded) || !options.expanded?.every((id) => groups.has(id)))) this.#fail('expanded', 'array of group ids');
    // Resolving validates collapsible, breakpoint, and direction.
    this.#config(options);
  }

  #groupIds(items: readonly SidebarItem[]): string[] {
    return items.flatMap((item) => (isGroup(item) ? [item.id, ...this.#groupIds(item.items)] : []));
  }

  #hasItem(id: string, items: readonly SidebarItem[]): boolean {
    return items.some((item) => (isGroup(item) ? this.#hasItem(id, item.items) : item.id === id));
  }

  /** Group ids on the path to the item, outermost first; null when the id is not in the tree. */
  #pathTo(id: string, items: readonly SidebarItem[], path: readonly string[] = []): string[] | null {
    for (const item of items) {
      if (item.id === id) return [...path];
      if (isGroup(item)) {
        const found = this.#pathTo(id, item.items, [...path, item.id]);
        if (found) return found;
      }
    }
    return null;
  }

  #ancestorsOf(id: string | null, items: readonly SidebarItem[]): string[] {
    return id === null ? [] : (this.#pathTo(id, items) ?? []);
  }

  #direction(): Direction {
    return this.#config().direction === 'rtl' || this.host.matches(':dir(rtl)') ? 'rtl' : 'ltr';
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const focusedId = this.#focusedId();
    this.#destroyTooltips();
    this.nav.setAttribute('aria-label', o.label);
    // Explicit RTL only; otherwise the document direction is inherited (logical CSS).
    for (const el of [this.nav, this.#footer]) {
      if (config.direction === 'rtl') el.dir = 'rtl';
      else el.removeAttribute('dir');
    }
    this.#drawer?.update({ title: o.label, direction: this.#direction() });
    this.#nodes = new Map();
    this.#list.replaceChildren(...this.#renderItems(o.items, null));
    this.#footer.hidden = !config.collapsible;
    if (!config.collapsible) this.#collapsed = false;
    this.#watchBreakpoint(config.breakpoint);
    this.#sync();
    if (focusedId !== null) this.#nodes.get(focusedId)?.control.focus();
  }

  #renderItems(items: readonly SidebarItem[], parent: Node | null): HTMLLIElement[] {
    const doc = this.#doc;
    const icons = this.#options.icons;
    return items.map((item) => {
      const li = doc.createElement('li');
      li.className = 'aui-sidebar__entry';
      let control: HTMLElement;
      let list: HTMLUListElement | null = null;
      if (isGroup(item)) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'aui-sidebar__item aui-sidebar__group';
        list = doc.createElement('ul');
        list.className = 'aui-sidebar__list aui-sidebar__list--nested';
        list.id = createId('aui-sidebar-group');
        button.setAttribute('aria-controls', list.id);
        control = button;
      } else if (item.disabled) {
        // A disabled link: no href, not focusable, still announced as a dimmed link.
        const a = doc.createElement('a');
        a.setAttribute('role', 'link');
        a.setAttribute('aria-disabled', 'true');
        control = a;
        control.className = 'aui-sidebar__item';
      } else if (item.href !== undefined) {
        const a = doc.createElement('a');
        a.href = item.href;
        control = a;
        control.className = 'aui-sidebar__item';
      } else {
        const button = doc.createElement('button');
        button.type = 'button';
        control = button;
        control.className = 'aui-sidebar__item';
      }
      control.dataset.id = item.id;
      const icon = doc.createElement('span');
      icon.className = 'aui-sidebar__icon';
      icon.setAttribute('aria-hidden', 'true');
      if (item.icon !== undefined) icon.append(renderIcon(item.icon, { doc }));
      else {
        // Rail fallback: the first character of the label.
        icon.classList.add('aui-sidebar__icon--initial');
        icon.textContent = Array.from(item.label.trim())[0] ?? '';
      }
      const label = doc.createElement('span');
      label.className = 'aui-sidebar__label';
      label.textContent = item.label;
      control.append(icon, label);
      if (isGroup(item)) control.append(renderIcon(icons?.group ?? 'chevron-down', { doc, className: 'aui-sidebar__chevron' }));
      li.append(control);
      const node: Node = { item, control, parent, list };
      this.#nodes.set(item.id, node);
      if (list && isGroup(item)) {
        list.replaceChildren(...this.#renderItems(item.items, node));
        li.append(list);
      }
      return li;
    });
  }

  /** Apply active, expanded, collapsed, and mode state in place (no rebuild, focus stays). */
  #sync(): void {
    const activeAncestors = new Set(this.#ancestorsOf(this.#value, this.#options.items));
    for (const [id, node] of this.#nodes) {
      if (node.list) {
        const open = this.#expanded.has(id);
        node.control.setAttribute('aria-expanded', String(open));
        node.list.hidden = !open;
        node.control.classList.toggle('aui-sidebar__item--contains-active', activeAncestors.has(id) && !open);
      } else if (id === this.#value) {
        node.control.setAttribute('aria-current', 'page');
      } else {
        node.control.removeAttribute('aria-current');
      }
    }
    const rail = this.#collapsed && this.#mode === 'inline';
    this.host.classList.toggle('aui-sidebar--collapsed', rail);
    this.host.classList.toggle('aui-sidebar--drawer', this.#mode === 'drawer');
    const icons = this.#options.icons;
    this.#toggle.replaceChildren(renderIcon(this.#collapsed ? (icons?.expand ?? 'chevrons-right') : (icons?.collapse ?? 'chevrons-left'), { doc: this.#doc }));
    this.#toggle.setAttribute('aria-label', getMessage('sidebar', this.#collapsed ? 'expand' : 'collapse'));
    this.#syncTooltips(rail);
  }

  #syncTooltips(rail: boolean): void {
    if (!rail) {
      this.#destroyTooltips();
      return;
    }
    if (this.#tooltips.length > 0) return;
    const placement = this.#direction() === 'rtl' ? 'left' : 'right';
    for (const node of this.#nodes.values()) {
      // Disabled items too: in the rail the tooltip is their only visible name.
      this.#tooltips.push(Tooltip.create(node.control, { content: node.item.label, relation: 'label', placement }));
    }
    this.#tooltips.push(Tooltip.create(this.#toggle, { content: getMessage('sidebar', 'expand'), relation: 'label', placement }));
  }

  #destroyTooltips(): void {
    for (const t of this.#tooltips) t.destroy();
    this.#tooltips = [];
  }

  #focusedId(): string | null {
    const active = this.#doc.activeElement;
    for (const [id, node] of this.#nodes) if (node.control === active) return id;
    return null;
  }

  #watchBreakpoint(breakpoint: number): void {
    if (breakpoint === this.#breakpoint) return;
    this.#breakpoint = breakpoint;
    this.#stopMedia?.();
    this.#stopMedia = null;
    if (breakpoint === 0) {
      this.#setMode('inline');
      return;
    }
    // A fractional max-width avoids a gap at exactly `breakpoint` px.
    this.#stopMedia = observeMediaQuery(`(max-width: ${breakpoint - 0.02}px)`, (matches) => {
      this.#setMode(matches ? 'drawer' : 'inline');
    });
  }

  #setMode(mode: SidebarMode): void {
    if (mode === this.#mode) return;
    this.#mode = mode;
    if (mode === 'drawer') {
      this.#drawer ??= Drawer.create({ title: this.#options.label, placement: 'start', size: 'sm', direction: this.#direction() }, this.#doc);
      this.#drawer.body.append(this.nav);
    } else {
      this.#drawer?.close();
      this.host.prepend(this.nav);
    }
    this.#sync();
    // The mode found during construction is the initial state, not a change.
    if (this.#ready) emit(this.host, 'aui-mode-change', { mode } satisfies SidebarModeChangeDetail);
  }

  #setValue(id: string): void {
    this.#value = id;
    for (const g of this.#ancestorsOf(id, this.#options.items)) this.#expanded.add(g);
    this.#sync();
  }

  #setCollapsed(collapsed: boolean, user: boolean): void {
    if (collapsed === this.#collapsed) return;
    this.#collapsed = collapsed;
    this.#sync();
    if (user) emit(this.host, 'aui-collapsed-change', { collapsed } satisfies SidebarCollapsedChangeDetail);
  }

  #onClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>('.aui-sidebar__item');
    const id = control?.dataset.id;
    const node = id === undefined ? undefined : this.#nodes.get(id);
    if (!node || !control) return;
    const item = node.item;
    if (isGroup(item)) {
      const expanded = !this.#expanded.has(item.id);
      if (expanded) this.#expanded.add(item.id);
      else this.#expanded.delete(item.id);
      this.#sync();
      emit(this.host, 'aui-expanded-change', { id: item.id, expanded, value: this.expanded } satisfies SidebarExpandedChangeDetail);
      return;
    }
    if (item.disabled) {
      event.preventDefault();
      return;
    }
    // Modified clicks on links (new tab/window, download) stay native and are not reported.
    if (control instanceof HTMLAnchorElement && control.hasAttribute('href') && !isPlainClick(event)) return;
    const proceed = emit(this.host, 'aui-navigate', { id: item.id, item } satisfies SidebarNavigateDetail, { cancelable: true });
    if (!proceed) {
      event.preventDefault();
      return;
    }
    const previous = this.#value;
    if (previous !== item.id) {
      this.#setValue(item.id);
      emit(this.host, 'aui-change', { value: item.id, previous } satisfies SidebarChangeDetail);
    }
    if (this.#mode === 'drawer') this.#drawer?.close();
  }
}
