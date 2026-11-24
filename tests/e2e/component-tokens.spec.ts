import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __auiReady?: boolean;
  }
}

// SPEC section 10.2: component tokens are unset by default, follow their global token, and win when set.
test.describe('component tokens (SPEC section 10.2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__auiReady === true);
  });

  const radius = (el: Element): string => getComputedStyle(el).borderTopLeftRadius;

  test('unset component tokens follow the global token', async ({ page }) => {
    const button = page.locator('.aui-button').first();
    const control = page.locator('.aui-combobox__input').first();
    expect(await button.evaluate(radius)).toBe('6px');
    await page.evaluate(() => { document.documentElement.style.setProperty('--aui-radius-md', '3px'); });
    expect(await button.evaluate(radius)).toBe('3px');
    expect(await control.evaluate(radius)).toBe('3px');
  });

  test('a set component token overrides only its component', async ({ page }) => {
    const button = page.locator('.aui-button').first();
    const control = page.locator('.aui-combobox__input').first();
    await page.evaluate(() => { document.documentElement.style.setProperty('--aui-button-radius', '12px'); });
    expect(await button.evaluate(radius)).toBe('12px');
    expect(await control.evaluate(radius)).toBe('6px');
  });

  test('component color tokens apply to the component', async ({ page }) => {
    const primary = page.locator('#btn-primary');
    await page.evaluate(() => { document.documentElement.style.setProperty('--aui-button-primary-bg', 'rgb(1, 2, 3)'); });
    // Background transitions (duration-fast), so poll for the settled value.
    await expect.poll(() => primary.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(1, 2, 3)');
  });
});
