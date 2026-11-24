/**
 * Dashboard Catalog (SPEC section 18.17: add-widget catalog). A list of widget templates
 * next to a Dashboard Grid. Activating a template (click, Enter, Space) adds it at
 * the first free spot; dragging it onto the grid (pointer, touch) adds it where it is
 * dropped. Before adding, the cancelable `aui-catalog-add` event lets the
 * application veto or render the content; `create` renders it for vanilla use.
 * A separate class: grids without a catalog do not ship it.
 */
import { configurationError, DisposableGroup, emit, getCommonConfig, getMessage, registerMessages, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { trackPointerDrag } from '@absoluteui/utilities';
import type { DashboardGrid } from './dashboard-grid.js';
import type { DashboardItem } from './layout.js';

export interface DashboardTemplate {
  /** Template id; new items get `<id>-<n>` ids. */
  id: string;
  label: string;
  /** Short text below the label. */
  description?: string;
  /** Size in columns and rows. */
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  icon?: IconRef;
}

export interface DashboardCatalogOptions {
  /** The grid that receives the widgets. */
  grid: DashboardGrid;
  /** Accessible name of the catalog list. */
  label: string;
  templates: readonly DashboardTemplate[];
  /** Render a widget element for a new item (vanilla). Frameworks listen to `aui-catalog-add` and render instead. */
  create?: (template: DashboardTemplate, item: DashboardItem) => HTMLElement | null;
  locale?: string;
}

/** Detail of the cancelable `aui-catalog-add`. */
export interface DashboardCatalogAddDetail {
  template: DashboardTemplate;
  /** The item about to be added (id and position). */
  item: DashboardItem;
}

registerMessages('dashboardCatalog', 'en', {
  add: 'Add {label}',
});

function fail(property: string, expected: string): never {
  throw configurationError('DASHBOARD_CATALOG_OPTIONS', 'Invalid dashboard catalog options.', { component: 'dashboardCatalog', property: `dashboardCatalog.${property}`, expected });
}

export class DashboardCatalog {
  readonly host: HTMLElement;
  #options: DashboardCatalogOptions;
  readonly #list: HTMLUListElement;
  #itemGroup = new DisposableGroup();

  /** Render a catalog into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: DashboardCatalogOptions): DashboardCatalog {
    return new DashboardCatalog(host, options);
  }

  private constructor(host: HTMLElement, options: DashboardCatalogOptions) {
    DashboardCatalog.#assert(options);
    this.host = host;
    this.#options = { ...options };
    this.#list = host.ownerDocument.createElement('ul');
    this.#list.className = 'aui-dashboard-catalog__list';
    this.#render();
    host.classList.add('aui-dashboard-catalog');
    host.replaceChildren(this.#list);
  }

  update(options: Partial<DashboardCatalogOptions>): void {
    const next = { ...this.#options, ...options };
    DashboardCatalog.#assert(next);
    this.#options = next;
    this.#render();
  }

  /** Add a widget from `templateId` (at `at`, else the first free spot). Returns the item, or null when vetoed. */
  add(templateId: string, at?: { x: number; y: number }): DashboardItem | null {
    const template = this.#options.templates.find((t) => t.id === templateId);
    if (!template) fail('add.templateId', 'id of a template');
    const grid = this.#options.grid;
    const ids = new Set(Object.values(grid.layouts).flat().map((i) => i.id));
    let n = 1;
    while (ids.has(`${template.id}-${String(n)}`)) n++;
    const base: Omit<DashboardItem, 'x' | 'y'> = { id: `${template.id}-${String(n)}`, w: template.w, h: template.h };
    if (template.minW !== undefined) base.minW = template.minW;
    if (template.minH !== undefined) base.minH = template.minH;
    // Preview position for the event: the requested cell or the first free spot.
    const probe = at ? { ...base, ...at } : { ...base, x: 0, y: 0 };
    const detail: DashboardCatalogAddDetail = { template, item: { ...probe } };
    if (!emit(this.host, 'aui-catalog-add', detail, { cancelable: true })) return null;
    const element = this.#options.create?.(template, detail.item) ?? undefined;
    const added = grid.addItem(at ? { ...base, ...at } : base, element);
    // Keyboard users continue on the new widget: its move handle in edit mode, else the widget.
    const handle = grid.handleFor(added.id);
    if (handle) handle.focus();
    return added;
  }

  destroy(): void {
    this.#itemGroup.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-dashboard-catalog');
  }

  static #assert(o: DashboardCatalogOptions): void {
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string');
    if (typeof o.grid !== 'object' || typeof o.grid.addItem !== 'function') fail('grid', 'DashboardGrid');
    if (!Array.isArray(o.templates)) fail('templates', 'DashboardTemplate[]');
    const ids = new Set<string>();
    o.templates.forEach((t: unknown, i) => {
      const p = `templates[${String(i)}]`;
      if (!validators.isRecord(t) || typeof t.id !== 'string' || t.id === '' || ids.has(t.id)) fail(`${p}.id`, 'unique non-empty string');
      ids.add(t.id);
      if (typeof t.label !== 'string' || t.label === '') fail(`${p}.label`, 'non-empty string');
      if (t.description !== undefined && typeof t.description !== 'string') fail(`${p}.description`, 'string');
      for (const key of ['w', 'h'] as const) if (!(typeof t[key] === 'number' && Number.isInteger(t[key]) && t[key] >= 1)) fail(`${p}.${key}`, 'positive integer');
    });
    if (o.create !== undefined && typeof o.create !== 'function') fail('create', '(template, item) => HTMLElement | null');
  }

  #render(): void {
    const o = this.#options;
    const doc = this.host.ownerDocument;
    this.#itemGroup.dispose();
    this.#itemGroup = new DisposableGroup();
    this.#list.setAttribute('aria-label', o.label);
    const locale = o.locale ?? getCommonConfig().locale;
    const items = o.templates.map((t) => {
      const li = doc.createElement('li');
      li.className = 'aui-dashboard-catalog__entry';
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'aui-dashboard-catalog__template';
      button.dataset.template = t.id;
      if (t.icon) {
        const icon = renderIcon(t.icon, { doc });
        icon.classList.add('aui-dashboard-catalog__icon');
        button.append(icon);
      }
      const text = doc.createElement('span');
      text.className = 'aui-dashboard-catalog__text';
      const label = doc.createElement('span');
      label.className = 'aui-dashboard-catalog__label';
      label.textContent = t.label;
      text.append(label);
      if (t.description) {
        const d = doc.createElement('span');
        d.className = 'aui-dashboard-catalog__description';
        d.textContent = t.description;
        text.append(d);
      }
      button.append(text);
      // The visible label names the button; "Add" makes the action explicit for AT.
      button.setAttribute('aria-label', getMessage('dashboardCatalog', 'add', { label: t.label }, locale));
      button.addEventListener('click', () => {
        this.add(t.id);
      });
      const drag = trackPointerDrag(button, {
        onStart: () => {
          button.classList.add('aui-dashboard-catalog__template--dragging');
        },
        onMove: (move) => {
          o.grid.previewAt(move.point.x, move.point.y, t.w, t.h);
        },
        onEnd: (move) => {
          button.classList.remove('aui-dashboard-catalog__template--dragging');
          const cell = o.grid.previewAt(move.point.x, move.point.y, t.w, t.h);
          o.grid.clearPreview();
          if (cell) this.add(t.id, cell);
        },
        onCancel: () => {
          button.classList.remove('aui-dashboard-catalog__template--dragging');
          o.grid.clearPreview();
        },
      });
      this.#itemGroup.add(() => {
        drag.dispose();
      });
      li.append(button);
      return li;
    });
    this.#list.replaceChildren(...items);
  }
}
