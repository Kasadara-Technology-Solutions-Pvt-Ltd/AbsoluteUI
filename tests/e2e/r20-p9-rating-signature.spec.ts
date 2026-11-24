import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P9: Rating and Signature Pad (docs/PLAN-R20.md).
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
  await page.goto(`/r20-p9-rating-signature${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('rating and signature pad: no CSP violations or errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('rating: slider keys, digits, clear, and pointer halves', async ({ page }) => {
  await open(page);
  const rating = page.getByRole('slider', { name: 'Overall performance' });
  await expect(rating).toHaveAttribute('aria-valuetext', '3 of 5');
  await rating.focus();
  await page.keyboard.press('ArrowRight');
  await expect(rating).toHaveAttribute('aria-valuetext', '3.5 of 5');
  await expect(page.locator('#rating-output')).toHaveText('3.5');
  await page.keyboard.press('End');
  await expect(page.locator('#rating-review .aui-rating__caption')).toHaveText('Outstanding');
  await page.keyboard.press('2');
  await expect(rating).toHaveAttribute('aria-valuenow', '2');
  await page.keyboard.press('Delete');
  await expect(rating).toHaveAttribute('aria-valuetext', 'No rating');
  // Left half of the fourth star gives 3.5.
  const fourth = page.locator('#rating-review .aui-rating__item').nth(3);
  const box = await fourth.boundingBox();
  if (!box) throw new Error('no star box');
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
  await expect(rating).toHaveAttribute('aria-valuenow', '3.5');
});

test('rating: RTL arrows follow the reading direction', async ({ page }) => {
  await open(page, '?dir=rtl');
  const rating = page.getByRole('slider', { name: 'Overall performance' });
  await rating.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(rating).toHaveAttribute('aria-valuenow', '3.5');
});

test('rating: display mode is a named image; disabled is out of the tab order', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('img', { name: 'Customer rating: 4.5 of 5' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Locked score' })).toHaveAttribute('tabindex', '-1');
  await expect(page.getByRole('slider', { name: /^Onboarding experience/ })).toHaveAttribute('aria-invalid', 'true');
});

test('signature pad: drawing a stroke, undo, clear', async ({ page }) => {
  await open(page);
  const surface = page.locator('#signature-pad .aui-signature-pad__pad');
  const box = await surface.boundingBox();
  if (!box) throw new Error('no pad box');
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + box.height / 3, { steps: 6 });
  await page.mouse.move(box.x + 140, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('#signature-output')).toHaveText('drawn 1');
  await expect(page.getByRole('img', { name: /drawn with 1 stroke/ })).toBeVisible();
  await expect(page.locator('input[type="hidden"][name="signature"]')).toHaveValue(/^data:image\/png;base64,/);
  await page.getByRole('button', { name: 'Undo last stroke' }).click();
  await expect(page.locator('#signature-output')).toHaveText('empty');
});

test('signature pad: keyboard-only typed signature', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Type' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Type' }).first()).toHaveAttribute('aria-pressed', 'true');
  const name = page.getByRole('textbox', { name: 'Type your full name' });
  await expect(name).toBeFocused();
  await page.keyboard.type('Ana Ruiz');
  // Leave the field backwards: it is the last focusable element on this page, and Firefox
  // (no browser chrome under Playwright) keeps focus on it for Tab, so `change` would never fire.
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#signature-output')).toHaveText('typed Ana Ruiz');
  await expect(page.getByRole('img', { name: 'Signature pad, typed signature: Ana Ruiz' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Clear signature' }).first().click();
  await expect(page.locator('#signature-output')).toHaveText('empty');
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`rating and signature pad: axe (WCAG 2.2 AA) in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
  });
}
