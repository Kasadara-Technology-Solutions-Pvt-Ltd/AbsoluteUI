import { test, type Page } from '@playwright/test';
import type { LineChart } from '@absoluteui/components/line-chart';
import type { BarChart } from '@absoluteui/components/bar-chart';
import type { PieChart } from '@absoluteui/components/pie-chart';
import type { Sparkline } from '@absoluteui/components/sparkline';
import { withinBudget } from './budget.js';

// Chart performance budgets (metadata/<chart>/component.json, SPEC section 15.2).
// Runs in the "performance" project, after all functional tests, one worker.

interface Aui {
  LineChart: typeof LineChart;
  BarChart: typeof BarChart;
  PieChart: typeof PieChart;
  Sparkline: typeof Sparkline;
}

async function open(page: Page): Promise<void> {
  await page.goto('/charts');
  await page.waitForFunction(() => (window as unknown as { __auiReady?: boolean }).__auiReady === true);
}

test.describe('chart performance', () => {
  test('chart performance: line 5 x 1,000 < 50 ms; bar 50 x 4 < 30 ms; pie 12 slices < 15 ms; sparkline < 1 ms', async ({ page }) => {
    await open(page);
    const [line, resize, bar, pie, spark] = await page.evaluate(async () => {
      const aui = (window as unknown as { __aui: Aui }).__aui;
      const median = (runs: number[]): number => runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)] ?? Number.NaN;
      const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => { r(); }));
      const host = (): HTMLDivElement => {
        const el = document.createElement('div');
        el.style.setProperty('width', '900px');
        document.body.append(el);
        return el;
      };
      const x = Array.from({ length: 1000 }, (_, i) => ({ kind: 'Instant' as const, epochMilliseconds: Date.UTC(2026, 0, 1) + i * 3_600_000 }));
      const series = Array.from({ length: 5 }, (_, s) => ({ id: `s${String(s)}`, label: `Series ${String(s + 1)}`, values: x.map((_, i) => (i % 97 === 0 ? null : Math.sin(i / 40 + s) * 100 + s * 30)) }));
      // Median of 5 creates (after one warm-up), including the first synchronous render.
      const lineRuns: number[] = [];
      const resizeRuns: number[] = [];
      for (let i = 0; i < 6; i++) {
        const el = host();
        const t = performance.now();
        const c = aui.LineChart.create(el, { label: 'Perf', x, series });
        const created = performance.now() - t;
        if (i > 0) lineRuns.push(created);
        el.style.setProperty('width', '700px');
        await frame();
        const t2 = performance.now();
        c.update({ height: 320 });
        if (i > 0) resizeRuns.push(performance.now() - t2);
        c.destroy();
        el.remove();
      }
      const categories = Array.from({ length: 50 }, (_, i) => `Category ${String(i + 1)}`);
      const barSeries = Array.from({ length: 4 }, (_, s) => ({ id: `b${String(s)}`, label: `B${String(s)}`, values: categories.map((_, i) => ((i * 7 + s * 13) % 40) - 10) }));
      const barRuns: number[] = [];
      for (let i = 0; i < 6; i++) {
        const el = host();
        const t = performance.now();
        const c = aui.BarChart.create(el, { label: 'Perf', categories, series: barSeries, layout: i % 2 === 0 ? 'grouped' : 'stacked' });
        if (i > 0) barRuns.push(performance.now() - t);
        c.destroy();
        el.remove();
      }
      const slices = Array.from({ length: 12 }, (_, i) => ({ id: `p${String(i)}`, label: `Slice ${String(i)}`, value: 10 + i }));
      const pieRuns: number[] = [];
      for (let i = 0; i < 6; i++) {
        const el = host();
        const t = performance.now();
        const c = aui.PieChart.create(el, { label: 'Perf', slices, donut: i % 2 === 0 });
        if (i > 0) pieRuns.push(performance.now() - t);
        c.destroy();
        el.remove();
      }
      // Sparkline: per-instance cost averaged over 200 instances (30 values each).
      const values = Array.from({ length: 30 }, (_, i) => Math.round(Math.sin(i) * 50 + 60));
      const holders = Array.from({ length: 200 }, () => {
        const s = document.createElement('span');
        document.body.append(s);
        return s;
      });
      aui.Sparkline.create(document.createElement('span'), { label: 'warm', values }).destroy();
      const t = performance.now();
      for (const h of holders) aui.Sparkline.create(h, { label: 'Trend', values });
      const sparkMs = (performance.now() - t) / holders.length;
      return [median(lineRuns), median(resizeRuns), median(barRuns), median(pieRuns), sparkMs];
    });
    test.info().annotations.push({ type: 'perf', description: `LineChart create 5x1000: ${line.toFixed(1)} ms, re-render: ${resize.toFixed(1)} ms, BarChart 50x4: ${bar.toFixed(1)} ms, PieChart 12: ${pie.toFixed(2)} ms, Sparkline: ${spark.toFixed(3)} ms` });
    withinBudget(line, 50, 'line');
    withinBudget(resize, 50, 'resize');
    withinBudget(bar, 30, 'bar');
    withinBudget(pie, 15, 'pie');
    withinBudget(spark, 1, 'spark');
  });
});
