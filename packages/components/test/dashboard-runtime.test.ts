import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, plainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '../src/business-calendar/engine.js';
import {
  applyTransforms,
  Dashboard,
  DashboardDataError,
  defaultFetcher,
  resolvePreset,
  TransformError,
  TransformRegistry,
  WidgetRegistry,
  type DashboardFetcher,
  type DashboardRequest,
  type DashboardWidgetErrorDetail,
  type WidgetType,
} from '../src/dashboard/index.js';
import { DataStore } from '../src/dashboard/data.js';
import { registerBuiltInWidgets } from '../src/dashboard/widgets/index.js';

const hosts: HTMLElement[] = [];
const dashboards: Dashboard[] = [];

afterEach(() => {
  for (const d of dashboards.splice(0)) d.destroy();
  for (const h of hosts.splice(0)) h.remove();
});

function host(): HTMLElement {
  const el = document.createElement('div');
  el.style.inlineSize = '1200px';
  document.body.append(el);
  hosts.push(el);
  return el;
}

function registry(): WidgetRegistry {
  const r = new WidgetRegistry();
  registerBuiltInWidgets(r);
  return r;
}

async function settle(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
}

function make(definition: Record<string, unknown>, extra: Record<string, unknown> = {}): Dashboard {
  const d = Dashboard.create(host(), { definition: { schemaVersion: 1, id: 'd', title: 'Test', ...definition }, registry: registry(), lazy: false, ...extra });
  dashboards.push(d);
  return d;
}

function recordingFetcher(respond: (r: DashboardRequest) => unknown): { fetcher: DashboardFetcher; calls: DashboardRequest[] } {
  const calls: DashboardRequest[] = [];
  return {
    calls,
    fetcher: (request) => {
      calls.push(request);
      try {
        return Promise.resolve(respond(request));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error('failed'));
      }
    },
  };
}

const layout = (x: number, w = 3) => ({ x, y: 0, w, h: 2 });

describe('Dashboard rendering (D1)', () => {
  it('renders built-in widgets from static data with titles as region names', async () => {
    const d = make({
      dataSources: { totals: { kind: 'static', data: { revenue: 1200, prev: 1000, rows: [{ region: 'EU', amount: 5 }, { region: 'US', amount: 7 }] } } },
      widgets: [
        { id: 'kpi', type: 'kpi', title: 'Revenue', source: 'totals', map: { value: '/revenue', previous: '/prev' }, layout: layout(0) },
        { id: 'list', type: 'list', title: 'Regions', source: 'totals', map: { rows: '/rows' }, options: { label: 'region', value: 'amount' }, layout: layout(3) },
        { id: 'note', type: 'text', title: 'Note', options: { text: 'First.\n\nSecond.' }, layout: layout(6) },
      ],
    });
    await settle();
    expect(d.widgetStatus('kpi')).toBe('ready');
    expect(d.widgetElement('kpi')?.getAttribute('role')).toBe('region');
    expect(d.widgetElement('kpi')?.textContent).toContain('Revenue');
    expect(d.widgetElement('kpi')?.querySelector('.aui-stat-card')).not.toBeNull();
    const items = [...(d.widgetElement('list')?.querySelectorAll('li') ?? [])].map((li) => li.textContent);
    expect(items).toEqual(['EU5', 'US7']);
    expect(d.widgetElement('note')?.querySelectorAll('p.aui-dashboard-text').length).toBe(2);
  });

  it('shows an error state for unknown types and invalid options, and emits aui-widget-error', async () => {
    const errors: DashboardWidgetErrorDetail[] = [];
    const h = host();
    h.addEventListener('aui-widget-error', (e) => errors.push((e as CustomEvent<DashboardWidgetErrorDetail>).detail));
    const d = Dashboard.create(h, {
      definition: { schemaVersion: 1, id: 'd', title: 'T', widgets: [{ id: 'a', type: 'nope', title: 'A', layout: layout(0) }, { id: 'b', type: 'text', title: 'B', options: { text: 5 }, layout: layout(3) }] },
      registry: registry(),
      lazy: false,
    });
    dashboards.push(d);
    await settle();
    expect(d.widgetStatus('a')).toBe('error');
    expect(d.widgetElement('a')?.textContent).toContain('Unknown widget type "nope"');
    expect(d.widgetElement('b')?.textContent).toContain('options/text');
    expect(errors.map((e) => e.kind)).toEqual(['unknown-type', 'options']);
  });

  it('applies style options as data attributes and density on the root', () => {
    const d = make({ style: { density: 'compact' }, widgets: [{ id: 'a', type: 'text', title: 'A', options: { text: 'x' }, style: { accent: 'chart-3', surface: 'subtle', border: false, header: false, padding: 0 }, layout: layout(0) }] });
    const el = d.widgetElement('a');
    expect(d.host.dataset.auiDensity).toBe('compact');
    expect(el?.dataset.auiAccent).toBe('chart-3');
    expect(el?.dataset.auiSurface).toBe('subtle');
    expect(el?.dataset.auiBorder).toBe('false');
    expect(el?.dataset.auiHeader).toBe('false');
    expect(el?.dataset.auiPadding).toBe('0');
  });

  it('rejects invalid definitions and edit mode without editable', () => {
    expect(() => make({ widgets: [{ id: 'a' }] })).toThrow(AbsoluteUIError);
    expect(() => make({ widgets: [] }, { mode: 'edit' })).toThrow(/editable/);
    expect(() => make({ widgets: [] }, { allowedOrigins: ['https://x.example/path'] })).toThrow(/allowed origins/i);
  });

  it('renders only the first page, and switches pages', async () => {
    const d = make({ pages: [{ id: 'p1', title: 'One' }, { id: 'p2', title: 'Two' }], widgets: [{ id: 'a', type: 'text', title: 'A', page: 'p1', options: { text: 'a' }, layout: layout(0) }, { id: 'b', type: 'text', title: 'B', page: 'p2', options: { text: 'b' }, layout: layout(0) }] });
    expect(d.widgetElement('a')).toBeDefined();
    expect(d.widgetElement('b')).toBeUndefined();
    d.setPage('p2');
    await settle();
    expect(d.page).toBe('p2');
    expect(d.widgetElement('a')).toBeUndefined();
    expect(d.widgetStatus('b')).toBe('ready');
  });

  it('shows the empty state for empty data', async () => {
    const d = make({ dataSources: { s: { kind: 'static', data: [] } }, widgets: [{ id: 'a', type: 'list', title: 'A', source: 's', options: { label: 'x' }, layout: layout(0) }] });
    await settle();
    expect(d.widgetStatus('a')).toBe('empty');
    expect(d.widgetElement('a')?.textContent).toContain('No data');
  });

  it('shows a transform error when data has the wrong shape', async () => {
    const d = make({ dataSources: { s: { kind: 'static', data: { not: 'rows' } } }, widgets: [{ id: 'a', type: 'list', title: 'A', source: 's', transforms: [{ op: 'limit', count: 1 }], options: { label: 'x' }, layout: layout(0) }] });
    await settle();
    expect(d.widgetStatus('a')).toBe('error');
    expect(d.widgetElement('a')?.textContent).toContain('does not fit');
  });
});

describe('Dashboard data (D2)', () => {
  const kpi = (source = 'api', id = 'k', x = 0) => ({ id, type: 'kpi', title: `KPI ${id}`, source, map: { value: '/total' }, layout: layout(x) });

  it('calls the host fetcher with interpolated parameters and same-origin credentials', async () => {
    const { fetcher, calls } = recordingFetcher(() => ({ total: 42 }));
    const d = make(
      {
        variables: [{ id: 'region', kind: 'select', label: 'Region', options: [{ value: 'eu', label: 'EU' }, { value: 'us', label: 'US' }] }, { id: 'period', kind: 'dateRange', label: 'Period', default: { from: '2026-01-01', to: '2026-03-31' } }],
        dataSources: { api: { url: '/api/totals', params: { region: '{{region}}', from: '{{period.from}}', to: '{{period.to}}', top: 5 }, headers: { 'X-Tenant': 'acme' } } },
        widgets: [kpi()],
      },
      { fetcher },
    );
    await settle();
    expect(calls.length).toBe(1);
    const url = new URL(calls[0]?.url ?? '');
    expect(url.origin).toBe(location.origin);
    expect(url.pathname).toBe('/api/totals');
    expect(Object.fromEntries(url.searchParams)).toEqual({ region: 'eu', from: '2026-01-01', to: '2026-03-31', top: '5' });
    expect(calls[0]?.credentials).toBe('same-origin');
    expect(calls[0]?.headers).toEqual({ 'X-Tenant': 'acme' });
    expect(d.widgetStatus('k')).toBe('ready');
    expect(d.widgetElement('k')?.textContent).toContain('42');

    expect(d.setVariable('region', 'us')).toBe(true);
    expect(d.setVariable('region', 'mars')).toBe(false);
    await settle();
    expect(calls.length).toBe(2);
    expect(new URL(calls[1]?.url ?? '').searchParams.get('region')).toBe('us');
  });

  it('blocks origins that are not allow-listed (R18-6)', async () => {
    const { fetcher, calls } = recordingFetcher(() => ({ total: 1 }));
    const d = make({ dataSources: { api: { url: 'https://evil.example/data' } }, widgets: [kpi()] }, { fetcher });
    await settle();
    expect(calls.length).toBe(0);
    expect(d.widgetStatus('k')).toBe('error');
    expect(d.widgetElement('k')?.textContent).toContain('not allowed');
    // Blocked sources offer no retry button.
    expect(d.widgetElement('k')?.querySelector('.aui-dashboard-widget__retry')).toBeNull();
  });

  it('allows listed origins, including credentials: include', async () => {
    const { fetcher, calls } = recordingFetcher(() => ({ total: 3 }));
    make({ dataSources: { api: { url: 'https://api.example.com/data', credentials: 'include' } }, widgets: [kpi()] }, { fetcher, allowedOrigins: ['https://api.example.com'] });
    await settle();
    expect(calls.map((c) => [c.url, c.credentials])).toEqual([['https://api.example.com/data', 'include']]);
  });

  it('shares one request between widgets of the same source', async () => {
    const { fetcher, calls } = recordingFetcher(() => ({ total: 9 }));
    const d = make({ dataSources: { api: { url: '/x' } }, widgets: [kpi('api', 'a', 0), kpi('api', 'b', 3), kpi('api', 'c', 6)] }, { fetcher });
    await settle();
    expect(calls.length).toBe(1);
    expect(['a', 'b', 'c'].map((id) => d.widgetStatus(id))).toEqual(['ready', 'ready', 'ready']);
  });

  it('shows an error with retry, and retry loads again', async () => {
    let fail = true;
    const { fetcher, calls } = recordingFetcher(() => {
      if (fail) throw new DashboardDataError('http', 'no', 500);
      return { total: 5 };
    });
    const d = make({ dataSources: { api: { url: '/x', method: 'POST' } }, widgets: [kpi()] }, { fetcher });
    await settle();
    expect(d.widgetStatus('k')).toBe('error');
    expect(d.widgetElement('k')?.textContent).toContain('500');
    fail = false;
    d.widgetElement('k')?.querySelector<HTMLButtonElement>('.aui-dashboard-widget__retry')?.click();
    await settle();
    expect(calls.length).toBe(2);
    expect(d.widgetStatus('k')).toBe('ready');
  });

  it('keeps the last data and marks it stale when a refresh fails', async () => {
    let fail = false;
    const { fetcher } = recordingFetcher(() => {
      if (fail) throw new DashboardDataError('http', 'no', 503);
      return { total: 5 };
    });
    const d = make({ dataSources: { api: { url: '/x', method: 'POST' } }, widgets: [kpi()] }, { fetcher, retries: 0 });
    await settle();
    expect(d.widgetElement('k')?.querySelector('time')).not.toBeNull();
    fail = true;
    d.refresh();
    await settle();
    expect(d.widgetStatus('k')).toBe('stale');
    expect(d.widgetElement('k')?.querySelector('.aui-dashboard-widget__footer')?.textContent).toContain('Could not refresh');
    expect(d.widgetElement('k')?.textContent).toContain('5');
  });

  it('applies transforms and interactions: selecting a list row sets a variable', async () => {
    const { fetcher, calls } = recordingFetcher(() => ({ total: 1 }));
    const d = make(
      {
        variables: [{ id: 'region', kind: 'text', label: 'Region' }],
        dataSources: {
          rows: { kind: 'static', data: [{ r: 'EU', v: 2 }, { r: 'US', v: 9 }, { r: 'EU', v: 3 }] },
          api: { url: '/x', params: { region: '{{region}}' } },
        },
        widgets: [
          { id: 'l', type: 'list', title: 'L', source: 'rows', transforms: [{ op: 'groupBy', by: ['r'], aggregates: [{ fn: 'sum', field: 'v', as: 'v' }] }, { op: 'sort', field: 'v', direction: 'desc' }], options: { label: 'r', value: 'v', selectable: true }, interactions: [{ on: 'select', set: 'region', from: '/r' }], layout: layout(0) },
          kpi('api', 'k', 3),
        ],
      },
      { fetcher },
    );
    await settle();
    const buttons = [...(d.widgetElement('l')?.querySelectorAll('button') ?? [])];
    expect(buttons.map((b) => b.textContent)).toEqual(['US', 'EU']);
    buttons[1]?.click();
    await settle();
    expect(d.variables.region).toBe('EU');
    expect(new URL(calls.at(-1)?.url ?? '').searchParams.get('region')).toBe('EU');
  });

  it('runs custom widget types and passes data, inputs, and options', async () => {
    const seen: unknown[] = [];
    const r = new WidgetRegistry();
    const custom: WidgetType = {
      label: 'Custom',
      defaultSize: { w: 2, h: 2 },
      create: (ctx) => ({
        update: (data) => {
          seen.push(data);
          ctx.body.textContent = 'custom';
        },
        destroy: () => undefined,
      }),
    };
    r.register('acme:thing', custom);
    const d = Dashboard.create(host(), { definition: { schemaVersion: 1, id: 'd', title: 'T', dataSources: { s: { kind: 'static', data: { a: 1 } } }, widgets: [{ id: 'w', type: 'acme:thing', title: 'W', source: 's', map: { a: '/a' }, options: { o: true }, layout: layout(0) }] }, registry: r, lazy: false });
    dashboards.push(d);
    await settle();
    expect(seen).toEqual([{ data: { a: 1 }, inputs: { a: 1 }, options: { o: true } }]);
  });
});

describe('DataStore', () => {
  it('retries GET on 503 with backoff and gives up on 404', async () => {
    let n = 0;
    const store = new DataStore({ retryDelay: 1, fetcher: () => (++n < 3 ? Promise.reject(new DashboardDataError('http', 'x', 503)) : Promise.resolve({ ok: 1 })) });
    await expect(store.load('s', { kind: 'http', url: '/x' }, new Map())).resolves.toMatchObject({ data: { ok: 1 } });
    expect(n).toBe(3);
    let m = 0;
    const store404 = new DataStore({ retryDelay: 1, fetcher: () => (++m, Promise.reject(new DashboardDataError('http', 'x', 404))) });
    await expect(store404.load('s', { kind: 'http', url: '/x' }, new Map())).rejects.toMatchObject({ status: 404 });
    expect(m).toBe(1);
  });

  it('caches within ttl, and force refreshes', async () => {
    let n = 0;
    const store = new DataStore({ fetcher: () => Promise.resolve({ n: ++n }) });
    const def = { kind: 'http' as const, url: '/x', ttl: 60 };
    await store.load('s', def, new Map());
    await store.load('s', def, new Map());
    expect(n).toBe(1);
    await store.load('s', def, new Map(), true);
    expect(n).toBe(2);
  });

  it('times out slow fetchers and aborts their signal', async () => {
    let aborted = false;
    const store = new DataStore({
      retries: 0,
      fetcher: (_r, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('abort'));
          });
        }),
    });
    await expect(store.load('s', { kind: 'http', url: '/x', timeout: 1 }, new Map())).rejects.toMatchObject({ kind: 'timeout' });
    expect(aborted).toBe(true);
  }, 5000);

  it('mock sources delay and fail', async () => {
    const store = new DataStore();
    await expect(store.load('m', { kind: 'mock', data: { a: 1 }, delay: 5 }, new Map())).resolves.toMatchObject({ data: { a: 1 } });
    await expect(store.load('f', { kind: 'mock', data: null, failStatus: 502 }, new Map())).rejects.toMatchObject({ status: 502 });
  });

  it('defaultFetcher enforces the size limit and JSON', async () => {
    const blob = (text: string, type = 'application/json') => URL.createObjectURL(new Blob([text], { type }));
    const req = (url: string, maxBytes = 1024): DashboardRequest => ({ source: 's', url, method: 'GET', headers: {}, credentials: 'same-origin', timeoutMs: 5000, maxBytes });
    await expect(defaultFetcher(req(blob('{"a":1}')), new AbortController().signal)).resolves.toEqual({ a: 1 });
    await expect(defaultFetcher(req(blob(`[${'1,'.repeat(2000)}1]`)), new AbortController().signal)).rejects.toMatchObject({ kind: 'too-large' });
    await expect(defaultFetcher(req(blob('<html>')), new AbortController().signal)).rejects.toMatchObject({ kind: 'parse' });
    await expect(defaultFetcher(req(blob('{"__proto__":{"x":1},"a":2}')), new AbortController().signal)).resolves.toEqual({ a: 2 });
  });
});

describe('transforms', () => {
  const rows = [
    { name: 'a', region: 'EU', amount: 5 },
    { name: 'b', region: 'US', amount: null },
    { name: 'c', region: 'EU', amount: 2 },
    { name: 'd', region: 'US', amount: 7 },
  ];

  it('filters, sorts with nulls last, limits, picks, and renames', () => {
    expect(applyTransforms(rows, [{ op: 'filter', field: 'region', operator: 'eq', value: 'EU' }])).toEqual([rows[0], rows[2]]);
    expect(applyTransforms(rows, [{ op: 'filter', field: 'amount', operator: 'gte', value: 5 }])).toEqual([rows[0], rows[3]]);
    expect(applyTransforms(rows, [{ op: 'filter', field: 'name', operator: 'in', value: ['b', 'd'] }])).toEqual([rows[1], rows[3]]);
    expect((applyTransforms(rows, [{ op: 'sort', field: 'amount', direction: 'desc' }]) as typeof rows).map((r) => r.name)).toEqual(['d', 'a', 'c', 'b']);
    expect((applyTransforms(rows, [{ op: 'sort', field: 'amount' }]) as typeof rows).map((r) => r.name)).toEqual(['c', 'a', 'd', 'b']);
    expect(applyTransforms(rows, [{ op: 'limit', count: 1 }, { op: 'pick', fields: ['name'] }, { op: 'rename', fields: { name: 'label' } }])).toEqual([{ label: 'a' }]);
  });

  it('groups with aggregates and grand totals', () => {
    expect(applyTransforms(rows, [{ op: 'groupBy', by: ['region'], aggregates: [{ fn: 'sum', field: 'amount', as: 'total' }, { fn: 'count', as: 'n' }, { fn: 'avg', field: 'amount', as: 'avg' }] }])).toEqual([
      { region: 'EU', total: 7, n: 2, avg: 3.5 },
      { region: 'US', total: 7, n: 2, avg: 7 },
    ]);
    expect(applyTransforms(rows, [{ op: 'groupBy', by: [], aggregates: [{ fn: 'max', field: 'amount', as: 'max' }, { fn: 'min', field: 'amount', as: 'min' }] }])).toEqual([{ max: 7, min: 2 }]);
    expect(applyTransforms([], [{ op: 'groupBy', by: [], aggregates: [{ fn: 'sum', field: 'x', as: 's' }, { fn: 'count', as: 'n' }] }])).toEqual([{ s: null, n: 0 }]);
  });

  it('never reads prototype members and reports shape errors', () => {
    expect(applyTransforms([{}], [{ op: 'pick', fields: ['toString', 'constructor'] }])).toEqual([{}]);
    expect(applyTransforms([{}], [{ op: 'filter', field: 'toString', operator: 'eq', value: null }])).toEqual([]);
    expect(() => applyTransforms({ a: 1 }, [{ op: 'sort', field: 'a' }])).toThrow(TransformError);
  });

  it('runs registered custom transforms only', () => {
    const reg = new TransformRegistry();
    reg.register('acme:double', (data, options) => (data as number[]).map((n) => n * (typeof options.by === 'number' ? options.by : 2)));
    expect(applyTransforms([1, 2], [{ op: 'custom', name: 'acme:double', options: { by: 3 } }], reg)).toEqual([3, 6]);
    expect(() => applyTransforms([1], [{ op: 'custom', name: 'acme:missing' }], reg)).toThrow(/No transform named/);
  });
});

describe('date presets', () => {
  const today = plainDate(2026, 11, 21); // Saturday

  it('resolves calendar presets', () => {
    expect(resolvePreset('today', { today })).toEqual({ from: '2026-11-21', to: '2026-11-21' });
    expect(resolvePreset('last7Days', { today })).toEqual({ from: '2026-11-15', to: '2026-11-21' });
    expect(resolvePreset('thisQuarter', { today })).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(resolvePreset('lastMonth', { today })).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(resolvePreset('yearToDate', { today })).toEqual({ from: '2026-01-01', to: '2026-11-21' });
    expect(resolvePreset('lastYear', { today })).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('business-day presets skip weekends and holidays of the business calendar', () => {
    expect(resolvePreset('last5BusinessDays', { today })).toEqual({ from: '2026-11-16', to: '2026-11-20' });
    const calendar = createBusinessCalendar({ holidays: [{ date: plainDate(2026, 11, 19), name: 'Holiday' }] });
    expect(resolvePreset('last5BusinessDays', { today, calendar })).toEqual({ from: '2026-11-13', to: '2026-11-20' });
  });
});
