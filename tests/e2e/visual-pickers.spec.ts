import { test, expect, type Page } from '@playwright/test';

// Visual regression for the R2 advanced pickers page (SPEC section 23.3). Baselines are
// platform-specific; regenerate only after reviewing the screenshots.

async function open(page: Page, theme: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 900, height: 1100 });
  await page.goto(`/pickers?theme=${theme}`);
  await page.waitForFunction(() => (window as unknown as { __auiReady?: boolean }).__auiReady === true);
}

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test.describe(`visual pickers: ${theme}`, () => {
    test('page', async ({ page }) => {
      await open(page, theme);
      await expect(page.locator('main')).toHaveScreenshot(`${theme}-pickers.png`);
    });

    test('date range picker open with a preview', async ({ page }) => {
      await open(page, theme);
      await page.getByRole('button', { name: /Change dates/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Choose dates' });
      await dialog.getByRole('gridcell', { name: /Wednesday, March 25, 2026/ }).click();
      await dialog.getByRole('gridcell', { name: /Thursday, April 2, 2026/ }).hover();
      await expect(dialog).toHaveScreenshot(`${theme}-date-range-popup.png`);
    });

    test('month, year, and quarter popups', async ({ page }) => {
      await open(page, theme);
      for (const [button, dialog, file] of [
        [/Change month/, 'Choose month', 'month'],
        [/Change year/, 'Choose year', 'year'],
        [/Change quarter/, 'Choose quarter', 'quarter'],
      ] as const) {
        await page.getByRole('button', { name: button }).click();
        await expect(page.getByRole('dialog', { name: dialog })).toHaveScreenshot(`${theme}-${file}-popup.png`);
        await page.keyboard.press('Escape');
      }
    });
  });
}
