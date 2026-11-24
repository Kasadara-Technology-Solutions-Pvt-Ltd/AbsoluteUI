import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __auiReady?: boolean;
  }
}

// docs/PLAN-R8.md D5: component icons follow their theme token, and `--aui-icon-size` on the
// component or any ancestor overrides it; the theme tokens themselves resize every icon.
test.describe('icon sizes (PLAN-R8 D5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__auiReady === true);
  });

  const width = (el: Element): number => Math.round(el.getBoundingClientRect().width);

  test('component icons use the icon-size token by default', async ({ page }) => {
    const icon = page.locator('.aui-button .aui-icon').first();
    const token = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--aui-icon-size-sm').trim());
    expect(token).toBe('1rem');
    expect(await icon.evaluate(width)).toBe(16);
    await page.evaluate(() => { document.documentElement.style.setProperty('--aui-icon-size-sm', '20px'); });
    expect(await icon.evaluate(width)).toBe(20);
  });

  test('--aui-icon-size on an ancestor resizes the icons inside it only', async ({ page }) => {
    const buttons = page.locator('.aui-button:has(.aui-icon)');
    expect(await buttons.count()).toBeGreaterThan(1);
    await buttons.first().evaluate((el) => { el.style.setProperty('--aui-icon-size', '28px'); });
    expect(await buttons.first().locator('.aui-icon').first().evaluate(width)).toBe(28);
    expect(await buttons.nth(1).locator('.aui-icon').first().evaluate(width)).not.toBe(28);
  });

  test('the new xs and xl tokens exist in the theme', async ({ page }) => {
    const sizes = await page.evaluate(() => ['xs', 'xl'].map((s) => getComputedStyle(document.documentElement).getPropertyValue(`--aui-icon-size-${s}`).trim()));
    expect(sizes).toEqual(['0.75rem', '2rem']);
  });
});
