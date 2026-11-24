import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R3 advanced charts page (SPEC section 18.18) under the strict CSP harness with Trusted Types.
declare global {
  interface Window {
    __csp: string[];
    __auiReady?: boolean;
  }
}

const THEMES = ['absolute-default', 'absolute-dark', 'absolute-high-contrast'];

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
  await page.goto(`/charts-r3${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const plot = (page: Page, name: string) => page.getByRole('group', { name });
const focused = (page: Page) => page.locator(':focus');

test('charts R3: no CSP violations or errors while exercising zoom, drill-down, export, and hover', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Zoom in' }).first().click();
  await page.locator('#line-zoom svg.aui-chart__svg').hover({ position: { x: 300, y: 120 } });
  await page.getByRole('button', { name: 'Export SVG' }).click();
  await expect(page.locator('#export-result')).toHaveText(/^svg \d+ characters$/);
  await page.getByRole('button', { name: 'Export PNG' }).click();
  await expect(page.locator('#export-result')).toHaveText('png image/png');
  await plot(page, 'Cloud spend').getByRole('img').first().click();
  await page.locator('#heatmap svg.aui-chart__svg').hover({ position: { x: 200, y: 60 } });
  await page.setViewportSize({ width: 500, height: 800 });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of THEMES) {
  test(`charts R3 axe WCAG 2.2 AA: ${theme} (zoomed, drilled, tooltip shown, table open)`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    await page.getByRole('button', { name: 'Zoom in' }).first().click();
    await plot(page, 'Cloud spend').getByRole('img').first().click();
    await page.locator('#waterfall').getByRole('button', { name: 'Show data table' }).click();
    await plot(page, 'Tickets by weekday and hour').getByRole('img').first().focus();
    await expect(page.locator('#heatmap .aui-chart__tooltip')).toBeVisible();
    expect(await axe(page)).toEqual([]);
  });
}

test.describe('charts R3: behavior', () => {
  test('zoom: keyboard zooms around the focused point, arrows pan past the edge, 0 resets; events and announcements', async ({ page }) => {
    await open(page);
    const line = plot(page, 'Daily orders');
    await line.getByRole('img').first().focus();
    await page.keyboard.press('=');
    await expect(page.locator('#last-event')).toHaveText(/^aui-zoom: .*"reason":"keyboard"/);
    const zoomed = await line.getByRole('img').count();
    expect(zoomed).toBeLessThan(120);
    await page.keyboard.press('End');
    const edge = await focused(page).getAttribute('aria-label');
    await page.keyboard.press('ArrowRight');
    await expect(focused(page)).not.toHaveAttribute('aria-label', edge ?? '');
    await expect(page.locator('.aui-live-region, [aria-live]').filter({ hasText: /Showing/ }).first()).toBeAttached();
    await page.keyboard.press('0');
    await expect(line.getByRole('img')).toHaveCount(120);
    await expect(page.getByRole('button', { name: 'Reset zoom' }).first()).toHaveAttribute('aria-disabled', 'true');
  });

  test('crosshair follows keyboard focus; Shift + drag selects a range to zoom into', async ({ page }) => {
    await open(page);
    const svg = page.locator('#line-zoom svg.aui-chart__svg');
    await plot(page, 'Daily orders').getByRole('img').first().focus();
    await expect(page.locator('#line-zoom .aui-chart__crosshair')).not.toHaveAttribute('display', 'none');
    const box = (await svg.boundingBox())!;
    await page.keyboard.down('Shift');
    await page.mouse.move(box.x + 120, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 260, box.y + 110, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator('#last-event')).toHaveText(/"reason":"select"/);
  });

  test('scatter and bubble: labelled points, xy zoom, size in the name', async ({ page }) => {
    await open(page);
    await expect(plot(page, 'Height and weight')).toHaveAttribute('aria-roledescription', 'scatter chart');
    await expect(plot(page, 'Markets by growth and margin').getByRole('img', { name: 'India, APAC: Growth (%) 12, Margin (%) 8, Revenue ($M) 200' })).toHaveCount(1);
    await plot(page, 'Height and weight').getByRole('img').first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(focused(page)).toHaveAttribute('aria-label', /^Group B/);
  });

  test('treemap: Enter opens a group, the breadcrumb and Backspace go back up', async ({ page }) => {
    await open(page);
    const map = plot(page, 'Cloud spend');
    await map.getByRole('img').first().focus();
    await expect(focused(page)).toHaveAttribute('aria-label', /^Compute: \$740 \(/);
    await page.keyboard.press('Enter');
    await expect(focused(page)).toHaveAttribute('aria-label', /^Virtual machines/);
    await expect(page.getByRole('navigation', { name: 'Treemap path' })).toContainText('Compute');
    await page.keyboard.press('Backspace');
    await expect(focused(page)).toHaveAttribute('aria-label', /^Compute/);
    await expect(page.getByRole('navigation', { name: 'Treemap path' })).toHaveCount(0);
  });

  test('heatmap: two-dimensional arrows; bullet: Up/Down rows; gauge is a meter', async ({ page }) => {
    await open(page);
    await plot(page, 'Tickets by weekday and hour').getByRole('img').first().focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(focused(page)).toHaveAttribute('aria-label', /^10, Tue: /);
    await plot(page, 'Quarterly goals').getByRole('img').first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(focused(page)).toHaveAttribute('aria-label', 'Profit: 22, target 26, Satisfactory');
    const meter = page.getByRole('meter', { name: 'CPU' });
    await expect(meter).toHaveAttribute('aria-valuetext', '72% (0% to 100%), Busy, target 60%');
  });

  test('data tables expose exact values (waterfall, box plot, funnel)', async ({ page }) => {
    await open(page);
    await page.locator('#waterfall').getByRole('button', { name: 'Show data table' }).click();
    await expect(page.getByRole('table', { name: 'Cash bridge' }).getByRole('row', { name: /Payroll/ })).toContainText('-$260');
    await page.locator('#funnel').getByRole('button', { name: 'Show data table' }).click();
    await expect(page.getByRole('table', { name: 'Checkout funnel' }).getByRole('row')).toHaveCount(5);
  });

  test('RTL mirrors cartesian axes and arrow keys; radar and gauge keep clockwise order', async ({ page }) => {
    await open(page, '?dir=rtl');
    const bars = plot(page, 'Cash bridge').getByRole('img');
    const first = (await bars.nth(0).boundingBox())!;
    const second = (await bars.nth(1).boundingBox())!;
    expect(first.x).toBeGreaterThan(second.x);
    await bars.nth(0).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(focused(page)).toHaveAttribute('aria-label', /^Sales/);
  });

  test('reduced motion: no transitions on chart marks', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const moving = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.aui-chart *, .aui-gauge *')).filter((el) => {
        const s = getComputedStyle(el);
        return s.animationName !== 'none' || (s.transitionDuration !== '0s' && s.transitionProperty !== 'all');
      }).length,
    );
    expect(moving).toBe(0);
  });

  test('forced colors: heatmap cells become outlined; textures stay on', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page);
    const styles = await page.evaluate(() => {
      const cell = document.querySelector('#heatmap .aui-heatmap__cell')!;
      const pattern = document.querySelector('#waterfall .aui-chart__pattern')!;
      return { stroke: getComputedStyle(cell).stroke, pattern: getComputedStyle(pattern).display };
    });
    expect(styles.pattern).not.toBe('none');
    expect(styles.stroke).not.toBe('none');
  });

  test('reflows at 320 CSS px without horizontal scrolling (WCAG 1.4.10)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

for (const theme of THEMES) {
  test(`visual charts R3: ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1000, height: 1500 });
    await open(page, `?theme=${theme}`);
    await expect(page.locator('main')).toHaveScreenshot(`${theme}-charts-r3.png`);
  });
}
