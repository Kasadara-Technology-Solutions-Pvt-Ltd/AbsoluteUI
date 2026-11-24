/**
 * Angular bridge (SPEC section 22, docs/PLAN-R9-ANGULAR.md D1/D3/D5/D6/D7): lifecycle glue
 * between Angular components and AbsoluteUI controllers. Component logic is never
 * reimplemented here: the bridge creates the controller after the first render in the
 * browser (on the server too for element hosts that skip hydration, D3; the browser then
 * re-creates it), merges the injector's configuration scope under the bound inputs,
 * sends only changed options to `update()`, maps DOM events to outputs and models, and
 * destroys the controller with the view. The controller is internal: consumers use
 * inputs, models, outputs, and the typed methods of each component.
 */
import { isPlatformBrowser } from '@angular/common';
import { afterNextRender, ApplicationRef, booleanAttribute, computed, DestroyRef, effect, ElementRef, inject, Injector, PLATFORM_ID, signal, untracked, ViewContainerRef, type ModelSignal, type OutputEmitterRef, type Signal, type TemplateRef } from '@angular/core';
import { FormGroupDirective, FormResetEvent, FormSubmittedEvent, NgControl, NgForm, TouchedChangeEvent, Validators, type ControlValueAccessor, type ValidationErrors, type Validator } from '@angular/forms';
import { AuiConfig } from '../config.js';
import { AuiLocale } from '../services.js';
import { AUI_FORM_ERRORS, errorMessage } from './form-errors.js';
import { createTemplateView, renderTemplateNode, TemplateStyles } from './render.js';
import { completeServerDom } from './server-dom.js';
import { devWarn } from './diagnostics.js';
import { AuiStyleLoader } from './styles.js';

/** Minimal controller shape shared by every AbsoluteUI component. */
export interface Controller<O> {
  update(options: Partial<O>): void;
  destroy(): void;
}

/** Validity shape exposed by AbsoluteUI form controls. */
export interface ControlValidityLike {
  readonly valid: boolean;
  readonly error?: string | null;
  readonly message: string;
}

type AnyRecord = Record<string, unknown>;

/**
 * Drop `undefined` entries so unset Angular inputs never override configuration
 * (SPEC section 6.3) and satisfy `exactOptionalPropertyTypes`.
 */
export function defined<T extends object>(values: { [K in keyof T]-?: T[K] | undefined }): T {
  const out: AnyRecord = {};
  for (const [k, v] of Object.entries(values)) if (v !== undefined) out[k] = v;
  // Safe: only keys of T with defined values remain.
  return out as T;
}

/** Boolean input transform: a bare attribute means true; unset stays unset (configuration applies). */
export function booleanInput(value: unknown): boolean | undefined {
  return value === undefined ? undefined : booleanAttribute(value);
}

/** Read `detail` from an AbsoluteUI CustomEvent (the one DOM typing boundary). */
export function detailOf(event: Event): unknown {
  return (event as CustomEvent<unknown>).detail;
}

/** Forward an event detail to an output (payload shapes are the documented component contracts). */
export function emitTo<T>(ref: OutputEmitterRef<T>): (detail: unknown) => void {
  return (detail) => {
    ref.emit(detail as T);
  };
}

/**
 * Marker on hosts rendered on the server (D3): the attributes and classes the server-side
 * controller added, as "attr attr|class class". The browser removes them (Angular already
 * cleared the children of a host that skips hydration) and creates the controller again.
 */
const SSR_MARKER = 'data-aui-ssr';

declare const ngDevMode: boolean | undefined;

/** Undo a server render: listed attributes and classes, the marker, and any children. */
function resetServerRender(host: HTMLElement): void {
  const marker = host.getAttribute(SSR_MARKER);
  if (marker === null) return;
  const [attrs = '', classes = ''] = marker.split('|');
  for (const a of attrs.split(' ')) if (a) host.removeAttribute(a);
  for (const c of classes.split(' ')) if (c) host.classList.remove(c);
  if (host.classList.length === 0) host.removeAttribute('class');
  host.removeAttribute(SSR_MARKER);
  host.replaceChildren();
}

/**
 * Development diagnostics for table-level column templates (D27). A module function, so
 * production builds drop it together with its only (ngDevMode-guarded) call.
 */
function checkTableTemplates(component: string, columns: readonly { readonly id: string }[], templates: readonly { column(): string; of?(): readonly unknown[] | null | undefined }[], rows: (() => readonly unknown[] | undefined) | undefined): void {
  const ids = new Set(columns.map((c) => c.id));
  const data = rows ? untracked(rows) : undefined;
  for (const t of templates) {
    const id = untracked(() => t.column());
    if (id !== '' && !ids.has(id)) devWarn('AUI_NG_TEMPLATE_COLUMN', component, `a column template names column "${id}", which the table does not have (template ignored).`);
    const of = t.of ? untracked(() => t.of?.()) : undefined;
    if (of && data && of !== data) devWarn('AUI_NG_TEMPLATE_OF', component, "a template's [auiCellOf] is bound to a different array than [rows]; it only types the template, so bind the same array.");
  }
}

/** Same value, or arrays with the same elements (controller getters often return copies). */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((v, i) => Object.is(v, b[i]));
}

/** Options whose value differs from the last applied options, or null when nothing changed. */
function changed(previous: AnyRecord, next: AnyRecord): AnyRecord | null {
  let out: AnyRecord | null = null;
  for (const [k, v] of Object.entries(next)) {
    if (!Object.is(previous[k], v)) (out ??= {})[k] = v;
  }
  return out;
}

/** The parts of a Data Table column the template helpers use. */
export interface TableColumnLike {
  readonly id: string;
  readonly header: string;
  readonly render?: ((row: never, doc: Document) => Node | string) | undefined;
  readonly renderHeader?: ((column: never, doc: Document) => Node) | undefined;
  readonly renderEditor?: ((context: never, doc: Document) => Node) | undefined;
}

/** The editor context the table passes to `renderEditor`. */
export interface EditorContextLike {
  readonly row: unknown;
  readonly column: string;
  readonly value: unknown;
  readonly error: string | null;
  commit(value: unknown): void;
  cancel(): void;
}

/** Context the `auiEditor` template receives. */
export interface EditorTemplateContext {
  readonly $implicit: unknown;
  readonly value: unknown;
  readonly row: unknown;
  readonly column: string;
  readonly error: string | null;
  readonly commit: (value: unknown) => void;
  readonly cancel: () => void;
}

/** A template directive bound to a column id (`auiCell`, `auiHeader`). */
export interface SlotTemplateLike<Ctx> {
  column(): string;
  readonly template: TemplateRef<Ctx>;
  /** The array bound with `[auiCellOf]` (typing only), when the directive has one. */
  of?(): readonly unknown[] | null | undefined;
}

/** An `<aui-column>` child. */
export interface DeclaredColumnLike {
  definition(): unknown;
  cellTemplate(): { readonly template: TemplateRef<{ $implicit: unknown; row: unknown; column: string }> } | undefined;
  headerTemplate(): { readonly template: TemplateRef<{ $implicit: string; column: string; header: string }> } | undefined;
  editorTemplate(): { readonly template: TemplateRef<EditorTemplateContext> } | undefined;
}

export interface BridgeConfig<C extends Controller<O>, O> {
  create: (host: HTMLElement, options: O) => C;
  /** Bound inputs and models (undefined entries removed). */
  options: () => O;
  /** Component configuration name (api.json `configKey`): scope settings are merged under the inputs. */
  configKey?: string;
  /** DOM event name -> handler. Only events dispatched on `eventTarget` are forwarded. */
  events?: Readonly<Record<string, (detail: unknown) => void>>;
  /** Element the controller dispatches its events on. Default: the host. */
  eventTarget?: (controller: C, host: HTMLElement) => EventTarget;
  /** Called once after creation in the browser. */
  created?: (controller: C) => void;
  /** Called once after a server render (D3): state that only browser hooks apply otherwise. */
  serverCreated?: (controller: C) => void;
  /**
   * Host attributes removed after creation: a static binding such as `title="..."`
   * also leaves a native attribute (tooltip, role) on the host that must not leak.
   */
  strip?: readonly string[];
}

let readController: <C>(bridge: ComponentBridge<C & Controller<never>, never>) => Signal<C | null>;
let writeTransform: (bridge: ComponentBridge<Controller<never>, never>, transform: OptionsTransform) => void;

/** @internal Rewrites effective options before they reach the controller (companion directives such as auiRouterNav). */
export type OptionsTransform = (options: Readonly<Record<string, unknown>>) => Record<string, unknown>;

/** @internal The controller of an AbsoluteUI component (null before the first browser render). For companion directives only. */
export function controllerOf<C extends Controller<O>, O>(bridge: ComponentBridge<C, O>): Signal<C | null> {
  // Safe: the reader returns the bridge's own controller signal; O only constrains update().
  return readController(bridge as unknown as ComponentBridge<C & Controller<never>, never>);
}

/** Components by host element, for companion directives that do not know the component class. */
const bridges = new WeakMap<HTMLElement, ComponentBridge<Controller<never>, never>>();

/**
 * @internal Install an options transform on the component of `host` (one per component; call it
 * from a companion directive's constructor so creation already sees it). The transform may
 * read signals; options are re-sent when they change. False when `host` has no component.
 */
export function transformOptionsOf(host: HTMLElement, transform: OptionsTransform): boolean {
  const bridge = bridges.get(host);
  if (!bridge) return false;
  writeTransform(bridge, transform);
  return true;
}

/**
 * Base class for AbsoluteUI components. Subclasses declare signal inputs, models,
 * and outputs and pass a `BridgeConfig` to `init()` from their constructor.
 */
export abstract class ComponentBridge<C extends Controller<O>, O> {
  static {
    readController = (bridge) => bridge.#controller.asReadonly();
    writeTransform = (bridge, transform) => {
      bridge.#transform.set(transform);
    };
  }

  protected readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #controller = signal<C | null>(null);
  readonly #transform = signal<OptionsTransform | null>(null);
  readonly #scope = inject(AuiConfig);
  readonly #destroyRef = inject(DestroyRef);
  readonly #injector = inject(Injector);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #hooks = new WeakMap<object, unknown>();
  #destroyed = false;
  /** Options last sent to the controller (creation or update), including echoed model values. */
  #applied: AnyRecord = {};
  /** Readers of read-only state signals (D25). */
  readonly #stateReaders: ((controller: C) => void)[] = [];
  /** Readers that bring models back in line with the component after typed methods (D26). */
  readonly #modelReaders: ((controller: C) => void)[] = [];

  /** The controller, available after the first browser render. */
  protected get controller(): C | null {
    return this.#controller();
  }

  protected init(config: BridgeConfig<C, O>): void {
    // Safe: the registry is only used to install transforms, which do not depend on C or O.
    bridges.set(this.host, this as unknown as ComponentBridge<Controller<never>, never>);
    const effective = computed(() => {
      const options: AnyRecord = { ...this.#scope.optionsFor(config.configKey), ...(config.options() as AnyRecord) };
      const transform = this.#transform();
      return transform ? transform(options) : options;
    });
    effect(() => {
      const next = effective();
      untracked(() => {
        const controller = this.#controller();
        if (!controller) return;
        const diff = changed(this.#applied, next);
        this.#applied = next;
        if (diff) {
          // Safe: diff holds a subset of the effective options, which are O.
          controller.update(diff as Partial<O>);
          this.optionsApplied();
          this.afterChange();
        }
      });
    });
    // D3: element hosts that skip hydration render on the server; the browser re-creates them.
    // Attribute directives on native elements (button[auiButton], ...) render in the browser only:
    // their hosts are hydrated, so server-side DOM changes inside them would not match.
    if (!this.#browser && this.host.hasAttribute('ngSkipHydration')) {
      let attempted = false;
      effect(() => {
        const options = effective();
        if (attempted) return;
        attempted = true;
        untracked(() => {
          this.#renderOnServer(config, options);
        });
      });
    }
    afterNextRender(() => {
      resetServerRender(this.host);
      const options = untracked(effective);
      // Safe: effective options are the bound inputs (O) plus scope settings the component declares.
      const controller = config.create(this.host, options as O);
      this.#applied = options;
      this.#controller.set(controller);
      const target = config.eventTarget?.(controller, this.host) ?? this.host;
      const listeners: [string, EventListener][] = Object.entries(config.events ?? {}).map(([type, handler]) => [
        type,
        (event: Event) => {
          // Nested AbsoluteUI components bubble the same event names; forward only our own.
          // Events fired while the controller is torn down never reach destroyed outputs (NG0953).
          if (event.target === target && !this.#destroyed) {
            handler(detailOf(event));
            this.afterChange();
          }
        },
      ]);
      for (const [type, listener] of listeners) target.addEventListener(type, listener);
      this.#destroyRef.onDestroy(() => {
        for (const [type, listener] of listeners) target.removeEventListener(type, listener);
      });
      for (const a of config.strip ?? []) this.host.removeAttribute(a);
      config.created?.(controller);
      this.afterChange();
    });
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
      this.#controller()?.destroy();
      this.#controller.set(null);
    });
  }

  /**
   * Server render (D3). A component that needs browser APIs leaves the host as it was and
   * renders in the browser only (dev mode names it; never option values).
   */
  #renderOnServer(config: BridgeConfig<C, O>, options: AnyRecord): void {
    const host = this.host;
    const attrs = new Set(host.getAttributeNames());
    const classes = new Set(Array.from(host.classList));
    let controller: C;
    try {
      completeServerDom(host.ownerDocument);
      // Safe: effective options are the bound inputs (O) plus scope settings the component declares.
      controller = config.create(host, options as O);
    } catch (error) {
      for (const a of host.getAttributeNames()) if (!attrs.has(a) && a !== 'class') host.removeAttribute(a);
      for (const c of Array.from(host.classList)) if (!classes.has(c)) host.classList.remove(c);
      host.replaceChildren();
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        devWarn('AUI_NG_SERVER_FALLBACK', host.localName, `renders in the browser only (server render failed: ${error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error'}).`);
      }
      return;
    }
    for (const a of config.strip ?? []) host.removeAttribute(a);
    this.#applied = options;
    this.#controller.set(controller);
    config.serverCreated?.(controller);
    this.afterChange();
    const addedAttrs = host.getAttributeNames().filter((a) => !attrs.has(a) && a !== 'class');
    const addedClasses = Array.from(host.classList).filter((c) => !classes.has(c));
    host.setAttribute(SSR_MARKER, `${addedAttrs.join(' ')}|${addedClasses.join(' ')}`);
  }

  /**
   * A render hook backed by an Angular template (D8), or undefined without a template.
   * The same function is returned for the same template, so options stay unchanged.
   */
  protected templateHook<A extends unknown[], C>(template: TemplateRef<C> | undefined, context: (...args: A) => C): ((...args: A) => Node) | undefined {
    if (!template) return undefined;
    const known = this.#hooks.get(template);
    // Safe: the map is keyed by template and only holds the hook created for it below.
    if (known) return known as (...args: A) => Node;
    this.#injector.get(AuiStyleLoader).load(TemplateStyles);
    const vcr = this.#injector.get(ViewContainerRef);
    const app = this.#browser ? null : this.#injector.get(ApplicationRef);
    const hook = (...args: A): Node => renderTemplateNode(vcr, template, context(...args), this.host.ownerDocument, app);
    this.#hooks.set(template, hook);
    return hook;
  }

  #projected: { template: TemplateRef<unknown>; node: Node | undefined } | null = null;

  /** The default projected content as one node, or undefined when nothing (but whitespace) is projected. */
  protected projectedContent(template: TemplateRef<unknown> | undefined): Node | undefined {
    if (!template) return undefined;
    if (this.#projected?.template !== template) {
      this.#injector.get(AuiStyleLoader).load(TemplateStyles);
      const view = createTemplateView(this.#injector.get(ViewContainerRef), template, undefined, this.#browser ? null : this.#injector.get(ApplicationRef));
      view.detectChanges();
      const nodes = view.rootNodes as Node[];
      const meaningful = nodes.some((n) => n.nodeType !== Node.TEXT_NODE || (n.textContent ?? '').trim() !== '');
      let node: Node | undefined;
      if (meaningful) {
        const wrapper = this.host.ownerDocument.createElement('span');
        wrapper.className = 'aui-template';
        wrapper.append(...nodes);
        node = wrapper;
      }
      this.#projected = { template, node };
    }
    return this.#projected.node;
  }

  /**
   * Data Table columns (M5): the bound `columns`, or the `<aui-column>` children. A column's
   * own `auiCell`/`auiHeader` template (or a table-level one matching its id) renders its
   * cells/header unless the column has `render`/`renderHeader` of its own.
   */
  protected tableColumns<C extends TableColumnLike>(
    bound: readonly C[] | undefined,
    declared: readonly DeclaredColumnLike[],
    cells: readonly SlotTemplateLike<{ $implicit: unknown; row: unknown; column: string }>[],
    headers: readonly SlotTemplateLike<{ $implicit: string; column: string; header: string }>[],
    editors: readonly SlotTemplateLike<EditorTemplateContext>[] = [],
    rows?: () => readonly unknown[] | undefined,
  ): readonly C[] {
    // Safe: declared column functions are written for, and only called with, this table's rows.
    const columns = bound ?? declared.map((d) => d.definition() as C);
    if (typeof ngDevMode === 'undefined' || ngDevMode) checkTableTemplates(this.host.localName, columns, [...cells, ...headers, ...editors], rows);
    const ownCells = new Map<string, TemplateRef<{ $implicit: unknown; row: unknown; column: string }>>();
    const ownHeaders = new Map<string, TemplateRef<{ $implicit: string; column: string; header: string }>>();
    const ownEditors = new Map<string, TemplateRef<EditorTemplateContext>>();
    if (!bound) {
      declared.forEach((d, i) => {
        const id = columns[i]?.id;
        if (id === undefined) return;
        const cell = d.cellTemplate()?.template;
        const header = d.headerTemplate()?.template;
        if (cell) ownCells.set(id, cell);
        if (header) ownHeaders.set(id, header);
        const editor = d.editorTemplate()?.template;
        if (editor) ownEditors.set(id, editor);
      });
    }
    if (cells.length === 0 && headers.length === 0 && editors.length === 0 && ownCells.size === 0 && ownHeaders.size === 0 && ownEditors.size === 0) return columns;
    return columns.map((c) => {
      const cellTemplate = ownCells.get(c.id) ?? cells.find((t) => t.column() === c.id)?.template;
      const headerTemplate = ownHeaders.get(c.id) ?? headers.find((t) => t.column() === c.id)?.template;
      const render = c.render ? undefined : this.templateHook(cellTemplate, (row: unknown) => ({ $implicit: row, row, column: c.id }));
      const renderHeader = c.renderHeader ? undefined : this.templateHook(headerTemplate, () => ({ $implicit: c.header, column: c.id, header: c.header }));
      const editorTemplate = ownEditors.get(c.id) ?? editors.find((t) => t.column() === c.id)?.template;
      const renderEditor = c.renderEditor
        ? undefined
        : this.templateHook(editorTemplate, (ctx: EditorContextLike): EditorTemplateContext => ({
            $implicit: ctx.value,
            value: ctx.value,
            row: ctx.row,
            column: ctx.column,
            error: ctx.error,
            commit: (value: unknown) => {
              ctx.commit(value);
            },
            cancel: () => {
              ctx.cancel();
            },
          }));
      if (!render && !renderHeader && !renderEditor) return c;
      return { ...c, ...(render ? { render } : {}), ...(renderHeader ? { renderHeader } : {}), ...(renderEditor ? { renderEditor } : {}) };
    });
  }

  /**
   * A read-only signal of component state (D25), read from the controller after creation,
   * after every component event, after option updates, and after typed methods; `initial`
   * before the component exists (and on the server until it renders).
   */
  protected stateSignal<T>(read: (controller: C) => T, initial: T): Signal<T> {
    const value = signal(initial, { equal: sameValue });
    this.#stateReaders.push((controller) => {
      value.set(read(controller));
    });
    return value.asReadonly();
  }

  /**
   * Keep a model in line with the component when a typed method changes the state without
   * an event (D26): after the method, the model takes the component's value.
   */
  protected trackModel<T>(model: ModelSignal<T | undefined>, option: string, read: (controller: C) => T | null | undefined): void {
    this.#modelReaders.push((controller) => {
      // Getters report "none" as null; models use undefined for it.
      const value: T | undefined = read(controller) ?? undefined;
      if (!sameValue(untracked(model), value)) this.syncModel(model, option, value);
    });
  }

  /** Re-read state signals (and, after a typed method, models) from the component. */
  protected afterChange(models = false): void {
    const controller = untracked(() => this.#controller());
    if (!controller || this.#destroyed) return;
    untracked(() => {
      for (const read of this.#stateReaders) read(controller);
      if (models) for (const read of this.#modelReaders) read(controller);
    });
  }

  /**
   * Update a model from a component event. The value is recorded as applied, so the
   * resulting input change is not sent back to the component (it already has it).
   */
  protected syncModel<T>(model: ModelSignal<T>, option: string, value: T): void {
    this.#applied = { ...this.#applied, [option]: value };
    model.set(value);
  }

  /** Hook for subclasses after options were applied to an existing controller. */
  protected optionsApplied(): void {
    // Default: nothing.
  }
}

export interface ValueAdapter<C, V> {
  read: (controller: C) => V;
  write: (controller: C, value: V | null) => void;
  /** DOM event that signals a user value change (propagated to the model and the Angular form). */
  event: string;
  validity: (controller: C) => ControlValidityLike;
  /** The value model (`value`, or `checked` for Checkbox and Switch). */
  model: ModelSignal<V | undefined>;
  /** Clear touched/submitted state and messages in the component (form reset). */
  reset?: (controller: C) => void;
  /** Show the component's messages now (form submitted, or touched by the application). */
  report?: (controller: C) => void;
  /** Show an external error message in the component, or clear it with null. */
  customError?: (controller: C, message: string | null) => void;
}

/** Angular form state of a control, as signals (all false without a form binding). */
export interface AuiControlState {
  readonly touched: Signal<boolean>;
  readonly dirty: Signal<boolean>;
  /** An async validator is running. */
  readonly pending: Signal<boolean>;
  /** The enclosing form was submitted (until it is reset). */
  readonly submitted: Signal<boolean>;
  /** Invalid and touched or submitted: the state in which errors are shown. */
  readonly errorState: Signal<boolean>;
}

const NO_ERRORS: Readonly<Record<string, unknown>> = {};

/**
 * Base class for form controls (docs/PLAN-R9-ANGULAR.md M2): a ControlValueAccessor and
 * Validator backed by the component's own value and validity (Angular forms see exactly
 * what the user sees), plus a value model for `[(value)]` without forms. Use one of the
 * two per control. With a form binding, the component also follows the form: submission
 * and `markAllAsTouched()` show messages, reset clears them, `Validators.required` marks
 * the field required, and errors of Angular validators are shown in the component.
 */
export abstract class ControlBridge<C extends Controller<O>, O, V> extends ComponentBridge<C, O> implements ControlValueAccessor, Validator {
  #adapter: ValueAdapter<C, V> | null = null;
  #pending: { value: V | null } | null = null;
  /** Last value known to be in the component (from the user, the form, or the model). */
  #current: { value: V | null } | null = null;
  #onChange: (value: V) => void = () => undefined;
  #onTouched: () => void = () => undefined;
  #onValidatorChange: () => void = () => undefined;
  readonly #injector = inject(Injector);
  readonly #messages = inject(AUI_FORM_ERRORS);
  readonly #locale = inject(AuiLocale);
  /** Message of an Angular validator error currently shown through the component's custom error. */
  #shownError: string | null = null;
  /** The next touched change comes from our own focusout (the component already follows its timing). */
  #selfTouch = false;
  readonly #touched = signal(false);
  readonly #dirty = signal(false);
  readonly #pendingState = signal(false);
  readonly #submitted = signal(false);
  readonly #invalid = signal(false);

  /** Disabled by the Angular form; subclasses OR it into the `disabled` option. */
  protected readonly formDisabled = signal(false);
  /** `Validators.required` (or `requiredTrue`) on the bound control; subclasses OR it into `required`. */
  protected readonly formRequired = signal(false);

  /** Angular form state of this control. */
  readonly formState: AuiControlState = {
    touched: this.#touched.asReadonly(),
    dirty: this.#dirty.asReadonly(),
    pending: this.#pendingState.asReadonly(),
    submitted: this.#submitted.asReadonly(),
    errorState: computed(() => this.#invalid() && (this.#touched() || this.#submitted())),
  };

  protected initControl(config: BridgeConfig<C, O>, adapter: ValueAdapter<C, V>): void {
    this.#adapter = adapter;
    const userCreated = config.created;
    const destroyRef = inject(DestroyRef);
    // Model -> component (parent binding). Values that came from the component are skipped.
    effect(() => {
      const value = adapter.model();
      untracked(() => {
        if (value === undefined || (this.#current && Object.is(this.#current.value, value))) return;
        const controller = this.controller;
        if (!controller) return;
        this.#current = { value };
        adapter.write(controller, value);
      });
    });
    // An async validator in progress is announced as busy.
    effect(() => {
      if (this.#pendingState()) this.host.setAttribute('aria-busy', 'true');
      else this.host.removeAttribute('aria-busy');
    });
    this.init({
      ...config,
      create: (host, options) => {
        const controller = config.create(host, options);
        const initial = untracked(adapter.model);
        if (initial !== undefined) {
          adapter.write(controller, initial);
          this.#current = { value: initial };
        }
        return controller;
      },
      events: {
        ...config.events,
        [adapter.event]: (detail) => {
          const controller = this.controller;
          if (controller) {
            const value = adapter.read(controller);
            this.#current = { value };
            // The user replaced the value: a shown validator message was cleared by the component.
            this.#shownError = null;
            adapter.model.set(value);
            this.#onChange(value);
          }
          config.events?.[adapter.event]?.(detail);
        },
      },
      // The form value written before creation (writeValue) is rendered on the server too.
      serverCreated: (controller) => {
        if (this.#pending) adapter.write(controller, this.#pending.value);
      },
      created: (controller) => {
        if (this.#pending) {
          adapter.write(controller, this.#pending.value);
          this.#current = this.#pending;
        }
        this.#pending = null;
        const touched = (event: FocusEvent): void => {
          const next = event.relatedTarget;
          if (!(next instanceof Node && this.host.contains(next))) {
            this.#selfTouch = true;
            this.#onTouched();
            this.#selfTouch = false;
          }
        };
        this.host.addEventListener('focusout', touched);
        destroyRef.onDestroy(() => {
          this.host.removeEventListener('focusout', touched);
        });
        this.#followForm(controller, adapter, destroyRef);
        if (typeof ngDevMode === 'undefined' || ngDevMode) {
          const formBound = this.#injector.get(NgControl, null, { self: true, optional: true }) !== null;
          if (formBound && untracked(adapter.model) !== undefined) {
            devWarn('AUI_NG_VALUE_WITH_FORM', this.host.localName, 'has both a value binding and a form directive (formControl, formControlName, or ngModel); use one. The form directive wins.');
          }
        }
        userCreated?.(controller);
        this.#onValidatorChange();
      },
    });
  }

  /** Follow the bound Angular control and its form (no-op without a form binding). */
  #followForm(controller: C, adapter: ValueAdapter<C, V>, destroyRef: DestroyRef): void {
    // Read lazily: NgControl depends on this component's value accessor, so it cannot be injected eagerly.
    const control = this.#injector.get(NgControl, null, { self: true, optional: true })?.control ?? null;
    if (!control) return;
    // The enclosing form directive reports submission and resetForm(); `submitted` follows Angular's own flag.
    const form = this.#injector.get(FormGroupDirective, null, { optional: true }) ?? this.#injector.get(NgForm, null, { optional: true });
    let wasTouched = control.touched;
    const sync = (): void => {
      this.#touched.set(control.touched);
      this.#dirty.set(control.dirty);
      this.#pendingState.set(control.pending);
      this.#invalid.set(control.invalid);
      this.#submitted.set(form?.submitted ?? false);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- static validator functions, matched by reference
      this.formRequired.set(control.hasValidator(Validators.required) || control.hasValidator(Validators.requiredTrue));
      this.#showValidatorError(controller, adapter, control.errors ?? NO_ERRORS);
    };
    // The control's own events: value, status (including async validators), touched, pristine.
    const own = control.events.subscribe((event) => {
      if (event instanceof TouchedChangeEvent && control.touched !== wasTouched) {
        if (control.touched && !this.#selfTouch) adapter.report?.(controller);
        // control.reset() or markAsUntouched(): clear the component's touched state and messages.
        else if (!control.touched) this.#resetComponent(controller, adapter, control.value as V | null);
      }
      wasTouched = control.touched;
      sync();
    });
    const formEvents = form?.form.events.subscribe((event) => {
      if (event instanceof FormSubmittedEvent) adapter.report?.(controller);
      else if (event instanceof FormResetEvent) this.#resetComponent(controller, adapter, control.value as V | null);
      else return;
      sync();
    });
    destroyRef.onDestroy(() => {
      own.unsubscribe();
      formEvents?.unsubscribe();
    });
    sync();
  }

  #resetComponent(controller: C, adapter: ValueAdapter<C, V>, value: V | null): void {
    if (!adapter.reset) return;
    adapter.reset(controller);
    this.#shownError = null;
    // The component restores its initial value; the form's value wins.
    adapter.write(controller, value);
    this.#current = { value };
  }

  /**
   * Errors of Angular validators (not the component's own) are shown in the component
   * once the control is touched or the form submitted, unless the component already
   * shows an error of its own.
   */
  #showValidatorError(controller: C, adapter: ValueAdapter<C, V>, errors: Readonly<Record<string, unknown>>): void {
    if (!adapter.customError) return;
    // `aui` is the component's own error, reported through validate().
    const external = Object.fromEntries(Object.entries(errors).filter(([key]) => key !== 'aui'));
    const visible = this.#touched() || this.#submitted();
    const own = adapter.validity(controller);
    const ownError = !own.valid && !(own.error === 'custom' && own.message === this.#shownError);
    const message = visible && !ownError ? errorMessage(external, this.#messages, untracked(this.#locale.locale)) : null;
    if (message === this.#shownError) return;
    this.#shownError = message;
    adapter.customError(controller, message);
  }

  protected override optionsApplied(): void {
    this.#onValidatorChange();
  }

  writeValue(value: V | null): void {
    const controller = this.controller;
    if (controller && this.#adapter) {
      this.#adapter.write(controller, value);
      this.#current = { value };
    } else this.#pending = { value };
  }

  registerOnChange(fn: (value: V) => void): void {
    this.#onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.#onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }

  validate(): ValidationErrors | null {
    const controller = this.controller;
    if (!controller || !this.#adapter) return null;
    const validity = this.#adapter.validity(controller);
    // A message we show for an Angular validator is not the component's own error.
    if (validity.valid || (validity.error === 'custom' && validity.message === this.#shownError)) return null;
    return { aui: { error: validity.error ?? 'custom', message: validity.message } };
  }

  registerOnValidatorChange(fn: () => void): void {
    this.#onValidatorChange = fn;
  }
}
