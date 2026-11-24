import { test, type Page } from '@playwright/test';
import { withinBudget } from './budget.js';

// R20 P11 performance budgets (metadata/<component>/component.json, SPEC section 15.2).
// Runs in the "performance" project, after all functional tests, one worker.
// Each measurement is the median of 5 runs after one warm-up, including the first render.

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => (window as unknown as { __auiReady?: boolean }).__auiReady === true);
}

test('special charts: candlestick 1,000 < 120 ms; network 150 x 300 < 250 ms; calendar 365 < 60 ms', async ({ page }) => {
  await open(page, '/r20-p11');
  const results = await page.evaluate(() => {
    interface Created { destroy(): void }
    interface Factory { create(host: HTMLElement, options: unknown): Created }
    // Safe: the harness page exposes the component classes on window.__aui.
    const aui = (window as unknown as { __aui: Record<string, Factory> & { createBusinessCalendar(definition: unknown): unknown } }).__aui;
    const median = (runs: number[]): number => runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)] ?? Number.NaN;
    const measure = (name: string, options: unknown): number => {
      const runs: number[] = [];
      const factory = aui[name];
      if (!factory) throw new Error(`missing ${name}`);
      for (let i = 0; i < 6; i++) {
        const el = document.createElement('div');
        el.style.setProperty('width', '900px');
        document.body.append(el);
        const t = performance.now();
        const c = factory.create(el, options);
        if (i > 0) runs.push(performance.now() - t);
        c.destroy();
        el.remove();
      }
      return median(runs);
    };
    const date = (epochDay: number): { kind: 'PlainDate'; year: number; month: number; day: number } => {
      const d = new Date(epochDay * 86_400_000);
      return { kind: 'PlainDate', year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    };
    const start = Date.UTC(2022, 0, 3) / 86_400_000;
    // Candlestick: 1,000 consecutive days.
    const candles = Array.from({ length: 1000 }, (_, i) => {
      const open = 100 + 20 * Math.sin(i / 30);
      const close = open + ((i % 7) - 3);
      return { date: date(start + i), open, close, high: Math.max(open, close) + 2, low: Math.min(open, close) - 2, volume: 1000 + (i % 300) };
    });
    // Network: 150 nodes, 300 edges.
    const people = Array.from({ length: 150 }, (_, i) => ({ id: `p${String(i)}`, label: `P${String(i)}`, group: `g${String(i % 5)}` }));
    const edges = Array.from({ length: 300 }, (_, i) => ({ source: `p${String(i % 150)}`, target: `p${String((i * 37 + 11) % 150)}` })).filter((e) => e.source !== e.target);
    return {
      candlestick: measure('CandlestickChart', { label: 'p', data: candles, movingAverages: [{ period: 20 }, { period: 50 }] }),
      network: measure('NetworkGraph', { label: 'p', nodes: people, edges, animate: false }),
      calendar: measure('CalendarHeatmap', { label: 'p', year: 2026, data: Array.from({ length: 365 }, (_, i) => ({ date: date(Date.UTC(2026, 0, 1) / 86_400_000 + i), value: i % 9 })), businessCalendar: aui.createBusinessCalendar({}) }),
    };
  });
  withinBudget(results.candlestick, 120, 'results.candlestick');
  withinBudget(results.network, 250, 'results.network');
  withinBudget(results.calendar, 60, 'results.calendar');
});
