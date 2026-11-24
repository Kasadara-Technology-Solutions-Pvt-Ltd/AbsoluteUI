import { test, type Page } from '@playwright/test';
import type { Button } from '@absoluteui/components/button';
import type { Combobox } from '@absoluteui/components/combobox';
import type { Dialog } from '@absoluteui/components/dialog';
import type { DateInput } from '@absoluteui/components/date-input';
import { withinBudget } from './budget.js';

// Performance budgets declared in metadata/*/component.json (SPEC section 15.2).
// Measured in headless Chromium against the production build; the median of 5 runs is compared.

interface Harness {
  __aui: { Button: typeof Button; Combobox: typeof Combobox; Dialog: typeof Dialog; DateInput: typeof DateInput };
  __auiReady?: boolean;
}

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as Harness).__auiReady === true);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

async function measure(page: Page, runs: number, fn: () => number): Promise<number> {
  const results: number[] = [];
  for (let i = 0; i < runs; i++) results.push(await page.evaluate(fn));
  return median(results);
}

test.describe('performance budgets', () => {
  test('Button.enhance: < 0.5 ms average per instance (1,000 instances)', async ({ page }) => {
    await open(page);
    const avg = await measure(page, 5, () => {
      const { Button } = (window as unknown as Harness).__aui;
      const host = document.createElement('div');
      document.body.append(host);
      const els = Array.from({ length: 1000 }, (_, i) => {
        const b = document.createElement('button');
        b.textContent = `Action ${i}`;
        host.append(b);
        return b;
      });
      const start = performance.now();
      const instances = els.map((el) => Button.enhance(el, { variant: 'primary' }));
      const elapsed = performance.now() - start;
      for (const b of instances) b.destroy();
      host.remove();
      return elapsed / 1000;
    });
    test.info().annotations.push({ type: 'perf', description: `Button.enhance avg: ${avg.toFixed(3)} ms` });
    withinBudget(avg, 0.5, 'avg');
  });

  test('Combobox: create < 100 ms and filter keystroke < 50 ms with 1,000 options', async ({ page }) => {
    await open(page);
    const create = await measure(page, 5, () => {
      const { Combobox } = (window as unknown as Harness).__aui;
      const host = document.createElement('div');
      document.body.append(host);
      const options = Array.from({ length: 1000 }, (_, i) => ({ value: `v${i}`, label: `Option ${i} ${i % 7 === 0 ? 'alpha' : 'beta'}` }));
      const start = performance.now();
      const c = Combobox.create(host, { label: 'Perf', options });
      const elapsed = performance.now() - start;
      c.destroy();
      host.remove();
      return elapsed;
    });
    const filter = await measure(page, 5, () => {
      const { Combobox } = (window as unknown as Harness).__aui;
      const host = document.createElement('div');
      document.body.append(host);
      const options = Array.from({ length: 1000 }, (_, i) => ({ value: `v${i}`, label: `Option ${i} ${i % 7 === 0 ? 'alpha' : 'beta'}` }));
      const c = Combobox.create(host, { label: 'Perf', options });
      c.open();
      c.input.value = 'alp';
      const start = performance.now();
      c.input.dispatchEvent(new Event('input', { bubbles: true }));
      const elapsed = performance.now() - start;
      c.destroy();
      host.remove();
      return elapsed;
    });
    test.info().annotations.push({ type: 'perf', description: `Combobox create: ${create.toFixed(1)} ms, filter: ${filter.toFixed(1)} ms` });
    withinBudget(create, 100, 'create');
    withinBudget(filter, 50, 'filter');
  });

  test('Dialog.open: < 16 ms', async ({ page }) => {
    await open(page);
    const elapsed = await measure(page, 5, () => {
      const { Dialog } = (window as unknown as Harness).__aui;
      const d = Dialog.create({ title: 'Perf', actions: [{ label: 'OK', value: 'ok' }] });
      const start = performance.now();
      d.open();
      const t = performance.now() - start;
      d.destroy();
      return t;
    });
    test.info().annotations.push({ type: 'perf', description: `Dialog.open: ${elapsed.toFixed(2)} ms` });
    withinBudget(elapsed, 16, 'elapsed');
  });

  test('DateInput.create: < 5 ms average per instance (100 instances)', async ({ page }) => {
    await open(page);
    const avg = await measure(page, 5, () => {
      const { DateInput } = (window as unknown as Harness).__aui;
      const hosts = Array.from({ length: 100 }, () => {
        const h = document.createElement('div');
        document.body.append(h);
        return h;
      });
      const start = performance.now();
      const inputs = hosts.map((h, i) => DateInput.create(h, { label: `Date ${i}`, granularity: i % 2 ? 'minute' : 'date' }));
      const elapsed = performance.now() - start;
      for (const d of inputs) d.destroy();
      for (const h of hosts) h.remove();
      return elapsed / 100;
    });
    test.info().annotations.push({ type: 'perf', description: `DateInput.create avg: ${avg.toFixed(3)} ms` });
    withinBudget(avg, 5, 'avg');
  });
});
