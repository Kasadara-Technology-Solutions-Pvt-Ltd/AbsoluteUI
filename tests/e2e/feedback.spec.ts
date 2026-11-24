import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R1 feedback, disclosure, layout, and typography page (SPEC section 18.2-18.4, §18.14, §18.15).
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
  await page.goto(`/feedback${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('feedback: no CSP violations or errors while exercising every component', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Notify' }).click();
  await page.getByRole('button', { name: 'Advance' }).click();
  await page.getByRole('button', { name: 'Returns' }).click();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`feedback axe WCAG 2.2 AA: ${theme} (with a toast shown)`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    await page.getByRole('button', { name: 'Notify' }).click();
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Record saved')).toBeVisible();
    expect(await axe(page)).toEqual([]);
  });
}

test.describe('feedback: behavior', () => {
  test('progress bar exposes value and announces completion once', async ({ page }) => {
    await open(page);
    const bar = page.getByRole('progressbar', { name: 'Upload progress' });
    await expect(bar).toHaveAttribute('aria-valuenow', '40');
    await expect(page.getByRole('progressbar', { name: 'Preparing export' })).not.toHaveAttribute('aria-valuenow', /.*/);
    await page.getByRole('button', { name: 'Advance' }).click();
    await expect(bar).toHaveAttribute('aria-valuenow', '100');
    await expect(page.locator('[data-aui-live-region="polite"]')).toHaveText('Upload progress complete');
  });

  test('toast is announced, never steals focus, and the hotkey reaches it', async ({ page }) => {
    await open(page);
    const notify = page.getByRole('button', { name: 'Notify' });
    await notify.focus();
    await page.keyboard.press('Enter');
    await expect(notify).toBeFocused();
    await expect(page.locator('[data-aui-live-region]').filter({ hasText: 'Record saved' })).toHaveCount(1);
    await page.keyboard.press('Alt+t');
    await expect(page.getByRole('region', { name: 'Notifications' }).locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Record saved')).toBeHidden();
    await expect(notify).toBeFocused();
  });

  test('toast shown while a modal dialog is open stays reachable (not inert)', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Open dialog' }).click();
    await page.getByRole('dialog', { name: 'Toasts above dialogs' }).evaluate(() => {
      document.querySelector<HTMLButtonElement>('#group button')?.click();
    });
    const dismiss = page.getByRole('button', { name: 'Dismiss notification' });
    await expect(dismiss).toBeVisible();
    await dismiss.focus();
    await expect(dismiss).toBeFocused();
  });

  test('accordion: disclosure semantics and keyboard', async ({ page }) => {
    await open(page);
    const shipping = page.getByRole('button', { name: 'Shipping' });
    await expect(shipping).toHaveAttribute('aria-expanded', 'true');
    await shipping.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: 'Returns' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Returns' })).toHaveAttribute('aria-expanded', 'true');
    await expect(shipping).toHaveAttribute('aria-expanded', 'false');
  });

  test('interactive card has exactly one tab stop (block link)', async ({ page }) => {
    await open(page);
    const card = page.locator('#card-a .aui-card');
    await expect(card.getByRole('link')).toHaveCount(1);
    // The whole card is the click target (the title link's ::after covers it).
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    await page.mouse.click(box.x + box.width - 10, box.y + box.height - 10);
    await expect(page).toHaveURL(/#cards$/);
  });

  test('reduced motion stops spinner, skeleton, and indeterminate animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const names = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.aui-spinner *, .aui-skeleton *, .aui-progress-bar *')).map((el) => getComputedStyle(el).animationName),
    );
    expect(names.every((n) => n === 'none')).toBe(true);
  });

  test('reflows at 320 CSS px without horizontal scrolling (WCAG 1.4.10)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`visual feedback: ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1000, height: 1500 });
    await open(page, `?theme=${theme}`);
    await expect(page.locator('main')).toHaveScreenshot(`${theme}-feedback.png`);
  });
}
