import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R2 charts page (SPEC section 18.18) under the strict CSP harness with Trusted Types.
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
  await page.goto(`/charts${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const plot = (page: Page, name: string) => page.getByRole('group', { name });

test('charts: no CSP violations or errors while exercising every chart', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Mobile' }).click();
  await page.locator('#bar').getByRole('button', { name: 'Show data table' }).click();
  await page.locator('#bar svg.aui-chart__svg').hover({ position: { x: 150, y: 150 } });
  await page.locator('#pie svg.aui-chart__svg').hover();
  await page.setViewportSize({ width: 500, height: 800 });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of THEMES) {
  test(`charts axe WCAG 2.2 AA: ${theme} (tooltip shown, table open, one series hidden)`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    await page.getByRole('button', { name: 'API', exact: true }).click();
    await page.locator('#line').getByRole('button', { name: 'Show data table' }).click();
    await plot(page, 'Support tickets by region').getByRole('img').first().focus();
    await expect(page.locator('#bar .aui-chart__tooltip')).toBeVisible();
    expect(await axe(page)).toEqual([]);
  });
}

test.describe('charts: behavior', () => {
  test('accessible structure: named group, generated description, labelled points, sparkline image', async ({ page }) => {
    await open(page);
    const line = plot(page, 'Monthly active users');
    await expect(line).toHaveAttribute('aria-roledescription', 'line chart');
    await expect(line).toHaveAccessibleDescription(/^Thousands of users, 2026 line chart, 3 series, 12 data points\. .*Web: minimum 42 at January 2026/);
    await expect(line.getByRole('img', { name: 'March 2026, Mobile: 38' })).toHaveCount(1);
    await expect(page.getByRole('img', { name: /^Weekly sign-ups: 12 values, from 120 to 230/ })).toBeVisible();
    await expect(plot(page, 'Storage by type').getByRole('img', { name: 'Media: 310 GB (59.6%)' })).toHaveCount(1);
  });

  test('keyboard: one tab stop per plot, arrows through points and series, Escape hides the tooltip', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'API', exact: true }).focus();
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveAttribute('aria-label', 'January 2026, Web: 42');
    const tip = page.locator('#line .aui-chart__tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('January 2026');
    await page.keyboard.press('ArrowRight');
    await expect(focused).toHaveAttribute('aria-label', 'February 2026, Web: 45');
    await page.keyboard.press('ArrowDown');
    await expect(focused).toHaveAttribute('aria-label', 'February 2026, Mobile: 33');
    await page.keyboard.press('End');
    await expect(focused).toHaveAttribute('aria-label', 'December 2026, Mobile: 81');
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    await expect(focused).toHaveAttribute('aria-label', 'December 2026, Mobile: 81');
    await page.keyboard.press('Tab');
    await expect(page.locator('#line').getByRole('button', { name: 'Show data table' })).toBeFocused();
  });

  test('keyboard: legend toggles a series (aria-pressed) and the event fires', async ({ page }) => {
    await open(page);
    const web = page.getByRole('button', { name: 'Web' });
    await web.focus();
    await page.keyboard.press('Space');
    await expect(web).toHaveAttribute('aria-pressed', 'false');
    await expect(web).toBeFocused();
    await expect(page.locator('#last-event')).toHaveText('web hidden');
    await expect(plot(page, 'Monthly active users').getByRole('img', { name: /Web:/ })).toHaveCount(0);
  });

  test('keyboard: horizontal bars use Up/Down for categories; pie uses arrows for slices', async ({ page }) => {
    await open(page);
    const focused = page.locator(':focus');
    await plot(page, 'Budget variance by department').getByRole('img').first().focus();
    await expect(focused).toHaveAttribute('aria-label', 'Engineering, Capital: 40');
    await page.keyboard.press('ArrowDown');
    await expect(focused).toHaveAttribute('aria-label', 'Customer success and onboarding operations, Capital: -15');
    await page.keyboard.press('ArrowRight');
    await expect(focused).toHaveAttribute('aria-label', 'Customer success and onboarding operations, Operating: 30');
    await plot(page, 'Traffic sources').getByRole('img').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(focused).toHaveAttribute('aria-label', 'Direct: 25 (25%)');
  });

  test('data table fallback exposes exact values', async ({ page }) => {
    await open(page);
    const toggle = page.locator('#bar-stacked').getByRole('button', { name: 'Show data table' });
    await toggle.click();
    await expect(page.locator('#bar-stacked').getByRole('button', { name: 'Hide data table' })).toHaveAttribute('aria-expanded', 'true');
    const table = page.getByRole('table', { name: 'Budget variance by department' });
    await expect(table.getByRole('row')).toHaveCount(5);
    await expect(table.getByRole('row', { name: /Marketing/ })).toHaveText(/Marketing22-184/);
  });

  test('RTL mirrors the x axis and the arrow keys', async ({ page }) => {
    await open(page, '?dir=rtl');
    const points = plot(page, 'Net cash flow').getByRole('img');
    const first = (await points.nth(0).boundingBox())!;
    const last = (await points.nth(3).boundingBox())!;
    expect(first.x).toBeGreaterThan(last.x);
    await points.nth(0).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', /^Q2/);
  });

  test('reduced motion: no transitions or animations on chart marks', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const moving = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.aui-chart *, .aui-sparkline *')).filter((el) => {
        const s = getComputedStyle(el);
        return s.animationName !== 'none' || (s.transitionDuration !== '0s' && s.transitionProperty !== 'all');
      }).length,
    );
    expect(moving).toBe(0);
  });

  test('forced colors: series share CanvasText and keep textures and dashes', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page, '?theme=absolute-default');
    const styles = await page.evaluate(() => {
      const bar = document.querySelector('#bar .aui-chart__series--c2 .aui-chart__pattern')!;
      const dash = document.querySelector('#line .aui-chart__dash--2')!;
      return { pattern: getComputedStyle(bar).display, dash: getComputedStyle(dash).strokeDasharray };
    });
    expect(styles.pattern).not.toBe('none');
    expect(styles.dash).not.toBe('none');
  });

  test('reflows at 320 CSS px without horizontal scrolling (WCAG 1.4.10)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    await page.locator('#line').getByRole('button', { name: 'Show data table' }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await page.locator('#line svg.aui-chart__svg').getAttribute('width')).toBe(String(await page.locator('#line .aui-chart__body').evaluate((el) => Math.floor(el.getBoundingClientRect().width))));
  });
});

for (const theme of THEMES) {
  test(`visual charts: ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1000, height: 1500 });
    await open(page, `?theme=${theme}`);
    await expect(page.locator('main')).toHaveScreenshot(`${theme}-charts.png`);
  });
}
