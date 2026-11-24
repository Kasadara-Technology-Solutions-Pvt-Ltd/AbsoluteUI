import { test, expect } from '@playwright/test';
import { withinBudget } from './budget.js';

// SPEC section 10.3, section 10.4: preview and compliance follow edits live. Budgets cover the whole
// path from a committed value to the updated compliance badge and the restyled preview,
// including the panels' debounce (150 ms compliance, 120 ms preview).
const BASE = `http://127.0.0.1:${String(Number(process.env.DESIGNER_E2E_PORT ?? 4332))}`;

test('theme designer: edit -> compliance < 500 ms, edit -> preview < 400 ms (median of 5)', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // Storage may be unavailable.
    }
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${BASE}/`);
  await page.waitForFunction(() => document.documentElement.dataset.designerReady === 'true');
  await page.locator('#editor').getByRole('button', { name: /^Colors/ }).click();
  await expect(page.locator('iframe').first().contentFrame().locator('html[data-preview-ready="true"]')).toHaveCount(1);

  const timings = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('.td-editor [data-token="color-primary"] input[type="text"]');
    const badge = document.getElementById('status-badge');
    const frameDoc = document.querySelector('iframe')?.contentDocument;
    if (!input || !badge || !frameDoc) throw new Error('designer not ready');
    const values = ['#93C5FD', '#1E40AF'];
    const compliance: number[] = [];
    const preview: number[] = [];
    for (let i = 0; i < 5; i++) {
      for (const value of values) {
        const before = badge.textContent;
        const t0 = performance.now();
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        let previewAt = 0;
        let complianceAt = 0;
        while (!previewAt || !complianceAt) {
          await new Promise((r) => requestAnimationFrame(r));
          if (!previewAt && getComputedStyle(frameDoc.documentElement).getPropertyValue('--aui-color-primary').trim() === value) previewAt = performance.now();
          if (!complianceAt && badge.textContent !== before) complianceAt = performance.now();
          if (performance.now() - t0 > 5000) throw new Error('timeout');
        }
        compliance.push(complianceAt - t0);
        preview.push(previewAt - t0);
      }
    }
    const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Infinity;
    return { compliance: median(compliance), preview: median(preview) };
  });
  test.info().annotations.push({ type: 'perf', description: `Designer edit -> compliance ${timings.compliance.toFixed(1)} ms, edit -> preview ${timings.preview.toFixed(1)} ms` });
  withinBudget(timings.compliance, 500, 'timings.compliance');
  withinBudget(timings.preview, 400, 'timings.preview');
});
