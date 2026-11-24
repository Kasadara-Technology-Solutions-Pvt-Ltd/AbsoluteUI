/**
 * Menu Bar (SPEC section 18.12, WAI-ARIA APG Menubar pattern). A horizontal `role="menubar"`
 * of `role="menuitem"` buttons with one tab stop (roving tabindex). Items with `items`
 * open a Menu (the same component and engine as Menu, so submenus, checkbox and radio
 * items, typeahead, and the overlay stack behave identically); items without open
 * nothing. Every selection is dispatched as `aui-select` on the host. While a menu is open, ArrowLeft/ArrowRight (mirrored
 * in RTL) move to the neighbouring menubar item and open its menu, and hovering
 * another menubar item switches menus.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, validators, type Direction } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { createTypeahead, getNextIndex, isPrintableKey } from '@absoluteui/utilities';
import { Menu } from '../menu/menu.js';
import { assertMenuItems, type MenuIcons, type MenuItem, type MenuRenderItem, type MenuSelectDetail } from '../menu/engine.js';

export interface MenuBarConfig {
  closeOnSelect: boolean;
  typeahead: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    menuBar: MenuBarConfig & { direction: Direction };
  }
}

export const menuBarConfig = defineComponentConfig<MenuBarConfig, 'direction'>(
  'menuBar',
  {
    closeOnSelect: { default: true, expected: 'boolean', validate: validators.isBoolean },
    typeahead: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['direction'],
);

export interface MenuBarItem {
  /** Unique across the menubar and all of its menus. */
  id: string;
  label: string;
  /** Decorative icon before the label. */
  icon?: IconRef;
  /** Focusable (aria-disabled) but never opens or emits. */
  disabled?: boolean;
  /** Menu items. Without them the item is a command that emits `aui-select`. */
  items?: readonly MenuItem[];
}

export interface MenuBarOptions extends Partial<MenuBarConfig> {
  /** Accessible name of the menubar (required). */
  label: string;
  items: readonly MenuBarItem[];
  direction?: Direction;
  icons?: Partial<MenuIcons>;
  /** Custom content of the items in the menus (since 0.9.0; not the menubar buttons); the label stays the accessible name. */
  renderItem?: MenuRenderItem | undefined;
}

/** `item` is the activated menu item, or the menubar item for commands without a menu. */
export type MenuBarSelectDetail = MenuSelectDetail;

interface Entry {
  readonly item: MenuBarItem;
  readonly wrapper: HTMLDivElement;
  readonly button: HTMLButtonElement;
  readonly menu: Menu | null;
}

/** Not a type guard on purpose: narrowing a typed readonly array through Array.isArray yields any[]. */
function isNonEmptyList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export class MenuBar {
  readonly host: HTMLElement;
  /** The `role="menubar"` element. */
  readonly element: HTMLDivElement;
  #options: MenuBarOptions;
  readonly #doc: Document;
  #entries: Entry[] = [];
  readonly #group = new DisposableGroup();
  readonly #typeahead = createTypeahead();

  /** Render a menubar into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: MenuBarOptions): MenuBar {
    return new MenuBar(host, options);
  }

  private constructor(host: HTMLElement, options: MenuBarOptions) {
    MenuBar.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    // Resolving validates configuration before anything is rendered.
    this.#config();

    const bar = this.#doc.createElement('div');
    bar.className = 'aui-menu-bar__bar';
    bar.setAttribute('role', 'menubar');
    this.element = bar;
    host.classList.add('aui-menu-bar');
    host.replaceChildren(bar);
    this.#render();

    const g = this.#group;
    g.listen(bar, 'keydown', (event) => {
      this.#onKeyDown(event);
    });
    g.listen(bar, 'click', (event) => {
      const entry = this.#entryForButton(event.target);
      if (!entry || entry.menu || entry.item.disabled) return;
      emit(this.host, 'aui-select', { id: entry.item.id, item: entry.item } satisfies MenuBarSelectDetail);
    });
    // Menus dispatch aui-select on their trigger (a menubar item); re-dispatch it on the host
    // so every selection has one target, the component host.
    const onMenuSelect = (event: Event): void => {
      event.stopPropagation();
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      emit(this.host, 'aui-select', detail);
    };
    bar.addEventListener('aui-select', onMenuSelect);
    g.add(() => {
      bar.removeEventListener('aui-select', onMenuSelect);
    });
    g.listen(bar, 'focusin', (event) => {
      const entry = this.#entryForButton(event.target);
      if (entry) this.#setTabStop(entry);
    });
    // Real pointer movement only (pointerover also fires when content appears under a still cursor).
    g.listen(bar, 'pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const entry = this.#entryForButton(event.target);
      const open = this.#openEntry();
      if (!entry || !open || open === entry) return;
      this.#switchTo(entry);
    });
    g.add(menuBarConfig.subscribe(() => {
      this.#applyConfig();
    }));
  }

  get options(): Readonly<MenuBarOptions> {
    return this.#options;
  }

  /** The Menu opened by a menubar item, or null for commands and unknown ids. */
  menu(id: string): Menu | null {
    return this.#entries.find((e) => e.item.id === id)?.menu ?? null;
  }

  /** Close any open menu. Focus returns to its menubar item when it was inside the menu. */
  close(): void {
    this.#openEntry()?.menu?.close();
  }

  update(options: Partial<MenuBarOptions>): void {
    const next = { ...this.#options, ...options };
    MenuBar.#assertOptions(next);
    const previous = this.#options;
    this.#options = next;
    try {
      this.#config();
    } catch (error) {
      this.#options = previous;
      throw error;
    }
    // Only new items or icons rebuild the menus; other options update them in place, so an
    // open menu, focus, and checkbox/radio state survive.
    if ('items' in options || 'icons' in options || 'renderItem' in options) this.#render();
    else this.#applyConfig();
  }

  destroy(): void {
    this.#typeahead.reset();
    for (const e of this.#entries) e.menu?.destroy();
    this.#entries = [];
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-menu-bar', 'aui-menu-bar--rtl');
  }

  #config(): Readonly<MenuBarConfig & { direction: Direction }> {
    const o = this.#options;
    return menuBarConfig.resolve({
      ...(o.closeOnSelect === undefined ? {} : { closeOnSelect: o.closeOnSelect }),
      ...(o.typeahead === undefined ? {} : { typeahead: o.typeahead }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  static #assertOptions(options: MenuBarOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('MENU_BAR_OPTIONS', 'Invalid menu bar options.', { component: 'menu-bar', property: `menuBar.${property}`, expected });
    };
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (!isNonEmptyList(options.items)) fail('items', 'non-empty array of menubar items');
    if (options.renderItem !== undefined && typeof options.renderItem !== 'function') fail('renderItem', 'function (item, { doc }) => Node');
    // One id space for the menubar items and their menus: aui-select ids never collide.
    const tree: MenuItem[] = options.items.map((item) => {
      const raw: unknown = item;
      if (typeof raw !== 'object' || raw === null) fail('items', 'array of menubar item objects');
      const disabled: unknown = item.disabled;
      if (disabled !== undefined && typeof disabled !== 'boolean') fail(`items.${item.id}.disabled`, 'boolean');
      if (item.items !== undefined && (!Array.isArray(item.items) || item.items.length === 0)) fail(`items.${item.id}.items`, 'non-empty array of menu items');
      return { id: item.id, label: item.label, ...(item.items === undefined ? {} : { items: item.items }) };
    });
    assertMenuItems(tree, 'MENU_BAR_OPTIONS', 'menu-bar');
  }

  /** Effective direction: explicit configuration, or the host's inherited `dir`. */
  #direction(): Direction {
    return this.#config().direction === 'rtl' || this.host.matches(':dir(rtl)') ? 'rtl' : 'ltr';
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const direction = this.#direction();
    const doc = this.#doc;
    const focusedId = this.#entryForButton(doc.activeElement)?.item.id;
    const stopId = this.#entries.find((e) => e.button.tabIndex === 0)?.item.id;
    for (const e of this.#entries) e.menu?.destroy();

    this.#entries = o.items.map((item) => {
      const wrapper = doc.createElement('div');
      wrapper.className = 'aui-menu-bar__entry';
      wrapper.setAttribute('role', 'none');
      const button = doc.createElement('button');
      button.type = 'button';
      button.id = createId('aui-menu-bar-item');
      button.className = 'aui-menu-bar__item';
      button.setAttribute('role', 'menuitem');
      button.tabIndex = -1;
      button.dataset.id = item.id;
      if (item.disabled) button.setAttribute('aria-disabled', 'true');
      if (item.icon !== undefined) button.append(renderIcon(item.icon, { doc, className: 'aui-menu-bar__icon' }));
      const label = doc.createElement('span');
      label.className = 'aui-menu-bar__label';
      label.textContent = item.label;
      button.append(label);
      wrapper.append(button);
      const menu = item.items && !item.disabled
        ? Menu.create(button, {
            items: item.items,
            placement: 'bottom-start',
            closeOnSelect: config.closeOnSelect,
            typeahead: config.typeahead,
            direction,
            ...(o.icons === undefined ? {} : { icons: o.icons }),
            ...(o.renderItem === undefined ? {} : { renderItem: o.renderItem }),
          })
        : null;
      if (item.items && item.disabled) {
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
      }
      return { item, wrapper, button, menu };
    });
    this.element.replaceChildren(...this.#entries.map((e) => e.wrapper));

    const stop = this.#entries.find((e) => e.item.id === stopId) ?? this.#entries.find((e) => !e.item.disabled) ?? this.#entries[0];
    if (stop) this.#setTabStop(stop);
    if (focusedId !== undefined) this.#entries.find((e) => e.item.id === focusedId)?.button.focus();
    this.#applyConfig();
  }

  /** Label, direction, and behavior options, applied to the existing menus. */
  #applyConfig(): void {
    const config = this.#config();
    const direction = this.#direction();
    this.element.setAttribute('aria-label', this.#options.label);
    this.host.classList.toggle('aui-menu-bar--rtl', direction === 'rtl');
    for (const e of this.#entries) e.menu?.update({ closeOnSelect: config.closeOnSelect, typeahead: config.typeahead, direction });
  }

  #setTabStop(entry: Entry): void {
    for (const e of this.#entries) e.button.tabIndex = e === entry ? 0 : -1;
  }

  #entryForButton(target: EventTarget | null): Entry | undefined {
    if (!(target instanceof Element)) return undefined;
    return this.#entries.find((e) => e.button === target || e.button.contains(target));
  }

  #entryForMenuTarget(target: EventTarget | null): Entry | undefined {
    if (!(target instanceof Element)) return undefined;
    const wrapper = target.closest('.aui-menu-bar__entry');
    return this.#entries.find((e) => e.wrapper === wrapper);
  }

  #openEntry(): Entry | undefined {
    return this.#entries.find((e) => e.menu?.isOpen === true);
  }

  #isDisabled(index: number): boolean {
    return this.#entries[index]?.item.disabled === true;
  }

  #switchTo(entry: Entry): void {
    this.#openEntry()?.menu?.close();
    this.#setTabStop(entry);
    entry.button.focus();
    if (entry.menu) entry.menu.open('first');
  }

  #onKeyDown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const rtl = this.#direction() === 'rtl';
    const nextKey = rtl ? 'ArrowLeft' : 'ArrowRight';
    const previousKey = rtl ? 'ArrowRight' : 'ArrowLeft';
    const target = event.target;
    const onButton = this.#entryForButton(target);

    if (!onButton) {
      // Inside an open menu: the menu handled everything it needs (preventDefault);
      // unhandled ArrowLeft/ArrowRight move to the neighbouring menubar item.
      if (event.defaultPrevented || (event.key !== nextKey && event.key !== previousKey)) return;
      const from = this.#entryForMenuTarget(target);
      if (!from) return;
      event.preventDefault();
      const index = this.#entries.indexOf(from);
      const next = getNextIndex(event.key === nextKey ? 'ArrowRight' : 'ArrowLeft', index, this.#entries.length, { orientation: 'horizontal', loop: true });
      const entry = next === null ? undefined : this.#entries[next];
      if (entry) this.#switchTo(entry);
      return;
    }

    const index = this.#entries.indexOf(onButton);
    const next = getNextIndex(event.key, index, this.#entries.length, { orientation: 'horizontal', loop: true, direction: rtl ? 'rtl' : 'ltr' });
    if (next !== null) {
      event.preventDefault();
      this.#typeahead.reset();
      const entry = this.#entries[next];
      if (entry) {
        this.#setTabStop(entry);
        entry.button.focus();
      }
      return;
    }
    if (this.#config().typeahead && isPrintableKey(event) && event.key !== ' ') {
      const found = this.#typeahead.handle(event.key, this.#entries.map((e) => e.item.label), index, (i) => this.#isDisabled(i));
      const entry = found >= 0 ? this.#entries[found] : undefined;
      if (entry) {
        event.preventDefault();
        this.#setTabStop(entry);
        entry.button.focus();
      }
    }
  }
}
