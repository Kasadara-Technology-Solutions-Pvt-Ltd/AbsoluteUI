/**
 * Form Builder (R20 P7). A form designer that produces the `{ schema, uiSchema }` Schema Form renders:
 * a palette of field types (click, Enter, or drag onto the canvas), a canvas whose fields reorder by
 * pointer drag or keyboard (Sortable List, the same pattern as the dashboard builder's grid), a
 * properties panel (label, name, required, validation, options, help text, visibility), a live
 * preview with Schema Form, a JSON view with validated import, and undo/redo. Every control is an
 * AbsoluteUI component.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, validators } from '@absoluteui/core';
import { safeJsonParse } from '@absoluteui/helpers/json';
import type { IconRef } from '@absoluteui/icons';
import { announce, trackPointerDrag, type PointerDrag } from '@absoluteui/utilities';
import { Button } from '../button/button.js';
import { DefinitionHistory } from '../dashboard/history.js';
import { InlineMessage } from '../inline-message/inline-message.js';
import { NumberInput } from '../number-input/number-input.js';
import { SchemaForm } from '../schema-form/schema-form.js';
import { checkFormSchema, checkUiSchema, choicesOf, describeIssues, isFormSchema, isObject, isUiSchema, type FormCondition, type FormSchema, type JsonValue, type SchemaIssue, type UiField } from '../schema-form/schema.js';
import { Select } from '../select/select.js';
import { SortableList, type SortableListChangeDetail } from '../sortable-list/sortable-list.js';
import { Switch } from '../switch/switch.js';
import { Tabs, type TabsChangeDetail } from '../tabs/tabs.js';
import { Textarea } from '../textarea/textarea.js';
import { TextInput } from '../text-input/text-input.js';
import {
  FIELD_TYPES,
  fieldOrder,
  formatChoices,
  insertField,
  kindOf,
  parseChoices,
  patchField,
  patchForm,
  removeField,
  renameField,
  reorderFields,
  setRequired,
  TEMPLATES,
  uniqueName,
  type FormBuilderFieldType,
  type FormBuilderValue,
  type Patch,
} from './fields.js';

export interface FormBuilderConfig {
  /** Undo steps kept (1 to 1000). */
  historyLimit: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    formBuilder: FormBuilderConfig & { locale: string };
  }
}

export const formBuilderConfig = defineComponentConfig<FormBuilderConfig, 'locale'>(
  'formBuilder',
  { historyLimit: { default: 100, expected: 'integer 1..1000', validate: validators.integerInRange(1, 1000) } },
  ['locale'],
);

registerMessages('formBuilder', 'en', {
  design: 'Design',
  preview: 'Preview',
  json: 'JSON',
  views: 'Form builder views',
  palette: 'Add a field',
  paletteHint: 'Press a field type to add it after the selected field, or drag it onto the canvas.',
  canvas: 'Form fields',
  canvasEmpty: 'No fields yet. Add one from the list of field types.',
  properties: 'Properties',
  formSettings: 'Form settings',
  undo: 'Undo',
  redo: 'Redo',
  select: '{label}, {type}{required}',
  requiredSuffix: ', required',
  removeField: 'Remove {label}',
  added: '{label} added at position {position} of {count}.',
  removed: '{label} removed.',
  undone: 'Undone.',
  redone: 'Redone.',
  invalid: 'This change was not applied: {issues}',
  label: 'Label',
  name: 'Name',
  nameHelp: 'Key in the submitted JSON: a letter, then letters, digits, or underscores.',
  nameInvalid: 'Use a letter, then letters, digits, or underscores (at most 64).',
  nameTaken: 'Another field already uses this name.',
  help: 'Help text',
  placeholder: 'Placeholder',
  required: 'Required',
  width: 'Width (columns)',
  validation: 'Validation',
  minLength: 'Minimum length',
  maxLength: 'Maximum length',
  pattern: 'Pattern (regular expression)',
  patternMessage: 'Message when the pattern does not match',
  minimum: 'Minimum',
  maximum: 'Maximum',
  minItems: 'Minimum selections',
  maxItems: 'Maximum selections',
  options: 'Options (one per line: value = Label)',
  optionsInvalid: 'Check this line: {line}',
  rows: 'Rows',
  workingDays: 'Only working days',
  visibility: 'Visibility',
  dependsOn: 'Show this field',
  always: 'Always',
  when: 'When {label}',
  operator: 'Condition',
  equals: 'equals',
  notEquals: 'does not equal',
  filled: 'is filled in',
  empty: 'is empty',
  value: 'Value',
  yes: 'Yes',
  no: 'No',
  title: 'Form title',
  description: 'Description',
  columns: 'Columns',
  nested: 'This field holds nested fields; edit it in the JSON view.',
  jsonLabel: 'Schema and UI schema (JSON)',
  apply: 'Apply JSON',
  revert: 'Revert',
  applied: 'The JSON was applied.',
  jsonInvalid: 'This is not valid JSON.',
  jsonShape: 'Expected an object with "schema" and optional "uiSchema".',
  previewValue: 'Submitted value',
  previewNone: 'Submit the preview form to see its value.',
  'type.text': 'Text',
  'type.textarea': 'Long text',
  'type.richtext': 'Rich text',
  'type.email': 'Email',
  'type.url': 'URL',
  'type.number': 'Number',
  'type.integer': 'Whole number',
  'type.slider': 'Slider',
  'type.select': 'Dropdown',
  'type.radio': 'Radio buttons',
  'type.combobox': 'Searchable list',
  'type.multiselect': 'Multi select',
  'type.checkboxes': 'Checkboxes',
  'type.checkbox': 'Checkbox',
  'type.switch': 'Switch',
  'type.date': 'Date',
  'type.datetime': 'Date and time',
  'type.time': 'Time',
  'type.group': 'Group',
  'type.list': 'List',
});

export interface FormBuilderIcons {
  undo: IconRef;
  redo: IconRef;
  remove: IconRef;
  handle: IconRef;
}

export interface FormBuilderOptions extends Partial<FormBuilderConfig> {
  /** Accessible name of the builder, such as "Leave request form". */
  label: string;
  /** Initial schema (root type "object"). Default: an empty form. */
  schema?: FormSchema;
  /** Initial UI schema. */
  uiSchema?: UiField;
  /** Field types offered in the palette, in order. Default: all. */
  fieldTypes?: readonly FormBuilderFieldType[];
  locale?: string;
  icons?: Partial<FormBuilderIcons>;
}

/** `aui-change` detail: the document after the edit (valid for Schema Form). */
export interface FormBuilderChangeDetail {
  schema: FormSchema;
  uiSchema: UiField;
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_JSON = 1024 * 1024;

interface Destroyable {
  destroy(): void;
}

interface CanvasRow {
  readonly content: HTMLDivElement;
  readonly select: HTMLButtonElement;
  readonly text: HTMLSpanElement;
  readonly meta: HTMLSpanElement;
  readonly remove: Button;
}

function isFieldType(v: unknown): v is FormBuilderFieldType {
  return typeof v === 'string' && (FIELD_TYPES as readonly string[]).includes(v);
}


/** Listen for an AbsoluteUI custom event (not in HTMLElementEventMap) and remove the listener with `group`. */
function on(group: DisposableGroup, target: EventTarget, type: string, handler: (event: Event) => void): void {
  target.addEventListener(type, handler);
  group.add(() => {
    target.removeEventListener(type, handler);
  });
}
export class FormBuilder {
  readonly host: HTMLElement;
  #options: FormBuilderOptions;
  readonly #doc: Document;
  #value: FormBuilderValue;
  #selected: string | null = null;
  #history: DefinitionHistory;
  readonly #root: HTMLDivElement;
  readonly #toolbar: HTMLDivElement;
  readonly #undo: Button;
  readonly #redo: Button;
  readonly #tabs: Tabs;
  readonly #palette: HTMLUListElement;
  readonly #paletteButtons: { type: FormBuilderFieldType; button: Button; drag: PointerDrag }[] = [];
  readonly #canvasHost: HTMLDivElement;
  readonly #canvasEmpty: HTMLParagraphElement;
  readonly #dropMarker: HTMLDivElement;
  readonly #canvas: SortableList;
  readonly #rows = new Map<string, CanvasRow>();
  readonly #panel: HTMLElement;
  readonly #panelTitle: HTMLHeadingElement;
  readonly #panelBody: HTMLDivElement;
  readonly #panelStatusHost: HTMLDivElement;
  #panelStatus: InlineMessage | null = null;
  #panelControls: Destroyable[] = [];
  #panelGroup = new DisposableGroup();
  readonly #previewHost: HTMLDivElement;
  readonly #previewOutput: HTMLPreElement;
  #preview: SchemaForm | null = null;
  readonly #jsonHost: HTMLDivElement;
  readonly #json: Textarea;
  readonly #jsonApply: Button;
  readonly #jsonRevert: Button;
  readonly #jsonStatusHost: HTMLDivElement;
  #jsonStatus: InlineMessage | null = null;
  #view = 'design';
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: FormBuilderOptions): FormBuilder {
    return new FormBuilder(host, options);
  }

  private constructor(host: HTMLElement, options: FormBuilderOptions) {
    FormBuilder.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const config = this.#config();
    this.#history = new DefinitionHistory(config.historyLimit);
    this.#value = FormBuilder.#initial(options);
    const doc = this.#doc;
    const m = (key: string, values: Record<string, string | number> = {}): string => getMessage('formBuilder', key, values, config.locale);

    this.#root = doc.createElement('div');
    this.#root.className = 'aui-form-builder__root';
    this.#toolbar = doc.createElement('div');
    this.#toolbar.className = 'aui-form-builder__toolbar';
    this.#toolbar.setAttribute('role', 'toolbar');
    const undoEl = doc.createElement('button');
    undoEl.type = 'button';
    undoEl.textContent = m('undo');
    const redoEl = doc.createElement('button');
    redoEl.type = 'button';
    redoEl.textContent = m('redo');
    this.#toolbar.append(undoEl, redoEl);
    this.#undo = Button.enhance(undoEl, { icon: options.icons?.undo ?? 'undo', variant: 'ghost', size: 'sm' });
    this.#redo = Button.enhance(redoEl, { icon: options.icons?.redo ?? 'redo', variant: 'ghost', size: 'sm' });

    // Design view: palette | canvas | properties.
    const design = doc.createElement('div');
    design.className = 'aui-form-builder__design';
    const paletteSection = doc.createElement('section');
    paletteSection.className = 'aui-form-builder__palette';
    const paletteTitle = doc.createElement('h3');
    paletteTitle.className = 'aui-form-builder__heading';
    paletteTitle.id = `${this.#uid()}-palette`;
    paletteTitle.textContent = m('palette');
    paletteSection.setAttribute('aria-labelledby', paletteTitle.id);
    const paletteHint = doc.createElement('p');
    paletteHint.className = 'aui-form-builder__hint';
    paletteHint.textContent = m('paletteHint');
    this.#palette = doc.createElement('ul');
    this.#palette.className = 'aui-form-builder__types';
    paletteSection.append(paletteTitle, paletteHint, this.#palette);

    const canvasSection = doc.createElement('section');
    canvasSection.className = 'aui-form-builder__canvas';
    const canvasTitle = doc.createElement('h3');
    canvasTitle.className = 'aui-form-builder__heading';
    canvasTitle.id = `${this.#uid()}-canvas`;
    canvasTitle.textContent = m('canvas');
    canvasSection.setAttribute('aria-labelledby', canvasTitle.id);
    this.#canvasHost = doc.createElement('div');
    this.#canvasEmpty = doc.createElement('p');
    this.#canvasEmpty.className = 'aui-form-builder__empty';
    this.#canvasEmpty.textContent = m('canvasEmpty');
    this.#dropMarker = doc.createElement('div');
    this.#dropMarker.className = 'aui-form-builder__drop';
    this.#dropMarker.hidden = true;
    canvasSection.append(canvasTitle, this.#canvasHost, this.#canvasEmpty, this.#dropMarker);
    this.#canvas = SortableList.create(this.#canvasHost, prune({ label: m('canvas'), items: [], icons: options.icons?.handle === undefined ? undefined : { handle: options.icons.handle } }));

    this.#panel = doc.createElement('section');
    this.#panel.className = 'aui-form-builder__panel';
    this.#panelTitle = doc.createElement('h3');
    this.#panelTitle.className = 'aui-form-builder__heading';
    this.#panelTitle.id = `${this.#uid()}-panel`;
    this.#panel.setAttribute('aria-labelledby', this.#panelTitle.id);
    this.#panelStatusHost = doc.createElement('div');
    this.#panelStatusHost.hidden = true;
    this.#panelBody = doc.createElement('div');
    this.#panelBody.className = 'aui-form-builder__fields';
    this.#panel.append(this.#panelTitle, this.#panelStatusHost, this.#panelBody);
    design.append(paletteSection, canvasSection, this.#panel);

    // Preview view.
    const preview = doc.createElement('div');
    preview.className = 'aui-form-builder__preview';
    this.#previewHost = doc.createElement('div');
    const outputTitle = doc.createElement('h3');
    outputTitle.className = 'aui-form-builder__heading';
    outputTitle.textContent = m('previewValue');
    this.#previewOutput = doc.createElement('pre');
    this.#previewOutput.className = 'aui-form-builder__output';
    this.#previewOutput.setAttribute('role', 'status');
    this.#previewOutput.tabIndex = 0;
    this.#previewOutput.textContent = m('previewNone');
    preview.append(this.#previewHost, outputTitle, this.#previewOutput);

    // JSON view.
    const jsonView = doc.createElement('div');
    jsonView.className = 'aui-form-builder__json';
    this.#jsonStatusHost = doc.createElement('div');
    this.#jsonStatusHost.hidden = true;
    this.#jsonHost = doc.createElement('div');
    const jsonActions = doc.createElement('div');
    jsonActions.className = 'aui-form-builder__actions';
    const applyEl = doc.createElement('button');
    applyEl.type = 'button';
    applyEl.textContent = m('apply');
    const revertEl = doc.createElement('button');
    revertEl.type = 'button';
    revertEl.textContent = m('revert');
    jsonActions.append(applyEl, revertEl);
    jsonView.append(this.#jsonStatusHost, this.#jsonHost, jsonActions);
    this.#json = Textarea.create(this.#jsonHost, { label: m('jsonLabel'), rows: 18, maxRows: 40, resize: 'auto', spellcheck: false, value: '', ...(options.locale === undefined ? {} : { locale: options.locale }) });
    this.#jsonApply = Button.enhance(applyEl, { variant: 'primary', size: 'sm' });
    this.#jsonRevert = Button.enhance(revertEl, { variant: 'ghost', size: 'sm' });

    const tabsHost = doc.createElement('div');
    this.#root.append(this.#toolbar, tabsHost);
    this.#tabs = Tabs.create(tabsHost, {
      label: m('views'),
      value: 'design',
      tabs: [
        { id: 'design', label: m('design'), content: design },
        { id: 'preview', label: m('preview'), icon: 'eye', content: preview },
        { id: 'json', label: m('json'), icon: 'code', content: jsonView },
      ],
    });

    this.#buildPalette();
    this.#render();
    host.classList.add('aui-form-builder');
    host.replaceChildren(this.#root);
    this.#listen();
  }

  get options(): Readonly<FormBuilderOptions> {
    return this.#options;
  }

  /** The current document: a schema and UI schema Schema Form renders. */
  getValue(): FormBuilderChangeDetail {
    return structuredClone<FormBuilderChangeDetail>({ schema: this.#value.schema, uiSchema: this.#value.uiSchema });
  }

  /** Replace the document (validated; recorded for undo; no event). Throws a configuration error with the issues. */
  setValue(schema: FormSchema, uiSchema: UiField = {}): void {
    const issues = FormBuilder.#issues({ schema, uiSchema });
    if (issues.length > 0) throw configurationError('FORM_BUILDER_VALUE', `Invalid form document. ${describeIssues(issues)}`, { component: 'form-builder', property: `schema${issues[0]?.pointer ?? ''}`, expected: 'a schema and UI schema Schema Form supports' });
    this.#history.record(this.#value, { schema, uiSchema });
    this.#value = { schema, uiSchema };
    this.#selected = null;
    this.#render();
  }

  get canUndo(): boolean {
    return this.#history.canUndo;
  }

  get canRedo(): boolean {
    return this.#history.canRedo;
  }

  /** The selected field's name, or null when the form settings are shown. */
  get selected(): string | null {
    return this.#selected;
  }

  undo(): void {
    const prev = this.#history.undo(this.#value);
    if (prev === undefined || !FormBuilder.#isValue(prev)) return;
    this.#value = prev;
    this.#afterHistory('undone');
  }

  redo(): void {
    const next = this.#history.redo(this.#value);
    if (next === undefined || !FormBuilder.#isValue(next)) return;
    this.#value = next;
    this.#afterHistory('redone');
  }

  /** Add a field of a palette type after the selected field (or at `index`). Returns its name. */
  addField(type: FormBuilderFieldType, index?: number): string {
    if (!isFieldType(type)) throw configurationError('FORM_BUILDER_TYPE', 'Unknown field type.', { component: 'form-builder', property: 'type', expected: FIELD_TYPES.join(' | ') });
    const order = fieldOrder(this.#value);
    const at = index ?? (this.#selected !== null && order.includes(this.#selected) ? order.indexOf(this.#selected) + 1 : order.length);
    const name = uniqueName(this.#value, type);
    const t = TEMPLATES[type];
    const label = this.#typeLabel(type);
    this.#commit(insertField(this.#value, name, { ...t.schema, title: label }, t.ui ?? {}, at), { select: name });
    const count = fieldOrder(this.#value).length;
    announce(this.#m('added', { label, position: Math.min(at, count - 1) + 1, count }), 'polite', this.#doc);
    return name;
  }

  /** Remove a field by name. */
  removeField(name: string): void {
    const label = this.#value.schema.properties?.[name]?.title ?? name;
    if (!this.#value.schema.properties?.[name]) return;
    const order = fieldOrder(this.#value);
    const index = order.indexOf(name);
    this.#commit(removeField(this.#value, name), { select: null });
    announce(this.#m('removed', { label }), 'polite', this.#doc);
    const next = fieldOrder(this.#value)[Math.min(index, order.length - 2)];
    if (next !== undefined) this.#rows.get(next)?.select.focus();
    else this.#palette.querySelector('button')?.focus();
  }

  /** Select a field (shows its properties), or null for the form settings. */
  selectField(name: string | null): void {
    this.#selected = name !== null && this.#value.schema.properties?.[name] ? name : null;
    this.#renderCanvas();
    this.#renderPanel();
  }

  update(options: Partial<FormBuilderOptions>): void {
    const next = { ...this.#options, ...options };
    FormBuilder.#assert(next);
    this.#options = next;
    if (options.historyLimit !== undefined) this.#history = new DefinitionHistory(this.#config().historyLimit);
    if (options.schema !== undefined || options.uiSchema !== undefined) {
      this.#value = FormBuilder.#initial(next);
      this.#history.clear();
      this.#selected = null;
    }
    this.#buildPalette();
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.#panelGroup.dispose();
    for (const c of this.#panelControls) c.destroy();
    this.#panelControls = [];
    this.#panelStatus?.destroy();
    this.#jsonStatus?.destroy();
    for (const p of this.#paletteButtons) {
      p.drag.dispose();
      p.button.destroy();
    }
    for (const row of this.#rows.values()) row.remove.destroy();
    this.#preview?.destroy();
    this.#canvas.destroy();
    this.#json.destroy();
    this.#jsonApply.destroy();
    this.#jsonRevert.destroy();
    this.#undo.destroy();
    this.#redo.destroy();
    this.#tabs.destroy();
    this.host.classList.remove('aui-form-builder');
    this.host.replaceChildren();
  }

  // ---------------------------------------------------------------- internals

  static #assert(options: FormBuilderOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('FORM_BUILDER_OPTIONS', 'Invalid form builder options.', { component: 'form-builder', property, expected });
    };
    if (!isObject(options)) fail('options', 'object');
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (options.fieldTypes !== undefined && (!Array.isArray(options.fieldTypes) || options.fieldTypes.length === 0 || options.fieldTypes.some((t) => !isFieldType(t)))) fail('fieldTypes', `non-empty array of ${FIELD_TYPES.join(' | ')}`);
    if (options.schema !== undefined || options.uiSchema !== undefined) {
      const issues = FormBuilder.#issues({ schema: options.schema ?? { type: 'object' }, uiSchema: options.uiSchema ?? {} });
      if (issues.length > 0) fail(`schema${issues[0]?.pointer ?? ''}`, `a schema and UI schema Schema Form supports (${describeIssues(issues)})`);
    }
  }

  static #issues(value: FormBuilderValue): SchemaIssue[] {
    const issues = checkFormSchema(value.schema);
    return issues.length > 0 ? issues : checkUiSchema(value.schema, value.uiSchema);
  }

  static #isValue(v: unknown): v is FormBuilderValue {
    return isObject(v) && isObject(v.schema) && isObject(v.uiSchema);
  }

  static #initial(options: FormBuilderOptions): FormBuilderValue {
    return { schema: options.schema ?? { type: 'object', properties: {} }, uiSchema: options.uiSchema ?? {} };
  }

  #config(): Readonly<FormBuilderConfig & { locale: string }> {
    const o = this.#options;
    return formBuilderConfig.resolve(prune({ historyLimit: o.historyLimit, locale: o.locale }));
  }

  #m(key: string, values: Record<string, string | number> = {}): string {
    return getMessage('formBuilder', key, values, this.#config().locale);
  }

  #uidValue = '';
  #uid(): string {
    if (this.#uidValue === '') this.#uidValue = createId('aui-form-builder');
    return this.#uidValue;
  }

  #typeLabel(kind: FormBuilderFieldType | 'group' | 'list'): string {
    return this.#m(`type.${kind}`);
  }

  #locale(): { locale?: string } {
    return this.#options.locale === undefined ? {} : { locale: this.#options.locale };
  }

  #listen(): void {
    const g = this.#group;
    // Inner controls report through the builder's own events.
    for (const type of ['aui-change', 'aui-input', 'aui-submit', 'aui-invalid', 'aui-reset']) {
      on(g, this.#root, type, (event) => {
        event.stopPropagation();
      });
    }
    g.listen(this.#undo.element, 'click', () => {
      this.undo();
    });
    g.listen(this.#redo.element, 'click', () => {
      this.redo();
    });
    g.listen(this.#root, 'keydown', (event) => {
      const e = event;
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target;
      // Text fields keep their own undo.
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) this.undo();
      else if (key === 'y' || (key === 'z' && e.shiftKey)) this.redo();
      else return;
      e.preventDefault();
    });
    on(g, this.#tabs.host, 'aui-change', (event) => {
      this.#view = (event as CustomEvent<TabsChangeDetail>).detail.value;
      if (this.#view === 'preview') this.#renderPreview();
      if (this.#view === 'json') this.#renderJson();
    });
    on(g, this.#canvasHost, 'aui-change', (event) => {
      const detail = (event as CustomEvent<SortableListChangeDetail>).detail;
      this.#commit(reorderFields(this.#value, detail.order), { canvasOnly: true });
    });
    g.listen(this.#jsonApply.element, 'click', () => {
      this.#applyJson();
    });
    g.listen(this.#jsonRevert.element, 'click', () => {
      this.#renderJson(true);
    });
    on(g, this.#previewHost, 'aui-submit', (event) => {
      const value = (event as CustomEvent<{ value: unknown }>).detail.value;
      this.#previewOutput.textContent = JSON.stringify(value, null, 2);
    });
  }

  #buildPalette(): void {
    for (const p of this.#paletteButtons) {
      p.drag.dispose();
      p.button.destroy();
    }
    this.#paletteButtons.length = 0;
    this.#palette.replaceChildren();
    const doc = this.#doc;
    for (const type of this.#options.fieldTypes ?? FIELD_TYPES) {
      const li = doc.createElement('li');
      const el = doc.createElement('button');
      el.type = 'button';
      el.className = 'aui-form-builder__type';
      el.textContent = this.#typeLabel(type);
      li.append(el);
      this.#palette.append(li);
      const button = Button.enhance(el, { icon: TEMPLATES[type].icon, variant: 'outline', size: 'sm', fullWidth: true });
      const drag = trackPointerDrag(el, {
        onStart: () => {
          el.classList.add('aui-form-builder__type--dragging');
        },
        onMove: (move) => {
          this.#showDrop(move.point.y, move.point.x);
        },
        onEnd: (move) => {
          el.classList.remove('aui-form-builder__type--dragging');
          const index = this.#dropIndex(move.point.y, move.point.x);
          this.#dropMarker.hidden = true;
          if (index !== null) this.addField(type, index);
        },
        onCancel: () => {
          el.classList.remove('aui-form-builder__type--dragging');
          this.#dropMarker.hidden = true;
        },
      });
      this.#group.listen(el, 'click', () => {
        this.addField(type);
      });
      this.#paletteButtons.push({ type, button, drag });
    }
  }

  /** Insertion index for a pointer position over the canvas, or null outside it. */
  #dropIndex(y: number, x: number): number | null {
    const canvas = this.#canvasHost.parentElement;
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) return null;
    const items = Array.from(this.#canvas.list.children);
    const i = items.findIndex((li) => {
      const r = li.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return i < 0 ? items.length : i;
  }

  #showDrop(y: number, x: number): void {
    const index = this.#dropIndex(y, x);
    const canvas = this.#canvasHost.parentElement;
    if (index === null || !canvas) {
      this.#dropMarker.hidden = true;
      return;
    }
    const items = Array.from(this.#canvas.list.children);
    const box = canvas.getBoundingClientRect();
    const ref = items[index];
    const last = items[items.length - 1];
    const top = ref ? ref.getBoundingClientRect().top : last ? last.getBoundingClientRect().bottom : this.#canvasHost.getBoundingClientRect().top;
    this.#dropMarker.style.setProperty('--_aui-form-builder-drop', `${String(Math.round(top - box.top))}px`);
    this.#dropMarker.hidden = false;
  }

  /** Apply a new document: validate, record for undo, re-render, emit. Returns false when rejected. */
  #commit(next: FormBuilderValue, opts: { select?: string | null; fromPanel?: boolean; canvasOnly?: boolean } = {}): boolean {
    const issues = FormBuilder.#issues(next);
    if (issues.length > 0) {
      this.#setPanelStatus(this.#m('invalid', { issues: describeIssues(issues) }));
      if (opts.canvasOnly === true) this.#renderCanvas();
      return false;
    }
    this.#history.record(this.#value, next);
    this.#value = next;
    if (opts.select !== undefined) this.#selected = opts.select;
    this.#setPanelStatus(null);
    this.#renderCanvas();
    if (opts.fromPanel !== true && opts.canvasOnly !== true) this.#renderPanel();
    this.#renderToolbar();
    if (this.#view === 'preview') this.#renderPreview();
    if (this.#view === 'json') this.#renderJson(true);
    emit(this.host, 'aui-change', this.getValue() satisfies FormBuilderChangeDetail);
    return true;
  }

  #afterHistory(key: 'undone' | 'redone'): void {
    if (this.#selected !== null && !this.#value.schema.properties?.[this.#selected]) this.#selected = null;
    this.#render();
    announce(this.#m(key), 'polite', this.#doc);
    emit(this.host, 'aui-change', this.getValue() satisfies FormBuilderChangeDetail);
  }

  #render(): void {
    this.#renderCanvas();
    this.#renderPanel();
    this.#renderToolbar();
    if (this.#view === 'preview') this.#renderPreview();
    if (this.#view === 'json') this.#renderJson(true);
  }

  #renderToolbar(): void {
    this.#toolbar.setAttribute('aria-label', this.#options.label);
    this.#undo.update({ disabled: !this.#history.canUndo });
    this.#redo.update({ disabled: !this.#history.canRedo });
  }

  #renderCanvas(): void {
    const doc = this.#doc;
    const order = fieldOrder(this.#value);
    const required = new Set(this.#value.schema.required ?? []);
    for (const [name, row] of this.#rows) {
      if (!order.includes(name)) {
        row.remove.destroy();
        this.#rows.delete(name);
      }
    }
    const items = order.map((name) => {
      const schema = this.#value.schema.properties?.[name] ?? { type: 'string' as const };
      const ui = this.#value.uiSchema.fields?.[name] ?? {};
      const label = ui.label ?? schema.title ?? name;
      let row = this.#rows.get(name);
      if (!row) {
        const content = doc.createElement('div');
        content.className = 'aui-form-builder__item';
        const select = doc.createElement('button');
        select.type = 'button';
        select.className = 'aui-form-builder__select';
        const text = doc.createElement('span');
        text.className = 'aui-form-builder__label';
        const meta = doc.createElement('span');
        meta.className = 'aui-form-builder__meta';
        select.append(text, meta);
        const removeEl = doc.createElement('button');
        removeEl.type = 'button';
        const remove = Button.enhance(removeEl, { icon: this.#options.icons?.remove ?? 'trash', variant: 'ghost', size: 'sm', label: label });
        content.append(select, removeEl);
        this.#group.listen(select, 'click', () => {
          this.selectField(name);
          this.#panelBody.querySelector<HTMLElement>('input, textarea, button')?.focus();
        });
        this.#group.listen(select, 'keydown', (event) => {
          if (event.key === 'Delete') {
            event.preventDefault();
            this.removeField(name);
          }
        });
        this.#group.listen(removeEl, 'click', () => {
          this.removeField(name);
        });
        row = { content, select, text, meta, remove };
        this.#rows.set(name, row);
      }
      const kind = kindOf(schema, ui);
      const isRequired = required.has(name);
      row.text.textContent = label;
      row.meta.textContent = `${this.#typeLabel(kind)}${isRequired ? ` *` : ''}`;
      row.select.setAttribute('aria-label', this.#m('select', { label, type: this.#typeLabel(kind), required: isRequired ? this.#m('requiredSuffix') : '' }));
      row.select.setAttribute('aria-pressed', String(this.#selected === name));
      row.content.classList.toggle('aui-form-builder__item--selected', this.#selected === name);
      row.remove.update({ label: this.#m('removeField', { label }) });
      return { id: name, label, content: row.content };
    });
    this.#canvas.update({ items });
    this.#canvasEmpty.hidden = items.length > 0;
  }

  #setPanelStatus(message: string | null): void {
    if (message === null) {
      this.#panelStatusHost.hidden = true;
      this.#panelStatus?.destroy();
      this.#panelStatus = null;
      this.#panelStatusHost.replaceChildren();
      return;
    }
    this.#panelStatusHost.hidden = false;
    if (this.#panelStatus) this.#panelStatus.update({ message, tone: 'error' });
    else this.#panelStatus = InlineMessage.create(this.#panelStatusHost, { message, tone: 'error', live: 'assertive', ...this.#locale() });
  }

  // ---------------------------------------------------------------- properties panel

  #renderPanel(): void {
    this.#panelGroup.dispose();
    this.#panelGroup = new DisposableGroup();
    for (const c of this.#panelControls) c.destroy();
    this.#panelControls = [];
    this.#panelBody.replaceChildren();
    const name = this.#selected;
    const schema = name === null ? undefined : this.#value.schema.properties?.[name];
    if (name === null || !schema) {
      this.#panelTitle.textContent = this.#m('formSettings');
      this.#renderFormSettings();
      return;
    }
    const ui = this.#value.uiSchema.fields?.[name] ?? {};
    const kind = kindOf(schema, ui);
    this.#panelTitle.textContent = `${this.#m('properties')}: ${ui.label ?? schema.title ?? name}`;
    const field = (s: Patch<FormSchema>, u: Patch<UiField> = {}): void => {
      this.#commit(patchField(this.#value, name, s, u), { fromPanel: true });
    };
    this.#text(this.#m('label'), schema.title ?? '', (v) => {
      field({ title: v === '' ? undefined : v });
      this.#panelTitle.textContent = `${this.#m('properties')}: ${v === '' ? name : v}`;
    }, { required: true });
    this.#text(this.#m('name'), name, (v) => {
      if (v === name) return;
      if (this.#commit(renameField(this.#value, name, v), { select: v, fromPanel: true })) this.#renderPanel();
    }, {
      required: true,
      description: this.#m('nameHelp'),
      validate: (v) => (!NAME_RE.test(v) ? this.#m('nameInvalid') : v !== name && this.#value.schema.properties?.[v] ? this.#m('nameTaken') : null),
    });
    this.#area(this.#m('help'), schema.description ?? '', (v) => {
      field({ description: v === '' ? undefined : v });
    }, 2);
    if (kind === 'group' || kind === 'list') {
      const p = this.#doc.createElement('p');
      p.className = 'aui-form-builder__hint';
      p.textContent = this.#m('nested');
      this.#panelBody.append(p);
    }
    const placeholderKinds: readonly string[] = ['text', 'textarea', 'richtext', 'email', 'url', 'number', 'integer', 'select', 'combobox', 'multiselect'];
    if (placeholderKinds.includes(kind)) {
      this.#text(this.#m('placeholder'), ui.placeholder ?? '', (v) => {
        field({}, { placeholder: v === '' ? undefined : v });
      });
    }
    this.#switch(this.#m('required'), (this.#value.schema.required ?? []).includes(name), (v) => {
      this.#commit(setRequired(this.#value, name, v), { fromPanel: true });
    });
    const columns = this.#value.uiSchema.columns ?? 1;
    if (columns > 1) {
      this.#select(this.#m('width'), String(ui.span ?? 1), Array.from({ length: columns }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })), (v) => {
        const n = Number(v);
        field({}, { span: n > 1 ? n : undefined });
      });
    }
    // Validation.
    const textKinds: readonly string[] = ['text', 'textarea', 'richtext', 'email', 'url'];
    if (textKinds.includes(kind)) {
      this.#heading(this.#m('validation'));
      this.#number(this.#m('minLength'), schema.minLength ?? null, (v) => {
        field({ minLength: v ?? undefined });
      }, 0);
      this.#number(this.#m('maxLength'), schema.maxLength ?? null, (v) => {
        field({ maxLength: v ?? undefined });
      }, 0);
      if (kind === 'text' || kind === 'textarea') {
        this.#text(this.#m('pattern'), schema.pattern ?? '', (v) => {
          field({ pattern: v === '' ? undefined : v });
        });
        this.#text(this.#m('patternMessage'), ui.patternMessage ?? '', (v) => {
          field({}, { patternMessage: v === '' ? undefined : v });
        });
      }
    }
    if (kind === 'number' || kind === 'integer' || kind === 'slider') {
      this.#heading(this.#m('validation'));
      this.#number(this.#m('minimum'), schema.minimum ?? null, (v) => {
        field({ minimum: v ?? undefined });
      });
      this.#number(this.#m('maximum'), schema.maximum ?? null, (v) => {
        field({ maximum: v ?? undefined });
      });
    }
    if (kind === 'multiselect' || kind === 'checkboxes') {
      this.#heading(this.#m('validation'));
      this.#number(this.#m('minItems'), schema.minItems ?? null, (v) => {
        field({ minItems: v ?? undefined });
      }, 0);
      this.#number(this.#m('maxItems'), schema.maxItems ?? null, (v) => {
        field({ maxItems: v ?? undefined });
      }, 0);
    }
    // Options.
    const choiceSchema = schema.type === 'array' ? schema.items : schema;
    const choices = choiceSchema ? choicesOf(choiceSchema) : null;
    if (choiceSchema && choices && kind !== 'list') {
      const numeric = choiceSchema.type === 'number' || choiceSchema.type === 'integer';
      this.#area(this.#m('options'), formatChoices(choices), (v) => {
        const parsed = parseChoices(v, numeric);
        if (typeof parsed === 'string') {
          this.#setPanelStatus(this.#m('optionsInvalid', { line: parsed }));
          return;
        }
        const nextChoices: FormSchema = { type: choiceSchema.type, oneOf: parsed };
        if (schema.type === 'array') field({ items: { ...nextChoices, ...(choiceSchema.title === undefined ? {} : { title: choiceSchema.title }) } });
        else field({ oneOf: parsed, enum: undefined });
      }, 5);
    }
    if (kind === 'textarea' || kind === 'richtext') {
      this.#number(this.#m('rows'), ui.rows ?? null, (v) => {
        field({}, { rows: v ?? undefined });
      }, 1, 30);
    }
    if (kind === 'date' || kind === 'datetime') {
      this.#switch(this.#m('workingDays'), ui.disableNonWorking === true, (v) => {
        field({}, { disableNonWorking: v ? true : undefined });
      });
    }
    this.#renderVisibility(name, ui);
  }

  #renderVisibility(name: string, ui: UiField): void {
    this.#heading(this.#m('visibility'));
    const others = fieldOrder(this.#value).filter((n) => n !== name);
    const condition = ui.visibleIf;
    const simple = condition !== undefined && 'field' in condition ? condition : undefined;
    const target = simple?.field.replace(/^\//, '');
    const op = simple === undefined ? 'equals' : 'equals' in simple ? 'equals' : 'notEquals' in simple ? 'notEquals' : 'filled' in simple ? (simple.filled ? 'filled' : 'empty') : 'equals';
    const setCondition = (next: FormCondition | undefined): void => {
      this.#commit(patchField(this.#value, name, {}, { visibleIf: next }), { fromPanel: true });
      this.#renderPanel();
    };
    const labelOf = (n: string): string => this.#value.uiSchema.fields?.[n]?.label ?? this.#value.schema.properties?.[n]?.title ?? n;
    this.#select(this.#m('dependsOn'), target ?? '', [{ value: '', label: this.#m('always') }, ...others.map((n) => ({ value: n, label: this.#m('when', { label: labelOf(n) }) }))], (v) => {
      setCondition(v === '' ? undefined : { field: v, filled: true });
    });
    if (target === undefined || condition === undefined || simple === undefined) return;
    this.#select(this.#m('operator'), op, ['equals', 'notEquals', 'filled', 'empty'].map((o) => ({ value: o, label: this.#m(o) })), (v) => {
      const current = 'equals' in simple ? simple.equals : 'notEquals' in simple ? simple.notEquals : null;
      if (v === 'filled' || v === 'empty') setCondition({ field: simple.field, filled: v === 'filled' });
      else setCondition(v === 'equals' ? { field: simple.field, equals: current } : { field: simple.field, notEquals: current });
    });
    if (op !== 'equals' && op !== 'notEquals') return;
    const value: JsonValue = 'equals' in simple ? simple.equals : 'notEquals' in simple ? simple.notEquals : null;
    const targetSchema = this.#value.schema.properties?.[target];
    const write = (v: JsonValue): void => {
      setCondition(op === 'equals' ? { field: simple.field, equals: v } : { field: simple.field, notEquals: v });
    };
    const targetChoices = targetSchema ? choicesOf(targetSchema.type === 'array' && targetSchema.items ? targetSchema.items : targetSchema) : null;
    if (targetSchema?.type === 'boolean') {
      this.#select(this.#m('value'), value === true ? 'true' : 'false', [{ value: 'true', label: this.#m('yes') }, { value: 'false', label: this.#m('no') }], (v) => {
        write(v === 'true');
      });
    } else if (targetChoices && targetSchema?.type !== 'array') {
      this.#select(this.#m('value'), value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value), targetChoices.map((c) => ({ value: String(c.const), label: c.title ?? String(c.const) })), (v) => {
        write(targetChoices.find((c) => String(c.const) === v)?.const ?? v);
      });
    } else {
      this.#text(this.#m('value'), value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value), (v) => {
        const numeric = targetSchema?.type === 'number' || targetSchema?.type === 'integer';
        write(numeric && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v);
      });
    }
  }

  #renderFormSettings(): void {
    const s = this.#value.schema;
    this.#text(this.#m('title'), s.title ?? '', (v) => {
      this.#commit(patchForm(this.#value, { title: v === '' ? undefined : v }, {}), { fromPanel: true });
    });
    this.#area(this.#m('description'), s.description ?? '', (v) => {
      this.#commit(patchForm(this.#value, { description: v === '' ? undefined : v }, {}), { fromPanel: true });
    }, 2);
    this.#select(this.#m('columns'), String(this.#value.uiSchema.columns ?? 1), ['1', '2', '3', '4'].map((v) => ({ value: v, label: v })), (v) => {
      const n = Number(v);
      this.#commit(patchForm(this.#value, {}, { columns: n > 1 ? n : undefined }), { fromPanel: true });
    });
  }

  #cell(): HTMLDivElement {
    const el = this.#doc.createElement('div');
    this.#panelBody.append(el);
    return el;
  }

  #heading(text: string): void {
    const h = this.#doc.createElement('h4');
    h.className = 'aui-form-builder__subheading';
    h.textContent = text;
    this.#panelBody.append(h);
  }

  #text(label: string, value: string, onCommit: (v: string) => void, extra: { required?: boolean; description?: string; validate?: (v: string) => string | null } = {}): void {
    const host = this.#cell();
    const c = TextInput.create(host, { label, value, ...extra, ...this.#locale() });
    this.#panelControls.push(c);
    on(this.#panelGroup, host, 'aui-change', () => {
      const v = c.value.trim();
      if ((extra.validate?.(v) ?? null) !== null || (extra.required === true && v === '')) return;
      onCommit(v);
    });
  }

  #area(label: string, value: string, onCommit: (v: string) => void, rows: number): void {
    const host = this.#cell();
    const c = Textarea.create(host, { label, value, rows, ...this.#locale() });
    this.#panelControls.push(c);
    on(this.#panelGroup, host, 'aui-change', () => {
      onCommit(c.value.trim());
    });
  }

  #number(label: string, value: number | null, onCommit: (v: number | null) => void, min?: number, max?: number): void {
    const host = this.#cell();
    const c = NumberInput.create(host, { label, value, ...(min === undefined ? {} : { min, step: 1 }), ...(max === undefined ? {} : { max }), ...this.#locale() });
    this.#panelControls.push(c);
    on(this.#panelGroup, host, 'aui-change', () => {
      if (!c.validity.valid) return;
      onCommit(c.value);
    });
  }

  #switch(label: string, checked: boolean, onCommit: (v: boolean) => void): void {
    const host = this.#cell();
    const c = Switch.create(host, { label, checked, ...this.#locale() });
    this.#panelControls.push(c);
    on(this.#panelGroup, host, 'aui-change', () => {
      onCommit(c.checked);
    });
  }

  #select(label: string, value: string, options: readonly { value: string; label: string }[], onCommit: (v: string) => void): void {
    const host = this.#cell();
    const c = Select.create(host, { label, options, value: options.some((o) => o.value === value) ? value : null, ...this.#locale() });
    this.#panelControls.push(c);
    on(this.#panelGroup, host, 'aui-change', () => {
      onCommit(c.value ?? '');
    });
  }

  // ---------------------------------------------------------------- preview and JSON

  #renderPreview(): void {
    const options = { schema: this.#value.schema, uiSchema: this.#value.uiSchema, ...this.#locale() };
    if (this.#preview) this.#preview.update({ ...options, value: this.#preview.getValue() });
    else this.#preview = SchemaForm.create(this.#previewHost, options);
  }

  #renderJson(force = false): void {
    const text = JSON.stringify({ schema: this.#value.schema, uiSchema: this.#value.uiSchema }, null, 2);
    if (force || this.#json.value === '') this.#json.setValue(text);
    this.#setJsonStatus(null);
  }

  #setJsonStatus(message: string | null, tone: 'error' | 'success' = 'error'): void {
    if (message === null) {
      this.#jsonStatusHost.hidden = true;
      this.#jsonStatus?.destroy();
      this.#jsonStatus = null;
      this.#jsonStatusHost.replaceChildren();
      return;
    }
    this.#jsonStatusHost.hidden = false;
    if (this.#jsonStatus) this.#jsonStatus.update({ message, tone });
    else this.#jsonStatus = InlineMessage.create(this.#jsonStatusHost, { message, tone, live: 'polite', ...this.#locale() });
  }

  #applyJson(): void {
    const parsed = safeJsonParse(this.#json.value, { maxLength: MAX_JSON });
    if (!parsed.ok) {
      this.#setJsonStatus(this.#m('jsonInvalid'));
      return;
    }
    const v = parsed.value;
    if (!isObject(v) || !isObject(v.schema) || (v.uiSchema !== undefined && !isObject(v.uiSchema))) {
      this.#setJsonStatus(this.#m('jsonShape'));
      return;
    }
    const schema = v.schema;
    const uiSchema = v.uiSchema ?? {};
    if (!isFormSchema(schema)) {
      this.#setJsonStatus(describeIssues(checkFormSchema(schema)));
      return;
    }
    if (!isUiSchema(schema, uiSchema)) {
      this.#setJsonStatus(describeIssues(checkUiSchema(schema, uiSchema)));
      return;
    }
    const next: FormBuilderValue = { schema, uiSchema };
    this.#selected = null;
    if (this.#commit(next)) this.#setJsonStatus(this.#m('applied'), 'success');
  }
}

/** An object type without `undefined` values: required keys stay, possibly-undefined keys become optional. */
type Pruned<T> = { [K in keyof T as undefined extends T[K] ? never : K]: T[K] } & { [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined> };

function prune<T extends object>(o: T): Pruned<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Pruned<T>;
}

