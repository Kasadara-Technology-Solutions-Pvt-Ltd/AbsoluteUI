/**
 * Dashboard definition validation (R18-2). Every load and change goes through `checkDefinition`, which
 * returns either a normalized, deeply frozen copy (known keys only) or all issues found, each with a JSON
 * Pointer path. Issues never contain the received value (it may be user-authored or sensitive).
 */
import { parsePointer } from '@absoluteui/helpers/json';
import {
  ACCENTS,
  AGGREGATES,
  COMPACTIONS,
  CREDENTIALS,
  DASHBOARD_SCHEMA_VERSION,
  DATE_RANGE_PRESETS,
  DENSITIES,
  FILTER_OPERATORS,
  FORBIDDEN_HEADER_PATTERN,
  HTTP_METHODS,
  ID_PATTERN,
  LIMITS,
  PLACEHOLDER_PATTERN,
  SURFACES,
  VARIABLE_KINDS,
  WIDGET_TYPE_PATTERN,
  type AggregateSpec,
  type BreakpointDefinition,
  type DashboardDefinition,
  type DashboardStyle,
  type DataSourceDefinition,
  type DateRangeValue,
  type GridSettings,
  type JsonObject,
  type JsonValue,
  type LayoutEntry,
  type PageDefinition,
  type ParamValue,
  type SelectOption,
  type Transform,
  type VariableDefinition,
  type WidgetActions,
  type WidgetDefinition,
  type WidgetInteraction,
  type WidgetLayout,
  type WidgetStyle,
} from './definition.js';

export interface DefinitionIssue {
  /** JSON Pointer to the offending value (`""` is the whole document). */
  readonly path: string;
  /** Stable issue code, e.g. `type`, `required`, `unknown-key`, `duplicate-id`, `reference`. */
  readonly code: string;
  /** What was expected; never contains the received value. */
  readonly expected: string;
}

export type DefinitionCheck =
  | { readonly ok: true; readonly definition: DashboardDefinition }
  | { readonly ok: false; readonly issues: readonly DefinitionIssue[] };

const MAX_ISSUES = 100;
const ID_RE = new RegExp(ID_PATTERN);
const TYPE_RE = new RegExp(WIDGET_TYPE_PATTERN);
const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$/;
const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

type Rec = Readonly<Record<string, unknown>>;

class Ctx {
  readonly issues: DefinitionIssue[] = [];
  add(path: string, code: string, expected: string): void {
    if (this.issues.length < MAX_ISSUES) this.issues.push({ path, code, expected });
  }
}

/** True for C0 controls and DEL (CR/LF header injection, NUL). */
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

function esc(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}
function at(path: string, key: string | number): string {
  return `${path}/${esc(String(key))}`;
}

function isRecord(value: unknown): value is Rec {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Reports unknown keys; returns the record or undefined when `value` is not a plain object. */
function obj(ctx: Ctx, value: unknown, path: string, keys: readonly string[], required: readonly string[] = []): Rec | undefined {
  if (!isRecord(value)) {
    ctx.add(path, 'type', 'object');
    return undefined;
  }
  for (const key of Object.keys(value)) if (!keys.includes(key)) ctx.add(at(path, key), 'unknown-key', `one of: ${keys.join(', ')}`);
  for (const key of required) if (value[key] === undefined) ctx.add(at(path, key), 'required', 'a value');
  return value;
}

function str(ctx: Ctx, value: unknown, path: string, max: number, min = 1): string | undefined {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    ctx.add(path, 'type', `string of ${min} to ${max} characters`);
    return undefined;
  }
  return value;
}

function id(ctx: Ctx, value: unknown, path: string): string | undefined {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    ctx.add(path, 'id', `id matching ${ID_PATTERN}`);
    return undefined;
  }
  return value;
}

function int(ctx: Ctx, value: unknown, path: string, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    ctx.add(path, 'range', `integer from ${min} to ${max}`);
    return undefined;
  }
  return value;
}

function num(ctx: Ctx, value: unknown, path: string): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    ctx.add(path, 'type', 'finite number');
    return undefined;
  }
  return value;
}

function bool(ctx: Ctx, value: unknown, path: string): boolean | undefined {
  if (typeof value !== 'boolean') {
    ctx.add(path, 'type', 'boolean');
    return undefined;
  }
  return value;
}

function oneOf<const T extends readonly string[]>(ctx: Ctx, value: unknown, path: string, values: T): T[number] | undefined {
  if (typeof value !== 'string' || !values.includes(value)) {
    ctx.add(path, 'enum', `one of: ${values.join(', ')}`);
    return undefined;
  }
  return value;
}

function safeKey(ctx: Ctx, key: string, path: string): boolean {
  if (UNSAFE_KEYS.has(key)) {
    ctx.add(path, 'unsafe-key', 'a key other than __proto__, prototype, or constructor');
    return false;
  }
  return true;
}

function pointer(ctx: Ctx, value: unknown, path: string): string | undefined {
  if (typeof value !== 'string' || value.length > 512 || (value !== '' && !value.startsWith('/'))) {
    ctx.add(path, 'pointer', 'JSON Pointer (RFC 6901) such as "/data/0/total"');
    return undefined;
  }
  let tokens: string[];
  try {
    tokens = parsePointer(value);
  } catch {
    ctx.add(path, 'pointer', 'JSON Pointer (RFC 6901) such as "/data/0/total"');
    return undefined;
  }
  if (tokens.some((t) => UNSAFE_KEYS.has(t))) {
    ctx.add(path, 'unsafe-key', 'pointer tokens other than __proto__, prototype, or constructor');
    return undefined;
  }
  return value;
}

/** Copies a JSON value, enforcing plain JSON types, depth, size, and safe keys. */
function json(ctx: Ctx, value: unknown, path: string): JsonValue | undefined {
  let nodes = 0;
  let failed = false;
  const walk = (v: unknown, p: string, depth: number): JsonValue | undefined => {
    if (failed) return undefined;
    if (++nodes > LIMITS.jsonNodes || depth > LIMITS.jsonDepth) {
      ctx.add(path, 'size', `JSON with at most ${LIMITS.jsonNodes} values and depth ${LIMITS.jsonDepth}`);
      failed = true;
      return undefined;
    }
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') {
      if (Number.isFinite(v)) return v;
      ctx.add(p, 'type', 'finite number');
      return undefined;
    }
    if (Array.isArray(v)) {
      const out: JsonValue[] = [];
      v.forEach((item, i) => {
        const c = walk(item, at(p, i), depth + 1);
        if (c !== undefined) out.push(c);
      });
      return Object.freeze(out);
    }
    if (isRecord(v)) {
      const out: Record<string, JsonValue> = {};
      for (const [k, item] of Object.entries(v)) {
        if (!safeKey(ctx, k, at(p, k))) continue;
        const c = walk(item, at(p, k), depth + 1);
        if (c !== undefined) out[k] = c;
      }
      return Object.freeze(out);
    }
    ctx.add(p, 'type', 'JSON value (string, number, boolean, null, array, or plain object)');
    return undefined;
  };
  return walk(value, path, 0);
}

function jsonObject(ctx: Ctx, value: unknown, path: string): JsonObject | undefined {
  if (!isRecord(value)) {
    ctx.add(path, 'type', 'object');
    return undefined;
  }
  return json(ctx, value, path) as JsonObject | undefined;
}

/** Sets `key` on `out` only when `value` is defined (exactOptionalPropertyTypes friendly). */
function put<T extends object, K extends keyof T>(out: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) out[key] = value;
}

/* ------------------------------------------------------------------ parts */

function checkGrid(ctx: Ctx, value: unknown, path: string): GridSettings | undefined {
  const r = obj(ctx, value, path, ['columns', 'rowHeight', 'gap', 'compaction']);
  if (!r) return undefined;
  const out: { -readonly [K in keyof GridSettings]: GridSettings[K] } = {};
  if (r.columns !== undefined) put(out, 'columns', int(ctx, r.columns, at(path, 'columns'), 1, 24));
  if (r.rowHeight !== undefined) put(out, 'rowHeight', int(ctx, r.rowHeight, at(path, 'rowHeight'), 24, 600));
  if (r.gap !== undefined) put(out, 'gap', int(ctx, r.gap, at(path, 'gap'), 0, 64));
  if (r.compaction !== undefined) put(out, 'compaction', oneOf(ctx, r.compaction, at(path, 'compaction'), COMPACTIONS));
  return out;
}

function checkLayout(ctx: Ctx, value: unknown, path: string, columns: number, withId: false): WidgetLayout | undefined;
function checkLayout(ctx: Ctx, value: unknown, path: string, columns: number, withId: true): LayoutEntry | undefined;
function checkLayout(ctx: Ctx, value: unknown, path: string, columns: number, withId: boolean): WidgetLayout | LayoutEntry | undefined {
  const keys = ['x', 'y', 'w', 'h', 'minW', 'minH', 'maxW', 'maxH', 'locked'];
  const r = obj(ctx, value, path, withId ? ['id', ...keys] : keys, withId ? ['id', 'x', 'y', 'w', 'h'] : ['x', 'y', 'w', 'h']);
  if (!r) return undefined;
  const before = ctx.issues.length;
  const x = int(ctx, r.x, at(path, 'x'), 0, columns - 1);
  const y = int(ctx, r.y, at(path, 'y'), 0, 10_000);
  const w = int(ctx, r.w, at(path, 'w'), 1, columns);
  const h = int(ctx, r.h, at(path, 'h'), 1, 100);
  const out: { -readonly [K in keyof LayoutEntry]: LayoutEntry[K] } = { id: '', x: x ?? 0, y: y ?? 0, w: w ?? 1, h: h ?? 1 };
  if (withId) put(out, 'id', id(ctx, r.id, at(path, 'id')));
  for (const k of ['minW', 'maxW'] as const) if (r[k] !== undefined) put(out, k, int(ctx, r[k], at(path, k), 1, columns));
  for (const k of ['minH', 'maxH'] as const) if (r[k] !== undefined) put(out, k, int(ctx, r[k], at(path, k), 1, 100));
  if (r.locked !== undefined) put(out, 'locked', bool(ctx, r.locked, at(path, 'locked')));
  if (ctx.issues.length !== before) return undefined;
  if (out.x + out.w > columns) ctx.add(at(path, 'w'), 'range', `x + w at most ${columns} (the column count)`);
  if (out.minW !== undefined && out.maxW !== undefined && out.minW > out.maxW) ctx.add(at(path, 'minW'), 'range', 'minW at most maxW');
  if (out.minH !== undefined && out.maxH !== undefined && out.minH > out.maxH) ctx.add(at(path, 'minH'), 'range', 'minH at most maxH');
  if (out.minW !== undefined && out.w < out.minW) ctx.add(at(path, 'w'), 'range', 'w at least minW');
  if (out.maxW !== undefined && out.w > out.maxW) ctx.add(at(path, 'w'), 'range', 'w at most maxW');
  if (out.minH !== undefined && out.h < out.minH) ctx.add(at(path, 'h'), 'range', 'h at least minH');
  if (out.maxH !== undefined && out.h > out.maxH) ctx.add(at(path, 'h'), 'range', 'h at most maxH');
  if (withId) return out;
  const layout: { -readonly [K in keyof WidgetLayout]: WidgetLayout[K] } = { x: out.x, y: out.y, w: out.w, h: out.h };
  for (const k of ['minW', 'minH', 'maxW', 'maxH', 'locked'] as const) put(layout, k, out[k]);
  return layout;
}

function checkStyle(ctx: Ctx, value: unknown, path: string): WidgetStyle | undefined {
  const r = obj(ctx, value, path, ['accent', 'surface', 'border', 'shadow', 'header', 'density', 'padding']);
  if (!r) return undefined;
  const out: { -readonly [K in keyof WidgetStyle]: WidgetStyle[K] } = {};
  if (r.accent !== undefined) put(out, 'accent', oneOf(ctx, r.accent, at(path, 'accent'), ACCENTS));
  if (r.surface !== undefined) put(out, 'surface', oneOf(ctx, r.surface, at(path, 'surface'), SURFACES));
  for (const k of ['border', 'shadow', 'header'] as const) if (r[k] !== undefined) put(out, k, bool(ctx, r[k], at(path, k)));
  if (r.density !== undefined) put(out, 'density', oneOf(ctx, r.density, at(path, 'density'), DENSITIES));
  if (r.padding !== undefined) put(out, 'padding', int(ctx, r.padding, at(path, 'padding'), 0, 4));
  return out;
}

function checkDashboardStyle(ctx: Ctx, value: unknown, path: string): DashboardStyle | undefined {
  const r = obj(ctx, value, path, ['density', 'accent']);
  if (!r) return undefined;
  const out: { -readonly [K in keyof DashboardStyle]: DashboardStyle[K] } = {};
  if (r.density !== undefined) put(out, 'density', oneOf(ctx, r.density, at(path, 'density'), DENSITIES));
  if (r.accent !== undefined) put(out, 'accent', oneOf(ctx, r.accent, at(path, 'accent'), ACCENTS));
  return out;
}

function isoDate(ctx: Ctx, value: unknown, path: string): string | undefined {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    ctx.add(path, 'date', 'ISO date YYYY-MM-DD');
    return undefined;
  }
  return value;
}

function checkDateRange(ctx: Ctx, value: unknown, path: string): DateRangeValue | undefined {
  if (isRecord(value) && value.preset !== undefined) {
    const r = obj(ctx, value, path, ['preset'], ['preset']);
    const preset = r ? oneOf(ctx, r.preset, at(path, 'preset'), DATE_RANGE_PRESETS) : undefined;
    return preset === undefined ? undefined : { preset };
  }
  const r = obj(ctx, value, path, ['from', 'to'], ['from', 'to']);
  if (!r) return undefined;
  const from = isoDate(ctx, r.from, at(path, 'from'));
  const to = isoDate(ctx, r.to, at(path, 'to'));
  if (from === undefined || to === undefined) return undefined;
  if (from > to) ctx.add(at(path, 'to'), 'range', 'to on or after from');
  return { from, to };
}

function checkVariable(ctx: Ctx, value: unknown, path: string): VariableDefinition | undefined {
  const kind = isRecord(value) ? oneOf(ctx, value.kind, at(path, 'kind'), VARIABLE_KINDS) : undefined;
  if (!isRecord(value)) {
    ctx.add(path, 'type', 'object');
    return undefined;
  }
  if (kind === undefined) return undefined;
  const common = ['id', 'label', 'kind', 'default'];
  const extra: Record<typeof kind, readonly string[]> = { dateRange: ['businessCalendar'], select: ['options', 'multiple'], text: ['maxLength'], number: ['min', 'max'] };
  const r = obj(ctx, value, path, [...common, ...extra[kind]], kind === 'select' ? ['id', 'label', 'kind', 'options'] : ['id', 'label', 'kind']);
  if (!r) return undefined;
  const vid = id(ctx, r.id, at(path, 'id')) ?? '';
  const label = str(ctx, r.label, at(path, 'label'), LIMITS.title) ?? '';
  const dpath = at(path, 'default');
  switch (kind) {
    case 'dateRange': {
      const out: { -readonly [K in keyof Extract<VariableDefinition, { kind: 'dateRange' }>]: Extract<VariableDefinition, { kind: 'dateRange' }>[K] } = { id: vid, label, kind };
      if (r.default !== undefined) put(out, 'default', checkDateRange(ctx, r.default, dpath));
      if (r.businessCalendar !== undefined) put(out, 'businessCalendar', id(ctx, r.businessCalendar, at(path, 'businessCalendar')));
      return out;
    }
    case 'select': {
      const options: SelectOption[] = [];
      const opath = at(path, 'options');
      if (!Array.isArray(r.options) || r.options.length < 1 || r.options.length > LIMITS.selectOptions) ctx.add(opath, 'type', `array of 1 to ${LIMITS.selectOptions} options`);
      else {
        const seen = new Set<string>();
        r.options.forEach((o, i) => {
          const op = obj(ctx, o, at(opath, i), ['value', 'label'], ['value', 'label']);
          if (!op) return;
          const v = str(ctx, op.value, at(at(opath, i), 'value'), LIMITS.title, 0);
          const l = str(ctx, op.label, at(at(opath, i), 'label'), LIMITS.title);
          if (v === undefined || l === undefined) return;
          if (seen.has(v)) ctx.add(at(at(opath, i), 'value'), 'duplicate-id', 'unique option values');
          seen.add(v);
          options.push(Object.freeze({ value: v, label: l }));
        });
      }
      const out: { -readonly [K in keyof Extract<VariableDefinition, { kind: 'select' }>]: Extract<VariableDefinition, { kind: 'select' }>[K] } = { id: vid, label, kind, options: Object.freeze(options) };
      if (r.multiple !== undefined) put(out, 'multiple', bool(ctx, r.multiple, at(path, 'multiple')));
      if (r.default !== undefined) {
        const values = new Set(options.map((o) => o.value));
        const valid = (v: unknown, p: string): v is string => {
          if (typeof v === 'string' && values.has(v)) return true;
          ctx.add(p, 'reference', 'one of the option values');
          return false;
        };
        if (out.multiple === true) {
          if (!Array.isArray(r.default)) ctx.add(dpath, 'type', 'array of option values');
          else {
            const list = r.default.filter((v, i): v is string => valid(v, at(dpath, i)));
            out.default = Object.freeze(list);
          }
        } else if (valid(r.default, dpath)) out.default = r.default;
      }
      return out;
    }
    case 'text': {
      const out: { -readonly [K in keyof Extract<VariableDefinition, { kind: 'text' }>]: Extract<VariableDefinition, { kind: 'text' }>[K] } = { id: vid, label, kind };
      if (r.maxLength !== undefined) put(out, 'maxLength', int(ctx, r.maxLength, at(path, 'maxLength'), 1, LIMITS.text));
      if (r.default !== undefined) put(out, 'default', str(ctx, r.default, dpath, out.maxLength ?? LIMITS.text, 0));
      return out;
    }
    case 'number': {
      const out: { -readonly [K in keyof Extract<VariableDefinition, { kind: 'number' }>]: Extract<VariableDefinition, { kind: 'number' }>[K] } = { id: vid, label, kind };
      if (r.min !== undefined) put(out, 'min', num(ctx, r.min, at(path, 'min')));
      if (r.max !== undefined) put(out, 'max', num(ctx, r.max, at(path, 'max')));
      if (out.min !== undefined && out.max !== undefined && out.min > out.max) ctx.add(at(path, 'min'), 'range', 'min at most max');
      if (r.default !== undefined) {
        const d = num(ctx, r.default, dpath);
        if (d !== undefined && ((out.min !== undefined && d < out.min) || (out.max !== undefined && d > out.max))) ctx.add(dpath, 'range', 'a default between min and max');
        put(out, 'default', d);
      }
      return out;
    }
  }
}

/** Collects `{{variable}}` references from a string. */
function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_PATTERN)].map((m) => m[1] ?? '');
}

function checkUrl(ctx: Ctx, value: unknown, path: string): string | undefined {
  const url = str(ctx, value, path, LIMITS.url);
  if (url === undefined) return undefined;
  const expected = 'absolute http(s) URL or root-relative path ("/api/..."), without placeholders or user info';
  if (url.includes('{{') || /\s/.test(url) || hasControl(url)) {
    ctx.add(path, 'url', expected);
    return undefined;
  }
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    ctx.add(path, 'url', expected);
    return undefined;
  }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username !== '' || parsed.password !== '') {
    ctx.add(path, 'url', expected);
    return undefined;
  }
  return url;
}

function checkDataSource(ctx: Ctx, value: unknown, path: string, refs: Set<string>): DataSourceDefinition | undefined {
  if (!isRecord(value)) {
    ctx.add(path, 'type', 'object');
    return undefined;
  }
  const kind = value.kind === undefined ? 'http' : oneOf(ctx, value.kind, at(path, 'kind'), ['http', 'static', 'mock'] as const);
  if (kind === undefined) return undefined;
  if (kind === 'static') {
    const r = obj(ctx, value, path, ['kind', 'data'], ['data']);
    const data = r ? json(ctx, r.data, at(path, 'data')) : undefined;
    return data === undefined ? undefined : { kind, data };
  }
  if (kind === 'mock') {
    const r = obj(ctx, value, path, ['kind', 'data', 'delay', 'failStatus'], ['data']);
    if (!r) return undefined;
    const data = json(ctx, r.data, at(path, 'data'));
    if (data === undefined) return undefined;
    const out: { -readonly [K in keyof Extract<DataSourceDefinition, { kind: 'mock' }>]: Extract<DataSourceDefinition, { kind: 'mock' }>[K] } = { kind, data };
    if (r.delay !== undefined) put(out, 'delay', int(ctx, r.delay, at(path, 'delay'), 0, 10_000));
    if (r.failStatus !== undefined) put(out, 'failStatus', int(ctx, r.failStatus, at(path, 'failStatus'), 400, 599));
    return out;
  }
  const r = obj(ctx, value, path, ['kind', 'url', 'method', 'params', 'headers', 'body', 'credentials', 'select', 'ttl', 'refresh', 'timeout', 'maxBytes'], ['url']);
  if (!r) return undefined;
  const url = checkUrl(ctx, r.url, at(path, 'url'));
  if (url === undefined) return undefined;
  const out: { -readonly [K in keyof Extract<DataSourceDefinition, { kind: 'http' }>]: Extract<DataSourceDefinition, { kind: 'http' }>[K] } = { kind: 'http', url };
  if (r.method !== undefined) put(out, 'method', oneOf(ctx, r.method, at(path, 'method'), HTTP_METHODS));
  if (r.params !== undefined) {
    const ppath = at(path, 'params');
    const p = obj(ctx, r.params, ppath, Object.keys(isRecord(r.params) ? r.params : {}));
    if (p) {
      const entries = Object.entries(p);
      if (entries.length > LIMITS.params) ctx.add(ppath, 'size', `at most ${LIMITS.params} parameters`);
      const params: Record<string, ParamValue> = {};
      for (const [k, v] of entries) {
        const kp = at(ppath, k);
        if (!safeKey(ctx, k, kp)) continue;
        if (k.length < 1 || k.length > 128) ctx.add(kp, 'type', 'parameter name of 1 to 128 characters');
        else if (typeof v === 'string' && v.length <= LIMITS.text) {
          for (const ref of placeholders(v)) refs.add(ref);
          params[k] = v;
        } else if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) params[k] = v;
        else ctx.add(kp, 'type', `string (at most ${LIMITS.text} characters), finite number, or boolean`);
      }
      out.params = Object.freeze(params);
    }
  }
  if (r.headers !== undefined) {
    const hpath = at(path, 'headers');
    const h = obj(ctx, r.headers, hpath, Object.keys(isRecord(r.headers) ? r.headers : {}));
    if (h) {
      const entries = Object.entries(h);
      if (entries.length > LIMITS.headers) ctx.add(hpath, 'size', `at most ${LIMITS.headers} headers`);
      const headers: Record<string, string> = {};
      for (const [k, v] of entries) {
        const kp = at(hpath, k);
        if (!safeKey(ctx, k, kp)) continue;
        if (!HEADER_NAME_RE.test(k)) ctx.add(kp, 'header', 'HTTP header name (token characters, at most 64)');
        else if (FORBIDDEN_HEADER_PATTERN.test(k)) ctx.add(kp, 'forbidden-header', 'no Authorization, Cookie, Host, Origin, Referer, Proxy-*, or Sec-* header (authentication belongs to the host fetcher)');
        else if (typeof v !== 'string' || v.length > LIMITS.headerValue || hasControl(v) || v.includes('{{')) ctx.add(kp, 'header', `header value of at most ${LIMITS.headerValue} characters, single line, without placeholders`);
        else headers[k] = v;
      }
      out.headers = Object.freeze(headers);
    }
  }
  if (r.body !== undefined) {
    if (out.method !== 'POST') ctx.add(at(path, 'body'), 'body', 'a body only with method POST');
    const body = json(ctx, r.body, at(path, 'body'));
    if (body !== undefined) {
      const walk = (v: JsonValue): void => {
        if (typeof v === 'string') for (const ref of placeholders(v)) refs.add(ref);
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v !== null && typeof v === 'object') Object.values(v).forEach(walk);
      };
      walk(body);
      out.body = body;
    }
  }
  if (r.credentials !== undefined) put(out, 'credentials', oneOf(ctx, r.credentials, at(path, 'credentials'), CREDENTIALS));
  if (r.select !== undefined) put(out, 'select', pointer(ctx, r.select, at(path, 'select')));
  if (r.ttl !== undefined) put(out, 'ttl', int(ctx, r.ttl, at(path, 'ttl'), 0, 86_400));
  if (r.refresh !== undefined) {
    const v = int(ctx, r.refresh, at(path, 'refresh'), 0, 86_400);
    if (v !== undefined && v !== 0 && v < 10) ctx.add(at(path, 'refresh'), 'range', '0 (off) or 10 to 86400 seconds');
    else put(out, 'refresh', v);
  }
  if (r.timeout !== undefined) put(out, 'timeout', int(ctx, r.timeout, at(path, 'timeout'), 1, 120));
  if (r.maxBytes !== undefined) put(out, 'maxBytes', int(ctx, r.maxBytes, at(path, 'maxBytes'), 1024, 50 * 1024 * 1024));
  return out;
}

function field(ctx: Ctx, value: unknown, path: string): string | undefined {
  const f = str(ctx, value, path, 128);
  if (f !== undefined && !safeKey(ctx, f, path)) return undefined;
  return f;
}

function checkTransform(ctx: Ctx, value: unknown, path: string): Transform | undefined {
  if (!isRecord(value)) {
    ctx.add(path, 'type', 'object');
    return undefined;
  }
  const op = oneOf(ctx, value.op, at(path, 'op'), ['pick', 'rename', 'filter', 'sort', 'limit', 'groupBy', 'custom'] as const);
  switch (op) {
    case undefined:
      return undefined;
    case 'pick': {
      const r = obj(ctx, value, path, ['op', 'fields'], ['fields']);
      if (!r) return undefined;
      if (!Array.isArray(r.fields) || r.fields.length < 1 || r.fields.length > 100) {
        ctx.add(at(path, 'fields'), 'type', 'array of 1 to 100 field names');
        return undefined;
      }
      const fields = r.fields.map((f, i) => field(ctx, f, at(at(path, 'fields'), i))).filter((f): f is string => f !== undefined);
      return { op, fields: Object.freeze(fields) };
    }
    case 'rename': {
      const r = obj(ctx, value, path, ['op', 'fields'], ['fields']);
      const fpath = at(path, 'fields');
      const f = r ? obj(ctx, r.fields, fpath, Object.keys(isRecord(r.fields) ? r.fields : {})) : undefined;
      if (!f) return undefined;
      const fields: Record<string, string> = {};
      for (const [from, to] of Object.entries(f)) {
        if (!safeKey(ctx, from, at(fpath, from))) continue;
        const t = field(ctx, to, at(fpath, from));
        if (t !== undefined) fields[from] = t;
      }
      return { op, fields: Object.freeze(fields) };
    }
    case 'filter': {
      const r = obj(ctx, value, path, ['op', 'field', 'operator', 'value'], ['field', 'operator', 'value']);
      if (!r) return undefined;
      const f = field(ctx, r.field, at(path, 'field'));
      const operator = oneOf(ctx, r.operator, at(path, 'operator'), FILTER_OPERATORS);
      const v = json(ctx, r.value, at(path, 'value'));
      if (operator === 'in' && !Array.isArray(r.value)) ctx.add(at(path, 'value'), 'type', 'array for operator "in"');
      if (f === undefined || operator === undefined || v === undefined) return undefined;
      return { op, field: f, operator, value: v };
    }
    case 'sort': {
      const r = obj(ctx, value, path, ['op', 'field', 'direction'], ['field']);
      if (!r) return undefined;
      const f = field(ctx, r.field, at(path, 'field'));
      if (f === undefined) return undefined;
      if (r.direction === undefined) return { op, field: f };
      const direction = oneOf(ctx, r.direction, at(path, 'direction'), ['asc', 'desc'] as const);
      return direction === undefined ? undefined : { op, field: f, direction };
    }
    case 'limit': {
      const r = obj(ctx, value, path, ['op', 'count'], ['count']);
      const count = r ? int(ctx, r.count, at(path, 'count'), 1, 100_000) : undefined;
      return count === undefined ? undefined : { op, count };
    }
    case 'groupBy': {
      const r = obj(ctx, value, path, ['op', 'by', 'aggregates'], ['by', 'aggregates']);
      if (!r) return undefined;
      const bpath = at(path, 'by');
      const apath = at(path, 'aggregates');
      if (!Array.isArray(r.by) || r.by.length > 10) {
        ctx.add(bpath, 'type', 'array of at most 10 field names (empty for a grand total)');
        return undefined;
      }
      if (!Array.isArray(r.aggregates) || r.aggregates.length < 1 || r.aggregates.length > 20) {
        ctx.add(apath, 'type', 'array of 1 to 20 aggregates');
        return undefined;
      }
      const by = r.by.map((f, i) => field(ctx, f, at(bpath, i))).filter((f): f is string => f !== undefined);
      const aggregates: AggregateSpec[] = [];
      r.aggregates.forEach((a, i) => {
        const p = at(apath, i);
        const ar = obj(ctx, a, p, ['fn', 'field', 'as'], ['fn', 'as']);
        if (!ar) return;
        const fn = oneOf(ctx, ar.fn, at(p, 'fn'), AGGREGATES);
        const as = field(ctx, ar.as, at(p, 'as'));
        if (fn === undefined || as === undefined) return;
        if (ar.field === undefined) {
          if (fn !== 'count') ctx.add(at(p, 'field'), 'required', `a field for ${fn}`);
          else aggregates.push(Object.freeze({ fn, as }));
          return;
        }
        const f = field(ctx, ar.field, at(p, 'field'));
        if (f !== undefined) aggregates.push(Object.freeze({ fn, field: f, as }));
      });
      return { op, by: Object.freeze(by), aggregates: Object.freeze(aggregates) };
    }
    case 'custom': {
      const r = obj(ctx, value, path, ['op', 'name', 'options'], ['name']);
      if (!r) return undefined;
      const name = typeof r.name === 'string' && TYPE_RE.test(r.name) ? r.name : undefined;
      if (name === undefined) ctx.add(at(path, 'name'), 'type', `registered transform name matching ${WIDGET_TYPE_PATTERN}`);
      const options = r.options === undefined ? undefined : jsonObject(ctx, r.options, at(path, 'options'));
      if (name === undefined) return undefined;
      return options === undefined ? { op, name } : { op, name, options };
    }
  }
}

function checkActions(ctx: Ctx, value: unknown, path: string): WidgetActions | undefined {
  const keys = ['collapsible', 'maximizable', 'removable', 'refreshable'] as const;
  const r = obj(ctx, value, path, keys);
  if (!r) return undefined;
  const out: { -readonly [K in keyof WidgetActions]: WidgetActions[K] } = {};
  for (const k of keys) if (r[k] !== undefined) put(out, k, bool(ctx, r[k], at(path, k)));
  return out;
}

function checkWidget(ctx: Ctx, value: unknown, path: string, columns: number): WidgetDefinition | undefined {
  const r = obj(ctx, value, path, ['id', 'type', 'title', 'subtitle', 'page', 'source', 'map', 'transforms', 'options', 'style', 'actions', 'interactions', 'layout'], ['id', 'type', 'title', 'layout']);
  if (!r) return undefined;
  const wid = id(ctx, r.id, at(path, 'id'));
  const type = typeof r.type === 'string' && TYPE_RE.test(r.type) ? r.type : undefined;
  if (r.type !== undefined && type === undefined) ctx.add(at(path, 'type'), 'type', `widget type name matching ${WIDGET_TYPE_PATTERN}`);
  const title = str(ctx, r.title, at(path, 'title'), LIMITS.title);
  const layout = r.layout === undefined ? undefined : checkLayout(ctx, r.layout, at(path, 'layout'), columns, false);
  if (wid === undefined || type === undefined || title === undefined || layout === undefined) return undefined;
  const out: { -readonly [K in keyof WidgetDefinition]: WidgetDefinition[K] } = { id: wid, type, title, layout: Object.freeze(layout) };
  if (r.subtitle !== undefined) put(out, 'subtitle', str(ctx, r.subtitle, at(path, 'subtitle'), LIMITS.title));
  if (r.page !== undefined) put(out, 'page', id(ctx, r.page, at(path, 'page')));
  if (r.source !== undefined) put(out, 'source', id(ctx, r.source, at(path, 'source')));
  if (r.map !== undefined) {
    const mpath = at(path, 'map');
    const m = obj(ctx, r.map, mpath, Object.keys(isRecord(r.map) ? r.map : {}));
    if (m) {
      const map: Record<string, string> = {};
      for (const [k, v] of Object.entries(m)) {
        if (!safeKey(ctx, k, at(mpath, k))) continue;
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(k)) {
          ctx.add(at(mpath, k), 'id', 'widget input name (letters, digits, underscore)');
          continue;
        }
        const p = pointer(ctx, v, at(mpath, k));
        if (p !== undefined) map[k] = p;
      }
      out.map = Object.freeze(map);
    }
  }
  if (r.transforms !== undefined) {
    const tpath = at(path, 'transforms');
    if (!Array.isArray(r.transforms) || r.transforms.length > LIMITS.transforms) ctx.add(tpath, 'type', `array of at most ${LIMITS.transforms} transforms`);
    else out.transforms = Object.freeze(r.transforms.map((t, i) => checkTransform(ctx, t, at(tpath, i))).filter((t): t is Transform => t !== undefined).map((t) => Object.freeze(t)));
  }
  if (r.options !== undefined) put(out, 'options', jsonObject(ctx, r.options, at(path, 'options')));
  if (r.style !== undefined) put(out, 'style', freezeOpt(checkStyle(ctx, r.style, at(path, 'style'))));
  if (r.actions !== undefined) put(out, 'actions', freezeOpt(checkActions(ctx, r.actions, at(path, 'actions'))));
  if (r.interactions !== undefined) {
    const ipath = at(path, 'interactions');
    if (!Array.isArray(r.interactions) || r.interactions.length > LIMITS.interactions) ctx.add(ipath, 'type', `array of at most ${LIMITS.interactions} interactions`);
    else {
      const list: WidgetInteraction[] = [];
      r.interactions.forEach((it, i) => {
        const p = at(ipath, i);
        const ir = obj(ctx, it, p, ['on', 'set', 'from'], ['on', 'set', 'from']);
        if (!ir) return;
        const on = oneOf(ctx, ir.on, at(p, 'on'), ['select'] as const);
        const set = id(ctx, ir.set, at(p, 'set'));
        const from = pointer(ctx, ir.from, at(p, 'from'));
        if (on !== undefined && set !== undefined && from !== undefined) list.push(Object.freeze({ on, set, from }));
      });
      out.interactions = Object.freeze(list);
    }
  }
  return out;
}

function freezeOpt<T extends object>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : Object.freeze(value);
}

function checkBreakpoints(ctx: Ctx, value: unknown, path: string, columns: number): BreakpointDefinition[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > LIMITS.breakpoints) {
    ctx.add(path, 'type', `array of 1 to ${LIMITS.breakpoints} breakpoints`);
    return undefined;
  }
  const list: BreakpointDefinition[] = [];
  value.forEach((b, i) => {
    const p = at(path, i);
    const r = obj(ctx, b, p, ['name', 'minWidth', 'columns'], ['name', 'minWidth', 'columns']);
    if (!r) return;
    const name = id(ctx, r.name, at(p, 'name'));
    const minWidth = int(ctx, r.minWidth, at(p, 'minWidth'), 0, 10_000);
    const cols = int(ctx, r.columns, at(p, 'columns'), 1, 24);
    if (name !== undefined && minWidth !== undefined && cols !== undefined) list.push(Object.freeze({ name, minWidth, columns: cols }));
  });
  if (list.length !== value.length) return undefined;
  const names = new Set<string>();
  const widths = new Set<number>();
  list.forEach((b, i) => {
    if (names.has(b.name)) ctx.add(at(at(path, i), 'name'), 'duplicate-id', 'unique breakpoint names');
    if (widths.has(b.minWidth)) ctx.add(at(at(path, i), 'minWidth'), 'duplicate-id', 'unique breakpoint minWidth values');
    names.add(b.name);
    widths.add(b.minWidth);
  });
  if (!list.some((b) => b.minWidth === 0)) ctx.add(path, 'breakpoints', 'one breakpoint with minWidth 0');
  const widest = list.reduce((a, b) => (b.minWidth > a.minWidth ? b : a));
  if (widest.columns !== columns) ctx.add(path, 'breakpoints', `the widest breakpoint with ${columns} columns (grid.columns)`);
  return list;
}

/* ------------------------------------------------------------------ document */

const TOP_KEYS = ['schemaVersion', 'id', 'title', 'description', 'grid', 'breakpoints', 'layouts', 'style', 'pages', 'variables', 'dataSources', 'widgets'];

function checkDocument(ctx: Ctx, input: unknown): DashboardDefinition | undefined {
  const r = obj(ctx, input, '', TOP_KEYS, ['schemaVersion', 'id', 'title', 'widgets']);
  if (!r) return undefined;
  if (r.schemaVersion !== DASHBOARD_SCHEMA_VERSION) ctx.add('/schemaVersion', 'version', `schemaVersion ${DASHBOARD_SCHEMA_VERSION} (run migrateDefinition first for older documents)`);
  const did = id(ctx, r.id, '/id') ?? '';
  const title = str(ctx, r.title, '/title', LIMITS.title) ?? '';
  const out: { -readonly [K in keyof DashboardDefinition]: DashboardDefinition[K] } = { schemaVersion: DASHBOARD_SCHEMA_VERSION, id: did, title, widgets: [] };
  if (r.description !== undefined) put(out, 'description', str(ctx, r.description, '/description', LIMITS.text, 0));
  if (r.grid !== undefined) put(out, 'grid', freezeOpt(checkGrid(ctx, r.grid, '/grid')));
  const columns = out.grid?.columns ?? 12;
  if (r.style !== undefined) put(out, 'style', freezeOpt(checkDashboardStyle(ctx, r.style, '/style')));

  let breakpoints: BreakpointDefinition[] | undefined;
  if (r.breakpoints !== undefined) {
    breakpoints = checkBreakpoints(ctx, r.breakpoints, '/breakpoints', columns);
    if (breakpoints) out.breakpoints = Object.freeze(breakpoints);
  }

  const pageIds = new Set<string>();
  if (r.pages !== undefined) {
    if (!Array.isArray(r.pages) || r.pages.length < 1 || r.pages.length > LIMITS.pages) ctx.add('/pages', 'type', `array of 1 to ${LIMITS.pages} pages`);
    else {
      const pages: PageDefinition[] = [];
      r.pages.forEach((pg, i) => {
        const p = at('/pages', i);
        const pr = obj(ctx, pg, p, ['id', 'title'], ['id', 'title']);
        if (!pr) return;
        const pid = id(ctx, pr.id, at(p, 'id'));
        const pt = str(ctx, pr.title, at(p, 'title'), LIMITS.title);
        if (pid === undefined || pt === undefined) return;
        if (pageIds.has(pid)) ctx.add(at(p, 'id'), 'duplicate-id', 'unique page ids');
        pageIds.add(pid);
        pages.push(Object.freeze({ id: pid, title: pt }));
      });
      out.pages = Object.freeze(pages);
    }
  }

  const variableIds = new Set<string>();
  const variableKinds = new Map<string, VariableDefinition['kind']>();
  if (r.variables !== undefined) {
    if (!Array.isArray(r.variables) || r.variables.length > LIMITS.variables) ctx.add('/variables', 'type', `array of at most ${LIMITS.variables} variables`);
    else {
      const vars: VariableDefinition[] = [];
      r.variables.forEach((v, i) => {
        const c = checkVariable(ctx, v, at('/variables', i));
        if (!c) return;
        if (variableIds.has(c.id)) ctx.add(at(at('/variables', i), 'id'), 'duplicate-id', 'unique variable ids');
        variableIds.add(c.id);
        variableKinds.set(c.id, c.kind);
        vars.push(Object.freeze(c));
      });
      out.variables = Object.freeze(vars);
    }
  }

  const sourceIds = new Set<string>();
  if (r.dataSources !== undefined) {
    const s = obj(ctx, r.dataSources, '/dataSources', Object.keys(isRecord(r.dataSources) ? r.dataSources : {}));
    if (s) {
      const entries = Object.entries(s);
      if (entries.length > LIMITS.dataSources) ctx.add('/dataSources', 'size', `at most ${LIMITS.dataSources} data sources`);
      const sources: Record<string, DataSourceDefinition> = {};
      for (const [key, def] of entries) {
        const p = at('/dataSources', key);
        if (id(ctx, key, p) === undefined || !safeKey(ctx, key, p)) continue;
        const refs = new Set<string>();
        const c = checkDataSource(ctx, def, p, refs);
        if (!c) continue;
        for (const ref of refs) if (!variableIds.has(ref)) ctx.add(p, 'reference', `placeholders that name declared variables (unknown: ${ref})`);
        sourceIds.add(key);
        sources[key] = Object.freeze(c);
      }
      out.dataSources = Object.freeze(sources);
    }
  }

  const widgetIds = new Set<string>();
  if (!Array.isArray(r.widgets) || r.widgets.length > LIMITS.widgets) ctx.add('/widgets', 'type', `array of at most ${LIMITS.widgets} widgets`);
  else {
    const widgets: WidgetDefinition[] = [];
    r.widgets.forEach((w, i) => {
      const p = at('/widgets', i);
      const c = checkWidget(ctx, w, p, columns);
      if (!c) return;
      if (widgetIds.has(c.id)) ctx.add(at(p, 'id'), 'duplicate-id', 'unique widget ids');
      widgetIds.add(c.id);
      if (c.source !== undefined && !sourceIds.has(c.source)) ctx.add(at(p, 'source'), 'reference', 'the id of a declared data source');
      if (c.page !== undefined && !pageIds.has(c.page)) ctx.add(at(p, 'page'), 'reference', 'the id of a declared page');
      if (c.page === undefined && pageIds.size > 0) ctx.add(at(p, 'page'), 'required', 'a page id (the dashboard declares pages)');
      if ((c.map !== undefined || c.transforms !== undefined) && c.source === undefined) ctx.add(at(p, 'source'), 'required', 'a data source for map or transforms');
      c.interactions?.forEach((it, j) => {
        const kind = variableKinds.get(it.set);
        if (kind === undefined) ctx.add(at(at(at(p, 'interactions'), j), 'set'), 'reference', 'the id of a declared variable');
        else if (kind === 'dateRange') ctx.add(at(at(at(p, 'interactions'), j), 'set'), 'reference', 'a select, text, or number variable');
      });
      widgets.push(Object.freeze(c));
    });
    out.widgets = Object.freeze(widgets);
  }

  if (r.layouts !== undefined) {
    const known = new Map((breakpoints ?? defaultBreakpoints(columns)).map((b) => [b.name, b.columns]));
    const lr = obj(ctx, r.layouts, '/layouts', [...known.keys()]);
    if (lr) {
      const layouts: Record<string, readonly LayoutEntry[]> = {};
      for (const [name, entries] of Object.entries(lr)) {
        const p = at('/layouts', name);
        const cols = known.get(name);
        if (cols === undefined) continue;
        if (!Array.isArray(entries) || entries.length > LIMITS.widgets) {
          ctx.add(p, 'type', `array of at most ${LIMITS.widgets} layout entries`);
          continue;
        }
        const seen = new Set<string>();
        const list: LayoutEntry[] = [];
        entries.forEach((e, i) => {
          const c = checkLayout(ctx, e, at(p, i), cols, true);
          if (!c) return;
          if (!widgetIds.has(c.id)) ctx.add(at(at(p, i), 'id'), 'reference', 'the id of a declared widget');
          if (seen.has(c.id)) ctx.add(at(at(p, i), 'id'), 'duplicate-id', 'one entry per widget');
          seen.add(c.id);
          list.push(Object.freeze(c));
        });
        layouts[name] = Object.freeze(list);
      }
      out.layouts = Object.freeze(layouts);
    }
  }
  return Object.freeze(out);
}

/** The dashboard-grid default breakpoints, scaled to the widest column count. */
export function defaultBreakpoints(columns: number): BreakpointDefinition[] {
  return [
    { name: 'lg', minWidth: 1024, columns },
    { name: 'md', minWidth: 640, columns: Math.max(1, Math.round(columns / 2)) },
    { name: 'sm', minWidth: 0, columns: 1 },
  ];
}

/**
 * Validates a dashboard definition (plain JSON data, for example from `safeJsonParse`). Returns a
 * normalized, deeply frozen copy or every issue found (at most 100). Documents with an older
 * `schemaVersion` must go through `migrateDefinition` first.
 */
export function checkDefinition(input: unknown): DefinitionCheck {
  const ctx = new Ctx();
  const definition = checkDocument(ctx, input);
  if (ctx.issues.length > 0 || definition === undefined) return { ok: false, issues: Object.freeze(ctx.issues.map((i) => Object.freeze(i))) };
  return { ok: true, definition };
}
