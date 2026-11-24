import { test, type Page } from '@playwright/test';
import { withinBudget } from './budget.js';

// R20 P8 performance budgets (packages/components/metadata/diagram/component.json, SPEC section 15.2).
// Runs in the "performance" project, after all functional tests, one worker.
// Each measurement is the median of 5 runs after one warm-up.

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => (window as unknown as { __auiReady?: boolean }).__auiReady === true);
}

test('diagram: create with 300 nodes and 400 edges (layered layout) < 250 ms; layoutDiagram 500 nodes < 50 ms', async ({ page }) => {
  await open(page, '/r20-p8');
  const results = await page.evaluate(() => {
    interface Created { destroy(): void }
    interface Aui {
      Diagram: { create(host: HTMLElement, options: unknown): Created };
      layoutDiagram(nodes: unknown[], edges: unknown[], options: unknown): unknown;
    }
    // Safe: the harness page exposes the component exports on window.__aui.
    const aui = (window as unknown as { __aui: Aui }).__aui;
    const median = (runs: number[]): number => runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)] ?? Number.NaN;
    // 300 nodes; a binary tree of 299 edges plus 101 cross edges (duplicates removed).
    const nodes = Array.from({ length: 300 }, (_, i) => ({ id: `n${String(i)}`, label: `Step ${String(i + 1)}` }));
    const edges = Array.from({ length: 299 }, (_, i) => ({ id: `t${String(i)}`, from: `n${String(Math.floor(i / 2))}`, to: `n${String(i + 1)}` }));
    for (let i = 0; i < 101; i++) edges.push({ id: `x${String(i)}`, from: `n${String((i * 7) % 150)}`, to: `n${String(150 + ((i * 11) % 150))}` });
    const unique = edges.filter((e, i) => edges.findIndex((o) => o.from === e.from && o.to === e.to) === i);
    const create: number[] = [];
    for (let i = 0; i < 6; i++) {
      const el = document.createElement('div');
      el.style.setProperty('width', '900px');
      document.body.append(el);
      const t = performance.now();
      const d = aui.Diagram.create(el, { label: 'Large process', model: { nodes, edges: unique }, layout: { direction: 'TB' }, textAlternative: 'none' });
      if (i > 0) create.push(performance.now() - t);
      d.destroy();
      el.remove();
    }
    // 500-node flowchart, 499 edges.
    const big = Array.from({ length: 500 }, (_, i) => ({ id: `b${String(i)}`, width: 120, height: 48 }));
    const bigEdges = Array.from({ length: 499 }, (_, i) => ({ from: `b${String(Math.floor(i / 3))}`, to: `b${String(i + 1)}` }));
    const layout: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t = performance.now();
      aui.layoutDiagram(big, bigEdges, {});
      if (i > 0) layout.push(performance.now() - t);
    }
    return { create: median(create), layout: median(layout) };
  });
  withinBudget(results.create, 250, 'results.create');
  withinBudget(results.layout, 50, 'results.layout');
});
