import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P7: Schema Form and Form Builder (docs/PLAN-R20.md).
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
  await page.goto(`/r20-p7${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('r20-p7: no CSP violations or errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('schema form: empty submit focuses the Error Summary; a valid submit emits typed JSON', async ({ page }) => {
  await open(page);
  const form = page.locator('#sf');
  await form.getByRole('button', { name: 'Request leave' }).click();
  await expect(page.locator('#sf .aui-error-summary')).toBeFocused();
  await expect(page.locator('#sf-value')).toHaveText('');
  await page.goto('/r20-p7?filled');
  await page.waitForFunction(() => window.__auiReady === true);
  await page.locator('#sf').getByRole('button', { name: 'Request leave' }).click();
  await expect(page.locator('#sf-value')).toHaveText('{"type":"annual","from":"2026-12-21","days":3,"halfDay":false,"contacts":[]}');
});

test('schema form: two configured columns apply at a mid width, one column on a phone (regression, R20-24)', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await open(page);
  const grid = page.locator('.aui-schema-form__grid--columns').first();
  const tracks = async (): Promise<number> => (await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ').filter(Boolean).length;
  expect(await tracks()).toBe(2);
  await page.setViewportSize({ width: 360, height: 800 });
  await expect.poll(tracks).toBe(1);
});

test('schema form: a condition shows the reason field only for "Other"', async ({ page }) => {
  await open(page);
  const reason = page.locator('#sf').getByRole('textbox', { name: /^Reason/ });
  await expect(reason).toBeHidden();
  await page.locator('#sf').getByRole('combobox', { name: /^Leave type/ }).click();
  await page.getByRole('option', { name: 'Other' }).click();
  await expect(reason).toBeVisible();
});

test('schema form: array entries are added, moved, and removed with the keyboard', async ({ page }) => {
  await open(page);
  const add = page.locator('#sf').getByRole('button', { name: 'Add Contact' });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sf').getByRole('group', { name: /^Contact 1/ })).toBeVisible();
  await expect(page.locator('#sf').getByRole('textbox', { name: /^Name/ }).first()).toBeFocused();
  await page.keyboard.type('Ana');
  await add.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('Bo');
  await page.locator('#sf').getByRole('button', { name: 'Move Contact 2 up' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sf').getByRole('button', { name: 'Move Contact 1 down' })).toBeFocused();
  await expect(page.locator('#sf').getByRole('textbox', { name: /^Name/ }).first()).toHaveValue('Bo');
  await page.locator('#sf').getByRole('button', { name: 'Remove Contact 1' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sf').getByRole('textbox', { name: /^Name/ })).toHaveCount(1);
  await expect(page.locator('#sf').getByRole('textbox', { name: /^Name/ }).first()).toHaveValue('Ana');
});

test('form builder: palette, keyboard reorder, properties, undo', async ({ page }) => {
  await open(page);
  const fb = page.locator('#fb');
  await fb.getByRole('button', { name: 'Dropdown', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#fb-value')).toContainText('"select1"');
  await expect(fb.getByRole('button', { name: /^Dropdown, Dropdown/ })).toHaveAttribute('aria-pressed', 'true');
  // Keyboard reorder: grab the second field's handle and move it up.
  const handles = fb.locator('.aui-sortable-list__handle');
  await handles.nth(1).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await expect(page.locator('#fb-value')).toContainText('"order":["select1","from"]');
  // Properties: required.
  await fb.getByRole('button', { name: /^Dropdown, Dropdown/ }).click();
  await fb.getByRole('switch', { name: 'Required' }).check();
  await expect(page.locator('#fb-value')).toContainText('"required":["select1"]');
  // Undo outside text fields.
  await fb.getByRole('button', { name: 'Undo' }).focus();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#fb-value')).not.toContainText('"required":["select1"]');
});

test('form builder: preview and JSON views', async ({ page }) => {
  await open(page);
  const fb = page.locator('#fb');
  await fb.getByRole('tab', { name: 'Preview' }).click();
  await expect(fb.locator('.aui-schema-form')).toBeVisible();
  await fb.getByRole('tab', { name: 'JSON' }).click();
  await expect(fb.getByRole('textbox', { name: /Schema and UI schema/ })).toHaveValue(/"First day"/);
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`r20-p7: axe (WCAG 2.2 AA) in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
  });
}
