import { test, expect, type Page } from '@playwright/test';
import { wcagAxe, engine } from './browsers.js';
import { settled } from './settle.js';

// R3 phase 2 pivot page (SPEC section 18.19) under the strict CSP harness with Trusted Types.
declare global {
  interface Window {
    __csp: string[];
    __auiReady?: boolean;
  }
}

interface PivotWindow {
  __aui: { grid: { layout: { rows: string[]; columns: string[]; filters: string[]; include: Record<string, unknown[]>; expanded: { rows: unknown[][] } | null }; ready: Promise<void>; loading: boolean } };
}

const THEMES = ['absolute-default', 'absolute-dark', 'absolute-high-contrast'];

async function open(page: Page, query = '', width = 1400): Promise<string[]> {
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
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`/pivot${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const layout = (page: Page) => page.evaluate(() => (window as unknown as PivotWindow).__aui.grid.layout);
const ready = (page: Page) => page.evaluate(() => (window as unknown as PivotWindow).__aui.grid.ready);
const rowHeaders = (page: Page) => page.locator('#pivot tbody th').evaluateAll((els) => els.map((e) => (e.querySelector('.aui-pivot__toggle, .aui-pivot__leaf-label') ?? e).textContent.trim()));

test('pivot: no CSP violations or errors while expanding, sorting, filtering, and moving fields', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Americas' }).click();
  await page.getByRole('button', { name: 'Region / Country' }).click();
  await page.getByRole('button', { name: 'Sum of Amount' }).last().click();
  await page.getByRole('button', { name: 'Filter Product' }).click();
  await page.getByLabel('Laptop').uncheck();
  await page.getByRole('button', { name: 'Apply' }).click();
  await ready(page);
  const handle = page.getByRole('button', { name: 'Move Quarter', exact: true });
  await handle.dragTo(page.locator('.aui-pivot-fields__area--rows'));
  await ready(page);
  await page.getByRole('button', { name: 'Copy CSV to output' }).click();
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of THEMES) {
  test(`pivot axe WCAG 2.2 AA: ${theme} (a field grabbed, a filter panel open)`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    await page.getByRole('button', { name: 'Filter Product' }).click();
    await expect(page.getByLabel('Phone')).toBeVisible();
    await page.getByRole('button', { name: 'Move Region', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Move Region', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await axe(page)).toEqual([]);
  });
}

test.describe('pivot: behavior', () => {
  test('headers: every data cell names its column, value, and row headers', async ({ page }) => {
    await open(page);
    const names = await page.locator('#pivot tbody tr').first().locator('td').first().evaluate((td) => (td.getAttribute('headers') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent.trim()));
    expect(names).toEqual(['Q1', 'Sum of Amount', 'Americas']);
    await expect(page.locator('#pivot .aui-pivot__region')).toHaveAttribute('role', 'region');
    await expect(page.getByRole('region', { name: 'Sales by region and quarter' })).toBeVisible();
  });

  test('keyboard: Enter collapses and expands a group; focus stays on its button', async ({ page }) => {
    await open(page);
    const americas = page.getByRole('button', { name: 'Americas' });
    await americas.focus();
    await page.keyboard.press('Enter');
    await expect(americas).toHaveAttribute('aria-expanded', 'false');
    await expect(americas).toBeFocused();
    expect(await rowHeaders(page)).not.toContain('Brazil');
    await page.keyboard.press('Space');
    await expect(americas).toHaveAttribute('aria-expanded', 'true');
    expect(await rowHeaders(page)).toContain('Brazil');
  });

  test('field list keyboard: grab Quarter, move it to Rows, drop; the grid reloads', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Move Quarter', exact: true }).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await ready(page);
    expect((await layout(page)).rows).toEqual(['region', 'country', 'quarter']);
    expect((await layout(page)).columns).toEqual([]);
    await expect(page.getByRole('button', { name: 'Move Quarter', exact: true })).toBeFocused();
  });

  test('server data source: only the top level loads; a group loads on expand', async ({ page }) => {
    await open(page, '?server=1');
    expect(await rowHeaders(page)).toEqual(['Americas', 'Asia', 'Europe', 'Grand total']);
    const asia = page.getByRole('button', { name: 'Asia' });
    await expect(asia).toHaveAttribute('aria-expanded', 'false');
    await asia.click();
    await expect(asia).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => rowHeaders(page)).toEqual(['Americas', 'Asia', 'India', 'Japan', 'Europe', 'Grand total']);
    expect(await page.evaluate(() => (window as unknown as { __aui: { queries: unknown[] } }).__aui.queries)).toEqual([[[]], [['Asia']]]);
  });

  test('virtual mode: 5,000 rows render a window and keep aria-rowcount', async ({ page }) => {
    await open(page, '?virtual=1&rows=20000');
    await page.evaluate(async () => {
      const w = window as unknown as { __aui: { grid: { setLayout(l: unknown): void; ready: Promise<void> } } };
      w.__aui.grid.setLayout({ rows: ['customer'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' }] });
      await w.__aui.grid.ready;
    });
    // 5,000 customers plus the grand total, below 2 header rows.
    expect(await page.locator('#pivot table').getAttribute('aria-rowcount')).toBe(String(2 + 5001));
    expect(await page.locator('#pivot tbody tr.aui-pivot__row').count()).toBeLessThan(80);
    await page.locator('#pivot .aui-pivot__region').evaluate((r) => {
      r.scrollTop = r.scrollHeight;
    });
    await expect(page.locator('#pivot tbody tr.aui-pivot__row--total')).toBeVisible();
  });

  test('reflow: at 320 px the page does not scroll sideways; the region scrolls instead', async ({ page }) => {
    await open(page, '', 320);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const region = page.locator('#pivot .aui-pivot__region');
    expect(await region.evaluate((r) => r.scrollWidth > r.clientWidth)).toBe(true);
    // Row headers stick to the inline start while the region scrolls.
    await region.evaluate((r) => {
      r.scrollLeft = 200;
    });
    const header = await page.locator('#pivot tbody th').first().boundingBox();
    const box = await region.boundingBox();
    expect(Math.abs((header?.x ?? 0) - (box?.x ?? 0))).toBeLessThan(3);
  });

  test('RTL: row headers sit at the inline start (right) and ArrowLeft moves a grabbed field forward', async ({ page }) => {
    await open(page, '?dir=rtl');
    const header = await page.locator('#pivot thead .aui-pivot__corner').boundingBox();
    const region = await page.locator('#pivot .aui-pivot__region').boundingBox();
    expect(Math.abs((header?.x ?? 0) + (header?.width ?? 0) - ((region?.x ?? 0) + (region?.width ?? 0)))).toBeLessThan(3);
    await page.getByRole('button', { name: 'Move Quarter', exact: true }).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await ready(page);
    expect((await layout(page)).filters).toEqual(['product']);
    expect((await layout(page)).rows).toEqual(['region', 'country', 'quarter']);
  });

  test('forced colors: the grabbed field keeps a system highlight', async ({ page }) => {
    test.skip(engine(page) === 'webkit', 'WebKit has no forced colors mode or forced-color-adjust');
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page);
    await page.getByRole('button', { name: 'Move Region', exact: true }).click();
    const adjust = await page.locator('.aui-pivot-fields__entry--grabbed').evaluate((el) => getComputedStyle(el).forcedColorAdjust);
    expect(adjust).toBe('none');
  });
});

for (const theme of THEMES) {
  test(`visual pivot: ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, `?theme=${theme}`);
    await expect(page.locator('main')).toHaveScreenshot(`${theme}-pivot.png`);
  });
}
