import { test, expect, type Page } from '@playwright/test';
import type { DataTable } from '@absoluteui/components/data-table';
import { withinBudget } from './budget.js';

// Data Table performance budgets (metadata/data-table/component.json, SPEC section 15.2).
// Runs in the "performance" project, after all functional tests, so it is not measured under load.

async function open(page: Page): Promise<void> {
  await page.goto('/data');
  await page.waitForFunction(() => (window as unknown as { __auiReady?: boolean }).__auiReady === true);
}

test.describe('data table performance', () => {
  test('data table performance: render 1,000 x 8 < 150 ms; sort 10,000 rows: text < 100 ms, numeric < 50 ms', async ({ page }) => {
    await open(page);
    const [render, sort, numericSort] = await page.evaluate(() => {
      const { DataTable: Table } = (window as unknown as { __aui: { DataTable: typeof DataTable } }).__aui;
      const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), a: `Name ${(i * 7919) % n}`, b: i % 97, c: i * 3, d: `x${i}`, e: i % 2 === 0, f: i, g: `y${i}` }));
      type R = ReturnType<typeof make>[number];
      const cols = (['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const).map((k) => ({ id: k, header: k.toUpperCase(), accessor: (r: R) => r[k] }));
      const columns = [{ id: 'id', header: 'ID', accessor: (r: R) => r.id }, ...cols];
      const h1 = document.createElement('div');
      document.body.append(h1);
      let t = performance.now();
      const t1 = Table.create(h1, { caption: 'Perf', columns, rows: make(1000), rowId: (r) => r.id, pageSize: null });
      const renderMs = performance.now() - t;
      t1.destroy();
      const h2 = document.createElement('div');
      document.body.append(h2);
      const t2 = Table.create(h2, { caption: 'Perf', columns, rows: make(10000), rowId: (r) => r.id, pageSize: 25 });
      // Warm-up (collator creation), then the median of 5 sorts, like the R0 performance specs.
      t2.update({ sort: { column: 'b', direction: 'ascending' } });
      const median = (column: 'a' | 'c'): number => {
        const runs: number[] = [];
        for (let i = 0; i < 5; i++) {
          t = performance.now();
          t2.update({ sort: { column, direction: i % 2 === 0 ? 'ascending' : 'descending' } });
          runs.push(performance.now() - t);
        }
        runs.sort((x, y) => x - y);
        return runs[2] ?? Number.NaN;
      };
      const text = median('a');
      const numeric = median('c');
      t2.destroy();
      return [renderMs, text, numeric];
    });
    test.info().annotations.push({ type: 'perf', description: `DataTable render(1000x8): ${render.toFixed(1)} ms, text sort(10000): ${sort.toFixed(1)} ms, numeric sort(10000): ${numericSort.toFixed(1)} ms` });
    withinBudget(render, 150, 'render');
    withinBudget(sort, 100, 'sort');
    withinBudget(numericSort, 50, 'numericSort');
  });

  test('data grid performance: 10,000 rows filter < 50 ms, multi-sort < 120 ms, CSV < 150 ms; 100,000 virtual rows create < 200 ms, scroll < 16 ms', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const { DataTable: Table } = (window as unknown as { __aui: { DataTable: typeof DataTable } }).__aui;
      const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), a: `Name ${(i * 7919) % n}`, b: i % 97, c: i * 3, d: `x${i % 50}`, e: i % 2 === 0, f: i, g: `y${i}` }));
      type R = ReturnType<typeof make>[number];
      const columns = [
        { id: 'id', header: 'ID', accessor: (x: R) => x.id },
        { id: 'a', header: 'A', accessor: (x: R) => x.a, filter: 'text' as const },
        { id: 'b', header: 'B', accessor: (x: R) => x.b, type: 'number' as const, filter: 'number' as const },
        { id: 'c', header: 'C', accessor: (x: R) => x.c, type: 'currency' as const, currency: 'USD' },
        { id: 'd', header: 'D', accessor: (x: R) => x.d },
        { id: 'e', header: 'E', accessor: (x: R) => x.e, type: 'boolean' as const },
        { id: 'f', header: 'F', accessor: (x: R) => x.f, type: 'number' as const },
        { id: 'g', header: 'G', accessor: (x: R) => x.g },
      ];
      const median = (runs: number[]): number => runs.sort((x, y) => x - y)[Math.floor(runs.length / 2)] ?? Number.NaN;
      const h = document.createElement('div');
      document.body.append(h);
      const t = Table.create(h, { caption: 'Perf', columns, rows: make(10000), rowId: (x) => x.id, pageSize: 25 });
      // Warm-up: collator and the displayed-text caches.
      t.update({ filters: { a: { type: 'text', value: '1' } }, search: 'x1', sort: { column: 'd', direction: 'ascending' } });
      let runs: number[] = [];
      for (let i = 0; i < 5; i++) {
        const s = performance.now();
        t.update({ filters: { a: { type: 'text', value: String(i + 1) }, b: { type: 'number', min: i, max: 80 } }, search: `x${String(i)}` });
        runs.push(performance.now() - s);
      }
      const filter = median(runs);
      t.update({ filters: {}, search: '' });
      runs = [];
      for (let i = 0; i < 5; i++) {
        const s = performance.now();
        t.update({ sort: [{ column: 'd', direction: i % 2 === 0 ? 'ascending' : 'descending' }, { column: 'f', direction: 'descending' }] });
        runs.push(performance.now() - s);
      }
      const multiSort = median(runs);
      runs = [];
      let lines = 0;
      for (let i = 0; i < 5; i++) {
        const s = performance.now();
        lines = t.toCsv().split('\r\n').length;
        runs.push(performance.now() - s);
      }
      const csv = median(runs);
      t.destroy();
      const hv = document.createElement('div');
      document.body.append(hv);
      const rows = make(100000);
      let s = performance.now();
      const v = Table.create(hv, { caption: 'Virtual', columns, rows, rowId: (x) => x.id, pageSize: null, virtual: true });
      const create = performance.now() - s;
      const region = hv.querySelector<HTMLElement>('.aui-data-table__region')!;
      await new Promise((res) => requestAnimationFrame(res));
      runs = [];
      for (let i = 1; i <= 10; i++) {
        region.scrollTop = (region.scrollHeight * i) / 11;
        s = performance.now();
        // Same work as the rAF-throttled scroll handler, measured synchronously.
        v.update({});
        runs.push(performance.now() - s);
        await new Promise((res) => requestAnimationFrame(res));
      }
      const scroll = median(runs);
      const rendered = hv.querySelectorAll('tbody tr.aui-data-table__row').length;
      v.destroy();
      return { filter, multiSort, csv, lines, create, scroll, rendered };
    });
    test.info().annotations.push({ type: 'perf', description: `DataGrid filter(10000): ${r.filter.toFixed(1)} ms, multi-sort(10000): ${r.multiSort.toFixed(1)} ms, CSV(10000x8): ${r.csv.toFixed(1)} ms, virtual create(100000): ${r.create.toFixed(1)} ms, virtual scroll: ${r.scroll.toFixed(1)} ms (${r.rendered} rows rendered)` });
    expect(r.lines).toBe(10001);
    withinBudget(r.rendered, 80, 'r.rendered');
    withinBudget(r.filter, 50, 'r.filter');
    withinBudget(r.multiSort, 120, 'r.multiSort');
    withinBudget(r.csv, 150, 'r.csv');
    withinBudget(r.create, 200, 'r.create');
    withinBudget(r.scroll, 16, 'r.scroll');
  });
});
