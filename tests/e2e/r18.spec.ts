import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R18 configurable dashboard (docs/PLAN-R18-DASHBOARD.md).
declare global {
  interface Window {
    __csp: string[];
    __auiReady?: boolean;
    __requests?: string[];
    __dashboard?: { definition: { widgets: readonly { id: string; layout: { x: number; y: number } }[] }; mode: string };
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
  await page.goto(`/r18${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  await expect(page.locator('[data-aui-item="total"]')).toHaveAttribute('data-aui-status', 'ready');
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('r18: renders from JSON with no CSP violations or errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
  await expect(page.locator('[data-aui-item="total"]')).toContainText('€165.00');
  await expect(page.locator('[data-aui-item="regions"] li')).toHaveCount(3);
  await expect(page.locator('.aui-dashboard-root__pages [role="tab"]')).toHaveText(['Overview', 'Notes']);
  // One shared request for the three widgets of the sales source.
  expect(await page.evaluate(() => window.__requests?.length)).toBe(1);
});

test('r18: axe clean in view mode, edit mode, and with the builder open', async ({ page }) => {
  await open(page);
  expect(await axe(page)).toEqual([]);
  await page.getByRole('switch', { name: 'Edit dashboard' }).check();
  await expect(page.locator('.aui-dashboard-root--editing')).toHaveCount(1);
  expect(await axe(page)).toEqual([]);
  await page.getByRole('button', { name: 'Add widget' }).click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test('r18: a toolbar variable reloads its data source', async ({ page }) => {
  await open(page);
  await page.getByRole('combobox', { name: 'Region' }).click();
  await page.getByRole('option', { name: 'Europe' }).click();
  await expect(page.locator('[data-aui-item="regions"] li')).toHaveCount(1);
  await expect(page.locator('[data-aui-item="total"]')).toContainText('€70.00');
  expect(await page.evaluate(() => window.__requests?.at(-1))).toContain('region=eu');
});

test('r18: keyboard move in edit mode, then undo with Ctrl+Z', async ({ page }) => {
  await open(page, '?mode=edit');
  const before = await page.evaluate(() => JSON.stringify(window.__dashboard?.definition));
  const handle = page.getByRole('button', { name: 'Move Quarter goal' });
  await handle.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  // The move lands in the active breakpoint's layout (lg or md, by viewport): compare whole definitions.
  const snapshot = (): Promise<string> => page.evaluate(() => JSON.stringify(window.__dashboard?.definition));
  await expect.poll(snapshot).not.toBe(before);
  await page.keyboard.press('Control+z');
  await expect.poll(snapshot).toBe(before);
});

test('r18: build a widget in the drawer and save it', async ({ page }) => {
  await open(page, '?mode=edit');
  await page.getByRole('button', { name: 'Add widget' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByRole('textbox', { name: /^Title/ }).fill('Weekly note');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.aui-dashboard-widget', { hasText: 'Weekly note' })).toHaveCount(1);
});

test('r18: removing a widget in edit mode and undoing it from the toolbar', async ({ page }) => {
  await open(page, '?mode=edit');
  await page.getByRole('button', { name: 'Remove Regions' }).click();
  await expect(page.locator('[data-aui-item="regions"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-aui-item="regions"]')).toHaveCount(1);
});
