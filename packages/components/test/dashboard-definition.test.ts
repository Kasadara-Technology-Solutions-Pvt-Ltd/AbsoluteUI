import { describe, expect, it } from 'vitest';
import { AbsoluteUIError } from '@absoluteui/core';
import { checkDefinition, DASHBOARD_SCHEMA_VERSION, migrateDefinition, parseDefinition, type DefinitionIssue } from '../src/dashboard/index.js';
import { definitionSchema } from '../src/dashboard/schema/index.js';

function base(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'sales',
    title: 'Sales',
    widgets: [{ id: 'w1', type: 'kpi', title: 'Revenue', layout: { x: 0, y: 0, w: 3, h: 2 } }],
    ...extra,
  };
}

function issues(input: unknown): DefinitionIssue[] {
  const r = checkDefinition(input);
  if (r.ok) throw new Error('expected issues');
  return [...r.issues];
}

function paths(input: unknown): string[] {
  return issues(input).map((i) => i.path);
}

const full = {
  schemaVersion: 1,
  id: 'sales-overview',
  title: 'Sales overview',
  description: 'Quarterly view',
  grid: { columns: 12, rowHeight: 80, gap: 16, compaction: 'vertical' },
  style: { density: 'compact', accent: 'primary' },
  pages: [{ id: 'main', title: 'Main' }, { id: 'detail', title: 'Detail' }],
  variables: [
    { id: 'period', kind: 'dateRange', label: 'Period', default: { preset: 'thisQuarter' }, businessCalendar: 'default' },
    { id: 'region', kind: 'select', label: 'Region', options: [{ value: 'eu', label: 'Europe' }, { value: 'us', label: 'Americas' }], multiple: true, default: ['eu'] },
    { id: 'top', kind: 'number', label: 'Top', default: 10, min: 1, max: 100 },
  ],
  dataSources: {
    revenue: { url: 'https://api.example.com/revenue', params: { from: '{{period.from}}', to: '{{period.to}}', region: '{{region}}', limit: 50 }, headers: { Accept: 'application/json' }, credentials: 'include', ttl: 60, refresh: 300, select: '/data' },
    search: { kind: 'http', url: '/api/search', method: 'POST', body: { top: '{{top}}', tags: ['a'] } },
    fixed: { kind: 'static', data: [{ name: 'a', value: 1 }] },
    slow: { kind: 'mock', data: { total: 5 }, delay: 500, failStatus: 503 },
  },
  widgets: [
    {
      id: 'w-revenue',
      type: 'kpi',
      title: 'Revenue',
      subtitle: 'This quarter',
      page: 'main',
      source: 'revenue',
      map: { value: '/total', delta: '/changePercent' },
      transforms: [
        { op: 'filter', field: 'region', operator: 'in', value: ['eu', 'us'] },
        { op: 'groupBy', by: ['region'], aggregates: [{ fn: 'sum', field: 'amount', as: 'total' }, { fn: 'count', as: 'n' }] },
        { op: 'sort', field: 'total', direction: 'desc' },
        { op: 'limit', count: 5 },
        { op: 'pick', fields: ['region', 'total'] },
        { op: 'rename', fields: { total: 'value' } },
        { op: 'custom', name: 'acme:fx', options: { to: 'EUR' } },
      ],
      options: { format: { style: 'currency', currency: 'EUR' }, thresholds: [{ below: 0, tone: 'danger' }] },
      style: { accent: 'chart-2', surface: 'subtle', border: true, shadow: false, header: true, density: 'compact', padding: 2 },
      actions: { collapsible: true, maximizable: true, removable: true, refreshable: true },
      interactions: [{ on: 'select', set: 'region', from: '/region' }],
      layout: { x: 0, y: 0, w: 3, h: 2, minW: 2, maxW: 6, minH: 1, maxH: 4, locked: false },
    },
    { id: 'w-table', type: 'table', title: 'Top', page: 'detail', source: 'fixed', layout: { x: 3, y: 0, w: 9, h: 4 } },
  ],
  layouts: { md: [{ id: 'w-revenue', x: 0, y: 0, w: 3, h: 2 }], sm: [{ id: 'w-table', x: 0, y: 0, w: 1, h: 4 }] },
};

describe('checkDefinition', () => {
  it('accepts a full definition and returns a normalized, deeply frozen copy', () => {
    const r = checkDefinition(full);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const d = r.definition;
    expect(d).not.toBe(full);
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.isFrozen(d.widgets[0]?.layout)).toBe(true);
    expect(Object.isFrozen(d.dataSources?.revenue)).toBe(true);
    expect(Object.isFrozen(d.widgets[0]?.options?.thresholds)).toBe(true);
    // The http kind is filled in when omitted.
    expect(d.dataSources?.revenue?.kind).toBe('http');
    expect(JSON.parse(JSON.stringify(d))).toEqual({ ...full, dataSources: { ...full.dataSources, revenue: { kind: 'http', ...full.dataSources.revenue } } });
  });

  it('accepts the minimal definition', () => {
    expect(checkDefinition(base()).ok).toBe(true);
  });

  it('rejects non-objects, class instances, and missing required keys', () => {
    expect(paths(null)).toEqual(['']);
    expect(paths(new Map())).toEqual(['']);
    expect(paths({ schemaVersion: 1 })).toEqual(expect.arrayContaining(['/id', '/title', '/widgets']));
  });

  it('rejects unknown keys at every level', () => {
    expect(paths(base({ extra: 1 }))).toEqual(['/extra']);
    const w = { id: 'w1', type: 'kpi', title: 'T', layout: { x: 0, y: 0, w: 1, h: 1, z: 1 }, css: 'x' };
    expect(paths(base({ widgets: [w] }))).toEqual(expect.arrayContaining(['/widgets/0/css', '/widgets/0/layout/z']));
  });

  it('requires the current schemaVersion', () => {
    expect(issues(base({ schemaVersion: 2 }))[0]).toMatchObject({ path: '/schemaVersion', code: 'version' });
  });

  it('reports duplicate ids and dangling references', () => {
    const widget = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'kpi', title: id, layout: { x: 0, y: 0, w: 1, h: 1 }, ...extra });
    const p = paths(
      base({
        pages: [{ id: 'p', title: 'P' }],
        widgets: [widget('a', { page: 'p', source: 'nope' }), widget('a', { page: 'missing' }), widget('b')],
        layouts: { md: [{ id: 'ghost', x: 0, y: 0, w: 1, h: 1 }] },
      }),
    );
    expect(p).toEqual(expect.arrayContaining(['/widgets/0/source', '/widgets/1/id', '/widgets/1/page', '/widgets/2/page', '/layouts/md/0/id']));
  });

  it('requires a source for map and transforms', () => {
    const w = { id: 'w1', type: 'kpi', title: 'T', map: { value: '/x' }, layout: { x: 0, y: 0, w: 1, h: 1 } };
    expect(paths(base({ widgets: [w] }))).toEqual(['/widgets/0/source']);
  });

  it('validates ids and widget type names', () => {
    const w = { id: '1bad', type: 'Bad Type', title: 'T', layout: { x: 0, y: 0, w: 1, h: 1 } };
    expect(paths(base({ id: 'has space', widgets: [w] }))).toEqual(expect.arrayContaining(['/id', '/widgets/0/id', '/widgets/0/type']));
  });

  it('checks layout bounds against the column count', () => {
    const w = (layout: Record<string, unknown>) => ({ id: 'w1', type: 'kpi', title: 'T', layout });
    expect(paths(base({ widgets: [w({ x: 10, y: 0, w: 3, h: 1 })] }))).toEqual(['/widgets/0/layout/w']);
    expect(paths(base({ grid: { columns: 4 }, widgets: [w({ x: 0, y: 0, w: 5, h: 1 })] }))).toEqual(['/widgets/0/layout/w']);
    expect(paths(base({ widgets: [w({ x: 0, y: 0, w: 1, h: 1, minW: 2 })] }))).toEqual(['/widgets/0/layout/w']);
    expect(paths(base({ widgets: [w({ x: 0.5, y: -1, w: 1, h: 1 })] }))).toEqual(expect.arrayContaining(['/widgets/0/layout/x', '/widgets/0/layout/y']));
  });

  it('checks breakpoints and per-breakpoint layouts', () => {
    expect(paths(base({ breakpoints: [{ name: 'lg', minWidth: 900, columns: 12 }] }))).toEqual(['/breakpoints']);
    expect(paths(base({ breakpoints: [{ name: 'lg', minWidth: 900, columns: 8 }, { name: 'sm', minWidth: 0, columns: 1 }] }))).toEqual(['/breakpoints']);
    const ok = base({ breakpoints: [{ name: 'wide', minWidth: 800, columns: 12 }, { name: 'narrow', minWidth: 0, columns: 2 }], layouts: { narrow: [{ id: 'w1', x: 0, y: 0, w: 2, h: 2 }] } });
    expect(checkDefinition(ok).ok).toBe(true);
    expect(paths(base({ layouts: { xl: [] } }))).toEqual(['/layouts/xl']);
    expect(paths(base({ layouts: { sm: [{ id: 'w1', x: 0, y: 0, w: 2, h: 1 }] } }))).toEqual(['/layouts/sm/0/w']);
  });

  it('checks variables', () => {
    const p = paths(
      base({
        variables: [
          { id: 'v', kind: 'select', label: 'V', options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }], default: 'z' },
          { id: 'v', kind: 'dateRange', label: 'D', default: { from: '2026-02-10', to: '2026-01-01' } },
          { id: 'n', kind: 'number', label: 'N', min: 5, max: 1 },
          { id: 'x', kind: 'color', label: 'X' },
        ],
      }),
    );
    expect(p).toEqual(expect.arrayContaining(['/variables/0/options/1/value', '/variables/0/default', '/variables/1/id', '/variables/1/default/to', '/variables/2/min', '/variables/3/kind']));
  });

  describe('data sources (R18-6)', () => {
    const src = (def: unknown, extra: Record<string, unknown> = {}) => base({ dataSources: { s: def }, ...extra });

    it('accepts absolute http(s) URLs and root-relative paths only', () => {
      for (const url of ['https://api.example.com/x', 'http://localhost:4000/x?y=1', '/api/x']) expect(checkDefinition(src({ url })).ok, url).toBe(true);
      for (const url of ['javascript:alert(1)', 'data:text/plain,x', 'ftp://example.com/x', '//evil.example/x', 'api/x', 'https://user:pass@example.com/', 'https://example.com/{{v}}', 'https://exa mple.com/', `https://example.com/${'a'.repeat(2100)}`]) {
        expect(paths(src({ url })), url).toEqual(['/dataSources/s/url']);
      }
    });

    it('forbids authentication and browser-controlled headers', () => {
      for (const name of ['Authorization', 'cookie', 'Proxy-Authorization', 'Sec-Fetch-Mode', 'Host', 'Origin', 'Referer']) {
        expect(issues(src({ url: '/x', headers: { [name]: 'v' } }))[0], name).toMatchObject({ path: `/dataSources/s/headers/${name}`, code: 'forbidden-header' });
      }
      expect(paths(src({ url: '/x', headers: { 'X-Ok': 'a\r\nInjected: 1' } }))).toEqual(['/dataSources/s/headers/X-Ok']);
      expect(paths(src({ url: '/x', headers: { 'Bad Name': 'v' } }))).toEqual(['/dataSources/s/headers/Bad Name']);
      expect(checkDefinition(src({ url: '/x', headers: { 'X-Tenant': 'acme', Accept: 'application/json' } })).ok).toBe(true);
    });

    it('never echoes received values in issues', () => {
      const secret = 'Bearer s3cr3t-token-value';
      const all = JSON.stringify(issues(src({ url: '/x', headers: { Authorization: secret } })));
      expect(all).not.toContain('s3cr3t');
    });

    it('requires placeholders to name declared variables and keeps them out of URLs and headers', () => {
      expect(issues(src({ url: '/x', params: { q: '{{missing}}' } }))[0]).toMatchObject({ path: '/dataSources/s', code: 'reference' });
      expect(issues(src({ url: '/x', method: 'POST', body: { a: ['{{nope.from}}'] } }))[0]).toMatchObject({ code: 'reference' });
      expect(checkDefinition(src({ url: '/x', params: { q: '{{ q }}' } }, { variables: [{ id: 'q', kind: 'text', label: 'Q' }] })).ok).toBe(true);
      expect(paths(src({ url: '/x', headers: { 'X-Q': '{{q}}' } }, { variables: [{ id: 'q', kind: 'text', label: 'Q' }] }))).toEqual(['/dataSources/s/headers/X-Q']);
    });

    it('allows a body only with POST and validates limits', () => {
      expect(paths(src({ url: '/x', body: { a: 1 } }))).toEqual(['/dataSources/s/body']);
      expect(paths(src({ url: '/x', refresh: 5 }))).toEqual(['/dataSources/s/refresh']);
      expect(checkDefinition(src({ url: '/x', refresh: 0 })).ok).toBe(true);
      expect(paths(src({ url: '/x', timeout: 0, maxBytes: 10, ttl: -1 }))).toEqual(expect.arrayContaining(['/dataSources/s/timeout', '/dataSources/s/maxBytes', '/dataSources/s/ttl']));
      expect(paths(src({ url: '/x', credentials: 'always' }))).toEqual(['/dataSources/s/credentials']);
    });

    it('rejects prototype keys in records and pointers', () => {
      const params = JSON.parse('{"__proto__": "x"}') as unknown;
      expect(issues(src({ url: '/x', params }))[0]).toMatchObject({ path: '/dataSources/s/params/__proto__', code: 'unsafe-key' });
      expect(issues(src({ url: '/x', select: '/a/__proto__/b' }))[0]).toMatchObject({ code: 'unsafe-key' });
      const options = JSON.parse('{"nested": {"constructor": 1}}') as unknown;
      const w = { id: 'w1', type: 'kpi', title: 'T', options, layout: { x: 0, y: 0, w: 1, h: 1 } };
      expect(paths(base({ widgets: [w] }))).toEqual(['/widgets/0/options/nested/constructor']);
    });
  });

  it('accepts only plain JSON in options and static data, within size limits', () => {
    const w = (options: unknown) => ({ id: 'w1', type: 'kpi', title: 'T', options, layout: { x: 0, y: 0, w: 1, h: 1 } });
    expect(paths(base({ widgets: [w({ when: new Date(0) })] }))).toEqual(['/widgets/0/options/when']);
    expect(paths(base({ widgets: [w({ n: Number.NaN })] }))).toEqual(['/widgets/0/options/n']);
    expect(paths(base({ widgets: [w({ f: () => 1 })] }))).toEqual(['/widgets/0/options/f']);
    let deep: unknown = 1;
    for (let i = 0; i < 25; i++) deep = { d: deep };
    expect(issues(base({ widgets: [w(deep)] }))[0]).toMatchObject({ path: '/widgets/0/options', code: 'size' });
    expect(issues(base({ dataSources: { s: { kind: 'static', data: Array.from({ length: 10_001 }, () => 0) } } }))[0]).toMatchObject({ code: 'size' });
  });

  it('validates transforms', () => {
    const w = (transforms: unknown) => ({ id: 'w1', type: 'kpi', title: 'T', source: 's', transforms, layout: { x: 0, y: 0, w: 1, h: 1 } });
    const doc = (transforms: unknown) => base({ dataSources: { s: { kind: 'static', data: [] } }, widgets: [w(transforms)] });
    expect(paths(doc([{ op: 'eval', code: 'x' }]))).toEqual(['/widgets/0/transforms/0/op']);
    expect(paths(doc([{ op: 'filter', field: 'a', operator: 'in', value: 1 }]))).toEqual(['/widgets/0/transforms/0/value']);
    expect(paths(doc([{ op: 'groupBy', by: [], aggregates: [{ fn: 'sum', as: 's' }] }]))).toEqual(['/widgets/0/transforms/0/aggregates/0/field']);
    expect(paths(doc([{ op: 'custom', name: 'Not Valid' }]))).toEqual(['/widgets/0/transforms/0/name']);
    expect(paths(doc(Array.from({ length: 21 }, () => ({ op: 'limit', count: 1 }))))).toEqual(['/widgets/0/transforms']);
  });

  it('caps the number of issues', () => {
    const widgets = Array.from({ length: 200 }, () => ({ id: 1 }));
    expect(issues(base({ widgets })).length).toBe(100);
  });
});

describe('migrateDefinition and parseDefinition', () => {
  it('passes current documents through and rejects missing or newer versions', () => {
    const doc = base();
    expect(migrateDefinition(doc)).toBe(doc);
    expect(() => migrateDefinition({})).toThrow(AbsoluteUIError);
    expect(() => migrateDefinition(base({ schemaVersion: DASHBOARD_SCHEMA_VERSION + 1 }))).toThrow(/DASHBOARD_DEFINITION_VERSION/);
    expect(() => migrateDefinition([])).toThrow(/DASHBOARD_DEFINITION_VERSION/);
  });

  it('parseDefinition returns the definition or throws with the first issue path', () => {
    expect(parseDefinition(base()).id).toBe('sales');
    try {
      parseDefinition(base({ title: '', extra: true }));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AbsoluteUIError);
      const e = error as AbsoluteUIError;
      expect(e.code).toBe('DASHBOARD_DEFINITION');
      expect(e.category).toBe('validation');
      expect(e.details.property).toBe('/extra');
      expect(e.message).toContain('2 issues');
    }
  });
});

describe('definitionSchema (R18-3)', () => {
  it('describes the document with closed objects', () => {
    const s = definitionSchema();
    expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(['schemaVersion', 'id', 'title', 'widgets']);
    const props = s.properties as Record<string, Record<string, unknown>>;
    expect(Object.keys(props).sort()).toEqual(['breakpoints', 'dataSources', 'description', 'grid', 'id', 'layouts', 'pages', 'schemaVersion', 'style', 'title', 'variables', 'widgets']);
    expect(props.schemaVersion).toEqual({ const: DASHBOARD_SCHEMA_VERSION });
    // Round trip: the schema is plain JSON.
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('restricts widget types and custom transforms when names are given', () => {
    const s = JSON.stringify(definitionSchema({ widgetTypes: ['kpi', 'line-chart'], transforms: ['acme:fx'] }));
    expect(s).toContain('"enum":["kpi","line-chart"]');
    expect(s).toContain('"enum":["acme:fx"]');
  });

  it('header name patterns reject auth headers case-insensitively', () => {
    const s = definitionSchema() as { properties: { dataSources: { additionalProperties: { oneOf: { properties: { headers: { propertyNames: { not: { pattern: string } } } } }[] } } } };
    const pattern = new RegExp(s.properties.dataSources.additionalProperties.oneOf[0]?.properties.headers.propertyNames.not.pattern ?? '');
    for (const name of ['Authorization', 'AUTHORIZATION', 'cookie', 'Proxy-Foo', 'sec-ch-ua']) expect(pattern.test(name), name).toBe(true);
    for (const name of ['Accept', 'X-Tenant']) expect(pattern.test(name), name).toBe(false);
  });
});
