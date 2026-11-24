import { expect, test, type Page } from '@playwright/test';
import type { DataGrid } from '@absoluteui/components/data-grid';
import { withinBudget } from './budget.js';

// Data Grid performance budgets (metadata/data-grid/component.json). Runs in the "performance"
// project, after all functional tests, so it is not measured under load.

async function open(page: Page): Promise<void> {
  await page.goto('/data-grid?rows=10');
  await page.waitForFunction(() => (window as unknown as { __auiReady?: boolean }).__auiReady === true);
}

test.describe('data grid performance', () => {
  test('data grid performance: 1,000,000 x 20 create; scroll frames; sort 100,000 rows', async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async () => {
      const { DataGrid: Grid } = (window as unknown as { __aui: { DataGrid: typeof DataGrid } }).__aui;
      // The grid renders in its own animation frame callback: a callback registered before the
      // scroll and one registered after it bracket that work in the same frame.
      const renderTime = (scroll: () => void): Promise<number> =>
        new Promise((resolve) => {
          let start = 0;
          requestAnimationFrame(() => {
            start = performance.now();
          });
          scroll();
          requestAnimationFrame(() => {
            resolve(performance.now() - start);
          });
        });
      const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Number.NaN;
      interface R {
        id: string;
        v: number[];
        name: string;
      }
      const columns = Array.from({ length: 20 }, (_, c) => ({ id: `c${String(c)}`, header: `C${String(c)}`, accessor: (r: R) => (c === 0 ? r.name : r.v[c % 4]), type: c === 0 ? ('text' as const) : ('number' as const), width: 110 }));
      const make = (n: number): R[] => Array.from({ length: n }, (_, i) => ({ id: String(i), v: [i, i * 3, i % 97, (i * 7919) % n], name: `Name ${String((i * 7919) % n)}` }));
      const host = (): HTMLElement => {
        const h = document.createElement('div');
        h.style.setProperty('block-size', '600px');
        h.style.setProperty('inline-size', '1200px');
        document.body.append(h);
        return h;
      };
      const million = make(1_000_000);
      let t = performance.now();
      const g = Grid.create(host(), { label: 'Perf', columns, rows: million, rowId: (r) => r.id });
      const create = performance.now() - t;
      const viewport = g.host.querySelector<HTMLElement>('.aui-data-grid__viewport');
      if (!viewport) throw new Error('no viewport');
      // Scroll frames: time from setting the scroll position to the rendered frame.
      const vertical: number[] = [];
      for (let i = 1; i <= 10; i++) {
        vertical.push(
          await renderTime(() => {
            viewport.scrollTop = (viewport.scrollHeight * i) / 11;
            viewport.dispatchEvent(new Event('scroll'));
          }),
        );
      }
      g.destroy();
      const wide = Array.from({ length: 200 }, (_, c) => ({ id: `w${String(c)}`, header: `W${String(c)}`, accessor: (r: R) => r.v[c % 4], type: 'number' as const, width: 100 }));
      const g2 = Grid.create(host(), { label: 'Wide', columns: wide, rows: make(10_000), rowId: (r) => r.id });
      const vp2 = g2.host.querySelector<HTMLElement>('.aui-data-grid__viewport');
      if (!vp2) throw new Error('no viewport');
      const horizontal: number[] = [];
      for (let i = 1; i <= 10; i++) {
        horizontal.push(
          await renderTime(() => {
            vp2.scrollLeft = (vp2.scrollWidth * i) / 11;
            vp2.dispatchEvent(new Event('scroll'));
          }),
        );
      }
      g2.destroy();
      const g3 = Grid.create(host(), { label: 'Sort', columns, rows: make(100_000), rowId: (r) => r.id });
      g3.update({ sort: { column: 'c1', direction: 'ascending' } });
      t = performance.now();
      g3.update({ sort: { column: 'c0', direction: 'descending' } });
      const firstText = performance.now() - t;
      const sorts: number[] = [];
      for (let i = 0; i < 5; i++) {
        t = performance.now();
        g3.update({ sort: { column: 'c0', direction: i % 2 === 0 ? 'ascending' : 'descending' } });
        sorts.push(performance.now() - t);
      }
      // A transaction of 1,000 updates on 100,000 sorted rows (high-frequency feeds batch these).
      const tx: number[] = [];
      for (let k = 0; k < 3; k++) {
        const update = Array.from({ length: 1000 }, (_, i) => ({ id: String(i * 97 + k), v: [k, k, k, k], name: `Updated ${String(i)}` }));
        t = performance.now();
        g3.applyTransaction({ update });
        tx.push(performance.now() - t);
      }
      g3.destroy();
      return { transaction: median(tx), create, vertical: median(vertical), horizontal: median(horizontal), firstText, sort: median(sorts) };
    });
    test.info().annotations.push({ type: 'perf', description: `create 1M x 20: ${result.create.toFixed(1)} ms; vertical frame: ${result.vertical.toFixed(1)} ms; horizontal frame: ${result.horizontal.toFixed(1)} ms; first text sort 100k: ${result.firstText.toFixed(1)} ms; repeated sort 100k: ${result.sort.toFixed(1)} ms; transaction 1,000 updates on 100k: ${result.transaction.toFixed(1)} ms` });
    // Dominated by hashing a million new row ids once (duplicate-id check): about 430 ms of the measured ~530 ms.
    withinBudget(result.create, 800, 'create');
    withinBudget(result.vertical, 16, 'vertical');
    withinBudget(result.horizontal, 16, 'horizontal');
    withinBudget(result.firstText, 1300, 'first text sort');
    withinBudget(result.sort, 150, 'repeated sort');
    // Unchanged rows keep their cached ranks; only the updated rows are ranked again.
    withinBudget(result.transaction, 250, 'transaction');
  });

  test('data grid performance: group 100,000 rows by two columns with three aggregates; expand all', async ({ page }) => {
    await open(page);
    const result = await page.evaluate(() => {
      const { DataGrid: Grid } = (window as unknown as { __aui: { DataGrid: typeof DataGrid } }).__aui;
      interface R {
        id: string;
        a: string;
        b: number;
        x: number;
        y: number;
      }
      const rows: R[] = Array.from({ length: 100_000 }, (_, i) => ({ id: String(i), a: 'Team ' + String(i % 50), b: i % 20, x: i, y: (i * 7) % 1000 }));
      const h = document.createElement('div');
      h.style.setProperty('block-size', '600px');
      h.style.setProperty('inline-size', '1200px');
      document.body.append(h);
      const columns = [
        { id: 'a', header: 'A', field: 'a' },
        { id: 'b', header: 'B', field: 'b', type: 'number' as const },
        { id: 'x', header: 'X', field: 'x', type: 'number' as const, aggregate: 'sum' as const },
        { id: 'y', header: 'Y', field: 'y', type: 'number' as const, aggregate: 'avg' as const },
        { id: 'z', header: 'Z', field: 'y', type: 'number' as const, aggregate: 'max' as const },
      ];
      const g = Grid.create(h, { label: 'Group', columns, rows, rowId: (r) => r.id });
      let t = performance.now();
      g.update({ groupBy: ['a', 'b'] });
      const group = performance.now() - t;
      t = performance.now();
      g.expandAll();
      const expand = performance.now() - t;
      // Pivot: rows by A, a column group per B (20 keys), sum and average of X (42 result columns).
      t = performance.now();
      g.update({ pivot: { rows: ['a'], columns: ['b'], values: [{ column: 'x', aggregate: 'sum' }, { column: 'y', aggregate: 'avg' }] } });
      const pivot = performance.now() - t;
      g.destroy();
      return { group, expand, pivot };
    });
    test.info().annotations.push({ type: 'perf', description: 'group 100k by 2 columns with 3 aggregates: ' + result.group.toFixed(1) + ' ms; expand all: ' + result.expand.toFixed(1) + ' ms' });
    // Grouping re-runs the pipeline (filter, sort, group, flatten) and renders; measured about 430-660 ms on a loaded machine.
    withinBudget(result.group, 900, 'group 100,000 rows');
    withinBudget(result.expand, 200, 'expand all');
    test.info().annotations.push({ type: 'perf', description: 'pivot 100k (50 rows x 20 column keys x 2 values): ' + result.pivot.toFixed(1) + ' ms' });
    // Two group trees, one engine pass, 42 generated columns, and a header rebuild; measured about 870 ms.
    withinBudget(result.pivot, 1500, 'pivot 100,000 rows');
  });

  test('data grid performance: filter, quick filter, and set filter values on 100,000 rows', async ({ page }) => {
    await open(page);
    const result = await page.evaluate(() => {
      const { DataGrid: Grid } = (window as unknown as { __aui: { DataGrid: typeof DataGrid } }).__aui;
      interface R {
        id: string;
        v: number[];
        name: string;
      }
      const n = 100_000;
      const rows: R[] = Array.from({ length: n }, (_, i) => ({ id: String(i), v: [i, i * 3, i % 97, (i * 7919) % n], name: `Name ${String((i * 7919) % n)}` }));
      const columns = [
        { id: 'name', header: 'Name', accessor: (r: R) => r.name, filter: 'text' as const, width: 160 },
        { id: 'set', header: 'Set', accessor: (r: R) => r.name, filter: 'set' as const, width: 160 },
        ...Array.from({ length: 18 }, (_, c) => ({ id: `c${String(c)}`, header: `C${String(c)}`, accessor: (r: R) => r.v[c % 4], type: 'number' as const, width: 110, ...(c === 0 ? { filter: 'number' as const } : {}) })),
      ];
      const h = document.createElement('div');
      h.style.setProperty('block-size', '600px');
      h.style.setProperty('inline-size', '1200px');
      document.body.append(h);
      const g = Grid.create(h, { label: 'Filter', columns, rows, rowId: (r) => r.id });
      const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Number.NaN;
      const filter: number[] = [];
      for (let k = 0; k < 5; k++) {
        const t = performance.now();
        g.setFilter('name', { kind: 'text', join: 'and', conditions: [{ operator: 'contains', value: String(k + 1) }, { operator: 'notContains', value: '99' }] });
        filter.push(performance.now() - t);
      }
      g.setFilter('name', null);
      let t = performance.now();
      g.setQuickFilter('name 12');
      const firstQuick = performance.now() - t;
      const quick: number[] = [];
      for (let k = 0; k < 5; k++) {
        t = performance.now();
        g.setQuickFilter(`name ${String(k + 3)}`);
        quick.push(performance.now() - t);
      }
      g.setQuickFilter('');
      // An advanced filter of three conditions (text, number, set) applied to 100,000 rows.
      g.update({ advancedFilter: true });
      const advanced: number[] = [];
      for (let k = 0; k < 5; k++) {
        t = performance.now();
        g.setAdvancedFilter({
          join: 'and',
          items: [
            { column: 'name', filter: { kind: 'text', conditions: [{ operator: 'contains', value: String(k + 1) }] } },
            { join: 'or', items: [{ column: 'c0', filter: { kind: 'number', conditions: [{ operator: 'greaterThan', value: 50_000 }] } }, { column: 'set', filter: { kind: 'set', values: ['Name 1', 'Name 2'] } }] },
          ],
        });
        advanced.push(performance.now() - t);
      }
      g.update({ advancedFilter: false });
      // Opening a set filter panel extracts and sorts the distinct displayed values (100,000 here) and renders the first 1,000.
      const button = h.querySelector<HTMLElement>('[role="columnheader"][data-column="set"] .aui-data-grid__filter-button');
      if (!button) throw new Error('no filter button');
      t = performance.now();
      button.click();
      const setOpen = performance.now() - t;
      const boxes = h.querySelectorAll('.aui-data-grid__filter-values input').length;
      g.destroy();
      return { filter: median(filter), firstQuick, quick: median(quick), setOpen, boxes, advanced: median(advanced) };
    });
    test.info().annotations.push({ type: 'perf', description: `filter 100k (2 text conditions): ${result.filter.toFixed(1)} ms; first quick filter 100k x 20: ${result.firstQuick.toFixed(1)} ms; repeated quick filter: ${result.quick.toFixed(1)} ms; set filter panel (100,000 values): ${result.setOpen.toFixed(1)} ms (${String(result.boxes)} rendered); advanced filter 3 conditions: ${result.advanced.toFixed(1)} ms` });
    expect(result.boxes).toBe(1000);
    // Two text conditions share one normalized text per row.
    withinBudget(result.filter, 80, 'filter two text conditions');
    // Worst case: most rows miss, so every column of every row is formatted (Intl number formatting dominates); texts are cached per row.
    withinBudget(result.firstQuick, 2500, 'first quick filter');
    withinBudget(result.quick, 200, 'repeated quick filter');
    // 100,000 distinct values sorted with the locale collator (numeric); cached until the rows change.
    withinBudget(result.setOpen, 2000, 'set filter panel');
    // Three conditions (text, number, set) in nested groups compile once and test each row.
    withinBudget(result.advanced, 120, 'advanced filter');
  });
});
