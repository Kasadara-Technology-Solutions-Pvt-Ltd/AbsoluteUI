/**
 * Context Menu (SPEC section 18.12). A Menu (WAI-ARIA APG Menu, same engine as Menu) opened
 * on the `contextmenu` event at the pointer position, or from the keyboard with
 * Shift+F10 or the ContextMenu key at the focused element inside the target. The
 * native browser menu stays available: with `nativeModifier: 'shift'` (default),
 * Shift+right-click is left to the browser. Popups are appended to the target's
 * enclosing modal <dialog> (or <body>), so they are never inert.
 */
import { configurationError, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, validators } from '@absoluteui/core';
import { createFocusRestore, isFocusable, type FocusRestore, type VirtualAnchor } from '@absoluteui/utilities';
import { assertMenuItems, MenuEngine, type MenuIcons, type MenuItem, type MenuRenderItem, type MenuSelectDetail } from '../menu/engine.js';

export type ContextMenuNativeModifier = 'shift' | 'none';

export interface ContextMenuConfig {
  closeOnSelect: boolean;
  typeahead: boolean;
  /** Modifier that leaves a right-click to the browser's native menu. */
  nativeModifier: ContextMenuNativeModifier;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    contextMenu: ContextMenuConfig & { direction: 'ltr' | 'rtl' };
  }
}

export const contextMenuConfig = defineComponentConfig<ContextMenuConfig, 'direction'>(
  'contextMenu',
  {
    closeOnSelect: { default: true, expected: 'boolean', validate: validators.isBoolean },
    typeahead: { default: true, expected: 'boolean', validate: validators.isBoolean },
    nativeModifier: { default: 'shift', expected: '"shift" | "none"', validate: validators.oneOf(['shift', 'none'] as const) },
  },
  ['direction'],
);

registerMessages('contextMenu', 'en', { label: 'Context menu' });

export interface ContextMenuOptions extends Partial<ContextMenuConfig> {
  items: readonly MenuItem[];
  /** Accessible name of the menu. Default: localized "Context menu". */
  label?: string;
  /** While true, the target keeps the native browser menu. */
  disabled?: boolean;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<MenuIcons>;
  /** Custom item content (since 0.9.0); the label stays the accessible name. Nodes are released with `releaseNode`. */
  renderItem?: MenuRenderItem | undefined;
}

export interface ContextMenuSelectDetail extends MenuSelectDetail {
  /** Element the menu was opened for: the right-clicked element or the focused element. */
  origin: Element;
}

/** Offset between the pointer and the menu corner, px, so the first item is not under the pointer. */
const POINTER_OFFSET = 1;

export class ContextMenu {
  readonly target: HTMLElement;
  /** Top-level `role="menu"` popup. */
  readonly element: HTMLDivElement;
  #options: ContextMenuOptions;
  readonly #doc: Document;
  readonly #engine: MenuEngine;
  readonly #group = new DisposableGroup();
  #anchor: Element | VirtualAnchor;
  #origin: Element | null = null;
  #restore: FocusRestore | null = null;

  /** Attach a context menu to `target` (an element that contains the right-clickable content). */
  static create(target: HTMLElement, options: ContextMenuOptions): ContextMenu {
    return new ContextMenu(target, options);
  }

  private constructor(target: HTMLElement, options: ContextMenuOptions) {
    if (!(target instanceof HTMLElement) || !target.isConnected) {
      throw configurationError('CONTEXT_MENU_TARGET', 'Context menu requires a connected target element.', {
        component: 'context-menu',
        property: 'contextMenu.target',
        expected: 'connected HTMLElement',
      });
    }
    ContextMenu.#assertOptions(options);
    this.target = target;
    this.#doc = target.ownerDocument;
    this.#options = { ...options };
    this.#anchor = target;

    // Render first (detached): invalid config throws before anything is attached.
    this.#engine = new MenuEngine(
      {
        doc: this.#doc,
        inside: () => [],
        anchor: () => this.#anchor,
        config: () => ({ ...this.#config(), placement: 'bottom-start', offset: this.#anchor instanceof Element ? 4 : 0 }),
        restoreFocus: () => {
          this.#restore?.restore({ preventScroll: true });
        },
        select: (detail: MenuSelectDetail) => {
          emit(this.target, 'aui-select', { ...detail, origin: this.#origin ?? this.target } satisfies ContextMenuSelectDetail);
        },
        opened: () => undefined,
        closed: () => undefined,
      },
      { items: this.#options.items, icons: this.#options.icons, renderItem: this.#options.renderItem },
    );
    this.element = this.#engine.element;
    this.element.classList.add('aui-menu--context');
    this.#renderLabel();
    // Inside a modal <dialog> everything outside it is inert.
    (target.closest('dialog') ?? this.#doc.body).append(...this.#engine.popups);

    const g = this.#group;
    g.listen(target, 'contextmenu', (event) => {
      this.#onContextMenu(event);
    });
    g.listen(target, 'keydown', (event) => {
      // A nested target's context menu already handled it (innermost wins).
      if (event.defaultPrevented || !ContextMenu.#isMenuKey(event) || this.#options.disabled === true) return;
      if (event.target instanceof Node && this.#engine.contains(event.target)) return;
      event.preventDefault();
      const origin = event.target instanceof Element ? event.target : target;
      this.#openAt(origin, origin);
    });
    // The browser's own menu must not open over ours (right-click or Menu key inside the popup).
    g.listen(this.#doc, 'contextmenu', (event) => {
      if (event.target instanceof Node && this.#engine.contains(event.target)) event.preventDefault();
    });
    this.#engine.bind();
    g.add(contextMenuConfig.subscribe(() => {
      this.#engine.applyConfig();
    }));
  }

  get isOpen(): boolean {
    return this.#engine.isOpen;
  }

  /** Element the open (or last opened) menu belongs to. */
  get origin(): Element | null {
    return this.#origin;
  }

  get options(): Readonly<ContextMenuOptions> {
    return this.#options;
  }

  /**
   * Open programmatically at client coordinates (relative to the viewport), or below
   * the target when no point is given. Focus moves to the first enabled item.
   */
  open(point?: { x: number; y: number }): void {
    if (point !== undefined && (!Number.isFinite(point.x) || !Number.isFinite(point.y))) this.#fail('open.point', '{ x: number; y: number } with finite values');
    this.#openAt(this.target, point === undefined ? this.target : this.#pointAnchor(point.x, point.y));
  }

  /** Close all levels. Focus returns to the origin only when it was inside the menu. */
  close(): void {
    this.#engine.closeAll(this.#engine.focusInside());
  }

  update(options: Partial<ContextMenuOptions>): void {
    const next = { ...this.#options, ...options };
    ContextMenu.#assertOptions(next);
    const previous = this.#options;
    this.#options = next;
    try {
      this.#config();
    } catch (error) {
      this.#options = previous;
      throw error;
    }
    this.#engine.setOptions({ items: next.items, icons: next.icons, renderItem: next.renderItem }, 'items' in options);
    this.#renderLabel();
    if (next.disabled === true && this.isOpen) this.close();
  }

  destroy(): void {
    this.#engine.destroy();
    this.#group.dispose();
    this.#restore = null;
    this.#origin = null;
  }

  static #isMenuKey(event: KeyboardEvent): boolean {
    if (event.key === 'ContextMenu') return !event.ctrlKey && !event.metaKey && !event.altKey;
    return event.key === 'F10' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
  }

  #config(): Readonly<ContextMenuConfig & { direction: 'ltr' | 'rtl' }> {
    const o = this.#options;
    return contextMenuConfig.resolve({
      ...(o.closeOnSelect === undefined ? {} : { closeOnSelect: o.closeOnSelect }),
      ...(o.typeahead === undefined ? {} : { typeahead: o.typeahead }),
      ...(o.nativeModifier === undefined ? {} : { nativeModifier: o.nativeModifier }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #fail(property: string, expected: string): never {
    throw configurationError('CONTEXT_MENU_OPTIONS', 'Invalid context menu options.', { component: 'context-menu', property: `contextMenu.${property}`, expected });
  }

  static #assertOptions(options: ContextMenuOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('CONTEXT_MENU_OPTIONS', 'Invalid context menu options.', { component: 'context-menu', property: `contextMenu.${property}`, expected });
    };
    if (options.label !== undefined && (typeof options.label !== 'string' || options.label.trim() === '')) fail('label', 'non-empty string');
    const disabled: unknown = options.disabled;
    if (disabled !== undefined && typeof disabled !== 'boolean') fail('disabled', 'boolean');
    assertMenuItems(options.items, 'CONTEXT_MENU_OPTIONS', 'context-menu');
    if (options.renderItem !== undefined && typeof options.renderItem !== 'function') fail('renderItem', 'function (item, { doc }) => Node');
  }

  #renderLabel(): void {
    this.element.setAttribute('aria-label', this.#options.label ?? getMessage('contextMenu', 'label'));
  }

  #onContextMenu(event: MouseEvent): void {
    // Inside the popup (only when the target contains it, e.g. <body>): handled at the document.
    if (event.target instanceof Node && this.#engine.contains(event.target)) return;
    // A nested target's context menu already handled it (innermost wins).
    if (event.defaultPrevented || this.#options.disabled === true) return;
    if (this.#config().nativeModifier === 'shift' && event.shiftKey) return;
    event.preventDefault();
    const origin = event.target instanceof Element ? event.target : this.target;
    // Keyboard-generated contextmenu events (Menu key handled by the browser) carry no pointer position.
    const fromKeyboard = event.button !== 2 && event.clientX === 0 && event.clientY === 0;
    if (fromKeyboard) {
      const focused = this.#doc.activeElement;
      const anchor = focused instanceof Element && this.target.contains(focused) ? focused : this.target;
      this.#openAt(anchor, anchor);
      return;
    }
    this.#openAt(origin, this.#pointAnchor(event.clientX, event.clientY));
  }

  /** A zero-size anchor at a client point that moves with the target when it scrolls. */
  #pointAnchor(x: number, y: number): VirtualAnchor {
    const start = this.target.getBoundingClientRect();
    const dx = x - start.left + POINTER_OFFSET;
    const dy = y - start.top + POINTER_OFFSET;
    return {
      getBoundingClientRect: () => {
        const r = this.target.getBoundingClientRect();
        return { x: r.left + dx, y: r.top + dy, width: 0, height: 0 };
      },
    };
  }

  #openAt(origin: Element, anchor: Element | VirtualAnchor): void {
    if (this.#engine.isOpen) this.#engine.closeAll(false);
    this.#origin = origin;
    this.#anchor = anchor;
    const target = this.target;
    this.#restore = createFocusRestore(this.#doc, () => (isFocusable(target) ? target : null));
    this.#engine.open('first');
  }
}
