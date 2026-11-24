import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P10: Tour (docs/PLAN-R20.md).
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
  await page.goto(`/r20-p10-tour${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const step = (page: Page, name: string) => page.getByRole('dialog', { name });

test('r20-p10 tour: no CSP violations or errors through a whole tour', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Take the tour' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('#tour-log')).toHaveText('Finished (completed true)');
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('tour: each step is a named dialog with focus, progress, and a spotlight on the target', async ({ page }) => {
  await open(page);
  const start = page.getByRole('button', { name: 'Take the tour' });
  await start.click();
  const welcome = step(page, 'Welcome to PeopleHub');
  await expect(welcome).toBeVisible();
  await expect(welcome).toBeFocused();
  await expect(welcome).toContainText('1 of 5');
  await expect(welcome.getByRole('button', { name: 'Back' })).toBeHidden();
  await page.getByRole('button', { name: 'Next' }).click();
  const search = step(page, 'Search');
  await expect(search).toBeFocused();
  await expect(search).toContainText('2 of 5');
  await expect(page.locator('#search')).toHaveAttribute('aria-describedby', /aui-tour/);
  // The spotlight surrounds the target (8px padding by default). It animates from the centered
  // first step, so its box is polled until the transition ends.
  const target = await page.locator('#search').boundingBox();
  expect(target).toBeTruthy();
  const surrounds = async (): Promise<boolean> => {
    const spot = await page.locator('#tour .aui-tour__spotlight').boundingBox();
    return !!(target && spot && spot.x < target.x && spot.x + spot.width > target.x + target.width);
  };
  await expect.poll(surrounds).toBe(true);
});

test('tour: a right placement on a full-width target keeps the panel and its buttons in the viewport (regression)', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Take the tour' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  const balance = step(page, 'Leave balance');
  await expect(balance).toBeFocused();
  await expect(balance).toBeInViewport({ ratio: 1 });
  await expect(balance.getByRole('button', { name: 'Next' })).toBeInViewport({ ratio: 1 });
});

test('tour: a step with a missing target is skipped with aui-step-missing; Back skips it too', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Take the tour' }).click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(step(page, 'Leave balance')).toBeFocused();
  await expect(page.locator('#tour-log')).toHaveAttribute('data-missing', 'missing:not-found');
  await page.keyboard.press('ArrowLeft');
  await expect(step(page, 'Search')).toBeFocused();
});

test('tour: a target below the fold is scrolled into view', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Take the tour' }).click();
  await page.evaluate(async () => {
    const t = (window as unknown as { __tour: { goTo(i: number): Promise<void> } }).__tour;
    await t.goTo(4);
  });
  await expect(step(page, 'Reports')).toBeVisible();
  await expect(page.locator('#reports')).toBeInViewport();
});

test('tour: Escape skips and returns focus to the start button', async ({ page }) => {
  await open(page);
  const start = page.getByRole('button', { name: 'Take the tour' });
  // Started from the keyboard: WebKit does not focus a button on mouse click, so a clicked
  // start button would not be the focus the tour restores.
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(step(page, 'Welcome to PeopleHub')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(start).toBeFocused();
  await expect(page.locator('#tour-log')).toHaveText('Skipped by escape');
});

test('tour: Skip button and keyboard-only operation', async ({ page }) => {
  await open(page);
  const start = page.getByRole('button', { name: 'Take the tour' });
  await start.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Skip tour' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#tour-log')).toHaveText('Skipped by skip-button');
  await expect(start).toBeFocused();
});

test('tour: modal steps trap Tab and set aria-modal', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Modal tour' }).click();
  const dialog = step(page, 'Modal search');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('#tour-log')).toHaveText('Modal finished');
});

test('tour: RTL mirrors arrow keys', async ({ page }) => {
  await open(page, '?dir=rtl');
  await page.getByRole('button', { name: 'Take the tour' }).click();
  await page.keyboard.press('ArrowLeft');
  await expect(step(page, 'Search')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(step(page, 'Welcome to PeopleHub')).toBeFocused();
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`tour axe (${theme}): anchored step, centered step, and modal step`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    await page.getByRole('button', { name: 'Take the tour' }).click();
    expect(await axe(page)).toEqual([]);
    await page.getByRole('button', { name: 'Next' }).click();
    expect(await axe(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Modal tour' }).click();
    expect(await axe(page)).toEqual([]);
  });
}
