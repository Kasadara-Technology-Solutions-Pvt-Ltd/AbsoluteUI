/**
 * Schema Form model (R20 P7): the supported JSON Schema subset (draft 2020-12 keywords), the UI schema,
 * visibility conditions, and the checks that reject everything else with a precise issue list. Shared by
 * Schema Form (renders) and Form Builder (edits and imports). No `eval`: conditions are plain JSON.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;

export type SchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
export type SchemaFormat = 'date' | 'date-time' | 'time' | 'email' | 'uri';

/** One choice of `oneOf`: a constant with a display title. */
export interface SchemaChoice {
  readonly const: JsonPrimitive;
  readonly title?: string;
  readonly description?: string;
}

/**
 * The supported JSON Schema subset. Anything else is reported by `checkFormSchema` as unsupported, so a
 * schema never renders with silently ignored rules.
 */
export interface FormSchema {
  readonly type: SchemaType;
  readonly title?: string;
  readonly description?: string;
  readonly default?: JsonValue;
  readonly enum?: readonly JsonPrimitive[];
  readonly oneOf?: readonly SchemaChoice[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  /** ECMAScript regular expression, unanchored (JSON Schema semantics); at most 500 characters. */
  readonly pattern?: string;
  readonly format?: SchemaFormat;
  readonly items?: FormSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly properties?: Readonly<Record<string, FormSchema>>;
  readonly required?: readonly string[];
  /** Only `false` is accepted (the form never produces other properties). */
  readonly additionalProperties?: false;
  readonly readOnly?: boolean;
  /** Annotations: accepted and ignored. */
  readonly $schema?: string;
  readonly $id?: string;
  readonly $comment?: string;
  readonly examples?: readonly JsonValue[];
}

export type SchemaWidget =
  | 'text'
  | 'password'
  | 'textarea'
  | 'richtext'
  | 'select'
  | 'radio'
  | 'combobox'
  | 'multiselect'
  | 'checkboxes'
  | 'checkbox'
  | 'switch'
  | 'number'
  | 'slider'
  | 'date'
  | 'datetime'
  | 'time'
  | 'group'
  | 'list';

/**
 * Visibility condition. `field` is a sibling property name, or an absolute JSON Pointer (`/a/b`) from
 * the root. Values compare by JSON equality. A hidden field is not validated and not part of the value.
 */
export type FormCondition =
  | { readonly field: string; readonly equals: JsonValue }
  | { readonly field: string; readonly notEquals: JsonValue }
  | { readonly field: string; readonly in: readonly JsonValue[] }
  | { readonly field: string; readonly filled: boolean }
  | { readonly all: readonly FormCondition[] }
  | { readonly any: readonly FormCondition[] }
  | { readonly not: FormCondition };

/** Presentation of one schema node. Children of an object are under `fields`, array items under `items`. */
export interface UiField {
  readonly widget?: SchemaWidget;
  /** Label instead of the schema title. */
  readonly label?: string;
  /** Help text instead of the schema description. */
  readonly help?: string;
  readonly placeholder?: string;
  /** Objects: property order (properties not listed follow in schema order). */
  readonly order?: readonly string[];
  /** Objects: number of grid columns (1 to 4; one column on narrow containers). */
  readonly columns?: number;
  /** Columns this field spans in its parent grid (1 to 4). */
  readonly span?: number;
  readonly visibleIf?: FormCondition;
  /** Textarea and rich text: visible rows (1 to 30). */
  readonly rows?: number;
  /** Radio and checkboxes: layout. */
  readonly orientation?: 'vertical' | 'horizontal';
  /** Date pickers: dates that are not working days cannot be picked (needs the `businessCalendar` option). */
  readonly disableNonWorking?: boolean;
  /** Arrays: text of the add button (default "Add {label}"). */
  readonly addLabel?: string;
  /** Message shown when `pattern` does not match. */
  readonly patternMessage?: string;
  readonly fields?: Readonly<Record<string, UiField>>;
  readonly items?: UiField;
}

/** A problem found in a schema or UI schema. `pointer` locates it (JSON Pointer into the checked document). */
export interface SchemaIssue {
  readonly pointer: string;
  readonly message: string;
}

const SCHEMA_KEYS = new Set([
  'type', 'title', 'description', 'default', 'enum', 'oneOf', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'format',
  'items', 'minItems', 'maxItems', 'properties', 'required', 'additionalProperties', 'readOnly', '$schema', '$id', '$comment', 'examples',
]);
const TYPES: readonly SchemaType[] = ['string', 'number', 'integer', 'boolean', 'object', 'array'];
const FORMATS: readonly SchemaFormat[] = ['date', 'date-time', 'time', 'email', 'uri'];
const BY_TYPE: Readonly<Record<string, readonly SchemaType[]>> = {
  minimum: ['number', 'integer'],
  maximum: ['number', 'integer'],
  minLength: ['string'],
  maxLength: ['string'],
  pattern: ['string'],
  format: ['string'],
  items: ['array'],
  minItems: ['array'],
  maxItems: ['array'],
  properties: ['object'],
  required: ['object'],
  additionalProperties: ['object'],
  enum: ['string', 'number', 'integer', 'boolean'],
  oneOf: ['string', 'number', 'integer', 'boolean'],
};
const UI_KEYS = new Set(['widget', 'label', 'help', 'placeholder', 'order', 'columns', 'span', 'visibleIf', 'rows', 'orientation', 'disableNonWorking', 'addLabel', 'patternMessage', 'fields', 'items']);
const WIDGETS: readonly SchemaWidget[] = ['text', 'password', 'textarea', 'richtext', 'select', 'radio', 'combobox', 'multiselect', 'checkboxes', 'checkbox', 'switch', 'number', 'slider', 'date', 'datetime', 'time', 'group', 'list'];
/** Limits that keep a schema renderable in one page. */
export const SCHEMA_LIMITS = Object.freeze({ depth: 8, fields: 500, choices: 500, pattern: 500, text: 2000 });

const esc = (token: string): string => token.replace(/~/g, '~0').replace(/\//g, '~1');
export const childPointer = (pointer: string, token: string | number): string => `${pointer}/${esc(String(token))}`;

export function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typeOfJson(value: unknown): SchemaType | 'null' | 'unknown' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isFinite(value) ? (Number.isInteger(value) ? 'integer' : 'number') : 'unknown';
  if (isObject(value)) return 'object';
  return 'unknown';
}

/** Whether a JSON value matches a schema type (integers are numbers too). */
export function matchesType(value: unknown, type: SchemaType): boolean {
  const t = typeOfJson(value);
  return t === type || (type === 'number' && t === 'integer');
}

/** Choices of an enum or oneOf node, or null. */
export function choicesOf(schema: FormSchema): readonly SchemaChoice[] | null {
  if (schema.oneOf) return schema.oneOf;
  if (schema.enum) return schema.enum.map((value) => ({ const: value }));
  return null;
}

/** Stable string key of a primitive choice (option values of the select-like controls). */
export function choiceKey(value: JsonPrimitive): string {
  return value === null ? '' : String(value);
}

/** JSON equality (object key order is ignored). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => Object.hasOwn(b, k) && jsonEqual(a[k], b[k]));
  }
  return false;
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/**
 * Check a schema against the supported subset. Returns every issue (empty when the schema renders as
 * written); `pointer` is the location in the schema document.
 */
export function checkFormSchema(schema: unknown): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  let fields = 0;
  const add = (pointer: string, message: string): void => {
    if (issues.length < 200) issues.push({ pointer, message });
  };
  const text = (node: Readonly<Record<string, unknown>>, key: string, p: string): void => {
    const v = node[key];
    if (v !== undefined && (typeof v !== 'string' || v.length > SCHEMA_LIMITS.text)) add(childPointer(p, key), `"${key}" must be a string of at most ${String(SCHEMA_LIMITS.text)} characters.`);
  };
  const walk = (node: unknown, p: string, depth: number): void => {
    if (!isObject(node)) {
      add(p, 'A schema must be an object.');
      return;
    }
    if (depth > SCHEMA_LIMITS.depth) {
      add(p, `Nesting deeper than ${String(SCHEMA_LIMITS.depth)} levels is not supported.`);
      return;
    }
    fields += 1;
    if (fields === SCHEMA_LIMITS.fields + 1) add(p, `More than ${String(SCHEMA_LIMITS.fields)} fields are not supported.`);
    for (const key of Object.keys(node)) {
      if (!SCHEMA_KEYS.has(key)) add(childPointer(p, key), `Unsupported keyword "${key}".`);
    }
    const type = node.type;
    if (typeof type !== 'string' || !(TYPES as readonly string[]).includes(type)) {
      add(childPointer(p, 'type'), `"type" is required and must be one of ${TYPES.join(', ')}.`);
      return;
    }
    const t = type as SchemaType;
    for (const [key, types] of Object.entries(BY_TYPE)) {
      if (node[key] !== undefined && !types.includes(t)) add(childPointer(p, key), `"${key}" does not apply to type "${t}".`);
    }
    for (const key of ['title', 'description', '$schema', '$id', '$comment']) text(node, key, p);
    if (node.readOnly !== undefined && typeof node.readOnly !== 'boolean') add(childPointer(p, 'readOnly'), '"readOnly" must be a boolean.');
    if (node.examples !== undefined && !Array.isArray(node.examples)) add(childPointer(p, 'examples'), '"examples" must be an array.');
    for (const key of ['minimum', 'maximum']) {
      const v = node[key];
      if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) add(childPointer(p, key), `"${key}" must be a finite number.`);
    }
    for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems']) {
      if (node[key] !== undefined && !isNonNegInt(node[key])) add(childPointer(p, key), `"${key}" must be a non-negative integer.`);
    }
    const pairs: readonly (readonly [string, string])[] = [['minimum', 'maximum'], ['minLength', 'maxLength'], ['minItems', 'maxItems']];
    for (const [lo, hi] of pairs) {
      const a = node[lo];
      const b = node[hi];
      if (typeof a === 'number' && typeof b === 'number' && a > b) add(childPointer(p, lo), `"${lo}" is greater than "${hi}".`);
    }
    if (node.pattern !== undefined) {
      if (typeof node.pattern !== 'string' || node.pattern.length > SCHEMA_LIMITS.pattern) add(childPointer(p, 'pattern'), `"pattern" must be a string of at most ${String(SCHEMA_LIMITS.pattern)} characters.`);
      else {
        try {
          new RegExp(node.pattern, 'u');
        } catch {
          add(childPointer(p, 'pattern'), '"pattern" is not a valid regular expression.');
        }
      }
    }
    if (node.format !== undefined && !(FORMATS as readonly unknown[]).includes(node.format)) add(childPointer(p, 'format'), `Unsupported format; supported: ${FORMATS.join(', ')}.`);
    // Choices.
    if (node.enum !== undefined && node.oneOf !== undefined) add(p, 'Use "enum" or "oneOf", not both.');
    let choiceValues: unknown[] | null = null;
    if (node.enum !== undefined) {
      if (!Array.isArray(node.enum) || node.enum.length === 0 || node.enum.length > SCHEMA_LIMITS.choices) add(childPointer(p, 'enum'), `"enum" must be a non-empty array (at most ${String(SCHEMA_LIMITS.choices)} values).`);
      else choiceValues = node.enum as unknown[];
    }
    if (node.oneOf !== undefined) {
      if (!Array.isArray(node.oneOf) || node.oneOf.length === 0 || node.oneOf.length > SCHEMA_LIMITS.choices) add(childPointer(p, 'oneOf'), `"oneOf" must be a non-empty array (at most ${String(SCHEMA_LIMITS.choices)} choices).`);
      else {
        choiceValues = [];
        (node.oneOf as unknown[]).forEach((c, i) => {
          const cp = childPointer(childPointer(p, 'oneOf'), i);
          if (!isObject(c) || !Object.hasOwn(c, 'const')) {
            add(cp, 'Each "oneOf" entry must be an object with "const" (and an optional "title"); other subschemas are not supported.');
            return;
          }
          for (const key of Object.keys(c)) if (!['const', 'title', 'description'].includes(key)) add(childPointer(cp, key), `Unsupported keyword "${key}" in a choice.`);
          text(c, 'title', cp);
          text(c, 'description', cp);
          choiceValues?.push(c.const);
        });
      }
    }
    if (choiceValues) {
      if (node.format !== undefined) add(childPointer(p, 'format'), '"format" cannot be combined with choices.');
      const keys = new Set<string>();
      choiceValues.forEach((v, i) => {
        const where = node.enum !== undefined ? childPointer(childPointer(p, 'enum'), i) : childPointer(childPointer(childPointer(p, 'oneOf'), i), 'const');
        if (!matchesType(v, t)) {
          add(where, `Choice does not match type "${t}".`);
          return;
        }
        const key = choiceKey(v as JsonPrimitive);
        if (keys.has(key)) add(where, 'Duplicate choice.');
        keys.add(key);
      });
    }
    // Containers.
    if (t === 'object') {
      const props = node.properties;
      if (props !== undefined && !isObject(props)) add(childPointer(p, 'properties'), '"properties" must be an object.');
      const names = isObject(props) ? Object.keys(props) : [];
      if (isObject(props)) {
        for (const name of names) {
          if (name === '') add(childPointer(p, 'properties'), 'Property names must not be empty.');
          walk(props[name], childPointer(childPointer(p, 'properties'), name), depth + 1);
        }
      }
      if (node.required !== undefined) {
        if (!Array.isArray(node.required) || node.required.some((r) => typeof r !== 'string')) add(childPointer(p, 'required'), '"required" must be an array of property names.');
        else {
          (node.required as string[]).forEach((r, i) => {
            if (!names.includes(r)) add(childPointer(childPointer(p, 'required'), i), `"${r}" is not a property.`);
          });
        }
      }
      if (node.additionalProperties !== undefined && node.additionalProperties !== false) add(childPointer(p, 'additionalProperties'), 'Only "additionalProperties": false is supported.');
    }
    if (t === 'array') {
      if (node.items === undefined) add(p, 'Arrays need "items".');
      else if (isObject(node.items) && node.items.type === 'array') add(childPointer(p, 'items'), 'Arrays of arrays are not supported.');
      else walk(node.items, childPointer(p, 'items'), depth + 1);
    }
    if (node.default !== undefined && !matchesType(node.default, t)) add(childPointer(p, 'default'), `"default" does not match type "${t}".`);
    if (depth === 0 && t !== 'object') add(childPointer(p, 'type'), 'The root schema must be of type "object".');
  };
  walk(schema, '', 0);
  return issues;
}

/** Widgets each kind of node accepts (the first is the default). */
export function widgetsFor(schema: FormSchema): readonly SchemaWidget[] {
  const choices = choicesOf(schema) !== null;
  switch (schema.type) {
    case 'string':
      if (choices) return ['select', 'radio', 'combobox'];
      if (schema.format === 'date') return ['date'];
      if (schema.format === 'date-time') return ['datetime'];
      if (schema.format === 'time') return ['time'];
      if (schema.format === 'email' || schema.format === 'uri') return ['text'];
      return ['text', 'textarea', 'richtext', 'password'];
    case 'number':
    case 'integer':
      return choices ? ['select', 'radio', 'combobox'] : ['number', 'slider'];
    case 'boolean':
      return ['checkbox', 'switch'];
    case 'object':
      return ['group'];
    case 'array': {
      const items = schema.items;
      if (items && choicesOf(items) !== null && items.type !== 'object') return ['multiselect', 'checkboxes'];
      return ['list'];
    }
  }
}

/** Every pointer to a field (not the root) in schema order, for condition targets and editors. */
export function fieldPointers(schema: FormSchema, base = ''): string[] {
  const out: string[] = [];
  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    const p = childPointer(base, name);
    out.push(p);
    if (child.type === 'object') out.push(...fieldPointers(child, p));
  }
  return out;
}

/** Check a UI schema against a (valid) schema. `pointer` locates the problem in the UI schema. */
export function checkUiSchema(schema: FormSchema, ui: unknown): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const add = (pointer: string, message: string): void => {
    if (issues.length < 200) issues.push({ pointer, message });
  };
  const checkCondition = (c: unknown, p: string, siblings: readonly string[], depth: number): void => {
    if (!isObject(c) || depth > 6) {
      add(p, 'A condition must be an object (nested at most 6 levels).');
      return;
    }
    const keys = Object.keys(c);
    if (Object.hasOwn(c, 'all') || Object.hasOwn(c, 'any')) {
      const key = Object.hasOwn(c, 'all') ? 'all' : 'any';
      const list = c[key];
      if (keys.length !== 1 || !Array.isArray(list) || list.length === 0) add(p, `"${key}" must be the only key and hold a non-empty array of conditions.`);
      else list.forEach((x, i) => {
        checkCondition(x, childPointer(childPointer(p, key), i), siblings, depth + 1);
      });
      return;
    }
    if (Object.hasOwn(c, 'not')) {
      if (keys.length !== 1) add(p, '"not" must be the only key.');
      else checkCondition(c.not, childPointer(p, 'not'), siblings, depth + 1);
      return;
    }
    const field = c.field;
    const ops = keys.filter((k) => k !== 'field');
    if (typeof field !== 'string' || field === '') add(childPointer(p, 'field'), '"field" must be a property name or a JSON Pointer.');
    else if (field.startsWith('/') ? !fieldPointers(schema).includes(field) : !siblings.includes(field)) add(childPointer(p, 'field'), `Unknown field "${field}".`);
    if (ops.length !== 1 || !['equals', 'notEquals', 'in', 'filled'].includes(ops[0] ?? '')) {
      add(p, 'A condition needs exactly one of "equals", "notEquals", "in", "filled".');
      return;
    }
    if (ops[0] === 'in' && !Array.isArray(c.in)) add(childPointer(p, 'in'), '"in" must be an array.');
    if (ops[0] === 'filled' && typeof c.filled !== 'boolean') add(childPointer(p, 'filled'), '"filled" must be a boolean.');
  };
  const walk = (node: FormSchema, u: unknown, p: string, siblings: readonly string[]): void => {
    if (u === undefined) return;
    if (!isObject(u)) {
      add(p, 'A UI entry must be an object.');
      return;
    }
    for (const key of Object.keys(u)) if (!UI_KEYS.has(key)) add(childPointer(p, key), `Unsupported UI key "${key}".`);
    if (u.widget !== undefined) {
      if (!(WIDGETS as readonly unknown[]).includes(u.widget)) add(childPointer(p, 'widget'), `Unknown widget; supported: ${WIDGETS.join(', ')}.`);
      else if (!widgetsFor(node).includes(u.widget as SchemaWidget)) add(childPointer(p, 'widget'), `Widget "${typeof u.widget === 'string' ? u.widget : ''}" does not fit this field; use ${widgetsFor(node).join(' or ')}.`);
      else if (u.widget === 'slider' && (node.minimum === undefined || node.maximum === undefined)) add(childPointer(p, 'widget'), 'The slider needs "minimum" and "maximum" in the schema.');
    }
    for (const key of ['label', 'help', 'placeholder', 'addLabel', 'patternMessage']) {
      const v = u[key];
      if (v !== undefined && (typeof v !== 'string' || v.length > SCHEMA_LIMITS.text)) add(childPointer(p, key), `"${key}" must be a string.`);
    }
    const intIn = (key: string, lo: number, hi: number): void => {
      const v = u[key];
      if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi)) add(childPointer(p, key), `"${key}" must be an integer from ${String(lo)} to ${String(hi)}.`);
    };
    intIn('columns', 1, 4);
    intIn('span', 1, 4);
    intIn('rows', 1, 30);
    if (u.orientation !== undefined && u.orientation !== 'vertical' && u.orientation !== 'horizontal') add(childPointer(p, 'orientation'), '"orientation" must be "vertical" or "horizontal".');
    if (u.disableNonWorking !== undefined && typeof u.disableNonWorking !== 'boolean') add(childPointer(p, 'disableNonWorking'), '"disableNonWorking" must be a boolean.');
    if (u.visibleIf !== undefined) checkCondition(u.visibleIf, childPointer(p, 'visibleIf'), siblings, 0);
    const names = Object.keys(node.properties ?? {});
    if (u.order !== undefined) {
      if (node.type !== 'object') add(childPointer(p, 'order'), '"order" applies to objects only.');
      else if (!Array.isArray(u.order) || u.order.some((n) => typeof n !== 'string' || !names.includes(n))) add(childPointer(p, 'order'), '"order" must list property names of this object.');
    }
    if (u.columns !== undefined && node.type !== 'object') add(childPointer(p, 'columns'), '"columns" applies to objects only.');
    if (u.fields !== undefined) {
      if (node.type !== 'object' || !isObject(u.fields)) add(childPointer(p, 'fields'), '"fields" applies to objects and must be an object.');
      else {
        for (const [name, child] of Object.entries(u.fields)) {
          const sub = node.properties?.[name];
          if (!sub) add(childPointer(childPointer(p, 'fields'), name), `"${name}" is not a property.`);
          else walk(sub, child, childPointer(childPointer(p, 'fields'), name), names);
        }
      }
    }
    if (u.items !== undefined) {
      if (node.type !== 'array' || !node.items) add(childPointer(p, 'items'), '"items" applies to arrays only.');
      else walk(node.items, u.items, childPointer(p, 'items'), []);
    }
  };
  walk(schema, ui ?? {}, '', []);
  return issues;
}

/** Whether a value is a schema in the supported subset (no issues). */
export function isFormSchema(value: unknown): value is FormSchema {
  return checkFormSchema(value).length === 0;
}

/** Whether a value is a valid UI schema for `schema`. */
export function isUiSchema(schema: FormSchema, value: unknown): value is UiField {
  return checkUiSchema(schema, value).length === 0;
}

/** Evaluate a condition. `read` returns the current value at an absolute pointer (undefined when absent or hidden). */
export function evaluateCondition(condition: FormCondition, resolve: (field: string) => JsonValue | undefined): boolean {
  if ('all' in condition) return condition.all.every((c) => evaluateCondition(c, resolve));
  if ('any' in condition) return condition.any.some((c) => evaluateCondition(c, resolve));
  if ('not' in condition) return !evaluateCondition(condition.not, resolve);
  const value = resolve(condition.field);
  if ('equals' in condition) return jsonEqual(value, condition.equals);
  if ('notEquals' in condition) return !jsonEqual(value, condition.notEquals);
  if ('in' in condition) return condition.in.some((v) => jsonEqual(v, value));
  const filled = value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);
  return filled === condition.filled;
}

/** Format issues for an error message (first five). */
export function describeIssues(issues: readonly SchemaIssue[]): string {
  const head = issues.slice(0, 5).map((i) => `${i.pointer === '' ? '(root)' : i.pointer}: ${i.message}`).join(' ');
  return issues.length > 5 ? `${head} (+${String(issues.length - 5)} more)` : head;
}
