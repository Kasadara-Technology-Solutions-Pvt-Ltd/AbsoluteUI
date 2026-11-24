import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import {
  createLocalPivotSource,
  PivotFieldList,
  PivotGrid,
  type PivotGridLayoutChangeDetail,
  type PivotDataSource,
  type PivotField,
  type PivotGridLoadErrorDetail,
  type PivotQuery,
} from '@absoluteui/components/pivot-grid';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface Sale {
  region: string;
  city: string;
  quarter: string;
  product: string;
  amount: number | null;
  units: number;
}

const sales: Sale[] = [
  { region: 'North', city: 'Oslo', quarter: 'Q1', product: 'A', amount: 100, units: 1 },
  { region: 'North', city: 'Oslo', quarter: 'Q2', product: 'B', amount: 50, units: 2 },
  { region: 'North', city: 'Bergen', quarter: 'Q1', product: 'A', amount: 30, units: 3 },
  { region: 'South', city: 'Rome', quarter: 'Q1', product: 'B', amount: 200, units: 4 },
  { region: 'South', city: 'Rome', quarter: 'Q2', product: 'A', amount: null, units: 5 },
  { region: 'South', city: 'Naples', quarter: 'Q2', product: 'A', amount: 70, units: 6 },
];

const fields: PivotField<Sale>[] = [
  { id: 'region', label: 'Region' },
  { id: 'city', label: 'City' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'product', label: 'Product', areas: ['rows', 'columns', 'filters'] },
  { id: 'amount', label: 'Amount', numberFormat: { style: 'currency', currency: 'EUR' } },
  { id: 'units', label: 'Units' },
];

const baseQuery: PivotQuery = { rows: ['region'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' }], include: {}, rowParents: [[]], columnParents: [[]] };

describe('local pivot engine', () => {
  const source = createLocalPivotSource(sales, fields);
  const value = (cells: ReturnType<typeof source.compute>['cells'], row: unknown[], column: unknown[], i = 0): number | null | undefined =>
    cells.find((c) => JSON.stringify(c.row) === JSON.stringify(row) && JSON.stringify(c.column) === JSON.stringify(column))?.values[i];

  it('aggregates the requested parents and their children, including totals', () => {
    const { cells } = source.compute(baseQuery);
    expect(value(cells, [], [])).toBe(450);
    expect(value(cells, ['North'], [])).toBe(180);
    expect(value(cells, ['South'], ['Q2'])).toBe(70);
    expect(value(cells, [], ['Q1'])).toBe(330);
    // Only the top level was requested: no city rows.
    expect(cells.some((c) => c.row.length > 1)).toBe(false);
  });

  it('delta queries return one level below the given parents', () => {
    const { cells } = source.compute({ ...baseQuery, rows: ['region', 'city'], rowParents: [['South']] });
    expect(cells.every((c) => c.row[0] === 'South')).toBe(true);
    expect(value(cells, ['South', 'Rome'], [])).toBe(200);
    expect(value(cells, ['South', 'Naples'], ['Q2'])).toBe(70);
  });

  it('count, average, min, max, and distinct count skip empty values', () => {
    const q: PivotQuery = { ...baseQuery, columns: [], values: [{ field: 'amount', aggregate: 'count' }, { field: 'amount', aggregate: 'average' }, { field: 'units', aggregate: 'min' }, { field: 'units', aggregate: 'max' }, { field: 'product', aggregate: 'distinctCount' }] };
    // Duplicate value fields are a layout error, but the engine itself accepts them.
    const { cells } = source.compute(q);
    expect(cells.find((c) => c.row[0] === 'South' && c.column.length === 0)?.values).toEqual([2, 135, 4, 6, 2]);
  });

  it('include filters and paged, searchable members', async () => {
    const { cells } = source.compute({ ...baseQuery, include: { product: ['A'] } });
    expect(value(cells, [], [])).toBe(200);
    const signal = new AbortController().signal;
    const page = await source.members({ field: 'city', include: { region: ['North'] }, search: '', offset: 0, limit: 1 }, signal);
    expect(page).toEqual({ members: [{ key: 'Bergen' }], total: 2 });
    const found = await source.members({ field: 'city', include: {}, search: 'na', offset: 0, limit: 10 }, signal);
    expect(found.members.map((m) => m.key)).toEqual(['Naples']);
  });

  it('rejects aborted requests', async () => {
    const c = new AbortController();
    c.abort(new DOMException('stop', 'AbortError'));
    await expect(source.query(baseQuery, c.signal)).rejects.toThrow('stop');
  });
});

function mount(options: Partial<Parameters<typeof PivotGrid.create<Sale>>[1]> = {}): { grid: PivotGrid<Sale>; host: HTMLDivElement } {
  const host = document.createElement('div');
  document.body.append(host);
  const grid = PivotGrid.create<Sale>(host, {
    caption: 'Sales',
    fields,
    data: sales,
    layout: { rows: ['region', 'city'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' }] },
    locale: 'en-US',
    ...options,
  });
  return { grid, host };
}

const text = (el: Element | null | undefined): string => el?.textContent.replace(/\s+/g, ' ').trim() ?? '';
const rowHeaders = (host: HTMLElement): string[] => [...host.querySelectorAll('tbody th')].map((th) => text(th.querySelector('.aui-pivot__toggle, .aui-pivot__leaf-label') ?? th));

describe('PivotGrid', () => {
  it('renders a table with multi-level headers, subtotals, and grand totals', async () => {
    const { grid, host } = mount();
    await grid.ready;
    const table = host.querySelector('table');
    expect(text(table?.querySelector('caption'))).toBe('Sales');
    expect(host.querySelector('.aui-pivot__region')?.getAttribute('aria-labelledby')).toBe(table?.querySelector('caption')?.id);
    // Expanded by default: regions, their cities, then the grand total.
    expect(rowHeaders(host)).toEqual(['North', 'Bergen', 'Oslo', 'South', 'Naples', 'Rome', 'Grand total']);
    const headRows = table?.tHead?.rows;
    expect(headRows?.length).toBe(2);
    expect([...(headRows?.[0]?.cells ?? [])].map((c) => text(c))).toEqual(['Region / City', 'Q1', 'Q2', 'Grand total']);
    expect([...(headRows?.[1]?.cells ?? [])].map((c) => text(c))).toEqual(['Sum of Amount', 'Sum of Amount', 'Sum of Amount']);
    const south = [...host.querySelectorAll('tbody tr')][3];
    expect([...(south?.querySelectorAll('td') ?? [])].map((td) => td.textContent)).toEqual(['€200.00', '€70.00', '€270.00']);
    // Every data cell names its column headers and its row header (WCAG H43).
    const cell = south?.querySelector('td');
    const ids = cell?.getAttribute('headers')?.split(' ') ?? [];
    expect(ids.map((id) => text(document.getElementById(id)))).toEqual(['Q1', 'Sum of Amount', 'South']);
    // Nested rows carry their group as hidden text.
    expect(text(host.querySelectorAll('tbody th')[1])).toBe('North, Bergen');
  });

  it('collapses and expands row groups by button, updating aria-expanded and the layout', async () => {
    const { grid, host } = mount();
    await grid.ready;
    const changes: PivotGridLayoutChangeDetail[] = [];
    host.addEventListener('aui-layout-change', (e) => changes.push((e as CustomEvent<PivotGridLayoutChangeDetail>).detail));
    const north = host.querySelector<HTMLButtonElement>('tbody .aui-pivot__toggle');
    expect(north?.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(north!);
    expect(rowHeaders(host)).toEqual(['North', 'South', 'Naples', 'Rome', 'Grand total']);
    const again = host.querySelector<HTMLButtonElement>('tbody .aui-pivot__toggle');
    expect(again?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(again);
    expect(changes.at(-1)?.reason).toBe('collapse');
    expect(changes.at(-1)?.layout.expanded?.rows).toEqual([['South']]);
    await userEvent.keyboard('{Enter}');
    await grid.ready;
    expect(rowHeaders(host)).toContain('Bergen');
  });

  it('column groups expand with a subtotal column', async () => {
    const { grid, host } = mount({ layout: { rows: ['region'], columns: ['quarter', 'product'], values: [{ field: 'units', aggregate: 'sum' }], expanded: { rows: [], columns: [['Q1']] } } });
    await grid.ready;
    const head = host.querySelector('thead');
    expect([...(head?.rows[0]?.cells ?? [])].map((c) => text(c))).toEqual(['Region', 'Q1', 'Q1 total', 'Q2', 'Grand total']);
    expect([...(head?.rows[1]?.cells ?? [])].map((c) => text(c))).toEqual(['A', 'B']);
    const q1 = head?.rows[0]?.cells[1];
    expect(q1?.getAttribute('scope')).toBe('colgroup');
    expect(q1?.colSpan).toBe(2);
    const matrix = grid.toMatrix();
    expect(matrix.columns.map((c) => `${c.kind}:${c.labels.join('/')}`)).toEqual(['member:Q1/A', 'member:Q1/B', 'subtotal:Q1', 'member:Q2', 'total:']);
    expect(matrix.rows.map((r) => r.labels.join('/'))).toEqual(['North', 'South', '']);
    expect(matrix.values[0]).toEqual([4, null, 4, 2, 6]);
  });

  it('sorts rows by label and by a value column, with aria-sort and announcements', async () => {
    const { grid, host } = mount({ layout: { rows: ['city'], columns: [], values: [{ field: 'units', aggregate: 'sum' }] } });
    await grid.ready;
    expect(rowHeaders(host).slice(0, 4)).toEqual(['Bergen', 'Naples', 'Oslo', 'Rome']);
    const corner = host.querySelector('.aui-pivot__corner');
    expect(corner?.getAttribute('aria-sort')).toBe('ascending');
    await userEvent.click(corner!.querySelector('button')!);
    expect(rowHeaders(host).slice(0, 4)).toEqual(['Rome', 'Oslo', 'Naples', 'Bergen']);
    expect(host.querySelector('.aui-pivot__corner')?.getAttribute('aria-sort')).toBe('descending');
    await userEvent.click(host.querySelector('.aui-pivot__value-header button')!);
    // Largest first: Rome 9, Naples 6, Bergen 3, Oslo 3.
    expect(rowHeaders(host).slice(0, 4)).toEqual(['Rome', 'Naples', 'Bergen', 'Oslo']);
    expect(host.querySelector('.aui-pivot__value-header')?.getAttribute('aria-sort')).toBe('descending');
    expect(document.activeElement).toBe(host.querySelector('.aui-pivot__value-header button'));
    expect(grid.layout.sort.rows).toEqual({ by: 'value', value: 0, column: [], direction: 'descending' });
  });

  it('filters members, reloads, and reports reason filter', async () => {
    const { grid, host } = mount({ layout: { rows: ['region'], columns: [], values: [{ field: 'amount', aggregate: 'sum' }], filters: ['product'] } });
    await grid.ready;
    let reason = '';
    host.addEventListener('aui-layout-change', (e) => (reason = (e as CustomEvent<PivotGridLayoutChangeDetail>).detail.reason));
    grid.setFilter('product', ['B']);
    await grid.ready;
    expect(reason).toBe('filter');
    expect(grid.toMatrix().values.map((v) => v[0])).toEqual([50, 200, 250]);
    expect(grid.layout.include).toEqual({ product: ['B'] });
    grid.setFilter('product', null);
    await grid.ready;
    expect(grid.toMatrix().values.at(-1)?.[0]).toBe(450);
  });

  it('exports CSV with one column per row field and formula escaping', async () => {
    const tricky: Sale[] = [{ region: '=HYPERLINK("x")', city: 'A', quarter: 'Q1', product: 'A', amount: 5, units: 1 }];
    const { grid } = mount({ data: tricky, layout: { rows: ['region', 'city'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' }] } });
    await grid.ready;
    const csv = grid.toCsv({ values: 'raw', lineEnding: '\n' });
    expect(csv.split('\n')).toEqual([
      'Region,City,Q1 / Sum of Amount,Grand total / Sum of Amount',
      `"'=HYPERLINK(""x"")",,5,5`,
      `"'=HYPERLINK(""x"")",A,5,5`,
      'Grand total,,5,5',
    ]);
    expect(() => grid.toCsv({ delimiter: '|' as ',' })).toThrow(AbsoluteUIError);
  });

  it('validates options and layouts with configuration errors', () => {
    const host = document.createElement('div');
    const bad = (layout: unknown, extra: Record<string, unknown> = {}): unknown => {
      try {
        PivotGrid.create(host, { caption: 'x', fields, data: sales, layout: layout as never, ...extra });
      } catch (e) {
        return e;
      }
      return null;
    };
    expect(bad({ rows: ['nope'], columns: [], values: [] })).toBeInstanceOf(AbsoluteUIError);
    expect(bad({ rows: ['region'], columns: ['region'], values: [] })).toBeInstanceOf(AbsoluteUIError);
    expect(bad({ rows: [], columns: [], values: [{ field: 'amount', aggregate: 'median' }] })).toBeInstanceOf(AbsoluteUIError);
    expect(bad({ rows: [], columns: [], values: [] }, { dataSource: { query: () => Promise.resolve({ cells: [] }), members: () => Promise.resolve({ members: [], total: 0 }) } })).toBeInstanceOf(AbsoluteUIError);
    expect(host.childElementCount).toBe(0);
  });

  it('shows the no-values hint and the empty message', async () => {
    const { grid, host } = mount({ layout: { rows: ['region'], columns: [], values: [] } });
    await grid.ready;
    expect(text(host.querySelector('.aui-pivot__status'))).toBe('Add a field to Values to see results.');
    grid.update({ data: [], layout: { rows: ['region'], columns: [], values: [{ field: 'units', aggregate: 'sum' }] }, emptyMessage: 'Nothing sold' });
    await grid.ready;
    expect(text(host.querySelector('.aui-pivot__status'))).toBe('Nothing sold');
  });

  it('virtual mode renders a window of rows with aria-rowcount and aria-rowindex', async () => {
    const many: Sale[] = Array.from({ length: 2000 }, (_, i) => ({ region: `R${String(i).padStart(4, '0')}`, city: 'x', quarter: 'Q1', product: 'A', amount: i, units: 1 }));
    const { grid, host } = mount({ data: many, virtual: true, layout: { rows: ['region'], columns: [], values: [{ field: 'amount', aggregate: 'sum' }] } });
    host.querySelector<HTMLElement>('.aui-pivot__region')?.style.setProperty('max-block-size', '400px');
    await grid.ready;
    const rendered = host.querySelectorAll('tbody tr.aui-pivot__row').length;
    expect(rendered).toBeGreaterThan(5);
    expect(rendered).toBeLessThan(80);
    expect(host.querySelector('table')?.getAttribute('aria-rowcount')).toBe(String(1 + 2001));
    expect(host.querySelector('tbody tr.aui-pivot__row')?.getAttribute('aria-rowindex')).toBe('2');
  });
});

describe('PivotGrid virtual scrolling', () => {
  it('the window follows the scroll position under a sticky header (regression)', async () => {
    const style = document.createElement('style');
    style.textContent = '.aui-pivot__region { max-block-size: 300px; overflow: auto; } .aui-pivot__head { position: sticky; top: 0; }';
    document.head.append(style);
    try {
      const many: Sale[] = Array.from({ length: 3000 }, (_, i) => ({ region: `R${String(i).padStart(4, '0')}`, city: 'x', quarter: 'Q1', product: 'A', amount: i, units: 1 }));
      const { grid, host } = mount({ data: many, virtual: true, layout: { rows: ['region'], columns: [], values: [{ field: 'amount', aggregate: 'sum' }] } });
      await grid.ready;
      const region = host.querySelector<HTMLElement>('.aui-pivot__region')!;
      region.scrollTop = region.scrollHeight;
      await expect.poll(() => host.querySelector('tbody tr.aui-pivot__row--total') !== null).toBe(true);
      expect(Number(host.querySelector('tbody tr.aui-pivot__row')?.getAttribute('aria-rowindex'))).toBeGreaterThan(2000);
    } finally {
      style.remove();
    }
  });
});

describe('PivotGrid with a server data source', () => {
  function server(delay = 0): { source: PivotDataSource; queries: PivotQuery[]; fail: { next: boolean } } {
    const local = createLocalPivotSource(sales, fields);
    const queries: PivotQuery[] = [];
    const failNext = { next: false };
    const source: PivotDataSource = {
      query: async (q, signal) => {
        queries.push(q);
        await new Promise((r) => setTimeout(r, delay));
        if (failNext.next) {
          failNext.next = false;
          throw new Error('server down');
        }
        return local.query(q, signal);
      },
      members: (r, signal) => local.members(r, signal),
    };
    return { source, queries, fail: failNext };
  }

  it('loads lazily: only the top level with expandDepth 0, then one delta query per expansion', async () => {
    const { source, queries } = server();
    const host = document.createElement('div');
    document.body.append(host);
    const grid = PivotGrid.create<Sale>(host, { caption: 'Sales', fields, dataSource: source, expandDepth: 0, layout: { rows: ['region', 'city'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' }] } });
    await grid.ready;
    expect(queries).toHaveLength(1);
    expect(rowHeaders(host)).toEqual(['North', 'South', 'Grand total']);
    await grid.setExpanded('rows', ['North'], true);
    expect(queries).toHaveLength(2);
    expect(queries[1]?.rowParents).toEqual([['North']]);
    expect(rowHeaders(host)).toEqual(['North', 'Bergen', 'Oslo', 'South', 'Grand total']);
    // Collapsing and expanding again uses the loaded children.
    await grid.setExpanded('rows', ['North'], false);
    await grid.setExpanded('rows', ['North'], true);
    expect(queries).toHaveLength(2);
  });

  it('marks the table busy while loading and reports failures with a retry', async () => {
    const { source, fail: failNext } = server(20);
    failNext.next = true;
    const host = document.createElement('div');
    document.body.append(host);
    const errors: PivotGridLoadErrorDetail[] = [];
    host.addEventListener('aui-load-error', (e) => errors.push((e as CustomEvent<PivotGridLoadErrorDetail>).detail));
    const grid = PivotGrid.create<Sale>(host, { caption: 'Sales', fields, dataSource: source, layout: { rows: ['region'], columns: [], values: [{ field: 'amount', aggregate: 'sum' }] } });
    expect(host.querySelector('table')?.getAttribute('aria-busy')).toBe('true');
    expect(text(host.querySelector('.aui-pivot__status'))).toBe('Loading');
    await grid.ready;
    expect(errors[0]?.request).toBe('query');
    expect(host.querySelector('table')?.hasAttribute('aria-busy')).toBe(false);
    expect(text(host.querySelector('.aui-pivot__status span'))).toBe('The data could not be loaded.');
    await userEvent.click(host.querySelector('.aui-pivot__retry')!);
    await grid.ready;
    expect(rowHeaders(host)).toEqual(['North', 'South', 'Grand total']);
  });

  it('times out slow requests and ignores superseded answers', async () => {
    const never: PivotDataSource = { query: () => new Promise(() => undefined), members: () => new Promise(() => undefined) };
    const host = document.createElement('div');
    document.body.append(host);
    const grid = PivotGrid.create<Sale>(host, { caption: 'Sales', fields, dataSource: never, requestTimeoutMs: 100, layout: { rows: ['region'], columns: [], values: [] } });
    await grid.ready;
    expect(text(host.querySelector('.aui-pivot__status span'))).toBe('The data could not be loaded.');
    // A slow first answer arriving after a newer layout is discarded.
    let resolveSlow: (v: { cells: never[] }) => void = () => undefined;
    const slow: PivotDataSource = {
      query: (q, signal) => (q.values.length === 1 ? new Promise((r) => (resolveSlow = r)) : createLocalPivotSource(sales, fields).query(q, signal)),
      members: () => Promise.resolve({ members: [], total: 0 }),
    };
    grid.update({ dataSource: slow, layout: { rows: ['region'], columns: [], values: [{ field: 'units', aggregate: 'sum' }] } });
    grid.setLayout({ rows: ['region'], columns: [], values: [{ field: 'units', aggregate: 'sum' }, { field: 'amount', aggregate: 'sum' }] });
    await grid.ready;
    resolveSlow({ cells: [] });
    await new Promise((r) => setTimeout(r, 10));
    expect(grid.toMatrix().columns).toHaveLength(2);
    expect(rowHeaders(host)).toEqual(['North', 'South', 'Grand total']);
  });

  it('rejects malformed server answers as errors', async () => {
    const broken: PivotDataSource = { query: () => Promise.resolve({ cells: [{ row: [], column: [], values: ['1'] }] } as never), members: () => Promise.resolve({ members: [], total: 0 }) };
    const host = document.createElement('div');
    document.body.append(host);
    const errors: unknown[] = [];
    host.addEventListener('aui-load-error', (e) => errors.push((e as CustomEvent<PivotGridLoadErrorDetail>).detail.error));
    const grid = PivotGrid.create<Sale>(host, { caption: 'Sales', fields, dataSource: broken, layout: { rows: [], columns: [], values: [{ field: 'amount', aggregate: 'sum' }] } });
    await grid.ready;
    expect(errors[0]).toBeInstanceOf(AbsoluteUIError);
  });
});

describe('PivotFieldList', () => {
  function setup(): { grid: PivotGrid<Sale>; list: PivotFieldList; listHost: HTMLDivElement } {
    const { grid } = mount({ layout: { rows: ['region'], columns: [], values: [{ field: 'amount', aggregate: 'sum' }] } });
    const listHost = document.createElement('div');
    document.body.prepend(listHost);
    const list = PivotFieldList.create(listHost, { grid, label: 'Pivot fields' });
    return { grid, list, listHost };
  }
  const names = (host: HTMLElement, list: string): string[] => [...host.querySelectorAll(`[data-aui-list="${list}"] .aui-pivot-fields__label`)].map((el) => el.textContent);
  const handle = (host: HTMLElement, label: string): HTMLButtonElement => host.querySelector<HTMLButtonElement>(`.aui-pivot-fields__handle[aria-label="Move ${label}"]`)!;

  it('shows the layout as five labelled lists', async () => {
    const { grid, listHost } = setup();
    await grid.ready;
    expect(listHost.getAttribute('role')).toBe('group');
    expect(names(listHost, 'available')).toEqual(['City', 'Quarter', 'Product', 'Units']);
    expect(names(listHost, 'rows')).toEqual(['Region']);
    expect(names(listHost, 'values')).toEqual(['Amount']);
    const ul = listHost.querySelector('[data-aui-list="rows"]');
    expect(text(document.getElementById(ul?.getAttribute('aria-labelledby') ?? ''))).toBe('Rows');
    expect(handle(listHost, 'Region').getAttribute('aria-describedby')).toBeTruthy();
  });

  it('keyboard: grab, move to another list and reorder, drop applies the layout', async () => {
    const { grid, listHost } = setup();
    await grid.ready;
    handle(listHost, 'City').focus();
    await userEvent.keyboard(' ');
    expect(handle(listHost, 'City').getAttribute('aria-pressed')).toBe('true');
    // available -> filters -> columns -> rows
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(names(listHost, 'rows')).toEqual(['Region', 'City']);
    expect(document.activeElement).toBe(handle(listHost, 'City'));
    await userEvent.keyboard('{ArrowUp}');
    expect(names(listHost, 'rows')).toEqual(['City', 'Region']);
    // Not applied until the drop.
    expect(grid.layout.rows).toEqual(['region']);
    await userEvent.keyboard('{Enter}');
    expect(grid.layout.rows).toEqual(['city', 'region']);
    expect(handle(listHost, 'City').getAttribute('aria-pressed')).toBe('false');
  });

  it('Escape cancels a keyboard move; fields skip lists they are not allowed in', async () => {
    const { grid, listHost } = setup();
    await grid.ready;
    handle(listHost, 'Product').focus();
    await userEvent.keyboard('{Enter}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    // Product is not allowed in Values: it stops in Rows.
    expect(names(listHost, 'rows')).toEqual(['Region', 'Product']);
    await userEvent.keyboard('{Escape}');
    expect(names(listHost, 'available')).toContain('Product');
    expect(grid.layout.rows).toEqual(['region']);
  });

  it('single pointer: click the handle, then click a list', async () => {
    const { grid, listHost } = setup();
    await grid.ready;
    await userEvent.click(handle(listHost, 'Quarter'));
    await userEvent.click(listHost.querySelector('.aui-pivot-fields__area--columns .aui-pivot-fields__title')!);
    expect(grid.layout.columns).toEqual(['quarter']);
  });

  it('aggregate select, remove button, and a member filter with search and Apply', async () => {
    const { grid, listHost } = setup();
    await grid.ready;
    const select = listHost.querySelector<HTMLSelectElement>('.aui-pivot-fields__aggregate')!;
    expect(select.getAttribute('aria-label')).toBe('Aggregate of Amount');
    await userEvent.selectOptions(select, 'average');
    expect(grid.layout.values).toEqual([{ field: 'amount', aggregate: 'average' }]);
    // Filter Region: uncheck North.
    const filter = listHost.querySelector<HTMLButtonElement>('[data-aui-list="rows"] .aui-pivot-fields__filter')!;
    await userEvent.click(filter);
    expect(filter.getAttribute('aria-expanded')).toBe('true');
    await expect.poll(() => listHost.querySelectorAll('.aui-pivot-fields__member').length).toBe(2);
    await userEvent.click(listHost.querySelector('.aui-pivot-fields__member label')!);
    await userEvent.click(listHost.querySelector('.aui-pivot-fields__apply')!);
    await expect.poll(() => JSON.stringify(grid.layout.include)).toBe('{"region":["South"]}');
    await grid.ready;
    expect(listHost.querySelector('[data-aui-list="rows"] .aui-pivot-fields__filter')?.classList.contains('aui-pivot-fields__filter--active')).toBe(true);
    await userEvent.click(listHost.querySelector('.aui-pivot-fields__remove')!);
    expect(grid.layout.rows).toEqual([]);
    // Moving a field back to the available list clears its filter.
    expect(grid.layout.include).toEqual({});
  });
});
