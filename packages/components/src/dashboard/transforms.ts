/**
 * Declarative data transforms and input mapping (R18-7). No expressions: a fixed set of operations on
 * arrays of records, plus named transforms the application registers in code. Field access reads own
 * properties only, so prototype members are never reached.
 */
import { getByPointer } from '@absoluteui/helpers/json';
import { WIDGET_TYPE_PATTERN, type AggregateSpec, type JsonObject, type JsonValue, type Transform } from './definition.js';
import { configurationError } from '@absoluteui/core';

/** A transform registered in code: receives the current data and its JSON options. */
export type CustomTransform = (data: unknown, options: JsonObject) => unknown;

export class TransformRegistry {
  readonly #map = new Map<string, CustomTransform>();
  register(name: string, fn: CustomTransform): void {
    if (!new RegExp(WIDGET_TYPE_PATTERN).test(name) || typeof fn !== 'function') {
      throw configurationError('DASHBOARD_TRANSFORM', 'Invalid custom transform.', { component: 'dashboard', property: 'registerTransform', expected: `name matching ${WIDGET_TYPE_PATTERN} and a function` });
    }
    this.#map.set(name, fn);
  }
  get(name: string): CustomTransform | undefined {
    return this.#map.get(name);
  }
  names(): string[] {
    return [...this.#map.keys()];
  }
}

export const defaultTransformRegistry = new TransformRegistry();

/** Registers a custom transform in the default registry. */
export function registerTransform(name: string, fn: CustomTransform): void {
  defaultTransformRegistry.register(name, fn);
}

/** Thrown when data does not fit a transform; the dashboard shows it as the widget's error state. */
export class TransformError extends Error {
  override readonly name = 'TransformError';
  /** Index of the failing transform. */
  readonly index: number;
  constructor(index: number, message: string) {
    super(message);
    this.index = index;
  }
}

type Row = Readonly<Record<string, unknown>>;

function isRow(value: unknown): value is Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Own-property read; never walks the prototype chain. */
export function fieldOf(row: unknown, field: string): unknown {
  return isRow(row) && Object.hasOwn(row, field) ? row[field] : undefined;
}

function rows(data: unknown, index: number, op: string): readonly unknown[] {
  if (!Array.isArray(data)) throw new TransformError(index, `The ${op} transform needs an array of records.`);
  return data;
}

function rank(v: unknown): number {
  if (v === null || v === undefined) return 3;
  if (typeof v === 'number') return Number.isNaN(v) ? 3 : 0;
  if (typeof v === 'string') return 1;
  return 2;
}

/** Total order: numbers, then strings (code unit order), then other values, then null/undefined/NaN. */
export function compareValues(a: unknown, b: unknown): number {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return (a as number) - (b as number);
  if (ra === 1) return (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return 0;
}

function sameValue(a: unknown, b: unknown): boolean {
  return a === b || (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b));
}

function matches(value: unknown, operator: string, target: JsonValue): boolean {
  switch (operator) {
    case 'eq':
      return sameValue(value, target);
    case 'ne':
      return !sameValue(value, target);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const comparable = (typeof value === 'number' && typeof target === 'number') || (typeof value === 'string' && typeof target === 'string');
      if (!comparable) return false;
      const c = compareValues(value, target);
      return operator === 'gt' ? c > 0 : operator === 'gte' ? c >= 0 : operator === 'lt' ? c < 0 : c <= 0;
    }
    case 'in':
      return Array.isArray(target) && target.some((t) => sameValue(value, t));
    case 'contains':
      if (typeof value === 'string' && typeof target === 'string') return value.includes(target);
      if (Array.isArray(value)) return value.some((v) => sameValue(v, target));
      return false;
    default:
      return false;
  }
}

function aggregate(group: readonly unknown[], spec: AggregateSpec): number | null {
  if (spec.fn === 'count') return spec.field === undefined ? group.length : group.filter((r) => fieldOf(r, spec.field ?? '') != null).length;
  const values = group.map((r) => fieldOf(r, spec.field ?? '')).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return null;
  switch (spec.fn) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
  }
}

function groupBy(list: readonly unknown[], by: readonly string[], aggregates: readonly AggregateSpec[]): Record<string, unknown>[] {
  const groups = new Map<string, { keys: unknown[]; rows: unknown[] }>();
  for (const row of list) {
    const keys = by.map((f) => fieldOf(row, f) ?? null);
    const id = JSON.stringify(keys);
    let g = groups.get(id);
    if (!g) {
      g = { keys, rows: [] };
      groups.set(id, g);
    }
    g.rows.push(row);
  }
  if (by.length === 0 && groups.size === 0) groups.set('[]', { keys: [], rows: [] });
  return [...groups.values()].map((g) => {
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    by.forEach((f, i) => {
      out[f] = g.keys[i];
    });
    for (const spec of aggregates) out[spec.as] = aggregate(g.rows, spec);
    return { ...out };
  });
}

/** Applies transforms in order. Throws TransformError when the data has the wrong shape. */
export function applyTransforms(data: unknown, transforms: readonly Transform[] | undefined, registry: TransformRegistry = defaultTransformRegistry): unknown {
  let current = data;
  (transforms ?? []).forEach((t, index) => {
    switch (t.op) {
      case 'pick':
        current = rows(current, index, t.op).map((r) => {
          const out: Record<string, unknown> = {};
          for (const f of t.fields) if (isRow(r) && Object.hasOwn(r, f)) out[f] = r[f];
          return out;
        });
        break;
      case 'rename':
        current = rows(current, index, t.op).map((r) => {
          if (!isRow(r)) return r;
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(r)) out[Object.hasOwn(t.fields, k) ? (t.fields[k] ?? k) : k] = v;
          return out;
        });
        break;
      case 'filter':
        current = rows(current, index, t.op).filter((r) => matches(fieldOf(r, t.field), t.operator, t.value));
        break;
      case 'sort': {
        const sign = t.direction === 'desc' ? -1 : 1;
        // Nulls stay last in both directions.
        current = [...rows(current, index, t.op)].sort((a, b) => {
          const va = fieldOf(a, t.field);
          const vb = fieldOf(b, t.field);
          const na = rank(va) === 3;
          const nb = rank(vb) === 3;
          if (na || nb) return na === nb ? 0 : na ? 1 : -1;
          return sign * compareValues(va, vb);
        });
        break;
      }
      case 'limit':
        current = rows(current, index, t.op).slice(0, t.count);
        break;
      case 'groupBy':
        current = groupBy(rows(current, index, t.op), t.by, t.aggregates);
        break;
      case 'custom': {
        const fn = registry.get(t.name);
        if (!fn) throw new TransformError(index, `No transform named "${t.name}" is registered.`);
        current = fn(current, t.options ?? {});
        break;
      }
    }
  });
  return current;
}

/** Resolves `map` (input name to JSON Pointer) against the transformed data. Missing paths give undefined. */
export function resolveInputs(data: unknown, map: Readonly<Record<string, string>> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, pointer] of Object.entries(map ?? {})) {
    try {
      out[name] = getByPointer(data, pointer);
    } catch {
      out[name] = undefined;
    }
  }
  return out;
}
