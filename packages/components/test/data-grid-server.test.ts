import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid, type DataGridCellsChangeDetail, type DataGridOptions, type DataGridRowsRequest, type DataGridSelectionChangeDetail } from '@absoluteui/components/data-grid';

// docs/PLAN-R11-G6.md (G6a): server row model.
beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = [
    '.aui-data-grid{display:flex;flex-direction:column;block-size:500px;inline-size:900px}',
    '.aui-data-grid__viewport{flex:1 1 auto;overflow:auto;min-block-size:0;position:relative}',
    '.aui-data-grid__head{position:sticky;top:0;z-index:3;background:#fff}',
    '.aui-data-grid__header-row{display:flex;block-size:40px}',
    '.aui-data-grid__header-cell{flex:none;box-sizing:border-box;overflow:hidden;position:relative}',
    '.aui-data-grid__body{position:relative}',
    '.aui-data-grid__row{position:absolute;display:flex;inset-inline-start:0;box-sizing:border-box}',
    '.aui-data-grid__cell{flex:none;box-sizing:border-box;overflow:hidden;white-space:nowrap}',
    '.aui-data-grid__spacer{flex:none}',
  ].join('\n');
  document.head.append(style);
});

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface R {
  id: string;
  n: number;
}

/** A fake server over `total` rows; `known` reports the count; `fail` makes requests reject. */
function server(total: number, options: { known?: boolean; fail?: () => boolean } = {}) {
  const requests: DataGridRowsRequest[] = [];
  const pending: (() => void)[] = [];
  const datasource = {
    getRows(request: DataGridRowsRequest, signal: AbortSignal) {
      requests.push(request);
      return new Promise<{ rows: R[]; rowCount?: number }>((resolve, reject) => {
        pending.push(() => {
          if (signal.aborted) return;
          if (options.fail?.()) {
            reject(new Error('Server down'));
            return;
          }
          const desc = request.sort[0]?.direction === 'descending';
          const rows: R[] = [];
          for (let i = request.start; i < Math.min(request.end, total); i++) {
            const n = desc ? total - 1 - i : i;
            rows.push({ id: `r${String(n)}`, n });
          }
          resolve(options.known === false ? { rows } : { rows, rowCount: total });
        });
      });
    },
  };
  /** Answer pending requests (and the ones they queue, up to a few rounds), then let the grid render. */
  const flush = async (): Promise<void> => {
    for (let round = 0; round < 5; round++) {
      await new Promise((r) => setTimeout(r, 0));
      if (pending.length === 0) break;
      while (pending.length > 0) pending.shift()?.();
    }
    await new Promise((r) => setTimeout(r, 0));
  };
  return { datasource, requests, flush };
}

function mount(options: Partial<DataGridOptions<R>>): DataGrid<R> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create<R>(host, {
    label: 'Server',
    locale: 'en-US',
    rowHeight: 30,
    rows: [],
    rowId: (r) => r.id,
    blockSize: 20,
    blockLoadDelay: 0,
    columns: [{ id: 'n', header: 'N', field: 'n', type: 'number', sortable: true }],
    ...options,
  });
}

const cells = (g: DataGrid<R>): string[] =>
  [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__body .aui-data-grid__row')]
    .sort((a, b) => Number(a.getAttribute('aria-rowindex')) - Number(b.getAttribute('aria-rowindex')))
    .map((r) => (r.classList.contains('aui-data-grid__row--loading') ? '...' : (r.querySelector('[data-column="n"]')?.textContent ?? '')));

describe('server row model (G6a)', () => {
  it('loads the first block, sizes the scrollbar from the count, and sends the sort to the server', async () => {
    const s = server(1000);
    const g = mount({ datasource: s.datasource });
    expect(g.host.querySelector<HTMLElement>('.aui-data-grid__overlay')?.hidden).toBe(false);
    await s.flush();
    expect(s.requests[0]).toMatchObject({ start: 0, end: 20, sort: [], quickFilter: '', advancedFilter: null });
    expect(g.isRowCountKnown()).toBe(true);
    expect(g.filteredRowCount).toBe(1000);
    expect(g.element.getAttribute('aria-rowcount')).toBe('1001');
    expect(cells(g).slice(0, 3)).toEqual(['0', '1', '2']);
    g.update({ sort: [{ column: 'n', direction: 'descending' }] });
    expect(cells(g).slice(0, 2)).toEqual(['...', '...']);
    await s.flush();
    expect(s.requests.find((r) => r.sort.length > 0 && r.start === 0)).toMatchObject({ sort: [{ column: 'n', direction: 'descending' }] });
    expect(cells(g)[0]).toBe('999');
  });

  it('rows not loaded render as loading rows and load when scrolled into view', async () => {
    const s = server(1000);
    const g = mount({ datasource: s.datasource });
    await s.flush();
    const viewport = g.host.querySelector<HTMLElement>('.aui-data-grid__viewport')!;
    viewport.scrollTop = 30 * 500;
    viewport.dispatchEvent(new Event('scroll'));
    await new Promise((r) => requestAnimationFrame(() => { r(null); }));
    const loading = g.host.querySelectorAll('.aui-data-grid__row--loading');
    expect(loading.length).toBeGreaterThan(0);
    expect(loading[0]?.getAttribute('aria-busy')).toBe('true');
    expect(loading[0]?.textContent).toContain('Loading');
    await s.flush();
    expect(s.requests.some((r) => r.start === 500)).toBe(true);
    expect(g.host.querySelector('[data-row-id="r500"]')).not.toBeNull();
  });

  it('an unknown count grows block by block and ends at a short block', async () => {
    const s = server(30, { known: false });
    const g = mount({ datasource: s.datasource });
    // Unknown until a block comes back short: the first full block adds one more block of loading rows.
    expect(g.isRowCountKnown()).toBe(false);
    expect(g.element.getAttribute('aria-rowcount')).toBe('-1');
    await s.flush();
    expect(s.requests.map((r) => r.start)).toEqual([0, 20]);
    expect(g.isRowCountKnown()).toBe(true);
    expect(g.filteredRowCount).toBe(30);
    expect(g.element.getAttribute('aria-rowcount')).toBe('31');
  });

  it('failed blocks show the message and Retry; nothing retries automatically', async () => {
    let down = true;
    const s = server(100, { fail: () => down });
    const g = mount({ datasource: s.datasource, initialRowCount: 100 });
    await s.flush();
    const failed = g.host.querySelector<HTMLElement>('.aui-data-grid__cell--failed')!;
    expect(failed.textContent).toContain('Rows could not load: Server down');
    const count = s.requests.length;
    await s.flush();
    expect(s.requests.length).toBe(count);
    down = false;
    failed.querySelector<HTMLButtonElement>('.aui-data-grid__retry')!.click();
    await s.flush();
    expect(cells(g)[0]).toBe('0');
  });

  it('refresh reloads; updates replace loaded rows only; client-only options are rejected', async () => {
    const s = server(100);
    const g = mount({ datasource: s.datasource });
    await s.flush();
    const count = s.requests.length;
    g.refresh();
    await s.flush();
    expect(s.requests.length).toBeGreaterThan(count);
    expect(g.applyTransaction({ update: [{ id: 'r1', n: 42 }, { id: 'r99', n: 0 }] })).toEqual({ added: [], updated: ['r1'], removed: [], missing: ['r99'] });
    expect(cells(g)[1]).toBe('42');
    expect(() => { g.update({ pivot: { rows: [], columns: [], values: [] } }); }).toThrow();
  });
});

describe('server selection, transactions, editing (G6b)', () => {
  it('Select all covers rows that are not loaded; exceptions are toggled ids; getSelected lists loaded rows', async () => {
    const s = server(1000);
    const g = mount({ datasource: s.datasource, rowSelection: { mode: 'multiple' } });
    await s.flush();
    const seen: DataGridSelectionChangeDetail[] = [];
    g.host.addEventListener('aui-selection-change', (e) => seen.push((e as CustomEvent<DataGridSelectionChangeDetail>).detail));
    const all = g.host.querySelector<HTMLInputElement>('.aui-data-grid__select-all')!;
    all.click();
    expect(g.getServerSelection()).toEqual({ selectAll: true, toggled: [] });
    expect(seen.at(-1)?.reason).toBe('select-all');
    expect(all.checked).toBe(true);
    expect(g.getSelected()).toContain('r0');
    g.host.querySelector<HTMLElement>('[data-row-id="r1"] .aui-data-grid__select-input')!.click();
    expect(g.getServerSelection()).toEqual({ selectAll: true, toggled: ['r1'] });
    expect(all.indeterminate).toBe(true);
    expect(g.getSelected()).not.toContain('r1');
    // Rows loaded later are selected too.
    const viewport = g.host.querySelector<HTMLElement>('.aui-data-grid__viewport')!;
    viewport.scrollTop = 30 * 600;
    viewport.dispatchEvent(new Event('scroll'));
    await new Promise((r) => requestAnimationFrame(() => { r(null); }));
    await s.flush();
    expect(g.host.querySelector('[data-row-id="r600"]')?.getAttribute('aria-selected')).toBe('true');
    g.setServerSelection({ selectAll: false, toggled: ['r600'] });
    expect(g.getSelected()).toEqual(['r600']);
    g.clearSelection();
    expect(g.getServerSelection()).toEqual({ selectAll: false, toggled: [] });
  });

  it('server transactions remove, add, and update loaded rows; later rows shift; the count follows', async () => {
    const s = server(100);
    const g = mount({ datasource: s.datasource });
    await s.flush();
    expect(g.applyServerTransaction({ remove: ['r1', 'r90'] })).toEqual({ added: [], updated: [], removed: ['r1'], missing: ['r90'] });
    expect(cells(g).slice(0, 3)).toEqual(['0', '2', '3']);
    expect(g.filteredRowCount).toBe(99);
    g.applyServerTransaction({ add: [{ id: 'new', n: -1 }], addIndex: 0, update: [{ id: 'r2', n: 22 }] });
    expect(cells(g).slice(0, 3)).toEqual(['-1', '0', '22']);
    expect(g.filteredRowCount).toBe(100);
    expect(() => g.applyServerTransaction({ add: [{ id: 'r0', n: 0 }] })).toThrow();
    g.applyServerTransaction({ rowCount: 10 });
    expect(g.filteredRowCount).toBe(10);
  });

  it('edits write loaded rows (a shallow copy) and report the change', async () => {
    const s = server(100);
    const g = mount({ datasource: s.datasource, columns: [{ id: 'n', header: 'N', field: 'n', type: 'number', editable: true }] });
    await s.flush();
    const changes: DataGridCellsChangeDetail[] = [];
    g.host.addEventListener('aui-cells-change', (e) => changes.push((e as CustomEvent<DataGridCellsChangeDetail>).detail));
    g.host.querySelector<HTMLElement>('[data-row-id="r1"] [data-column="n"]')!.focus();
    await userEvent.keyboard('7{Enter}');
    expect(cells(g)[1]).toBe('7');
    expect(changes.at(-1)?.changes).toEqual([{ rowId: 'r1', column: 'n', oldValue: 1, newValue: 7 }]);
    g.undo();
    expect(cells(g)[1]).toBe('1');
  });
});

interface G {
  id: string;
  region: string;
  n: number;
  count?: number;
  kids?: boolean;
}

/** A grouping server: group rows (with counts and sums) at group levels, data rows below. */
function groupServer() {
  const data: G[] = Array.from({ length: 30 }, (_, i) => ({ id: `d${String(i)}`, region: ['East', 'West', 'North'][i % 3] ?? '', n: i }));
  const requests: DataGridRowsRequest[] = [];
  const pending: (() => void)[] = [];
  const datasource = {
    getRows(request: DataGridRowsRequest, signal: AbortSignal) {
      requests.push(request);
      return new Promise<{ rows: G[]; rowCount: number }>((resolve) => {
        pending.push(() => {
          if (signal.aborted) return;
          let rows: G[];
          if (request.groupBy.length > request.groupKeys.length) {
            rows = ['East', 'North', 'West'].map((region) => {
              const members = data.filter((d) => d.region === region);
              return { id: `g-${region}`, region, n: members.reduce((s, d) => s + d.n, 0), count: members.length };
            });
          } else rows = data.filter((d) => d.region === request.groupKeys[0]);
          resolve({ rows: rows.slice(request.start, request.end), rowCount: rows.length });
        });
      });
    },
  };
  const flush = async (): Promise<void> => {
    for (let round = 0; round < 5; round++) {
      await new Promise((r) => setTimeout(r, 0));
      if (pending.length === 0) break;
      while (pending.length > 0) pending.shift()?.();
    }
    await new Promise((r) => setTimeout(r, 0));
  };
  return { datasource, requests, flush };
}

function mountGroups(options: Partial<DataGridOptions<G>>): DataGrid<G> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create<G>(host, {
    label: 'Server groups',
    locale: 'en-US',
    rowHeight: 30,
    rows: [],
    rowId: (r) => r.id,
    blockSize: 20,
    blockLoadDelay: 0,
    columns: [
      { id: 'region', header: 'Region', field: 'region' },
      { id: 'n', header: 'N', field: 'n', type: 'number', aggregate: 'sum' },
    ],
    ...options,
  });
}

const rowsOf = (g: DataGrid<G>): string[] =>
  [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__body .aui-data-grid__row')]
    .sort((a, b) => Number(a.getAttribute('aria-rowindex')) - Number(b.getAttribute('aria-rowindex')))
    .map((r) => `${r.getAttribute('aria-level') ?? ''}:${r.querySelector('[data-column="aui-group"]')?.textContent ?? ''}:${r.querySelector('[data-column="n"]')?.textContent ?? ''}`);

describe('server groups and tree data (G6c)', () => {
  it('the top level loads group rows; expanding a group loads its rows with the group keys', async () => {
    const s = groupServer();
    const g = mountGroups({ datasource: s.datasource, groupBy: ['region'], getChildCount: (r) => r.count ?? null });
    await s.flush();
    expect(s.requests[0]).toMatchObject({ groupBy: ['region'], groupKeys: [] });
    expect(g.element.getAttribute('role')).toBe('treegrid');
    expect(rowsOf(g)).toEqual(['1:East (10):135', '1:North (10):155', '1:West (10):145']);
    const east = g.host.querySelector<HTMLElement>('.aui-data-grid__row--group')!;
    expect(east.getAttribute('aria-expanded')).toBe('false');
    expect(g.setExpanded(g.getGroups()[0]!.id, true)).toBe(true);
    expect(rowsOf(g)[1]).toBe('2::Loading');
    await s.flush();
    expect(s.requests.at(-1)).toMatchObject({ groupBy: ['region'], groupKeys: ['East'] });
    expect(rowsOf(g).slice(0, 3)).toEqual(['1:East (10):135', '2::0', '2::3']);
    expect(rowsOf(g)).toHaveLength(13);
  });

  it('collapsed groups keep their rows unless purgeClosedGroups; refresh reloads one group', async () => {
    const s = groupServer();
    const g = mountGroups({ datasource: s.datasource, groupBy: ['region'], purgeClosedGroups: true });
    await s.flush();
    const id = g.getGroups()[0]!.id;
    g.setExpanded(id, true);
    await s.flush();
    const count = s.requests.length;
    g.refresh({ route: ['East'] });
    await s.flush();
    expect(s.requests.length).toBe(count + 1);
    expect(s.requests.at(-1)?.groupKeys).toEqual(['East']);
    g.setExpanded(id, false);
    g.setExpanded(id, true);
    await s.flush();
    expect(s.requests.length).toBe(count + 2);
  });

  it('server tree data: parents load their children by key when expanded', async () => {
    const requests: DataGridRowsRequest[] = [];
    const tree: Record<string, G[]> = {
      '': [{ id: 'p1', region: 'Parent', n: 1, kids: true }, { id: 'p2', region: 'Leaf', n: 2 }],
      p1: [{ id: 'c1', region: 'Child', n: 3 }],
    };
    const g = mountGroups({
      datasource: {
        getRows: (request) => {
          requests.push(request);
          const key = request.groupKeys.at(-1);
          const rows = tree[typeof key === 'string' ? key : ''] ?? [];
          return Promise.resolve({ rows, rowCount: rows.length });
        },
      },
      treeData: { serverGroup: (r) => r.kids === true, serverKey: (r) => r.id, label: 'region' },
      columns: [
        { id: 'region', header: 'Name', field: 'region' },
        { id: 'n', header: 'N', field: 'n', type: 'number' },
      ],
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(requests[0]).toMatchObject({ groupBy: [], groupKeys: [] });
    expect(rowsOf(g)).toEqual(['1:Parent:1', '1:Leaf:2']);
    g.setExpanded('p1', true);
    await new Promise((r) => setTimeout(r, 20));
    expect(requests.at(-1)?.groupKeys).toEqual(['p1']);
    expect(rowsOf(g)).toEqual(['1:Parent:1', '2:Child:3', '1:Leaf:2']);
    expect(() => {
      g.update({ treeData: { getPath: () => [] } });
    }).toThrow();
  });
});
