/**
 * @absoluteui/components/dashboard/schema (R18-3): the dashboard definition as a JSON Schema (draft
 * 2020-12), for the widget builder, external JSON editors, and tools such as AI assistants that propose
 * definitions. The schema describes structure; `checkDefinition` remains the authority and also checks
 * cross-references (unique ids, declared sources, variables, pages) and widget-type options.
 */
import {
  ACCENTS,
  AGGREGATES,
  COMPACTIONS,
  CREDENTIALS,
  DASHBOARD_SCHEMA_VERSION,
  DATE_RANGE_PRESETS,
  DENSITIES,
  FILTER_OPERATORS,
  HTTP_METHODS,
  ID_PATTERN,
  LIMITS,
  SURFACES,
  WIDGET_TYPE_PATTERN,
} from '../definition.js';

/** A JSON Schema object (plain JSON). */
export type JsonSchema = Readonly<Record<string, unknown>>;

export interface DefinitionSchemaOptions {
  /** Restrict `widgets[].type` to these registered names (for example from the widget registry). */
  readonly widgetTypes?: readonly string[];
  /** Restrict `transforms[].name` of custom transforms to these registered names. */
  readonly transforms?: readonly string[];
}

const id = { type: 'string', pattern: ID_PATTERN };
const pointer = { type: 'string', maxLength: 512, pattern: '^(/.*)?$', description: 'JSON Pointer (RFC 6901).' };
const title = { type: 'string', minLength: 1, maxLength: LIMITS.title };
const isoDate = { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$' };
const fieldName = { type: 'string', minLength: 1, maxLength: 128, not: { enum: ['__proto__', 'prototype', 'constructor'] } };
/** Case-insensitive letters as classes: JSON Schema patterns (ECMA-262) have no portable i flag. */
const caseless = (pattern: string): string => pattern.replace(/[a-z]/g, (c) => `[${c.toUpperCase()}${c}]`);
const strict = (properties: Record<string, unknown>, required: readonly string[] = []): JsonSchema => ({ type: 'object', additionalProperties: false, required, properties });

function layout(withId: boolean): JsonSchema {
  const props: Record<string, unknown> = {
    x: { type: 'integer', minimum: 0, maximum: 23 },
    y: { type: 'integer', minimum: 0, maximum: 10_000 },
    w: { type: 'integer', minimum: 1, maximum: 24 },
    h: { type: 'integer', minimum: 1, maximum: 100 },
    minW: { type: 'integer', minimum: 1, maximum: 24 },
    minH: { type: 'integer', minimum: 1, maximum: 100 },
    maxW: { type: 'integer', minimum: 1, maximum: 24 },
    maxH: { type: 'integer', minimum: 1, maximum: 100 },
    locked: { type: 'boolean' },
  };
  return withId ? strict({ id, ...props }, ['id', 'x', 'y', 'w', 'h']) : strict(props, ['x', 'y', 'w', 'h']);
}

const style = strict({
  accent: { enum: ACCENTS },
  surface: { enum: SURFACES },
  border: { type: 'boolean' },
  shadow: { type: 'boolean' },
  header: { type: 'boolean' },
  density: { enum: DENSITIES },
  padding: { type: 'integer', minimum: 0, maximum: 4 },
});

const dateRange = {
  oneOf: [strict({ preset: { enum: DATE_RANGE_PRESETS } }, ['preset']), strict({ from: isoDate, to: isoDate }, ['from', 'to'])],
};

const variable = {
  oneOf: [
    strict({ id, label: title, kind: { const: 'dateRange' }, default: dateRange, businessCalendar: id }, ['id', 'label', 'kind']),
    strict(
      {
        id,
        label: title,
        kind: { const: 'select' },
        options: { type: 'array', minItems: 1, maxItems: LIMITS.selectOptions, items: strict({ value: { type: 'string', maxLength: LIMITS.title }, label: title }, ['value', 'label']) },
        multiple: { type: 'boolean' },
        default: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      },
      ['id', 'label', 'kind', 'options'],
    ),
    strict({ id, label: title, kind: { const: 'text' }, default: { type: 'string', maxLength: LIMITS.text }, maxLength: { type: 'integer', minimum: 1, maximum: LIMITS.text } }, ['id', 'label', 'kind']),
    strict({ id, label: title, kind: { const: 'number' }, default: { type: 'number' }, min: { type: 'number' }, max: { type: 'number' } }, ['id', 'label', 'kind']),
  ],
};

const httpSource = strict(
  {
    kind: { const: 'http' },
    url: { type: 'string', minLength: 1, maxLength: LIMITS.url, pattern: '^(https?://[^\\s{}]+|/(?!/)[^\\s{}]*)$', description: 'Absolute http(s) URL or root-relative path. The host allowlist decides which origins are reachable.' },
    method: { enum: HTTP_METHODS },
    params: { type: 'object', maxProperties: LIMITS.params, propertyNames: { minLength: 1, maxLength: 128 }, additionalProperties: { type: ['string', 'number', 'boolean'] }, description: 'Query parameters; strings may contain {{variable}} or {{variable.from}} placeholders.' },
    headers: {
      type: 'object',
      maxProperties: LIMITS.headers,
      propertyNames: { pattern: "^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$", not: { pattern: caseless('^(authorization|cookie|cookie2|set-cookie|host|origin|referer|proxy-.*|sec-.*)$') } },
      additionalProperties: { type: 'string', maxLength: LIMITS.headerValue },
      description: 'Static non-secret headers. Authentication belongs to the host fetcher.',
    },
    body: { description: 'JSON body for POST; strings may contain placeholders.' },
    credentials: { enum: CREDENTIALS },
    select: pointer,
    ttl: { type: 'integer', minimum: 0, maximum: 86_400 },
    refresh: { anyOf: [{ const: 0 }, { type: 'integer', minimum: 10, maximum: 86_400 }] },
    timeout: { type: 'integer', minimum: 1, maximum: 120 },
    maxBytes: { type: 'integer', minimum: 1024, maximum: 50 * 1024 * 1024 },
  },
  ['url'],
);

const dataSource = {
  oneOf: [
    httpSource,
    strict({ kind: { const: 'static' }, data: {} }, ['kind', 'data']),
    strict({ kind: { const: 'mock' }, data: {}, delay: { type: 'integer', minimum: 0, maximum: 10_000 }, failStatus: { type: 'integer', minimum: 400, maximum: 599 } }, ['kind', 'data']),
  ],
};

function transform(customNames: readonly string[] | undefined): JsonSchema {
  return {
    oneOf: [
      strict({ op: { const: 'pick' }, fields: { type: 'array', minItems: 1, maxItems: 100, items: fieldName } }, ['op', 'fields']),
      strict({ op: { const: 'rename' }, fields: { type: 'object', additionalProperties: fieldName } }, ['op', 'fields']),
      strict({ op: { const: 'filter' }, field: fieldName, operator: { enum: FILTER_OPERATORS }, value: {} }, ['op', 'field', 'operator', 'value']),
      strict({ op: { const: 'sort' }, field: fieldName, direction: { enum: ['asc', 'desc'] } }, ['op', 'field']),
      strict({ op: { const: 'limit' }, count: { type: 'integer', minimum: 1, maximum: 100_000 } }, ['op', 'count']),
      strict(
        {
          op: { const: 'groupBy' },
          by: { type: 'array', maxItems: 10, items: fieldName },
          aggregates: { type: 'array', minItems: 1, maxItems: 20, items: strict({ fn: { enum: AGGREGATES }, field: fieldName, as: fieldName }, ['fn', 'as']) },
        },
        ['op', 'by', 'aggregates'],
      ),
      strict({ op: { const: 'custom' }, name: customNames ? { enum: customNames } : { type: 'string', pattern: WIDGET_TYPE_PATTERN }, options: { type: 'object' } }, ['op', 'name']),
    ],
  };
}

/** Returns the JSON Schema of a dashboard definition (current `schemaVersion`). */
export function definitionSchema(options: DefinitionSchemaOptions = {}): JsonSchema {
  const widgetType = options.widgetTypes ? { enum: [...options.widgetTypes] } : { type: 'string', pattern: WIDGET_TYPE_PATTERN };
  const widget = strict(
    {
      id,
      type: widgetType,
      title,
      subtitle: title,
      page: id,
      source: id,
      map: { type: 'object', propertyNames: { pattern: '^[A-Za-z][A-Za-z0-9_]{0,63}$' }, additionalProperties: pointer },
      transforms: { type: 'array', maxItems: LIMITS.transforms, items: transform(options.transforms) },
      options: { type: 'object', description: 'Type-specific options, validated by the widget type.' },
      style,
      actions: strict({ collapsible: { type: 'boolean' }, maximizable: { type: 'boolean' }, removable: { type: 'boolean' }, refreshable: { type: 'boolean' } }),
      interactions: { type: 'array', maxItems: LIMITS.interactions, items: strict({ on: { const: 'select' }, set: id, from: pointer }, ['on', 'set', 'from']) },
      layout: layout(false),
    },
    ['id', 'type', 'title', 'layout'],
  );
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'AbsoluteUI dashboard definition',
    ...strict(
      {
        schemaVersion: { const: DASHBOARD_SCHEMA_VERSION },
        id,
        title,
        description: { type: 'string', maxLength: LIMITS.text },
        grid: strict({ columns: { type: 'integer', minimum: 1, maximum: 24 }, rowHeight: { type: 'integer', minimum: 24, maximum: 600 }, gap: { type: 'integer', minimum: 0, maximum: 64 }, compaction: { enum: COMPACTIONS } }),
        breakpoints: { type: 'array', minItems: 1, maxItems: LIMITS.breakpoints, items: strict({ name: id, minWidth: { type: 'integer', minimum: 0, maximum: 10_000 }, columns: { type: 'integer', minimum: 1, maximum: 24 } }, ['name', 'minWidth', 'columns']) },
        layouts: { type: 'object', propertyNames: { pattern: ID_PATTERN }, additionalProperties: { type: 'array', maxItems: LIMITS.widgets, items: layout(true) } },
        style: strict({ density: { enum: DENSITIES }, accent: { enum: ACCENTS } }),
        pages: { type: 'array', minItems: 1, maxItems: LIMITS.pages, items: strict({ id, title }, ['id', 'title']) },
        variables: { type: 'array', maxItems: LIMITS.variables, items: variable },
        dataSources: { type: 'object', maxProperties: LIMITS.dataSources, propertyNames: { pattern: ID_PATTERN }, additionalProperties: dataSource },
        widgets: { type: 'array', maxItems: LIMITS.widgets, items: widget },
      },
      ['schemaVersion', 'id', 'title', 'widgets'],
    ),
  };
}
