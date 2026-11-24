import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P10: File Manager (docs/PLAN-R20.md).
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
  await page.goto(`/r20-p10-file-manager${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  await expect(files(page).getByRole('option', { name: /Handbook\.md/ })).toBeVisible();
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const region = (page: Page) => page.getByRole('region', { name: 'Company documents' });
const files = (page: Page) => region(page).getByRole('listbox');
const opt = (page: Page, name: string) => files(page).getByRole('option', { name: new RegExp(`^${name.replace(/[.()]/g, '\\$&')}`) });
const log = (page: Page) => page.locator('#fm-log');

test('r20-p10 file manager: no CSP violations or errors through navigation, previews, and dialogs', async ({ page }) => {
  const errors = await open(page);
  await opt(page, 'Badge photo.png').dblclick();
  await expect(page.getByRole('dialog', { name: 'Badge photo.png' })).toBeVisible();
  await page.keyboard.press('Escape');
  await opt(page, 'Employees export.json').dblclick();
  await expect(page.getByRole('dialog', { name: 'Employees export.json' }).getByRole('region', { name: 'Employees export.json' })).toBeVisible();
  await page.keyboard.press('Escape');
  await opt(page, 'Contracts').dblclick();
  await expect(opt(page, 'Offer letter.txt')).toBeVisible();
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('file manager: listbox semantics, keyboard selection, open, and Backspace to the parent', async ({ page }) => {
  await open(page);
  const list = files(page);
  await expect(list).toHaveAttribute('aria-multiselectable', 'true');
  await expect(list).toHaveAttribute('aria-label', 'Documents');
  // Root order (folders first, by name): Archive, Broken folder, Contracts, Policies, then files.
  // The first option is active when the list gets focus, so ArrowDown moves to the second.
  await list.focus();
  await page.keyboard.press('ArrowDown');
  await expect(opt(page, 'Broken folder')).toHaveAttribute('aria-selected', 'true');
  const active = await list.getAttribute('aria-activedescendant');
  expect(active).toBe(await opt(page, 'Broken folder').getAttribute('id'));
  await page.keyboard.press('Shift+ArrowDown');
  await expect(region(page).getByRole('status').last()).toHaveText(/2 selected/);
  await page.keyboard.press('Home');
  await expect(opt(page, 'Archive')).toHaveAttribute('aria-selected', 'true');
  await expect(opt(page, 'Contracts')).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(opt(page, 'Contracts')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(opt(page, 'Offer letter.txt')).toBeVisible();
  await expect(list).toBeFocused();
  await expect(region(page).getByRole('navigation', { name: 'Folder path' })).toContainText('Contracts');
  await page.keyboard.press('Backspace');
  await expect(opt(page, 'Contracts')).toHaveAttribute('aria-selected', 'true');
  await expect(list).toBeFocused();
});

test('file manager: F2 rename with validation, Delete with confirmation', async ({ page }) => {
  await open(page);
  await opt(page, 'Handbook.md').click();
  await page.keyboard.press('F2');
  const rename = page.getByRole('dialog', { name: /Rename Handbook\.md/ });
  const input = rename.getByRole('textbox', { name: 'Name' });
  await expect(input).toBeFocused();
  await input.fill('Policies');
  await input.press('Enter');
  await expect(rename).toContainText('already exists');
  await input.fill('Guide.md');
  await input.press('Enter');
  await expect(log(page)).toHaveText('Renamed Handbook.md to Guide.md');
  await expect(files(page)).toBeFocused();
  await opt(page, 'Guide.md').click();
  await page.keyboard.press('Delete');
  const confirm = page.getByRole('alertdialog', { name: 'Delete Guide.md?' });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(log(page)).toHaveText('Deleted');
  await expect(opt(page, 'Guide.md')).toHaveCount(0);
});

test('file manager: Ctrl+X and Ctrl+V move between folders; new folder with Ctrl+Shift+N', async ({ page }) => {
  await open(page);
  await opt(page, 'Employees export.json').click();
  await page.keyboard.press('Control+x');
  await expect(opt(page, 'Employees export.json')).toHaveClass(/aui-file-manager__item--cut/);
  await opt(page, 'Policies').dblclick();
  await expect(opt(page, 'Leave policy.md')).toBeVisible();
  await files(page).focus();
  await page.keyboard.press('Control+v');
  await expect(log(page)).toHaveText('Moved Employees export.json to policies by paste');
  await expect(opt(page, 'Employees export.json')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Control+Shift+N');
  const dialog = page.getByRole('dialog', { name: 'New folder' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Drafts');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(opt(page, 'Drafts')).toBeVisible();
});

test('file manager: a folder that fails to load shows retry; the folder tree navigates', async ({ page }) => {
  await open(page);
  await opt(page, 'Broken folder').dblclick();
  await expect(region(page).getByText('Could not load this folder')).toBeVisible();
  await expect(log(page)).toHaveText('Error: list');
  await region(page).getByRole('tree', { name: 'Folders' }).getByRole('treeitem', { name: 'Documents' }).click();
  await expect(opt(page, 'Contracts')).toBeVisible();
});

test('file manager: uploads show progress and can be cancelled', async ({ page }) => {
  await open(page);
  const chooser = page.waitForEvent('filechooser');
  await region(page).getByRole('button', { name: 'Upload' }).click();
  await (await chooser).setFiles([{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }, { name: 'fail.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }]);
  await expect(region(page).getByRole('progressbar', { name: 'notes.txt' })).toBeVisible();
  await expect(opt(page, 'notes.txt')).toBeVisible({ timeout: 5000 });
  await expect(region(page).getByRole('button', { name: 'Dismiss fail.txt' })).toBeVisible({ timeout: 5000 });
  await expect(log(page)).toHaveText('Error: upload');
});

test('file manager: grid view moves by columns and virtualizes 10,000 entries', async ({ page }) => {
  await open(page);
  const big = page.getByRole('region', { name: 'Scans' });
  const list = big.getByRole('listbox');
  await expect(list.getByRole('option').first()).toBeVisible();
  expect(await list.getByRole('option').count()).toBeLessThan(200);
  await list.focus();
  await page.keyboard.press('ArrowRight');
  await expect(list.getByRole('option', { name: 'Scan 00001.png' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(list.getByRole('option', { name: 'Scan 09999.png' })).toHaveAttribute('aria-posinset', '10000');
  await expect(big.getByRole('button', { name: 'Upload' })).toBeDisabled();
});

test('file manager: RTL mirrors grid arrows', async ({ page }) => {
  await open(page, '?dir=rtl');
  const list = page.getByRole('region', { name: 'Scans' }).getByRole('listbox');
  await expect(list.getByRole('option').first()).toBeVisible();
  await list.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(list.getByRole('option', { name: 'Scan 00001.png' })).toHaveAttribute('aria-selected', 'true');
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`file manager: axe clean in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
    await opt(page, 'Handbook.md').click();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    expect(await axe(page)).toEqual([]);
  });
}
