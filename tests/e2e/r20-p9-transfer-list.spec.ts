import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P9: Transfer List (docs/PLAN-R20.md).
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
  await page.goto(`/r20-p9-transfer-list${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const team = (page: Page) => page.locator('#team');

test('transfer-list: no CSP violations or errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('transfer-list: keyboard check and move with announcements and native submission', async ({ page }) => {
  await open(page);
  const employees = team(page).getByRole('listbox', { name: 'Employees' });
  const members = team(page).getByRole('listbox', { name: 'Team' });
  await employees.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await expect(members.getByRole('option')).toHaveText(['Ben OkaforDesign', 'Asha RaoEngineering', 'Chen WeiEngineering']);
  await expect(page.locator('#team-log')).toHaveText('change: e2,e1,e3');
  expect(await page.evaluate(() => [...new FormData(document.querySelector('form')!).getAll('members')])).toEqual(['e2', 'e1', 'e3']);
  // Moving back with the buttons; focus returns to the list when the button disables itself.
  await members.focus();
  await page.keyboard.press('Control+a');
  await team(page).getByRole('button', { name: 'Move checked items to Employees' }).click();
  await expect(members.getByRole('option')).toHaveCount(0);
});

test('transfer-list: search filters and counts', async ({ page }) => {
  await open(page);
  await team(page).getByRole('searchbox', { name: 'Search Employees' }).fill('eng');
  await expect(team(page).getByRole('listbox', { name: 'Employees' }).getByRole('option')).toHaveCount(2);
  await expect(team(page).locator('.aui-transfer-list__panel--available [role="status"]')).toHaveText('2 of 4');
});

test('transfer-list: pointer drag moves between lists', async ({ page }) => {
  await open(page);
  const source = team(page).getByRole('option', { name: /Eve Martin/ });
  const target = team(page).getByRole('listbox', { name: 'Team' });
  await source.dragTo(target);
  await expect(target.getByRole('option', { name: /Eve Martin/ })).toBeVisible();
});

test('transfer-list: 10,000 items are windowed and End reaches the last', async ({ page }) => {
  await open(page);
  const list = page.locator('#large').getByRole('listbox', { name: 'Available' });
  expect(await list.getByRole('option').count()).toBeLessThan(60);
  await list.focus();
  await page.keyboard.press('End');
  const id = await list.getAttribute('aria-activedescendant');
  await expect(page.locator(`[id="${id ?? ''}"]`)).toHaveText('Product 10000');
});

test('transfer-list: End scrolls to the very bottom and the last option stays rendered (regression)', async ({ page }) => {
  // WebKit clamped the scroll position while the window swapped rows, so End landed 14 rows
  // short and the next scroll render dropped the active (last) option.
  await open(page);
  const list = page.locator('#large').getByRole('listbox', { name: 'Available' });
  await list.focus();
  await page.keyboard.press('End');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const atBottom = await list.evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 1);
  expect(atBottom).toBe(true);
  await expect(list.getByRole('option', { name: /^Product 10000$/ })).toBeVisible();
  await expect(list).toHaveAttribute('aria-activedescendant', /.+/);
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`transfer-list: axe (WCAG 2.2 AA) in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
  });
}

test('transfer-list: axe in right-to-left', async ({ page }) => {
  await open(page, '?dir=rtl');
  expect(await axe(page)).toEqual([]);
});
