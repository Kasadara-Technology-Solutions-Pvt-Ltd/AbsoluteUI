/**
 * JSON Schema 2020-12 validator for the subset of keywords this server's own schemas use (R15-4: no
 * third-party validator). Schemas are checked once at registration (`assertSupportedSchema`), so an
 * unsupported keyword fails loudly instead of being ignored. Instances are untrusted tool arguments.
 * References are local only (`#/$defs/<name>`); the tests also use this validator on the official MCP schemas.
 */
import { isJsonObject, type JsonObject, type JsonValue } from './jsonrpc.js';

const ASSERTIONS = new Set([
  'type', 'enum', 'const',
  'properties', 'required', 'additionalProperties',
  'items', 'minItems', 'maxItems', 'uniqueItems',
  'minLength', 'maxLength', 'pattern',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'anyOf', 'oneOf', 'allOf',
]);
const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', 'default', 'examples', 'deprecated', 'readOnly', 'writeOnly', 'format']);
const LOCAL_REF = /^#\/\$defs\/([A-Za-z0-9_.-]+)$/;
const TYPES = new Set(['null', 'boolean', 'object', 'array', 'number', 'integer', 'string']);

/** Maximum nesting depth of a validated instance (bounded recursion over untrusted input). */
export const MAX_INSTANCE_DEPTH = 64;

export interface SchemaError {
  /** JSON Pointer of the offending value ('' is the root). */
  readonly path: string;
  readonly message: string;
}

function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

/** Length in Unicode code points, as JSON Schema counts it. */
function codePointLength(text: string): number {
  let length = 0;
  for (let i = 0; i < text.length; i++) {
    const high = text.charCodeAt(i);
    if (high >= 0xd800 && high <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) i++;
    }
    length++;
  }
  return length;
}

const patternCache = new Map<string, RegExp>();
function compiled(pattern: string): RegExp {
  let re = patternCache.get(pattern);
  if (!re) {
    // Patterns come only from this package's own schemas, never from input.
    re = new RegExp(pattern, 'u');
    patternCache.set(pattern, re);
  }
  return re;
}

/** Throws if the schema uses a keyword or value this validator does not implement. */
export function assertSupportedSchema(schema: JsonValue, at = '#'): void {
  if (typeof schema === 'boolean') return;
  if (!isJsonObject(schema)) throw new Error(`Schema at ${at} must be an object or a boolean.`);
  for (const [key, value] of Object.entries(schema)) {
    if (ANNOTATIONS.has(key)) continue;
    if (key === '$defs') {
      if (!isJsonObject(value)) throw new Error(`Schema at ${at}: "$defs" must be an object.`);
      for (const [name, sub] of Object.entries(value)) assertSupportedSchema(sub, `${at}/$defs/${name}`);
      continue;
    }
    if (key === '$ref') {
      if (typeof value !== 'string' || !LOCAL_REF.test(value)) throw new Error(`Schema at ${at}: only local references of the form #/$defs/<name> are supported.`);
      continue;
    }
    if (!ASSERTIONS.has(key)) throw new Error(`Schema at ${at} uses the unsupported keyword "${key}".`);
    switch (key) {
      case 'type': {
        const list = isJsonArray(value) ? value : [value];
        for (const t of list) if (typeof t !== 'string' || !TYPES.has(t)) throw new Error(`Schema at ${at}: unknown type ${JSON.stringify(t)}.`);
        break;
      }
      case 'properties':
        if (!isJsonObject(value)) throw new Error(`Schema at ${at}: "properties" must be an object.`);
        for (const [name, sub] of Object.entries(value)) assertSupportedSchema(sub, `${at}/properties/${name}`);
        break;
      case 'additionalProperties':
      case 'items':
        assertSupportedSchema(value, `${at}/${key}`);
        break;
      case 'anyOf':
      case 'oneOf':
      case 'allOf':
        if (!isJsonArray(value) || value.length === 0) throw new Error(`Schema at ${at}: "${key}" must be a non-empty array.`);
        value.forEach((sub, i) => { assertSupportedSchema(sub, `${at}/${key}/${i}`); });
        break;
      case 'required':
        if (!isJsonArray(value) || !value.every((v) => typeof v === 'string')) throw new Error(`Schema at ${at}: "required" must be an array of strings.`);
        break;
      case 'enum':
        if (!isJsonArray(value)) throw new Error(`Schema at ${at}: "enum" must be an array.`);
        break;
      case 'pattern':
        if (typeof value !== 'string') throw new Error(`Schema at ${at}: "pattern" must be a string.`);
        compiled(value);
        break;
      case 'const':
      case 'uniqueItems':
        break;
      default:
        if (typeof value !== 'number') throw new Error(`Schema at ${at}: "${key}" must be a number.`);
    }
  }
}

function typeOf(value: JsonValue): string {
  if (value === null) return 'null';
  if (isJsonArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function matchesType(value: JsonValue, type: string): boolean {
  const actual = typeOf(value);
  return actual === type || (type === 'number' && actual === 'integer');
}

/** Structural equality of JSON values (for `enum`, `const`, `uniqueItems`). */
export function jsonEqual(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (isJsonArray(a) || isJsonArray(b)) {
    if (!isJsonArray(a) || !isJsonArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => jsonEqual(v, b[i] as JsonValue));
  }
  if (isJsonObject(a) && isJsonObject(b)) {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => k in b && jsonEqual(a[k] as JsonValue, b[k] as JsonValue));
  }
  return false;
}

function pointer(path: string, key: string | number): string {
  return `${path}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

function describe(value: JsonValue): string {
  const text = JSON.stringify(value);
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

function validateAt(schema: JsonValue, value: JsonValue, path: string, depth: number, errors: SchemaError[], root: JsonValue): void {
  if (schema === true) return;
  if (schema === false) {
    errors.push({ path, message: 'is not allowed' });
    return;
  }
  if (!isJsonObject(schema)) return;
  const ref = schema.$ref;
  if (typeof ref === 'string') {
    const name = LOCAL_REF.exec(ref)?.[1];
    const defs = isJsonObject(root) ? root.$defs : undefined;
    const target = name !== undefined && isJsonObject(defs) ? defs[name] : undefined;
    if (target === undefined) errors.push({ path, message: `refers to the missing schema ${ref}` });
    else if (depth >= MAX_INSTANCE_DEPTH) errors.push({ path, message: `is nested deeper than ${MAX_INSTANCE_DEPTH} levels` });
    else validateAt(target, value, path, depth + 1, errors, root);
  }
  if (depth > MAX_INSTANCE_DEPTH) {
    errors.push({ path, message: `is nested deeper than ${MAX_INSTANCE_DEPTH} levels` });
    return;
  }
  const type = schema.type;
  if (type !== undefined) {
    const list = (isJsonArray(type) ? type : [type]) as readonly string[];
    if (!list.some((t) => matchesType(value, t))) {
      errors.push({ path, message: `must be of type ${list.join(' or ')}` });
      return;
    }
  }
  const enumValues = schema.enum;
  if (isJsonArray(enumValues) && !enumValues.some((e) => jsonEqual(e, value))) {
    errors.push({ path, message: `must be one of ${enumValues.map((e) => JSON.stringify(e)).join(', ')}` });
  }
  if ('const' in schema && !jsonEqual(schema.const, value)) {
    errors.push({ path, message: `must be ${JSON.stringify(schema.const)}` });
  }
  if (typeof value === 'string') {
    const length = codePointLength(value);
    const min = schema.minLength;
    const max = schema.maxLength;
    if (typeof min === 'number' && length < min) errors.push({ path, message: `must have at least ${min} characters` });
    if (typeof max === 'number' && length > max) errors.push({ path, message: `must have at most ${max} characters` });
    const pattern = schema.pattern;
    if (typeof pattern === 'string' && !compiled(pattern).test(value)) errors.push({ path, message: `must match the pattern ${pattern}` });
  }
  if (typeof value === 'number') {
    const checks: readonly [string, (limit: number) => boolean, string][] = [
      ['minimum', (l) => value >= l, 'at least'],
      ['maximum', (l) => value <= l, 'at most'],
      ['exclusiveMinimum', (l) => value > l, 'greater than'],
      ['exclusiveMaximum', (l) => value < l, 'less than'],
    ];
    for (const [key, ok, words] of checks) {
      const limit = schema[key];
      if (typeof limit === 'number' && !ok(limit)) errors.push({ path, message: `must be ${words} ${limit}` });
    }
  }
  if (isJsonArray(value)) {
    const min = schema.minItems;
    const max = schema.maxItems;
    if (typeof min === 'number' && value.length < min) errors.push({ path, message: `must have at least ${min} items` });
    if (typeof max === 'number' && value.length > max) {
      // Do not descend into an oversized array.
      errors.push({ path, message: `must have at most ${max} items` });
      return;
    }
    if (schema.uniqueItems === true) {
      for (let i = 1; i < value.length; i++) {
        if (value.slice(0, i).some((earlier) => jsonEqual(earlier, value[i] as JsonValue))) {
          errors.push({ path: pointer(path, i), message: 'duplicates an earlier item' });
          break;
        }
      }
    }
    const items = schema.items;
    if (items !== undefined) value.forEach((item, i) => { validateAt(items, item, pointer(path, i), depth + 1, errors, root); });
  }
  if (isJsonObject(value)) {
    const properties = isJsonObject(schema.properties) ? schema.properties : {};
    const required = schema.required;
    if (isJsonArray(required)) {
      for (const name of required) if (typeof name === 'string' && !(name in value)) errors.push({ path, message: `must have the property "${name}"` });
    }
    const additional = schema.additionalProperties;
    for (const [name, child] of Object.entries(value)) {
      const sub = properties[name];
      if (sub !== undefined) validateAt(sub, child, pointer(path, name), depth + 1, errors, root);
      else if (additional === false) errors.push({ path, message: `must not have the property ${describe(name)}` });
      else if (additional !== undefined) validateAt(additional, child, pointer(path, name), depth + 1, errors, root);
    }
  }
  const allOf = schema.allOf;
  if (isJsonArray(allOf)) for (const sub of allOf) validateAt(sub, value, path, depth + 1, errors, root);
  for (const key of ['anyOf', 'oneOf'] as const) {
    const list = schema[key];
    if (!isJsonArray(list)) continue;
    const passing = list.filter((sub) => validate(sub, value, depth + 1, root).length === 0).length;
    if (key === 'anyOf' && passing === 0) errors.push({ path, message: 'must match at least one allowed form' });
    if (key === 'oneOf' && passing !== 1) errors.push({ path, message: 'must match exactly one allowed form' });
  }
}

/** Validates an instance; returns no errors when it conforms. */
export function validate(schema: JsonValue, value: JsonValue, depth = 0, root: JsonValue = schema): readonly SchemaError[] {
  const errors: SchemaError[] = [];
  validateAt(schema, value, '', depth, errors, root);
  return errors;
}

/** Formats errors as one actionable sentence for an `isError` tool result. */
export function formatErrors(errors: readonly SchemaError[], subject = 'arguments'): string {
  const shown = errors.slice(0, 5).map((e) => `${e.path === '' ? subject : `${subject}${e.path}`} ${e.message}`);
  const more = errors.length > 5 ? ` (and ${errors.length - 5} more)` : '';
  return `Invalid ${subject}: ${shown.join('; ')}${more}.`;
}

export type { JsonObject };
