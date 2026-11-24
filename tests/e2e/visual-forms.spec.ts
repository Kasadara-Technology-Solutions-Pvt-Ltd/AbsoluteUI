import { test, expect, type Page } from '@playwright/test';

// Visual regression for the R1 forms page (SPEC section 23.3). Baselines are
// platform-specific; regenerate only after reviewing the screenshots.

async function open(page: Page, theme: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 800, height: 1800 });
  await page.goto(`/forms?theme=${theme}`);
  await page.waitForFunction(() => (window as unknown as { __auiReady?: boolean }).__auiReady === true);
}

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test.describe(`visual forms: ${theme}`, () => {
    test('pristine form', async ({ page }) => {
      await open(page, theme);
      await expect(page.locator('#signup')).toHaveScreenshot(`${theme}-form-pristine.png`);
    });

    test('form after a failed submission', async ({ page }) => {
      await open(page, theme);
      await page.getByRole('textbox', { name: 'Username' }).fill('a name that is far too long');
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page.getByRole('region', { name: 'There is a problem' })).toBeVisible();
      await expect(page.locator('#signup')).toHaveScreenshot(`${theme}-form-errors.png`);
    });

    test('select open', async ({ page }) => {
      await open(page, theme);
      await page.getByRole('combobox', { name: 'Role' }).press('ArrowDown');
      await expect(page.getByRole('listbox')).toBeVisible();
      await expect(page).toHaveScreenshot(`${theme}-select-open.png`, { clip: { x: 0, y: 0, width: 800, height: 1100 } });
    });
  });
}
