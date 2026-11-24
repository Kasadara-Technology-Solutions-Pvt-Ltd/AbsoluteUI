/**
 * Dashboard runtime (R18-1): renders a dashboard definition with Dashboard Grid and Dashboard Widget,
 * loads widget data through the data layer, and keeps the definition as the single source of truth.
 * Every change produces a new validated definition (`aui-dashboard-change`); the host persists it (R18-13).
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, getCommonConfig, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { getByPointer } from '@absoluteui/helpers/json';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';
import { DashboardGrid, type DashboardGridLayoutChangeDetail } from '../dashboard-grid/dashboard-grid.js';
import type { DashboardItem } from '../dashboard-grid/layout.js';
import { DashboardWidget } from '../dashboard-widget/dashboard-widget.js';
import { Button } from '../button/button.js';
import { Tabs } from '../tabs/tabs.js';
import { checkDefinition, defaultBreakpoints, type DefinitionIssue } from './check.js';
import { DataStore, DashboardDataError, type DashboardFetcher, type DataStoreOptions } from './data.js';
import type { DashboardDefinition, DataSourceDefinition, JsonValue, LayoutEntry, WidgetDefinition, WidgetLayout } from './definition.js';
import { DefinitionHistory } from './history.js';
import { migrateDefinition } from './migrate.js';
import { parseDefinition } from './parse.js';
import { defaultWidgetRegistry, type WidgetInstance, type WidgetRegistry, type WidgetType } from './registry.js';
import { applyTransforms, defaultTransformRegistry, resolveInputs, TransformError, type TransformRegistry } from './transforms.js';
import { DashboardToolbar, type DashboardToolbarOptions } from './toolbar.js';
import { acceptValue, initialValue, referencedVariables, type DateContext, type VariableValue } from './variables.js';

export type DashboardMode = 'view' | 'edit';

/** Globally configurable dashboard options (configureAbsoluteUI({ components: { dashboard } })). */
export interface DashboardConfig {
  /** Load widget data only when the widget scrolls into view (S3). Default true. */
  lazy: boolean;
  /** Undo steps (R18-14). Default 100. */
  historyLimit: number;
  /** GET retries on network errors, 408, 429, and 5xx. Default 2. */
  retries: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    dashboard: DashboardConfig & { locale: string; direction: Direction };
  }
}

export const dashboardConfig = defineComponentConfig<DashboardConfig, 'locale' | 'direction'>(
  'dashboard',
  {
    lazy: { default: true, expected: 'boolean', validate: validators.isBoolean },
    historyLimit: { default: 100, expected: 'integer from 1 to 1000', validate: validators.integerInRange(1, 1000) },
    retries: { default: 2, expected: 'integer from 0 to 5', validate: validators.integerInRange(0, 5) },
  },
  ['locale', 'direction'],
);

export type DashboardChangeReason = 'layout' | 'add' | 'remove' | 'widget' | 'definition' | 'undo' | 'redo' | 'reset' | 'import';

export interface DashboardOptions extends Partial<DashboardConfig> {
  /** The definition (plain JSON). Older versions are migrated; invalid input throws. */
  definition: unknown;
  /** Widget types; default: the default registry (see `registerWidgetType`, `registerBuiltInWidgets`). */
  registry?: WidgetRegistry;
  /** Custom transforms; default: the default transform registry. */
  transforms?: TransformRegistry;
  /** Performs HTTP requests; add authentication here (R18-5). Default: global fetch, same-origin credentials. */
  fetcher?: DashboardFetcher;
  /** Origins besides the page origin that data sources may call (R18-6). Default: none. */
  allowedOrigins?: readonly string[];
  /** Base URL for root-relative data source URLs. Default: `location.href`. */
  baseUrl?: string;
  /** Whether users may switch to edit mode (R18-9). Default false. */
  editable?: boolean;
  /** Initial mode. `edit` requires `editable`. Default `view`. */
  mode?: DashboardMode;
  /** Time zone for date presets. Default: the runtime zone. */
  timeZone?: string;
  /** Business calendars by the name date range variables use. */
  businessCalendars?: Readonly<Record<string, BusinessCalendarEngine>>;
  /** Show the toolbar (R18-10), optionally choosing items. Default true. */
  toolbar?: boolean | DashboardToolbarOptions;
  /** Widget heading level. Default 3. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** Accessible name of the widget area. Default: the definition title. */
  label?: string;
  locale?: string;
  direction?: Direction;
}

export interface DashboardChangeDetail {
  readonly reason: DashboardChangeReason;
  readonly definition: DashboardDefinition;
}

export interface DashboardVariablesChangeDetail {
  readonly variables: Readonly<Record<string, VariableValue>>;
  /** The variable that changed. */
  readonly id: string;
}

export interface DashboardWidgetErrorDetail {
  readonly widget: string;
  readonly source: string | null;
  readonly kind: string;
  readonly status: number | null;
}

export interface DashboardWidgetSelectDetail {
  readonly widget: string;
  readonly datum: JsonValue;
}

export interface DashboardModeChangeDetail {
  readonly mode: DashboardMode;
}

export type WidgetStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'stale';

/** Kiosk mode (S8): read-only, no toolbar, optional page rotation and full screen. */
export interface DashboardKioskOptions {
  /** Seconds per page (10 to 3600); 0 or omitted: no rotation. */
  readonly rotate?: number;
  /** Request full screen (only works from a user gesture). Default false. */
  readonly fullscreen?: boolean;
}

registerMessages('dashboard', 'en', {
  region: '{title} widgets',
  loading: 'Loading',
  empty: 'No data',
  retry: 'Retry',
  updated: 'Updated {time}',
  stale: 'Could not refresh. Showing data from {time}.',
  errorBlocked: 'This data source is not allowed.',
  errorNetwork: 'The data could not be loaded.',
  errorHttp: 'The server answered {status}.',
  errorTimeout: 'The request timed out.',
  errorTooLarge: 'The response is too large.',
  errorParse: 'The response is not valid data.',
  errorTransform: 'The data does not fit this widget.',
  errorOptions: 'This widget is misconfigured ({path}).',
  errorUnknownType: 'Unknown widget type "{type}".',
  errorRender: 'This widget could not be displayed.',
  refresh: 'Refresh {title}',
  edit: 'Edit {title}',
  pages: '{title} pages',
  pauseRotation: 'Pause rotation',
  exitKiosk: 'Exit kiosk mode',
});

interface View {
  def: WidgetDefinition;
  host: HTMLElement;
  widget: DashboardWidget;
  body: HTMLDivElement;
  state: HTMLDivElement;
  footer: HTMLDivElement;
  instance: WidgetInstance | null;
  type: WidgetType | undefined;
  visible: boolean;
  status: WidgetStatus;
}

function isBrowser(): boolean {
  return typeof document !== 'undefined';
}

export class Dashboard {
  readonly host: HTMLElement;
  readonly #group = new DisposableGroup();
  readonly #options: DashboardOptions;
  readonly #registry: WidgetRegistry;
  readonly #transforms: TransformRegistry;
  readonly #store: DataStore;
  #definition: DashboardDefinition;
  #saved: DashboardDefinition;
  #mode: DashboardMode;
  #page: string | null;
  #values = new Map<string, VariableValue>();
  #views = new Map<string, View>();
  #grid: DashboardGrid | null = null;
  #gridHost: HTMLDivElement;
  #observer: IntersectionObserver | null = null;
  #timers = new Map<string, ReturnType<typeof setTimeout>>();
  #loadedAt = new Map<string, number>();
  #applyingLayout = false;
  #destroyed = false;
  readonly #history: DefinitionHistory;
  #toolbar: DashboardToolbar | null = null;
  #reusing = false;
  #pages: Tabs | null = null;
  #pagesKey = '';
  #kiosk: { bar: HTMLDivElement; timer: ReturnType<typeof setInterval> | null; paused: boolean; pause: Button | null; exit: Button } | null = null;
  /** Set by the builder module (D4). */
  builderHooks: { openBuilder?: () => void; openJson?: () => void; editWidget?: (id: string) => void } = {};

  static create(host: HTMLElement, options: DashboardOptions): Dashboard {
    return new Dashboard(host, options);
  }

  static #resolve(o: DashboardOptions): Readonly<DashboardConfig & { locale: string; direction: Direction }> {
    const input: Partial<DashboardConfig & { locale: string; direction: Direction }> = {};
    if (o.lazy !== undefined) input.lazy = o.lazy;
    if (o.historyLimit !== undefined) input.historyLimit = o.historyLimit;
    if (o.retries !== undefined) input.retries = o.retries;
    if (o.locale !== undefined) input.locale = o.locale;
    if (o.direction !== undefined) input.direction = o.direction;
    return dashboardConfig.resolve(input);
  }

  private constructor(host: HTMLElement, options: DashboardOptions) {
    if (!(host instanceof HTMLElement)) throw configurationError('DASHBOARD_OPTIONS', 'The dashboard host must be an element.', { component: 'dashboard', property: 'host', expected: 'HTMLElement' });
    if (options.mode === 'edit' && options.editable !== true) throw configurationError('DASHBOARD_OPTIONS', 'Edit mode needs editable: true.', { component: 'dashboard', property: 'dashboard.mode', expected: '"view" unless editable is true' });
    this.host = host;
    this.#options = { ...options };
    this.#registry = options.registry ?? defaultWidgetRegistry;
    this.#transforms = options.transforms ?? defaultTransformRegistry;
    const storeOptions: { -readonly [K in keyof DataStoreOptions]: DataStoreOptions[K] } = {};
    if (options.fetcher) storeOptions.fetcher = options.fetcher;
    if (options.allowedOrigins) storeOptions.allowedOrigins = options.allowedOrigins;
    if (options.baseUrl) storeOptions.baseUrl = options.baseUrl;
    const config = Dashboard.#resolve(options);
    storeOptions.retries = config.retries;
    try {
      this.#store = new DataStore(storeOptions);
    } catch (error) {
      throw configurationError('DASHBOARD_OPTIONS', 'Invalid allowed origins.', { component: 'dashboard', property: 'dashboard.allowedOrigins', expected: error instanceof Error ? error.message : 'http(s) origins' });
    }
    this.#definition = parseDefinition(options.definition);
    this.#saved = this.#definition;
    this.#mode = options.mode ?? 'view';
    this.#page = this.#definition.pages?.[0]?.id ?? null;
    this.#history = new DefinitionHistory(config.historyLimit);
    this.#initValues();

    host.classList.add('aui-dashboard-root');
    this.#gridHost = host.ownerDocument.createElement('div');
    this.#gridHost.className = 'aui-dashboard-root__grid';
    host.append(this.#gridHost);
    this.#applyRootStyle();
    this.#buildToolbar();
    // Undo/redo shortcuts drive the definition history in edit mode (capture: before the grid's own).
    this.#group.listen(host, 'keydown', (e) => {
      this.#onKey(e);
    }, { capture: true });

    const onLayout = (e: Event): void => {
      if (!this.#applyingLayout) this.#onLayoutChange((e as CustomEvent<DashboardGridLayoutChangeDetail>).detail);
    };
    this.#gridHost.addEventListener('aui-layout-change', onLayout);
    if (isBrowser()) {
      this.#group.listen(host.ownerDocument, 'visibilitychange', () => {
        if (host.ownerDocument.visibilityState === 'visible') this.#resumeRefresh();
      });
    }
    this.#render();
  }

  /* ---------------------------------------------------------------- public API */

  /** The current (validated, frozen) definition. */
  get definition(): DashboardDefinition {
    return this.#definition;
  }

  get mode(): DashboardMode {
    return this.#mode;
  }

  get editable(): boolean {
    return this.#options.editable === true;
  }

  /** Current page id, or null when the definition has no pages. */
  get page(): string | null {
    return this.#page;
  }

  /** Current variable values by id. */
  get variables(): Readonly<Record<string, VariableValue>> {
    return Object.freeze(Object.fromEntries(this.#values));
  }

  /** Status of each widget, for hosts and tests. */
  widgetStatus(id: string): WidgetStatus | undefined {
    return this.#views.get(id)?.status;
  }

  /** The widget's host element (`[data-aui-item]`). */
  widgetElement(id: string): HTMLElement | undefined {
    return this.#views.get(id)?.host;
  }

  /** Validation issues of a candidate definition, without applying it. */
  check(definition: unknown): readonly DefinitionIssue[] {
    let migrated: unknown;
    try {
      migrated = migrateDefinition(definition);
    } catch (error) {
      return [{ path: '/schemaVersion', code: 'version', expected: error instanceof Error ? error.message : 'a supported version' }];
    }
    const r = checkDefinition(migrated);
    return r.ok ? [] : r.issues;
  }

  /** Replaces the definition (validated). Data of unchanged sources is reused. */
  setDefinition(definition: unknown, reason: DashboardChangeReason = 'definition'): void {
    this.#commit(parseDefinition(definition), reason);
  }

  /** Marks the current definition as saved: "reset" returns to it. */
  markSaved(): void {
    this.#saved = this.#definition;
  }

  /** The definition last passed to create or markSaved. */
  get savedDefinition(): DashboardDefinition {
    return this.#saved;
  }

  setMode(mode: DashboardMode): void {
    if (mode === this.#mode) return;
    if (mode === 'edit' && !this.editable) throw configurationError('DASHBOARD_OPTIONS', 'Edit mode needs editable: true.', { component: 'dashboard', property: 'dashboard.mode', expected: '"view" unless editable is true' });
    this.#mode = mode;
    this.#grid?.setEditable(mode === 'edit');
    this.host.classList.toggle('aui-dashboard-root--editing', mode === 'edit');
    this.refreshWidgetActions();
    this.#toolbar?.sync();
    const detail: DashboardModeChangeDetail = { mode };
    emit(this.host, 'aui-mode-change', detail);
  }

  /** Sets a variable (validated); dependent data sources reload. Returns false for an invalid value. */
  setVariable(id: string, value: unknown): boolean {
    const def = this.#definition.variables?.find((v) => v.id === id);
    if (!def) return false;
    const accepted = acceptValue(def, value);
    if (accepted === undefined) return false;
    if (JSON.stringify(this.#values.get(id)) === JSON.stringify(accepted)) return true;
    this.#values.set(id, accepted);
    const detail: DashboardVariablesChangeDetail = { variables: this.variables, id };
    emit(this.host, 'aui-variables-change', detail);
    for (const [sourceId, source] of Object.entries(this.#definition.dataSources ?? {})) {
      if (this.#sourceVariables(source).includes(id)) void this.#loadSource(sourceId, false);
    }
    return true;
  }

  /** Reloads one data source, or every source used on the current page. */
  refresh(source?: string): void {
    const ids = source === undefined ? this.#activeSources() : [source];
    for (const id of ids) void this.#loadSource(id, true);
  }

  /** Shows a page (S7). */
  setPage(id: string): void {
    if (!this.#definition.pages?.some((p) => p.id === id) || id === this.#page) return;
    this.#page = id;
    this.#render();
    emit(this.host, 'aui-page-change', { page: id });
  }

  /* ---------------------------------------------------------------- kiosk (S8) */

  get kiosk(): boolean {
    return this.#kiosk !== null;
  }

  /** Read-only full-page display with optional page rotation; a visible control pauses rotation (WCAG 2.2.2). */
  startKiosk(options: DashboardKioskOptions = {}): void {
    this.stopKiosk();
    if (this.#mode === 'edit') this.setMode('view');
    const doc = this.host.ownerDocument;
    const bar = doc.createElement('div');
    bar.className = 'aui-dashboard-kiosk';
    const rotate = options.rotate !== undefined && options.rotate > 0 ? Math.max(10, Math.min(3600, Math.floor(options.rotate))) : 0;
    const pages = this.#definition.pages ?? [];
    let pause: Button | null = null;
    if (rotate > 0 && pages.length > 1) {
      // A toggle button: aria-pressed tells whether rotation is paused.
      pause = Button.create({ text: this.#msg('pauseRotation'), variant: 'secondary', size: 'sm', pressed: false }, doc);
      bar.append(pause.element);
    }
    const exit = Button.create({ text: this.#msg('exitKiosk'), variant: 'ghost', size: 'sm', icon: 'minimize' }, doc);
    bar.append(exit.element);
    this.host.prepend(bar);
    this.host.classList.add('aui-dashboard-root--kiosk');
    const state: { bar: HTMLDivElement; timer: ReturnType<typeof setInterval> | null; paused: boolean; pause: Button | null; exit: Button } = { bar, timer: null, paused: false, pause, exit };
    this.#kiosk = state;
    if (pause) {
      const p = pause;
      p.element.addEventListener('aui-change', (e) => {
        state.paused = (e as CustomEvent<{ pressed: boolean }>).detail.pressed;
      });
      state.timer = setInterval(() => {
        // Rotation also holds while keyboard focus is inside the dashboard.
        if (state.paused || this.host.contains(doc.activeElement) && doc.activeElement !== doc.body && !bar.contains(doc.activeElement)) return;
        const list = this.#definition.pages ?? [];
        const i = list.findIndex((pg) => pg.id === this.#page);
        const next = list[(i + 1) % list.length];
        if (next) this.setPage(next.id);
      }, rotate * 1000);
    }
    exit.element.addEventListener('click', () => {
      this.stopKiosk();
    });
    if (options.fullscreen === true && typeof this.host.requestFullscreen === 'function') {
      this.host.requestFullscreen().catch(() => undefined);
    }
    emit(this.host, 'aui-kiosk-change', { kiosk: true });
  }

  stopKiosk(): void {
    const k = this.#kiosk;
    if (!k) return;
    this.#kiosk = null;
    if (k.timer !== null) clearInterval(k.timer);
    k.pause?.destroy();
    k.exit.destroy();
    k.bar.remove();
    this.host.classList.remove('aui-dashboard-root--kiosk');
    const doc = this.host.ownerDocument;
    if (doc.fullscreenElement === this.host) doc.exitFullscreen().catch(() => undefined);
    emit(this.host, 'aui-kiosk-change', { kiosk: false });
  }

  /** Page tabs (S7): the grid lives in the selected tab panel. */
  #syncPages(): void {
    const pages = this.#definition.pages;
    const opt = this.#options.toolbar;
    const show = pages !== undefined && pages.length > 0 && !(typeof opt === 'object' && opt.pages === false);
    if (!show) {
      this.#pages?.destroy();
      this.#pages?.host.remove();
      this.#pages = null;
      this.#pagesKey = '';
      if (this.#gridHost.parentElement !== this.host) this.host.append(this.#gridHost);
      return;
    }
    const key = JSON.stringify(pages);
    if (!this.#pages || key !== this.#pagesKey) {
      this.#pages?.destroy();
      this.#pages?.host.remove();
      const host = this.host.ownerDocument.createElement('div');
      host.className = 'aui-dashboard-root__pages';
      this.host.append(host);
      this.#pages = Tabs.create(host, {
        label: this.#msg('pages', { title: this.#definition.title }),
        tabs: pages.map((p) => ({ id: p.id, label: p.title })),
        value: this.#page ?? pages[0]?.id ?? '',
        ...(this.#options.direction === undefined ? {} : { direction: this.#options.direction }),
      });
      this.#pagesKey = key;
      host.addEventListener('aui-change', (e) => {
        this.setPage((e as CustomEvent<{ value: string }>).detail.value);
      });
    } else if (this.#page !== null && this.#pages.value !== this.#page) {
      this.#pages.select(this.#page);
    }
    const panel = this.#page === null ? null : this.#pages.panel(this.#page);
    if (panel && this.#gridHost.parentElement !== panel) panel.append(this.#gridHost);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.stopKiosk();
    this.#teardownViews();
    this.#toolbar?.destroy();
    this.#toolbar = null;
    this.#pages?.destroy();
    this.#pages?.host.remove();
    this.#pages = null;
    this.#store.dispose();
    this.#group.dispose();
    this.#gridHost.remove();
    this.host.classList.remove('aui-dashboard-root', 'aui-dashboard-root--editing');
    delete this.host.dataset.auiDensity;
    delete this.host.dataset.auiAccent;
  }

  /* ---------------------------------------------------------------- definition changes (used by D3/D4) */

  /** Validates and applies a new definition, re-rendering what changed. */
  #commit(next: DashboardDefinition, reason: DashboardChangeReason): void {
    const previous = this.#definition;
    this.#definition = next;
    if (this.#page !== null && !next.pages?.some((p) => p.id === this.#page)) this.#page = next.pages?.[0]?.id ?? null;
    if (this.#page === null && next.pages) this.#page = next.pages[0]?.id ?? null;
    this.#syncValues(previous);
    for (const [id, source] of Object.entries(previous.dataSources ?? {})) {
      const after = next.dataSources?.[id];
      if (!after || JSON.stringify(after) !== JSON.stringify(source)) this.#store.invalidate(id);
    }
    this.#applyRootStyle();
    if (reason !== 'undo' && reason !== 'redo') this.#history.record(previous, next);
    if (JSON.stringify(previous.variables ?? []) !== JSON.stringify(next.variables ?? []) || previous.title !== next.title) this.#buildToolbar();
    if (reason === 'layout') {
      // The grid already shows the change.
    } else if (layoutOnly(previous, next) && this.#grid) {
      this.#applyLayoutToGrid();
    } else {
      this.#reusing = true;
      try {
        this.#render();
      } finally {
        this.#reusing = false;
      }
    }
    this.#toolbar?.sync();
    const detail: DashboardChangeDetail = { reason, definition: next };
    emit(this.host, 'aui-dashboard-change', detail);
  }

  /* ---------------------------------------------------------------- editing API (R18-9, R18-14) */

  get canUndo(): boolean {
    return this.#history.canUndo;
  }

  get canRedo(): boolean {
    return this.#history.canRedo;
  }

  /** True when the definition differs from the saved one. */
  get dirty(): boolean {
    return JSON.stringify(this.#definition) !== JSON.stringify(this.#saved);
  }

  undo(): boolean {
    const prev = this.#history.undo(this.#definition);
    if (prev === undefined) return false;
    const r = checkDefinition(prev);
    if (r.ok) this.#commit(r.definition, 'undo');
    return r.ok;
  }

  redo(): boolean {
    const next = this.#history.redo(this.#definition);
    if (next === undefined) return false;
    const r = checkDefinition(next);
    if (r.ok) this.#commit(r.definition, 'redo');
    return r.ok;
  }

  /** Returns to the saved definition (undoable). */
  reset(): void {
    if (this.dirty) this.#commit(this.#saved, 'reset');
  }

  /**
   * Adds a widget. Without `layout`, it goes to the first free spot with the type's default size.
   * Returns the validation issues (empty when added).
   */
  addWidget(widget: Omit<WidgetDefinition, 'layout'> & { layout?: WidgetLayout }): readonly DefinitionIssue[] {
    const type = this.#registry.get(widget.type);
    const columns = this.#definition.grid?.columns ?? 12;
    let layout = widget.layout;
    if (!layout) {
      const size = type?.defaultSize ?? { w: 3, h: 2 };
      const w = Math.min(columns, Math.max(1, size.w));
      const h = Math.max(1, size.h);
      layout = { ...freeSpot(this.#pageWidgets().map((p) => p.layout), columns, w, h), w, h };
    }
    const page = widget.page ?? this.#page ?? undefined;
    const def = { ...widget, layout, ...(page === undefined ? {} : { page }) };
    return this.apply({ ...this.#definition, widgets: [...this.#definition.widgets, def] }, 'add');
  }

  /** Replaces a widget's definition (same id); returns validation issues. */
  updateWidget(id: string, widget: WidgetDefinition): readonly DefinitionIssue[] {
    if (!this.#definition.widgets.some((w) => w.id === id)) return [{ path: '/widgets', code: 'reference', expected: 'an existing widget id' }];
    return this.apply({ ...this.#definition, widgets: this.#definition.widgets.map((w) => (w.id === id ? widget : w)) }, 'widget');
  }

  /** Removes a widget and its per-breakpoint layout entries. */
  removeWidget(id: string): boolean {
    if (!this.#definition.widgets.some((w) => w.id === id)) return false;
    const layouts: Record<string, readonly LayoutEntry[]> = {};
    for (const [name, entries] of Object.entries(this.#definition.layouts ?? {})) {
      const kept = entries.filter((e) => e.id !== id);
      if (kept.length > 0) layouts[name] = kept;
    }
    const next: Record<string, unknown> = { ...this.#definition, widgets: this.#definition.widgets.filter((w) => w.id !== id) };
    if (Object.keys(layouts).length > 0) next.layouts = layouts;
    else delete next.layouts;
    return this.apply(next, 'remove').length === 0;
  }

  #buildToolbar(): void {
    this.#toolbar?.destroy();
    this.#toolbar = null;
    const opt = this.#options.toolbar;
    if (opt === false) return;
    const options = typeof opt === 'object' ? opt : {};
    const hooks = this.builderHooks;
    const definition = this.#definition;
    this.#toolbar = new DashboardToolbar({
      host: this.host,
      title: definition.title,
      variables: definition.variables ?? [],
      values: () => this.variables,
      setVariable: (id, value) => this.setVariable(id, value),
      editable: this.editable,
      mode: () => this.#mode,
      setMode: (m) => {
        this.setMode(m);
      },
      canUndo: () => this.canUndo,
      canRedo: () => this.canRedo,
      undo: () => {
        this.undo();
      },
      redo: () => {
        this.redo();
      },
      reset: () => {
        this.reset();
      },
      isDirty: () => this.dirty,
      refresh: () => {
        this.refresh();
      },
      openBuilder: hooks.openBuilder,
      openJson: hooks.openJson,
      calendar: (name) => (name === undefined ? undefined : this.#options.businessCalendars?.[name]),
      locale: this.#options.locale,
      direction: this.#options.direction,
    }, options);
    this.host.insertBefore(this.#toolbar.element, this.host.querySelector(':scope > .aui-dashboard-root__pages, :scope > .aui-dashboard-root__grid'));
  }

  #widgetActions(def: WidgetDefinition): { id: string; label: string; icon: string }[] {
    const out: { id: string; label: string; icon: string }[] = [];
    if (def.actions?.refreshable === true && def.source !== undefined) out.push({ id: 'refresh', label: this.#msg('refresh', { title: def.title }), icon: 'refresh' });
    if (this.#mode === 'edit' && this.builderHooks.editWidget) out.push({ id: 'edit', label: this.#msg('edit', { title: def.title }), icon: 'more-horizontal' });
    return out;
  }

  /** Updates widget header actions for the current mode and builder hooks. */
  refreshWidgetActions(): void {
    for (const v of this.#views.values()) v.widget.update({ actions: this.#widgetActions(v.def), removable: v.def.actions?.removable === true && this.#mode === 'edit' });
  }

  /** A layout for a new widget of `type`: the given size (or the type's default) in the first free spot. */
  placeFor(type: string, layout?: WidgetLayout): WidgetLayout {
    const columns = this.#definition.grid?.columns ?? 12;
    const size = layout ?? this.#registry.get(type)?.defaultSize ?? { w: 3, h: 2 };
    const w = Math.min(columns, Math.max(1, size.w));
    const h = Math.max(1, size.h);
    return { ...freeSpot(this.#pageWidgets().map((p) => p.layout), columns, w, h), w, h };
  }

  /** Rebuilds the toolbar (after builder hooks are installed). */
  refreshToolbar(): void {
    this.#buildToolbar();
  }

  #onKey(e: KeyboardEvent): void {
    if (this.#mode !== 'edit' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || t.closest('input, textarea, select, [contenteditable="true"]'))) return;
    const key = e.key.toLowerCase();
    const redo = (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey);
    const undo = key === 'z' && !e.shiftKey;
    if (!undo && !redo) return;
    e.preventDefault();
    e.stopPropagation();
    if (undo) this.undo();
    else this.redo();
  }

  /** Applies widget layouts of the current definition to the grid without re-rendering widgets. */
  #applyLayoutToGrid(): void {
    const grid = this.#grid;
    if (!grid) return;
    const widgets = this.#pageWidgets();
    const ids = new Set(widgets.map((w) => w.id));
    const layouts: Record<string, DashboardItem[]> = {};
    for (const [name, entries] of Object.entries(this.#definition.layouts ?? {})) {
      const list = entries.filter((e) => ids.has(e.id)).map((e) => ({ ...e }));
      if (list.length > 0) layouts[name] = list;
    }
    this.withoutLayoutEvents(() => {
      grid.update({ items: this.#items(widgets), layouts });
    });
  }


  /** Internal hook for the editor modules: apply a definition object built from the current one. */
  apply(next: unknown, reason: DashboardChangeReason): readonly DefinitionIssue[] {
    const r = checkDefinition(next);
    if (!r.ok) return r.issues;
    this.#commit(r.definition, reason);
    return [];
  }

  /* ---------------------------------------------------------------- variables */

  #dateContext(calendar: string | undefined): DateContext {
    const ctx: { -readonly [K in keyof DateContext]: DateContext[K] } = {};
    if (this.#options.timeZone) ctx.timeZone = this.#options.timeZone;
    const engine = calendar === undefined ? undefined : this.#options.businessCalendars?.[calendar];
    if (engine) ctx.calendar = engine;
    return ctx;
  }

  #initValues(): void {
    this.#values = new Map();
    for (const v of this.#definition.variables ?? []) this.#values.set(v.id, initialValue(v, (c) => this.#dateContext(c)));
  }

  /** Keeps values of unchanged variables when the definition changes. */
  #syncValues(previous: DashboardDefinition): void {
    const next = new Map<string, VariableValue>();
    for (const v of this.#definition.variables ?? []) {
      const before = previous.variables?.find((p) => p.id === v.id);
      const current = this.#values.get(v.id);
      const kept = before?.kind === v.kind && current !== undefined ? acceptValue(v, current) : undefined;
      next.set(v.id, kept ?? initialValue(v, (c) => this.#dateContext(c)));
    }
    this.#values = next;
  }

  #sourceVariables(source: DataSourceDefinition): string[] {
    if (source.kind !== 'http') return [];
    const out: string[] = [];
    for (const v of Object.values(source.params ?? {})) if (typeof v === 'string') out.push(...referencedVariables(v));
    if (source.body !== undefined) out.push(...referencedVariables(JSON.stringify(source.body)));
    return out;
  }

  /* ---------------------------------------------------------------- rendering */

  #applyRootStyle(): void {
    const style = this.#definition.style;
    if (style?.density) this.host.dataset.auiDensity = style.density;
    else delete this.host.dataset.auiDensity;
    if (style?.accent) this.host.dataset.auiAccent = style.accent;
    else delete this.host.dataset.auiAccent;
    this.host.classList.toggle('aui-dashboard-root--editing', this.#mode === 'edit');
  }

  #pageWidgets(): WidgetDefinition[] {
    return this.#definition.widgets.filter((w) => this.#page === null || w.page === this.#page);
  }

  #items(widgets: readonly WidgetDefinition[]): DashboardItem[] {
    return widgets.map((w) => ({ id: w.id, label: w.title, ...w.layout }));
  }

  #teardownViews(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    for (const t of this.#timers.values()) clearTimeout(t);
    this.#timers.clear();
    for (const v of this.#views.values()) {
      try {
        v.instance?.destroy();
      } catch {
        // A failing custom renderer must not block teardown.
      }
      v.widget.destroy();
    }
    this.#views.clear();
    this.#grid?.destroy();
    this.#grid = null;
    this.#gridHost.replaceChildren();
  }

  #render(): void {
    this.#teardownViews();
    this.#syncPages();
    const widgets = this.#pageWidgets();
    const ids = new Set(widgets.map((w) => w.id));
    for (const def of widgets) this.#gridHost.append(this.#createView(def).host);

    const columns = this.#definition.grid?.columns ?? 12;
    const breakpoints = this.#definition.breakpoints ?? defaultBreakpoints(columns);
    const layouts: Record<string, DashboardItem[]> = {};
    for (const [name, entries] of Object.entries(this.#definition.layouts ?? {})) {
      const list = entries.filter((e) => ids.has(e.id)).map((e) => ({ ...e }));
      if (list.length > 0) layouts[name] = list;
    }
    const grid = this.#definition.grid;
    this.#grid = DashboardGrid.create(this.#gridHost, {
      label: this.#options.label ?? getMessage('dashboard', 'region', { title: this.#definition.title }, this.#locale()),
      items: this.#items(widgets),
      layouts,
      breakpoints: breakpoints.map((b) => ({ ...b })),
      editable: this.#mode === 'edit',
      ...(grid?.rowHeight === undefined ? {} : { rowHeight: grid.rowHeight }),
      ...(grid?.gap === undefined ? {} : { gap: grid.gap }),
      ...(grid?.compaction === undefined ? {} : { compaction: grid.compaction }),
      ...(this.#options.locale === undefined ? {} : { locale: this.#options.locale }),
      ...(this.#options.direction === undefined ? {} : { direction: this.#options.direction }),
    });
    const lazy = Dashboard.#resolve(this.#options).lazy && typeof IntersectionObserver !== 'undefined';
    if (lazy) {
      this.#observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.auiItem ?? '';
          const view = this.#views.get(id);
          if (view && !view.visible) {
            view.visible = true;
            this.#observer?.unobserve(entry.target);
            this.#activate(view);
          }
        }
      }, { rootMargin: '200px' });
      for (const v of this.#views.values()) this.#observer.observe(v.host);
    } else {
      for (const v of this.#views.values()) {
        v.visible = true;
        this.#activate(v);
      }
    }
  }

  #alive(): boolean {
    return !this.#destroyed;
  }

  #locale(): string {
    return this.#options.locale ?? getCommonConfig().locale;
  }

  #msg(key: string, params: Readonly<Record<string, string | number>> = {}): string {
    return getMessage('dashboard', key, params, this.#locale());
  }

  #createView(def: WidgetDefinition): View {
    const doc = this.host.ownerDocument;
    const host = doc.createElement('section');
    host.className = 'aui-dashboard-widget';
    host.dataset.auiItem = def.id;
    this.#applyWidgetStyle(host, def);
    const body = doc.createElement('div');
    body.className = 'aui-dashboard-widget__body';
    const state = doc.createElement('div');
    state.className = 'aui-dashboard-widget__state';
    state.hidden = true;
    const footer = doc.createElement('div');
    footer.className = 'aui-dashboard-widget__footer';
    footer.hidden = true;
    host.append(body, state, footer);
    const actions = def.actions ?? {};
    const widgetActions = this.#widgetActions(def);
    const widget = DashboardWidget.create(host, {
      title: def.title,
      headingLevel: this.#options.headingLevel ?? 3,
      ...(def.subtitle === undefined ? {} : { subtitle: def.subtitle }),
      collapsible: actions.collapsible ?? false,
      maximizable: actions.maximizable ?? false,
      removable: actions.removable === true && this.#mode === 'edit',
      actions: widgetActions,
      ...(this.#options.locale === undefined ? {} : { locale: this.#options.locale }),
      ...(this.#options.direction === undefined ? {} : { direction: this.#options.direction }),
    });
    host.addEventListener('aui-remove', (e) => {
      e.preventDefault();
      this.removeWidget(def.id);
    });
    host.addEventListener('aui-action', (e) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id;
      if (id === 'refresh' && def.source !== undefined) void this.#loadSource(def.source, true);
      if (id === 'edit') this.builderHooks.editWidget?.(def.id);
    });
    const view: View = { def, host, widget, body, state, footer, instance: null, type: this.#registry.get(def.type), visible: false, status: 'idle' };
    this.#views.set(def.id, view);
    return view;
  }

  #applyWidgetStyle(host: HTMLElement, def: WidgetDefinition): void {
    const s = def.style ?? {};
    const set = (name: string, value: string | undefined): void => {
      if (value === undefined) host.removeAttribute(`data-aui-${name}`);
      else host.setAttribute(`data-aui-${name}`, value);
    };
    set('accent', s.accent);
    set('surface', s.surface);
    set('border', s.border === undefined ? undefined : String(s.border));
    set('shadow', s.shadow === undefined ? undefined : String(s.shadow));
    set('header', s.header === false ? 'false' : undefined);
    set('density', s.density);
    set('padding', s.padding === undefined ? undefined : String(s.padding));
  }

  /** First render of a visible widget: validate its type and options, then load or render. */
  #activate(view: View): void {
    const { def, type } = view;
    if (!type) {
      this.#setError(view, 'unknown-type', this.#msg('errorUnknownType', { type: def.type }), null);
      return;
    }
    const issues = type.checkOptions?.(def.options ?? {}) ?? [];
    if (issues.length > 0) {
      this.#setError(view, 'options', this.#msg('errorOptions', { path: `options${issues[0]?.path ?? ''}` }), null);
      return;
    }
    try {
      view.instance = type.create({
        body: view.body,
        definition: def,
        locale: this.#locale(),
        direction: this.#options.direction ?? getCommonConfig().direction,
        select: (datum) => {
          this.#onSelect(def, datum);
        },
      });
    } catch {
      this.#setError(view, 'render', this.#msg('errorRender'), null);
      return;
    }
    if (def.source === undefined) {
      this.#deliver(view, undefined, null);
      return;
    }
    const source = this.#definition.dataSources?.[def.source];
    if (!source) return;
    const cached = this.#reusing ? this.#store.current(def.source, source, this.#values) : this.#store.peek(def.source, source, this.#values);
    if (cached) this.#deliver(view, cached.data, cached.at);
    else void this.#loadSource(def.source, false);
  }

  #activeSources(): string[] {
    const set = new Set<string>();
    for (const v of this.#views.values()) if (v.def.source !== undefined && v.visible) set.add(v.def.source);
    return [...set];
  }

  async #loadSource(id: string, force: boolean): Promise<void> {
    const source = this.#definition.dataSources?.[id];
    if (!source || this.#destroyed) return;
    const views = [...this.#views.values()].filter((v) => v.def.source === id && v.visible && v.instance !== null);
    if (views.length === 0) return;
    for (const v of views) if (v.status === 'idle' || v.status === 'error' || v.status === 'loading') this.#setLoading(v);
    try {
      const result = await this.#store.load(id, source, this.#values, force);
      if (!this.#alive()) return;
      this.#loadedAt.set(id, result.at);
      for (const v of this.#viewsOf(id)) this.#deliver(v, result.data, result.at);
    } catch (error) {
      if (!this.#alive() || (error instanceof DashboardDataError && error.kind === 'aborted')) return;
      const last = this.#store.lastGood(id);
      for (const v of this.#viewsOf(id)) {
        if (last && v.status !== 'error') this.#setStale(v, last.at);
        else this.#setDataError(v, error);
      }
    } finally {
      this.#scheduleRefresh(id);
    }
  }

  #viewsOf(source: string): View[] {
    return [...this.#views.values()].filter((v) => v.def.source === source && v.visible && v.instance !== null);
  }

  #deliver(view: View, raw: unknown, at: number | null): void {
    if (!view.instance) return;
    let data: unknown;
    try {
      data = applyTransforms(raw, view.def.transforms, this.#transforms);
    } catch (error) {
      this.#setError(view, 'transform', error instanceof TransformError ? this.#msg('errorTransform') : this.#msg('errorRender'), view.def.source ?? null);
      return;
    }
    const inputs = resolveInputs(data, view.def.map);
    const mapped = view.def.map !== undefined && Object.keys(view.def.map).length > 0;
    const empty = view.def.source !== undefined && (mapped ? Object.values(inputs).every((v) => v === undefined || v === null) : data === null || data === undefined || (Array.isArray(data) && data.length === 0));
    if (empty) {
      view.body.hidden = true;
      this.#setState(view, 'empty', this.#msg('empty'), false);
      this.#setFooter(view, at);
      return;
    }
    try {
      view.body.hidden = false;
      view.instance.update({ data, inputs, options: view.def.options ?? ({}) });
    } catch {
      this.#setError(view, 'render', this.#msg('errorRender'), view.def.source ?? null);
      return;
    }
    this.#setState(view, 'ready', '', false);
    this.#setFooter(view, at);
  }

  #setLoading(view: View): void {
    view.widget.update({ busy: true });
    if (view.status === 'ready' || view.status === 'stale') return;
    this.#setState(view, 'loading', this.#msg('loading'), false);
    view.status = 'loading';
  }

  #setStale(view: View, at: number): void {
    view.widget.update({ busy: false });
    view.status = 'stale';
    view.footer.hidden = false;
    view.footer.textContent = this.#msg('stale', { time: this.#time(at) });
    view.footer.dataset.auiStale = 'true';
  }

  #setDataError(view: View, error: unknown): void {
    const e = error instanceof DashboardDataError ? error : null;
    const status = e?.status ?? (error !== null && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : null);
    const kind = e?.kind ?? (status === null ? 'network' : 'http');
    const key = { blocked: 'errorBlocked', network: 'errorNetwork', http: 'errorHttp', timeout: 'errorTimeout', 'too-large': 'errorTooLarge', parse: 'errorParse', aborted: 'errorNetwork' }[kind];
    this.#setError(view, kind, this.#msg(key, { status: status ?? '' }), view.def.source ?? null, status, kind !== 'blocked');
  }

  #setError(view: View, kind: string, message: string, source: string | null, status: number | null = null, retry = false): void {
    view.body.hidden = true;
    this.#setState(view, 'error', message, retry);
    const detail: DashboardWidgetErrorDetail = { widget: view.def.id, source, kind, status };
    emit(this.host, 'aui-widget-error', detail);
  }

  #setState(view: View, status: WidgetStatus, message: string, retry: boolean): void {
    view.status = status;
    view.widget.update({ busy: status === 'loading' });
    view.host.dataset.auiStatus = status;
    const doc = this.host.ownerDocument;
    if (status === 'ready') {
      view.state.hidden = true;
      view.state.replaceChildren();
      return;
    }
    const text = doc.createElement('p');
    text.className = 'aui-dashboard-widget__message';
    text.textContent = message;
    const children: HTMLElement[] = [text];
    if (retry && view.def.source !== undefined) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'aui-dashboard-widget__retry';
      button.textContent = this.#msg('retry');
      const sourceId = view.def.source;
      button.addEventListener('click', () => {
        void this.#loadSource(sourceId, true);
      });
      children.push(button);
    }
    view.state.setAttribute('role', status === 'error' ? 'alert' : 'status');
    view.state.replaceChildren(...children);
    view.state.hidden = false;
  }

  #time(at: number): string {
    return new Intl.DateTimeFormat(this.#locale(), { timeStyle: 'short', ...(this.#options.timeZone ? { timeZone: this.#options.timeZone } : {}) }).format(at);
  }

  #setFooter(view: View, at: number | null): void {
    delete view.footer.dataset.auiStale;
    if (at === null || view.def.source === undefined || this.#definition.dataSources?.[view.def.source]?.kind === 'static') {
      view.footer.hidden = true;
      return;
    }
    view.footer.hidden = false;
    const time = doc(view).createElement('time');
    time.dateTime = new Date(at).toISOString();
    time.textContent = this.#msg('updated', { time: this.#time(at) });
    view.footer.replaceChildren(time);
  }

  /* ---------------------------------------------------------------- refresh (S3) */

  #scheduleRefresh(id: string): void {
    const existing = this.#timers.get(id);
    if (existing !== undefined) clearTimeout(existing);
    this.#timers.delete(id);
    const source = this.#definition.dataSources?.[id];
    if (source?.kind !== 'http' || !source.refresh || this.#destroyed) return;
    const t = setTimeout(() => {
      this.#timers.delete(id);
      if (isBrowser() && this.host.ownerDocument.visibilityState === 'hidden') return; // resumed on visibilitychange
      void this.#loadSource(id, true);
    }, source.refresh * 1000);
    this.#timers.set(id, t);
  }

  #resumeRefresh(): void {
    for (const id of this.#activeSources()) {
      const source = this.#definition.dataSources?.[id];
      if (source?.kind !== 'http' || !source.refresh) continue;
      const age = Date.now() - (this.#loadedAt.get(id) ?? 0);
      if (age >= source.refresh * 1000 && !this.#timers.has(id)) void this.#loadSource(id, true);
    }
  }

  /* ---------------------------------------------------------------- layout and interactions */

  #onLayoutChange(detail: DashboardGridLayoutChangeDetail): void {
    if (detail.reason === 'add' || detail.reason === 'remove') return;
    const widest = this.#widestName();
    const byId = new Map((detail.layouts[widest] ?? []).map((i) => [i.id, i]));
    const pageIds = new Set(this.#pageWidgets().map((w) => w.id));
    const widgets = this.#definition.widgets.map((w) => {
      const item = byId.get(w.id);
      return item && pageIds.has(w.id) ? { ...w, layout: toLayout(item) } : w;
    });
    const layouts: Record<string, LayoutEntry[]> = {};
    for (const [name, entries] of Object.entries(this.#definition.layouts ?? {})) layouts[name] = entries.filter((e) => !pageIds.has(e.id)).map((e) => ({ ...e }));
    for (const [name, items] of Object.entries(detail.layouts)) {
      if (name === widest) continue;
      layouts[name] = [...(layouts[name] ?? []), ...items.filter((i) => pageIds.has(i.id)).map((i) => ({ id: i.id, ...toLayout(i) }))];
    }
    const next: Record<string, unknown> = { ...this.#definition, widgets };
    const nonEmpty = Object.fromEntries(Object.entries(layouts).filter(([, v]) => v.length > 0));
    if (Object.keys(nonEmpty).length > 0) next.layouts = nonEmpty;
    else delete next.layouts;
    const r = checkDefinition(next);
    if (r.ok) this.#commit(r.definition, 'layout');
  }

  #widestName(): string {
    const columns = this.#definition.grid?.columns ?? 12;
    const bps = this.#definition.breakpoints ?? defaultBreakpoints(columns);
    return bps.reduce((a, b) => (b.minWidth > a.minWidth ? b : a)).name;
  }

  #onSelect(def: WidgetDefinition, datum: JsonValue): void {
    const detail: DashboardWidgetSelectDetail = { widget: def.id, datum };
    emit(this.host, 'aui-widget-select', detail);
    for (const it of def.interactions ?? []) {
      let value: unknown;
      try {
        value = getByPointer(datum, it.from);
      } catch {
        continue;
      }
      const variable = this.#definition.variables?.find((v) => v.id === it.set);
      if (variable?.kind === 'number' && typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) value = Number(value);
      if (variable?.kind === 'select' && variable.multiple === true && typeof value === 'string') value = [value];
      if (variable?.kind === 'text' && typeof value === 'number') value = String(value);
      this.setVariable(it.set, value);
    }
  }

  /** Used by editor modules: the grid instance of the current page. */
  get grid(): DashboardGrid | null {
    return this.#grid;
  }

  /** Used by editor modules: new unique id with a prefix. */
  uniqueId(prefix: string): string {
    const taken = new Set([...this.#definition.widgets.map((w) => w.id), ...Object.keys(this.#definition.dataSources ?? {})]);
    const base = /^[A-Za-z][A-Za-z0-9_-]{0,50}$/.test(prefix) ? prefix : 'widget';
    let n = 1;
    while (taken.has(`${base}-${String(n)}`)) n++;
    return `${base}-${String(n)}`;
  }

  /** Used by the builder: run a data source once (test request) and return the raw response. */
  async testSource(source: DataSourceDefinition): Promise<unknown> {
    const probe = new DataStore({
      ...(this.#options.fetcher ? { fetcher: this.#options.fetcher } : {}),
      ...(this.#options.allowedOrigins ? { allowedOrigins: this.#options.allowedOrigins } : {}),
      ...(this.#options.baseUrl ? { baseUrl: this.#options.baseUrl } : {}),
      retries: 0,
    });
    try {
      return (await probe.load(createId('aui-dashboard-test'), source, this.#values, true)).data;
    } finally {
      probe.dispose();
    }
  }

  /** Used by editor modules: the registry in use. */
  get registry(): WidgetRegistry {
    return this.#registry;
  }

  /** Used by editor modules: the transform registry in use. */
  get transformRegistry(): TransformRegistry {
    return this.#transforms;
  }

  /** Used by editor modules: create options (read-only copy). */
  get options(): Readonly<DashboardOptions> {
    return this.#options;
  }

  /** Used by editor modules: switch the layout apply guard while setting grid layouts programmatically. */
  withoutLayoutEvents(fn: () => void): void {
    this.#applyingLayout = true;
    try {
      fn();
    } finally {
      this.#applyingLayout = false;
    }
  }
}

/** First free top-start spot for a w x h widget among `taken`; below everything when the grid is full. */
export function freeSpot(taken: readonly WidgetLayout[], columns: number, w: number, h: number): { x: number; y: number } {
  const bottom = taken.reduce((m, l) => Math.max(m, l.y + l.h), 0);
  for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x + w <= columns; x++) {
      if (taken.every((l) => x + w <= l.x || l.x + l.w <= x || y + h <= l.y || l.y + l.h <= y)) return { x, y };
    }
  }
  return { x: 0, y: bottom };
}

/** True when two definitions differ only in widget layouts and per-breakpoint layouts. */
function layoutOnly(a: DashboardDefinition, b: DashboardDefinition): boolean {
  const strip = (d: DashboardDefinition): string => JSON.stringify({ ...d, layouts: undefined, widgets: d.widgets.map((w) => ({ ...w, layout: undefined })) });
  return strip(a) === strip(b);
}

function toLayout(item: DashboardItem): WidgetLayout {
  const out: { -readonly [K in keyof WidgetLayout]: WidgetLayout[K] } = { x: item.x, y: item.y, w: item.w, h: item.h };
  if (item.minW !== undefined) out.minW = item.minW;
  if (item.minH !== undefined) out.minH = item.minH;
  if (item.maxW !== undefined) out.maxW = item.maxW;
  if (item.maxH !== undefined) out.maxH = item.maxH;
  if (item.locked !== undefined) out.locked = item.locked;
  return out;
}

function doc(view: View): Document {
  return view.host.ownerDocument;
}
