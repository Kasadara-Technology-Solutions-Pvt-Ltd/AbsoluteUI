import { test, expect, type Page } from '@playwright/test';

// Visual regression (SPEC section 23.3). Baselines are platform-specific
// (Playwright appends the platform to snapshot names); regenerate them only after
// reviewing the new screenshots: `npx playwright test visual --update-snapshots`.

async function open(page: Page, theme: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?theme=${theme}`);
  await page.waitForFunction(() => (window as unknown as { __auiReady?: boolean }).__auiReady === true);
}

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test.describe(`visual: ${theme}`, () => {
    test('buttons', async ({ page }) => {
      await open(page, theme);
      await expect(page.locator('section').nth(0)).toHaveScreenshot(`${theme}-buttons.png`);
    });

    test('combobox open with active option', async ({ page }) => {
      await open(page, theme);
      const input = page.getByRole('combobox', { name: 'Country' });
      await input.press('ArrowDown');
      await input.press('ArrowDown');
      await expect(page.getByRole('listbox', { name: 'Country' })).toBeVisible();
      await expect(page).toHaveScreenshot(`${theme}-combobox-open.png`, { fullPage: false });
    });

    test('date inputs', async ({ page }) => {
      await open(page, theme);
      await expect(page.locator('section').nth(3)).toHaveScreenshot(`${theme}-date-inputs.png`);
    });

    test('dialog', async ({ page }) => {
      await open(page, theme);
      await page.getByRole('button', { name: 'Open dialog' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page).toHaveScreenshot(`${theme}-dialog.png`);
    });
  });
}
