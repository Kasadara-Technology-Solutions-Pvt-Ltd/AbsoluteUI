/**
 * Form Builder document model (R20 P7): field types of the palette, how a schema node maps back to a
 * type, and immutable edits of the `{ schema, uiSchema }` document Schema Form renders.
 */
import type { IconRef } from '@absoluteui/icons';
import { calendarClockIcon } from '@absoluteui/icons/set/calendar-clock';
import { checkboxIcon } from '@absoluteui/icons/set/checkbox';
import { hashIcon } from '@absoluteui/icons/set/hash';
import { listChecksIcon } from '@absoluteui/icons/set/list-checks';
import { mailIcon } from '@absoluteui/icons/set/mail';
import { radioIcon } from '@absoluteui/icons/set/radio';
import { sliderIcon } from '@absoluteui/icons/set/slider';
import { textIcon } from '@absoluteui/icons/set/text';
import { textInputIcon } from '@absoluteui/icons/set/text-input';
import { toggleIcon } from '@absoluteui/icons/set/toggle';
import { choicesOf, type FormCondition, type FormSchema, type SchemaChoice, type UiField } from '../schema-form/schema.js';

export type FormBuilderFieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'email'
  | 'url'
  | 'number'
  | 'integer'
  | 'slider'
  | 'select'
  | 'radio'
  | 'combobox'
  | 'multiselect'
  | 'checkboxes'
  | 'checkbox'
  | 'switch'
  | 'date'
  | 'datetime'
  | 'time';

/** The schema and UI schema a builder edits (what Schema Form renders). */
export interface FormBuilderValue {
  readonly schema: FormSchema;
  readonly uiSchema: UiField;
}

const CHOICES: readonly SchemaChoice[] = [
  { const: 'option-1', title: 'Option 1' },
  { const: 'option-2', title: 'Option 2' },
  { const: 'option-3', title: 'Option 3' },
];

interface FieldTemplate {
  readonly schema: FormSchema;
  readonly ui?: UiField;
  readonly icon: IconRef;
}

export const FIELD_TYPES: readonly FormBuilderFieldType[] = ['text', 'textarea', 'richtext', 'email', 'url', 'number', 'integer', 'slider', 'select', 'radio', 'combobox', 'multiselect', 'checkboxes', 'checkbox', 'switch', 'date', 'datetime', 'time'];

export const TEMPLATES: Readonly<Record<FormBuilderFieldType, FieldTemplate>> = {
  text: { schema: { type: 'string' }, icon: textInputIcon },
  textarea: { schema: { type: 'string' }, ui: { widget: 'textarea' }, icon: textIcon },
  richtext: { schema: { type: 'string' }, ui: { widget: 'richtext' }, icon: 'bold' },
  email: { schema: { type: 'string', format: 'email' }, icon: mailIcon },
  url: { schema: { type: 'string', format: 'uri' }, icon: 'link' },
  number: { schema: { type: 'number' }, icon: hashIcon },
  integer: { schema: { type: 'integer' }, icon: hashIcon },
  slider: { schema: { type: 'integer', minimum: 0, maximum: 10 }, ui: { widget: 'slider' }, icon: sliderIcon },
  select: { schema: { type: 'string', oneOf: CHOICES }, icon: 'list-bulleted' },
  radio: { schema: { type: 'string', oneOf: CHOICES }, ui: { widget: 'radio' }, icon: radioIcon },
  combobox: { schema: { type: 'string', oneOf: CHOICES }, ui: { widget: 'combobox' }, icon: 'search' },
  multiselect: { schema: { type: 'array', items: { type: 'string', oneOf: CHOICES } }, icon: listChecksIcon },
  checkboxes: { schema: { type: 'array', items: { type: 'string', oneOf: CHOICES } }, ui: { widget: 'checkboxes' }, icon: checkboxIcon },
  checkbox: { schema: { type: 'boolean' }, icon: checkboxIcon },
  switch: { schema: { type: 'boolean' }, ui: { widget: 'switch' }, icon: toggleIcon },
  date: { schema: { type: 'string', format: 'date' }, icon: 'calendar' },
  datetime: { schema: { type: 'string', format: 'date-time' }, icon: calendarClockIcon },
  time: { schema: { type: 'string', format: 'time' }, icon: 'clock' },
};

/** The palette type of a field, or `group` / `list` for nested objects and arrays the builder keeps as they are. */
export function kindOf(schema: FormSchema, ui: UiField): FormBuilderFieldType | 'group' | 'list' {
  const w = ui.widget;
  switch (schema.type) {
    case 'object':
      return 'group';
    case 'boolean':
      return w === 'switch' ? 'switch' : 'checkbox';
    case 'array':
      if (schema.items && schema.items.type !== 'object' && choicesOf(schema.items)) return w === 'checkboxes' ? 'checkboxes' : 'multiselect';
      return 'list';
    case 'number':
    case 'integer':
      if (choicesOf(schema)) return w === 'radio' ? 'radio' : w === 'combobox' ? 'combobox' : 'select';
      if (w === 'slider') return 'slider';
      return schema.type;
    case 'string':
      if (choicesOf(schema)) return w === 'radio' ? 'radio' : w === 'combobox' ? 'combobox' : 'select';
      if (schema.format === 'date') return 'date';
      if (schema.format === 'date-time') return 'datetime';
      if (schema.format === 'time') return 'time';
      if (schema.format === 'email') return 'email';
      if (schema.format === 'uri') return 'url';
      return w === 'textarea' ? 'textarea' : w === 'richtext' ? 'richtext' : 'text';
  }
}

/** Property names in display order (UI order first, then schema order). */
export function fieldOrder(doc: FormBuilderValue): string[] {
  const names = Object.keys(doc.schema.properties ?? {});
  const listed = (doc.uiSchema.order ?? []).filter((n) => names.includes(n));
  return [...listed, ...names.filter((n) => !listed.includes(n))];
}

/** Drop undefined values and empty UI entries. */
function clean<T extends object>(o: T): T {
  const out = { ...o };
  for (const key in out) if (out[key] === undefined) Reflect.deleteProperty(out, key);
  return out;
}

/** A patch: a value sets the key, `undefined` removes it. */
export type Patch<T> = { readonly [K in keyof T]?: T[K] | undefined };

function patched<T extends object>(base: T, patch: Patch<T>): T {
  return clean({ ...base, ...patch });
}

function withUiFields(ui: UiField, fields: Readonly<Record<string, UiField>>): UiField {
  const entries = Object.entries(fields).filter(([, f]) => Object.keys(f).length > 0);
  return patched(ui, { fields: entries.length > 0 ? Object.fromEntries(entries) : undefined });
}

/** Insert a field at `index` (end by default). */
export function insertField(doc: FormBuilderValue, name: string, schema: FormSchema, ui: UiField, index?: number): FormBuilderValue {
  const order = fieldOrder(doc);
  order.splice(index === undefined ? order.length : Math.max(0, Math.min(order.length, index)), 0, name);
  return {
    schema: { ...doc.schema, type: 'object', properties: { ...(doc.schema.properties ?? {}), [name]: schema } },
    uiSchema: withUiFields(clean({ ...doc.uiSchema, order }), { ...(doc.uiSchema.fields ?? {}), [name]: ui }),
  };
}

/** Remove a field, its required entry, its UI entry, and conditions that refer to it. */
export function removeField(doc: FormBuilderValue, name: string): FormBuilderValue {
  const properties = Object.fromEntries(Object.entries(doc.schema.properties ?? {}).filter(([k]) => k !== name));
  const required = (doc.schema.required ?? []).filter((r) => r !== name);
  const fields = Object.fromEntries(Object.entries(doc.uiSchema.fields ?? {}).filter(([k]) => k !== name).map(([k, f]) => [k, dropConditionOn(f, name)] as const));
  return {
    schema: patched(doc.schema, { properties, required: required.length > 0 ? required : undefined }),
    uiSchema: withUiFields(clean({ ...doc.uiSchema, order: fieldOrder(doc).filter((n) => n !== name) }), fields),
  };
}

function refersTo(c: FormCondition, name: string): boolean {
  if ('all' in c) return c.all.some((x) => refersTo(x, name));
  if ('any' in c) return c.any.some((x) => refersTo(x, name));
  if ('not' in c) return refersTo(c.not, name);
  return c.field === name || c.field === `/${name}`;
}

function dropConditionOn(ui: UiField, name: string): UiField {
  return ui.visibleIf !== undefined && refersTo(ui.visibleIf, name) ? patched(ui, { visibleIf: undefined }) : ui;
}

function renameIn(c: FormCondition, from: string, to: string): FormCondition {
  if ('all' in c) return { all: c.all.map((x) => renameIn(x, from, to)) };
  if ('any' in c) return { any: c.any.map((x) => renameIn(x, from, to)) };
  if ('not' in c) return { not: renameIn(c.not, from, to) };
  if (c.field === from) return { ...c, field: to };
  if (c.field === `/${from}`) return { ...c, field: `/${to}` };
  return c;
}

/** Rename a field everywhere: properties (order kept), required, UI order and entries, conditions. */
export function renameField(doc: FormBuilderValue, from: string, to: string): FormBuilderValue {
  const properties = Object.fromEntries(Object.entries(doc.schema.properties ?? {}).map(([k, v]) => [k === from ? to : k, v] as const));
  const required = doc.schema.required?.map((r) => (r === from ? to : r));
  const fields = Object.fromEntries(Object.entries(doc.uiSchema.fields ?? {}).map(([k, f]) => [k === from ? to : k, f.visibleIf ? { ...f, visibleIf: renameIn(f.visibleIf, from, to) } : f] as const));
  return {
    schema: patched(doc.schema, { properties, required }),
    uiSchema: withUiFields(clean({ ...doc.uiSchema, order: fieldOrder(doc).map((n) => (n === from ? to : n)) }), fields),
  };
}

export function reorderFields(doc: FormBuilderValue, order: readonly string[]): FormBuilderValue {
  return { schema: doc.schema, uiSchema: clean({ ...doc.uiSchema, order: [...order] }) };
}

/** Change one field's schema and UI entry (`undefined` in a patch removes the key). */
export function patchField(doc: FormBuilderValue, name: string, schema: Patch<FormSchema>, ui: Patch<UiField>): FormBuilderValue {
  const current = doc.schema.properties?.[name];
  if (!current) return doc;
  const fields = doc.uiSchema.fields ?? {};
  return {
    schema: { ...doc.schema, properties: { ...(doc.schema.properties ?? {}), [name]: patched(current, schema) } },
    uiSchema: withUiFields(doc.uiSchema, { ...fields, [name]: patched(fields[name] ?? {}, ui) }),
  };
}

export function setRequired(doc: FormBuilderValue, name: string, required: boolean): FormBuilderValue {
  const list = (doc.schema.required ?? []).filter((r) => r !== name);
  if (required) list.push(name);
  return { schema: patched(doc.schema, { required: list.length > 0 ? list : undefined }), uiSchema: doc.uiSchema };
}

export function patchForm(doc: FormBuilderValue, schema: Patch<FormSchema>, ui: Patch<UiField>): FormBuilderValue {
  return { schema: patched(doc.schema, schema), uiSchema: patched(doc.uiSchema, ui) };
}

/** A unique property name such as `text3`. */
export function uniqueName(doc: FormBuilderValue, base: string): string {
  const taken = new Set(Object.keys(doc.schema.properties ?? {}));
  for (let i = 1; ; i += 1) {
    const name = `${base}${String(i)}`;
    if (!taken.has(name)) return name;
  }
}

/** Parse "value = Label" lines (a line without "=" uses the text as both). */
export function parseChoices(text: string, numeric: boolean): SchemaChoice[] | string {
  const out: SchemaChoice[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const i = line.indexOf('=');
    const valueText = (i < 0 ? line : line.slice(0, i)).trim();
    const title = (i < 0 ? line : line.slice(i + 1)).trim();
    if (valueText === '') return line;
    const value = numeric ? Number(valueText) : valueText;
    if (numeric && !Number.isFinite(value)) return line;
    out.push(title === '' || title === valueText ? { const: value } : { const: value, title });
  }
  return out;
}

export function formatChoices(choices: readonly SchemaChoice[]): string {
  return choices.map((c) => (c.title === undefined ? String(c.const) : `${String(c.const)} = ${c.title}`)).join('\n');
}
