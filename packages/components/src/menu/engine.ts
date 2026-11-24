/**
 * Menu engine (internal, not a public subpath export). Renders and drives the menu
 * levels (WAI-ARIA APG Menu): items, groups, separators, checkbox and radio items,
 * nested submenus, roving focus, typeahead, hover, and the overlay stack. What opens
 * the menu (a trigger button for Menu and Menu Bar, a pointer position or focused
 * element for Context Menu) is supplied by a `MenuEngineHost`.
 */
import { configurationError, createId, DisposableGroup, emit, type Direction, type Disposer, releaseNode } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import {
  autoPosition,
  createTypeahead,
  getNextIndex,
  isPrintableKey,
  openPopover,
  type Placement,
  type PopoverHandle,
  type VirtualAnchor,
} from '@absoluteui/utilities';

export interface MenuActionItem {
  type?: 'item';
  id: string;
  label: string;
  icon?: IconRef;
  description?: string;
  /** Displayed hint only (for example "Ctrl+C"); the menu does not bind it. */
  shortcut?: string;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  /** Submenu items. The item opens the submenu instead of emitting `aui-select`. */
  items?: readonly MenuItem[];
}

export interface MenuCheckboxItem {
  type: 'checkbox';
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
}

export interface MenuRadioItem {
  type: 'radio';
  id: string;
  label: string;
  /** Radio group name; unique across the whole menu tree. */
  group: string;
  checked: boolean;
  disabled?: boolean;
}

export interface MenuSeparator {
  type: 'separator';
}

export interface MenuGroup {
  type: 'group';
  /** Visible group label; names the group via aria-labelledby. */
  label: string;
  items: readonly MenuItem[];
}

export type MenuItem = MenuActionItem | MenuCheckboxItem | MenuRadioItem | MenuSeparator | MenuGroup;

/** Items that render as a focusable menuitem, menuitemcheckbox, or menuitemradio. */
export type MenuSelectableItem = MenuActionItem | MenuCheckboxItem | MenuRadioItem;

export interface MenuIcons {
  submenu: IconRef;
  checked: IconRef;
  radio: IconRef;
}

export interface MenuSelectDetail {
  id: string;
  item: MenuSelectableItem;
  /** New checked state for checkbox and radio items. */
  checked?: boolean;
}

/** Resolved behavior the engine reads on every interaction. */
export interface MenuEngineConfig {
  placement: Placement;
  /** Gap between the anchor and the top level, px. Default 4. */
  offset?: number;
  closeOnSelect: boolean;
  typeahead: boolean;
  direction: Direction;
}

export interface MenuEngineHost {
  readonly doc: Document;
  /** Elements treated as part of the menu for outside-pointer and focus-out dismissal. */
  inside(): readonly Element[];
  /** Positioning reference of the top level. */
  anchor(): Element | VirtualAnchor;
  config(): Readonly<MenuEngineConfig>;
  /** Move focus back to where the menu was opened from (trigger or origin). */
  restoreFocus(): void;
  /** Dispatch `aui-select` for an activated item. */
  select(detail: MenuSelectDetail): void;
  /** After the top level opened / closed (for trigger state such as aria-expanded). */
  opened(): void;
  closed(): void;
}

/** Context of `renderItem` (since 0.9.0). */
export interface MenuRenderContext {
  readonly doc: Document;
}

/**
 * Custom content of a menu item (since 0.9.0). The item's `label` stays its accessible name
 * and typeahead text (visually hidden); the node is decorative. Nodes are reused per item
 * object and released with `releaseNode` when the item is dropped or the menu is destroyed.
 */
export type MenuRenderItem = (item: MenuSelectableItem, context: MenuRenderContext) => Node;

export interface MenuEngineOptions {
  items: readonly MenuItem[];
  icons?: Partial<MenuIcons> | undefined;
  renderItem?: MenuRenderItem | undefined;
}

/** Hover delay before a submenu opens or a sibling submenu closes (ms). */
const HOVER_DELAY = 150;

interface Level {
  readonly element: HTMLDivElement;
  readonly parent: Level | null;
  /** Parent menu item (submenus only). */
  readonly parentItem: HTMLElement | null;
  /** Focusable items in visual order, including items inside groups. */
  readonly items: HTMLElement[];
  readonly labels: string[];
  popover: PopoverHandle | null;
  stopPosition: Disposer | null;
  openChild: Level | null;
}

interface Entry {
  readonly item: MenuSelectableItem;
  readonly element: HTMLElement;
  readonly level: Level;
  readonly submenu: Level | null;
}

function isSelectable(item: MenuItem): item is MenuSelectableItem {
  return item.type === undefined || item.type === 'item' || item.type === 'checkbox' || item.type === 'radio';
}

/**
 * Validate a menu item tree. `code` and `component` name the owning component in the
 * thrown configuration error; ids must be unique across the whole tree.
 */
export function assertMenuItems(items: unknown, code: string, component: string, path = 'items'): void {
  const fail = (property: string, expected: string): never => {
    throw configurationError(code, `Invalid ${component.replace('-', ' ')} options.`, { component, property: `${component}.${property}`, expected });
  };
  const ids = new Set<string>();
  const check = (list: unknown, p0: string): void => {
    if (!Array.isArray(list)) {
      fail(p0, 'array of menu items');
      return;
    }
    (list as readonly MenuItem[]).forEach((item, i) => {
      const p = `${p0}[${i}]`;
      const raw: unknown = item;
      if (typeof raw !== 'object' || raw === null) fail(p, 'menu item object');
      if (item.type === 'separator') return;
      if (typeof item.label !== 'string' || item.label.trim() === '') fail(`${p}.label`, 'non-empty string');
      if (item.type === 'group') {
        check(item.items, `${p}.items`);
        return;
      }
      if (!isSelectable(item)) {
        fail(`${p}.type`, '"item" | "checkbox" | "radio" | "separator" | "group"');
        return;
      }
      if (typeof item.id !== 'string' || item.id === '') fail(`${p}.id`, 'non-empty string');
      if (ids.has(item.id)) fail(`${p}.id`, 'id unique across the whole menu tree');
      ids.add(item.id);
      if (item.type === 'checkbox' || item.type === 'radio') {
        if (typeof item.checked !== 'boolean') fail(`${p}.checked`, 'boolean');
        if (item.type === 'radio' && (typeof item.group !== 'string' || item.group === '')) fail(`${p}.group`, 'non-empty string');
      } else if (item.items !== undefined) {
        if (!Array.isArray(item.items) || item.items.length === 0) fail(`${p}.items`, 'non-empty array of submenu items');
        check(item.items, `${p}.items`);
      }
    });
  };
  check(items, path);
}

export class MenuEngine {
  /** Top-level `role="menu"` popup. */
  readonly element: HTMLDivElement;
  readonly #host: MenuEngineHost;
  #options: MenuEngineOptions;
  /** Nodes from `renderItem`, reused per item object (D8). */
  readonly #itemNodes = new Map<MenuSelectableItem, Node>();
  readonly #top: Level;
  #levels: Level[] = [];
  readonly #entries = new Map<HTMLElement, Entry>();
  readonly #checked = new Map<string, boolean>();
  #levelGroup = new DisposableGroup();
  readonly #typeahead = createTypeahead();
  #hoverTimer: ReturnType<typeof setTimeout> | undefined;
  #hovered: Entry | undefined = undefined;

  /** Builds every level detached from the document; the host inserts `popups`. */
  constructor(host: MenuEngineHost, options: MenuEngineOptions) {
    this.#host = host;
    this.#options = options;
    const el = host.doc.createElement('div');
    el.id = createId('aui-menu');
    el.className = 'aui-menu';
    el.setAttribute('role', 'menu');
    el.tabIndex = -1;
    // Hidden by the UA stylesheet until shown in the top layer.
    el.popover = 'manual';
    this.element = el;
    this.#top = this.#newLevel(el, null, null);
    this.#syncChecked();
    this.#render();
  }

  get isOpen(): boolean {
    return this.#top.popover !== null;
  }

  /** Every level element, top level first. */
  get popups(): HTMLDivElement[] {
    return this.#levels.map((l) => l.element);
  }

  /** Submenu level elements (inserted after `element`). */
  get submenus(): HTMLDivElement[] {
    return this.#levels.filter((l) => l !== this.#top).map((l) => l.element);
  }

  contains(node: Node): boolean {
    return this.#levels.some((l) => l.element.contains(node));
  }

  /** Replace options. New `items` rebuild the levels; submenus are re-inserted after `element`. */
  setOptions(options: MenuEngineOptions, itemsChanged: boolean): void {
    const renderChanged = options.renderItem !== this.#options.renderItem;
    if (renderChanged) this.#releaseItemNodes(new Set());
    this.#options = options;
    if (itemsChanged || renderChanged) {
      const focusedId = this.#focusedEntry()?.item.id;
      this.#closeChildren(this.#top);
      this.#syncChecked();
      for (const level of this.#levels) if (level !== this.#top) level.element.remove();
      this.#render();
      this.element.after(...this.submenus);
      this.bind();
      if (this.isOpen) {
        const again = focusedId === undefined ? undefined : [...this.#entries.values()].find((e) => e.item.id === focusedId && e.level === this.#top);
        if (again) again.element.focus();
        else this.#focusEdge(this.#top, 'first');
      }
    }
    this.applyConfig();
  }

  /** Open the top level and focus its first (default) or last enabled item. */
  open(focus: 'first' | 'last' = 'first'): void {
    if (!this.isOpen) {
      const config = this.#host.config();
      this.#top.popover = openPopover(this.element, {
        inside: this.#host.inside(),
        onDismiss: (reason) => {
          if (reason === 'escape') this.closeAll(true);
          else this.closeAll(false);
        },
      });
      this.#top.stopPosition = autoPosition(this.#host.anchor(), this.element, this.#positionOptions(config));
      this.#host.opened();
      emit(this.element, 'aui-open', null, { bubbles: false });
    }
    this.#focusEdge(this.#top, focus);
  }

  /** Close all levels; `restoreFocus` moves focus back to the host's origin. */
  closeAll(restoreFocus: boolean): void {
    clearTimeout(this.#hoverTimer);
    if (!this.isOpen) return;
    this.#closeLevel(this.#top);
    this.#host.closed();
    if (restoreFocus) this.#host.restoreFocus();
    emit(this.element, 'aui-close', null, { bubbles: false });
  }

  /** Whether focus is inside any level. */
  focusInside(): boolean {
    const active = this.#host.doc.activeElement;
    return active !== null && this.contains(active);
  }

  destroy(): void {
    this.closeAll(false);
    clearTimeout(this.#hoverTimer);
    this.#typeahead.reset();
    this.#levelGroup.dispose();
    for (const level of this.#levels) level.element.remove();
    this.#levels = [];
    this.#entries.clear();
    this.#releaseItemNodes(new Set());
  }

  /** Release custom item nodes whose item is not in `keep` (D8). */
  #releaseItemNodes(keep: ReadonlySet<MenuSelectableItem>): void {
    for (const [item, node] of this.#itemNodes) {
      if (keep.has(item)) continue;
      releaseNode(node);
      this.#itemNodes.delete(item);
    }
  }

  applyConfig(): void {
    const config = this.#host.config();
    for (const level of this.#levels) level.element.dataset.direction = config.direction;
    if (this.#top.stopPosition) {
      this.#top.stopPosition();
      this.#top.stopPosition = autoPosition(this.#host.anchor(), this.element, this.#positionOptions(config));
    }
  }

  #positionOptions(config: Readonly<MenuEngineConfig>): { placement: Placement; direction: Direction; offset?: number } {
    return { placement: config.placement, direction: config.direction, ...(config.offset === undefined ? {} : { offset: config.offset }) };
  }

  /** Attach level listeners (again after a rebuild). */
  bind(): void {
    this.#levelGroup.dispose();
    this.#levelGroup = new DisposableGroup();
    const g = this.#levelGroup;
    for (const level of this.#levels) {
      g.listen(level.element, 'keydown', (event) => {
        this.#onKeyDown(level, event);
      });
      g.listen(level.element, 'click', (event) => {
        const entry = this.#entryFor(event.target);
        if (entry) this.#activate(entry, 'pointer');
      });
      // Real pointer movement only: 'pointerover' also fires when the menu opens under a
      // stationary cursor, which would steal focus from keyboard users (regression).
      g.listen(level.element, 'pointermove', (event) => {
        if (event.pointerType === 'touch') return;
        const entry = this.#entryFor(event.target);
        if (entry && entry !== this.#hovered) {
          this.#hovered = entry;
          this.#onHover(entry);
        }
      });
      g.listen(level.element, 'pointerleave', () => {
        this.#hovered = undefined;
      });
      g.listen(level.element, 'focusout', (event) => {
        const next = event.relatedTarget;
        // Null relatedTarget (pointer on inert content) is handled by the overlay stack.
        if (next instanceof Node && !this.#host.inside().some((el) => el.contains(next)) && !this.contains(next)) this.closeAll(false);
      });
    }
  }

  /** Checked state is owned internally; new items reset it. */
  #syncChecked(): void {
    this.#checked.clear();
    const walk = (items: readonly MenuItem[]): void => {
      for (const item of items) {
        if (item.type === 'checkbox' || item.type === 'radio') this.#checked.set(item.id, item.checked);
        else if (item.type === 'group') walk(item.items);
        else if (item.type !== 'separator' && item.items) walk(item.items);
      }
    };
    walk(this.#options.items);
  }

  #newLevel(element: HTMLDivElement, parent: Level | null, parentItem: HTMLElement | null): Level {
    const level: Level = { element, parent, parentItem, items: [], labels: [], popover: null, stopPosition: null, openChild: null };
    // Roving tabindex: the focused item is the level's one item in the tab order (tabindex 0, the others -1).
    // Tab still closes the menu; this keeps a menu that scrolls keyboard-reachable for assistive checks.
    element.addEventListener('focusin', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !level.items.includes(target)) return;
      for (const item of level.items) item.tabIndex = item === target ? 0 : -1;
    });
    return level;
  }

  #render(): void {
    this.#entries.clear();
    this.#top.items.length = 0;
    this.#top.labels.length = 0;
    this.#levels = [this.#top];
    this.element.replaceChildren(...this.#renderItems(this.#options.items, this.#top));
    this.#releaseItemNodes(new Set([...this.#entries.values()].map((e) => e.item)));
    this.element.classList.toggle('aui-menu--has-check', this.#hasCheckable(this.#options.items));
    this.applyConfig();
  }

  #hasCheckable(items: readonly MenuItem[]): boolean {
    return items.some((i) => i.type === 'checkbox' || i.type === 'radio' || (i.type === 'group' && this.#hasCheckable(i.items)));
  }

  #renderItems(items: readonly MenuItem[], level: Level): HTMLElement[] {
    const doc = this.#host.doc;
    return items.map((item) => {
      if (item.type === 'separator') {
        const sep = doc.createElement('div');
        sep.className = 'aui-menu__separator';
        sep.setAttribute('role', 'separator');
        return sep;
      }
      if (item.type === 'group') {
        const group = doc.createElement('div');
        group.className = 'aui-menu__group';
        group.setAttribute('role', 'group');
        const label = doc.createElement('div');
        label.className = 'aui-menu__group-label';
        label.id = createId('aui-menu-group');
        label.textContent = item.label;
        group.setAttribute('aria-labelledby', label.id);
        group.append(label, ...this.#renderItems(item.items, level));
        return group;
      }
      return this.#renderItem(item, level);
    });
  }

  #renderItem(item: MenuSelectableItem, level: Level): HTMLElement {
    const doc = this.#host.doc;
    const icons = this.#options.icons;
    const el = doc.createElement('div');
    el.id = createId('aui-menu-item');
    el.className = 'aui-menu__item';
    el.tabIndex = -1;
    el.dataset.id = item.id;
    if (item.disabled) el.setAttribute('aria-disabled', 'true');

    const check = doc.createElement('span');
    check.className = 'aui-menu__check';
    el.append(check);

    const label = doc.createElement('span');
    label.className = 'aui-menu__label';
    label.id = createId('aui-menu-label');
    label.textContent = item.label;
    el.setAttribute('aria-labelledby', label.id);
    const custom = this.#customContent(item);
    if (custom) label.classList.add('aui-menu__label--hidden');

    let submenu: Level | null = null;
    if (item.type === 'checkbox' || item.type === 'radio') {
      el.setAttribute('role', item.type === 'checkbox' ? 'menuitemcheckbox' : 'menuitemradio');
      el.append(label);
      if (custom) el.append(custom);
    } else {
      el.setAttribute('role', 'menuitem');
      if (item.tone === 'danger') el.classList.add('aui-menu__item--danger');
      if (item.icon !== undefined) {
        const icon = doc.createElement('span');
        icon.className = 'aui-menu__icon';
        icon.append(renderIcon(item.icon, { doc }));
        el.append(icon);
      }
      const text = doc.createElement('span');
      text.className = 'aui-menu__text';
      text.append(label);
      if (custom) text.append(custom);
      const describedBy: string[] = [];
      if (item.description) {
        const d = doc.createElement('span');
        d.className = 'aui-menu__description';
        d.id = createId('aui-menu-desc');
        d.textContent = item.description;
        text.append(d);
        describedBy.push(d.id);
      }
      el.append(text);
      if (item.shortcut) {
        const s = doc.createElement('span');
        s.className = 'aui-menu__shortcut';
        s.id = createId('aui-menu-shortcut');
        s.textContent = item.shortcut;
        el.append(s);
        describedBy.push(s.id);
      }
      if (describedBy.length) el.setAttribute('aria-describedby', describedBy.join(' '));
      if (item.items) {
        const subEl = doc.createElement('div');
        subEl.id = createId('aui-menu');
        subEl.className = 'aui-menu aui-menu--submenu';
        subEl.setAttribute('role', 'menu');
        subEl.setAttribute('aria-labelledby', label.id);
        subEl.tabIndex = -1;
        subEl.popover = 'manual';
        submenu = this.#newLevel(subEl, level, el);
        this.#levels.push(submenu);
        subEl.replaceChildren(...this.#renderItems(item.items, submenu));
        subEl.classList.toggle('aui-menu--has-check', this.#hasCheckable(item.items));
        el.setAttribute('aria-haspopup', 'menu');
        el.setAttribute('aria-expanded', 'false');
        el.setAttribute('aria-controls', subEl.id);
        el.append(renderIcon(icons?.submenu ?? 'chevron-right', { className: 'aui-menu__submenu-icon', doc }));
      }
    }

    level.items.push(el);
    level.labels.push(item.label);
    this.#entries.set(el, { item, element: el, level, submenu });
    this.#renderChecked(el);
    return el;
  }

  /** The `renderItem` node of an item in a decorative wrapper, or null. */
  #customContent(item: MenuSelectableItem): HTMLElement | null {
    const render = this.#options.renderItem;
    if (!render) return null;
    let node = this.#itemNodes.get(item);
    if (!node) {
      node = render(item, { doc: this.#host.doc });
      this.#itemNodes.set(item, node);
    }
    const wrapper = this.#host.doc.createElement('span');
    wrapper.className = 'aui-menu__custom';
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.append(node);
    return wrapper;
  }

  #renderChecked(el: HTMLElement): void {
    const entry = this.#entries.get(el);
    if (!entry) return;
    const { item } = entry;
    if (item.type !== 'checkbox' && item.type !== 'radio') return;
    const checked = this.#checked.get(item.id) ?? false;
    el.setAttribute('aria-checked', String(checked));
    const slot = el.querySelector('.aui-menu__check');
    if (!slot) return;
    const icons = this.#options.icons;
    const ref = item.type === 'checkbox' ? (icons?.checked ?? 'check') : (icons?.radio ?? 'check');
    slot.replaceChildren(...(checked ? [renderIcon(ref, { doc: this.#host.doc })] : []));
  }

  #entryFor(target: EventTarget | null): Entry | undefined {
    if (!(target instanceof Element)) return undefined;
    const el = target.closest<HTMLElement>('.aui-menu__item');
    return el ? this.#entries.get(el) : undefined;
  }

  #focusedEntry(): Entry | undefined {
    return this.#entryFor(this.#host.doc.activeElement);
  }

  #isDisabled(el: HTMLElement): boolean {
    return el.getAttribute('aria-disabled') === 'true';
  }

  #focusEdge(level: Level, edge: 'first' | 'last'): void {
    const items = level.items;
    const ordered = edge === 'first' ? items : [...items].reverse();
    const target = ordered.find((el) => !this.#isDisabled(el)) ?? ordered[0];
    this.#typeahead.reset();
    (target ?? level.element).focus();
  }

  #onKeyDown(level: Level, event: KeyboardEvent): void {
    // Events from a nested level bubble through no ancestor level (siblings in the DOM).
    const entry = this.#focusedEntry();
    const current = entry?.level === level ? level.items.indexOf(entry.element) : -1;
    const config = this.#host.config();
    const rtl = config.direction === 'rtl';
    const openKey = rtl ? 'ArrowLeft' : 'ArrowRight';
    const closeKey = rtl ? 'ArrowRight' : 'ArrowLeft';
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End': {
        event.preventDefault();
        // Navigation ends a typeahead run, so the next character starts a new query.
        this.#typeahead.reset();
        const next = getNextIndex(event.key, current, level.items.length, { orientation: 'vertical', loop: true });
        if (next !== null) level.items[next]?.focus();
        return;
      }
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (entry) this.#activate(entry, 'keyboard');
        return;
      case 'Tab':
        // Close everything and let the browser move focus on from the origin.
        this.closeAll(false);
        this.#host.restoreFocus();
        return;
      default:
        break;
    }
    if (event.key === openKey) {
      if (entry?.submenu && !this.#isDisabled(entry.element)) {
        event.preventDefault();
        this.#openSubmenu(entry.submenu, true);
      }
      return;
    }
    if (event.key === closeKey) {
      if (level.parentItem) {
        event.preventDefault();
        this.#closeLevel(level);
        level.parentItem.focus();
      }
      return;
    }
    if (config.typeahead && isPrintableKey(event)) {
      const found = this.#typeahead.handle(event.key, level.labels, current);
      if (found >= 0) {
        event.preventDefault();
        level.items[found]?.focus();
      }
    }
  }

  #onHover(entry: Entry): void {
    if (this.#host.doc.activeElement !== entry.element) entry.element.focus({ preventScroll: true });
    clearTimeout(this.#hoverTimer);
    this.#hoverTimer = setTimeout(() => {
      if (!this.isOpen) return;
      if (entry.submenu && !this.#isDisabled(entry.element)) this.#openSubmenu(entry.submenu, false);
      else this.#closeChildren(entry.level);
    }, HOVER_DELAY);
  }

  #activate(entry: Entry, source: 'keyboard' | 'pointer'): void {
    // Disabled items stay focusable (APG) but are never activated.
    if (this.#isDisabled(entry.element)) return;
    const { item } = entry;
    if (entry.submenu) {
      clearTimeout(this.#hoverTimer);
      this.#openSubmenu(entry.submenu, source === 'keyboard' || !entry.submenu.popover);
      return;
    }
    if (item.type === 'checkbox' || item.type === 'radio') {
      const checked = item.type === 'checkbox' ? !(this.#checked.get(item.id) ?? false) : true;
      if (item.type === 'radio') {
        for (const other of this.#entries.values()) {
          if (other.item.type === 'radio' && other.item.group === item.group && other.item.id !== item.id && this.#checked.get(other.item.id)) {
            this.#checked.set(other.item.id, false);
            this.#renderChecked(other.element);
          }
        }
      }
      this.#checked.set(item.id, checked);
      this.#renderChecked(entry.element);
      if (this.#host.config().closeOnSelect) this.closeAll(true);
      this.#host.select({ id: item.id, item, checked });
      return;
    }
    this.closeAll(true);
    this.#host.select({ id: item.id, item });
  }

  #openSubmenu(level: Level, focusFirst: boolean): void {
    const parent = level.parent;
    const parentItem = level.parentItem;
    if (!parent || !parentItem) return;
    if (parent.openChild && parent.openChild !== level) this.#closeLevel(parent.openChild);
    if (!level.popover) {
      const { direction } = this.#host.config();
      const inside: Element[] = [...this.#host.inside()];
      for (let l: Level | null = parent; l; l = l.parent) inside.push(l.element);
      level.popover = openPopover(level.element, {
        inside,
        onDismiss: (reason) => {
          if (reason === 'escape') {
            this.#closeLevel(level);
            parentItem.focus();
          } else {
            this.closeAll(false);
          }
        },
      });
      level.stopPosition = autoPosition(parentItem, level.element, { placement: direction === 'rtl' ? 'left-start' : 'right-start', offset: 0, direction });
      parentItem.setAttribute('aria-expanded', 'true');
      parent.openChild = level;
    }
    if (focusFirst) this.#focusEdge(level, 'first');
  }

  /** Close `level` and its open descendants (deepest first). */
  #closeLevel(level: Level): void {
    this.#closeChildren(level);
    if (!level.popover) return;
    level.stopPosition?.();
    level.stopPosition = null;
    level.popover.close();
    level.popover = null;
    level.parentItem?.setAttribute('aria-expanded', 'false');
    if (level.parent?.openChild === level) level.parent.openChild = null;
    this.#typeahead.reset();
  }

  #closeChildren(level: Level): void {
    if (level.openChild) this.#closeLevel(level.openChild);
  }
}
