/**
 * Schema Form (R20 P7). Renders a complete form from a JSON Schema subset (draft 2020-12 keywords) and an
 * optional UI schema, with the existing AbsoluteUI controls inside a native <form> managed by Form. Values
 * serialize and validate like a hand-written form: every control is named by its JSON Pointer, Form runs
 * the constraint checks and shows the Error Summary, and server errors map back by pointer. Unsupported
 * keywords are configuration errors, never silently ignored.
 */
import { configurationError, defineComponentConfig, DisposableGroup, emit, getMessage, instantToString, parseInstant, parsePlainDate, parsePlainTime, plainTimeToString, registerMessages, validators } from '@absoluteui/core';
import { announce } from '@absoluteui/utilities';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';
import { Button } from '../button/button.js';
import { CheckboxGroup } from '../checkbox-group/checkbox-group.js';
import { Checkbox } from '../checkbox/checkbox.js';
import { Combobox } from '../combobox/combobox.js';
import { DatePicker } from '../date-picker/date-picker.js';
import { DateTimePicker } from '../date-time-picker/date-time-picker.js';
import { Fieldset } from '../fieldset/fieldset.js';
import { Form, type FormErrorEntry } from '../form/form.js';
import { getFormControl } from '../internal/field.js';
import { MultiSelect } from '../multi-select/multi-select.js';
import { NumberInput } from '../number-input/number-input.js';
import { RadioGroup } from '../radio-group/radio-group.js';
import { RichTextEditor } from '../rich-text-editor/rich-text-editor.js';
import { Select } from '../select/select.js';
import { Slider } from '../slider/slider.js';
import { Switch } from '../switch/switch.js';
import { Textarea } from '../textarea/textarea.js';
import { TextInput } from '../text-input/text-input.js';
import { TimePicker } from '../time-picker/time-picker.js';
import {
  checkFormSchema,
  checkUiSchema,
  childPointer,
  choiceKey,
  choicesOf,
  describeIssues,
  evaluateCondition,
  isObject,
  matchesType,
  widgetsFor,
  type FormSchema,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
  type SchemaWidget,
  type UiField,
} from './schema.js';

export interface SchemaFormConfig {
  /** Show the submit (and optional reset) buttons under the form. */
  showActions: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    schemaForm: SchemaFormConfig & { locale: string };
  }
}

export const schemaFormConfig = defineComponentConfig<SchemaFormConfig, 'locale'>(
  'schemaForm',
  { showActions: { default: true, expected: 'boolean', validate: validators.isBoolean } },
  ['locale'],
);

registerMessages('schemaForm', 'en', {
  submit: 'Submit',
  reset: 'Reset',
  add: 'Add {label}',
  remove: 'Remove {label}',
  moveUp: 'Move {label} up',
  moveDown: 'Move {label} down',
  item: '{label} {index}',
  empty: 'No entries yet.',
  added: '{label} added.',
  removed: '{label} removed.',
  moved: '{label} moved to position {position} of {count}.',
  tooFew: '{label}: add at least {min}.',
  tooMany: '{label}: keep at most {max}.',
  pattern: 'Enter a value in the requested format.',
});

/** Errors by JSON Pointer (`/address/city`, `/contacts/0/phone`); `''` is a form-level message. */
export type SchemaFormErrors = Readonly<Record<string, string>>;

export interface SchemaFormOptions extends Partial<SchemaFormConfig> {
  /** The form's JSON Schema (root type "object"); checked against the supported subset. */
  schema: FormSchema;
  /** Presentation: widgets, order, columns, help text, placeholders, visibility conditions. */
  uiSchema?: UiField;
  /** Initial value. Values that do not match the schema type are ignored (the field starts empty). */
  value?: JsonObject;
  /** Accessible name of the form. Default: the schema title. */
  label?: string;
  /** Submit button text. Default: localized "Submit". */
  submitLabel?: string;
  /** Also show a reset button. Default false. */
  showReset?: boolean;
  /** Disable every field and the actions. */
  disabled?: boolean;
  /** Working days and holidays for the date pickers (`disableNonWorking` in the UI schema uses it). */
  businessCalendar?: BusinessCalendarEngine | null;
  /** IANA time zone of date-time fields. Default: the global configuration. */
  timezone?: string;
  /** Async validation after the constraint checks pass; return messages by JSON Pointer. Honour `signal`. */
  validate?: (value: JsonObject, signal: AbortSignal) => Promise<SchemaFormErrors>;
  locale?: string;
}

/** `aui-change` detail: the whole value after the edit, and the pointer of the edited field. */
export interface SchemaFormChangeDetail {
  value: JsonObject;
  pointer: string | null;
}

/** `aui-submit` detail: the validated value. */
export interface SchemaFormSubmitDetail {
  value: JsonObject;
}

/** `aui-invalid` detail: the problems that blocked submission. */
export interface SchemaFormInvalidDetail {
  errors: readonly { pointer: string | null; label: string; message: string }[];
}

interface Ctx {
  readonly doc: Document;
  readonly locale: string;
  readonly options: SchemaFormOptions;
  readonly onStructure: () => void;
}

/** One rendered schema node. */
interface FieldNode {
  readonly pointer: string;
  readonly schema: FormSchema;
  readonly ui: UiField;
  readonly label: string;
  readonly el: HTMLElement;
  /** Parent object pointer, for sibling references in conditions. */
  readonly parent: string;
  visible: boolean;
  value(): JsonValue | undefined;
  setEnabled(enabled: boolean): void;
  focus(): void;
  setGroupError(message: string | null): void;
  children(): readonly FieldNode[];
  destroy(): void;
}

interface Leaf {
  read(): JsonValue | undefined;
  update(options: { disabled: boolean }): void;
  destroy(): void;
}

const humanize = (key: string): string => {
  const words = key.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words === '' ? key : words.charAt(0).toUpperCase() + words.slice(1);
};

/** An object type without `undefined` values: required keys stay, possibly-undefined keys become optional. */
type Pruned<T> = { [K in keyof T as undefined extends T[K] ? never : K]: T[K] } & { [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined> };

/** Drop undefined values (exactOptionalPropertyTypes: options never receive explicit undefined). */
function prune<T extends object>(o: T): Pruned<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Pruned<T>;
}

function labelOf(schema: FormSchema, ui: UiField, key: string): string {
  return ui.label ?? schema.title ?? humanize(key);
}

/** Build a control for a primitive (or choice-array) node. */
function createLeaf(ctx: Ctx, host: HTMLElement, schema: FormSchema, ui: UiField, pointer: string, label: string, required: boolean, initial: JsonValue | undefined, disabled: boolean): Leaf {
  const widget: SchemaWidget = ui.widget ?? widgetsFor(schema)[0] ?? 'text';
  const description = ui.help ?? schema.description;
  const readOnly = schema.readOnly === true ? true : undefined;
  const base = prune({ label, name: pointer, description, disabled, locale: ctx.options.locale });
  const choices = choicesOf(schema.type === 'array' && schema.items ? schema.items : schema);
  const byKey = new Map((choices ?? []).map((c) => [choiceKey(c.const), c.const] as const));
  const options = (choices ?? []).map((c) => prune({ value: choiceKey(c.const), label: c.title ?? String(c.const), description: c.description }));
  const keyOf = (v: JsonValue | undefined): string | null => (v !== undefined && v !== null && typeof v !== 'object' && byKey.has(choiceKey(v)) ? choiceKey(v) : null);
  const fromKey = (k: string | null): JsonValue | undefined => (k === null ? undefined : byKey.get(k));
  const str = (v: JsonValue | undefined): string => (typeof v === 'string' ? v : '');
  const pattern = schema.pattern === undefined ? null : new RegExp(schema.pattern, 'u');
  const patternCheck = (value: string): string | null => (pattern === null || value === '' || pattern.test(value) ? null : ui.patternMessage ?? getMessage('schemaForm', 'pattern', {}, ctx.locale));
  const nonEmpty = (s: string): JsonValue | undefined => (s === '' ? undefined : s);
  switch (widget) {
    case 'text':
    case 'password': {
      const c = TextInput.create(host, prune({
        ...base,
        type: widget === 'password' ? 'password' as const : schema.format === 'email' ? 'email' as const : schema.format === 'uri' ? 'url' as const : 'text' as const,
        value: str(initial),
        placeholder: ui.placeholder,
        required,
        readOnly,
        minLength: schema.minLength,
        maxLength: schema.maxLength,
        validate: patternCheck,
      }));
      return { read: () => nonEmpty(c.value), update: (o) => { c.update(o); }, destroy: () => { c.destroy(); } };
    }
    case 'textarea': {
      const c = Textarea.create(host, prune({ ...base, value: str(initial), placeholder: ui.placeholder, required, readOnly, minLength: schema.minLength, maxLength: schema.maxLength, rows: ui.rows, validate: patternCheck }));
      return { read: () => nonEmpty(c.value), update: (o) => { c.update(o); }, destroy: () => { c.destroy(); } };
    }
    case 'richtext': {
      const c = RichTextEditor.create(host, prune({ ...base, value: str(initial), placeholder: ui.placeholder, required, readOnly, minLength: schema.minLength, maxLength: schema.maxLength, rows: ui.rows }));
      return { read: () => nonEmpty(c.value), update: (o) => { c.update(o); }, destroy: () => { c.destroy(); } };
    }
    case 'number':
    case 'slider': {
      const num = typeof initial === 'number' ? initial : null;
      const step = schema.type === 'integer' ? 1 : undefined;
      if (widget === 'slider') {
        const min = schema.minimum ?? 0;
        const max = schema.maximum ?? 100;
        const c = Slider.create(host, prune({ ...base, min, max, step, value: Math.min(max, Math.max(min, num ?? min)) }));
        return { read: () => (typeof c.value === 'number' ? c.value : undefined), update: (o) => { c.update(o); }, destroy: () => { c.destroy(); } };
      }
      const c = NumberInput.create(host, prune({ ...base, value: num, placeholder: ui.placeholder, required, readOnly, min: schema.minimum, max: schema.maximum, step }));
      return { read: () => c.value ?? undefined, update: (o) => { c.update(o); }, destroy: () => { c.destroy(); } };
    }
    case 'select': {
      const c = Select.create(host, prune({ ...base, options, value: keyOf(initial), placeholder: ui.placeholder, required, readOnly }));
      return { read: () => fromKey(c.value), update: (o) => { c.update(o); }, destroy: () => { c.destroy(); } };
    }
    case 'radio': {
      const c = RadioGroup.create(host, prune({ ...base, options, value: keyOf(initial), required, orientation: ui.orientation }));
      return { read: () => fromKey(c.value), update: (o) => { c.update(o); }, destroy: () => { c.destroy(); } };
    }
    case 'combobox': {
      const c = Combobox.create(host, prune({ ...base, options, value: keyOf(initial), placeholder: ui.placeholder, required, readOnly }));
      return { read: () => fromKey(c.value), update: (o) => { c.update(o); }, destroy: () => { c.destroy(); } };
    }
    case 'multiselect':
    case 'checkboxes': {
      const keys = Array.isArray(initial) ? initial.map((v) => keyOf(v)).filter((k): k is string => k !== null) : [];
      const read = (value: readonly string[]): JsonValue[] => value.map((k) => byKey.get(k)).filter((v): v is JsonPrimitive => v !== undefined);
      if (widget === 'checkboxes') {
        const c = CheckboxGroup.create(host, prune({ ...base, options, value: keys, required, minSelected: schema.minItems, maxSelected: schema.maxItems, orientation: ui.orientation }));
        return { read: () => read(c.value), update: (o) => { c.update(o); }, destroy: () => { c.destroy(); } };
      }
      const c = MultiSelect.create(host, prune({ ...base, options, value: keys, placeholder: ui.placeholder, required, readOnly, maxSelected: schema.maxItems }));
      return { read: () => read(c.value), update: (o) => { c.update(o); }, destroy: () => { c.destroy(); } };
    }
    case 'checkbox':
    case 'switch': {
      const checked = initial === true;
      const c = widget === 'switch' ? Switch.create(host, prune({ ...base, checked })) : Checkbox.create(host, prune({ ...base, checked }));
      return { read: () => c.checked, update: (o) => { c.update(o); }, destroy: () => { c.destroy(); } };
    }
    case 'date': {
      const calendar = ctx.options.businessCalendar ?? null;
      const c = DatePicker.create(host, prune({
        ...base,
        value: typeof initial === 'string' ? parsePlainDate(initial) : null,
        required,
        readOnly,
        businessCalendar: calendar,
        disableNonWorking: ui.disableNonWorking === true && calendar !== null ? true : undefined,
        timezone: ctx.options.timezone,
      }));
      return { read: () => c.getFormValue() ?? undefined, update: (o) => { c.update(o); }, destroy: () => { c.destroy(); } };
    }
    case 'datetime': {
      const calendar = ctx.options.businessCalendar ?? null;
      const c = DateTimePicker.create(host, prune({
        ...base,
        value: typeof initial === 'string' ? parseInstant(initial) : null,
        required,
        readOnly,
        businessCalendar: calendar,
        disableNonWorking: ui.disableNonWorking === true && calendar !== null ? true : undefined,
        timezone: ctx.options.timezone,
      }));
      return { read: () => (c.value === null ? undefined : instantToString(c.value)), update: (o) => { c.update(o); }, destroy: () => { c.destroy(); } };
    }
    case 'time': {
      const c = TimePicker.create(host, prune({ ...base, value: typeof initial === 'string' ? parsePlainTime(initial) : null, required, readOnly }));
      return { read: () => (c.value === null ? undefined : plainTimeToString(c.value)), update: (o) => { c.update(o); }, destroy: () => { c.destroy(); } };
    }
    case 'group':
    case 'list':
      break;
  }
  throw configurationError('SCHEMA_FORM_WIDGET', 'Widget does not render a single control.', { component: 'schema-form', property: `uiSchema${pointer}`, expected: widgetsFor(schema).join(' | ') });
}

function initialOf(schema: FormSchema, value: JsonValue | undefined): JsonValue | undefined {
  if (value !== undefined && matchesType(value, schema.type)) return value;
  return schema.default;
}

/** Apply the parent's grid span to a field wrapper. */
function placeInGrid(el: HTMLElement, span: number): void {
  if (span > 1) {
    el.classList.add('aui-schema-form__cell--span');
    el.dataset.span = String(span);
  }
}

class LeafNode implements FieldNode {
  readonly el: HTMLElement;
  visible = true;
  readonly #leaf: Leaf;
  readonly #host: HTMLElement;
  constructor(ctx: Ctx, readonly pointer: string, readonly parent: string, readonly schema: FormSchema, readonly ui: UiField, readonly label: string, required: boolean, initial: JsonValue | undefined, disabled: boolean) {
    this.el = ctx.doc.createElement('div');
    this.el.className = 'aui-schema-form__cell';
    this.#host = ctx.doc.createElement('div');
    this.el.append(this.#host);
    this.#leaf = createLeaf(ctx, this.#host, schema, ui, pointer, label, required, initialOf(schema, initial), disabled);
  }

  value(): JsonValue | undefined {
    return this.#leaf.read();
  }

  setEnabled(enabled: boolean): void {
    this.#leaf.update({ disabled: !enabled });
  }

  focus(): void {
    getFormControl(this.#host)?.focus();
  }

  setGroupError(): void {
    // Leaf errors go through the control (Form.setErrors).
  }

  children(): readonly FieldNode[] {
    return [];
  }

  destroy(): void {
    this.#leaf.destroy();
    this.el.remove();
  }
}

/** Create the node for one property. */
function createNode(ctx: Ctx, pointer: string, parent: string, key: string, schema: FormSchema, ui: UiField, required: boolean, initial: JsonValue | undefined, disabled: boolean, labelOverride?: string): FieldNode {
  const label = labelOverride ?? labelOf(schema, ui, key);
  if (schema.type === 'object') return new ObjectNode(ctx, pointer, parent, schema, ui, label, required, initial, disabled, false);
  if (schema.type === 'array' && (ui.widget ?? widgetsFor(schema)[0]) === 'list') return new ArrayNode(ctx, pointer, parent, schema, ui, label, required, initial, disabled);
  return new LeafNode(ctx, pointer, parent, schema, ui, label, required, initial, disabled);
}

class ObjectNode implements FieldNode {
  readonly el: HTMLElement;
  visible = true;
  readonly #grid: HTMLDivElement;
  readonly #fieldset: Fieldset | null;
  readonly #children: FieldNode[] = [];
  readonly #fieldsetOptions: { legend: string; description?: string; required: boolean };
  #error: string | null = null;

  constructor(ctx: Ctx, readonly pointer: string, readonly parent: string, readonly schema: FormSchema, readonly ui: UiField, readonly label: string, required: boolean, initial: JsonValue | undefined, disabled: boolean, root: boolean) {
    const doc = ctx.doc;
    this.#grid = doc.createElement('div');
    this.#grid.className = 'aui-schema-form__grid';
    const columns = ui.columns ?? 1;
    if (columns > 1) {
      this.#grid.classList.add('aui-schema-form__grid--columns');
      this.#grid.dataset.columns = String(columns);
    }
    this.#fieldsetOptions = prune({ legend: label, description: ui.help ?? schema.description, required });
    if (root) {
      this.el = this.#grid;
      this.#fieldset = null;
    } else {
      const fs = doc.createElement('fieldset');
      fs.className = 'aui-schema-form__group';
      fs.append(this.#grid);
      this.el = fs;
      this.#fieldset = Fieldset.enhance(fs, prune({ ...this.#fieldsetOptions, locale: ctx.options.locale }));
    }
    const value = isObject(initial) ? initial : isObject(schema.default) ? schema.default : {};
    const props = schema.properties ?? {};
    const order = [...(ui.order ?? []), ...Object.keys(props).filter((k) => !(ui.order ?? []).includes(k))];
    const req = new Set(schema.required ?? []);
    for (const key of order) {
      const sub = props[key];
      if (!sub) continue;
      const node = createNode(ctx, childPointer(pointer, key), pointer, key, sub, ui.fields?.[key] ?? {}, req.has(key), value[key], disabled);
      if (columns > 1) placeInGrid(node.el, Math.min(node.ui.span ?? 1, columns));
      this.#children.push(node);
      this.#grid.append(node.el);
    }
  }

  value(): JsonValue | undefined {
    const out: JsonObject = {};
    for (const child of this.#children) {
      if (!child.visible) continue;
      const v = child.value();
      if (v !== undefined) out[child.pointer.slice(child.pointer.lastIndexOf('/') + 1).replace(/~1/g, '/').replace(/~0/g, '~')] = v;
    }
    return out;
  }

  setEnabled(enabled: boolean): void {
    for (const child of this.#children) child.setEnabled(enabled && child.visible);
  }

  focus(): void {
    if (this.#fieldset) this.#fieldset.focus();
    else this.#children.find((c) => c.visible)?.focus();
  }

  setGroupError(message: string | null): void {
    if (message === this.#error) return;
    this.#error = message;
    this.#fieldset?.update({ error: message });
  }

  children(): readonly FieldNode[] {
    return this.#children;
  }

  destroy(): void {
    for (const child of this.#children) child.destroy();
    this.#fieldset?.destroy();
    this.el.remove();
  }
}

interface ItemRow {
  readonly li: HTMLLIElement;
  readonly node: FieldNode;
  readonly up: Button;
  readonly down: Button;
  readonly remove: Button;
}

class ArrayNode implements FieldNode {
  readonly el: HTMLFieldSetElement;
  visible = true;
  readonly #ctx: Ctx;
  readonly #fieldset: Fieldset;
  readonly #list: HTMLOListElement;
  readonly #empty: HTMLParagraphElement;
  readonly #add: Button;
  readonly #itemLabel: string;
  #rows: ItemRow[] = [];
  #enabled: boolean;
  #error: string | null = null;
  readonly #group = new DisposableGroup();

  constructor(ctx: Ctx, readonly pointer: string, readonly parent: string, readonly schema: FormSchema, readonly ui: UiField, readonly label: string, required: boolean, initial: JsonValue | undefined, disabled: boolean) {
    this.#ctx = ctx;
    this.#enabled = !disabled;
    const doc = ctx.doc;
    this.el = doc.createElement('fieldset');
    this.el.className = 'aui-schema-form__array';
    this.#list = doc.createElement('ol');
    this.#list.className = 'aui-schema-form__items';
    this.#empty = doc.createElement('p');
    this.#empty.className = 'aui-schema-form__empty';
    this.#empty.textContent = getMessage('schemaForm', 'empty', {}, ctx.locale);
    const items = schema.items ?? { type: 'string' };
    this.#itemLabel = ui.items?.label ?? items.title ?? label;
    const addEl = doc.createElement('button');
    addEl.type = 'button';
    addEl.className = 'aui-schema-form__add';
    addEl.textContent = ui.addLabel ?? getMessage('schemaForm', 'add', { label: this.#itemLabel }, ctx.locale);
    this.#add = Button.enhance(addEl, { icon: 'plus', variant: 'outline', size: 'sm' });
    this.el.append(this.#list, this.#empty, addEl);
    this.#fieldset = Fieldset.enhance(this.el, prune({ legend: label, description: ui.help ?? schema.description, required, locale: ctx.options.locale }));
    this.#group.listen(addEl, 'click', () => {
      this.#insert();
    });
    const start = Array.isArray(initial) ? initial : Array.isArray(schema.default) ? schema.default : [];
    this.#build(start.slice(0, schema.maxItems ?? Number.MAX_SAFE_INTEGER));
  }

  value(): JsonValue[] {
    const out: JsonValue[] = [];
    for (const row of this.#rows) {
      const v = row.node.value();
      // Empty primitive entries are kept as null so positions (and pointers) stay stable.
      out.push(v === undefined ? null : v);
    }
    return out;
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    for (const row of this.#rows) row.node.setEnabled(enabled);
    this.#refreshButtons();
  }

  focus(): void {
    this.#fieldset.focus();
  }

  setGroupError(message: string | null): void {
    if (message === this.#error) return;
    this.#error = message;
    this.#fieldset.update({ error: message });
  }

  children(): readonly FieldNode[] {
    return this.#rows.map((r) => r.node);
  }

  destroy(): void {
    this.#group.dispose();
    this.#clear();
    this.#add.destroy();
    this.#fieldset.destroy();
    this.el.remove();
  }

  #clear(): void {
    for (const row of this.#rows) {
      row.node.destroy();
      row.up.destroy();
      row.down.destroy();
      row.remove.destroy();
      row.li.remove();
    }
    this.#rows = [];
  }

  #build(values: readonly JsonValue[]): void {
    this.#clear();
    const doc = this.#ctx.doc;
    const items = this.schema.items ?? { type: 'string' };
    values.forEach((v, index) => {
      const li = doc.createElement('li');
      li.className = 'aui-schema-form__item';
      const name = getMessage('schemaForm', 'item', { label: this.#itemLabel, index: index + 1 }, this.#ctx.locale);
      const node = createNode(this.#ctx, childPointer(this.pointer, index), this.pointer, String(index), items, this.ui.items ?? {}, false, v, !this.#enabled, name);
      const tools = doc.createElement('div');
      tools.className = 'aui-schema-form__tools';
      const make = (icon: string, key: 'moveUp' | 'moveDown' | 'remove', onClick: () => void): Button => {
        const el = doc.createElement('button');
        el.type = 'button';
        const b = Button.enhance(el, { icon, variant: key === 'remove' ? 'ghost' : 'outline', size: 'sm', label: getMessage('schemaForm', key, { label: name }, this.#ctx.locale) });
        this.#group.listen(el, 'click', onClick);
        tools.append(el);
        return b;
      };
      const row: ItemRow = {
        li,
        node,
        up: make('arrow-up', 'moveUp', () => { this.#move(index, index - 1); }),
        down: make('arrow-down', 'moveDown', () => { this.#move(index, index + 1); }),
        remove: make('trash', 'remove', () => { this.#remove(index); }),
      };
      li.append(node.el, tools);
      this.#list.append(li);
      this.#rows.push(row);
    });
    this.#empty.hidden = values.length > 0;
    this.#refreshButtons();
  }

  #refreshButtons(): void {
    const n = this.#rows.length;
    const max = this.schema.maxItems ?? Number.POSITIVE_INFINITY;
    this.#add.update({ disabled: !this.#enabled || n >= max });
    this.#rows.forEach((row, i) => {
      row.up.update({ disabled: !this.#enabled || i === 0 });
      row.down.update({ disabled: !this.#enabled || i === n - 1 });
      row.remove.update({ disabled: !this.#enabled });
    });
  }

  #insert(): void {
    if (this.#rows.length >= (this.schema.maxItems ?? Number.POSITIVE_INFINITY)) return;
    const items = this.schema.items ?? { type: 'string' };
    const values: JsonValue[] = [...this.value(), (items.default ?? (items.type === 'object' ? {} : null))];
    this.#build(values);
    this.#ctx.onStructure();
    const row = this.#rows[this.#rows.length - 1];
    row?.node.focus();
    announce(getMessage('schemaForm', 'added', { label: getMessage('schemaForm', 'item', { label: this.#itemLabel, index: this.#rows.length }, this.#ctx.locale) }, this.#ctx.locale), 'polite', this.#ctx.doc);
  }

  #remove(index: number): void {
    const values = this.value();
    values.splice(index, 1);
    const name = getMessage('schemaForm', 'item', { label: this.#itemLabel, index: index + 1 }, this.#ctx.locale);
    this.#build(values);
    this.#ctx.onStructure();
    const next = this.#rows[Math.min(index, this.#rows.length - 1)];
    if (next) next.remove.element.focus();
    else this.#add.element.focus();
    announce(getMessage('schemaForm', 'removed', { label: name }, this.#ctx.locale), 'polite', this.#ctx.doc);
  }

  #move(from: number, to: number): void {
    if (to < 0 || to >= this.#rows.length) return;
    const values = this.value();
    const [moved] = values.splice(from, 1);
    if (moved === undefined) return;
    values.splice(to, 0, moved);
    this.#build(values);
    this.#ctx.onStructure();
    const row = this.#rows[to];
    // Keep focus on the same action; at either end it moves to the action that still works.
    if (row) (to < from ? (to === 0 ? row.down : row.up) : (to === this.#rows.length - 1 ? row.up : row.down)).element.focus();
    const name = getMessage('schemaForm', 'item', { label: this.#itemLabel, index: to + 1 }, this.#ctx.locale);
    announce(getMessage('schemaForm', 'moved', { label: name, position: to + 1, count: this.#rows.length }, this.#ctx.locale), 'polite', this.#ctx.doc);
  }
}


/** Listen for an AbsoluteUI custom event (not in HTMLElementEventMap) and remove the listener with `group`. */
function on(group: DisposableGroup, target: EventTarget, type: string, handler: (event: Event) => void): void {
  target.addEventListener(type, handler);
  group.add(() => {
    target.removeEventListener(type, handler);
  });
}
export class SchemaForm {
  readonly host: HTMLElement;
  /** The native form element (managed by `form`). */
  readonly element: HTMLFormElement;
  /** The Form instance that validates, shows the Error Summary, and handles submission. */
  readonly form: Form;
  #options: SchemaFormOptions;
  readonly #doc: Document;
  readonly #body: HTMLDivElement;
  readonly #actions: HTMLDivElement;
  readonly #submit: Button;
  readonly #reset: Button;
  #root: ObjectNode | null = null;
  readonly #nodes = new Map<string, FieldNode>();
  readonly #groupErrors = new Set<string>();
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). Throws a configuration error for an unsupported schema. */
  static create(host: HTMLElement, options: SchemaFormOptions): SchemaForm {
    return new SchemaForm(host, options);
  }

  private constructor(host: HTMLElement, options: SchemaFormOptions) {
    SchemaForm.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#doc;
    this.element = doc.createElement('form');
    this.element.className = 'aui-schema-form__form';
    this.#body = doc.createElement('div');
    this.#body.className = 'aui-schema-form__body';
    this.#actions = doc.createElement('div');
    this.#actions.className = 'aui-schema-form__actions';
    const submitEl = doc.createElement('button');
    submitEl.type = 'submit';
    const resetEl = doc.createElement('button');
    resetEl.type = 'reset';
    this.#actions.append(submitEl, resetEl);
    this.element.append(this.#body, this.#actions);
    this.#submit = Button.enhance(submitEl, { variant: 'primary' });
    this.#reset = Button.enhance(resetEl, { variant: 'ghost' });
    // Render first: invalid options, schema, or UI schema throw before the host is touched.
    this.#render(options.value ?? {});
    host.classList.add('aui-schema-form');
    host.replaceChildren(this.element);
    this.form = Form.create(this.element, {
      validate: (_values, signal) => this.#validateGroups(signal),
      ...(options.locale === undefined ? {} : { locale: options.locale }),
    });
    const g = this.#group;
    const onEdit = (event: Event): void => {
      // Control events stop here: the host reports the whole value instead of a single control's detail.
      event.stopPropagation();
      this.#applyVisibility();
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-aui-control]') : null;
      const pointer = target ? (getFormControl(target)?.name ?? null) : null;
      emit(this.host, 'aui-change', { value: this.getValue(), pointer } satisfies SchemaFormChangeDetail);
    };
    this.element.addEventListener('aui-change', onEdit);
    this.element.addEventListener('aui-input', onEdit);
    g.add(() => {
      this.element.removeEventListener('aui-change', onEdit);
      this.element.removeEventListener('aui-input', onEdit);
    });
    on(g, this.element, 'aui-submit', () => {
      emit(this.host, 'aui-submit', { value: this.getValue() } satisfies SchemaFormSubmitDetail);
    });
    on(g, this.element, 'aui-invalid', (event) => {
      const detail = (event as CustomEvent<{ errors: readonly FormErrorEntry[] }>).detail;
      emit(this.host, 'aui-invalid', { errors: detail.errors.map((e) => ({ pointer: e.name, label: e.label, message: e.message })) } satisfies SchemaFormInvalidDetail);
    });
    on(g, this.element, 'aui-reset', () => {
      // Controls restored themselves; arrays get their initial entries back.
      this.#render(this.#options.value ?? {});
    });
    g.add(schemaFormConfig.subscribe(() => {
      this.#renderActions();
    }));
  }

  get options(): Readonly<SchemaFormOptions> {
    return this.#options;
  }

  /** The current value as JSON: hidden fields and empty optional fields are left out. */
  getValue(): JsonObject {
    const v = this.#root?.value();
    return isObject(v) ? v : {};
  }

  /** Replace the current value (no events). Fields keep their configuration; `reset()` returns to the initial value. */
  setValue(value: JsonObject): void {
    if (!isObject(value)) throw configurationError('SCHEMA_FORM_VALUE', 'Invalid value.', { component: 'schema-form', property: 'value', expected: 'JSON object' });
    this.#render(value);
  }

  /** Validate every visible field and show messages and the summary (no async validation). */
  validate(): boolean {
    return this.form.validate() && Object.keys(this.#groupChecks()).length === 0;
  }

  /** Submit through the native pipeline: validation, then `aui-submit` with the value. */
  submit(): void {
    this.form.submit();
  }

  /** Restore the initial value and clear messages. */
  reset(): void {
    this.form.reset();
  }

  /**
   * Show server-side errors by JSON Pointer. Field pointers mark the control; object and array pointers
   * mark the group; unknown pointers and `''` are listed in the summary. Cleared on edit or resubmit.
   */
  setErrors(errors: SchemaFormErrors): void {
    if (!isObject(errors) || Object.values(errors).some((m) => typeof m !== 'string')) {
      throw configurationError('SCHEMA_FORM_ERRORS', 'Invalid errors.', { component: 'schema-form', property: 'errors', expected: 'Record<JSON Pointer, string>' });
    }
    this.#showGroupErrors(errors);
    this.form.setErrors(errors);
  }

  clearErrors(): void {
    this.#showGroupErrors({});
    this.form.clearErrors();
  }

  /** Move focus to the field at a JSON Pointer. Returns false when there is no visible field there. */
  focusField(pointer: string): boolean {
    const node = this.#nodes.get(pointer);
    if (!node?.visible) return false;
    node.focus();
    return true;
  }

  update(options: Partial<SchemaFormOptions>): void {
    const next = { ...this.#options, ...options };
    SchemaForm.#assert(next);
    const previous = this.#options;
    const current = this.getValue();
    this.#options = next;
    try {
      this.#render(options.value ?? current);
    } catch (error) {
      this.#options = previous;
      this.#render(current);
      throw error;
    }
    if (options.locale !== undefined) this.form.update({ locale: options.locale });
  }

  destroy(): void {
    this.#group.dispose();
    this.form.destroy();
    this.#root?.destroy();
    this.#root = null;
    this.#submit.destroy();
    this.#reset.destroy();
    this.host.classList.remove('aui-schema-form');
    this.host.replaceChildren();
  }

  static #assert(options: SchemaFormOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('SCHEMA_FORM_OPTIONS', 'Invalid schema form options.', { component: 'schema-form', property, expected });
    };
    if (!isObject(options)) fail('options', 'object');
    const issues = checkFormSchema(options.schema);
    if (issues.length > 0) {
      throw configurationError('SCHEMA_FORM_SCHEMA', `The schema uses unsupported or invalid keywords. ${describeIssues(issues)}`, {
        component: 'schema-form',
        property: `schema${issues[0]?.pointer ?? ''}`,
        expected: 'the supported JSON Schema subset (see the Schema Form docs)',
      });
    }
    const uiIssues = checkUiSchema(options.schema, options.uiSchema);
    if (uiIssues.length > 0) {
      throw configurationError('SCHEMA_FORM_UI_SCHEMA', `The UI schema is invalid. ${describeIssues(uiIssues)}`, { component: 'schema-form', property: `uiSchema${uiIssues[0]?.pointer ?? ''}`, expected: 'a UI schema that fits the schema' });
    }
    if (options.value !== undefined && !isObject(options.value)) fail('value', 'JSON object');
    for (const key of ['label', 'submitLabel'] as const) if (options[key] !== undefined && typeof options[key] !== 'string') fail(key, 'string');
    for (const key of ['showReset', 'disabled', 'showActions'] as const) if (options[key] !== undefined && typeof options[key] !== 'boolean') fail(key, 'boolean');
    if (options.validate !== undefined && typeof options.validate !== 'function') fail('validate', 'async function (value, signal) => Promise<SchemaFormErrors>');
    if (options.timezone !== undefined && typeof options.timezone !== 'string') fail('timezone', 'IANA time zone name');
  }

  #config(): Readonly<SchemaFormConfig & { locale: string }> {
    const o = this.#options;
    return schemaFormConfig.resolve(prune({ showActions: o.showActions, locale: o.locale }));
  }

  #render(value: JsonObject): void {
    const config = this.#config();
    const ctx: Ctx = {
      doc: this.#doc,
      locale: config.locale,
      options: this.#options,
      onStructure: () => {
        this.#reindex();
        this.#applyVisibility();
        emit(this.host, 'aui-change', { value: this.getValue(), pointer: null } satisfies SchemaFormChangeDetail);
      },
    };
    const o = this.#options;
    // Build the new tree before removing the old one, so a failing control leaves the form as it was.
    const root = new ObjectNode(ctx, '', '', o.schema, o.uiSchema ?? {}, o.label ?? o.schema.title ?? '', false, value, o.disabled === true, true);
    this.#root?.destroy();
    this.#root = root;
    this.#body.replaceChildren(root.el);
    this.#reindex();
    this.#groupErrors.clear();
    const label = o.label ?? o.schema.title;
    if (label) this.element.setAttribute('aria-label', label);
    else this.element.removeAttribute('aria-label');
    this.#renderActions();
    this.#applyVisibility();
  }

  #renderActions(): void {
    const config = this.#config();
    const o = this.#options;
    this.#actions.hidden = !config.showActions;
    this.#submit.element.textContent = o.submitLabel ?? getMessage('schemaForm', 'submit', {}, config.locale);
    this.#reset.element.textContent = getMessage('schemaForm', 'reset', {}, config.locale);
    this.#submit.update({ disabled: o.disabled === true });
    this.#reset.update({ disabled: o.disabled === true });
    this.#reset.element.hidden = o.showReset !== true;
  }

  #reindex(): void {
    this.#nodes.clear();
    const walk = (node: FieldNode): void => {
      this.#nodes.set(node.pointer, node);
      for (const child of node.children()) walk(child);
    };
    if (this.#root) walk(this.#root);
  }

  /** Value at an absolute pointer, honouring visibility (hidden fields are absent). */
  #valueAt(pointer: string): JsonValue | undefined {
    const node = this.#nodes.get(pointer);
    if (!node) return undefined;
    for (let p: string | undefined = pointer; p !== undefined && p !== ''; p = this.#nodes.get(p)?.parent) {
      if (this.#nodes.get(p)?.visible === false) return undefined;
    }
    return node.value();
  }

  #applyVisibility(): void {
    const enabled = this.#options.disabled !== true;
    const walk = (node: FieldNode, parentVisible: boolean): void => {
      for (const child of node.children()) {
        const condition = child.ui.visibleIf;
        const own = condition === undefined || evaluateCondition(condition, (field) => this.#valueAt(field.startsWith('/') ? field : childPointer(child.parent, field)));
        const visible = parentVisible && own;
        if (visible !== child.visible) {
          child.visible = visible;
          child.el.hidden = !visible;
          child.setEnabled(visible && enabled);
        }
        walk(child, visible);
      }
    };
    if (this.#root) walk(this.#root, true);
  }

  /** Array size rules the controls cannot check themselves. */
  #groupChecks(): Record<string, string> {
    const out: Record<string, string> = {};
    const locale = this.#config().locale;
    for (const node of this.#nodes.values()) {
      if (node.schema.type !== 'array' || this.#valueAt(node.pointer) === undefined) continue;
      const value = node.value();
      const n = Array.isArray(value) ? value.length : 0;
      const { minItems, maxItems } = node.schema;
      // Checkbox groups check their own bounds; lists and multi-selects are checked here.
      if (node.ui.widget === 'checkboxes') continue;
      if (minItems !== undefined && n < minItems) out[node.pointer] = getMessage('schemaForm', 'tooFew', { label: node.label, min: minItems }, locale);
      else if (maxItems !== undefined && n > maxItems) out[node.pointer] = getMessage('schemaForm', 'tooMany', { label: node.label, max: maxItems }, locale);
    }
    this.#showGroupErrors(out);
    return out;
  }

  async #validateGroups(signal: AbortSignal): Promise<Record<string, string>> {
    const groups = this.#groupChecks();
    if (Object.keys(groups).length > 0) return groups;
    const validate = this.#options.validate;
    if (!validate) return {};
    const errors = await validate(this.getValue(), signal);
    if (!isObject(errors)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(errors)) if (typeof v === 'string' && v !== '') out[k] = v;
    this.#showGroupErrors(out);
    return out;
  }

  #showGroupErrors(errors: SchemaFormErrors): void {
    for (const p of this.#groupErrors) if (!Object.hasOwn(errors, p)) this.#nodes.get(p)?.setGroupError(null);
    this.#groupErrors.clear();
    for (const [p, message] of Object.entries(errors)) {
      const node = this.#nodes.get(p);
      if (!node || (node.schema.type !== 'object' && node.schema.type !== 'array') || node === this.#root) continue;
      node.setGroupError(message);
      this.#groupErrors.add(p);
    }
  }
}
