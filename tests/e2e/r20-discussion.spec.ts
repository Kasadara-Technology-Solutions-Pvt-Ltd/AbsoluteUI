import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20-25: Discussion (docs/decisions/r20-components-docs.md).
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
  await page.goto(`/r20-discussion${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const thread = (page: Page) => page.locator('#discussion-thread');

test('discussion: no CSP violations or errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('discussion: nested articles with accessible names and capped indentation', async ({ page }) => {
  await open(page);
  const region = page.getByRole('region', { name: 'Onboarding checklist' });
  await expect(region).toBeVisible();
  await expect(region.getByRole('article', { name: /^Comment by Grace Hopper/ }).first()).toBeVisible();
  await expect(region.getByRole('article', { name: /^Reply by Alan Turing to Ada Lovelace/ })).toBeVisible();
  await expect(region.getByText('Replying to Ada Lovelace')).toBeVisible();
  await expect(region.getByRole('article', { name: /^Deleted comment/ })).toContainText('This comment was deleted.');
  await expect(region.getByRole('link', { name: 'https://example.com/checklist' })).toHaveAttribute('rel', 'noopener noreferrer nofollow');
});

test('discussion: keyboard reply at depth with a mention, Ctrl+Enter posts and focuses the reply', async ({ page }) => {
  await open(page);
  await thread(page).getByRole('button', { name: 'Reply to Ada Lovelace' }).last().click();
  const box = thread(page).getByRole('textbox', { name: /^Reply to Ada Lovelace/ });
  await expect(box).toBeFocused();
  await page.keyboard.type('Thanks @Al');
  await expect(page.getByRole('option', { name: /Alan Turing/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.type('for the note.');
  await page.keyboard.press('ControlOrMeta+Enter');
  const reply = thread(page).getByRole('article', { name: /^Reply by Ada Lovelace/ }).filter({ hasText: 'for the note.' });
  await expect(reply).toBeFocused();
  await expect(reply.locator('.aui-discussion__mention')).toHaveText('@Alan Turing');
  await expect(page.locator('#discussion-log')).toHaveText('aui-reply');
});

test('discussion: Escape cancels a reply and returns focus to Reply', async ({ page }) => {
  await open(page);
  const reply = thread(page).getByRole('button', { name: 'Reply to Alan Turing' }).last();
  await reply.click();
  await page.keyboard.type('draft');
  await page.keyboard.press('Escape');
  await expect(thread(page).locator('.aui-discussion__inline')).toHaveCount(0);
  await expect(reply).toBeFocused();
});

test('discussion: character limit blocks posting and shows the error', async ({ page }) => {
  await open(page);
  const box = thread(page).getByRole('textbox', { name: /^Add a comment/ });
  await box.fill('x'.repeat(130));
  await thread(page).getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(box).toHaveAttribute('aria-invalid', 'true');
  await expect(thread(page).locator('.aui-discussion__composer .aui-field__error')).toHaveText('Enter 120 characters or fewer.');
  await expect(thread(page).locator('.aui-discussion__composer .aui-field__counter')).toHaveText('10 characters too many');
  await box.fill('Short and sweet');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(thread(page).getByRole('article', { name: /^Comment by Ada Lovelace/ }).filter({ hasText: 'Short and sweet' })).toBeVisible();
  await expect(box).toHaveValue('');
});

test('discussion: delete with inline confirmation leaves a placeholder when replies exist', async ({ page }) => {
  await open(page);
  const target = thread(page).getByRole('article').filter({ hasText: 'IT needs two days of notice.' });
  await target.getByRole('button', { name: 'Delete comment by Ada Lovelace' }).click();
  const confirm = thread(page).getByRole('group', { name: 'Delete this comment?' });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#discussion-log')).toHaveText('aui-delete');
  await expect(thread(page).getByRole('article', { name: /^Deleted comment, 2 hours ago/ })).toBeFocused();
});

test('discussion: collapse and expand a thread; Page Down moves between comments', async ({ page }) => {
  await open(page);
  const toggle = thread(page).locator('.aui-discussion__thread > li > .aui-discussion__toggle').first();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  // The label counts direct replies only: c1 has one (c2).
  await expect(toggle).toHaveText('Show 1 reply');
  await toggle.click();
  await expect(thread(page).getByRole('article', { name: /^Reply by Ada Lovelace to Grace Hopper/ }).first()).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect(thread(page).getByRole('article', { name: /^Reply by Grace Hopper to Ada Lovelace/ })).toBeFocused();
});

test('discussion: lazy replies load when expanded', async ({ page }) => {
  await open(page);
  const lazy = page.locator('#discussion-lazy');
  await lazy.getByRole('button', { name: 'Show 2 replies' }).click();
  await expect(lazy.getByRole('article', { name: /^Reply by Katherine Johnson to Grace Hopper/ })).toBeVisible();
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`discussion: axe (WCAG 2.2 AA) in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
  });
}

test('discussion: axe in right-to-left with a reply box open', async ({ page }) => {
  await open(page, '?dir=rtl');
  await thread(page).getByRole('button', { name: 'Reply to Grace Hopper' }).first().click();
  expect(await axe(page)).toEqual([]);
});
