/**
 * @absoluteui/components/dashboard/builder (R18-11, R18-16): the widget builder (a Drawer with a form and
 * a JSON tab) and the dashboard JSON editor (validate, apply, import a file, download). Opt in with
 * `enableDashboardBuilder(dashboard)`; the toolbar then shows "Add widget" and "JSON" in edit mode and each
 * widget gets an edit action. Every control is an AbsoluteUI component.
 */
import { DisposableGroup, getCommonConfig, getMessage, registerMessages } from '@absoluteui/core';
import { safeJsonParse } from '@absoluteui/helpers/json';
import { Button } from '../../button/button.js';
import { Drawer } from '../../drawer/drawer.js';
import { FileUpload } from '../../file-upload/file-upload.js';
import { InlineMessage } from '../../inline-message/inline-message.js';
import { MultiSelect } from '../../multi-select/multi-select.js';
import { NumberInput } from '../../number-input/number-input.js';
import { Select } from '../../select/select.js';
import { Switch } from '../../switch/switch.js';
import { Tabs } from '../../tabs/tabs.js';
import { Textarea } from '../../textarea/textarea.js';
import { TextInput } from '../../text-input/text-input.js';
import { checkDefinition, type DefinitionIssue } from '../check.js';
import type { Dashboard } from '../dashboard.js';
import { ACCENTS, SURFACES, type DataSourceDefinition, type JsonObject, type JsonValue, type WidgetDefinition } from '../definition.js';
import type { WidgetOptionSpec, WidgetType } from '../registry.js';

registerMessages('dashboardBuilder', 'en', {
  addTitle: 'Add widget',
  editTitle: 'Edit {title}',
  jsonTitle: 'Dashboard JSON',
  form: 'Form',
  json: 'JSON',
  type: 'Widget type',
  title: 'Title',
  subtitle: 'Subtitle',
  source: 'Data source',
  sourceNone: 'None',
  sourceNew: 'New HTTP source',
  url: 'URL',
  method: 'Method',
  params: 'Query parameters (one name=value per line)',
  credentials: 'Credentials',
  refresh: 'Refresh every (seconds, 0 = off)',
  test: 'Test request',
  testOk: 'Response received. Fields are available below.',
  testFailed: 'The test request failed: {message}',
  mapping: 'Data mapping',
  options: 'Options',
  style: 'Style',
  accent: 'Accent',
  surface: 'Surface',
  width: 'Width (columns)',
  height: 'Height (rows)',
  save: 'Save',
  cancel: 'Cancel',
  apply: 'Apply',
  download: 'Download',
  importFile: 'Import a JSON file',
  definition: 'Definition',
  valid: 'The definition is valid.',
  invalidJson: 'This is not valid JSON.',
  issues: '{count} issues. First: {path}: expected {expected}.',
  editWidget: 'Edit {title}',
  default: 'Default',
  template: 'Start from a template',
  blank: 'Blank widget',
  sourceTemplate: 'From the template ({id})',
  startFrom: 'Start from',
  current: 'Current dashboard',
});

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface Destroyable {
  destroy(): void;
}

/** A pre-canned widget (R18 requirement 4, S6): JSON the builder starts from. */
export interface WidgetTemplate {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** The widget without id (generated) and with an optional layout (size is kept, position is found). */
  readonly widget: Omit<WidgetDefinition, 'id' | 'layout'> & { readonly layout?: WidgetDefinition['layout'] };
  /** A data source the widget needs; added under `id` unless the dashboard already has that id. */
  readonly dataSource?: { readonly id: string; readonly definition: DataSourceDefinition };
}

/** A pre-canned whole dashboard (S6) offered in the JSON editor. */
export interface DashboardTemplate {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** A complete definition (validated when applied). */
  readonly definition: unknown;
}

export interface DashboardBuilderOptions {
  readonly widgetTemplates?: readonly WidgetTemplate[];
  readonly dashboardTemplates?: readonly DashboardTemplate[];
}

interface SourceDraft {
  mode: 'none' | 'existing' | 'new' | 'template';
  templateDef?: DataSourceDefinition;
  id: string;
  url: string;
  method: 'GET' | 'POST';
  params: string;
  credentials: 'same-origin' | 'include' | 'omit';
  refresh: number;
}

/** A path into a response the mapping can use. */
export interface PointerCandidate {
  readonly pointer: string;
  readonly kind: 'array' | 'number' | 'string' | 'boolean' | 'object';
}

/** Lists JSON Pointers into a sample response (depth 4, at most 200), for the mapping pickers. */
export function pointerCandidates(sample: unknown): PointerCandidate[] {
  const out: PointerCandidate[] = [];
  const esc = (t: string): string => t.replace(/~/g, '~0').replace(/\//g, '~1');
  const walk = (v: unknown, p: string, depth: number): void => {
    if (out.length >= 200) return;
    if (Array.isArray(v)) {
      out.push({ pointer: p, kind: 'array' });
      if (depth < 4 && v.length > 0) walk(v[0], `${p}/0`, depth + 1);
      return;
    }
    if (v !== null && typeof v === 'object') {
      if (p !== '') out.push({ pointer: p, kind: 'object' });
      if (depth >= 4) return;
      for (const [k, item] of Object.entries(v)) walk(item, `${p}/${esc(k)}`, depth + 1);
      return;
    }
    if (typeof v === 'number') out.push({ pointer: p, kind: 'number' });
    else if (typeof v === 'string') out.push({ pointer: p, kind: 'string' });
    else if (typeof v === 'boolean') out.push({ pointer: p, kind: 'boolean' });
  };
  walk(sample, '', 0);
  return out;
}

/** Field names of the first records of the first array in a sample (for field pickers). */
export function fieldCandidates(sample: unknown): string[] {
  const find = (v: unknown, depth: number): readonly unknown[] | null => {
    if (Array.isArray(v)) return v as readonly unknown[];
    if (v !== null && typeof v === 'object' && depth < 3) {
      for (const item of Object.values(v)) {
        const found = find(item, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  const rows = find(sample, 0) ?? [];
  const names = new Set<string>();
  for (const row of rows.slice(0, 20)) if (row !== null && typeof row === 'object' && !Array.isArray(row)) for (const k of Object.keys(row)) names.add(k);
  return [...names].slice(0, 100);
}

function parseParams(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t === '') continue;
    const i = t.indexOf('=');
    const name = (i < 0 ? t : t.slice(0, i)).trim();
    if (name !== '') out[name] = i < 0 ? '' : t.slice(i + 1).trim();
  }
  return out;
}

function formatParams(params: Readonly<Record<string, unknown>> | undefined): string {
  return Object.entries(params ?? {}).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n');
}

const MAX_IMPORT_BYTES = 1024 * 1024;

export class DashboardBuilder {
  readonly #dashboard: Dashboard;
  readonly #templates: DashboardBuilderOptions;
  readonly #group = new DisposableGroup();
  #drawer: Drawer | null = null;
  #controls: Destroyable[] = [];

  constructor(dashboard: Dashboard, options: DashboardBuilderOptions = {}) {
    this.#dashboard = dashboard;
    this.#templates = options;
    dashboard.builderHooks = {
      openBuilder: () => {
        this.openNew();
      },
      openJson: () => {
        this.openJson();
      },
      editWidget: (id: string) => {
        this.openEdit(id);
      },
    };
    dashboard.refreshToolbar();
    dashboard.refreshWidgetActions();
  }

  #msg(key: string, params: Readonly<Record<string, string | number>> = {}): string {
    return getMessage('dashboardBuilder', key, params, this.#dashboard.options.locale ?? getCommonConfig().locale);
  }

  #doc(): Document {
    return this.#dashboard.host.ownerDocument;
  }

  #reset(): void {
    for (const c of this.#controls.splice(0)) c.destroy();
    this.#drawer?.destroy();
    this.#drawer = null;
  }

  #div(className: string, parent?: HTMLElement): HTMLDivElement {
    const el = this.#doc().createElement('div');
    el.className = className;
    parent?.append(el);
    return el;
  }

  #track<T extends Destroyable>(c: T): T {
    this.#controls.push(c);
    return c;
  }

  #on(host: HTMLElement, type: string, handler: (detail: unknown) => void): void {
    host.addEventListener(type, (e) => {
      handler((e as CustomEvent<unknown>).detail);
    });
  }

  /* ---------------------------------------------------------------- widget builder */

  /** Opens the builder for a new widget from a template id (see `widgetTemplates`). */
  openTemplate(templateId: string): void {
    const t = this.#templates.widgetTemplates?.find((x) => x.id === templateId);
    if (!t) return;
    const dash = this.#dashboard;
    const id = dash.uniqueId(t.widget.type.replace(/[^a-z0-9-]/g, '-'));
    const size = t.widget.layout ?? dash.registry.get(t.widget.type)?.defaultSize ?? { w: 3, h: 2 };
    const widget: WidgetDefinition = { ...t.widget, id, layout: { x: 0, y: 0, w: size.w, h: size.h }, ...(t.dataSource ? { source: t.dataSource.id } : {}) };
    this.#openWidget(widget, true, t.dataSource);
  }

  openNew(): void {
    const registry = this.#dashboard.registry;
    const type = registry.names()[0] ?? 'text';
    const id = this.#dashboard.uniqueId(type.replace(/[^a-z0-9-]/g, '-'));
    this.#openWidget({ id, type, title: registry.get(type)?.label ?? 'Widget', layout: { x: 0, y: 0, w: 3, h: 2 } }, true);
  }

  openEdit(widgetId: string): void {
    const widget = this.#dashboard.definition.widgets.find((w) => w.id === widgetId);
    if (widget) this.#openWidget(widget, false);
  }

  #openWidget(initial: WidgetDefinition, isNew: boolean, templateSource?: { readonly id: string; readonly definition: DataSourceDefinition }): void {
    this.#reset();
    const dash = this.#dashboard;
    const doc = this.#doc();
    const draft: Mutable<WidgetDefinition> & { options: Record<string, JsonValue> } = { ...initial, options: { ...(initial.options ?? {}) } };
    const existing = initial.source === undefined ? undefined : dash.definition.dataSources?.[initial.source];
    const source: SourceDraft = {
      mode: initial.source === undefined ? 'none' : 'existing',
      id: initial.source ?? dash.uniqueId('source'),
      url: existing?.kind === 'http' ? existing.url : '',
      method: existing?.kind === 'http' ? (existing.method ?? 'GET') : 'GET',
      params: existing?.kind === 'http' ? formatParams(existing.params) : '',
      credentials: existing?.kind === 'http' ? (existing.credentials ?? 'same-origin') : 'same-origin',
      refresh: existing?.kind === 'http' ? (existing.refresh ?? 0) : 0,
    };
    let sample: unknown = existing?.kind === 'static' || existing?.kind === 'mock' ? existing.data : undefined;
    if (templateSource && !dash.definition.dataSources?.[templateSource.id]) {
      source.mode = 'template';
      source.id = templateSource.id;
      source.templateDef = templateSource.definition;
      const def = templateSource.definition;
      sample = def.kind === 'static' || def.kind === 'mock' ? def.data : undefined;
    }

    const content = this.#div('aui-dashboard-builder');
    const tabsHost = this.#div('aui-dashboard-builder__tabs', content);
    const formPanel = this.#div('aui-dashboard-builder__form');
    const jsonPanel = this.#div('aui-dashboard-builder__json');
    const messageHost = this.#div('aui-dashboard-builder__message', content);
    let message: InlineMessage | null = null;
    const showMessage = (text: string, tone: 'info' | 'success' | 'error'): void => {
      if (message) message.update({ message: text, tone });
      else message = this.#track(InlineMessage.create(messageHost, { message: text, tone, live: 'polite' }));
      messageHost.hidden = false;
    };

    // Rebuilt when the type or the sample changes.
    let typeControls: Destroyable[] = [];
    const typeSection = this.#div('aui-dashboard-builder__type-fields');

    const buildTypeSection = (): void => {
      for (const c of typeControls.splice(0)) c.destroy();
      typeSection.replaceChildren();
      const type = dash.registry.get(draft.type);
      if (!type) return;
      const pointers = sample === undefined ? [] : pointerCandidates(sample);
      const fields = sample === undefined ? [] : fieldCandidates(sample);
      if ((type.inputs ?? []).length > 0 && source.mode !== 'none') {
        const fs = this.#fieldset(typeSection, this.#msg('mapping'));
        for (const input of type.inputs ?? []) {
          const wanted = pointers.filter((p) => (input.kind === 'rows' ? p.kind === 'array' : input.kind === 'numbers' ? p.kind === 'array' : input.kind === 'number' ? p.kind === 'number' || p.kind === 'string' : true));
          const current = draft.map?.[input.name] ?? '';
          const options = [{ value: '', label: this.#msg('default') }, ...wanted.map((p) => ({ value: p.pointer === '' ? '/' : p.pointer, label: p.pointer === '' ? '(root)' : p.pointer }))];
          if (current !== '' && !options.some((o) => o.value === current)) options.push({ value: current, label: current });
          const host = this.#div('aui-dashboard-builder__field', fs);
          typeControls.push(Select.create(host, { label: input.label, options, value: current }));
          this.#on(host, 'aui-change', (d) => {
            const value = (d as { value: string | null }).value ?? '';
            const map: Record<string, string> = Object.fromEntries(Object.entries(draft.map ?? {}).filter(([k]) => k !== input.name));
            if (value !== '') map[input.name] = value === '/' ? '' : value;
            if (Object.keys(map).length > 0) draft.map = map;
            else delete draft.map;
          });
        }
      }
      if ((type.optionFields ?? []).length > 0) {
        const fs = this.#fieldset(typeSection, this.#msg('options'));
        for (const spec of type.optionFields ?? []) typeControls.push(...this.#optionControl(fs, spec, draft.options, fields));
      }
    };

    // Basics.
    const templates = this.#templates.widgetTemplates ?? [];
    if (isNew && templates.length > 0) {
      const tplSet = this.#fieldset(formPanel, this.#msg('template'));
      const tplHost = this.#div('aui-dashboard-builder__field', tplSet);
      this.#track(Select.create(tplHost, { label: this.#msg('template'), options: [{ value: '', label: this.#msg('blank') }, ...templates.map((t) => ({ value: t.id, label: t.label, ...(t.description ? { description: t.description } : {}) }))], value: '' }));
      this.#on(tplHost, 'aui-change', (d) => {
        const value = (d as { value: string | null }).value;
        if (value) queueMicrotask(() => {
          this.openTemplate(value);
        });
      });
    }
    const basics = this.#fieldset(formPanel, this.#msg('type'));
    const typeHost = this.#div('aui-dashboard-builder__field', basics);
    this.#track(Select.create(typeHost, { label: this.#msg('type'), options: dash.registry.names().map((n) => ({ value: n, label: dash.registry.get(n)?.label ?? n, ...(dash.registry.get(n)?.description ? { description: dash.registry.get(n)?.description ?? '' } : {}) })), value: draft.type }));
    this.#on(typeHost, 'aui-change', (d) => {
      const value = (d as { value: string | null }).value;
      if (!value) return;
      draft.type = value;
      draft.options = {};
      delete draft.map;
      const size = dash.registry.get(value)?.defaultSize;
      if (size && isNew) draft.layout = { ...draft.layout, w: size.w, h: size.h };
      buildTypeSection();
    });
    this.#text(basics, this.#msg('title'), draft.title, (v) => {
      draft.title = v;
    });
    this.#text(basics, this.#msg('subtitle'), draft.subtitle ?? '', (v) => {
      if (v === '') delete draft.subtitle;
      else draft.subtitle = v;
    });

    // Data source.
    const srcSet = this.#fieldset(formPanel, this.#msg('source'));
    const sourceIds = Object.keys(dash.definition.dataSources ?? {});
    const srcHost = this.#div('aui-dashboard-builder__field', srcSet);
    const httpFields = this.#div('aui-dashboard-builder__http', srcSet);
    const syncHttp = (): void => {
      httpFields.hidden = source.mode !== 'new';
    };
    const templateOption = source.mode === 'template' ? [{ value: '__template', label: this.#msg('sourceTemplate', { id: source.id }) }] : [];
    this.#track(Select.create(srcHost, { label: this.#msg('source'), options: [{ value: '', label: this.#msg('sourceNone') }, ...templateOption, ...sourceIds.map((s) => ({ value: s, label: s })), { value: '__new', label: this.#msg('sourceNew') }], value: source.mode === 'existing' ? source.id : source.mode === 'template' ? '__template' : '' }));
    this.#on(srcHost, 'aui-change', (d) => {
      const value = (d as { value: string | null }).value ?? '';
      if (value === '') source.mode = 'none';
      else if (value === '__template') source.mode = 'template';
      else if (value === '__new') {
        source.mode = 'new';
        source.id = dash.uniqueId('source');
      } else {
        source.mode = 'existing';
        source.id = value;
        const s = dash.definition.dataSources?.[value];
        sample = s?.kind === 'static' || s?.kind === 'mock' ? s.data : undefined;
      }
      syncHttp();
      buildTypeSection();
    });
    this.#text(httpFields, this.#msg('url'), source.url, (v) => {
      source.url = v;
    });
    this.#select(httpFields, this.#msg('method'), ['GET', 'POST'], source.method, (v) => {
      source.method = v === 'POST' ? 'POST' : 'GET';
    });
    const paramsHost = this.#div('aui-dashboard-builder__field', httpFields);
    this.#track(Textarea.create(paramsHost, { label: this.#msg('params'), value: source.params, rows: 3 }));
    this.#on(paramsHost, 'aui-input', (d) => {
      source.params = (d as { value: string }).value;
    });
    this.#select(httpFields, this.#msg('credentials'), ['same-origin', 'include', 'omit'], source.credentials, (v) => {
      source.credentials = v === 'include' ? 'include' : v === 'omit' ? 'omit' : 'same-origin';
    });
    this.#number(httpFields, this.#msg('refresh'), source.refresh, 0, 86_400, (v) => {
      source.refresh = v ?? 0;
    });
    const test = Button.create({ text: this.#msg('test'), variant: 'secondary', size: 'sm' }, doc);
    this.#track(test);
    srcSet.append(test.element);
    test.element.addEventListener('click', () => {
      const def = this.#sourceDefinition(source);
      if (!def) return;
      test.update({ loading: true });
      dash
        .testSource(def)
        .then((data) => {
          sample = data;
          showMessage(this.#msg('testOk'), 'success');
          buildTypeSection();
        })
        .catch((error: unknown) => {
          showMessage(this.#msg('testFailed', { message: error instanceof Error ? error.message : 'error' }), 'error');
        })
        .finally(() => {
          test.update({ loading: false });
        });
    });
    syncHttp();

    formPanel.append(typeSection);

    // Style and size.
    const styleSet = this.#fieldset(formPanel, this.#msg('style'));
    const style: Record<string, JsonValue> = { ...(draft.style ?? {}) };
    this.#select(styleSet, this.#msg('accent'), ['', ...ACCENTS], typeof style.accent === 'string' ? style.accent : '', (v) => {
      if (v === '') delete style.accent;
      else style.accent = v;
    });
    this.#select(styleSet, this.#msg('surface'), ['', ...SURFACES], typeof style.surface === 'string' ? style.surface : '', (v) => {
      if (v === '') delete style.surface;
      else style.surface = v;
    });
    const columns = dash.definition.grid?.columns ?? 12;
    this.#number(styleSet, this.#msg('width'), draft.layout.w, 1, columns, (v) => {
      if (v !== null) draft.layout = { ...draft.layout, w: v, x: Math.min(draft.layout.x, columns - v) };
    });
    this.#number(styleSet, this.#msg('height'), draft.layout.h, 1, 100, (v) => {
      if (v !== null) draft.layout = { ...draft.layout, h: v };
    });

    buildTypeSection();

    // JSON tab: { widget, dataSource? }.
    const jsonHost = this.#div('aui-dashboard-builder__field', jsonPanel);
    const jsonArea = this.#track(Textarea.create(jsonHost, { label: this.#msg('json'), value: '', rows: 18, resize: 'vertical' }));
    let jsonDirty = false;
    this.#on(jsonHost, 'aui-input', () => {
      jsonDirty = true;
    });
    const currentDoc = (): { widget: WidgetDefinition; dataSource?: DataSourceDefinition } => {
      const w = this.#widgetFrom(draft, style, source);
      const s = source.mode === 'new' || source.mode === 'template' ? this.#sourceDefinition(source) : undefined;
      return s ? { widget: w, dataSource: s } : { widget: w };
    };
    const tabs = this.#track(
      Tabs.create(tabsHost, {
        label: this.#msg('form'),
        tabs: [
          { id: 'form', label: this.#msg('form'), content: formPanel },
          { id: 'json', label: this.#msg('json'), content: jsonPanel },
        ],
        value: 'form',
      }),
    );
    this.#on(tabsHost, 'aui-change', (d) => {
      const value = (d as { value: string }).value;
      if (value === 'json') {
        jsonArea.update({ value: JSON.stringify(currentDoc(), null, 2) });
        jsonDirty = false;
      } else if (jsonDirty) {
        // Back to the form: take the JSON if it parses (form fields are rebuilt from it).
        const parsed = safeJsonParse(jsonArea.value, { unsafeKeys: 'error' });
        if (parsed.ok && parsed.value !== null && typeof parsed.value === 'object') {
          const w = (parsed.value as { widget?: unknown }).widget;
          if (w !== null && typeof w === 'object') {
            this.#reset();
            this.#openWidget(w as WidgetDefinition, isNew);
          }
        }
      }
    });

    const drawer = Drawer.create(
      {
        title: isNew ? this.#msg('addTitle') : this.#msg('editTitle', { title: initial.title }),
        content,
        size: 'lg',
        actions: [
          { label: this.#msg('cancel'), value: 'cancel' },
          { label: this.#msg('save'), value: 'save', variant: 'primary' },
        ],
        ...(dash.options.direction === undefined ? {} : { direction: dash.options.direction }),
      },
      doc,
    );
    this.#drawer = drawer;
    drawer.element.addEventListener('aui-cancel', (e) => {
      const detail = (e as CustomEvent<{ returnValue: string }>).detail;
      if (detail.returnValue !== 'save') return;
      let docValue: { widget: unknown; dataSource?: unknown };
      if (tabs.value === 'json') {
        const parsed = safeJsonParse(jsonArea.value, { unsafeKeys: 'error' });
        if (!parsed.ok || parsed.value === null || typeof parsed.value !== 'object') {
          e.preventDefault();
          showMessage(this.#msg('invalidJson'), 'error');
          return;
        }
        docValue = parsed.value as { widget: unknown; dataSource?: unknown };
      } else docValue = currentDoc();
      const issues = this.#save(docValue, initial.id, isNew);
      if (issues.length > 0) {
        e.preventDefault();
        const first = issues[0];
        showMessage(this.#msg('issues', { count: issues.length, path: first?.path ?? '', expected: first?.expected ?? '' }), 'error');
      }
    });
    drawer.element.addEventListener('aui-close', () => {
      queueMicrotask(() => {
        if (this.#drawer === drawer) this.#reset();
      });
    });
    messageHost.hidden = true;
    drawer.open();
    // Keep the type controls owned by the drawer lifetime.
    this.#controls.push({
      destroy: () => {
        for (const c of typeControls.splice(0)) c.destroy();
        typeControls = [];
      },
    });
  }

  #fieldset(parent: HTMLElement, legend: string): HTMLFieldSetElement {
    const doc = this.#doc();
    const fs = doc.createElement('fieldset');
    fs.className = 'aui-dashboard-builder__group';
    const lg = doc.createElement('legend');
    lg.textContent = legend;
    fs.append(lg);
    parent.append(fs);
    return fs;
  }

  #text(parent: HTMLElement, label: string, value: string, onChange: (v: string) => void): void {
    const host = this.#div('aui-dashboard-builder__field', parent);
    this.#track(TextInput.create(host, { label, value }));
    this.#on(host, 'aui-input', (d) => {
      onChange((d as { value: string }).value);
    });
  }

  #select(parent: HTMLElement, label: string, values: readonly string[], value: string, onChange: (v: string) => void): void {
    const host = this.#div('aui-dashboard-builder__field', parent);
    this.#track(Select.create(host, { label, options: values.map((v) => ({ value: v, label: v === '' ? this.#msg('default') : v })), value }));
    this.#on(host, 'aui-change', (d) => {
      onChange((d as { value: string | null }).value ?? '');
    });
  }

  #number(parent: HTMLElement, label: string, value: number, min: number, max: number, onChange: (v: number | null) => void): void {
    const host = this.#div('aui-dashboard-builder__field', parent);
    this.#track(NumberInput.create(host, { label, value, min, max }));
    this.#on(host, 'aui-change', (d) => {
      onChange((d as { value: number | null }).value);
    });
  }

  /** One control per option field; writes plain JSON into `options`. */
  #optionControl(parent: HTMLElement, spec: WidgetOptionSpec, options: Record<string, JsonValue>, fields: readonly string[]): Destroyable[] {
    const host = this.#div('aui-dashboard-builder__field', parent);
    const current = options[spec.name];
    const set = (v: JsonValue | undefined): void => {
      if (v === undefined || v === '') Reflect.deleteProperty(options, spec.name);
      else options[spec.name] = v;
    };
    switch (spec.kind) {
      case 'text': {
        const c = TextInput.create(host, { label: spec.label, value: typeof current === 'string' ? current : '' });
        this.#on(host, 'aui-input', (d) => {
          set((d as { value: string }).value);
        });
        return [c];
      }
      case 'number': {
        const c = NumberInput.create(host, { label: spec.label, value: typeof current === 'number' ? current : null });
        this.#on(host, 'aui-change', (d) => {
          set((d as { value: number | null }).value ?? undefined);
        });
        return [c];
      }
      case 'boolean': {
        const c = Switch.create(host, { label: spec.label, checked: current === true });
        this.#on(host, 'aui-change', (d) => {
          set((d as { checked: boolean }).checked);
        });
        return [c];
      }
      case 'enum': {
        const values = spec.values ?? [];
        const c = Select.create(host, { label: spec.label, options: [{ value: '', label: this.#msg('default') }, ...values.map((v) => ({ value: v, label: v }))], value: typeof current === 'string' ? current : '' });
        this.#on(host, 'aui-change', (d) => {
          set((d as { value: string | null }).value ?? undefined);
        });
        return [c];
      }
      case 'field': {
        const value = typeof current === 'string' ? current : '';
        const list = value !== '' && !fields.includes(value) ? [value, ...fields] : fields;
        if (list.length === 0) {
          const c = TextInput.create(host, { label: spec.label, value });
          this.#on(host, 'aui-input', (d) => {
            set((d as { value: string }).value);
          });
          return [c];
        }
        const c = Select.create(host, { label: spec.label, options: [{ value: '', label: this.#msg('default') }, ...list.map((f) => ({ value: f, label: f }))], value });
        this.#on(host, 'aui-change', (d) => {
          set((d as { value: string | null }).value ?? undefined);
        });
        return [c];
      }
      case 'fields': {
        // Stored as [{ field, label }] for series and columns.
        const fieldOf = (s: JsonValue): string | null => {
          if (s === null || typeof s !== 'object' || Array.isArray(s)) return null;
          const f = (s as JsonObject).field;
          return typeof f === 'string' ? f : null;
        };
        const chosen = Array.isArray(current) ? (current as readonly JsonValue[]).map(fieldOf).filter((f): f is string => f !== null) : [];
        const list = [...new Set([...chosen, ...fields])];
        const c = MultiSelect.create(host, { label: spec.label, options: list.map((f) => ({ value: f, label: f })), value: chosen });
        this.#on(host, 'aui-change', (d) => {
          const value = (d as { value: readonly string[] }).value;
          const key = spec.name === 'columns' ? 'header' : 'label';
          set(value.length === 0 ? undefined : value.map((f) => ({ field: f, [key]: f })));
        });
        return [c];
      }
    }
  }

  #sourceDefinition(source: SourceDraft): DataSourceDefinition | undefined {
    if (source.mode === 'template') return source.templateDef;
    if (source.mode !== 'new') return source.mode === 'existing' ? this.#dashboard.definition.dataSources?.[source.id] : undefined;
    const params = parseParams(source.params);
    const def: Mutable<Extract<DataSourceDefinition, { kind: 'http' }>> = { kind: 'http', url: source.url.trim() };
    if (source.method !== 'GET') def.method = source.method;
    if (Object.keys(params).length > 0) def.params = params;
    if (source.credentials !== 'same-origin') def.credentials = source.credentials;
    if (source.refresh > 0) def.refresh = source.refresh;
    return def;
  }

  #widgetFrom(draft: WidgetDefinition & { options: Record<string, JsonValue> }, style: Record<string, JsonValue>, source: SourceDraft): WidgetDefinition {
    const w: Mutable<WidgetDefinition> = { id: draft.id, type: draft.type, title: draft.title, layout: draft.layout };
    if (draft.subtitle !== undefined) w.subtitle = draft.subtitle;
    if (draft.page !== undefined) w.page = draft.page;
    if (source.mode !== 'none') w.source = source.id;
    if (draft.map !== undefined && source.mode !== 'none') w.map = draft.map;
    if (draft.transforms !== undefined && source.mode !== 'none') w.transforms = draft.transforms;
    if (Object.keys(draft.options).length > 0) w.options = draft.options;
    if (Object.keys(style).length > 0) w.style = style;
    if (draft.actions !== undefined) w.actions = draft.actions;
    if (draft.interactions !== undefined) w.interactions = draft.interactions;
    return w;
  }

  /** Validates and applies `{ widget, dataSource? }`; returns issues (empty when saved). */
  #save(value: { widget: unknown; dataSource?: unknown }, originalId: string, isNew: boolean): readonly DefinitionIssue[] {
    const dash = this.#dashboard;
    const current = dash.definition;
    const raw: unknown = value.widget;
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return [{ path: '/widget', code: 'required', expected: 'a widget object' }];
    const widget = raw as WidgetDefinition;
    const sources: Record<string, unknown> = { ...(current.dataSources ?? {}) };
    if (value.dataSource !== undefined && typeof widget.source === 'string') sources[widget.source] = value.dataSource;
    let widgets: unknown[];
    if (isNew) {
      const { layout, ...rest } = widget;
      const placed = { ...rest, layout: dash.placeFor(widget.type, layout), ...(widget.page === undefined && dash.page !== null ? { page: dash.page } : {}) };
      widgets = [...current.widgets, placed];
    } else widgets = current.widgets.map((w) => (w.id === originalId ? widget : w));
    const next: Record<string, unknown> = { ...current, widgets };
    if (Object.keys(sources).length > 0) next.dataSources = sources;
    const r = checkDefinition(next);
    if (!r.ok) return r.issues;
    return dash.apply(r.definition, isNew ? 'add' : 'widget');
  }

  /* ---------------------------------------------------------------- dashboard JSON (R18-16) */

  openJson(): void {
    this.#reset();
    const dash = this.#dashboard;
    const doc = this.#doc();
    const content = this.#div('aui-dashboard-builder');
    const dashTemplates = this.#templates.dashboardTemplates ?? [];
    let applyTemplate: ((value: string) => void) | null = null;
    if (dashTemplates.length > 0) {
      const tplHost = this.#div('aui-dashboard-builder__field', content);
      this.#track(Select.create(tplHost, { label: this.#msg('startFrom'), options: [{ value: '', label: this.#msg('current') }, ...dashTemplates.map((t) => ({ value: t.id, label: t.label, ...(t.description ? { description: t.description } : {}) }))], value: '' }));
      this.#on(tplHost, 'aui-change', (d) => {
        applyTemplate?.((d as { value: string | null }).value ?? '');
      });
    }
    const areaHost = this.#div('aui-dashboard-builder__field', content);
    const area = this.#track(Textarea.create(areaHost, { label: this.#msg('definition'), value: JSON.stringify(dash.definition, null, 2), rows: 22, resize: 'vertical' }));
    const statusHost = this.#div('aui-dashboard-builder__message', content);
    const status = this.#track(InlineMessage.create(statusHost, { message: this.#msg('valid'), tone: 'success', live: 'polite' }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const validate = (): unknown => {
      const parsed = safeJsonParse(area.value, { unsafeKeys: 'error', maxLength: MAX_IMPORT_BYTES });
      if (!parsed.ok) {
        status.update({ message: this.#msg('invalidJson'), tone: 'error' });
        return undefined;
      }
      const issues = dash.check(parsed.value);
      const first = issues[0];
      if (first) status.update({ message: this.#msg('issues', { count: issues.length, path: first.path, expected: first.expected }), tone: 'error' });
      else status.update({ message: this.#msg('valid'), tone: 'success' });
      return issues.length === 0 ? parsed.value : undefined;
    };
    this.#on(areaHost, 'aui-input', () => {
      clearTimeout(timer);
      timer = setTimeout(validate, 300);
    });
    applyTemplate = (value) => {
      const t = dashTemplates.find((x) => x.id === value);
      area.update({ value: JSON.stringify(t ? t.definition : dash.definition, null, 2) });
      validate();
    };
    const fileHost = this.#div('aui-dashboard-builder__field', content);
    this.#track(FileUpload.create(fileHost, { label: this.#msg('importFile'), acceptExtensions: ['.json'], acceptTypes: ['application/json'], maxFileSize: MAX_IMPORT_BYTES }));
    this.#on(fileHost, 'aui-change', (d) => {
      const file = (d as { files: readonly File[] }).files[0];
      if (!file || file.size > MAX_IMPORT_BYTES) return;
      void file.text().then((text) => {
        area.update({ value: text });
        validate();
      });
    });
    const download = Button.create({ text: this.#msg('download'), icon: 'download', variant: 'secondary', size: 'sm' }, doc);
    this.#track(download);
    content.append(download.element);
    download.element.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(dash.definition, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = doc.createElement('a');
      a.href = url;
      a.download = `${dash.definition.id}.dashboard.json`;
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 0);
    });
    const drawer = Drawer.create(
      {
        title: this.#msg('jsonTitle'),
        content,
        size: 'lg',
        actions: [
          { label: this.#msg('cancel'), value: 'cancel' },
          { label: this.#msg('apply'), value: 'apply', variant: 'primary' },
        ],
        ...(dash.options.direction === undefined ? {} : { direction: dash.options.direction }),
      },
      doc,
    );
    this.#drawer = drawer;
    drawer.element.addEventListener('aui-cancel', (e) => {
      if ((e as CustomEvent<{ returnValue: string }>).detail.returnValue !== 'apply') return;
      const value = validate();
      if (value === undefined) {
        e.preventDefault();
        return;
      }
      dash.setDefinition(value, 'import');
    });
    drawer.element.addEventListener('aui-close', () => {
      clearTimeout(timer);
      queueMicrotask(() => {
        if (this.#drawer === drawer) this.#reset();
      });
    });
    drawer.open();
  }

  destroy(): void {
    this.#reset();
    this.#group.dispose();
    this.#dashboard.builderHooks = {};
    this.#dashboard.refreshToolbar();
    this.#dashboard.refreshWidgetActions();
  }
}

/** Installs the widget builder and JSON editor on a dashboard (toolbar items, widget edit actions). */
export function enableDashboardBuilder(dashboard: Dashboard, options: DashboardBuilderOptions = {}): DashboardBuilder {
  return new DashboardBuilder(dashboard, options);
}

export type { WidgetType };
