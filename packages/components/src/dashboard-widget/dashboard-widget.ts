/**
 * Dashboard Widget (SPEC section 18.17: Widget Container, Collapsible Widget, Dashboard
 * Tile). Enhances a host element into a titled panel: a header with a heading and
 * actions (custom icon buttons, collapse, maximize, remove) is inserted as the
 * first child; the host's other children are the body and stay where they are
 * (framework-owned content is never moved). Collapse is a disclosure button.
 * Maximize shows the widget in the top layer as a modal dialog (focus trapped,
 * page scroll locked, Escape restores). Remove emits a cancelable event: the
 * application removes the widget (or its grid item).
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { createFocusTrap, lockScroll, registerOverlayLayer, type FocusTrap } from '@absoluteui/utilities';

export interface DashboardWidgetConfig {
  /** Show the collapse button. Default true. */
  collapsible: boolean;
  /** Show the maximize button. Default true. */
  maximizable: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    dashboardWidget: DashboardWidgetConfig & { locale: string; direction: Direction };
  }
}

export const dashboardWidgetConfig = defineComponentConfig<DashboardWidgetConfig, 'locale' | 'direction'>(
  'dashboardWidget',
  {
    collapsible: { default: true, expected: 'boolean', validate: validators.isBoolean },
    maximizable: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

export interface DashboardWidgetAction {
  id: string;
  /** Accessible name and tooltip. */
  label: string;
  icon: IconRef;
}

export interface DashboardWidgetOptions extends Partial<DashboardWidgetConfig> {
  /** Heading text. */
  title: string;
  /** Heading level 2-6. Default 3. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** Supporting text under the heading. */
  subtitle?: string;
  /** Extra header buttons; activation emits `aui-action`. */
  actions?: readonly DashboardWidgetAction[];
  /** Show a remove button that emits the cancelable `aui-remove`. Default false. */
  removable?: boolean;
  /** Initial and controlled collapsed state. */
  collapsed?: boolean;
  /** Mark the body busy (aria-busy) while content loads. */
  busy?: boolean;
  locale?: string;
  direction?: Direction;
}

/** Detail of `aui-toggle`. */
export interface DashboardWidgetToggleDetail {
  collapsed: boolean;
}

/** Detail of `aui-maximize`. */
export interface DashboardWidgetMaximizeDetail {
  maximized: boolean;
}

/** Detail of the cancelable `aui-remove`. */
export interface DashboardWidgetRemoveDetail {
  /** The host's `data-aui-item` (its dashboard item id), if any. */
  id: string | null;
}

/** Detail of `aui-action`. */
export interface DashboardWidgetActionDetail {
  id: string;
}

registerMessages('dashboardWidget', 'en', {
  collapse: 'Collapse {title}',
  expand: 'Expand {title}',
  maximize: 'Maximize {title}',
  restore: 'Restore {title}',
  remove: 'Remove {title}',
});

function fail(property: string, expected: string): never {
  throw configurationError('DASHBOARD_WIDGET_OPTIONS', 'Invalid dashboard widget options.', { component: 'dashboardWidget', property: `dashboardWidget.${property}`, expected });
}

export class DashboardWidget {
  readonly host: HTMLElement;
  #options: DashboardWidgetOptions;
  readonly #group = new DisposableGroup();
  readonly #header: HTMLDivElement;
  readonly #heading: HTMLElement;
  readonly #title: HTMLSpanElement;
  readonly #subtitle: HTMLParagraphElement;
  readonly #actions: HTMLDivElement;
  #collapsed: boolean;
  #maximized = false;
  #trap: FocusTrap | null = null;
  #unlock: (() => void) | null = null;
  #unlayer: (() => void) | null = null;
  #savedRole: string | null = null;

  /** Enhance `host`: the header is inserted as its first child. */
  static create(host: HTMLElement, options: DashboardWidgetOptions): DashboardWidget {
    return new DashboardWidget(host, options);
  }

  private constructor(host: HTMLElement, options: DashboardWidgetOptions) {
    DashboardWidget.#assert(options);
    this.host = host;
    this.#options = { ...options };
    this.#collapsed = options.collapsed === true;
    this.#config();
    const doc = host.ownerDocument;
    this.#header = doc.createElement('div');
    this.#header.className = 'aui-widget__header';
    this.#heading = doc.createElement(`h${String(options.headingLevel ?? 3)}`);
    this.#heading.className = 'aui-widget__heading';
    this.#title = doc.createElement('span');
    this.#title.className = 'aui-widget__title';
    this.#title.id = createId('aui-widget-title');
    this.#heading.append(this.#title);
    this.#subtitle = doc.createElement('p');
    this.#subtitle.className = 'aui-widget__subtitle';
    const titles = doc.createElement('div');
    titles.className = 'aui-widget__titles';
    titles.append(this.#heading, this.#subtitle);
    this.#actions = doc.createElement('div');
    this.#actions.className = 'aui-widget__actions';
    this.#header.append(titles, this.#actions);
    this.#render();
    host.classList.add('aui-widget');
    host.prepend(this.#header);
    this.#group.add(dashboardWidgetConfig.subscribe(() => {
      this.#render();
    }));
  }

  get collapsed(): boolean {
    return this.#collapsed;
  }

  get maximized(): boolean {
    return this.#maximized;
  }

  /** The inserted header element. */
  get header(): HTMLDivElement {
    return this.#header;
  }

  update(options: Partial<DashboardWidgetOptions>): void {
    const next = { ...this.#options, ...options };
    DashboardWidget.#assert(next);
    if (options.headingLevel !== undefined && options.headingLevel !== this.#options.headingLevel) fail('headingLevel', 'unchanged after create (recreate the widget)');
    this.#options = next;
    if (options.collapsed !== undefined) this.#collapsed = options.collapsed;
    this.#render();
  }

  /** Collapse or expand (no event). */
  setCollapsed(collapsed: boolean): void {
    this.#collapsed = collapsed;
    this.#render();
  }

  /** Maximize into a modal dialog, or restore (emits `aui-maximize`). */
  setMaximized(maximized: boolean): void {
    if (maximized === this.#maximized) return;
    if (maximized) this.#maximize();
    else this.#restore();
    const detail: DashboardWidgetMaximizeDetail = { maximized };
    emit(this.host, 'aui-maximize', detail, { bubbles: false });
  }

  destroy(): void {
    if (this.#maximized) this.#restore();
    this.#group.dispose();
    this.#header.remove();
    this.host.classList.remove('aui-widget', 'aui-widget--collapsed', 'aui-widget--maximized');
    this.host.removeAttribute('aria-busy');
    this.host.removeAttribute('aria-labelledby');
    if (this.host.getAttribute('role') === 'region') this.host.removeAttribute('role');
  }

  static #assert(o: DashboardWidgetOptions): void {
    if (typeof o.title !== 'string' || o.title.trim() === '') fail('title', 'non-empty string');
    if (o.headingLevel !== undefined && ![2, 3, 4, 5, 6].includes(o.headingLevel)) fail('headingLevel', '2 | 3 | 4 | 5 | 6');
    if (o.subtitle !== undefined && typeof o.subtitle !== 'string') fail('subtitle', 'string');
    for (const key of ['removable', 'collapsed', 'busy', 'collapsible', 'maximizable'] as const) if (o[key] !== undefined && typeof o[key] !== 'boolean') fail(key, 'boolean');
    const actions: unknown = o.actions;
    if (actions !== undefined) {
      if (!Array.isArray(actions)) fail('actions', 'DashboardWidgetAction[]');
      const ids = new Set<string>();
      actions.forEach((a: unknown, i) => {
        if (!validators.isRecord(a) || typeof a.id !== 'string' || a.id === '' || ids.has(a.id)) fail(`actions[${String(i)}].id`, 'unique non-empty string');
        ids.add(a.id);
        if (typeof a.label !== 'string' || a.label === '') fail(`actions[${String(i)}].label`, 'non-empty string');
      });
    }
  }

  #config(): Readonly<DashboardWidgetConfig & { locale: string; direction: Direction }> {
    const o = this.#options;
    const input: Partial<DashboardWidgetConfig & { locale: string; direction: Direction }> = {};
    if (o.collapsible !== undefined) input.collapsible = o.collapsible;
    if (o.maximizable !== undefined) input.maximizable = o.maximizable;
    if (o.locale !== undefined) input.locale = o.locale;
    if (o.direction !== undefined) input.direction = o.direction;
    return dashboardWidgetConfig.resolve(input);
  }

  #msg(key: string): string {
    return getMessage('dashboardWidget', key, { title: this.#options.title }, this.#config().locale);
  }

  #button(className: string, icon: IconRef, label: string, onClick: () => void): HTMLButtonElement {
    const doc = this.host.ownerDocument;
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = `aui-widget__action ${className}`;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.append(renderIcon(icon, { doc }));
    b.addEventListener('click', onClick);
    return b;
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    this.#title.textContent = o.title;
    this.#subtitle.textContent = o.subtitle ?? '';
    this.#subtitle.hidden = !o.subtitle;
    const host = this.host;
    host.classList.toggle('aui-widget--collapsed', this.#collapsed && !this.#maximized);
    if (o.busy) host.setAttribute('aria-busy', 'true');
    else host.removeAttribute('aria-busy');
    if (!this.#maximized) {
      // A labelled region, unless the page gave the host its own role.
      if (!host.hasAttribute('role') || host.getAttribute('role') === 'region') host.setAttribute('role', 'region');
      host.setAttribute('aria-labelledby', this.#title.id);
    }
    const active = host.ownerDocument.activeElement;
    const focusedAction = active instanceof HTMLElement && this.#actions.contains(active) ? active.dataset.action : undefined;
    const buttons: HTMLButtonElement[] = [];
    for (const a of o.actions ?? []) {
      const b = this.#button('aui-widget__action--custom', a.icon, a.label, () => {
        const detail: DashboardWidgetActionDetail = { id: a.id };
        emit(host, 'aui-action', detail);
      });
      b.dataset.action = `custom:${a.id}`;
      buttons.push(b);
    }
    if (config.collapsible && !this.#maximized) {
      const b = this.#button('aui-widget__toggle', 'chevron-down', this.#msg(this.#collapsed ? 'expand' : 'collapse'), () => {
        this.#collapsed = !this.#collapsed;
        this.#render();
        const detail: DashboardWidgetToggleDetail = { collapsed: this.#collapsed };
        emit(host, 'aui-toggle', detail, { bubbles: false });
      });
      b.setAttribute('aria-expanded', String(!this.#collapsed));
      b.dataset.action = 'toggle';
      buttons.push(b);
    }
    if (config.maximizable) {
      const b = this.#button('aui-widget__maximize', this.#maximized ? 'minimize' : 'maximize', this.#msg(this.#maximized ? 'restore' : 'maximize'), () => {
        this.setMaximized(!this.#maximized);
      });
      b.dataset.action = 'maximize';
      buttons.push(b);
    }
    if (o.removable) {
      const b = this.#button('aui-widget__remove', 'trash', this.#msg('remove'), () => {
        const detail: DashboardWidgetRemoveDetail = { id: host.dataset.auiItem ?? null };
        emit(host, 'aui-remove', detail, { cancelable: true });
      });
      b.dataset.action = 'remove';
      buttons.push(b);
    }
    this.#actions.replaceChildren(...buttons);
    if (focusedAction !== undefined) buttons.find((b) => b.dataset.action === focusedAction)?.focus();
  }

  #maximize(): void {
    const host = this.host;
    this.#maximized = true;
    this.#savedRole = host.getAttribute('role');
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-labelledby', this.#title.id);
    // Top layer without moving the element (framework-owned): the Popover API.
    host.setAttribute('popover', 'manual');
    host.classList.add('aui-widget--maximized');
    if (typeof host.showPopover === 'function') host.showPopover();
    this.#render();
    this.#unlock = lockScroll(host.ownerDocument);
    this.#unlayer = registerOverlayLayer(host, {
      dismissOnOutsidePointer: false,
      onDismiss: () => {
        this.setMaximized(false);
      },
    });
    this.#trap = createFocusTrap(host, { initialFocus: this.#actions.querySelector<HTMLElement>('[data-action="maximize"]') });
    this.#trap.activate();
  }

  #restore(): void {
    const host = this.host;
    this.#maximized = false;
    this.#trap?.deactivate();
    this.#trap = null;
    this.#unlayer?.();
    this.#unlayer = null;
    this.#unlock?.();
    this.#unlock = null;
    if (typeof host.hidePopover === 'function' && host.matches(':popover-open')) host.hidePopover();
    host.removeAttribute('popover');
    host.removeAttribute('aria-modal');
    host.classList.remove('aui-widget--maximized');
    if (this.#savedRole === null) host.removeAttribute('role');
    else host.setAttribute('role', this.#savedRole);
    this.#render();
    this.#actions.querySelector<HTMLElement>('[data-action="maximize"]')?.focus();
  }
}
