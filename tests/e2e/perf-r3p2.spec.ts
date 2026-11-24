import { test, type Page } from '@playwright/test';
import { withinBudget } from './budget.js';

// R3 phase 2 performance budgets (metadata/<component>/component.json, SPEC section 15.2).
// Runs in the "performance" project, after all functional tests, one worker.
// Each measurement is the median of 5 runs after one warm-up.

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => (window as unknown as { __auiReady?: boolean }).__auiReady === true);
}

test.describe('pivot grid and org chart performance', () => {
  test('pivot: 100,000 records to ready < 600 ms; expanding a group < 250 ms; virtual scroll step with 5,000 rows < 50 ms', async ({ page }) => {
    await open(page, '/pivot');
    const results = await page.evaluate(async () => {
      interface Grid { ready: Promise<void>; setExpanded(axis: 'rows', path: string[], expanded: boolean): Promise<void>; destroy(): void; host: HTMLElement }
      // Safe: the harness page exposes the component classes and data generator on window.__aui.
      const aui = (window as unknown as { __aui: { PivotGrid: { create(host: HTMLElement, o: unknown): Grid }; records(n: number): unknown[]; fields: unknown[] } }).__aui;
      const median = (runs: number[]): number => runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)] ?? Number.NaN;
      const rows = aui.records(100_000);
      const create = async (options: Record<string, unknown>): Promise<{ grid: Grid; ms: number }> => {
        const el = document.createElement('div');
        document.body.append(el);
        const t = performance.now();
        const grid = aui.PivotGrid.create(el, { caption: 'p', fields: aui.fields, data: rows, ...options });
        await grid.ready;
        return { grid, ms: performance.now() - t };
      };
      const ready: number[] = [];
      const expand: number[] = [];
      for (let i = 0; i < 6; i++) {
        const { grid, ms } = await create({ layout: { rows: ['region', 'country'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' }] } });
        if (i > 0) ready.push(ms);
        grid.destroy();
        grid.host.remove();
        const lazy = await create({ expandDepth: 0, layout: { rows: ['region', 'country'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' }] } });
        const t = performance.now();
        await lazy.grid.setExpanded('rows', ['Europe'], true);
        if (i > 0) expand.push(performance.now() - t);
        lazy.grid.destroy();
        lazy.grid.host.remove();
      }
      // Virtual scrolling over 5,000 visible rows: one scroll step renders a new window.
      const { grid } = await create({ virtual: true, layout: { rows: ['customer'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' }] } });
      const region = grid.host.querySelector<HTMLElement>('.aui-pivot__region');
      if (!region) throw new Error('missing region');
      region.style.setProperty('max-block-size', '600px');
      const scroll: number[] = [];
      for (let i = 0; i < 6; i++) {
        const t = performance.now();
        region.scrollTop = (i + 1) * 20_000;
        region.dispatchEvent(new Event('scroll'));
        await new Promise((r) => requestAnimationFrame(() => {
          r(null);
        }));
        if (i > 0) scroll.push(performance.now() - t);
      }
      grid.destroy();
      return { ready: median(ready), expand: median(expand), scroll: median(scroll) };
    });
    withinBudget(results.ready, 600, 'results.ready');
    withinBudget(results.expand, 250, 'results.expand');
    withinBudget(results.scroll, 50, 'results.scroll');
  });

  test('org chart: 1,000 visible nodes < 80 ms; expand or collapse < 80 ms; layout of 5,000 nodes < 60 ms', async ({ page }) => {
    await open(page, '/org-chart');
    const results = await page.evaluate(async () => {
      interface Chart { setExpanded(id: string, expanded: boolean): Promise<void>; destroy(): void }
      interface LayoutNode { id: string; children: LayoutNode[] }
      // Safe: the harness page exposes the component classes on window.__aui.
      const aui = (window as unknown as { __aui: { OrgChart: { create(host: HTMLElement, o: unknown): Chart }; layoutOrgChart(roots: LayoutNode[], o: unknown): unknown } }).__aui;
      const median = (runs: number[]): number => runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)] ?? Number.NaN;
      // 1 + 10 + 100 + 889 = 1,000 nodes, all expanded.
      const nodes: { id: string; parentId: string | null; label: string; title: string }[] = [{ id: 'n0', parentId: null, label: 'Root', title: 'CEO' }];
      for (let i = 1; i < 1000; i++) nodes.push({ id: `n${String(i)}`, parentId: `n${String(Math.floor((i - 1) / 10))}`, label: `Person ${String(i)}`, title: 'Role' });
      const create: number[] = [];
      const toggle: number[] = [];
      for (let i = 0; i < 6; i++) {
        const el = document.createElement('div');
        document.body.append(el);
        const t = performance.now();
        const chart = aui.OrgChart.create(el, { label: 'p', nodes, expandDepth: 10 });
        if (i > 0) create.push(performance.now() - t);
        const t2 = performance.now();
        await chart.setExpanded('n1', false);
        await chart.setExpanded('n1', true);
        if (i > 0) toggle.push((performance.now() - t2) / 2);
        chart.destroy();
        el.remove();
      }
      const tree = (depth: number, id: string): LayoutNode => ({ id, children: depth === 0 ? [] : Array.from({ length: depth > 2 ? 10 : 5 }, (_, i) => tree(depth - 1, `${id}.${String(i)}`)) });
      // 1 + 10 + 100 + 500 + 2,500 ≈ 3,111 nodes; twice for about 6,000.
      const roots = [tree(4, 'a'), tree(4, 'b')];
      const layout: number[] = [];
      for (let i = 0; i < 6; i++) {
        const t = performance.now();
        aui.layoutOrgChart(roots, { nodeWidth: 200, nodeHeight: 72, siblingGap: 24, levelGap: 48, orientation: 'vertical' });
        if (i > 0) layout.push(performance.now() - t);
      }
      return { create: median(create), toggle: median(toggle), layout: median(layout) };
    });
    withinBudget(results.create, 80, 'results.create');
    withinBudget(results.toggle, 80, 'results.toggle');
    withinBudget(results.layout, 60, 'results.layout');
  });
});
