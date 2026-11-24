import { test, type Page } from '@playwright/test';
import { withinBudget } from './budget.js';

// R3 performance budgets (metadata/<component>/component.json, SPEC section 15.2).
// Runs in the "performance" project, after all functional tests, one worker.
// Each measurement is the median of 5 runs after one warm-up, including the first render.

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => (window as unknown as { __auiReady?: boolean }).__auiReady === true);
}

test.describe('charts, dashboard, and rich text performance', () => {
  test('charts: scatter 2,000 < 60 ms; combo 3 x 200 < 60 ms; waterfall 200 < 40 ms; histogram 10,000 < 40 ms; heatmap 24 x 30 < 60 ms; radar 5 x 12 < 30 ms; treemap 500 < 60 ms; funnel 20 < 20 ms; box plot 4 x 50 < 80 ms; bullet 30 < 30 ms; gauge < 2 ms', async ({ page }) => {
    await open(page, '/charts-r3');
    const results = await page.evaluate(() => {
      // Safe: the harness page exposes the component classes on window.__aui.
      const aui = (window as unknown as { __aui: Record<string, { create(host: HTMLElement, options: unknown): { destroy(): void } }> }).__aui;
      const median = (runs: number[]): number => runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)] ?? Number.NaN;
      const measure = (name: string, options: unknown, width = 900): number => {
        const runs: number[] = [];
        const factory = aui[name];
        if (!factory) throw new Error(`missing ${name}`);
        for (let i = 0; i < 6; i++) {
          const el = document.createElement('div');
          el.style.setProperty('width', `${String(width)}px`);
          document.body.append(el);
          const t = performance.now();
          const c = factory.create(el, options);
          if (i > 0) runs.push(performance.now() - t);
          c.destroy();
          el.remove();
        }
        return median(runs);
      };
      const cats = (n: number): string[] => Array.from({ length: n }, (_, i) => `C${String(i + 1)}`);
      const wave = (i: number, s = 0): number => Math.round(50 + 40 * Math.sin(i / 7 + s));
      return {
        scatter: measure('ScatterChart', { label: 'p', series: [0, 1, 2, 3].map((s) => ({ id: `s${String(s)}`, label: `S${String(s)}`, points: Array.from({ length: 500 }, (_, i) => ({ x: i, y: wave(i, s) })) })) }),
        combo: measure('ComboChart', { label: 'p', categories: cats(200), series: [{ id: 'a', label: 'A', type: 'bar', values: cats(200).map((_, i) => wave(i)) }, { id: 'b', label: 'B', type: 'bar', values: cats(200).map((_, i) => wave(i, 1)) }, { id: 'c', label: 'C', type: 'line', axis: 'secondary', values: cats(200).map((_, i) => wave(i, 2) / 100) }] }),
        waterfall: measure('WaterfallChart', { label: 'p', steps: Array.from({ length: 200 }, (_, i) => ({ id: `s${String(i)}`, label: `S${String(i)}`, value: wave(i) - 50 })) }),
        histogram: measure('Histogram', { label: 'p', values: Array.from({ length: 10_000 }, (_, i) => (i * 7919) % 1000) }),
        heatmap: measure('Heatmap', { label: 'p', columns: cats(24), rows: cats(30), values: cats(30).map((_, r) => cats(24).map((_, c) => (r * c) % 97)) }),
        radar: measure('RadarChart', { label: 'p', axes: cats(12), series: [0, 1, 2, 3, 4].map((s) => ({ id: `s${String(s)}`, label: `S${String(s)}`, values: cats(12).map((_, i) => wave(i, s)) })) }),
        treemap: measure('Treemap', { label: 'p', data: Array.from({ length: 20 }, (_, g) => ({ id: `g${String(g)}`, label: `G${String(g)}`, children: Array.from({ length: 25 }, (_, i) => ({ id: `g${String(g)}-${String(i)}`, label: `L${String(i)}`, value: 1 + ((g * 31 + i * 17) % 50) })) })) }),
        funnel: measure('FunnelChart', { label: 'p', stages: Array.from({ length: 20 }, (_, i) => ({ id: `s${String(i)}`, label: `Stage ${String(i)}`, value: 10_000 - i * 400 })) }),
        box: measure('BoxPlot', { label: 'p', categories: cats(50), series: [0, 1, 2, 3].map((s) => ({ id: `s${String(s)}`, label: `S${String(s)}`, data: cats(50).map((_, c) => Array.from({ length: 100 }, (_, i) => wave(i + c, s))) })) }),
        bullet: measure('BulletChart', { label: 'p', measures: Array.from({ length: 30 }, (_, i) => ({ id: `m${String(i)}`, label: `M${String(i)}`, value: 50 + i, target: 60, ranges: [40, 70, 100] })) }),
        gauge: measure('Gauge', { label: 'p', value: 42, bands: [{ to: 50, label: 'a' }, { to: 100, label: 'b' }], target: 60 }, 200),
      };
    });
    withinBudget(results.scatter, 60, 'results.scatter');
    withinBudget(results.combo, 60, 'results.combo');
    withinBudget(results.waterfall, 40, 'results.waterfall');
    withinBudget(results.histogram, 40, 'results.histogram');
    withinBudget(results.heatmap, 60, 'results.heatmap');
    withinBudget(results.radar, 30, 'results.radar');
    withinBudget(results.treemap, 60, 'results.treemap');
    withinBudget(results.funnel, 20, 'results.funnel');
    withinBudget(results.box, 80, 'results.box');
    withinBudget(results.bullet, 30, 'results.bullet');
    withinBudget(results.gauge, 2, 'results.gauge');
  });

  test('dashboard: grid of 50 items < 40 ms; keyboard move step < 16 ms; stat card < 2 ms', async ({ page }) => {
    await open(page, '/dashboard');
    const results = await page.evaluate(async () => {
      interface Grid { destroy(): void }
      // Safe: the harness page exposes the component classes on window.__aui.
      const aui = (window as unknown as { __aui: { DashboardGrid: { create(host: HTMLElement, o: unknown): Grid }; StatCard: { create(host: HTMLElement, o: unknown): Grid } } }).__aui;
      const median = (runs: number[]): number => runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)] ?? Number.NaN;
      const make = (): HTMLElement => {
        const host = document.createElement('div');
        host.style.setProperty('width', '1200px');
        for (let i = 0; i < 50; i++) {
          const el = document.createElement('section');
          el.dataset.auiItem = `i${String(i)}`;
          el.textContent = `Item ${String(i)}`;
          host.append(el);
        }
        document.body.append(host);
        return host;
      };
      const items = Array.from({ length: 50 }, (_, i) => ({ id: `i${String(i)}`, x: (i % 4) * 3, y: Math.floor(i / 4) * 2, w: 3, h: 2 }));
      const create: number[] = [];
      const move: number[] = [];
      for (let r = 0; r < 6; r++) {
        const host = make();
        const t = performance.now();
        const grid = aui.DashboardGrid.create(host, { label: 'p', items, editable: true });
        if (r > 0) create.push(performance.now() - t);
        const handle = host.querySelector<HTMLButtonElement>('.aui-dashboard__handle');
        handle?.focus();
        handle?.click();
        const t2 = performance.now();
        handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        if (r > 0) move.push(performance.now() - t2);
        grid.destroy();
        host.remove();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const cards: number[] = [];
      for (let r = 0; r < 21; r++) {
        const el = document.createElement('div');
        document.body.append(el);
        const t = performance.now();
        const c = aui.StatCard.create(el, { label: 'Revenue', value: 1200, previous: 1000, trend: [1, 2, 3, 4, 5, 6] });
        if (r > 0) cards.push(performance.now() - t);
        c.destroy();
        el.remove();
      }
      return { create: median(create), move: median(move), card: median(cards) };
    });
    withinBudget(results.create, 40, 'results.create');
    withinBudget(results.move, 16, 'results.move');
    withinBudget(results.card, 2, 'results.card');
  });

  test('rich text: create with 200 paragraphs < 80 ms; typing in a 200-paragraph document < 16 ms per character', async ({ page }) => {
    await open(page, '/rich-text');
    const html = Array.from({ length: 200 }, (_, i) => `<p>Paragraph ${String(i)} with <strong>bold</strong> and <em>italic</em> text.</p>`).join('');
    const create = await page.evaluate((value) => {
      // Safe: the harness page exposes the component class on window.__aui.
      const aui = (window as unknown as { __aui: { RichTextEditor: { create(host: HTMLElement, o: unknown): { destroy(): void } } } }).__aui;
      const runs: number[] = [];
      for (let r = 0; r < 6; r++) {
        const el = document.createElement('div');
        document.body.append(el);
        const t = performance.now();
        const ed = aui.RichTextEditor.create(el, { label: 'p', value });
        if (r > 0) runs.push(performance.now() - t);
        ed.destroy();
        el.remove();
      }
      return runs.sort((a, b) => a - b)[2] ?? Number.NaN;
    }, html);
    withinBudget(create, 80, 'create');
    await page.evaluate((value) => {
      const aui = (window as unknown as { __aui: { editor: { setHTML(html: string): void } } }).__aui;
      aui.editor.setHTML(value);
    }, html);
    await page.getByRole('textbox', { name: 'Release notes' }).click();
    // Time the model update and re-render of one beforeinput, measured in the page.
    const perChar = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>('.aui-rte__content');
      if (!box) return Number.NaN;
      const runs: number[] = [];
      for (let i = 0; i < 21; i++) {
        const t = performance.now();
        box.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true }));
        if (i > 0) runs.push(performance.now() - t);
      }
      return runs.sort((a, b) => a - b)[10] ?? Number.NaN;
    });
    withinBudget(perChar, 16, 'perChar');
  });
});
