import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P11: Candlestick, Network Graph, Calendar Heatmap (docs/PLAN-R20.md).
declare global {
  interface Window {
    __csp: string[];
    __auiReady?: boolean;
  }
}

async function open(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sample}`);
    });
  });
  await page.goto(`/r20-p11${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const focusedLabel = (page: Page): Promise<string | null> => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);

test('r20-p11: no CSP violations or errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('candlestick: trading-day axis, keyboard pan and zoom', async ({ page }) => {
  await open(page);
  const chart = page.locator('#candle');
  await expect(chart.locator('.aui-candlestick-chart__candle')).toHaveCount(60);
  await chart.locator('[tabindex="0"]').focus();
  await page.keyboard.press('+');
  await expect(page.locator('#candle-log')).toHaveText('zoom: keyboard range');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  expect(await focusedLabel(page)).toMatch(/close/);
  await page.keyboard.press('0');
  await expect(page.locator('#candle-log')).toHaveText('zoom: keyboard all');
  await chart.getByRole('button', { name: 'Zoom in' }).click();
  await expect(chart).toHaveClass(/aui-chart--zoomed/);
});

test('network graph: neighbor navigation, neighborhood highlight, keyboard pinning', async ({ page }) => {
  await open(page);
  const chart = page.locator('#network');
  await chart.locator('[tabindex="0"]').focus();
  expect(await focusedLabel(page)).toMatch(/^Ana, Design/);
  await expect(chart).toHaveClass(/aui-network-graph--lit/);
  await page.keyboard.press('PageDown');
  expect(await focusedLabel(page)).toMatch(/^Ben, Engineering/);
  await page.keyboard.press('End');
  expect(await focusedLabel(page)).toMatch(/^Gus/);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('#network-log')).toHaveText('pin: ana true');
  await page.keyboard.press('u');
  await expect(page.locator('#network-log')).toHaveText('pin: ana false');
  const before = await chart.locator('.aui-network-graph__node').first().getAttribute('d');
  const box = await chart.locator('.aui-network-graph__node').first().boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 40, { steps: 5 });
    await page.mouse.up();
  }
  await expect(page.locator('#network-log')).toHaveText('pin: ana true');
  expect(await chart.locator('.aui-network-graph__node').first().getAttribute('d')).not.toBe(before);
});

test('calendar heatmap: day and week keys, business calendar marks', async ({ page }) => {
  await open(page);
  const chart = page.locator('#calendar');
  await expect(chart.locator('.aui-calendar-heatmap__cell')).toHaveCount(90);
  await expect(chart.locator('.aui-calendar-heatmap__cell--holiday')).toHaveCount(1);
  await chart.locator('[tabindex="0"]').focus();
  expect(await focusedLabel(page)).toMatch(/^Thu, 1 Jan 2026: .*Holiday: New Year$/);
  await page.keyboard.press('ArrowDown');
  expect(await focusedLabel(page)).toMatch(/^Fri, 2 Jan 2026/);
  await page.keyboard.press('ArrowRight');
  expect(await focusedLabel(page)).toMatch(/^Fri, 9 Jan 2026/);
  await page.keyboard.press('PageDown');
  expect(await focusedLabel(page)).toMatch(/^Mon, 9 Feb 2026/);
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`r20-p11: axe (WCAG 2.2 AA) in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
  });
}

test('r20-p11: axe in RTL and mirrored keys', async ({ page }) => {
  await open(page, '?dir=rtl');
  expect(await axe(page)).toEqual([]);
  await page.locator('#calendar [tabindex="0"]').focus();
  await page.keyboard.press('ArrowLeft');
  expect(await focusedLabel(page)).toMatch(/^Thu, 8 Jan 2026/);
});
