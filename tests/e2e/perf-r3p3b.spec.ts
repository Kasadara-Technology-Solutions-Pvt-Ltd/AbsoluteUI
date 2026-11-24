import { test, expect, type Page } from '@playwright/test';
import { withinBudget } from './budget.js';

// R3 phase 3b performance budgets (metadata/<component>/component.json, SPEC section 15.2).
// Runs in the "performance" project, after all functional tests, one worker.
// Each measurement is the median of 5 runs after one warm-up.

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => (window as unknown as { __auiReady?: boolean }).__auiReady === true);
}

test.describe('kanban and Gantt performance', () => {
  test('kanban: 8 columns with 1,000 cards < 120 ms; keyboard move < 40 ms; one virtual cell of 5,000 cards < 80 ms', async ({ page }) => {
    await open(page, '/boards');
    const results = await page.evaluate(() => {
      interface K { moveCard(id: string, to: { columnId: string; laneId: null; index?: number }): boolean; destroy(): void }
      // Safe: the harness page exposes the component classes on window.__aui.
      const aui = (window as unknown as { __aui: { Kanban: { create(host: HTMLElement, o: unknown): K } } }).__aui;
      const median = (runs: number[]): number => runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)] ?? Number.NaN;
      const host = (): HTMLElement => {
        const el = document.createElement('div');
        document.body.append(el);
        return el;
      };
      const columns = Array.from({ length: 8 }, (_, i) => ({ id: `c${String(i)}`, label: `Column ${String(i)}`, ...(i % 3 === 1 ? { wipLimit: 200 } : {}) }));
      const cards = Array.from({ length: 1000 }, (_, i) => ({ id: `k${String(i)}`, columnId: `c${String(i % 8)}`, title: `Task ${String(i)}`, ...(i % 4 === 0 ? { tags: ['tag'] } : {}), color: (i % 8) + 1 }));
      const big = Array.from({ length: 5000 }, (_, i) => ({ id: `v${String(i)}`, columnId: 'c0', title: `Item ${String(i)}` }));
      const create: number[] = [];
      const move: number[] = [];
      const virtual: number[] = [];
      for (let i = 0; i < 6; i++) {
        let t = performance.now();
        const k = aui.Kanban.create(host(), { label: 'k', columns, cards, virtualThreshold: 100_000 });
        const c = performance.now() - t;
        t = performance.now();
        k.moveCard(`k${String(i)}`, { columnId: 'c7', laneId: null, index: 0 });
        const m = performance.now() - t;
        k.destroy();
        t = performance.now();
        const v = aui.Kanban.create(host(), { label: 'v', columns: [{ id: 'c0', label: 'Backlog' }], cards: big });
        const vc = performance.now() - t;
        v.destroy();
        if (i > 0) {
          create.push(c);
          move.push(m);
          virtual.push(vc);
        }
      }
      return { create: median(create), move: median(move), virtual: median(virtual) };
    });
    withinBudget(results.create, 120, 'results.create');
    withinBudget(results.move, 40, 'results.move');
    withinBudget(results.virtual, 80, 'results.virtual');
  });

  test('gantt: 2,000 tasks with 1,500 dependencies < 150 ms; a move < 60 ms; scheduleGantt for 10,000 tasks < 80 ms', async ({ page }) => {
    await open(page, '/boards');
    const results = await page.evaluate(() => {
      interface PD { kind: 'PlainDate'; year: number; month: number; day: number }
      interface G { moveTask(id: string, start: PD): boolean; destroy(): void }
      // Safe: the harness page exposes the component classes on window.__aui.
      const aui = (window as unknown as {
        __aui: {
          Gantt: { create(host: HTMLElement, o: unknown): G };
          scheduleGantt(tasks: unknown[], deps: unknown[], cal: unknown): unknown;
          createBusinessCalendar(d?: unknown): unknown;
        };
      }).__aui;
      const median = (runs: number[]): number => runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)] ?? Number.NaN;
      const date = (day: number): PD => {
        const d = new Date(Date.UTC(2026, 8, 28 + day));
        return { kind: 'PlainDate', year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
      };
      // Chains of 20 tasks under summary tasks of 20, with dependencies inside each chain.
      const make = (n: number): { tasks: unknown[]; deps: unknown[] } => {
        const tasks: unknown[] = [];
        const deps: unknown[] = [];
        for (let i = 0; i < n; i++) {
          if (i % 20 === 0) tasks.push({ id: `s${String(i)}`, parentId: null, label: `Phase ${String(i)}`, start: date(0), duration: 0 });
          tasks.push({ id: `t${String(i)}`, parentId: `s${String(i - (i % 20))}`, label: `Task ${String(i)}`, start: date(i % 30), duration: 1 + (i % 5) });
          if (i % 20 !== 0 && i % 4 !== 0) deps.push({ id: `d${String(i)}`, from: `t${String(i - 1)}`, to: `t${String(i)}`, type: i % 7 === 0 ? 'SS' : 'FS', lag: i % 3 });
        }
        return { tasks, deps };
      };
      const host = (): HTMLElement => {
        const el = document.createElement('div');
        document.body.append(el);
        return el;
      };
      const plan = make(2000);
      const large = make(10_000);
      const calendar = aui.createBusinessCalendar();
      const create: number[] = [];
      const move: number[] = [];
      const engine: number[] = [];
      for (let i = 0; i < 6; i++) {
        let t = performance.now();
        const g = aui.Gantt.create(host(), { label: 'g', tasks: plan.tasks, dependencies: plan.deps, editable: true, scale: 'week', today: date(0) });
        const c = performance.now() - t;
        t = performance.now();
        g.moveTask('t1', date(3 + i));
        const m = performance.now() - t;
        g.destroy();
        t = performance.now();
        aui.scheduleGantt(large.tasks, large.deps, calendar);
        const e = performance.now() - t;
        if (i > 0) {
          create.push(c);
          move.push(m);
          engine.push(e);
        }
      }
      return { create: median(create), move: median(move), engine: median(engine), deps: plan.deps.length };
    });
    expect(results.deps).toBeGreaterThanOrEqual(1400);
    withinBudget(results.create, 150, 'results.create');
    withinBudget(results.move, 60, 'results.move');
    withinBudget(results.engine, 80, 'results.engine');
  });
});
