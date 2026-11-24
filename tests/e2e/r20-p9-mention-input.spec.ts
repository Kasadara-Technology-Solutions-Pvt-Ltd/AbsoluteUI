import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P9: Mention Input (docs/PLAN-R20.md).
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
  await page.goto(`/r20-p9-mention-input${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('mention input: no CSP violations or errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('mention input: keyboard flow inserts a structured mention', async ({ page }) => {
  await open(page);
  const field = page.getByRole('textbox', { name: /^Comment/ });
  await field.click();
  await page.keyboard.type('Thanks @an');
  // The suggestions listbox is named by the field label (aria-labelledby), not by a separate "Suggestions" text.
  const list = page.getByRole('listbox', { name: /^Comment/ });
  await expect(list.getByRole('option')).toHaveCount(2);
  await expect(field).toHaveAttribute('aria-activedescendant', /.+/);
  await page.keyboard.press('ArrowDown');
  await expect(list.getByRole('option', { name: /Andre/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(list).toBeHidden();
  await expect(field).toHaveValue('Thanks @Andre ');
  await expect(page.locator('#mention-output')).toHaveText(/^Thanks @Andre\s+\| u2$/);
  await page.keyboard.type('#pay');
  await expect(page.getByRole('option', { name: '#payroll' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
});

test('mention input: single-line combobox exposes expanded state; axe while open', async ({ page }) => {
  await open(page);
  const field = page.getByRole('combobox', { name: 'Assign to' });
  await field.click();
  await page.keyboard.type('@b');
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('option', { name: /Ben/ })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.getByRole('option', { name: /Ben/ }).click();
  await expect(field).toHaveValue('@Ben ');
  await expect(field).toBeFocused();
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`mention input: axe (WCAG 2.2 AA) in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
  });
}
