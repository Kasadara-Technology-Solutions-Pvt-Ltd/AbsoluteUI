/**
 * Menu (SPEC section 18, R1 overlay component).
 * WAI-ARIA APG Menu Button + Menu (actions menu) with nested submenus.
 * Each menu level is a `popover="manual"` element in the top layer, inserted
 * after the trigger so it stays inside the trigger's modal dialog (not inert).
 * Real DOM focus moves between items (roving focus, tabindex -1). Every level is
 * registered in the overlay stack, so Escape closes only the topmost level.
 * The levels are rendered and driven by the shared menu engine (engine.ts), which
 * Menu Bar and Context Menu reuse.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, validators } from '@absoluteui/core';
import type { Placement } from '@absoluteui/utilities';
import { assertMenuItems, MenuEngine, type MenuIcons, type MenuItem, type MenuRenderItem, type MenuSelectDetail } from './engine.js';

export type {
  MenuActionItem,
  MenuCheckboxItem,
  MenuRadioItem,
  MenuSeparator,
  MenuGroup,
  MenuItem,
  MenuSelectableItem,
  MenuIcons,
  MenuSelectDetail,
  MenuRenderContext,
  MenuRenderItem,
} from './engine.js';

const PLACEMENTS = [
  'top', 'top-start', 'top-end', 'bottom', 'bottom-start', 'bottom-end',
  'left', 'left-start', 'left-end', 'right', 'right-start', 'right-end',
] as const satisfies readonly Placement[];

export type MenuPlacement = (typeof PLACEMENTS)[number];

export interface MenuConfig {
  placement: MenuPlacement;
  closeOnSelect: boolean;
  typeahead: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    menu: MenuConfig & { direction: 'ltr' | 'rtl' };
  }
}

export const menuConfig = defineComponentConfig<MenuConfig, 'direction'>(
  'menu',
  {
    placement: { default: 'bottom-start', expected: 'Placement, e.g. "bottom-start"', validate: validators.oneOf(PLACEMENTS) },
    closeOnSelect: { default: true, expected: 'boolean', validate: validators.isBoolean },
    typeahead: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['direction'],
);

export interface MenuOptions extends Partial<MenuConfig> {
  items: readonly MenuItem[];
  /** Custom item content (since 0.9.0); the label stays the accessible name. Nodes are released with `releaseNode`. */
  renderItem?: MenuRenderItem | undefined;
  /** Accessible name of the menu. Default: labelled by the trigger (aria-labelledby). */
  label?: string | undefined;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<MenuIcons>;
}

export class Menu {
  readonly trigger: HTMLButtonElement;
  /** Top-level `role="menu"` popup. */
  readonly element: HTMLDivElement;
  #options: MenuOptions;
  readonly #engine: MenuEngine;
  readonly #group = new DisposableGroup();
  #assignedTriggerId: string | null = null;

  /** Attach a menu to a trigger button. The popup is inserted after the trigger. */
  static create(trigger: HTMLButtonElement, options: MenuOptions): Menu {
    return new Menu(trigger, options);
  }

  private constructor(trigger: HTMLButtonElement, options: MenuOptions) {
    // localName instead of instanceof: works for triggers from other realms (iframes).
    if ((trigger as Element | null)?.localName !== 'button' || !trigger.parentNode) {
      throw configurationError('MENU_TRIGGER', 'Menu requires a <button> trigger that is attached to a parent node.', {
        component: 'menu',
        property: 'menu.trigger',
        expected: 'HTMLButtonElement with a parent node',
      });
    }
    Menu.#assertOptions(options);
    this.trigger = trigger;
    this.#options = { ...options };

    // Render first (detached): invalid config throws before anything is attached.
    this.#engine = new MenuEngine(
      {
        doc: trigger.ownerDocument,
        inside: () => [this.trigger],
        anchor: () => this.trigger,
        config: () => this.#config(),
        restoreFocus: () => {
          this.trigger.focus();
        },
        select: (detail: MenuSelectDetail) => {
          emit(this.trigger, 'aui-select', detail);
        },
        opened: () => {
          this.trigger.setAttribute('aria-expanded', 'true');
        },
        closed: () => {
          this.trigger.setAttribute('aria-expanded', 'false');
        },
      },
      { items: this.#options.items, icons: this.#options.icons, renderItem: this.#options.renderItem },
    );
    const el = this.#engine.element;
    this.element = el;

    trigger.after(el, ...this.#engine.submenus);
    if (!trigger.id) {
      this.#assignedTriggerId = createId('aui-menu-trigger');
      trigger.id = this.#assignedTriggerId;
    }
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', el.id);
    this.#renderLabel();

    this.#bindTrigger();
    this.#engine.bind();
    this.#group.add(menuConfig.subscribe(() => {
      this.#engine.applyConfig();
    }));
  }

  get isOpen(): boolean {
    return this.#engine.isOpen;
  }

  update(options: Partial<MenuOptions>): void {
    const next = { ...this.#options, ...options };
    Menu.#assertOptions(next);
    this.#options = next;
    this.#engine.setOptions({ items: next.items, icons: next.icons, renderItem: next.renderItem }, 'items' in options);
    this.#renderLabel();
  }

  /** Open the menu and focus its first (default) or last enabled item. */
  open(focus: 'first' | 'last' = 'first'): void {
    this.#engine.open(focus);
  }

  /** Close all levels. Focus returns to the trigger only when it was inside the menu. */
  close(): void {
    this.#engine.closeAll(this.#engine.focusInside());
  }

  destroy(): void {
    this.#engine.destroy();
    this.#group.dispose();
    this.trigger.removeAttribute('aria-haspopup');
    this.trigger.removeAttribute('aria-expanded');
    this.trigger.removeAttribute('aria-controls');
    if (this.#assignedTriggerId !== null && this.trigger.id === this.#assignedTriggerId) this.trigger.removeAttribute('id');
  }

  #config(): Readonly<MenuConfig & { direction: 'ltr' | 'rtl' }> {
    const o = this.#options;
    return menuConfig.resolve({
      ...(o.placement === undefined ? {} : { placement: o.placement }),
      ...(o.closeOnSelect === undefined ? {} : { closeOnSelect: o.closeOnSelect }),
      ...(o.typeahead === undefined ? {} : { typeahead: o.typeahead }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  static #assertOptions(options: MenuOptions): void {
    if (options.label !== undefined && (typeof options.label !== 'string' || options.label.trim() === '')) {
      throw configurationError('MENU_OPTIONS', 'Invalid menu options.', { component: 'menu', property: 'menu.label', expected: 'non-empty string' });
    }
    assertMenuItems(options.items, 'MENU_OPTIONS', 'menu');
    if (options.renderItem !== undefined && typeof options.renderItem !== 'function') {
      throw configurationError('MENU_OPTIONS', 'Invalid menu options.', { component: 'menu', property: 'menu.renderItem', expected: 'function (item, { doc }) => Node' });
    }
  }

  #renderLabel(): void {
    const label = this.#options.label;
    if (label !== undefined) {
      this.element.setAttribute('aria-label', label);
      this.element.removeAttribute('aria-labelledby');
    } else {
      this.element.removeAttribute('aria-label');
      this.element.setAttribute('aria-labelledby', this.trigger.id);
    }
  }

  #bindTrigger(): void {
    const g = this.#group;
    g.listen(this.trigger, 'click', () => {
      if (this.isOpen) this.#engine.closeAll(false);
      else this.open('first');
    });
    g.listen(this.trigger, 'keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      this.open(event.key === 'ArrowDown' ? 'first' : 'last');
    });
  }
}
